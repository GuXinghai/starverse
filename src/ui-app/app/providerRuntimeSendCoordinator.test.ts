import { describe, expect, it, vi } from 'vitest'
import type { RuntimeCapabilitySummaryLite, RuntimeProviderKey } from '@/next/provider/runtimeSelection'
import {
  createExperimentalRuntimeTextEvents,
  getExperimentalRuntimeTextModelId,
  getExperimentalRuntimeTextReasoningArtifactProvider,
  getExperimentalRuntimeTextRequestPrefix,
  resolveProviderRuntimeTextSendPreflight,
  type ExperimentalRuntimeTextProviderKey,
} from './providerRuntimeSendCoordinator'

const localEndpointCalls: any[] = []
const openAIResponsesCalls: any[] = []
const googleAIStudioCalls: any[] = []
const anthropicCalls: any[] = []
const deepSeekCalls: any[] = []

async function drain(iterable: AsyncIterable<unknown>): Promise<void> {
  for await (const _event of iterable) {
    // consume test stream
  }
}

vi.mock('@/next/live/localEndpointTextChat', () => ({
  streamLocalEndpointTextChatAsDomainEvents: (input: any) => {
    localEndpointCalls.push(input)
    return async function* events() {
      yield { type: 'StreamDone' }
    }()
  },
}))

vi.mock('@/next/live/openAIResponsesTextChat', () => ({
  streamOpenAIResponsesTextChatAsDomainEvents: (input: any) => {
    openAIResponsesCalls.push(input)
    return async function* events() {
      yield { type: 'StreamDone' }
    }()
  },
}))

vi.mock('@/next/live/googleAIStudioTextChat', () => ({
  streamGoogleAIStudioTextChatAsDomainEvents: (input: any) => {
    googleAIStudioCalls.push(input)
    return async function* events() {
      yield { type: 'StreamDone' }
    }()
  },
}))

vi.mock('@/next/live/anthropicTextChat', () => ({
  streamAnthropicTextChatAsDomainEvents: (input: any) => {
    anthropicCalls.push(input)
    return async function* events() {
      yield { type: 'StreamDone' }
    }()
  },
}))

vi.mock('@/next/live/deepSeekTextChat', () => ({
  streamDeepSeekTextChatAsDomainEvents: (input: any) => {
    deepSeekCalls.push(input)
    return async function* events() {
      yield { type: 'StreamDone' }
    }()
  },
}))

const capability: RuntimeCapabilitySummaryLite = {
  textChat: true,
  streamingText: true,
  attachments: 'blocked',
  webSearch: 'blocked',
  tools: 'blocked',
  reasoningArtifacts: 'filtered',
  imageGeneration: 'blocked',
  structuredOutput: 'blocked',
  usageFinal: 'not_guaranteed',
  source: 'experimental_text_only',
  warnings: [],
}

function selected(providerKey: RuntimeProviderKey, modelKey = `${providerKey}-model`) {
  return {
    state: 'selected' as const,
    providerKey,
    endpointId: `${providerKey}-endpoint`,
    profileId: `${providerKey}-profile`,
    modelKey,
    source: 'explicit_user_selection' as const,
    mode: providerKey === 'openrouter' ? 'production' as const : 'experimental' as const,
  }
}

describe('providerRuntimeSendCoordinator', () => {
  it('blocks unset runtime selection before route dispatch', () => {
    expect(resolveProviderRuntimeTextSendPreflight({
      selection: { state: 'unset', source: 'unset' },
      capability,
      text: 'hello',
      hasDraftAttachments: false,
      sessionConfig: {},
    })).toEqual({
      ok: false,
      reason: '请选择运行供应商和模型后再发送。',
    })
  })

  it('routes explicit OpenRouter selection to the existing OpenRouter path', () => {
    expect(resolveProviderRuntimeTextSendPreflight({
      selection: selected('openrouter', 'openrouter/auto'),
      capability: { ...capability, source: 'openrouter_existing', attachments: 'supported', webSearch: 'supported', tools: 'supported', reasoningArtifacts: 'supported', imageGeneration: 'supported', structuredOutput: 'supported', usageFinal: 'supported' },
      text: 'hello',
      hasDraftAttachments: false,
      sessionConfig: {},
    })).toEqual({
      ok: true,
      route: { kind: 'openrouter_existing' },
    })
  })

  it('keeps experimental providers on text-only routes', () => {
    const providers: ExperimentalRuntimeTextProviderKey[] = [
      'deepseek',
      'anthropic_messages',
      'google_ai_studio',
      'openai_responses',
      'local_endpoint',
    ]

    for (const providerKey of providers) {
      expect(resolveProviderRuntimeTextSendPreflight({
        selection: selected(providerKey),
        capability,
        text: 'hello',
        hasDraftAttachments: false,
        sessionConfig: {},
      })).toEqual({
        ok: true,
        route: { kind: 'experimental_text', providerKey },
      })
    }
  })

  it('keeps experimental provider controls blocked by capability-lite', () => {
    expect(resolveProviderRuntimeTextSendPreflight({
      selection: selected('deepseek'),
      capability,
      text: 'hello',
      hasDraftAttachments: true,
      sessionConfig: {},
    })).toEqual({
      ok: false,
      reason: 'DeepSeek official experimental text chat is text-only. Remove attachments before sending.',
    })
  })

  it('maps experimental provider models, request prefixes, and reasoning artifact providers deterministically', () => {
    const models = {
      localEndpoint: ' local-model ',
      openAIResponses: ' gpt-4.1-mini ',
      googleAIStudio: ' gemini-2.5-flash ',
      anthropic: ' claude-sonnet-4-5 ',
      deepSeek: ' deepseek-v4-flash ',
    }

    expect(getExperimentalRuntimeTextModelId('local_endpoint', models)).toBe('local-model')
    expect(getExperimentalRuntimeTextModelId('openai_responses', models)).toBe('gpt-4.1-mini')
    expect(getExperimentalRuntimeTextModelId('google_ai_studio', models)).toBe('gemini-2.5-flash')
    expect(getExperimentalRuntimeTextModelId('anthropic_messages', models)).toBe('claude-sonnet-4-5')
    expect(getExperimentalRuntimeTextModelId('deepseek', models)).toBe('deepseek-v4-flash')

    expect(getExperimentalRuntimeTextRequestPrefix('local_endpoint')).toBe('local_req')
    expect(getExperimentalRuntimeTextRequestPrefix('openai_responses')).toBe('openai_responses_req')
    expect(getExperimentalRuntimeTextRequestPrefix('google_ai_studio')).toBe('google_ai_studio_req')
    expect(getExperimentalRuntimeTextRequestPrefix('anthropic_messages')).toBe('anthropic_req')
    expect(getExperimentalRuntimeTextRequestPrefix('deepseek')).toBe('deepseek_req')

    expect(getExperimentalRuntimeTextReasoningArtifactProvider('local_endpoint')).toBeUndefined()
    expect(getExperimentalRuntimeTextReasoningArtifactProvider('openai_responses')).toBe('openai_responses')
    expect(getExperimentalRuntimeTextReasoningArtifactProvider('google_ai_studio')).toBe('google_ai_studio')
    expect(getExperimentalRuntimeTextReasoningArtifactProvider('anthropic_messages')).toBe('anthropic_messages')
    expect(getExperimentalRuntimeTextReasoningArtifactProvider('deepseek')).toBe('deepseek')
  })

  it('dispatches experimental text streams without routing through Generic or OpenRouter', async () => {
    const abortController = new AbortController()
    const baseInput = {
      requestId: 'req_1',
      assistantMessageId: 'assistant_1',
      modelId: 'model_1',
      userText: 'hello',
      contextMessages: [{ role: 'user', content: 'previous' }],
      signal: abortController.signal,
    }

    await drain(createExperimentalRuntimeTextEvents({ ...baseInput, providerKey: 'local_endpoint', localEndpointUrl: ' http://127.0.0.1:11434/v1 ' }))
    await drain(createExperimentalRuntimeTextEvents({ ...baseInput, providerKey: 'openai_responses' }))
    await drain(createExperimentalRuntimeTextEvents({ ...baseInput, providerKey: 'google_ai_studio' }))
    await drain(createExperimentalRuntimeTextEvents({ ...baseInput, providerKey: 'anthropic_messages' }))
    await drain(createExperimentalRuntimeTextEvents({ ...baseInput, providerKey: 'deepseek' }))

    expect(localEndpointCalls).toEqual([expect.objectContaining({ endpointUrl: 'http://127.0.0.1:11434/v1', model: 'model_1' })])
    expect(openAIResponsesCalls).toEqual([expect.objectContaining({ model: 'model_1' })])
    expect(googleAIStudioCalls).toEqual([expect.objectContaining({ model: 'model_1' })])
    expect(anthropicCalls).toEqual([expect.objectContaining({ model: 'model_1' })])
    expect(deepSeekCalls).toEqual([expect.objectContaining({ model: 'model_1' })])
  })
})
