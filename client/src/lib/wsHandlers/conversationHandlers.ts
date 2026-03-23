import type { NotificationHandler } from './types';

export const conversationCreated: NotificationHandler = (params, deps) => {
  const { chat, dbSync } = deps;
  const newConvId = params.conversation_id as string;
  const newProjectKey = params.project as string;
  const newLabel = (params.label as string) ?? 'session';
  const now = Date.now();
  chat.addConversation({ id: newConvId, projectKey: newProjectKey, label: newLabel, type: 'main', engine: undefined, createdAt: now });
  dbSync.syncConversation({ id: newConvId, projectKey: newProjectKey, label: newLabel, type: 'main', createdAt: now });
};

export const conversationDeleted: NotificationHandler = (params, deps) => {
  const { chat, dbSync } = deps;
  chat.removeConversation(params.conversation_id as string);
  dbSync.syncDeleteConversation(params.conversation_id as string);
};

export const conversationHistoryResult: NotificationHandler = (params, deps) => {
  const { chat } = deps;
  const convId = params.conversation_id as string;
  const branchId = params.branch_id as string | undefined;
  // branch history는 branch:${branch_id} 키로 저장
  const historyKey = branchId ? `branch:${branchId}` : convId;
  const raw = params.messages as Array<{ role: string; content: string; timestamp: string; engine?: string; model?: string; persona?: string }>;
  const msgs = raw.map((m, i) => ({
    id: `hist-${i}`,
    role: m.role as 'user' | 'assistant',
    content: m.content,
    timestamp: new Date(m.timestamp).getTime(),
    status: 'done' as const,
    engine: m.engine,
    model: m.model,
    persona: m.persona,
  }));
  chat.setHistory(historyKey, msgs);
};

export const conversationListResult: NotificationHandler = (params, deps) => {
  const { chat, dbSync } = deps;
  const convs = (params.conversations as Array<{
    id: string; project: string; label: string; created_at: number; source?: string;
  }>);
  chat.loadConversations(convs.map(c => ({
    id: c.id,
    projectKey: c.project,
    label: c.label,
    created_at: c.created_at,
    source: c.source,
  })));
  // 서버 label을 DB label 컬럼에 저장 (custom_label은 건드리지 않음)
  dbSync.syncConversations(convs.map(c => ({
    id: c.id, projectKey: c.project, label: c.label,
    created_at: c.created_at, source: c.source,
  })));
};
