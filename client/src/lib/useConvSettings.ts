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
  const projectKey = conv?.projectKey;
  // 프로젝트별 캐시에서 읽기 — 세션 전환 시에도 안정적으로 값 유지
  const ctx = useContextStore(s =>
    projectKey ? (s.projectContextByKey[projectKey] ?? s.projectContext) : s.projectContext
  );
  const globalEngineList = useContextStore(s => s.engineList);

  // availableEngines: project.context 응답 → engine.list 응답 순으로 폴백
  const availableEngines = Object.keys(ctx?.availableEngines ?? {}).length > 0
    ? ctx!.availableEngines
    : globalEngineList;

  return {
    engine: conv?.engine ?? ctx?.engine ?? '',
    model: conv?.model ?? ctx?.model ?? undefined,
    persona: conv?.persona ?? ctx?.persona ?? undefined,
    triggerMode: conv?.triggerMode ?? ctx?.triggerMode ?? '',
    availableEngines,
  };
}
