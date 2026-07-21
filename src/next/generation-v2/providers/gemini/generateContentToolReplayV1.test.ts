import { describe, expect, it } from 'vitest'
import { compileGeminiGenerateContentRequestV1 } from './generateContentRequestV1'
import { GeminiGenerateContentStreamAssemblerV1 } from './generateContentStreamV1'

describe('Gemini GenerateContent native tool replay V1', () => {
  it('preserves functionCall thoughtSignature and emits the ordinal-matched functionResponse', () => {
    const assembler = new GeminiGenerateContentStreamAssemblerV1()
    assembler.push({ candidates: [{ index: 0, content: { role: 'model', parts: [
      { text: 'thinking', thought: true, thoughtSignature: 'sig-thought' },
      { functionCall: { name: 'weather', args: { city: 'Shanghai' } }, thoughtSignature: 'sig-call' },
    ] }, finishReason: 'STOP' }] })
    const result = assembler.finish()
    const compiled = compileGeminiGenerateContentRequestV1({ replayContents: [
      { role: 'user', parts: [{ text: 'weather?' }] },
      result.assistantContent,
      { role: 'user', parts: [{ functionResponse: { name: 'weather', response: { temperature: 25 } } }] },
    ], reasoning: { mode: 'enabled', thinkingLevel: 'minimal', includeThoughts: true },
    tools: [{ name: 'weather', parameters: { type: 'object' } }], toolChoice: { mode: 'auto' }, webSearch: true })
    expect(compiled.nativeRequest.contents[1]).toEqual(result.assistantContent)
    expect(compiled.nativeRequest.contents[2]).toEqual({ role: 'user', parts: [
      { functionResponse: { name: 'weather', response: { temperature: 25 } } },
    ] })
    expect(compiled.nativeRequest.generationConfig.thinkingConfig).toEqual({
      thinkingLevel: 'minimal', includeThoughts: true,
    })
    expect(compiled.nativeRequest.tools).toEqual([
      { functionDeclarations: [{ name: 'weather', parameters: { type: 'object' } }] },
      { googleSearch: {} },
    ])
  })
})
