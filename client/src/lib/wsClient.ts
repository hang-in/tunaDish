import { useChatStore } from '@/store/chatStore';
import { useRunStore, type RunStatus } from '@/store/runStore';
import { useSystemStore } from '@/store/systemStore';
import { useContextStore, type MemoryEntry, type GitBranch, type ConversationBranch, type ReviewEntry, type ProjectContext, type DiscussionEntry, type CodeSearchResponse, type CodeMapResponse } from '@/store/contextStore';
import { contextLoadedConvs } from '@/lib/contextCache';

type RequestParams = Record<string, unknown>;

interface PendingRequest {
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
          // 표준 response에도 notification 파이프라인으로 전달 (UI 반영용)
          if (data.result && data.method) {
            this.handleNotification({ method: data.method, params: data.result });
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
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) {
          // 현재 서버는 notification 방식이므로 timeout ≠ 에러.
          // 표준 response 전환 전까지 silent resolve.
          resolve(undefined);
        }
      }, RPC_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.ws!.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
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

  private handleNotification(data: { method?: string; params?: Record<string, unknown> }) {
    const { method, params } = data;
    if (!method || !params) return;

    const chat = useChatStore.getState();
    const run = useRunStore.getState();

    switch (method) {
      case 'message.new': {
        const ref = params.ref as { channel_id: string; message_id: string };
        chat.addMessage(ref, params.message as { text: string });
        // active run이 없는 채널의 메시지는 즉시 done 처리 (브랜치 context summary 등)
        const channelRun = run.activeRuns[ref.channel_id];
        if (!channelRun || channelRun === 'idle') {
          chat.finalizeStreamingMessages(ref.channel_id);
        }
        break;
      }
      case 'message.update':
        chat.updateMessage(
          params.ref as { channel_id: string; message_id: string },
          params.message as { text: string },
        );
        break;
      case 'message.delete':
        chat.deleteMessage(params.ref as { channel_id: string; message_id: string });
        break;
      case 'run.status': {
        const convId = params.conversation_id as string;
        const status = params.status as RunStatus;
        run.setRunStatus(convId, status);
        // 실행 완료 시 streaming 메시지를 finalize
        if (status === 'idle') {
          chat.finalizeStreamingMessages(convId);
        }
        break;
      }
      case 'project.list.result':
        chat.setProjectsFromResult(
          params.configured as Array<{ key: string; alias: string; path?: string | null; default_engine?: string | null; type?: string | null }>,
          params.discovered as string[],
        );
        break;
      case 'conversation.created':
        chat.addConversation({
          id: params.conversation_id as string,
          projectKey: params.project as string,
          label: params.label as string ?? 'session',
          type: 'main',
          engine: undefined,
          createdAt: Date.now(),
        });
        break;
      case 'conversation.deleted':
        chat.removeConversation(params.conversation_id as string);
        break;
      case 'conversation.history.result': {
        const convId = params.conversation_id as string;
        const raw = params.messages as Array<{ role: string; content: string; timestamp: string }>;
        const msgs = raw.map((m, i) => ({
          id: `hist-${i}`,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: new Date(m.timestamp).getTime(),
          status: 'done' as const,
        }));
        chat.setHistory(convId, msgs);
        break;
      }
      case 'conversation.list.result': {
        const convs = (params.conversations as Array<{
          id: string; project: string; label: string; created_at: number; source?: string;
        }>);
        chat.loadConversations(convs.map(c => ({
          id: c.id,
          projectKey: c.project,
          label: c.label,
          created_at: c.created_at,
          source: c.source,
        })));
        break;
      }
      case 'command.result': {
        const convId = params.conversation_id as string;
        const text = params.text as string;
        if (convId && convId !== '__rpc__') {
          chat.pushMessage(convId, {
            id: `cmd-${Date.now()}`,
            role: 'assistant',
            content: text,
            timestamp: Date.now(),
            status: 'done',
          });
          // command(model.set, trigger.set 등)로 context가 바뀔 수 있으므로 캐시 무효화 + 재요청
          contextLoadedConvs.delete(convId);
          const conv = chat.conversations[convId];
          if (conv?.projectKey) {
            this.sendRpc('project.context', {
              conversation_id: convId,
              project: conv.projectKey,
            });
            contextLoadedConvs.add(convId);
          }
        }
        break;
      }
      // --- Structured JSON RPC results (context panel) ---
      case 'project.context.result': {
        if (params.error) break;
        const ctxStore = useContextStore.getState();
        const p = params as Record<string, unknown>;
        const raw = p as {
          project: string; engine: string | null; model: string | null;
          trigger_mode: string; persona: string | null; resume_token: string | null; git_branch: string | null;
          available_engines: Record<string, string[]>;
          memory_entries: Array<{ id: string; type: string; title: string; content: string; source: string; tags: string[]; timestamp: number }>;
          active_branches: Array<{ name: string; status: string; description: string; discussion_count: number }>;
          conv_branches: Array<{ id: string; label: string; status: string; git_branch?: string; parent_branch_id?: string; session_id?: string }>;
          pending_review_count: number;
          recent_discussions: Array<{ id: string; topic: string; status: string; participants: string[] }>;
          markdown: string;
        };
        const ctx: ProjectContext = {
          project: raw.project,
          engine: raw.engine,
          model: raw.model,
          triggerMode: raw.trigger_mode,
          persona: raw.persona,
          resumeToken: raw.resume_token,
          gitCurrentBranch: raw.git_branch,
          availableEngines: raw.available_engines ?? {},
          memoryEntries: raw.memory_entries as MemoryEntry[],
          activeBranches: raw.active_branches.map(b => ({
            name: b.name, status: b.status as GitBranch['status'],
            description: b.description, linkedEntryCount: 0, linkedDiscussionCount: b.discussion_count,
          })),
          convBranches: raw.conv_branches.map(b => ({
            id: b.id, label: b.label, status: b.status as ConversationBranch['status'],
            gitBranch: b.git_branch, parentBranchId: b.parent_branch_id,
            rtSessionId: b.session_id,
          })),
          pendingReviewCount: raw.pending_review_count,
          recentDiscussions: raw.recent_discussions as DiscussionEntry[],
          markdown: raw.markdown,
        };
        ctxStore.setProjectContext(ctx);
        break;
      }
      case 'branch.list.json.result': {
        if (params.error) break;
        const ctxStore = useContextStore.getState();
        const raw = params as {
          project?: string;
          git_branches: Array<{ name: string; status: string; description: string; parent_branch?: string; linked_entry_count: number; linked_discussion_count: number }>;
          conv_branches: Array<{ id: string; label: string; status: string; git_branch?: string; parent_branch_id?: string; session_id?: string }>;
        };
        const mappedConv = raw.conv_branches.map(b => ({
          id: b.id, label: b.label, status: b.status as ConversationBranch['status'],
          gitBranch: b.git_branch, parentBranchId: b.parent_branch_id,
          rtSessionId: b.session_id,
        }));
        ctxStore.setBranches(
          raw.git_branches.map(b => ({
            name: b.name, status: b.status as GitBranch['status'],
            description: b.description, parentBranch: b.parent_branch,
            linkedEntryCount: b.linked_entry_count, linkedDiscussionCount: b.linked_discussion_count,
          })),
          mappedConv,
        );
        // 프로젝트별 맵도 갱신
        if (raw.project) {
          ctxStore.setProjectConvBranches(raw.project, mappedConv);
        }
        break;
      }
      case 'memory.list.json.result': {
        if (params.error) break;
        const ctxStore = useContextStore.getState();
        ctxStore.setMemoryEntries((params.entries as MemoryEntry[]) ?? []);
        break;
      }
      // --- Branch notifications ---
      case 'branch.created': {
        const branchId = params.branch_id as string;
        const label = params.label as string;
        const convId = params.conversation_id as string;
        chat.setActiveBranch(branchId, label);
        // Open branch in slide panel (replaces multi-window)
        const createdConv = chat.conversations[convId];
        const createdProjectKey = createdConv?.projectKey ?? '';
        useSystemStore.getState().openBranchPanel(branchId, convId, label, createdProjectKey);
        // Refresh branch list
        if (convId && createdProjectKey) {
          this.sendRpc('project.context', { conversation_id: convId, project: createdProjectKey });
        }
        break;
      }
      case 'branch.switched': {
        const branchId = params.branch_id as string | null;
        chat.setActiveBranch(branchId);
        break;
      }
      case 'branch.adopted': {
        const branchId = params.branch_id as string;
        const convId = params.conversation_id as string;
        chat.setActiveBranch(null);
        // Close branch panel on adopt
        if (useSystemStore.getState().branchPanelBranchId === branchId) {
          useSystemStore.getState().closeBranchPanel();
        }
        // Refresh context
        if (convId) {
          const conv = chat.conversations[convId];
          if (conv?.projectKey) {
            this.sendRpc('project.context', { conversation_id: convId, project: conv.projectKey });
          }
        }
        break;
      }
      case 'branch.archived': {
        const branchId = params.branch_id as string;
        if (chat.activeBranchId === branchId) {
          chat.setActiveBranch(null);
        }
        // Close branch panel if viewing this branch
        const sys = useSystemStore.getState();
        if (sys.branchPanelBranchId === branchId) {
          sys.closeBranchPanel();
        }
        break;
      }
      case 'branch.deleted': {
        const branchId = params.branch_id as string;
        if (chat.activeBranchId === branchId) {
          chat.setActiveBranch(null);
        }
        useContextStore.getState().removeConvBranch(branchId);
        chat.clearMessages(`branch:${branchId}`);
        // Close branch panel if viewing this branch
        const sysState = useSystemStore.getState();
        if (sysState.branchPanelBranchId === branchId) {
          sysState.closeBranchPanel();
        }
        break;
      }
      // --- Message action results ---
      case 'message.deleted': {
        const convId = params.conversation_id as string;
        const msgId = params.message_id as string;
        if (convId && msgId) {
          chat.removeMessage(convId, msgId);
        }
        break;
      }
      case 'message.action.result': {
        // TODO: toast/snackbar for save/adopt confirmation
        break;
      }
      case 'code.search.result': {
        const ctxStore = useContextStore.getState();
        ctxStore.setCodeSearchResults(params as unknown as CodeSearchResponse);
        break;
      }
      case 'code.map.result': {
        const ctxStore = useContextStore.getState();
        ctxStore.setCodeMap(params as unknown as CodeMapResponse);
        break;
      }
      // --- Phase 4 RPC results ---
      case 'discussion.save_roundtable.result':
      case 'discussion.link_branch.result':
      case 'synthesis.create.result':
      case 'review.request.result':
      case 'handoff.create.result':
      case 'handoff.parse.result': {
        const ctxStore = useContextStore.getState();
        ctxStore.setLastRpcResult({
          method,
          ok: !params.error,
          data: params as Record<string, unknown>,
        });
        break;
      }
      case 'engine.list.result': {
        if (params.error) break;
        const ctxStore = useContextStore.getState();
        ctxStore.setEngineList((params.engines ?? {}) as Record<string, string[]>);
        break;
      }
      case 'review.list.json.result': {
        if (params.error) break;
        const ctxStore = useContextStore.getState();
        const raw = params.reviews as Array<{
          id: string; artifact_id: string; artifact_version: number;
          status: string; reviewer_comment: string; created_at: number;
        }>;
        ctxStore.setReviews((raw ?? []).map(r => ({
          id: r.id, artifactId: r.artifact_id, artifactVersion: r.artifact_version,
          status: r.status as ReviewEntry['status'], reviewerComment: r.reviewer_comment,
          createdAt: r.created_at,
        })));
        break;
      }
    }
  }
}

export const wsClient = new WebSocketClient();
