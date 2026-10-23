import { describe, expect, it } from 'vitest'
import {
  GENERATION_V2_PROVIDER_OUTPUT_BLOCKED,
  GENERATION_V2_PROVIDER_OUTPUT_INCOMPLETE,
  incompleteProviderFinishV2,
  settleProviderFinishV2,
} from './generationProviderFinishV2'

describe('provider finish classification (P4a-15)', () => {
  it('treats truncated finishes as incomplete and blocked finishes as blocked', () => {
    for (const reason of ['length', 'max_tokens', 'MAX_TOKENS', 'insufficient_system_resource', 'error']) {
      expect(incompleteProviderFinishV2(reason)?.code).toBe(GENERATION_V2_PROVIDER_OUTPUT_INCOMPLETE)
    }
    for (const reason of ['content_filter', 'refusal', 'SAFETY', 'RECITATION', 'PROHIBITED_CONTENT']) {
      expect(incompleteProviderFinishV2(reason)?.code).toBe(GENERATION_V2_PROVIDER_OUTPUT_BLOCKED)
    }
    for (const reason of ['stop', 'end_turn', 'stop_sequence', 'STOP', 'tool_calls', 'tool_use', null, undefined]) {
      expect(incompleteProviderFinishV2(reason)).toBeNull()
    }
  })

  it('turns only a completed terminal into a failed one and keeps other terminals unchanged', () => {
    expect(settleProviderFinishV2({ state: 'completed', finishReason: 'length', errorCode: null, errorMessage: null }))
      .toEqual({ state: 'failed', errorCode: GENERATION_V2_PROVIDER_OUTPUT_INCOMPLETE,
        errorMessage: 'The provider stopped before the response was finished (length).' })
    expect(settleProviderFinishV2({ state: 'completed', finishReason: 'stop', errorCode: null, errorMessage: null }))
      .toEqual({ state: 'completed', errorCode: null, errorMessage: null })
    expect(settleProviderFinishV2({ state: 'cancelled', finishReason: 'length', errorCode: 'USER', errorMessage: 'stopped' }))
      .toEqual({ state: 'cancelled', errorCode: 'USER', errorMessage: 'stopped' })
  })
})
