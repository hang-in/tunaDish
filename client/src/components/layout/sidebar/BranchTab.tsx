import { useChatStore } from '@/store/chatStore';
import { useContextStore, type ConversationBranch } from '@/store/contextStore';
import { useSystemStore } from '@/store/systemStore';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  GitFork,
  CaretDown,
  CaretRight,
} from '@phosphor-icons/react';
import { EmptyTab } from './EmptyTab';

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

export function SessionBranchGroup({ sessionLabel, tree, activeBranchId, onBranchClick }: {
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

export function BranchTabContent() {
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
