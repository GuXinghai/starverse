import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_OPENROUTER_TEST_MODEL } from '@/next/openrouter/openRouterTestModels'
import AppChatApp from './AppChatApp.vue'

const streamOpenRouterChatCallArgs: any[] = []

vi.mock('@/next/modelCatalog/modelDetailService', () => ({
  getModelCatalogModelDetail: vi.fn(async () => ({
    providerKey: 'openrouter',
    modelId: DEFAULT_OPENROUTER_TEST_MODEL,
    item: {
      providerKey: 'openrouter',
      modelId: DEFAULT_OPENROUTER_TEST_MODEL,
      modelKey: 'openrouter::' + DEFAULT_OPENROUTER_TEST_MODEL,
      canonicalSlug: DEFAULT_OPENROUTER_TEST_MODEL,
      displayName: 'GPT-4o',
      description: null,
      vendor: 'openai',
      family: null,
      status: 'active',
      visibility: 'visible',
      contextLength: 128000,
      maxOutputTokens: 16384,
      architectureModality: 'text->text',
      inputModalities: ['text'],
      outputModalities: ['text'],
      tokenizer: null,
      instructType: null,
      supportedParameters: [],
      capabilities: {
        reasoning: true,
        tools: true,
        structuredOutputs: true,
        vision: false,
        longContext: true,
      },
      pricing: {
        prompt: null,
        completion: null,
        request: null,
        image: null,
        webSearch: null,
        internalReasoning: null,
        inputCacheRead: null,
        inputCacheWrite: null,
      },
      createdAtSec: 1,
      expirationDate: null,
      expirationAtSec: null,
      unknownExpiration: false,
      hasPerRequestLimits: false,
      hasDefaultParameters: false,
      perRequestLimits: null,
      defaultParameters: null,
      topProviderContextLength: null,
      topProviderIsModerated: false,
      firstSeenAtMs: 1,
      lastSeenAtMs: 1,
      syncedAtMs: 1,
      raw: {
        inputModalitiesJson: '["text"]',
        outputModalitiesJson: '["text"]',
        supportedParametersJson: '[]',
        capabilitiesJson: '{"reasoning":true,"tools":true,"structuredOutputs":true,"vision":false,"longContext":true}',
        pricingJson: null,
        perRequestLimitsJson: null,
        defaultParametersJson: null,
        rawJson: null,
      },
    },
    error: null,
  })),
}))

vi.mock('@/next/live/openRouterLiveStream', () => {
  async function* streamOpenRouterChatAsEvents(options: any) {
    streamOpenRouterChatCallArgs.push(options)
    yield { type: 'MetaDelta', meta: { id: 'gen_1', model: DEFAULT_OPENROUTER_TEST_MODEL } }
    yield { type: 'MessageDeltaText', messageId: String(options?.assistantMessageId ?? ''), choiceIndex: 0, text: 'o' }
    yield { type: 'MessageDeltaText', messageId: String(options?.assistantMessageId ?? ''), choiceIndex: 0, text: 'k' }
    yield { type: 'StreamDone' }
  }
  return { streamOpenRouterChatAsEvents }
})

type PersistedMessage = {
  id: string
  convoId: string
  role: 'user' | 'assistant' | 'tool'
  seq: number
  createdAt: number
  parentId: string | null
  status: 'streaming' | 'final' | 'error'
  answerRootId: string | null
  questionId: string | null
  body: string
  meta: any
}

const defaultInboxProject = Object.freeze({
  id: 'project_inbox',
  name: 'Inbox',
  createdAt: 1,
  updatedAt: 1,
  meta: null,
  isSystemProject: true,
})

const defaultConvoRow = Object.freeze({
  id: 'c1',
  title: 'Chat 1',
  createdAt: 1,
  updatedAt: 2,
  meta: { selectedModelKey: DEFAULT_OPENROUTER_TEST_MODEL },
})

let historyAttachmentRowsByMessageId: Record<string, Array<Record<string, unknown>>> = {}
let fileAssetsById: Record<string, Record<string, unknown>> = {}
let replayPrepareStatusByMessageId: Record<string, 'sendable' | 'blocked' | 'needs_confirmation'> = {}
let replayPrepareBlockingReasonByMessageId: Record<string, string> = {}

function makeEmptyDraft(conversationId = 'c1') {
  return {
    conversationId,
    draftText: '',
    draftMode: 'compose' as const,
    editingSourceMessageId: null,
    attachedAssetIds: [],
    attachments: [],
    updatedAt: 1,
  }
}

function mockProjectBootstrapCalls(method: string) {
  if (method === 'project.getInbox') return defaultInboxProject
  if (method === 'project.list') return [defaultInboxProject]
  if (method === 'project.countConversationsBatch') {
    return { counts: { [defaultInboxProject.id]: 0 } }
  }
  return undefined
}

function mockStableAppBootstrapCalls(method: string, params?: any) {
  const projectBootstrap = mockProjectBootstrapCalls(method)
  if (projectBootstrap !== undefined) return projectBootstrap
  if (method === 'settings.getReasoningPrefs') return { value: null }
  if (method === 'settings.getWebSearchDefaults') return { value: null }
  if (method === 'settings.getSamplingParamsDefaults') return { value: null }
  if (method === 'settings.getUserMessageRenderDefault') return { value: null }
  if (method === 'settings.getImageGenerationDefault') return { value: null }
  if (method === 'settings.getChatReasoningDisplayMode') return { value: 'inline' }
  if (method === 'settings.setChatReasoningDisplayMode') return { ok: true }
  if (method === 'convo.list') return [defaultConvoRow]
  if (method === 'modelCatalog.list') {
    return [
      {
        modelId: DEFAULT_OPENROUTER_TEST_MODEL,
        name: 'GPT-4o',
        vendor: 'openai',
        lastSeenSnapshotId: 's1',
        isHidden: 0,
        supportedParametersJson: '[]',
      },
    ]
  }
  if (method === 'modelCatalog.queryCore') {
    return {
      items: [
        {
          providerKey: 'openrouter',
          modelId: DEFAULT_OPENROUTER_TEST_MODEL,
          modelKey: 'openrouter::' + DEFAULT_OPENROUTER_TEST_MODEL,
          canonicalSlug: DEFAULT_OPENROUTER_TEST_MODEL,
          displayName: 'GPT-4o',
          description: 'text only',
          vendor: 'openai',
          contextLength: 128000,
          maxOutputTokens: 16384,
          createdAtSec: 1,
          pricePrompt: null,
          priceCompletion: null,
          priceRequest: null,
          priceImage: null,
          capReasoning: 1,
          capTools: 1,
          capStructuredOutputs: 1,
          capVision: 0,
          capLongContext: 1,
        },
      ],
      nextCursor: null,
      notice: null,
    }
  }
  if (method === 'reasoningIndex.list') return []
  if (method === 'modelCatalog.getModelDetail') {
    return {
      providerKey: 'openrouter',
      modelId: DEFAULT_OPENROUTER_TEST_MODEL,
      item: {
        providerKey: 'openrouter',
        modelId: DEFAULT_OPENROUTER_TEST_MODEL,
        modelKey: 'openrouter::' + DEFAULT_OPENROUTER_TEST_MODEL,
        canonicalSlug: DEFAULT_OPENROUTER_TEST_MODEL,
        displayName: 'GPT-4o',
        description: null,
        vendor: 'openai',
        family: null,
        status: 'active',
        visibility: 'visible',
        contextLength: 128000,
        maxOutputTokens: 16384,
        architectureModality: 'text->text',
        inputModalities: ['text'],
        outputModalities: ['text'],
        tokenizer: null,
        instructType: null,
        supportedParameters: [],
        capabilities: {
          reasoning: true,
          tools: true,
          structuredOutputs: true,
          vision: false,
          longContext: true,
        },
        pricing: {
          prompt: null,
          completion: null,
          request: null,
          image: null,
          webSearch: null,
          internalReasoning: null,
          inputCacheRead: null,
          inputCacheWrite: null,
        },
        createdAtSec: 1,
        expirationDate: null,
        expirationAtSec: null,
        unknownExpiration: false,
        hasPerRequestLimits: false,
        hasDefaultParameters: false,
        perRequestLimits: null,
        defaultParameters: null,
        topProviderContextLength: null,
        topProviderIsModerated: false,
        firstSeenAtMs: 1,
        lastSeenAtMs: 1,
        syncedAtMs: 1,
        raw: {
          inputModalitiesJson: '["text"]',
          outputModalitiesJson: '["text"]',
          supportedParametersJson: '[]',
          capabilitiesJson: '{"reasoning":true,"tools":true,"structuredOutputs":true,"vision":false,"longContext":true}',
          pricingJson: null,
          perRequestLimitsJson: null,
          defaultParametersJson: null,
          rawJson: null,
        },
      },
      error: null,
    }
  }
  if (method === 'conversationDraft.restore') return makeEmptyDraft(String(params?.conversationId ?? 'c1'))
  if (method === 'conversationDraft.updateText') return makeEmptyDraft(String(params?.conversationId ?? 'c1'))
  if (method === 'sendPlan.buildCurrent') {
    return {
      sendPlan: {
        status: 'sendable',
        warnings: [],
        blockingReasons: [],
        includedAttachments: [],
        excludedAttachments: [],
        attachmentPlans: [],
        requiresModelChange: false,
        canProceedAfterDroppingExcluded: false,
        requiresUserConfirmation: false,
        plannerVersion: 'phase-5/v1',
      },
      draftText: '',
      assets: [],
      storageRootDir: 'C:/tmp',
    }
  }
  if (method === 'sendPlan.prepareOpenRouterReplayFromMessage') {
    const userMessageId = String(params?.userMessageId ?? '')
    const replayStatus = replayPrepareStatusByMessageId[userMessageId] ?? 'sendable'
    const text = typeof params?.editedUserText === 'string' && params.editedUserText.trim().length > 0 ? params.editedUserText : 'Q1'
    const attachmentRows = historyAttachmentRowsByMessageId[userMessageId] ?? []
    const rawDecisions = Array.isArray(params?.attachmentDecisions) ? params.attachmentDecisions as Array<Record<string, unknown>> : []
    const excludedByDecision = new Set(
      rawDecisions
        .filter((item) => String(item?.decision ?? '').trim() === 'exclude')
        .map((item) => String(item?.attachmentId ?? '').trim())
        .filter(Boolean)
    )
    const excludedRows = attachmentRows.filter((row: any) => {
      const includeInNextRequest = row?.includeInNextRequest === true
      const hasExcludedReason = String(row?.excludedReason ?? '').trim().length > 0
      return !includeInNextRequest || hasExcludedReason
    })
    const unresolvedExcludedRows = excludedRows.filter((row: any) => !excludedByDecision.has(String(row?.id ?? '')))
    const effectiveStatus: 'sendable' | 'blocked' | 'needs_confirmation' =
      replayStatus === 'needs_confirmation' && excludedRows.length > 0 && unresolvedExcludedRows.length === 0
        ? 'sendable'
        : replayStatus
    const includedRows = attachmentRows.filter((row: any) => {
      if (row?.includeInNextRequest !== true) return false
      if (excludedByDecision.has(String(row?.id ?? ''))) return false
      return true
    })
    const includedAssetIds = includedRows
      .map((row) => String(row?.assetId ?? '').trim())
      .filter(Boolean)
      .filter((id) => {
        const asset = fileAssetsById[id]
        if (!asset) return false
        if (asset?.deletedAt != null || asset?.ingestStatus === 'deleted') return false
        if (asset?.sourceMetaJson?.previewOnly === true) return false
        return true
      })
    const nonTextBlocks = includedAssetIds
      .map((id) => {
        const asset = fileAssetsById[id]
        const url = String(asset?.sourceMetaJson?.resolvedUrl ?? asset?.sourceMetaJson?.originalUrl ?? '').trim()
        if (!url) return null
        return {
          type: 'image_url',
          image_url: { url },
        }
      })
      .filter(Boolean)
    return {
      status: effectiveStatus,
      currentUserContentBlocks: [{ type: 'text', text }, ...nonTextBlocks],
      sentAssetIds: includedAssetIds,
      includedAttachments: includedAssetIds.map((assetId) => ({ assetId, source: 'history', attachmentId: `att-${assetId}`, messageId: userMessageId })),
      excludedAttachments: excludedRows.map((row: any) => ({
        assetId: String(row?.assetId ?? ''),
        source: 'history',
        attachmentId: String(row?.id ?? ''),
        messageId: userMessageId,
        exclusionReason: String(row?.excludedReason ?? 'history_attachment_excluded') || 'history_attachment_excluded',
      })),
      blockingReasons: effectiveStatus === 'sendable' ? [] : [{ code: effectiveStatus === 'needs_confirmation' ? 'history_attachment_excluded' : 'hard_gate_blocked', message: replayPrepareBlockingReasonByMessageId[userMessageId] ?? 'blocked by replay policy' }],
      diagnostics: { sendPlanStatus: effectiveStatus === 'sendable' ? 'sendable' : effectiveStatus === 'needs_confirmation' ? 'partially_sendable' : 'blocked' },
      modelCapabilitySnapshot: { modelId: DEFAULT_OPENROUTER_TEST_MODEL, providerKey: 'openrouter' },
      manifestDraft: { replayMode: 'current', sourceUserMessageId: userMessageId, sentAssetIds: includedAssetIds, attachmentDecisions: rawDecisions },
    }
  }
  if (method === 'messageError.listByMessageIds') return []
  if (method === 'messageAsset.listByMessageIds') return []
  if (method === 'modelPrefs.listRecents') return []
  return undefined
}

describe('ui-app AppChatApp (regenerate + retry replace)', () => {
  const originalDbBridge = (globalThis as any).dbBridge
  const originalElectronStore = (globalThis as any).electronStore
  const originalSetTimeout = globalThis.setTimeout
  beforeEach(() => {
    vi.useFakeTimers()
    streamOpenRouterChatCallArgs.length = 0
    historyAttachmentRowsByMessageId = {}
    fileAssetsById = {}
    replayPrepareStatusByMessageId = {}
    replayPrepareBlockingReasonByMessageId = {}
    globalThis.setTimeout = ((fn: (...args: any[]) => void) => originalSetTimeout(fn, 0)) as any

    ;(globalThis as any).electronStore = {
      get: vi.fn(async (key: string) => {
        if (key === 'openRouterApiKey') return 'sk-test'
        if (key === 'openRouterBaseUrl') return 'https://openrouter.ai/api/v1'
        return undefined
      }),
    }
  })

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
    ;(globalThis as any).electronStore = originalElectronStore
    globalThis.setTimeout = originalSetTimeout
    vi.useRealTimers()
  })

  function makeReplayAttachmentRows(messageId: string) {
    return [
      {
        id: `att-${messageId}-image`,
        messageId,
        assetId: 'asset-history-image',
        aiPayloadKind: 'image',
        processingStatus: 'native_supported',
        includeInNextRequest: true,
        excludedReason: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: `att-${messageId}-preview-only`,
        messageId,
        assetId: 'asset-history-preview-only',
        aiPayloadKind: 'image',
        processingStatus: 'native_supported',
        includeInNextRequest: false,
        excludedReason: 'preview_only_asset_not_sendable',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]
  }

  function makeReplayAssets() {
    return {
      'asset-history-image': {
        id: 'asset-history-image',
        sha256: null,
        filename: 'diagram.png',
        extension: 'png',
        mime: 'image/png',
        sizeBytes: 42,
        assetKind: 'image',
        sourceKind: 'url_import',
        storageBackend: 'remote_url',
        storageUri: 'https://cdn.example.test/diagram.png',
        ingestStatus: 'stored',
        previewStatus: 'ready',
        sourceMetaJson: {
          originalUrl: 'https://cdn.example.test/diagram.png',
          resolvedUrl: 'https://cdn.example.test/diagram.png',
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deletedAt: null,
      },
      'asset-history-preview-only': {
        id: 'asset-history-preview-only',
        sha256: null,
        filename: 'preview-only.png',
        extension: 'png',
        mime: 'image/png',
        sizeBytes: 21,
        assetKind: 'image',
        sourceKind: 'derived',
        storageBackend: 'local_fs',
        storageUri: 'assets/derived/as/asset-history-preview-only.png',
        ingestStatus: 'stored',
        previewStatus: 'ready',
        sourceMetaJson: {
          previewOnly: true,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deletedAt: null,
      },
    }
  }

  it('regenerate creates a new answer root, updates < i/n >, and streams into the new assistant', async () => {
    const user = userEvent.setup()

    const convoId = 'c1'
    const branchId = 'b1'
    const now = Date.now()

    const store: {
      headMessageId: string | null
      chosenAnswerRootId: string
      candidatesNewToOld: Array<{ answerRootId: string; createdAt: number; status: string }>
      messagesById: Record<string, PersistedMessage>
    } = {
      headMessageId: 'a1',
      chosenAnswerRootId: 'a1',
      candidatesNewToOld: [{ answerRootId: 'a1', createdAt: now + 2, status: 'final' }],
      messagesById: {
        u1: {
          id: 'u1',
          convoId,
          role: 'user',
          seq: 1,
          createdAt: now,
          parentId: null,
          status: 'final',
          answerRootId: null,
          questionId: null,
          body: 'Q1',
          meta: null,
        },
        a1: {
          id: 'a1',
          convoId,
          role: 'assistant',
          seq: 2,
          createdAt: now + 1,
          parentId: 'u1',
          status: 'final',
          answerRootId: 'a1',
          questionId: 'u1',
          body: 'A1',
          meta: null,
        },
      },
    }

    const invoke = vi.fn(async (method: string, params?: any) => {
      const projectBootstrap = mockStableAppBootstrapCalls(method, params)
      if (projectBootstrap !== undefined) return projectBootstrap
      if (method === 'convo.list') return [{ id: convoId, title: 'Chat 1', createdAt: 1, updatedAt: 1 }]
      if (method === 'branch.ensureDefault') {
        return { id: branchId, convoId, headMessageId: store.headMessageId, name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }
      }
      if (method === 'branch.list') {
        return [{ id: branchId, convoId, headMessageId: store.headMessageId, name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }]
      }
      if (method === 'context.getRenderableTurns') {
        const q = store.messagesById.u1
        const chosen = store.messagesById[store.chosenAnswerRootId]
        return {
          messages: [q, chosen],
          turns: [{ questionId: 'u1', chosenAnswerRootId: store.chosenAnswerRootId, questionMode: 'include', answerMode: 'include', effectiveMode: 'include', lockedByQuestionExclude: false }],
        }
      }
      if (method === 'context.buildForBranch') {
        return { messages: [] }
      }
      if (method === 'branch.getCandidates') {
        return store.candidatesNewToOld
      }
      if (method === 'branch.regenerateFromQuestion') {
        const createdAt = Date.now()
        store.messagesById.a2 = {
          id: 'a2',
          convoId,
          role: 'assistant',
          seq: 3,
          createdAt,
          parentId: 'u1',
          status: 'streaming',
          answerRootId: 'a2',
          questionId: 'u1',
          body: '',
          meta: null,
        }
        store.headMessageId = 'a2'
        store.chosenAnswerRootId = 'a2'
        store.candidatesNewToOld = [
          { answerRootId: 'a2', createdAt: createdAt + 1, status: 'streaming' },
          ...store.candidatesNewToOld,
        ]
        return { ok: true, newAnswerRootId: 'a2', newAssistantSeq: 3 }
      }
      if (method === 'message.appendDelta') {
        const seq = Number(params?.seq ?? NaN)
        const appendBody = String(params?.appendBody ?? '')
        const msg = Object.values(store.messagesById).find((m) => m.seq === seq)
        if (msg) msg.body = String(msg.body ?? '') + appendBody
        return { ok: true }
      }
      if (method === 'message.setStatus') {
        const messageId = String(params?.messageId ?? '')
        const status = String(params?.status ?? '')
        const msg = store.messagesById[messageId]
        if (msg) msg.status = status as any
        return { ok: true }
      }
      if (method === 'modelPrefs.recordRecent') {
        const nowTs = Date.now()
        return {
          scopeType: 'global',
          scopeId: '',
          providerKey: String(params?.providerKey ?? 'openrouter'),
          modelId: String(params?.modelId ?? ''),
          modelKey: String(params?.modelKey ?? ''),
          lastUsedAtMs: nowTs,
          useCount: 1,
          createdAtMs: nowTs,
          updatedAtMs: nowTs,
        }
      }
      return { ok: true }
    })

    ;(globalThis as any).dbBridge = { invoke }

    render(AppChatApp)

    await screen.findByRole('button', { name: /Chat 1/ })
    await screen.findByText('Q1')
    await screen.findByText('A1')

    const regen = await screen.findByTestId('regen-q-u1')
    expect(regen).not.toBeDisabled()
    await user.click(regen)

    await screen.findByText('ok')
    await waitFor(() => expect(screen.getByTestId('cand-pos-u1').textContent).toBe('2/2'))

    await vi.runAllTimersAsync()

    expect(invoke).toHaveBeenCalledWith('branch.regenerateFromQuestion', expect.objectContaining({ branchId: 'b1', questionId: 'u1' }))
    expect(invoke).toHaveBeenCalledWith('message.appendDelta', expect.objectContaining({ convoId: 'c1', seq: 3 }))
    expect(invoke).toHaveBeenCalledWith('message.setStatus', expect.objectContaining({ messageId: 'a2', status: 'final' }))
    expect(invoke).toHaveBeenCalledWith(
      'modelPrefs.recordRecent',
      expect.objectContaining({
        scopeType: 'global',
        scopeId: '',
        providerKey: 'openrouter',
        modelId: DEFAULT_OPENROUTER_TEST_MODEL,
        modelKey: 'openrouter::' + DEFAULT_OPENROUTER_TEST_MODEL,
      }),
    )
    expect(invoke.mock.calls.filter((c) => c[0] === 'branch.getCandidates').length).toBeGreaterThanOrEqual(2)
  })

  it('regenerate replays historical attachments into the OpenRouter request', async () => {
    const user = userEvent.setup()

    const convoId = 'c1'
    const branchId = 'b1'
    const now = Date.now()
    historyAttachmentRowsByMessageId = {
      u1: makeReplayAttachmentRows('u1'),
    }
    fileAssetsById = makeReplayAssets()

    const store: {
      headMessageId: string | null
      chosenAnswerRootId: string
      candidatesNewToOld: Array<{ answerRootId: string; createdAt: number; status: string }>
      messagesById: Record<string, PersistedMessage>
    } = {
      headMessageId: 'a1',
      chosenAnswerRootId: 'a1',
      candidatesNewToOld: [{ answerRootId: 'a1', createdAt: now + 2, status: 'final' }],
      messagesById: {
        u1: {
          id: 'u1',
          convoId,
          role: 'user',
          seq: 1,
          createdAt: now,
          parentId: null,
          status: 'final',
          answerRootId: null,
          questionId: null,
          body: 'Q1',
          meta: null,
        },
        a1: {
          id: 'a1',
          convoId,
          role: 'assistant',
          seq: 2,
          createdAt: now + 1,
          parentId: 'u1',
          status: 'final',
          answerRootId: 'a1',
          questionId: 'u1',
          body: 'A1',
          meta: null,
        },
      },
    }

    const invoke = vi.fn(async (method: string, params?: any) => {
      const projectBootstrap = mockStableAppBootstrapCalls(method, params)
      if (projectBootstrap !== undefined) return projectBootstrap
      if (method === 'convo.list') return [{ id: convoId, title: 'Chat 1', createdAt: 1, updatedAt: 1 }]
      if (method === 'branch.ensureDefault') {
        return { id: branchId, convoId, headMessageId: store.headMessageId, name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }
      }
      if (method === 'branch.list') {
        return [{ id: branchId, convoId, headMessageId: store.headMessageId, name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }]
      }
      if (method === 'context.getRenderableTurns') {
        const q = store.messagesById.u1
        const chosen = store.messagesById[store.chosenAnswerRootId]
        return {
          messages: [q, chosen],
          turns: [{ questionId: 'u1', chosenAnswerRootId: store.chosenAnswerRootId, questionMode: 'include', answerMode: 'include', effectiveMode: 'include', lockedByQuestionExclude: false }],
        }
      }
      if (method === 'context.buildForBranch') return { messages: [] }
      if (method === 'branch.getCandidates') return store.candidatesNewToOld
      if (method === 'messageAttachment.listByMessageId') {
        return historyAttachmentRowsByMessageId[String(params?.messageId ?? '')] ?? []
      }
      if (method === 'fileAsset.listByIds') {
        const ids = Array.isArray(params?.ids) ? params.ids.map((value: unknown) => String(value ?? '').trim()).filter(Boolean) : []
        return ids.map((id: string) => fileAssetsById[id]).filter(Boolean)
      }
      if (method === 'preview.getLatestReady') {
        return {
          assetId: String(params?.assetId ?? ''),
          status: 'ready',
          derivativeId: 'preview-1',
          mime: 'image/png',
          dataUrl: 'data:image/png;base64,AA==',
          width: 64,
          height: 64,
          bytes: 8,
          reused: false,
          errorCode: null,
          errorMessage: null,
        }
      }
      if (method === 'preview.ensure') {
        return {
          assetId: String(params?.assetId ?? ''),
          status: 'ready',
          derivativeId: 'preview-1',
          mime: 'image/png',
          dataUrl: 'data:image/png;base64,BB==',
          width: 64,
          height: 64,
          bytes: 8,
          reused: true,
          errorCode: null,
          errorMessage: null,
        }
      }
      if (method === 'branch.regenerateFromQuestion') {
        const createdAt = Date.now()
        store.messagesById.a2 = {
          id: 'a2',
          convoId,
          role: 'assistant',
          seq: 3,
          createdAt,
          parentId: 'u1',
          status: 'streaming',
          answerRootId: 'a2',
          questionId: 'u1',
          body: '',
          meta: null,
        }
        store.headMessageId = 'a2'
        store.chosenAnswerRootId = 'a2'
        store.candidatesNewToOld = [
          { answerRootId: 'a2', createdAt: createdAt + 1, status: 'streaming' },
          ...store.candidatesNewToOld,
        ]
        return { ok: true, newAnswerRootId: 'a2', newAssistantSeq: 3 }
      }
      if (method === 'message.appendDelta') {
        const seq = Number(params?.seq ?? NaN)
        const appendBody = String(params?.appendBody ?? '')
        const msg = Object.values(store.messagesById).find((m) => m.seq === seq)
        if (msg) msg.body = String(msg.body ?? '') + appendBody
        return { ok: true }
      }
      if (method === 'message.setStatus') {
        const messageId = String(params?.messageId ?? '')
        const status = String(params?.status ?? '')
        const msg = store.messagesById[messageId]
        if (msg) msg.status = status as any
        return { ok: true }
      }
      if (method === 'modelPrefs.recordRecent') {
        const nowTs = Date.now()
        return {
          scopeType: 'global',
          scopeId: '',
          providerKey: 'openrouter',
          modelId: DEFAULT_OPENROUTER_TEST_MODEL,
          modelKey: `openrouter::${DEFAULT_OPENROUTER_TEST_MODEL}`,
          lastUsedAtMs: nowTs,
          useCount: 1,
          createdAtMs: nowTs,
          updatedAtMs: nowTs,
        }
      }
      return { ok: true }
    })

    ;(globalThis as any).dbBridge = { invoke }

    render(AppChatApp)
    await screen.findByText('Q1')
    await screen.findByText('A1')

    const regen = await screen.findByTestId('regen-q-u1')
    await user.click(regen)
    await screen.findByTestId('attachment-confirm-panel')
    await user.click(screen.getByTestId('attachment-confirm-history-exclude-all-checkbox'))
    await user.click(screen.getByTestId('attachment-confirm-confirm'))

    await screen.findByText('ok')
    await waitFor(() => expect(screen.getByTestId('cand-pos-u1').textContent).toBe('2/2'))
    await vi.runAllTimersAsync()

    expect(invoke).toHaveBeenCalledWith(
      'message.setStatus',
      expect.objectContaining({
        messageId: 'a2',
        status: 'final',
        metaPatch: expect.objectContaining({
          currentReplayManifestDraft: expect.objectContaining({
            replayMode: 'current',
            sourceUserMessageId: 'u1',
          }),
        }),
      }),
    )

    const lastCall = streamOpenRouterChatCallArgs.at(-1)
    expect(lastCall).toEqual(expect.objectContaining({
      userText: 'Q1',
      currentUserContentBlocks: expect.any(Array),
      contextMessages: expect.any(Array),
    }))
    const currentUserContentBlocks = lastCall.currentUserContentBlocks as any[]
    expect(currentUserContentBlocks.length).toBeGreaterThan(1)
    expect(currentUserContentBlocks.some((block: any) => block.type !== 'text')).toBe(true)
    expect(currentUserContentBlocks[0]).toMatchObject({ type: 'text', text: 'Q1' })
    expect(currentUserContentBlocks[1]).toEqual(expect.objectContaining({ type: 'image_url' }))
  })

  it('retry replace hides old candidate (branch-local), selects new candidate, updates < i/n >, and streams', async () => {
    const user = userEvent.setup()

    const convoId = 'c1'
    const branchId = 'b1'
    const now = Date.now()

    const store: {
      headMessageId: string | null
      chosenAnswerRootId: string
      hidden: Set<string>
      candidatesNewToOld: Array<{ answerRootId: string; createdAt: number; status: string }>
      messagesById: Record<string, PersistedMessage>
    } = {
      headMessageId: 'a1',
      chosenAnswerRootId: 'a1',
      hidden: new Set(),
      candidatesNewToOld: [
        { answerRootId: 'a1', createdAt: now + 3, status: 'final' },
        { answerRootId: 'a0', createdAt: now + 2, status: 'final' },
      ],
      messagesById: {
        u1: {
          id: 'u1',
          convoId,
          role: 'user',
          seq: 1,
          createdAt: now,
          parentId: null,
          status: 'final',
          answerRootId: null,
          questionId: null,
          body: 'Q1',
          meta: null,
        },
        a1: {
          id: 'a1',
          convoId,
          role: 'assistant',
          seq: 3,
          createdAt: now + 1,
          parentId: 'u1',
          status: 'final',
          answerRootId: 'a1',
          questionId: 'u1',
          body: 'A1',
          meta: null,
        },
      },
    }

    const visibleCandidates = () => store.candidatesNewToOld.filter((c) => !store.hidden.has(c.answerRootId))

    const invoke = vi.fn(async (method: string, params?: any) => {
      const projectBootstrap = mockStableAppBootstrapCalls(method, params)
      if (projectBootstrap !== undefined) return projectBootstrap
      if (method === 'convo.list') return [{ id: convoId, title: 'Chat 1', createdAt: 1, updatedAt: 1 }]
      if (method === 'branch.ensureDefault') {
        return { id: branchId, convoId, headMessageId: store.headMessageId, name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }
      }
      if (method === 'branch.list') {
        return [{ id: branchId, convoId, headMessageId: store.headMessageId, name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }]
      }
      if (method === 'context.getRenderableTurns') {
        const q = store.messagesById.u1
        const chosen = store.messagesById[store.chosenAnswerRootId]
        return {
          messages: [q, chosen],
          turns: [{ questionId: 'u1', chosenAnswerRootId: store.chosenAnswerRootId, questionMode: 'include', answerMode: 'include', effectiveMode: 'include', lockedByQuestionExclude: false }],
        }
      }
      if (method === 'context.buildForBranch') return { messages: [] }
      if (method === 'branch.getCandidates') return visibleCandidates()
      if (method === 'branch.retryReplaceAnswer') {
        store.hidden.add(String(params?.currentAnswerRootId ?? ''))
        const createdAt = Date.now()
        store.messagesById.a2 = {
          id: 'a2',
          convoId,
          role: 'assistant',
          seq: 4,
          createdAt,
          parentId: 'u1',
          status: 'streaming',
          answerRootId: 'a2',
          questionId: 'u1',
          body: '',
          meta: null,
        }
        store.headMessageId = 'a2'
        store.chosenAnswerRootId = 'a2'
        store.candidatesNewToOld = [
          { answerRootId: 'a2', createdAt: createdAt + 1, status: 'streaming' },
          ...store.candidatesNewToOld,
        ]
        return { ok: true, newAnswerRootId: 'a2', newAssistantSeq: 4 }
      }
      if (method === 'message.appendDelta') {
        const seq = Number(params?.seq ?? NaN)
        const appendBody = String(params?.appendBody ?? '')
        const msg = Object.values(store.messagesById).find((m) => m.seq === seq)
        if (msg) msg.body = String(msg.body ?? '') + appendBody
        return { ok: true }
      }
      if (method === 'message.setStatus') {
        const messageId = String(params?.messageId ?? '')
        const status = String(params?.status ?? '')
        const msg = store.messagesById[messageId]
        if (msg) msg.status = status as any
        return { ok: true }
      }
      if (method === 'modelPrefs.recordRecent') {
        const nowTs = Date.now()
        return {
          scopeType: 'global',
          scopeId: '',
          providerKey: String(params?.providerKey ?? 'openrouter'),
          modelId: String(params?.modelId ?? ''),
          modelKey: String(params?.modelKey ?? ''),
          lastUsedAtMs: nowTs,
          useCount: 1,
          createdAtMs: nowTs,
          updatedAtMs: nowTs,
        }
      }
      return { ok: true }
    })

    ;(globalThis as any).dbBridge = { invoke }

    render(AppChatApp)

    const retry = await screen.findByTestId('retry-a-a1')
    expect(retry).not.toBeDisabled()
    await user.click(retry)

    await screen.findByText('ok')
    await waitFor(() => expect(screen.getByTestId('cand-pos-u1').textContent).toBe('2/2'))

    await vi.runAllTimersAsync()

    expect(invoke).toHaveBeenCalledWith(
      'branch.retryReplaceAnswer',
      expect.objectContaining({ branchId: 'b1', questionId: 'u1', currentAnswerRootId: 'a1' })
    )
    expect(invoke).toHaveBeenCalledWith('message.appendDelta', expect.objectContaining({ convoId: 'c1', seq: 4 }))
    expect(invoke).toHaveBeenCalledWith('message.setStatus', expect.objectContaining({ messageId: 'a2', status: 'final' }))
    expect(invoke).toHaveBeenCalledWith(
      'modelPrefs.recordRecent',
      expect.objectContaining({
        scopeType: 'global',
        scopeId: '',
        providerKey: 'openrouter',
        modelId: DEFAULT_OPENROUTER_TEST_MODEL,
        modelKey: 'openrouter::' + DEFAULT_OPENROUTER_TEST_MODEL,
      }),
    )
    expect(visibleCandidates().map((c) => c.answerRootId)).not.toContain('a1')
  })

  it('retry replace replays historical attachments into the OpenRouter request', async () => {
    const user = userEvent.setup()

    const convoId = 'c1'
    const branchId = 'b1'
    const now = Date.now()
    historyAttachmentRowsByMessageId = {
      u1: makeReplayAttachmentRows('u1'),
    }
    fileAssetsById = makeReplayAssets()

    const store: {
      headMessageId: string | null
      chosenAnswerRootId: string
      hidden: Set<string>
      candidatesNewToOld: Array<{ answerRootId: string; createdAt: number; status: string }>
      messagesById: Record<string, PersistedMessage>
    } = {
      headMessageId: 'a1',
      chosenAnswerRootId: 'a1',
      hidden: new Set(),
      candidatesNewToOld: [
        { answerRootId: 'a1', createdAt: now + 3, status: 'final' },
        { answerRootId: 'a0', createdAt: now + 2, status: 'final' },
      ],
      messagesById: {
        u1: {
          id: 'u1',
          convoId,
          role: 'user',
          seq: 1,
          createdAt: now,
          parentId: null,
          status: 'final',
          answerRootId: null,
          questionId: null,
          body: 'Q1',
          meta: null,
        },
        a1: {
          id: 'a1',
          convoId,
          role: 'assistant',
          seq: 3,
          createdAt: now + 1,
          parentId: 'u1',
          status: 'final',
          answerRootId: 'a1',
          questionId: 'u1',
          body: 'A1',
          meta: null,
        },
      },
    }

    const visibleCandidates = () => store.candidatesNewToOld.filter((c) => !store.hidden.has(c.answerRootId))

    const invoke = vi.fn(async (method: string, params?: any) => {
      const projectBootstrap = mockStableAppBootstrapCalls(method, params)
      if (projectBootstrap !== undefined) return projectBootstrap
      if (method === 'convo.list') return [{ id: convoId, title: 'Chat 1', createdAt: 1, updatedAt: 1 }]
      if (method === 'branch.ensureDefault') {
        return { id: branchId, convoId, headMessageId: store.headMessageId, name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }
      }
      if (method === 'branch.list') {
        return [{ id: branchId, convoId, headMessageId: store.headMessageId, name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }]
      }
      if (method === 'context.getRenderableTurns') {
        const q = store.messagesById.u1
        const chosen = store.messagesById[store.chosenAnswerRootId]
        return {
          messages: [q, chosen],
          turns: [{ questionId: 'u1', chosenAnswerRootId: store.chosenAnswerRootId, questionMode: 'include', answerMode: 'include', effectiveMode: 'include', lockedByQuestionExclude: false }],
        }
      }
      if (method === 'context.buildForBranch') return { messages: [] }
      if (method === 'branch.getCandidates') return visibleCandidates()
      if (method === 'messageAttachment.listByMessageId') {
        return historyAttachmentRowsByMessageId[String(params?.messageId ?? '')] ?? []
      }
      if (method === 'fileAsset.listByIds') {
        const ids = Array.isArray(params?.ids) ? params.ids.map((value: unknown) => String(value ?? '').trim()).filter(Boolean) : []
        return ids.map((id: string) => fileAssetsById[id]).filter(Boolean)
      }
      if (method === 'preview.getLatestReady') {
        return {
          assetId: String(params?.assetId ?? ''),
          status: 'ready',
          derivativeId: 'preview-1',
          mime: 'image/png',
          dataUrl: 'data:image/png;base64,AA==',
          width: 64,
          height: 64,
          bytes: 8,
          reused: false,
          errorCode: null,
          errorMessage: null,
        }
      }
      if (method === 'preview.ensure') {
        return {
          assetId: String(params?.assetId ?? ''),
          status: 'ready',
          derivativeId: 'preview-1',
          mime: 'image/png',
          dataUrl: 'data:image/png;base64,BB==',
          width: 64,
          height: 64,
          bytes: 8,
          reused: true,
          errorCode: null,
          errorMessage: null,
        }
      }
      if (method === 'branch.retryReplaceAnswer') {
        store.hidden.add(String(params?.currentAnswerRootId ?? ''))
        const createdAt = Date.now()
        store.messagesById.a2 = {
          id: 'a2',
          convoId,
          role: 'assistant',
          seq: 4,
          createdAt,
          parentId: 'u1',
          status: 'streaming',
          answerRootId: 'a2',
          questionId: 'u1',
          body: '',
          meta: null,
        }
        store.headMessageId = 'a2'
        store.chosenAnswerRootId = 'a2'
        store.candidatesNewToOld = [
          { answerRootId: 'a2', createdAt: createdAt + 1, status: 'streaming' },
          ...store.candidatesNewToOld,
        ]
        return { ok: true, newAnswerRootId: 'a2', newAssistantSeq: 4 }
      }
      if (method === 'message.appendDelta') {
        const seq = Number(params?.seq ?? NaN)
        const appendBody = String(params?.appendBody ?? '')
        const msg = Object.values(store.messagesById).find((m) => m.seq === seq)
        if (msg) msg.body = String(msg.body ?? '') + appendBody
        return { ok: true }
      }
      if (method === 'message.setStatus') {
        const messageId = String(params?.messageId ?? '')
        const status = String(params?.status ?? '')
        const msg = store.messagesById[messageId]
        if (msg) msg.status = status as any
        return { ok: true }
      }
      if (method === 'modelPrefs.recordRecent') {
        const nowTs = Date.now()
        return {
          scopeType: 'global',
          scopeId: '',
          providerKey: String(params?.providerKey ?? 'openrouter'),
          modelId: String(params?.modelId ?? ''),
          modelKey: String(params?.modelKey ?? ''),
          lastUsedAtMs: nowTs,
          useCount: 1,
          createdAtMs: nowTs,
          updatedAtMs: nowTs,
        }
      }
      return { ok: true }
    })

    ;(globalThis as any).dbBridge = { invoke }

    render(AppChatApp)

    const retry = await screen.findByTestId('retry-a-a1')
    await user.click(retry)
    await screen.findByTestId('attachment-confirm-panel')
    await user.click(screen.getByTestId('attachment-confirm-history-exclude-all-checkbox'))
    await user.click(screen.getByTestId('attachment-confirm-confirm'))

    await screen.findByText('ok')
    await waitFor(() => expect(screen.getByTestId('cand-pos-u1').textContent).toBe('2/2'))
    await vi.runAllTimersAsync()

    expect(invoke).toHaveBeenCalledWith(
      'message.setStatus',
      expect.objectContaining({
        messageId: 'a2',
        status: 'final',
        metaPatch: expect.objectContaining({
          currentReplayManifestDraft: expect.objectContaining({
            replayMode: 'current',
            sourceUserMessageId: 'u1',
          }),
        }),
      }),
    )

    const lastCall = streamOpenRouterChatCallArgs.at(-1)
    expect(lastCall).toEqual(expect.objectContaining({
      userText: 'Q1',
      currentUserContentBlocks: expect.any(Array),
      contextMessages: expect.any(Array),
    }))
    const currentUserContentBlocks = lastCall.currentUserContentBlocks as any[]
    expect(currentUserContentBlocks.length).toBeGreaterThan(1)
    expect(currentUserContentBlocks.some((block: any) => block.type !== 'text')).toBe(true)
    expect(currentUserContentBlocks[0]).toMatchObject({ type: 'text', text: 'Q1' })
    expect(currentUserContentBlocks[1]).toEqual(expect.objectContaining({ type: 'image_url' }))
  })

  it('disables regenerate/retry while the selected answer group is streaming', async () => {
    const convoId = 'c1'
    const branchId = 'b1'
    const now = Date.now()

    const invoke = vi.fn(async (method: string, params?: any) => {
      const projectBootstrap = mockStableAppBootstrapCalls(method, params)
      if (projectBootstrap !== undefined) return projectBootstrap
      if (method === 'convo.list') return [{ id: convoId, title: 'Chat 1', createdAt: 1, updatedAt: 1 }]
      if (method === 'branch.ensureDefault') {
        return { id: branchId, convoId, headMessageId: 'a1', name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }
      }
      if (method === 'branch.list') {
        return [{ id: branchId, convoId, headMessageId: 'a1', name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }]
      }
      if (method === 'context.getRenderableTurns') {
        return {
          messages: [
            {
              id: 'u1',
              convoId,
              role: 'user',
              seq: 1,
              createdAt: now,
              parentId: null,
              status: 'final',
              answerRootId: null,
              questionId: null,
              body: 'Q1',
              meta: null,
            },
            {
              id: 'a1',
              convoId,
              role: 'assistant',
              seq: 2,
              createdAt: now + 1,
              parentId: 'u1',
              status: 'streaming',
              answerRootId: 'a1',
              questionId: 'u1',
              body: '',
              meta: null,
            },
          ],
          turns: [{ questionId: 'u1', chosenAnswerRootId: 'a1', questionMode: 'include', answerMode: 'include', effectiveMode: 'include', lockedByQuestionExclude: false }],
        }
      }
      if (method === 'context.buildForBranch') return { messages: [] }
      if (method === 'branch.getCandidates') return [{ answerRootId: 'a1', createdAt: now + 2, status: 'streaming' }]
      if (method === 'messageAttachment.listByMessageId') {
        return historyAttachmentRowsByMessageId[String(params?.messageId ?? '')] ?? []
      }
      if (method === 'fileAsset.listByIds') {
        const ids = Array.isArray(params?.ids) ? params.ids.map((value: unknown) => String(value ?? '').trim()).filter(Boolean) : []
        return ids.map((id: string) => fileAssetsById[id]).filter(Boolean)
      }
      if (method === 'modelPrefs.recordRecent') {
        const nowTs = Date.now()
        return {
          scopeType: 'global',
          scopeId: '',
          providerKey: 'openrouter',
          modelId: DEFAULT_OPENROUTER_TEST_MODEL,
          modelKey: `openrouter::${DEFAULT_OPENROUTER_TEST_MODEL}`,
          lastUsedAtMs: nowTs,
          useCount: 1,
          createdAtMs: nowTs,
          updatedAtMs: nowTs,
        }
      }
      return { ok: true }
    })

    ;(globalThis as any).dbBridge = { invoke }

    render(AppChatApp)
    await screen.findByText('Q1')

    expect(await screen.findByTestId('regen-q-u1')).toBeDisabled()
    expect(await screen.findByTestId('retry-a-a1')).toBeDisabled()
  })

  it('opens confirmation UI for regenerate needs_confirmation and continues only after history exclude-all confirm', async () => {
    const user = userEvent.setup()
    const convoId = 'c1'
    const branchId = 'b1'
    const now = Date.now()
    replayPrepareStatusByMessageId = { u1: 'needs_confirmation' }
    replayPrepareBlockingReasonByMessageId = { u1: 'History attachment is excluded from current replay.' }
    const replayRows = makeReplayAttachmentRows('u1').map((row, index) => (
      index === 0
        ? { ...row, includeInNextRequest: false, excludedReason: 'conversion_required_before_send' }
        : row
    ))
    historyAttachmentRowsByMessageId = {
      u1: replayRows,
    }
    fileAssetsById = makeReplayAssets()

    const invoke = vi.fn(async (method: string, params?: any) => {
      const projectBootstrap = mockStableAppBootstrapCalls(method, params)
      if (projectBootstrap !== undefined) return projectBootstrap
      if (method === 'convo.list') return [{ id: convoId, title: 'Chat 1', createdAt: 1, updatedAt: 1 }]
      if (method === 'branch.ensureDefault' || method === 'branch.list') {
        return [{ id: branchId, convoId, headMessageId: 'a1', name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }][0]
      }
      if (method === 'context.getRenderableTurns') {
        return {
          messages: [
            { id: 'u1', convoId, role: 'user', seq: 1, createdAt: now, parentId: null, status: 'final', answerRootId: null, questionId: null, body: 'Q1', meta: null },
            { id: 'a1', convoId, role: 'assistant', seq: 2, createdAt: now + 1, parentId: 'u1', status: 'final', answerRootId: 'a1', questionId: 'u1', body: 'A1', meta: null },
          ],
          turns: [{ questionId: 'u1', chosenAnswerRootId: 'a1', questionMode: 'include', answerMode: 'include', effectiveMode: 'include', lockedByQuestionExclude: false }],
        }
      }
      if (method === 'context.buildForBranch') return { messages: [] }
      if (method === 'branch.getCandidates') return [{ answerRootId: 'a1', createdAt: now + 2, status: 'final' }]
      if (method === 'messageAttachment.listByMessageId') {
        return historyAttachmentRowsByMessageId[String(params?.messageId ?? '')] ?? []
      }
      if (method === 'fileAsset.listByIds') {
        const ids = Array.isArray(params?.ids) ? params.ids.map((value: unknown) => String(value ?? '').trim()).filter(Boolean) : []
        return ids.map((id: string) => fileAssetsById[id]).filter(Boolean)
      }
      if (method === 'preview.getLatestReady' || method === 'preview.ensure') {
        return {
          assetId: String(params?.assetId ?? ''),
          status: 'ready',
          derivativeId: 'preview-1',
          mime: 'image/png',
          dataUrl: 'data:image/png;base64,AA==',
          width: 64,
          height: 64,
          bytes: 8,
          reused: false,
          errorCode: null,
          errorMessage: null,
        }
      }
      if (method === 'branch.regenerateFromQuestion') {
        return { ok: true, newAnswerRootId: 'a2', newAssistantSeq: 3 }
      }
      if (method === 'message.appendDelta' || method === 'message.setStatus' || method === 'modelPrefs.recordRecent') {
        return { ok: true }
      }
      return { ok: true }
    })
    ;(globalThis as any).dbBridge = { invoke }

    render(AppChatApp)
    await screen.findByText('Q1')
    await user.click(await screen.findByTestId('regen-q-u1'))

    await screen.findByTestId('attachment-confirm-panel')
    expect(screen.getByTestId('attachment-confirm-history-section')).toBeTruthy()
    expect(screen.queryByTestId('attachment-confirm-current-section')).toBeNull()
    expect(screen.queryByTestId('attachment-confirm-history-exclude-att-u1-preview-only')).toBeNull()
    expect(screen.getByTestId('attachment-confirm-history-row-att-u1-image')).toBeTruthy()
    expect(screen.getByTestId('attachment-confirm-history-row-att-u1-preview-only')).toBeTruthy()

    await user.click(screen.getByTestId('attachment-confirm-confirm'))
    await waitFor(() => {
      expect(screen.getByTestId('attachment-confirm-validation').textContent).toContain('历史附件全部从本次模型上下文中排除')
    })

    await user.click(screen.getByTestId('attachment-confirm-history-locate-att-u1-preview-only'))
    await screen.findByTestId('attachment-confirm-locator-bar')
    expect(screen.getByTestId('attachment-confirm-locator-index').textContent).toBe('2/2')
    await user.click(screen.getByTestId('attachment-confirm-locator-prev'))
    expect(screen.getByTestId('attachment-confirm-locator-index').textContent).toBe('1/2')
    await user.click(screen.getByTestId('attachment-confirm-locator-prev'))
    expect(screen.getByTestId('attachment-confirm-locator-index').textContent).toBe('2/2')
    await user.click(screen.getByTestId('attachment-confirm-locator-next'))
    expect(screen.getByTestId('attachment-confirm-locator-index').textContent).toBe('1/2')
    await user.click(screen.getByTestId('attachment-confirm-locator-open-panel'))
    await screen.findByTestId('attachment-confirm-panel')

    await user.click(screen.getByTestId('attachment-confirm-history-exclude-all-checkbox'))
    await user.click(screen.getByTestId('attachment-confirm-confirm'))

    await waitFor(() => {
      expect(invoke.mock.calls.some((call) => call[0] === 'branch.regenerateFromQuestion')).toBe(true)
    })
    expect(streamOpenRouterChatCallArgs.length).toBeGreaterThan(0)
    const lastCall = streamOpenRouterChatCallArgs.at(-1)
    const blocks = Array.isArray(lastCall?.currentUserContentBlocks) ? lastCall.currentUserContentBlocks as any[] : []
    expect(blocks.some((block) => String(block?.image_url?.url ?? '').includes('asset-history-preview-only'))).toBe(false)
  })

  it('continues retry replace after confirming history exclude-all under needs_confirmation', async () => {
    const user = userEvent.setup()
    const convoId = 'c1'
    const branchId = 'b1'
    const now = Date.now()
    replayPrepareStatusByMessageId = { u1: 'needs_confirmation' }
    replayPrepareBlockingReasonByMessageId = { u1: 'History attachment is excluded from current replay.' }
    historyAttachmentRowsByMessageId = { u1: makeReplayAttachmentRows('u1') }
    fileAssetsById = makeReplayAssets()

    const invoke = vi.fn(async (method: string, params?: any) => {
      const projectBootstrap = mockStableAppBootstrapCalls(method, params)
      if (projectBootstrap !== undefined) return projectBootstrap
      if (method === 'convo.list') return [{ id: convoId, title: 'Chat 1', createdAt: 1, updatedAt: 1 }]
      if (method === 'branch.ensureDefault' || method === 'branch.list') {
        return [{ id: branchId, convoId, headMessageId: 'a1', name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }][0]
      }
      if (method === 'context.getRenderableTurns') {
        return {
          messages: [
            { id: 'u1', convoId, role: 'user', seq: 1, createdAt: now, parentId: null, status: 'final', answerRootId: null, questionId: null, body: 'Q1', meta: null },
            { id: 'a1', convoId, role: 'assistant', seq: 2, createdAt: now + 1, parentId: 'u1', status: 'final', answerRootId: 'a1', questionId: 'u1', body: 'A1', meta: null },
          ],
          turns: [{ questionId: 'u1', chosenAnswerRootId: 'a1', questionMode: 'include', answerMode: 'include', effectiveMode: 'include', lockedByQuestionExclude: false }],
        }
      }
      if (method === 'context.buildForBranch') return { messages: [] }
      if (method === 'branch.getCandidates') return [{ answerRootId: 'a1', createdAt: now + 2, status: 'final' }]
      if (method === 'messageAttachment.listByMessageId') {
        return historyAttachmentRowsByMessageId[String(params?.messageId ?? '')] ?? []
      }
      if (method === 'fileAsset.listByIds') {
        const ids = Array.isArray(params?.ids) ? params.ids.map((value: unknown) => String(value ?? '').trim()).filter(Boolean) : []
        return ids.map((id: string) => fileAssetsById[id]).filter(Boolean)
      }
      if (method === 'preview.getLatestReady' || method === 'preview.ensure') {
        return {
          assetId: String(params?.assetId ?? ''),
          status: 'ready',
          derivativeId: 'preview-1',
          mime: 'image/png',
          dataUrl: 'data:image/png;base64,AA==',
          width: 64,
          height: 64,
          bytes: 8,
          reused: false,
          errorCode: null,
          errorMessage: null,
        }
      }
      if (method === 'branch.retryReplaceAnswer') return { ok: true, newAnswerRootId: 'a2', newAssistantSeq: 3 }
      if (method === 'message.appendDelta' || method === 'message.setStatus' || method === 'modelPrefs.recordRecent') return { ok: true }
      return { ok: true }
    })
    ;(globalThis as any).dbBridge = { invoke }

    render(AppChatApp)
    await screen.findByText('A1')
    await user.click(await screen.findByTestId('retry-a-a1'))
    await screen.findByTestId('attachment-confirm-panel')

    await user.click(screen.getByTestId('attachment-confirm-confirm'))
    await waitFor(() => {
      expect(screen.getByTestId('attachment-confirm-validation').textContent).toContain('历史附件全部从本次模型上下文中排除')
    })
    await user.click(screen.getByTestId('attachment-confirm-history-exclude-all-checkbox'))
    await user.click(screen.getByTestId('attachment-confirm-confirm'))

    await waitFor(() => {
      expect(invoke.mock.calls.some((call) => call[0] === 'branch.retryReplaceAnswer')).toBe(true)
    })
  })

  it('keeps old answer when retry replace confirmation is canceled under needs_confirmation', async () => {
    const user = userEvent.setup()
    const convoId = 'c1'
    const branchId = 'b1'
    const now = Date.now()
    replayPrepareStatusByMessageId = { u1: 'needs_confirmation' }
    replayPrepareBlockingReasonByMessageId = { u1: 'History attachment is excluded from current replay.' }
    historyAttachmentRowsByMessageId = {
      u1: makeReplayAttachmentRows('u1'),
    }
    fileAssetsById = makeReplayAssets()

    const invoke = vi.fn(async (method: string, params?: any) => {
      const projectBootstrap = mockStableAppBootstrapCalls(method, params)
      if (projectBootstrap !== undefined) return projectBootstrap
      if (method === 'convo.list') return [{ id: convoId, title: 'Chat 1', createdAt: 1, updatedAt: 1 }]
      if (method === 'branch.ensureDefault' || method === 'branch.list') {
        return [{ id: branchId, convoId, headMessageId: 'a1', name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }][0]
      }
      if (method === 'context.getRenderableTurns') {
        return {
          messages: [
            { id: 'u1', convoId, role: 'user', seq: 1, createdAt: now, parentId: null, status: 'final', answerRootId: null, questionId: null, body: 'Q1', meta: null },
            { id: 'a1', convoId, role: 'assistant', seq: 2, createdAt: now + 1, parentId: 'u1', status: 'final', answerRootId: 'a1', questionId: 'u1', body: 'A1', meta: null },
          ],
          turns: [{ questionId: 'u1', chosenAnswerRootId: 'a1', questionMode: 'include', answerMode: 'include', effectiveMode: 'include', lockedByQuestionExclude: false }],
        }
      }
      if (method === 'context.buildForBranch') return { messages: [] }
      if (method === 'branch.getCandidates') {
        return [
          { answerRootId: 'a1', createdAt: now + 2, status: 'final' },
          { answerRootId: 'a0', createdAt: now + 1, status: 'final' },
        ]
      }
      if (method === 'messageAttachment.listByMessageId') {
        return historyAttachmentRowsByMessageId[String(params?.messageId ?? '')] ?? []
      }
      if (method === 'fileAsset.listByIds') {
        const ids = Array.isArray(params?.ids) ? params.ids.map((value: unknown) => String(value ?? '').trim()).filter(Boolean) : []
        return ids.map((id: string) => fileAssetsById[id]).filter(Boolean)
      }
      if (method === 'preview.getLatestReady' || method === 'preview.ensure') {
        return {
          assetId: String(params?.assetId ?? ''),
          status: 'ready',
          derivativeId: 'preview-1',
          mime: 'image/png',
          dataUrl: 'data:image/png;base64,AA==',
          width: 64,
          height: 64,
          bytes: 8,
          reused: false,
          errorCode: null,
          errorMessage: null,
        }
      }
      return { ok: true }
    })
    ;(globalThis as any).dbBridge = { invoke }

    render(AppChatApp)
    await screen.findByText('A1')
    await user.click(await screen.findByTestId('retry-a-a1'))
    await screen.findByTestId('attachment-confirm-panel')
    await user.click(screen.getByTestId('attachment-confirm-cancel'))

    await waitFor(() => {
      expect(screen.queryByTestId('attachment-confirm-panel')).toBeNull()
    })
    expect(invoke.mock.calls.some((call) => call[0] === 'branch.retryReplaceAnswer')).toBe(false)
    expect(streamOpenRouterChatCallArgs.length).toBe(0)
    expect(screen.getByText('A1')).toBeTruthy()
  })

  it('blocks retry replace when replay is blocked and keeps the old answer candidate', async () => {
    const user = userEvent.setup()
    const convoId = 'c1'
    const branchId = 'b1'
    const now = Date.now()
    replayPrepareStatusByMessageId = { u1: 'blocked' }
    replayPrepareBlockingReasonByMessageId = { u1: 'hard gate blocked' }

    const invoke = vi.fn(async (method: string, params?: any) => {
      const projectBootstrap = mockStableAppBootstrapCalls(method, params)
      if (projectBootstrap !== undefined) return projectBootstrap
      if (method === 'convo.list') return [{ id: convoId, title: 'Chat 1', createdAt: 1, updatedAt: 1 }]
      if (method === 'branch.ensureDefault' || method === 'branch.list') {
        return [{ id: branchId, convoId, headMessageId: 'a1', name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }][0]
      }
      if (method === 'context.getRenderableTurns') {
        return {
          messages: [
            { id: 'u1', convoId, role: 'user', seq: 1, createdAt: now, parentId: null, status: 'final', answerRootId: null, questionId: null, body: 'Q1', meta: null },
            { id: 'a1', convoId, role: 'assistant', seq: 2, createdAt: now + 1, parentId: 'u1', status: 'final', answerRootId: 'a1', questionId: 'u1', body: 'A1', meta: null },
          ],
          turns: [{ questionId: 'u1', chosenAnswerRootId: 'a1', questionMode: 'include', answerMode: 'include', effectiveMode: 'include', lockedByQuestionExclude: false }],
        }
      }
      if (method === 'context.buildForBranch') return { messages: [] }
      if (method === 'branch.getCandidates') {
        return [
          { answerRootId: 'a1', createdAt: now + 2, status: 'final' },
          { answerRootId: 'a0', createdAt: now + 1, status: 'final' },
        ]
      }
      return { ok: true }
    })
    ;(globalThis as any).dbBridge = { invoke }

    render(AppChatApp)
    await screen.findByText('A1')
    await user.click(await screen.findByTestId('retry-a-a1'))
    await waitFor(() => {
      expect(screen.getByText(/Current replay blocked \(blocked\)/i)).toBeTruthy()
    })
    expect(invoke.mock.calls.some((call) => call[0] === 'branch.retryReplaceAnswer')).toBe(false)
    expect(screen.getByText('A1')).toBeTruthy()
    expect(streamOpenRouterChatCallArgs.length).toBe(0)
  })
})
