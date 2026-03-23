import { useChatStore } from '@/store/chatStore';
import { useContextStore, type ConversationBranch } from '@/store/contextStore';
import { useSystemStore } from '@/store/systemStore';
import * as dbSync from '@/lib/dbSync';
import { cn } from '@/lib/utils';
import {
  Archive,
  Trash,
} from '@phosphor-icons/react';
import { EmptyTab } from './EmptyTab';

export function ArchiveTabContent() {
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
    // 클라이언트 전용: SQLite에서 삭제 + store에서 제거
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
