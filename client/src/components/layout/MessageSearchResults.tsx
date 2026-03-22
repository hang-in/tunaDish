import { useState, useEffect, useRef } from 'react';
import { useChatStore } from '@/store/chatStore';
import { useSystemStore } from '@/store/systemStore';
import { isTauriEnv } from '@/lib/db';
import { ChatCircle, SpinnerGap } from '@phosphor-icons/react';

interface SearchResult {
  id: string;
  conversationId: string;
  content: string;
  timestamp: number;
}

const MIN_QUERY_LEN = 2;
const DEBOUNCE_MS = 300;

interface Props {
  query: string;
  onSelect?: () => void;
}

export function MessageSearchResults({ query, onSelect }: Props) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const isDbConnected = useSystemStore(s => s.isDbConnected);
  const setActiveConversation = useChatStore(s => s.setActiveConversation);
  const conversations = useChatStore(s => s.conversations);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!isDbConnected || !isTauriEnv() || query.trim().length < MIN_QUERY_LEN) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    timerRef.current = setTimeout(async () => {
      try {
        const db = await import('@/lib/db');
        const rows = await db.searchMessages(query.trim(), 20);
        setResults(rows.map(r => ({
          id: r.id,
          conversationId: r.conversationId,
          content: r.content,
          timestamp: r.timestamp,
        })));
      } catch (err) {
        console.warn('[MessageSearch] FTS query failed:', err);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query, isDbConnected]);

  const handleClick = (conversationId: string) => {
    setActiveConversation(conversationId);
    onSelect?.();
  };

  return (
    <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-[#1a1a1a] border border-outline-variant/20 rounded-lg shadow-xl shadow-black/40 max-h-[60vh] overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-[#1a1a1a] px-3 py-2 border-b border-outline-variant/10">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold tracking-wider text-on-surface-variant/50 uppercase">
            메시지 검색
          </span>
          {searching && (
            <SpinnerGap size={12} className="text-on-surface-variant/40 animate-spin" />
          )}
          {!searching && results.length > 0 && (
            <span className="text-[10px] text-on-surface-variant/30 font-mono">{results.length}건</span>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="p-1.5">
        {!searching && results.length === 0 && (
          <div className="px-3 py-4 text-[11px] text-on-surface-variant/30 text-center">
            검색 결과가 없습니다
          </div>
        )}

        {results.map(r => {
          const conv = conversations[r.conversationId];
          const snippet = highlightSnippet(r.content, query, 100);
          const time = formatTime(r.timestamp);

          return (
            <button
              key={r.id}
              className="w-full text-left px-3 py-2.5 rounded-md hover:bg-white/5 transition-colors group mb-0.5"
              onClick={() => handleClick(r.conversationId)}
            >
              {/* Card header */}
              <div className="flex items-center gap-1.5 mb-1">
                <ChatCircle size={11} weight="fill" className="text-primary/50 shrink-0" />
                <span className="text-[11px] text-on-surface-variant/60 font-medium truncate flex-1">
                  {conv?.label || r.conversationId.slice(0, 8)}
                </span>
                <span className="text-[9px] text-on-surface-variant/25 font-mono shrink-0">{time}</span>
              </div>
              {/* Snippet */}
              <div
                className="text-[11px] text-on-surface-variant/50 leading-relaxed line-clamp-2 pl-[17px]"
                dangerouslySetInnerHTML={{ __html: snippet }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 상대 시간 포맷 */
function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return new Date(ts).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

/** 검색어 주변 텍스트 스니펫 + 하이라이트 */
function highlightSnippet(content: string, query: string, maxLen: number): string {
  const plain = content.replace(/[#*_~`>\[\]()!]/g, '').replace(/\n+/g, ' ').trim();
  const lower = plain.toLowerCase();
  const qLower = query.toLowerCase();
  const idx = lower.indexOf(qLower);

  let snippet: string;
  if (idx < 0) {
    snippet = plain.slice(0, maxLen);
  } else {
    const start = Math.max(0, idx - 30);
    const end = Math.min(plain.length, idx + query.length + maxLen - 30);
    snippet = (start > 0 ? '…' : '') + plain.slice(start, end) + (end < plain.length ? '…' : '');
  }

  // XSS 방지
  snippet = snippet.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (qLower) {
    const escaped = qLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    snippet = snippet.replace(
      new RegExp(`(${escaped})`, 'gi'),
      '<mark class="bg-amber-400/30 text-on-surface rounded-sm px-0.5">$1</mark>',
    );
  }
  return snippet;
}
