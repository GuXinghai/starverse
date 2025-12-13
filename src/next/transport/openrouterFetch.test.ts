import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { openrouterFetch } from './openrouterFetch'

describe('openrouterFetch (transport)', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    globalThis.fetch = originalFetch
  })

  it('throws structured http_error on non-2xx (before streaming)', async () => {
    globalThis.fetch = vi.fn(async () => new Response('bad', { status: 401, statusText: 'Unauthorized' })) as any

    await expect(
      openrouterFetch({
        apiKey: 'k',
        body: { model: 'openrouter/auto' },
        requestId: 'rid',
      })
    ).rejects.toMatchObject({
      type: 'http_error',
      requestId: 'rid',
      status: 401,
    })
  })

  it('throws structured aborted error when signal already aborted', async () => {
    const ac = new AbortController()
    ac.abort()

    await expect(
      openrouterFetch({
        apiKey: 'k',
        body: { model: 'openrouter/auto' },
        requestId: 'rid',
        signal: ac.signal,
      })
    ).rejects.toMatchObject({
      type: 'aborted',
      requestId: 'rid',
    })
  })

  it('throws structured timeout error when timeoutMs elapses', async () => {
    globalThis.fetch = vi.fn(
      async (_url: string, init: any) =>
        new Promise((_resolve, _reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('Aborted')
            ;(err as any).name = 'AbortError'
            _reject(err)
          })
        })
    ) as any

    const promise = openrouterFetch({
      apiKey: 'k',
      body: { model: 'openrouter/auto' },
      requestId: 'rid',
      timeoutMs: 50,
    })

    // Attach the rejection handler before advancing timers to avoid
    // PromiseRejectionHandledWarning in Node.
    const assertion = expect(promise).rejects.toMatchObject({
      type: 'timeout',
      requestId: 'rid',
      timeoutMs: 50,
    })

    await vi.advanceTimersByTimeAsync(60)

    await assertion
  })
})
