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

describe('ContextRepo.buildForBranch', () => {
  it('excludes a full turn (question + chosen answer group incl tools) when question is excluded', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    insertConvo(db, 'c1')

    const messageRepo = new MessageRepo(db)
    const branchRepo = new BranchRepo(db)
    const ctxRepo = new ContextRepo(db, branchRepo)

    const u1 = messageRepo.append({ convoId: 'c1', role: 'user', body: 'Q1' })
    const a1 = messageRepo.append({ convoId: 'c1', role: 'assistant', body: 'A1', parentId: u1.id })
    messageRepo.append({ convoId: 'c1', role: 'tool', body: 'T1', parentId: a1.id })
    const u2 = messageRepo.append({ convoId: 'c1', role: 'user', body: 'Q2' })
    messageRepo.append({ convoId: 'c1', role: 'assistant', body: 'A2', parentId: u2.id })

    const branch = branchRepo.ensureDefault('c1', 'Main')

    branchRepo.setFilter(branch.id, 'question', u1.id, 'exclude')
    const result = ctxRepo.buildForBranch(branch.id)

    expect(result.messages.map((m) => m.body)).toEqual(['Q2', 'A2'])
  })

  it('excludes a full turn when chosen answer root is excluded', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    insertConvo(db, 'c1')

    const messageRepo = new MessageRepo(db)
    const branchRepo = new BranchRepo(db)
    const ctxRepo = new ContextRepo(db, branchRepo)

    const u1 = messageRepo.append({ convoId: 'c1', role: 'user', body: 'Q1' })
    const a1 = messageRepo.append({ convoId: 'c1', role: 'assistant', body: 'A1', parentId: u1.id })
    const u2 = messageRepo.append({ convoId: 'c1', role: 'user', body: 'Q2', parentId: a1.id })
    messageRepo.append({ convoId: 'c1', role: 'assistant', body: 'A2', parentId: u2.id })

    const branch = branchRepo.ensureDefault('c1', 'Main')

    branchRepo.setFilter(branch.id, 'answer', a1.id, 'exclude')
    const result = ctxRepo.buildForBranch(branch.id)

    expect(result.messages.map((m) => m.body)).toEqual(['Q2', 'A2'])
  })

  it('default choice backfills to latest final answer root and includes that group even if not on parent chain', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    insertConvo(db, 'c1')

    const messageRepo = new MessageRepo(db)
    const branchRepo = new BranchRepo(db)
    const ctxRepo = new ContextRepo(db, branchRepo)

    const u1 = messageRepo.append({ convoId: 'c1', role: 'user', body: 'Q1' })
    messageRepo.append({ convoId: 'c1', role: 'assistant', body: 'A1', parentId: u1.id })
    const u2 = messageRepo.append({ convoId: 'c1', role: 'user', body: 'Q2' })
    messageRepo.append({ convoId: 'c1', role: 'assistant', body: 'A2', parentId: u2.id })

    // Create branch before adding a newer answer variant under Q1.
    const branch = branchRepo.ensureDefault('c1', 'Main')

    const a1v2 = messageRepo.append({ convoId: 'c1', role: 'assistant', body: 'A1v2', parentId: u1.id })

    const result = ctxRepo.buildForBranch(branch.id)
    expect(result.messages.map((m) => m.body)).toEqual(['Q1', 'A1v2', 'Q2', 'A2'])

    const row = db
      .prepare(
        `
        SELECT chosen_answer_root_id AS chosenAnswerRootId
        FROM branch_choice
        WHERE branch_id = @branchId AND question_id = @questionId
      `
      )
      .get({ branchId: branch.id, questionId: u1.id }) as { chosenAnswerRootId?: string } | undefined

    expect(String(row?.chosenAnswerRootId ?? '')).toBe(a1v2.id)
  })
})

