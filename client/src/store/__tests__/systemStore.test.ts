import { describe, it, expect, beforeEach } from 'vitest';
import { useSystemStore } from '@/store/systemStore';

const store = useSystemStore;

// Zustand v5: setState with replace=true would wipe action functions.
// Use partial setState (no replace flag) and reset only the data slices.
function resetStore() {
  store.setState({
    isConnected: false,
    sidebarOpen: true,
    contextPanelOpen: true,
    sidebarWidth: 256,
    contextPanelWidth: 300,
    branchPanelOpen: false,
    branchPanelBranchId: null,
    branchPanelConvId: null,
    branchPanelLabel: '',
    branchPanelProjectKey: null,
  });
}

beforeEach(() => {
  resetStore();
});

// ---------------------------------------------------------------------------
// setConnected
// ---------------------------------------------------------------------------

describe('setConnected', () => {
  it('sets isConnected to true', () => {
    store.getState().setConnected(true);
    expect(store.getState().isConnected).toBe(true);
  });

  it('sets isConnected to false', () => {
    store.setState({ isConnected: true });
    store.getState().setConnected(false);
    expect(store.getState().isConnected).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// toggleSidebar / setSidebarOpen
// ---------------------------------------------------------------------------

describe('toggleSidebar', () => {
  it('flips sidebarOpen from true to false', () => {
    store.getState().toggleSidebar();
    expect(store.getState().sidebarOpen).toBe(false);
  });

  it('flips sidebarOpen from false to true', () => {
    store.setState({ sidebarOpen: false });
    store.getState().toggleSidebar();
    expect(store.getState().sidebarOpen).toBe(true);
  });
});

describe('setSidebarOpen', () => {
  it('sets sidebarOpen to an explicit value', () => {
    store.getState().setSidebarOpen(false);
    expect(store.getState().sidebarOpen).toBe(false);
    store.getState().setSidebarOpen(true);
    expect(store.getState().sidebarOpen).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// toggleContextPanel / setContextPanelOpen
// ---------------------------------------------------------------------------

describe('toggleContextPanel', () => {
  it('flips contextPanelOpen from true to false', () => {
    store.getState().toggleContextPanel();
    expect(store.getState().contextPanelOpen).toBe(false);
  });

  it('flips contextPanelOpen from false to true', () => {
    store.setState({ contextPanelOpen: false });
    store.getState().toggleContextPanel();
    expect(store.getState().contextPanelOpen).toBe(true);
  });
});

describe('setContextPanelOpen', () => {
  it('sets contextPanelOpen to an explicit value', () => {
    store.getState().setContextPanelOpen(false);
    expect(store.getState().contextPanelOpen).toBe(false);
    store.getState().setContextPanelOpen(true);
    expect(store.getState().contextPanelOpen).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// setSidebarWidth / setContextPanelWidth
// ---------------------------------------------------------------------------

describe('setSidebarWidth', () => {
  it('updates sidebarWidth', () => {
    store.getState().setSidebarWidth(320);
    expect(store.getState().sidebarWidth).toBe(320);
  });
});

describe('setContextPanelWidth', () => {
  it('updates contextPanelWidth', () => {
    store.getState().setContextPanelWidth(400);
    expect(store.getState().contextPanelWidth).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// openBranchPanel / closeBranchPanel
// ---------------------------------------------------------------------------

describe('openBranchPanel', () => {
  it('opens branch panel with correct state', () => {
    store.getState().openBranchPanel('b1', 'conv1', 'My Branch', 'proj1');
    const s = store.getState();
    expect(s.branchPanelOpen).toBe(true);
    expect(s.branchPanelBranchId).toBe('b1');
    expect(s.branchPanelConvId).toBe('conv1');
    expect(s.branchPanelLabel).toBe('My Branch');
    expect(s.branchPanelProjectKey).toBe('proj1');
  });
});

describe('closeBranchPanel', () => {
  it('closes and clears branch panel state', () => {
    store.getState().openBranchPanel('b1', 'conv1', 'My Branch', 'proj1');
    store.getState().closeBranchPanel();
    const s = store.getState();
    expect(s.branchPanelOpen).toBe(false);
    expect(s.branchPanelBranchId).toBeNull();
  });
});
