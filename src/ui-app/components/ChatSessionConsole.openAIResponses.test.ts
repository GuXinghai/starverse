import { fireEvent, render, screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import ChatSessionConsole from './ChatSessionConsole.vue'
import { t, tf } from '@/shared/i18n'
import type { ChatSessionConfig } from '@/ui-app/app/chatSessionConfig'
import type { ImageGenerationUserConfig } from '@/next/openrouter/imageGenerationSettingsPersistence'

function defaultSessionConfig() {
  return {
    routeSelection: null,
    reasoning: { enabled: false, effort: 'medium' as const },
    webSearch: { enabled: false, level: 'high' as const, detail: null },
    imageGeneration: {
      enabled: false,
      resolution: '1K' as const,
      aspectRatio: '1:1' as const,
      mode: 'default' as const,
      detail: null,
    },
    generationParams: { detail: null },
  }
}

function openAIResponsesSessionConfig() {
  return {
    ...defaultSessionConfig(),
    routeSelection: { schemaVersion: 1 as const, kind: 'provider_model' as const, providerId: 'openai_responses' as const, modelId: 'gpt-4.1-mini'  },
  }
}

function reasoningCapabilityProjection() {
  return {
    schemaVersion: 1,
    binding: {},
    capabilityRevision: 'capability-v2:test-ui',
    controls: {
      'reasoning.effort': { state: 'supported', domain: { kind: 'enum', values: ['low', 'medium', 'high', 'xhigh', 'max'] }, constraints: [], evidenceIds: [] },
      'reasoning.summary': { state: 'supported', domain: { kind: 'enum', values: ['auto', 'concise', 'detailed'] }, constraints: [], evidenceIds: [] },
    },
  } as any
}

describe('ChatSessionConsole OpenAI Responses chat controls', () => {
  it('keeps the chat model fixed while editing image tools and restores controls across Gemini switches', async () => {
    let config: ChatSessionConfig = { ...openAIResponsesSessionConfig(), imageGeneration: {
      enabled: true, resolution: '1K', aspectRatio: '16:9', mode: 'custom',
      detail: { enabled: true, imageSize: '1K', aspectRatio: '16:9', outputMode: 'image_and_text', openAI: { toolModel: 'gpt-image-1-mini', quality: 'low' } },
    } }
    const view = render(ChatSessionConsole, { props: {
      disabled: false, isRunning: false, sessionConfig: config, reasoningDisplayMode: 'inline', modelCatalog: [], webSearchResolved: null, generationParamsResolved: null,
    } })
    const commit = async () => {
      const detail = (view.emitted('updateImageGeneration') as unknown[][])?.at(-1)?.[0] as ImageGenerationUserConfig
      config = { ...config, imageGeneration: { ...config.imageGeneration, detail } }
      await view.rerender({ sessionConfig: config })
    }
    expect(screen.getByTestId('openai-image-tool-model')).toHaveValue('gpt-image-1-mini')
    await fireEvent.update(screen.getByTestId('openai-image-tool-model'), 'gpt-image-2.5-flare')
    await commit()
    await fireEvent.update(screen.getByTestId('openai-image-quality'), 'max')
    await commit()
    await fireEvent.update(screen.getByTestId('openai-image-size'), 'custom')
    await commit()
    expect(config.imageGeneration.detail?.openAI?.size).toBe('1536x864')
    expect(view.emitted('updateRouteSelection')).toBeUndefined()
    expect(config.routeSelection).toMatchObject({ providerId: 'openai_responses', modelId: 'gpt-4.1-mini' })
    const openAIRoute = config.routeSelection
    config = { ...config, routeSelection: { schemaVersion: 1, kind: 'provider_model', providerId: 'google_ai_studio', modelId: 'gemini-3.1-flash-image-preview' } }
    await view.rerender({ sessionConfig: config })
    expect(screen.queryByTestId('openai-image-settings')).not.toBeInTheDocument()
    expect(screen.queryByTestId('openai-image-tool-model')).not.toBeInTheDocument()
    expect(screen.queryByTestId('openai-image-tool-choice')).not.toBeInTheDocument()
    config = { ...config, routeSelection: openAIRoute }
    await view.rerender({ sessionConfig: config })
    expect(screen.getByTestId('openai-image-quality')).toHaveValue('max')
    expect(screen.getByTestId('openai-image-size')).toHaveValue('custom')
    await fireEvent.update(screen.getByTestId('openai-image-tool-model'), 'gpt-image-1-mini')
    await commit()
    expect(config.imageGeneration.detail?.openAI).toMatchObject({ toolModel: 'gpt-image-1-mini' })
    expect(config.imageGeneration.detail?.openAI?.quality).toBeUndefined()
    expect(config.imageGeneration.detail?.openAI?.size).toBeUndefined()
    expect(config.imageGeneration.detail?.imageSize).toBe('1K')
    expect(config.imageGeneration.detail?.aspectRatio).toBe('16:9')
  })

  it('retains explicit compression and mask choices and asks before resolving transparent JPEG', async () => {
    let config: ChatSessionConfig = { ...openAIResponsesSessionConfig(), imageGeneration: {
      enabled: true, resolution: '', aspectRatio: '1:1', mode: 'custom',
      detail: { enabled: true, imageSize: '', aspectRatio: '1:1', outputMode: 'auto', openAI: { format: 'jpeg', background: 'transparent', action: 'edit', outputCompression: 0 } },
    } }
    const mask = { assetId: 'mask', assetRevisionId: 'rev', assetSha256: 'sha', label: '遮罩.png' }
    const view = render(ChatSessionConsole, { props: { disabled: false, isRunning: false, sessionConfig: config, reasoningDisplayMode: 'inline', modelCatalog: [], imageMaskOptions: [mask], webSearchResolved: null, generationParamsResolved: null } })
    const commit = async () => {
      const detail = (view.emitted('updateImageGeneration') as unknown[][])?.at(-1)?.[0] as ImageGenerationUserConfig
      config = { ...config, imageGeneration: { ...config.imageGeneration, detail } }
      await view.rerender({ sessionConfig: config })
    }
    expect(screen.getByTestId('openai-image-format-error')).toBeInTheDocument()
    expect(screen.getByTestId('openai-image-format')).toHaveValue('jpeg')
    await fireEvent.update(screen.getByTestId('openai-image-mask'), 'mask:rev')
    await commit()
    expect(config.imageGeneration.detail?.openAI?.maskAsset).toEqual({ assetId: 'mask', assetRevisionId: 'rev', assetSha256: 'sha' })
    await fireEvent.update(screen.getByTestId('openai-image-action'), 'generate')
    await commit()
    expect(config.imageGeneration.detail?.openAI?.maskAsset).toBeUndefined()
    expect(screen.getByTestId('openai-image-mask')).toBeDisabled()
    await fireEvent.click(screen.getByTestId('openai-image-use-png'))
    await commit()
    expect(screen.queryByTestId('openai-image-format-error')).not.toBeInTheDocument()
    expect(screen.getByTestId('openai-image-compression')).toBeDisabled()
    expect(config.imageGeneration.detail?.openAI?.outputCompression).toBe(0)
    await fireEvent.update(screen.getByTestId('openai-image-tool-choice'), 'auto')
    await commit()
    expect(config.imageGeneration.detail?.openAI?.toolChoice).toBe('auto')
    await fireEvent.update(screen.getByTestId('openai-image-tool-choice'), '')
    await commit()
    expect(config.imageGeneration.detail?.openAI?.toolChoice).toBeUndefined()
  })
  it('exposes explicit experimental OpenAI Responses text chat without endpoint or profile picker UI', async () => {
    const user = userEvent.setup()
    const view = render(ChatSessionConsole, {
      props: {
        disabled: false,
        isRunning: false,
        sessionConfig: openAIResponsesSessionConfig(),
        openAIResponsesChat: {
          enabled: true,
          experimentalLabel: 'Experimental · OpenAI Responses text-only · not OpenRouter',
        },
        reasoningDisplayMode: 'inline',
        modelCatalog: [],
        webSearchResolved: null,
        generationParamsResolved: null,
      },
    })

    expect(screen.getByTestId('openai-responses-chat-controls').textContent).toContain('Experimental')
    expect(screen.getByTestId('openai-responses-chat-controls').textContent).toContain('not OpenRouter')
    expect(screen.getByTestId('openai-responses-chat-warning').textContent).toContain(t('chat.console.provider.openAIResponses.warning'))
    expect(screen.getByTestId('openai-responses-chat-selected-status').textContent).toContain(tf('chat.console.provider.openAIResponses.status', { status: t('chat.console.status.active') }))
    expect(screen.getByTestId('openai-responses-chat-selected-status').textContent).toContain(tf('chat.console.provider.openAIResponses.selectedModel', { model: 'gpt-4.1-mini' }))
    expect(screen.getByTestId('openai-responses-chat-selected-status').textContent).toContain(t('chat.console.provider.openAIResponses.credentialBridge'))
    expect(screen.queryByText(/endpoint picker/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/profile picker/i)).not.toBeInTheDocument()
    expect(screen.queryByTestId('openai-responses-chat-model')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('openai-responses-chat-enabled'))
    await user.click(screen.getByTestId('openai-responses-chat-disable'))
    await user.click(screen.getByTestId('openai-responses-chat-clear'))

    expect(view.emitted('updateOpenAIResponsesChatEnabled')?.[0]).toEqual([false])
    expect(view.emitted('updateOpenAIResponsesChatEnabled')?.[1]).toEqual([false])
    expect(view.emitted('updateOpenAIResponsesChatModel')).toBeUndefined()
    expect(view.emitted('clearOpenAIResponsesChat')).toHaveLength(1)
  })

  it('renders OpenAI model availability diagnostics without publishing them to the main model select', async () => {
    const user = userEvent.setup()
    const view = render(ChatSessionConsole, {
      props: {
        disabled: false,
        isRunning: false,
        sessionConfig: defaultSessionConfig(),
        openAIResponsesChat: {
          enabled: true,
          experimentalLabel: 'Experimental · OpenAI Responses text-only · not OpenRouter',
        },
        openAIResponsesModelAvailability: {
          loading: false,
          result: {
            ok: true,
            providerKey: 'openai_responses',
            endpointId: 'openai-responses-official',
            profileId: 'openai_responses_v1',
            observedAtMs: Date.UTC(2026, 5, 25),
            warnings: ['OpenAI /models is treated as availability/basic ownership seed.'],
            sourceDocuments: [
              {
                source: 'openai_list_models_api_docs',
                url: 'https://platform.openai.com/docs/api-reference/models/list',
                observedAtMs: Date.UTC(2026, 5, 25),
              },
            ],
            rawSourcePayloads: [],
            models: [
              {
                providerKey: 'openai_responses',
                endpointId: 'openai-responses-official',
                profileId: 'openai_responses_v1',
                nativeModelId: 'gpt-4.1-mini',
                displayName: 'GPT-4.1 mini',
                ownedBy: 'system',
                createdAtSec: 1745875200,
                source: 'openai_models_api',
                confidence: 'provider_reported',
                observedAtMs: Date.UTC(2026, 5, 25),
                warnings: [],
                observation: {
                  schemaVersion: 2,
                  providerKey: 'openai_responses',
                  endpointId: 'openai-responses-official',
                  nativeModelId: 'gpt-4.1-mini',
                  observedAtMs: Date.UTC(2026, 5, 25),
                  rawProviderRecord: { id: 'gpt-4.1-mini', owned_by: 'system', created: 1745875200 },
                  facts: {
                    textChat: { providerPath: '$.textChat', ownProperty: false, presence: 'missing' },
                    reasoning: { providerPath: '$.reasoning', ownProperty: false, presence: 'missing' },
                    tools: { providerPath: '$.tools', ownProperty: false, presence: 'missing' },
                    structuredOutputs: { providerPath: '$.structuredOutputs', ownProperty: false, presence: 'missing' },
                    vision: { providerPath: '$.vision', ownProperty: false, presence: 'missing' },
                  },
                  provenance: {
                    sourceKind: 'provider_api',
                    sourceLabel: 'openai_models_api',
                    observedAtMs: Date.UTC(2026, 5, 25),
                    parserVersion: 2,
                  },
                },
              },
            ],
          },
        },
        reasoningDisplayMode: 'inline',
        modelCatalog: [
          { modelId: 'openrouter::anthropic/claude-3', name: 'OpenRouter Claude 3' } as any,
        ],
        webSearchResolved: null,
        generationParamsResolved: null,
      },
    })

    const diagnostics = screen.getByTestId('openai-responses-models-diagnostics')
    expect(diagnostics.textContent).toContain(tf('chat.console.availability.records', {
      count: 1,
      source: t('chat.console.provider.openAIResponses.sourceName'),
      observedAt: '2026-06-25T00:00:00.000Z',
    }))
    expect(diagnostics.textContent).toContain('gpt-4.1-mini')
    expect(diagnostics.textContent).toContain('openai_models_api')
    expect(diagnostics.textContent).toContain('provider_reported')
    expect(diagnostics.textContent).toContain(tf('chat.console.common.ownedBy', { owner: 'system' }))
    expect(diagnostics.textContent).toContain(t('chat.console.capability.unknown'))
    expect(diagnostics.textContent).toContain('openai_list_models_api_docs')
    expect((screen.getByTestId('openai-responses-models-list') as HTMLDetailsElement).open).toBe(false)

    await user.click(screen.getByTestId('openai-responses-models-refresh'))
    await user.click(screen.getByTestId('openai-responses-models-toggle'))
    await user.click(screen.getByTestId('openai-responses-model-use'))

    expect(view.emitted('refreshOpenAIResponsesModels')).toHaveLength(1)
    expect(view.emitted('updateRouteSelection')?.[0]).toEqual([{
      schemaVersion: 1, kind: 'provider_model', providerId: 'openai_responses', modelId: 'gpt-4.1-mini',
    }])

    const mainModelSelect = screen.getAllByRole('combobox')[0]
    expect(within(mainModelSelect).getByText('OpenRouter Claude 3')).toBeInTheDocument()
    expect(within(mainModelSelect).queryByText('gpt-4.1-mini')).not.toBeInTheDocument()
  })

  it('uses OpenAI Responses reasoning policy controls instead of legacy reasoning state', async () => {
    const user = userEvent.setup()
    const view = render(ChatSessionConsole, {
      props: {
        disabled: false,
        isRunning: false,
        sessionConfig: {
          ...defaultSessionConfig(),
          routeSelection: { schemaVersion: 1 as const, kind: 'provider_model' as const, providerId: 'openai_responses' as const, modelId: 'gpt-5.4-nano'  },
          reasoning: { enabled: false, effort: 'medium' as const },
          generationParams: {
            detail: {
              reasoningEffort: { mode: 'omit' as const },
            },
          },
        },
        openAIResponsesChat: {
          enabled: true,
          experimentalLabel: 'Experimental · OpenAI Responses text-only · not OpenRouter',
        },
        reasoningDisplayMode: 'inline',
        modelCatalog: [],
        webSearchResolved: null,
        generationParamsResolved: null,
        capabilityProjection: reasoningCapabilityProjection(),
      },
    })

    expect(screen.getByTestId('session-reasoning-enabled')).toBeDisabled()
    const controls = screen.getByTestId('session-openai-responses-reasoning-controls')
    expect(within(controls).getAllByRole('button', { name: t('chat.generationParams.reasoning.auto') })[0]).toBeInTheDocument()
    const summaryControls = within(controls).getByTestId('session-openai-responses-reasoning-summary-controls')
    expect(within(summaryControls).getByRole('button', { name: t('chat.generationParams.reasoning.off') })).toBeInTheDocument()
    expect(within(summaryControls).getByRole('button', { name: t('chat.generationParams.reasoning.auto') })).toBeInTheDocument()
    expect(within(summaryControls).getByRole('button', { name: t('chat.generationParams.reasoning.concise') })).toBeInTheDocument()
    expect(within(summaryControls).getByRole('button', { name: t('chat.generationParams.reasoning.detailed') })).toBeInTheDocument()

    await user.click(within(controls).getByRole('button', { name: 'low' }))

    expect(view.emitted('updateReasoningEnabled')).toBeUndefined()
    expect(view.emitted('updateReasoningEffort')).toBeUndefined()
    expect(view.emitted('updateGenerationParamsLayer')?.[0]).toEqual([
      {
        reasoningEffort: { mode: 'custom', value: 'low' },
      },
    ])

    await user.click(within(controls).getAllByRole('button', { name: t('chat.generationParams.reasoning.auto') })[0])
    expect(view.emitted('updateGenerationParamsLayer')?.[1]).toEqual([
      {
        reasoningEffort: { mode: 'omit' },
      },
    ])

    await user.click(within(summaryControls).getByRole('button', { name: t('chat.generationParams.reasoning.auto') }))

    expect(view.emitted('updateGenerationParamsLayer')?.[2]).toEqual([
      {
        reasoningEffort: { mode: 'omit' },
        reasoningSummary: { mode: 'custom', value: 'auto' },
      },
    ])
  })

  it('locks OpenAI Responses reasoning controls for models without explicit effort support', () => {
    render(ChatSessionConsole, {
      props: {
        disabled: false,
        isRunning: false,
        sessionConfig: openAIResponsesSessionConfig(),
        openAIResponsesChat: {
          enabled: true,
          experimentalLabel: 'Experimental · OpenAI Responses text-only · not OpenRouter',
        },
        reasoningDisplayMode: 'inline',
        modelCatalog: [],
        webSearchResolved: null,
        generationParamsResolved: null,
      },
    })

    expect(screen.getByTestId('session-reasoning-enabled')).toBeDisabled()
    expect(screen.getByTestId('session-openai-responses-reasoning-unsupported').textContent)
      .toContain(t('chat.console.reasoning.openAIResponsesUnsupported'))
  })
})
