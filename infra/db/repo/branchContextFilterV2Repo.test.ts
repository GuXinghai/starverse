import BetterSqlite3 from 'better-sqlite3'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from './generationV2AuthorityTransactionInternal'
import { BranchContextFilterV2Repo } from './branchContextFilterV2Repo'

const root = path.resolve(process.cwd())
function setup() {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, root)
  db.prepare('INSERT INTO project_v2 VALUES (?,?,?,?)').run('project:1', 'P', 1, 1)
  db.prepare('INSERT INTO conversation_v2 VALUES (?,?,?,?,?)').run('conversation:1', 'project:1', 'C', 1, 1)
  db.prepare('INSERT INTO branch_v2 VALUES (?,?,NULL,?,?,?,?,NULL)')
    .run('branch:1', 'conversation:1', null, 4, 4, null)
  const message = db.prepare(`INSERT INTO message_v2(message_id,conversation_id,introduced_in_branch_id,role,status,parent_message_id,question_id,answer_root_id,ordinal,created_at_ms,updated_at_ms)
    VALUES(?, 'conversation:1', 'branch:1', ?, ?, ?, ?, ?, ?, ?, ?)`)
  message.run('question:1', 'user', 'completed', null, null, null, 1, 1, 1)
  message.run('answer:1', 'assistant', 'completed', 'question:1', 'question:1', 'answer:1', 2, 2, 2)
  message.run('question:2', 'user', 'completed', 'answer:1', null, null, 3, 3, 3)
  message.run('answer:2', 'assistant', 'completed', 'question:2', 'question:2', 'answer:2', 4, 4, 4)
  db.prepare("UPDATE branch_v2 SET head_message_id='answer:2' WHERE branch_id='branch:1'").run()
  db.prepare('INSERT INTO branch_choice_v2 VALUES (?,?,?,?,?)').run('branch:1', 'conversation:1', 'question:1', 'answer:1', 4)
  db.prepare('INSERT INTO branch_choice_v2 VALUES (?,?,?,?,?)').run('branch:1', 'conversation:1', 'question:2', 'answer:2', 4)
  return db
}

describe('BranchContextFilterV2Repo', () => {
  it('projects question or chosen-answer exclusion as a complete-turn visibility decision', () => {
    const db = setup(); const repo = new BranchContextFilterV2Repo(db)
    try {
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        repo.set(context, { branchId: 'branch:1', targetType: 'answer', targetId: 'answer:1', mode: 'exclude', updatedAtMs: 5 })
        repo.set(context, { branchId: 'branch:1', targetType: 'question', targetId: 'question:2', mode: 'exclude', updatedAtMs: 6 })
      })
      const filters = repo.readForTurns('branch:1', [
        { questionId: 'question:1', chosenAnswerRootId: 'answer:1' },
        { questionId: 'question:2', chosenAnswerRootId: 'answer:2' },
      ])
      expect(filters.get('question:1')).toMatchObject({ questionMode: 'include', answerMode: 'exclude', effectiveMode: 'exclude', lockedByQuestionExclude: false })
      expect(filters.get('question:2')).toMatchObject({ questionMode: 'exclude', effectiveMode: 'exclude', lockedByQuestionExclude: true })
    } finally { db.close() }
  })

  it('rejects targets that are not on the branch current path or current chosen answer', () => {
    const db = setup(); const repo = new BranchContextFilterV2Repo(db)
    try {
      expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => repo.set(context, {
        branchId: 'branch:1', targetType: 'question', targetId: 'question:missing', mode: 'exclude', updatedAtMs: 5,
      }))).toThrow('GENERATION_V2_CONTEXT_FILTER_TARGET_INVALID')
    } finally { db.close() }
  })

})
