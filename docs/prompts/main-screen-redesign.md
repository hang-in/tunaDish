# tunaDish 메인화면 UI 리디자인 구현 프롬프트

> 생성일: 2026-03-21
> 기반: 라운드테이블(claude/gemini/codex) 합의 + 최종 리뷰
> 대상: tunaDish 클라이언트 (`/client/src/`)

---

## 목표

tunaDish 메인화면을 **프로젝트 컨텍스트 운영 콘솔**로 업그레이드한다.
현재 3-pane 뼈대(사이드바 / 채팅 / 컨텍스트 패널)를 유지하면서, 사이드바 트리 구조 개선, 컨텍스트 패널 탭 시스템, 입력창 상태 퀵칩, Status Strip을 추가한다.

**핵심 원칙:**
- "채팅 앱"이 아니라 "에이전트 운영 콘솔"
- 좌측 = "어디서 일하는가", 중앙 = "무슨 대화를 하는가", 우측 = "현재 프로젝트 상태"
- RT(라운드테이블) 전용 모드는 이 프롬프트 범위 밖 (별도 스프린트)

---

## 기술 스택 (기존 유지)

| 영역 | 기술 |
|------|------|
| UI 프레임워크 | React + TypeScript |
| 컴포넌트 | shadcn/ui + @base-ui/react |
| 상태관리 | Zustand |
| 아이콘 | @phosphor-icons/react |
| 스타일 | Tailwind CSS + CSS 변수 (Material Design 3 팔레트) |
| 마크다운 | react-markdown + remark-gfm + rehype-highlight |
| 통신 | WebSocket JSON-RPC (`wsClient.ts`) |
| 데스크톱 | Tauri |

**디자인 시스템 (기존 CSS 변수 활용):**
```css
--primary: #5e6ad2
--surface-container-lowest: #0e0e0e   /* 메인 배경 */
--surface-container-high: #1a1a1a     /* 카드/패널 배경 */
--on-surface: #e5e2e1                 /* 주 텍스트 */
--on-surface-variant: rgba(229,226,225,0.6)  /* 보조 텍스트 */
--font-sans: 'Geist Variable'
--font-mono: 'JetBrains Mono Variable'
```

---

## 현재 코드 구조

```
src/
├── components/layout/
│   ├── Sidebar.tsx          ← 개편 대상
│   ├── ChatArea.tsx         ← InputArea 부분 수정
│   ├── TopNav.tsx           ← 경미한 수정
│   └── ContextPanel.tsx     ← 전면 재구현
├── store/
│   ├── chatStore.ts         ← 타입 확장 필요
│   ├── runStore.ts          ← ProgressState 타입 추가
│   └── systemStore.ts       ← 탭 상태 추가
├── lib/
│   ├── wsClient.ts          ← 새 JSON-RPC 메서드 핸들링 추가
│   └── mockData.ts          ← 목업 데이터 확장
└── App.tsx                  ← Status Strip 추가
```

---

## 구현 사양

### 1. 사이드바 리디자인 (`Sidebar.tsx`)

**현재:** Projects(Configured/Discovered) → Sessions 2단 구조
**변경:** 프로젝트별 3섹션 트리 (Sessions / Git Branches / Conversation Branches)

#### 1.1 트리 구조

```
🔍 검색 (프로젝트, 세션, 브랜치...)     ← 새로 추가
────────────────────────────────
▼ 📂 tunapi                            ← Configured 프로젝트
  ├─ 📡 Sessions
  │   ├─ 🟢 tunaDish #main              [claude/opus4.6]
  │   ├─ 💬 MM #dev-channel             [gemini/2.5-pro] ⏸ resume
  │   └─ ⚡ Slack #general              [codex/o4-mini]
  ├─ 🌿 Git Branches                    ← 기본 접힘, 데이터 있을 때만 표시
  │   ├─ main (active)
  │   └─ feature/rt-ui (active)          📎 2 entries
  └─ 🔀 Conversation Branches           ← 기본 접힘, 데이터 있을 때만 표시
      ├─ fork: UI 대안 A
      └─ fork: 리뷰 응답안

▶ 📂 my-saas                           ← 접힌 프로젝트
    (2 sessions · 1 branch)

▶ 📁 legacy-backend [Discovered]       ← 같은 리스트, 배지로 구분
────────────────────────────────
⚙ Settings
```

#### 1.2 세션 노드 정보

각 세션 행에 다음 배지를 표시:
- **Transport 아이콘**: tunaDish=🟢, Mattermost=💬, Slack=⚡, Telegram=✈
- **Engine/Model 배지**: `[claude/opus4.6]` — `chat_prefs.engine_models` 기반
- **보조 상태 배지** (우측, 소형):
  - `⏸ resume` — resume_token 있음
  - `⏳ pending` — pending review 있음
  - `📡 mentions` / `🔔 always` — trigger mode

#### 1.3 Discovered 프로젝트

- Configured와 같은 리스트에 배치
- `[Discovered]` 배지로 시각 구분 (별도 섹션 분리 금지)
- 클릭 시 `!project set` 동작 트리거

#### 1.4 검색바

- 사이드바 최상단, 항상 노출
- 프로젝트명, 세션 라벨, 브랜치명 통합 검색 (클라이언트 사이드 필터)

#### 1.5 데이터 모델 확장 (`chatStore.ts`)

```typescript
// 기존 Project에 추가
export interface Project {
  key: string;
  name: string;
  path?: string;
  defaultEngine?: string;
  source: 'configured' | 'discovered';
  // ── 신규 ──
  currentEngine?: string;         // 현재 활성 엔진
  currentModel?: string;          // 현재 모델
  persona?: string;               // 현재 페르소나
  triggerMode?: 'always' | 'mentions' | 'off';
}

// 기존 Conversation에 추가
export interface Conversation {
  // ... 기존 필드 유지
  engine?: string;
  model?: string;                 // 신규: 엔진별 모델 override
  triggerMode?: string;           // 신규: 세션별 trigger mode
  hasResumeToken?: boolean;       // 신규: resume 가능 여부
  pendingReviewCount?: number;    // 신규: 대기 중 리뷰 수
}

// ── 신규 타입 ──
export interface GitBranch {
  name: string;
  status: 'active' | 'merged' | 'abandoned';
  parentBranch?: string;
  linkedEntryCount: number;       // 연결된 메모리 엔트리 수
  linkedDiscussionCount: number;  // 연결된 토론 수
}

export interface ConversationBranch {
  id: string;
  label: string;
  parentSessionId: string;
  status: 'active' | 'closed';
  messageCount: number;           // 분기 이후 메시지 수
}
```

#### 1.6 새 JSON-RPC 메서드

서버에서 제공해야 할 새 메서드 (프론트엔드는 호출 + 결과 처리):
```
project.context     → Overview 데이터 (엔진, 모델, 페르소나, 트리거, 브랜치 요약)
branch.list         → { git_branches: GitBranch[], conv_branches: ConversationBranch[] }
memory.list         → { entries: MemoryEntry[] }
memory.search       → { query: string } → { results: MemoryEntry[] }
review.list         → { reviews: ReviewEntry[] }
review.action       → { review_id, action: 'approve'|'reject', comment? }
```

---

### 2. 컨텍스트 패널 재구현 (`ContextPanel.tsx`)

**현재:** 정적 프로젝트 정보 + 페르소나 + 스킬
**변경:** 탭 시스템 (초기 3탭, RT 모드 시 확장)

#### 2.1 탭 구성

**기본 모드 (3탭):**
```
[Overview] [Memory] [Branches]
```

**RT 모드 진입 시 (최대 6탭):**
```
[Overview] [Memory] [Branches] [Reviews] [Discussions] [Agents]
```
- Reviews, Discussions, Agents 탭은 해당 데이터가 존재할 때만 나타나는 컨텍스트 의존 탭

#### 2.2 Overview 탭 (신규, 첫 번째 탭)

`!context` 명령의 GUI 버전. 프로젝트 전체 상태 스냅샷:

```
📂 tunapi · ~/projects/tunapi
🤖 claude/opus4.6 · 🎭 Architect · 📡 mentions
────────────────────────────
🌿 Active Branch: feature/rt-ui
🔀 Conv Branch: fork: UI 대안 A
────────────────────────────
📌 최근 결정 (2)
  • API 인증 JWT 확정               3h ago
  • 캐시 전략 Redis 채택             1d ago
────────────────────────────
⏳ Pending Reviews (1)
  📄 "JWT 도입 합성" v2             [→ Review 탭]
────────────────────────────
🗣 최근 토론
  RT #12 "UI 설계" — 합성 완료       [→ Discussions 탭]
```

**데이터 소스:** `project.context` RPC 결과
**갱신:** 프로젝트/세션 전환 시 자동 요청, 5분 주기 폴링

#### 2.3 Memory 탭

`ProjectMemoryStore` 데이터를 시각화:

```
[decision ✓] [review ✓] [idea ✓] [context ✓]  🔍
───────────────────────────────────────────────
📌 API 인증을 JWT로 결정     decision · claude · 3h ago
   #auth #api               [편집] [삭제]
💡 캐시 레이어 도입 검토      idea · user · 1d ago
   #performance
[+ 메모리 추가]
```

- **필터 칩:** EntryType 4종 (decision/review/idea/context) 토글
- **검색:** 인라인 텍스트 검색 (`memory.search` RPC)
- **CRUD:** 인라인 편집, 삭제 확인 모달, 추가 폼
- **source 표시:** 어느 에이전트가 남겼는지

#### 2.4 Branches 탭

Git Branches + Conversation Branches를 **한 화면, 2섹션**으로:

```
── Git Branches ──
🌿 feature/rt-ui (active)    parent: main
   📎 2 entries · 1 discussion linked
✅ fix/memory-leak (merged)   ← 접힘

── Conversation Branches ──
🔀 fork: UI 대안 A (active)   parent: session #main
   3 messages diverged
🔀 fork: 리뷰 응답안 (active)
```

- Git branch: `BranchStatus` 아이콘 (active=🌿, merged=✅, abandoned=🗑)
- merged/abandoned는 기본 접힘, 필터로 표시
- Conversation branch: 분기점 이후 메시지 수 표시

#### 2.5 Reviews 탭 (컨텍스트 의존)

```
⏳ Pending (2)
  📄 "JWT 도입 합성" v2        artifact: synthesis
     [Diff 보기]               [Approve] [Reject]
  📄 "캐시 전략" v1

✅ Approved (5)                ← 접힘
❌ Rejected (1)                ← 접힘
```

- **Diff 뷰어** 인라인 표시 (핵심 차별점)
- Approve/Reject 시 `reviewer_comment` 입력 모달

#### 2.6 Discussions 탭 (컨텍스트 의존)

```
🗣 RT #12 "tunaDish UI 설계"   completed · 합성 있음
   참가: claude(architect), gemini(critic), codex(pragmatist)
   [합성 보기] [후속 질문 (47분 남음)]  ← TTL 잔여 시간

🗣 RT #11 "캐시 전략"          closed
   [합성 보기]
```

- `!rt follow` TTL 잔여 시간 실시간 표시
- Synthesis 결과: thesis, agreements, disagreements, open_questions 구조화

#### 2.7 Agents 탭 (컨텍스트 의존)

```
claude/opus4.6               🟢 working
├─ step 3/? · 42s elapsed
├─ 🔧 read_file src/main.rs  ✓
├─ 🔧 run_bash npm test      ⏳ running
└─ context: tunapi | main

gemini/2.5-pro               ⚪ idle
codex/o4-mini                 ⚪ idle
```

- `ProgressState.actions` 실시간 렌더링
- `ActionState.phase` 아이콘: started=⏳, completed+ok=✓, completed+fail=✗

#### 2.8 컨텍스트 패널 데이터 모델 (`chatStore.ts` 또는 별도 `contextStore.ts`)

```typescript
// ── Overview ──
export interface ProjectContext {
  projectKey: string;
  projectPath: string;
  engine: string;
  model: string;
  persona: string | null;
  triggerMode: string;
  activeGitBranch: string | null;
  activeConvBranch: string | null;
  recentDecisions: Array<{ title: string; source: string; timestamp: number }>;
  pendingReviewCount: number;
  recentDiscussion: { id: string; topic: string; status: string; synthesisAvailable: boolean } | null;
}

// ── Memory ──
export type MemoryEntryType = 'decision' | 'review' | 'idea' | 'context';
export interface MemoryEntry {
  id: string;
  type: MemoryEntryType;
  content: string;
  source: string;        // 생성한 에이전트
  tags: string[];
  createdAt: number;
}

// ── Reviews ──
export type ReviewStatus = 'pending' | 'approved' | 'rejected';
export interface ReviewEntry {
  id: string;
  title: string;
  artifactType: string;  // synthesis, code, document
  status: ReviewStatus;
  diff?: string;          // Diff 내용
  reviewerComment?: string;
  createdAt: number;
}

// ── Discussions ──
export interface DiscussionEntry {
  id: string;
  topic: string;
  status: 'in_progress' | 'completed' | 'closed';
  participants: Array<{ engine: string; role: string }>;
  followTtlRemaining?: number;  // 초 단위
  synthesis?: {
    thesis: string;
    agreements: string[];
    disagreements: string[];
    openQuestions: string[];
  };
}
```

---

### 3. Status Strip (`App.tsx`)

채팅 메인 영역 **하단에 고정**되는 얇은 상태 바:

```
┌─────────────────────────────────────────────────────────────┐
│ 🤖 claude/opus4.6 · step 3/? · 42s · 🔧 npm test ⏳       │
└─────────────────────────────────────────────────────────────┘
```

- 높이: 28px, 배경: `surface-container-high`
- idle 시 숨김 (height: 0 + transition)
- working 시 현재 엔진/모델 + 스텝 + 경과 시간 + 최근 액션
- 클릭 시 우측 Agents 탭 열림

#### 3.1 ProgressState 타입 (`runStore.ts` 확장)

```typescript
export interface ActionState {
  tool: string;           // 도구명 (read_file, run_bash 등)
  args?: string;          // 축약된 인자
  phase: 'started' | 'completed';
  ok?: boolean;           // completed 시 성공 여부
}

export interface ProgressState {
  engine: string;
  model: string;
  step: number;
  totalSteps?: number;    // 알 수 없으면 null
  elapsed: number;        // 초 단위
  actions: ActionState[];
}

// 기존 RunState에 추가
interface RunState {
  activeRuns: Record<string, RunStatus>;
  progress: Record<string, ProgressState>;  // 신규
  // ...
}
```

---

### 4. 입력창 퀵칩 (`ChatArea.tsx` InputArea 수정)

입력창 **좌측 상단**에 현재 세션 상태를 배지로 상시 노출:

```
┌─ [claude/opus4.6 ▾] [🎭 Architect ▾] [📡 mentions ▾] ─────────────┐
│                                                                      │
│  메시지 입력...                                                       │
│                                                                      │
│  [📎 Attach] [Md Preview]                        [Stop] [Send ➤]    │
└──────────────────────────────────────────────────────────────────────┘
```

#### 4.1 퀵칩 3개

| 칩 | 데이터 소스 | 클릭 동작 |
|----|-------------|-----------|
| Engine/Model | `currentEngine` + `currentModel` | Popover: 엔진 선택 → 엔진별 모델 목록 (2단 선택) |
| Persona | `persona` | Popover: 페르소나 목록 + "Custom..." 입력 |
| Trigger Mode | `triggerMode` | Popover: `always` / `mentions` / `off` 선택, effective mode + source 표시 |

- 각 칩은 shadcn `Popover` + `Command` 조합
- 변경 시 해당 `!` 커맨드를 JSON-RPC로 전송 (예: `!model claude opus4.6` → `command.execute`)

#### 4.2 커맨드 자동완성

입력창에 `!` 입력 시 IntelliSense 스타일 자동완성:
- 명령어 목록 + 설명 툴팁
- 인자 가이드 (예: `!model <engine> <model>`)
- shadcn `Command` 컴포넌트 활용

---

### 5. 모바일 적응형 레이아웃

**현재 반응형 동작 유지** + 추가 개선:

| 뷰포트 | 사이드바 | 컨텍스트 패널 | Status Strip |
|---------|----------|--------------|--------------|
| >= 1280px | 항상 표시 | 항상 표시 | 하단 고정 |
| 1024-1279px | 항상 표시 | 숨김/오버레이 | 하단 고정 |
| 768-1023px | 숨김/드로어 | 숨김/오버레이 | 하단 고정 |
| < 768px | 숨김/드로어 | Bottom Sheet | 채팅 상단 축약 |

- 모바일(< 768px)에서 컨텍스트 패널은 **하단에서 위로 올라오는 시트**
- 입력창 퀵칩: 모바일에서는 아이콘만 표시 (텍스트 숨김)

---

### 6. 목업 데이터 확장 (`mockData.ts`)

오프라인 개발을 위해 모든 새 데이터에 대한 목업 추가:

```typescript
export const MOCK_GIT_BRANCHES: Record<string, GitBranch[]> = { ... };
export const MOCK_CONV_BRANCHES: Record<string, ConversationBranch[]> = { ... };
export const MOCK_PROJECT_CONTEXT: Record<string, ProjectContext> = { ... };
export const MOCK_MEMORY_ENTRIES: Record<string, MemoryEntry[]> = { ... };
export const MOCK_REVIEWS: Record<string, ReviewEntry[]> = { ... };
export const MOCK_DISCUSSIONS: Record<string, DiscussionEntry[]> = { ... };
export const MOCK_PROGRESS: Record<string, ProgressState> = { ... };
```

---

## 구현 순서 (권장)

| 순서 | 작업 | 파일 | 난이도 |
|------|------|------|--------|
| 1 | 데이터 모델 정의 + 목업 데이터 | `chatStore.ts`, `contextStore.ts`, `mockData.ts` | 낮음 |
| 2 | 컨텍스트 패널 뼈대 (탭 시스템 + Overview) | `ContextPanel.tsx` | 중간 |
| 3 | 입력창 퀵칩 3개 | `ChatArea.tsx` InputArea | 낮음 |
| 4 | 사이드바 트리 개편 (3섹션) | `Sidebar.tsx` | 중간 |
| 5 | Status Strip | `App.tsx`, `runStore.ts` | 낮음 |
| 6 | Memory 탭 (CRUD + 검색) | `ContextPanel.tsx` → Memory 서브컴포넌트 | 중간 |
| 7 | Branches 탭 | `ContextPanel.tsx` → Branches 서브컴포넌트 | 낮음 |
| 8 | wsClient 새 메서드 핸들링 | `wsClient.ts` | 낮음 |
| 9 | 모바일 Bottom Sheet 변환 | `App.tsx`, CSS | 중간 |
| 10 | 커맨드 자동완성 | `ChatArea.tsx` InputArea | 높음 |

---

## 범위 외 (후속 스프린트)

- RT 전용 모드 (채팅 메인을 토론 캔버스로 전환)
- Reviews 탭 Diff 뷰어
- Discussions 탭 Synthesis 구조화 표시
- Agents 탭 실시간 ProgressState 렌더링
- 대화 분기 GUI (메시지 우클릭 → "여기서 분기")
- Journal 가상 스크롤 / cursor 기반 페이지네이션
- `project.context`, `branch.list` 등 백엔드 JSON-RPC 메서드 구현

---

## 스타일 가이드

- **기존 CSS 패턴 유지**: `.sidebar-item`, `.msg-row` 등 Mattermost 스타일 클래스
- **색상**: CSS 변수 기반 (`--primary`, `--surface-*`, `--on-surface-*`)
- **폰트 크기**: 11px(라벨), 12px(보조), 13px(본문), 14px(강조)
- **border-radius**: `var(--radius)` = 6px
- **간격**: Tailwind 유틸리티 (`gap-2`, `p-4` 등)
- **애니메이션**: `transition-all duration-300 ease-in-out` (패널 개폐)
- **스크롤바**: 4px 너비, `#282828` thumb
- **아이콘**: Phosphor Icons 사용, `size={14-18}`, active 시 `weight="fill"`
