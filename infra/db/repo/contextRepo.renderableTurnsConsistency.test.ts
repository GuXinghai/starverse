import { describe, expect, it } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { MessageRepo } from './messageRepo'
import { BranchRepo } from './branchRepo'
import { ContextRepo } from './contextRepo'

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

describe('ContextRepo.getRenderableTurns vs buildForBranch', () => {
  it('uses the same default choice (latest final) so UI render stays consistent with send context', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    insertConvo(db, 'c1')

    const messageRepo = new MessageRepo(db)
    const branchRepo = new BranchRepo(db)
    const ctxRepo = new ContextRepo(db, branchRepo)

    const q1 = messageRepo.append({ convoId: 'c1', role: 'user', body: 'Q1' })
    messageRepo.append({ convoId: 'c1', role: 'assistant', body: 'A1', parentId: q1.id })
    const q2 = messageRepo.append({ convoId: 'c1', role: 'user', body: 'Q2' })
    messageRepo.append({ convoId: 'c1', role: 'assistant', body: 'A2', parentId: q2.id })

    // Create branch before adding a newer answer variant under Q1.
    const branch = branchRepo.ensureDefault('c1', 'Main')

    messageRepo.append({ convoId: 'c1', role: 'assistant', body: 'A1v2', parentId: q1.id })

    // UI render projection (includes excluded turns too, but here all include)
    const render = ctxRepo.getRenderableTurns(branch.id, { debug: true })
    // Send context projection (excludes excluded turns)
    const send = ctxRepo.buildForBranch(branch.id, { debug: true })

    expect(render.messages.map((m) => m.body)).toEqual(['Q1', 'A1v2', 'Q2', 'A2'])
    expect(send.messages.map((m) => m.body)).toEqual(['Q1', 'A1v2', 'Q2', 'A2'])
    expect(render.debug?.chosenAnswerRootByQuestionId).toEqual(send.debug?.chosenAnswerRootByQuestionId)
  })

  it('keeps follow-up turns reachable when a tool sibling exists under the chosen answer root', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    insertConvo(db, 'c1')

    const messageRepo = new MessageRepo(db)
    const branchRepo = new BranchRepo(db)
    const ctxRepo = new ContextRepo(db, branchRepo)

    const q1 = messageRepo.append({ convoId: 'c1', role: 'user', body: 'Q1' })
    const a1 = messageRepo.append({ convoId: 'c1', role: 'assistant', body: 'A1', parentId: q1.id })
    const a2 = messageRepo.append({ convoId: 'c1', role: 'assistant', body: 'A2', parentId: q1.id })

    const branch = branchRepo.ensureDefault('c1', 'Main')

    // Switch to A1 and create a follow-up turn under it.
    branchRepo.switchCandidate(branch.id, q1.id, a1.id)
    const q2 = messageRepo.append({ convoId: 'c1', role: 'user', body: 'Q2', parentId: branchRepo.get(branch.id)?.headMessageId ?? a1.id })
    messageRepo.append({ convoId: 'c1', role: 'assistant', body: 'A3', parentId: q2.id })

    // Tool sibling under A1, appended later (higher seq) but should not become branch head.
    messageRepo.append({ convoId: 'c1', role: 'tool', body: 'T1', parentId: a1.id })

    // Switch away and back to force head recompute.
    branchRepo.switchCandidate(branch.id, q1.id, a2.id)
    branchRepo.switchCandidate(branch.id, q1.id, a1.id)

    const render = ctxRepo.getRenderableTurns(branch.id, { debug: false })
    expect(render.messages.map((m) => m.body)).toContain('Q2')
  })
})
