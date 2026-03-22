# CLAUDE.md — tunadish

## 프로젝트 개요

tunadish는 AI CLI 에이전트(claude, gemini, codex) 전용 경량 채팅 클라이언트.
tunapi의 transport 플러그인으로 동작한다.

## 기술 스택

- 클라이언트: React + TypeScript + Tauri (Electron 사용 금지)
- 컴포넌트: shadcn/ui
- 상태 관리: Zustand
- 백엔드 (transport): Python — tunapi 레포 내 `src/tunapi/tunadish/`에 위치
- 프로토콜: WebSocket + JSON-RPC 2.0
- 모바일: Android만 (iOS 제외)

## 레포 구조

```
tunadish/             # 이 레포 — 클라이언트 전용
  ├─ client/                # Tauri + React
  │   ├─ src/
  │   ├─ src-tauri/
  │   └─ package.json
  ├─ vendor/rawq/           # rawq git submodule
  ├─ scripts/               # build-rawq.sh, update-rawq.sh
  └─ docs/

tunapi/               # 별도 레포 — 백엔드 (transport 포함)
  └─ src/tunapi/tunadish/   # tunadish transport (이전 transport/ 디렉토리)
      ├─ backend.py
      ├─ commands.py
      ├─ context_store.py
      ├─ presenter.py
      └─ transport.py
```

> **참고**: `transport/` 디렉토리는 tunapi로 이전 완료됨 (e2e 검증 통과, 백업 삭제됨)

## 핵심 문서

- `docs/prd.md` — 제품 요구사항 전체
- `docs/briefing.md` — 기술 브리핑 + 레포 세팅 요청사항 + JSON-RPC 프로토콜 스펙

## 현재 단계

Sprint 7 (안정화 & 기술 부채 해소) 진행 중.
- `docs/development_plan.md` 6절: Sprint 7 상세 플랜

### 완료된 Sprint 7 항목 (클라이언트)
- e2e 검증: tunapi transport 정상 연결 확인 (project.list, conversation.list 동작)
- JSON-RPC 2.0 정합성: 클라이언트에 request id + pending map 구현
- 메시지 순서 보장: chatStore 이미 배열 기반 (추가 작업 불필요)
- WS URL 설정 가능화: `__TUNADISH_WS_URL__`, `localStorage`, 기본값 폴백

### 남은 Sprint 7 항목
- JSON-RPC 2.0 서버 측: tunapi에서 request id 기반 response 반환 필요
- 실행 타임아웃: tunapi `_execute_run`에 `anyio.fail_after` 적용 필요
- WS 멀티클라이언트: tunapi 측 `_connections` set + broadcast 구현 필요
- `transport.bak/` 삭제 완료 (2026-03-22)

## tunapi 참조

tunapi는 editable install로 참조. 소스: `~/privateProject/tunapi/`
- tunadish transport 코드: `src/tunapi/tunadish/`
- Transport/Presenter/TransportBackend 인터페이스: `src/tunapi/transport.py`, `src/tunapi/presenter.py`, `src/tunapi/transports.py`
- 메시지 파이프라인: `src/tunapi/runner_bridge.py`
- 기존 transport 참고: `src/tunapi/mattermost/`, `src/tunapi/slack/`
