# Sprint 7 — tunapi 작업 지시

> 이 문서는 tunapi 레포(`~/privateProject/tunapi/`)에서 실행할 Sprint 7 작업 목록.
> tunadish 클라이언트 측 변경은 이미 완료됨.

## 선행 조건

- tunadish transport 정상 등록 확인됨 (`tunapi.transport_backends.tunadish`)
- e2e 연결 확인: `project.list`, `conversation.list` 정상 응답
- 클라이언트: JSON-RPC 2.0 request id + pending map 구현 완료

---

## 1. JSON-RPC 2.0 서버 측 정합성 (우선순위: 최상)

### 현재 문제
- 서버가 notification 형태로 응답: `{"method": "project.list.result", "params": {...}}`
- 클라이언트의 request `id`를 무시

### 필요 수정

**파일**: `src/tunapi/tunadish/backend.py` — `_ws_handler` 메서드

1. 수신 메시지에서 `id` 필드 파싱
2. `id`가 있는 request에 대해 표준 JSON-RPC 2.0 response 반환:
   - 성공: `{"jsonrpc": "2.0", "id": <id>, "result": {...}}`
   - 실패: `{"jsonrpc": "2.0", "id": <id>, "error": {"code": <code>, "message": "..."}}`
3. `id`가 없는 request (notification)는 기존 방식 유지

### 커스텀 에러 코드
```
-32600  Invalid Request
-32601  Method not found
-32001  Run already in progress
-32002  No active run
-32003  Conversation not found
-32004  Run timeout
```

### 완료 기준
- 모든 RPC request에 `id` 포함 → 표준 response 반환
- 기존 notification (`message.new`, `run.status` 등)은 영향 없음

---

## 2. 실행 타임아웃 (우선순위: 높음)

### 현재 문제
- `_execute_run`에 타임아웃 없음
- CLI hang 시 대화 영구 차단 + mutex 영원히 잠김

### 필요 수정

**파일**: `src/tunapi/tunadish/backend.py` — `_execute_run` 메서드

1. `anyio.fail_after(timeout)` 래핑 (기본 300초)
2. 타임아웃 시:
   - subprocess kill
   - 클라이언트에 에러 notification 전송
   - mutex 해제
   - `run.status` = `idle` notification
3. `chat.send` params에서 `timeout` override 가능

### 완료 기준
- 5분 초과 run → 자동 종료 + 클라이언트 에러 표시 + mutex 해제
- 테스트: mock subprocess + timeout 시나리오

---

## 3. WS 멀티클라이언트 (우선순위: 중간)

### 현재 문제
- 활성 WS 연결 추적 없음
- disconnect 시 orphan run 잔류
- 다중 클라이언트 notification 누락

### 필요 수정

**파일**: `src/tunapi/tunadish/backend.py`

1. `_connections: set[websockets.WebSocketServerProtocol]` 추가
2. 연결 시 set에 추가, disconnect 시 제거
3. disconnect 시 해당 연결의 활성 run cancel
4. `Transport.send/edit/delete`를 모든 연결에 broadcast

### 완료 기준
- 2개 클라이언트 동시 접속 → 양쪽 모두 메시지 수신
- 한쪽 disconnect → orphan run 정리

---

## 4. WS URL/Port 설정 (우선순위: 낮음)

### 현재
- `backend.py`에서 port 8765 하드코딩

### 필요 수정

**파일**: `src/tunapi/tunadish/backend.py`

1. `transport_config`에서 `host`/`port` 읽기
2. 기본값: `127.0.0.1:8765`
3. 설정 예: `tunapi config set tunadish.port 9000`

---

## 5. 코드 정리 (우선순위: 낮음)

- `context_store.py`: `import json` 중복 제거
- 불필요 import 정리

---

## 참조

- 클라이언트 JSON-RPC 구현: `tunadish/client/src/lib/wsClient.ts` (sendRpc, pending map)
- 클라이언트 WS URL 설정: `resolveWsUrl()` → `__TUNADISH_WS_URL__` / `localStorage` / 기본값
- Development plan: `tunadish/docs/development_plan.md` 6절
