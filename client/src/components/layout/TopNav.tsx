import { getCurrentWindow } from '@tauri-apps/api/window';
import { useState, useEffect, useCallback } from 'react';
import {
  ClockCounterClockwise,
  Bell,
  Minus,
  CornersOut,
  CornersIn,
  X,
} from '@phosphor-icons/react';

const appWindow = getCurrentWindow();

function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    appWindow.isMaximized().then(setMaximized);
  }, []);

  return (
    <div className="flex items-center h-full ml-2">
      <button
        onClick={() => appWindow.minimize()}
        className="flex items-center justify-center w-11 h-full text-on-surface-variant/60 hover:bg-white/8 transition-colors"
        title="Minimize"
      >
        <Minus size={14} />
      </button>
      <button
        onClick={async () => {
          await appWindow.toggleMaximize();
          setMaximized(await appWindow.isMaximized());
        }}
        className="flex items-center justify-center w-11 h-full text-on-surface-variant/60 hover:bg-white/8 transition-colors"
        title={maximized ? 'Restore' : 'Maximize'}
      >
        {maximized ? <CornersIn size={14} /> : <CornersOut size={14} />}
      </button>
      <button
        onClick={() => appWindow.close()}
        className="flex items-center justify-center w-11 h-full text-on-surface-variant/60 hover:bg-red-500/80 hover:text-white transition-colors rounded-tr-none"
        title="Close"
      >
        <X size={14} weight="bold" />
      </button>
    </div>
  );
}

export function TopNav() {
  // 헤더 빈 영역 mousedown → 창 드래그 시작
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLElement>) => {
    // 버튼, input 등 인터랙티브 요소에서는 드래그 안 함
    const target = e.target as HTMLElement;
    if (target.closest('button, input, a, [role="button"]')) return;
    e.preventDefault();
    appWindow.startDragging();
  }, []);

  return (
    <header
      onMouseDown={handleMouseDown}
      className="w-full h-10 border-b border-outline-variant/30 sticky top-0 z-50 bg-[#0e0e0e] flex items-center shrink-0 relative select-none"
    >

      {/* Left items */}
      <div className="flex items-center gap-2 pl-3">
        <div className="flex items-center gap-1.5">
          <div className="w-[18px] h-[18px] bg-[#5e6ad2] rounded-[4px] flex items-center justify-center text-white font-bold text-[9px] tracking-tight shadow-sm">
            TD
          </div>
          <span className="font-medium text-[13px] tracking-tight text-on-surface/80">tunaDish</span>
        </div>
        <button className="text-on-surface-variant/50 hover:text-on-surface transition-colors flex items-center justify-center size-7 rounded hover:bg-white/5 ml-2">
          <Bell size={14} />
        </button>
        <button className="text-on-surface-variant/50 hover:text-on-surface transition-colors flex items-center justify-center size-7 rounded hover:bg-white/5">
          <ClockCounterClockwise size={14} />
        </button>
      </div>

      {/* Center flex spacer */}
      <div className="flex-1" />

      {/* Right items */}
      <div className="flex items-center gap-1 pr-0 h-full">
        {/* Window Controls */}
        <WindowControls />
      </div>

    </header>
  );
}
