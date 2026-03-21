import { useSystemStore } from '@/store/systemStore';
import { useContextStore, type ContextTab, type MemoryEntry, type GitBranch, type ConversationBranch } from '@/store/contextStore';
import { useChatStore } from '@/store/chatStore';
import { wsClient } from '@/lib/wsClient';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Folder,
  Lightning,
  Brain,
  GitBranch as GitBranchIcon,
  GitFork,
  ChatCircle,
  Eye,
  BookOpen,
  Tag,
  Trash,
  ArrowSquareOut,
  Archive,
} from '@phosphor-icons/react';

// --- Tab buttons ---
const TABS: { key: ContextTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'memory', label: 'Memory' },
  { key: 'branches', label: 'Branches' },
];

function TabBar() {
  const activeTab = useContextStore(s => s.activeTab);
  const setTab = useContextStore(s => s.setActiveTab);

  return (
    <div className="flex border-b border-outline-variant/30">
      {TABS.map(t => (
        <button
          key={t.key}
          onClick={() => setTab(t.key)}
          className={cn(
            'flex-1 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors',
            activeTab === t.key
              ? 'text-primary border-b-2 border-primary'
              : 'text-on-surface-variant/50 hover:text-on-surface-variant/80',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// --- Overview Tab ---
function OverviewTab() {
  const ctx = useContextStore(s => s.projectContext);

  if (!ctx) {
    return (
      <div className="p-5 text-[12px] text-on-surface-variant/40 text-center">
        프로젝트를 선택하세요.
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5">
      {/* Project header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Folder size={14} weight="fill" className="text-primary" />
          <span className="text-[13px] font-semibold text-on-surface">{ctx.project}</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-on-surface-variant">
          {ctx.engine && (
            <span className="flex items-center gap-1">
              <Lightning size={12} weight="fill" className="text-primary" />
              {ctx.engine}{ctx.model ? `/${ctx.model}` : ''}
            </span>
          )}
          {ctx.persona && (
            <span className="flex items-center gap-1">
              <Brain size={12} />
              {ctx.persona}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Lightning size={12} />
            {ctx.triggerMode}
          </span>
        </div>
      </div>

      {/* Active branches summary */}
      {(ctx.activeBranches.length > 0 || ctx.convBranches.length > 0) && (
        <section>
          <SectionLabel icon={<GitBranchIcon size={12} />} label="Branches" />
          <div className="space-y-1">
            {ctx.activeBranches.map(b => (
              <div key={b.name} className="flex items-center gap-2 text-[11px] text-on-surface-variant px-1 py-0.5">
                <GitBranchIcon size={12} className="text-emerald-400 shrink-0" />
                <span className="text-on-surface font-medium">{b.name}</span>
                {b.linkedDiscussionCount > 0 && (
                  <span className="text-[10px] text-on-surface-variant/40">{b.linkedDiscussionCount} disc</span>
                )}
              </div>
            ))}
            {ctx.convBranches.map(b => (
              <div key={b.id} className="flex items-center gap-2 text-[11px] text-on-surface-variant px-1 py-0.5">
                <GitFork size={12} className="text-blue-400 shrink-0" />
                <span className="text-on-surface font-medium">{b.label}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent decisions from memory */}
      {ctx.memoryEntries.length > 0 && (
        <section>
          <SectionLabel icon={<BookOpen size={12} />} label={`Memory (${ctx.memoryEntries.length})`} />
          <div className="space-y-1">
            {ctx.memoryEntries.slice(0, 5).map(e => (
              <MemoryEntryRow key={e.id} entry={e} compact />
            ))}
          </div>
        </section>
      )}

      {/* Pending reviews */}
      {ctx.pendingReviewCount > 0 && (
        <section>
          <SectionLabel icon={<Eye size={12} />} label={`Pending Reviews (${ctx.pendingReviewCount})`} />
        </section>
      )}

      {/* Recent discussions */}
      {ctx.recentDiscussions.length > 0 && (
        <section>
          <SectionLabel icon={<ChatCircle size={12} />} label="Recent Discussions" />
          <div className="space-y-1">
            {ctx.recentDiscussions.map(d => (
              <div key={d.id} className="flex items-center gap-2 text-[11px] px-1 py-0.5">
                <ChatCircle size={12} className="text-on-surface-variant/40 shrink-0" />
                <span className="text-on-surface">{d.topic}</span>
                <span className="text-[10px] text-on-surface-variant/30">[{d.status}]</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {ctx.memoryEntries.length === 0 && ctx.activeBranches.length === 0 && ctx.recentDiscussions.length === 0 && (
        <div className="text-[11px] text-on-surface-variant/30 text-center py-4">
          프로젝트에 저장된 컨텍스트가 없습니다.
        </div>
      )}
    </div>
  );
}

// --- Memory Tab ---
function MemoryTab() {
  const entries = useContextStore(s => s.memoryEntries);
  const ctx = useContextStore(s => s.projectContext);

  if (!ctx) {
    return <div className="p-5 text-[12px] text-on-surface-variant/40 text-center">프로젝트를 선택하세요.</div>;
  }

  if (entries.length === 0) {
    return <div className="p-5 text-[12px] text-on-surface-variant/40 text-center">저장된 메모리가 없습니다.</div>;
  }

  const byType = entries.reduce<Record<string, MemoryEntry[]>>((acc, e) => {
    (acc[e.type] ??= []).push(e);
    return acc;
  }, {});

  return (
    <div className="p-4 space-y-4">
      {(['decision', 'review', 'idea', 'context'] as const).map(type => {
        const items = byType[type];
        if (!items?.length) return null;
        return (
          <section key={type}>
            <SectionLabel icon={<Tag size={12} />} label={`${type} (${items.length})`} />
            <div className="space-y-1">
              {items.map(e => <MemoryEntryRow key={e.id} entry={e} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// --- Delete Confirm Dialog ---
function DeleteConfirmDialog({
  branchLabel,
  onConfirm,
  onCancel,
}: {
  branchLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div className="bg-[#1a1a1a] border border-outline-variant/30 rounded-lg p-4 w-72 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="text-[13px] font-semibold text-on-surface">브랜치 삭제</div>
        <div className="text-[11px] text-on-surface-variant/70">
          <span className="font-medium text-on-surface">{branchLabel}</span> 브랜치를 영구 삭제합니다. 이 작업은 되돌릴 수 없습니다.
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 px-3 py-1.5 rounded-md text-[11px] font-medium bg-white/5 text-on-surface-variant/60 hover:bg-white/10 transition-colors"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-3 py-1.5 rounded-md text-[11px] font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Branches Tab ---
function BranchesTab() {
  const gitBranches = useContextStore(s => s.gitBranches);
  const convBranches = useContextStore(s => s.convBranches);
  const ctx = useContextStore(s => s.projectContext);
  const activeConvId = useChatStore(s => s.activeConversationId);
  const activeConv = useChatStore(s =>
    s.activeConversationId ? s.conversations[s.activeConversationId] : null
  );
  const [deleteTarget, setDeleteTarget] = useState<ConversationBranch | null>(null);

  if (!ctx) {
    return <div className="p-5 text-[12px] text-on-surface-variant/40 text-center">프로젝트를 선택하세요.</div>;
  }

  const activeBranches = convBranches.filter(b => b.status === 'active');
  const archivedBranches = convBranches.filter(b => b.status === 'archived' || b.status === 'adopted');

  const handleOpenBranch = (branch: ConversationBranch) => {
    if (!activeConvId || !activeConv?.projectKey) return;
    useSystemStore.getState().openBranchPanel(branch.id, activeConvId, branch.label, activeConv.projectKey);
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget || !activeConvId) return;
    wsClient.sendRpc('branch.delete', {
      conversation_id: activeConvId,
      branch_id: deleteTarget.id,
    });
    setDeleteTarget(null);
  };

  return (
    <div className="p-4 space-y-5">
      {/* Git Branches */}
      <section>
        <SectionLabel icon={<GitBranchIcon size={12} />} label="Git Branches" />
        {gitBranches.length === 0 ? (
          <div className="text-[11px] text-on-surface-variant/30 px-1">없음</div>
        ) : (
          <div className="space-y-1.5">
            {gitBranches.map(b => (
              <GitBranchRow key={b.name} branch={b} />
            ))}
          </div>
        )}
      </section>

      {/* Active Branches */}
      {activeBranches.length > 0 && (
        <section>
          <SectionLabel icon={<GitFork size={12} />} label={`Active (${activeBranches.length})`} />
          <div className="space-y-1">
            {activeBranches.map(b => (
              <ManagedBranchRow
                key={b.id}
                branch={b}
                onOpen={() => handleOpenBranch(b)}
                onDelete={() => setDeleteTarget(b)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Archived / Adopted Branches */}
      {archivedBranches.length > 0 && (
        <section>
          <SectionLabel icon={<Archive size={12} />} label={`Archived (${archivedBranches.length})`} />
          <div className="space-y-1">
            {archivedBranches.map(b => (
              <ManagedBranchRow
                key={b.id}
                branch={b}
                onDelete={() => setDeleteTarget(b)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {convBranches.length === 0 && gitBranches.length === 0 && (
        <div className="text-[11px] text-on-surface-variant/30 text-center py-4">
          브랜치가 없습니다.
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <DeleteConfirmDialog
          branchLabel={deleteTarget.label}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// --- Shared sub-components ---

function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <span className="text-on-surface-variant/40">{icon}</span>
      <span className="text-[10px] font-semibold text-on-surface-variant/50 uppercase tracking-wider">{label}</span>
    </div>
  );
}

function MemoryEntryRow({ entry, compact }: { entry: MemoryEntry; compact?: boolean }) {
  const typeColors: Record<string, string> = {
    decision: 'text-amber-400',
    review: 'text-blue-400',
    idea: 'text-emerald-400',
    context: 'text-purple-400',
  };

  return (
    <div className="px-1 py-1 rounded hover:bg-white/3 group">
      <div className="flex items-center gap-2 text-[11px]">
        <span className={cn('text-[10px] font-medium uppercase', typeColors[entry.type] ?? 'text-on-surface-variant/50')}>
          {entry.type.slice(0, 3)}
        </span>
        <span className="text-on-surface font-medium truncate flex-1">{entry.title}</span>
        <span className="text-[10px] text-on-surface-variant/30 shrink-0">{entry.source}</span>
      </div>
      {!compact && entry.content && (
        <div className="text-[10px] text-on-surface-variant/50 mt-0.5 line-clamp-2 pl-7">{entry.content}</div>
      )}
      {entry.tags.length > 0 && (
        <div className="flex gap-1 mt-0.5 pl-7">
          {entry.tags.map(t => (
            <span key={t} className="text-[9px] px-1 py-px rounded bg-white/5 text-on-surface-variant/40">{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function GitBranchRow({ branch }: { branch: GitBranch }) {
  const statusIcon = branch.status === 'active' ? '🌿' : branch.status === 'merged' ? '✅' : '🗑';

  return (
    <div className="px-1 py-1 rounded hover:bg-white/3 text-[11px]">
      <div className="flex items-center gap-2">
        <span>{statusIcon}</span>
        <span className="text-on-surface font-medium">{branch.name}</span>
        {branch.status !== 'active' && (
          <span className="text-[10px] text-on-surface-variant/30">[{branch.status}]</span>
        )}
      </div>
      {branch.description && (
        <div className="text-[10px] text-on-surface-variant/50 mt-0.5 pl-6">{branch.description}</div>
      )}
      <div className="flex gap-2 text-[10px] text-on-surface-variant/30 mt-0.5 pl-6">
        {branch.linkedEntryCount > 0 && <span>{branch.linkedEntryCount} entries</span>}
        {branch.linkedDiscussionCount > 0 && <span>{branch.linkedDiscussionCount} discussions</span>}
      </div>
    </div>
  );
}


function ManagedBranchRow({
  branch,
  onOpen,
  onDelete,
}: {
  branch: ConversationBranch;
  onOpen?: () => void;
  onDelete: () => void;
}) {
  const statusColors: Record<string, string> = {
    active: 'text-emerald-400',
    adopted: 'text-violet-400',
    archived: 'text-on-surface-variant/40',
    discarded: 'text-red-400/50',
  };

  return (
    <div className="px-1 py-1.5 rounded hover:bg-white/5 text-[11px] group">
      <div className="flex items-center gap-2">
        <GitFork size={12} className={statusColors[branch.status] ?? 'text-on-surface-variant/30'} />
        <span className="text-on-surface font-medium truncate flex-1">{branch.label}</span>
        {branch.status !== 'active' && (
          <span className="text-[9px] text-on-surface-variant/30 font-mono">{branch.status}</span>
        )}
        <div className="hidden group-hover:flex items-center gap-1 shrink-0">
          {onOpen && (
            <button
              onClick={onOpen}
              className="p-0.5 rounded text-on-surface-variant/40 hover:text-blue-400 hover:bg-blue-400/10 transition-colors"
              title="브랜치 열기"
            >
              <ArrowSquareOut size={12} />
            </button>
          )}
          <button
            onClick={onDelete}
            className="p-0.5 rounded text-on-surface-variant/40 hover:text-red-400 hover:bg-red-400/10 transition-colors"
            title="브랜치 삭제"
          >
            <Trash size={12} />
          </button>
        </div>
      </div>
      {branch.gitBranch && (
        <div className="text-[10px] text-on-surface-variant/30 pl-5 mt-0.5">→ {branch.gitBranch}</div>
      )}
    </div>
  );
}

// --- Main ContextPanel ---
export function ContextPanel() {
  const activeTab = useContextStore(s => s.activeTab);
  const activeProjectKey = useChatStore(s => s.activeProjectKey);
  const activeConversationId = useChatStore(s => s.activeConversationId);
  const isConnected = useSystemStore(s => s.isConnected);

  // 프로젝트/대화 변경 시 이전 데이터 초기화 후 재요청
  useEffect(() => {
    useContextStore.getState().clear();
    if (!isConnected || !activeProjectKey) return;
    const params: Record<string, string> = { project: activeProjectKey };
    if (activeConversationId) params.conversation_id = activeConversationId;
    wsClient.sendRpc('project.context', params);
  }, [activeProjectKey, activeConversationId, isConnected]);

  // 탭 변경 시 상세 데이터 요청
  useEffect(() => {
    if (!isConnected || !activeProjectKey) return;
    const params: Record<string, string> = { project: activeProjectKey };
    if (activeConversationId) params.conversation_id = activeConversationId;

    if (activeTab === 'branches') {
      wsClient.sendRpc('branch.list.json', params);
    } else if (activeTab === 'memory') {
      wsClient.sendRpc('memory.list.json', params);
    }
  }, [activeTab, activeProjectKey, activeConversationId, isConnected]);

  return (
    <aside className="h-full bg-[#131313] border-l border-outline-variant overflow-hidden font-sans flex flex-col shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-outline-variant/40 flex items-center justify-between shrink-0">
        <h2 className="text-[11px] font-bold text-on-surface uppercase tracking-widest">Context</h2>
      </div>

      {/* Tabs */}
      <TabBar />

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-surface-container-high scrollbar-track-transparent">
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'memory' && <MemoryTab />}
        {activeTab === 'branches' && <BranchesTab />}
      </div>
    </aside>
  );
}
