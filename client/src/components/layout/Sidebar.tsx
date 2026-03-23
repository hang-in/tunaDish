import { useChatStore } from '@/store/chatStore';
import { useSystemStore } from '@/store/systemStore';
import { useContextStore, dismissBranch, type ConversationBranch, type MemoryEntry } from '@/store/contextStore';
import { wsClient } from '@/lib/wsClient';
import * as dbSync from '@/lib/dbSync';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  GearSix,
  GitFork,
  BookOpen,
  Archive,
  Trash,
  CaretDown,
  CaretRight,
} from '@phosphor-icons/react';
import { SidebarTree } from './SidebarTree';

// ── Branch Tab: 세션→브랜치 트리 (선택된 프로젝트만) ─────────────
function BranchTabContent() {
  const activeProjectKey = useChatStore(s => s.activeProjectKey);
  const conversations = useChatStore(s => s.conversations);
  const convBranchesByProject = useContextStore(s => s.convBranchesByProject);
  const openBranchPanel = useSystemStore(s => s.openBranchPanel);
  const activeBranchId = useSystemStore(s => s.branchPanelBranchId);

  if (!activeProjectKey) {
    return <EmptyTab text="프로젝트를 선택하세요" />;
  }

  const branches = convBranchesByProject[activeProjectKey] ?? [];
  const activeBranches = branches.filter(b => b.status === 'active');

  if (activeBranches.length === 0) {
    return <EmptyTab text="활성 브랜치 없음" />;
  }

  // 세션별 그룹화
  const bySession = new Map<string, ConversationBranch[]>();
  const orphans: ConversationBranch[] = [];
  for (const b of activeBranches) {
    if (b.rtSessionId && conversations[b.rtSessionId]) {
      const list = bySession.get(b.rtSessionId) ?? [];
      list.push(b);
      bySession.set(b.rtSessionId, list);
    } else {
      orphans.push(b);
    }
  }

  // parentBranchId 기반 트리 변환
  function buildTree(list: ConversationBranch[]): ConversationBranch[][] {
    const byId = new Map(list.map(b => [b.id, b]));
    const childrenOf = new Map<string | undefined, ConversationBranch[]>();
    for (const b of list) {
      const pk = b.parentBranchId && byId.has(b.parentBranchId) ? b.parentBranchId : undefined;
      const arr = childrenOf.get(pk) ?? [];
      arr.push(b);
      childrenOf.set(pk, arr);
    }
    // flatten to depth-first order with indent level
    const result: ConversationBranch[][] = [];
    function walk(parentId: string | undefined, depth: number) {
      for (const b of childrenOf.get(parentId) ?? []) {
        const row = new Array(depth).fill(null);
        row.push(b);
        result.push(row);
        walk(b.id, depth + 1);
      }
    }
    walk(undefined, 0);
    return result;
  }

  const handleBranchClick = (b: ConversationBranch) => {
    const convId = b.rtSessionId ?? useChatStore.getState().activeConversationId;
    if (!convId) return;
    // 부모 세션도 메인 채팅 영역에 로딩
    const state = useChatStore.getState();
    if (state.activeConversationId !== convId) {
      state.setActiveConversation(convId);
    }
    openBranchPanel(b.id, convId, b.label, activeProjectKey, b.checkpointId);
  };

  return (
    <div className="space-y-1">
      {[...bySession.entries()].map(([sessionId, sessionBranches]) => {
        const conv = conversations[sessionId];
        const tree = buildTree(sessionBranches);
        return (
          <SessionBranchGroup
            key={sessionId}
            sessionLabel={conv?.label ?? sessionId.slice(0, 8)}
            tree={tree}
            activeBranchId={activeBranchId}
            onBranchClick={handleBranchClick}
          />
        );
      })}
      {orphans.length > 0 && (
        <SessionBranchGroup
          sessionLabel="기타"
          tree={buildTree(orphans)}
          activeBranchId={activeBranchId}
          onBranchClick={handleBranchClick}
        />
      )}
    </div>
  );
}

function SessionBranchGroup({ sessionLabel, tree, activeBranchId, onBranchClick }: {
  sessionLabel: string;
  tree: ConversationBranch[][];
  activeBranchId: string | null;
  onBranchClick: (b: ConversationBranch) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        className="flex items-center gap-1.5 w-full px-2 py-1 text-[10px] font-semibold text-on-surface-variant/50 hover:text-on-surface-variant/70 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        {open ? <CaretDown size={9} /> : <CaretRight size={9} />}
        <span className="truncate">{sessionLabel}</span>
        <span className="text-[9px] text-on-surface-variant/25 font-mono">{tree.length}</span>
      </button>
      {open && tree.map(row => {
        const branch = row[row.length - 1] as ConversationBranch;
        const depth = row.length - 1;
        const isActive = activeBranchId === branch.id;
        return (
          <button
            key={branch.id}
            className={cn(
              'flex items-center gap-1.5 w-full px-2 py-1 text-[11px] rounded transition-colors',
              isActive
                ? 'bg-violet-500/15 text-violet-300'
                : 'text-on-surface-variant/60 hover:bg-violet-500/10 hover:text-violet-300',
            )}
            style={{ paddingLeft: 12 + depth * 14 }}
            onClick={() => onBranchClick(branch)}
          >
            <GitFork size={11} className="text-violet-400/60 shrink-0" />
            <span className="truncate">{branch.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Memo Tab: 메모리 엔트리 표시 ─────────────────────────────────
function MemoTabContent() {
  const memoryEntries = useContextStore(s => s.memoryEntries);
  const activeConvId = useChatStore(s => s.activeConversationId);
  const activeProjectKey = useChatStore(s => s.activeProjectKey);
  const isConnected = useSystemStore(s => s.isConnected);

  // memoryEntries는 project.context.result에서 갱신됨
  // 탭 전환 시 activeConvId가 있으면 project.context 재요청
  useEffect(() => {
    if (!isConnected || !activeProjectKey || !activeConvId) return;
    wsClient.sendRpc('project.context', {
      project: activeProjectKey,
      conversation_id: activeConvId,
    });
  }, [activeProjectKey, isConnected]);

  if (memoryEntries.length === 0) {
    return <EmptyTab text="저장된 메모 없음" />;
  }

  return (
    <div className="space-y-px">
      {memoryEntries.map(e => (
        <MemoRow key={e.id} entry={e} />
      ))}
    </div>
  );
}

/** 메모 제목: 첫 줄 10글자, 넘으면 ... */
function memoTitle(entry: MemoryEntry): string {
  const firstLine = (entry.content || entry.title || '').split('\n')[0].trim();
  return firstLine.length > 10 ? firstLine.slice(0, 10) + '…' : firstLine;
}

function MemoRow({ entry }: { entry: MemoryEntry }) {
  const [expanded, setExpanded] = useState(false);
  const activeConvId = useChatStore(s => s.activeConversationId);
  const activeProjectKey = useChatStore(s => s.activeProjectKey);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeProjectKey) return;
    useContextStore.getState().removeMemoryEntry(entry.id);
    const params: Record<string, string> = { id: entry.id, project: activeProjectKey };
    if (activeConvId) params.conversation_id = activeConvId;
    wsClient.sendRpc('memory.delete', params);
  };

  return (
    <div
      className="px-2 py-1.5 hover:bg-white/3 rounded cursor-pointer group/mem"
      onClick={() => setExpanded(o => !o)}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <BookOpen size={12} className="text-on-surface-variant/40 shrink-0" />
        <span className="text-[13px] text-on-surface-variant/70 font-medium truncate flex-1">{memoTitle(entry)}</span>
        <span className="text-[9px] text-on-surface-variant/25 shrink-0">{entry.type}</span>
        <button
          type="button"
          tabIndex={-1}
          onClick={handleDelete}
          className="hidden group-hover/mem:flex items-center justify-center size-3.5 rounded text-on-surface-variant/25 hover:text-red-400 hover:bg-red-400/10 transition-colors shrink-0"
          title="삭제"
        >
          <Trash size={10} />
        </button>
      </div>
      {expanded && entry.content && (
        <div className="mt-1 ml-5 text-[11px] text-on-surface-variant/40 leading-relaxed whitespace-pre-wrap break-words">
          {entry.content}
        </div>
      )}
    </div>
  );
}

// ── Archive Tab: 아카이빙된 브랜치 표시 ──────────────────────────
function ArchiveTabContent() {
  const activeProjectKey = useChatStore(s => s.activeProjectKey);
  const conversations = useChatStore(s => s.conversations);
  const convBranchesByProject = useContextStore(s => s.convBranchesByProject);
  const openBranchPanel = useSystemStore(s => s.openBranchPanel);

  if (!activeProjectKey) {
    return <EmptyTab text="프로젝트를 선택하세요" />;
  }

  const branches = convBranchesByProject[activeProjectKey] ?? [];
  const archived = branches.filter(b => b.status === 'archived' || b.status === 'adopted');

  if (archived.length === 0) {
    return <EmptyTab text="아카이브 없음" />;
  }

  const removeBranch = (b: ConversationBranch) => {
    const convId = b.rtSessionId ?? useChatStore.getState().activeConversationId;
    if (convId) {
      wsClient.sendRpc('branch.delete', { conversation_id: convId, branch_id: b.id });
    }
    // 서버가 거부해도 (adopted 등) 로컬에서 제거 + 숨김 목록에 추가
    dismissBranch(b.id);
    useContextStore.getState().removeConvBranch(b.id);
    dbSync.syncDeleteBranch(b.id);
  };

  // TODO: 설정 페이지로 이동 — 현재는 임시로 confirm 다이얼로그 사용
  const handleDeleteAll = () => {
    if (!window.confirm(`아카이브 ${archived.length}개를 모두 삭제합니다. 복구할 수 없습니다.`)) return;
    for (const b of archived) removeBranch(b);
  };

  return (
    <div className="space-y-px">
      <div className="flex items-center justify-end px-2 py-1">
        <button
          onClick={handleDeleteAll}
          className="text-[9px] text-on-surface-variant/25 hover:text-red-400 transition-colors"
        >
          전체 삭제 ({archived.length})
        </button>
      </div>
      {archived.map(b => {
        const conv = b.rtSessionId ? conversations[b.rtSessionId] : null;
        return (
          <div
            key={b.id}
            className="flex items-center gap-1.5 w-full px-2 py-1.5 text-[11px] text-on-surface-variant/50 hover:bg-white/5 rounded transition-colors group/arc cursor-pointer"
            onClick={() => {
              const convId = b.rtSessionId ?? useChatStore.getState().activeConversationId;
              if (convId && activeProjectKey) {
                openBranchPanel(b.id, convId, b.label, activeProjectKey, b.checkpointId);
              }
            }}
          >
            <Archive size={11} className="text-on-surface-variant/30 shrink-0" />
            <span className="truncate flex-1">{b.label}</span>
            <span className={cn(
              'text-[8px] px-1 py-px rounded shrink-0',
              b.status === 'adopted' ? 'bg-emerald-400/10 text-emerald-400/60' : 'bg-white/5 text-on-surface-variant/25',
            )}>
              {b.status}
            </span>
            {conv && (
              <span className="text-[8px] text-on-surface-variant/20 truncate max-w-[60px] shrink-0 group-hover/arc:hidden">
                {conv.label}
              </span>
            )}
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                removeBranch(b);
              }}
              className="hidden group-hover/arc:flex items-center justify-center size-4 rounded text-on-surface-variant/30 hover:text-red-400 hover:bg-red-400/10 transition-colors shrink-0"
              title="삭제"
            >
              <Trash size={10} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────
function EmptyTab({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center py-6 text-[10px] text-on-surface-variant/25">
      {text}
    </div>
  );
}

// ── Main Sidebar ──────────────────────────────────────────────────
export function Sidebar() {
  const projects = useChatStore(s => s.projects);
  const activeProjectKey = useChatStore(s => s.activeProjectKey);
  const isConnected = useSystemStore(s => s.isConnected);
  const isDbConnected = useSystemStore(s => s.isDbConnected);

  // 연결(재연결) 시 프로젝트 목록 리프레시
  useEffect(() => {
    if (!isConnected) return;
    wsClient.sendRpc('project.list');
  }, [isConnected]);

  // project.list 응답 후 → 모든 프로젝트의 대화 로드
  useEffect(() => {
    if (!isConnected || projects.length === 0) return;
    for (const p of projects) {
      wsClient.sendRpc('conversation.list', { project: p.key });
    }
    if (activeProjectKey) {
      wsClient.sendRpc('branch.list.json', { project: activeProjectKey });
    }
  }, [isConnected, projects.length]);

  return (
    <aside className="h-full w-full flex flex-col bg-[#131313] font-sans tracking-tight leading-none py-3 shrink-0 px-2">

      {/* 상단: 트리 */}
      <ScrollArea className="flex-1 min-h-0">
        {projects.length === 0 ? (
          <div className="px-2 py-6 text-[11px] text-on-surface-variant/30 text-center">
            {isConnected ? 'Loading...' : '연결 안됨'}
          </div>
        ) : (
          <SidebarTree searchTerm="" />
        )}
      </ScrollArea>

      {/* 하단: 탭 패널 */}
      <div className="flex-1 min-h-0 border-t border-outline-variant/20 flex flex-col">
        <Tabs defaultValue="branches" className="flex flex-col h-full gap-0">
          <TabsList variant="line" className="w-full shrink-0 px-1 pt-1">
            <TabsTrigger value="branches" className="text-[10px] px-2 py-1 h-6 gap-1">
              <GitFork size={10} />
              브랜치
            </TabsTrigger>
            <TabsTrigger value="memo" className="text-[10px] px-2 py-1 h-6 gap-1">
              <BookOpen size={10} />
              메모
            </TabsTrigger>
            <TabsTrigger value="archive" className="text-[10px] px-2 py-1 h-6 gap-1">
              <Archive size={10} />
              아카이브
            </TabsTrigger>
          </TabsList>
          <ScrollArea className="flex-1 min-h-0">
            <TabsContent value="branches">
              <BranchTabContent />
            </TabsContent>
            <TabsContent value="memo">
              <MemoTabContent />
            </TabsContent>
            <TabsContent value="archive">
              <ArchiveTabContent />
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </div>

      {/* Footer */}
      <div className="pt-2 border-t border-outline-variant/20 shrink-0">
        <div className="px-2 py-1.5 flex items-center justify-between">
          <div className="flex items-center gap-3 text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className={cn(
                'size-[6px] rounded-full shrink-0',
                isConnected ? 'bg-emerald-400' : 'bg-red-400',
              )} />
              <span className="text-on-surface-variant/60 font-medium tracking-wide">API</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={cn(
                'size-[6px] rounded-full shrink-0',
                isDbConnected ? 'bg-emerald-400' : 'bg-red-400',
              )} />
              <span className="text-on-surface-variant/60 font-medium tracking-wide">DB</span>
            </div>
          </div>
          <div className="flex gap-1.5 items-center">
            <button className="text-on-surface-variant/50 hover:text-on-surface transition-colors p-1 rounded hover:bg-white/5" title="Settings">
              <GearSix size={14} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
