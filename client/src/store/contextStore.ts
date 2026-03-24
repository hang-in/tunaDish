import { create } from 'zustand';


// --- Context Panel types (from project.context RPC) ---

export interface MemoryEntry {
  id: string;
  type: 'decision' | 'review' | 'idea' | 'context';
  title: string;
  content: string;
  source: string;
  tags: string[];
  timestamp: number;
}

export interface GitBranch {
  name: string;
  status: 'active' | 'merged' | 'abandoned';
  description: string;
  parentBranch?: string;
  linkedEntryCount: number;
  linkedDiscussionCount: number;
}

export interface ConversationBranch {
  id: string;
  label: string;
  status: 'active' | 'adopted' | 'archived' | 'discarded';
  gitBranch?: string;
  parentBranchId?: string;
  checkpointId?: string;
  rtSessionId?: string;
}

export interface ReviewEntry {
  id: string;
  artifactId: string;
  artifactVersion: number;
  status: 'pending' | 'approved' | 'rejected';
  reviewerComment: string;
  createdAt: number;
}

export interface DiscussionEntry {
  id: string;
  topic: string;
  status: string;
  participants: string[];
}

export interface ProjectContext {
  project: string;
  engine: string | null;
  model: string | null;
  triggerMode: string;
  persona: string | null;
  resumeToken: string | null;
  gitCurrentBranch: string | null;
  availableEngines: Record<string, string[]>;
  memoryEntries: MemoryEntry[];
  activeBranches: GitBranch[];
  convBranches: ConversationBranch[];
  pendingReviewCount: number;
  recentDiscussions: DiscussionEntry[];
  markdown: string;
}

// --- rawq Code Search types ---

export interface CodeSearchResult {
  file: string;
  lines: [number, number];
  language: string;
  scope: string;
  confidence: number;
  content: string;
  context_before?: string;
  context_after?: string;
  token_count: number;
}

export interface CodeSearchResponse {
  query: string;
  project: string;
  available: boolean;
  results: CodeSearchResult[];
  query_ms: number;
  total_tokens: number;
  error?: string;
}

export interface CodeMapResponse {
  project: string;
  available: boolean;
  map: Record<string, unknown>;
  error?: string;
}

// --- Progress / Status Strip types ---

export interface ActionState {
  tool: string;
  args?: string;
  phase: 'started' | 'completed';
  ok?: boolean;
}

export interface ProgressState {
  engine: string;
  model: string;
  step: number;
  totalSteps?: number;
  elapsed: number;
  actions: ActionState[];
}

// --- Store ---

export type ContextTab = 'overview' | 'memory' | 'branches' | 'code';

interface ContextState {
  activeTab: ContextTab;
  projectContext: ProjectContext | null;
  /** 프로젝트별 projectContext 캐시 — 세션 전환 시 즉시 복원용 */
  projectContextByKey: Record<string, ProjectContext>;
  memoryEntries: MemoryEntry[];
  gitBranches: GitBranch[];
  /** 프로젝트별 대화 브랜치 맵 (사이드바에서 항상 표시용) */
  convBranchesByProject: Record<string, ConversationBranch[]>;
  reviews: ReviewEntry[];
  progress: ProgressState | null;
  codeSearchResults: CodeSearchResponse | null;
  codeMap: CodeMapResponse | null;
  codeSearchLoading: boolean;
  /** Phase 4: 사용 가능한 엔진+모델 전체 목록 (engine.list 응답) */
  engineList: Record<string, string[]>;
  /** Phase 4: 마지막 RPC 결과 (toast 표시용) */
  lastRpcResult: { method: string; ok: boolean; data: Record<string, unknown> } | null;
  /** 메모로 저장된 메시지 ID (로컬 추적, localStorage 영속화) */
  savedMessageIds: Set<string>;

  /** Derived: convBranches for the currently active project (from convBranchesByProject) */
  getConvBranches: () => ConversationBranch[];

  setActiveTab: (tab: ContextTab) => void;
  setProjectContext: (ctx: ProjectContext) => void;
  /** 세션 전환 시 캐시에서 즉시 projectContext 복원 (null이면 초기화) */
  switchProjectContext: (projectKey: string | null) => void;
  setProjectConvBranches: (projectKey: string, branches: ConversationBranch[], fromDb?: boolean) => void;
  setMemoryEntries: (entries: MemoryEntry[]) => void;
  setBranches: (git: GitBranch[], conv: ConversationBranch[]) => void;
  setReviews: (reviews: ReviewEntry[]) => void;
  setProgress: (progress: ProgressState | null) => void;
  setCodeSearchResults: (results: CodeSearchResponse) => void;
  setCodeMap: (map: CodeMapResponse) => void;
  setCodeSearchLoading: (loading: boolean) => void;
  setEngineList: (engines: Record<string, string[]>) => void;
  setLastRpcResult: (result: ContextState['lastRpcResult']) => void;
  removeConvBranch: (branchId: string) => void;
  renameConvBranch: (branchId: string, label: string) => void;
  removeMemoryEntry: (entryId: string) => void;
  markMessageSaved: (messageId: string) => void;
  unmarkMessageSaved: (messageId: string) => void;
  /** DB hydration 시 savedMessageIds 일괄 세팅 */
  hydrateMessageIds: (ids: Set<string>) => void;
  clear: () => void;
}

export const useContextStore = create<ContextState>((set, get) => ({
  activeTab: 'overview',
  projectContext: null,
  projectContextByKey: {},
  memoryEntries: [],
  gitBranches: [],
  convBranchesByProject: {},
  reviews: [],
  progress: null,
  codeSearchResults: null,
  codeMap: null,
  codeSearchLoading: false,
  engineList: {},
  lastRpcResult: null,
  savedMessageIds: new Set<string>(),

  getConvBranches: () => {
    const state = get();
    const project = state.projectContext?.project;
    return project ? (state.convBranchesByProject[project] ?? []) : [];
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  setProjectContext: (ctx) => set((state) => {
    // 서버 브랜치 기반으로 병합, 로컬(DB 복원) 브랜치 보존
    const existing = state.convBranchesByProject[ctx.project] ?? [];
    const existingById = new Map(existing.map(b => [b.id, b]));
    const serverIds = new Set(ctx.convBranches.map(b => b.id));
    // 서버 브랜치: 로컬 label 우선
    const fromServer = ctx.convBranches.map(b => ({
      ...b,
      label: existingById.get(b.id)?.label ?? b.label,
    }));
    // 로컬에만 있는 브랜치(DB 복원 등)도 유지
    const localOnly = existing.filter(b => !serverIds.has(b.id));
    const mergedBranches = [...fromServer, ...localOnly];
    return {
      projectContext: ctx,
      projectContextByKey: {
        ...state.projectContextByKey,
        [ctx.project]: ctx,
      },
      memoryEntries: ctx.memoryEntries,
      gitBranches: ctx.activeBranches,
      convBranchesByProject: {
        ...state.convBranchesByProject,
        [ctx.project]: mergedBranches,
      },
    };
  }),

  switchProjectContext: (projectKey) => set((state) => {
    if (!projectKey) return { projectContext: null, progress: null };
    const cached = state.projectContextByKey[projectKey];
    return {
      projectContext: cached ?? null,
      memoryEntries: cached?.memoryEntries ?? [],
      gitBranches: cached?.activeBranches ?? [],
      progress: null,
      codeSearchResults: null,
      codeMap: null,
    };
  }),

  setProjectConvBranches: (projectKey, branches, fromDb) => set((state) => {
    // DB 소스일 때: 기존 스토어에 이미 서버 데이터가 있으면 label만 DB 값으로 덮어쓰기
    let merged = branches;
    if (fromDb) {
      const existing = state.convBranchesByProject[projectKey] ?? [];
      const existingById = new Map(existing.map(b => [b.id, b]));
      merged = branches.map(b => {
        const ex = existingById.get(b.id);
        return ex ? { ...ex, label: b.label || ex.label } : b;
      });
      // 서버에만 있는 브랜치도 유지
      for (const ex of existing) {
        if (!branches.some(b => b.id === ex.id)) merged.push(ex);
      }
    }
    const filtered = merged;
    return {
      convBranchesByProject: {
        ...state.convBranchesByProject,
        [projectKey]: filtered,
      },
    };
  }),

  setMemoryEntries: (entries) => set({ memoryEntries: entries }),
  setBranches: (git, _conv) => set({ gitBranches: git }),
  setReviews: (reviews) => set({ reviews }),
  setProgress: (progress) => set({ progress }),
  setCodeSearchResults: (results) => set({ codeSearchResults: results, codeSearchLoading: false }),
  setCodeMap: (map) => set({ codeMap: map }),
  setCodeSearchLoading: (loading) => set({ codeSearchLoading: loading }),
  setEngineList: (engines) => set({ engineList: engines }),
  setLastRpcResult: (result) => set({ lastRpcResult: result }),

  removeMemoryEntry: (entryId) => set((state) => ({
    memoryEntries: state.memoryEntries.filter(e => e.id !== entryId),
  })),

  markMessageSaved: (messageId) => set((state) => {
    const next = new Set(state.savedMessageIds);
    next.add(messageId);
    return { savedMessageIds: next };
  }),

  unmarkMessageSaved: (messageId) => set((state) => {
    const next = new Set(state.savedMessageIds);
    next.delete(messageId);
    return { savedMessageIds: next };
  }),

  hydrateMessageIds: (ids) => set((state) => {
    const merged = new Set(state.savedMessageIds);
    for (const id of ids) merged.add(id);
    return { savedMessageIds: merged };
  }),

  removeConvBranch: (branchId) => set((state) => {
    const updated: Record<string, ConversationBranch[]> = {};
    for (const [key, list] of Object.entries(state.convBranchesByProject)) {
      updated[key] = list.filter(b => b.id !== branchId);
    }
    return { convBranchesByProject: updated };
  }),

  renameConvBranch: (branchId, label) => set((state) => {
    const updated: Record<string, ConversationBranch[]> = {};
    for (const [key, list] of Object.entries(state.convBranchesByProject)) {
      updated[key] = list.map(b => b.id === branchId ? { ...b, label } : b);
    }
    return { convBranchesByProject: updated };
  }),

  clear: () => set({
    // projectContext, projectContextByKey는 clear하지 않음 — 세션 전환 시 즉시 복원용
    // convBranchesByProject도 유지 — 다른 프로젝트 데이터 보존
    memoryEntries: [],
    gitBranches: [],
    reviews: [],
    progress: null,
  }),
}));

/** Selector: convBranches for the currently active project (derived from convBranchesByProject) */
export function selectConvBranches(state: ContextState): ConversationBranch[] {
  const project = state.projectContext?.project;
  return project ? (state.convBranchesByProject[project] ?? []) : [];
}
