# CLAUDE.md — tunadish

## 프로젝트 개요

tunadish는 AI CLI 에이전트(claude, gemini, codex) 전용 경량 채팅 클라이언트.
tunapi의 transport 플러그인으로 동작한다.

## 기술 스택

- 클라이언트: React + TypeScript + Tauri v2 (Electron 사용 금지)
- 컴포넌트: shadcn/ui (base-ui 기반)
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
      ├─ archive/           # 완료된 스프린트 기록
      ├─ explanation/        # 설계 문서, 기술 설명
      ├─ plans/             # 개발 계획, 로드맵
      ├─ prompts/           # tunapi 요청 프롬프트
      │   ├─ architecture/
      │   ├─ feature/
      │   ├─ integration/
      │   ├─ migration/
      │   └─ sprint7/
      └─ reference/          # PRD, 브리핑, 핸드오프

tunapi/               # 별도 레포 — 백엔드 (transport 포함)
  └─ src/tunapi/tunadish/   # tunadish transport
      ├─ backend.py
      ├─ commands.py
      ├─ context_store.py
      ├─ presenter.py
      ├─ rawq_bridge.py
      ├─ session_store.py
      └─ transport.py
```

## 핵심 문서

- `docs/reference/prd.md` — 제품 요구사항 전체
- `docs/reference/briefing.md` — 기술 브리핑 + JSON-RPC 프로토콜 스펙
- `docs/reference/handoff.md` — 현재 상태 핸드오프 (e2e 검증 결과, 남은 작업)
- `docs/plans/development_plan.md` — 스프린트별 개발 계획
- `docs/explanation/per-message-model.md` — 메시지별 모델 표시 설계

## 현재 단계

Sprint 7 (안정화 & 기술 부채 해소) 진행 중. (2026-03-22 기준)

### 완료된 항목 (클라이언트)
- e2e 검증: tunapi transport 정상 연결 확인
- JSON-RPC 2.0 정합성: request id + pending map 구현
- 메시지 순서 보장: chatStore 배열 기반 (추가 작업 불필요)
- WS URL 설정 가능화: `__TUNADISH_WS_URL__`, `localStorage`, 기본값 폴백
- shadcn/ui 컴포넌트 적용 (Phase 1-2): Tabs, Dialog, Input, ScrollArea, Command, Collapsible, AlertDialog
- `!` 커맨드 팔레트 키보드 내비게이션 수정
- 창 위치/크기 기억 (tauri-plugin-window-state)
- 엔진/모델 목록 동적 로딩 (`engine.list` RPC)
- 대화 브랜치: 생성, 재열기, 전환, adopt, archive, delete
- 브랜치 패널 재열기 시 checkpointId 기반 부모 context 표시
- 메시지별 engine/model 메타데이터 지원 (클라이언트 Phase 1 완료)
- conversation-level settings (engine, model, persona, triggerMode)

### 남은 항목 (tunapi 측)
- JSON-RPC 2.0 서버 측: request id 기반 response 반환
- 실행 타임아웃: `_execute_run`에 `anyio.fail_after` 적용
- WS 멀티클라이언트: `_connections` set + broadcast 구현
- message.new에 engine/model 메타데이터 첨부 (per-message-model Phase 2)
- model.set 시 엔진 라우팅 수정 (다른 엔진 모델 선택 시 runner 전환)
- journal에 engine/model 저장 + history 응답에 포함

## tunapi 참조

tunapi는 editable install로 참조. 소스: `D:\privateProject\tunapi\`
- tunadish transport 코드: `src/tunapi/tunadish/`
- Transport/Presenter/TransportBackend 인터페이스: `src/tunapi/transport.py`, `src/tunapi/presenter.py`, `src/tunapi/transports.py`
- 메시지 파이프라인: `src/tunapi/runner_bridge.py`
- 기존 transport 참고: `src/tunapi/mattermost/`, `src/tunapi/slack/`
