import { useEffect, useMemo, useRef, useState } from 'react';
import { useSystemStore } from '@/store/systemStore';
import { useChatStore, type ChatMessage } from '@/store/chatStore';
import { useContextStore } from '@/store/contextStore';
import { wsClient } from '@/lib/wsClient';
import { MessageView } from '@/components/chat/MessageView';
import { InputArea } from '@/components/chat/InputArea';
import { isTauriEnv } from '@/lib/db';
import {
  X,
  GitFork,
  GitMerge,
  Archive,
} from '@phosphor-icons/react';

const EMPTY_MESSAGES: ChatMessage[] = [];

/** checkpointId에 해당하는 메시지 쌍을 메시지 배열에서 찾아 반환 */
function findCheckpointContext(parentMsgs: ChatMessage[] | undefined, checkpointId: string | undefined): ChatMessage[] {
  if (!checkpointId || !parentMsgs?.length) return [];

  // checkpointId에 해당하는 메시지 찾기
  const cpIdx = parentMsgs.findIndex(m => m.id === checkpointId);
  if (cpIdx < 0) return [];

  const cpMsg = parentMsgs[cpIdx];
  const result: ChatMessage[] = [];

  // checkpoint 메시지가 assistant면 직전 user 메시지도 포함
  if (cpMsg.role === 'assistant') {
    for (let i = cpIdx - 1; i >= 0; i--) {
      if (parentMsgs[i].role === 'user') {
        result.push({ ...parentMsgs[i], id: `ctx-${parentMsgs[i].id}` });
        break;
      }
    }
  }
  // checkpoint 메시지가 user면 직후 assistant 메시지도 포함
  result.push({ ...cpMsg, id: `ctx-${cpMsg.id}` });
  if (cpMsg.role === 'user') {
    for (let i = cpIdx + 1; i < parentMsgs.length; i++) {
      if (parentMsgs[i].role === 'assistant') {
        result.push({ ...parentMsgs[i], id: `ctx-${parentMsgs[i].id}` });
        break;
      }
    }
  }

  return result;
}

export function BranchPanel() {
  const branchId = useSystemStore(s => s.branchPanelBranchId);
  const convId = useSystemStore(s => s.branchPanelConvId);
  const label = useSystemStore(s => s.branchPanelLabel);
  const projectKey = useSystemStore(s => s.branchPanelProjectKey);
  const closeBranchPanel = useSystemStore(s => s.closeBranchPanel);

  const branchChannel = branchId ? `branch:${branchId}` : null;
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // checkpointId: openBranchPanel에서 전달된 값 우선, 없으면 convBranches에서 조회
  const panelCheckpointId = useSystemStore(s => s.branchPanelCheckpointId);
  const storeCheckpointId = useContextStore(s => {
    for (const list of Object.values(s.convBranchesByProject)) {
      const found = list.find(b => b.id === branchId);
      if (found) return found.checkpointId;
    }
    return undefined;
  });
  const checkpointId = panelCheckpointId ?? storeCheckpointId;

  const messagesRaw = useChatStore(s =>
    branchChannel ? s.messages[branchChannel] : undefined,
  );
  // 서버가 주입하는 branch-context 메타 메시지 필터링
  const branchMessages = (messagesRaw ?? EMPTY_MESSAGES).filter(
    m => !m.content.startsWith('<!-- branch-context'),
  );

  // checkpoint 기반 부모 컨텍스트 — DB 우선, Zustand 반응형 폴백
  const [dbParentContext, setDbParentContext] = useState<ChatMessage[]>([]);

  // DB에서 부모 대화 메시지 로드 (1회)
  useEffect(() => {
    if (!convId || !checkpointId) return;
    if (!isTauriEnv()) return;
    let cancelled = false;
    (async () => {
      try {
        const db = await import('@/lib/db');
        const rows = await db.loadMessages(convId);
        if (cancelled) return;
        const msgs: ChatMessage[] = rows.map(r => ({
          id: r.id, role: r.role as 'user' | 'assistant',
          content: r.content, timestamp: r.timestamp,
          status: (r.status as 'done') ?? 'done',
          engine: r.engine, model: r.model, persona: r.persona,
        }));
        setDbParentContext(findCheckpointContext(msgs, checkpointId));
      } catch (err) {
        console.warn('[BranchPanel] DB parent load failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [convId, checkpointId]);

  // Zustand 반응형 폴백 — DB에 데이터가 없거나 비-Tauri 환경일 때
  const storeParentMsgs = useChatStore(s => convId ? s.messages[convId] : undefined);
  const storeParentContext = useMemo(
    () => findCheckpointContext(storeParentMsgs, checkpointId),
    [storeParentMsgs, checkpointId],
  );

  // DB 결과 우선, 없으면 Zustand 폴백
  const parentContext = dbParentContext.length > 0 ? dbParentContext : storeParentContext;

  // Bootstrap: create branch conversation + load history
  useEffect(() => {
    if (!branchChannel || !branchId || !convId || !projectKey) return;
    const chat = useChatStore.getState();

    // 부모 메시지가 Zustand에 없으면 서버에 요청 (Zustand 폴백용)
    if (!chat.messages[convId]?.length && checkpointId) {
      wsClient.sendRpc('conversation.history', { conversation_id: convId });
    }

    if (!chat.conversations[branchChannel]) {
      // Snapshot parent's settings so the branch starts with the same config
      const parent = chat.conversations[convId];
      chat.addConversation({
        id: branchChannel,
        projectKey,
        label: label || branchId,
        type: 'branch',
        parentId: convId,
        engine: parent?.engine,
        model: parent?.model,
        persona: parent?.persona,
        triggerMode: parent?.triggerMode,
        createdAt: Date.now(),
      });
    }

    chat.setActiveBranch(branchId, label || branchId);

    // 로컬에 메시지가 없을 때만 서버에 히스토리 요청
    if (!chat.messages[branchChannel]?.length) {
      wsClient.sendRpc('conversation.history', {
        conversation_id: convId,
        branch_id: branchId,
      });
    }

    // 패널 닫힐 때 activeBranch 정리
    // (다른 브랜치로 전환된 경우에는 null로 초기화하지 않음 → 깜빡임 방지)
    return () => {
      const panelStillMine = useSystemStore.getState().branchPanelBranchId === branchId;
      if (panelStillMine || useSystemStore.getState().branchPanelBranchId === null) {
        const current = useChatStore.getState();
        if (current.activeBranchId === branchId) {
          current.setActiveBranch(null);
        }
      }
    };
  }, [branchChannel, branchId, convId, projectKey, checkpointId]);

  // 부모 컨텍스트 + 브랜치 메시지 합산
  const messages = [...parentContext, ...branchMessages];

  // Auto-scroll on new messages (초기 로드 시 즉시, 이후 smooth)
  const prevMsgCountRef = useRef(0);
  useEffect(() => {
    const prevCount = prevMsgCountRef.current;
    prevMsgCountRef.current = messages.length;
    const behavior = prevCount === 0 && messages.length > 1 ? 'instant' : 'smooth';
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, [messages]);

  // Auto-close when switching to a different main session
  const activeConvId = useChatStore(s => s.activeConversationId);
  useEffect(() => {
    if (activeConvId && convId && activeConvId !== convId && !activeConvId.startsWith('branch:')) {
      closeBranchPanel();
    }
  }, [activeConvId, convId, closeBranchPanel]);
  // adopt/delete로 패널을 닫는 것은 wsClient.ts에서 직접 closeBranchPanel() 호출

  // Listen for branch deletion
  useEffect(() => {
    const handler = (event: CustomEvent) => {
      if (event.detail?.branch_id === branchId) {
        closeBranchPanel();
      }
    };
    window.addEventListener('branch-deleted', handler as EventListener);
    return () => window.removeEventListener('branch-deleted', handler as EventListener);
  }, [branchId, closeBranchPanel]);

  // Grouping (same as ChatArea)
  const isGrouped = (i: number): boolean => {
    if (i === 0) return false;
    const prev = messages[i - 1];
    const cur = messages[i];
    return prev.role === cur.role && cur.timestamp - prev.timestamp < 5 * 60 * 1000;
  };

  return (
    <div className="flex flex-col h-full bg-[#0e0e0e] border-l border-outline-variant/30">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-outline-variant/30 shrink-0">
        <GitFork size={16} className="text-violet-400" weight="bold" />
        <span className="font-medium text-[13px] text-violet-300 truncate flex-1">{label}</span>
        <span className="text-[10px] text-on-surface-variant/30 font-mono">{branchId?.slice(0, 8)}</span>
        <button
          onClick={() => {
            if (!convId || !branchId) return;
            wsClient.sendRpc('branch.adopt', { conversation_id: convId, branch_id: branchId });
          }}
          className="p-1 rounded text-on-surface-variant/40 hover:text-emerald-400 hover:bg-emerald-400/10 transition-colors"
          title="채택 (main에 병합)"
        >
          <GitMerge size={14} />
        </button>
        <button
          onClick={() => {
            if (!convId || !branchId) return;
            wsClient.sendRpc('branch.archive', { conversation_id: convId, branch_id: branchId });
          }}
          className="p-1 rounded text-on-surface-variant/40 hover:text-amber-400 hover:bg-amber-400/10 transition-colors"
          title="보관"
        >
          <Archive size={14} />
        </button>
        <button
          onClick={closeBranchPanel}
          className="p-1 rounded text-on-surface-variant/50 hover:text-on-surface hover:bg-white/5 transition-colors"
          title="Close"
        >
          <X size={14} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto pt-3 pb-40 space-y-0">
        {messagesRaw === undefined ? (
          <div className="flex items-center justify-center h-32 text-[11px] text-on-surface-variant/30">
            Loading...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-[11px] text-on-surface-variant/30">
            브랜치 대화를 시작하세요.
          </div>
        ) : (
          <>
            {/* Parent context messages (dimmed) */}
            {parentContext.length > 0 && (
              <div className="opacity-50">
                {parentContext.map((msg, i) => {
                  const prev = i > 0 ? parentContext[i - 1] : null;
                  const roleSwitch = prev !== null && prev.role !== msg.role;
                  return <MessageView key={msg.id} msg={msg} isGrouped={false} isRoleSwitch={roleSwitch} conversationId={branchChannel ?? undefined} />;
                })}
                <div className="flex items-center gap-2 px-4 py-2 my-1">
                  <div className="flex-1 border-t border-violet-400/20" />
                  <span className="text-[10px] text-violet-400/40 font-mono shrink-0">branch start</span>
                  <div className="flex-1 border-t border-violet-400/20" />
                </div>
              </div>
            )}
            {/* Branch messages */}
            {branchMessages.map((msg, i) => {
              const offset = parentContext.length;
              const globalIdx = offset + i;
              const prev = globalIdx > 0 ? messages[globalIdx - 1] : null;
              const roleSwitch = prev !== null && prev.role !== msg.role;
              let prevAssistantModel: string | undefined;
              if (msg.role === 'assistant') {
                for (let j = globalIdx - 1; j >= 0; j--) {
                  if (messages[j].role === 'assistant' && messages[j].engine) {
                    prevAssistantModel = `${messages[j].engine}/${messages[j].model}`;
                    break;
                  }
                }
              }
              return <MessageView key={msg.id} msg={msg} isGrouped={isGrouped(globalIdx)} isRoleSwitch={roleSwitch} conversationId={branchChannel ?? undefined} prevAssistantModel={prevAssistantModel} />;
            })}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input — scoped to branch channel */}
      <div className="shrink-0">
        <InputArea overrideConversationId={branchChannel ?? undefined} compact />
      </div>
    </div>
  );
}
