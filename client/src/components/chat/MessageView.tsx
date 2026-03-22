import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { useChatStore, type ChatMessage } from '@/store/chatStore';
import { useContextStore } from '@/store/contextStore';
import {
  CircleNotch,
  CaretDown,
  CaretUp,
  Robot,
} from '@phosphor-icons/react';
import { MessageActions } from './MessageActions';
import { InlineEdit } from './MessageActions';
import { markdownComponents } from './MarkdownComponents';

// --- Progress block (tool loading 표시) ---
const COLLAPSED_LINES = 5;
const EXPANDED_LINES = 10;
const DONE_LINES = 3;

/** progress 텍스트에서 마지막 N줄만 추출 */
function tailLines(text: string, n: number): string {
  const lines = text.split('\n');
  if (lines.length <= n) return text;
  return lines.slice(-n).join('\n');
}

export function ProgressBlock({ content, isDone }: { content: string; isDone: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 완료 상태: 마지막 3줄만 표시
  if (isDone) {
    const tail = tailLines(content, DONE_LINES);
    return (
      <div className="text-[12px] text-on-surface-variant/60 font-mono leading-relaxed px-3 py-1.5 -mx-3 rounded-lg bg-white/[0.02] border border-white/5 mb-1">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{tail}</ReactMarkdown>
      </div>
    );
  }

  // 스트리밍 중: 롤링 5줄 / 확장 10줄
  const lines = content.split('\n');
  const maxLines = expanded ? EXPANDED_LINES : COLLAPSED_LINES;
  const visibleText = lines.length > maxLines
    ? lines.slice(-maxLines).join('\n')
    : content;
  const canExpand = !expanded && lines.length > COLLAPSED_LINES;
  const canCollapse = expanded && lines.length > COLLAPSED_LINES;

  // 자동 스크롤: 새 줄 추가 시 최하단으로
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [content]);

  // 줄 높이 기반 max-height: 1줄 ≈ 22px
  const maxHeight = maxLines * 22;

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        style={{ maxHeight: `${maxHeight}px`, overflowY: 'auto' }}
        className="text-[12px] text-on-surface-variant/70 font-mono leading-relaxed px-3 py-1.5 -mx-3 rounded-lg bg-white/[0.02] border border-white/5 scrollbar-thin scrollbar-thumb-surface-container-high mb-1"
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{visibleText}</ReactMarkdown>
      </div>
      {/* 확대/축소 토글 */}
      {(canExpand || canCollapse) && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="absolute -bottom-1.5 right-1 flex items-center justify-center p-1 rounded-md text-on-surface-variant/40 hover:text-on-surface-variant/80 bg-[#0e0e0e] border border-outline-variant/20 hover:bg-surface-container-high transition-colors shadow-sm"
          title={expanded ? "축소" : "더 보기"}
        >
          {expanded ? <CaretUp size={12} weight="bold" /> : <CaretDown size={12} weight="bold" />}
        </button>
      )}
    </div>
  );
}

// --- Branch Adopt Card ---
const ADOPT_SUMMARY_PREFIX = '<!-- branch-adopt-summary -->';

function BranchAdoptCard({ content }: { content: string }) {
  const body = content.replace(ADOPT_SUMMARY_PREFIX, '').trim();
  return (
    <div className="w-full px-4 py-2">
      <div className="border-l-2 border-violet-400 bg-violet-500/5 rounded-r-lg px-4 py-3 text-[13px]">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          components={{
            p: ({ children }) => <p className="my-1 text-on-surface-variant/80">{children}</p>,
            blockquote: ({ children }) => <blockquote className="border-l-2 border-violet-400/30 pl-3 my-2 text-on-surface-variant/60 text-[12px] italic">{children}</blockquote>,
            strong: ({ children }) => <strong className="text-violet-300 font-semibold">{children}</strong>,
            em: ({ children }) => <em className="text-on-surface-variant/40 text-[11px] not-italic">{children}</em>,
          }}
        >
          {body}
        </ReactMarkdown>
      </div>
    </div>
  );
}

// --- Message View ---
const proseClasses =
  'prose prose-sm dark:prose-invert max-w-none text-[14px] leading-relaxed ' +
  'prose-p:my-1.5 prose-p:text-[1em] ' +
  // 헤딩: 크기 동일(1em), bold만 구분
  'prose-headings:text-[1em] prose-headings:font-bold prose-headings:text-on-surface prose-headings:mt-4 prose-headings:mb-2 ' +
  'prose-pre:rounded-lg prose-pre:my-2 prose-pre:!bg-[#010101] ' +
  'prose-code:text-[13px] prose-code:before:content-none prose-code:after:content-none ' +
  'prose-strong:text-on-surface prose-li:my-0.5 prose-li:text-[1em] prose-ol:my-1.5 prose-ul:my-1.5 ' +
  'prose-blockquote:border-primary/20 prose-blockquote:text-on-surface-variant prose-blockquote:not-italic prose-blockquote:text-[1em] ' +
  'prose-th:text-[1em] prose-th:font-semibold prose-th:font-[inherit] prose-th:leading-normal prose-th:px-4 prose-th:py-2 ' +
  'prose-td:text-[1em] prose-td:font-normal prose-td:font-[inherit] prose-td:leading-normal prose-td:px-4 prose-td:py-1.5';

export function MessageView({ msg, isGrouped, isRoleSwitch = false, conversationId }: { msg: ChatMessage; isGrouped: boolean; isRoleSwitch?: boolean; conversationId?: string }) {
  // Branch adopt summary card — special rendering
  if (msg.content.startsWith(ADOPT_SUMMARY_PREFIX)) {
    return <BranchAdoptCard content={msg.content} />;
  }

  const isUser = msg.role === 'user';
  const isStreaming = msg.status === 'streaming';
  const isDone = msg.status === 'done';
  const isEditing = useChatStore(s => s.editingMsgId === msg.id);
  const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Get engine/model from conversation settings (prop > active), fallback to projectContext
  const activeConvId = useChatStore(s => s.activeConversationId);
  const resolvedConvId = conversationId ?? activeConvId;
  const conv = useChatStore(s => resolvedConvId ? s.conversations[resolvedConvId] : null);
  const ctx = useContextStore(s => s.projectContext);

  const rawEngine = conv?.engine || ctx?.engine || 'claude';
  const engine = rawEngine.toLowerCase();
  const model = conv?.model || ctx?.model;
  const project = ctx?.project || conv?.projectKey;
  const resumeToken = ctx?.resumeToken;
  const shortToken = resumeToken ? resumeToken.slice(0, 8) : null;

  let AiIcon = <Robot size={18} weight="fill" className="text-on-surface-variant w-full h-full" />;
  if (engine.includes('claude')) {
    AiIcon = <img src="/_resource/claude.png" alt="Claude" className="w-full h-full object-contain rounded-sm shadow-sm" />;
  } else if (engine.includes('gpt') || engine.includes('openai')) {
    AiIcon = <img src="/_resource/gpt.png" alt="GPT" className="w-full h-full object-contain rounded-sm shadow-sm" />;
  } else if (engine.includes('gemini')) {
    AiIcon = <img src="/_resource/gemini.png" alt="Gemini" className="w-full h-full object-contain rounded-sm shadow-sm" />;
  }

  const UserIcon = (
    <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" className="w-full h-full shadow-sm rounded-full">
      <circle cx="8" cy="8" r="8" fill="#5e6ad2" />
      <text x="50%" y="54%" dominantBaseline="middle" textAnchor="middle" fill="white" fontSize="9" fontWeight="bold">U</text>
    </svg>
  );

  // streaming 중이고 AI 메시지 → ProgressBlock으로 표시
  const showAsProgress = !isUser && isStreaming;
  // 완료 후 progressContent가 있으면 축소된 progress + 답변 표시
  const showCollapsedProgress = !isUser && isDone && !!msg.progressContent;

  return (
    <div className={`msg-row group relative ${isUser ? 'msg-row--user' : ''} ${isGrouped ? 'is-grouped' : ''} ${isRoleSwitch ? 'mt-4' : ''}`}>
      {/* Hover action bar */}
      <MessageActions role={msg.role as 'user' | 'assistant'} messageId={msg.id} content={msg.content} />
      {/* Body */}
      <div className="msg-row__body">
        {!isGrouped && (
          <div className="msg-row__header flex items-center">
            {isUser ? (
              <>
                <div className="w-5 h-5 shrink-0 flex items-center justify-center mr-1.5">
                  {UserIcon}
                </div>
                <span className="msg-row__name tracking-wide mt-0.5">YOU</span>
                <span className="msg-row__time mt-0.5">{timeStr}</span>
              </>
            ) : (
              <>
                <div className="w-5 h-5 shrink-0 flex items-center justify-center mr-1.5">
                  {AiIcon}
                </div>
                <span className="msg-row__name tracking-wide uppercase mt-0.5">{engine}</span>
                {model && <span className="text-[10px] text-on-surface-variant/50 font-mono mt-0.5">{model}</span>}
                {project && <span className="text-[10px] text-on-surface-variant/50 font-mono mt-0.5">{project}</span>}
                {shortToken && <span className="text-[10px] text-on-surface-variant/25 font-mono mt-0.5" title={resumeToken ?? undefined}>{shortToken}</span>}
                <span className="msg-row__time mt-0.5">{timeStr}</span>
                {isStreaming && <CircleNotch size={12} weight="bold" className="text-emerald-400 animate-spin mt-0.5" />}
              </>
            )}
          </div>
        )}
        <div className={`msg-row__content ${isGrouped ? 'pt-0' : ''}`}>
          {/* Streaming 중: ProgressBlock으로 롤링 표시 */}
          {showAsProgress && (
            <ProgressBlock content={msg.content} isDone={false} />
          )}

          {/* 완료 후: 축소된 progress (마지막 3줄) + 답변 */}
          {showCollapsedProgress && (
            <>
              <ProgressBlock content={msg.progressContent!} isDone={true} />
              <div className={proseClasses + ' pt-0.5'}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={markdownComponents}>
                  {msg.content}
                </ReactMarkdown>
              </div>
            </>
          )}

          {/* 일반 메시지 (progress 없는 완료 또는 사용자 메시지) */}
          {!showAsProgress && !showCollapsedProgress && (
            isUser && isEditing ? (
              <InlineEdit msgId={msg.id} initialContent={msg.content} />
            ) : (
              <div className={proseClasses}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={markdownComponents}>
                  {msg.content}
                </ReactMarkdown>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
