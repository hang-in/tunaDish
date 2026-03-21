import '@testing-library/jest-dom';

// Tauri invoke mock
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Tauri window mock
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    startDragging: vi.fn(),
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    isMaximized: vi.fn().mockResolvedValue(false),
    close: vi.fn(),
    setFocus: vi.fn(),
  }),
}));
