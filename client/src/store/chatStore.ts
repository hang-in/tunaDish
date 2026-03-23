import { create } from 'zustand';

// --- localStorage persistence for last active session ---
const LS_KEY_PROJECT = 'tunadish:lastProjectKey';
const LS_KEY_CONV = 'tunadish:lastConvId';

function saveLastActive(projectKey: string | null, convId: string | null) {
  try {
    if (projectKey) localStorage.setItem(LS_KEY_PROJECT, projectKey);
    else localStorage.removeItem(LS_KEY_PROJECT);
    if (convId) localStorage.setItem(LS_KEY_CONV, convId);
    else localStorage.removeItem(LS_KEY_CONV);
  } catch { /* localStorage 비가용 시 무시 */ }
}

function loadLastActive(): { projectKey: string | null; convId: string | null } {
  try {
    return {
      projectKey: localStorage.getItem(LS_KEY_PROJECT),
      convId: localStorage.getItem(LS_KEY_CONV),
    };
  } catch {
    return { projectKey: null, convId: null };
  }
}

// --- Domain types ---

export interface Project {
  key: string;
  name: string;
  path?: string;
  defaultEngine?: string;
  source: 'configured' | 'discovered';
  type?: 'project' | 'channel';  // backend가 보내는 분류
  currentEngine?: string;
  currentModel?: string;
  persona?: string;
  triggerMode?: 'always' | 'mentions' | 'off';
}

export interface DiscussionState {
  topic: string;
  participants: string[];
  currentRound: number;
  maxRounds: number;
  turnOrder: string[];
  status: 'pending' | 'in_progress' | 'completed' | 'abandoned';
}

/** Conversation-level settings (override project defaults) */
export interface ConvSettings {
  engine?: string;
  model?: string;
  persona?: string;
  triggerMode?: string;
}

export interface Conversation {
  id: string;
  projectKey: string;
  label: string;
  type: 'main' | 'branch' | 'discussion';
  parentId?: string;
  engine?: string;
  model?: string;
  triggerMode?: string;
  persona?: string;
  hasResumeToken?: boolean;
  pendingReviewCount?: number;
  createdAt: number;
  source?: 'tunadish' | 'mattermost' | 'slack';
  discussion?: DiscussionState;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  status?: 'sending' | 'streaming' | 'done' | 'error';
  /** 완료 시 마지막 progress 내용 (축소 표시용) */
  progressContent?: string;
  /** 메시지 생성 시 사용된 엔진 (assistant 메시지) */
  engine?: string;
  /** 메시지 생성 시 사용된 모델 (assistant 메시지) */
  model?: string;
  /** 토론 시 페르소나/역할 */
  persona?: string;
}

// Legacy compat for wsClient notification handling
export interface MessageRef {
  channel_id: string;
  message_id: string;
}

export interface RenderedMessage {
  text: string;
}

// --- Store ---

interface ChatState {
  // Data
  projects: Project[];
  conversations: Record<string, Conversation>;
  activeProjectKey: string | null;
  activeConversationId: string | null;
  messages: Record<string, ChatMessage[]>; // conv_id → ordered array
  isMockMode: boolean;

  // Branch state
  activeBranchId: string | null;
  activeBranchLabel: string | null;

  // Input state (reply / edit)
  replyTo: { msgId: string; content: string } | null;
  editingMsgId: string | null;

  // Actions
  setProjects: (projects: Project[]) => void;
  setProjectsFromResult: (configured: Array<{ key: string; alias: string; path?: string | null; default_engine?: string | null; type?: string | null }>, discovered: string[]) => void;
  addConversation: (conv: Conversation) => void;
  loadConversations: (convs: Array<{ id: string; projectKey: string; label: string; created_at: number; source?: string; engine?: string; model?: string }>, fromDb?: boolean) => void;
  setActiveProject: (key: string) => void;
  setActiveConversation: (convId: string) => void;
  createConversation: (projectKey: string, type?: Conversation['type'], label?: string) => string;

  setHistory: (convId: string, messages: ChatMessage[]) => void;

  // Message actions (ordered array)
  addMessage: (ref: MessageRef, message: RenderedMessage, meta?: { engine?: string; model?: string; persona?: string }) => void;
  updateMessage: (ref: MessageRef, message: RenderedMessage, meta?: { engine?: string; model?: string; persona?: string }) => void;
  deleteMessage: (ref: MessageRef) => void;
  pushMessage: (convId: string, msg: ChatMessage) => void;
  finalizeStreamingMessages: (convId: string) => void;
  removeMessage: (convId: string, msgId: string) => void;
  editMessage: (convId: string, msgId: string, newContent: string) => void;
  clearMessages: (convId: string) => void;
  removeConversation: (convId: string) => void;

  // Conversation settings
  updateConvSettings: (convId: string, settings: Partial<ConvSettings>) => void;
  renameConversation: (convId: string, label: string) => void;

  // Branch actions
  setActiveBranch: (branchId: string | null, label?: string | null) => void;

  // Input state actions
  setReplyTo: (msgId: string, content: string) => void;
  clearReplyTo: () => void;
  setEditingMsg: (msgId: string | null) => void;

  // Mock
  setMockMode: (on: boolean) => void;
  loadMockData: () => void;

  // Derived helpers
  getProjectConversations: (projectKey: string) => Conversation[];
}

export const useChatStore = create<ChatState>((set, get) => ({
  projects: [],
  conversations: {},
  activeProjectKey: loadLastActive().projectKey,
  activeConversationId: loadLastActive().convId,
  messages: {},
  isMockMode: false,
  activeBranchId: null,
  activeBranchLabel: null,
  replyTo: null,
  editingMsgId: null,

  setProjects: (projects) => set({ projects }),

  setProjectsFromResult: (configured, discovered) => set({
    projects: [
      ...configured.map(c => ({
        key: c.key,
        name: c.alias,
        path: c.path ?? undefined,
        defaultEngine: c.default_engine ?? undefined,
        source: 'configured' as const,
        type: (c.type ?? 'project') as 'project' | 'channel',
      })),
      ...discovered.map(k => ({ key: k, name: k, source: 'discovered' as const, type: 'project' as const })),
    ],
  }),

  addConversation: (conv) => set((state) => ({
    conversations: { ...state.conversations, [conv.id]: conv },
  })),

  loadConversations: (convs, fromDb) => set((state) => {
    const newConvs = { ...state.conversations };
    for (const c of convs) {
      // branch: prefix 가진 conversation은 서버 목록에서 무시 (BranchPanel이 직접 관리)
      if (c.id.startsWith('branch:')) continue;

      const existing = newConvs[c.id];
      if (existing) {
        // label 우선순위: DB 소스 → 기존 스토어 값 → 서버 값
        // 이름 변경은 클라이언트 전용이므로 DB에 저장된 label이 항상 최신
        const label = fromDb ? (c.label || existing.label) : (existing.label || c.label);
        newConvs[c.id] = {
          ...existing,
          label,
          source: (c.source as Conversation['source']) ?? existing.source,
          engine: fromDb ? (c.engine ?? existing.engine) : (existing.engine ?? c.engine),
          model: fromDb ? (c.model ?? existing.model) : (existing.model ?? c.model),
        };
      } else {
        newConvs[c.id] = {
          id: c.id,
          projectKey: c.projectKey,
          label: c.label,
          type: 'main',
          createdAt: c.created_at * 1000,
          source: (c.source as Conversation['source']) ?? 'tunadish',
          engine: c.engine,
          model: c.model,
        };
      }
    }
    return { conversations: newConvs };
  }),

  setActiveProject: (key) => {
    set({ activeProjectKey: key });
    saveLastActive(key, get().activeConversationId);
  },

  setActiveConversation: (convId) => {
    const conv = get().conversations[convId];
    const projectKey = conv?.projectKey ?? get().activeProjectKey;
    set({
      activeConversationId: convId,
      activeProjectKey: projectKey,
    });
    saveLastActive(projectKey, convId);
  },

  createConversation: (projectKey, type = 'main', label) => {
    const id = crypto.randomUUID();
    const conv: Conversation = {
      id,
      projectKey,
      label: label ?? (type === 'main' ? 'main' : id.substring(0, 8)),
      type,
      engine: get().projects.find(p => p.key === projectKey)?.defaultEngine,
      createdAt: Date.now(),
    };
    set((state) => ({
      conversations: { ...state.conversations, [id]: conv },
      activeConversationId: id,
      activeProjectKey: projectKey,
    }));
    return id;
  },

  setHistory: (convId, serverMessages) => set((state) => {
    const local = state.messages[convId] ?? [];
    // 서버가 알고 있는 메시지 ID 세트
    const serverIds = new Set(serverMessages.map(m => m.id));
    // 로컬에만 존재하는 메시지 보존 (streaming, sending, 또는 서버에 아직 미반영)
    const localOnly = local.filter(
      m => !serverIds.has(m.id) && (m.status === 'streaming' || m.status === 'sending' || !m.id.startsWith('hist-')),
    );
    return {
      messages: {
        ...state.messages,
        [convId]: localOnly.length > 0 ? [...serverMessages, ...localOnly] : serverMessages,
      },
    };
  }),

  // --- Message actions (ordered array model) ---

  addMessage: (ref, message, meta) => set((state) => {
    const convId = ref.channel_id;
    const arr = state.messages[convId] ?? [];
    const msg: ChatMessage = {
      id: ref.message_id,
      role: 'assistant',
      content: message.text,
      timestamp: Date.now(),
      status: 'streaming',
      engine: meta?.engine,
      model: meta?.model,
      persona: meta?.persona,
    };
    return { messages: { ...state.messages, [convId]: [...arr, msg] } };
  }),

  updateMessage: (ref, message, meta) => set((state) => {
    const convId = ref.channel_id;
    const arr = state.messages[convId] ?? [];
    const idx = arr.findIndex(m => m.id === ref.message_id);
    if (idx === -1) return state;
    const updated = [...arr];
    const prev = updated[idx];
    // streaming 중에는 status 유지, 이전 content를 progressContent로 보존
    updated[idx] = {
      ...prev,
      content: message.text,
      progressContent: prev.status === 'streaming' ? prev.content : prev.progressContent,
      ...(meta?.engine !== undefined && { engine: meta.engine }),
      ...(meta?.model !== undefined && { model: meta.model }),
      ...(meta?.persona !== undefined && { persona: meta.persona }),
    };
    return { messages: { ...state.messages, [convId]: updated } };
  }),

  deleteMessage: (ref) => set((state) => {
    const convId = ref.channel_id;
    const arr = (state.messages[convId] ?? []).filter(m => m.id !== ref.message_id);
    return { messages: { ...state.messages, [convId]: arr } };
  }),

  finalizeStreamingMessages: (convId) => set((state) => {
    const arr = state.messages[convId];
    if (!arr) return state;
    const updated = arr.map(m =>
      m.status === 'streaming'
        ? { ...m, status: 'done' as const }
        : m
    );
    return { messages: { ...state.messages, [convId]: updated } };
  }),

  pushMessage: (convId, msg) => set((state) => {
    const arr = state.messages[convId] ?? [];
    return { messages: { ...state.messages, [convId]: [...arr, msg] } };
  }),

  removeMessage: (convId, msgId) => set((state) => {
    const arr = (state.messages[convId] ?? []).filter(m => m.id !== msgId);
    return { messages: { ...state.messages, [convId]: arr } };
  }),

  editMessage: (convId, msgId, newContent) => set((state) => {
    const arr = state.messages[convId] ?? [];
    const updated = arr.map(m => m.id === msgId ? { ...m, content: newContent } : m);
    return { messages: { ...state.messages, [convId]: updated }, editingMsgId: null };
  }),

  // Conversation settings
  updateConvSettings: (convId, settings) => set((state) => {
    const conv = state.conversations[convId];
    if (!conv) return state;
    return {
      conversations: {
        ...state.conversations,
        [convId]: { ...conv, ...settings },
      },
    };
  }),

  renameConversation: (convId, label) => set((state) => {
    const conv = state.conversations[convId];
    if (!conv) return state;
    return { conversations: { ...state.conversations, [convId]: { ...conv, label } } };
  }),

  // Branch actions
  setActiveBranch: (branchId, label) => set({ activeBranchId: branchId, activeBranchLabel: label ?? null }),

  // Input state actions
  setReplyTo: (msgId, content) => set({ replyTo: { msgId, content } }),
  clearReplyTo: () => set({ replyTo: null }),
  setEditingMsg: (msgId) => set({ editingMsgId: msgId }),

  clearMessages: (convId) => set((state) => {
    const newMsgs = { ...state.messages };
    delete newMsgs[convId];
    return { messages: newMsgs };
  }),

  removeConversation: (convId) => set((state) => {
    const newConvs = { ...state.conversations };
    delete newConvs[convId];
    const newMsgs = { ...state.messages };
    delete newMsgs[convId];
    return {
      conversations: newConvs,
      messages: newMsgs,
      activeConversationId: state.activeConversationId === convId ? null : state.activeConversationId,
    };
  }),

  setMockMode: (on) => set({ isMockMode: on }),

  loadMockData: () => {
    import('@/lib/mockData').then(({ MOCK_PROJECTS, MOCK_CONVERSATIONS, MOCK_MESSAGES }) => {
      set({
        projects: MOCK_PROJECTS,
        conversations: MOCK_CONVERSATIONS,
        messages: MOCK_MESSAGES,
        isMockMode: true,
        activeProjectKey: 'tunadish',
        activeConversationId: 'conv-main-1',
      });
    });
  },

  getProjectConversations: (projectKey) => {
    return Object.values(get().conversations).filter(c => c.projectKey === projectKey);
  },
}));
