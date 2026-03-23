import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { useChatStore, type ChatMessage } from '@/store/chatStore';
import { useSystemStore } from '@/store/systemStore';
import { useContextStore } from '@/store/contextStore';
import { wsClient } from '@/lib/wsClient';
import { contextLoadedConvs } from '@/lib/contextCache';
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

// --- Pre-computed message metadata ---
interface MsgMeta {
  isGrouped: boolean;
  isRoleSwitch: boolean;
  prevAssistantModel: string | undefined;
}

function computeMsgMeta(messages: ChatMessage[]): MsgMeta[] {
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

// --- Main ---

export function ChatArea() {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
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

    // project.context — 이미 로드된 conv는 재요청 생략
    if (!contextLoadedConvs.has(activeConversationId)) {
      wsClient.sendRpc('project.context', {
        conversation_id: activeConversationId,
        project: projectKey,
      });
      contextLoadedConvs.add(activeConversationId);
    }
    // history 요청: 로컬 캐시가 있더라도 서버에서 최신 데이터를 받아옴
    const histParams: Record<string, string> = { conversation_id: activeConversationId };
    const conv = useChatStore.getState().conversations[activeConversationId];
    if (conv?.source && conv.source !== 'tunadish') {
      histParams.source = conv.source;
    }
    wsClient.sendRpc('conversation.history', histParams);
  }, [activeConversationId, projectKey, isMockMode, isConnected]);

  // 메시지 메타데이터 사전 계산 (O(n) 1회, O(n²) → O(n))
  const msgMeta = useMemo(() => computeMsgMeta(messages), [messages]);

  // Virtuoso: 새 메시지/콘텐츠 추가 시 하단 자동 추적
  // Virtuoso가 전달하는 실시간 isAtBottom을 사용 (React state보다 정확)
  const hasStreaming = messages.some(m => m.status === 'streaming');
  const followOutput = useCallback((isAtBottom: boolean) => {
    // 스트리밍 중이면 무조건 따라가기, 아니면 하단에 있을 때만
    if (hasStreaming || isAtBottom) return 'smooth';
    return false;
  }, [hasStreaming]);

  // 세션 전환 시 맨 아래로 즉시 이동
  const [, setAtBottom] = useState(true);
  const prevConvRef = useRef(activeConversationId);
  useEffect(() => {
    if (activeConversationId !== prevConvRef.current) {
      prevConvRef.current = activeConversationId;
      setTimeout(() => {
        virtuosoRef.current?.scrollToIndex({ index: 'LAST', behavior: 'auto' });
      }, 50);
    }
  }, [activeConversationId]);

  // 새 메시지 추가 시 강제 스크롤 (followOutput 백업)
  const prevMsgCountRef = useRef(messages.length);
  useEffect(() => {
    const prevCount = prevMsgCountRef.current;
    prevMsgCountRef.current = messages.length;
    if (messages.length > prevCount) {
      // 새 메시지가 추가되면 항상 하단으로 (사용자가 위로 스크롤하지 않은 경우)
      virtuosoRef.current?.scrollToIndex({ index: 'LAST', behavior: 'smooth' });
    }
  }, [messages.length]);

  // itemContent: useCallback 제거 — messages/msgMeta 변경 시 Virtuoso가 항상 최신 데이터로 렌더링하도록
  const itemContent = (index: number) => {
    const msg = messages[index];
    const meta = msgMeta[index];
    if (!msg || !meta) return null;
    return (
      <MessageView
        msg={msg}
        isGrouped={meta.isGrouped}
        isRoleSwitch={meta.isRoleSwitch}
        prevAssistantModel={meta.prevAssistantModel}
      />
    );
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-[#0e0e0e] relative h-full">
      <ActionToast />
      <div className="flex-1 relative overflow-hidden flex flex-col">
        {!activeConversationId || messages.length === 0 ? (
          <EmptyState />
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            data={messages}
            itemContent={itemContent}
            followOutput={followOutput}
            atBottomStateChange={setAtBottom}
            atBottomThreshold={150}
            initialTopMostItemIndex={messages.length - 1}
            overscan={600}
            increaseViewportBy={{ top: 400, bottom: 400 }}
            className="flex-1"
            style={{ height: '100%' }}
            components={{
              Header: () => <div className="pt-4" />,
              Footer: () => <div className="pb-52" />,
            }}
          />
        )}
        <InputArea />
      </div>
      <StatusStrip />
    </div>
  );
}
