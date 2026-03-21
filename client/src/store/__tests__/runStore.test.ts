import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useRunStore } from '@/store/runStore';
import type { RunStatus } from '@/store/runStore';

// vi.mock is hoisted before imports. The factory returns an object whose
// sendRpc property is a vi.fn(). Both this test file and runStore.ts will
// receive the same mocked module instance.
vi.mock('@/lib/wsClient', () => ({
  wsClient: { sendRpc: vi.fn(), connect: vi.fn() },
}));

// This import resolves AFTER the mock is in place, so wsClient.sendRpc is
// the vi.fn() created in the factory above — the same reference that
// runStore.ts captured at module evaluation time.
import { wsClient } from '@/lib/wsClient';

const store = useRunStore;

// Hold a stable reference to the mock fn so we can set per-test behaviour.
// We re-assign after clearAllMocks resets call history but keeps the mock fn.
const sendRpcMock = wsClient.sendRpc as ReturnType<typeof vi.fn>;

// Zustand v5: partial setState only — never pass replace=true.
function resetStore() {
  store.setState({ activeRuns: {} });
}

beforeEach(() => {
  resetStore();
  // resetAllMocks clears call history AND any queued one-time implementations
  // (mockResolvedValueOnce / mockRejectedValueOnce) left over from previous tests.
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// setRunStatus
// ---------------------------------------------------------------------------

describe('setRunStatus', () => {
  it('sets status for a single conversation', () => {
    store.getState().setRunStatus('conv-1', 'running');
    expect(store.getState().activeRuns['conv-1']).toBe<RunStatus>('running');
  });

  it('tracks multiple conversations independently', () => {
    store.getState().setRunStatus('conv-a', 'running');
    store.getState().setRunStatus('conv-b', 'idle');
    const runs = store.getState().activeRuns;
    expect(runs['conv-a']).toBe<RunStatus>('running');
    expect(runs['conv-b']).toBe<RunStatus>('idle');
  });

  it('overwrites a previous status for the same conversation', () => {
    store.getState().setRunStatus('conv-1', 'running');
    store.getState().setRunStatus('conv-1', 'idle');
    expect(store.getState().activeRuns['conv-1']).toBe<RunStatus>('idle');
  });

  it('does not disturb unrelated conversations when updating one', () => {
    store.getState().setRunStatus('conv-x', 'running');
    store.getState().setRunStatus('conv-y', 'running');
    store.getState().setRunStatus('conv-x', 'idle');
    expect(store.getState().activeRuns['conv-y']).toBe<RunStatus>('running');
  });
});

// ---------------------------------------------------------------------------
// requestCancel
// ---------------------------------------------------------------------------

describe('requestCancel', () => {
  it('immediately sets the conversation status to cancelling', async () => {
    store.getState().setRunStatus('conv-cancel', 'running');

    // Do not await so we can observe the synchronous state change.
    const promise = store.getState().requestCancel('conv-cancel');
    expect(store.getState().activeRuns['conv-cancel']).toBe<RunStatus>('cancelling');

    sendRpcMock.mockResolvedValueOnce(undefined);
    await promise;
  });

  it('calls wsClient.sendRpc with run.cancel and the conversation id', async () => {
    sendRpcMock.mockResolvedValueOnce(undefined);
    await store.getState().requestCancel('conv-rpc');
    expect(sendRpcMock).toHaveBeenCalledOnce();
    expect(sendRpcMock).toHaveBeenCalledWith('run.cancel', { conversation_id: 'conv-rpc' });
  });

  it('rolls back to running when sendRpc rejects', async () => {
    store.getState().setRunStatus('conv-err', 'running');
    sendRpcMock.mockRejectedValueOnce(new Error('network error'));

    await store.getState().requestCancel('conv-err');

    expect(store.getState().activeRuns['conv-err']).toBe<RunStatus>('running');
  });

  it('does not affect other conversations during a failed cancel', async () => {
    store.getState().setRunStatus('conv-other', 'running');
    store.getState().setRunStatus('conv-fail', 'running');
    sendRpcMock.mockRejectedValueOnce(new Error('fail'));

    await store.getState().requestCancel('conv-fail');

    expect(store.getState().activeRuns['conv-other']).toBe<RunStatus>('running');
  });
});
