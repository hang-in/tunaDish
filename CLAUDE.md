# CLAUDE.md — tunadish

## 프로젝트 개요

tunadish는 AI CLI 에이전트(claude, gemini, codex) 전용 경량 채팅 클라이언트.
tunapi의 transport 플러그인으로 동작하며 별도 레포로 관리.

## 기술 스택

- 클라이언트: React + TypeScript + Tauri (Electron 사용 금지)
- 컴포넌트: shadcn/ui
- 상태 관리: Zustand
- 백엔드 (transport): Python (tunapi 플러그인)
- 프로토콜: WebSocket + JSON-RPC 2.0
- 모바일: Android만 (iOS 제외)

## 레포 구조

```
tunadish/
  ├─ client/                # Tauri + React
  │   ├─ src/
  │   ├─ src-tauri/
  │   └─ package.json
  ├─ transport/             # Python tunapi 플러그인
  │   ├─ src/tunadish_transport/
  │   └─ pyproject.toml
  └─ docs/
      ├─ prd.md
      └─ briefing.md
```

## 핵심 문서

- `docs/prd.md` — 제품 요구사항 전체
- `docs/briefing.md` — 기술 브리핑 + 레포 세팅 요청사항 + JSON-RPC 프로토콜 스펙

## 현재 단계

레포 초기 세팅 전. `docs/briefing.md` 9절의 요청사항 순서대로 진행:
1. 레포 구조 검토
2. 클라이언트 스캐폴딩 (Tauri + React + shadcn/ui + Zustand)
3. Python transport 패키지 구조
4. 구현 플랜 (MVP Phase 1)

## tunapi 참조

tunapi는 설치된 패키지로 참조. 소스: `~/privateProject/tunapi/`
- Transport/Presenter/TransportBackend 인터페이스: `src/tunapi/transport.py`, `src/tunapi/presenter.py`, `src/tunapi/transports.py`
- 메시지 파이프라인: `src/tunapi/runner_bridge.py`
- 기존 transport 참고: `src/tunapi/mattermost/`, `src/tunapi/slack/`
