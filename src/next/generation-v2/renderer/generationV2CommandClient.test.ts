import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  submitGenerationV2EditResend,
  submitGenerationV2Initial,
  submitGenerationV2Regenerate,
  submitGenerationV2Retry,
} from './generationV2CommandClient'

describe('Generation V2 command capability envelopes', () => {
  const originalWindow = (globalThis as any).window
  const methods = {
    initial: vi.fn(),
    retry: vi.fn(),
    regenerate: vi.fn(),
    editResend: vi.fn(),
  }

  beforeEach(() => {
    for (const method of Object.values(methods)) {
      method.mockReset()
      method.mockResolvedValue({ ok: false, code: 'STALE_CAPABILITY_REVISION' })
    }
    ;(globalThis as any).window = {
      generationV2: { openRouter: { chat: methods } },
    }
  })

  afterEach(() => {
    ;(globalThis as any).window = originalWindow
  })

  it.each([
    ['initial', submitGenerationV2Initial, 'capability-v2:current'],
    ['regenerate', submitGenerationV2Regenerate, 'capability-v2:current'],
    ['editResend', submitGenerationV2EditResend, 'capability-v2:current'],
    ['retry', submitGenerationV2Retry, 'capability-v2:frozen'],
  ] as const)('%s submits once with the caller-owned revision', async (method, submit, revision) => {
    const command = { operationId: `operation:${method}` }

    await expect(submit({ kind: 'openrouter_chat' }, command, revision))
      .resolves.toEqual({ ok: false, code: 'STALE_CAPABILITY_REVISION' })
    expect(methods[method]).toHaveBeenCalledTimes(1)
    expect(methods[method]).toHaveBeenCalledWith({
      command,
      expectedCapabilityRevision: revision,
    })
  })
})
