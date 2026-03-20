# Sprint 2 완료 보고서

> 작성일: 2026-03-20

## 1. 구현 목표
tunaDish 클라이언트의 기본 레이아웃(3패널 구조)을 적용하고, React 상태 관리(Zustand)와 더불어 Python Transport와의 실시간 연결을 위한 WebSocket 연동(wsClient)을 수립하는 것을 목표로 했습니다.

## 2. 작업 내역
1. **Zustand 스토어 설정 (`src/store/`)**
   - `ChatStore`: 대화방(채팅 채널)별로 메시지 딕셔너리를 관리하도록 설계하였으며, Transport가 전하는 `message.new`, `message.update`, `message.delete` 이벤트를 받아 즉시 상태를 갱신하도록 처리했습니다.
   - `RunStore`: 런타임의 실행 및 취소 상태(`idle`, `running`, `cancelling`)를 보관하고, UI에서 사용자의 취소 요청(`requestCancel`)을 트리거하는 비동기 액션을 구현했습니다.
2. **WebSocket 연동 모듈 (`src/lib/wsClient.ts`)**
   - 클라이언트에서 `.connect()` 호출 시 로컬 백엔드망에 웹소켓 연결을 확립하며, 재연결 옵션을 추가했습니다.
   - Transport에서 발생한 RPC 메서드를 잡아 Zustand Store 함수들(`addMessage`, `updateMessage` 등)로 안전하게 주입시키는 이벤트 핸들링 유틸리티를 완성했습니다.
3. **기본 3패널 레이아웃 적용 (`src/components/layout/`)**
   - **Sidebar**: 프로젝트 목록이 들어갈 좌측 메뉴. (현재는 `default_project` 하드코딩)
   - **ContextPanel**: 추후 컨텍스트와 파일 트리를 표시할 우측 패널.
   - **ChatArea**: 중앙 메인 채팅창으로, `react-markdown`, `remark-gfm`, `rehype-highlight`를 사용하여 렌더링된 마크다운을 표시하도록 코딩했습니다. 하단에는 상태(Status) 피드백과 Cancel 버튼을 추가했습니다.

## 3. 한계점 및 다음 단계
- 현재 UI의 `default_conversation` ID가 상수로 박혀있습니다.
- Sprint 3에서는 `tunapi.toml` 기반 프로젝트 구성 환경을 연결하고, 다중 대화(Conversation) 생성 및 UUID 매핑을 구현합니다.
