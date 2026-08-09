import { readFileSync } from 'node:fs'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import { ConversationReadV2Repo } from './conversationReadV2Repo'

function createDb() {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
  db.prepare(`INSERT INTO project_v2(project_id,name,created_at_ms,updated_at_ms)
    VALUES('project:1','Project',1,1)`).run()
  return db
}

describe('ConversationReadV2Repo pagination', () => {
  it('uses a stable cursor and returns at most 50 conversations per page', () => {
    const db = createDb()
    try {
      const insertConversation = db.prepare(`INSERT INTO conversation_v2(
        conversation_id,project_id,title,created_at_ms,updated_at_ms
      ) VALUES(?,'project:1',?,1,?)`)
      const insertBranch = db.prepare(`INSERT INTO branch_v2(
        branch_id,conversation_id,head_message_id,name,created_at_ms,updated_at_ms,deleted_at_ms,parent_branch_id
      ) VALUES(?,?,NULL,NULL,1,?,NULL,NULL)`)
      for (let index = 0; index < 55; index += 1) {
        const conversationId = `conversation:${String(index).padStart(2, '0')}`
        const updatedAtMs = 100 - Math.floor(index / 2)
        insertConversation.run(conversationId, conversationId, updatedAtMs)
        insertBranch.run(`branch:${index}:0`, conversationId, updatedAtMs)
      }
      for (let index = 1; index < 52; index += 1) {
        insertBranch.run(`branch:0:${index}`, 'conversation:00', 100)
      }

      const read = new ConversationReadV2Repo(db)
      const first = read.listConversationPage('project:1')
      expect(first.items).toHaveLength(50)
      expect(first.totalCount).toBe(55)
      expect(first.nextCursor).not.toBeNull()
      expect(first.items[0]).toMatchObject({
        conversationId: 'conversation:00',
        branchesHasMore: true,
      })
      expect(first.items[0]?.branches).toHaveLength(50)

      const second = read.listConversationPage('project:1', first.nextCursor)
      expect(second.items).toHaveLength(5)
      expect(second.nextCursor).toBeNull()
      expect(new Set([...first.items, ...second.items].map((item) => item.conversationId)).size)
        .toBe(55)
    } finally {
      db.close()
    }
  })

  it('pages branches independently with a stable 50-row cursor', () => {
    const db = createDb()
    try {
      db.prepare(`INSERT INTO conversation_v2(
        conversation_id,project_id,title,created_at_ms,updated_at_ms
      ) VALUES('conversation:1','project:1','Conversation',1,100)`).run()
      const insertBranch = db.prepare(`INSERT INTO branch_v2(
        branch_id,conversation_id,head_message_id,name,created_at_ms,updated_at_ms,deleted_at_ms,parent_branch_id
      ) VALUES(?,'conversation:1',NULL,NULL,1,?,NULL,NULL)`)
      for (let index = 0; index < 55; index += 1) {
        insertBranch.run(`branch:${String(index).padStart(2, '0')}`, 100 - Math.floor(index / 2))
      }

      const read = new ConversationReadV2Repo(db)
      const first = read.listBranchPage('conversation:1')
      const second = read.listBranchPage('conversation:1', first.nextCursor)

      expect(first.items).toHaveLength(50)
      expect(first.totalCount).toBe(55)
      expect(first.nextCursor).not.toBeNull()
      expect(second.items).toHaveLength(5)
      expect(second.nextCursor).toBeNull()
      expect(new Set([...first.items, ...second.items].map((item) => item.branchId)).size).toBe(55)
    } finally {
      db.close()
    }
  })

  it('resolves same-parent question candidates through immutable introduction branches without writes', () => {
    const db = createDb()
    try {
      db.prepare(`INSERT INTO conversation_v2(
        conversation_id,project_id,title,created_at_ms,updated_at_ms
      ) VALUES('conversation:1','project:1','Conversation',1,10)`).run()
      db.prepare(`INSERT INTO branch_v2(
        branch_id,conversation_id,head_message_id,name,created_at_ms,updated_at_ms,deleted_at_ms,parent_branch_id
      ) VALUES('branch:1','conversation:1',NULL,'Main',1,3,NULL,NULL)`).run()
      db.prepare(`INSERT INTO branch_v2(
        branch_id,conversation_id,head_message_id,name,created_at_ms,updated_at_ms,deleted_at_ms,parent_branch_id
      ) VALUES('branch:2','conversation:1',NULL,'Edited',1,5,NULL,'branch:1')`).run()
      const insertMessage = db.prepare(`INSERT INTO message_v2(
        message_id,conversation_id,introduced_in_branch_id,role,status,parent_message_id,question_id,
        answer_root_id,ordinal,created_at_ms,updated_at_ms
      ) VALUES(?,'conversation:1',?,?,?,?,?,?,?,?,?)`)
      insertMessage.run('question:1', 'branch:1', 'user', 'completed', null, null, null, 1, 2, 2)
      insertMessage.run('answer:1', 'branch:1', 'assistant', 'completed', 'question:1', 'question:1', 'answer:1', 2, 3, 3)
      insertMessage.run('question:2', 'branch:2', 'user', 'completed', null, null, null, 3, 4, 4)
      insertMessage.run('answer:2', 'branch:2', 'assistant', 'completed', 'question:2', 'question:2', 'answer:2', 4, 5, 5)
      db.prepare(`UPDATE branch_v2 SET head_message_id='answer:1' WHERE branch_id='branch:1'`).run()
      db.prepare(`UPDATE branch_v2 SET head_message_id='answer:2' WHERE branch_id='branch:2'`).run()

      const read = new ConversationReadV2Repo(db)
      const changesBeforeRead = db.prepare('SELECT total_changes() AS value').get() as { value: number }
      expect(read.getMessageCandidateNavigation('branch:1', 'question:1')).toEqual({
        conversationId: 'conversation:1',
        currentBranchId: 'branch:1',
        messageId: 'question:1',
        parentMessageId: null,
        role: 'user',
        currentIndex: 0,
        total: 2,
        previous: null,
        next: { messageId: 'question:2', branchId: 'branch:2' },
      })
      expect(read.getMessageCandidateNavigation('branch:2', 'question:2')).toMatchObject({
        currentIndex: 1,
        total: 2,
        previous: { messageId: 'question:1', branchId: 'branch:1' },
        next: null,
      })
      const changesAfterRead = db.prepare('SELECT total_changes() AS value').get() as { value: number }
      expect(changesAfterRead.value).toBe(changesBeforeRead.value)
      expect(db.prepare(`SELECT branch_id AS branchId,head_message_id AS headMessageId
        FROM branch_v2 ORDER BY branch_id`).all()).toEqual([
        { branchId: 'branch:1', headMessageId: 'answer:1' },
        { branchId: 'branch:2', headMessageId: 'answer:2' },
      ])
    } finally {
      db.close()
    }
  })

  it('returns explicit transcript page metadata for an empty branch', () => {
    const db = createDb()
    try {
      db.prepare(`INSERT INTO conversation_v2(
        conversation_id,project_id,title,created_at_ms,updated_at_ms
      ) VALUES('conversation:1','project:1','Conversation',1,1)`).run()
      db.prepare(`INSERT INTO branch_v2(
        branch_id,conversation_id,head_message_id,name,created_at_ms,updated_at_ms,deleted_at_ms,parent_branch_id
      ) VALUES('branch:1','conversation:1',NULL,NULL,1,1,NULL,NULL)`).run()

      expect(new ConversationReadV2Repo(db).readBranch('branch:1')).toMatchObject({
        branchId: 'branch:1',
        headMessageId: null,
        beforeMessageId: null,
        hasMoreTurns: false,
        turns: [],
      })
    } finally {
      db.close()
    }
  })

  it('orders answer candidates by immutable message ordinal and excludes answers no longer on their introduction route', () => {
    const db = createDb()
    try {
      db.prepare(`INSERT INTO conversation_v2(
        conversation_id,project_id,title,created_at_ms,updated_at_ms
      ) VALUES('conversation:1','project:1','Conversation',1,100)`).run()
      db.prepare(`INSERT INTO branch_v2(
        branch_id,conversation_id,head_message_id,name,created_at_ms,updated_at_ms,deleted_at_ms,parent_branch_id
      ) VALUES('branch:1','conversation:1',NULL,NULL,1,100,NULL,NULL)`).run()
      db.prepare(`INSERT INTO branch_v2(
        branch_id,conversation_id,head_message_id,name,created_at_ms,updated_at_ms,deleted_at_ms,parent_branch_id
      ) VALUES('branch:2','conversation:1',NULL,NULL,1,100,NULL,'branch:1')`).run()
      db.prepare(`INSERT INTO message_v2(
        message_id,conversation_id,introduced_in_branch_id,role,status,parent_message_id,question_id,
        answer_root_id,ordinal,created_at_ms,updated_at_ms
      ) VALUES('question:1','conversation:1','branch:1','user','completed',NULL,NULL,NULL,1,2,2)`).run()
      const insertAnswer = db.prepare(`INSERT INTO message_v2(
        message_id,conversation_id,introduced_in_branch_id,role,status,parent_message_id,question_id,
        answer_root_id,ordinal,created_at_ms,updated_at_ms
      ) VALUES(?,'conversation:1',?,'assistant','completed','question:1','question:1',?,?,?,?)`)
      insertAnswer.run('answer:1', 'branch:1', 'answer:1', 2, 3, 3)
      insertAnswer.run('answer:2', 'branch:2', 'answer:2', 3, 4, 4)
      insertAnswer.run('answer:2-replaced', 'branch:2', 'answer:2-replaced', 4, 5, 5)
      db.prepare(`UPDATE branch_v2 SET head_message_id='answer:1' WHERE branch_id='branch:1'`).run()
      db.prepare(`UPDATE branch_v2 SET head_message_id='answer:2-replaced' WHERE branch_id='branch:2'`).run()
      db.prepare(`INSERT INTO branch_choice_v2(
        branch_id,conversation_id,question_id,chosen_answer_root_id,updated_at_ms
      ) VALUES('branch:2','conversation:1','question:1','answer:2-replaced',100)`).run()

      const read = new ConversationReadV2Repo(db)
      expect(read.getMessageCandidateNavigation('branch:1', 'answer:1')).toMatchObject({
        currentIndex: 0,
        total: 2,
        previous: null,
        next: { messageId: 'answer:2-replaced', branchId: 'branch:2' },
      })
      expect(read.getMessageCandidateNavigation('branch:2', 'answer:2-replaced')).toMatchObject({
        currentIndex: 1,
        total: 2,
        previous: { messageId: 'answer:1', branchId: 'branch:1' },
        next: null,
      })
    } finally {
      db.close()
    }
  })

  it('excludes a candidate hidden on its introduction branch while leaving sibling branches unaffected', () => {
    const db = createDb()
    try {
      db.prepare(`INSERT INTO conversation_v2(
        conversation_id,project_id,title,created_at_ms,updated_at_ms
      ) VALUES('conversation:1','project:1','Conversation',1,100)`).run()
      db.prepare(`INSERT INTO branch_v2(
        branch_id,conversation_id,head_message_id,name,created_at_ms,updated_at_ms,deleted_at_ms,parent_branch_id
      ) VALUES('branch:1','conversation:1',NULL,NULL,1,100,NULL,NULL)`).run()
      db.prepare(`INSERT INTO branch_v2(
        branch_id,conversation_id,head_message_id,name,created_at_ms,updated_at_ms,deleted_at_ms,parent_branch_id
      ) VALUES('branch:2','conversation:1',NULL,NULL,1,100,NULL,'branch:1')`).run()
      const insertMessage = db.prepare(`INSERT INTO message_v2(
        message_id,conversation_id,introduced_in_branch_id,role,status,parent_message_id,question_id,
        answer_root_id,ordinal,created_at_ms,updated_at_ms
      ) VALUES(?,'conversation:1',?,?,?,?,?,?,?,?,?)`)
      insertMessage.run('question:1', 'branch:1', 'user', 'completed', null, null, null, 1, 2, 2)
      insertMessage.run(
        'answer:1',
        'branch:1',
        'assistant',
        'completed',
        'question:1',
        'question:1',
        'answer:1',
        2,
        3,
        3,
      )
      insertMessage.run(
        'question:follow',
        'branch:1',
        'user',
        'completed',
        'answer:1',
        null,
        null,
        3,
        4,
        4,
      )
      insertMessage.run(
        'answer:follow',
        'branch:1',
        'assistant',
        'completed',
        'question:follow',
        'question:follow',
        'answer:follow',
        4,
        5,
        5,
      )
      insertMessage.run('question:2', 'branch:2', 'user', 'completed', null, null, null, 5, 6, 6)
      insertMessage.run(
        'answer:2',
        'branch:2',
        'assistant',
        'completed',
        'question:2',
        'question:2',
        'answer:2',
        6,
        7,
        7,
      )
      db.prepare(`UPDATE branch_v2 SET head_message_id='answer:follow' WHERE branch_id='branch:1'`).run()
      db.prepare(`UPDATE branch_v2 SET head_message_id='answer:2' WHERE branch_id='branch:2'`).run()
      db.prepare(`INSERT INTO branch_question_hide_v2(
        branch_id,conversation_id,question_id,hidden_at_ms
      ) VALUES('branch:1','conversation:1','question:1',101)`).run()

      const read = new ConversationReadV2Repo(db)
      expect(read.getMessageCandidateNavigation('branch:2', 'question:2')).toMatchObject({
        currentIndex: 0,
        total: 1,
        previous: null,
        next: null,
      })
      expect(() => read.getMessageCandidateNavigation('branch:1', 'question:1'))
        .toThrow('GENERATION_V2_CONVERSATION_READ_NOT_FOUND')
    } finally {
      db.close()
    }
  })
})

describe('message candidate navigation architecture', () => {
  it('does not retain obsolete candidate-selection write APIs', () => {
    const sources = [
      'infra/db/repo/conversationGraphV2Repo.ts',
      'infra/db/repo/conversationReadV2Repo.ts',
      'electron/ipc/generationV2WorkspaceIpc.ts',
      'electron/preload.ts',
      'electron/electron-env.d.ts',
      'src/next/generation-v2/renderer/generationV2WorkspaceClient.ts',
      'src/ui-app/app/appChatApp.logic.ts',
    ].map((file) => readFileSync(path.resolve(file), 'utf8')).join('\n')
    for (const obsolete of [
      'selectGenerationV2Answer',
      'selectAnswer',
      'listQuestionCandidates',
      'resolveQuestionCandidate',
      'listAnswerCandidates',
      'workspace:select-answer',
      'list-question-candidates',
      'select-question-candidate',
    ]) {
      expect(sources).not.toContain(obsolete)
    }
    expect(sources).toContain('get-message-candidate-navigation')
  })
})
