import { useSystemStore } from '@/store/systemStore';
import { useChatStore } from '@/store/chatStore';
import { List, MagnifyingGlass } from '@phosphor-icons/react';

export function MobileHeader() {
  const setSidebarOpen = useSystemStore(s => s.setSidebarOpen);
  const setMobileSearchOpen = useSystemStore(s => s.setMobileSearchOpen);
  const activeProject = useChatStore(s => s.activeProjectKey);
  const activeConversationId = useChatStore(s => s.activeConversationId);
  const conversations = useChatStore(s => s.conversations);

  const conv = activeConversationId ? conversations[activeConversationId] : null;
  const title = conv?.label || activeProject || 'tunaDish';

  return (
    <header className="flex items-center h-12 px-2 shrink-0 bg-[#0e0e0e] border-b border-outline-variant/30">
      {/* Hamburger */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="min-w-[44px] min-h-[44px] flex items-center justify-center text-[#e5e2e1]/60 hover:text-[#e5e2e1] active:bg-white/5 rounded-lg transition-colors"
      >
        <List size={22} />
      </button>

      {/* Title */}
      <div className="flex-1 min-w-0 px-2">
        <span className="block text-[14px] font-medium text-[#e5e2e1] truncate text-center">
          {title}
        </span>
      </div>

      {/* Search */}
      <button
        onClick={() => setMobileSearchOpen(true)}
        className="min-w-[44px] min-h-[44px] flex items-center justify-center text-[#e5e2e1]/60 hover:text-[#e5e2e1] active:bg-white/5 rounded-lg transition-colors"
      >
        <MagnifyingGlass size={20} />
      </button>
    </header>
  );
}
