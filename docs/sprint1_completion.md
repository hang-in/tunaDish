# Sprint 1 완료 보고서

> 작성일: 2026-03-20

## 1. 구현 목표
tunaDish의 백엔드 레이어 역할을 하는 `tunadish_transport` 모듈의 핵심 인터페이스를 구현하고, tunapi의 메시지 처리 파이프라인과 완벽히 연동하는 것이 목적이었습니다.

## 2. 작업 내역
1. **Transport 인터페이스 구현**
   - `TunadishTransport`: `Transport.send / edit / delete` 프로토콜을 준수하며 클라이언트로 JSON-RPC 형태의 알림(`message.new`, `message.update`, `message.delete`)을 릴레이하도록 작성.
   - `TunadishPresenter`: `ProgressState`를 기반으로 UI 표시용 Markdown 문자열을 생성(`RenderedMessage` 반환)하는 로직 작성. (구조화 이벤트 포기에 따른 MVP 명세 반영)
   - `TunadishBackend`: `websockets`를 활용하여 독자적인 포트(8765)로 서버를 띄우고 `check_setup` 등 프로토콜 요구사항에 대응.
2. **메시지 파이프라인 수립**
   - **Context Store**: `~/.tunapi/tunadish_context.json`을 기반으로 `ConversationContextStore`를 신설, `conversation_id`별 `ambient_context`를 관리하도록 처리.
   - **`handle_chat_send` 구현**: `per-conversation mutex(anyio.Lock)`를 적용하여 한 대화방에서 다중 실행이 동시에 일어나지 않게 차단.
   - **Run Map 선할당**: `Transport.send()`를 통해 progress placeholder를 먼저 생성하여 반환받은 `progress_ref`를 `run_map`에 담고 `handle_message(progress_ref=...)`에 주입.
   - **cwd 제어**: `runtime.resolve_run_cwd()`와 Telegram executor.py 패턴을 참조하여 `set_run_base_dir(cwd)` & `reset_run_base_dir(token)`을 통한 subprocess 실행 분기 처리.
3. **Run 취소 지원**
   - `run.cancel` RPC 수신 시 `run_map[conv_id]`를 조회해 `RunningTask.cancel_requested.set()`를 트리거하여 진행 중인 작업 취소를 구현.

## 3. 한계점 및 다음 단계
- `tunapi CLI` 로컬 환경 종속성 문제(로딩 무반응)로 인해 wscat을 통한 완전한 e2e 통신 점검은 보류되었습니다.
- Sprint 2에서는 **클라이언트 기본 레이아웃 및 WebSocket 연결**을 진행하게 됩니다. (상태 스토어, UI 컴포넌트, WebSocket 클라이언트 붙이기).
