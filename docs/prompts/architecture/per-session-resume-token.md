# 세션별 독립 Resume Token + 크로스 세션 요약 주입

## 문제

현재 resume token은 **프로젝트 단위**로 저장된다 (`~/.tunapi/sessions.json`).

```json
{
  "projects": {
    "tunadish": { "engine": "claude", "token": "50f7cebb-..." },
    "tunapi":   { "engine": "claude", "token": "02255376-..." }
  }
}
```

같은 프로젝트에서 tunadish 세션을 여러 개 만들면:
- **공유 토큰**: 세션 A의 대화 컨텍스트에 세션 B의 메시지가 섞여 들어감. 컨텍스트 윈도우가 빠르게 소진되고, AI가 혼란스러운 응답을 생성
- **독립 토큰(현재 미구현)**: 세션 간 작업 내용을 모름. 같은 파일을 동시에 수정하는 등 충돌 가능

## 목표

1. 각 tunadish 세션(conversation_id)이 **독립적인 resume token**을 가진다
2. 메시지 전송 시, 같은 프로젝트의 **다른 세션 최근 활동 요약**을 자동 주입한다
3. tunapi 코어 변경을 **최소화**한다

---

## 현재 아키텍처

### 토큰 저장: `ProjectSessionStore`

```
~/.tunapi/sessions.json
키: project_key → { engine, token, cwd }
```

- tunapi의 `src/tunapi/core/project_sessions.py`에 정의
- `handle_message()` 내부에서 `on_thread_known` 콜백으로 자동 저장
- tunadish는 `self._project_sessions`로 참조 (`backend.py:120`)

### 토큰 해석 흐름 (`_execute_run`)

```
_execute_run(conv_id, text)
  ├─ context_store.get_context(conv_id) → RunContext(project=X)
  ├─ runtime.resolve_message(ambient_context=RunContext(project=X))
  │   └─ tunapi 내부: _project_sessions.get(project=X) → resume_token
  ├─ runtime.resolve_runner(resume_token=token)
  └─ handle_message(..., resume_token=token, project_sessions=store)
       └─ AI 실행 완료 → on_thread_known → project_sessions.set(X, new_token)
```

### 문제 지점

`resolve_message()`가 `ambient_context.project`로 토큰을 조회하므로, **같은 프로젝트의 모든 세션이 동일 토큰을 공유**한다.

---

## 목표 아키텍처

### 1. tunadish 전용 세션 토큰 저장소

tunapi의 `ProjectSessionStore`를 수정하지 않고, tunadish transport 내에 **conversation_id별 토큰 저장소**를 추가한다.

#### 새 파일: `src/tunapi/tunadish/session_store.py`

```python
"""tunadish conversation별 독립 resume token 저장소."""

import json
import anyio
from pathlib import Path
from dataclasses import dataclass

@dataclass
class SessionEntry:
    engine: str
    token: str          # resume token value
    cwd: str | None = None

class ConversationSessionStore:
    """conversation_id → resume token 매핑.

    tunapi의 ProjectSessionStore(프로젝트 단위)와 별도로,
    tunadish 세션별 독립 토큰을 관리한다.
    """

    def __init__(self, storage_path: Path):
        self._path = storage_path
        self._lock = anyio.Lock()
        self._cache: dict[str, SessionEntry] = {}
        self._load()

    def _load(self) -> None:
        if not self._path.exists():
            return
        try:
            data = json.loads(self._path.read_text("utf-8"))
            for conv_id, entry in data.get("conversations", {}).items():
                self._cache[conv_id] = SessionEntry(
                    engine=entry["engine"],
                    token=entry["token"],
                    cwd=entry.get("cwd"),
                )
        except Exception:
            pass

    async def _save(self) -> None:
        async with self._lock:
            data = {"version": 1, "conversations": {
                cid: {"engine": e.engine, "token": e.token, "cwd": e.cwd}
                for cid, e in self._cache.items()
            }}
            self._path.parent.mkdir(parents=True, exist_ok=True)
            self._path.write_text(json.dumps(data, indent=2, ensure_ascii=False), "utf-8")

    async def get(self, conv_id: str) -> SessionEntry | None:
        return self._cache.get(conv_id)

    async def set(self, conv_id: str, engine: str, token: str, cwd: str | None = None) -> None:
        self._cache[conv_id] = SessionEntry(engine=engine, token=token, cwd=cwd)
        await self._save()

    async def clear(self, conv_id: str) -> None:
        self._cache.pop(conv_id, None)
        await self._save()
```

#### 저장 위치

```
~/.tunapi/tunadish_sessions.json
```

기존 `sessions.json` (프로젝트 단위)과 공존한다.

---

### 2. `_execute_run()` 토큰 해석 변경

**변경 전** (현재):
```python
resolved = runtime.resolve_message(text=text, ambient_context=ambient_ctx)
# → tunapi 내부에서 project 기반으로 토큰 조회
```

**변경 후**:
```python
# 1. tunadish 세션 스토어에서 conv별 토큰 먼저 조회
session_entry = await self._conv_sessions.get(conv_id)
conv_resume_token = None
if session_entry:
    from tunapi.model import ResumeToken
    conv_resume_token = ResumeToken(engine=session_entry.engine, value=session_entry.token)

# 2. resolve_message는 기존대로 호출 (ambient_context 전달)
resolved = runtime.resolve_message(text=text, ambient_context=ambient_ctx)

# 3. conv별 토큰이 있으면 그걸 우선 사용
effective_token = conv_resume_token or resolved.resume_token
```

#### 변경 파일: `backend.py`

```python
# __init__ 또는 build_and_run()에 추가
from .session_store import ConversationSessionStore
self._conv_sessions = ConversationSessionStore(
    Path.home() / ".tunapi" / "tunadish_conv_sessions.json"
)
```

`_execute_run()` 변경 (line 1154 부근):

```python
# 기존
resolved = runtime.resolve_message(text=text, reply_text=None, ambient_context=ambient_ctx)
rr = runtime.resolve_runner(resume_token=resolved.resume_token, engine_override=final_engine_override)
await handle_message(..., resume_token=resolved.resume_token, project_sessions=self._project_sessions)

# 변경 후
resolved = runtime.resolve_message(text=text, reply_text=None, ambient_context=ambient_ctx)

# conv별 독립 토큰 조회 (tunadish 전용)
conv_session = await self._conv_sessions.get(conv_id)
if conv_session:
    from tunapi.model import ResumeToken
    effective_token = ResumeToken(engine=conv_session.engine, value=conv_session.token)
else:
    effective_token = resolved.resume_token

rr = runtime.resolve_runner(resume_token=effective_token, engine_override=final_engine_override)
await handle_message(
    ...,
    resume_token=effective_token,
    project_sessions=self._project_sessions,  # tunapi 호환 유지
    on_thread_known=self._make_conv_token_saver(conv_id),  # 세션별 저장 콜백
)
```

---

### 3. 토큰 저장 콜백

`handle_message()`의 `on_thread_known` 콜백으로 conv별 토큰을 저장한다.

#### 변경 파일: `backend.py`

```python
def _make_conv_token_saver(self, conv_id: str):
    """handle_message()의 on_thread_known 콜백 생성.

    AI 에이전트가 세션을 시작하면 호출되어 conv별 토큰을 저장한다.
    """
    async def _on_thread_known(token, done):
        await self._conv_sessions.set(
            conv_id,
            engine=token.engine,
            token=token.value,
        )
    return _on_thread_known
```

> **주의**: `handle_message()`에 이미 `project_sessions`가 전달되어 프로젝트 단위 토큰도 저장된다.
> 프로젝트 단위 저장을 유지할지 제거할지는 Step 5에서 결정.

---

### 4. `!new` 명령 확장

현재 `!new`는 journal만 리셋한다. conv별 토큰도 함께 삭제해야 한다.

#### 변경 파일: `commands.py` (line 943-947)

```python
# 변경 전
case "new":
    if journal:
        await journal.mark_reset(channel_id)
    await send(RenderedMessage(text="새 대화를 시작합니다."))

# 변경 후
case "new":
    if journal:
        await journal.mark_reset(channel_id)
    # conv별 토큰 삭제
    if conv_sessions:
        await conv_sessions.clear(channel_id)
    await send(RenderedMessage(text="새 대화를 시작합니다."))
```

`dispatch_command()`의 시그니처에 `conv_sessions` 파라미터를 추가한다.

---

### 5. 크로스 세션 요약 주입

같은 프로젝트의 다른 세션에서 최근 무슨 일이 있었는지 요약을 주입한다.

#### 주입 위치

`_execute_run()` 내 rawq 주입과 동일한 패턴으로, `enriched_text`에 크로스 세션 요약을 추가한다.

#### 변경 파일: `backend.py`

```python
async def _build_cross_session_summary(
    self, conv_id: str, project: str
) -> str | None:
    """같은 프로젝트의 다른 세션 최근 활동 요약 생성."""
    # 1. context_store에서 같은 프로젝트의 다른 conv_id 목록 조회
    all_convs = self.context_store.list_conversations(project=project)
    sibling_ids = [c["id"] for c in all_convs if c["id"] != conv_id]

    if not sibling_ids:
        return None

    summaries = []
    for sib_id in sibling_ids[:3]:  # 최대 3개 세션만
        entries = await self._journal.recent_entries(sib_id, limit=5)
        if not entries:
            continue

        # 세션 label 조회
        meta = self.context_store._cache.get(sib_id)
        label = meta.label if meta else sib_id[:8]

        # 최근 prompt/completed 요약
        lines = []
        for e in entries:
            if e.event == "prompt":
                text = e.data.get("text", "")[:100]
                lines.append(f"  - [user] {text}")
            elif e.event == "completed" and e.data.get("ok"):
                answer = e.data.get("answer", "")[:100]
                lines.append(f"  - [assistant] {answer}")

        if lines:
            summaries.append(f"세션 '{label}':\n" + "\n".join(lines[-4:]))

    if not summaries:
        return None

    return (
        "<sibling_sessions>\n"
        "같은 프로젝트의 다른 세션 최근 활동:\n\n"
        + "\n\n".join(summaries)
        + "\n</sibling_sessions>"
    )
```

#### `_execute_run()`에 주입 (rawq 주입 직후)

```python
# rawq 주입 (기존)
enriched_text = text
if ambient_ctx:
    project_name = getattr(ambient_ctx, "project", None)
    if project_name:
        enriched_text = await self._rawq_enrich_message(text, project_name, runtime)

# 크로스 세션 요약 주입 (신규)
if ambient_ctx:
    project_name = getattr(ambient_ctx, "project", None)
    if project_name:
        cross_summary = await self._build_cross_session_summary(conv_id, project_name)
        if cross_summary:
            enriched_text = f"{cross_summary}\n---\n{enriched_text}"
```

#### history 반환 시 스트리핑 (rawq와 동일 패턴)

```python
# backend.py 상단 정규식 추가
_SIBLING_CONTEXT_RE = re.compile(
    r"<sibling_sessions>.*?</sibling_sessions>\s*---\s*", re.DOTALL
)

# conversation.history 핸들러 내 (기존 _RAWQ_CONTEXT_RE.sub 직후)
clean_text = _RAWQ_CONTEXT_RE.sub("", raw_text)
clean_text = _SIBLING_CONTEXT_RE.sub("", clean_text)
```

---

### 6. `project.context` 응답에 세션별 토큰 반영

현재 `_handle_project_context()`는 프로젝트 단위 토큰만 반환한다.
conv별 토큰을 우선 반환하도록 변경한다.

#### 변경 파일: `backend.py` `_handle_project_context()` (line 519 부근)

```python
# 변경 전
resume_token_value = None
try:
    rt = await self._project_sessions.get(project)
    if rt:
        resume_token_value = rt.value
except Exception:
    pass

# 변경 후
resume_token_value = None
conv_id_for_token = params.get("conversation_id")
# conv별 토큰 우선 조회
if conv_id_for_token:
    conv_session = await self._conv_sessions.get(conv_id_for_token)
    if conv_session:
        resume_token_value = conv_session.token
# fallback: 프로젝트 단위 토큰
if not resume_token_value:
    try:
        rt = await self._project_sessions.get(project)
        if rt:
            resume_token_value = rt.value
    except Exception:
        pass
```

---

## 구현 순서

| Step | 작업 | 파일 | tunapi 변경 |
|------|------|------|-------------|
| 0 | `ConversationSessionStore` 생성 | `session_store.py` (신규) | 없음 |
| 1 | `backend.py`에 `_conv_sessions` 초기화 | `backend.py` | 없음 |
| 2 | `_execute_run()`에서 conv별 토큰 우선 사용 | `backend.py` | 없음 |
| 3 | `_make_conv_token_saver()` 콜백 + `handle_message`에 `on_thread_known` 전달 | `backend.py` | 없음 (기존 파라미터 활용) |
| 4 | `!new` 시 conv별 토큰 삭제 | `commands.py` | 없음 |
| 5 | `_handle_project_context()`에서 conv별 토큰 반환 | `backend.py` | 없음 |
| 6 | `_build_cross_session_summary()` 구현 | `backend.py` | 없음 |
| 7 | `_execute_run()`에 크로스 세션 요약 주입 | `backend.py` | 없음 |
| 8 | history 반환 시 `<sibling_sessions>` 스트리핑 | `backend.py` | 없음 |

---

## 확인 완료 사항

### `handle_message()`의 `on_thread_known` 파라미터

tunapi `runner_bridge.py` 확인 결과:

```python
async def handle_message(
    cfg: ExecBridgeConfig,
    *,
    runner: Runner,
    incoming: IncomingMessage,
    resume_token: ResumeToken | None,
    context: RunContext | None = None,
    on_thread_known: Callable[[ResumeToken, anyio.Event], Awaitable[None]] | None = None,
    project_sessions: ProjectSessionStore | None = None,
    ...
)
```

1. `on_thread_known` 파라미터 **존재함** (Optional)
2. `project_sessions`와 `on_thread_known` **동시 전달 가능**
3. `project_sessions`가 있으면 내부에서 `on_thread_known`을 **자동 래핑**:
   - 먼저 `project_sessions.set(project, token)` 실행 (프로젝트 단위 저장)
   - 그 후 `_original_on_thread_known(token, done)` 호출 (우리 콜백 실행)
4. 현재 tunadish는 `on_thread_known`을 전달하지 않음 → **추가만 하면 됨**

**결론**: Step 3은 단순히 `on_thread_known=self._make_conv_token_saver(conv_id)`를 `handle_message()` 호출에 추가하면 된다. tunapi 내부 래핑에 의해 프로젝트 단위 저장(기존)과 conv별 저장(신규)이 **모두 자동 실행**된다.

### mattermost/slack 세션과의 관계

cross-transport 세션(mattermost에서 시작된 세션)은 기존 프로젝트 단위 토큰을 계속 사용한다.
tunadish 내부에서만 conv별 독립 토큰이 적용되며, mattermost/slack은 영향 없음.

### 마이그레이션

기존 tunadish 세션(conv별 토큰이 없는 상태)은 첫 메시지 전송 시 자동으로 conv별 토큰이 생성된다. 별도 마이그레이션 불필요.

---

## 제약 조건

- tunapi 코어 코드 수정 금지 — tunadish transport 레벨에서만 변경
- 기존 `ProjectSessionStore`는 유지 — mattermost/slack 호환
- 크로스 세션 요약은 최대 3개 세션, 최근 5개 엔트리로 제한 — 토큰 낭비 방지
- `<sibling_sessions>` 블록은 history 반환 시 반드시 제거 — 사용자에게 노출 금지
