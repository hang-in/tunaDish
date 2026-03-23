import { useChatStore } from '@/store/chatStore';
import { useContextStore, selectConvBranches } from '@/store/contextStore';
import { useSystemStore } from '@/store/systemStore';
import { GitFork } from '@phosphor-icons/react';

export function BranchIndicator() {
  const branchId = useChatStore(s => s.activeBranchId);
  const branchLabel = useChatStore(s => s.activeBranchLabel);
  const activeConvId = useChatStore(s => s.activeConversationId);
  const activeConv = useChatStore(s =>
    s.activeConversationId ? s.conversations[s.activeConversationId] : null
  );
  const convBranches = useContextStore(selectConvBranches);
  const activeBranches = convBranches.filter(b => b.status === 'active' || b.status === 'adopted');
  const branchPanelOpen = useSystemStore(s => s.branchPanelOpen);

  // No branches at all — don't show
  if (!branchId && activeBranches.length === 0) return null;

  const projectKey = activeConv?.projectKey ?? '';

  const handleOpenBranchView = () => {
    if (!activeConvId || !projectKey) return;
    // Currently on a branch — open slide panel for it
    if (branchId) {
      useSystemStore.getState().openBranchPanel(branchId, activeConvId, branchLabel || branchId.slice(0, 8), projectKey);
      return;
    }
    // On main but branches exist — open the first active branch
    const first = activeBranches[0];
    if (first) {
      useSystemStore.getState().openBranchPanel(first.id, activeConvId, first.label, projectKey);
    }
  };

  // Currently in a branch
  if (branchId) {
    return (
      <button
        onClick={handleOpenBranchView}
        className="h-9 border-b border-violet-500/20 flex items-center gap-2 px-4 shrink-0 bg-violet-500/10 hover:bg-violet-500/15 transition-colors w-full text-left"
      >
        <GitFork size={14} className="text-violet-400" weight="bold" />
        <span className="text-[12px] font-semibold text-violet-300">{branchLabel || branchId.slice(0, 8)}</span>
        <span className="text-[10px] text-violet-400/50 ml-auto">{branchPanelOpen ? 'Viewing' : 'Open →'}</span>
      </button>
    );
  }

  // On main but branches exist — show compact indicator
  return (
    <button
      onClick={handleOpenBranchView}
      className="h-8 border-b border-outline-variant/20 flex items-center gap-2 px-4 shrink-0 bg-white/[0.02] hover:bg-violet-500/5 transition-colors w-full text-left"
    >
      <GitFork size={13} className="text-on-surface-variant/40" />
      <span className="text-[11px] text-on-surface-variant/50">{activeBranches.length} branches</span>
      <span className="text-[10px] text-on-surface-variant/30 ml-auto">View →</span>
    </button>
  );
}
