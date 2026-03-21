import { create } from 'zustand';

interface SystemState {
  isConnected: boolean;
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

  setConnected: (status: boolean) => void;
  toggleSidebar: () => void;
  toggleContextPanel: () => void;
  setSidebarOpen: (open: boolean) => void;
  setContextPanelOpen: (open: boolean) => void;
  setSidebarWidth: (w: number) => void;
  setContextPanelWidth: (w: number) => void;
  openBranchPanel: (branchId: string, convId: string, label: string, projectKey: string) => void;
  closeBranchPanel: () => void;
}

export const useSystemStore = create<SystemState>((set) => ({
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

  setConnected: (status) => set({ isConnected: status }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleContextPanel: () => set((s) => ({ contextPanelOpen: !s.contextPanelOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setContextPanelOpen: (open) => set({ contextPanelOpen: open }),
  setSidebarWidth: (w) => set({ sidebarWidth: w }),
  setContextPanelWidth: (w) => set({ contextPanelWidth: w }),
  openBranchPanel: (branchId, convId, label, projectKey) => set({
    branchPanelOpen: true,
    branchPanelBranchId: branchId,
    branchPanelConvId: convId,
    branchPanelLabel: label,
    branchPanelProjectKey: projectKey,
  }),
  closeBranchPanel: () => set({
    branchPanelOpen: false,
    branchPanelBranchId: null,
    branchPanelConvId: null,
    branchPanelLabel: '',
    branchPanelProjectKey: null,
  }),
}));
