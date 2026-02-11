import { describe, expect, it } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { MessageRepo } from './messageRepo'

function loadSchema(db: BetterSqlite3.Database) {
  const schemaPath = path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')
  db.exec(readFileSync(schemaPath, 'utf8'))
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

describe('MessageRepo.appendDelta guard', () => {
  it('rejects appendDelta unless status=streaming', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    insertConvo(db, 'c1')

    const repo = new MessageRepo(db)

    const u1 = repo.append({ convoId: 'c1', role: 'user', body: 'Q' })
    const a1 = repo.append({ convoId: 'c1', role: 'assistant', body: '' }) // empty assistant => streaming by default

    expect(() => repo.appendDelta({ convoId: 'c1', seq: a1.seq, appendBody: 'h' })).not.toThrow()

    repo.setStatus({ messageId: a1.id, status: 'final' })
    expect(() => repo.appendDelta({ convoId: 'c1', seq: a1.seq, appendBody: 'i' })).toThrow(/status=final/i)

    // Sanity: user messages are final and should be rejected.
    expect(() => repo.appendDelta({ convoId: 'c1', seq: u1.seq, appendBody: 'x' })).toThrow(/must be streaming/i)
  })

  it('setStatus can patch message meta without schema changes', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    insertConvo(db, 'c1')
    const repo = new MessageRepo(db)

    const a1 = repo.append({
      convoId: 'c1',
      role: 'assistant',
      body: '',
      meta: {
        existing: 'keep-me',
        reasoningDetailsRaw: [{ type: 'reasoning.text', text: 'seed' }],
      },
    })
    repo.setStatus({
      messageId: a1.id,
      status: 'final',
      metaPatch: { completionOutcome: 'truncated' },
    })

    const listed = repo.list({ convoId: 'c1' })
    const assistant = listed.find((row) => row.id === a1.id)
    expect((assistant?.meta as any)?.completionOutcome).toBe('truncated')
    expect((assistant?.meta as any)?.existing).toBe('keep-me')
    expect((assistant?.meta as any)?.reasoningDetailsRaw).toEqual([{ type: 'reasoning.text', text: 'seed' }])
  })
})
