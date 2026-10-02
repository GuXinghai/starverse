import { describe, expect, it, vi } from 'vitest'
import { notifyModelFactsSemanticInvalidationV1 } from './modelFactsSemanticInvalidationV1'

describe('postcommit semantic notification isolation', () => {
  it('does not throw for synchronous or rejected asynchronous delivery', async () => {
    const event = { kind: 'source_priority' as const, sourcePriorityConfigRevision: `source-priority-config-v1:${'a'.repeat(64)}` }
    const sync = vi.fn(() => { throw new Error('SYNTHETIC_DELIVERY_FAILURE') })
    const asyncFailure = vi.fn(async () => { throw new Error('SYNTHETIC_DELIVERY_FAILURE') })
    expect(() => notifyModelFactsSemanticInvalidationV1(sync, event)).not.toThrow()
    expect(() => notifyModelFactsSemanticInvalidationV1(asyncFailure, event)).not.toThrow()
    await Promise.resolve()
    expect(sync).toHaveBeenCalledOnce()
    expect(asyncFailure).toHaveBeenCalledOnce()
  })
})
