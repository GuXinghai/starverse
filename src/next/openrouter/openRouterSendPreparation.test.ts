import { afterEach, describe, expect, it, vi } from 'vitest'
import { prepareOpenRouterSendFromDraft } from './openRouterSendPreparation'
import { DEFAULT_OPENROUTER_TEST_MODEL } from './openRouterTestModels'

const testModel = DEFAULT_OPENROUTER_TEST_MODEL

describe('prepareOpenRouterSendFromDraft', () => {
  const originalBridge = (globalThis as any).dbBridge

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalBridge
    vi.restoreAllMocks()
  })

  it('invokes the bridge-side OpenRouter preparation method', async () => {
    const invoke = vi.fn(async (method: string, params: Record<string, unknown>) => {
      expect(method).toBe('sendPlan.prepareOpenRouter')
      expect(params).toMatchObject({
        conversationId: 'c1',
        draftText: 'describe this',
        historyMessageIds: ['m1'],
        model: {
          providerKey: 'openrouter',
          modelId: testModel,
          modelKey: `openrouter::${testModel}`,
          inputModalities: ['text', 'image'],
        },
        providerContext: {
          providerKey: 'openrouter',
          supportsInlineData: true,
        },
      })
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
        contentParts: [
          { type: 'text', text: 'describe this' },
        ],
        additionalPlugins: [],
        diagnostics: {
          sendPlanStatus: 'sendable',
          includedAttachmentCount: 0,
          excludedAttachmentCount: 0,
          includedAttachments: [],
          excludedAttachments: [],
          injectedPlugins: [],
          attachmentErrors: [],
          containsMultimodalParts: false,
        },
        hasDraftAttachmentPlans: false,
      }
    })
    ;(globalThis as any).dbBridge = { invoke }

    const prepared = await prepareOpenRouterSendFromDraft({
      conversationId: 'c1',
      userText: 'describe this',
      historyMessageIds: ['m1'],
      model: {
        providerKey: 'openrouter',
        modelId: testModel,
        modelKey: `openrouter::${testModel}`,
        inputModalities: ['text', 'image'],
      },
      providerContext: {
        providerKey: 'openrouter',
        supportsInlineData: true,
      },
    })

    expect(prepared).toMatchObject({
      sendPlan: expect.objectContaining({ status: 'sendable' }),
      contentParts: [{ type: 'text', text: 'describe this' }],
      additionalPlugins: [],
      hasDraftAttachmentPlans: false,
    })
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('returns null without a dbBridge', async () => {
    ;(globalThis as any).dbBridge = undefined

    await expect(
      prepareOpenRouterSendFromDraft({
        conversationId: 'c1',
        userText: 'describe this',
        model: {
          providerKey: 'openrouter',
          modelId: testModel,
          modelKey: `openrouter::${testModel}`,
          inputModalities: ['text'],
        },
        providerContext: { providerKey: 'openrouter' },
      })
    ).resolves.toBeNull()
  })
})
