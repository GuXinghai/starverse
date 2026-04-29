import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildCurrentSendPlan } from './sendPlanClient'

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
})
