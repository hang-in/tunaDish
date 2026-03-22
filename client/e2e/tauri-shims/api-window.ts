/**
 * @tauri-apps/api/window shim — 브라우저 E2E 테스트용.
 * Tauri 런타임 없이 앱이 렌더될 수 있도록 no-op 구현.
 */
const noopWindow = {
  startDragging: () => {},
  minimize: () => {},
  toggleMaximize: () => Promise.resolve(),
  isMaximized: () => Promise.resolve(false),
  close: () => {},
  setFocus: () => {},
};

export function getCurrentWindow() {
  return noopWindow;
}
