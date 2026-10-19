import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import { ConversationGraphV2Repo } from './conversationGraphV2Repo'
import { ConversationWorkspaceV2Repo } from './conversationWorkspaceV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from './generationV2AuthorityTransactionInternal'

describe('formal conversation titles', () => {
  it.each(['', ' \t\n', '自定义会话'])('creates a nonempty title from %j and rejects blank renames', (requestedTitle) => {
    const db = new BetterSqlite3(':memory:')
    try {
      applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
      const graph = new ConversationGraphV2Repo(db)
      const workspace = new ConversationWorkspaceV2Repo(db)
      const at = new Date(2026, 9, 17, 14, 5, 25).getTime()
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        graph.createProject(context, { projectId: 'project:titles', name: 'Titles', createdAtMs: at })
        graph.createConversationAndDefaultBranch(context, {
          projectId: 'project:titles', conversationId: 'conversation:titles', branchId: 'branch:titles',
          title: requestedTitle, branchName: null, createdAtMs: at,
        })
      })
      const readTitle = () => db.prepare('SELECT title FROM conversation_v2 WHERE conversation_id=?')
        .get('conversation:titles')
      const expectedTitle = requestedTitle.trim() ? requestedTitle : '会话2026年10月17日14时05分25秒'
      expect(readTitle()).toEqual({ title: expectedTitle })
      for (const blank of ['', ' \t\n']) {
        expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
          workspace.renameConversation(context, {
            conversationId: 'conversation:titles', title: blank, updatedAtMs: at + 1,
          })
        })).toThrow('GENERATION_V2_WORKSPACE_INPUT_INVALID')
        expect(readTitle()).toEqual({ title: expectedTitle })
      }
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        workspace.renameConversation(context, {
          conversationId: 'conversation:titles', title: '正常改名', updatedAtMs: at + 2,
        })
      })
      expect(readTitle()).toEqual({ title: '正常改名' })
    } finally { db.close() }
  })
})
