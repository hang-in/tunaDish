import type { NotificationHandler } from './types';

export const commandResult: NotificationHandler = (params, deps) => {
  const { chat, dbSync, contextLoadedConvs, sendRpc } = deps;
  const convId = params.conversation_id as string;
  const text = params.text as string;
  if (convId && convId !== '__rpc__') {
    chat.pushMessage(convId, {
      id: `cmd-${Date.now()}`,
      role: 'assistant',
      content: text,
      timestamp: Date.now(),
      status: 'done',
    });
    // 서버가 settings를 포함하면 conversation-level 설정 확정 (optimistic update 보정)
    const settings = (params as Record<string, unknown>).settings as
      { engine?: string; model?: string; persona?: string; trigger_mode?: string } | undefined;
    if (settings) {
      const convSettings: Record<string, string | undefined> = {};
      if (settings.engine !== undefined) convSettings.engine = settings.engine;
      if (settings.model !== undefined) convSettings.model = settings.model;
      if (settings.persona !== undefined) convSettings.persona = settings.persona;
      if (settings.trigger_mode !== undefined) convSettings.triggerMode = settings.trigger_mode;
      if (Object.keys(convSettings).length > 0) {
        chat.updateConvSettings(convId, convSettings);
        dbSync.syncConvSettings(convId, convSettings);
      }
    }
    // command(model.set, trigger.set 등)로 context가 바뀔 수 있으므로 캐시 무효화 + 재요청
    contextLoadedConvs.delete(convId);
    const conv = chat.conversations[convId];
    if (conv?.projectKey) {
      sendRpc('project.context', {
        conversation_id: convId,
        project: conv.projectKey,
      });
      // 메모 저장은 서버에서 비동기 처리 → 딜레이 후 project.context 재요청
      setTimeout(() => {
        sendRpc('project.context', {
          conversation_id: convId,
          project: conv.projectKey,
        });
      }, 2000);
      contextLoadedConvs.add(convId);
    }
  }
};
