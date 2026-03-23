import { useState } from 'react';
import { useChatStore } from '@/store/chatStore';
import { useRunStore } from '@/store/runStore';
import { useConvSettings } from '@/lib/useConvSettings';
import { wsClient } from '@/lib/wsClient';
import { cn } from '@/lib/utils';
import { showToast } from '@/components/chat/ActionToast';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  Lightning,
  Brain,
  Broadcast,
  CaretDown,
} from '@phosphor-icons/react';

export const TRIGGER_MODES = [
  { value: 'always', label: 'Always', desc: '모든 메시지에 응답' },
  { value: 'mentions', label: 'Mentions', desc: '멘션 시에만 응답' },
  { value: 'off', label: 'Off', desc: '자동 응답 끔' },
] as const;

export function QuickChipEngine({ convId, compact }: { convId: string; compact?: boolean }) {
  const { engine, model, availableEngines } = useConvSettings(convId);
  const updateSettings = useChatStore(s => s.updateConvSettings);
  const [open, setOpen] = useState(false);
  const isRunning = useRunStore(s => (s.activeRuns[convId] ?? 'idle') !== 'idle');

  const selectModel = (eng: string, m: string) => {
    if (isRunning) return;
    updateSettings(convId, { engine: eng, model: m });
    wsClient.sendRpc('model.set', { conversation_id: convId, engine: eng, model: m });
    showToast(`Model → ${eng}/${m}`);
    setOpen(false);
  };

  const selectEngine = (eng: string) => {
    if (isRunning) return;
    updateSettings(convId, { engine: eng, model: undefined });
    wsClient.sendRpc('model.set', { conversation_id: convId, engine: eng });
    showToast(`Engine → ${eng}`);
    setOpen(false);
  };

  const engineIds = Object.keys(availableEngines);
  const hasEngines = engineIds.length > 0;

  return (
    <Popover open={open} onOpenChange={v => { if (isRunning) return; setOpen(v); }}>
      <PopoverTrigger
        disabled={isRunning}
        className={cn(
          "flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors",
          isRunning
            ? "bg-white/5 text-on-surface-variant/30 cursor-not-allowed"
            : "bg-white/5 hover:bg-white/10 text-on-surface-variant/70 hover:text-on-surface cursor-pointer",
        )}
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

export function QuickChipPersona({ convId, compact }: { convId: string; compact?: boolean }) {
  const { persona } = useConvSettings(convId);
  const updateSettings = useChatStore(s => s.updateConvSettings);
  const [open, setOpen] = useState(false);
  const isRunning = useRunStore(s => (s.activeRuns[convId] ?? 'idle') !== 'idle');

  const PRESETS = ['default', 'concise', 'creative', 'technical'];

  const selectPersona = (p: string) => {
    if (isRunning) return;
    const value = p === 'default' ? '' : p;
    updateSettings(convId, { persona: value || undefined });
    wsClient.sendRpc('persona.set', { conversation_id: convId, persona: value });
    showToast(`Persona → ${p}`);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={v => { if (isRunning) return; setOpen(v); }}>
      <PopoverTrigger
        disabled={isRunning}
        className={cn(
          "flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors",
          isRunning
            ? "bg-white/5 text-on-surface-variant/30 cursor-not-allowed"
            : "bg-white/5 hover:bg-white/10 text-on-surface-variant/70 hover:text-on-surface cursor-pointer",
        )}
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

export function QuickChipTrigger({ convId, compact }: { convId: string; compact?: boolean }) {
  const { triggerMode: trigger } = useConvSettings(convId);
  const updateSettings = useChatStore(s => s.updateConvSettings);
  const [open, setOpen] = useState(false);
  const isRunning = useRunStore(s => (s.activeRuns[convId] ?? 'idle') !== 'idle');

  const selectTrigger = (mode: string) => {
    if (isRunning) return;
    updateSettings(convId, { triggerMode: mode });
    wsClient.sendRpc('trigger.set', { conversation_id: convId, mode });
    showToast(`Trigger → ${mode}`);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={v => { if (isRunning) return; setOpen(v); }}>
      <PopoverTrigger
        disabled={isRunning}
        className={cn(
          "flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors",
          isRunning
            ? "bg-white/5 text-on-surface-variant/30 cursor-not-allowed"
            : "bg-white/5 hover:bg-white/10 text-on-surface-variant/70 hover:text-on-surface cursor-pointer",
        )}
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
