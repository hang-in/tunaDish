# tunaDish 개발 계획

> 버전: v5
> 작성일: 2026-03-20
> 갱신일: 2026-03-20
> 기반 문서: `docs/briefing.md`, `docs/prd.md`
> 리뷰: Codex 3회 반복 리뷰 반영 (tunapi 소스 기반 검증)

---

## 1. 설계 전제 (tunapi 실제 구조 기반)

| 항목              | tunapi 실제 동작                                                        | tunadish 설계 반영                  |
| ----------------- | ----------------------------------------------------------------------- | ----------------------------------- |
| 에이전트 실행     | 요청마다 CLI subprocess 생성/종료 (`JsonlSubprocessRunner`)             | run 단위 실행/취소 모델             |
| 메시지 파이프라인 | `handle_message()` → `Presenter.render_*()` → `Transport.send/edit()`   | 클라이언트는 rendered markdown 수신 |
| 세션              | `channel_id + engine → ResumeToken` (`ChatSessionStore`)                | `conversation_id + engine` 매핑     |
| 프로젝트 config   | `tunapi.toml → ProjectsConfig → TransportRuntime`                       | tunapi.toml이 source of truth       |
| cwd 설정          | `set_run_base_dir(cwd)` → subprocess 실행 → `reset_run_base_dir(token)` | Telegram executor.py 패턴 준수      |
| 스트리밍          | progress/action 이벤트 (5초 주기), 최종 답변은 `CompletedEvent`         | 토큰 스트리밍 아님                  |
| ProgressTracker   | `handle_message()` 내부 로컬 객체, 외부 구독 불가                       | MVP에서 구조화 이벤트 포기          |

---

## 2. 전체 구조

```mermaid
graph LR
    subgraph tunadish 클라이언트
        A[React + TS + Tauri]
    end
    subgraph tunadish transport
        B[Python WebSocket 서버]
        CS[Conversation Context Store]
        RM["Run Map + Mutex<br/>conv_id → progress_ref, RunningTask"]
    end
    subgraph tunapi
        C["runner_bridge.handle_message()"]
        D["JsonlSubprocessRunner<br/>(per-request subprocess)"]
        RT["TransportRuntime<br/>resolve_message · resolve_run_cwd"]
    end
    A -- "WebSocket JSON-RPC" --> B
    B -- "Transport.send/edit/delete<br/>(rendered markdown)" --> A
    B --> CS
    B --> RM
    CS -- "ambient_context" --> RT
    B -- "Transport/Presenter" --> C
    RT --> C
    C --> D
```

---

## 3. 핵심 설계 결정

### 3.1 MVP: rendered markdown only (확정)

클라이언트가 받는 것은 Presenter가 렌더링한 마크다운 문자열.
`ProgressTracker`는 `handle_message()` 내부 로컬 객체라 외부 transport에서 구독 불가.
구조화 이벤트(action 목록, usage 등)는 **MVP에서 제공하지 않음**.

Phase 2 접근법: custom `handle_message` wrapper, `runner_bridge` 확장, 또는 tunapi core patch 필요.

### 3.2 Per-conversation mutex (확정)

`handle_message()`는 코루틴 내부에서만 blocking이므로, WS 서버가 요청마다 task를 띄우면 같은 `conversation_id`로 여러 run이 동시에 들어갈 수 있음.

```python
# 정책: 같은 conversation에서 run 1개만 허용
# 새 요청이 들어오면 기존 run이 끝날 때까지 대기 or 에러 반환(409)
self._conv_locks: dict[str, anyio.Lock] = {}

async def handle_chat_send(self, params):
    conv_id = params["conversation_id"]
    lock = self._conv_locks.setdefault(conv_id, anyio.Lock())
    if lock.locked():
        return {"error": {"code": -32001, "message": "run already in progress"}}
    async with lock:
        await self._execute_run(conv_id, params)
```

### 3.3 run_map 채우기: progress_ref 선할당 (확정)

`handle_message()`는 `progress_ref` 파라미터를 받음 (L482).
transport에서 progress placeholder 메시지를 먼저 만들고, 그 ref로 run_map을 채운 뒤 handle_message에 전달.

```python
async def _execute_run(self, conv_id: str, params):
    # 1. progress placeholder 선할당
    progress_ref = await self.transport.send(
        channel_id=conv_id,
        message=RenderedMessage(text="⏳ starting..."),
        options=SendOptions(notify=False),
    )

    # 2. run_map에 등록 (cancel이 가능해짐)
    running_task = RunningTask()
    if progress_ref is not None:
        self.running_tasks[progress_ref] = running_task
        self.run_map[conv_id] = progress_ref

    # 3. context + cwd 해석
    ambient_ctx = await self.context_store.get_context(conv_id)
    resolved = runtime.resolve_message(
        text=params["text"],
        reply_text=None,
        ambient_context=ambient_ctx,
    )
    cwd = runtime.resolve_run_cwd(resolved.context)
    run_base_token = set_run_base_dir(cwd)

    try:
        # 4. handle_message에 선할당된 progress_ref 전달
        await runner_bridge.handle_message(
            cfg=ExecBridgeConfig(
                transport=self.transport,
                presenter=self.presenter,
                final_notify=False,
            ),
            runner=rr.runner,
            incoming=IncomingMessage(channel_id=conv_id, ...),
            resume_token=resolved.resume_token,
            context=resolved.context,
            running_tasks=self.running_tasks,
            progress_ref=progress_ref,   # ★ 선할당된 ref
        )
    finally:
        reset_run_base_dir(run_base_token)
        self.run_map.pop(conv_id, None)  # 완료/취소 시 정리
```

### 3.4 용어 정리 (확정)

| 용어                | 정의                                                      |
| ------------------- | --------------------------------------------------------- |
| **프로젝트**        | tunapi.toml의 프로젝트 (코드 디렉토리, `ProjectConfig`)   |
| **Conversation**    | tunadish 대화 단위, UUID, tunapi `channel_id`에 매핑      |
| **Run**             | `handle_message()` 1회 실행 = subprocess 1개              |
| **ambient_context** | Conversation → 프로젝트 연결 (`RunContext`), 매 요청 주입 |

---

## 4. Sprint 구성

### Sprint 0: 레포 구조 + 스캐폴딩

| 작업                   | 상세                                                   |
| ---------------------- | ------------------------------------------------------ |
| 모노레포 구조          | `client/`, `transport/`, `docs/`                       |
| Tauri + React 스캐폴딩 | React + TS + shadcn/ui + Zustand                       |
| Python 패키지          | `transport/src/tunadish_transport/` + `pyproject.toml` |
| entry_point 등록       | `tunapi.transport_backends` → `tunadish`               |

**완료 기준**: `npm run dev`로 Tauri 윈도우, `pip install -e .`로 transport 인식

---

### Sprint 1: Transport 코어

**목표**: tunapi 인터페이스 3개 구현 + WebSocket rendered message push + run 취소

#### 인터페이스 구현

```python
# TunadishTransport — rendered message를 WS로 relay
class TunadishTransport:
    async def send(self, *, channel_id, message, options=None) -> MessageRef | None
    async def edit(self, *, ref, message, wait=True) -> MessageRef | None
    async def delete(self, *, ref) -> bool
    async def close(self) -> None

# TunadishPresenter — 직접 구현 필요 (presenter.py는 프로토콜 정의만)
# Mattermost/Slack Presenter 구현체 참고
class TunadishPresenter:
    def render_progress(self, state, *, elapsed_s, label) -> RenderedMessage
    def render_final(self, state, *, elapsed_s, status, answer) -> RenderedMessage

# TunadishBackend — build_and_run에서 WS 서버 시작 + runtime 활용
class TunadishBackend:
    id = "tunadish"
    def build_and_run(self, *, transport_config, config_path,
                      runtime: TransportRuntime, ...) -> None
```

#### 메시지 수신 흐름 (순서 확정)

```
1. per-conversation mutex 획득
2. progress placeholder 선할당 → Transport.send()
3. run_map[conv_id] = progress_ref 등록
4. context_store.get_context(conv_id) → ambient_context
5. runtime.resolve_message(text, ambient_context=ambient_ctx)
6. runtime.resolve_run_cwd(context) → cwd
7. set_run_base_dir(cwd)
8. handle_message(cfg, runner, incoming, progress_ref=progress_ref, ...)
9. reset_run_base_dir(token)
10. run_map.pop(conv_id)
11. mutex 해제
```

#### JSON-RPC methods

| method           | 방향          | 설명                                                |
| ---------------- | ------------- | --------------------------------------------------- |
| `chat.send`      | Client→Server | 메시지 전송 → run 시작                              |
| `run.cancel`     | Client→Server | `run_map[conv_id]` → `RunningTask.cancel_requested` |
| `message.new`    | Server→Client | Transport.send() — 새 메시지                        |
| `message.update` | Server→Client | Transport.edit() — progress 갱신                    |
| `message.delete` | Server→Client | Transport.delete()                                  |
| `run.status`     | Server→Client | idle / running / cancelling                         |

#### Run 취소

```python
async def handle_run_cancel(self, params):
    conv_id = params["conversation_id"]
    progress_ref = self.run_map.get(conv_id)
    if progress_ref is None:
        return {"error": {"code": -32002, "message": "no active run"}}
    task = self.running_tasks.get(progress_ref)
    if task is not None:
        task.cancel_requested.set()
    return {"result": "ok"}
```

#### Conversation Context Store

```python
# ChatPrefsStore 패턴 (channel_id 기반 ambient context)
# 저장: ~/.tunapi/tunadish_context.json
{
  "conversations": {
    "<conv_id>": {
      "project": "myproject",
      "branch": null
    }
  }
}

class ConversationContextStore:
    async def get_context(self, conv_id: str) -> RunContext | None
    async def set_context(self, conv_id: str, context: RunContext) -> None
    async def clear(self, conv_id: str) -> None
```

> MVP에서 `default_engine` 필드는 포함하지 않음. 엔진 선택은 tunapi.toml의 프로젝트별 `default_engine`과 directives(`@claude`, `@gemini` 등)로 처리. Conversation별 엔진 고정은 Phase 2에서 ChatPrefsStore 확장으로 대응.

**완료 기준**: `tunapi run --transport tunadish` → WS 서버 → `chat.send` → rendered markdown 수신 + `run.cancel` 동작

---

### Sprint 2: 클라이언트 기본 레이아웃 + WebSocket 연결

**목표**: 3패널 레이아웃 + rendered message 수신/표시

#### 레이아웃

```
+----------+--------------------+-------------+
| 사이드바  | 채팅 메인           | 컨텍스트 패널 |
+----------+--------------------+-------------+
```

#### Zustand 스토어

```typescript
interface RunStore {
  activeRuns: Record<string, "idle" | "running" | "cancelling">;
  cancelRun: (conversationId: string) => Promise<void>;
}

interface ChatStore {
  messages: Record<string, RenderedMessage[]>;
}
```

#### 메시지 표시

- `message.new` → 새 블록 추가 (마크다운 렌더링)
- `message.update` → in-place 교체 (progress 갱신, 5초 주기)
- `message.delete` → progress 제거
- 토큰 스트리밍 없음

**완료 기준**: 앱 → WS 연결 → `chat.send` → progress + 최종 응답 표시

---

### Sprint 3: 프로젝트 + Conversation 관리

**목표**: tunapi.toml 기반 프로젝트 + Conversation CRUD

#### Config 재빌드 경로 (확정)

```python
# tunapi.toml 변경 감지 시:
settings = TunapiSettings.from_toml(config_path)
spec = build_runtime_spec(settings=settings, config_path=config_path)
spec.apply(runtime, config_path=config_path)
# → runtime 내부 router/projects/plugin_configs 교체
```

- MVP: 읽기 전용 (tunapi.toml 기존 프로젝트만 표시)
- Phase 2: UI에서 tunapi.toml 편집 + 재빌드

#### Conversation 모델

```
프로젝트 (tunapi.toml)
└── Conversation (tunadish 관리)
    ├── conversation_id (UUID) — channel_id 매핑
    ├── project_key — ambient_context.project
    ├── branch — ambient_context.branch (optional)
    └── 세션: engine → ResumeToken
```

- 생성 시: `context_store.set_context(conv_id, RunContext(project=key))`
- 매 요청 시: `context_store.get_context(conv_id)` → `ambient_context` 주입
- 한 프로젝트에 여러 Conversation 가능

#### 프로젝트 UI

- 사이드바: `runtime.project_aliases()` 기반 목록
- 프로젝트 선택 → Conversation 목록
- 새 Conversation → UUID 발급 + context 저장

**완료 기준**: 프로젝트 선택 → Conversation 생성 → cwd가 프로젝트 경로로 설정된 상태에서 채팅

---

### Sprint 4: 채팅 기능 완성

**목표**: 채팅 UX — progress + 입력창 + 취소

- progress: Presenter 렌더링 마크다운 in-place 갱신 (5초 주기)
- 최종 응답: `render_final()` 결과
- 마크다운 렌더링: `react-markdown` + `remark-gfm` + `rehype-highlight`
- 입력창: Shift+Enter 멀티라인, 파일 첨부, `/` · `!` 커맨드
- 취소: UI 버튼 → `run.cancel` → `RunningTask.cancel_requested.set()`

**완료 기준**: AI 대화 → progress 갱신 → 최종 응답 → 취소 동작

---

### Sprint 5: 세션 + 안정화

**목표**: 세션 재개, 에러 핸들링, 안정화

- 세션: `ChatSessionStore` 패턴 (`conversation_id + engine → ResumeToken`)
- 전용 파일: `~/.tunapi/tunadish_sessions.json`
- WS 재연결 + 상태 복원
- subprocess 에러 → `render_final(status="error")`
- 크로스 플랫폼 테스트

---

## 5. 기술적 리스크

| 리스크                                        | 영향도 | 완화                                          |
| --------------------------------------------- | ------ | --------------------------------------------- |
| ambient_context 누락 → cwd/프로젝트 해석 실패 | 높음   | ConversationContextStore, 매 요청 주입        |
| 동시 run으로 resume/cancel 꼬임               | 높음   | per-conversation mutex (anyio.Lock)           |
| Presenter 렌더링 한계 → 구조화 이벤트 불가    | 중간   | MVP rendered markdown only, Phase 2 core 확장 |
| config 재빌드 비용                            | 중간   | 변경 감지 시에만, MVP 읽기 전용               |
| run cancel 타이밍 (progress_ref 선할당 전)    | 낮음   | placeholder 선할당 후 run_map 등록            |
| Tauri 모바일                                  | 중간   | 데스크탑 먼저                                 |
| JSON-RPC 2.0 스펙 미준수                      | 높음   | Sprint 7에서 해결                             |
| 실행 타임아웃 부재 → 대화 영구 차단           | 높음   | Sprint 7에서 해결                             |
| WS 멀티클라이언트 미지원                      | 중간   | Sprint 7에서 해결                             |

---

## 6. Sprint 7: 안정화 & 기술 부채 해소

> Phase 1 MVP 완성 이후, Phase 2 진입 전 필수 선행 작업.
> e2e 검증 + 프로토콜 정합성 + 안정성 확보가 목적.

### 6.1 e2e 검증 파이프라인 구축 (우선순위: 최상)

**문제**: Sprint 1부터 tunapi CLI 로딩 이슈로 전체 흐름(클라이언트→WS→tunapi→CLI→응답) 테스트가 막혀 있음. MVP "완료"이나 실제 동작 미검증.

**해결**:
1. tunapi CLI 로딩 이슈 디버깅 및 해결 (근본 원인 추적)
2. 수동 e2e 테스트 체크리스트 작성 (project.list → conversation.create → chat.send → 응답 수신 → run.cancel)
3. 최소 integration test: transport 단독 기동 → mock WS 클라이언트 → JSON-RPC round-trip 검증

**완료 기준**: `tunapi run --transport tunadish` → 클라이언트에서 메시지 송수신 성공

---

### 6.2 JSON-RPC 2.0 프로토콜 정합성 (우선순위: 높음)

**문제**: 현재 request에 대한 response가 JSON-RPC 2.0 스펙을 따르지 않음 — `id` 미반환, error object 미구현.

**해결**:

```python
# Request → Response (현재)
# client: {"jsonrpc":"2.0","id":1,"method":"project.list","params":{}}
# server: {"method":"project.list.result","params":{...}}  ← notification 형태로 반환 (잘못됨)

# Request → Response (수정 후)
# server: {"jsonrpc":"2.0","id":1,"result":[...]}  ← 표준 response

# Error
# server: {"jsonrpc":"2.0","id":1,"error":{"code":-32001,"message":"run already in progress"}}
```

작업 항목:
1. **backend.py `_ws_handler`**: request `id` 파싱 → response에 동일 `id` 포함
2. **에러 객체 표준화**: code/message/data 구조, 커스텀 에러 코드 정의
3. **notification vs response 분리**: server→client push는 `id` 없는 notification 유지, request 응답은 `id` 포함 response로 변경
4. **클라이언트 `wsClient.ts`**: pending request map (`id → Promise`) 구현, response/notification 분기 처리

커스텀 에러 코드:

| 코드 | 의미 |
|------|------|
| -32600 | Invalid Request (JSON-RPC 표준) |
| -32601 | Method not found (JSON-RPC 표준) |
| -32001 | Run already in progress |
| -32002 | No active run (cancel 실패) |
| -32003 | Conversation not found |
| -32004 | Run timeout |

**완료 기준**: 모든 request가 표준 `{jsonrpc, id, result/error}` response 반환

---

### 6.3 실행 타임아웃 (우선순위: 높음)

**문제**: `_execute_run`에 타임아웃이 없어 CLI hang 시 대화가 영구 차단됨. mutex도 영원히 잠김.

**해결**:

```python
async def _execute_run(self, conv_id: str, params):
    timeout = params.get("timeout", 300)  # 기본 5분
    try:
        with anyio.fail_after(timeout):
            await runner_bridge.handle_message(...)
    except TimeoutError:
        # 1. subprocess kill
        # 2. 클라이언트에 timeout error notification
        await self.transport.edit(
            ref=progress_ref,
            message=RenderedMessage(text="⏱️ 실행 시간 초과 ({}s)".format(timeout)),
        )
    finally:
        self.run_map.pop(conv_id, None)
        # mutex 자동 해제 (async with)
```

- 기본 타임아웃: 300초 (5분), `chat.send` params로 override 가능
- 타임아웃 시 `run.status` notification으로 `idle` 복귀 알림

**완료 기준**: 5분 초과 run → 자동 종료 + 클라이언트 에러 표시 + mutex 해제

---

### 6.4 WS 연결 관리 & 멀티클라이언트 (우선순위: 중간)

**문제**: 활성 WS 연결 추적 없음. 클라이언트 disconnect 시 orphan run 잔류. 다중 클라이언트 접속 시 notification 누락.

**해결**:

```python
class TunadishBackend:
    _connections: set[websockets.WebSocketServerProtocol] = set()

    async def _ws_handler(self, ws):
        self._connections.add(ws)
        try:
            # ... 기존 로직
        finally:
            self._connections.discard(ws)
            # orphan run 정리: 이 연결이 시작한 run의 cancel 처리

    async def _broadcast(self, notification: dict):
        """모든 활성 클라이언트에 notification 전송"""
        for ws in list(self._connections):
            try:
                await ws.send(json.dumps(notification))
            except websockets.ConnectionClosed:
                self._connections.discard(ws)
```

작업 항목:
1. `_connections` set으로 활성 연결 추적
2. disconnect 시 해당 연결의 orphan run cancel 처리
3. `Transport.send/edit/delete`를 broadcast 방식으로 변경 (모든 연결에 전달)
4. 연결별 subscription 모델은 Phase 2로 유보 (MVP: 전체 broadcast)

**완료 기준**: 2개 클라이언트 동시 접속 → 양쪽 모두 메시지 수신, 한쪽 disconnect → orphan run 정리

---

### 6.5 메시지 순서 보장 (우선순위: 중간)

**문제**: 메시지가 `Record<message_id, Message>`로 저장되어 순서 메타데이터 없음. 렌더링 순서가 보장되지 않음.

**해결**:

```typescript
// 현재: Record<string, RenderedMessage>
// 변경: 배열 + timestamp
interface ChatMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;  // Date.now()
  status?: "sending" | "streaming" | "done" | "error";
}

interface ChatStore {
  messages: Record<string, ChatMessage[]>;  // conversationId → ordered array
}
```

- `message.new` 수신 시 배열 끝에 push (서버 발행 순서 = 도착 순서)
- `message.update`는 `id`로 기존 항목 in-place 교체
- timestamp는 표시용 (정렬 기준은 배열 index)

**완료 기준**: 메시지가 항상 발행 순서대로 표시

---

### 6.6 WS URL 설정 가능화 (우선순위: 낮음)

**문제**: 클라이언트 `ws://127.0.0.1:8765` 하드코딩, transport도 port 8765 기본.

**해결**:
- **Transport**: `transport_config`에서 `host`/`port` 읽기 (이미 port는 부분 구현)
- **클라이언트**: 설정 화면 or 환경변수 `TUNADISH_WS_URL`로 override
- **Tauri**: `src-tauri/tauri.conf.json`에 기본값, 런타임 설정으로 변경 가능

**완료 기준**: 다른 포트/호스트로 기동 가능

---

### 6.7 코드 정리 (우선순위: 낮음)

| 항목 | 위치 | 수정 |
|------|------|------|
| `import json` 중복 | `context_store.py` L1-2 | 중복 제거 |
| ContextPanel 미구현 | `client/src/` | placeholder → 최소 정보 표시 (프로젝트명, 연결 상태) |
| CLAUDE.md "현재 단계" 오래됨 | `CLAUDE.md` | "MVP Phase 1 완료, Sprint 7 진행 중"으로 갱신 |

---

### Sprint 7 실행 순서

```
6.1 e2e 검증 ──────────────── 블로커, 최우선
 ↓
6.2 JSON-RPC 정합성 ────────── e2e 통과 후 프로토콜 수정
6.3 실행 타임아웃 ──────────── 6.2와 병렬 가능
 ↓
6.4 WS 멀티클라이언트 ──────── 프로토콜 안정 후
6.5 메시지 순서 보장 ────────── 6.4와 병렬 가능
 ↓
6.6 WS URL 설정 ────────────── 독립 작업
6.7 코드 정리 ──────────────── 마지막
```

---

## 7. Phase 2+ 로드맵

| 순서 | 기능                                       | 비고                                            |
| ---- | ------------------------------------------ | ----------------------------------------------- |
| 1    | 구조화 이벤트                              | `handle_message` wrapper 또는 core patch        |
| 2    | 페르소나 (prompt preset) + EngineOverrides | ChatPrefsStore 분리                             |
| 3    | Conversation별 엔진 고정                   | ChatPrefsStore 확장                             |
| 4    | 프로젝트 CRUD UI                           | tunapi.toml 편집 + `build_runtime_spec → apply` |
| 5    | 스킬 · 스니펫                              | 입력창 안정화 후                                |
| 6    | 브랜치/서브대화                            | worktree 연동                                   |
| 7    | 토론 모드                                  | tunapi core 추출 후                             |
