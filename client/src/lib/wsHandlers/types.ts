import type { useChatStore } from '@/store/chatStore';
import type { useRunStore, RunStatus } from '@/store/runStore';
import type { useContextStore } from '@/store/contextStore';
import type { useSystemStore } from '@/store/systemStore';
import type * as dbSync from '@/lib/dbSync';

// Re-export RunStatus for handler files
export type { RunStatus };

export type NotificationHandler = (
  params: Record<string, unknown>,
  deps: HandlerDeps,
) => void;

export interface HandlerDeps {
  chat: ReturnType<typeof useChatStore.getState>;
  run: ReturnType<typeof useRunStore.getState>;
  ctxStore: typeof useContextStore;
  sysStore: typeof useSystemStore;
  dbSync: typeof dbSync;
  contextLoadedConvs: Set<string>;
  /** Send an RPC call through the WebSocket client */
  sendRpc: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  /** Read/write the pending branch checkpoint stored on the WS client */
  getPendingBranchCheckpoint: () => string | null;
  setPendingBranchCheckpoint: (v: string | null) => void;
}
