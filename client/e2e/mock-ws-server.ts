/**
 * Mock tunapi WS 서버 — E2E 테스트용.
 * 기본 JSON-RPC 응답만 제공. tunapi 없이 앱 UI 테스트 가능.
 */
import { WebSocketServer, WebSocket } from 'ws';

const MOCK_PROJECTS = {
  configured: [
    { key: 'tunadish', alias: 'tunaDish', path: 'D:\\privateProject\\tunaDish', default_engine: 'claude', type: 'project' },
    { key: 'tunapi', alias: 'tunapi', path: 'D:\\privateProject\\tunapi', default_engine: 'claude', type: 'project' },
  ],
  discovered: [],
};

const MOCK_CONVERSATIONS = [
  { id: 'conv-1', project: 'tunadish', label: 'E2E Test Session', created_at: Math.floor(Date.now() / 1000) },
];

const MOCK_CONTEXT = {
  project: 'tunadish',
  engine: 'claude',
  model: 'claude-3-5-sonnet',
  trigger_mode: 'always',
  persona: null,
  resume_token: null,
  git_branch: 'main',
  available_engines: { claude: ['claude-3-5-sonnet', 'claude-3-opus'], gemini: ['gemini-2.0-flash'] },
  memory_entries: [],
  active_branches: [],
  conv_branches: [],
  pending_review_count: 0,
  recent_discussions: [],
  markdown: '# tunaDish\nE2E mock context.',
};

export function createMockServer(port = 8765): WebSocketServer {
  const wss = new WebSocketServer({ port });

  wss.on('connection', (ws) => {
    console.log('[mock-ws] client connected');

    ws.on('message', (raw) => {
      const data = JSON.parse(raw.toString());
      const { id, method, params } = data;

      switch (method) {
        case 'project.list':
          send(ws, { method: 'project.list.result', params: MOCK_PROJECTS });
          break;

        case 'conversation.list':
          send(ws, {
            method: 'conversation.list.result',
            params: { conversations: MOCK_CONVERSATIONS },
          });
          break;

        case 'conversation.create': {
          const convId = `conv-${Date.now()}`;
          send(ws, {
            method: 'conversation.create.result',
            params: {
              conversation_id: convId,
              project: params?.project ?? 'tunadish',
              label: 'New Session',
            },
          });
          break;
        }

        case 'project.context':
          send(ws, {
            method: 'project.context.result',
            params: { ...MOCK_CONTEXT, project: params?.project ?? 'tunadish' },
          });
          break;

        case 'chat.send': {
          const convId = params?.conversation_id ?? 'conv-1';
          const msgId = `msg-${Date.now()}`;
          // run.status → running
          send(ws, {
            method: 'run.status',
            params: { conversation_id: convId, status: 'running' },
          });
          // message.new
          send(ws, {
            method: 'message.new',
            params: {
              ref: { channel_id: convId, message_id: msgId },
              message: { text: '' },
              engine: 'claude',
              model: 'claude-3-5-sonnet',
            },
          });
          // message.update (simulated streaming)
          const reply = `E2E 테스트 응답: "${params?.text ?? ''}"에 대한 답변입니다.`;
          setTimeout(() => {
            send(ws, {
              method: 'message.update',
              params: {
                ref: { channel_id: convId, message_id: msgId },
                message: { text: reply },
              },
            });
            // run.status → idle
            setTimeout(() => {
              send(ws, {
                method: 'run.status',
                params: { conversation_id: convId, status: 'idle' },
              });
            }, 100);
          }, 200);
          break;
        }

        case 'engine.list':
          send(ws, {
            method: 'engine.list.result',
            params: { engines: MOCK_CONTEXT.available_engines },
          });
          break;

        case 'branch.list.json':
          send(ws, {
            method: 'branch.list.json.result',
            params: { project: params?.project, git_branches: [], conv_branches: [] },
          });
          break;

        case 'memory.list.json':
          send(ws, {
            method: 'memory.list.json.result',
            params: { entries: [] },
          });
          break;

        default:
          // id가 있는 RPC 요청에는 기본 응답
          if (id) {
            ws.send(JSON.stringify({ id, result: { ok: true } }));
          }
      }
    });

    ws.on('close', () => console.log('[mock-ws] client disconnected'));
  });

  console.log(`[mock-ws] listening on ws://localhost:${port}`);
  return wss;
}

function send(ws: WebSocket, msg: { method: string; params: Record<string, unknown> }) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// 직접 실행 시
const isMain = typeof process !== 'undefined' && process.argv[1]?.endsWith('mock-ws-server');
if (isMain) {
  createMockServer();
}
