import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { stableSerializeProviderRequestV2 } from '../../src/next/generation-v2/compiler/stableSerialize'
import { createOpenRouterNativeHistoryArtifactV1 } from '../../src/next/generation-v2/providers/openrouter/nativeMessagesV1'
import { createOpenRouterChatTerminalArtifactV1 } from '../../src/next/generation-v2/providers/openrouter/terminalArtifactV1'
import { hasPersistedOpenRouterAwaitingToolStateV2 } from './generationOrphanRecoveryV2'
import { createDeepSeekNativeHistoryArtifactV2 } from '../../src/next/generation-v2/providers/deepseek/nativeMessagesV1'
import { hasPersistedDeepSeekAwaitingToolStateV2 } from './generationOrphanRecoveryV2'
import { createAnthropicNativeHistoryArtifactV1 } from '../../src/next/generation-v2/providers/anthropic/nativeContentBlocksV1'
import { hasPersistedAnthropicAwaitingToolStateV2 } from './generationOrphanRecoveryV2'
import {
  completeOpenAIResponsesRequestV2,
  hasPendingOpenAIResponsesFunctionCallsV2,
} from '../../src/next/generation-v2/providers/openai-responses/continuationArtifactV2'

function rowWithAssistant(assistant: Readonly<Record<string, unknown>>) {
  const artifact = createOpenRouterNativeHistoryArtifactV1({
    lineageDepth: 1,
    parentArtifactHash: null,
    orderedMessages: [
      { role: 'user', content: 'weather' },
      assistant,
    ],
  })
  const terminal = createOpenRouterChatTerminalArtifactV1({
    assistantMessage: assistant,
    responseId: 'response:1', model: 'test-model', provider: 'test-provider',
    finishReason: 'provider_specific_value', usage: null,
  })
  return {
    requestState: 'completed',
    answerStatus: 'streaming',
    terminalJson: JSON.stringify(terminal),
    terminalHash: terminal.artifactHash,
    artifactJson: JSON.stringify(artifact),
    artifactHash: artifact.artifactHash,
  }
}

describe('generationOrphanRecoveryV2 OpenRouter awaiting-tool authority', () => {
  it('uses complete native tool calls without consulting finish reason', () => {
    const row = rowWithAssistant({
      role: 'assistant',
      content: null,
      tool_calls: [{
        id: 'call:weather',
        type: 'function',
        function: { name: 'weather', arguments: '{"city":"Shanghai"}' },
      }],
    })
    expect(hasPersistedOpenRouterAwaitingToolStateV2({ ...row, finishReason: 'stop' })).toBe(true)
    expect(hasPersistedOpenRouterAwaitingToolStateV2({ ...row, finishReason: 'provider_specific_value' })).toBe(true)
  })

  it('does not accept finish reason without native tool calls', () => {
    expect(hasPersistedOpenRouterAwaitingToolStateV2({
      ...rowWithAssistant({ role: 'assistant', content: 'done' }),
      finishReason: 'tool_calls',
    })).toBe(false)
  })

  it('rejects incomplete or tampered native tool artifacts', () => {
    expect(hasPersistedOpenRouterAwaitingToolStateV2(rowWithAssistant({
      role: 'assistant',
      content: null,
      tool_calls: [{ type: 'function', function: { name: '', arguments: '{}' } }],
    }))).toBe(false)
    const valid = rowWithAssistant({
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'call:1', type: 'function', function: { name: 'tool', arguments: '{}' } }],
    })
    expect(hasPersistedOpenRouterAwaitingToolStateV2({ ...valid, artifactHash: '0'.repeat(64) })).toBe(false)
  })
})

describe('generationOrphanRecoveryV2 DeepSeek awaiting-tool authority', () => {
  function rowWithAssistant(
    message: Readonly<Record<string, unknown>>,
    terminalMessage: Readonly<Record<string, unknown>> = message,
  ) {
    const artifact = createDeepSeekNativeHistoryArtifactV2({
      lineageDepth: 1,
      parentArtifactHash: null,
      orderedEntries: [
        { kind: 'client', message: { role: 'user', content: 'weather' } },
        { kind: 'assistant', generatedWithThinking: 'disabled', message },
      ],
    })
    const terminalUnsigned = {
      artifactKind: 'deepseek_stable_terminal_result_v1',
      artifactCodecVersion: 1,
      assistantMessage: terminalMessage,
      generatedWithThinking: 'disabled',
      finishReason: 'tool_calls',
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      responseMetadata: { id: 'response:1', model: 'test-model', created: 1, systemFingerprint: 'fp:test' },
    }
    const terminal = {
      ...terminalUnsigned,
      artifactHash: createHash('sha256').update(stableSerializeProviderRequestV2(terminalUnsigned), 'utf8').digest('hex'),
    }
    return {
      requestState: 'completed',
      answerStatus: 'streaming',
      terminalJson: JSON.stringify(terminal),
      terminalHash: terminal.artifactHash,
      artifactJson: JSON.stringify(artifact),
      artifactHash: artifact.artifactHash,
    }
  }

  it('uses decoded native calls rather than finish reason', () => {
    const row = rowWithAssistant({
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'call:weather', type: 'function', function: { name: 'weather', arguments: '{}' } }],
    })
    expect(hasPersistedDeepSeekAwaitingToolStateV2({ ...row, finishReason: 'stop' })).toBe(true)
    expect(hasPersistedDeepSeekAwaitingToolStateV2({ ...row, finishReason: 'tool_calls' })).toBe(true)
  })

  it('does not accept terminal metadata without persisted native calls', () => {
    expect(hasPersistedDeepSeekAwaitingToolStateV2({
      ...rowWithAssistant({ role: 'assistant', content: 'done' }),
      finishReason: 'tool_calls',
    })).toBe(false)
  })

  it('rejects a tampered terminal artifact', () => {
    const row = rowWithAssistant({
      role: 'assistant', content: null,
      tool_calls: [{ id: 'call:weather', type: 'function', function: { name: 'weather', arguments: '{}' } }],
    })
    expect(hasPersistedDeepSeekAwaitingToolStateV2({ ...row, terminalHash: '0'.repeat(64) })).toBe(false)
  })

  it('rejects independently valid terminal and history artifacts that disagree', () => {
    const historyMessage = {
      role: 'assistant', content: null,
      tool_calls: [{ id: 'call:weather', type: 'function', function: { name: 'weather', arguments: '{}' } }],
    }
    expect(hasPersistedDeepSeekAwaitingToolStateV2(rowWithAssistant(
      historyMessage,
      { ...historyMessage, tool_calls: [{ id: 'call:other', type: 'function', function: { name: 'other', arguments: '{}' } }] },
    ))).toBe(false)
  })
})

describe('generationOrphanRecoveryV2 Anthropic awaiting-tool authority', () => {
  const usage = {
    input_tokens: 1,
    output_tokens: 1,
    cache_creation: null,
    cache_creation_input_tokens: null,
    cache_read_input_tokens: null,
    inference_geo: null,
    output_tokens_details: null,
    server_tool_use: null,
    service_tier: 'standard',
  }

  it('requires a decoded tool_use block and matching provider terminal contract', () => {
    const artifact = createAnthropicNativeHistoryArtifactV1({
      providerKey: 'anthropic',
      sourceApi: 'anthropic_messages',
      snapshotKey: 'assistant',
      role: 'assistant',
      status: 'final',
      content: [{ type: 'tool_use', id: 'toolu:1', name: 'weather', input: {}, caller: { type: 'direct' } }],
      model: 'claude-test',
      stopReason: 'tool_use',
      stopSequence: null,
      usage,
    })
    expect(hasPersistedAnthropicAwaitingToolStateV2({
      requestState: 'completed',
      answerStatus: 'streaming',
      artifactJson: JSON.stringify(artifact),
      artifactHash: artifact.artifactHash,
    })).toBe(true)
  })

  it('does not infer awaiting from non-tool native content', () => {
    const artifact = createAnthropicNativeHistoryArtifactV1({
      providerKey: 'anthropic',
      sourceApi: 'anthropic_messages',
      snapshotKey: 'assistant',
      role: 'assistant',
      status: 'final',
      content: [{ type: 'text', text: 'done', citations: null }],
      model: 'claude-test',
      stopReason: 'end_turn',
      stopSequence: null,
      usage,
    })
    expect(hasPersistedAnthropicAwaitingToolStateV2({
      requestState: 'completed',
      answerStatus: 'streaming',
      artifactJson: JSON.stringify(artifact),
      artifactHash: artifact.artifactHash,
      stopReason: 'tool_use',
    })).toBe(false)
  })
})

describe('generationOrphanRecoveryV2 OpenAI Responses awaiting-tool authority', () => {
  it('derives pending state from unmatched decoded native function calls', () => {
    const pending = completeOpenAIResponsesRequestV2({
      priorArtifact: null,
      lineageDepth: 1,
      clientItems: [{ role: 'user', content: [{ type: 'input_text', text: 'weather' }] }],
      returnedItems: [{ type: 'function_call', call_id: 'call:1', name: 'weather', arguments: '{}' }],
    })
    expect(hasPendingOpenAIResponsesFunctionCallsV2(pending)).toBe(true)

    const completed = completeOpenAIResponsesRequestV2({
      priorArtifact: pending,
      lineageDepth: 2,
      clientItems: [{ type: 'function_call_output', call_id: 'call:1', output: 'sunny' }],
      returnedItems: [{
        id: 'msg:1', type: 'message', role: 'assistant', status: 'completed',
        content: [{ type: 'output_text', text: 'Sunny.', annotations: [] }],
      }],
    })
    expect(hasPendingOpenAIResponsesFunctionCallsV2(completed)).toBe(false)
  })

  it('rejects a reused call id before it can become persisted recovery state', () => {
    const firstCall = completeOpenAIResponsesRequestV2({
      priorArtifact: null,
      lineageDepth: 1,
      clientItems: [{ role: 'user', content: [{ type: 'input_text', text: 'first' }] }],
      returnedItems: [{ type: 'function_call', call_id: 'call:reused', name: 'tool', arguments: '{}' }],
    })
    expect(() => completeOpenAIResponsesRequestV2({
      priorArtifact: firstCall,
      lineageDepth: 2,
      clientItems: [{ type: 'function_call_output', call_id: 'call:reused', output: 'done' }],
      returnedItems: [{ type: 'function_call', call_id: 'call:reused', name: 'tool', arguments: '{"again":true}' }],
    })).toThrow('GENERATION_V2_OPENAI_CONTINUATION_SEQUENCE_INVALID')
  })
})
