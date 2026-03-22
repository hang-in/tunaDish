/**
 * 앱 시작 시 SQLite → Zustand 하이드레이션.
 * 서버 연결 전에 로컬 캐시에서 대화 목록과 메시지를 복원하여 즉시 UI 표시.
 * Tauri 환경이 아니면 no-op.
 */
import { isTauriEnv } from './db';
import { useChatStore } from '@/store/chatStore';

export async function hydrateFromDb(): Promise<void> {
  if (!isTauriEnv()) return;

  try {
    const db = await import('./db');
    await db.initDb();

    const chat = useChatStore.getState();
    const activeProjectKey = chat.activeProjectKey;
    if (!activeProjectKey) return;

    // 대화 목록 복원
    const convs = await db.loadConversations(activeProjectKey);
    if (convs.length > 0) {
      chat.loadConversations(convs.map(c => ({
        id: c.id,
        projectKey: c.projectKey,
        label: c.label,
        created_at: c.createdAt,
        source: c.source,
      })));
    }

    // 활성 대화의 메시지 복원
    const activeConvId = chat.activeConversationId;
    if (activeConvId) {
      const msgs = await db.loadMessages(activeConvId);
      if (msgs.length > 0 && !chat.messages[activeConvId]?.length) {
        chat.setHistory(activeConvId, msgs.map(m => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: m.timestamp,
          status: (m.status as 'done' | 'streaming') ?? 'done',
          engine: m.engine,
          model: m.model,
          persona: m.persona,
        })));
      }
    }

    console.log('[dbHydrate] loaded', convs.length, 'conversations from SQLite');
  } catch (err) {
    console.warn('[dbHydrate] failed, continuing without cache:', err);
  }
}
