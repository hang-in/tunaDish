# WS Disconnect 시 Run 유지 및 메시지 복원 — tunapi 요청

> 작성: tunadish 클라이언트 측 분석 결과
> 날짜: 2026-03-24
> 대상: tunapi tunadish backend

## 배경

tunadish는 WebSocket 기반 transport로, 클라이언트와 서버가 WS 연결을 통해 실시간 통신한다.
현재 WS 연결이 끊기면 서버가 진행 중인 run을 **즉시 취소**하는데, 이로 인해:

1. **사용자 질문 유실**: 서버가 저널에 기록하기 전 연결이 끊기면 질문 자체가 사라짐
2. **답변 유실**: AI가 답변 생성 중이어도 강제 중단되어 결과물이 없음
3. **재연결 무의미**: 재연결해도 run이 이미 취소되어 복원할 게 없음

반면 mattermost/slack transport는 연결 유실에도 run이 계속 실행되고 채널에 결과가 남는다.

## 현재 코드 분석

### 문제 지점: `backend.py:494-503`

```python
finally:
    transport._closed = True
    self._active_transports.discard(transport)
    logger.info("tunadish ws disconnected: %s (remaining=%d)", remote, len(self._active_transports))
    # WS disconnect 시 해당 transport의 활성 run cancel
    for conv_id, ref in list(self.run_map.items()):
        task = self.running_tasks.get(ref)
        if task is not None and not task.cancel_requested.is_set():
            task.cancel_requested.set()
            logger.info("Cancelled orphan run for %s on ws disconnect", conv_id)
```

### 핵심 발견

- **transport 실패 자체는 run을 깨트리지 않는다**: `TunadishTransport._closed = True`이면 `send()`/`edit()`가 조용히 리턴
- **cancel은 명시적 코드가 거는 것**: `cancel_requested.set()` → `wait_cancel()` → `tg.cancel_scope.cancel()`
- **journal은 transport와 독립적**: journal.append는 WS 상태와 무관하게 기록 가능
- **mattermost/slack에는 이 cancel 로직이 없다**: run이 독립적으로 실행됨

### 타임아웃 설정

- `_RUN_TIMEOUT = 300` (기본 5분) — tunadish에만 존재
- mattermost/slack에는 run 타임아웃 없음
- 클라이언트에서 `chat.send` RPC의 `params.timeout`으로 오버라이드 가능 (현재 미사용)

## 요청 사항

### 1단계: WS disconnect 시 run 유지 (즉시)

**변경**: `backend.py:498-503`의 cancel 루프를 조건부로 변경

```python
# 기존: 무조건 cancel
for conv_id, ref in list(self.run_map.items()):
    task = self.running_tasks.get(ref)
    if task is not None and not task.cancel_requested.is_set():
        task.cancel_requested.set()

# 제안: 다른 활성 transport가 없을 때만 cancel (또는 유예)
if not self._active_transports:  # 마지막 transport가 떠날 때만
    for conv_id, ref in list(self.run_map.items()):
        task = self.running_tasks.get(ref)
        if task is not None and not task.cancel_requested.is_set():
            task.cancel_requested.set()
            logger.info("Cancelled orphan run for %s (no active transports)", conv_id)
else:
    logger.info("WS disconnected but %d transports remain, runs continue", len(self._active_transports))
```

또는 더 안전한 접근:

```python
# 유예 방식: N초 후에도 재연결 없으면 cancel
async def _delayed_cancel(self, conv_id, ref, delay=30):
    await anyio.sleep(delay)
    if not self._active_transports:  # 아직 아무도 연결 안 했으면
        task = self.running_tasks.get(ref)
        if task is not None and not task.cancel_requested.is_set():
            task.cancel_requested.set()
            logger.info("Cancelled orphan run for %s after %ds grace period", conv_id, delay)
```

### 2단계: 재연결 시 run 상태 복원

클라이언트가 재연결하면 `rehydrateActiveSession()`에서 `conversation.history`를 요청한다.
서버에서 필요한 것:

1. **진행 중인 run이 있으면 `run.status running` 통지** — 재연결한 클라이언트에게
2. **run 완료 후 결과가 journal에 있으면 `conversation.history`에 포함** — 현재 구조로 이미 가능할 것

클라이언트 측:
- `rehydrateActiveSession()`에 `run.status` 확인 로직 추가 예정 (tunadish 클라이언트에서 처리)

### 3단계: 멀티클라이언트 연동 (장기)

`_active_transports` set + `_broadcast()` 구조 완성 시:
- 클라이언트 A disconnect → transport A만 `_closed`
- 클라이언트 B가 연결되어 있으면 broadcast가 B에게 전달
- run cancel 자체가 불필요 (살아있는 transport가 있으므로)
- **이 단계에서 disconnect cancel 로직은 자연스럽게 "마지막 transport가 떠날 때만" 으로 수렴**

## 비교 정리

| 동작 | mattermost/slack | tunadish (현재) | tunadish (요청) |
|------|-----------------|----------------|----------------|
| WS disconnect 시 run | 계속 실행 | **즉시 취소** | 유지 (유예 후 판단) |
| 답변 저널 기록 | transport 무관 | cancel로 중단됨 | 완료까지 기록 |
| 재연결 시 복원 | 채널에서 로드 | 불가 | history에서 복원 |
| run 타임아웃 | 없음 | 300초 | 유지 (별도 이슈) |

## 클라이언트 측 이미 완료된 관련 수정

- `setHistory()` 머지 로직: 서버 히스토리에 없는 로컬 메시지(UUID 기반) 보존
- `deletedMessageIds`: 삭제 메시지 세션 전환 시 재출현 방지
- `projectContextByKey` 캐시: 세션 전환 시 QuickChips 리셋 방지
- `switchProjectContext()`: `clear()` 대신 캐시 기반 즉시 복원

## 우선순위

1단계만 적용해도 "짧은 WS 끊김 → 답변 유실" 문제가 해결됨.
2단계는 1단계 적용 후 클라이언트와 맞춰서 진행.
3단계는 멀티클라이언트 로드맵에 포함.
