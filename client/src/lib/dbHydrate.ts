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

    // 2. 모든 프로젝트의 대화 목록 복원 (custom_label 보존)
    const convs = await db.loadAllConversations();
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

    // 3. 브랜치 목록 복원 — 프로젝트별로 그룹화
    const ctxStore = useContextStore.getState();
    const branchesByProject = new Map<string, ConversationBranch[]>();
    for (const conv of convs) {
      const branches = await db.loadBranches(conv.id);
      for (const b of branches) {
        const list = branchesByProject.get(conv.projectKey) ?? [];
        list.push({
          id: b.id,
          label: b.label,
          status: b.status as ConversationBranch['status'],
          checkpointId: b.checkpointId,
          rtSessionId: b.sessionId,
          gitBranch: b.gitBranch,
          parentBranchId: b.parentBranchId,
        });
        branchesByProject.set(conv.projectKey, list);
      }
    }
    for (const [pk, branches] of branchesByProject) {
      ctxStore.setProjectConvBranches(pk, branches, true);
    }

    console.log('[dbHydrate] loaded', projects.length, 'projects,', convs.length, 'conversations from SQLite');
  } catch (err) {
    console.warn('[dbHydrate] failed, continuing without cache:', err);
  }
}
