# Sprint 6: 핫픽스 및 안정화 (Hotfix & Stabilization)

## 개요
데스크탑 클라이언트 실행 및 백엔드 연동 중 발생한 심각한 버그들을 해결하고, 정상적인 앱 구동과 양방향 통신 연결(WebSocket)을 달성했습니다. 주요 픽스 항목은 다음과 같습니다.

## 주요 작업 내역

### 1. Tauri 및 Wayland 그래픽 규약 버그 우회 (Linux 환경)
- **문제**: `npm run tauri dev` 구동 중 webkit2gtk가 Wayland 디스플레이와 충돌하여 `Error 71 (규약 오류)`를 발생시키며 창이 뜨지 않음.
- **해결**: `package.json`의 `tauri` 명령어를 오버라이드하여, X11 렌더 백엔드로 강제 전환(`GDK_BACKEND=x11`) 및 dma-buf 충돌 비활성화(`WEBKIT_DISABLE_DMABUF_RENDERER=1`) 환경변수를 영구 적용.

### 2. Tailwind CSS 및 Vite 빌드 충돌 해결
- **문제**: `index.css`가 Tailwind CSS 버전 3.x 환경에서 인식되지 않는 변수(`outline-ring/50`, `border-border`)를 `@apply`하여 Vite 데브서버가 Pre-transform 에러를 뿜으며 즉각 종료됨.
- **해결**: 오류를 일으키는 `@apply` 룰넷을 표준 프로퍼티로 대체.

### 3. React (Zustand) 무한 루프 버그 렌더링 에러 해결
- **문제**: 애플리케이션 화면이 아예 텅 빈 하얀색(White Screen)으로 나타나고, 백그라운드 콘솔에서 `Maximum update depth exceeded` 오류 발생.
- **해결**: `ChatArea.tsx`에서 Zustand Selector가 구독 중 상태 렌더링마다매번 새 객체(`{}`)를 반환함으로써 얕은 비교(`===`)를 통과하지 못해 무한 루프에 빠진 것을 확인하고, `undefined` 반환 후 배열화 시점에 방어 코드를 짜는 방향으로 핫픽스.

### 4. Tunapi Transport 백엔드(Plugin) 호환성 및 스펙 패치
- **문제**: Python 백엔드가 구동 즉시 조용히 종료되며, 클라이언트 콘솔에 `Connection Refused`가 지속적으로 로그됨. 과거 `mattermost` 플러그인의 `.lock` 파일 잔류 및 `tunapi` 코어 라이브러리 인터페이스의 변경으로 인해 로드가 거부됨.
- **해결**:
  - `~/.tunapi/*.lock` 강제 삭제 완료.
  - `tunapi.core.messages` -> `tunapi.transport`로 모듈 이동에 따른 수십여 개의 import 경로 수정 (`RenderedMessage`, `MessageRef`, `SendOptions` 등).
  - `TunadishBackend`의 프로토콜 메서드(예: `check_setup`, `build_and_run`) 시그니처 형식을 `TransportBackend` Protocol(ABC)에 완벽하게 일치시킴.
  - `pyproject.toml`의 엔트리포인트 대상을 클래스 참조형에서, Module Singleton Instance `BACKEND = TunadishBackend()` 참조 방식으로 변경.

### 5. 프로젝트 목록 Load 시점 동기화
- **문제**: 백엔드 연결 지연/재연결 후, UI에 프로젝트 목록이 로드되지 않아 아무 작업도 할 수 없음.
- **해결**: 빈 프로젝트 목록 호출을 컴포넌트 마운트 시점에서 WebSocket 연결 성공 이벤트(`useSystemStore`의 `isConnected` 상태) 동기화 시점으로 변경.

## 다음 목표 (Next Steps)
- 실제 채팅 메시지 송수신 흐름 점검 및 llm.agent 처리(`chat.send` -> Progress 렌더링 개선)
- 응답 버퍼링 및 마크다운 UI 폴리싱
