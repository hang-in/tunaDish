/**
 * 앱 시작 시 SQLite → Zustand 하이드레이션.
 * 서버 연결 전에 로컬 캐시에서 대화 목록과 메시지를 복원하여 즉시 UI 표시.
 * Tauri 환경이 아니면 no-op.
 */
import { isTauriEnv } from './db';
import { useChatStore } from '@/store/chatStore';
import { useSystemStore } from '@/store/systemStore';
import { useContextStore, type ConversationBranch } from '@/store/contextStore';

export async function hydrateFromDb(): Promise<void> {
  if (!isTauriEnv()) return;

  try {
    const db = await import('./db');
    await db.initDb();
    useSystemStore.getState().setDbConnected(true);

    const chat = useChatStore.getState();

    // 1. 프로젝트 목록 복원
    const projects = await db.loadProjects();
    if (projects.length > 0) {
      chat.setProjects(projects.map(p => ({
        key: p.key,
        name: p.name,
        path: p.path,
        defaultEngine: p.defaultEngine,
        source: p.source as 'configured' | 'discovered',
        type: (p.type ?? 'project') as 'project' | 'channel',
      })));
    }

    const activeProjectKey = chat.activeProjectKey;
    if (!activeProjectKey) return;

    // 2. 대화 목록 복원
    const convs = await db.loadConversations(activeProjectKey);
    if (convs.length > 0) {
      chat.loadConversations(convs.map(c => ({
        id: c.id,
        projectKey: c.projectKey,
        label: c.label,
        created_at: c.createdAt,
        source: c.source,
        engine: c.engine,
        model: c.model,
      })), true);
    }

    // 3. 활성 대화의 메시지 복원
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

    // 4. 브랜치 목록 복원 — 모든 대화 브랜치를 모아서 한 번만 set (루프마다 덮어쓰면 마지막 것만 남음)
    const ctxStore = useContextStore.getState();
    const allBranches: ConversationBranch[] = [];
    for (const conv of convs) {
      const branches = await db.loadBranches(conv.id);
      for (const b of branches) {
        allBranches.push({
          id: b.id,
          label: b.label,
          status: b.status as ConversationBranch['status'],
          checkpointId: b.checkpointId,
          rtSessionId: b.sessionId,
          gitBranch: b.gitBranch,
          parentBranchId: b.parentBranchId,
        });
      }
    }
    if (allBranches.length > 0) {
      ctxStore.setProjectConvBranches(activeProjectKey, allBranches, true);
    }

    console.log('[dbHydrate] loaded', projects.length, 'projects,', convs.length, 'conversations from SQLite');
  } catch (err) {
    console.warn('[dbHydrate] failed, continuing without cache:', err);
  }
}
