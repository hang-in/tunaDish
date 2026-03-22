# tunapi: Per-Message Engine/Model 메타데이터 구현 요청

## 배경

tunadish 클라이언트에서 메시지별로 사용된 engine/model을 표시하려 한다.
현재 `message.new` notification에는 `ref`와 `message`만 포함되어 있어서
클라이언트가 각 메시지에 어떤 모델이 사용됐는지 알 수 없다.

### 클라이언트 구현 현황 (완료)

- `ChatMessage` 타입에 `engine?`, `model?`, `persona?` 필드 추가
- `message.new` 수신 시 `params.engine`/`params.model`/`params.persona`를 메시지에 저장
- `MessageView`에서 `msg.engine` 우선 → conversation 설정 → projectContext 폴백으로 표시
- 모델 변경 감지 시 amber 강조 표시
- **SQLite 영구 저장소 도입 완료** — messages 테이블에 `engine`, `model`, `persona` 컬럼 존재
- DB write-through: `message.new` 수신 시 `dbSync.syncMessage()`로 SQLite에도 즉시 기록
- 앱 재시작 시 SQLite → Zustand 하이드레이션으로 engine/model 복원

**tunapi 서버에서 해당 필드를 보내주기만 하면 즉시 동작한다.**

## 요청 사항

### 1. `message.new` / `message.update` notification에 engine/model 첨부

`runner_bridge.py`(또는 해당 presenter)에서 메시지 전송 시 현재 context의 engine/model을 포함:

```python
await transport._send_notification("message.new", {
    "ref": {"channel_id": conv_id, "message_id": msg_id},
    "message": {"text": text},
    "engine": ctx.engine,     # 현재 실행 중인 엔진 (예: "claude", "gemini", "openai")
    "model": ctx.model,       # 현재 실행 중인 모델 (예: "opus-4", "flash-3")
})
```

- `message.update`에도 동일하게 `engine`/`model` 포함
- 값이 None이면 필드 생략 가능 (클라이언트는 optional로 처리)
- `persona`도 있으면 포함 (토론 모드 등에서 사용)

### 2. journal에 engine/model 메타데이터 저장

메시지를 journal/rawq에 기록할 때 engine/model도 함께 저장:

```python
# journal entry에 metadata 추가
entry = {
    "role": "assistant",
    "content": text,
    "timestamp": now_iso,
    "engine": engine,   # 추가
    "model": model,     # 추가
}
```

- 기존 데이터와 호환되도록 optional 필드로 추가
- rawq 스키마 변경이 필요하면 마이그레이션 계획 포함

### 3. `conversation.history.result`에 engine/model 포함

히스토리 응답의 각 메시지에 engine/model 첨부:

```python
"messages": [
    {
        "role": "assistant",
        "content": "...",
        "timestamp": "2026-03-22T09:00:00Z",
        "engine": "claude",    # 추가
        "model": "opus-4",     # 추가
    }
]
```

- journal에 engine/model이 없는 기존 메시지는 null/생략
- 클라이언트는 없으면 conversation-level 설정으로 폴백

### 4. (중요) model.set 시 엔진 라우팅 수정

현재 `model.set`으로 다른 엔진의 모델을 선택하면 (예: gemini 모델 선택)
여전히 claude runner로 전달되어 오류 발생:

```
error="There's an issue with the selected model (gpt-5.4).
It may not exist or you may not have access to it."
```

`subprocess.spawn` 로그를 보면 `claude.EXE --model gpt-5.4`로 실행됨.

**수정 필요**: `model.set` 시 해당 모델이 속한 engine을 자동 감지하여
engine도 함께 전환하거나, 잘못된 engine/model 조합일 때 오류 메시지 반환.

#### 추가 발견: 엔진 전환 시 resume token 충돌

`model.set`으로 엔진이 전환되면 (예: claude → gemini) 기존 resume token이
이전 엔진 소속이라 `run_with_resume_lock`에서 에러 발생:

```
RuntimeError: resume token is for engine 'claude', not 'gemini'
```

실제 로그에서 확인된 흐름:
- `ResumeToken(engine='claude', value='004b08ee...')` → `GeminiRunner(engine='gemini')`
- `runner.py:79-82`에서 `resume_token.engine != self.engine` 체크 후 RuntimeError

**해결 방안**:
- 엔진 전환 시 기존 resume token을 폐기하고 새 세션으로 시작
- 또는 `model.set` 핸들러에서 다른 엔진 전환 시 resume token을 null로 리셋

참고할 흐름:
1. `engine.list`에서 이미 각 engine별 model 목록을 클라이언트에 전달 중
2. `model.set` 핸들러에서 선택된 model이 현재 engine에 속하는지 확인
3. 다른 engine의 model이면 → engine 전환 (runner 교체) + resume token 리셋

### 5. 브랜치 대화에서도 동일 적용

- `branch:${branch_id}` 채널로 전송되는 `message.new`에도 engine/model 포함
- 브랜치는 부모 대화와 runner를 공유하므로 추가 작업은 없을 것으로 예상
- 단, 브랜치 히스토리(`conversation.history` with `branch_id`) 응답에도 engine/model 포함 필요

## 클라이언트 메시지 흐름 (참고)

```
[tunapi] message.new (engine, model 포함)
    ↓
[wsClient.ts] params.engine/model 읽어서 ChatMessage에 저장
    ↓
[chatStore] messages[channel_id] 배열에 engine/model 포함된 메시지 추가
    ↓
[dbSync] SQLite messages 테이블에 engine/model 기록 (fire-and-forget)
    ↓
[MessageView] msg.engine 우선 표시, 모델 변경 시 amber 강조
```

## 테스트 시나리오

1. claude/opus-4로 메시지 전송 → `message.new`에 `engine: "claude", model: "opus-4"` 포함 확인
2. `!model gemini flash-3`로 모델 변경 → 다음 메시지에 `engine: "gemini", model: "flash-3"` 포함 확인
3. 앱 재시작 후 history 로드 → 각 메시지에 engine/model이 보존되어 있는지 확인
4. 브랜치에서 메시지 전송 → 브랜치 메시지에도 engine/model 포함 확인
5. 존재하지 않는 모델 설정 시 적절한 오류 메시지 반환 확인

## 우선순위

| 항목 | 긴급도 | 이유 |
|------|--------|------|
| 1. message.new에 engine/model 첨부 | **높음** | 클라이언트 준비 완료, 이것만 하면 즉시 동작 |
| 3. history에 engine/model 포함 | **높음** | 앱 재시작 후 모델 표시에 필요 (DB 폴백 있지만 초기 데이터용) |
| 4. model.set 엔진 라우팅 | **높음** | 현재 다른 엔진 모델 선택 시 오류 발생 |
| 2. journal에 저장 | 중간 | history 응답의 데이터 소스 |
| 5. 브랜치 적용 | 낮음 | runner 공유이므로 1번 해결 시 자동 적용 가능성 높음 |

## 참고

- 클라이언트 설계 문서: `tunadish/docs/explanation/per-message-model.md`
- 클라이언트 SQLite 스키마: `tunadish/client/src/lib/db.ts` (messages 테이블)
- 향후 토론 기능에서 `persona` 필드도 동일 패턴으로 추가 예정
