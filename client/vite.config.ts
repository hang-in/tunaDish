import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
// Tauri 런타임 없이 브라우저에서 실행 시 shim 사용 (E2E 테스트용)
// @ts-expect-error process is a nodejs global
const isTauri = !!process.env.TAURI_ENV_ARCH;

import path from "path";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // --mode mobile 또는 비-Tauri 환경이면 shim 적용
  const needsShims = mode === 'mobile' || !isTauri;

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        // 비-Tauri 환경(브라우저, E2E, 모바일 에뮬레이션)에서 Tauri API를 shim으로 대체
        ...(needsShims ? {
          "@tauri-apps/api/window": path.resolve(__dirname, "./e2e/tauri-shims/api-window.ts"),
          "@tauri-apps/api/core": path.resolve(__dirname, "./e2e/tauri-shims/api-core.ts"),
          "@tauri-apps/plugin-sql": path.resolve(__dirname, "./e2e/tauri-shims/plugin-sql.ts"),
        } : {}),
      },
    },

    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    //
    // 1. prevent Vite from obscuring rust errors
    clearScreen: false,
    // 2. tauri expects a fixed port, fail if that port is not available
    server: {
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host
        ? {
            protocol: "ws",
            host,
            port: 1421,
          }
        : undefined,
      watch: {
        // 3. tell Vite to ignore watching `src-tauri`
        ignored: ["**/src-tauri/**"],
      },
    },
  };
});
