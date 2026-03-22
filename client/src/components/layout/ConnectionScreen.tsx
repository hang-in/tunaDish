import { useState } from 'react';
import { useSystemStore } from '@/store/systemStore';
import { wsClient } from '@/lib/wsClient';
import {
  WifiHigh,
  WifiSlash,
  SpinnerGap,
  Clock,
  X,
  ArrowRight,
} from '@phosphor-icons/react';

const DEFAULT_URL = 'ws://127.0.0.1:8765';

export function ConnectionScreen() {
  const connectionStatus = useSystemStore(s => s.connectionStatus);
  const recentServers = useSystemStore(s => s.recentServers);
  const addRecentServer = useSystemStore(s => s.addRecentServer);
  const setConnectionStatus = useSystemStore(s => s.setConnectionStatus);

  const [url, setUrl] = useState(() => {
    // 마지막 사용 URL 또는 기본값
    try {
      return localStorage.getItem('tunadish:wsUrl') || DEFAULT_URL;
    } catch { return DEFAULT_URL; }
  });

  const handleConnect = () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    setConnectionStatus('connecting');
    wsClient.setUrl(trimmed);
    // 기존 연결 닫기 후 재연결
    try { (wsClient as any).ws?.close(); } catch { /* ignore */ }
    setTimeout(() => wsClient.connect(), 100);

    // 연결 결과 대기 (3초 타임아웃)
    const timeout = setTimeout(() => {
      if (!useSystemStore.getState().isConnected) {
        setConnectionStatus('failed');
      }
    }, 3000);

    const unsub = useSystemStore.subscribe((state) => {
      if (state.isConnected) {
        unsub();
        clearTimeout(timeout);
        setConnectionStatus('connected');
        addRecentServer(trimmed);
      }
    });
  };

  const handleSelectRecent = (serverUrl: string) => {
    setUrl(serverUrl);
  };

  const handleRemoveRecent = (serverUrl: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = recentServers.filter(u => u !== serverUrl);
    try { localStorage.setItem('tunadish:recentServers', JSON.stringify(updated)); } catch { /* ignore */ }
    useSystemStore.setState({ recentServers: updated });
  };

  // Enter 키로 연결
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConnect();
  };

  // 자동 연결은 App.tsx에서 관리 — 이 컴포넌트는 실패 후에만 표시됨

  const isConnecting = connectionStatus === 'connecting';

  return (
    <div className="flex items-center justify-center h-screen w-full bg-[#0e0e0e]">
      <div className="w-full max-w-sm px-6">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-3xl font-bold text-[#e5e2e1] mb-1">
            🐟 tunaDish
          </div>
          <p className="text-[12px] text-[#e5e2e1]/40">
            AI CLI agent chat client
          </p>
        </div>

        {/* Server URL Input */}
        <div className="mb-4">
          <label className="block text-[11px] text-[#e5e2e1]/50 mb-1.5 uppercase tracking-wider">
            서버 주소
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="ws://192.168.0.10:8765"
              disabled={isConnecting}
              className="flex-1 bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2.5 text-[13px] text-[#e5e2e1] placeholder:text-[#e5e2e1]/20 outline-none focus:border-[#5e6ad2] transition-colors disabled:opacity-50"
              autoFocus
            />
            <button
              onClick={handleConnect}
              disabled={isConnecting || !url.trim()}
              className="px-4 py-2.5 bg-[#5e6ad2] hover:bg-[#6b77de] disabled:bg-[#5e6ad2]/30 text-white rounded-lg text-[13px] font-medium transition-colors flex items-center gap-1.5 disabled:cursor-not-allowed"
            >
              {isConnecting ? (
                <SpinnerGap size={16} className="animate-spin" />
              ) : (
                <ArrowRight size={16} />
              )}
              {isConnecting ? '연결 중' : '연결'}
            </button>
          </div>
        </div>

        {/* Status */}
        {connectionStatus === 'failed' && (
          <div className="flex items-center gap-2 px-3 py-2 mb-4 bg-red-500/10 border border-red-500/20 rounded-lg text-[12px] text-red-400">
            <WifiSlash size={16} />
            <span>연결 실패 — 서버 주소를 확인하세요</span>
          </div>
        )}

        {connectionStatus === 'connected' && (
          <div className="flex items-center gap-2 px-3 py-2 mb-4 bg-green-500/10 border border-green-500/20 rounded-lg text-[12px] text-green-400">
            <WifiHigh size={16} />
            <span>연결됨</span>
          </div>
        )}

        {/* Recent Servers */}
        {recentServers.length > 0 && (
          <div className="mt-6">
            <label className="block text-[11px] text-[#e5e2e1]/50 mb-2 uppercase tracking-wider">
              최근 서버
            </label>
            <div className="flex flex-col gap-1">
              {recentServers.map(server => (
                <button
                  key={server}
                  onClick={() => handleSelectRecent(server)}
                  className="group flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] text-[#e5e2e1]/60 hover:text-[#e5e2e1] hover:bg-[#1a1a1a] transition-colors text-left"
                >
                  <Clock size={14} className="shrink-0 opacity-40" />
                  <span className="flex-1 truncate font-mono text-[12px]">{server}</span>
                  <span
                    onClick={(e) => handleRemoveRecent(server, e)}
                    className="opacity-0 group-hover:opacity-60 hover:!opacity-100 p-0.5 transition-opacity"
                  >
                    <X size={12} />
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
