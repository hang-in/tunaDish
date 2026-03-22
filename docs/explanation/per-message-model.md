# Per-Message Model/Engine 표시 설계

> 작성일: 2026-03-22 | Sprint 7 부속 기능

## 배경

현재 모델 정보는 conversation-level로만 존재하여, 모델을 변경하면 모든 이전 메시지의
에이전트 표시가 새 모델로 바뀌는 문제가 있다. 토론 기능에서 라운드별 모델 교체를 지원하려면
각 메시지에 사용된 engine/model이 개별 기록되어야 한다.

## 목표

1. 각 assistant 메시지에 실제 사용된 `engine`/`model` 기록
2. UI에서 모델이 바뀐 시점에 배지 표시
3. 토론 모드에서 참여자별 페르소나/모델 구분 기반 마련

## 데이터 모델 변경

### ChatMessage (클라이언트)

```ts
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  status: 'streaming' | 'done';
  // ── 신규 필드 ──
  engine?: string;    // 'claude' | 'gemini' | 'codex' | ...
  model?: string;     // 'opus-4' | 'flash-3' | ...
  persona?: string;   // 토론 시 역할 ('critic', 'advocate', ...)
}
```

### 서버 메시지 포맷 (tunapi → 클라이언트)

**message.new / message.update**
```json
{
  "method": "message.new",
  "params": {
    "ref": { "channel_id": "conv-123", "message_id": "msg-456" },
    "message": { "text": "..." },
    "engine": "claude",
    "model": "opus-4",
    "persona": null
  }
}
```

**conversation.history.result**
```json
{
  "messages": [
    {
      "role": "assistant",
      "content": "...",
      "timestamp": "2026-03-22T09:00:00Z",
      "engine": "claude",
      "model": "opus-4"
    }
  ]
}
```

## 구현 절차

### Phase 1: 클라이언트 (이 레포)

| # | 작업 | 파일 | 설명 |
|---|------|------|------|
| 1 | ChatMessage 타입 확장 | `chatStore.ts` | `engine?`, `model?`, `persona?` 필드 추가 |
| 2 | addMessage 수정 | `chatStore.ts` | 서버 params에서 engine/model 추출하여 저장 |
| 3 | wsClient 수정 | `wsClient.ts` | `message.new` 핸들러에서 engine/model을 addMessage에 전달 |
| 4 | setHistory 수정 | `wsClient.ts` | `conversation.history.result`에서 engine/model 매핑 |
| 5 | MessageView 배지 | `MessageView.tsx` | assistant 메시지에 engine/model 배지 표시 |
| 6 | 배지 표시 로직 | `MessageView.tsx` | 이전 메시지와 모델이 다를 때만 표시 |

### Phase 2: 서버 (tunapi 레포)

| # | 작업 | 파일 | 설명 |
|---|------|------|------|
| 1 | message.new에 engine/model 첨부 | `runner_bridge.py` | 현재 context의 engine/model을 notification에 포함 |
| 2 | journal에 engine/model 저장 | `journal.py` / `rawq` | 메시지 기록 시 메타데이터 포함 |
| 3 | history 응답에 engine/model 포함 | `backend.py` | conversation.history.result 각 메시지에 첨부 |
| 4 | 엔진 라우팅 수정 | `runner_bridge.py` | model.set 시 해당 모델의 engine으로 runner 전환 |

## 유의사항

### 하위 호환성

- 서버가 engine/model을 안 보내는 경우 → 클라이언트에서 `undefined`로 처리
- `undefined`이면 배지 미표시 (기존 동작과 동일)
- 기존 저장된 history에는 engine/model이 없으므로 배지 없이 표시

### 사이드이펙트

1. **메모리 증가**: 메시지당 ~50바이트 추가 (engine+model 문자열). 1000개 메시지 기준 ~50KB. 무시 가능.
2. **journal 스키마 변경**: tunapi journal에 필드 추가 시 기존 데이터와 호환 필요 (optional 필드로 추가).
3. **model.set 엔진 라우팅**: 현재 `model.set`이 engine을 전환하지 않음. gemini 모델 선택 시 claude runner로 보내는 버그 존재. Phase 2 #4에서 반드시 수정 필요.
4. **streaming 중 model 표시**: `message.new`(streaming 시작)에서 engine/model이 확정되므로 streaming 중에도 배지 표시 가능.
5. **브랜치 메시지**: 브랜치 채널의 메시지도 동일하게 engine/model 첨부됨. 추가 처리 불필요.

### 토론 기능 대비

- `persona` 필드를 메시지에 포함하면 토론 시 "비평가(claude/opus-4)" vs "옹호자(gemini/flash-3)" 라벨 표현 가능
- 라운드별 모델 교체 시 이전 라운드 메시지의 모델 표시가 유지됨
- 향후 `participant_id` 등 추가 확장 가능

## tunapi 요청 프롬프트

> 아래 내용은 tunapi 세션에서 사용할 프롬프트입니다.

```
docs/prompts/tunapi-per-message-model.md 참조
```
