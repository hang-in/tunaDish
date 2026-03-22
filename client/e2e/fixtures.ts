/**
 * Playwright fixture — Mock WS 서버 자동 시작/종료.
 */
import { test as base } from '@playwright/test';
import type { WebSocketServer } from 'ws';

// ESM/CJS 호환을 위해 동적 import
let serverModule: { createMockServer: (port?: number) => WebSocketServer } | null = null;

export const test = base.extend<{ mockWs: WebSocketServer }>({
  mockWs: async ({}, use) => {
    if (!serverModule) {
      serverModule = await import('./mock-ws-server');
    }
    const wss = serverModule.createMockServer(8765);
    await use(wss);
    // 테스트 종료 시 서버 정리
    wss.clients.forEach(c => c.close());
    wss.close();
  },
});

export { expect } from '@playwright/test';
