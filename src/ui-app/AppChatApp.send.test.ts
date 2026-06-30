import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_OPENROUTER_TEST_MODEL, OPENROUTER_TEST_MODELS } from '@/next/openrouter/openRouterTestModels'
import AppChatApp from './AppChatApp.vue'

const streamOpenRouterChatCallArgs: any[] = []
const localEndpointTextChatCallArgs: any[] = []
const lmStudioTextChatCallArgs: any[] = []
const ollamaTextChatCallArgs: any[] = []
const openAIResponsesTextChatCallArgs: any[] = []
const googleAIStudioTextChatCallArgs: any[] = []
const anthropicTextChatCallArgs: any[] = []
const deepSeekTextChatCallArgs: any[] = []
const imageCapableModel = OPENROUTER_TEST_MODELS[1] ?? OPENROUTER_TEST_MODELS[0]

const draftBox = () => screen.getByTestId('composer-draft') as HTMLTextAreaElement
const sendButton = () => screen.getByTestId('composer-send')
const waitForAppReady = async () => {
  await waitFor(() => {
    expect(screen.getByTestId('current-model-pill')).toBeInTheDocument()
    expect(draftBox()).not.toBeDisabled()
  })
}

const configuredCredential = () => ({ ok: true, status: { apiKeyConfigured: true, warnings: [] } })
const missingCredential = () => ({ ok: true, status: { apiKeyConfigured: false, warnings: [] } })
const availability = (providerKey: string, modelId: string) => ({
  ok: true,
  providerKey,
  endpointId: `${providerKey}-endpoint`,
  profileId: `${providerKey}-profile`,
  observedAtMs: 123,
  models: [{ nativeModelId: modelId, displayName: modelId, warnings: [], capabilitySeed: { textChat: true } }],
  warnings: [],
  sourceDocuments: [],
})
const localEndpointProbe = (modelId = 'local-model') => ({
  ok: true,
  diagnostics: {
    kind: 'local_endpoint_diagnostics',
    status: 'reachable',
    endpointFamily: 'openai_compatible',
    safeBaseUrl: 'http://localhost:1234/v1',
    modelList: { ok: true, source: 'openai_v1_models', models: [modelId, 'settings-selected-model'], truncated: false },
    capabilitySummary: { chatSendAvailable: false, textChat: 'diagnostics_only', streaming: 'not_probed', tools: false, files: false, reasoning: false, webSearch: false },
    message: 'reachable',
  },
})
const lmStudioProbe = (modelId = 'openai/gpt-oss-20b') => ({
  ok: true,
  diagnostics: {
    kind: 'lm_studio_local_provider_diagnostics',
    providerKey: 'lm_studio',
    safeBaseUrl: 'http://127.0.0.1:1234',
    nativeRestAvailable: true,
    openAICompatibleAvailable: true,
    nativeRest: { ok: true, source: 'lm_studio_api_v1_models', models: [{ key: modelId, displayName: modelId, type: 'llm', loaded: true, loadedInstances: ['1'] }], modelIds: [modelId], loadedCount: 1, unloadedCount: 0 },
    openAICompatible: { ok: true, source: 'lm_studio_openai_v1_models', models: [{ key: modelId, displayName: modelId, type: 'llm', loaded: true, loadedInstances: ['1'] }], modelIds: [modelId], loadedCount: 1, unloadedCount: 0 },
    selectedModelLoaded: true,
    warnings: [],
    message: 'available',
  },
})
const ollamaProbe = (modelId = 'llama3.2:latest') => ({
  ok: true,
  diagnostics: {
    kind: 'ollama_local_provider_diagnostics',
    providerKey: 'ollama_local',
    safeBaseUrl: 'http://127.0.0.1:11434',
    nativeRestAvailable: true,
    openAICompatibleAvailable: true,
    localModels: { ok: true, source: 'ollama_api_tags', models: [{ key: modelId, displayName: modelId, running: true }], modelIds: [modelId], count: 1 },
    runningModels: { ok: true, source: 'ollama_api_ps', models: [{ key: modelId, displayName: modelId, running: true }], modelIds: [modelId], count: 1 },
    version: { ok: true, version: '0.0.0-test' },
    openAICompatible: { ok: true, source: 'ollama_openai_v1_models', models: [{ key: modelId, displayName: modelId, running: true }], modelIds: [modelId], count: 1 },
    selectedModelKnown: true,
    selectedModelRunning: true,
    warnings: [],
    message: 'available',
  },
})

vi.mock('@/next/live/openRouterLiveStream', () => {
  async function* streamOpenRouterChatAsEvents(options: any) {
    streamOpenRouterChatCallArgs.push(options)
    const selectedModel = String(options?.config?.model ?? DEFAULT_OPENROUTER_TEST_MODEL)
    const assistantMessageId = String(options?.assistantMessageId ?? 'a1')
    yield { type: 'MetaDelta', meta: { id: 'gen_1', model: selectedModel } }
    yield { type: 'MessageDeltaText', messageId: assistantMessageId, choiceIndex: 0, text: 'h' }
    yield { type: 'MessageDeltaText', messageId: assistantMessageId, choiceIndex: 0, text: 'i' }
    if (options?.config?.imageGeneration) {
      yield {
        type: 'MessageAppendContentBlock',
        messageId: assistantMessageId,
        choiceIndex: 0,
        block: { type: 'image', url: 'asset://img_1' },
      }
    }
    yield {
      type: 'MessageDeltaAnnotationBatch',
      messageId: assistantMessageId,
      choiceIndex: 0,
      mergeStrategy: 'append',
      annotations: [
        {
          type: 'url_citation',
          url_citation: { url: 'https://example.com', title: 'Example', start_index: 0, end_index: 1 },
        },
      ],
    }
    yield {
      type: 'UsageDelta',
      usage: {
        prompt_tokens: 11,
        completion_tokens: 7,
        total_tokens: 18,
        cost: 0.0123,
        cost_currency: 'usd',
      },
    }
    yield { type: 'StreamDone' }
  }
  return { streamOpenRouterChatAsEvents }
})

vi.mock('@/next/live/localEndpointTextChat', () => {
  async function* streamLocalEndpointTextChatAsDomainEvents(options: any) {
    localEndpointTextChatCallArgs.push(options)
    const assistantMessageId = String(options?.assistantMessageId ?? 'a1')
    yield { type: 'MetaDelta', meta: { id: 'local_gen_1', model: String(options?.model ?? 'local-model'), provider: 'local_endpoint' } }
    yield { type: 'MessageDeltaText', messageId: assistantMessageId, choiceIndex: 0, text: 'local ' }
    yield { type: 'MessageDeltaText', messageId: assistantMessageId, choiceIndex: 0, text: 'hi' }
    yield { type: 'StreamDone' }
  }
  return { streamLocalEndpointTextChatAsDomainEvents }
})

vi.mock('@/next/live/lmStudioTextChat', () => {
  async function* streamLMStudioTextChatAsDomainEvents(options: any) {
    lmStudioTextChatCallArgs.push(options)
    const assistantMessageId = String(options?.assistantMessageId ?? 'a1')
    yield { type: 'MetaDelta', meta: { id: 'lm_studio_gen_1', model: String(options?.model ?? 'openai/gpt-oss-20b'), provider: 'lm_studio' } }
    yield { type: 'MessageDeltaText', messageId: assistantMessageId, choiceIndex: 0, text: 'lm studio ' }
    yield { type: 'MessageDeltaText', messageId: assistantMessageId, choiceIndex: 0, text: 'hi' }
    yield { type: 'StreamDone' }
  }
  return { streamLMStudioTextChatAsDomainEvents }
})

vi.mock('@/next/live/ollamaTextChat', () => {
  async function* streamOllamaTextChatAsDomainEvents(options: any) {
    ollamaTextChatCallArgs.push(options)
    const assistantMessageId = String(options?.assistantMessageId ?? 'a1')
    yield { type: 'MetaDelta', meta: { id: 'ollama_gen_1', model: String(options?.model ?? 'llama3.2:latest'), provider: 'ollama_local' } }
    yield { type: 'MessageDeltaText', messageId: assistantMessageId, choiceIndex: 0, text: 'ollama ' }
    yield { type: 'MessageDeltaText', messageId: assistantMessageId, choiceIndex: 0, text: 'hi' }
    yield { type: 'StreamDone' }
  }
  return { streamOllamaTextChatAsDomainEvents }
})

vi.mock('@/next/live/openAIResponsesTextChat', () => {
  async function* streamOpenAIResponsesTextChatAsDomainEvents(options: any) {
    openAIResponsesTextChatCallArgs.push(options)
    const assistantMessageId = String(options?.assistantMessageId ?? 'a1')
    yield { type: 'MetaDelta', meta: { id: 'openai_responses_gen_1', model: String(options?.model ?? 'gpt-4.1-mini'), provider: 'openai-responses' } }
    yield { type: 'MessageDeltaText', messageId: assistantMessageId, choiceIndex: 0, text: 'openai ' }
    yield { type: 'MessageDeltaText', messageId: assistantMessageId, choiceIndex: 0, text: 'hi' }
    yield { type: 'StreamDone' }
  }
  return { streamOpenAIResponsesTextChatAsDomainEvents }
})

vi.mock('@/next/live/googleAIStudioTextChat', () => {
  async function* streamGoogleAIStudioTextChatAsDomainEvents(options: any) {
    googleAIStudioTextChatCallArgs.push(options)
    const assistantMessageId = String(options?.assistantMessageId ?? 'a1')
    yield { type: 'MetaDelta', meta: { id: 'google_ai_studio_gen_1', model: String(options?.model ?? 'gemini-2.5-flash'), provider: 'google-ai-studio' } }
    yield { type: 'MessageDeltaText', messageId: assistantMessageId, choiceIndex: 0, text: 'gemini ' }
    yield { type: 'MessageDeltaText', messageId: assistantMessageId, choiceIndex: 0, text: 'hi' }
    yield { type: 'StreamDone' }
  }
  return { streamGoogleAIStudioTextChatAsDomainEvents }
})

vi.mock('@/next/live/anthropicTextChat', () => {
  async function* streamAnthropicTextChatAsDomainEvents(options: any) {
    anthropicTextChatCallArgs.push(options)
    const assistantMessageId = String(options?.assistantMessageId ?? 'a1')
    yield { type: 'MetaDelta', meta: { id: 'anthropic_gen_1', model: String(options?.model ?? 'claude-sonnet-4-5'), provider: 'anthropic' } }
    yield { type: 'MessageDeltaText', messageId: assistantMessageId, choiceIndex: 0, text: 'anthropic ' }
    yield { type: 'MessageDeltaText', messageId: assistantMessageId, choiceIndex: 0, text: 'hi' }
    yield { type: 'StreamDone' }
  }
  return { streamAnthropicTextChatAsDomainEvents }
})

vi.mock('@/next/live/deepSeekTextChat', () => {
  async function* streamDeepSeekTextChatAsDomainEvents(options: any) {
    deepSeekTextChatCallArgs.push(options)
    const assistantMessageId = String(options?.assistantMessageId ?? 'a1')
    yield { type: 'MetaDelta', meta: { id: 'deepseek_gen_1', model: String(options?.model ?? 'deepseek-chat'), provider: 'deepseek' } }
    yield { type: 'MessageDeltaText', messageId: assistantMessageId, choiceIndex: 0, text: 'deepseek ' }
    yield { type: 'MessageDeltaText', messageId: assistantMessageId, choiceIndex: 0, text: 'hi' }
    yield { type: 'StreamDone' }
  }
  return { streamDeepSeekTextChatAsDomainEvents }
})

describe('ui-app AppChatApp (send: pure text)', () => {
  const originalDbBridge = (globalThis as any).dbBridge
  const originalElectronAPI = (globalThis as any).electronAPI
  const originalElectronStore = (globalThis as any).electronStore
  const originalOpenRouterCredential = (globalThis as any).openRouterCredential
  const originalOpenAIResponsesCredential = (globalThis as any).openAIResponsesCredential
  const originalGoogleAIStudioCredential = (globalThis as any).googleAIStudioCredential
  const originalAnthropicCredential = (globalThis as any).anthropicCredential
  const originalDeepSeekCredential = (globalThis as any).deepSeekCredential
  const originalOpenAIResponsesModels = (globalThis as any).openAIResponsesModels
  const originalGoogleAIStudioModels = (globalThis as any).googleAIStudioModels
  const originalAnthropicModels = (globalThis as any).anthropicModels
  const originalDeepSeekModels = (globalThis as any).deepSeekModels
  const originalLocalEndpointDiagnostics = (globalThis as any).localEndpointDiagnostics
  const originalLMStudioProvider = (globalThis as any).lmStudioProvider
  const originalOllamaProvider = (globalThis as any).ollamaProvider
  const originalSetTimeout = globalThis.setTimeout
  let convoListMeta: Record<string, unknown> | null = null

  beforeEach(() => {
    vi.useFakeTimers()
    streamOpenRouterChatCallArgs.length = 0
    localEndpointTextChatCallArgs.length = 0
    lmStudioTextChatCallArgs.length = 0
    ollamaTextChatCallArgs.length = 0
    openAIResponsesTextChatCallArgs.length = 0
    googleAIStudioTextChatCallArgs.length = 0
    anthropicTextChatCallArgs.length = 0
    deepSeekTextChatCallArgs.length = 0
    globalThis.localStorage?.removeItem('starverse.localEndpointTextChat.enabled')
    globalThis.localStorage?.removeItem('starverse.localEndpointTextChat.url')
    globalThis.localStorage?.removeItem('starverse.localEndpointTextChat.model')
    globalThis.localStorage?.removeItem('starverse.lmStudioTextChat.enabled')
    globalThis.localStorage?.removeItem('starverse.lmStudio.endpointUrl')
    globalThis.localStorage?.removeItem('starverse.lmStudio.model')
    globalThis.localStorage?.removeItem('starverse.lmStudio.chatMode')
    globalThis.localStorage?.removeItem('starverse.lmStudio.openAICompatible.preferredEndpoint')
    globalThis.localStorage?.removeItem('starverse.lmStudioTextChat.enabled')
    globalThis.localStorage?.removeItem('starverse.lmStudio.endpointUrl')
    globalThis.localStorage?.removeItem('starverse.lmStudio.model')
    globalThis.localStorage?.removeItem('starverse.lmStudio.chatMode')
    globalThis.localStorage?.removeItem('starverse.lmStudio.openAICompatible.preferredEndpoint')
    globalThis.localStorage?.removeItem('starverse.ollamaTextChat.enabled')
    globalThis.localStorage?.removeItem('starverse.ollama.endpointUrl')
    globalThis.localStorage?.removeItem('starverse.ollama.model')
    globalThis.localStorage?.removeItem('starverse.ollama.chatMode')
    globalThis.localStorage?.removeItem('starverse.ollama.nativeRest.preferredEndpoint')
    globalThis.localStorage?.removeItem('starverse.ollama.openAICompatible.preferredEndpoint')
    globalThis.localStorage?.removeItem('starverse.openAIResponsesTextChat.enabled')
    globalThis.localStorage?.removeItem('starverse.openAIResponsesTextChat.model')
    globalThis.localStorage?.removeItem('starverse.googleAIStudioTextChat.enabled')
    globalThis.localStorage?.removeItem('starverse.googleAIStudioTextChat.model')
    globalThis.localStorage?.removeItem('starverse.anthropicMessagesTextChat.enabled')
    globalThis.localStorage?.removeItem('starverse.anthropicMessagesTextChat.model')
    globalThis.localStorage?.removeItem('starverse.deepSeekTextChat.enabled')
    globalThis.localStorage?.removeItem('starverse.deepSeekTextChat.model')
    globalThis.localStorage?.removeItem('starverse.openRouterTextChat.enabled')
    globalThis.localStorage?.setItem('starverse.openRouterTextChat.enabled', '1')
    convoListMeta = null
    // Make throttle immediate in tests (while still exercising scheduling code paths).
    globalThis.setTimeout = ((fn: (...args: any[]) => void) => originalSetTimeout(fn, 0)) as any

    const catalogRows: Array<any> = [
      {
        modelId: imageCapableModel,
        name: 'Image-Capable Test Model',
        vendor: 'anthropic',
        status: 'visible',
        supportedParameters: [],
        lastSeenSnapshotId: 'snap_1',
      },
    ]

    ;(globalThis as any).electronAPI = {
      modelCatalogQueryScopedCurrent: vi.fn(async (options?: any) => {
        const requestedIds = Array.isArray(options?.modelIds)
          ? new Set(options.modelIds.map((id: unknown) => String(id)))
          : null
        return {
          status: 'synced',
          catalogRevision: 'checksum-send',
          modelCount: catalogRows.length,
          lastSyncAtMs: 123,
          items: catalogRows
            .filter((row) => !requestedIds || requestedIds.has(String(row.modelId)))
            .map((row) => ({
              providerKey: 'openrouter',
              modelId: String(row.modelId),
              modelKey: `openrouter::${String(row.modelId)}`,
              canonicalSlug: String(row.modelId),
              displayName: String(row.name),
              description: null,
              vendor: String(row.vendor),
              family: null,
              status: 'active',
              visibility: row.status === 'hidden' ? 'hidden' : 'visible',
              contextLength: 200000,
              maxOutputTokens: 8192,
              inputModalities: ['text'],
              outputModalities: ['text', 'image'],
              supportedParameters: [...row.supportedParameters],
              pricing: {
                prompt: '0.01',
                completion: '0.02',
                request: '0',
                image: '0.04',
              },
              capabilities: {
                reasoning: true,
                tools: false,
                structuredOutputs: false,
                vision: false,
                longContext: true,
              },
              createdAtSec: 1700000123,
              firstSeenAtMs: 1700000000000,
              lastSeenAtMs: 1700000000000,
              syncedAtMs: 1700000000000,
              raw: {
                inputModalitiesJson: '["text"]',
                outputModalitiesJson: '["text","image"]',
                supportedParametersJson: JSON.stringify(row.supportedParameters),
                capabilitiesJson: '{"reasoning":true,"tools":false,"structuredOutputs":false,"vision":false,"longContext":true}',
                pricingJson: '{"prompt":"0.01","completion":"0.02","request":"0","image":"0.04"}',
              },
            })),
          nextCursor: null,
        }
      }),
      modelCatalogGetSyncStatus: vi.fn(async () => ({
        ok: true,
        providerKey: 'openrouter',
        status: 'synced',
        syncState: 'ok',
        failureReasonCode: null,
        lastSyncedAtMs: 123,
        modelCount: catalogRows.length,
      })),
      modelCatalogSyncNow: vi.fn(async () => ({
        ok: true,
        providerKey: 'openrouter',
        status: 'synced',
        syncState: 'ok',
        syncAttempted: false,
        modelCount: catalogRows.length,
        lastSyncedAtMs: 123,
      })),
    }

    ;(globalThis as any).electronStore = {
      get: vi.fn(async (key: string) => {
        if (key === 'openRouterApiKey') return 'redacted-test-key'
        if (key === 'openRouterBaseUrl') return 'https://openrouter.ai/api/v1'
        return undefined
      }),
    }
    ;(globalThis as any).openRouterCredential = { getStatus: vi.fn(async () => configuredCredential()) }
    ;(globalThis as any).openAIResponsesCredential = { getStatus: vi.fn(async () => configuredCredential()) }
    ;(globalThis as any).googleAIStudioCredential = { getStatus: vi.fn(async () => configuredCredential()) }
    ;(globalThis as any).anthropicCredential = { getStatus: vi.fn(async () => configuredCredential()) }
    ;(globalThis as any).deepSeekCredential = { getStatus: vi.fn(async () => configuredCredential()) }
    ;(globalThis as any).openAIResponsesModels = { listAvailability: vi.fn(async () => availability('openai_responses', 'gpt-4.1-mini')) }
    ;(globalThis as any).googleAIStudioModels = { listAvailability: vi.fn(async () => availability('google_ai_studio', 'gemini-2.5-flash')) }
    ;(globalThis as any).anthropicModels = { listAvailability: vi.fn(async () => availability('anthropic_messages', 'claude-sonnet-4-5')) }
    ;(globalThis as any).deepSeekModels = { listAvailability: vi.fn(async () => availability('deepseek', 'deepseek-chat')) }
    ;(globalThis as any).localEndpointDiagnostics = { probe: vi.fn(async () => localEndpointProbe()) }
    ;(globalThis as any).lmStudioProvider = { probe: vi.fn(async () => lmStudioProbe()) }
    ;(globalThis as any).ollamaProvider = { probe: vi.fn(async () => ollamaProbe()) }

    const persisted: Array<any> = []
    let turnCounter = 0

    const buildTurns = () => {
      const turns = persisted
        .filter((message) => String(message.role) === 'user')
        .map((userMessage) => {
          const chosenAssistant = [...persisted]
            .reverse()
            .find(
              (message) =>
                String(message.role) === 'assistant' &&
                String(message.questionId ?? '') === String(userMessage.id),
            )
          if (!chosenAssistant) return null
          return {
            questionId: String(userMessage.id),
            chosenAnswerRootId: String(chosenAssistant.id),
            questionMode: 'include',
            answerMode: 'include',
            effectiveMode: 'include',
            lockedByQuestionExclude: false,
          }
        })
        .filter((row): row is NonNullable<typeof row> => row !== null)

      return {
        turns,
        chosenAnswerRootByQuestionId: Object.fromEntries(
          turns.map((turn) => [turn.questionId, turn.chosenAnswerRootId]),
        ),
      }
    }

    const invoke = vi.fn(async (method: string, params?: any) => {
      if (method === 'project.getInbox') return null
      if (method === 'project.list') return []
      if (method === 'project.countConversationsBatch') return { counts: {} }
      if (method === 'settings.getImageGenerationDefault') return { value: null }
      if (method === 'settings.getWebSearchDefaults') return { value: null }
      if (method === 'settings.getSamplingParamsDefaults') return { value: null }
      if (method === 'settings.getReasoningPrefs') return { value: { mode: 'auto', effort: 'auto', exclude: false } }
      if (method === 'settings.getUserMessageRenderDefault') return { value: false }
      if (method === 'convo.list') {
        return [{ id: 'c1', title: 'Chat 1', createdAt: 1, updatedAt: 1, meta: convoListMeta }]
      }
      if (method === 'modelCatalog.list') return catalogRows
      if (method === 'modelCatalog.queryCore') {
        return {
          items: catalogRows.map((row) => ({
            providerKey: 'openrouter',
            modelId: String(row.modelId),
            modelKey: `openrouter::${String(row.modelId)}`,
            canonicalSlug: String(row.modelId),
            displayName: String(row.name),
            description: null,
            vendor: String(row.vendor),
            contextLength: null,
            createdAtSec: null,
            pricePrompt: null,
            priceCompletion: null,
            priceRequest: null,
            priceImage: null,
            capReasoning: 1,
            capTools: 0,
            capStructuredOutputs: 0,
            capVision: 0,
            capLongContext: 0,
          })),
          nextCursor: null,
        }
      }
      if (method === 'modelCatalog.getCoreMeta') {
        return {
          providerKey: 'openrouter',
          baseUrl: 'https://openrouter.ai/api/v1',
        }
      }
      if (method === 'modelCatalog.getModelDetail') {
        const modelId = String(params?.modelId ?? '')
        if (modelId === imageCapableModel) {
          return {
            providerKey: 'openrouter',
            modelId: imageCapableModel,
            modelKey: `openrouter::${imageCapableModel}`,
            canonicalSlug: imageCapableModel,
            displayName: 'Image-Capable Test Model',
            description: null,
            vendor: 'anthropic',
            family: null,
            status: 'active',
            visibility: 'visible',
            contextLength: 200000,
            maxOutputTokens: 8192,
            architectureModality: 'text->text,image',
            inputModalitiesJson: '["text"]',
            outputModalitiesJson: '["text","image"]',
            tokenizer: null,
            instructType: null,
            supportedParametersJson: '[]',
            capabilitiesJson: '{"reasoning":true,"tools":false,"structuredOutputs":false,"vision":false,"longContext":true}',
            pricePrompt: '0.01',
            priceCompletion: '0.02',
            priceRequest: '0',
            priceImage: '0.04',
            pricingJson: '{"prompt":"0.01","completion":"0.02","request":"0","image":"0.04"}',
            createdAtSec: 1700000123,
            expirationDate: null,
            expirationAtSec: null,
            unknownExpiration: 0,
            hasPerRequestLimits: 0,
            hasDefaultParameters: 0,
            perRequestLimitsJson: null,
            defaultParametersJson: null,
            topProviderContextLength: null,
            topProviderIsModerated: null,
            firstSeenAtMs: 1700000000000,
            lastSeenAtMs: 1700000000000,
            syncedAtMs: 1700000000000,
          }
        }
        return null
      }
      if (method === 'conversationDraft.restore' || method === 'conversationDraft.updateText') {
        return {
          conversationId: 'c1',
          draftText: '',
          draftMode: 'compose',
          editingSourceMessageId: null,
          attachedAssetIds: [],
          attachments: [],
          updatedAt: Date.now(),
        }
      }
      if (method === 'modelCatalog.listEndpointMeta') return []
      if (method === 'modelCatalog.replaceEndpointMeta') return { ok: true }
      if (method === 'reasoningIndex.list') return []
      if (method === 'modelPrefs.recordRecent') {
        const now = Date.now()
        return {
          scopeType: 'global',
          scopeId: '',
          providerKey: String(params?.providerKey ?? 'openrouter'),
          modelId: String(params?.modelId ?? ''),
          modelKey: String(params?.modelKey ?? ''),
          lastUsedAtMs: now,
          useCount: 1,
          createdAtMs: now,
          updatedAtMs: now,
        }
      }
      if (method === 'branch.ensureDefault') {
        return { id: 'b1', convoId: 'c1', headMessageId: null, name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }
      }
      if (method === 'branch.list') {
        return [{ id: 'b1', convoId: 'c1', headMessageId: persisted[persisted.length - 1]?.id ?? null, name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }]
      }
      if (method === 'context.getRenderableTurns') {
        const builtTurns = buildTurns()
        return {
          messages: persisted,
          turns: builtTurns.turns,
          debug: {
            branchId: 'b1',
            excludedQuestionIds: [],
            includedMessageIds: persisted.map((m) => m.id),
            chosenAnswerRootByQuestionId: builtTurns.chosenAnswerRootByQuestionId,
          },
        }
      }
      if (method === 'context.buildForBranch') {
        return { messages: [], debug: { branchId: 'b1', excludedQuestionIds: [], includedMessageIds: [], chosenAnswerRootByQuestionId: {} } }
      }
      if (method === 'branch.beginTurn') {
        turnCounter += 1
        const userBody = String(params?.userBody ?? '')
        const now = Date.now()
        const questionId = `u${turnCounter}`
        const assistantId = `a${turnCounter}`
        const questionSeq = turnCounter * 2 - 1
        const assistantSeq = turnCounter * 2
        persisted.push({
          id: questionId,
          convoId: 'c1',
          role: 'user',
          seq: questionSeq,
          createdAt: now,
          parentId: null,
          status: 'final',
          answerRootId: null,
          questionId: null,
          body: userBody,
          meta: null,
        })
        persisted.push({
          id: assistantId,
          convoId: 'c1',
          role: 'assistant',
          seq: assistantSeq,
          createdAt: now + 1,
          parentId: questionId,
          status: 'streaming',
          answerRootId: assistantId,
          questionId,
          body: '',
          meta: null,
        })
        return {
          ok: true,
          convoId: 'c1',
          branchId: 'b1',
          questionId,
          questionSeq,
          assistantId,
          assistantSeq,
        }
      }
      if (method === 'message.appendDelta') {
        const targetSeq = Number(params?.seq ?? NaN)
        const appendBody = String(params?.appendBody ?? '')
        const msg = persisted.find((m) => Number(m.seq) === targetSeq)
        if (msg && appendBody) msg.body = String(msg.body ?? '') + appendBody
        return { ok: true }
      }
      if (method === 'message.setStatus') {
        const messageId = String(params?.messageId ?? '')
        const status = String(params?.status ?? '')
        const msg = persisted.find((m) => String(m.id) === messageId)
        if (msg) msg.status = status
        return { ok: true }
      }
      if (method === 'convo.create') return { id: 'c1', title: 'Chat 1', createdAt: 1, updatedAt: 1 }
      return { ok: true }
    })

    ;(globalThis as any).dbBridge = { invoke }
  })

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
    ;(globalThis as any).electronAPI = originalElectronAPI
    ;(globalThis as any).electronStore = originalElectronStore
    ;(globalThis as any).openRouterCredential = originalOpenRouterCredential
    ;(globalThis as any).openAIResponsesCredential = originalOpenAIResponsesCredential
    ;(globalThis as any).googleAIStudioCredential = originalGoogleAIStudioCredential
    ;(globalThis as any).anthropicCredential = originalAnthropicCredential
    ;(globalThis as any).deepSeekCredential = originalDeepSeekCredential
    ;(globalThis as any).openAIResponsesModels = originalOpenAIResponsesModels
    ;(globalThis as any).googleAIStudioModels = originalGoogleAIStudioModels
    ;(globalThis as any).anthropicModels = originalAnthropicModels
    ;(globalThis as any).deepSeekModels = originalDeepSeekModels
    ;(globalThis as any).localEndpointDiagnostics = originalLocalEndpointDiagnostics
    ;(globalThis as any).lmStudioProvider = originalLMStudioProvider
    ;(globalThis as any).ollamaProvider = originalOllamaProvider
    globalThis.setTimeout = originalSetTimeout
    globalThis.localStorage?.removeItem('starverse.localEndpointTextChat.enabled')
    globalThis.localStorage?.removeItem('starverse.localEndpointTextChat.url')
    globalThis.localStorage?.removeItem('starverse.localEndpointTextChat.model')
    globalThis.localStorage?.removeItem('starverse.openAIResponsesTextChat.enabled')
    globalThis.localStorage?.removeItem('starverse.openAIResponsesTextChat.model')
    globalThis.localStorage?.removeItem('starverse.googleAIStudioTextChat.enabled')
    globalThis.localStorage?.removeItem('starverse.googleAIStudioTextChat.model')
    globalThis.localStorage?.removeItem('starverse.anthropicMessagesTextChat.enabled')
    globalThis.localStorage?.removeItem('starverse.anthropicMessagesTextChat.model')
    globalThis.localStorage?.removeItem('starverse.deepSeekTextChat.enabled')
    globalThis.localStorage?.removeItem('starverse.deepSeekTextChat.model')
    globalThis.localStorage?.removeItem('starverse.openRouterTextChat.enabled')
    vi.useRealTimers()
  })

  it('blocks send when no runtime provider is selected and does not call OpenRouter', async () => {
    globalThis.localStorage?.removeItem('starverse.openRouterTextChat.enabled')
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    await user.click(draftBox())
    await user.type(draftBox(), 'no provider selected ping')
    await user.click(sendButton())

    expect(draftBox().value).toBe('no provider selected ping')
    expect(streamOpenRouterChatCallArgs).toHaveLength(0)
    expect(localEndpointTextChatCallArgs).toHaveLength(0)
    expect(lmStudioTextChatCallArgs).toHaveLength(0)
    expect(openAIResponsesTextChatCallArgs).toHaveLength(0)
    expect(googleAIStudioTextChatCallArgs).toHaveLength(0)
    expect(anthropicTextChatCallArgs).toHaveLength(0)
    expect(deepSeekTextChatCallArgs).toHaveLength(0)
  })

  it.each([
    {
      label: 'OpenRouter',
      credentialBridge: 'openRouterCredential',
      prompt: 'openrouter missing key ping',
      setup: () => {},
    },
    {
      label: 'OpenAI Responses',
      credentialBridge: 'openAIResponsesCredential',
      prompt: 'openai missing key ping',
      setup: () => {
        globalThis.localStorage?.setItem('starverse.openAIResponsesTextChat.enabled', '1')
        globalThis.localStorage?.setItem('starverse.openAIResponsesTextChat.model', 'gpt-4.1-mini')
      },
    },
    {
      label: 'Anthropic',
      credentialBridge: 'anthropicCredential',
      prompt: 'anthropic missing key ping',
      setup: () => {
        globalThis.localStorage?.setItem('starverse.anthropicMessagesTextChat.enabled', '1')
        globalThis.localStorage?.setItem('starverse.anthropicMessagesTextChat.model', 'claude-sonnet-4-5')
      },
    },
    {
      label: 'Google AI Studio',
      credentialBridge: 'googleAIStudioCredential',
      prompt: 'gemini missing key ping',
      setup: () => {
        globalThis.localStorage?.setItem('starverse.googleAIStudioTextChat.enabled', '1')
        globalThis.localStorage?.setItem('starverse.googleAIStudioTextChat.model', 'gemini-2.5-flash')
      },
    },
    {
      label: 'DeepSeek',
      credentialBridge: 'deepSeekCredential',
      prompt: 'deepseek missing key ping',
      setup: () => {
        globalThis.localStorage?.setItem('starverse.deepSeekTextChat.enabled', '1')
        globalThis.localStorage?.setItem('starverse.deepSeekTextChat.model', 'deepseek-chat')
      },
    },
  ])('blocks $label before provider stream when credential is missing', async ({ credentialBridge, prompt, setup }) => {
    ;(globalThis as any)[credentialBridge] = { getStatus: vi.fn(async () => missingCredential()) }
    setup()
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    await user.click(draftBox())
    await user.type(draftBox(), prompt)
    await user.click(sendButton())

    await waitFor(() => expect(draftBox().value).toBe(prompt))
    expect(streamOpenRouterChatCallArgs).toHaveLength(0)
    expect(localEndpointTextChatCallArgs).toHaveLength(0)
    expect(lmStudioTextChatCallArgs).toHaveLength(0)
    expect(ollamaTextChatCallArgs).toHaveLength(0)
    expect(openAIResponsesTextChatCallArgs).toHaveLength(0)
    expect(googleAIStudioTextChatCallArgs).toHaveLength(0)
    expect(anthropicTextChatCallArgs).toHaveLength(0)
    expect(deepSeekTextChatCallArgs).toHaveLength(0)
  })

  it.each([
    {
      label: 'LocalEndpoint',
      prompt: 'local endpoint down ping',
      setup: () => {
        globalThis.localStorage?.setItem('starverse.localEndpointTextChat.enabled', '1')
        globalThis.localStorage?.setItem('starverse.localEndpointTextChat.url', 'http://localhost:1234/v1')
        globalThis.localStorage?.setItem('starverse.localEndpointTextChat.model', 'local-model')
        ;(globalThis as any).localEndpointDiagnostics = { probe: vi.fn(async () => ({ ok: false, code: 'network_error', message: 'Local endpoint unavailable.' })) }
      },
    },
    {
      label: 'LM Studio',
      prompt: 'lm studio down ping',
      setup: () => {
        globalThis.localStorage?.setItem('starverse.lmStudioTextChat.enabled', '1')
        globalThis.localStorage?.setItem('starverse.lmStudio.endpointUrl', 'http://127.0.0.1:1234')
        globalThis.localStorage?.setItem('starverse.lmStudio.model', 'openai/gpt-oss-20b')
        globalThis.localStorage?.setItem('starverse.lmStudio.chatMode', 'openai_compatible')
        ;(globalThis as any).lmStudioProvider = { probe: vi.fn(async () => ({ ok: false, code: 'network_error', message: 'LM Studio unavailable.' })) }
      },
    },
    {
      label: 'Ollama',
      prompt: 'ollama down ping',
      setup: () => {
        globalThis.localStorage?.setItem('starverse.ollamaTextChat.enabled', '1')
        globalThis.localStorage?.setItem('starverse.ollama.endpointUrl', 'http://127.0.0.1:11434')
        globalThis.localStorage?.setItem('starverse.ollama.model', 'llama3.2:latest')
        globalThis.localStorage?.setItem('starverse.ollama.chatMode', 'native_rest')
        ;(globalThis as any).ollamaProvider = { probe: vi.fn(async () => ({ ok: false, code: 'network_error', message: 'Ollama unavailable.' })) }
      },
    },
  ])('blocks $label before provider stream when endpoint probe is unavailable', async ({ prompt, setup }) => {
    setup()
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    await user.click(draftBox())
    await user.type(draftBox(), prompt)
    await user.click(sendButton())

    await waitFor(() => expect(draftBox().value).toBe(prompt))
    expect(streamOpenRouterChatCallArgs).toHaveLength(0)
    expect(localEndpointTextChatCallArgs).toHaveLength(0)
    expect(lmStudioTextChatCallArgs).toHaveLength(0)
    expect(ollamaTextChatCallArgs).toHaveLength(0)
    expect(openAIResponsesTextChatCallArgs).toHaveLength(0)
    expect(googleAIStudioTextChatCallArgs).toHaveLength(0)
    expect(anthropicTextChatCallArgs).toHaveLength(0)
    expect(deepSeekTextChatCallArgs).toHaveLength(0)
  })

  it('appends user+assistant, streams text, persists via message.appendDelta', async () => {
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    const box = draftBox()
    await user.click(box)
    await user.type(box, 'ping')
    expect((box as HTMLTextAreaElement).value).toBe('ping')

    const send = sendButton()
    expect(send).not.toBeDisabled()
    await user.click(send)

    await screen.findByText('ping')
    await screen.findByText('hi')

    await vi.runAllTimersAsync()

    const invoke = (globalThis as any).dbBridge.invoke as ReturnType<typeof vi.fn>
    expect(invoke).toHaveBeenCalledWith('context.buildForBranch', expect.objectContaining({ branchId: 'b1' }))
    expect(invoke).toHaveBeenCalledWith('branch.beginTurn', expect.objectContaining({ branchId: 'b1', userBody: 'ping' }))
    expect(invoke).toHaveBeenCalledWith('message.appendDelta', expect.objectContaining({ convoId: 'c1', seq: 2 }))
    expect(invoke).toHaveBeenCalledWith('message.setAnnotations', expect.objectContaining({ messageId: 'a1' }))
    expect(invoke).toHaveBeenCalledWith('message.setStatus', expect.objectContaining({ messageId: 'a1', status: 'final' }))
    expect(invoke).toHaveBeenCalledWith(
      'message.setStatus',
      expect.objectContaining({
        messageId: 'a1',
        metaPatch: expect.objectContaining({
          usage: expect.objectContaining({
            total_tokens: 18,
            cost: 0.0123,
          }),
        }),
      }),
    )
    const last = streamOpenRouterChatCallArgs[streamOpenRouterChatCallArgs.length - 1]
    expect(last?.config?.imageGeneration).toBeUndefined()
    expect(last?.config?.webSearch?.requestPatch?.plugins?.[0]).toMatchObject({ id: 'web', enabled: false })
    expect(invoke.mock.calls.filter((c) => c[0] === 'message.appendDelta').length).toBeGreaterThanOrEqual(1)
    expect(invoke.mock.calls.map((call) => call[0])).not.toContain('modelCatalog.list')
    expect(invoke.mock.calls.map((call) => call[0])).not.toContain('modelCatalog.queryCore')
    expect(invoke.mock.calls.map((call) => call[0])).not.toContain('reasoningIndex.list')
  })

  it('routes experimental LocalEndpoint text chat through the normal transcript without OpenRouter send', async () => {
    globalThis.localStorage?.setItem('starverse.localEndpointTextChat.enabled', '1')
    globalThis.localStorage?.setItem('starverse.localEndpointTextChat.url', 'http://localhost:1234/v1')
    globalThis.localStorage?.setItem('starverse.localEndpointTextChat.model', 'local-model')
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    await user.click(draftBox())
    await user.type(draftBox(), 'local ping')
    await user.click(sendButton())

    await screen.findByText('local ping')
    await screen.findByText('local hi')
    await vi.runAllTimersAsync()

    const invoke = (globalThis as any).dbBridge.invoke as ReturnType<typeof vi.fn>
    expect(streamOpenRouterChatCallArgs).toHaveLength(0)
    expect(localEndpointTextChatCallArgs).toHaveLength(1)
    expect(localEndpointTextChatCallArgs[0]).toMatchObject({
      endpointUrl: 'http://localhost:1234/v1',
      model: 'local-model',
      userText: 'local ping',
    })
    expect(localEndpointTextChatCallArgs[0].currentUserContentBlocks).toBeUndefined()
    expect(invoke).toHaveBeenCalledWith('branch.beginTurn', expect.objectContaining({ branchId: 'b1', userBody: 'local ping' }))
    expect(invoke).toHaveBeenCalledWith('message.appendDelta', expect.objectContaining({ convoId: 'c1', seq: 2 }))
    expect(invoke).toHaveBeenCalledWith('message.setStatus', expect.objectContaining({ messageId: 'a1', status: 'final' }))
    expect(invoke.mock.calls.map((call) => call[0])).not.toContain('modelPrefs.recordRecent')
  })

  it('routes explicit Ollama Local text chat through the normal transcript without OpenRouter or Generic send', async () => {
    globalThis.localStorage?.setItem('starverse.ollamaTextChat.enabled', '1')
    globalThis.localStorage?.setItem('starverse.ollama.endpointUrl', 'http://127.0.0.1:11434')
    globalThis.localStorage?.setItem('starverse.ollama.model', 'llama3.2:latest')
    globalThis.localStorage?.setItem('starverse.ollama.chatMode', 'native_rest')
    globalThis.localStorage?.setItem('starverse.ollama.nativeRest.preferredEndpoint', 'chat')
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    await user.click(draftBox())
    await user.type(draftBox(), 'ollama ping')
    await user.click(sendButton())

    await screen.findByText('ollama ping')
    await screen.findByText('ollama hi')
    await vi.runAllTimersAsync()

    const invoke = (globalThis as any).dbBridge.invoke as ReturnType<typeof vi.fn>
    expect(streamOpenRouterChatCallArgs).toHaveLength(0)
    expect(localEndpointTextChatCallArgs).toHaveLength(0)
    expect(ollamaTextChatCallArgs).toHaveLength(1)
    expect(ollamaTextChatCallArgs[0]).toMatchObject({
      config: {
        providerKey: 'ollama_local',
        endpointUrl: 'http://127.0.0.1:11434',
        chatMode: 'native_rest',
        nativeRest: { basePath: '/api', preferredEndpoint: 'chat' },
      },
      model: 'llama3.2:latest',
      userText: 'ollama ping',
    })
    expect(ollamaTextChatCallArgs[0].currentUserContentBlocks).toBeUndefined()
    expect(invoke).toHaveBeenCalledWith('branch.beginTurn', expect.objectContaining({ branchId: 'b1', userBody: 'ollama ping' }))
    expect(invoke).toHaveBeenCalledWith('message.appendDelta', expect.objectContaining({ convoId: 'c1', seq: 2 }))
    expect(invoke).toHaveBeenCalledWith('message.setStatus', expect.objectContaining({ messageId: 'a1', status: 'final' }))
    expect(invoke.mock.calls.map((call) => call[0])).not.toContain('modelPrefs.recordRecent')
  })

  it('syncs SettingsPanel-selected LocalEndpoint model for explicitly enabled chat only', async () => {
    globalThis.localStorage?.setItem('starverse.localEndpointTextChat.enabled', '1')
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    window.dispatchEvent(new CustomEvent('settings:localEndpointTextChatUpdated', {
      detail: {
        endpointUrl: 'http://localhost:4321/v1',
        model: 'settings-selected-model',
      },
    }))

    await user.click(draftBox())
    await user.type(draftBox(), 'settings local ping')
    await user.click(sendButton())

    await screen.findByText('settings local ping')
    await screen.findByText('local hi')

    expect(streamOpenRouterChatCallArgs).toHaveLength(0)
    expect(localEndpointTextChatCallArgs).toHaveLength(1)
    expect(localEndpointTextChatCallArgs[0]).toMatchObject({
      endpointUrl: 'http://localhost:4321/v1',
      model: 'settings-selected-model',
      userText: 'settings local ping',
    })
  })

  it('keeps LocalEndpoint chat default-off when SettingsPanel only applies endpoint and model defaults', async () => {
    globalThis.localStorage?.setItem('starverse.localEndpointTextChat.url', 'http://localhost:4321/v1')
    globalThis.localStorage?.setItem('starverse.localEndpointTextChat.model', 'settings-selected-model')
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    await user.click(draftBox())
    await user.type(draftBox(), 'default off ping')
    await user.click(sendButton())

    await screen.findByText('default off ping')
    await screen.findByText('hi')

    expect(localEndpointTextChatCallArgs).toHaveLength(0)
    expect(streamOpenRouterChatCallArgs).toHaveLength(1)
  })

  it('routes explicit OpenAI Responses text chat through the normal transcript without OpenRouter or Generic send', async () => {
    globalThis.localStorage?.setItem('starverse.openAIResponsesTextChat.enabled', '1')
    globalThis.localStorage?.setItem('starverse.openAIResponsesTextChat.model', 'gpt-4.1-mini')
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    await user.click(draftBox())
    await user.type(draftBox(), 'openai ping')
    await user.click(sendButton())

    await screen.findByText('openai ping')
    await screen.findByText('openai hi')
    await vi.runAllTimersAsync()

    const invoke = (globalThis as any).dbBridge.invoke as ReturnType<typeof vi.fn>
    expect(streamOpenRouterChatCallArgs).toHaveLength(0)
    expect(localEndpointTextChatCallArgs).toHaveLength(0)
    expect(openAIResponsesTextChatCallArgs).toHaveLength(1)
    expect(openAIResponsesTextChatCallArgs[0]).toMatchObject({
      model: 'gpt-4.1-mini',
      userText: 'openai ping',
    })
    expect(openAIResponsesTextChatCallArgs[0].currentUserContentBlocks).toBeUndefined()
    expect(invoke).toHaveBeenCalledWith('branch.beginTurn', expect.objectContaining({ branchId: 'b1', userBody: 'openai ping' }))
    expect(invoke).toHaveBeenCalledWith('message.appendDelta', expect.objectContaining({ convoId: 'c1', seq: 2 }))
    expect(invoke).toHaveBeenCalledWith('message.setStatus', expect.objectContaining({ messageId: 'a1', status: 'final' }))
    expect(invoke.mock.calls.map((call) => call[0])).not.toContain('modelPrefs.recordRecent')
  })

  it('routes explicit Google AI Studio text chat through the normal transcript without OpenRouter, old Gemini, or Generic send', async () => {
    globalThis.localStorage?.setItem('starverse.googleAIStudioTextChat.enabled', '1')
    globalThis.localStorage?.setItem('starverse.googleAIStudioTextChat.model', 'gemini-2.5-flash')
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    await user.click(draftBox())
    await user.type(draftBox(), 'gemini ping')
    await user.click(sendButton())

    await screen.findByText('gemini ping')
    await screen.findByText('gemini hi')
    await vi.runAllTimersAsync()

    const invoke = (globalThis as any).dbBridge.invoke as ReturnType<typeof vi.fn>
    expect(streamOpenRouterChatCallArgs).toHaveLength(0)
    expect(localEndpointTextChatCallArgs).toHaveLength(0)
    expect(openAIResponsesTextChatCallArgs).toHaveLength(0)
    expect(googleAIStudioTextChatCallArgs).toHaveLength(1)
    expect(googleAIStudioTextChatCallArgs[0]).toMatchObject({
      model: 'gemini-2.5-flash',
      userText: 'gemini ping',
    })
    expect(googleAIStudioTextChatCallArgs[0].currentUserContentBlocks).toBeUndefined()
    expect(invoke).toHaveBeenCalledWith('branch.beginTurn', expect.objectContaining({ branchId: 'b1', userBody: 'gemini ping' }))
    expect(invoke).toHaveBeenCalledWith('message.appendDelta', expect.objectContaining({ convoId: 'c1', seq: 2 }))
    expect(invoke).toHaveBeenCalledWith('message.setStatus', expect.objectContaining({ messageId: 'a1', status: 'final' }))
    expect(invoke.mock.calls.map((call) => call[0])).not.toContain('modelPrefs.recordRecent')
  })

  it('routes explicit DeepSeek official text chat through the normal transcript without OpenRouter, Anthropic-compatible, or Generic send', async () => {
    globalThis.localStorage?.setItem('starverse.deepSeekTextChat.enabled', '1')
    globalThis.localStorage?.setItem('starverse.deepSeekTextChat.model', 'deepseek-chat')
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    await user.click(draftBox())
    await user.type(draftBox(), 'deepseek ping')
    await user.click(sendButton())

    await screen.findByText('deepseek ping')
    await screen.findByText('deepseek hi')
    await vi.runAllTimersAsync()

    const invoke = (globalThis as any).dbBridge.invoke as ReturnType<typeof vi.fn>
    expect(streamOpenRouterChatCallArgs).toHaveLength(0)
    expect(localEndpointTextChatCallArgs).toHaveLength(0)
    expect(openAIResponsesTextChatCallArgs).toHaveLength(0)
    expect(googleAIStudioTextChatCallArgs).toHaveLength(0)
    expect(anthropicTextChatCallArgs).toHaveLength(0)
    expect(deepSeekTextChatCallArgs).toHaveLength(1)
    expect(deepSeekTextChatCallArgs[0]).toMatchObject({
      model: 'deepseek-chat',
      userText: 'deepseek ping',
    })
    expect(deepSeekTextChatCallArgs[0].currentUserContentBlocks).toBeUndefined()
    expect(invoke).toHaveBeenCalledWith('branch.beginTurn', expect.objectContaining({ branchId: 'b1', userBody: 'deepseek ping' }))
    expect(invoke).toHaveBeenCalledWith('message.appendDelta', expect.objectContaining({ convoId: 'c1', seq: 2 }))
    expect(invoke).toHaveBeenCalledWith('message.setStatus', expect.objectContaining({ messageId: 'a1', status: 'final' }))
    expect(invoke.mock.calls.map((call) => call[0])).not.toContain('modelPrefs.recordRecent')
  })

  it('keeps OpenAI Responses default-off when SettingsPanel only applies a model default', async () => {
    globalThis.localStorage?.setItem('starverse.openAIResponsesTextChat.model', 'gpt-4.1-mini')
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    await user.click(draftBox())
    await user.type(draftBox(), 'openai default off ping')
    await user.click(sendButton())

    await screen.findByText('openai default off ping')
    await screen.findByText('hi')

    expect(openAIResponsesTextChatCallArgs).toHaveLength(0)
    expect(streamOpenRouterChatCallArgs).toHaveLength(1)
  })

  it('keeps Google AI Studio default-off when SettingsPanel only applies a model default', async () => {
    globalThis.localStorage?.setItem('starverse.googleAIStudioTextChat.model', 'gemini-2.5-flash')
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    await user.click(draftBox())
    await user.type(draftBox(), 'google default off ping')
    await user.click(sendButton())

    await screen.findByText('google default off ping')
    await screen.findByText('hi')

    expect(googleAIStudioTextChatCallArgs).toHaveLength(0)
    expect(streamOpenRouterChatCallArgs).toHaveLength(1)
  })

  it('keeps DeepSeek official default-off when SettingsPanel only applies a model default', async () => {
    globalThis.localStorage?.setItem('starverse.deepSeekTextChat.model', 'deepseek-chat')
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    await user.click(draftBox())
    await user.type(draftBox(), 'deepseek default off ping')
    await user.click(sendButton())

    await screen.findByText('deepseek default off ping')
    await screen.findByText('hi')

    expect(deepSeekTextChatCallArgs).toHaveLength(0)
    expect(streamOpenRouterChatCallArgs).toHaveLength(1)
  })

  it('keeps DeepSeek, Anthropic, Google AI Studio, OpenAI Responses, and LocalEndpoint experimental modes mutually exclusive', async () => {
    globalThis.localStorage?.setItem('starverse.localEndpointTextChat.enabled', '1')
    globalThis.localStorage?.setItem('starverse.localEndpointTextChat.url', 'http://localhost:1234/v1')
    globalThis.localStorage?.setItem('starverse.localEndpointTextChat.model', 'local-model')
    globalThis.localStorage?.setItem('starverse.openAIResponsesTextChat.enabled', '1')
    globalThis.localStorage?.setItem('starverse.openAIResponsesTextChat.model', 'gpt-4.1-mini')
    globalThis.localStorage?.setItem('starverse.googleAIStudioTextChat.enabled', '1')
    globalThis.localStorage?.setItem('starverse.googleAIStudioTextChat.model', 'gemini-2.5-flash')
    globalThis.localStorage?.setItem('starverse.anthropicMessagesTextChat.enabled', '1')
    globalThis.localStorage?.setItem('starverse.anthropicMessagesTextChat.model', 'claude-sonnet-4-5')
    globalThis.localStorage?.setItem('starverse.deepSeekTextChat.enabled', '1')
    globalThis.localStorage?.setItem('starverse.deepSeekTextChat.model', 'deepseek-chat')
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    await user.click(draftBox())
    await user.type(draftBox(), 'mutual exclusion ping')
    await user.click(sendButton())

    await screen.findByText('mutual exclusion ping')
    await screen.findByText('deepseek hi')

    expect(deepSeekTextChatCallArgs).toHaveLength(1)
    expect(anthropicTextChatCallArgs).toHaveLength(0)
    expect(googleAIStudioTextChatCallArgs).toHaveLength(0)
    expect(openAIResponsesTextChatCallArgs).toHaveLength(0)
    expect(localEndpointTextChatCallArgs).toHaveLength(0)
    expect(streamOpenRouterChatCallArgs).toHaveLength(0)
    expect(globalThis.localStorage?.getItem('starverse.anthropicMessagesTextChat.enabled')).toBe('0')
    expect(globalThis.localStorage?.getItem('starverse.googleAIStudioTextChat.enabled')).toBe('0')
    expect(globalThis.localStorage?.getItem('starverse.openAIResponsesTextChat.enabled')).toBe('0')
    expect(globalThis.localStorage?.getItem('starverse.localEndpointTextChat.enabled')).toBe('0')
  })

  it('uses the explicit OpenRouter path when OpenAI Responses chat is disabled or cleared', async () => {
    globalThis.localStorage?.setItem('starverse.openAIResponsesTextChat.enabled', '1')
    globalThis.localStorage?.setItem('starverse.openAIResponsesTextChat.model', 'gpt-4.1-mini')
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    globalThis.localStorage?.removeItem('starverse.openAIResponsesTextChat.enabled')
    globalThis.localStorage?.removeItem('starverse.openAIResponsesTextChat.model')
    window.dispatchEvent(new StorageEvent('storage', { key: 'starverse.openAIResponsesTextChat.enabled' }))
    globalThis.localStorage?.setItem('starverse.openRouterTextChat.enabled', '1')
    window.dispatchEvent(new StorageEvent('storage', { key: 'starverse.openRouterTextChat.enabled' }))

    await user.click(draftBox())
    await user.type(draftBox(), 'cleared openai responses ping')
    await user.click(sendButton())

    await screen.findByText('cleared openai responses ping')
    await screen.findByText('hi')

    expect(openAIResponsesTextChatCallArgs).toHaveLength(0)
    expect(streamOpenRouterChatCallArgs).toHaveLength(1)
  })

  it('uses the explicit OpenRouter path when Google AI Studio chat is disabled or cleared', async () => {
    globalThis.localStorage?.setItem('starverse.googleAIStudioTextChat.enabled', '1')
    globalThis.localStorage?.setItem('starverse.googleAIStudioTextChat.model', 'gemini-2.5-flash')
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    globalThis.localStorage?.removeItem('starverse.googleAIStudioTextChat.enabled')
    globalThis.localStorage?.removeItem('starverse.googleAIStudioTextChat.model')
    window.dispatchEvent(new StorageEvent('storage', { key: 'starverse.googleAIStudioTextChat.enabled' }))
    globalThis.localStorage?.setItem('starverse.openRouterTextChat.enabled', '1')
    window.dispatchEvent(new StorageEvent('storage', { key: 'starverse.openRouterTextChat.enabled' }))

    await user.click(draftBox())
    await user.type(draftBox(), 'cleared google ai studio ping')
    await user.click(sendButton())

    await screen.findByText('cleared google ai studio ping')
    await screen.findByText('hi')

    expect(googleAIStudioTextChatCallArgs).toHaveLength(0)
    expect(streamOpenRouterChatCallArgs).toHaveLength(1)
  })

  it('uses the explicit OpenRouter path when LocalEndpoint chat is disabled or cleared', async () => {
    globalThis.localStorage?.setItem('starverse.localEndpointTextChat.enabled', '1')
    globalThis.localStorage?.setItem('starverse.localEndpointTextChat.url', 'http://localhost:4321/v1')
    globalThis.localStorage?.setItem('starverse.localEndpointTextChat.model', 'settings-selected-model')
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    globalThis.localStorage?.removeItem('starverse.localEndpointTextChat.enabled')
    globalThis.localStorage?.removeItem('starverse.localEndpointTextChat.url')
    globalThis.localStorage?.removeItem('starverse.localEndpointTextChat.model')
    window.dispatchEvent(new StorageEvent('storage', { key: 'starverse.localEndpointTextChat.enabled' }))
    globalThis.localStorage?.setItem('starverse.openRouterTextChat.enabled', '1')
    window.dispatchEvent(new StorageEvent('storage', { key: 'starverse.openRouterTextChat.enabled' }))

    await user.click(draftBox())
    await user.type(draftBox(), 'cleared local endpoint ping')
    await user.click(sendButton())

    await screen.findByText('cleared local endpoint ping')
    await screen.findByText('hi')

    expect(localEndpointTextChatCallArgs).toHaveLength(0)
    expect(streamOpenRouterChatCallArgs).toHaveLength(1)
  })

  it('uses the explicit OpenRouter path when DeepSeek official chat is disabled or cleared', async () => {
    globalThis.localStorage?.setItem('starverse.deepSeekTextChat.enabled', '1')
    globalThis.localStorage?.setItem('starverse.deepSeekTextChat.model', 'deepseek-chat')
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    globalThis.localStorage?.removeItem('starverse.deepSeekTextChat.enabled')
    globalThis.localStorage?.removeItem('starverse.deepSeekTextChat.model')
    window.dispatchEvent(new StorageEvent('storage', { key: 'starverse.deepSeekTextChat.enabled' }))
    globalThis.localStorage?.setItem('starverse.openRouterTextChat.enabled', '1')
    window.dispatchEvent(new StorageEvent('storage', { key: 'starverse.openRouterTextChat.enabled' }))

    await user.click(draftBox())
    await user.type(draftBox(), 'cleared deepseek ping')
    await user.click(sendButton())

    await screen.findByText('cleared deepseek ping')
    await screen.findByText('hi')

    expect(deepSeekTextChatCallArgs).toHaveLength(0)
    expect(streamOpenRouterChatCallArgs).toHaveLength(1)
  })

  it('uses selected model for next send and persists convo.meta.selectedModelKey', async () => {
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    const warmupBox = draftBox()
    await user.click(warmupBox)
    await user.type(warmupBox, 'warmup')
    await user.click(sendButton())
    await screen.findByText('warmup')
    await screen.findByText('hi')

    await user.click(await screen.findByTestId('current-model-pill'))
    await user.click(await screen.findByTestId(`model-picker-item-${imageCapableModel}`))

    const invoke = (globalThis as any).dbBridge.invoke as ReturnType<typeof vi.fn>
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        'convo.save',
        expect.objectContaining({
          id: 'c1',
          meta: expect.objectContaining({ selectedModelKey: imageCapableModel }),
        }),
      )
    })

    const box = draftBox()
    await user.click(box)
    await user.type(box, 'selected model send')
    await user.click(sendButton())

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        'branch.beginTurn',
        expect.objectContaining({ branchId: 'b1', userBody: 'selected model send' }),
      )
      const last = streamOpenRouterChatCallArgs[streamOpenRouterChatCallArgs.length - 1]
      expect(last?.config?.model).toBe(imageCapableModel)
    })

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        'modelPrefs.recordRecent',
        expect.objectContaining({
          scopeType: 'global',
          scopeId: '',
          providerKey: 'openrouter',
          modelId: imageCapableModel,
          modelKey: `openrouter::${imageCapableModel}`,
        }),
      )
    })
  })

  it('passes persisted image generation config for an image-capable model', async () => {
    convoListMeta = {
      selectedModelKey: imageCapableModel,
      imageGenerationMode: 'custom',
      imageGenerationCustom: {
        enabled: true,
        outputMode: 'image_only',
        aspectRatio: '16:9',
        imageSize: '2K',
        advancedJson: '',
      },
    }
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    const box = draftBox()
    await user.click(box)
    await user.type(box, 'draw a fox')
    await user.click(sendButton())

    await screen.findByText('draw a fox')
    await screen.findByText('hi')

    const last = streamOpenRouterChatCallArgs[streamOpenRouterChatCallArgs.length - 1]
    expect(last?.config?.imageGeneration).toMatchObject({
      capabilityClass: 'text_and_image',
      modalities: ['image'],
      imageConfig: {
        aspect_ratio: '16:9',
        image_size: '2K',
      },
    })
  })

  it('does not include aspect_ratio when persisted image aspect ratio is default', async () => {
    convoListMeta = {
      selectedModelKey: imageCapableModel,
      imageGenerationMode: 'custom',
      imageGenerationCustom: {
        enabled: true,
        outputMode: 'image_only',
        aspectRatio: '',
        imageSize: '2K',
        advancedJson: '',
      },
    }
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    const box = draftBox()
    await user.click(box)
    await user.type(box, 'draw with default aspect')
    await user.click(sendButton())

    await screen.findByText('draw with default aspect')
    await screen.findByText('hi')

    const last = streamOpenRouterChatCallArgs[streamOpenRouterChatCallArgs.length - 1]
    expect(last?.config?.imageGeneration).toBeDefined()
    expect(last?.config?.imageGeneration?.imageConfig).toBeDefined()
    expect(last?.config?.imageGeneration?.imageConfig?.aspect_ratio).toBe('1:1')
    expect(last?.config?.imageGeneration?.imageConfig?.image_size).toBe('2K')
  })

  it('uses persisted image size selection', async () => {
    convoListMeta = {
      selectedModelKey: imageCapableModel,
      imageGenerationMode: 'custom',
      imageGenerationCustom: {
        enabled: true,
        outputMode: 'image_only',
        aspectRatio: '',
        imageSize: '4K',
        advancedJson: '',
      },
    }
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    const box = draftBox()
    await user.click(box)
    await user.type(box, 'persisted size should apply')
    await user.click(sendButton())

    await screen.findByText('persisted size should apply')
    await screen.findByText('hi')

    const last = streamOpenRouterChatCallArgs[streamOpenRouterChatCallArgs.length - 1]
    expect(last?.config?.imageGeneration?.imageConfig?.image_size).toBe('4K')
  })

  it('does not send legacy pixel image_size from persisted convo config', async () => {
    convoListMeta = {
      selectedModelKey: imageCapableModel,
      imageGenerationMode: 'custom',
      imageGenerationCustom: {
        enabled: true,
        outputMode: 'image_only',
        aspectRatio: '',
        imageSize: '1024x1024',
        advancedJson: '',
      },
    }
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()
    await waitForAppReady()

    const box = draftBox()
    await user.click(box)
    await user.type(box, 'legacy size config')
    await user.click(sendButton())

    await screen.findByText('legacy size config')
    await screen.findByText('hi')

    const last = streamOpenRouterChatCallArgs[streamOpenRouterChatCallArgs.length - 1]
    expect(last?.config?.imageGeneration).toBeDefined()
    expect(last?.config?.imageGeneration?.imageConfig?.image_size).not.toBe('1024x1024')
    expect(last?.config?.imageGeneration?.imageConfig?.image_size).toBe('1K')
  })

  it('does not include image generation config when model is image-capable but toggle is off', async () => {
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()
    await user.click(await screen.findByTestId('current-model-pill'))
    await user.click(await screen.findByTestId(`model-picker-item-${imageCapableModel}`))
    await waitForAppReady()

    const box = draftBox()
    await user.click(box)
    await user.type(box, 'text only please')
    await user.click(sendButton())
    await screen.findByText('text only please')
    await screen.findByText('hi')

    const last = streamOpenRouterChatCallArgs[streamOpenRouterChatCallArgs.length - 1]
    expect(last?.config?.imageGeneration).toBeUndefined()
  })
})
