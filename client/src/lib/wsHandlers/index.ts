import type { NotificationHandler, HandlerDeps } from './types';
export type { NotificationHandler, HandlerDeps };

import { messageNew, messageUpdate, messageDelete } from './messageHandlers';
import { runStatus } from './runHandlers';
import {
  conversationCreated, conversationDeleted,
  conversationHistoryResult, conversationListResult,
} from './conversationHandlers';
import {
  branchCreated, branchSwitched, branchAdopted,
  branchArchived, branchDeleted,
} from './branchHandlers';
import {
  projectListResult, projectContextResult,
  branchListJsonResult, memoryListJsonResult,
  engineListResult, reviewListJsonResult,
} from './contextHandlers';
import { commandResult } from './commandHandlers';
import { codeSearchResult, codeMapResult } from './codeHandlers';
import { createPhaseRpcHandler, messageDeleted, messageActionResult } from './phaseHandlers';

const handlerMap: Record<string, NotificationHandler> = {
  // Message
  'message.new': messageNew,
  'message.update': messageUpdate,
  'message.delete': messageDelete,

  // Run
  'run.status': runStatus,

  // Conversation
  'conversation.created': conversationCreated,
  'conversation.create.result': conversationCreated,
  'conversation.deleted': conversationDeleted,
  'conversation.delete.result': conversationDeleted,
  'conversation.history.result': conversationHistoryResult,
  'conversation.list.result': conversationListResult,

  // Branch
  'branch.created': branchCreated,
  'branch.switched': branchSwitched,
  'branch.switch.result': branchSwitched,
  'branch.adopted': branchAdopted,
  'branch.adopt.result': branchAdopted,
  'branch.archived': branchArchived,
  'branch.archive.result': branchArchived,
  'branch.deleted': branchDeleted,
  'branch.delete.result': branchDeleted,

  // Context panel
  'project.list.result': projectListResult,
  'project.context.result': projectContextResult,
  'branch.list.json.result': branchListJsonResult,
  'memory.list.json.result': memoryListJsonResult,
  'engine.list.result': engineListResult,
  'review.list.json.result': reviewListJsonResult,

  // Command
  'command.result': commandResult,

  // Code
  'code.search.result': codeSearchResult,
  'code.map.result': codeMapResult,

  // Phase 4 RPC results
  'discussion.save_roundtable.result': createPhaseRpcHandler('discussion.save_roundtable.result'),
  'discussion.link_branch.result': createPhaseRpcHandler('discussion.link_branch.result'),
  'synthesis.create.result': createPhaseRpcHandler('synthesis.create.result'),
  'review.request.result': createPhaseRpcHandler('review.request.result'),
  'handoff.create.result': createPhaseRpcHandler('handoff.create.result'),
  'handoff.parse.result': createPhaseRpcHandler('handoff.parse.result'),

  // Message actions
  'message.deleted': messageDeleted,
  'message.action.result': messageActionResult,
};

export function dispatchNotification(
  method: string,
  params: Record<string, unknown>,
  deps: HandlerDeps,
): void {
  const handler = handlerMap[method];
  if (handler) {
    handler(params, deps);
  }
}
