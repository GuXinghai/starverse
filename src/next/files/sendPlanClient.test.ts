import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildCurrentSendPlan,
  prepareOpenRouterReplayFromMessage,
  SendPlanClientContractError,
} from './sendPlanClient'

describe('sendPlanClient', () => {
  const originalDbBridge = (globalThis as any).dbBridge

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
    vi.restoreAllMocks()
  })

  it('calls sendPlan.buildCurrent through dbBridge', async () => {
    const invoke = vi.fn(async () => ({
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
      draftText: 'hello',
      assets: [],
      storageRootDir: 'C:/tmp',
    }))
    ;(globalThis as any).dbBridge = { invoke }

    const result = await buildCurrentSendPlan({
      conversationId: 'c1',
      draftText: 'hello',
      model: {
        providerKey: 'openrouter',
        modelId: 'openai/gpt-4o',
        modelKey: 'openrouter::openai/gpt-4o',
        inputModalities: ['text'],
        outputModalities: ['text'],
      },
      providerContext: {
        providerKey: 'openrouter',
        supportsImageUrlRef: true,
        supportsPdfInputs: true,
        supportsPdfUrlRef: true,
        supportsTextUrlRef: true,
        supportsVideoUrlRef: false,
        supportsInlineData: true,
        supportsProviderFileRef: false,
        preferredDraftSendModes: ['url_ref', 'inline_base64'],
      },
    })

    expect(invoke).toHaveBeenCalledWith('sendPlan.buildCurrent', expect.objectContaining({
      conversationId: 'c1',
      draftText: 'hello',
    }))
    expect(result.sendPlan.status).toBe('sendable')
    expect(result.storageRootDir).toBe('C:/tmp')
  })

  it('throws a contract error for malformed replay preparation responses', async () => {
    const invoke = vi.fn(async () => ({
      status: 'unexpected',
      currentUserContentBlocks: [],
      sentAssetIds: [],
      includedAttachments: [],
      excludedAttachments: [],
      blockingReasons: [],
      diagnostics: {},
      modelCapabilitySnapshot: {},
      manifestDraft: {},
    }))
    ;(globalThis as any).dbBridge = { invoke }

    await expect(prepareOpenRouterReplayFromMessage({
      branchId: 'branch-1',
      userMessageId: 'user-1',
      replayMode: 'current',
      model: {
        providerKey: 'openrouter',
        modelId: 'openai/gpt-4o',
        modelKey: 'openrouter::openai/gpt-4o',
        inputModalities: ['text'],
        outputModalities: ['text'],
      },
      providerContext: {
        providerKey: 'openrouter',
      },
    })).rejects.toMatchObject({
      name: 'SendPlanClientContractError',
      code: 'sendplan_contract_decode_failed',
      method: 'sendPlan.prepareOpenRouterReplayFromMessage',
    })

    await expect(prepareOpenRouterReplayFromMessage({
      branchId: 'branch-1',
      userMessageId: 'user-1',
      replayMode: 'current',
      model: {
        providerKey: 'openrouter',
        modelId: 'openai/gpt-4o',
        modelKey: 'openrouter::openai/gpt-4o',
        inputModalities: ['text'],
        outputModalities: ['text'],
      },
      providerContext: {
        providerKey: 'openrouter',
      },
    })).rejects.toBeInstanceOf(SendPlanClientContractError)
  })
})
