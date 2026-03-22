import { useChatStore, type ConvSettings } from '@/store/chatStore';
import { useContextStore } from '@/store/contextStore';

/**
 * Conversation-level settings with project-level fallback.
 *
 * Resolution order: conversation override → projectContext default
 *
 * This hook enables per-conversation model/persona/trigger independence.
 * Branch conversations inherit settings from their parent at creation time
 * and can diverge independently afterward.
 */
export function useConvSettings(convId: string | null): ConvSettings & { availableEngines: Record<string, string[]> } {
  const conv = useChatStore(s => convId ? s.conversations[convId] : null);
  const ctx = useContextStore(s => s.projectContext);

  return {
    engine: conv?.engine ?? ctx?.engine ?? 'claude',
    model: conv?.model ?? ctx?.model,
    persona: conv?.persona ?? ctx?.persona,
    triggerMode: conv?.triggerMode ?? ctx?.triggerMode ?? 'always',
    availableEngines: ctx?.availableEngines ?? {},
  };
}
