/**
 * @tauri-apps/plugin-sql shim — 브라우저 E2E 테스트용.
 * DB 호출은 no-op, isTauriEnv()가 false를 반환하므로 실제로 호출되지 않음.
 */
class MockDatabase {
  async execute() { return { rowsAffected: 0, lastInsertId: 0 }; }
  async select() { return []; }
}

export default {
  load: () => Promise.resolve(new MockDatabase()),
};
