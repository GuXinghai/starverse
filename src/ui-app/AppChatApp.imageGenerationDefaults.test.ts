import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AppChatApp from './AppChatApp.vue'

type TestConvo = {
  id: string
  title: string
  projectId: string | null
  meta: Record<string, unknown> | null
}

function installDbBridge(input: Readonly<{
  convos: TestConvo[]
  projects?: Array<{ id: string; name: string; meta: Record<string, unknown> | null }>
  globalImageDefault?: Record<string, unknown> | null
}>): ReturnType<typeof vi.fn> {
  const convos = input.convos.map((row) => ({ ...row }))
  const projects = (input.projects ?? []).map((row) => ({ ...row }))
  const messagesByConvo = Object.fromEntries(
    convos.map((convo, index) => [
      convo.id,
      [
        {
          id: `m${index + 1}`,
          convoId: convo.id,
          role: 'assistant',
          seq: 1,
          createdAt: 1,
          parentId: null,
          status: 'final',
          answerRootId: null,
          questionId: null,
          body: `hello-${convo.id}`,
          meta: null,
        },
      ],
    ]),
  ) as Record<string, any[]>

  const invoke = vi.fn(async (method: string, params?: any) => {
    if (method === 'project.getInbox') return null
    if (method === 'project.list') {
      return projects.map((row) => ({ ...row, createdAt: 1, updatedAt: 1 }))
    }
    if (method === 'project.countConversationsBatch') {
      return { counts: Object.fromEntries(projects.map((project) => [project.id, 1])) }
    }
    if (method === 'project.findById') {
      const id = String(params?.id ?? '')
      const found = projects.find((project) => project.id === id) ?? null
      if (!found) return null
      return { ...found, createdAt: 1, updatedAt: 1 }
    }
    if (method === 'convo.list') {
      return convos.map((row, index) => ({
        id: row.id,
        title: row.title,
        projectId: row.projectId,
        createdAt: index + 1,
        updatedAt: index + 1,
        meta: row.meta,
      }))
    }
    if (method === 'convo.save') {
      const id = String(params?.id ?? '')
      const found = convos.find((row) => row.id === id)
      if (found) {
        found.meta = (params?.meta ?? null) as Record<string, unknown> | null
      }
      return { ok: true }
    }
    if (method === 'branch.ensureDefault') {
      const convoId = String(params?.convoId ?? convos[0]?.id ?? '')
      return { id: `b-${convoId}`, convoId, headMessageId: `m-${convoId}`, name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }
    }
    if (method === 'branch.list') {
      const convoId = String(params?.convoId ?? convos[0]?.id ?? '')
      return [{ id: `b-${convoId}`, convoId, headMessageId: `m-${convoId}`, name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }]
    }
    if (method === 'context.getRenderableTurns') {
      const branchId = String(params?.branchId ?? '')
      const convoId = branchId.startsWith('b-') ? branchId.slice(2) : convos[0]?.id
      const messages = messagesByConvo[convoId] ?? []
      return {
        messages,
        turns: [],
        debug: {
          branchId,
          excludedQuestionIds: [],
          includedMessageIds: messages.map((message) => message.id),
          chosenAnswerRootByQuestionId: {},
        },
      }
    }
    if (method === 'context.buildForBranch') {
      return { messages: [], debug: { branchId: String(params?.branchId ?? ''), excludedQuestionIds: [], includedMessageIds: [], chosenAnswerRootByQuestionId: {} } }
    }
    if (method === 'settings.getReasoningPrefs') return { value: { mode: 'auto', effort: 'auto', exclude: false } }
    if (method === 'settings.getUserMessageRenderDefault') return { value: false }
    if (method === 'settings.getWebSearchDefaults') return { value: null }
    if (method === 'settings.getSamplingParamsDefaults') return { value: null }
    if (method === 'settings.getImageGenerationDefault') return { value: input.globalImageDefault ?? null }
    if (method === 'reasoningIndex.list') return []
    if (method === 'modelCatalog.list') {
      return [{ modelId: 'anthropic/claude-3', name: 'Claude 3', vendor: 'anthropic', status: 'visible', supportedParameters: [], lastSeenSnapshotId: 'snap_1' }]
    }
    if (method === 'modelCatalog.queryCore') {
      return {
        items: [
          {
            providerKey: 'openrouter',
            modelId: 'anthropic/claude-3',
            modelKey: 'openrouter::anthropic/claude-3',
            canonicalSlug: 'anthropic/claude-3',
            displayName: 'Claude 3',
            description: null,
            vendor: 'anthropic',
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
          },
        ],
        nextCursor: null,
      }
    }
    if (method === 'modelCatalog.getCoreMeta') return { providerKey: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1' }
    if (method === 'modelCatalog.getModelDetail') {
      return {
        providerKey: 'openrouter',
        modelId: 'anthropic/claude-3',
        modelKey: 'openrouter::anthropic/claude-3',
        canonicalSlug: 'anthropic/claude-3',
        displayName: 'Claude 3',
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
        capabilitiesJson: '{"reasoning":true}',
        pricePrompt: '0',
        priceCompletion: '0',
        priceRequest: '0',
        priceImage: '0',
        pricingJson: '{}',
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
    if (method === 'modelCatalog.listEndpointMeta') return []
    if (method === 'modelCatalog.replaceEndpointMeta') return { ok: true }
    return { ok: true }
  })
  ;(globalThis as any).dbBridge = { invoke }
  return invoke
}

describe('ui-app AppChatApp image generation defaults', () => {
  const originalDbBridge = (globalThis as any).dbBridge

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
  })

  it('hides controls before image-capable model selection, exits default on edit, and keeps cross-convo isolation', async () => {
    const invoke = installDbBridge({
      convos: [
        { id: 'c1', title: 'Chat 1', projectId: null, meta: null },
        { id: 'c2', title: 'Chat 2', projectId: null, meta: null },
      ],
      globalImageDefault: {
        enabled: true,
        outputMode: 'image_only',
        aspectRatio: '16:9',
        imageSize: '2K',
        advancedJson: '',
      },
    })

    const user = userEvent.setup()
    render(AppChatApp)

    await screen.findByText('hello-c1')
    expect(screen.queryByTestId('composer-image-generation-row')).toBeNull()

    await user.click(await screen.findByTestId('current-model-pill'))
    await user.click(await screen.findByTestId('model-picker-item-anthropic/claude-3'))
    await screen.findByTestId('composer-image-generation-row')

    const followDefault = screen.getByTestId('composer-image-follow-default') as HTMLInputElement
    const aspectRatio = screen.getByTestId('composer-image-aspect-ratio') as HTMLSelectElement
    expect(followDefault.checked).toBe(true)
    expect(aspectRatio.value).toBe('16:9')

    await user.selectOptions(aspectRatio, '1:1')

    await waitFor(() => {
      expect(followDefault.checked).toBe(false)
      expect(invoke).toHaveBeenCalledWith(
        'convo.save',
        expect.objectContaining({
          id: 'c1',
          meta: expect.objectContaining({
            imageGenerationMode: 'custom',
            imageGenerationCustom: expect.objectContaining({ aspectRatio: '1:1' }),
          }),
        }),
      )
    })

    await user.click(screen.getByText('Chat 2'))
    await screen.findByText('hello-c2')

    expect((screen.getByTestId('composer-image-follow-default') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByTestId('composer-image-aspect-ratio') as HTMLSelectElement).value).toBe('16:9')
  })

  it('resolves default convo config from project default before global default', async () => {
    installDbBridge({
      convos: [
        { id: 'c1', title: 'Chat 1', projectId: null, meta: null },
        { id: 'c2', title: 'Chat 2', projectId: 'p1', meta: null },
      ],
      projects: [
        {
          id: 'p1',
          name: 'Project 1',
          meta: {
            imageGenerationDefaultMode: 'custom',
            imageGenerationDefaultCustom: {
              enabled: true,
              outputMode: 'image_and_text',
              aspectRatio: '3:2',
              imageSize: '4K',
              advancedJson: '',
            },
          },
        },
      ],
      globalImageDefault: {
        enabled: true,
        outputMode: 'image_only',
        aspectRatio: '16:9',
        imageSize: '2K',
        advancedJson: '',
      },
    })

    const user = userEvent.setup()
    render(AppChatApp)

    await screen.findByText('hello-c1')
    await user.click(await screen.findByTestId('current-model-pill'))
    await user.click(await screen.findByTestId('model-picker-item-anthropic/claude-3'))
    await screen.findByTestId('composer-image-generation-row')

    expect((screen.getByTestId('composer-image-aspect-ratio') as HTMLSelectElement).value).toBe('16:9')

    await user.click(screen.getByText('Chat 2'))
    await screen.findByText('hello-c2')

    expect((screen.getByTestId('composer-image-follow-default') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByTestId('composer-image-aspect-ratio') as HTMLSelectElement).value).toBe('3:2')
  })
})
