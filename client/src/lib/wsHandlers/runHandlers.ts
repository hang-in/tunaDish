import type { NotificationHandler, RunStatus } from './types';

export const runStatus: NotificationHandler = (params, deps) => {
  const { chat, run, dbSync, sendRpc } = deps;
  const convId = params.conversation_id as string;
  const branchId = params.branch_id as string | undefined;
  const status = params.status as RunStatus;
  // 브랜치 실행이면 branch:${branchId} 키에도 상태 반영
  const channelId = branchId ? `branch:${branchId}` : convId;
  run.setRunStatus(convId, status);
  if (branchId) run.setRunStatus(channelId, status);
  // 실행 완료 시 streaming 메시지를 finalize + 메모 리스트 갱신
  if (status === 'idle') {
    chat.finalizeStreamingMessages(convId);
    dbSync.syncFinalizeMessages(convId);
    if (branchId) {
      chat.finalizeStreamingMessages(channelId);
      dbSync.syncFinalizeMessages(channelId);
    }
    // 메모 저장이 완료되었을 수 있으므로 딜레이 후 context 재요청
    const conv = chat.conversations[convId];
    if (conv?.projectKey) {
      setTimeout(() => {
        sendRpc('project.context', { conversation_id: convId, project: conv.projectKey });
      }, 2000);
    }
  }
};
