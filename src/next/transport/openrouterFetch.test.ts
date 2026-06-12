import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { openrouterFetch } from './openrouterFetch'
import { DEFAULT_OPENROUTER_TEST_MODEL } from '../openrouter/openRouterTestModels'

const testModel = DEFAULT_OPENROUTER_TEST_MODEL

describe('openrouterFetch (transport)', () => {
  const originalFetch = globalThis.fetch
  const originalVerboseFlag = (globalThis as any).__SV_TEST_VERBOSE_OPENROUTER

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    globalThis.fetch = originalFetch
    ;(globalThis as any).__SV_TEST_VERBOSE_OPENROUTER = originalVerboseFlag
    vi.restoreAllMocks()
  })

  it('throws structured http_error on non-2xx (before streaming)', async () => {
    globalThis.fetch = vi.fn(async () => new Response('bad', { status: 401, statusText: 'Unauthorized' })) as any

    await expect(
      openrouterFetch({
        apiKey: 'k',
        body: { model: testModel },
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
        body: { model: testModel },
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
      body: { model: testModel },
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

  it('preserves legacy renderer fetch Authorization and baseUrl behavior', async () => {
    const secretKey = 'sk-or-fetch-legacy-secret'
    const calls: any[] = []
    globalThis.fetch = vi.fn(async (url: string, init: any) => {
      calls.push({ url, init })
      return new Response('ok', {
        status: 200,
        headers: { 'x-openrouter-generation-id': 'gen_fetch_legacy' },
      })
    }) as any

    const result = await openrouterFetch({
      apiKey: secretKey,
      baseUrl: 'https://openrouter-proxy.example.test/custom/v1/',
      body: { model: testModel },
      requestId: 'rid_fetch_legacy',
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('https://openrouter-proxy.example.test/custom/v1/chat/completions')
    expect(calls[0]?.init?.headers?.Authorization).toBe(`Bearer ${secretKey}`)
    expect(result.generationId).toBe('gen_fetch_legacy')
    const serializedResult = JSON.stringify(result)
    expect(serializedResult).not.toContain(secretKey)
    expect(serializedResult).not.toContain(`Bearer ${secretKey}`)
    expect(serializedResult).not.toContain('Authorization')
  })

  it('logs only sanitized multimodal request summaries when verbose logging is enabled', async () => {
    ;(globalThis as any).__SV_TEST_VERBOSE_OPENROUTER = '1'
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const secretKey = 'sk-or-secret-key'
    const imageBase64 = 'IMG_SECRET_BASE64_PAYLOAD'
    const pdfBase64 = 'PDF_SECRET_BASE64_PAYLOAD'
    const textAttachmentBody = 'FULL TEXT ATTACHMENT BODY SHOULD NOT APPEAR'
    globalThis.fetch = vi.fn(async () => new Response('ok', { status: 200 })) as any

    await openrouterFetch({
      apiKey: secretKey,
      body: {
        model: testModel,
        stream: true,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: textAttachmentBody },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } },
            { type: 'file', file: { filename: 'manual.pdf', file_data: `data:application/pdf;base64,${pdfBase64}` } },
          ],
        }],
      },
      requestId: 'rid',
    })

    const [, init] = (globalThis.fetch as any).mock.calls[0] ?? []
    const requestBody = JSON.parse(String(init?.body ?? '{}'))
    expect(requestBody.model).toBe(DEFAULT_OPENROUTER_TEST_MODEL)

    const logged = warnSpy.mock.calls.map((call) => call.map(String).join(' ')).join('\n')
    expect(logged).not.toContain(secretKey)
    expect(logged).not.toContain(`Bearer ${secretKey}`)
    expect(logged).not.toContain(imageBase64)
    expect(logged).not.toContain(pdfBase64)
    expect(logged).not.toContain(textAttachmentBody)
    expect(logged).toContain('Request Body Summary (SANITIZED)')
    expect(logged).toContain('data:image/png;base64')
    expect(logged).toContain('data:application/pdf;base64')
  })
})
