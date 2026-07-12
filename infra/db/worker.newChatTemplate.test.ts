import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DbWorkerRuntime } from './worker'

const call = async (runtime: DbWorkerRuntime, id: string, method: any, params?: unknown) => {
  const response = await runtime.handleMessage({ id, method, params })
  if (!response.ok) throw new Error(String((response as any).error?.message ?? 'db_failed'))
  return (response as any).result
}

describe('system new chat template', () => {
  it('is hidden, materializes exactly once, and resets without deleting the template', async () => {
    const runtime = new DbWorkerRuntime({ dbPath: ':memory:', schemaPath: path.resolve('infra/db/schema.sql') })
    try {
      const first = await call(runtime, 'get-1', 'systemChatTemplate.get')
      expect(first.conversation.systemKey).toBe('new_template')
      expect(await call(runtime, 'projects', 'project.list', {})).toEqual(expect.not.arrayContaining([
        expect.objectContaining({ systemKey: 'new' }),
      ]))
      expect(await call(runtime, 'convos', 'convo.list', {})).toEqual([])

      await call(runtime, 'draft', 'conversationDraft.updateText', {
        conversationId: first.conversation.id,
        draftText: 'hello from template',
        draftMode: 'compose',
        editingSourceMessageId: null,
      })
      const ready = await call(runtime, 'get-2', 'systemChatTemplate.get')
      const input = {
        templateConversationId: ready.conversation.id,
        expectedTemplateRevision: ready.conversation.templateRevision,
        requestId: 'new-chat-request-1',
      }
      const created = await call(runtime, 'materialize-1', 'systemChatTemplate.materializeAndBeginTurn', input)
      const repeated = await call(runtime, 'materialize-2', 'systemChatTemplate.materializeAndBeginTurn', input)
      expect(repeated).toMatchObject({ idempotent: true, convoId: created.convoId, questionId: created.questionId })
      expect(runtime.db.prepare(`
        SELECT m.role, mb.body FROM message m JOIN message_body mb ON mb.message_id = m.id
        WHERE m.convo_id = ? ORDER BY m.seq
      `).all(created.convoId)).toEqual([
        { role: 'user', body: 'hello from template' },
        { role: 'assistant', body: '' },
      ])
      expect((await call(runtime, 'get-3', 'systemChatTemplate.get')).draft.draftText).toBe('')
      expect((await call(runtime, 'visible', 'convo.list', {}))).toHaveLength(1)

      const forbidden = await runtime.handleMessage({ id: 'delete-template', method: 'convo.delete', params: { id: first.conversation.id } })
      expect(forbidden.ok).toBe(false)
      expect(await call(runtime, 'delete-formal', 'convo.delete', { id: created.convoId })).toEqual({ ok: true })
      expect(runtime.db.prepare('SELECT COUNT(*) AS count FROM new_chat_materializations').get()).toEqual({ count: 0 })
    } finally {
      runtime.shutdown()
    }
  })
})
