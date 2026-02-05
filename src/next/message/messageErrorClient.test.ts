import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import type { ErrorEnvelope } from '@/next/errors/openRouterErrorEnvelope'
import { upsertMessageErrorEnvelope } from './messageClient'

describe('messageErrorClient', () => {
  const originalDbBridge = (globalThis as any).dbBridge

  beforeEach(() => {
    const invoke = vi.fn(async () => ({ ok: true }))
    ;(globalThis as any).dbBridge = { invoke }
  })

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
  })

  it('sanitizes and computes bytes before persisting', async () => {
    const longMessage = 'a'.repeat(5000)
    const envelope: ErrorEnvelope = {
      phase: 'pre_stream',
      completionClass: 'error',
      openrouter: {
        code: '400',
        message: longMessage,
        metadata: { provider_name: 'p1', raw: { shouldNotPersist: true } },
      },
      raw: { raw_error: { token: 'secret' } },
      truncated: false,
    }

    await upsertMessageErrorEnvelope({ messageId: 'm1', envelope })

    const invoke = (globalThis as any).dbBridge.invoke as ReturnType<typeof vi.fn>
    expect(invoke).toHaveBeenCalled()
    const [method, params] = invoke.mock.calls[0] ?? []

    expect(method).toBe('messageError.upsert')
    expect(params?.messageId).toBe('m1')
    expect(params?.isTruncated).toBe(true)
    expect(params?.metaPatch?.error_ref).toBe(true)
    expect(params?.metaPatch?.error_summary?.completionClass).toBe('error')

    const json = String(params?.envelopeJson ?? '')
    const parsed = JSON.parse(json)
    expect(parsed.raw).toBeUndefined()

    const bytes = new TextEncoder().encode(json).length
    expect(params?.envelopeBytes).toBe(bytes)
  })
})
