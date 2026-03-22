import { useEffect } from 'react';
import { useSystemStore } from '@/store/systemStore';
import { useChatStore, type ChatMessage } from '@/store/chatStore';
import { wsClient } from '@/lib/wsClient';
import { BottomSheet } from './BottomSheet';
import { MessageView } from '@/components/chat/MessageView';
import { InputArea } from '@/components/chat/InputArea';
import { GitFork, GitMerge, Archive } from '@phosphor-icons/react';

const EMPTY_MESSAGES: ChatMessage[] = [];

export function MobileBranchSheet() {
  const open = useSystemStore(s => s.branchPanelOpen);
  const branchId = useSystemStore(s => s.branchPanelBranchId);
  const convId = useSystemStore(s => s.branchPanelConvId);
  const label = useSystemStore(s => s.branchPanelLabel);
  const close = useSystemStore(s => s.closeBranchPanel);

  const branchChannel = branchId ? `branch:${branchId}` : null;

  const messages = useChatStore(s => {
    if (!branchChannel) return EMPTY_MESSAGES;
    return (s.messages[branchChannel] ?? EMPTY_MESSAGES).filter(
      m => !m.content.startsWith('<!-- branch-context'),
    );
  });

  // 브랜치 히스토리 로드 (메시지가 없을 때만 요청)
  useEffect(() => {
    if (!branchChannel || !branchId || !convId) return;
    const chat = useChatStore.getState();
    if (!chat.messages[branchChannel]?.length) {
      wsClient.sendRpc('conversation.history', {
        conversation_id: convId,
        branch_id: branchId,
      });
    }
  }, [branchChannel, branchId, convId]);

  const handleAdopt = () => {
    if (!convId || !branchId) return;
    wsClient.sendRpc('branch.adopt', { conversation_id: convId, branch_id: branchId });
  };

  const handleArchive = () => {
    if (!convId || !branchId) return;
    wsClient.sendRpc('branch.archive', { conversation_id: convId, branch_id: branchId });
    close();
  };

  return (
    <BottomSheet open={open} onClose={close} snapPoints={[0.5, 0.75]}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-outline-variant/30 shrink-0">
        <GitFork size={16} className="text-violet-400 shrink-0" />
        <span className="font-medium text-[13px] text-violet-300 truncate flex-1">{label || 'Branch'}</span>
        <button onClick={handleAdopt} className="min-w-[44px] min-h-[44px] flex items-center justify-center text-on-surface-variant/60 active:bg-white/5 rounded-lg">
          <GitMerge size={16} />
        </button>
        <button onClick={handleArchive} className="min-w-[44px] min-h-[44px] flex items-center justify-center text-on-surface-variant/60 active:bg-white/5 rounded-lg">
          <Archive size={16} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto" data-bottom-sheet-scroll>
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-[11px] text-on-surface-variant/30">
            브랜치 대화를 시작하세요.
          </div>
        ) : messages.map((msg, i) => {
          const prev = i > 0 ? messages[i - 1] : null;
          const isGrouped = !!prev && prev.role === msg.role;
          const isRoleSwitch = !!prev && prev.role !== msg.role;
          return (
            <MessageView
              key={msg.id}
              msg={msg}
              isGrouped={isGrouped}
              isRoleSwitch={isRoleSwitch}
              conversationId={branchChannel ?? undefined}
            />
          );
        })}
      </div>

      {/* Branch Input */}
      {branchChannel && (
        <div className="shrink-0 border-t border-outline-variant/30">
          <InputArea overrideConversationId={branchChannel} compact />
        </div>
      )}
    </BottomSheet>
  );
}
