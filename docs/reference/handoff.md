# Handoff — 2026-03-24

## tunadish란?

**코딩하지 않는 IDE — 함께 고민하는 동업자 플랫폼**

- 사용자 + Claude + Codex + Gemini = 최소 4인 팀
- (인)간지능과 (인)공지능은 같은 "인" — 상호보완 관계
- 바이브코딩이 아님 — 인간이 거버넌스를 주도, AI가 도메인 지식을 보완
- 기능 설계 나침반: "맡기는 것인가, 함께 고민하는 것인가?"

## 아키텍처

```
tunadish (Tauri + React)     ← 이 레포 (클라이언트 전용)
  └─ WebSocket (JSON-RPC 2.0)
       └─ tunapi (Python 백엔드, 별도 레포)
            ├─ tunadish transport
            ├─ mattermost transport
            └─ runners (claude, codex, gemini)
```

- **클라이언트**: `tunaDish/client/` (Tauri v2 + React + TypeScript)
- **백엔드**: `tunapi/src/tunapi/tunadish/` (읽기 전용, 수정 필요 시 tunapi에 요청)
- **DB**: SQLite (Tauri 로컬), `~/.tunadish/tunadish.db`
- **상태 관리**: Zustand (chatStore, contextStore, systemStore, runStore)

## 현재 상태 (2026-03-24)

### 완료
- Sprint 7 안정화 완료
- Sprint 8: SQLite 영구 저장소 도입
- 모바일 UI 프레임워크 (Android)
- 대화 브랜치: 생성, 전환, adopt, archive, delete, 다단계 지원
- 브랜치 패널 Breadcrumb + 계층 이름 (b1, b1.1, b1.1.2)
- 세션/브랜치 인라인 이름 변경 (더블클릭)
- 브랜치 생성 시 이름 입력 다이얼로그
- 메시지별 engine/model 메타데이터 (클라이언트 Phase 1)
- conversation-level settings (engine, model, persona, triggerMode)
- DB custom_label 분리 (서버 이름 / 사용자 이름 독립)
- 분기 시점 메시지에 브랜치 태그 표시
- `!cancel` 커맨드 팔레트 추가
- 타입 에러 전부 해결 (유닛 테스트 126/126 통과)
- 채팅 가상화 (react-virtuoso) + 스크롤 위치 안정화
- 코드베이스 구조 개선 (Phase 1-6 리팩토링)
- **FileViewer**: 채팅 내 파일 경로 클릭 → 팝업 뷰어 (Tauri read_text_file)
  - 인라인 코드, 테이블 셀, 마크다운 링크 내 경로 자동 감지
  - 상대 경로 → 프로젝트 기준 절대 경로 자동 변환
  - 마크다운 파일은 렌더링, 기타 파일은 원문 표시
  - 팝업 크기 조절 가능 (resize)
- **메시지 안정성 개선**: setHistory 머지 로직 수정 (로컬 메시지 보존)
- **삭제 메시지 추적**: deletedMessageIds로 세션 전환 시 재출현 방지
- **InputArea 투명 배경 복원**: absolute + ResizeObserver 동적 높이 측정

### 알려진 이슈
- mattermost → tunadish 프로젝트 세션: resume token이 터미널 세션과 충돌 → `!new`로 임시 해결
- tunapi Phase 2 미완: message.new에 engine/model 첨부, model.set 엔진 라우팅

### 진행 중 / 계획된 기능
- **스킬 시스템**: 도메인 지식 패키지, tunadish가 직접 관리 (tunapi는 transport)
- **git 브랜치 연동**: 대화 브랜치 생성 시 git branch 자동 생성
- **태그/메모**: 대화 단위 태그 + AI 자동 요약 메모
- **RT 토론 + 스킬**: 멀티 에이전트 각자 페르소나 + 스킬

## 핵심 문서

| 문서 | 위치 |
|------|------|
| 제품 요구사항 | `docs/reference/prd.md` |
| 기술 브리핑 | `docs/reference/briefing.md` |
| 개발 계획 | `docs/plans/development_plan.md` |
| 기능 아이디어 | `docs/plans/feature-ideas.md` |
| 메시지별 모델 설계 | `docs/explanation/per-message-model.md` |
| CLAUDE.md (작업 규칙) | `CLAUDE.md` |

## 레포 구조

```
tunadish/
  ├─ client/
  │   ├─ src/
  │   │   ├─ components/     ← UI 컴포넌트
  │   │   │   ├─ chat/       ← MessageView, InputArea, FileViewer, MarkdownComponents
  │   │   │   ├─ layout/     ← ChatArea, SidebarTree, BranchPanel, ContextPanel
  │   │   │   └─ ui/         ← shadcn/ui 기본 컴포넌트
  │   │   ├─ store/          ← Zustand stores
  │   │   ├─ lib/            ← wsClient, db, dbSync, dbHydrate, sidebarTreeData
  │   │   └─ index.css
  │   └─ src-tauri/          ← Tauri 설정 + Rust
  ├─ vendor/rawq/            ← 코드 검색 엔진 (submodule)
  ├─ docs/
  │   ├─ plans/              ← 개발 계획, 기능 아이디어
  │   ├─ reference/          ← PRD, 브리핑, 핸드오프 (이 파일)
  │   ├─ explanation/        ← 설계 문서
  │   └─ prompts/            ← tunapi 요청 프롬프트
  └─ CLAUDE.md               ← 작업 규칙
```

## 작업 규칙 요약

- 수정 전 관련 파일 전체 읽기
- 추측 코딩 금지
- 구현 지시 전 임의 수정 금지
- 작업 단위 끊어서 타입체크/테스트
- tunapi 파일 읽기 전용 (수정 필요 시 요청)
- 앱 재시작을 에이전트가 직접 하지 말 것
