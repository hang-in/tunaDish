import { useEffect } from 'react';
import { wsClient } from './lib/wsClient';
import { useSystemStore } from './store/systemStore';
import { useIsMobile } from './lib/useIsMobile';
import { hydrateFromDb } from './lib/dbHydrate';
import { DesktopShell } from './components/layout/DesktopShell';
import { MobileShell } from './components/layout/MobileShell';
import { ConnectionScreen } from './components/layout/ConnectionScreen';

function App() {
  const isConnected = useSystemStore(s => s.isConnected);
  const connectionStatus = useSystemStore(s => s.connectionStatus);
  const isMobile = useIsMobile();

  useEffect(() => {
    // SQLite에서 로컬 캐시 하이드레이션 후 WS 연결
    hydrateFromDb().then(() => {
      // 항상 자동 연결 시도 (wsClient.connect()가 resolveWsUrl()로 URL 결정)
      useSystemStore.getState().setConnectionStatus('connecting');
      wsClient.connect();

      // 3초 타임아웃 — 실패 시 ConnectionScreen 표시
      const timeout = setTimeout(() => {
        if (!useSystemStore.getState().isConnected) {
          useSystemStore.getState().setConnectionStatus('failed');
        }
      }, 3000);

      const unsub = useSystemStore.subscribe((state) => {
        if (state.isConnected) {
          unsub(); // 먼저 구독 해제 — setConnectionStatus가 동기적으로 subscriber를 다시 호출하므로
          clearTimeout(timeout);
          useSystemStore.getState().setConnectionStatus('connected');
        }
      });
    });
  }, []);

  // 연결 실패 시 ConnectionScreen 표시
  if (!isConnected && connectionStatus === 'failed') {
    return <ConnectionScreen />;
  }

  // 연결 중이거나 idle일 때는 로딩 표시
  if (!isConnected) {
    return (
      <div className="flex items-center justify-center h-screen w-full bg-[#0e0e0e]">
        <div className="text-center">
          <div className="text-2xl font-bold text-[#e5e2e1] mb-2">🐟 tunaDish</div>
          <p className="text-[12px] text-[#e5e2e1]/40">서버에 연결 중...</p>
        </div>
      </div>
    );
  }

  return isMobile ? <MobileShell /> : <DesktopShell />;
}

export default App;
