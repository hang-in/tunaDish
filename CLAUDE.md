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

> **참고**: `transport/` 디렉토리는 tunapi로 이전됨. 백업: `transport.bak/` (정상 동작 확인 후 삭제)

## 핵심 문서

- `docs/prd.md` — 제품 요구사항 전체
- `docs/briefing.md` — 기술 브리핑 + 레포 세팅 요청사항 + JSON-RPC 프로토콜 스펙

## 현재 단계

MVP Phase 1 완료 (Sprint 0~6). Sprint 7 (안정화 & 기술 부채 해소) 진입 예정.
- `docs/development_plan.md` 6절: Sprint 7 상세 플랜
- 최우선 블로커: e2e 검증 파이프라인 구축 (tunapi CLI 로딩 이슈)

## tunapi 참조

tunapi는 editable install로 참조. 소스: `~/privateProject/tunapi/`
- tunadish transport 코드: `src/tunapi/tunadish/`
- Transport/Presenter/TransportBackend 인터페이스: `src/tunapi/transport.py`, `src/tunapi/presenter.py`, `src/tunapi/transports.py`
- 메시지 파이프라인: `src/tunapi/runner_bridge.py`
- 기존 transport 참고: `src/tunapi/mattermost/`, `src/tunapi/slack/`
