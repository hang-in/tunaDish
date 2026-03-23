import type { MemoryEntry, GitBranch, ConversationBranch, DiscussionEntry, ProjectContext, ReviewEntry } from '@/store/contextStore';
import type { NotificationHandler } from './types';

export const projectListResult: NotificationHandler = (params, deps) => {
  const { chat, dbSync } = deps;
  const configured = params.configured as Array<{ key: string; alias: string; path?: string | null; default_engine?: string | null; type?: string | null }>;
  const discovered = params.discovered as string[];
  chat.setProjectsFromResult(configured, discovered);
  dbSync.syncProjects([
    ...configured.map(p => ({ key: p.key, name: p.alias, path: p.path, default_engine: p.default_engine, source: 'configured' as const, type: p.type ?? 'project' })),
    ...discovered.map(k => ({ key: k, name: k, source: 'discovered' as const, type: 'project' })),
  ]);
};

export const projectContextResult: NotificationHandler = (params, deps) => {
  const { chat, ctxStore } = deps;
  if (params.error) return;
  const p = params as Record<string, unknown>;
  const raw = p as {
    project: string; engine: string | null; model: string | null;
    trigger_mode: string; persona: string | null; resume_token: string | null; git_branch: string | null;
    available_engines: Record<string, string[]>;
    memory_entries: Array<{ id: string; type: string; title: string; content: string; source: string; tags: string[]; timestamp: number }>;
    active_branches: Array<{ name: string; status: string; description: string; discussion_count: number }>;
    conv_branches: Array<{ id: string; label: string; status: string; git_branch?: string; parent_branch_id?: string; session_id?: string; checkpoint_id?: string }>;
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
      gitBranch: b.git_branch, parentBranchId: b.parent_branch_id, checkpointId: b.checkpoint_id,
      rtSessionId: b.session_id,
    })),
    pendingReviewCount: raw.pending_review_count,
    recentDiscussions: raw.recent_discussions as DiscussionEntry[],
    markdown: raw.markdown,
  };
  ctxStore.getState().setProjectContext(ctx);
  // conversation-level settings (서버가 conv_settings를 포함하면 적용)
  const convSettings = (p as Record<string, unknown>).conv_settings as
    { engine?: string; model?: string; persona?: string; trigger_mode?: string } | undefined;
  const ctxConvId = (p as Record<string, unknown>).conversation_id as string | undefined;
  if (convSettings && ctxConvId) {
    const filtered: Record<string, string | undefined> = {};
    if (convSettings.engine !== undefined) filtered.engine = convSettings.engine;
    if (convSettings.model !== undefined) filtered.model = convSettings.model;
    if (convSettings.persona !== undefined) filtered.persona = convSettings.persona;
    if (convSettings.trigger_mode !== undefined) filtered.triggerMode = convSettings.trigger_mode;
    if (Object.keys(filtered).length > 0) {
      chat.updateConvSettings(ctxConvId, filtered);
    }
  }
};

export const branchListJsonResult: NotificationHandler = (params, deps) => {
  const { ctxStore } = deps;
  if (params.error) return;
  const store = ctxStore.getState();
  const raw = params as {
    project?: string;
    git_branches: Array<{ name: string; status: string; description: string; parent_branch?: string; linked_entry_count: number; linked_discussion_count: number }>;
    conv_branches: Array<{ id: string; label: string; status: string; git_branch?: string; parent_branch_id?: string; session_id?: string; checkpoint_id?: string }>;
  };
  // 로컬에서 이름을 변경했을 수 있으므로 기존 label 우선
  const existingBranches = raw.project ? (ctxStore.getState().convBranchesByProject[raw.project] ?? []) : [];
  const existingById = new Map(existingBranches.map(b => [b.id, b]));
  const mappedConv = raw.conv_branches.map(b => ({
    id: b.id, label: existingById.get(b.id)?.label ?? b.label,
    status: b.status as ConversationBranch['status'],
    gitBranch: b.git_branch, parentBranchId: b.parent_branch_id,
    rtSessionId: b.session_id, checkpointId: b.checkpoint_id,
  }));
  store.setBranches(
    raw.git_branches.map(b => ({
      name: b.name, status: b.status as GitBranch['status'],
      description: b.description, parentBranch: b.parent_branch,
      linkedEntryCount: b.linked_entry_count, linkedDiscussionCount: b.linked_discussion_count,
    })),
    mappedConv,
  );
  // 프로젝트별 맵도 갱신
  if (raw.project) {
    store.setProjectConvBranches(raw.project, mappedConv);
  }
};

export const memoryListJsonResult: NotificationHandler = (params, deps) => {
  if (params.error) return;
  const entries = (params.entries as MemoryEntry[]) ?? [];
  const ctxStore = deps.ctxStore.getState();
  ctxStore.setMemoryEntries(entries);
};

export const engineListResult: NotificationHandler = (params, deps) => {
  if (params.error) return;
  const ctxStore = deps.ctxStore.getState();
  ctxStore.setEngineList((params.engines ?? {}) as Record<string, string[]>);
};

export const reviewListJsonResult: NotificationHandler = (params, deps) => {
  if (params.error) return;
  const ctxStore = deps.ctxStore.getState();
  const raw = params.reviews as Array<{
    id: string; artifact_id: string; artifact_version: number;
    status: string; reviewer_comment: string; created_at: number;
  }>;
  ctxStore.setReviews((raw ?? []).map(r => ({
    id: r.id, artifactId: r.artifact_id, artifactVersion: r.artifact_version,
    status: r.status as ReviewEntry['status'], reviewerComment: r.reviewer_comment,
    createdAt: r.created_at,
  })));
};
