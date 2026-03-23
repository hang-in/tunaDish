/**
 * DB write-through 래퍼.
 * Tauri 환경에서만 SQLite에 기록. 브라우저 dev에서는 no-op.
 * 모든 함수는 fire-and-forget — UI 블로킹 없음.
 */
import { isTauriEnv } from './db';

// lazy import — Tauri 환경에서만 실제 db.ts 로드
let dbModule: typeof import('./db') | null = null;

async function getDb() {
  if (!isTauriEnv()) return null;
  if (!dbModule) {
    dbModule = await import('./db');
    await dbModule.initDb();
  }
  return dbModule;
}

function fire(fn: () => Promise<void>): void {
  fn().catch(err => console.warn('[dbSync]', err));
}

// ─── Projects ────────────────────────────────────────────────────

export function syncProject(proj: {
  key: string; name: string; path?: string | null;
  defaultEngine?: string | null; source?: string; type?: string;
}) {
  fire(async () => {
    const db = await getDb();
    db?.upsertProject(proj);
  });
}

export function syncProjects(projects: Array<{
  key: string; name: string; path?: string | null;
  default_engine?: string | null; source?: string; type?: string;
}>) {
  fire(async () => {
    const db = await getDb();
    if (!db) return;
    for (const p of projects) {
      await db.upsertProject({
        key: p.key, name: p.name, path: p.path,
        defaultEngine: p.default_engine, source: p.source, type: p.type,
      });
    }
  });
}

// ─── Conversations ───────────────────────────────────────────────

export function syncConversation(conv: {
  id: string; projectKey: string; label: string;
  type?: string; source?: string; createdAt: number;
  engine?: string; model?: string;
}) {
  fire(async () => {
    const db = await getDb();
    db?.upsertConversation(conv);
  });
}

export function syncConversations(convs: Array<{
  id: string; projectKey: string; label: string;
  created_at: number; source?: string;
}>) {
  fire(async () => {
    const db = await getDb();
    if (!db) return;
    for (const c of convs) {
      await db.upsertConversation({
        id: c.id, projectKey: c.projectKey, label: c.label,
        createdAt: c.created_at, source: c.source,
      });
    }
  });
}

export function syncDeleteConversation(convId: string) {
  fire(async () => {
    const db = await getDb();
    db?.deleteConversation(convId);
  });
}

export function syncConvSettings(convId: string, settings: {
  engine?: string; model?: string; persona?: string; triggerMode?: string;
}) {
  fire(async () => {
    const db = await getDb();
    db?.updateConvSettings(convId, settings);
  });
}

export function syncConvLabel(convId: string, label: string) {
  fire(async () => {
    const db = await getDb();
    db?.updateConvLabel(convId, label);
  });
}

export function syncBranchLabel(branchId: string, label: string) {
  fire(async () => {
    const db = await getDb();
    db?.updateBranchLabel(branchId, label);
  });
}

// ─── Messages ────────────────────────────────────────────────────

export function syncMessage(msg: {
  id: string; conversationId: string; role: string;
  content: string; timestamp: number; status?: string;
  engine?: string; model?: string; persona?: string;
}) {
  fire(async () => {
    const db = await getDb();
    db?.upsertMessage(msg);
  });
}

export function syncMessageUpdate(convId: string, msgId: string, content: string, meta?: { engine?: string; model?: string; persona?: string }) {
  fire(async () => {
    const db = await getDb();
    if (!db) return;
    const d = await db.initDb();
    const sets: string[] = ['content = $1'];
    const args: unknown[] = [content];
    if (meta?.engine !== undefined) { sets.push(`engine = $${args.length + 1}`); args.push(meta.engine); }
    if (meta?.model !== undefined) { sets.push(`model = $${args.length + 1}`); args.push(meta.model); }
    args.push(msgId, convId);
    await d.execute(
      `UPDATE messages SET ${sets.join(', ')} WHERE id = $${args.length - 1} AND conversation_id = $${args.length}`,
      args,
    );
  });
}

export function syncMessageDelete(convId: string, msgId: string) {
  fire(async () => {
    const db = await getDb();
    if (!db) return;
    const d = await db.initDb();
    await d.execute('DELETE FROM messages WHERE id = $1 AND conversation_id = $2', [msgId, convId]);
  });
}

export function syncFinalizeMessages(convId: string) {
  fire(async () => {
    const db = await getDb();
    if (!db) return;
    const d = await db.initDb();
    await d.execute(
      "UPDATE messages SET status = 'done' WHERE conversation_id = $1 AND status = 'streaming'",
      [convId],
    );
  });
}

// ─── Branches ────────────────────────────────────────────────────

export function syncBranch(branch: {
  id: string; conversationId: string; label: string;
  status?: string; checkpointId?: string; sessionId?: string;
  gitBranch?: string; parentBranchId?: string;
}) {
  fire(async () => {
    const db = await getDb();
    db?.upsertBranch(branch);
  });
}

export function syncBranchStatus(branchId: string, status: string) {
  fire(async () => {
    const db = await getDb();
    db?.updateBranchStatus(branchId, status);
  });
}

export function syncDeleteBranch(branchId: string) {
  fire(async () => {
    const db = await getDb();
    db?.deleteBranch(branchId);
  });
}
