# tunapi 쪽 작업지시: tunadish transport 이식 후 보완

## 배경

tunadish transport가 `tunapi/src/tunapi/tunadish/`로 이식 완료되었다.
tunaDish 레포의 `transport/` 디렉토리는 백업 후 제거되었다.

이 문서는 **tunapi 레포에서** 수행해야 할 후속 작업을 정리한다.

---

## 1. git rev-parse 비동기화

### 문제

`backend.py`의 `_handle_project_context()`에서 `subprocess.run()`으로 `git rev-parse`를 호출한다.
이는 **동기 호출**이라 이벤트 루프를 블로킹하여 세션 전환 시 랙을 유발한다.

### 변경 대상

`src/tunapi/tunadish/backend.py` — `_handle_project_context()` 내부

### 변경 내용

```python
# 변경 전 (동기 — 이벤트 루프 블로킹)
import subprocess
result_git = subprocess.run(
    ["git", "rev-parse", "--abbrev-ref", "HEAD"],
    cwd=project_path, capture_output=True, text=True, timeout=3,
)
if result_git.returncode == 0:
    git_branch = result_git.stdout.strip()

# 변경 후 (비동기)
import asyncio as _asyncio
proc = await _asyncio.create_subprocess_exec(
    "git", "rev-parse", "--abbrev-ref", "HEAD",
    cwd=project_path,
    stdout=_asyncio.subprocess.PIPE,
    stderr=_asyncio.subprocess.PIPE,
)
stdout, stderr = await _asyncio.wait_for(proc.communicate(), timeout=3)
if proc.returncode == 0:
    git_branch = stdout.decode().strip()
```

---

## 2. per-session resume token 구현 (Step 0~8)

세션별 독립 resume token + 크로스 세션 요약 주입.
상세 설계: `tunaDish/docs/prompts/architecture/per-session-resume-token.md`

### 요약

현재 resume token이 프로젝트 단위(`sessions.json`)로 저장되어,
같은 프로젝트에서 여러 tunadish 세션을 만들면 컨텍스트가 꼬인다.

#### 구현 순서

| Step | 작업 | 파일 |
|------|------|------|
| 0 | `ConversationSessionStore` 생성 | `src/tunapi/tunadish/session_store.py` (신규) |
| 1 | `backend.py`에 `_conv_sessions` 초기화 | `backend.py` |
| 2 | `_execute_run()`에서 conv별 토큰 우선 사용 | `backend.py` |
| 3 | `_make_conv_token_saver()` 콜백 + `on_thread_known` 전달 | `backend.py` |
| 4 | `!new` 시 conv별 토큰 삭제 | `commands.py` |
| 5 | `_handle_project_context()`에서 conv별 토큰 반환 | `backend.py` |
| 6 | `_build_cross_session_summary()` 구현 | `backend.py` |
| 7 | `_execute_run()`에 크로스 세션 요약 주입 | `backend.py` |
| 8 | history 반환 시 `<sibling_sessions>` 스트리핑 | `backend.py` |

#### 핵심 확인 완료 사항

- `handle_message()`에 `on_thread_known` 파라미터 존재 (Optional)
- `project_sessions`와 동시 전달 가능 — 내부에서 자동 래핑
- tunapi 코어 변경 없이 tunadish backend에서만 구현 가능

상세 코드 예시는 `per-session-resume-token.md` 참조.

---

## 3. Phase 4 RPC 메서드 클라이언트 연동 (tunaDish 측)

tunapi에 추가된 7개 RPC 메서드를 tunaDish 프론트엔드에서 호출할 수 있다.
프론트엔드 구현은 tunaDish 레포에서 진행:

- `discussion.save_roundtable`
- `discussion.link_branch`
- `synthesis.create_from_discussion`
- `review.request`
- `handoff.create`
- `handoff.parse`
- `engine.list`

---

## 우선순위

1. **git rev-parse 비동기화** — 즉시 적용, 1분 작업
2. **per-session resume token Step 0~5** — 핵심 기능
3. **per-session resume token Step 6~8** — 크로스 세션 요약 (선택)
4. **Phase 4 RPC 클라이언트 연동** — 별도 스프린트
