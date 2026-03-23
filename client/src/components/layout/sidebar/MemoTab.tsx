import { useChatStore } from '@/store/chatStore';
import { useContextStore, type MemoryEntry } from '@/store/contextStore';
import * as dbSync from '@/lib/dbSync';
import { useState, useEffect } from 'react';
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

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    const ctxState = useContextStore.getState();

    // source에서 messageId 추출하여 북마크 해제
    const msgMatch = entry.source?.match(/^msg:(.+)$/);
    if (msgMatch) {
      ctxState.unmarkMessageSaved(msgMatch[1]);
    }

    ctxState.removeMemoryEntry(entry.id);
    dbSync.syncDeleteMemo(entry.id);
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
  const activeProjectKey = useChatStore(s => s.activeProjectKey);

  // 탭 열릴 때 SQLite에서 최신 메모 로드
  useEffect(() => {
    if (!activeProjectKey) return;
    dbSync.loadMemosFromDb(activeProjectKey).then(memos => {
      if (memos.length === 0) return;
      const entries = memos.map(m => ({
        id: m.id,
        type: m.type as 'decision' | 'review' | 'idea' | 'context',
        title: (m.content || '').split('\n')[0].slice(0, 10),
        content: m.content,
        source: `msg:${m.messageId}`,
        tags: JSON.parse(m.tags || '[]') as string[],
        timestamp: m.createdAt * 1000,
      }));
      useContextStore.getState().setMemoryEntries(entries);
    });
  }, [activeProjectKey]);

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
