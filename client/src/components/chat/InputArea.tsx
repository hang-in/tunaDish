import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useChatStore } from '@/store/chatStore';
import { useRunStore } from '@/store/runStore';
import { useContextStore } from '@/store/contextStore';
import { useSystemStore } from '@/store/systemStore';
import { useConvSettings } from '@/lib/useConvSettings';
import { useIsMobile } from '@/lib/useIsMobile';
import { wsClient } from '@/lib/wsClient';
import * as dbSync from '@/lib/dbSync';
import { cn } from '@/lib/utils';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  PaperPlaneRight,
  Stop,
  Paperclip,
  GitMerge,
  GitBranch,
  Lightning,
  Brain,
  Broadcast,
  CaretDown,
  ArrowBendUpLeft,
  X,
  MagnifyingGlass,
  TreeStructure,
  Gear,
  UserCircle,
  Eraser,
  ArrowsClockwise,
} from '@phosphor-icons/react';

// --- Command palette ---
interface CmdDef {
  name: string;
  desc: string;
  icon: React.ReactNode;
  insert: string;          // text inserted into input (replaces "!" prefix)
  immediate?: boolean;     // if true, send immediately on select
}

const COMMANDS: CmdDef[] = [
  { name: 'search', desc: '코드 검색', icon: <MagnifyingGlass size={14} className="text-blue-400" />, insert: '!search ' },
  { name: 'map', desc: '프로젝트 구조 보기', icon: <TreeStructure size={14} className="text-emerald-400" />, insert: '!map ' },
  { name: 'model', desc: '엔진/모델 변경', icon: <Lightning size={14} className="text-primary" />, insert: '!model ' },
  { name: 'persona', desc: '페르소나 변경', icon: <UserCircle size={14} className="text-violet-400" />, insert: '!persona ' },
  { name: 'trigger', desc: '트리거 모드 변경', icon: <Broadcast size={14} className="text-emerald-400" />, insert: '!trigger ' },
  { name: 'clear', desc: '대화 기록 초기화', icon: <Eraser size={14} className="text-red-400" />, insert: '!clear', immediate: true },
  { name: 'refresh', desc: '컨텍스트 새로고침', icon: <ArrowsClockwise size={14} className="text-amber-400" />, insert: '!refresh', immediate: true },
  { name: 'config', desc: 'WS 연결 설정', icon: <Gear size={14} className="text-on-surface-variant/60" />, insert: '!config ' },
];

function CommandPalette({ query, onSelect, selectedIndex }: {
  query: string;
  onSelect: (cmd: CmdDef) => void;
  selectedIndex: number;
}) {
  const filtered = COMMANDS.filter(c => c.name.includes(query.toLowerCase()));

  if (filtered.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 mb-1 mx-0 w-full max-w-sm bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-2xl overflow-hidden z-20">
      <div className="px-3 py-1.5 border-b border-white/5 text-[10px] text-on-surface-variant/40 font-semibold uppercase tracking-wider">Commands</div>
      {filtered.map((cmd, i) => (
        <button
          key={cmd.name}
          onMouseDown={e => { e.preventDefault(); onSelect(cmd); }}
          className={cn(
            'flex items-center gap-2.5 w-full px-3 py-1.5 text-left transition-colors',
            i === selectedIndex % filtered.length
              ? 'bg-white/15 text-on-surface'
              : 'text-on-surface-variant/70 hover:bg-white/5',
          )}
        >
          {cmd.icon}
          <span className="text-[12px] font-medium">!{cmd.name}</span>
          <span className="text-[11px] text-on-surface-variant/40 ml-auto">{cmd.desc}</span>
        </button>
      ))}
    </div>
  );
}

// --- QuickChips ---
const TRIGGER_MODES = [
  { value: 'always', label: 'Always', desc: '모든 메시지에 응답' },
  { value: 'mentions', label: 'Mentions', desc: '멘션 시에만 응답' },
  { value: 'off', label: 'Off', desc: '자동 응답 끔' },
] as const;

function QuickChipEngine({ convId, compact }: { convId: string; compact?: boolean }) {
  const { engine, model, availableEngines } = useConvSettings(convId);
  const updateSettings = useChatStore(s => s.updateConvSettings);
  const [open, setOpen] = useState(false);

  const selectModel = (eng: string, m: string) => {
    updateSettings(convId, { engine: eng, model: m });
    wsClient.sendRpc('model.set', { conversation_id: convId, engine: eng, model: m });
    setOpen(false);
  };

  const selectEngine = (eng: string) => {
    updateSettings(convId, { engine: eng, model: undefined });
    wsClient.sendRpc('model.set', { conversation_id: convId, engine: eng });
    setOpen(false);
  };

  const engineIds = Object.keys(availableEngines);
  const hasEngines = engineIds.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium
          bg-white/5 hover:bg-white/10 text-on-surface-variant/70 hover:text-on-surface transition-colors cursor-pointer"
      >
        <Lightning size={12} weight="fill" className="text-primary" />
        <span className="hidden sm:inline">{engine}{model ? `/${model}` : ''}</span>
        {!compact && <CaretDown size={10} className="opacity-50" />}
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-52 p-1 max-h-72 overflow-y-auto">
        {!hasEngines ? (
          <div className="px-2 py-3 text-[11px] text-on-surface-variant/40 text-center">
            서버에서 엔진 목록을 받지 못했습니다
          </div>
        ) : (
          engineIds.map(eng => {
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
          })
        )}
      </PopoverContent>
    </Popover>
  );
}

function QuickChipPersona({ convId, compact }: { convId: string; compact?: boolean }) {
  const { persona } = useConvSettings(convId);
  const updateSettings = useChatStore(s => s.updateConvSettings);
  const [open, setOpen] = useState(false);

  const PRESETS = ['default', 'concise', 'creative', 'technical'];

  const selectPersona = (p: string) => {
    const value = p === 'default' ? '' : p;
    updateSettings(convId, { persona: value || undefined });
    wsClient.sendRpc('persona.set', { conversation_id: convId, persona: value });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium
          bg-white/5 hover:bg-white/10 text-on-surface-variant/70 hover:text-on-surface transition-colors cursor-pointer"
      >
        <Brain size={12} className="text-violet-400" />
        {!compact && <span className="hidden sm:inline">{persona || 'default'}</span>}
        {!compact && <CaretDown size={10} className="opacity-50" />}
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

function QuickChipTrigger({ convId, compact }: { convId: string; compact?: boolean }) {
  const { triggerMode: trigger } = useConvSettings(convId);
  const updateSettings = useChatStore(s => s.updateConvSettings);
  const [open, setOpen] = useState(false);

  const selectTrigger = (mode: string) => {
    updateSettings(convId, { triggerMode: mode });
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
        {!compact && <span className="hidden sm:inline">{trigger}</span>}
        {!compact && <CaretDown size={10} className="opacity-50" />}
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
export function InputArea({ overrideConversationId, compact }: { overrideConversationId?: string; compact?: boolean } = {}) {
  const isMobile = useIsMobile();
  const [input, setInput] = useState('');
  const [cmdIndex, setCmdIndex] = useState(0);
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

  const convSettings = useConvSettings(activeConversationId);
  const engineName = (() => {
    const e = (convSettings.engine || 'claude').toLowerCase();
    if (e.includes('claude')) return '클로드';
    if (e.includes('gemini')) return '제미나이';
    if (e.includes('codex')) return '코덱스';
    if (e.includes('gpt') || e.includes('openai')) return 'GPT';
    return convSettings.engine || '클로드';
  })();
  const placeholderText = `${engineName}에게 무엇이든 물어보세요!`;

  // Command palette: show when input starts with "!" and has no newlines
  const cmdMatch = input.match(/^!(\S*)$/);
  const showCmdPalette = !!cmdMatch;
  const cmdQuery = cmdMatch?.[1] ?? '';

  const filteredCmds = COMMANDS.filter(c => c.name.includes(cmdQuery.toLowerCase()));

  const handleCmdSelect = useCallback((cmd: CmdDef) => {
    setInput(cmd.insert);
    setCmdIndex(0);
    if (cmd.immediate) {
      // defer so input updates first
      setTimeout(() => {
        if (!activeConversationId) return;
        const msgId = crypto.randomUUID();
        const ts = Date.now();
        pushMessage(activeConversationId, {
          id: msgId, role: 'user', content: cmd.insert, timestamp: ts, status: 'done',
        });
        dbSync.syncMessage({ id: msgId, conversationId: activeConversationId, role: 'user', content: cmd.insert, timestamp: ts, status: 'done' });
        wsClient.sendRpc('chat.send', { conversation_id: activeConversationId, text: cmd.insert });
        setInput('');
      }, 0);
    } else {
      setTimeout(() => textareaRef.current?.focus(), 10);
    }
  }, [activeConversationId, pushMessage]);

  const handleSend = () => {
    if (!input.trim() || !activeConversationId) return;
    // reply 모드이면 인용 접두사 추가
    const finalText = replyTo
      ? `> ${replyTo.content.split('\n').join('\n> ')}\n\n${input}`
      : input;
    const userMsgId = crypto.randomUUID();
    const userTs = Date.now();
    pushMessage(activeConversationId, {
      id: userMsgId, role: 'user', content: finalText, timestamp: userTs, status: 'done',
    });
    dbSync.syncMessage({ id: userMsgId, conversationId: activeConversationId, role: 'user', content: finalText, timestamp: userTs, status: 'done' });
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
    if (showCmdPalette && filteredCmds.length > 0) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCmdIndex(i => (i - 1 + filteredCmds.length) % filteredCmds.length);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCmdIndex(i => (i + 1) % filteredCmds.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        handleCmdSelect(filteredCmds[cmdIndex % filteredCmds.length]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setInput('');
        return;
      }
    }
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
{/* Reply banner */}
      {replyTo && (
        <div className="mb-1.5 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a1a1a]/95 border border-violet-400/20">
          <ArrowBendUpLeft size={11} className="text-violet-400 shrink-0" />
          <span className="flex-1 text-[11px] text-on-surface-variant/60 truncate leading-tight">{replyTo.content}</span>
          <button onClick={clearReplyTo} className="p-1 rounded-full hover:bg-white/10 text-on-surface-variant/40 hover:text-on-surface-variant transition-colors shrink-0">
            <X size={12} weight="bold" />
          </button>
        </div>
      )}

      <div className="relative bg-[#161616]/95 backdrop-blur-xl rounded-xl border border-white/5 focus-within:border-primary/50 transition-colors shadow-2xl">
        {/* Command palette */}
        {showCmdPalette && (
          <CommandPalette query={cmdQuery} onSelect={handleCmdSelect} selectedIndex={cmdIndex} />
        )}
        {/* QuickChips / Mobile Summary Chip */}
        {activeConversationId && (
          isMobile ? (
            <button
              onClick={() => useSystemStore.getState().setMobileSettingsSheetOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-on-surface-variant/60"
            >
              <Lightning size={12} className="text-primary" />
              <span>{convSettings.engine}{convSettings.model ? `/${convSettings.model}` : ''}</span>
              <span className="text-on-surface-variant/30">&middot;</span>
              <span>{convSettings.persona || 'default'}</span>
              <span className="text-on-surface-variant/30">&middot;</span>
              <span>{convSettings.triggerMode}</span>
              <CaretDown size={10} className="opacity-40" />
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-0">
              <QuickChipEngine convId={activeConversationId} compact={compact} />
              <QuickChipPersona convId={activeConversationId} compact={compact} />
              <QuickChipTrigger convId={activeConversationId} compact={compact} />
            </div>
          )
        )}

        {/* Git Branch + Merge Button (Top Right) — hidden in compact/mobile mode */}
        {!compact && !isMobile && (
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
        )}


        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => { setInput(e.target.value); setCmdIndex(0); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholderText}
          rows={1}
          className={cn(
            'w-full bg-transparent border-none focus:ring-0 text-[14px] px-4 pt-2 resize-none',
            'placeholder:text-on-surface-variant/15 placeholder:font-light text-on-surface',
            'focus-visible:outline-none focus:outline-none',
            'disabled:cursor-not-allowed disabled:opacity-50',
            isMobile
              ? 'pb-[44px] min-h-[44px] max-h-[120px]'
              : 'pb-[52px] min-h-[100px] max-h-[300px]',
          )}
        />
        <div className="absolute bottom-3 left-3 flex items-center gap-1">
          <button disabled className="p-1.5 hover:bg-white/5 rounded-md text-on-surface-variant transition-colors disabled:opacity-30" title="Attach">
            <Paperclip size={18} />
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
