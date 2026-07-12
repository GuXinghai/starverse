import BetterSqlite3 from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { ensureNewChatTemplateSchema } from './ensureNewChatTemplateSchema'

describe('ensureNewChatTemplateSchema', () => {
  let db: BetterSqlite3.Database | null = null

  afterEach(() => {
    db?.close()
    db = null
  })

  it('upgrades a legacy convo table without losing existing rows and is idempotent', () => {
    db = new BetterSqlite3(':memory:')
    db.exec(`
      CREATE TABLE convo (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        meta TEXT
      );
      INSERT INTO convo (id, project_id, title, created_at, updated_at, meta)
      VALUES ('legacy-convo', NULL, 'Legacy conversation', 100, 200, '{"preserved":true}');
    `)

    ensureNewChatTemplateSchema(db)
    ensureNewChatTemplateSchema(db)

    const columns = db.pragma('table_info(convo)') as Array<{
      name: string
      notnull: number
      dflt_value: string | null
    }>
    expect(columns.map((column) => column.name)).toEqual(expect.arrayContaining([
      'system_key',
      'template_revision',
    ]))
    expect(columns.find((column) => column.name === 'template_revision')).toMatchObject({
      notnull: 1,
      dflt_value: '0',
    })

    expect(db.prepare(`
      SELECT id, title, meta, system_key, template_revision
      FROM convo
      WHERE id = 'legacy-convo'
    `).get()).toEqual({
      id: 'legacy-convo',
      title: 'Legacy conversation',
      meta: '{"preserved":true}',
      system_key: null,
      template_revision: 0,
    })

    const indexes = db.pragma('index_list(convo)') as Array<{ name: string; unique: number }>
    expect(indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'idx_convo_system_key', unique: 1 }),
    ]))
  })

  it('enforces uniqueness only for non-null system keys', () => {
    db = new BetterSqlite3(':memory:')
    db.exec(`
      CREATE TABLE convo (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `)
    ensureNewChatTemplateSchema(db)

    const insert = db.prepare(`
      INSERT INTO convo (id, title, created_at, updated_at, system_key)
      VALUES (?, ?, 0, 0, ?)
    `)
    insert.run('ordinary-a', 'A', null)
    insert.run('ordinary-b', 'B', null)
    insert.run('template-a', 'Template A', 'new_template')

    expect(() => insert.run('template-b', 'Template B', 'new_template')).toThrow()
  })
})
