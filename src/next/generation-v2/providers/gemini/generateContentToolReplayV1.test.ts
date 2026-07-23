import { describe, expect, it } from 'vitest'
import { compileGeminiGenerateContentRequestV1 } from './generateContentRequestV1'
import { GeminiGenerateContentStreamAssemblerV1 } from './generateContentStreamV1'

describe('Gemini GenerateContent native tool replay V1', () => {
  it('encodes inline image/PDF parts and Gemini 2.5 thinkingBudget without switching protocols', () => {
    const compiled = compileGeminiGenerateContentRequestV1({
      clientContents: [{ role: 'user', parts: [
        { text: 'inspect these' },
        { inlineData: { mimeType: 'image/png', data: 'aW1hZ2U=' } },
        { inlineData: { mimeType: 'application/pdf', data: 'cGRm' } },
        { inlineData: { mimeType: 'audio/mpeg', data: 'YXVkaW8=' } },
        { inlineData: { mimeType: 'video/mp4', data: 'dmlkZW8=' } },
      ] }],
      reasoning: { mode: 'enabled', thinkingBudget: 1024, includeThoughts: true },
    })
    expect(compiled.nativeRequest.contents[0]).toEqual({ role: 'user', parts: [
      { text: 'inspect these' },
      { inlineData: { mimeType: 'image/png', data: 'aW1hZ2U=' } },
      { inlineData: { mimeType: 'application/pdf', data: 'cGRm' } },
      { inlineData: { mimeType: 'audio/mpeg', data: 'YXVkaW8=' } },
      { inlineData: { mimeType: 'video/mp4', data: 'dmlkZW8=' } },
    ] })
    expect(compiled.nativeRequest.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 1024, includeThoughts: true })
  })

  it('preserves Files API fileData in the exact native replay', () => {
    const compiled = compileGeminiGenerateContentRequestV1({ replayContents: [{ role: 'user', parts: [
      { text: 'read the file' }, { fileData: { mimeType: 'audio/mpeg', fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/file-1' } },
    ] }] })
    expect(compiled.nativeRequest.contents[0].parts[1]).toEqual({ fileData: {
      mimeType: 'audio/mpeg', fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/file-1',
    } })
  })

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
