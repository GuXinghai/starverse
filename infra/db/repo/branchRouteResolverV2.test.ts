import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import { BranchRouteResolverV2 } from './branchRouteResolverV2'
import { ConversationGraphV2Repo } from './conversationGraphV2Repo'
import { ConversationWorkspaceV2Repo } from './conversationWorkspaceV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from './generationV2AuthorityTransactionInternal'

function createDb() {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
  const graph = new ConversationGraphV2Repo(db)
  runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
    graph.createProject(context, { projectId: 'project:1', name: 'Project', createdAtMs: 1 })
    graph.createConversationAndDefaultBranch(context, {
      projectId: 'project:1',
      conversationId: 'conversation:1',
      branchId: 'branch:root',
      title: 'Conversation',
      branchName: 'Root',
      createdAtMs: 2,
    })
  })
  return db
}

function insertMessage(
  db: BetterSqlite3.Database,
  input: Readonly<{
    id: string
    role: 'user' | 'assistant'
    parentId: string | null
    questionId: string | null
    answerRootId: string | null
    ordinal: number
    introducedInBranchId?: string
  }>,
) {
  db.prepare(`INSERT INTO message_v2(
    message_id,conversation_id,introduced_in_branch_id,role,status,parent_message_id,question_id,
    answer_root_id,ordinal,created_at_ms,updated_at_ms
  ) VALUES(?,'conversation:1',?,?,'completed',?,?,?,?,10,10)`).run(
    input.id,
    input.introducedInBranchId ?? 'branch:root',
    input.role,
    input.parentId,
    input.questionId,
    input.answerRootId,
    input.ordinal,
  )
}

function seedTwoTurns(db: BetterSqlite3.Database) {
  insertMessage(db, {
    id: 'question:1', role: 'user', parentId: null, questionId: null,
    answerRootId: null, ordinal: 1,
  })
  insertMessage(db, {
    id: 'answer:1', role: 'assistant', parentId: 'question:1', questionId: 'question:1',
    answerRootId: 'answer:1', ordinal: 2,
  })
  insertMessage(db, {
    id: 'answer:1:alternative', role: 'assistant', parentId: 'question:1', questionId: 'question:1',
    answerRootId: 'answer:1:alternative', ordinal: 3,
  })
  insertMessage(db, {
    id: 'question:2', role: 'user', parentId: 'answer:1', questionId: null,
    answerRootId: null, ordinal: 4,
  })
  insertMessage(db, {
    id: 'answer:2', role: 'assistant', parentId: 'question:2', questionId: 'question:2',
    answerRootId: 'answer:2', ordinal: 5,
  })
  db.prepare(`INSERT INTO branch_choice_v2 VALUES
    ('branch:root','conversation:1','question:1','answer:1',10),
    ('branch:root','conversation:1','question:2','answer:2',10)`).run()
  db.prepare(`UPDATE branch_v2 SET head_message_id='answer:2',updated_at_ms=10
    WHERE branch_id='branch:root'`).run()
}

describe('BranchRouteResolverV2', () => {
  it('resolves child history only from its head and does not copy or inherit parent choices', () => {
    const db = createDb()
    try {
      seedTwoTurns(db)
      const workspace = new ConversationWorkspaceV2Repo(db)
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        workspace.forkBranch(context, {
          sourceBranchId: 'branch:root',
          branchId: 'branch:child',
          headMessageId: 'answer:1',
          name: 'Child',
          createdAtMs: 11,
        })
      })

      expect(db.prepare(`SELECT count(*) AS count FROM branch_choice_v2
        WHERE branch_id='branch:child'`).get()).toEqual({ count: 0 })
      expect(new BranchRouteResolverV2(db).resolve('branch:child')).toMatchObject({
        headMessageId: 'answer:1',
        branchAncestry: ['branch:child', 'branch:root'],
        turns: [{ questionId: 'question:1', selectedAnswerId: 'answer:1' }],
      })

      db.prepare(`UPDATE branch_choice_v2 SET chosen_answer_root_id='answer:1:alternative',updated_at_ms=12
        WHERE branch_id='branch:root' AND question_id='question:1'`).run()
      expect(new BranchRouteResolverV2(db).resolve('branch:child').turns).toEqual([
        { questionId: 'question:1', selectedAnswerId: 'answer:1' },
      ])
    } finally {
      db.close()
    }
  })

  it('inherits append-only answer Hide through descendants without affecting siblings', () => {
    const db = createDb()
    try {
      seedTwoTurns(db)
      const workspace = new ConversationWorkspaceV2Repo(db)
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        workspace.forkBranch(context, {
          sourceBranchId: 'branch:root',
          branchId: 'branch:child',
          headMessageId: 'answer:2',
          name: 'Child',
          createdAtMs: 11,
        })
        workspace.forkBranch(context, {
          sourceBranchId: 'branch:root',
          branchId: 'branch:sibling',
          headMessageId: 'answer:2',
          name: 'Sibling',
          createdAtMs: 12,
        })
        expect(workspace.hideAnswer(context, {
          branchId: 'branch:child',
          answerId: 'answer:1:alternative',
          hiddenAtMs: 13,
        })).toEqual({ created: true })
        expect(workspace.hideAnswer(context, {
          branchId: 'branch:child',
          answerId: 'answer:1:alternative',
          hiddenAtMs: 14,
        })).toEqual({ created: false })
      })

      expect(new BranchRouteResolverV2(db).resolve('branch:child').hiddenAnswerIds)
        .toContain('answer:1:alternative')
      expect(new BranchRouteResolverV2(db).resolve('branch:sibling').hiddenAnswerIds)
        .not.toContain('answer:1:alternative')
      expect(() => db.prepare(`UPDATE branch_answer_hide_v2 SET hidden_at_ms=20
        WHERE branch_id='branch:child'`).run())
        .toThrow('GENERATION_V2_GRAPH_HIDE_STRUCTURE_IMMUTABLE')
      expect(() => db.prepare(`DELETE FROM branch_answer_hide_v2
        WHERE branch_id='branch:child'`).run())
        .toThrow('GENERATION_V2_GRAPH_HIDE_DELETE_FORBIDDEN')
    } finally {
      db.close()
    }
  })

  it('rejects changing parent identity after branch creation', () => {
    const db = createDb()
    try {
      seedTwoTurns(db)
      const workspace = new ConversationWorkspaceV2Repo(db)
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        workspace.forkBranch(context, {
          sourceBranchId: 'branch:root',
          branchId: 'branch:child',
          headMessageId: 'answer:2',
          name: null,
          createdAtMs: 11,
        })
      })
      expect(() => db.prepare(`UPDATE branch_v2 SET parent_branch_id=NULL
        WHERE branch_id='branch:child'`).run())
        .toThrow('GENERATION_V2_GRAPH_BRANCH_PARENT_IMMUTABLE')
    } finally {
      db.close()
    }
  })
})
