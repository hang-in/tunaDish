/**
 * Mock data for offline/disconnected development.
 * Mirrors the real data model so switching to live is seamless.
 */

import type { Project, Conversation, ChatMessage } from '@/store/chatStore';
import type { RunStatus } from '@/store/runStore';

export const MOCK_PROJECTS: Project[] = [
  {
    key: 'tunadish',
    name: 'tunadish',
    path: '/home/d9ng/privateProject/tunaDish',
    defaultEngine: 'claude',
    source: 'configured',
  },
  {
    key: 'claude-ch',
    name: 'claude-ch',
    path: '/home/d9ng/privateProject',
    defaultEngine: 'claude',
    source: 'configured',
  },
  {
    key: 'codex-ch',
    name: 'codex-ch',
    path: '/home/d9ng/privateProject',
    defaultEngine: 'codex',
    source: 'configured',
  },
  {
    key: 'gemini-ch',
    name: 'gemini-ch',
    path: '/home/d9ng/privateProject',
    defaultEngine: 'gemini',
    source: 'configured',
  },
];

export const MOCK_CONVERSATIONS: Record<string, Conversation> = {
  'conv-main-1': {
    id: 'conv-main-1',
    projectKey: 'tunadish',
    label: 'main',
    type: 'main',
    engine: 'claude',
    createdAt: Date.now() - 3600_000,
  },
  'conv-branch-1': {
    id: 'conv-branch-1',
    projectKey: 'tunadish',
    label: 'refactor-ws-client',
    type: 'branch',
    parentId: 'conv-main-1',
    engine: 'claude',
    createdAt: Date.now() - 1800_000,
  },
  'conv-discuss-1': {
    id: 'conv-discuss-1',
    projectKey: 'tunadish',
    label: 'architecture review',
    type: 'discussion',
    parentId: 'conv-main-1',
    engine: 'claude',
    createdAt: Date.now() - 900_000,
  },
  'conv-main-2': {
    id: 'conv-main-2',
    projectKey: 'claude-ch',
    label: 'main',
    type: 'main',
    engine: 'claude',
    createdAt: Date.now() - 7200_000,
  },
};

export const MOCK_MESSAGES: Record<string, ChatMessage[]> = {
  'conv-main-1': [
    {
      id: 'msg-1',
      role: 'user',
      content: 'WebSocket transport의 현재 구조를 분석하고 개선점을 제안해줘.',
      timestamp: Date.now() - 3500_000,
      status: 'done',
    },
    {
      id: 'msg-2',
      role: 'assistant',
      content: `## WebSocket Transport 분석

### 현재 구조
\`backend.py\`에서 \`websockets.serve()\`로 WS 서버를 기동하고, 각 연결마다 \`TunadishTransport\` 인스턴스를 생성합니다.

### 주요 문제점
1. **\`anyio.start_soon()\` 미존재** — TaskGroup 외부에서 호출 불가
2. **MessageRef 직렬화** — dataclass에 \`model_dump()\` 없음
3. **예외 격리 부재** — 한 run의 에러가 전체 서버를 종료시킴

### 제안
\`\`\`python
async with anyio.create_task_group() as tg:
    self._task_group = tg
    async with websockets.serve(...):
        await anyio.sleep_forever()
\`\`\`

이렇게 TaskGroup을 최상위에 두면 \`start_soon()\`을 안전하게 사용할 수 있습니다.`,
      timestamp: Date.now() - 3400_000,
      status: 'done',
    },
    {
      id: 'msg-3',
      role: 'user',
      content: '좋아. 그럼 e2e 테스트도 만들어줘.',
      timestamp: Date.now() - 1000_000,
      status: 'done',
    },
    {
      id: 'msg-4',
      role: 'assistant',
      content: `e2e 테스트를 작성했습니다. 전체 파이프라인을 검증합니다:

1. \`project.list\` → 프로젝트 목록 수신 ✅
2. \`conversation.create\` → 대화 생성 ✅
3. \`chat.send\` → progress + final 응답 ✅

\`\`\`bash
python3 -c "
import asyncio, websockets, json
async def test():
    async with websockets.connect('ws://127.0.0.1:8765') as ws:
        await ws.send(json.dumps({...}))
        resp = await asyncio.wait_for(ws.recv(), timeout=5)
        print(resp)
asyncio.run(test())
"
\`\`\``,
      timestamp: Date.now() - 900_000,
      status: 'done',
    },
  ],
  'conv-branch-1': [
    {
      id: 'msg-b1',
      role: 'user',
      content: 'wsClient.ts를 리팩토링해서 pending request map을 구현해줘.',
      timestamp: Date.now() - 1700_000,
      status: 'done',
    },
    {
      id: 'msg-b2',
      role: 'assistant',
      content: `리팩토링 방향을 정리했습니다:

- **현재**: fire-and-forget (응답 추적 없음)
- **목표**: request id → Promise 매핑으로 응답 대기 가능

\`\`\`typescript
private pending = new Map<number, { resolve, reject }>();
\`\`\`

JSON-RPC 2.0 스펙에 맞게 \`id\` 필드를 포함하고, 서버 응답의 \`id\`로 매칭합니다.`,
      timestamp: Date.now() - 1600_000,
      status: 'done',
    },
  ],
  'conv-discuss-1': [
    {
      id: 'msg-d1',
      role: 'user',
      content: '@claude @gemini transport 레이어 아키텍처에 대해 토론해줘. 현재 구조의 장단점을 각자 분석하고.',
      timestamp: Date.now() - 850_000,
      status: 'done',
    },
    {
      id: 'msg-d2',
      role: 'assistant',
      content: `**[Claude — Round 1]**

현재 transport 레이어는 깔끔한 분리를 달성했습니다:
- \`Transport\`: WS 메시지 전송
- \`Presenter\`: 마크다운 렌더링
- \`Backend\`: 오케스트레이션

그러나 **멀티클라이언트 broadcast가 없다**는 점이 가장 큰 약점입니다. 각 WS 연결이 독립 Transport 인스턴스를 가지므로, 다른 클라이언트는 메시지를 못 받습니다.`,
      timestamp: Date.now() - 800_000,
      status: 'done',
    },
    {
      id: 'msg-d3',
      role: 'assistant',
      content: `**[Gemini — Round 1]**

동의합니다. 추가로 **JSON-RPC 2.0 프로토콜 미준수**도 심각합니다. request id를 반환하지 않으면 클라이언트에서 응답을 매칭할 수 없습니다.

제안: connection registry + broadcast 패턴을 도입하고, 모든 response에 id를 포함시켜야 합니다.`,
      timestamp: Date.now() - 750_000,
      status: 'done',
    },
  ],
};

export const MOCK_RUN_STATUS: Record<string, RunStatus> = {
  'conv-main-1': 'idle',
  'conv-branch-1': 'idle',
  'conv-discuss-1': 'running',
  'conv-main-2': 'idle',
};
