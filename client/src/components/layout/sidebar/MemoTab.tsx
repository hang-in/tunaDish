import { useChatStore } from '@/store/chatStore';
import { useContextStore, type MemoryEntry } from '@/store/contextStore';
import { useSystemStore } from '@/store/systemStore';
import { wsClient } from '@/lib/wsClient';
import { useEffect, useState } from 'react';
import {
  BookOpen,
  Trash,
} from '@phosphor-icons/react';
import { EmptyTab } from './EmptyTab';

/** 메모 제목: 첫 줄 10글자, 넘으면 ... */
export function memoTitle(entry: MemoryEntry): string {
  const firstLine = (entry.content || entry.title || '').split('\n')[0].trim();
  return firstLine.length > 10 ? firstLine.slice(0, 10) + '\u2026' : firstLine;
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

export function MemoTabContent() {
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
