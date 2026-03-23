import { useState, useCallback } from 'react';
import { useChatStore } from '@/store/chatStore';
import { useContextStore, type MemoryEntry } from '@/store/contextStore';
import { wsClient } from '@/lib/wsClient';
import * as dbSync from '@/lib/dbSync';
import { showToast } from '@/components/chat/ActionToast';

/**
 * 현재 활성 브랜치를 기준으로 새 브랜치 이름을 계산합니다.
 * - 메인에서 생성: b1, b2, b3 ...
 * - b1에서 생성: b1.1, b1.2 ...
 * - b1.1에서 생성: b1.1.1, b1.1.2 ...
 */
function computeBranchLabel(activeBranchId: string | null): string {
  const allBranches = Object.values(useContextStore.getState().convBranchesByProject).flat();
  const parentLabel = activeBranchId
    ? allBranches.find(b => b.id === activeBranchId)?.label ?? null
    : null;
  const siblingCount = allBranches.filter(b => b.parentBranchId === (activeBranchId ?? undefined)).length;
  const n = siblingCount + 1;
  return parentLabel ? `${parentLabel}.${n}` : `b${n}`;
}

interface UseMessageActionsParams {
  role: string;
  messageId: string;
  content: string;
  conversationId?: string;
}

export function useMessageActions({ role, messageId, content, conversationId }: UseMessageActionsParams) {
  const storeConvId = useChatStore(s => s.activeConversationId);
  const activeConvId = conversationId ?? storeConvId;
  const conversations = useChatStore(s => s.conversations);
  const activeBranchId = useChatStore(s => s.activeBranchId);
  const setReplyTo = useChatStore(s => s.setReplyTo);
  const setEditingMsg = useChatStore(s => s.setEditingMsg);
  const removeMessage = useChatStore(s => s.removeMessage);

  const [branchDialogOpen, setBranchDialogOpen] = useState(false);
  const [branchDefaultLabel, setBranchDefaultLabel] = useState('');

  // branch: 채널이면 부모 conv_id로 resolve (백엔드 RPC용)
  const resolvedConvId = activeConvId?.startsWith('branch:')
    ? conversations[activeConvId]?.parentId ?? activeConvId
    : activeConvId;

  const isAssistant = role === 'assistant';
  const isUser = role === 'user';
  const isBranch = !!activeConvId?.startsWith('branch:');

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content);
    showToast('Copied');
  }, [content]);

  const handleCopyAsText = useCallback(() => {
    const plain = content.replace(/[*_~`#>\[\]()!]/g, '').replace(/\n{3,}/g, '\n\n');
    navigator.clipboard.writeText(plain);
    showToast('Copied as text');
  }, [content]);

  const handleReply = useCallback(() => {
    const snippet = content.length > 120 ? content.slice(0, 120) + '...' : content;
    setReplyTo(messageId, snippet);
  }, [content, messageId, setReplyTo]);

  const handleEdit = useCallback(() => {
    setEditingMsg(messageId);
  }, [messageId, setEditingMsg]);

  const handleDelete = useCallback(() => {
    if (!activeConvId) return;
    removeMessage(activeConvId, messageId);
    wsClient.sendRpc('message.delete', { conversation_id: resolvedConvId ?? activeConvId, message_id: messageId });
    dbSync.syncMessageDelete(activeConvId, messageId);
  }, [activeConvId, resolvedConvId, messageId, removeMessage]);

  const handleRetry = useCallback(() => {
    if (!resolvedConvId) return;
    wsClient.sendRpc('message.retry', { conversation_id: resolvedConvId, message_id: messageId });
  }, [resolvedConvId, messageId]);

  const handleSave = useCallback(() => {
    if (!resolvedConvId) return;
    const ctxState = useContextStore.getState();
    const alreadySaved = ctxState.savedMessageIds.has(messageId);
    if (alreadySaved) {
      // 토글: 이미 저장됨 → 삭제
      const entry = ctxState.memoryEntries.find(e => e.source === `msg:${messageId}`);
      if (entry) {
        ctxState.removeMemoryEntry(entry.id);
        dbSync.syncDeleteMemo(entry.id);
      }
      ctxState.unmarkMessageSaved(messageId);
      dbSync.syncDeleteMemoByMessageId(messageId);
      showToast('Removed from memory');
    } else {
      // 새로 저장
      const projectKey = useChatStore.getState().activeProjectKey ?? '';
      const memoId = crypto.randomUUID();
      const firstLine = (content || '').split('\n')[0].trim();
      const title = firstLine.length > 10 ? firstLine.slice(0, 10) + '\u2026' : firstLine;
      const entry: MemoryEntry = {
        id: memoId,
        type: 'context',
        title,
        content,
        source: `msg:${messageId}`,
        tags: [],
        timestamp: Date.now(),
      };
      ctxState.setMemoryEntries([...ctxState.memoryEntries, entry]);
      ctxState.markMessageSaved(messageId);
      dbSync.syncMemo({
        id: memoId, messageId, conversationId: resolvedConvId,
        projectKey, content, type: 'context',
      });
      showToast('Saved to memory');
    }
  }, [resolvedConvId, messageId, content]);

  const handleBranch = useCallback(() => {
    if (!resolvedConvId) return;
    setBranchDefaultLabel(computeBranchLabel(activeBranchId));
    setBranchDialogOpen(true);
  }, [resolvedConvId, activeBranchId]);

  const handleAdopt = useCallback(() => {
    if (!resolvedConvId) return;
    wsClient.sendRpc('message.adopt', { conversation_id: resolvedConvId, message_id: messageId });
    showToast('Adopted');
  }, [resolvedConvId, messageId]);

  const handleBranchConfirm = useCallback((label: string) => {
    if (!resolvedConvId) { setBranchDialogOpen(false); return; }
    const parentBranchId = activeConvId?.startsWith('branch:')
      ? activeBranchId ?? null
      : null;
    wsClient.sendRpc('branch.create', {
      conversation_id: resolvedConvId,
      checkpoint_id: messageId,
      label,
      parent_branch_id: parentBranchId,
    });
    setBranchDialogOpen(false);
  }, [resolvedConvId, activeConvId, activeBranchId, messageId]);

  return {
    resolvedConvId: resolvedConvId ?? null,
    activeConvId,
    isAssistant,
    isUser,
    isBranch,
    handleCopy,
    handleCopyAsText,
    handleReply,
    handleEdit,
    handleDelete,
    handleRetry,
    handleSave,
    handleBranch,
    handleAdopt,
    branchDialogOpen,
    setBranchDialogOpen,
    branchDefaultLabel,
    handleBranchConfirm,
  };
}
