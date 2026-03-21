# Sprint 4 & Sprint 5 완료 보고서

> 작성일: 2026-03-20

## 1. 구현 목표
tunaDish 클라이언트의 채팅 UX를 완성(자동 스크롤, 포커스 제어 등)하고, 실시간 통신망(WebSocket)의 연결성 제어와 예외 상황 처리를 보강하여 MVP(Phase 1)의 요구사항을 모두 충족하는 것이 목적이었습니다.

## 2. 작업 내역
### 2.1. 채팅 UX 폴리싱 (Sprint 4)
- **자동 스크롤 지원**: `ChatArea.tsx` 내 메시지 렌더 구역 하단에 `messagesEndRef`를 배치하고, React `useEffect`를 통해 상태(messagesList)가 변경될 때마다 자동 스크롤(`scrollIntoView`)되게 처리했습니다.
- **채팅 입력창 포커스 리셋**: 사용자가 메시지를 전송(버튼 또는 Shift+Enter)한 직후 즉시 입력값을 비우고 재차 `textarea`에 포커싱을 주어 연속적인 대화 입력을 원활히 했습니다.
- **상태 피드백**: 'running', 'cancelling' 등의 상태 변화에 따른 Cancel 버튼 및 프로그레스 렌더링 피드백이 시각적으로 일치하는 것을 확인했습니다.

### 2.2. 통신 안정화 및 에러 대응 (Sprint 5)
- **연결 상태 스토어 추적**: `systemStore.ts` (Zustand)를 신설하여 `wsClient`의 `onopen`, `onclose` 이벤트 발생 시 전역 `isConnected` 상태를 갱신하게 구현했습니다. (재연결 시도 3초 타이머 보존)
- **App.tsx 시스템 배너 노출**: 인터넷(소켓)이 끊기면 화면 최상단에 붉은색의 "Attempting to connect to the local tunapi daemon..." 경고 바를 노출하여 사용자가 에러 상황을 인지하도록 추가했습니다.

## 3. 종합 평가 및 Next Step
이로써 **Phase 1(최초 MVP 기준)**에 해당하는 레포 구조 생성, 통신 Transport, Zustand 기반 클라이언트 레이아웃 및 프로젝트/다중 대화방 바인딩의 모든 구현을 완료했습니다! 🎉
- **로컬 구동 방법**:
  1. `cargo/npm` 클라이언트 터미널: `cd client && npm run tauri dev`
  2. `tunapi` 백엔드 터미널: 앱 루트 기준 `.venv/bin/tunapi run --transport tunadish`
- 다음 단계(Phase 2)에서는 사용성 테스트를 통해 버그를 잡거나 tunapi 코어 확장을 통한 '구조화 이벤트' 렌더링, '페르소나 연동', 'Project CRUD UI' 등을 점진 도입할 수 있습니다.
