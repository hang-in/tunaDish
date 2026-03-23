import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — declared before any store / wsClient imports so Vitest hoists
// them before module evaluation.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { wsClient } from '@/lib/wsClient';
import { useChatStore } from '@/store/chatStore';
import { useRunStore } from '@/store/runStore';
import { useContextStore } from '@/store/contextStore';
import { useSystemStore } from '@/store/systemStore';

// ---------------------------------------------------------------------------
// MockWebSocket
// ---------------------------------------------------------------------------

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  readyState = WebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  send = vi.fn();
  close = vi.fn();

  constructor() {
    MockWebSocket.instances.push(this);
    // Trigger onopen asynchronously to mimic real WebSocket behaviour.
    setTimeout(() => this.onopen?.(), 0);
  }

  /** Helper: simulate an inbound message from the server. */
  receive(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

// ---------------------------------------------------------------------------
// Store reset helpers (Zustand v5 — partial setState only)
// ---------------------------------------------------------------------------

function resetChatStore() {
  useChatStore.setState({
    projects: [],
    conversations: {},
    messages: {},
    activeProjectKey: null,
    activeConversationId: null,
    activeBranchId: null,
    activeBranchLabel: null,
    isMockMode: false,
    replyTo: null,
    editingMsgId: null,
  });
}

function resetRunStore() {
  useRunStore.setState({ activeRuns: {} });
}

function resetContextStore() {
  useContextStore.setState({
    activeTab: 'overview',
    projectContext: null,
    memoryEntries: [],
    gitBranches: [],
    convBranchesByProject: {},
    reviews: [],
    progress: null,
  });
}

function resetSystemStore() {
  useSystemStore.setState({
    branchPanelOpen: false,
    branchPanelBranchId: null,
    branchPanelConvId: null,
    branchPanelLabel: '',
    branchPanelProjectKey: null,
  });
}

function resetAllStores() {
  resetChatStore();
  resetRunStore();
  resetContextStore();
  resetSystemStore();
}

// ---------------------------------------------------------------------------
// Test lifecycle
// ---------------------------------------------------------------------------

let mockWs: MockWebSocket;

beforeEach(async () => {
  vi.useFakeTimers();
  MockWebSocket.instances = [];

  // Replace global WebSocket with our mock.
  vi.stubGlobal('WebSocket', MockWebSocket);

  resetAllStores();
  vi.clearAllMocks();

  // wsClient is a module-level singleton. If a previous test left it with an
  // OPEN socket the connect() guard (`readyState === OPEN`) will bail out and
  // no new instance is created.  Force the internal socket to a CLOSED state
  // so connect() always creates a fresh MockWebSocket.
  // We cast to `any` to access the private `ws` field for test setup only.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = wsClient as unknown as { ws: MockWebSocket | null };
  if (client.ws) {
    (client.ws as any).readyState = WebSocket.CLOSED; // 3
    client.ws = null;
  }

  // Trigger connect() — creates a MockWebSocket instance.
  wsClient.connect();

  // Advance timers just enough to fire the constructor's setTimeout(fn, 0)
  // that triggers onopen, without running the 30s heartbeat interval.
  await vi.advanceTimersByTimeAsync(1);

  mockWs = MockWebSocket.instances[MockWebSocket.instances.length - 1];
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Convenience: send a notification through the mock WS
// ---------------------------------------------------------------------------

function notify(method: string, params: Record<string, unknown>) {
  mockWs.receive({ method, params });
}

// ---------------------------------------------------------------------------
// message.new
// ---------------------------------------------------------------------------

describe('message.new notification', () => {
  it('calls chatStore.addMessage with the ref and message', () => {
    notify('message.new', {
      ref: { channel_id: 'conv-1', message_id: 'msg-a' },
      message: { text: 'Hello from assistant' },
    });

    const msgs = useChatStore.getState().messages['conv-1'];
    expect(msgs).toHaveLength(1);
    expect(msgs[0].id).toBe('msg-a');
    expect(msgs[0].content).toBe('Hello from assistant');
    // activeRun이 없으면 즉시 finalize되어 'done'이 됨
    expect(msgs[0].status).toBe('done');
  });
});

// ---------------------------------------------------------------------------
// message.update
// ---------------------------------------------------------------------------

describe('message.update notification', () => {
  it('updates the content of an existing message', () => {
    // Pre-seed a streaming message.
    useChatStore.getState().addMessage(
      { channel_id: 'conv-1', message_id: 'msg-b' },
      { text: 'chunk 1' },
    );

    notify('message.update', {
      ref: { channel_id: 'conv-1', message_id: 'msg-b' },
      message: { text: 'chunk 1 updated' },
    });

    const msg = useChatStore.getState().messages['conv-1'][0];
    expect(msg.content).toBe('chunk 1 updated');
  });
});

// ---------------------------------------------------------------------------
// run.status — idle
// ---------------------------------------------------------------------------

describe('run.status idle notification', () => {
  it('sets the run status to idle and finalizes streaming messages', () => {
    // Pre-seed a streaming message for the conversation.
    useChatStore.getState().addMessage(
      { channel_id: 'conv-2', message_id: 'msg-stream' },
      { text: 'streaming...' },
    );
    expect(useChatStore.getState().messages['conv-2'][0].status).toBe('streaming');

    notify('run.status', { conversation_id: 'conv-2', status: 'idle' });

    expect(useRunStore.getState().activeRuns['conv-2']).toBe('idle');
    expect(useChatStore.getState().messages['conv-2'][0].status).toBe('done');
  });
});

// ---------------------------------------------------------------------------
// run.status — running (no finalization)
// ---------------------------------------------------------------------------

describe('run.status running notification', () => {
  it('sets the run status to running without touching messages', () => {
    useChatStore.getState().addMessage(
      { channel_id: 'conv-3', message_id: 'msg-s' },
      { text: 'in flight' },
    );

    notify('run.status', { conversation_id: 'conv-3', status: 'running' });

    expect(useRunStore.getState().activeRuns['conv-3']).toBe('running');
    // Message should still be streaming — finalizeStreamingMessages was NOT called.
    expect(useChatStore.getState().messages['conv-3'][0].status).toBe('streaming');
  });
});

// ---------------------------------------------------------------------------
// branch.created
// ---------------------------------------------------------------------------

describe('branch.created notification', () => {
  it('calls setActiveBranch and openBranchPanel', () => {
    // Register a conversation so the handler can look up projectKey.
    useChatStore.getState().addConversation({
      id: 'conv-main',
      projectKey: 'proj-a',
      label: 'main',
      type: 'main',
      createdAt: 0,
    });

    notify('branch.created', {
      branch_id: 'br-42',
      label: 'feature/x',
      conversation_id: 'conv-main',
    });

    expect(useChatStore.getState().activeBranchId).toBe('br-42');
    expect(useChatStore.getState().activeBranchLabel).toBe('feature/x');
    // Slide panel should be opened (replaces multi-window)
    const sys = useSystemStore.getState();
    expect(sys.branchPanelOpen).toBe(true);
    expect(sys.branchPanelBranchId).toBe('br-42');
    expect(sys.branchPanelConvId).toBe('conv-main');
    expect(sys.branchPanelProjectKey).toBe('proj-a');
  });
});

// ---------------------------------------------------------------------------
// branch.adopted
// ---------------------------------------------------------------------------

describe('branch.adopted notification', () => {
  it('clears activeBranch and closes branch panel', () => {
    useChatStore.setState({ activeBranchId: 'br-10', activeBranchLabel: 'old-branch' });
    useSystemStore.getState().openBranchPanel('br-10', 'conv-adopted', 'old-branch', 'proj-b');
    useChatStore.getState().addConversation({
      id: 'conv-adopted',
      projectKey: 'proj-b',
      label: 'main',
      type: 'main',
      createdAt: 0,
    });

    notify('branch.adopted', { branch_id: 'br-10', conversation_id: 'conv-adopted' });

    expect(useChatStore.getState().activeBranchId).toBeNull();
    expect(useSystemStore.getState().branchPanelOpen).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// branch.archived
// ---------------------------------------------------------------------------

describe('branch.archived notification', () => {
  it('clears activeBranch if it matches and closes branch panel', () => {
    useChatStore.setState({ activeBranchId: 'br-arch', activeBranchLabel: 'archived-label' });
    useSystemStore.getState().openBranchPanel('br-arch', 'conv-1', 'archived-label', 'proj-a');

    notify('branch.archived', { branch_id: 'br-arch' });

    expect(useChatStore.getState().activeBranchId).toBeNull();
    expect(useSystemStore.getState().branchPanelOpen).toBe(false);
  });

  it('does not clear activeBranch when a different branch is archived', () => {
    useChatStore.setState({ activeBranchId: 'br-current', activeBranchLabel: 'current' });
    useSystemStore.getState().openBranchPanel('br-current', 'conv-1', 'current', 'proj-a');

    notify('branch.archived', { branch_id: 'br-other' });

    expect(useChatStore.getState().activeBranchId).toBe('br-current');
    // Panel stays open because it's showing br-current, not br-other
    expect(useSystemStore.getState().branchPanelOpen).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// branch.deleted
// ---------------------------------------------------------------------------

describe('branch.deleted notification', () => {
  it('clears activeBranch if it matches and closes branch panel', () => {
    useChatStore.setState({ activeBranchId: 'br-del', activeBranchLabel: 'to-delete' });
    useSystemStore.getState().openBranchPanel('br-del', 'conv-1', 'to-delete', 'proj-a');

    notify('branch.deleted', { branch_id: 'br-del' });

    expect(useChatStore.getState().activeBranchId).toBeNull();
    expect(useSystemStore.getState().branchPanelOpen).toBe(false);
  });

  it('does not close panel when a different branch is deleted', () => {
    useChatStore.setState({ activeBranchId: 'br-keep', activeBranchLabel: 'keep' });
    useSystemStore.getState().openBranchPanel('br-keep', 'conv-1', 'keep', 'proj-a');

    notify('branch.deleted', { branch_id: 'br-unrelated' });

    expect(useChatStore.getState().activeBranchId).toBe('br-keep');
    // Panel stays open — it's showing br-keep, not br-unrelated
    expect(useSystemStore.getState().branchPanelOpen).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// conversation.created
// ---------------------------------------------------------------------------

describe('conversation.created notification', () => {
  it('adds the new conversation to the store', () => {
    notify('conversation.created', {
      conversation_id: 'conv-new',
      project: 'proj-x',
      label: 'new-session',
    });

    const conv = useChatStore.getState().conversations['conv-new'];
    expect(conv).toBeDefined();
    expect(conv.projectKey).toBe('proj-x');
    expect(conv.label).toBe('new-session');
    expect(conv.type).toBe('main');
  });
});

// ---------------------------------------------------------------------------
// project.list.result
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// message.delete
// ---------------------------------------------------------------------------

describe('message.delete notification', () => {
  it('removes the message from the store', () => {
    useChatStore.getState().pushMessage('conv-1', {
      id: 'msg-del', role: 'user', content: 'to delete', timestamp: 1, status: 'done',
    });
    notify('message.delete', {
      ref: { channel_id: 'conv-1', message_id: 'msg-del' },
    });
    expect(useChatStore.getState().messages['conv-1']).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// run.status with branch_id
// ---------------------------------------------------------------------------

describe('run.status with branch_id', () => {
  it('sets run status for both conv and branch channel', () => {
    notify('run.status', {
      conversation_id: 'conv-1',
      branch_id: 'br-1',
      status: 'running',
    });
    expect(useRunStore.getState().activeRuns['conv-1']).toBe('running');
    expect(useRunStore.getState().activeRuns['branch:br-1']).toBe('running');
  });

  it('finalizes both channels on idle', () => {
    useChatStore.getState().addMessage(
      { channel_id: 'conv-1', message_id: 'ms1' },
      { text: 'streaming' },
    );
    useChatStore.getState().addMessage(
      { channel_id: 'branch:br-1', message_id: 'ms2' },
      { text: 'streaming' },
    );
    // Set running first so message.new doesn't auto-finalize
    useRunStore.setState({ activeRuns: { 'conv-1': 'running', 'branch:br-1': 'running' } });

    notify('run.status', {
      conversation_id: 'conv-1',
      branch_id: 'br-1',
      status: 'idle',
    });
    expect(useChatStore.getState().messages['conv-1'][0].status).toBe('done');
    expect(useChatStore.getState().messages['branch:br-1'][0].status).toBe('done');
  });
});

// ---------------------------------------------------------------------------
// conversation.deleted
// ---------------------------------------------------------------------------

describe('conversation.deleted notification', () => {
  it('removes the conversation from the store', () => {
    useChatStore.getState().addConversation({
      id: 'conv-rm', projectKey: 'proj-a', label: 'bye', type: 'main', createdAt: 0,
    });
    notify('conversation.deleted', { conversation_id: 'conv-rm' });
    expect(useChatStore.getState().conversations['conv-rm']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// conversation.history.result
// ---------------------------------------------------------------------------

describe('conversation.history.result notification', () => {
  it('sets message history for the conversation', () => {
    notify('conversation.history.result', {
      conversation_id: 'conv-h',
      messages: [
        { role: 'user', content: 'hello', timestamp: '2026-03-22T00:00:00Z' },
        { role: 'assistant', content: 'world', timestamp: '2026-03-22T00:00:01Z' },
      ],
    });
    const msgs = useChatStore.getState().messages['conv-h'];
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('user');
    expect(msgs[1].content).toBe('world');
    expect(msgs[0].status).toBe('done');
  });

  it('uses branch:${branch_id} key for branch history', () => {
    notify('conversation.history.result', {
      conversation_id: 'conv-h',
      branch_id: 'br-5',
      messages: [
        { role: 'assistant', content: 'branch msg', timestamp: '2026-03-22T00:00:00Z' },
      ],
    });
    expect(useChatStore.getState().messages['branch:br-5']).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// conversation.list.result
// ---------------------------------------------------------------------------

describe('conversation.list.result notification', () => {
  it('loads conversations into the store', () => {
    notify('conversation.list.result', {
      conversations: [
        { id: 'c1', project: 'proj-a', label: 'Chat 1', created_at: 1000 },
        { id: 'c2', project: 'proj-a', label: 'Chat 2', created_at: 2000 },
      ],
    });
    expect(useChatStore.getState().conversations['c1']).toBeDefined();
    expect(useChatStore.getState().conversations['c2'].label).toBe('Chat 2');
  });
});

// ---------------------------------------------------------------------------
// command.result
// ---------------------------------------------------------------------------

describe('command.result notification', () => {
  it('pushes a system message to the conversation', () => {
    notify('command.result', {
      conversation_id: 'conv-cmd',
      text: 'Model set to claude-3-opus',
    });
    const msgs = useChatStore.getState().messages['conv-cmd'];
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toBe('Model set to claude-3-opus');
    expect(msgs[0].role).toBe('assistant');
  });

  it('ignores __rpc__ conversation_id', () => {
    notify('command.result', {
      conversation_id: '__rpc__',
      text: 'ignored',
    });
    expect(useChatStore.getState().messages['__rpc__']).toBeUndefined();
  });

  it('applies settings when provided', () => {
    useChatStore.getState().addConversation({
      id: 'conv-set', projectKey: 'proj-a', label: 'test', type: 'main', createdAt: 0,
    });
    notify('command.result', {
      conversation_id: 'conv-set',
      text: 'Engine changed',
      settings: { engine: 'gemini', model: 'pro' },
    });
    const conv = useChatStore.getState().conversations['conv-set'];
    expect(conv.engine).toBe('gemini');
    expect(conv.model).toBe('pro');
  });
});

// ---------------------------------------------------------------------------
// engine.list.result
// ---------------------------------------------------------------------------

describe('engine.list.result notification', () => {
  it('stores engine list in context store', () => {
    notify('engine.list.result', {
      engines: { claude: ['sonnet', 'opus'], gemini: ['pro'] },
    });
    const engines = useContextStore.getState().engineList;
    expect(engines.claude).toEqual(['sonnet', 'opus']);
  });
});

// ---------------------------------------------------------------------------
// memory.list.json.result
// ---------------------------------------------------------------------------

describe('memory.list.json.result notification', () => {
  it('stores memory entries in context store', () => {
    notify('memory.list.json.result', {
      entries: [
        { id: 'm1', type: 'decision', title: 'Use React', content: 'ok', source: 'chat', tags: [], timestamp: 1 },
      ],
    });
    expect(useContextStore.getState().memoryEntries).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// message.deleted (separate from message.delete via ref)
// ---------------------------------------------------------------------------

describe('message.deleted notification', () => {
  it('removes the message from store', () => {
    useChatStore.getState().pushMessage('conv-1', {
      id: 'msg-gone', role: 'assistant', content: 'bye', timestamp: 1, status: 'done',
    });
    notify('message.deleted', { conversation_id: 'conv-1', message_id: 'msg-gone' });
    expect(useChatStore.getState().messages['conv-1']).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// branch.switched
// ---------------------------------------------------------------------------

describe('branch.switched notification', () => {
  it('sets the active branch', () => {
    notify('branch.switched', { branch_id: 'br-99' });
    expect(useChatStore.getState().activeBranchId).toBe('br-99');
  });

  it('clears active branch when branch_id is null', () => {
    useChatStore.setState({ activeBranchId: 'br-99' });
    notify('branch.switched', { branch_id: null });
    expect(useChatStore.getState().activeBranchId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// project.list.result
// ---------------------------------------------------------------------------

describe('project.list.result notification', () => {
  it('populates projects from configured and discovered lists', () => {
    notify('project.list.result', {
      configured: [
        { key: 'proj-cfg', alias: 'Configured Project', path: '/opt/proj', default_engine: 'claude', type: 'project' },
      ],
      discovered: ['disc-proj'],
    });

    const projects = useChatStore.getState().projects;
    expect(projects).toHaveLength(2);

    const cfg = projects.find(p => p.key === 'proj-cfg');
    expect(cfg).toBeDefined();
    expect(cfg!.name).toBe('Configured Project');
    expect(cfg!.source).toBe('configured');

    const disc = projects.find(p => p.key === 'disc-proj');
    expect(disc).toBeDefined();
    expect(disc!.source).toBe('discovered');
  });
});
