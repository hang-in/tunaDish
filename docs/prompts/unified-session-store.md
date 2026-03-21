# tunapi 통합 세션 스토어 구현 프롬프트

## 목표

현재 각 transport(mattermost, slack, tunadish)가 **독립적인 세션 파일**을 유지하고 있어서 cross-transport 세션 연속성이 불가능하다.
이를 **프로젝트 단위 단일 세션 스토어**로 통합하여, 어떤 transport에서 시작된 세션이든 다른 transport에서 이어갈 수 있게 한다.

## 핵심 설계 원칙

1. **세션 키 = project** (engine 차원 제거)
   - 프로젝트당 기본 엔진은 **고정** (최초 설정 후 변경 불가)
   - 다른 엔진은 **서브에이전트**로 사용 (별도 세션 없이 stateless 호출)
   - 다른 프로젝트의 journal을 **읽기 전용**으로 참조하여 분석 가능

2. **토큰 라이프사이클**
   - 생성: 첫 `on_thread_known` 콜백 → `(project) → token` 저장
   - 유지: 어떤 transport에서든 같은 project면 동일 토큰
   - 리셋: `!new` → 해당 project 토큰 삭제 → 다음 대화에서 새 토큰 생성
   - 만료/장애: engine이 토큰 거부 시 삭제 후 handoff preamble 폴백

3. **transport는 세션 관리를 하지 않는다** — core가 자동으로 주입/저장

---

## 현재 아키텍처 (변경 전)

### 세션 저장소 (transport별 분리)
```
~/.tunapi/mattermost_sessions.json   ← mattermost 전용
~/.tunapi/tunadish_sessions.json     ← tunadish 전용
(slack도 자체 파일)
```

### ChatSessionStore (`src/tunapi/core/chat_sessions.py`)
- 키 구조: `channel_id → engine → {value, cwd}`
- 스키마 v2:
```json
{
  "version": 2,
  "channels": {
    "<channel_id>": {
      "sessions": {
        "<engine>": {"value": "<resume_token>", "cwd": "/path"}
      }
    }
  }
}
```

### 각 transport의 세션 사용 패턴 (mattermost 예시, `loop.py:750-824`)
```python
# 1. 세션 조회
resume_token = await sessions.get(msg.channel_id, engine, cwd=cwd)
effective_resume = resolved.resume_token or resume_token

# 2. 엔진 실행
await handle_message(..., resume_token=effective_resume, on_thread_known=on_thread_known, ...)

# 3. 세션 저장 (콜백)
async def on_thread_known(token: ResumeToken, done: anyio.Event) -> None:
    await sessions.set(msg.channel_id, token, cwd=cwd)

# 4. 세션 삭제 (!new)
await sessions.clear(msg.channel_id)
await journal.mark_reset(msg.channel_id)
```

### ResumeToken (`src/tunapi/model.py`)
```python
@dataclass(frozen=True, slots=True)
class ResumeToken:
    engine: EngineId  # str
    value: str
```

### ChatPrefsStore (`src/tunapi/core/chat_prefs.py`)
- 채널별 설정: `default_engine`, `trigger_mode`, `context_project`, `context_branch`, `engine_models`
- `context_project` 필드가 이미 채널→프로젝트 매핑을 담당

### TransportRuntime (`src/tunapi/transport_runtime.py`)
- `resolve_engine()`: project.default_engine → router.default_engine 폴백
- `resolve_runner()`: resume_token 기반 또는 engine_override 기반 runner 선택
- `resolve_message()`: directive 파싱 → context 해석 → engine override 결정

### Journal (`src/tunapi/journal.py`)
- 채널별 JSONL: `{base_dir}/{channel_id}.jsonl`
- `build_handoff_preamble()`: resume token 없을 때 최근 3개 run 컨텍스트 요약
- `mark_reset()`: `!new` 시 reset 마커 기록

### handle_message (`src/tunapi/runner_bridge.py:472-764`)
- transport에서 준비한 `runner`, `resume_token`, `on_thread_known`을 받아서 실행
- `run_runner_with_cancel()` → `StartedEvent` 시 `on_thread_known(token, done)` 호출
- 완료 후 `_finalize_run()` → journal 기록

---

## 목표 아키텍처 (변경 후)

### 1. 새 파일: `src/tunapi/core/project_sessions.py`

프로젝트 단위 통합 세션 스토어. 기존 `ChatSessionStore`를 대체.

```python
# 키 구조 변경: channel_id+engine → project
# 파일: ~/.tunapi/sessions.json (단일 공유 파일)

# 스키마 v1:
{
  "version": 1,
  "projects": {
    "<project_key>": {
      "engine": "<default_engine>",     # 고정된 기본 엔진
      "token": "<resume_token_value>",  # 현재 활성 토큰
      "cwd": "/path/to/project"         # CWD 검증용
    }
  }
}
```

**API:**
```python
class ProjectSessionStore(JsonStateStore[_State]):
    """프로젝트 단위 통합 세션 스토어."""

    async def get(self, project: str, *, cwd: Path | None = None) -> ResumeToken | None:
        """프로젝트의 현재 resume token 조회."""
        ...

    async def set(self, project: str, token: ResumeToken, *, cwd: Path | None = None) -> None:
        """프로젝트의 resume token 저장."""
        ...

    async def clear(self, project: str) -> None:
        """프로젝트의 세션 삭제 (!new)."""
        ...

    async def get_engine(self, project: str) -> str | None:
        """프로젝트의 고정 기본 엔진 조회."""
        ...

    async def has_active(self, project: str) -> bool:
        """프로젝트에 활성 세션이 있는지 확인."""
        ...
```

### 2. ChatPrefsStore 변경 (`src/tunapi/core/chat_prefs.py`)

`_ChatPrefs`에 **engine 고정 플래그** 추가:

```python
class _ChatPrefs(msgspec.Struct, forbid_unknown_fields=False):
    default_engine: str | None = None
    engine_locked: bool = False           # ← 신규: True면 엔진 변경 불가
    trigger_mode: str | None = None
    context_project: str | None = None
    context_branch: str | None = None
    engine_models: dict[str, str] = msgspec.field(default_factory=dict)
```

**동작:**
- `!project set <name>` 시 `default_engine` 자동 결정 (프로젝트 설정 또는 글로벌 기본값)
- 첫 메시지 처리 시 `engine_locked = True`로 설정
- `engine_locked = True`이면 `!engine` 명령으로 기본 엔진 변경 불가
- `!new`는 토큰만 삭제하고 엔진 잠금은 유지

### 3. runner_bridge.py에 세션 자동 주입

`handle_message()`에 `ProjectSessionStore` 파라미터 추가:

```python
async def handle_message(
    cfg: ExecBridgeConfig,
    *,
    runner: Runner,
    incoming: IncomingMessage,
    resume_token: ResumeToken | None,
    context: RunContext | None = None,
    # ... 기존 파라미터들 ...
    project_sessions: ProjectSessionStore | None = None,  # ← 신규
) -> str | None:
```

**자동 주입 로직** (transport가 resume_token=None으로 호출해도 core가 처리):
```python
# handle_message 시작 부분에 추가
if resume_token is None and project_sessions is not None and context and context.project:
    resume_token = await project_sessions.get(context.project, cwd=cwd_from_context)

# on_thread_known 래핑 (기존 transport 콜백도 호출하면서 core 저장도 수행)
original_on_thread_known = on_thread_known
async def core_on_thread_known(token: ResumeToken, done: anyio.Event) -> None:
    if project_sessions is not None and context and context.project:
        await project_sessions.set(context.project, token, cwd=cwd_from_context)
    if original_on_thread_known is not None:
        await original_on_thread_known(token, done)
```

### 4. 각 transport backend 변경

**mattermost/loop.py, slack/loop.py의 `_run_engine()` 함수:**

변경 전:
```python
resume_token = await sessions.get(msg.channel_id, engine, cwd=cwd)
# ...
async def on_thread_known(token, done):
    await sessions.set(msg.channel_id, token, cwd=cwd)
```

변경 후:
```python
# 세션 조회/저장을 transport에서 제거
# handle_message에 project_sessions를 전달하면 core가 자동 처리
await handle_message(
    ...,
    resume_token=None,  # core가 project 기반으로 자동 조회
    on_thread_known=None,  # core가 자동 저장
    project_sessions=project_sessions,  # ← 신규
)
```

**`_try_dispatch_command()`의 `!new` 처리:**

변경 전:
```python
case "new":
    await sessions.clear(msg.channel_id)
    await journal.mark_reset(msg.channel_id)
```

변경 후:
```python
case "new":
    # project 기반으로 세션 삭제
    ctx = await chat_prefs.get_context(msg.channel_id) if chat_prefs else None
    if ctx and ctx.project and project_sessions:
        await project_sessions.clear(ctx.project)
    await journal.mark_reset(msg.channel_id)
```

**tunadish_transport/backend.py:**
- `ChatSessionStore` import 및 `self._sessions` 제거
- `_execute_run()`의 세션 조회/저장 로직 제거
- `handle_message()`에 `project_sessions=self._project_sessions` 전달

### 5. Journal 읽기 API 확장 (`src/tunapi/journal.py`)

다른 프로젝트의 journal을 참조할 수 있도록:

```python
class Journal:
    # 기존 메서드들 유지

    async def recent_entries_for_project(
        self,
        project: str,
        *,
        journals_dirs: list[Path] | None = None,
        limit: int = 50,
    ) -> list[JournalEntry]:
        """프로젝트에 매핑된 모든 채널의 journal을 통합 조회.

        journals_dirs: 다른 transport의 journal 디렉토리 목록
        (cross-transport 분석용)
        """
        ...
```

이는 **서브에이전트가 다른 프로젝트 세션을 분석**할 때 사용:
```
@gemini analyze backend-api
→ backend-api 프로젝트에 매핑된 채널들의 journal을 읽어서 gemini에게 전달
→ gemini는 자기 프로젝트(code-review) 세션 안에서 분석 결과 생성
```

### 6. 서브에이전트 라우팅 (향후 확장)

`@engine` 멘션을 감지하여 다른 엔진으로 stateless 실행:

```python
# directives.py에 @engine 멘션 파싱 추가
# 예: "@gemini 이 코드 분석해봐" → engine=gemini, stateless=True

# transport_runtime.py에 서브에이전트 실행 메서드 추가
async def run_subagent(
    self,
    *,
    engine: EngineId,
    prompt: str,
    context_entries: list[JournalEntry],  # 참조할 journal 엔트리
) -> str:
    """서브에이전트를 stateless로 실행하고 결과 반환."""
    ...
```

> 이 부분은 Phase 2로 분리 가능. Phase 1은 통합 세션 스토어만 구현.

---

## 마이그레이션

### 기존 세션 데이터 마이그레이션

1. `~/.tunapi/mattermost_sessions.json` → `sessions.json`
2. `~/.tunapi/tunadish_sessions.json` → `sessions.json`
3. 키 변환: `(channel_id, engine) → project` (ChatPrefsStore의 `context_project` 참조)

```python
def migrate_legacy_sessions(
    legacy_files: list[Path],
    chat_prefs: ChatPrefsStore,
    target: ProjectSessionStore,
) -> None:
    """기존 transport별 세션 파일을 통합 스토어로 마이그레이션."""
    for legacy_path in legacy_files:
        old_store = ChatSessionStore(legacy_path)
        for channel_id, channel_data in old_store._state.channels.items():
            # channel_id → project 매핑 (chat_prefs에서 조회)
            project = chat_prefs.get_context_sync(channel_id)
            if project and project.project:
                for engine, entry in channel_data.sessions.items():
                    target.set_sync(project.project, ResumeToken(engine, entry.value), cwd=entry.cwd)
    # 마이그레이션 완료 후 legacy 파일은 보존 (삭제하지 않음)
```

### 하위 호환성

- `ChatSessionStore` 클래스는 즉시 삭제하지 않음
- deprecated 마킹 후 다음 메이저 버전에서 제거
- 각 transport는 점진적으로 `ProjectSessionStore`로 전환

---

## 구현 순서

### Phase 1: 통합 세션 스토어 (필수)
1. `src/tunapi/core/project_sessions.py` 신규 생성
2. `runner_bridge.py`에 `project_sessions` 파라미터 추가 및 자동 주입 로직
3. `chat_prefs.py`에 `engine_locked` 필드 추가
4. mattermost `loop.py` — `ProjectSessionStore` 사용으로 전환
5. slack `loop.py` — 동일 전환
6. tunadish `backend.py` — `ChatSessionStore` 제거, core 위임
7. 마이그레이션 유틸리티
8. 테스트

### Phase 2: 서브에이전트 라우팅 (선택)
1. `@engine` 멘션 파싱 (`directives.py`)
2. 크로스 프로젝트 journal 읽기 API (`journal.py`)
3. stateless 서브에이전트 실행기 (`transport_runtime.py`)

---

## 관련 파일 전체 목록

| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| `src/tunapi/core/project_sessions.py` | **신규** | 프로젝트 단위 통합 세션 스토어 |
| `src/tunapi/core/chat_sessions.py` | deprecated | 기존 transport별 세션 스토어 (deprecated 마킹) |
| `src/tunapi/core/chat_prefs.py` | 수정 | `engine_locked` 필드 추가 |
| `src/tunapi/runner_bridge.py` | 수정 | `project_sessions` 파라미터, 자동 주입/저장 |
| `src/tunapi/transport_runtime.py` | 수정 | `project_default_engine` 고정 검증 |
| `src/tunapi/journal.py` | 수정 | `recent_entries_for_project()` 추가 |
| `src/tunapi/mattermost/loop.py` | 수정 | `ProjectSessionStore` 전환, `!new` 로직 변경 |
| `src/tunapi/slack/loop.py` | 수정 | 동일 |
| `tunadish_transport/backend.py` | 수정 | `ChatSessionStore` 제거, core 위임 |
| `src/tunapi/mattermost/backend.py` | 수정 | `ProjectSessionStore` 인스턴스 생성/전달 |

---

## 제약 조건

- `ResumeToken` dataclass의 `engine` 필드는 유지 (엔진 정보는 토큰 자체에 내장)
- `JsonStateStore` 기반 클래스로 구현 (기존 패턴 유지)
- msgspec 기반 직렬화 (기존 패턴 유지)
- anyio Lock 기반 동시성 (기존 패턴 유지)
- 기존 테스트가 깨지지 않도록 하위 호환 유지
- 마이그레이션은 첫 로드 시 자동 수행 (사용자 개입 없음)
