import { create } from 'zustand';
import { wsClient } from '@/lib/wsClient'; // 의존성 주입 또는 직접 임포트

export type RunStatus = 'idle' | 'running' | 'cancelling';

interface RunState {
  // key: conversation_id
  activeRuns: Record<string, RunStatus>;
  setRunStatus: (conversationId: string, status: RunStatus) => void;
  requestCancel: (conversationId: string) => Promise<void>;
}

export const useRunStore = create<RunState>((set) => ({
  activeRuns: {},
  
  setRunStatus: (conversationId, status) => set((state) => ({
    activeRuns: {
      ...state.activeRuns,
      [conversationId]: status
    }
  })),

  requestCancel: async (conversationId) => {
    set((state) => ({
      activeRuns: {
        ...state.activeRuns,
        [conversationId]: 'cancelling'
      }
    }));
    
    // WS 클라이언트를 통해 취소 요청 전송
    try {
      await wsClient.sendRpc('run.cancel', { conversation_id: conversationId });
      // 실제 상태는 서버에서 run.status 변경으로 내려오지만 즉시 반영해둘 수도 있음
    } catch (err) {
      console.error("Cancel failed", err);
      // 복구
      set((state) => ({
        activeRuns: {
          ...state.activeRuns,
          [conversationId]: 'running' // 또는 이전 상태로 롤백
        }
      }));
    }
  }
}));
