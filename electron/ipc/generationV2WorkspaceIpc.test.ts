import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import type { IpcInvokeHandler } from './types'
import { registerGenerationV2WorkspaceIpc } from './generationV2WorkspaceIpc'

function createDb() {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
  const graph = new ConversationGraphV2Repo(db)
  runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
    graph.createProject(context, { projectId: 'project:1', name: 'Project', createdAtMs: 1 })
    graph.createConversationAndDefaultBranch(context, {
      projectId: 'project:1',
      conversationId: 'conversation:delete',
      branchId: 'branch:delete',
      title: 'Delete',
      branchName: null,
      createdAtMs: 2,
    })
  })
  return db
}

describe('generation V2 workspace IPC conversation deletion', () => {
  it('quiesces the conversation before deleting it', async () => {
    const db = createDb()
    try {
      const handlers = new Map<string, IpcInvokeHandler>()
      const order: string[] = []
      registerGenerationV2WorkspaceIpc({
        registerInvoke: (channel, handler) => handlers.set(channel, handler),
        db,
        runtimeRegistry: {
          runWithProjectQuiesced: async (_projectId, action) => action(),
          runWithConversationQuiesced: async (conversationId, action) => {
            expect(conversationId).toBe('conversation:delete')
            expect(db.prepare('SELECT 1 FROM conversation_v2 WHERE conversation_id=?')
              .get(conversationId)).toEqual({ 1: 1 })
            order.push('abort')
            const value = await action()
            order.push('delete')
            return value
          },
        },
      })

      await expect(handlers.get('generation-v2:workspace:delete-conversation')?.({}, {
        conversationId: 'conversation:delete',
      })).resolves.toEqual({ ok: true, value: true })
      expect(order).toEqual(['abort', 'delete'])
      expect(db.prepare('SELECT 1 FROM conversation_v2 WHERE conversation_id=?')
        .get('conversation:delete')).toBeUndefined()
    } finally {
      db.close()
    }
  })

  it('preserves the conversation when quiescing fails', async () => {
    const db = createDb()
    try {
      const handlers = new Map<string, IpcInvokeHandler>()
      const runWithConversationQuiesced = vi.fn(async () => {
        throw new Error('GENERATION_V2_RUNTIME_CONVERSATION_ABORT_TIMEOUT')
      })
      registerGenerationV2WorkspaceIpc({
        registerInvoke: (channel, handler) => handlers.set(channel, handler),
        db,
        runtimeRegistry: {
          runWithProjectQuiesced: async (_projectId, action) => action(),
          runWithConversationQuiesced,
        },
      })

      await expect(handlers.get('generation-v2:workspace:delete-conversation')?.({}, {
        conversationId: 'conversation:delete',
      })).resolves.toEqual({
        ok: false,
        code: 'GENERATION_V2_RUNTIME_CONVERSATION_ABORT_TIMEOUT',
      })
      expect(db.prepare('SELECT 1 FROM conversation_v2 WHERE conversation_id=?')
        .get('conversation:delete')).toEqual({ 1: 1 })
    } finally {
      db.close()
    }
  })

  it('quiesces every conversation in a project before deleting the project', async () => {
    const db = createDb()
    try {
      const handlers = new Map<string, IpcInvokeHandler>()
      const order: string[] = []
      registerGenerationV2WorkspaceIpc({
        registerInvoke: (channel, handler) => handlers.set(channel, handler),
        db,
        runtimeRegistry: {
          runWithConversationQuiesced: async (_conversationId, action) => action(),
          runWithProjectQuiesced: async (projectId, action) => {
            expect(projectId).toBe('project:1')
            expect(db.prepare('SELECT 1 FROM project_v2 WHERE project_id=?').get(projectId)).toEqual({ 1: 1 })
            order.push('abort')
            const value = await action()
            order.push('delete')
            return value
          },
        },
      })

      await expect(handlers.get('generation-v2:workspace:delete-project')?.({}, {
        projectId: 'project:1',
      })).resolves.toEqual({ ok: true, value: true })
      expect(order).toEqual(['abort', 'delete'])
      expect(db.prepare('SELECT 1 FROM project_v2 WHERE project_id=?').get('project:1')).toBeUndefined()
    } finally {
      db.close()
    }
  })
})
