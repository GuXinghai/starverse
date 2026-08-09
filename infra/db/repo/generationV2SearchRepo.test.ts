import BetterSqlite3 from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import { GenerationV2SearchRepo } from './generationV2SearchRepo'

describe('GenerationV2SearchRepo', () => {
  const databases: BetterSqlite3.Database[] = []
  afterEach(() => { while (databases.length > 0) databases.pop()!.close() })

  function database(): BetterSqlite3.Database {
    const db = new BetterSqlite3(':memory:')
    databases.push(db)
    applyGenerationV2SchemaForTest(db, process.cwd())
    db.prepare(`INSERT INTO project_v2 (project_id, name, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?)`)
      .run('project:1', 'Alpha project', 1_000, 1_000)
    db.prepare(`INSERT INTO conversation_v2 (conversation_id, project_id, title, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?)`)
      .run('conversation:1', 'project:1', 'Alpha conversation', 2_000, 2_000)
    db.prepare(`INSERT INTO branch_v2 (
      branch_id,conversation_id,head_message_id,name,created_at_ms,updated_at_ms,deleted_at_ms,parent_branch_id
    ) VALUES ('branch:1','conversation:1',NULL,NULL,2_000,2_000,NULL,NULL)`).run()
    return db
  }

  it('indexes completed epoch-2 messages as their bodies arrive and preserves the legacy result projection', () => {
    const db = database()
    db.prepare(`INSERT INTO message_v2 (message_id, conversation_id, introduced_in_branch_id, role, status, parent_message_id, question_id, answer_root_id, ordinal, created_at_ms, updated_at_ms)
      VALUES (?, ?, 'branch:1', 'user', 'completed', NULL, NULL, NULL, ?, ?, ?)`)
      .run('message:1', 'conversation:1', 0, 3_000, 3_000)
    db.prepare(`UPDATE message_body_v2 SET body_text=? WHERE message_id=?`).run('A precise nebula search term', 'message:1')
    const hits = new GenerationV2SearchRepo(db).query({ q: 'nebula', scope: { projectName: false, convoName: false, convoContent: true }, mode: 'fuzzy' })
    expect(hits).toEqual([expect.objectContaining({ entityType: 'message', entityId: 'message:1', projectId: 'project:1',
      convoId: 'conversation:1', createdAtSec: 3, snippet: expect.stringContaining('nebula') })])
  })

  it('keeps project and conversation documents current without a legacy rebuild', () => {
    const db = database()
    db.prepare(`UPDATE project_v2 SET name=?, updated_at_ms=? WHERE project_id=?`).run('Renamed project', 4_000, 'project:1')
    db.prepare(`UPDATE conversation_v2 SET title=?, updated_at_ms=? WHERE conversation_id=?`).run('Renamed conversation', 5_000, 'conversation:1')
    const search = new GenerationV2SearchRepo(db)
    expect(search.query({ q: 'Renamed', scope: { projectName: true, convoName: true, convoContent: false }, mode: 'fuzzy' })
      .map((hit) => hit.entityType)).toEqual(['convo', 'project'])
  })

  it('rebuilds only completed user and assistant content from epoch-2 tables', () => {
    const db = database()
    db.prepare(`INSERT INTO message_v2 (message_id, conversation_id, introduced_in_branch_id, role, status, parent_message_id, question_id, answer_root_id, ordinal, created_at_ms, updated_at_ms)
      VALUES (?, ?, 'branch:1', 'user', 'completed', NULL, NULL, NULL, ?, ?, ?)`)
      .run('message:visible', 'conversation:1', 0, 3_000, 3_000)
    db.prepare(`UPDATE message_body_v2 SET body_text=? WHERE message_id=?`).run('visible phrase', 'message:visible')
    const search = new GenerationV2SearchRepo(db)
    search.rebuild()
    expect(search.query({ q: 'visible', scope: { projectName: false, convoName: false, convoContent: true } })
      .map((hit) => hit.entityId)).toEqual(['message:visible'])
  })
})
