import { describe, expect, it } from 'vitest'
import { formatOpenAIResponsesAutoReasoningLabel } from './openaiResponsesReasoningPolicy'

describe('OpenAI Responses reasoning UI labels', () => {
  it('does not derive labels or allowed values from model identity', () => {
    expect(formatOpenAIResponsesAutoReasoningLabel('gpt-5.4-nano')).toBe('Auto')
    expect(formatOpenAIResponsesAutoReasoningLabel('future-model', 'Provider default')).toBe('Provider default')
  })
})
