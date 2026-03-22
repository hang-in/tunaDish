import { useEffect, useState } from 'react';
import { wsClient } from './lib/wsClient';
import { useSystemStore } from './store/systemStore';
import { Sidebar } from './components/layout/Sidebar';
import { ChatArea } from './components/layout/ChatArea';
import { BranchPanel } from './components/layout/BranchPanel';
import { TopNav } from './components/layout/TopNav';
import { cn } from './lib/utils';
import { hydrateFromDb } from './lib/dbHydrate';
import {
  SidebarSimple
} from '@phosphor-icons/react';

function App() {
  const sidebarOpen = useSystemStore(s => s.sidebarOpen);
  const branchPanelOpen = useSystemStore(s => s.branchPanelOpen);
  const sidebarWidth = useSystemStore(s => s.sidebarWidth);
  const setSidebarWidth = useSystemStore(s => s.setSidebarWidth);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    // SQLite에서 로컬 캐시 하이드레이션 후 WS 연결
    hydrateFromDb().then(() => wsClient.connect());
  }, []);

  // Responsive Auto-Hide & Restore (sidebar only)
  useEffect(() => {
    let lastWidth = window.innerWidth;
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 1024 && lastWidth >= 1024 && useSystemStore.getState().sidebarOpen) {
        useSystemStore.getState().setSidebarOpen(false);
      }
      if (width >= 1024 && lastWidth < 1024 && !useSystemStore.getState().sidebarOpen) {
        useSystemStore.getState().setSidebarOpen(true);
      }
      lastWidth = width;
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Sidebar resize
  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMouseMove = (moveE: MouseEvent) => {
      const newWidth = Math.max(180, Math.min(256, startWidth + (moveE.clientX - startX)));
      setSidebarWidth(newWidth);
    };
    const onMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'default';
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
  };

  return (
    <div className="flex h-screen w-full flex-col bg-surface-container-lowest text-on-surface overflow-hidden relative">
      <TopNav />
      <div className="flex-1 flex overflow-hidden relative">

        {/* Left Floating Expansion Button (Bottom Left) */}
        <div className={cn(
          "fixed left-4 bottom-4 z-[60] transition-all duration-300",
          sidebarOpen ? "opacity-0 pointer-events-none translate-y-4" : "opacity-100 scale-100"
        )}>
          <button
            onClick={() => useSystemStore.getState().toggleSidebar()}
            className="size-10 rounded-full bg-surface-container-high border border-outline-variant/50 shadow-xl flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-bright transition-all active:scale-95 group"
            title="Open Sidebar"
          >
            <SidebarSimple size={20} className="group-hover:scale-110 transition-transform" />
          </button>
        </div>

        {/* Mobile/Tablet overlay for main Sidebar */}
        {sidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => useSystemStore.getState().toggleSidebar()}
          />
        )}

        {/* Sidebar with Smooth Sliding */}
        <div
          className={cn(
            "absolute lg:relative z-50 h-full flex shrink-0 overflow-hidden bg-[#131313]",
            !isResizing && "transition-all duration-300 ease-in-out",
            sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-[-100%] lg:!w-0"
          )}
          style={{ width: sidebarOpen ? `${sidebarWidth}px` : '0px' }}
        >
          <div className="h-full border-r border-outline-variant/30" style={{ width: `${sidebarWidth}px` }}>
            <Sidebar />
          </div>
          <div
            onMouseDown={startResizing}
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/40 z-50 transition-colors"
          />
        </div>

        {/* Main Chat Area */}
        <main className={cn(
          "flex-grow flex flex-col min-w-0 overflow-hidden relative z-0",
          !isResizing && "transition-all duration-300 ease-in-out"
        )}>
          <ChatArea />
        </main>

        {/* Right Branch Panel — slides in like Slack thread (1/3 width) */}
        <div
          className={cn(
            "relative z-10 h-full shrink-0 overflow-hidden",
            "transition-all duration-300 ease-in-out",
            branchPanelOpen ? "w-[33vw] min-w-[320px] max-w-[480px]" : "w-0"
          )}
        >
          {branchPanelOpen && <BranchPanel />}
        </div>

      </div>
    </div>
  );
}

export default App;
