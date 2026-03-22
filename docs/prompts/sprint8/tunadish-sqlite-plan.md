# tunadish SQLite 도입 계획

> Sprint 8 — 로컬 영구 저장소 도입
> 작성일: 2026-03-22

## 1. 배경 및 목적

### 왜 필요한가

tunadish는 Mattermost 무료 버전의 대화 제한(1만 건+, 세션 만료 후 열람 불가)을 해결하기 위해 시작된 프로젝트.
현재 클라이언트는 **완전 메모리 기반** — 앱 재시작 시 모든 데이터 손실, 서버 연결 끊기면 아무것도 할 수 없음.

### 핵심 가치

| 가치 | 설명 |
|------|------|
| 대화 영구 보존 | mm 세션 만료된 대화도 항상 열람 가능 |
| 오프라인 열람 | tunapi 서버 없이도 과거 기록 탐색 |
| 전문 검색 | FTS5로 1만+ 대화에서 키워드 검색 |
| 빠른 시작 | 서버 응답 전에 로컬 캐시에서 즉시 UI 표시 |

### 왜 SQLite인가

- Tauri 데스크톱 앱 → SQLite 네이티브 내장 (별도 서버 프로세스 불필요)
- 1인 사용자 → 동시 쓰기 경합 없음 (SQLite 약점 해당 없음)
- 예상 3년치 데이터 (~1M 메시지, ~5GB) 충분히 처리
- iOS 메시지, Firefox 히스토리, Android 연락처 등 동일 패턴

## 2. 현재 상태

### 저장소 구조

```
현재: 완전 메모리 기반
├── Zustand chatStore (conversations, messages) — 휘발성
├── Zustand contextStore (projectContext) — 휘발성
├── Zustand systemStore (UI state) — 휘발성
├── localStorage — 네비게이션 상태만 (lastProjectKey, lastConvId, wsUrl)
└── 모든 데이터 → tunapi WS RPC로 매번 재요청
```

### Tauri 플러그인 현황

- 설치됨: `tauri-plugin-opener` v2만
- DB/SQL 플러그인: 없음
- SQLite 크레이트: 없음

## 3. 아키텍처 설계

### 3.1 데이터 흐름

```
tunapi (JSONL 저널)            tunadish
  │                              │
  │── WS RPC ──────────────────→ │ wsClient
  │                              │   │
  │                              │   ├─→ Zustand Store (실시간 UI)
  │                              │   │
  │                              │   └─→ SQLite (영구 저장)
  │                              │         │
  │                              │         ├── write-through: 수신 즉시 저장
  │                              │         └── read-on-start: 앱 시작 시 로드
  │                              │
  │                              └── 오프라인 시 SQLite에서 직접 읽기
```

### 3.2 Source of Truth 정책

| 데이터 | 실시간 source | 영구 source | 충돌 해소 |
|--------|--------------|-------------|----------|
| 메시지 내용 | tunapi WS | SQLite | 서버 우선 (서버 수신 시 upsert) |
| 대화 메타데이터 | tunapi WS | SQLite | 서버 우선 |
| conv settings | Zustand (optimistic) | SQLite | 서버 확정 후 SQLite 갱신 |
| UI 상태 | Zustand | localStorage | 로컬 전용 |

### 3.3 접근 방식: `tauri-plugin-sql`

Tauri 공식 SQL 플러그인 사용. Rust 측에서 SQLite를 관리하고, 프론트엔드에서 JS API로 접근.

```
Frontend (TypeScript)
  │
  ├── @tauri-apps/plugin-sql  ← npm 패키지
  │     │
  │     └── invoke('plugin:sql|execute', ...)
  │
  └── Tauri IPC Bridge
        │
        └── Rust: tauri-plugin-sql  ← Cargo 의존성
              │
              └── rusqlite (SQLite3)
```

## 4. 데이터베이스 스키마

### 4.1 핵심 테이블

```sql
-- 프로젝트
CREATE TABLE projects (
  key           TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  path          TEXT,
  default_engine TEXT,
  source        TEXT NOT NULL DEFAULT 'configured', -- configured | discovered
  type          TEXT NOT NULL DEFAULT 'project',    -- project | channel
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 대화
CREATE TABLE conversations (
  id            TEXT PRIMARY KEY,
  project_key   TEXT NOT NULL REFERENCES projects(key),
  label         TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'main', -- main | branch | discussion
  parent_id     TEXT REFERENCES conversations(id),
  source        TEXT DEFAULT 'tunadish',      -- tunadish | mattermost | slack
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  -- conversation-level settings
  engine        TEXT,
  model         TEXT,
  persona       TEXT,
  trigger_mode  TEXT
);

CREATE INDEX idx_conv_project ON conversations(project_key);
CREATE INDEX idx_conv_parent ON conversations(parent_id);
CREATE INDEX idx_conv_updated ON conversations(updated_at DESC);

-- 메시지
CREATE TABLE messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL, -- user | assistant
  content         TEXT NOT NULL,
  timestamp       INTEGER NOT NULL,
  status          TEXT DEFAULT 'done', -- sending | streaming | done | error
  progress_content TEXT,
  metadata        TEXT, -- JSON, 향후 확장용
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_msg_conv ON messages(conversation_id, timestamp);
CREATE INDEX idx_msg_timestamp ON messages(timestamp DESC);

-- FTS5 전문 검색 인덱스
CREATE VIRTUAL TABLE messages_fts USING fts5(
  content,
  content='messages',
  content_rowid='rowid',
  tokenize='unicode61'
);

-- FTS 자동 동기화 트리거
CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
END;
CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, old.content);
END;
CREATE TRIGGER messages_au AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, old.content);
  INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
END;

-- 브랜치 메타데이터
CREATE TABLE branches (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  label           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active',
  checkpoint_id   TEXT,
  git_branch      TEXT,
  parent_branch_id TEXT,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_branch_conv ON branches(conversation_id);

-- 스키마 버전 관리
CREATE TABLE schema_version (
  version   INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO schema_version (version) VALUES (1);
```

### 4.2 향후 확장 테이블 (Sprint 8 이후)

```sql
-- 메모리 엔트리 (로컬 캐시)
-- 코드 검색 결과 캐시
-- 토론(discussion) 라운드 기록
-- 핸드오프 기록
```

## 5. 구현 계획

### Phase 1: 기반 설정 (필수)

| # | 작업 | 상세 |
|---|------|------|
| 1.1 | Tauri SQL 플러그인 설치 | `cargo add tauri-plugin-sql`, `npm add @tauri-apps/plugin-sql` |
| 1.2 | 플러그인 초기화 | `lib.rs`에 `.plugin(tauri_plugin_sql::Builder::default().build())` |
| 1.3 | DB 초기화 모듈 | `client/src/lib/db.ts` — 연결, 마이그레이션, 기본 CRUD |
| 1.4 | 스키마 마이그레이션 | 버전 기반 자동 마이그레이션 시스템 |

### Phase 2: Write-through 캐싱

| # | 작업 | 상세 |
|---|------|------|
| 2.1 | 메시지 저장 | wsClient에서 메시지 수신 시 SQLite에 동시 기록 |
| 2.2 | 대화 저장 | conversation.list, conversation.create 수신 시 저장 |
| 2.3 | 프로젝트 저장 | project.list 수신 시 저장 |
| 2.4 | conv settings 저장 | updateConvSettings 호출 시 SQLite에도 반영 |

### Phase 3: Read-on-start

| # | 작업 | 상세 |
|---|------|------|
| 3.1 | 앱 시작 시 로드 | SQLite → Zustand 초기 상태 하이드레이션 |
| 3.2 | 서버 연결 전 UI | 로컬 데이터로 대화 목록 즉시 표시 |
| 3.3 | 서버 연결 후 동기화 | 서버 데이터로 로컬 캐시 갱신 (upsert) |

### Phase 4: 검색 & 오프라인

| # | 작업 | 상세 |
|---|------|------|
| 4.1 | FTS5 검색 UI | 사이드바 또는 상단에 검색 입력 + 결과 표시 |
| 4.2 | 오프라인 모드 | 서버 미연결 시 읽기 전용 모드 자동 전환 |
| 4.3 | 대화 페이지네이션 | 대량 메시지 시 가상 스크롤 + DB 페이지네이션 |

## 6. db.ts 모듈 설계

```typescript
// client/src/lib/db.ts

import Database from '@tauri-apps/plugin-sql';

let db: Database | null = null;

/** DB 초기화 (앱 시작 시 1회) */
export async function initDb(): Promise<Database> {
  if (db) return db;
  db = await Database.load('sqlite:tunadish.db');
  await migrate(db);
  return db;
}

/** 스키마 마이그레이션 */
async function migrate(db: Database): Promise<void> {
  const result = await db.select<{ version: number }[]>(
    'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1'
  ).catch(() => []);
  const currentVersion = result[0]?.version ?? 0;

  for (const migration of MIGRATIONS) {
    if (migration.version > currentVersion) {
      await db.execute(migration.sql);
      await db.execute(
        'INSERT INTO schema_version (version) VALUES (?)',
        [migration.version]
      );
    }
  }
}

/** 메시지 upsert (write-through) */
export async function upsertMessage(msg: {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  timestamp: number;
  status?: string;
}): Promise<void> {
  const d = await initDb();
  await d.execute(
    `INSERT INTO messages (id, conversation_id, role, content, timestamp, status)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       content = excluded.content,
       status = excluded.status`,
    [msg.id, msg.conversationId, msg.role, msg.content, msg.timestamp, msg.status ?? 'done']
  );
}

/** 대화 upsert */
export async function upsertConversation(conv: {
  id: string;
  projectKey: string;
  label: string;
  type: string;
  createdAt: number;
  source?: string;
  engine?: string;
  model?: string;
  persona?: string;
  triggerMode?: string;
}): Promise<void> {
  const d = await initDb();
  await d.execute(
    `INSERT INTO conversations (id, project_key, label, type, created_at, source, engine, model, persona, trigger_mode)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       label = excluded.label,
       source = excluded.source,
       engine = excluded.engine,
       model = excluded.model,
       persona = excluded.persona,
       trigger_mode = excluded.trigger_mode,
       updated_at = unixepoch()`,
    [conv.id, conv.projectKey, conv.label, conv.type, conv.createdAt,
     conv.source ?? 'tunadish', conv.engine, conv.model, conv.persona, conv.triggerMode]
  );
}

/** FTS5 검색 */
export async function searchMessages(query: string, limit = 50): Promise<Array<{
  id: string;
  conversationId: string;
  content: string;
  timestamp: number;
  rank: number;
}>> {
  const d = await initDb();
  return d.select(
    `SELECT m.id, m.conversation_id as conversationId, m.content, m.timestamp,
            rank
     FROM messages_fts fts
     JOIN messages m ON m.rowid = fts.rowid
     WHERE messages_fts MATCH ?
     ORDER BY rank
     LIMIT ?`,
    [query, limit]
  );
}

/** 대화별 메시지 로드 (페이지네이션) */
export async function loadMessages(
  conversationId: string,
  limit = 100,
  beforeTimestamp?: number,
): Promise<Array<{ id: string; role: string; content: string; timestamp: number; status: string }>> {
  const d = await initDb();
  if (beforeTimestamp) {
    return d.select(
      `SELECT id, role, content, timestamp, status FROM messages
       WHERE conversation_id = ? AND timestamp < ?
       ORDER BY timestamp DESC LIMIT ?`,
      [conversationId, beforeTimestamp, limit]
    );
  }
  return d.select(
    `SELECT id, role, content, timestamp, status FROM messages
     WHERE conversation_id = ?
     ORDER BY timestamp DESC LIMIT ?`,
    [conversationId, limit]
  );
}

/** conv settings 업데이트 */
export async function updateConvSettings(convId: string, settings: {
  engine?: string;
  model?: string;
  persona?: string;
  triggerMode?: string;
}): Promise<void> {
  const d = await initDb();
  await d.execute(
    `UPDATE conversations SET
       engine = COALESCE(?, engine),
       model = COALESCE(?, model),
       persona = COALESCE(?, persona),
       trigger_mode = COALESCE(?, trigger_mode),
       updated_at = unixepoch()
     WHERE id = ?`,
    [settings.engine, settings.model, settings.persona, settings.triggerMode, convId]
  );
}
```

## 7. 테스트 전략

### 7.1 단위 테스트

| 대상 | 테스트 내용 | 도구 |
|------|------------|------|
| db.ts CRUD | upsert, select, delete 동작 확인 | Vitest + better-sqlite3 (mock) |
| 마이그레이션 | 버전 순서, 중복 실행 안전성 | Vitest |
| FTS5 검색 | 한국어 토큰화, 랭킹 정확성 | Vitest |
| useConvSettings | fallback 체인 (conv → project) | Vitest + Zustand |

### 7.2 통합 테스트

| 시나리오 | 검증 |
|---------|------|
| write-through | WS 메시지 수신 → SQLite에 저장 확인 |
| read-on-start | 앱 재시작 → SQLite에서 대화 목록 복원 |
| 검색 | FTS5 검색 → UI 결과 표시 |
| 충돌 해소 | 로컬 캐시와 서버 데이터 불일치 시 서버 우선 |

### 7.3 E2E 테스트

| 시나리오 | 검증 |
|---------|------|
| 대화 생성 → 메시지 송수신 → 앱 종료 → 재시작 | 대화와 메시지 유지 |
| 서버 미연결 상태에서 앱 시작 | 로컬 데이터로 UI 표시 |
| 1000+ 메시지 대화 | 페이지네이션 + 스크롤 성능 |
| FTS 검색 ("Claude" 키워드) | 결과 정확성 + 응답 시간 < 500ms |

### 7.4 테스트 환경

```
단위 테스트: Vitest + better-sqlite3 (Tauri 없이 SQLite API mock)
통합 테스트: Tauri dev mode + 실제 SQLite
E2E 테스트: Tauri build + Playwright (향후)
```

### 7.5 DB 테스트 mock 전략

Tauri 환경 외부(Vitest)에서 SQLite를 테스트하기 위해:

```typescript
// client/src/lib/__tests__/db.test.ts

// better-sqlite3로 실제 SQLite 동작 테스트 (Tauri IPC 없이)
import BetterSqlite3 from 'better-sqlite3';

function createTestDb() {
  const db = new BetterSqlite3(':memory:');
  db.exec(SCHEMA_SQL);
  return db;
}

describe('messages', () => {
  it('upsert inserts new message', () => { ... });
  it('upsert updates existing message content', () => { ... });
  it('FTS5 indexes Korean text', () => { ... });
  it('search returns ranked results', () => { ... });
  it('pagination returns correct page', () => { ... });
});

describe('conversations', () => {
  it('upsert preserves settings on label update', () => { ... });
  it('updateConvSettings updates only provided fields', () => { ... });
  it('cascade deletes messages on conversation delete', () => { ... });
});

describe('migration', () => {
  it('applies migrations in order', () => { ... });
  it('skips already applied migrations', () => { ... });
  it('handles empty database', () => { ... });
});
```

## 8. 위험 요소 및 대응

| 위험 | 영향 | 대응 |
|------|------|------|
| FTS5 한국어 토큰화 | 검색 정확도 저하 | `unicode61` tokenizer + 향후 ICU 확장 검토 |
| DB 파일 손상 | 데이터 손실 | WAL 모드 + 주기적 `PRAGMA integrity_check` |
| 마이그레이션 실패 | 앱 시작 불가 | 트랜잭션 래핑 + 롤백 + 이전 버전 폴백 |
| 대용량 메시지 (AI 긴 응답) | 쓰기 지연 | 비동기 write-through, UI 블로킹 없음 |
| Tauri v2 플러그인 호환성 | 빌드 실패 | tauri-plugin-sql v2 공식 릴리즈 확인 |

## 9. 의존성 추가 목록

### Rust (Cargo.toml)

```toml
[dependencies]
tauri-plugin-sql = { version = "2", features = ["sqlite"] }
```

### npm (package.json)

```json
{
  "dependencies": {
    "@tauri-apps/plugin-sql": "^2"
  },
  "devDependencies": {
    "better-sqlite3": "^11",
    "@types/better-sqlite3": "^7"
  }
}
```

### Tauri 설정 (tauri.conf.json)

플러그인 권한이 필요한 경우 `capabilities` 설정 추가.

## 10. 일정 추정

| Phase | 작업량 | 선행 조건 |
|-------|--------|----------|
| Phase 1: 기반 설정 | 플러그인 설치 + 스키마 + db.ts | 없음 |
| Phase 2: Write-through | wsClient 연동 | Phase 1 |
| Phase 3: Read-on-start | 앱 시작 하이드레이션 | Phase 2 |
| Phase 4: 검색 & 오프라인 | FTS UI + 오프라인 모드 | Phase 3 |

Phase 1~2가 핵심 가치 (대화 영구 보존)를 제공하므로 우선 완료 후 나머지 진행.
