# Handoff — 2026-03-22

## 아키텍처 변경: transport 이전

tunadish transport(Python 백엔드)가 tunapi 레포 내부로 이전됨.

- **이전**: `tunaDish/transport/src/tunadish_transport/` → `tunapi/src/tunapi/tunadish/`
- **이 레포**: 클라이언트(Tauri/React) + docs + vendor/rawq만 관리
- **백업**: `transport.bak/` (정상 동작 확인 후 삭제 가능)
- **entry point**: `tunapi.tunadish.backend:BACKEND` (tunapi pyproject.toml에 등록)

### tunapi 쪽 미완료 작업

`docs/prompts/migration/transport-to-tunapi.md` 참조:
1. git rev-parse 비동기화 (tunapi 쪽 backend.py에 적용 필요)
2. per-session resume token 구현 (Step 0~8)

---

## 이번 세션 변경 (tunaDish 레포)

### 1. 세션 클릭 랙 최적화

| 변경 | 파일 | 내용 |
|------|------|------|
| project.context 캐싱 | `client/src/lib/contextCache.ts` (신규), `ChatArea.tsx`, `wsClient.ts` | conv별 로드 추적, 동일 conv 재요청 생략, command 후 무효화+재요청 |
| git rev-parse 비동기화 | ~~`transport/.../backend.py`~~ (제거됨) | `subprocess.run` → `asyncio.create_subprocess_exec` — tunapi 쪽에 재적용 필요 |

### 2. 마지막 활성 세션 복원

| 파일 | 내용 |
|------|------|
| `client/src/store/chatStore.ts` | localStorage에 `tunadish:lastProjectKey`, `tunadish:lastConvId` 저장/복원 |

시작 시 이전 세션 자동 로드. 삭제된 세션 ID가 남아도 안전 (conv 없으면 무시).

### 3. rawq 통합 (이전 세션)

rawq 코드베이스 컨텍스트 검색 엔진 통합. 설계: `docs/prompts/integration/rawq_integration.md`

| 항목 | 내용 |
|------|------|
| submodule | `vendor/rawq` (https://github.com/auyelbekov/rawq.git, v0.1.1) |
| sidecar | `client/src-tauri/tauri.conf.json` — `bundle.externalBin` |
| 빌드 | `./scripts/build-rawq.sh --release` |
| 업데이트 | `./scripts/update-rawq.sh [--apply]` |
| 타임아웃 | search/map 30s, index build 300s |

### 4. transport 제거

- `transport/` 디렉토리 git rm
- `tunadish-transport` pip uninstall
- entry point 충돌 해소 (tunapi 쪽만 남음)

---

## 설계 문서

| 문서 | 상태 | 내용 |
|------|------|------|
| `docs/prompts/architecture/per-session-resume-token.md` | 설계 완료, 미구현 | 세션별 독립 토큰 + 크로스 세션 요약 |
| `docs/prompts/migration/transport-to-tunapi.md` | 작성 완료 | tunapi 쪽 후속 작업 지시 |
| `docs/prompts/integration/rawq_integration.md` | 구현 완료 | rawq 통합 상세 |

---

## 검증 필요

1. **tunapi 실행 테스트**: `tunapi run --transport tunadish` → WebSocket 정상 연결
2. **rawq 빌드/동작**: `./scripts/build-rawq.sh --release` → 검색 확인
3. **세션 복원**: 앱 재시작 시 이전 세션 자동 로드
4. **BranchPanel checkpoint 컨텍스트**: 미검증 상태

## 다음 우선순위

1. tunapi 쪽 미완료 작업 수행 (`transport-to-tunapi.md`)
2. UI 정상화 (Sprint 7 진입 전 선행 조건)
3. per-session resume token 구현
4. Sprint 7 — `development_plan.md` 6절 참고
