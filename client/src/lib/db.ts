/**
 * SQLite 영구 저장소 (tauri-plugin-sql)
 *
 * 데이터 흐름:
 *   tunapi WS → wsClient → Zustand (실시간 UI) + SQLite (영구 저장)
 *   앱 시작 시: SQLite → Zustand (하이드레이션)
 *
 * Source of Truth: 서버(tunapi) 우선. 서버 데이터 수신 시 upsert.
 */
import Database from '@tauri-apps/plugin-sql';

let db: Database | null = null;
let initPromise: Promise<Database> | null = null;

// ─── Schema ──────────────────────────────────────────────────────

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS schema_version (
  version    INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS projects (
  key            TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  path           TEXT,
  default_engine TEXT,
  source         TEXT NOT NULL DEFAULT 'configured',
  type           TEXT NOT NULL DEFAULT 'project',
  updated_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS conversations (
  id            TEXT PRIMARY KEY,
  project_key   TEXT NOT NULL,
  label         TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'main',
  parent_id     TEXT,
  source        TEXT DEFAULT 'tunadish',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  engine        TEXT,
  model         TEXT,
  persona       TEXT,
  trigger_mode  TEXT
);

CREATE INDEX IF NOT EXISTS idx_conv_project ON conversations(project_key);
CREATE INDEX IF NOT EXISTS idx_conv_updated ON conversations(updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id               TEXT PRIMARY KEY,
  conversation_id  TEXT NOT NULL,
  role             TEXT NOT NULL,
  content          TEXT NOT NULL,
  timestamp        INTEGER NOT NULL,
  status           TEXT DEFAULT 'done',
  progress_content TEXT,
  engine           TEXT,
  model            TEXT,
  persona          TEXT,
  metadata         TEXT,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, timestamp);

CREATE TABLE IF NOT EXISTS branches (
  id               TEXT PRIMARY KEY,
  conversation_id  TEXT NOT NULL,
  label            TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'active',
  checkpoint_id    TEXT,
  session_id       TEXT,
  git_branch       TEXT,
  parent_branch_id TEXT,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_branch_conv ON branches(conversation_id);
CREATE INDEX IF NOT EXISTS idx_branch_session ON branches(session_id);

-- FTS5 전문 검색
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  content,
  content='messages',
  content_rowid='rowid',
  tokenize='unicode61'
);
`;

// FTS 트리거는 IF NOT EXISTS 불가 → 별도 처리
const FTS_TRIGGERS = `
CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
END;
CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, old.content);
END;
CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, old.content);
  INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
END;
`;

interface Migration {
  version: number;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: SCHEMA_V1 + FTS_TRIGGERS + "INSERT OR IGNORE INTO schema_version (version) VALUES (1);",
  },
];

// ─── Init ────────────────────────────────────────────────────────

/** DB 초기화 (앱 시작 시 1회). 동시 호출 안전. */
export async function initDb(): Promise<Database> {
  if (db) return db;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const d = await Database.load('sqlite:tunadish.db');
    await migrate(d);
    db = d;
    return d;
  })();
  return initPromise;
}

/** Tauri 환경 여부 확인 — 브라우저 dev에서는 SQLite 사용 불가 */
export function isTauriEnv(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function migrate(d: Database): Promise<void> {
  // schema_version 테이블이 없을 수 있으므로 try-catch
  let currentVersion = 0;
  try {
    const rows = await d.select<{ version: number }[]>(
      'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1'
    );
    if (rows.length > 0) currentVersion = rows[0].version;
  } catch {
    // 테이블 없음 → 버전 0
  }

  for (const m of MIGRATIONS) {
    if (m.version > currentVersion) {
      // 각 statement를 개별 실행 (tauri-plugin-sql은 multi-statement를 지원하지 않을 수 있음)
      const statements = m.sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);
      for (const stmt of statements) {
        await d.execute(stmt + ';');
      }
    }
  }
}

// ─── Projects ────────────────────────────────────────────────────

export async function upsertProject(proj: {
  key: string;
  name: string;
  path?: string | null;
  defaultEngine?: string | null;
  source?: string;
  type?: string;
}): Promise<void> {
  const d = await initDb();
  await d.execute(
    `INSERT INTO projects (key, name, path, default_engine, source, type)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT(key) DO UPDATE SET
       name = excluded.name,
       path = excluded.path,
       default_engine = excluded.default_engine,
       source = excluded.source,
       type = excluded.type,
       updated_at = unixepoch()`,
    [proj.key, proj.name, proj.path ?? null, proj.defaultEngine ?? null,
     proj.source ?? 'configured', proj.type ?? 'project'],
  );
}

// ─── Conversations ───────────────────────────────────────────────

export async function upsertConversation(conv: {
  id: string;
  projectKey: string;
  label: string;
  type?: string;
  parentId?: string | null;
  source?: string;
  createdAt: number;
  engine?: string;
  model?: string;
  persona?: string;
  triggerMode?: string;
}): Promise<void> {
  const d = await initDb();
  await d.execute(
    `INSERT INTO conversations (id, project_key, label, type, parent_id, source, created_at, engine, model, persona, trigger_mode)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT(id) DO UPDATE SET
       label = excluded.label,
       source = excluded.source,
       engine = COALESCE(excluded.engine, engine),
       model = COALESCE(excluded.model, model),
       persona = COALESCE(excluded.persona, persona),
       trigger_mode = COALESCE(excluded.trigger_mode, trigger_mode),
       updated_at = unixepoch()`,
    [conv.id, conv.projectKey, conv.label, conv.type ?? 'main',
     conv.parentId ?? null, conv.source ?? 'tunadish', conv.createdAt,
     conv.engine ?? null, conv.model ?? null, conv.persona ?? null, conv.triggerMode ?? null],
  );
}

export async function deleteConversation(convId: string): Promise<void> {
  const d = await initDb();
  await d.execute('DELETE FROM messages WHERE conversation_id = $1', [convId]);
  await d.execute('DELETE FROM conversations WHERE id = $1', [convId]);
}

export async function updateConvSettings(convId: string, settings: {
  engine?: string;
  model?: string;
  persona?: string;
  triggerMode?: string;
}): Promise<void> {
  const d = await initDb();
  await d.execute(
    `UPDATE conversations SET
       engine = COALESCE($1, engine),
       model = COALESCE($2, model),
       persona = COALESCE($3, persona),
       trigger_mode = COALESCE($4, trigger_mode),
       updated_at = unixepoch()
     WHERE id = $5`,
    [settings.engine ?? null, settings.model ?? null,
     settings.persona ?? null, settings.triggerMode ?? null, convId],
  );
}

export async function loadConversations(projectKey: string): Promise<Array<{
  id: string; projectKey: string; label: string; type: string;
  source: string; createdAt: number; engine?: string; model?: string;
}>> {
  const d = await initDb();
  return d.select(
    `SELECT id, project_key as projectKey, label, type, source, created_at as createdAt, engine, model
     FROM conversations WHERE project_key = $1
     ORDER BY updated_at DESC`,
    [projectKey],
  );
}

// ─── Messages ────────────────────────────────────────────────────

export async function upsertMessage(msg: {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  timestamp: number;
  status?: string;
  engine?: string;
  model?: string;
  persona?: string;
}): Promise<void> {
  const d = await initDb();
  await d.execute(
    `INSERT INTO messages (id, conversation_id, role, content, timestamp, status, engine, model, persona)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT(id) DO UPDATE SET
       content = excluded.content,
       status = excluded.status,
       engine = COALESCE(excluded.engine, engine),
       model = COALESCE(excluded.model, model),
       persona = COALESCE(excluded.persona, persona)`,
    [msg.id, msg.conversationId, msg.role, msg.content, msg.timestamp,
     msg.status ?? 'done', msg.engine ?? null, msg.model ?? null, msg.persona ?? null],
  );
}

export async function loadMessages(
  conversationId: string,
  limit = 200,
  beforeTimestamp?: number,
): Promise<Array<{
  id: string; role: string; content: string; timestamp: number;
  status: string; engine?: string; model?: string; persona?: string;
}>> {
  const d = await initDb();
  if (beforeTimestamp) {
    return d.select(
      `SELECT id, role, content, timestamp, status, engine, model, persona
       FROM messages WHERE conversation_id = $1 AND timestamp < $2
       ORDER BY timestamp ASC LIMIT $3`,
      [conversationId, beforeTimestamp, limit],
    );
  }
  return d.select(
    `SELECT id, role, content, timestamp, status, engine, model, persona
     FROM messages WHERE conversation_id = $1
     ORDER BY timestamp ASC LIMIT $2`,
    [conversationId, limit],
  );
}

// ─── Branches ────────────────────────────────────────────────────

export async function upsertBranch(branch: {
  id: string;
  conversationId: string;
  label: string;
  status?: string;
  checkpointId?: string;
  sessionId?: string;
  gitBranch?: string;
  parentBranchId?: string;
}): Promise<void> {
  const d = await initDb();
  await d.execute(
    `INSERT INTO branches (id, conversation_id, label, status, checkpoint_id, session_id, git_branch, parent_branch_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT(id) DO UPDATE SET
       label = excluded.label,
       status = COALESCE(excluded.status, status),
       checkpoint_id = COALESCE(excluded.checkpoint_id, checkpoint_id),
       session_id = COALESCE(excluded.session_id, session_id)`,
    [branch.id, branch.conversationId, branch.label, branch.status ?? 'active',
     branch.checkpointId ?? null, branch.sessionId ?? null,
     branch.gitBranch ?? null, branch.parentBranchId ?? null],
  );
}

export async function deleteBranch(branchId: string): Promise<void> {
  const d = await initDb();
  await d.execute('DELETE FROM branches WHERE id = $1', [branchId]);
}

export async function updateBranchStatus(branchId: string, status: string): Promise<void> {
  const d = await initDb();
  await d.execute('UPDATE branches SET status = $1 WHERE id = $2', [status, branchId]);
}

export async function loadBranches(conversationId: string): Promise<Array<{
  id: string; label: string; status: string; checkpointId?: string;
  sessionId?: string; gitBranch?: string; parentBranchId?: string;
}>> {
  const d = await initDb();
  return d.select(
    `SELECT id, label, status, checkpoint_id as checkpointId, session_id as sessionId,
            git_branch as gitBranch, parent_branch_id as parentBranchId
     FROM branches WHERE conversation_id = $1
     ORDER BY created_at DESC`,
    [conversationId],
  );
}

// ─── Search ──────────────────────────────────────────────────────

export async function searchMessages(query: string, limit = 50): Promise<Array<{
  id: string;
  conversationId: string;
  content: string;
  timestamp: number;
  rank: number;
}>> {
  const d = await initDb();
  return d.select(
    `SELECT m.id, m.conversation_id as conversationId, m.content, m.timestamp, rank
     FROM messages_fts fts
     JOIN messages m ON m.rowid = fts.rowid
     WHERE messages_fts MATCH $1
     ORDER BY rank
     LIMIT $2`,
    [query, limit],
  );
}
