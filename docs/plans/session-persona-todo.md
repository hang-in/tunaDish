# TODO: 세션 생성 시 모델/페르소나 선택 + 페르소나 시스템

## 현재 상태

- 세션 생성: `conversation.create` RPC에 `conversation_id` + `project`만 전달. engine/model/persona 없음 → 서버 기본값(claude) 사용
- 페르소나: DB 스키마(conversations, messages)에 `persona` 컬럼 존재, `ConvSettings`에 필드 있음, `useConvSettings`에서 폴백 구현 → **하지만 설정/표시 UI 없음 (빈껍데기)**

## 해야 할 것

### 1. 세션 생성 다이얼로그

- 현재 `+` 버튼 → 즉시 생성. 다이얼로그를 거치도록 변경
- 선택 항목: engine, model, persona (선택 사항), 세션 이름 (선택 사항)
- `conversation.create` RPC에 engine/model/persona 파라미터 추가 필요 → **tunapi 확인 필요**

### 2. 페르소나 시스템 설계

- 결정 필요:
  - 프리텍스트? 프리셋 목록? 둘 다?
  - tunapi에서 관리? 클라이언트 로컬?
  - RT 토론에서 각 에이전트별 페르소나 → 멀티 페르소나 지원?
- tunapi 측 `persona` 파라미터가 실제로 어떻게 동작하는지 확인 필요
  - system prompt에 주입? runner에 전달?

### 3. UI

- InputArea의 QuickChipEngine에 페르소나 선택 추가
- 세션별 페르소나 표시 (사이드바 or 채팅 헤더)
- 설정 페이지 (미래)

### 4. 메모된 메시지 채팅 내 표시

- 메모로 저장된 메시지를 채팅 영역에서 시각적으로 표시 (아이콘/뱃지/배경색 등)
- 필요: 메모 엔트리 ↔ 메시지 ID 매핑 (tunapi에서 메모 저장 시 source message_id 포함 여부 확인 필요)
- MessageView에서 해당 메시지에 메모 인디케이터 렌더링

### 5. 메모 실시간 갱신

- 현재: 메모 저장 후 사이드바에 즉시 반영 안 됨 (다른 오브젝트 클릭 시 반영)
- 원인: `memory.list.json` RPC가 동작하지 않음. `project.context.result`에서만 memoryEntries 갱신됨
- 현재 임시 처리: `command.result` + `run.idle` 후 2초 딜레이로 `project.context` 재요청 → 불안정
- 근본 해결: tunapi에서 메모 저장 시 `project.context` 알림을 push하거나, `memory.list.json` RPC 지원 확인

### 6. 헤더 아이콘 기능 연결

- Bell (알림): 에이전트 실행 완료/메모 저장 등 알림
- ClockCounterClockwise (히스토리): 대화 히스토리 또는 최근 활동
