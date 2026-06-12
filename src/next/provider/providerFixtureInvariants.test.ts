/**
 * Provider fixture invariant gate — cross-provider test suite.
 *
 * Captures recurring provider-runtime invariants across all fixture adapters:
 * - Terminal event semantics (exactly one terminal, no done after error)
 * - Unexpected EOF as protocol error
 * - No visible-text leakage from unsupported tool/function/reasoning fields
 * - No raw credential leakage in Generic errors/events
 *
 * This is a test/gate construction, not a production abstraction.
 * OpenRouter preservation checks remain separate in openRouterAdapter.test.ts.
 */

import { describe, expect, it, vi } from 'vitest'

// — Generic —
import { streamViaGeneric, streamViaGenericConfig, type GenericFetchFn } from '@/next/provider/generic/genericAdapter'
import { GENERIC_OPENAI_COMPAT_CHAT_COMPLETIONS_PROFILE_ID } from '@/next/provider/generic/genericEndpointDescriptor'
import { createBearerCredential } from '@/next/provider/credentials/providerCredential'
import { providerCredentialResolutionSuccess } from '@/next/provider/credentials/providerCredentialResolver'
import type { GenericEndpointConfig } from '@/next/provider/generic/genericEndpointConfig'

// — DeepSeek —
import { streamViaDeepSeek, type DeepSeekFetchFn } from '@/next/provider/deepseek/deepSeekAdapter'

// — OpenAI Responses —
import { streamViaOpenAIResponses, type ResponsesFetchFn } from '@/next/provider/openai-responses/openaiResponsesAdapter'

// — Anthropic —
import { streamViaAnthropic, type AnthropicFetchFn } from '@/next/provider/anthropic/anthropicAdapter'

// — Gemini —
import { streamViaGemini, type GeminiFetchFn } from '@/next/provider/gemini/geminiAdapter'

// — Shared —
import type { ProviderStreamRequest, StarverseStreamEvent } from '@/next/provider/providerTypes'

import {
  assertExactlyOneTerminalEvent,
  assertNoDoneAfterError,
  assertHappyPathTerminal,
  assertErrorPathTerminal,
  assertEofPathTerminal,
  assertTerminalErrorsValid,
  assertNoVisibleTextContains,
  assertReasoningNotInVisibleText,
  assertNoCredentialLeakage,
} from '@/next/provider/testUtils/providerFixtureInvariants'

// ===========================================================================
// Shared utilities
// ===========================================================================

async function collectEvents(gen: AsyncGenerator<StarverseStreamEvent>): Promise<StarverseStreamEvent[]> {
  const events: StarverseStreamEvent[] = []
  for await (const ev of gen) { events.push(ev) }
  return events
}

function sseFixture(...lines: string[]): string {
  return lines.join('\n') + '\n'
}

function makeResponseFromText(body: string): Response {
  const bytes = new TextEncoder().encode(body)
  let offset = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) { controller.close(); return }
      const next = bytes.slice(offset, offset + 50)
      offset += 50
      controller.enqueue(next)
    },
  })
  return new Response(stream as any, { status: 200 })
}

// ===========================================================================
// Generic fixtures
// ===========================================================================

function genericTextChunk(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content }, finish_reason: null }] })}`
}

function genericFinishChunk(finishReason: string): string {
  return `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: finishReason }] })}`
}

function genericErrorChunk(code: string, message: string): string {
  return `data: ${JSON.stringify({ error: { code, message } })}`
}

function genericToolCallChunk(): string {
  return `data: ${JSON.stringify({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { name: 'fn', arguments: '{}' } }] } }] })}`
}

function genericFunctionCallChunk(): string {
  return `data: ${JSON.stringify({ choices: [{ index: 0, delta: { function_call: { name: 'legacy_fn', arguments: '{}' } } }] })}`
}

function genericReasoningChunk(): string {
  return `data: ${JSON.stringify({ choices: [{ index: 0, delta: { reasoning_content: 'thinking...' } }] })}`
}

function genericSseWithDone(...lines: string[]): Response {
  return makeResponseFromText(sseFixture(...lines, '', 'data: [DONE]', ''))
}

function genericSseNoDone(...lines: string[]): Response {
  return makeResponseFromText(sseFixture(...lines))
}

function genericRequest(overrides?: Partial<ProviderStreamRequest['config']>): ProviderStreamRequest {
  return {
    requestId: 'req_1',
    assistantMessageId: 'assistant_1',
    userText: 'Hello',
    config: { model: 'gpt-4o-mini', requestedReasoningMode: 'auto', ...overrides },
  }
}

function mockGenericFetch(response: Response): GenericFetchFn {
  return vi.fn(async () => response)
}

const GENERIC_VALID_API_KEY = 'sk-test'

const VALID_GENERIC_CONFIG: GenericEndpointConfig = {
  endpointId: 'ep-test',
  profileId: GENERIC_OPENAI_COMPAT_CHAT_COMPLETIONS_PROFILE_ID,
  baseUrl: 'https://api.example.com/v1',
  model: 'gpt-4o-mini',
  credentialRef: { kind: 'credential_ref', id: 'default' },
}

// ===========================================================================
// DeepSeek fixtures
// ===========================================================================

function deepseekTextChunk(content: string): string {
  return `data: ${JSON.stringify({ id: 'g', model: 'm', choices: [{ index: 0, delta: { content }, finish_reason: null }] })}`
}

function deepseekReasoningChunk(content: string): string {
  return `data: ${JSON.stringify({ id: 'g', model: 'm', choices: [{ index: 0, delta: { reasoning_content: content }, finish_reason: null }] })}`
}

function deepseekFinishChunk(reason: string): string {
  return `data: ${JSON.stringify({ id: 'g', model: 'm', choices: [{ index: 0, delta: {}, finish_reason: reason }] })}`
}

function deepseekErrorChunk(code: string, message: string): string {
  return `data: ${JSON.stringify({ error: { code, message } })}`
}

function deepseekSseWithDone(...lines: string[]): Response {
  return makeResponseFromText(sseFixture(...lines, '', 'data: [DONE]', ''))
}

function deepseekSseNoDone(...lines: string[]): Response {
  return makeResponseFromText(sseFixture(...lines))
}

function deepseekRequest(): ProviderStreamRequest {
  return {
    requestId: 'req_1',
    assistantMessageId: 'assistant_1',
    userText: 'Hello',
    config: { model: 'deepseek-chat', requestedReasoningMode: 'auto' },
  }
}

function mockDeepSeekFetch(response: Response): DeepSeekFetchFn {
  return vi.fn(async () => response)
}

// ===========================================================================
// OpenAI Responses fixtures
// ===========================================================================

function openaiTextDelta(delta: string, seq = 1): string {
  return `event: response.output_text.delta\ndata: ${JSON.stringify({ type: 'response.output_text.delta', delta, item_id: 'i1', content_index: 0, output_index: 0, sequence_number: seq })}`
}

function openaiReasoningSummaryDelta(delta: string, seq = 1): string {
  return `event: response.reasoning_summary_text.delta\ndata: ${JSON.stringify({ type: 'response.reasoning_summary_text.delta', delta, item_id: 'i0', output_index: 0, summary_index: 0, sequence_number: seq })}`
}

function openaiReasoningTextDelta(delta: string, seq = 1): string {
  return `event: response.reasoning_text.delta\ndata: ${JSON.stringify({ type: 'response.reasoning_text.delta', delta, item_id: 'i0', content_index: 0, output_index: 0, sequence_number: seq })}`
}

function openaiReasoningItemDone(summaryText: string, seq = 1): string {
  return `event: response.output_item.done\ndata: ${JSON.stringify({
    type: 'response.output_item.done',
    item: {
      type: 'reasoning',
      id: 'rs_1',
      summary: [{ type: 'summary_text', text: summaryText }],
      encrypted_content: 'opaque_reasoning_ciphertext',
      status: 'completed',
    },
    sequence_number: seq,
  })}`
}

function openaiCompletedSse(response: Record<string, unknown>, seq = 10): string {
  return `event: response.completed\ndata: ${JSON.stringify({ type: 'response.completed', response, sequence_number: seq })}`
}

function openaiFailedSse(response: Record<string, unknown>, seq = 10): string {
  return `event: response.failed\ndata: ${JSON.stringify({ type: 'response.failed', response, sequence_number: seq })}`
}

function openaiErrorSse(error: Record<string, unknown>): string {
  return `event: error\ndata: ${JSON.stringify({ type: 'error', error, sequence_number: 0 })}`
}

function openaiSseWithDone(...lines: string[]): Response {
  return makeResponseFromText(sseFixture(...lines, '', 'data: [DONE]', ''))
}

function openaiSseNoDone(...lines: string[]): Response {
  return makeResponseFromText(sseFixture(...lines))
}

function openaiRequest(): ProviderStreamRequest {
  return {
    requestId: 'req_1',
    assistantMessageId: 'assistant_1',
    userText: 'Hello',
    config: { model: 'o3', requestedReasoningMode: 'auto' },
  }
}

function mockOpenAIFetch(response: Response): ResponsesFetchFn {
  return vi.fn(async () => response)
}

// ===========================================================================
// Anthropic fixtures
// ===========================================================================

function anthropicTextDelta(text: string, index = 1): string {
  return `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index, delta: { type: 'text_delta', text } })}`
}

function anthropicThinkingDelta(thinking: string, index = 0): string {
  return `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index, delta: { type: 'thinking_delta', thinking } })}`
}

function anthropicSignatureDelta(signature: string, index = 0): string {
  return `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index, delta: { type: 'signature_delta', signature } })}`
}

function anthropicInputJsonDelta(partialJson: string, index = 2): string {
  return `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: partialJson } })}`
}

function anthropicMessageStart(message: Record<string, unknown>): string {
  return `event: message_start\ndata: ${JSON.stringify({ type: 'message_start', message })}`
}

function anthropicMessageStop(): string {
  return `event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}`
}

function anthropicErrorSse(error: Record<string, unknown>): string {
  return `event: error\ndata: ${JSON.stringify({ type: 'error', error })}`
}

function anthropicSse(...lines: string[]): Response {
  return makeResponseFromText(sseFixture(...lines))
}

function anthropicRequest(): ProviderStreamRequest {
  return {
    requestId: 'req_1',
    assistantMessageId: 'assistant_1',
    userText: 'Hello',
    config: { model: 'claude-sonnet-4-5', requestedReasoningMode: 'auto' },
  }
}

function mockAnthropicFetch(response: Response): AnthropicFetchFn {
  return vi.fn(async () => response)
}

// ===========================================================================
// Gemini fixtures
// ===========================================================================

function geminiTextChunk(text: string): string {
  return `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }], role: 'model' } }] })}`
}

function geminiThoughtChunk(text: string): string {
  return `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text, thought: true }], role: 'model' } }] })}`
}

function geminiFunctionCallChunk(name: string): string {
  return `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name, args: {} } }], role: 'model' } }] })}`
}

function geminiFunctionResponseChunk(name: string): string {
  return `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ functionResponse: { name, response: { result: 'secret tool result' } } }], role: 'model' } }] })}`
}

function geminiFinishChunk(finishReason: string): string {
  return `data: ${JSON.stringify({ candidates: [{ content: { parts: [] }, finishReason }] })}`
}

function geminiErrorChunk(code: number, message: string): string {
  return `data: ${JSON.stringify({ error: { code, message } })}`
}

function geminiSse(...lines: string[]): Response {
  return makeResponseFromText(sseFixture(...lines))
}

function geminiRequest(): ProviderStreamRequest {
  return {
    requestId: 'req_1',
    assistantMessageId: 'assistant_1',
    userText: 'Hello',
    config: { model: 'gemini-2.5-pro', requestedReasoningMode: 'auto' },
  }
}

function mockGeminiFetch(response: Response): GeminiFetchFn {
  return vi.fn(async () => response)
}

// ===========================================================================
// Tests
// ===========================================================================

describe('provider fixture invariants', () => {
  describe('terminal helper guardrails', () => {
    function terminalErrorEvent(): StarverseStreamEvent {
      return {
        type: 'stream.error',
        terminal: true,
        error: {
          phase: 'stream',
          provider: 'test',
          category: 'protocol',
          message: 'boom',
        },
      }
    }

    it('rejects multiple terminal errors', () => {
      expect(() => assertErrorPathTerminal([terminalErrorEvent(), terminalErrorEvent()]))
        .toThrowError(/exactly one stream\.error/)
    })

    it('rejects stream.done after terminal error', () => {
      expect(() => assertErrorPathTerminal([terminalErrorEvent(), { type: 'stream.done' }]))
        .toThrowError(/only terminal outcome|stream\.done must not appear/)
    })

    it('rejects visible or accounting output after terminal error', () => {
      expect(() => assertErrorPathTerminal([
        terminalErrorEvent(),
        { type: 'message.text_delta', messageId: 'assistant_1', choiceIndex: 0, text: 'late text' },
      ])).toThrowError(/must not be followed by output event message\.text_delta/)

      expect(() => assertEofPathTerminal([
        terminalErrorEvent(),
        { type: 'usage.delta', usage: { output_tokens: 1 } },
      ])).toThrowError(/must not be followed by output event usage\.delta/)
    })
  })

  // =========================================================================
  // Generic OpenAI-compatible
  // =========================================================================

  describe('Generic', () => {
    describe('terminal invariants', () => {
      it('happy path: text + exactly one stream.done', async () => {
        const response = genericSseWithDone(genericTextChunk('Hi'), genericFinishChunk('stop'))
        const events = await collectEvents(streamViaGeneric(genericRequest(), {
          baseUrl: 'https://api.example.com/v1', apiKey: GENERIC_VALID_API_KEY, fetch: mockGenericFetch(response),
        }))
        assertHappyPathTerminal(events)
        assertExactlyOneTerminalEvent(events)
      })

      it('provider error: stream.error and no stream.done', async () => {
        const response = genericSseWithDone(genericErrorChunk('invalid_key', 'Bad key'))
        const events = await collectEvents(streamViaGeneric(genericRequest(), {
          baseUrl: 'https://api.example.com/v1', apiKey: 'sk-bad', fetch: mockGenericFetch(response),
        }))
        assertErrorPathTerminal(events)
        assertNoDoneAfterError(events)
        assertTerminalErrorsValid(events)
      })

      it('malformed JSON: parse error and no stream.done', async () => {
        const body = sseFixture('data: {invalid json}\n\n', 'data: [DONE]\n\n')
        const events = await collectEvents(streamViaGeneric(genericRequest(), {
          baseUrl: 'https://api.example.com/v1', apiKey: GENERIC_VALID_API_KEY, fetch: mockGenericFetch(makeResponseFromText(body)),
        }))
        assertErrorPathTerminal(events)
        assertNoDoneAfterError(events)
      })

      it('unexpected EOF: protocol error and no stream.done', async () => {
        const response = genericSseNoDone(genericTextChunk('some text'))
        const events = await collectEvents(streamViaGeneric(genericRequest(), {
          baseUrl: 'https://api.example.com/v1', apiKey: GENERIC_VALID_API_KEY, fetch: mockGenericFetch(response),
        }))
        assertEofPathTerminal(events)
        assertNoDoneAfterError(events)
      })
    })

    describe('content leakage invariants', () => {
      // This cross-provider gate samples recurring leakage shapes. It is not a
      // full provider semantic matrix; provider-local tests keep exhaustive
      // mapper/request coverage.
      it('tool_calls do not become visible text', async () => {
        const response = genericSseWithDone(genericToolCallChunk(), genericFinishChunk('stop'))
        const events = await collectEvents(streamViaGeneric(genericRequest(), {
          baseUrl: 'https://api.example.com/v1', apiKey: GENERIC_VALID_API_KEY, fetch: mockGenericFetch(response),
        }))
        assertNoVisibleTextContains(events, ['tool_calls', 'function'])
      })

      it('legacy function_call does not become visible text', async () => {
        const response = genericSseWithDone(genericFunctionCallChunk(), genericFinishChunk('function_call'))
        const events = await collectEvents(streamViaGeneric(genericRequest(), {
          baseUrl: 'https://api.example.com/v1', apiKey: GENERIC_VALID_API_KEY, fetch: mockGenericFetch(response),
        }))
        assertNoVisibleTextContains(events, ['legacy_fn', 'function_call'])
      })

      it('reasoning_content does not become visible text', async () => {
        const response = genericSseWithDone(genericReasoningChunk(), genericFinishChunk('stop'))
        const events = await collectEvents(streamViaGeneric(genericRequest(), {
          baseUrl: 'https://api.example.com/v1', apiKey: GENERIC_VALID_API_KEY, fetch: mockGenericFetch(response),
        }))
        assertNoVisibleTextContains(events, ['thinking...'])
      })
    })

    describe('credential leakage invariants', () => {
      const SECRET = 'sk-super-secret-token-12345'

      it('error path does not leak raw token', async () => {
        const response = genericSseWithDone(genericErrorChunk('error', `Invalid: ${SECRET}`))
        const events = await collectEvents(streamViaGeneric(genericRequest(), {
          baseUrl: 'https://api.example.com/v1', apiKey: SECRET, fetch: mockGenericFetch(response),
        }))
        assertNoCredentialLeakage(events, SECRET)
      })

      it('descriptor validation failure does not leak raw token', async () => {
        const events = await collectEvents(streamViaGeneric(genericRequest(), {
          baseUrl: '', apiKey: SECRET, fetch: mockGenericFetch(genericSseWithDone(genericTextChunk('Hi'))),
        }))
        assertNoCredentialLeakage(events, SECRET)
      })

      it('config-based failure does not leak raw token', async () => {
        const events = await collectEvents(streamViaGenericConfig(
          genericRequest(),
          { ...VALID_GENERIC_CONFIG, baseUrl: '' },
          () => providerCredentialResolutionSuccess(createBearerCredential(SECRET)),
          mockGenericFetch(genericSseWithDone(genericTextChunk('Hi'))),
        ))
        assertNoCredentialLeakage(events, SECRET)
      })
    })
  })

  // =========================================================================
  // DeepSeek
  // =========================================================================

  describe('DeepSeek', () => {
    describe('terminal invariants', () => {
      it('happy path: text + exactly one stream.done', async () => {
        const response = deepseekSseWithDone(deepseekTextChunk('Hi'), deepseekFinishChunk('stop'))
        const events = await collectEvents(streamViaDeepSeek(deepseekRequest(), {
          baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-test', fetch: mockDeepSeekFetch(response),
        }))
        assertHappyPathTerminal(events)
        assertExactlyOneTerminalEvent(events)
      })

      it('provider error: stream.error and no stream.done', async () => {
        const response = deepseekSseWithDone(deepseekErrorChunk('auth_error', 'Bad key'))
        const events = await collectEvents(streamViaDeepSeek(deepseekRequest(), {
          baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-bad', fetch: mockDeepSeekFetch(response),
        }))
        assertErrorPathTerminal(events)
        assertNoDoneAfterError(events)
        assertTerminalErrorsValid(events)
      })

      it('unexpected EOF: protocol error and no stream.done', async () => {
        const response = deepseekSseNoDone(deepseekTextChunk('some text'))
        const events = await collectEvents(streamViaDeepSeek(deepseekRequest(), {
          baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-test', fetch: mockDeepSeekFetch(response),
        }))
        assertEofPathTerminal(events)
        assertNoDoneAfterError(events)
      })
    })

    describe('content leakage invariants', () => {
      it('reasoning_content does not become visible text', async () => {
        const response = deepseekSseWithDone(
          deepseekReasoningChunk('Let me think...'),
          deepseekTextChunk('The answer'),
          deepseekFinishChunk('stop'),
        )
        const events = await collectEvents(streamViaDeepSeek(deepseekRequest(), {
          baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-test', fetch: mockDeepSeekFetch(response),
        }))
        assertNoVisibleTextContains(events, ['Let me think...'])
        assertReasoningNotInVisibleText(events)
      })
    })
  })

  // =========================================================================
  // OpenAI Responses
  // =========================================================================

  describe('OpenAI Responses', () => {
    describe('terminal invariants', () => {
      it('happy path: text + exactly one stream.done', async () => {
        const response = openaiSseWithDone(
          openaiTextDelta('Hi'),
          openaiCompletedSse({ id: 'r', status: 'completed', output: [] }),
        )
        const events = await collectEvents(streamViaOpenAIResponses(openaiRequest(), {
          baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-test', fetch: mockOpenAIFetch(response),
        }))
        assertHappyPathTerminal(events)
        assertExactlyOneTerminalEvent(events)
      })

      it('provider error: stream.error and no stream.done', async () => {
        const response = openaiSseWithDone(openaiErrorSse({ type: 'error', code: 'auth_error', message: 'Bad key' }))
        const events = await collectEvents(streamViaOpenAIResponses(openaiRequest(), {
          baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-bad', fetch: mockOpenAIFetch(response),
        }))
        assertErrorPathTerminal(events)
        assertNoDoneAfterError(events)
        assertTerminalErrorsValid(events)
      })

      it('response.failed: stream.error and no stream.done', async () => {
        const response = openaiSseWithDone(
          openaiFailedSse({ id: 'r', status: 'failed', error: { type: 'error', code: 'server_error', message: 'fail' } }),
        )
        const events = await collectEvents(streamViaOpenAIResponses(openaiRequest(), {
          baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-test', fetch: mockOpenAIFetch(response),
        }))
        assertErrorPathTerminal(events)
        assertNoDoneAfterError(events)
      })

      it('unexpected EOF: protocol error and no stream.done', async () => {
        const response = openaiSseNoDone(openaiTextDelta('some text'))
        const events = await collectEvents(streamViaOpenAIResponses(openaiRequest(), {
          baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-test', fetch: mockOpenAIFetch(response),
        }))
        assertEofPathTerminal(events)
        assertNoDoneAfterError(events)
      })
    })

    describe('content leakage invariants', () => {
      it('reasoning summary delta does not become visible text', async () => {
        const response = openaiSseWithDone(
          openaiReasoningSummaryDelta('Let me reason...'),
          openaiTextDelta('The answer'),
          openaiCompletedSse({ id: 'r', status: 'completed', output: [] }),
        )
        const events = await collectEvents(streamViaOpenAIResponses(openaiRequest(), {
          baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-test', fetch: mockOpenAIFetch(response),
        }))
        assertNoVisibleTextContains(events, ['Let me reason...'])
      })

      it('reasoning_text delta does not become visible text', async () => {
        const response = openaiSseWithDone(
          openaiReasoningTextDelta('Private reasoning text'),
          openaiTextDelta('The answer'),
          openaiCompletedSse({ id: 'r', status: 'completed', output: [] }),
        )
        const events = await collectEvents(streamViaOpenAIResponses(openaiRequest(), {
          baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-test', fetch: mockOpenAIFetch(response),
        }))
        assertNoVisibleTextContains(events, ['Private reasoning text'])
        assertReasoningNotInVisibleText(events)
      })

      it('reasoning output item does not become visible text', async () => {
        const response = openaiSseWithDone(
          openaiReasoningItemDone('Hidden item summary'),
          openaiTextDelta('The answer'),
          openaiCompletedSse({ id: 'r', status: 'completed', output: [] }),
        )
        const events = await collectEvents(streamViaOpenAIResponses(openaiRequest(), {
          baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-test', fetch: mockOpenAIFetch(response),
        }))
        assertNoVisibleTextContains(events, ['Hidden item summary', 'opaque_reasoning_ciphertext'])
      })
    })
  })

  // =========================================================================
  // Anthropic
  // =========================================================================

  describe('Anthropic', () => {
    describe('terminal invariants', () => {
      it('happy path: text + exactly one stream.done', async () => {
        const response = anthropicSse(
          anthropicMessageStart({ id: 'msg_1', model: 'claude-sonnet-4-5', usage: { input_tokens: 10, output_tokens: 0 } }),
          anthropicTextDelta('Hi'),
          anthropicMessageStop(),
        )
        const events = await collectEvents(streamViaAnthropic(anthropicRequest(), {
          baseUrl: 'https://api.anthropic.com/v1', apiKey: 'sk-ant-test', fetch: mockAnthropicFetch(response),
        }))
        assertHappyPathTerminal(events)
        assertExactlyOneTerminalEvent(events)
      })

      it('provider error: stream.error and no stream.done', async () => {
        const response = anthropicSse(anthropicErrorSse({ type: 'error', error: { type: 'authentication_error', message: 'Bad key' } }))
        const events = await collectEvents(streamViaAnthropic(anthropicRequest(), {
          baseUrl: 'https://api.anthropic.com/v1', apiKey: 'sk-bad', fetch: mockAnthropicFetch(response),
        }))
        assertErrorPathTerminal(events)
        assertNoDoneAfterError(events)
        assertTerminalErrorsValid(events)
      })

      it('unexpected EOF: protocol error and no stream.done', async () => {
        const response = anthropicSse(
          anthropicMessageStart({ id: 'msg_1', model: 'claude-sonnet-4-5', usage: { input_tokens: 10, output_tokens: 0 } }),
          anthropicTextDelta('some text'),
          // no message_stop
        )
        const events = await collectEvents(streamViaAnthropic(anthropicRequest(), {
          baseUrl: 'https://api.anthropic.com/v1', apiKey: 'sk-ant-test', fetch: mockAnthropicFetch(response),
        }))
        assertEofPathTerminal(events)
        assertNoDoneAfterError(events)
      })
    })

    describe('content leakage invariants', () => {
      it('thinking delta does not become visible text', async () => {
        const response = anthropicSse(
          anthropicMessageStart({ id: 'msg_1', model: 'claude-sonnet-4-5', usage: { input_tokens: 10, output_tokens: 0 } }),
          anthropicThinkingDelta('Internal reasoning...'),
          anthropicTextDelta('The answer'),
          anthropicMessageStop(),
        )
        const events = await collectEvents(streamViaAnthropic(anthropicRequest(), {
          baseUrl: 'https://api.anthropic.com/v1', apiKey: 'sk-ant-test', fetch: mockAnthropicFetch(response),
        }))
        assertNoVisibleTextContains(events, ['Internal reasoning...'])
      })

      it('signature delta does not become visible text', async () => {
        const response = anthropicSse(
          anthropicMessageStart({ id: 'msg_1', model: 'claude-sonnet-4-5', usage: { input_tokens: 10, output_tokens: 0 } }),
          anthropicThinkingDelta('thinking...'),
          anthropicSignatureDelta('sig_abc123'),
          anthropicTextDelta('Answer'),
          anthropicMessageStop(),
        )
        const events = await collectEvents(streamViaAnthropic(anthropicRequest(), {
          baseUrl: 'https://api.anthropic.com/v1', apiKey: 'sk-ant-test', fetch: mockAnthropicFetch(response),
        }))
        assertNoVisibleTextContains(events, ['sig_abc123', 'thinking...'])
      })

      it('input_json_delta does not become visible text', async () => {
        const response = anthropicSse(
          anthropicMessageStart({ id: 'msg_1', model: 'claude-sonnet-4-5', usage: { input_tokens: 10, output_tokens: 0 } }),
          anthropicInputJsonDelta('{"city":'),
          anthropicInputJsonDelta('"NYC"}'),
          anthropicMessageStop(),
        )
        const events = await collectEvents(streamViaAnthropic(anthropicRequest(), {
          baseUrl: 'https://api.anthropic.com/v1', apiKey: 'sk-ant-test', fetch: mockAnthropicFetch(response),
        }))
        assertNoVisibleTextContains(events, ['"city"', 'NYC'])
      })
    })
  })

  // =========================================================================
  // Gemini
  // =========================================================================

  describe('Gemini', () => {
    describe('terminal invariants', () => {
      it('happy path: text + exactly one stream.done', async () => {
        const response = geminiSse(geminiTextChunk('Hi'), geminiFinishChunk('STOP'))
        const events = await collectEvents(streamViaGemini(geminiRequest(), {
          baseUrl: 'https://generativelanguage.googleapis.com', apiKey: 'test-key', fetch: mockGeminiFetch(response),
        }))
        assertHappyPathTerminal(events)
        assertExactlyOneTerminalEvent(events)
      })

      it('provider error: stream.error and no stream.done', async () => {
        const response = geminiSse(geminiErrorChunk(401, 'Unauthorized'))
        const events = await collectEvents(streamViaGemini(geminiRequest(), {
          baseUrl: 'https://generativelanguage.googleapis.com', apiKey: 'bad-key', fetch: mockGeminiFetch(response),
        }))
        assertErrorPathTerminal(events)
        assertNoDoneAfterError(events)
        assertTerminalErrorsValid(events)
      })

      it('unexpected EOF: protocol error and no stream.done', async () => {
        const response = geminiSse(geminiTextChunk('some text'))
        // No finish chunk
        const events = await collectEvents(streamViaGemini(geminiRequest(), {
          baseUrl: 'https://generativelanguage.googleapis.com', apiKey: 'test-key', fetch: mockGeminiFetch(response),
        }))
        assertEofPathTerminal(events)
        assertNoDoneAfterError(events)
      })
    })

    describe('content leakage invariants', () => {
      it('thought part does not become visible text', async () => {
        const response = geminiSse(geminiThoughtChunk('Internal thought'), geminiTextChunk('Answer'), geminiFinishChunk('STOP'))
        const events = await collectEvents(streamViaGemini(geminiRequest(), {
          baseUrl: 'https://generativelanguage.googleapis.com', apiKey: 'test-key', fetch: mockGeminiFetch(response),
        }))
        assertNoVisibleTextContains(events, ['Internal thought'])
      })

      it('functionCall does not become visible text', async () => {
        const response = geminiSse(geminiFunctionCallChunk('search'), geminiFinishChunk('STOP'))
        const events = await collectEvents(streamViaGemini(geminiRequest(), {
          baseUrl: 'https://generativelanguage.googleapis.com', apiKey: 'test-key', fetch: mockGeminiFetch(response),
        }))
        assertNoVisibleTextContains(events, ['search', 'functionCall'])
      })

      it('functionResponse does not become visible text', async () => {
        const response = geminiSse(geminiFunctionResponseChunk('get_weather'), geminiFinishChunk('STOP'))
        const events = await collectEvents(streamViaGemini(geminiRequest(), {
          baseUrl: 'https://generativelanguage.googleapis.com', apiKey: 'test-key', fetch: mockGeminiFetch(response),
        }))
        assertNoVisibleTextContains(events, ['get_weather', 'secret tool result', 'functionResponse'])
      })
    })
  })
})
