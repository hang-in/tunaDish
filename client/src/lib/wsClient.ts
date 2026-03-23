import { useChatStore } from '@/store/chatStore';
import { useRunStore } from '@/store/runStore';
import { useSystemStore } from '@/store/systemStore';
import { useContextStore } from '@/store/contextStore';
import { contextLoadedConvs } from '@/lib/contextCache';
import * as dbSync from '@/lib/dbSync';
import { dispatchNotification, type HandlerDeps } from '@/lib/wsHandlers';

type RequestParams = Record<string, unknown>;

interface PendingRequest {
  method: string;
  params: RequestParams;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const DEFAULT_WS_URL = 'ws://127.0.0.1:8765';
const RPC_TIMEOUT_MS = 30_000;

function resolveWsUrl(): string {
  // 1. window.__TUNADISH_WS_URL__ (Tauri inject 등)
  const win = globalThis as Record<string, unknown>;
  if (typeof win.__TUNADISH_WS_URL__ === 'string') return win.__TUNADISH_WS_URL__;
  // 2. localStorage 설정
  try {
    const stored = localStorage.getItem('tunadish:wsUrl');
    if (stored) return stored;
  } catch { /* ignore */ }
  // 3. 기본값
  return DEFAULT_WS_URL;
}

class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private retryDelay = 3000;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimeout: ReturnType<typeof setTimeout> | null = null;
  private awaitingPong = false;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  /** branch.create 요청의 checkpoint_id 임시 저장 (branch.created 수신 시 사용) */
  private _pendingBranchCheckpoint: string | null = null;

  constructor(url?: string) {
    this.url = url ?? resolveWsUrl();
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) return;

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.retryDelay = 3000;
      useSystemStore.getState().setConnected(true);
      this.startHeartbeat();
      // 연결 직후 엔진/모델 목록 조회 (프로젝트 무관)
      this.listEngines();
      // 재연결 시 활성 대화 + 브랜치 히스토리 복원
      this.rehydrateActiveSession();
    };

    this.ws.onerror = () => {
      // 브라우저 기본 에러 로그 억제용 — onclose에서 재연결 처리
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.method === 'pong') {
          this.awaitingPong = false;
          if (this.pongTimeout) { clearTimeout(this.pongTimeout); this.pongTimeout = null; }
          return;
        }
        // JSON-RPC 2.0 response: {jsonrpc, id, result/error}
        if (typeof data.id === 'number' && this.pending.has(data.id)) {
          const req = this.pending.get(data.id)!;
          this.pending.delete(data.id);
          clearTimeout(req.timer);
          if (data.error) {
            req.reject(new Error(data.error.message ?? JSON.stringify(data.error)));
          } else {
            req.resolve(data.result);
          }
          // 표준 response를 notification 파이프라인으로 전달 (UI store 반영)
          if (data.result) {
            const notifMethod = data.method ?? `${req.method}.result`;
            // 서버가 echo하지 않는 요청 파라미터를 result에 병합 (branch_id 등)
            const merged = { ...data.result };
            if (req.params.branch_id && !merged.branch_id) {
              merged.branch_id = req.params.branch_id;
            }
            this.handleNotification({ method: notifMethod, params: merged });
          }
          return;
        }
        this.handleNotification(data);
      } catch (err) {
        console.error('Failed to parse WS message', err);
      }
    };

    this.ws.onclose = () => {
      this.stopHeartbeat();
      this.rejectAllPending('WebSocket closed');
      useSystemStore.getState().setConnected(false);
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => this.connect(), this.retryDelay);
      this.retryDelay = Math.min(this.retryDelay * 2, 30000);
    };
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      this.awaitingPong = true;
      this.ws.send(JSON.stringify({ method: 'ping' }));
      this.pongTimeout = setTimeout(() => {
        if (this.awaitingPong) {
          // pong 미수신 → 연결 끊김으로 판단, 재연결
          this.ws?.close();
        }
      }, 10_000);
    }, 30_000);
  }

  private stopHeartbeat() {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    if (this.pongTimeout) { clearTimeout(this.pongTimeout); this.pongTimeout = null; }
    this.awaitingPong = false;
  }

  private rejectAllPending(reason: string) {
    for (const [id, req] of this.pending) {
      clearTimeout(req.timer);
      req.reject(new Error(reason));
      this.pending.delete(id);
    }
  }

  /** WS URL 변경 (reconnect 필요) */
  setUrl(url: string) {
    this.url = url;
    try { localStorage.setItem('tunadish:wsUrl', url); } catch { /* ignore */ }
  }

  getUrl(): string {
    return this.url;
  }

  /**
   * JSON-RPC 2.0 request 전송.
   * 서버가 표준 response({id, result/error})를 반환하면 Promise가 resolve/reject.
   * 서버가 notification만 보내면(현재 구조) Promise는 timeout 후 resolve(undefined).
   */
  sendRpc(method: string, params: RequestParams = {}): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('WebSocket is not connected'));
    }
    // branch.create 시 checkpoint_id 캡처 (branch.created 핸들러에서 사용)
    if (method === 'branch.create' && params.checkpoint_id) {
      this._pendingBranchCheckpoint = params.checkpoint_id as string;
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) {
          resolve(undefined);
        }
      }, RPC_TIMEOUT_MS);
      this.pending.set(id, { method, params, resolve, reject, timer });
      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params });
      this.ws!.send(msg);
    });
  }

  searchCode(query: string, project: string, lang?: string) {
    useContextStore.getState().setCodeSearchLoading(true);
    this.sendRpc('code.search', { query, project, lang });
  }

  getCodeMap(project: string, depth?: number, lang?: string) {
    this.sendRpc('code.map', { project, depth: depth ?? 2, lang });
  }

  // --- Phase 4: Write API + Handoff ---

  saveRoundtable(params: {
    project: string; discussion_id?: string; topic: string;
    participants: string[]; rounds: number;
    transcript: [string, string][]; summary?: string;
    branch_name?: string; auto_synthesis?: boolean;
  }) {
    this.sendRpc('discussion.save_roundtable', params);
  }

  linkDiscussionBranch(project: string, discussionId: string, branchName: string) {
    this.sendRpc('discussion.link_branch', { project, discussion_id: discussionId, branch_name: branchName });
  }

  createSynthesis(project: string, discussionId: string) {
    this.sendRpc('synthesis.create_from_discussion', { project, discussion_id: discussionId });
  }

  requestReview(project: string, artifactId: string) {
    this.sendRpc('review.request', { project, artifact_id: artifactId });
  }

  createHandoff(params: { project: string; session_id?: string; branch_id?: string; focus?: string; pending_run_id?: string }) {
    this.sendRpc('handoff.create', params);
  }

  parseHandoff(uri: string) {
    this.sendRpc('handoff.parse', { uri });
  }

  listEngines() {
    this.sendRpc('engine.list');
  }

  /** WS 재연결 후 활성 대화/브랜치 히스토리를 서버에 재요청 */
  private rehydrateActiveSession() {
    const chat = useChatStore.getState();
    const sys = useSystemStore.getState();

    // context 캐시 초기화 — 재연결이므로 서버 상태와 동기화 필요
    contextLoadedConvs.clear();

    // 활성 메인 대화 히스토리 재요청
    const convId = chat.activeConversationId;
    if (convId && !convId.startsWith('branch:')) {
      this.sendRpc('conversation.history', { conversation_id: convId });
      // project.context도 재요청
      const conv = chat.conversations[convId];
      if (conv?.projectKey) {
        this.sendRpc('project.context', { conversation_id: convId, project: conv.projectKey });
        contextLoadedConvs.add(convId);
      }
    }

    // 열려있는 브랜치 패널의 히스토리 재요청
    const branchId = sys.branchPanelBranchId;
    const branchConvId = sys.branchPanelConvId;
    if (branchId && branchConvId) {
      this.sendRpc('conversation.history', { conversation_id: branchConvId, branch_id: branchId });
    }
  }

  private buildDeps(): HandlerDeps {
    return {
      chat: useChatStore.getState(),
      run: useRunStore.getState(),
      ctxStore: useContextStore,
      sysStore: useSystemStore,
      dbSync,
      contextLoadedConvs,
      sendRpc: (method, params = {}) => this.sendRpc(method, params),
      getPendingBranchCheckpoint: () => this._pendingBranchCheckpoint,
      setPendingBranchCheckpoint: (v) => { this._pendingBranchCheckpoint = v; },
    };
  }

  private handleNotification(data: { method?: string; params?: Record<string, unknown> }) {
    const { method, params } = data;
    if (!method || !params) return;
    dispatchNotification(method, params, this.buildDeps());
  }
}

export const wsClient = new WebSocketClient();
