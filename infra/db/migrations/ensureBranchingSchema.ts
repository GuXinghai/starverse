import type BetterSqlite3 from 'better-sqlite3'

type SqlDatabase = BetterSqlite3.Database

function listColumns(db: SqlDatabase, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return new Set(rows.map((r) => r.name))
}

function tableExists(db: SqlDatabase, name: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=@name LIMIT 1")
    .get({ name }) as { 1?: number } | undefined
  return !!row
}

function ensureMessageGraphColumns(db: SqlDatabase) {
  if (!tableExists(db, 'message')) return

  const cols = listColumns(db, 'message')

  if (!cols.has('parent_id')) {
    db.exec(`ALTER TABLE message ADD COLUMN parent_id TEXT NULL`)
    cols.add('parent_id')
  }

  if (!cols.has('status')) {
    db.exec(
      `ALTER TABLE message ADD COLUMN status TEXT NOT NULL DEFAULT 'final' CHECK (status IN ('streaming','final','error'))`
    )
    cols.add('status')
  }

  if (!cols.has('answer_root_id')) {
    db.exec(`ALTER TABLE message ADD COLUMN answer_root_id TEXT NULL`)
    cols.add('answer_root_id')
  }

  if (!cols.has('question_id')) {
    db.exec(`ALTER TABLE message ADD COLUMN question_id TEXT NULL`)
    cols.add('question_id')
  }

  db.exec(`CREATE INDEX IF NOT EXISTS idx_msg_parent ON message(parent_id)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_msg_answer_root ON message(answer_root_id)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_msg_question ON message(question_id)`)
}

function ensureBranchTables(db: SqlDatabase) {
  // These tables also exist in infra/db/schema.sql, but we ensure them here so older DB files
  // created before schema updates can still boot and accept branch APIs without a full migration system.

  db.exec(`
    CREATE TABLE IF NOT EXISTS branch (
      id TEXT PRIMARY KEY,
      convo_id TEXT NOT NULL REFERENCES convo(id) ON DELETE CASCADE,
      head_message_id TEXT NULL REFERENCES message(id) ON DELETE SET NULL,
      name TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER NULL
    );

    CREATE INDEX IF NOT EXISTS idx_branch_convo_alive ON branch(convo_id, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_branch_convo_updated ON branch(convo_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS branch_choice (
      branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE CASCADE,
      question_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
      chosen_answer_root_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (branch_id, question_id)
    );

    CREATE INDEX IF NOT EXISTS idx_branch_choice_branch ON branch_choice(branch_id);
    CREATE INDEX IF NOT EXISTS idx_branch_choice_question ON branch_choice(question_id);

    CREATE TABLE IF NOT EXISTS branch_filter (
      branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL CHECK (target_type IN ('question', 'answer')),
      target_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
      mode TEXT NOT NULL CHECK (mode IN ('include', 'exclude')),
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (branch_id, target_type, target_id)
    );

    CREATE INDEX IF NOT EXISTS idx_branch_filter_branch ON branch_filter(branch_id);
    CREATE INDEX IF NOT EXISTS idx_branch_filter_target ON branch_filter(target_type, target_id);

    CREATE TABLE IF NOT EXISTS branch_answer_hide (
      branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE CASCADE,
      question_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
      answer_root_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
      hidden INTEGER NOT NULL DEFAULT 1 CHECK (hidden IN (0, 1)),
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (branch_id, question_id, answer_root_id)
    );

    CREATE INDEX IF NOT EXISTS idx_branch_answer_hide_branch_q ON branch_answer_hide(branch_id, question_id);

    CREATE TABLE IF NOT EXISTS branch_question_hide (
      branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE CASCADE,
      -- Stores either the actual parent message id, or a sentinel (e.g. '__root__') for parent_id IS NULL.
      -- This is intentionally NOT a foreign key, because the sentinel is not a real message id.
      base_message_id TEXT NOT NULL,
      question_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
      hidden INTEGER NOT NULL DEFAULT 1 CHECK (hidden IN (0, 1)),
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (branch_id, base_message_id, question_id)
    );

    CREATE INDEX IF NOT EXISTS idx_branch_question_hide_branch_base ON branch_question_hide(branch_id, base_message_id);
    CREATE INDEX IF NOT EXISTS idx_branch_question_hide_branch_q ON branch_question_hide(branch_id, question_id);
  `)
}

function backfillLegacyParentChain(db: SqlDatabase) {
  if (!tableExists(db, 'message')) return
  const hasParentId = listColumns(db, 'message').has('parent_id')
  if (!hasParentId) return

  const convoIds = db.prepare(`SELECT DISTINCT convo_id AS convoId FROM message`).all() as Array<{ convoId: string }>
  const selectStmt = db.prepare(`
    SELECT id, role, seq
    FROM message
    WHERE convo_id = @convoId
    ORDER BY seq ASC
  `)
  const updateParentStmt = db.prepare(`
    UPDATE message
    SET parent_id = @parentId
    WHERE id = @id AND parent_id IS NULL
  `)

  const txn = db.transaction((cid: string) => {
    const rows = selectStmt.all({ convoId: cid }) as Array<{ id: string; role: string; seq: number }>
    let prevId: string | null = null
    for (const r of rows) {
      if (prevId) {
        updateParentStmt.run({ id: r.id, parentId: prevId })
      }
      prevId = r.id
    }
  })

  for (const c of convoIds) txn(c.convoId)
}

function backfillLegacyAnswerGrouping(db: SqlDatabase) {
  if (!tableExists(db, 'message')) return
  const cols = listColumns(db, 'message')
  if (!cols.has('question_id') || !cols.has('answer_root_id')) return

  const convoIds = db.prepare(`SELECT DISTINCT convo_id AS convoId FROM message`).all() as Array<{ convoId: string }>
  const selectStmt = db.prepare(`
    SELECT id, role, seq, question_id AS questionId, answer_root_id AS answerRootId
    FROM message
    WHERE convo_id = @convoId
    ORDER BY seq ASC
  `)
  const updateStmt = db.prepare(`
    UPDATE message
    SET question_id = @questionId,
        answer_root_id = @answerRootId
    WHERE id = @id
      AND question_id IS NULL
      AND answer_root_id IS NULL
  `)

  const txn = db.transaction((cid: string) => {
    const rows = selectStmt.all({ convoId: cid }) as Array<{
      id: string
      role: string
      seq: number
      questionId: string | null
      answerRootId: string | null
    }>

    let currentQuestionId: string | null = null
    let currentAnswerRootId: string | null = null

    for (const r of rows) {
      const role = String(r.role ?? '').trim()

      if (role === 'user') {
        currentQuestionId = r.id
        currentAnswerRootId = null
        continue
      }

      if (!currentQuestionId) continue

      if (role === 'assistant') {
        if (!currentAnswerRootId) {
          currentAnswerRootId = r.id
          updateStmt.run({ id: r.id, questionId: currentQuestionId, answerRootId: r.id })
        } else {
          updateStmt.run({ id: r.id, questionId: currentQuestionId, answerRootId: currentAnswerRootId })
        }
        continue
      }

      // tool / notice / openrouter / system etc:
      updateStmt.run({
        id: r.id,
        questionId: currentQuestionId,
        answerRootId: currentAnswerRootId
      })
    }
  })

  for (const c of convoIds) txn(c.convoId)
}

function markStaleStreamingAsError(db: SqlDatabase) {
  if (!tableExists(db, 'message')) return
  const cols = listColumns(db, 'message')
  if (!cols.has('status')) return
  db.exec(`UPDATE message SET status='error' WHERE status='streaming'`)
}

/**
 * Ensure branching schema is available for legacy DB files.
 *
 * This is intentionally "safe first":
 * - adds columns with defaults (no data loss)
 * - backfills a stable parent chain for legacy linear `seq` history
 * - backfills answer grouping for legacy history based on `seq` order:
 *   - a "question" is any `role='user'` message
 *   - the first assistant after a question becomes the answer root
 *   - subsequent tool/assistant messages until the next user share the same `answer_root_id/question_id`
 */
export function ensureBranchingSchema(db: SqlDatabase) {
  const txn = db.transaction(() => {
    ensureMessageGraphColumns(db)
    ensureBranchTables(db)
    backfillLegacyParentChain(db)
    backfillLegacyAnswerGrouping(db)
    markStaleStreamingAsError(db)
  })
  txn()
}
