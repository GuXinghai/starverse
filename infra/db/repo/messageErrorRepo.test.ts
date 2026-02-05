import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { MessageRepo } from './messageRepo'
import { MessageErrorRepo } from './messageErrorRepo'

function loadSchema(db: any) {
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

let canRun = true
let skipReason = ''

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('better-sqlite3')
} catch (err: any) {
  canRun = false
  skipReason = `better-sqlite3 unavailable: ${String(err?.message ?? err)}`
  console.warn(`[test-skip] ${skipReason}`)
}

const d = canRun ? describe : describe.skip

d('MessageErrorRepo', () => {
  it('upserts and lists message error envelopes', () => {
    let BetterSqlite3: any = null
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      BetterSqlite3 = require('better-sqlite3')
    } catch {
      return
    }

    let db: any = null
    try {
      db = new BetterSqlite3(':memory:')
    } catch {
      return
    }
    loadSchema(db)
    insertConvo(db, 'c1')

    const messageRepo = new MessageRepo(db)
    const errorRepo = new MessageErrorRepo(db)

    const msg = messageRepo.append({ convoId: 'c1', role: 'assistant', body: '' })
    const envelopeJson = JSON.stringify({ phase: 'pre_stream', completionClass: 'error', openrouter: { code: '400' }, truncated: false })

    errorRepo.upsert({
      messageId: msg.id,
      envelopeJson,
      envelopeBytes: envelopeJson.length,
      isTruncated: false,
      createdAt: 1,
      updatedAt: 2,
    })

    const rows = errorRepo.listByMessageIds({ messageIds: [msg.id] })
    expect(rows.length).toBe(1)
    expect(rows[0]?.messageId).toBe(msg.id)
    expect(rows[0]?.envelopeJson).toBe(envelopeJson)
    expect(rows[0]?.envelopeBytes).toBe(envelopeJson.length)
    expect(rows[0]?.isTruncated).toBe(false)
    expect(rows[0]?.createdAt).toBe(1)
    expect(rows[0]?.updatedAt).toBe(2)
  })
})
