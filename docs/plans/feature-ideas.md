# 기능 아이디어 — 2026-03-23

tunadish 철학: **"코딩하지 않는 IDE — 함께 고민하는 동업자 플랫폼"**
모든 기능은 "맡기는 것"이 아니라 "함께 고민하는 것"인지 기준으로 설계.

---

## 1. 대화 단위 태그/메모

### 개요
브랜치가 늘어날수록 맥락 파악이 어려워짐. 태그와 메모로 분류/상태 추적.

### 태그
- 브랜치/세션에 `#frontend`, `#urgent`, `#review` 등 태그 부착
- 사이드바에서 태그 표시 + 필터링
- AI가 대화 맥락 기반으로 태그 자동 추천 가능

### 메모
- 메시지 단위 또는 브랜치 단위로 한 줄 메모
- 사용자가 직접 남기거나, AI 동업자가 대화 종료 시 자동 요약 메모 제안
- 사이드바 브랜치명 아래에 메모 표시

### UI 위치
- 메시지 인라인: 메시지 액션에 "📌 메모" 추가
- 사이드바: 브랜치/세션 옆에 태그 뱃지 + 메모 한 줄
- 별도 패널 추가하지 않음 — 기존 UI에 자연스럽게 녹임

### 데이터
```typescript
// 브랜치/세션 확장
interface BranchConfig {
  tags?: string[];        // ["frontend", "urgent"]
  memo?: string;          // "사이드바 트리 구조 확정"
}

// 메시지 단위 메모 (선택)
interface MessageMemo {
  messageId: string;
  text: string;
  author: 'user' | 'assistant';
  timestamp: number;
}
```

### 저장
- 클라이언트(SQLite)에 저장 — tunapi 수정 불필요
- DB: `branches` 테이블에 `tags TEXT`, `memo TEXT` 컬럼 추가
- 또는 별도 `message_memos` 테이블

---

## 2. 대화 브랜치 + git 브랜치 연동

### 개요
대화 브랜치 생성 시 git 브랜치도 함께 생성. 사용자는 git을 몰라도 버전 관리 가능.

### 매핑
| 사용자 행동 (tunadish) | git 동작 (자동) |
|---|---|
| 브랜치 생성 | `git checkout -b feat/ui` |
| 대화 중 코드 변경 | `git add + commit` (에이전트 작업 단위) |
| 채택 (adopt) | `git merge` 제안 |
| 브랜치 삭제 | `git branch -d` |
| 브랜치 전환 | `git stash + checkout` |

### 핵심 원칙
- git 명령어를 사용자에게 노출하지 않음
- 대화 흐름 안에서 자연스럽게 버전 관리
- 사용자는 "브랜치 만들기, 대화하기, 채택하기" 세 가지만 알면 됨

### 기존 인프라
- `ConversationBranch.gitBranch?: string` 필드 이미 존재
- 브랜치 생성 다이얼로그에 "git 브랜치 함께 생성" 옵션 추가

### 고려사항
- git이 없는 환경에서도 동작해야 함 (git 연동은 선택적)
- base branch 선택 (main, develop 등)
- 채택 시 merge conflict 처리 — AI 동업자가 해결 제안

---

## 3. 스킬 시스템 (도메인 지식 패키지)

### 개요
스킬 = 에이전트의 능력이 아니라, 함께 고민할 때 필요한 도메인 지식 패키지.
tunadish가 직접 관리 (tunapi는 transport 역할에 집중).

### 에이전트별 스킬 소스
| 에이전트 | 경로 | 포맷 |
|---|---|---|
| Claude Code | `~/.claude/commands/`, `.claude/agents/` | Markdown |
| Codex CLI | `~/.agents/skills/`, `~/.codex/skills/` | SKILL.md + frontmatter |
| Gemini CLI | `~/.gemini/extensions/` | gemini-extension.json |

### 작업 감지 기반 활성화
- 사용자 메시지를 분석 → 관련 스킬 추천
- "PDF 만들어줘" → pdf 스킬 제안 → 브랜치 생성 시 활성화
- 스킬 content를 프롬프트에 context로 주입

### 브랜치 연동
```typescript
interface BranchConfig {
  persona?: string;           // "document-writer"
  activeSkills?: string[];    // ["pdf", "brand-guidelines"]
  engine?: string;
  model?: string;
}
```

### 구현 범위 (tunadish만)
1. Tauri fs API로 스킬 디렉토리 스캔
2. frontmatter 파싱 → 스킬 목록 UI
3. 브랜치 생성 시 스킬 선택
4. 메시지 전송 시 스킬 content prefix 조립 → tunapi에 전달

---

## 4. RT (Round Table) 토론 모드 확장

### 개요
한 브랜치에서 여러 에이전트가 각자 페르소나 + 스킬로 참여하여 토론.

### 구조
```typescript
interface RTBranchConfig {
  mode: 'rt';
  participants: Array<{
    engine: string;       // "claude" | "gemini" | "codex"
    persona: string;      // "critic" | "advocate" | "reviewer"
    skills?: string[];    // 참가자별 스킬
  }>;
}
```

### 기존 인프라
- tunapi에 RT 모드 기반 존재 (runner 교대 실행)
- 페르소나별 프롬프트 주입 지원

---

## 우선순위 (안)

| 순서 | 기능 | 이유 |
|---|---|---|
| 1 | 태그/메모 | 즉시 유용, tunapi 수정 불필요 |
| 2 | git 브랜치 연동 | 기존 gitBranch 필드 활용, 자연스러운 워크플로우 |
| 3 | 스킬 디스커버리 + 활성화 | 도메인 지식 기반 협업의 핵심 |
| 4 | RT 토론 + 스킬 | 기존 RT 인프라 위에 스킬 연동 |
