<div align="center">

# tunaDish

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Tauri v2](https://img.shields.io/badge/Tauri-v2-orange.svg)](https://v2.tauri.app/)

A lightweight chat client for AI coding agents — Desktop & Android

[**English**](#background) | [한국어](#한국어) | [日本語](#日本語)

<!-- TODO: screenshot / demo GIF -->

</div>

---

### Background

Built this client because we wanted to use [tunaPi](https://github.com/hang-in/tunaPi) without relying on Mattermost or Slack.
tunaDish runs as a transport plugin for tunaPi, communicating over WebSocket + JSON-RPC 2.0.

### How It Works

```
tunaDish (desktop client)
    ↕ WebSocket + JSON-RPC 2.0
tunaPi (backend server)
    ↕ subprocess
Claude Code / Codex / Gemini CLI (AI agents)
```

### When It's Useful

- When you want a GUI instead of a terminal to talk to AI
- When you need to manage multiple projects at once
- When you want to branch conversations and explore different directions
- When you want multiple AIs to debate the same topic

### Key Features

- **Project Context** — Independent sessions per tunaPi project with engine/model settings
- **Real-time Streaming** — Live AI responses with progress step display
- **Conversation Branches** — Fork from any message to explore alternatives, then adopt or discard
- **Per-message Model Tracking** — Each message records which engine/model was used
- **`!` Commands** — Quick access to tunaPi commands via command palette
- **Dynamic Engine/Model Switching** — Change engines and models mid-conversation with `!model`
- **SQLite Persistent Storage** — Conversations, branches, and memos saved locally via SQLite (tauri-plugin-sql)
- **Chat Virtualization** — Smooth scrolling even with thousands of messages (react-virtuoso)
- **Message Search** — Full-text search across all conversations
- **Mobile UI** — Responsive layout with drawer navigation, bottom sheets, and touch gestures
- **Window State Persistence** — Remembers window position and size across restarts

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Tauri v2 (Rust + WebView) |
| UI | React + TypeScript + Tailwind CSS |
| Components | shadcn/ui (base-ui) |
| State | Zustand |
| Storage | SQLite (tauri-plugin-sql) |
| Protocol | WebSocket + JSON-RPC 2.0 |
| Platforms | Windows, Linux, macOS, Android |
| Backend | tunaPi (Python) — separate repo |

### Prerequisites

- Node.js 18+
- Rust (for Tauri builds)
- [tunaPi](https://github.com/hang-in/tunaPi) installed and configured

### Setup & Run

```sh
git clone https://github.com/hang-in/tunaDish.git
cd tunaDish/client
npm install
```

#### 1. Start the tunaPi server

```sh
tunapi claude --transport tunadish
```

#### 2. Start the client

```sh
cd client
npm run tauri dev
```

### Project Structure

```
tunadish/
├─ client/               # Tauri + React client
│   ├─ src/              # React source
│   ├─ src-tauri/        # Tauri (Rust) config
│   └─ package.json
├─ vendor/rawq/          # rawq git submodule
├─ scripts/              # Build scripts
└─ docs/
    ├─ archive/          # Completed sprint records
    ├─ explanation/      # Design documents
    ├─ plans/            # Development plans
    ├─ prompts/          # tunaPi request prompts
    └─ reference/        # PRD, briefing, handoff
```

### Common Commands

Type `!` in the chat input to open the command palette.

| What you want to do | Example |
|---|---|
| Ask the AI to do something | Just type |
| Switch engine | `!model codex` |
| Set specific model | `!model claude claude-opus-4-6` |
| Check project status | `!status` |
| Create conversation branch | `!branch create experiment` |
| Multi-agent debate | `!rt "architecture review"` |
| Cancel execution | `!cancel` |
| See all commands | `!help` |

### Current Status

Core features complete. Stabilization & codebase refactoring done.

Details: [docs/plans/development_plan.md](docs/plans/development_plan.md)

### Thanks

- [tunaPi](https://github.com/hang-in/tunaPi) — The backend engine
- [takopi](https://github.com/banteg/takopi) — Where it all started

### License

MIT — [LICENSE](LICENSE)

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
- **SQLite 영구 저장소** — 대화, 브랜치, 메모를 SQLite로 로컬 저장 (tauri-plugin-sql)
- **채팅 가상화** — 수천 개 메시지에서도 부드러운 스크롤 (react-virtuoso)
- **메시지 검색** — 전체 대화에서 풀텍스트 검색
- **모바일 UI** — 드로어 네비게이션, 바텀시트, 터치 제스처 지원
- **창 상태 기억** — 앱을 닫았다 열어도 이전 위치와 크기 유지

### 기술 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | Tauri v2 (Rust + WebView) |
| UI | React + TypeScript + Tailwind CSS |
| 컴포넌트 | shadcn/ui (base-ui 기반) |
| 상태 관리 | Zustand |
| 저장소 | SQLite (tauri-plugin-sql) |
| 통신 | WebSocket + JSON-RPC 2.0 |
| 플랫폼 | Windows, Linux, macOS, Android |
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

핵심 기능 구현 완료. 안정화 & 코드베이스 리팩토링 완료.

자세한 내용: [docs/plans/development_plan.md](docs/plans/development_plan.md)

### 감사

- [tunaPi](https://github.com/hang-in/tunaPi) — 백엔드 엔진
- [takopi](https://github.com/banteg/takopi) — 모든 것의 출발점

### 라이선스

MIT — [LICENSE](LICENSE)

---

## 日本語

### 背景

[tunaPi](https://github.com/hang-in/tunaPi)をMattermost/Slackなしで使いたくて作った専用クライアントです。
tunaPiのtransportプラグインとして動作し、WebSocket + JSON-RPC 2.0で通信します。

### 仕組み

```
tunaDish (デスクトップクライアント)
    ↕ WebSocket + JSON-RPC 2.0
tunaPi (バックエンドサーバー)
    ↕ subprocess
Claude Code / Codex / Gemini CLI (AIエージェント)
```

### こんな時に便利

- ターミナルの代わりにGUIでAIに作業を任せたい時
- 複数のプロジェクトを同時に管理したい時
- 会話をブランチに分けて別の方向を試したい時
- 複数のAIに同じテーマで議論させたい時

### 主な機能

- **プロジェクトコンテキスト** — tunaPiプロジェクトごとの独立セッション、エンジン/モデル設定
- **リアルタイムストリーミング** — AI応答をリアルタイムで確認、進行ステップ表示
- **会話ブランチ** — 特定のメッセージから分岐して別の方向を探索、採用/保管/削除
- **メッセージごとのモデル追跡** — モデルを切り替えながら会話しても、各メッセージに使用されたモデルを表示
- **`!` コマンド** — チャット入力で`!`を入力してtunaPiコマンドを素早く実行
- **エンジン/モデル動的切替** — 会話中に`!model`でエンジンとモデルを自由に変更
- **SQLite永続ストレージ** — 会話、ブランチ、メモをSQLiteでローカル保存（tauri-plugin-sql）
- **チャット仮想化** — 数千メッセージでもスムーズなスクロール（react-virtuoso）
- **メッセージ検索** — 全会話でフルテキスト検索
- **モバイルUI** — ドロワーナビゲーション、ボトムシート、タッチジェスチャー対応
- **ウィンドウ状態記憶** — アプリを閉じて開いても前の位置とサイズを維持

### 技術スタック

| レイヤー | 技術 |
|---------|------|
| フレームワーク | Tauri v2 (Rust + WebView) |
| UI | React + TypeScript + Tailwind CSS |
| コンポーネント | shadcn/ui (base-ui) |
| 状態管理 | Zustand |
| ストレージ | SQLite (tauri-plugin-sql) |
| 通信 | WebSocket + JSON-RPC 2.0 |
| プラットフォーム | Windows, Linux, macOS, Android |
| バックエンド | tunaPi (Python) — 別リポジトリ |

### 前提条件

- Node.js 18+
- Rust (Tauriビルド用)
- [tunaPi](https://github.com/hang-in/tunaPi) インストール・設定済み

### セットアップ & 実行

```sh
git clone https://github.com/hang-in/tunaDish.git
cd tunaDish/client
npm install
```

#### 1. tunaPiサーバー起動

```sh
tunapi claude --transport tunadish
```

#### 2. クライアント起動

```sh
cd client
npm run tauri dev
```

### よく使うコマンド

チャット入力欄で `!` を入力するとコマンドパレットが表示されます。

| やりたいこと | 例 |
|---|---|
| AIに作業を依頼 | そのまま入力 |
| エンジン切替 | `!model codex` |
| モデル指定 | `!model claude claude-opus-4-6` |
| プロジェクト状態確認 | `!status` |
| 会話ブランチ作成 | `!branch create experiment` |
| マルチエージェント議論 | `!rt "アーキテクチャレビュー"` |
| 実行キャンセル | `!cancel` |
| 全コマンド表示 | `!help` |

### 感謝

- [tunaPi](https://github.com/hang-in/tunaPi) — バックエンドエンジン
- [takopi](https://github.com/banteg/takopi) — すべての出発点

### ライセンス

MIT — [LICENSE](LICENSE)
