import { describe, expect, it } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ConvoRepo } from './convoRepo'

function loadSchema(db: BetterSqlite3.Database) {
  const schemaPath = path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')
  db.exec(readFileSync(schemaPath, 'utf8'))
}

function insertProject(db: BetterSqlite3.Database, id: string, name: string) {
  const now = Date.now()
  db.prepare(`INSERT INTO project(id, name, created_at, updated_at, meta) VALUES (@id, @name, @c, @u, NULL)`).run({
    id,
    name,
    c: now,
    u: now,
  })
}

function insertConvo(db: BetterSqlite3.Database, id: string, title: string, projectId: string | null) {
  const now = Date.now()
  db.prepare(`INSERT INTO convo(id, project_id, title, created_at, updated_at, meta) VALUES (@id, @pid, @t, @c, @u, NULL)`).run({
    id,
    pid: projectId,
    t: title,
    c: now,
    u: now,
  })
}

function getConvoProject(db: BetterSqlite3.Database, id: string): string | null {
  const row = db.prepare(`SELECT project_id AS projectId FROM convo WHERE id = @id`).get({ id }) as { projectId: string | null } | undefined
  return row ? row.projectId : null
}

describe('ConvoRepo.setProject', () => {
  it('sets and clears project_id', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ConvoRepo(db)

    insertProject(db, 'p1', 'Project 1')
    insertConvo(db, 'c1', 'Chat 1', null)

    repo.setProject('c1', 'p1')
    expect(getConvoProject(db, 'c1')).toBe('p1')

    repo.setProject('c1', null)
    expect(getConvoProject(db, 'c1')).toBeNull()
  })

  it('throws if project does not exist', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ConvoRepo(db)

    insertConvo(db, 'c1', 'Chat 1', null)
    expect(() => repo.setProject('c1', 'missing')).toThrow(/Project missing not found/)
  })

  it('throws if convo does not exist', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ConvoRepo(db)

    insertProject(db, 'p1', 'Project 1')
    expect(() => repo.setProject('missing', 'p1')).toThrow(/Conversation missing not found/)
  })
})

describe('ConvoRepo.setProjectMany', () => {
  it('moves many and reports missing convos', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ConvoRepo(db)

    insertProject(db, 'p1', 'Project 1')
    insertConvo(db, 'c1', 'Chat 1', null)
    insertConvo(db, 'c2', 'Chat 2', null)

    const r = repo.setProjectMany(['c1', 'missing', 'c2'], 'p1')
    expect(r.moved).toBe(2)
    expect(r.failed).toEqual(['missing'])
    expect(getConvoProject(db, 'c1')).toBe('p1')
    expect(getConvoProject(db, 'c2')).toBe('p1')
  })

  it('throws if target project does not exist', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ConvoRepo(db)

    insertConvo(db, 'c1', 'Chat 1', null)
    expect(() => repo.setProjectMany(['c1'], 'missing')).toThrow(/Project missing not found/)
  })
})

