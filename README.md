<div align="center">

# tunaDish

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Tauri v2](https://img.shields.io/badge/Tauri-v2-orange.svg)](https://v2.tauri.app/)

AI 코딩 에이전트 전용 경량 데스크톱 채팅 클라이언트

[**한국어**](#한국어) | [English](#english)

<!-- TODO: 스크린샷/데모 GIF 추가 -->

</div>

---

## 한국어

### 배경

[tunaPi](https://github.com/hang-in/tunaPi)를 Mattermost/Slack 없이도 쓰고 싶어서 만든 전용 클라이언트입니다.
tunaPi의 transport 플러그인으로 동작하며, WebSocket + JSON-RPC 2.0으로 통신합니다.

### 어떻게 동작하나요?

```
tunaDish (데스크톱 클라이언트)
    ↕ WebSocket + JSON-RPC 2.0
tunaPi (백엔드 서버)
    ↕ subprocess
Claude Code / Codex / Gemini CLI (AI 에이전트)
```

### 이런 때 좋아요

- 터미널 대신 GUI로 AI에게 일을 시키고 싶을 때
- 여러 프로젝트를 동시에 관리하고 싶을 때
- 대화를 브랜치로 나눠서 다른 방향을 실험하고 싶을 때
- 여러 AI를 같은 주제로 토론시키고 싶을 때

### 주요 기능

- **프로젝트 컨텍스트** — tunaPi 프로젝트별 독립 세션, 엔진/모델 설정
- **실시간 스트리밍** — AI 응답을 실시간으로 확인, 진행 단계 표시
- **대화 브랜치** — 특정 메시지에서 분기하여 다른 방향 탐색, 채택/보관/삭제
- **메시지별 모델 추적** — 모델을 바꿔가며 대화해도 각 메시지에 사용된 모델 표시
- **`!` 커맨드** — 채팅창에서 `!`로 tunaPi 커맨드 빠르게 실행
- **엔진/모델 동적 전환** — 대화 중 `!model`로 엔진과 모델을 자유롭게 변경
- **창 상태 기억** — 앱을 닫았다 열어도 이전 위치와 크기 유지

### 기술 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | Tauri v2 (Rust + WebView) |
| UI | React + TypeScript + Tailwind CSS |
| 컴포넌트 | shadcn/ui (base-ui 기반) |
| 상태 관리 | Zustand |
| 통신 | WebSocket + JSON-RPC 2.0 |
| 백엔드 | tunaPi (Python) — 별도 레포 |

### 준비물

- Node.js 18+
- Rust (Tauri 빌드용)
- [tunaPi](https://github.com/hang-in/tunaPi) 설치 및 설정 완료

### 설치 및 실행

```sh
git clone https://github.com/hang-in/tunaDish.git
cd tunaDish/client
npm install
```

#### 1. tunaPi 서버 시작

```sh
tunapi claude --transport tunadish
```

#### 2. 클라이언트 실행

```sh
cd client
npm run tauri dev
```

### 프로젝트 구조

```
tunadish/
├─ client/               # Tauri + React 클라이언트
│   ├─ src/              # React 소스
│   ├─ src-tauri/        # Tauri (Rust) 설정
│   └─ package.json
├─ vendor/rawq/          # rawq git submodule
├─ scripts/              # 빌드 스크립트
└─ docs/
    ├─ archive/          # 완료된 스프린트 기록
    ├─ explanation/      # 설계 문서
    ├─ plans/            # 개발 계획
    ├─ prompts/          # tunaPi 요청 프롬프트
    └─ reference/        # PRD, 브리핑, 핸드오프
```

### 자주 쓰는 커맨드

채팅창에서 `!`를 입력하면 커맨드 팔레트가 나타납니다.

| 하고 싶은 일 | 예시 |
|---|---|
| AI에게 작업 요청 | 그냥 타이핑 |
| 엔진 바꾸기 | `!model codex` |
| 세부 모델 지정 | `!model claude claude-opus-4-6` |
| 프로젝트 상태 확인 | `!status` |
| 대화 브랜치 생성 | `!branch create 실험` |
| 멀티 에이전트 토론 | `!rt "아키텍처 검토"` |
| 실행 취소 | `!cancel` |
| 전체 커맨드 보기 | `!help` |

### 현재 상태

Sprint 7 (안정화 & 기술 부채 해소) 진행 중.

자세한 내용: [docs/plans/development_plan.md](docs/plans/development_plan.md)

### 감사

- [tunaPi](https://github.com/hang-in/tunaPi) — 백엔드 엔진
- [takopi](https://github.com/banteg/takopi) — 모든 것의 출발점

### 라이선스

MIT — [LICENSE](LICENSE)

---

## English

### What is tunaDish?

tunaDish is a lightweight desktop chat client purpose-built for AI coding agents (Claude, Gemini, Codex). It works as a transport plugin for [tunaPi](https://github.com/hang-in/tunaPi), communicating over WebSocket + JSON-RPC 2.0.

### Key Features

- **Project Context** — Independent sessions per tunaPi project with engine/model settings
- **Real-time Streaming** — Live AI responses with progress step display
- **Conversation Branches** — Fork from any message to explore alternatives, then adopt or discard
- **Per-message Model Tracking** — Each message records which engine/model was used
- **`!` Commands** — Quick access to tunaPi commands from the chat input
- **Window State Persistence** — Remembers window position and size across restarts

### Prerequisites

- Node.js 18+
- Rust (for Tauri builds)
- [tunaPi](https://github.com/hang-in/tunaPi) installed and configured

### Quick Start

```sh
# Terminal 1: Start tunaPi server
tunapi claude --transport tunadish

# Terminal 2: Start the client
git clone https://github.com/hang-in/tunaDish.git
cd tunaDish/client
npm install
npm run tauri dev
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Tauri v2 (Rust + WebView) |
| UI | React + TypeScript + Tailwind CSS |
| Components | shadcn/ui (base-ui) |
| State | Zustand |
| Protocol | WebSocket + JSON-RPC 2.0 |
| Backend | tunaPi (Python) — separate repo |

### License

MIT — [LICENSE](LICENSE)
