/**
 * @tauri-apps/api/core shim — 브라우저 E2E 테스트용.
 */
export function invoke(..._args: unknown[]) {
  return Promise.resolve(null);
}
