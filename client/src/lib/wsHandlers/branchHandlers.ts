import type { NotificationHandler } from './types';

export const branchCreated: NotificationHandler = (params, deps) => {
  const { chat, sysStore, dbSync, sendRpc, getPendingBranchCheckpoint, setPendingBranchCheckpoint } = deps;
  const branchId = params.branch_id as string;
  const label = params.label as string;
  const convId = params.conversation_id as string;
  const checkpointId = getPendingBranchCheckpoint();
  setPendingBranchCheckpoint(null);
  chat.setActiveBranch(branchId, label);
  // Open branch in slide panel with checkpoint context
  const createdConv = chat.conversations[convId];
  const createdProjectKey = createdConv?.projectKey ?? '';
  sysStore.getState().openBranchPanel(branchId, convId, label, createdProjectKey, checkpointId ?? undefined);
  dbSync.syncBranch({ id: branchId, conversationId: convId, label, checkpointId: checkpointId ?? undefined, sessionId: convId });
  // Refresh branch list
  if (convId && createdProjectKey) {
    sendRpc('project.context', { conversation_id: convId, project: createdProjectKey });
  }
};

export const branchSwitched: NotificationHandler = (params, deps) => {
  const { chat } = deps;
  const branchId = params.branch_id as string | null;
  chat.setActiveBranch(branchId);
};

export const branchAdopted: NotificationHandler = (params, deps) => {
  const { chat, sysStore, dbSync, sendRpc } = deps;
  const branchId = params.branch_id as string;
  const convId = params.conversation_id as string;
  chat.setActiveBranch(null);
  dbSync.syncBranchStatus(branchId, 'adopted');
  // Close branch panel on adopt
  if (sysStore.getState().branchPanelBranchId === branchId) {
    sysStore.getState().closeBranchPanel();
  }
  // Refresh context
  if (convId) {
    const conv = chat.conversations[convId];
    if (conv?.projectKey) {
      sendRpc('project.context', { conversation_id: convId, project: conv.projectKey });
    }
  }
};

export const branchArchived: NotificationHandler = (params, deps) => {
  const { chat, sysStore, dbSync } = deps;
  const branchId = params.branch_id as string;
  if (chat.activeBranchId === branchId) {
    chat.setActiveBranch(null);
  }
  dbSync.syncBranchStatus(branchId, 'archived');
  // Close branch panel if viewing this branch
  const sys = sysStore.getState();
  if (sys.branchPanelBranchId === branchId) {
    sys.closeBranchPanel();
  }
};

export const branchDeleted: NotificationHandler = (params, deps) => {
  const { chat, ctxStore, sysStore, dbSync } = deps;
  const branchId = params.branch_id as string;
  if (chat.activeBranchId === branchId) {
    chat.setActiveBranch(null);
  }
  ctxStore.getState().removeConvBranch(branchId);
  chat.clearMessages(`branch:${branchId}`);
  dbSync.syncDeleteBranch(branchId);
  // Close branch panel if viewing this branch
  const sysState = sysStore.getState();
  if (sysState.branchPanelBranchId === branchId) {
    sysState.closeBranchPanel();
  }
};
