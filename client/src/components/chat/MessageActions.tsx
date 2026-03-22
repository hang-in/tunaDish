import React, { useState, useRef, useEffect } from 'react';
import { useChatStore } from '@/store/chatStore';
import { wsClient } from '@/lib/wsClient';
import * as dbSync from '@/lib/dbSync';
import { cn } from '@/lib/utils';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  CheckCircle,
  ArrowClockwise,
  BookmarkSimple,
  ArrowBendUpLeft,
  DotsThree,
  Copy,
  PencilSimple,
  TextT,
  Trash,
  GitFork,
} from '@phosphor-icons/react';
import { showToast } from './ActionToast';

// --- Message Actions (hover action bar) ---
export function MessageActions({ role, messageId, content, conversationId }: { role: 'user' | 'assistant'; messageId: string; content: string; conversationId?: string }) {
  const isAssistant = role === 'assistant';
  const isUser = role === 'user';
  const storeConvId = useChatStore(s => s.activeConversationId);
  const activeConvId = conversationId ?? storeConvId;
  const conversations = useChatStore(s => s.conversations);
  const activeBranchId = useChatStore(s => s.activeBranchId);
  const setReplyTo = useChatStore(s => s.setReplyTo);
  const setEditingMsg = useChatStore(s => s.setEditingMsg);
  const removeMessage = useChatStore(s => s.removeMessage);
  const [moreOpen, setMoreOpen] = useState(false);

  // branch: 채널이면 부모 conv_id로 resolve (백엔드 RPC용)
  const resolvedConvId = activeConvId?.startsWith('branch:')
    ? conversations[activeConvId]?.parentId ?? activeConvId
    : activeConvId;

  const handleAdopt = () => {
    if (!resolvedConvId) return;
    wsClient.sendRpc('message.adopt', { conversation_id: resolvedConvId, message_id: messageId });
    showToast('Adopted');
  };
  const handleRetry = () => {
    if (!resolvedConvId) return;
    wsClient.sendRpc('message.retry', { conversation_id: resolvedConvId, message_id: messageId });
  };
  const handleBranch = () => {
    if (!resolvedConvId) return;
    wsClient.sendRpc('branch.create', { conversation_id: resolvedConvId, checkpoint_id: messageId });
  };
  const handleSave = () => {
    if (!resolvedConvId) return;
    wsClient.sendRpc('message.save', { conversation_id: resolvedConvId, message_id: messageId, content });
    showToast('Saved to memory');
  };
  const handleReply = () => {
    const snippet = content.length > 120 ? content.slice(0, 120) + '...' : content;
    setReplyTo(messageId, snippet);
  };
  const handleCopyMessage = () => {
    navigator.clipboard.writeText(content);
    setMoreOpen(false);
    showToast('Copied');
  };
  const handleCopyAsText = () => {
    const plain = content.replace(/[*_~`#>\[\]()!]/g, '').replace(/\n{3,}/g, '\n\n');
    navigator.clipboard.writeText(plain);
    setMoreOpen(false);
    showToast('Copied as text');
  };
  const handleEdit = () => {
    setEditingMsg(messageId);
    setMoreOpen(false);
  };
  const handleDelete = () => {
    if (!activeConvId) return;
    removeMessage(activeConvId, messageId);
    wsClient.sendRpc('message.delete', { conversation_id: resolvedConvId ?? activeConvId, message_id: messageId });
    dbSync.syncMessageDelete(activeConvId, messageId);
    setMoreOpen(false);
  };

  const btnClass = 'p-1 rounded-full hover:bg-white/10 text-on-surface-variant/60 transition-colors';

  return (
    <div
      className={cn(
        'absolute top-1 right-2 flex items-center gap-0.5 px-1 py-0.5 rounded-full',
        'bg-[#1a1a1a]/95 border border-white/10 shadow-lg z-20',
        'transition-all duration-150 ease-out',
        moreOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100',
      )}
    >
      {isAssistant && !!activeBranchId && (
        <button onClick={handleAdopt} className={cn(btnClass, 'hover:text-emerald-400')} title="Adopt">
          <CheckCircle size={16} weight="bold" />
        </button>
      )}
      {isAssistant && (
        <button onClick={handleRetry} className={cn(btnClass, 'hover:text-amber-400')} title="Retry">
          <ArrowClockwise size={16} weight="bold" />
        </button>
      )}
      <button onClick={handleBranch} className={cn(btnClass, 'hover:text-violet-400')} title="Branch from here">
        <GitFork size={16} weight="bold" />
      </button>
      <button onClick={handleSave} className={cn(btnClass, 'hover:text-blue-400')} title="Save">
        <BookmarkSimple size={16} weight="bold" />
      </button>
      <button onClick={handleReply} className={cn(btnClass, 'hover:text-violet-400')} title="Reply">
        <ArrowBendUpLeft size={16} weight="bold" />
      </button>

      {/* More dropdown */}
      <Popover open={moreOpen} onOpenChange={setMoreOpen}>
        <PopoverTrigger
          className={cn(btnClass, moreOpen ? 'text-on-surface bg-white/10' : 'hover:text-on-surface')}
          title="More"
        >
          <DotsThree size={16} weight="bold" />
        </PopoverTrigger>
        <PopoverContent align="end" side="bottom" sideOffset={6} className="w-40 p-1">
          <button onClick={handleCopyMessage} className="w-full flex items-center gap-2 px-2 py-1 rounded text-[11px] text-on-surface-variant hover:bg-white/5 transition-colors">
            <Copy size={14} /> 메시지 복사
          </button>
          <button onClick={handleCopyAsText} className="w-full flex items-center gap-2 px-2 py-1 rounded text-[11px] text-on-surface-variant hover:bg-white/5 transition-colors">
            <TextT size={14} /> 텍스트로 복사
          </button>
          {isUser && (
            <button onClick={handleEdit} className="w-full flex items-center gap-2 px-2 py-1 rounded text-[11px] text-on-surface-variant hover:bg-white/5 transition-colors">
              <PencilSimple size={14} /> 편집
            </button>
          )}
          <div className="my-0.5 border-t border-white/5" />
          <button onClick={handleDelete} className="w-full flex items-center gap-2 px-2 py-1 rounded text-[11px] text-red-400/80 hover:bg-red-500/10 hover:text-red-400 transition-colors">
            <Trash size={14} /> 삭제
          </button>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// --- Mobile Context Menu (long-press) ---
export function MobileContextMenu({ open, onClose, role, messageId, content, conversationId }: {
  open: boolean;
  onClose: () => void;
  role: 'user' | 'assistant';
  messageId: string;
  content: string;
  conversationId?: string;
}) {
  const isAssistant = role === 'assistant';
  const isUser = role === 'user';
  const storeConvId = useChatStore(s => s.activeConversationId);
  const activeConvId = conversationId ?? storeConvId;
  const conversations = useChatStore(s => s.conversations);
  const activeBranchId = useChatStore(s => s.activeBranchId);
  const setReplyTo = useChatStore(s => s.setReplyTo);
  const setEditingMsg = useChatStore(s => s.setEditingMsg);
  const removeMessage = useChatStore(s => s.removeMessage);

  const resolvedConvId = activeConvId?.startsWith('branch:')
    ? conversations[activeConvId]?.parentId ?? activeConvId
    : activeConvId;

  if (!open) return null;

  const handleAction = (fn: () => void) => {
    fn();
    onClose();
  };

  const menuItemClass = 'w-full flex items-center gap-3 px-4 min-h-[44px] text-[13px] text-on-surface-variant active:bg-white/5 transition-colors';

  return (
    <div className="fixed inset-0 z-[70]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="absolute bottom-0 left-0 right-0 bg-[#1a1a1a] rounded-t-2xl py-2 animate-in slide-in-from-bottom duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center py-1 mb-1">
          <div className="w-8 h-1 rounded-full bg-[#e5e2e1]/20" />
        </div>

        <button onClick={() => handleAction(() => {
          const snippet = content.length > 120 ? content.slice(0, 120) + '...' : content;
          setReplyTo(messageId, snippet);
        })} className={menuItemClass}>
          <ArrowBendUpLeft size={18} /> 답장
        </button>

        <button onClick={() => handleAction(() => {
          navigator.clipboard.writeText(content);
          showToast('Copied');
        })} className={menuItemClass}>
          <Copy size={18} /> 복사
        </button>

        <button onClick={() => handleAction(() => {
          const plain = content.replace(/[*_~`#>\[\]()!]/g, '').replace(/\n{3,}/g, '\n\n');
          navigator.clipboard.writeText(plain);
          showToast('Copied as text');
        })} className={menuItemClass}>
          <TextT size={18} /> 텍스트로 복사
        </button>

        <button onClick={() => handleAction(() => {
          if (!resolvedConvId) return;
          wsClient.sendRpc('branch.create', { conversation_id: resolvedConvId, checkpoint_id: messageId });
        })} className={menuItemClass}>
          <GitFork size={18} /> 브랜치 생성
        </button>

        <button onClick={() => handleAction(() => {
          if (!resolvedConvId) return;
          wsClient.sendRpc('message.save', { conversation_id: resolvedConvId, message_id: messageId, content });
          showToast('Saved to memory');
        })} className={menuItemClass}>
          <BookmarkSimple size={18} /> 메모리에 저장
        </button>

        {isAssistant && (
          <button onClick={() => handleAction(() => {
            if (!resolvedConvId) return;
            wsClient.sendRpc('message.retry', { conversation_id: resolvedConvId, message_id: messageId });
          })} className={menuItemClass}>
            <ArrowClockwise size={18} /> 다시 생성
          </button>
        )}

        {isAssistant && !!activeBranchId && (
          <button onClick={() => handleAction(() => {
            if (!resolvedConvId) return;
            wsClient.sendRpc('message.adopt', { conversation_id: resolvedConvId, message_id: messageId });
            showToast('Adopted');
          })} className={menuItemClass}>
            <CheckCircle size={18} /> 채택
          </button>
        )}

        {isUser && (
          <button onClick={() => handleAction(() => setEditingMsg(messageId))} className={menuItemClass}>
            <PencilSimple size={18} /> 편집
          </button>
        )}

        <div className="my-1 mx-4 border-t border-white/5" />

        <button onClick={() => handleAction(() => {
          if (!activeConvId) return;
          removeMessage(activeConvId, messageId);
          wsClient.sendRpc('message.delete', { conversation_id: resolvedConvId ?? activeConvId, message_id: messageId });
          dbSync.syncMessageDelete(activeConvId, messageId);
        })} className={cn(menuItemClass, 'text-red-400/80')}>
          <Trash size={18} /> 삭제
        </button>
      </div>
    </div>
  );
}

// --- Inline Edit for user messages ---
export function InlineEdit({ msgId, initialContent }: { msgId: string; initialContent: string }) {
  const [text, setText] = useState(initialContent);
  const activeConvId = useChatStore(s => s.activeConversationId);
  const editMessage = useChatStore(s => s.editMessage);
  const setEditingMsg = useChatStore(s => s.setEditingMsg);
  const editRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { editRef.current?.focus(); }, []);

  const handleSave = () => {
    if (!activeConvId || !text.trim()) return;
    editMessage(activeConvId, msgId, text);
  };
  const handleCancel = () => setEditingMsg(null);
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); }
    if (e.key === 'Escape') handleCancel();
  };

  return (
    <div className="mt-1">
      <textarea
        ref={editRef}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full bg-white/[0.06] border border-primary/30 rounded-lg px-3 py-2 text-[14px] text-on-surface resize-none focus:outline-none focus:ring-1 focus:ring-primary/50 min-h-[60px]"
        rows={Math.min(text.split('\n').length + 1, 8)}
      />
      <div className="flex items-center gap-2 mt-1">
        <button onClick={handleSave} className="px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-primary/20 text-primary hover:bg-primary/30 transition-colors">
          Save
        </button>
        <button onClick={handleCancel} className="px-2.5 py-0.5 rounded-md text-[11px] text-on-surface-variant/60 hover:text-on-surface-variant hover:bg-white/5 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}
