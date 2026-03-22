import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from '@/store/chatStore';
import type { Conversation, ChatMessage } from '@/store/chatStore';

const store = useChatStore;

// Zustand v5: setState with replace=true would wipe action functions.
// Use partial setState (no replace flag) and reset only the data slices.
function resetStore() {
  store.setState({
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

function makeConv(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conv-1',
    projectKey: 'proj-a',
    label: 'Test Conv',
    type: 'main',
    createdAt: 1000000,
    ...overrides,
  };
}

function makeMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    role: 'user',
    content: 'hello',
    timestamp: 1000000,
    status: 'done',
    ...overrides,
  };
}

beforeEach(() => {
  resetStore();
});

// ---------------------------------------------------------------------------
// addConversation
// ---------------------------------------------------------------------------

describe('addConversation', () => {
  it('adds a conversation to the map', () => {
    const conv = makeConv();
    store.getState().addConversation(conv);
    expect(store.getState().conversations['conv-1']).toEqual(conv);
  });

  it('does not overwrite other existing conversations', () => {
    const a = makeConv({ id: 'a' });
    const b = makeConv({ id: 'b' });
    store.getState().addConversation(a);
    store.getState().addConversation(b);
    expect(Object.keys(store.getState().conversations)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// loadConversations
// ---------------------------------------------------------------------------

describe('loadConversations', () => {
  it('inserts new conversations from server list', () => {
    store.getState().loadConversations([
      { id: 'sv-1', projectKey: 'proj-a', label: 'Server Conv', created_at: 2000, source: 'tunadish' },
    ]);
    const conv = store.getState().conversations['sv-1'];
    expect(conv).toBeDefined();
    expect(conv.label).toBe('Server Conv');
    expect(conv.createdAt).toBe(2000 * 1000);
    expect(conv.source).toBe('tunadish');
  });

  it('updates label and source of an existing conversation', () => {
    store.getState().addConversation(makeConv({ id: 'ex-1', label: 'Old Label', source: 'tunadish' }));
    store.getState().loadConversations([
      { id: 'ex-1', projectKey: 'proj-a', label: 'New Label', created_at: 0, source: 'mattermost' },
    ]);
    const conv = store.getState().conversations['ex-1'];
    expect(conv.label).toBe('New Label');
    expect(conv.source).toBe('mattermost');
  });

  it('preserves existing conversations not in the server list', () => {
    store.getState().addConversation(makeConv({ id: 'keep-1' }));
    store.getState().loadConversations([
      { id: 'new-1', projectKey: 'proj-a', label: 'New', created_at: 0 },
    ]);
    expect(store.getState().conversations['keep-1']).toBeDefined();
    expect(store.getState().conversations['new-1']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// setActiveConversation
// ---------------------------------------------------------------------------

describe('setActiveConversation', () => {
  it('sets activeConversationId', () => {
    store.getState().addConversation(makeConv({ id: 'conv-x', projectKey: 'proj-x' }));
    store.getState().setActiveConversation('conv-x');
    expect(store.getState().activeConversationId).toBe('conv-x');
  });

  it('syncs activeProjectKey from the conversation', () => {
    store.getState().addConversation(makeConv({ id: 'conv-y', projectKey: 'proj-y' }));
    store.getState().setActiveConversation('conv-y');
    expect(store.getState().activeProjectKey).toBe('proj-y');
  });
});

// ---------------------------------------------------------------------------
// removeConversation
// ---------------------------------------------------------------------------

describe('removeConversation', () => {
  it('removes the conversation from the map', () => {
    store.getState().addConversation(makeConv({ id: 'rm-1' }));
    store.getState().removeConversation('rm-1');
    expect(store.getState().conversations['rm-1']).toBeUndefined();
  });

  it('clears activeConversationId when the active one is removed', () => {
    store.getState().addConversation(makeConv({ id: 'active-1' }));
    store.getState().setActiveConversation('active-1');
    store.getState().removeConversation('active-1');
    expect(store.getState().activeConversationId).toBeNull();
  });

  it('keeps activeConversationId when a different conv is removed', () => {
    store.getState().addConversation(makeConv({ id: 'keep-active' }));
    store.getState().addConversation(makeConv({ id: 'other' }));
    store.getState().setActiveConversation('keep-active');
    store.getState().removeConversation('other');
    expect(store.getState().activeConversationId).toBe('keep-active');
  });

  it('also removes associated messages', () => {
    store.getState().pushMessage('rm-msgs', makeMsg());
    store.getState().addConversation(makeConv({ id: 'rm-msgs' }));
    store.getState().removeConversation('rm-msgs');
    expect(store.getState().messages['rm-msgs']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// addMessage
// ---------------------------------------------------------------------------

describe('addMessage', () => {
  it('creates a new message array for an unknown convId', () => {
    store.getState().addMessage(
      { channel_id: 'conv-new', message_id: 'msg-a' },
      { text: 'first message' },
    );
    const arr = store.getState().messages['conv-new'];
    expect(arr).toHaveLength(1);
    expect(arr[0].content).toBe('first message');
  });

  it('assigns streaming status and assistant role', () => {
    store.getState().addMessage(
      { channel_id: 'conv-1', message_id: 'msg-b' },
      { text: 'streaming...' },
    );
    const msg = store.getState().messages['conv-1'][0];
    expect(msg.role).toBe('assistant');
    expect(msg.status).toBe('streaming');
    expect(msg.id).toBe('msg-b');
  });

  it('appends to an existing message array', () => {
    store.getState().pushMessage('conv-1', makeMsg({ id: 'existing' }));
    store.getState().addMessage(
      { channel_id: 'conv-1', message_id: 'appended' },
      { text: 'appended text' },
    );
    expect(store.getState().messages['conv-1']).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// updateMessage
// ---------------------------------------------------------------------------

describe('updateMessage', () => {
  it('updates the content of an existing message', () => {
    store.getState().pushMessage('conv-1', makeMsg({ id: 'upd-1', content: 'original' }));
    store.getState().updateMessage(
      { channel_id: 'conv-1', message_id: 'upd-1' },
      { text: 'updated' },
    );
    expect(store.getState().messages['conv-1'][0].content).toBe('updated');
  });

  it('preserves progressContent from previous content when status is streaming', () => {
    store.getState().pushMessage('conv-1', makeMsg({ id: 'str-1', content: 'chunk1', status: 'streaming' }));
    store.getState().updateMessage(
      { channel_id: 'conv-1', message_id: 'str-1' },
      { text: 'chunk2' },
    );
    const msg = store.getState().messages['conv-1'][0];
    expect(msg.content).toBe('chunk2');
    expect(msg.progressContent).toBe('chunk1');
  });

  it('is a no-op when message_id does not exist', () => {
    store.getState().pushMessage('conv-1', makeMsg({ id: 'real', content: 'original' }));
    store.getState().updateMessage(
      { channel_id: 'conv-1', message_id: 'ghost' },
      { text: 'should not apply' },
    );
    expect(store.getState().messages['conv-1'][0].content).toBe('original');
  });
});

// ---------------------------------------------------------------------------
// pushMessage
// ---------------------------------------------------------------------------

describe('pushMessage', () => {
  it('inserts a ChatMessage directly into the array', () => {
    const msg = makeMsg({ id: 'push-1', role: 'user', content: 'direct push' });
    store.getState().pushMessage('conv-push', msg);
    expect(store.getState().messages['conv-push'][0]).toEqual(msg);
  });

  it('preserves message order across multiple pushes', () => {
    store.getState().pushMessage('conv-order', makeMsg({ id: 'first', timestamp: 1 }));
    store.getState().pushMessage('conv-order', makeMsg({ id: 'second', timestamp: 2 }));
    const ids = store.getState().messages['conv-order'].map(m => m.id);
    expect(ids).toEqual(['first', 'second']);
  });
});

// ---------------------------------------------------------------------------
// removeMessage
// ---------------------------------------------------------------------------

describe('removeMessage', () => {
  it('removes a message by id', () => {
    store.getState().pushMessage('conv-1', makeMsg({ id: 'del-me' }));
    store.getState().pushMessage('conv-1', makeMsg({ id: 'keep-me' }));
    store.getState().removeMessage('conv-1', 'del-me');
    const ids = store.getState().messages['conv-1'].map(m => m.id);
    expect(ids).toEqual(['keep-me']);
  });

  it('is a no-op for an unknown msgId', () => {
    store.getState().pushMessage('conv-1', makeMsg({ id: 'stay' }));
    store.getState().removeMessage('conv-1', 'ghost');
    expect(store.getState().messages['conv-1']).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// finalizeStreamingMessages
// ---------------------------------------------------------------------------

describe('finalizeStreamingMessages', () => {
  it('converts all streaming messages to done', () => {
    store.getState().pushMessage('conv-1', makeMsg({ id: 'm1', status: 'streaming' }));
    store.getState().pushMessage('conv-1', makeMsg({ id: 'm2', status: 'streaming' }));
    store.getState().finalizeStreamingMessages('conv-1');
    const statuses = store.getState().messages['conv-1'].map(m => m.status);
    expect(statuses).toEqual(['done', 'done']);
  });

  it('leaves non-streaming messages unchanged', () => {
    store.getState().pushMessage('conv-1', makeMsg({ id: 'user-msg', role: 'user', status: 'done' }));
    store.getState().pushMessage('conv-1', makeMsg({ id: 'err-msg', status: 'error' }));
    store.getState().finalizeStreamingMessages('conv-1');
    const statuses = store.getState().messages['conv-1'].map(m => m.status);
    expect(statuses).toEqual(['done', 'error']);
  });

  it('is a no-op for an unknown convId', () => {
    expect(() => store.getState().finalizeStreamingMessages('no-such-conv')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// setActiveBranch
// ---------------------------------------------------------------------------

describe('setActiveBranch', () => {
  it('sets branchId and label', () => {
    store.getState().setActiveBranch('branch-42', 'My Branch');
    expect(store.getState().activeBranchId).toBe('branch-42');
    expect(store.getState().activeBranchLabel).toBe('My Branch');
  });

  it('clears branch state when called with null', () => {
    store.getState().setActiveBranch('branch-x', 'X');
    store.getState().setActiveBranch(null);
    expect(store.getState().activeBranchId).toBeNull();
    expect(store.getState().activeBranchLabel).toBeNull();
  });

  it('defaults label to null when omitted', () => {
    store.getState().setActiveBranch('branch-y');
    expect(store.getState().activeBranchLabel).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// setProjectsFromResult
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// setProjects
// ---------------------------------------------------------------------------

describe('setProjects', () => {
  it('replaces the projects array', () => {
    store.getState().setProjects([{ key: 'a', name: 'A', source: 'configured', type: 'project' }]);
    expect(store.getState().projects).toHaveLength(1);
    expect(store.getState().projects[0].key).toBe('a');
  });
});

// ---------------------------------------------------------------------------
// setActiveProject
// ---------------------------------------------------------------------------

describe('setActiveProject', () => {
  it('sets activeProjectKey', () => {
    store.getState().setActiveProject('proj-z');
    expect(store.getState().activeProjectKey).toBe('proj-z');
  });
});

// ---------------------------------------------------------------------------
// createConversation
// ---------------------------------------------------------------------------

describe('createConversation', () => {
  it('creates a new conversation and sets it as active', () => {
    const id = store.getState().createConversation('proj-a');
    expect(store.getState().conversations[id]).toBeDefined();
    expect(store.getState().activeConversationId).toBe(id);
    expect(store.getState().activeProjectKey).toBe('proj-a');
  });

  it('uses project defaultEngine for conversation engine', () => {
    store.getState().setProjects([{ key: 'proj-e', name: 'E', source: 'configured', type: 'project', defaultEngine: 'claude' }]);
    const id = store.getState().createConversation('proj-e');
    expect(store.getState().conversations[id].engine).toBe('claude');
  });

  it('uses custom label when provided', () => {
    const id = store.getState().createConversation('proj-a', 'main', 'My Chat');
    expect(store.getState().conversations[id].label).toBe('My Chat');
  });

  it('defaults label to "main" for main type', () => {
    const id = store.getState().createConversation('proj-a', 'main');
    expect(store.getState().conversations[id].label).toBe('main');
  });
});

// ---------------------------------------------------------------------------
// setHistory
// ---------------------------------------------------------------------------

describe('setHistory', () => {
  it('replaces messages for a conversation', () => {
    store.getState().pushMessage('conv-1', makeMsg({ id: 'old' }));
    const newMsgs = [makeMsg({ id: 'new-1' }), makeMsg({ id: 'new-2' })];
    store.getState().setHistory('conv-1', newMsgs);
    expect(store.getState().messages['conv-1']).toHaveLength(2);
    expect(store.getState().messages['conv-1'][0].id).toBe('new-1');
  });
});

// ---------------------------------------------------------------------------
// deleteMessage (via ref)
// ---------------------------------------------------------------------------

describe('deleteMessage', () => {
  it('removes message by ref', () => {
    store.getState().pushMessage('conv-1', makeMsg({ id: 'del-1' }));
    store.getState().pushMessage('conv-1', makeMsg({ id: 'keep-1' }));
    store.getState().deleteMessage({ channel_id: 'conv-1', message_id: 'del-1' });
    const ids = store.getState().messages['conv-1'].map(m => m.id);
    expect(ids).toEqual(['keep-1']);
  });
});

// ---------------------------------------------------------------------------
// editMessage
// ---------------------------------------------------------------------------

describe('editMessage', () => {
  it('updates content and clears editingMsgId', () => {
    store.getState().pushMessage('conv-1', makeMsg({ id: 'edit-1', content: 'before' }));
    store.getState().setEditingMsg('edit-1');
    store.getState().editMessage('conv-1', 'edit-1', 'after');
    expect(store.getState().messages['conv-1'][0].content).toBe('after');
    expect(store.getState().editingMsgId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// updateConvSettings
// ---------------------------------------------------------------------------

describe('updateConvSettings', () => {
  it('merges settings into the conversation', () => {
    store.getState().addConversation(makeConv({ id: 'settings-1' }));
    store.getState().updateConvSettings('settings-1', { engine: 'gemini', model: 'pro' });
    const conv = store.getState().conversations['settings-1'];
    expect(conv.engine).toBe('gemini');
    expect(conv.model).toBe('pro');
  });

  it('is a no-op for unknown convId', () => {
    const before = store.getState().conversations;
    store.getState().updateConvSettings('ghost', { engine: 'x' });
    expect(store.getState().conversations).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// setReplyTo / clearReplyTo
// ---------------------------------------------------------------------------

describe('replyTo', () => {
  it('sets and clears replyTo', () => {
    store.getState().setReplyTo('msg-1', 'hello');
    expect(store.getState().replyTo).toEqual({ msgId: 'msg-1', content: 'hello' });
    store.getState().clearReplyTo();
    expect(store.getState().replyTo).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// setEditingMsg
// ---------------------------------------------------------------------------

describe('setEditingMsg', () => {
  it('sets and clears editingMsgId', () => {
    store.getState().setEditingMsg('msg-x');
    expect(store.getState().editingMsgId).toBe('msg-x');
    store.getState().setEditingMsg(null);
    expect(store.getState().editingMsgId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// clearMessages
// ---------------------------------------------------------------------------

describe('clearMessages', () => {
  it('removes all messages for a conversation', () => {
    store.getState().pushMessage('conv-1', makeMsg({ id: 'm1' }));
    store.getState().pushMessage('conv-1', makeMsg({ id: 'm2' }));
    store.getState().clearMessages('conv-1');
    expect(store.getState().messages['conv-1']).toBeUndefined();
  });

  it('does not affect other conversations', () => {
    store.getState().pushMessage('conv-1', makeMsg({ id: 'm1' }));
    store.getState().pushMessage('conv-2', makeMsg({ id: 'm2' }));
    store.getState().clearMessages('conv-1');
    expect(store.getState().messages['conv-2']).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// setMockMode
// ---------------------------------------------------------------------------

describe('setMockMode', () => {
  it('toggles mock mode', () => {
    store.getState().setMockMode(true);
    expect(store.getState().isMockMode).toBe(true);
    store.getState().setMockMode(false);
    expect(store.getState().isMockMode).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getProjectConversations
// ---------------------------------------------------------------------------

describe('getProjectConversations', () => {
  it('returns conversations filtered by projectKey', () => {
    store.getState().addConversation(makeConv({ id: 'c1', projectKey: 'proj-a' }));
    store.getState().addConversation(makeConv({ id: 'c2', projectKey: 'proj-b' }));
    store.getState().addConversation(makeConv({ id: 'c3', projectKey: 'proj-a' }));
    const result = store.getState().getProjectConversations('proj-a');
    expect(result).toHaveLength(2);
    expect(result.map(c => c.id).sort()).toEqual(['c1', 'c3']);
  });

  it('returns empty array for unknown project', () => {
    expect(store.getState().getProjectConversations('unknown')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// setProjectsFromResult
// ---------------------------------------------------------------------------

describe('setProjectsFromResult', () => {
  it('maps configured entries with alias as name', () => {
    store.getState().setProjectsFromResult(
      [{ key: 'p1', alias: 'Project One', path: '/p1', default_engine: 'claude', type: 'project' }],
      [],
    );
    const proj = store.getState().projects.find(p => p.key === 'p1');
    expect(proj).toBeDefined();
    expect(proj!.name).toBe('Project One');
    expect(proj!.source).toBe('configured');
    expect(proj!.defaultEngine).toBe('claude');
  });

  it('maps discovered keys with key as name', () => {
    store.getState().setProjectsFromResult([], ['disc-key']);
    const proj = store.getState().projects.find(p => p.key === 'disc-key');
    expect(proj).toBeDefined();
    expect(proj!.name).toBe('disc-key');
    expect(proj!.source).toBe('discovered');
  });

  it('merges both configured and discovered into projects array', () => {
    store.getState().setProjectsFromResult(
      [{ key: 'cfg', alias: 'Config', path: null, default_engine: null, type: null }],
      ['disc'],
    );
    expect(store.getState().projects).toHaveLength(2);
  });

  it('replaces previous projects list entirely', () => {
    store.getState().setProjectsFromResult([], ['old']);
    store.getState().setProjectsFromResult([], ['new']);
    const keys = store.getState().projects.map(p => p.key);
    expect(keys).toEqual(['new']);
  });
});
