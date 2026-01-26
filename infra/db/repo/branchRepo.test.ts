import { describe, expect, it } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { MessageRepo } from './messageRepo'
import { BranchRepo } from './branchRepo'

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

describe('BranchRepo (projection + candidates + filters)', () => {
  it('ensureDefault creates a default branch with head=last message and getPathMessages follows parent_id', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    insertConvo(db, 'c1')

    const messageRepo = new MessageRepo(db)
    const branchRepo = new BranchRepo(db)

    const u1 = messageRepo.append({ convoId: 'c1', role: 'user', body: 'Q1' })
    const a1 = messageRepo.append({ convoId: 'c1', role: 'assistant', body: 'A1' })
    const u2 = messageRepo.append({ convoId: 'c1', role: 'user', body: 'Q2' })
    const a2 = messageRepo.append({ convoId: 'c1', role: 'assistant', body: 'A2' })

    const branch = branchRepo.ensureDefault('c1', 'Main')
    expect(branch.convoId).toBe('c1')
    expect(branch.headMessageId).toBe(a2.id)

    const pathMessages = branchRepo.getPathMessages(branch.id)
    expect(pathMessages.map((m) => m.id)).toEqual([u1.id, a1.id, u2.id, a2.id])
  })

  it('getCandidates returns assistant roots under a question and respects branch_answer_hide', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    insertConvo(db, 'c1')

    const messageRepo = new MessageRepo(db)
    const branchRepo = new BranchRepo(db)

    const u1 = messageRepo.append({ convoId: 'c1', role: 'user', body: 'Q1' })
    const a1 = messageRepo.append({ convoId: 'c1', role: 'assistant', body: 'A1' })
    messageRepo.append({ convoId: 'c1', role: 'user', body: 'Q2' })
    messageRepo.append({ convoId: 'c1', role: 'assistant', body: 'A2' })

    const branch = branchRepo.ensureDefault('c1')

    expect(branchRepo.getCandidates(branch.id, u1.id).map((c) => c.answerRootId)).toEqual([a1.id])

    db.prepare(
      `
      INSERT INTO branch_answer_hide(branch_id, question_id, answer_root_id, hidden, updated_at)
      VALUES (@b, @q, @a, 1, @u)
    `
    ).run({ b: branch.id, q: u1.id, a: a1.id, u: Date.now() })

    expect(branchRepo.getCandidates(branch.id, u1.id)).toEqual([])
  })

  it('getEffectiveFilters: question exclude locks all answers; answer exclude applies only when question included', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    insertConvo(db, 'c1')

    const messageRepo = new MessageRepo(db)
    const branchRepo = new BranchRepo(db)

    const u1 = messageRepo.append({ convoId: 'c1', role: 'user', body: 'Q1' })
    const a1 = messageRepo.append({ convoId: 'c1', role: 'assistant', body: 'A1' })
    const branch = branchRepo.ensureDefault('c1')

    // Answer-level exclude only.
    db.prepare(
      `
      INSERT INTO branch_filter(branch_id, target_type, target_id, mode, updated_at)
      VALUES (@b, 'answer', @tid, 'exclude', @u)
    `
    ).run({ b: branch.id, tid: a1.id, u: Date.now() })

    expect(branchRepo.getEffectiveFilters(branch.id, u1.id, a1.id)).toEqual({
      questionMode: 'include',
      answerMode: 'exclude',
      effectiveMode: 'exclude',
      lockedByQuestionExclude: false,
    })

    // Question-level exclude locks.
    db.prepare(
      `
      INSERT INTO branch_filter(branch_id, target_type, target_id, mode, updated_at)
      VALUES (@b, 'question', @tid, 'exclude', @u)
    `
    ).run({ b: branch.id, tid: u1.id, u: Date.now() + 1 })

    expect(branchRepo.getEffectiveFilters(branch.id, u1.id, a1.id)).toEqual({
      questionMode: 'exclude',
      answerMode: 'exclude',
      effectiveMode: 'exclude',
      lockedByQuestionExclude: true,
    })
  })
})

