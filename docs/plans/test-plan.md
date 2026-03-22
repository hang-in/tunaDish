# tunaDish 테스트 계획

> 작성일: 2026-03-21
> 갱신일: 2026-03-21
> 기반: 코드베이스 조사 + development_plan.md Sprint 7 요구사항

---

## 1. 현황

| 항목 | 상태 |
|------|------|
| transport (Python) 테스트 | **45개 통과** (pytest). `presenter`, `context_store`, `transport`, `commands` 커버 |
| client (React/TS) 테스트 | **90개 통과** (vitest). stores 4개 + `windowContext` + `wsClient` 핸들러 커버 |
| Tauri (Rust) 테스트 | 없음. 커맨드 3개, e2e에서 커버 예정 |
| e2e 테스트 | 미착수. tunapi CLI 로딩 이슈 블로킹 (Sprint 7 6.1절) |
| 검증 수단 | `pytest` + `vitest` + `tsc --noEmit` + `vite build` + `cargo check` |

---

## 2. 테스트 전략

tunapi CLI 로딩 이슈(e2e 블로커)와 독립적으로 진행 가능한 유닛/통합 테스트를 먼저 구축한다.

```
              ┌─────────────────────────────┐
              │  e2e (블로커: tunapi CLI)    │  ← Phase 4: Sprint 7 6.1절 해결 후
              ├─────────────────────────────┤
              │  컴포넌트 테스트             │  ← Phase 3: 기능 안정화 시
              ├─────────────────────────────┤
              │  유닛/통합 테스트            │  ✅ Phase 0-2 완료 (135개)
              └─────────────────────────────┘
```

### 원칙
- **e2e 블로커에 의존하지 않는 테스트부터** 시작
- **버그 방지 가치가 높은 코드**를 우선 커버 (스토어 액션, WS 메시지 핸들링, 명령 디스패치)
- 각 레이어(transport/client)가 **자체 테스트 러너**를 가짐 — 결합하지 않음

---

## 3. 완료된 테스트 (Phase 0-2)

### 3.1 Transport (Python) — 45개 테스트

```
transport/tests/
  conftest.py              # 공통 fixtures (ProgressState, context_store, mock_ws 등)
  test_presenter.py        # 9개 — render_progress/render_final 전체 경로
  test_context_store.py    # 16개 — CRUD, 필터링, persistence, 에러 핸들링
  test_transport.py        # 9개 — send/edit/delete JSON 직렬화, WS 에러 처리
  test_commands.py         # 11개 — _resolve_id 전체 경로, dispatch 라우팅
```

실행: `cd transport && python3 -m pytest tests/ -v`

### 3.2 Client (React/TS) — 90개 테스트

```
client/src/
  test/setup.ts                          # Tauri mock (invoke, window)
  store/__tests__/chatStore.test.ts      # 27개 — 전체 액션 커버
  store/__tests__/systemStore.test.ts    # 17개 — 토글/세터 전체
  store/__tests__/contextStore.test.ts   # 15개 — setProjectContext 파생 데이터 포함
  store/__tests__/runStore.test.ts       # 11개 — 상태 변경 + cancel 롤백
  lib/__tests__/windowContext.test.ts    # 8개 — URL 파싱 + 캐시 격리
  lib/__tests__/wsClient.test.ts         # 12개 — handleNotification 10개 이벤트 타입
```

실행: `cd client && npm test`

### 3.3 Tauri (Rust)

커맨드 3개(`greet`, `open_branch_window`, `close_branch_window`)는 모두 `tauri::AppHandle` 의존. 유닛 테스트 투자 대비 효과 낮음.

**결론**: e2e에서 커버. 별도 유닛 테스트 작성하지 않음.

---

## 4. 남은 Phase — 착수 시점 및 트리거

### Phase 3: 컴포넌트 테스트 — _기능 안정화 후, Phase 2 진입 전_

| 트리거 | 브랜치 멀티윈도우 등 주요 기능 개발 완료 후, UI 회귀 방지가 필요해질 때 |
|--------|-----------------------------------------------------------------------|
| 범위 | `BranchIndicator`, `TopNav` (단순) → `ChatArea`, `InputArea` (복잡) |
| 도구 | `@testing-library/react` (이미 설치됨) |
| 예상 | 3개 파일, ~15개 테스트 |

착수 기준:
- Phase 2까지의 135개 테스트가 CI에서 안정적으로 통과
- 컴포넌트 레벨 버그가 반복 발생하여 자동화 필요성 대두

### Phase 4: e2e 테스트 — _tunapi CLI 블로커 해소 후_

| 트리거 | `tunapi run --transport tunadish` 정상 기동 확인 시 (Sprint 7 6.1절) |
|--------|----------------------------------------------------------------------|
| 전제 | tunapi CLI 로딩 이슈 디버깅 및 해결 |
| 범위 | WS round-trip 검증 7개 시나리오 |

시나리오:

| # | 시나리오 | 검증 포인트 |
|---|---------|------------|
| 1 | 연결 및 프로젝트 로드 | WS 연결 → project.list → 사이드바 프로젝트 표시 |
| 2 | 대화 생성 및 메시지 송수신 | conversation.create → chat.send → message.new 수신 → 화면 표시 |
| 3 | 브랜치 라이프사이클 | branch.create → 윈도우 열림 → 채팅 → branch.adopt → 윈도우 닫힘 + 메인에 요약 |
| 4 | 브랜치 삭제 | branch.delete → 윈도우 닫힘 + 목록에서 제거 |
| 5 | 실행 취소 | run.cancel → run.status idle 수신 |
| 6 | WS 재연결 | 서버 종료 → 재시작 → 자동 재연결 + 상태 복구 |
| 7 | 프로젝트 컨텍스트 | project.context → 우측 패널 엔진/모델/브랜치 정보 표시 |

수동 체크리스트 (자동화 전):
```
[ ] tunapi run --transport tunadish 기동 성공
[ ] 클라이언트 WS 연결 (isConnected = true)
[ ] project.list → 사이드바에 프로젝트 표시
[ ] conversation.create → 세션 생성
[ ] chat.send → 에이전트 실행 → message.new 수신
[ ] run.cancel → 실행 중단
[ ] WS 끊김 → 자동 재연결
```

### Phase 5: CI 연동 — _Phase 4 완료 후 또는 팀 규모 확대 시_

| 트리거 | e2e 파이프라인 구축 완료, 또는 PR 리뷰 프로세스 도입 시 |
|--------|-------------------------------------------------------|
| 범위 | GitHub Actions: `pytest` + `vitest` + `cargo check` |

---

## 5. 커버리지 현황

| 레이어 | 현재 (Phase 1-2) | Phase 3 목표 | 최종 목표 |
|--------|:-----------------:|:------------:|:---------:|
| Transport (Python) | ~70% | 70% | 85% |
| Client stores | ~90% | 90% | 95% |
| Client lib | ~60% | 60% | 80% |
| Client components | 0% | 40% | 60% |
| e2e | 0% | 0% | 수동 체크리스트 100% |

---

## 6. 테스트 실적

| 레이어 | 테스트 파일 | 테스트 수 | 상태 |
|--------|:-----------:|:---------:|:----:|
| Transport conftest | 1 | — | ✅ |
| Transport P0 (presenter, context_store) | 2 | 25 | ✅ |
| Transport P1 (transport, commands) | 2 | 20 | ✅ |
| Client P0 (chatStore, systemStore, windowContext) | 3 | 52 | ✅ |
| Client P1 (contextStore, runStore, wsClient) | 3 | 38 | ✅ |
| **합계** | **11** | **135** | ✅ |
