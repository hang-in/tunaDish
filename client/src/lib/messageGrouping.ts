import type { ChatMessage } from '@/store/chatStore';

/** Pre-computed message metadata for rendering */
export interface MsgMeta {
  isGrouped: boolean;
  isRoleSwitch: boolean;
  prevAssistantModel: string | undefined;
}

/**
 * Compute per-message metadata (grouping, role switch, previous assistant model)
 * in a single O(n) pass.
 */
export function computeMsgMeta(messages: ChatMessage[]): MsgMeta[] {
  const meta: MsgMeta[] = [];
  let lastAssistantModel: string | undefined;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const prev = i > 0 ? messages[i - 1] : null;

    const isGrouped = prev !== null &&
      prev.role === msg.role &&
      msg.timestamp - prev.timestamp < 5 * 60 * 1000;

    const isRoleSwitch = prev !== null && prev.role !== msg.role;

    meta.push({
      isGrouped,
      isRoleSwitch,
      prevAssistantModel: msg.role === 'assistant' ? lastAssistantModel : undefined,
    });

    if (msg.role === 'assistant' && msg.engine) {
      lastAssistantModel = `${msg.engine}/${msg.model}`;
    }
  }

  return meta;
}
