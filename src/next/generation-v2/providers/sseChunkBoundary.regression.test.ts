import { describe, expect, it } from 'vitest'
import { GenericLocalOpenAIChatSseDecoderV1 } from '../../../core/generation-v2/providers/generic-local-openai-chat/chatStreamV1'
import { GeminiGenerateContentSseDecoderV1 } from '../../../core/generation-v2/providers/gemini/generateContentStreamV1'
import { OpenAIResponsesTypedSseDecoderV1 } from '../../../core/generation-v2/providers/openai-responses/responsesStreamV1'
import { OpenRouterChatSseDecoderV1 } from '../../../core/generation-v2/providers/openrouter/chatStreamV1'
import { OpenRouterImageSseDecoderV1 } from '../../../core/generation-v2/providers/openrouter-images/imageStreamV1'
import { SseLineEndingNormalizerV1 } from '../../../core/generation-v2/providers/sseLineEndingsV1'

type Decoder = { push(bytes: Uint8Array): readonly unknown[]; finish(): readonly unknown[] }

const encoder = new TextEncoder()

// A CRLF-framed stream whose JSON payload spans two `data:` lines. A server is
// free to deliver the bytes in any chunking, including one that ends between
// the CR and LF of a line terminator.
function crlfStream(prefixLines: readonly string[], json: string): string {
  const cut = json.indexOf(',')
  return [...prefixLines, `data: ${json.slice(0, cut + 1)}`, `data: ${json.slice(cut + 1)}`, '', ''].join('\r\n')
}

function decode(create: () => Decoder, chunks: readonly string[]): unknown {
  const decoder = create()
  try {
    const events = chunks.flatMap(chunk => [...decoder.push(encoder.encode(chunk))])
    return [...events, ...decoder.finish()]
  } catch (error) {
    return { error: error instanceof Error ? (error as { code?: string }).code ?? error.message : String(error) }
  }
}

function splitAfterFirstCr(stream: string): readonly string[] {
  const index = stream.indexOf('\r') + 1
  return [stream.slice(0, index), stream.slice(index)]
}

const cases: ReadonlyArray<{ name: string; create: () => Decoder; stream: string }> = [
  {
    name: 'OpenRouter chat',
    create: () => new OpenRouterChatSseDecoderV1(),
    stream: crlfStream([], '{"id":"gen-1","choices":[]}') + 'data: [DONE]\r\n\r\n',
  },
  {
    name: 'Gemini GenerateContent',
    create: () => new GeminiGenerateContentSseDecoderV1(),
    stream: crlfStream([], '{"responseId":"r1","candidates":[]}'),
  },
  {
    name: 'generic local OpenAI chat',
    create: () => new GenericLocalOpenAIChatSseDecoderV1(),
    stream: crlfStream([], '{"id":"c1","choices":[]}') + 'data: [DONE]\r\n\r\n',
  },
  {
    name: 'OpenAI Responses',
    create: () => new OpenAIResponsesTypedSseDecoderV1(),
    stream: crlfStream(['event: response.in_progress'], '{"type":"response.in_progress","sequence_number":0}'),
  },
]

describe('SSE decoders: chunk boundaries inside CRLF', () => {
  for (const testCase of cases) {
    it(`${testCase.name} decodes the unsplit fixture`, () => {
      expect(decode(testCase.create, [testCase.stream])).not.toHaveProperty('error')
    })

    // P4a-05: CRLF was normalised per chunk, so a chunk ending in CR followed by
    // one starting with LF yielded an extra line break.
    it(`P4a-05: ${testCase.name} decodes identically when a chunk ends between CR and LF`, () => {
      expect(decode(testCase.create, splitAfterFirstCr(testCase.stream)))
        .toEqual(decode(testCase.create, [testCase.stream]))
    })

    it(`P4a-05: ${testCase.name} decodes identically for every two-chunk split`, () => {
      const whole = decode(testCase.create, [testCase.stream])
      for (let index = 1; index < testCase.stream.length; index += 1) {
        expect(decode(testCase.create, [testCase.stream.slice(0, index), testCase.stream.slice(index)])).toEqual(whole)
      }
    })
  }
})

describe('SSE line endings and comments', () => {
  it('P4a-05: the shared normalizer keeps a split CRLF as one line break and flushes a final CR', () => {
    const lines = new SseLineEndingNormalizerV1()
    expect(lines.push('a\r') + lines.push('\nb\r\r') + lines.push('c') + lines.finish('\r')).toBe('a\nb\n\nc\n')
  })

  it('P4a-16: OpenAI Responses keeps the data of a frame that starts with a comment line', () => {
    const frame = 'event: response.in_progress\ndata: {"type":"response.in_progress","sequence_number":0}\n\n'
    const commented = decode(() => new OpenAIResponsesTypedSseDecoderV1(), [`: note\n${frame}`])
    expect(commented).toEqual(decode(() => new OpenAIResponsesTypedSseDecoderV1(), [frame]))
    expect(commented).toHaveLength(1)
  })

  it('P4a-09: OpenRouter Images ignores keepalive comment lines and comment-only frames', () => {
    expect(decode(() => new OpenRouterImageSseDecoderV1(), [': keepalive\n\n', 'data: [DONE]\n\n']))
      .toEqual([{ type: 'done' }])
  })
})
