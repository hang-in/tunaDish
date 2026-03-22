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
  memoryEntries: MemoryEntry[];
  gitBranches: GitBranch[];
  convBranches: ConversationBranch[];
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

  setActiveTab: (tab: ContextTab) => void;
  setProjectContext: (ctx: ProjectContext) => void;
  setProjectConvBranches: (projectKey: string, branches: ConversationBranch[]) => void;
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
  removeMemoryEntry: (entryId: string) => void;
  clear: () => void;
}

export const useContextStore = create<ContextState>((set) => ({
  activeTab: 'overview',
  projectContext: null,
  memoryEntries: [],
  gitBranches: [],
  convBranches: [],
  convBranchesByProject: {},
  reviews: [],
  progress: null,
  codeSearchResults: null,
  codeMap: null,
  codeSearchLoading: false,
  engineList: {},
  lastRpcResult: null,

  setActiveTab: (tab) => set({ activeTab: tab }),

  setProjectContext: (ctx) => set((state) => ({
    projectContext: ctx,
    memoryEntries: ctx.memoryEntries,
    gitBranches: ctx.activeBranches,
    convBranches: ctx.convBranches,
    // 프로젝트별 맵도 동시 갱신
    convBranchesByProject: {
      ...state.convBranchesByProject,
      [ctx.project]: ctx.convBranches,
    },
  })),

  setProjectConvBranches: (projectKey, branches) => set((state) => ({
    convBranchesByProject: {
      ...state.convBranchesByProject,
      [projectKey]: branches,
    },
    // 현재 활성 프로젝트면 convBranches도 갱신
    ...(state.projectContext?.project === projectKey ? { convBranches: branches } : {}),
  })),

  setMemoryEntries: (entries) => set({ memoryEntries: entries }),
  setBranches: (git, conv) => set({ gitBranches: git, convBranches: conv }),
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

  removeConvBranch: (branchId) => set((state) => {
    const convBranches = state.convBranches.filter(b => b.id !== branchId);
    // 프로젝트별 맵에서도 제거
    const updated: Record<string, ConversationBranch[]> = {};
    for (const [key, list] of Object.entries(state.convBranchesByProject)) {
      updated[key] = list.filter(b => b.id !== branchId);
    }
    return { convBranches, convBranchesByProject: updated };
  }),

  clear: () => set({
    projectContext: null,
    memoryEntries: [],
    gitBranches: [],
    convBranches: [],
    // convBranchesByProject는 clear하지 않음 — 다른 프로젝트 데이터 유지
    reviews: [],
    progress: null,
  }),
}));
