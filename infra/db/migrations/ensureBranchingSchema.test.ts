import { describe, expect, it } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { ensureBranchingSchema } from './ensureBranchingSchema'

function loadLegacySchema(db: BetterSqlite3.Database) {
  db.exec(`
    PRAGMA foreign_keys=ON;

    CREATE TABLE convo (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      meta TEXT
    );

    CREATE TABLE message (
      id TEXT PRIMARY KEY,
      convo_id TEXT NOT NULL REFERENCES convo(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      seq INTEGER NOT NULL,
      meta TEXT,
      UNIQUE (convo_id, seq)
    );
  `)
}

function insertConvo(db: BetterSqlite3.Database, id: string) {
  const now = Date.now()
  db.prepare(`INSERT INTO convo(id, project_id, title, created_at, updated_at, meta) VALUES (@id, NULL, @t, @c, @u, NULL)`).run({
    id,
    t: 'Chat',
    c: now,
    u: now,
  })
}

function insertMsg(db: BetterSqlite3.Database, convoId: string, id: string, role: string, seq: number) {
  const now = Date.now() + seq
  db.prepare(`INSERT INTO message(id, convo_id, role, created_at, seq, meta) VALUES (@id, @cid, @r, @c, @s, NULL)`).run({
    id,
    cid: convoId,
    r: role,
    c: now,
    s: seq,
  })
}

describe('ensureBranchingSchema', () => {
  it('backfills parent_id as a stable seq chain', () => {
    const db = new BetterSqlite3(':memory:')
    loadLegacySchema(db)
    insertConvo(db, 'c1')

    insertMsg(db, 'c1', 'm1', 'user', 1)
    insertMsg(db, 'c1', 'm2', 'assistant', 2)
    insertMsg(db, 'c1', 'm3', 'user', 3)
    insertMsg(db, 'c1', 'm4', 'assistant', 4)

    ensureBranchingSchema(db)

    const rows = db
      .prepare(
        `
        SELECT id, parent_id AS parentId, question_id AS questionId, answer_root_id AS answerRootId, status
        FROM message
        WHERE convo_id = 'c1'
        ORDER BY seq ASC
      `
      )
      .all() as Array<{ id: string; parentId: string | null; questionId: string | null; answerRootId: string | null; status: string }>

    expect(rows.map((r) => r.parentId)).toEqual([null, 'm1', 'm2', 'm3'])
    expect(rows.map((r) => r.status)).toEqual(['final', 'final', 'final', 'final'])

    // Grouping: first assistant after each user becomes the answer root.
    expect(rows).toEqual([
      { id: 'm1', parentId: null, questionId: null, answerRootId: null, status: 'final' },
      { id: 'm2', parentId: 'm1', questionId: 'm1', answerRootId: 'm2', status: 'final' },
      { id: 'm3', parentId: 'm2', questionId: null, answerRootId: null, status: 'final' },
      { id: 'm4', parentId: 'm3', questionId: 'm3', answerRootId: 'm4', status: 'final' },
    ])
  })

  it('includes tool/assistant follow-ups in the same answer_root_id/question_id group', () => {
    const db = new BetterSqlite3(':memory:')
    loadLegacySchema(db)
    insertConvo(db, 'c1')

    insertMsg(db, 'c1', 'u1', 'user', 1)
    insertMsg(db, 'c1', 'a1', 'assistant', 2)
    insertMsg(db, 'c1', 't1', 'tool', 3)
    insertMsg(db, 'c1', 'a1b', 'assistant', 4)
    insertMsg(db, 'c1', 'u2', 'user', 5)

    ensureBranchingSchema(db)

    const rows = db
      .prepare(
        `
        SELECT id, role, question_id AS questionId, answer_root_id AS answerRootId
        FROM message
        WHERE convo_id = 'c1'
        ORDER BY seq ASC
      `
      )
      .all() as Array<{ id: string; role: string; questionId: string | null; answerRootId: string | null }>

    const byId = new Map(rows.map((r) => [r.id, r]))
    expect(byId.get('a1')?.questionId).toBe('u1')
    expect(byId.get('a1')?.answerRootId).toBe('a1')
    expect(byId.get('t1')?.questionId).toBe('u1')
    expect(byId.get('t1')?.answerRootId).toBe('a1')
    expect(byId.get('a1b')?.questionId).toBe('u1')
    expect(byId.get('a1b')?.answerRootId).toBe('a1')
    expect(byId.get('u2')?.questionId).toBeNull()
    expect(byId.get('u2')?.answerRootId).toBeNull()
  })
})

