# tunapi 측 구현 완료 보고 — tunaDish 후속 작업 프롬프트

## 완료 상태 (2026-03-22)

`transport-to-tunapi.md`에 명시된 모든 항목이 tunapi 레포에서 구현 완료됨.

### 1. git rev-parse 비동기화 — 완료

`backend.py:510~522` — `asyncio.create_subprocess_exec` 사용, 이벤트 루프 블로킹 없음.

### 2. per-session resume token (Step 0~8) — 전체 완료

| Step | 상태 | 설명 |
|------|------|------|
| 0 | ✅ | `src/tunapi/tunadish/session_store.py` — `ConversationSessionStore` 생성 |
| 1 | ✅ | `backend.py` — `self._conv_sessions` 초기화 (`~/.tunapi/tunadish_conv_sessions.json`) |
| 2 | ✅ | `_execute_run()` — conv별 토큰 우선 조회 → `effective_token` |
| 3 | ✅ | `_make_conv_token_saver()` 콜백 → `handle_message(on_thread_known=...)` |
| 4 | ✅ | `commands.py` — `!new` 시 `conv_sessions.clear(channel_id)` |
| 5 | ✅ | `_handle_project_context()` — conv별 토큰 우선 반환 |
| 6 | ✅ | `_build_cross_session_summary()` — 같은 프로젝트 다른 세션 최근 활동 요약 |
| 7 | ✅ | `_execute_run()` — rawq 주입 직후 `<sibling_sessions>` 블록 주입 |
| 8 | ✅ | `conversation.history` — `_SIBLING_CONTEXT_RE`로 스트리핑 |

### 3. Phase 4 RPC 메서드 — tunapi 측 완료

7개 핸들러 구현 + 17개 테스트 통과:

| 메서드 | 핸들러 | 응답 notification |
|--------|--------|-------------------|
| `discussion.save_roundtable` | `_handle_discussion_save` | `discussion.save_roundtable.result` |
| `discussion.link_branch` | `_handle_discussion_link_branch` | `discussion.link_branch.result` |
| `synthesis.create_from_discussion` | `_handle_synthesis_create` | `synthesis.create.result` |
| `review.request` | `_handle_review_request` | `review.request.result` |
| `handoff.create` | `_handle_handoff_create` | `handoff.create.result` |
| `handoff.parse` | `_handle_handoff_parse` | `handoff.parse.result` |
| `engine.list` | `_handle_engine_list` | `engine.list.result` |

---

## tunaDish 프론트엔드 후속 작업

### 1. Phase 4 RPC 클라이언트 구현

tunapi에 추가된 7개 RPC 메서드를 프론트엔드에서 호출할 수 있도록 WebSocket 클라이언트를 확장한다.

#### 호출 형식 (JSON-RPC)

```json
{"method": "discussion.save_roundtable", "params": {
  "project": "myproject",
  "discussion_id": "disc-1",
  "topic": "API 설계",
  "participants": ["claude", "gemini"],
  "rounds": 2,
  "transcript": [["claude", "REST 사용"], ["gemini", "동의"]],
  "summary": "REST API 채택",
  "branch_name": "feature/api",
  "auto_synthesis": true
}}
```

#### 각 메서드 params 스펙

**`discussion.save_roundtable`**
- `project` (필수): 프로젝트 alias
- `discussion_id`: 토론 ID (미입력 시 자동 생성)
- `topic`: 토론 주제
- `participants`: 참여 엔진 목록
- `rounds`: 라운드 수
- `transcript`: `[engine, text]` 배열
- `summary`: 요약 (선택)
- `branch_name`: 연결할 브랜치 (선택, 양방향 링크 자동)
- `auto_synthesis`: `true`이면 SynthesisArtifact 자동 생성

**`discussion.link_branch`**
- `project` (필수)
- `discussion_id` (필수)
- `branch_name` (필수)

**`synthesis.create_from_discussion`**
- `project` (필수)
- `discussion_id` (필수)

**`review.request`**
- `project` (필수)
- `artifact_id` (필수)

**`handoff.create`**
- `project` (필수)
- `session_id`, `branch_id`, `focus`, `pending_run_id`: 모두 선택

**`handoff.parse`**
- `uri` (필수): `tunapi://open?...` 형식

**`engine.list`**
- params 없음

#### 응답 수신

각 메서드 호출 후 `{method}.result` notification으로 결과가 돌아온다.
에러 시 `params.error` 문자열이 포함된다.

### 2. per-session resume token — 프론트엔드 영향

프론트엔드 코드 수정은 **불필요**하다.
- `project.context` 응답의 `resume_token` 필드가 이제 conv별 토큰을 우선 반환함
- 기존 프론트엔드 로직이 이 필드를 사용하고 있다면 자동으로 conv별 토큰이 적용됨

### 3. 크로스 세션 요약 — 프론트엔드 영향

프론트엔드 코드 수정은 **불필요**하다.
- `<sibling_sessions>` 블록은 서버에서 주입하고 history 반환 시 자동 제거됨
- 사용자에게는 노출되지 않음

### 4. transport/ 디렉토리 제거 확인

tunaDish 레포의 `transport/` 디렉토리가 이미 백업 후 제거된 상태인지 확인한다.
만약 아직 남아있다면:
1. `transport/` 디렉토리 백업 (예: `transport_backup_20260322/`)
2. `transport/` 디렉토리 제거
3. `pip uninstall tunadish-transport` (editable install 해제)

---

## 테스트 현황

tunapi 레포 전체 테스트: **1057개 통과** (0 실패)
- `test_tunadish_phase4.py`: Phase 4 RPC 핸들러 17개 테스트
- `test_tunadish_session_store.py`: ConversationSessionStore 8개 테스트
