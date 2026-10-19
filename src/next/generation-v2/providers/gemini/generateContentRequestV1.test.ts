import { describe, expect, it } from 'vitest'
import { compileGeminiGenerateContentRequestV1 } from '../../../../core/generation-v2/providers/gemini/generateContentRequestV1'

const contents = [{ role: 'user', parts: [{ text: 'Return OK.' }] }]
function build(reasoning: unknown) { return compileGeminiGenerateContentRequestV1({ clientContents: contents, reasoning }).nativeRequest.generationConfig.thinkingConfig }
describe('GenerateContent thinking native encoding', () => {
  it.each([-1, 0, 512, 24576])('preserves Budget %s literally without also emitting Level', thinkingBudget => {
    expect(build({ mode: thinkingBudget === 0 ? 'disabled' : 'enabled', thinkingBudget, includeThoughts: false })).toEqual({ thinkingBudget, includeThoughts: false })
  })
  it('distinguishes omitted provider default from dynamic and keeps summaries independent', () => {
    expect(build({ mode: 'enabled' })).toBeUndefined()
    expect(build({ mode: 'enabled', thinkingLevel: 'minimal' })).toEqual({ thinkingLevel: 'minimal' })
    expect(build({ mode: 'disabled', includeThoughts: false })).toEqual({ includeThoughts: false })
    expect(() => build({ mode: 'enabled', thinkingLevel: 'high', thinkingBudget: 8192 })).toThrow()
    expect(() => build({ mode: 'disabled', thinkingBudget: 128 })).toThrow()
  })
})
