import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useChatStore } from '@/store/chatStore';
import { useRunStore } from '@/store/runStore';
import { useContextStore } from '@/store/contextStore';
import { wsClient } from '@/lib/wsClient';
import { cn } from '@/lib/utils';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  PaperPlaneRight,
  Stop,
  Paperclip,
  MarkdownLogo,
  GitMerge,
  GitBranch,
  Lightning,
  Brain,
  Broadcast,
  CaretDown,
  ArrowBendUpLeft,
  X,
} from '@phosphor-icons/react';

// --- QuickChips ---
const TRIGGER_MODES = [
  { value: 'always', label: 'Always', desc: '모든 메시지에 응답' },
  { value: 'mentions', label: 'Mentions', desc: '멘션 시에만 응답' },
  { value: 'off', label: 'Off', desc: '자동 응답 끔' },
] as const;

function QuickChipEngine({ convId }: { convId: string }) {
  const ctx = useContextStore(s => s.projectContext);
  const engine = ctx?.engine ?? 'claude';
  const model = ctx?.model;
  const availableEngines = ctx?.availableEngines ?? {};
  const [open, setOpen] = useState(false);

  const selectModel = (eng: string, m: string) => {
    wsClient.sendRpc('model.set', { conversation_id: convId, engine: eng, model: m });
    setOpen(false);
  };

  const selectEngine = (eng: string) => {
    wsClient.sendRpc('model.set', { conversation_id: convId, engine: eng });
    setOpen(false);
  };

  const engineIds = Object.keys(availableEngines).length > 0
    ? Object.keys(availableEngines)
    : ['claude', 'gemini', 'codex'];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium
          bg-white/5 hover:bg-white/10 text-on-surface-variant/70 hover:text-on-surface transition-colors cursor-pointer"
      >
        <Lightning size={12} weight="fill" className="text-primary" />
        <span className="hidden sm:inline">{engine}{model ? `/${model}` : ''}</span>
        <CaretDown size={10} className="opacity-50" />
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-52 p-1 max-h-72 overflow-y-auto">
        {engineIds.map(eng => {
          const models = availableEngines[eng] ?? [];
          const isActive = eng === engine;
          return (
            <div key={eng}>
              <button
                onClick={() => selectEngine(eng)}
                className={cn(
                  'w-full text-left px-2 py-1 rounded text-[11px] font-semibold uppercase tracking-wide transition-colors',
                  isActive ? 'text-primary' : 'text-on-surface-variant/60 hover:text-on-surface-variant',
                )}
              >
                {eng}
              </button>
              {models.map(m => (
                <button
                  key={m}
                  onClick={() => selectModel(eng, m)}
                  className={cn(
                    'w-full text-left px-3 py-0.5 rounded text-[11px] font-mono transition-colors',
                    eng === engine && m === model
                      ? 'bg-primary/15 text-primary'
                      : 'text-on-surface-variant/70 hover:bg-white/5',
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

function QuickChipPersona({ convId }: { convId: string }) {
  const ctx = useContextStore(s => s.projectContext);
  const persona = ctx?.persona;
  const [open, setOpen] = useState(false);

  const PRESETS = ['default', 'concise', 'creative', 'technical'];

  const selectPersona = (p: string) => {
    wsClient.sendRpc('persona.set', { conversation_id: convId, persona: p === 'default' ? '' : p });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium
          bg-white/5 hover:bg-white/10 text-on-surface-variant/70 hover:text-on-surface transition-colors cursor-pointer"
      >
        <Brain size={12} className="text-violet-400" />
        <span className="hidden sm:inline">{persona || 'default'}</span>
        <CaretDown size={10} className="opacity-50" />
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-44 p-1">
        <div className="text-[10px] font-semibold text-on-surface-variant/50 uppercase px-2 pt-0.5 pb-1 mb-0.5 border-b border-outline-variant/20">Persona</div>
        {PRESETS.map(p => (
          <button
            key={p}
            onClick={() => selectPersona(p)}
            className={cn(
              'w-full text-left px-2 py-0.5 rounded text-[11px] transition-colors',
              (p === 'default' ? !persona : persona === p)
                ? 'bg-primary/15 text-primary font-medium'
                : 'hover:bg-white/5 text-on-surface-variant',
            )}
          >
            {p}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function QuickChipTrigger({ convId }: { convId: string }) {
  const ctx = useContextStore(s => s.projectContext);
  const trigger = ctx?.triggerMode ?? 'always';
  const [open, setOpen] = useState(false);

  const selectTrigger = (mode: string) => {
    wsClient.sendRpc('trigger.set', { conversation_id: convId, mode });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium
          bg-white/5 hover:bg-white/10 text-on-surface-variant/70 hover:text-on-surface transition-colors cursor-pointer"
      >
        <Broadcast size={12} className="text-emerald-400" />
        <span className="hidden sm:inline">{trigger}</span>
        <CaretDown size={10} className="opacity-50" />
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-52 p-1">
        <div className="text-[10px] font-semibold text-on-surface-variant/50 uppercase px-2 pt-0.5 pb-1 mb-0.5 border-b border-outline-variant/20">Trigger Mode</div>
        {TRIGGER_MODES.map(t => (
          <button
            key={t.value}
            onClick={() => selectTrigger(t.value)}
            className={cn(
              'w-full text-left px-2 py-0.5 rounded text-[11px] transition-colors',
              t.value === trigger ? 'bg-primary/15 text-primary font-medium' : 'hover:bg-white/5 text-on-surface-variant',
            )}
          >
            <div>{t.label}</div>
            <div className="text-[9px] text-on-surface-variant/40 leading-tight">{t.desc}</div>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// --- Input Area ---
export function InputArea({ overrideConversationId }: { overrideConversationId?: string } = {}) {
  const [input, setInput] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const storeConversationId = useChatStore(s => s.activeConversationId);
  const activeConversationId = overrideConversationId ?? storeConversationId;
  const gitBranch = useContextStore(s => s.projectContext?.gitCurrentBranch);
  const isMockMode = useChatStore(s => s.isMockMode);
  const pushMessage = useChatStore(s => s.pushMessage);
  const replyTo = useChatStore(s => s.replyTo);
  const clearReplyTo = useChatStore(s => s.clearReplyTo);
  const runStatus = useRunStore(s => {
    return activeConversationId ? (s.activeRuns[activeConversationId] ?? 'idle') : 'idle';
  });
  const requestCancel = useRunStore(s => s.requestCancel);
  const isRunning = runStatus === 'running' || runStatus === 'cancelling';

  const handleSend = () => {
    if (!input.trim() || !activeConversationId) return;
    // reply 모드이면 인용 접두사 추가
    const finalText = replyTo
      ? `> ${replyTo.content.split('\n').join('\n> ')}\n\n${input}`
      : input;
    pushMessage(activeConversationId, {
      id: crypto.randomUUID(), role: 'user', content: finalText, timestamp: Date.now(), status: 'done',
    });
    if (isMockMode) {
      setTimeout(() => {
        pushMessage(activeConversationId, {
          id: crypto.randomUUID(), role: 'assistant',
          content: `*Preview* — mock response to:\n\n> ${input}`,
          timestamp: Date.now(), status: 'done',
        });
      }, 400);
    } else {
      wsClient.sendRpc('chat.send', { conversation_id: activeConversationId, text: finalText });
    }
    setInput('');
    if (replyTo) clearReplyTo();
    setTimeout(() => textareaRef.current?.focus(), 10);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  }, [input]);

  if (!activeConversationId) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 p-4 pb-8 flex-shrink-0 z-10">
      {showPreview && input.trim() && (
        <div className="max-w-3xl mx-auto mb-3 p-4 rounded-xl border border-outline-variant/40 bg-surface-container-high prose prose-sm dark:prose-invert max-w-none text-[13px]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{input}</ReactMarkdown>
        </div>
      )}

      {/* Reply banner */}
      {replyTo && (
        <div className="max-w-3xl mx-auto mb-1.5 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a1a1a]/95 border border-violet-400/20">
          <ArrowBendUpLeft size={11} className="text-violet-400 shrink-0" />
          <span className="flex-1 text-[11px] text-on-surface-variant/60 truncate leading-tight">{replyTo.content}</span>
          <button onClick={clearReplyTo} className="p-1 rounded-full hover:bg-white/10 text-on-surface-variant/40 hover:text-on-surface-variant transition-colors shrink-0">
            <X size={12} weight="bold" />
          </button>
        </div>
      )}

      <div className="max-w-3xl mx-auto relative bg-[#161616]/95 backdrop-blur-xl rounded-xl border border-white/5 focus-within:border-primary/50 transition-colors shadow-2xl">
        {/* QuickChips */}
        {activeConversationId && (
          <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-0">
            <QuickChipEngine convId={activeConversationId} />
            <QuickChipPersona convId={activeConversationId} />
            <QuickChipTrigger convId={activeConversationId} />
          </div>
        )}

        {/* Git Branch + Merge Button (Top Right) */}
        <div className="absolute top-2.5 right-3 flex items-center gap-1.5">
          {gitBranch && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono text-on-surface-variant/50 bg-white/5">
              <GitBranch size={12} className="text-emerald-400/60" />
              {gitBranch}
            </span>
          )}
          <button className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-white/5 hover:bg-white/10 text-on-surface-variant/70 hover:text-on-surface transition-colors cursor-pointer">
            <GitMerge size={14} weight="bold" className="text-amber-500" />
            <span className="hidden sm:inline">Merge</span>
          </button>
        </div>

        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything..."
          rows={1}
          className={cn(
            'w-full bg-transparent border-none focus:ring-0 text-[14px] px-4 pt-2 pb-[52px] resize-none',
            'placeholder:text-on-surface-variant/40 text-on-surface',
            'focus-visible:outline-none focus:outline-none',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'min-h-[100px] max-h-[300px]',
          )}
        />
        <div className="absolute bottom-3 left-3 flex items-center gap-1">
          <button disabled className="p-1.5 hover:bg-white/5 rounded-md text-on-surface-variant transition-colors disabled:opacity-30" title="Attach">
            <Paperclip size={18} />
          </button>
          <button
            onClick={() => setShowPreview(!showPreview)}
            className={cn('p-1.5 rounded-md transition-colors',
              showPreview ? 'text-primary bg-primary/10' : 'text-on-surface-variant hover:bg-white/5'
            )}
            title="Preview"
          >
            <MarkdownLogo size={18} />
          </button>
        </div>
        <div className="absolute bottom-3 right-3 flex items-center gap-2">
          {isRunning && (
            <button onClick={() => activeConversationId && requestCancel(activeConversationId)} className="p-1.5 hover:bg-white/5 hover:text-error rounded-md text-amber-500 transition-colors" title="Stop">
              <Stop size={18} weight="fill" />
            </button>
          )}
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="bg-primary hover:bg-white text-on-surface-variant hover:text-black px-3 py-1.5 rounded-lg flex items-center gap-2 text-[12px] font-semibold transition-colors disabled:opacity-40 disabled:hover:bg-primary disabled:hover:text-on-surface-variant"
            title="Send"
          >
            <span>Send</span>
            <PaperPlaneRight size={14} weight="bold" />
          </button>
        </div>
      </div>
    </div>
  );
}
