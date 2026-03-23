import { create } from 'zustand';

// --- Dismissed branches (로컬에서 숨긴 브랜치, 서버가 삭제를 거부하는 경우) ---
const LS_DISMISSED = 'tunadish:dismissedBranches';
function loadDismissed(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(LS_DISMISSED) ?? '[]')); } catch { return new Set(); }
}
function saveDismissed(ids: Set<string>) {
  try { localStorage.setItem(LS_DISMISSED, JSON.stringify([...ids])); } catch { /* ignore */ }
}
export function dismissBranch(branchId: string) {
  const ids = loadDismissed();
  ids.add(branchId);
  saveDismissed(ids);
}
function filterDismissed<T extends { id: string }>(branches: T[]): T[] {
  const ids = loadDismissed();
  if (ids.size === 0) return branches;
  return branches.filter(b => !ids.has(b.id));
}

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

  setProjectContext: (ctx) => set((state) => {
    // 로컬에서 이름을 변경했을 수 있으므로 기존 label 우선
    const existingByProject = new Map((state.convBranchesByProject[ctx.project] ?? []).map(b => [b.id, b]));
    const mergedBranches = filterDismissed(ctx.convBranches.map(b => ({
      ...b,
      label: existingByProject.get(b.id)?.label ?? b.label,
    })));
    return {
      projectContext: ctx,
      memoryEntries: ctx.memoryEntries,
      gitBranches: ctx.activeBranches,
      convBranches: mergedBranches,
      convBranchesByProject: {
        ...state.convBranchesByProject,
        [ctx.project]: mergedBranches,
      },
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
    const filtered = filterDismissed(merged);
    return {
      convBranchesByProject: {
        ...state.convBranchesByProject,
        [projectKey]: filtered,
      },
      ...(state.projectContext?.project === projectKey ? { convBranches: filtered } : {}),
    };
  }),

  setMemoryEntries: (entries) => set({ memoryEntries: entries }),
  setBranches: (git, conv) => set({ gitBranches: git, convBranches: filterDismissed(conv) }),
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

  renameConvBranch: (branchId, label) => set((state) => {
    const convBranches = state.convBranches.map(b => b.id === branchId ? { ...b, label } : b);
    const updated: Record<string, ConversationBranch[]> = {};
    for (const [key, list] of Object.entries(state.convBranchesByProject)) {
      updated[key] = list.map(b => b.id === branchId ? { ...b, label } : b);
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
