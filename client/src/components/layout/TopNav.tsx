import { getCurrentWindow } from '@tauri-apps/api/window';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSystemStore } from '@/store/systemStore';
import { Input } from '@/components/ui/input';
import { MessageSearchResults } from './MessageSearchResults';
import {
  ClockCounterClockwise,
  Bell,
  Minus,
  CornersOut,
  CornersIn,
  X,
  MagnifyingGlass,
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

function HeaderSearch() {
  const [search, setSearch] = useState('');
  const [focused, setFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDbConnected = useSystemStore(s => s.isDbConnected);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Escape 키로 닫기
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setSearch('');
      setFocused(false);
      (e.target as HTMLInputElement).blur();
    }
  };

  const showDropdown = search.trim().length >= 2 && focused && isDbConnected;

  return (
    <div ref={containerRef} className="relative w-full max-w-[360px]">
      <MagnifyingGlass size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant/30 z-10" />
      <Input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        onFocus={() => setFocused(true)}
        onKeyDown={handleKeyDown}
        placeholder="메시지 검색..."
        className="h-7 bg-white/5 border-none text-[11px] pl-7 pr-7 text-on-surface placeholder:text-on-surface-variant/30 focus-visible:ring-1 focus-visible:ring-primary/30 focus-visible:border-none rounded-md"
      />
      {search && (
        <button
          type="button"
          onClick={() => { setSearch(''); setFocused(false); }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant/30 hover:text-on-surface-variant/60 transition-colors z-10"
        >
          <X size={12} />
        </button>
      )}

      {showDropdown && (
        <MessageSearchResults
          query={search}
          onSelect={() => { setSearch(''); setFocused(false); }}
        />
      )}
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

      {/* Center — Search */}
      <div className="flex-1 flex items-center justify-center px-4">
        <HeaderSearch />
      </div>

      {/* Right items */}
      <div className="flex items-center gap-1 pr-0 h-full">
        {/* Window Controls */}
        <WindowControls />
      </div>

    </header>
  );
}
