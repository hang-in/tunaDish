# tunapi: Per-Message Engine/Model 메타데이터 구현 요청

## 배경

tunadish 클라이언트에서 메시지별로 사용된 engine/model을 표시하려 한다.
현재 `message.new` notification에는 `ref`와 `message`만 포함되어 있어서
클라이언트가 각 메시지에 어떤 모델이 사용됐는지 알 수 없다.

클라이언트 측은 이미 `ChatMessage`에 `engine?`, `model?`, `persona?` 필드를 추가했고,
`message.new` params에 해당 필드가 있으면 저장하도록 구현 완료.

## 요청 사항

### 1. `message.new` / `message.update` notification에 engine/model 첨부

`runner_bridge.py`에서 메시지 전송 시 현재 context의 engine/model을 포함:

```python
await transport._send_notification("message.new", {
    "ref": {"channel_id": conv_id, "message_id": msg_id},
    "message": {"text": text},
    "engine": ctx.engine,     # 현재 실행 중인 엔진
    "model": ctx.model,       # 현재 실행 중인 모델
})
```

- `message.update`에도 동일하게 `engine`/`model` 포함
- 값이 None이면 필드 생략 가능 (클라이언트는 optional로 처리)

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

## 테스트 시나리오

1. claude/opus-4로 메시지 전송 → `message.new`에 `engine: "claude", model: "opus-4"` 포함 확인
2. `!model gemini flash-3`로 모델 변경 → 다음 메시지에 `engine: "gemini", model: "flash-3"` 포함 확인
3. 앱 재시작 후 history 로드 → 각 메시지에 engine/model이 보존되어 있는지 확인
4. 존재하지 않는 모델 설정 시 적절한 오류 메시지 반환 확인

## 참고

- 클라이언트 설계 문서: `tunadish/docs/per-message-model.md`
- 향후 토론 기능에서 `persona` 필드도 동일 패턴으로 추가 예정
