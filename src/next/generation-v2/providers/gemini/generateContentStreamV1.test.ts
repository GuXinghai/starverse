import { describe, expect, it } from 'vitest'
import {
  GeminiGenerateContentStreamAssemblerV1,
  GeminiGenerateContentStreamV1Error,
} from './generateContentStreamV1'

function chunk(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    responseId: 'response-1',
    modelVersion: 'gemini-3.5-flash-lite',
    candidates: [{ index: 0, content: { role: 'model', parts: [{ text: 'hello' }] } }],
    ...overrides,
  }
}

describe('GeminiGenerateContentStreamAssemblerV1 diagnostics', () => {
  it('preserves the conflicting chunk and sequence reason instead of dropping it', () => {
    const assembler = new GeminiGenerateContentStreamAssemblerV1()
    assembler.push(chunk())

    expect(() => assembler.push(chunk({ responseId: 'response-2' }))).toThrowError(
      expect.objectContaining({
        code: 'GENERATION_V2_GEMINI_STREAM_SEQUENCE_INVALID',
        diagnostic: expect.objectContaining({
          reason: 'response_id_changed',
          chunkIndex: 2,
          field: 'responseId',
          previousValue: 'response-1',
          currentValue: 'response-2',
          rawChunk: expect.objectContaining({ responseId: 'response-2' }),
        }),
      }),
    )
  })

  it('accepts cumulative usage metadata and keeps the latest snapshot', () => {
    const assembler = new GeminiGenerateContentStreamAssemblerV1()
    assembler.push(chunk({ usageMetadata: { promptTokenCount: 10, totalTokenCount: 10 } }))
    assembler.push(chunk({ usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 } }))
    assembler.push(chunk({
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
      candidates: [{ index: 0, finishReason: 'STOP' }],
    }))

    expect(assembler.finish().usageMetadata).toEqual({
      promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15,
    })
  })

  it('keeps the original error code for metadata that is not progressive', () => {
    const assembler = new GeminiGenerateContentStreamAssemblerV1()
    assembler.push(chunk({ promptFeedback: { blockReason: 'OTHER' } }))

    try {
      assembler.push(chunk({ promptFeedback: { blockReason: 'SAFETY' } }))
      throw new Error('expected sequence error')
    } catch (error) {
      expect(error).toBeInstanceOf(GeminiGenerateContentStreamV1Error)
      expect((error as GeminiGenerateContentStreamV1Error).code).toBe('GENERATION_V2_GEMINI_STREAM_SEQUENCE_INVALID')
      expect((error as GeminiGenerateContentStreamV1Error).diagnostic?.reason).toBe('prompt_feedback_duplicate')
    }
  })

  it('logs native content shape without retaining provider text', () => {
    const assembler = new GeminiGenerateContentStreamAssemblerV1()
    try {
      assembler.push(chunk({
        candidates: [{
          index: 0,
          content: { role: 'model', parts: [{ text: 'sensitive provider text', unexpected: true }] },
        }],
      }))
      throw new Error('expected native content error')
    } catch (error) {
      expect(error).toBeInstanceOf(GeminiGenerateContentStreamV1Error)
      const diagnostic = (error as GeminiGenerateContentStreamV1Error).diagnostic
      expect(diagnostic).toMatchObject({
        reason: 'native_content_invalid',
        chunkIndex: 1,
        field: 'candidates[0].content',
        rawChunk: null,
        currentValue: {
          role: 'model',
          partCount: 1,
          parts: [{
            index: 0,
            keys: ['text', 'unexpected'],
            textType: 'string',
            textLength: 23,
          }],
        },
      })
      expect(JSON.stringify(diagnostic)).not.toContain('sensitive provider text')
    }
  })

  it('preserves a provider signature-only text part without emitting visible text', () => {
    const assembler = new GeminiGenerateContentStreamAssemblerV1()
    assembler.push(chunk())
    const deltas = assembler.push(chunk({
      candidates: [{
        index: 0,
        content: {
          role: 'model',
          parts: [{ text: '', thoughtSignature: 'provider-signature' }],
        },
        finishReason: 'STOP',
      }],
    }))

    expect(deltas).toEqual([])
    expect(assembler.finish().assistantContent.parts).toEqual([
      { text: 'hello' },
      { text: '', thoughtSignature: 'provider-signature' },
    ])
  })
})
