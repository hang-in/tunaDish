# Handoff — 2026-03-22 (Sprint 7 진행 중)

## 아키텍처

tunadish transport(Python 백엔드)는 tunapi 레포 내부에 위치.

- **클라이언트**: `tunaDish/client/` (Tauri + React)
- **백엔드**: `tunapi/src/tunapi/tunadish/`
- **entry point**: `tunapi.tunadish.backend:BACKEND`
- **프로토콜**: WebSocket + JSON-RPC 2.0 (클라이언트 id 지원, 서버 표준 response 미적용)

---

## 완료된 작업

### e2e 검증
- tunapi transport 연결 확인: `project.list`, `conversation.list` 정상 응답
- PID 1980804로 tunadish 프로세스 실행 중
- Phase 4 RPC (`engine.list`)는 프로세스 재시작 필요 (이전 코드로 실행 중)

### 클라이언트 Sprint 7 완료 항목
| 항목 | 파일 | 내용 |
|------|------|------|
| JSON-RPC 2.0 정합성 | `wsClient.ts` | auto-increment `id`, pending map, Promise 기반 sendRpc, onclose 시 reject all |
| WS URL 설정 가능화 | `wsClient.ts` | `__TUNADISH_WS_URL__` / `localStorage(tunadish:wsUrl)` / 기본값 폴백 |
| 세션 클릭 랙 최적화 | `contextCache.ts`, `ChatArea.tsx` | project.context 캐싱, command 후 무효화 |
| 마지막 세션 복원 | `chatStore.ts` | localStorage 기반 |
| Phase 4 RPC 클라이언트 | `wsClient.ts`, `contextStore.ts` | 7개 메서드 + notification 핸들러 |
| transport.bak/ 삭제 | — | e2e 검증 후 삭제 완료 |

### tunapi 측 완료 (`tunapi-completed-status.md`)
- git rev-parse 비동기화
- per-session resume token (Step 0~8)
- Phase 4 RPC 핸들러 7개 (17개 테스트, 1057 전체 통과)

---

## tunapi Sprint 7 남은 작업

`docs/prompts/sprint7/tunapi-sprint7-tasks.md` 참조:

1. **JSON-RPC 2.0 서버 측 response** — request id 기반 `{jsonrpc, id, result/error}` 반환
2. **실행 타임아웃** — `_execute_run`에 `anyio.fail_after(300s)`
3. **WS 멀티클라이언트** — `_connections` set + broadcast + orphan run 정리
4. **WS URL/Port 설정** — `transport_config`에서 host/port 읽기
5. **코드 정리** — import 중복 등

---

## 설계 문서

| 문서 | 상태 |
|------|------|
| `docs/prompts/architecture/per-session-resume-token.md` | tunapi 구현 완료 |
| `docs/prompts/migration/transport-to-tunapi.md` | 완료 |
| `docs/prompts/migration/tunapi-completed-status.md` | 완료 보고 |
| `docs/prompts/sprint7/tunapi-sprint7-tasks.md` | 작업 지시 (미착수) |

---

## 검증 필요

1. **rawq 빌드/동작**: `./scripts/build-rawq.sh --release` → 검색 확인
2. **BranchPanel checkpoint 컨텍스트**: 미검증 상태
3. **Phase 4 RPC e2e**: tunapi 프로세스 재시작 후 `engine.list` 등 확인
