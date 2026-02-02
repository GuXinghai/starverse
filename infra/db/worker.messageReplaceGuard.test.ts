import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { DbWorkerRuntime } from './worker'

describe('DbWorkerRuntime message.replace guard', () => {
  it('rejects message.replace once a conversation has any branch row', async () => {
    const runtime = new DbWorkerRuntime({
      dbPath: ':memory:',
      schemaPath: path.resolve(process.cwd(), 'infra', 'db', 'schema.sql'),
    })

    const created = await runtime.handleMessage({ id: '1', method: 'convo.create', params: { title: 'Chat' } })
    expect(created.ok).toBe(true)
    const convoId = String((created as any).result?.id ?? '')
    expect(convoId.length).toBeGreaterThan(0)

    // Enable branching by creating a branch row.
    const ensured = await runtime.handleMessage({ id: '2', method: 'branch.ensureDefault', params: { convoId, name: 'Main' } })
    expect(ensured.ok).toBe(true)

    const replaced = await runtime.handleMessage({
      id: '3',
      method: 'message.replace',
      params: { convoId, messages: [{ role: 'user', body: 'hi' }] },
    })

    expect(replaced.ok).toBe(false)
    expect((replaced as any).error?.code).toBe('ERR_MUTATION_FORBIDDEN_ON_BRANCHING_CONVO')
  })

  it('allows message.replace on legacy conversations before any branch exists', async () => {
    const runtime = new DbWorkerRuntime({
      dbPath: ':memory:',
      schemaPath: path.resolve(process.cwd(), 'infra', 'db', 'schema.sql'),
    })

    const created = await runtime.handleMessage({ id: '1', method: 'convo.create', params: { title: 'Chat' } })
    expect(created.ok).toBe(true)
    const convoId = String((created as any).result?.id ?? '')
    expect(convoId.length).toBeGreaterThan(0)

    const replaced = await runtime.handleMessage({
      id: '2',
      method: 'message.replace',
      params: { convoId, messages: [{ role: 'user', body: 'hi' }] },
    })

    expect(replaced.ok).toBe(true)
  })
})

