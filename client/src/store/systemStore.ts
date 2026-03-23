import { create } from 'zustand';

// --- sessionStorage persistence for branch panel (HMR 리로드 복원용) ---
const SS_KEY_BRANCH = 'tunadish:branchPanel';

interface BranchPanelState {
  branchId: string | null;
  convId: string | null;
  label: string;
  projectKey: string | null;
  checkpointId: string | null;
}

function saveBranchPanel(state: BranchPanelState) {
  try { sessionStorage.setItem(SS_KEY_BRANCH, JSON.stringify(state)); } catch { /* ignore */ }
}

function loadBranchPanel(): BranchPanelState {
  try {
    const raw = sessionStorage.getItem(SS_KEY_BRANCH);
    return raw ? JSON.parse(raw) : { branchId: null, convId: null, label: '', projectKey: null, checkpointId: null };
  } catch { return { branchId: null, convId: null, label: '', projectKey: null, checkpointId: null }; }
}

interface SystemState {
  isConnected: boolean;
  isDbConnected: boolean;
  sidebarOpen: boolean;
  contextPanelOpen: boolean;
  sidebarWidth: number;
  contextPanelWidth: number;

  // Branch slide panel (right 1/3, replaces multi-window)
  branchPanelOpen: boolean;
  branchPanelBranchId: string | null;
  branchPanelConvId: string | null;
  branchPanelLabel: string;
  branchPanelProjectKey: string | null;
  branchPanelCheckpointId: string | null;

  // Mobile UI state
  mobileSearchOpen: boolean;
  mobileSettingsSheetOpen: boolean;

  // Connection setup
  connectionStatus: 'idle' | 'connecting' | 'connected' | 'failed';
  recentServers: string[];

  setConnected: (status: boolean) => void;
  setDbConnected: (status: boolean) => void;
  toggleSidebar: () => void;
  toggleContextPanel: () => void;
  setSidebarOpen: (open: boolean) => void;
  setContextPanelOpen: (open: boolean) => void;
  setSidebarWidth: (w: number) => void;
  setContextPanelWidth: (w: number) => void;
  openBranchPanel: (branchId: string, convId: string, label: string, projectKey: string, checkpointId?: string) => void;
  closeBranchPanel: () => void;
  setMobileSearchOpen: (open: boolean) => void;
  setMobileSettingsSheetOpen: (open: boolean) => void;
  setConnectionStatus: (status: 'idle' | 'connecting' | 'connected' | 'failed') => void;
  addRecentServer: (url: string) => void;
}

export const useSystemStore = create<SystemState>((set) => ({
  isConnected: false,
  isDbConnected: false,
  sidebarOpen: true,
  contextPanelOpen: true,
  sidebarWidth: 256,
  contextPanelWidth: 300,
  branchPanelOpen: !!loadBranchPanel().branchId,
  branchPanelBranchId: loadBranchPanel().branchId,
  branchPanelConvId: loadBranchPanel().convId,
  branchPanelLabel: loadBranchPanel().label,
  branchPanelProjectKey: loadBranchPanel().projectKey,
  branchPanelCheckpointId: loadBranchPanel().checkpointId,

  mobileSearchOpen: false,
  mobileSettingsSheetOpen: false,
  connectionStatus: 'idle' as const,
  recentServers: (() => {
    try {
      const raw = localStorage.getItem('tunadish:recentServers');
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  })(),

  setConnected: (status) => set({ isConnected: status }),
  setDbConnected: (status) => set({ isDbConnected: status }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleContextPanel: () => set((s) => ({ contextPanelOpen: !s.contextPanelOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setContextPanelOpen: (open) => set({ contextPanelOpen: open }),
  setSidebarWidth: (w) => set({ sidebarWidth: w }),
  setContextPanelWidth: (w) => set({ contextPanelWidth: w }),
  openBranchPanel: (branchId, convId, label, projectKey, checkpointId) => {
    saveBranchPanel({ branchId, convId, label, projectKey, checkpointId: checkpointId ?? null });
    set({
      branchPanelOpen: true,
      branchPanelBranchId: branchId,
      branchPanelConvId: convId,
      branchPanelLabel: label,
      branchPanelProjectKey: projectKey,
      branchPanelCheckpointId: checkpointId ?? null,
    });
  },
  closeBranchPanel: () => {
    saveBranchPanel({ branchId: null, convId: null, label: '', projectKey: null, checkpointId: null });
    set({
      branchPanelOpen: false,
      branchPanelBranchId: null,
      branchPanelConvId: null,
      branchPanelLabel: '',
      branchPanelProjectKey: null,
      branchPanelCheckpointId: null,
    });
  },
  setMobileSearchOpen: (open) => set({ mobileSearchOpen: open }),
  setMobileSettingsSheetOpen: (open) => set({ mobileSettingsSheetOpen: open }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  addRecentServer: (url) => set((s) => {
    const filtered = s.recentServers.filter(u => u !== url);
    const updated = [url, ...filtered].slice(0, 5);
    try { localStorage.setItem('tunadish:recentServers', JSON.stringify(updated)); } catch { /* ignore */ }
    return { recentServers: updated };
  }),
}));
