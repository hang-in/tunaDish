import type { NotificationHandler } from './types';

/** Create a Phase 4 RPC result handler for a specific method */
export function createPhaseRpcHandler(method: string): NotificationHandler {
  return (params, deps) => {
    const ctxStore = deps.ctxStore.getState();
    ctxStore.setLastRpcResult({
      method,
      ok: !params.error,
      data: params as Record<string, unknown>,
    });
  };
}

export const messageDeleted: NotificationHandler = (params, deps) => {
  const { chat } = deps;
  const convId = params.conversation_id as string;
  const msgId = params.message_id as string;
  if (convId && msgId) {
    chat.removeMessage(convId, msgId);
  }
};

export const messageActionResult: NotificationHandler = (_params, _deps) => {
  // TODO: toast/snackbar for save/adopt confirmation
};
