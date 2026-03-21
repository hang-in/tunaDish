import { describe, it, expect, beforeEach } from 'vitest';
import { useContextStore } from '@/store/contextStore';
import type {
  ContextTab,
  ProjectContext,
  MemoryEntry,
  GitBranch,
  ConversationBranch,
  ReviewEntry,
  ProgressState,
} from '@/store/contextStore';

const store = useContextStore;

// Zustand v5: partial setState only — never pass replace=true as it wipes action functions.
function resetStore() {
  store.setState({
    activeTab: 'overview',
    projectContext: null,
    memoryEntries: [],
    gitBranches: [],
    convBranches: [],
    reviews: [],
    progress: null,
  });
}

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------

function makeMemoryEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: 'mem-1',
    type: 'decision',
    title: 'Use Zustand',
    content: 'Decided to use Zustand for state management.',
    source: 'discussion',
    tags: ['state', 'architecture'],
    timestamp: 1_000_000,
    ...overrides,
  };
}

function makeGitBranch(overrides: Partial<GitBranch> = {}): GitBranch {
  return {
    name: 'feat/sprint-7',
    status: 'active',
    description: 'Sprint 7 stability work',
    linkedEntryCount: 2,
    linkedDiscussionCount: 1,
    ...overrides,
  };
}

function makeConvBranch(overrides: Partial<ConversationBranch> = {}): ConversationBranch {
  return {
    id: 'cb-1',
    label: 'branch-session',
    status: 'active',
    ...overrides,
  };
}

function makeReviewEntry(overrides: Partial<ReviewEntry> = {}): ReviewEntry {
  return {
    id: 'rev-1',
    artifactId: 'art-42',
    artifactVersion: 3,
    status: 'pending',
    reviewerComment: 'Looks good, minor nits.',
    createdAt: 2_000_000,
    ...overrides,
  };
}

function makeProjectContext(overrides: Partial<ProjectContext> = {}): ProjectContext {
  return {
    project: 'tunadish',
    engine: 'claude',
    model: 'claude-3-5-sonnet',
    triggerMode: 'always',
    persona: null,
    resumeToken: null,
    gitCurrentBranch: 'main',
    availableEngines: { claude: ['claude-3-5-sonnet', 'claude-3-opus'] },
    memoryEntries: [makeMemoryEntry()],
    activeBranches: [makeGitBranch()],
    convBranches: [makeConvBranch()],
    pendingReviewCount: 0,
    recentDiscussions: [],
    markdown: '# tunadish\nProject overview.',
    ...overrides,
  };
}

function makeProgressState(overrides: Partial<ProgressState> = {}): ProgressState {
  return {
    engine: 'claude',
    model: 'claude-3-5-sonnet',
    step: 2,
    totalSteps: 5,
    elapsed: 1234,
    actions: [{ tool: 'read_file', phase: 'completed', ok: true }],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetStore();
});

// ---------------------------------------------------------------------------
// setActiveTab
// ---------------------------------------------------------------------------

describe('setActiveTab', () => {
  it('changes activeTab to memory', () => {
    store.getState().setActiveTab('memory');
    expect(store.getState().activeTab).toBe<ContextTab>('memory');
  });

  it('changes activeTab to branches', () => {
    store.getState().setActiveTab('branches');
    expect(store.getState().activeTab).toBe<ContextTab>('branches');
  });

  it('changes activeTab back to overview', () => {
    store.getState().setActiveTab('branches');
    store.getState().setActiveTab('overview');
    expect(store.getState().activeTab).toBe<ContextTab>('overview');
  });
});

// ---------------------------------------------------------------------------
// setProjectContext
// ---------------------------------------------------------------------------

describe('setProjectContext', () => {
  it('stores the full context object', () => {
    const ctx = makeProjectContext();
    store.getState().setProjectContext(ctx);
    expect(store.getState().projectContext).toEqual(ctx);
  });

  it('derives memoryEntries from ctx.memoryEntries', () => {
    const entries = [makeMemoryEntry({ id: 'mem-a' }), makeMemoryEntry({ id: 'mem-b' })];
    const ctx = makeProjectContext({ memoryEntries: entries });
    store.getState().setProjectContext(ctx);
    expect(store.getState().memoryEntries).toEqual(entries);
  });

  it('derives gitBranches from ctx.activeBranches', () => {
    const branches = [makeGitBranch({ name: 'feat/x' }), makeGitBranch({ name: 'fix/y' })];
    const ctx = makeProjectContext({ activeBranches: branches });
    store.getState().setProjectContext(ctx);
    expect(store.getState().gitBranches).toEqual(branches);
  });

  it('derives convBranches from ctx.convBranches', () => {
    const convs = [makeConvBranch({ id: 'cb-x' }), makeConvBranch({ id: 'cb-y' })];
    const ctx = makeProjectContext({ convBranches: convs });
    store.getState().setProjectContext(ctx);
    expect(store.getState().convBranches).toEqual(convs);
  });

  it('does not affect reviews or progress', () => {
    store.setState({ reviews: [makeReviewEntry()], progress: makeProgressState() });
    store.getState().setProjectContext(makeProjectContext());
    expect(store.getState().reviews).toHaveLength(1);
    expect(store.getState().progress).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// setMemoryEntries
// ---------------------------------------------------------------------------

describe('setMemoryEntries', () => {
  it('replaces existing entries with the new array', () => {
    store.setState({ memoryEntries: [makeMemoryEntry({ id: 'old' })] });
    const newEntries = [makeMemoryEntry({ id: 'new-1' }), makeMemoryEntry({ id: 'new-2' })];
    store.getState().setMemoryEntries(newEntries);
    expect(store.getState().memoryEntries).toEqual(newEntries);
  });

  it('accepts an empty array and clears existing entries', () => {
    store.setState({ memoryEntries: [makeMemoryEntry()] });
    store.getState().setMemoryEntries([]);
    expect(store.getState().memoryEntries).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// setBranches
// ---------------------------------------------------------------------------

describe('setBranches', () => {
  it('replaces both gitBranches and convBranches', () => {
    const git = [makeGitBranch({ name: 'main' }), makeGitBranch({ name: 'develop' })];
    const conv = [makeConvBranch({ id: 'cb-a' })];
    store.getState().setBranches(git, conv);
    expect(store.getState().gitBranches).toEqual(git);
    expect(store.getState().convBranches).toEqual(conv);
  });

  it('clears previous gitBranches when new array is empty', () => {
    store.setState({ gitBranches: [makeGitBranch()] });
    store.getState().setBranches([], []);
    expect(store.getState().gitBranches).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// setReviews
// ---------------------------------------------------------------------------

describe('setReviews', () => {
  it('replaces existing reviews with the new list', () => {
    store.setState({ reviews: [makeReviewEntry({ id: 'old-rev' })] });
    const newReviews = [makeReviewEntry({ id: 'r-1' }), makeReviewEntry({ id: 'r-2' })];
    store.getState().setReviews(newReviews);
    expect(store.getState().reviews).toEqual(newReviews);
  });

  it('accepts an empty array', () => {
    store.setState({ reviews: [makeReviewEntry()] });
    store.getState().setReviews([]);
    expect(store.getState().reviews).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// setProgress
// ---------------------------------------------------------------------------

describe('setProgress', () => {
  it('stores a ProgressState object', () => {
    const progress = makeProgressState();
    store.getState().setProgress(progress);
    expect(store.getState().progress).toEqual(progress);
  });

  it('clears progress when called with null', () => {
    store.setState({ progress: makeProgressState() });
    store.getState().setProgress(null);
    expect(store.getState().progress).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// clear
// ---------------------------------------------------------------------------

describe('clear', () => {
  it('resets all data fields to their defaults', () => {
    store.setState({
      projectContext: makeProjectContext(),
      memoryEntries: [makeMemoryEntry()],
      gitBranches: [makeGitBranch()],
      convBranches: [makeConvBranch()],
      reviews: [makeReviewEntry()],
      progress: makeProgressState(),
    });

    store.getState().clear();

    const s = store.getState();
    expect(s.projectContext).toBeNull();
    expect(s.memoryEntries).toHaveLength(0);
    expect(s.gitBranches).toHaveLength(0);
    expect(s.convBranches).toHaveLength(0);
    expect(s.reviews).toHaveLength(0);
    expect(s.progress).toBeNull();
  });

  it('preserves activeTab (clear does not reset UI state)', () => {
    store.getState().setActiveTab('branches');
    store.getState().clear();
    // activeTab is not part of the clear spec — the store keeps it as-is
    expect(store.getState().activeTab).toBe<ContextTab>('branches');
  });
});
