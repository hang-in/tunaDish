import { useRef, useEffect } from 'react';
import { useChatStore, type ChatMessage } from '@/store/chatStore';
import { useSystemStore } from '@/store/systemStore';
import { useContextStore } from '@/store/contextStore';
import { wsClient } from '@/lib/wsClient';
import { Robot } from '@phosphor-icons/react';
import { MessageView } from '@/components/chat/MessageView';
import { InputArea } from '@/components/chat/InputArea';
import { ActionToast } from '@/components/chat/ActionToast';
const EMPTY_MESSAGES: ChatMessage[] = [];

// --- Empty ---
function EmptyState() {
  const conv = useChatStore(s =>
    s.activeConversationId ? s.conversations[s.activeConversationId] : null
  );
  const isConnected = useSystemStore(s => s.isConnected);

  if (!isConnected) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-[240px] space-y-2">
          <div className="size-2 rounded-full bg-on-surface-variant/20 mx-auto mb-3" />
          <div className="text-[13px] font-medium text-on-surface-variant/50">서버에 연결할 수 없습니다</div>
          <p className="text-[11px] text-on-surface-variant/30 leading-relaxed">
            tunapi 서버가 실행 중인지 확인하세요
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-[260px] space-y-3">
        {!conv ? (
          <>
            <div className="text-[14px] font-semibold text-foreground/70">tunaDish</div>
            <p className="text-[12px] text-muted-foreground/40 leading-relaxed">
              Select a project from the sidebar to start working with AI agents.
            </p>
          </>
        ) : (
          <p className="text-[12px] text-muted-foreground/30">
            {conv.type === 'discussion' ? 'Send a prompt to begin the discussion.' : 'Type a message to start the agent.'}
          </p>
        )}
      </div>
    </div>
  );
}

// --- Status Strip ---
function StatusStrip() {
  const progress = useContextStore(s => s.progress);
  const toggleContextPanel = useSystemStore(s => s.toggleContextPanel);

  if (!progress) return null;

  const lastAction = progress.actions[progress.actions.length - 1];
  const actionIcon = lastAction
    ? lastAction.phase === 'started' ? '⏳'
    : lastAction.ok === false ? '✗' : '✓'
    : null;

  return (
    <div
      onClick={toggleContextPanel}
      className="h-7 bg-surface-container-high border-t border-outline-variant/20 flex items-center px-4 gap-3 text-[11px] text-on-surface-variant/60 cursor-pointer hover:bg-white/3 transition-colors shrink-0"
    >
      <span className="flex items-center gap-1.5">
        <Robot size={12} className="text-primary" />
        <span className="font-medium">{progress.engine}/{progress.model}</span>
      </span>
      <span className="text-on-surface-variant/30">·</span>
      <span>step {progress.step}{progress.totalSteps ? `/${progress.totalSteps}` : '/?'}</span>
      <span className="text-on-surface-variant/30">·</span>
      <span>{progress.elapsed}s</span>
      {lastAction && (
        <>
          <span className="text-on-surface-variant/30">·</span>
          <span className="flex items-center gap-1 truncate">
            <span>{actionIcon}</span>
            <span className="font-mono truncate">{lastAction.tool}{lastAction.args ? ` ${lastAction.args}` : ''}</span>
          </span>
        </>
      )}
    </div>
  );
}

// --- Main ---
export function ChatArea() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeConversationId = useChatStore(s => s.activeConversationId);
  const isMockMode = useChatStore(s => s.isMockMode);
  const messagesRaw = useChatStore(s =>
    s.activeConversationId ? s.messages[s.activeConversationId] : undefined
  );
  const messages = messagesRaw ?? EMPTY_MESSAGES;
  const isConnected = useSystemStore(s => s.isConnected);

  const activeConv = useChatStore(s =>
    s.activeConversationId ? s.conversations[s.activeConversationId] : null
  );

  // 세션 선택 시 history 로드 + project.context 요청
  const projectKey = activeConv?.projectKey;
  useEffect(() => {
    if (!activeConversationId || !projectKey || isMockMode || !isConnected) return;

    // project.context 항상 요청 (AgentInfoStrip에 engine/model/token 표시용)
    wsClient.sendRpc('project.context', {
      conversation_id: activeConversationId,
      project: projectKey,
    });
    // history는 아직 로드 안 된 경우만
    if (messagesRaw === undefined) {
      const histParams: Record<string, string> = { conversation_id: activeConversationId };
      const conv = useChatStore.getState().conversations[activeConversationId];
      if (conv?.source && conv.source !== 'tunadish') {
        histParams.source = conv.source;
      }
      wsClient.sendRpc('conversation.history', histParams);
    }
  }, [activeConversationId, projectKey, isMockMode, isConnected]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Mattermost-style grouping: same role within 5 minutes = grouped
  const isGrouped = (i: number): boolean => {
    if (i === 0) return false;
    const prev = messages[i - 1];
    const cur = messages[i];
    return (
      prev.role === cur.role &&
      cur.timestamp - prev.timestamp < 5 * 60 * 1000
    );
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-[#0e0e0e] relative h-full">
      <ActionToast />
      <div className="flex-1 relative overflow-hidden flex flex-col">
        {!activeConversationId || messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex-1 overflow-y-auto pt-4 pb-52 space-y-0 scroll-smooth">
            {messages.map((msg, i) => {
              const prev = i > 0 ? messages[i - 1] : null;
              const roleSwitch = prev !== null && prev.role !== msg.role;
              return <MessageView key={msg.id} msg={msg} isGrouped={isGrouped(i)} isRoleSwitch={roleSwitch} />;
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
        <InputArea />
      </div>
      <StatusStrip />
    </div>
  );
}
