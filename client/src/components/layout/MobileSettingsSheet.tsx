import { useSystemStore } from '@/store/systemStore';
import { useChatStore } from '@/store/chatStore';
import { useRunStore } from '@/store/runStore';
import { useConvSettings } from '@/lib/useConvSettings';
import { wsClient } from '@/lib/wsClient';
import { BottomSheet } from './BottomSheet';
import { cn } from '@/lib/utils';
import { showToast } from '@/components/chat/ActionToast';
import { Lightning, Brain, Broadcast } from '@phosphor-icons/react';

const TRIGGER_MODES = [
  { value: 'always', label: 'Always', desc: '모든 메시지에 응답' },
  { value: 'mentions', label: 'Mentions', desc: '멘션 시에만 응답' },
  { value: 'off', label: 'Off', desc: '자동 응답 끔' },
] as const;

const PERSONA_PRESETS = ['default', 'concise', 'creative', 'technical'];

export function MobileSettingsSheet() {
  const open = useSystemStore(s => s.mobileSettingsSheetOpen);
  const close = () => useSystemStore.getState().setMobileSettingsSheetOpen(false);
  const convId = useChatStore(s => s.activeConversationId);
  const updateSettings = useChatStore(s => s.updateConvSettings);
  const settings = useConvSettings(convId);

  const isRunning = useRunStore(s => (s.activeRuns[convId ?? ''] ?? 'idle') !== 'idle');

  if (!convId) return null;

  const { engine, model, persona, triggerMode, availableEngines } = settings;
  const engineIds = Object.keys(availableEngines);

  const selectModel = (eng: string, m?: string) => {
    if (isRunning) return;
    updateSettings(convId, { engine: eng, model: m });
    wsClient.sendRpc('model.set', { conversation_id: convId, engine: eng, ...(m ? { model: m } : {}) });
    showToast(`Model → ${eng}${m ? `/${m}` : ''}`);
  };

  const selectPersona = (p: string) => {
    if (isRunning) return;
    const value = p === 'default' ? '' : p;
    updateSettings(convId, { persona: value || undefined });
    wsClient.sendRpc('persona.set', { conversation_id: convId, persona: value });
    showToast(`Persona → ${p}`);
  };

  const selectTrigger = (mode: string) => {
    if (isRunning) return;
    updateSettings(convId, { triggerMode: mode });
    wsClient.sendRpc('trigger.set', { conversation_id: convId, mode });
    showToast(`Trigger → ${mode}`);
  };

  return (
    <BottomSheet open={open} onClose={close} snapPoints={[0.55]}>
      <div className="flex-1 overflow-y-auto px-4 pb-4" data-bottom-sheet-scroll>
        {/* Engine / Model */}
        <div className="mb-4">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-on-surface-variant/50 uppercase tracking-wider mb-2">
            <Lightning size={12} className="text-primary" />
            Engine / Model
          </div>
          {engineIds.map(eng => {
            const models = availableEngines[eng] ?? [];
            return (
              <div key={eng} className="mb-1">
                <div className="text-[11px] font-semibold text-on-surface-variant/60 uppercase px-2 py-1">
                  {eng}
                </div>
                {models.map(m => (
                  <button
                    key={m}
                    disabled={isRunning}
                    onClick={() => selectModel(eng, m)}
                    className={cn(
                      'w-full text-left px-3 min-h-[44px] flex items-center rounded-lg text-[13px] font-mono transition-colors',
                      isRunning
                        ? 'text-on-surface-variant/30 cursor-not-allowed'
                        : eng === engine && m === model
                          ? 'bg-primary/15 text-primary'
                          : 'text-on-surface-variant/70 active:bg-white/5',
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            );
          })}
        </div>

        {/* Persona */}
        <div className="mb-4">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-on-surface-variant/50 uppercase tracking-wider mb-2">
            <Brain size={12} className="text-violet-400" />
            Persona
          </div>
          {PERSONA_PRESETS.map(p => (
            <button
              key={p}
              onClick={() => selectPersona(p)}
              className={cn(
                'w-full text-left px-3 min-h-[44px] flex items-center rounded-lg text-[13px] transition-colors',
                (p === 'default' ? !persona : persona === p)
                  ? 'bg-primary/15 text-primary font-medium'
                  : 'text-on-surface-variant/70 active:bg-white/5',
              )}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Trigger Mode */}
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-on-surface-variant/50 uppercase tracking-wider mb-2">
            <Broadcast size={12} className="text-emerald-400" />
            Trigger Mode
          </div>
          {TRIGGER_MODES.map(t => (
            <button
              key={t.value}
              onClick={() => selectTrigger(t.value)}
              className={cn(
                'w-full text-left px-3 min-h-[44px] flex flex-col justify-center rounded-lg transition-colors',
                t.value === triggerMode
                  ? 'bg-primary/15 text-primary font-medium'
                  : 'text-on-surface-variant/70 active:bg-white/5',
              )}
            >
              <span className="text-[13px]">{t.label}</span>
              <span className="text-[10px] text-on-surface-variant/40 leading-tight">{t.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </BottomSheet>
  );
}
