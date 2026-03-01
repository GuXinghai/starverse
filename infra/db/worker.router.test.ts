import { describe, expect, it } from 'vitest'
import { MessageChannel } from 'node:worker_threads'
import type { DbHandler, WorkerRequestMessage } from './types'
import type { DbMethod } from './dbMethodsRegistry'
import { createWorkerHandlerContainer } from './worker/container'
import { attachWorkerPort, dispatchWorkerMessage } from './worker/router'

describe('db worker router', () => {
  it('dispatches message to matched handler and preserves response envelope', async () => {
    const calls: unknown[] = []
    const handlers = new Map<DbMethod, DbHandler>()
    handlers.set('health.ping', (params) => {
      calls.push(params)
      return { ok: true }
    })

    const message: WorkerRequestMessage = {
      id: 'req-1',
      method: 'health.ping',
      params: { sample: 1 },
    }

    const response = await dispatchWorkerMessage(handlers, message)

    expect(response).toEqual({
      id: 'req-1',
      ok: true,
      result: { ok: true },
    })
    expect(calls).toEqual([{ sample: 1 }])
  })

  it('returns protocol-compatible ERR_NOT_FOUND for unknown method', async () => {
    const handlers = new Map<DbMethod, DbHandler>()

    const response = await dispatchWorkerMessage(handlers, {
      id: 'req-2',
      method: 'health.ping',
      params: undefined,
    })

    expect(response.id).toBe('req-2')
    expect(response.ok).toBe(false)
    expect(response.error?.code).toBe('ERR_NOT_FOUND')
    expect(response.error?.message).toContain('Unknown method')
  })

  it('attachWorkerPort keeps message protocol unchanged', async () => {
    const { port1, port2 } = new MessageChannel()

    const runtime = {
      handleMessage: async (message: WorkerRequestMessage) => ({
        id: message.id,
        ok: true,
        result: { echo: message.method },
      }),
    } as any

    attachWorkerPort(runtime, port1)

    const replyPromise = new Promise<any>((resolve) => {
      port2.once('message', resolve)
    })

    port2.postMessage({ id: 'req-3', method: 'health.ping', params: null })
    const reply = await replyPromise

    expect(reply).toEqual({
      id: 'req-3',
      ok: true,
      result: { echo: 'health.ping' },
    })

    port1.close()
    port2.close()
  })
})

describe('db worker container', () => {
  it('assembles full handler map with coverage check', () => {
    const runtime = {} as any
    const container = createWorkerHandlerContainer(runtime)

    expect(container.handlers.size).toBeGreaterThan(0)
    expect(container.handlers.get('project.list')).toBeTypeOf('function')
    expect(container.handlers.get('message.append')).toBeTypeOf('function')
    expect(container.handlers.get('search.rebuildIndex')).toBeTypeOf('function')
  })
})
