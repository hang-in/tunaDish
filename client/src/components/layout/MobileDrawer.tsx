import { useEffect, useRef, useCallback } from 'react';
import { useSystemStore } from '@/store/systemStore';
import { Sidebar } from './Sidebar';

export function MobileDrawer() {
  const sidebarOpen = useSystemStore(s => s.sidebarOpen);
  const setSidebarOpen = useSystemStore(s => s.setSidebarOpen);
  const drawerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);

  const close = useCallback(() => setSidebarOpen(false), [setSidebarOpen]);

  // 좌측 엣지 스와이프로 열기
  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      const x = e.touches[0].clientX;
      if (x < 20 && !sidebarOpen) {
        touchStartX.current = x;
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const endX = e.changedTouches[0].clientX;
      if (touchStartX.current > 0 && endX - touchStartX.current > 60) {
        setSidebarOpen(true);
      }
      touchStartX.current = 0;
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [sidebarOpen, setSidebarOpen]);

  if (!sidebarOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={close}
      />
      {/* Drawer */}
      <div
        ref={drawerRef}
        className="absolute left-0 top-0 bottom-0 w-[85vw] max-w-[320px] bg-[#131313] animate-in slide-in-from-left duration-300"
      >
        <Sidebar />
      </div>
    </div>
  );
}
