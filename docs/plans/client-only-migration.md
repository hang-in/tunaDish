# 클라이언트 전용 기능 전환 계획

## 배경

tunadish는 tunapi의 transport 플러그인으로 동작하지만, 일부 기능은 tunadish 전용 UX로
다른 트랜스포터(mattermost, slack)와 무관하다. 이 기능들을 서버 RPC에서 클라이언트 SQLite로
전환하여 즉시 반영, 서버 의존성 제거, 오프라인 지원을 확보한다.

## 전환 대상

### 1. 메모 시스템 (최우선)

**현재 문제:**
- `message.save` → 서버 → `project.context` 재요청 → 반영 (왕복 지연)
- 저장 후 즉시 반영 안 됨
- 삭제 시 채팅 북마크 동기화 복잡 (cross-store content 매칭)

**전환 후:**
- SQLite `memos` 테이블에 직접 저장
- 저장 즉시 Zustand 반영 + UI 업데이트
- message_id 기반 정확한 북마크 매핑 (content 매칭 불필요)

**DB 스키마 (migration v3):**
```sql
CREATE TABLE IF NOT EXISTS memos (
  id              TEXT PRIMARY KEY,
  message_id      TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  project_key     TEXT NOT NULL,
  content         TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'context',
  tags            TEXT DEFAULT '[]',
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_memo_project ON memos(project_key);
CREATE INDEX IF NOT EXISTS idx_memo_message ON memos(message_id);
```

**제거되는 서버 RPC:**
- `message.save` → SQLite INSERT
- `memory.delete` → SQLite DELETE
- `memory.list.json` → SQLite SELECT
- `project.context` 응답의 `memory_entries` 필드 의존 제거

**제거되는 localStorage:**
- `tunadish:savedMessageIds` → `memos` 테이블의 `message_id`로 대체

### 2. 브랜치 메타데이터 관리

**현재 문제:**
- `branch.archive` / `branch.delete` → 서버 RPC (서버가 삭제 거부하는 경우 있음)
- dismissed 브랜치를 localStorage로 별도 관리
- 서버 응답이 로컬 DB 데이터를 덮어써서 리로드 후 브랜치 미표시

**전환 후:**
- 아카이브/삭제: SQLite `branches.status` 직접 업데이트
- dismissed → `status = 'dismissed'`로 통합 (localStorage 제거)
- 서버 RPC는 브랜치 생성/채택(대화 포크/병합)만 담당

**제거되는 서버 RPC:**
- `branch.archive` → SQLite `UPDATE status = 'archived'`
- `branch.delete` → SQLite DELETE
- `branch.list.json` → SQLite SELECT (이미 dbHydrate에서 로드 중)

**제거되는 localStorage:**
- `tunadish:dismissedBranches` → `branches.status = 'dismissed'`

### 3. 페르소나 설정 (현재 빈 셸)

서버 `persona.set` RPC는 현재 실제 동작이 없다.
conversation 테이블의 persona 컬럼에 이미 저장 중이므로 서버 RPC 제거 가능.
단, 서버가 페르소나 기반 시스템 프롬프트를 주입하게 되면 다시 서버 연동 필요.
→ **보류** (서버 측 구현 확정 후 결정)

## 구현 순서

### Phase 1: 메모 시스템 전환
1. DB migration v3: `memos` 테이블 추가
2. db.ts: `insertMemo`, `deleteMemo`, `loadMemos`, `isMemoSaved` 함수
3. dbSync.ts: fire-and-forget 래퍼
4. dbHydrate.ts: 앱 시작 시 memos → contextStore 로드
5. contextStore: `savedMessageIds` → memos 테이블 기반으로 전환
6. useMessageActions: `message.save` RPC → `dbSync.syncMemo()` 직접 호출
7. MemoTab: `memory.delete` RPC → `dbSync.syncDeleteMemo()` 직접 호출
8. MemoTab: `project.context` 재요청 제거 (탭 열 때 SQLite에서 직접 로드)
9. localStorage `tunadish:savedMessageIds` 제거

### Phase 2: 브랜치 메타 전환
1. contextStore: dismissed 로직 제거, `branches.status` 통합
2. ArchiveTab: `branch.delete` RPC → SQLite DELETE
3. branchHandlers: `branch.archive` → SQLite status 업데이트
4. localStorage `tunadish:dismissedBranches` 제거
5. `setProjectContext` 병합 로직 단순화 (서버 브랜치는 생성/채택만)

## 서버에 남기는 RPC (변경 없음)

| RPC | 이유 |
|-----|------|
| `chat.send` | 에이전트 실행 |
| `message.retry` | 에이전트 재실행 |
| `conversation.history` | 서버가 SSOT |
| `conversation.create/delete/list` | 서버 세션 관리 |
| `engine.list`, `model.set` | 런너 라우팅 |
| `trigger.set` | 서버 응답 정책 |
| `branch.create` | 대화 컨텍스트 포크 |
| `branch.adopt` | 대화 병합 |
| `project.context` | 서버 파일시스템 (단, memory_entries 의존 제거) |
| `code.search`, `code.map` | rawq 서버사이드 |
| `run.cancel` | 서버 프로세스 제어 |
