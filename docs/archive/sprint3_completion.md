# Sprint 3 완료 보고서

> 작성일: 2026-03-20

## 1. 구현 목표
단일 대화방으로 하드코딩되어 있던 시스템을 `tunapi.toml` 기반의 "프로젝트" 단위 다중 대화(Conversation) 관리 체계로 확장하는 것이 목표였습니다.

## 2. 작업 내역
1. **프로젝트 목록 연동 (Backend & Frontend)**
   - 백엔드: WebSocket 최초 연결 시 클라이언트가 `project.list` RPC를 전송하면, 백엔드가 `runtime.project_aliases()`를 통해 실제 `tunapi` 환경에 설정된 프로젝트명 배열을 응답합니다.
   - 프론트엔드: 응답을 받아 `chatStore`에 저장하고, Sidebar UI에 표시합니다.
2. **다중 Conversation 동적 생성 적용**
   - 브라우저 사이드바에서 프로젝트 클릭 시 `conversation.create` RPC가 `crypto.randomUUID()`로 생성된 채널 ID와 타겟 프로젝트 명을 백엔드로 넘깁니다.
   - 백엔드는 이를 `ConversationContextStore`에 저장하여 프로젝트 문맥(`RunContext`)을 매핑하고 `conversation.created`로 응답합니다.
   - 프론트엔드는 이 응답을 받아 `conversations` 맵을 갱신하고 `activeConversationId`를 변경, 즉시 ChatArea를 새로 렌더링하도록 흐름을 완성했습니다.
3. **ChatArea 상태 주입 및 구조 개선**
   - 하드코딩된 `CURRENT_CONVERSATION_ID` 상수를 제거하고, Zustand를 구독하여 활성화된 대화방의 메시지들만 렌더링되게 리팩토링했습니다.
   - 대화방이 선택되지 않았을 때는 메시지 입력 폼을 숨기고 초기 안내 문구를 냅니다.

## 3. 남은 과제
- Sprint 4(통합 테스트)에서 실제 tunadish 실행 파일을 래핑한 데몬 관리 등 전방위적 e2e 성능을 검증할 준비가 되었습니다.
- NDK 환경 문제 극복 후 Android 하이브리드 빌드 점검이 필요할 수 있습니다.
