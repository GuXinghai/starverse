import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_OPENROUTER_TEST_MODEL, OPENROUTER_TEST_MODELS } from '@/next/openrouter/openRouterTestModels'
import AppChatApp from './AppChatApp.vue'

const streamOpenRouterChatCallArgs: any[] = []
const localEndpointTextChatCallArgs: any[] = []
const imageCapableModel = OPENROUTER_TEST_MODELS[1] ?? OPENROUTER_TEST_MODELS[0]

const draftBox = () => screen.getByTestId('composer-draft') as HTMLTextAreaElement
const sendButton = () => screen.getByTestId('composer-send')
const waitForAppReady = async () => {
  await waitFor(() => {
    expect(screen.getByTestId('current-model-pill')).toBeInTheDocument()
    expect(draftBox()).not.toBeDisabled()
  })
}

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

describe('ui-app AppChatApp (send: pure text)', () => {
  const originalDbBridge = (globalThis as any).dbBridge
  const originalElectronAPI = (globalThis as any).electronAPI
  const originalElectronStore = (globalThis as any).electronStore
  const originalSetTimeout = globalThis.setTimeout
  let convoListMeta: Record<string, unknown> | null = null

  beforeEach(() => {
    vi.useFakeTimers()
    streamOpenRouterChatCallArgs.length = 0
    localEndpointTextChatCallArgs.length = 0
    globalThis.localStorage?.removeItem('starverse.localEndpointTextChat.enabled')
    globalThis.localStorage?.removeItem('starverse.localEndpointTextChat.url')
    globalThis.localStorage?.removeItem('starverse.localEndpointTextChat.model')
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
    globalThis.setTimeout = originalSetTimeout
    vi.useRealTimers()
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

  it('returns to the OpenRouter path when LocalEndpoint chat is disabled or cleared', async () => {
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

    await user.click(draftBox())
    await user.type(draftBox(), 'cleared local endpoint ping')
    await user.click(sendButton())

    await screen.findByText('cleared local endpoint ping')
    await screen.findByText('hi')

    expect(localEndpointTextChatCallArgs).toHaveLength(0)
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
