import type { NotificationHandler } from './types';

export const messageNew: NotificationHandler = (params, deps) => {
  const { chat, run, dbSync } = deps;
  const ref = params.ref as { channel_id: string; message_id: string };
  const msgMeta = {
    engine: params.engine as string | undefined,
    model: params.model as string | undefined,
    persona: params.persona as string | undefined,
  };
  chat.addMessage(ref, params.message as { text: string }, msgMeta);
  dbSync.syncMessage({
    id: ref.message_id, conversationId: ref.channel_id, role: 'assistant',
    content: (params.message as { text: string }).text, timestamp: Date.now(),
    status: 'streaming', ...msgMeta,
  });
  // active run이 없는 채널의 메시지는 즉시 done 처리 (브랜치 context summary 등)
  const channelRun = run.activeRuns[ref.channel_id];
  if (!channelRun || channelRun === 'idle') {
    chat.finalizeStreamingMessages(ref.channel_id);
    dbSync.syncFinalizeMessages(ref.channel_id);
  }
};

export const messageUpdate: NotificationHandler = (params, deps) => {
  const { chat, dbSync } = deps;
  const updRef = params.ref as { channel_id: string; message_id: string };
  const updMeta = {
    engine: params.engine as string | undefined,
    model: params.model as string | undefined,
    persona: params.persona as string | undefined,
  };
  chat.updateMessage(updRef, params.message as { text: string }, updMeta);
  dbSync.syncMessageUpdate(updRef.channel_id, updRef.message_id, (params.message as { text: string }).text, updMeta);
};

export const messageDelete: NotificationHandler = (params, deps) => {
  const { chat, dbSync } = deps;
  const delRef = params.ref as { channel_id: string; message_id: string };
  chat.deleteMessage(delRef);
  dbSync.syncMessageDelete(delRef.channel_id, delRef.message_id);
};
