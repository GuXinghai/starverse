import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppChatApp from './AppChatApp.vue'
import { useLiveStreamController } from './app/useLiveStreamController'

;(globalThis as any).__testOverrides = {}

function makeSendPlanResponse(opts: {
  status?: string
  warnings?: Array<{ code: string; message: string; source: string }>
  blockingReasons?: Array<{ code: string; message: string; source: string }>
  attachmentPlans?: Array<Record<string, unknown>>
  draftText?: string
} = {}) {
  return {
    sendPlan: {
      status: opts.status ?? 'sendable',
      warnings: opts.warnings ?? [],
      blockingReasons: opts.blockingReasons ?? [],
      includedAttachments: [],
      excludedAttachments: [],
      attachmentPlans: opts.attachmentPlans ?? [],
      requiresModelChange: false,
      canProceedAfterDroppingExcluded: true,
      requiresUserConfirmation: false,
      plannerVersion: '1',
    },
    draftText: opts.draftText ?? '',
    assets: [],
    storageRootDir: '/tmp',
  }
}

function makeAttachmentPlan(opts: {
  assetId?: string
  attachmentId?: string
  source?: string
  aiPayloadKind?: string
  eligibility?: string
  displayStatus?: string
} = {}) {
  return {
    assetId: opts.assetId ?? 'asset_1',
    attachmentId: opts.attachmentId ?? 'att_1',
    source: opts.source ?? 'draft',
    aiPayloadKind: opts.aiPayloadKind ?? 'text',
    eligibility: opts.eligibility ?? 'included',
    displayStatus: opts.displayStatus ?? 'ready',
    needsUserAttention: false,
    notes: [],
    fallbackSendModes: [],
  }
}

function makeDraftAttachment(opts: {
  assetId?: string
} = {}) {
  return {
    id: 'att_1',
    conversationId: 'c1',
    assetId: opts.assetId ?? 'asset_1',
    attachmentOrder: 0,
    aiPayloadKind: 'text',
    processingStatus: 'ready',
    includeInNextRequest: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

vi.mock('@/next/live/openRouterLiveStream', () => {
  async function* streamOpenRouterChatAsEvents(options: any) {
    const assistantMessageId = String(options?.assistantMessageId ?? 'a1')
    yield { type: 'MetaDelta', meta: { id: 'gen_1', model: 'openai/gpt-4o' } }
    yield { type: 'MessageDeltaText', messageId: assistantMessageId, choiceIndex: 0, text: 'hello' }
    if ((globalThis as any).__testOverrides?.hangStream) {
      await new Promise<void>((resolve) => {
        ;(globalThis as any).__testOverrides.hangResolve = resolve
      })
    }
    yield { type: 'StreamDone' }
  }
  return { streamOpenRouterChatAsEvents }
})

describe('ui-app AppChatApp send button state', () => {
  const originalDbBridge = (globalThis as any).dbBridge
  const originalElectronStore = (globalThis as any).electronStore
  const originalSetTimeout = globalThis.setTimeout

  beforeEach(() => {
    vi.useFakeTimers()
    globalThis.setTimeout = ((fn: (...args: any[]) => void) => originalSetTimeout(fn, 0)) as any
    ;(globalThis as any).__testOverrides = {}
    try { localStorage.setItem('sv_event_scheduler', '0') } catch { /* no-op */ }

    const catalogRows: Array<any> = [
      {
        modelId: 'openai/gpt-4o',
        name: 'GPT-4o',
        vendor: 'openai',
        status: 'visible',
        supportedParameters: [],
        lastSeenSnapshotId: 'snap_1',
      },
    ]

    ;(globalThis as any).electronStore = {
      get: vi.fn(async (key: string) => {
        if (key === 'openRouterApiKey') return 'sk-test'
        if (key === 'openRouterBaseUrl') return 'https://openrouter.ai/api/v1'
        return undefined
      }),
    }

    const persisted: Array<any> = []
    let turnCounter = 0

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
        return [{ id: 'c1', title: 'Chat 1', createdAt: 1, updatedAt: 1, meta: null }]
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
        return {
          providerKey: 'openrouter',
          modelId: 'openai/gpt-4o',
          modelKey: 'openrouter::openai/gpt-4o',
          canonicalSlug: 'openai/gpt-4o',
          displayName: 'GPT-4o',
          description: null,
          vendor: 'openai',
          family: null,
          status: 'active',
          visibility: 'visible',
          contextLength: 128000,
          maxOutputTokens: 16384,
          architectureModality: 'text->text',
          inputModalitiesJson: '["text"]',
          outputModalitiesJson: '["text"]',
          tokenizer: null,
          instructType: null,
          supportedParametersJson: '[]',
          capabilitiesJson: '{"reasoning":true,"tools":true,"structuredOutputs":true,"vision":false,"longContext":true}',
          pricePrompt: null,
          priceCompletion: null,
          priceRequest: null,
          priceImage: null,
          pricingJson: null,
          createdAtSec: 1,
          expirationDate: null,
          expirationAtSec: null,
          unknownExpiration: 0,
          hasPerRequestLimits: 0,
          hasDefaultParameters: 0,
          perRequestLimitsJson: null,
          defaultParametersJson: null,
          topProviderContextLength: null,
          topProviderIsModerated: null,
          firstSeenAtMs: 1,
          lastSeenAtMs: 1,
          syncedAtMs: 1,
        }
      }
      if (method === 'conversationDraft.restore') {
        if ((globalThis as any).__testOverrides?.draftRestoreResponse) {
          return (globalThis as any).__testOverrides.draftRestoreResponse
        }
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
      if (method === 'conversationDraft.updateText') {
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
          providerKey: 'openrouter',
          modelId: 'openai/gpt-4o',
          modelKey: 'openrouter::openai/gpt-4o',
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
        return [{ id: 'b1', convoId: 'c1', headMessageId: null, name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }]
      }
      if (method === 'context.getRenderableTurns') {
        return {
          messages: persisted,
          turns: [],
          debug: { branchId: 'b1', excludedQuestionIds: [], effectiveFilterMode: 'include_all' },
        }
      }
      if (method === 'context.buildForBranch') {
        return { messages: [], debug: { branchId: 'b1', excludedQuestionIds: [], includedMessageIds: [], chosenAnswerRootByQuestionId: {} } }
      }
      if (method === 'message.listByBranch') return persisted
      if (method === 'branch.getCandidates') return []
      if (method === 'message.get') return null
      if (method === 'branch.head') return null
      if (method === 'sendPlan.buildCurrent') {
        if ((globalThis as any).__testOverrides?.sendPlanResponse) {
          return (globalThis as any).__testOverrides.sendPlanResponse
        }
        if ((globalThis as any).__testOverrides?.slowSendPlan) {
          return new Promise((resolve) => {
            ;(globalThis as any).__testOverrides.resolveSendPlan = () => resolve(makeSendPlanResponse())
          })
        }
        return makeSendPlanResponse()
      }
      if (method === 'filePipeline.prepareOpenRouterSend') {
        return {
          sendPlan: { status: 'sendable', attachmentPlans: [], blockingReasons: [], warnings: [] },
          diagnostics: { includedAttachmentCount: 0, excludedAttachmentCount: 0, injectedPlugins: [] },
        }
      }
      if (method === 'conversationDraft.listAttachments') return []
      if (method === 'conversationDraft.listAttachmentAssets') return []
      if (method === 'fileAsset.get') return null
      if (method === 'fileAsset.listByConversation') return []
      if (method === 'message.listAttachmentsByMessage') return []
      if (method === 'filePipeline.detectFileType') return { verdict: { kind: 'text', confidence: 1 } }
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
          questionId: questionId,
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
          requestId: `req_${turnCounter}`,
        }
      }
      if (method === 'message.create') {
        const msg = {
          id: `msg_${persisted.length + 1}`,
          convoId: 'c1',
          role: params?.role ?? 'user',
          seq: persisted.length + 1,
          createdAt: Date.now(),
          parentId: params?.parentId ?? null,
          body: params?.body ?? '',
          meta: params?.meta ?? null,
          questionId: params?.questionId ?? null,
          answerRootId: params?.answerRootId ?? null,
        }
        persisted.push(msg)
        return msg
      }
      if (method === 'message.appendDelta') return { ok: true }
      if (method === 'message.updateMeta') return { ok: true }
      if (method === 'message.finalize') return { ok: true }
      if (method === 'message.markError') return { ok: true }
      if (method === 'run.saveSnapshot') return { ok: true }
      if (method === 'run.getSnapshot') return null
      return null
    })

    ;(globalThis as any).dbBridge = { invoke }
  })

  afterEach(() => {
    if ((globalThis as any).__testOverrides?.hangResolve) {
      ;(globalThis as any).__testOverrides.hangResolve()
    }
    if ((globalThis as any).__testOverrides?.resolveSendPlan) {
      ;(globalThis as any).__testOverrides.resolveSendPlan()
    }
    ;(globalThis as any).__testOverrides = {}
    vi.useRealTimers()
    ;(globalThis as any).dbBridge = originalDbBridge
    ;(globalThis as any).electronStore = originalElectronStore
    globalThis.setTimeout = originalSetTimeout
    try { localStorage.removeItem('sv_event_scheduler') } catch { /* no-op */ }
  })

  it('P0: shows Send button disabled on empty draft with no attachments', async () => {
    render(AppChatApp)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    })
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
    expect(screen.queryByTestId('composer-send-gate-block')).toBeNull()
  })

  it('P0: shows Send button enabled when draft has text', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(AppChatApp)
    await waitFor(() => expect(screen.getByRole('button', { name: 'New' })).not.toBeDisabled())
    const textarea = screen.getByPlaceholderText('Type a message...')
    await user.click(textarea)
    await user.type(textarea, 'Hello')
    expect((textarea as HTMLTextAreaElement).value).toBe('Hello')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
    })
  })

  it('P1: empty draft with no attachments does not show red banner', async () => {
    render(AppChatApp)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    })
    expect(screen.queryByTestId('composer-send-gate-block')).toBeNull()
    expect(screen.queryByTestId('composer-send-gate-warning')).toBeNull()
  })

  it('P1: Enter key does not send when button is disabled', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(AppChatApp)
    await waitFor(() => expect(screen.getByRole('button', { name: 'New' })).not.toBeDisabled())
    const textarea = screen.getByPlaceholderText('Type a message...')
    await user.click(textarea)
    await user.type(textarea, 'Hello')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
    })
    const invoke = (globalThis as any).dbBridge.invoke as ReturnType<typeof vi.fn>
    expect(invoke).not.toHaveBeenCalledWith('message.create', expect.any(Object))
  })

  it('P0: shows Stop button during active stream', async () => {
    ;(globalThis as any).__testOverrides.hangStream = true
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(AppChatApp)
    await waitFor(() => expect(screen.getByRole('button', { name: 'New' })).not.toBeDisabled())
    const textarea = screen.getByPlaceholderText('Type a message...')
    await user.click(textarea)
    await user.type(textarea, 'Hello')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
    })
    await user.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
  })

  it('P0: ActiveStream stores branchId for scoped abort protection', () => {
    const { createActiveStream, activeStream } = useLiveStreamController()
    const stream = createActiveStream('branch-1', 'msg-1', 1)
    expect(stream.branchId).toBe('branch-1')
    activeStream.value = stream
    expect(activeStream.value?.branchId).toBe('branch-1')
    const stream2 = createActiveStream('branch-2', 'msg-2', 2)
    expect(stream2.branchId).toBe('branch-2')
    expect(stream.branchId).not.toBe(stream2.branchId)
  })

  it('P0: no text + sendable attachment enables Send button', async () => {
    ;(globalThis as any).__testOverrides.draftRestoreResponse = {
      conversationId: 'c1',
      draftText: '',
      draftMode: 'compose',
      editingSourceMessageId: null,
      attachedAssetIds: ['asset_1'],
      attachments: [makeDraftAttachment()],
      updatedAt: Date.now(),
    }
    ;(globalThis as any).__testOverrides.sendPlanResponse = makeSendPlanResponse({
      attachmentPlans: [makeAttachmentPlan({ eligibility: 'included', displayStatus: 'ready' })],
    })
    render(AppChatApp)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
    })
    expect(screen.queryByTestId('composer-send-gate-block')).toBeNull()
  })

  it('P1: no text + blocked attachment disables Send button', async () => {
    ;(globalThis as any).__testOverrides.draftRestoreResponse = {
      conversationId: 'c1',
      draftText: '',
      draftMode: 'compose',
      editingSourceMessageId: null,
      attachedAssetIds: ['asset_1'],
      attachments: [makeDraftAttachment()],
      updatedAt: Date.now(),
    }
    ;(globalThis as any).__testOverrides.sendPlanResponse = makeSendPlanResponse({
      status: 'blocked',
      attachmentPlans: [makeAttachmentPlan({ eligibility: 'blocked', displayStatus: 'ready' })],
    })
    render(AppChatApp)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    })
  })

  it('P1: no text + detection_pending attachment disables Send button', async () => {
    ;(globalThis as any).__testOverrides.draftRestoreResponse = {
      conversationId: 'c1',
      draftText: '',
      draftMode: 'compose',
      editingSourceMessageId: null,
      attachedAssetIds: ['asset_1'],
      attachments: [makeDraftAttachment()],
      updatedAt: Date.now(),
    }
    ;(globalThis as any).__testOverrides.sendPlanResponse = makeSendPlanResponse({
      attachmentPlans: [makeAttachmentPlan({ eligibility: 'included', displayStatus: 'detection_pending' })],
    })
    render(AppChatApp)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    })
  })

  it('P1: sendPlan warning enables button and shows warning banner', async () => {
    ;(globalThis as any).__testOverrides.sendPlanResponse = makeSendPlanResponse({
      status: 'sendable_with_warnings',
      warnings: [{ code: 'test_warning', message: 'Test warning message', source: 'request' }],
    })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(AppChatApp)
    await waitFor(() => expect(screen.getByRole('button', { name: 'New' })).not.toBeDisabled())
    const textarea = screen.getByPlaceholderText('Type a message...')
    await user.click(textarea)
    await user.type(textarea, 'Hello')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
    })
    await waitFor(() => {
      expect(screen.getByTestId('composer-send-gate-warning')).toBeInTheDocument()
    })
    expect(screen.getByTestId('composer-send-gate-warning')).toHaveTextContent('Test warning message')
    expect(screen.queryByTestId('composer-send-gate-block')).toBeNull()
  })

  it('P1: composerSendPlanLoading shows busy disabled state', async () => {
    ;(globalThis as any).__testOverrides.slowSendPlan = true
    render(AppChatApp)
    await waitFor(() => {
      expect(screen.getByTestId('composer-send-gate-loading')).toBeInTheDocument()
    })
    expect(screen.getByTestId('composer-send')).toBeDisabled()
    expect(screen.getByTestId('composer-send-gate-loading')).toHaveTextContent('正在更新发送计划')
  })
})
