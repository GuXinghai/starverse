import { fireEvent, render, screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import ChatSessionConsole from './ChatSessionConsole.vue'
import { t, tf } from '@/shared/i18n'

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

function googleAIStudioSessionConfig() {
  return {
    ...defaultSessionConfig(),
    routeSelection: { schemaVersion: 1 as const, kind: 'provider_model' as const, providerId: 'google_ai_studio' as const, modelId: 'gemini-2.5-flash'  },
  }
}

function googleAvailability(modelId: string, thinking = true) {
  return {
    loading: false,
    result: {
      ok: true,
      providerKey: 'google_ai_studio',
      endpointId: 'google-ai-studio-official',
      profileId: 'gemini_api_v1',
      observedAtMs: Date.UTC(2026, 5, 25),
      warnings: [],
      sourceDocuments: [],
      models: [{
        providerKey: 'google_ai_studio',
        endpointId: 'google-ai-studio-official',
        profileId: 'gemini_api_v1',
        nativeModelId: modelId,
        source: 'gemini_models_api',
        confidence: 'provider_reported',
        observedAtMs: Date.UTC(2026, 5, 25),
        warnings: [],
        providerSpecific: {
          thinkingOwnProperty: true,
          thinkingRawValue: thinking,
          thinkingRawType: typeof thinking === 'boolean' ? 'boolean' : 'missing',
          supportedGenerationMethods: ['generateContent'],
        },
      }],
    },
  } as any
}

function geminiCapabilityProjection(input: {
  budget?: { min: number; max: number }
  levels?: readonly string[]
  imageSizes?: readonly string[]
  aspectRatios?: readonly string[]
  summaries?: readonly string[]
} = {}) {
  const missing = { visibility: 'hidden', state: 'missing', constraints: [], evidenceIds: [] }
  const controls: Record<string, unknown> = {
    'reasoning.mode': {
      visibility: 'visible', state: 'supported', domain: { kind: 'enum', values: ['disabled', 'enabled'] }, constraints: [], evidenceIds: [],
    },
    'providerExtension.thinkingBudget': input.budget
      ? { visibility: 'visible', state: 'supported', domain: { kind: 'range', min: input.budget.min, max: input.budget.max, integer: true }, constraints: [], evidenceIds: [] }
      : missing,
    'providerExtension.thinkingLevel': input.levels
      ? { visibility: 'visible', state: 'supported', domain: { kind: 'enum', values: [...input.levels] }, constraints: [], evidenceIds: [] }
      : missing,
    'reasoning.summary': input.summaries
      ? { visibility: 'visible', state: 'supported', domain: { kind: 'enum', values: [...input.summaries] }, constraints: [], evidenceIds: [] }
      : missing,
    'image.mode': input.imageSizes || input.aspectRatios
      ? { visibility: 'visible', state: 'supported', domain: { kind: 'enum', values: ['generate'] }, constraints: [], evidenceIds: [] }
      : missing,
    'image.resolution': input.imageSizes
      ? { visibility: 'visible', state: 'supported', domain: { kind: 'enum', values: [...input.imageSizes] }, constraints: [], evidenceIds: [] }
      : missing,
    'image.aspectRatio': input.aspectRatios
      ? { visibility: 'visible', state: 'supported', domain: { kind: 'enum', values: [...input.aspectRatios] }, constraints: [], evidenceIds: [] }
      : missing,
    'image.outputMode': missing,
  }
  return { schemaVersion: 1, binding: {}, capabilityRevision: 'capability-v2:test-gemini', controls } as any
}

describe('ChatSessionConsole Google AI Studio chat controls', () => {
  it('exposes explicit experimental Google AI Studio text chat without endpoint or profile picker UI', async () => {
    const user = userEvent.setup()
    const view = render(ChatSessionConsole, {
      props: {
        disabled: false,
        isRunning: false,
        sessionConfig: googleAIStudioSessionConfig(),
        googleAIStudioChat: {
          enabled: true,
          experimentalLabel: 'Experimental · Google AI Studio Gemini text-only · not OpenRouter',
        },
        reasoningDisplayMode: 'inline',
        modelCatalog: [],
        webSearchResolved: null,
        generationParamsResolved: null,
      },
    })

    expect(screen.getByTestId('google-ai-studio-chat-controls').textContent).toContain('Experimental')
    expect(screen.getByTestId('google-ai-studio-chat-controls').textContent).toContain('not OpenRouter')
    expect(screen.getByTestId('google-ai-studio-chat-warning').textContent).toContain(t('chat.console.provider.googleAIStudio.warning'))
    expect(screen.getByTestId('google-ai-studio-chat-selected-status').textContent).toContain(tf('chat.console.provider.googleAIStudio.status', { status: t('chat.console.status.active') }))
    expect(screen.getByTestId('google-ai-studio-chat-selected-status').textContent).toContain(tf('chat.console.provider.googleAIStudio.selectedModel', { model: 'gemini-2.5-flash' }))
    expect(screen.getByTestId('google-ai-studio-chat-selected-status').textContent).toContain(t('chat.console.provider.googleAIStudio.credentialBridge'))
    expect(screen.queryByText(/endpoint picker/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/profile picker/i)).not.toBeInTheDocument()
    expect(screen.queryByTestId('google-ai-studio-chat-model')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('google-ai-studio-chat-enabled'))
    await user.click(screen.getByTestId('google-ai-studio-chat-disable'))
    await user.click(screen.getByTestId('google-ai-studio-chat-clear'))

    expect(view.emitted('updateGoogleAIStudioChatEnabled')?.[0]).toEqual([false])
    expect(view.emitted('updateGoogleAIStudioChatEnabled')?.[1]).toEqual([false])
    expect(view.emitted('updateGoogleAIStudioChatModel')).toBeUndefined()
    expect(view.emitted('clearGoogleAIStudioChat')).toHaveLength(1)
  })

  it('renders Gemini model availability diagnostics without publishing them to the main model select', async () => {
    const user = userEvent.setup()
    const view = render(ChatSessionConsole, {
      props: {
        disabled: false,
        isRunning: false,
        sessionConfig: defaultSessionConfig(),
        googleAIStudioChat: {
          enabled: true,
          experimentalLabel: 'Experimental · Google AI Studio Gemini text-only · not OpenRouter',
        },
        googleAIStudioModelAvailability: {
          loading: false,
          result: {
            ok: true,
            providerKey: 'google_ai_studio',
            endpointId: 'google-ai-studio-official',
            profileId: 'gemini_api_v1',
            observedAtMs: Date.UTC(2026, 5, 25),
            warnings: [],
            sourceDocuments: [
              {
                source: 'gemini_models_api_docs',
                url: 'https://ai.google.dev/api/models',
                observedAtMs: Date.UTC(2026, 5, 25),
              },
            ],
            models: [
              {
                providerKey: 'google_ai_studio',
                endpointId: 'google-ai-studio-official',
                profileId: 'gemini_api_v1',
                nativeModelId: 'gemini-2.5-flash',
                providerModelName: 'models/gemini-2.5-flash',
                displayName: 'Gemini 2.5 Flash',
                source: 'gemini_models_api',
                confidence: 'provider_reported',
                observedAtMs: Date.UTC(2026, 5, 25),
                warnings: [],
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

    const diagnostics = screen.getByTestId('google-ai-studio-models-diagnostics')
    expect(diagnostics.textContent).toContain(tf('chat.console.availability.records', {
      count: 1,
      source: t('chat.console.provider.googleAIStudio.sourceName'),
      observedAt: '2026-06-25T00:00:00.000Z',
    }))
    expect(diagnostics.textContent).toContain('gemini-2.5-flash')
    expect(diagnostics.textContent).toContain('gemini_models_api')
    expect(diagnostics.textContent).toContain('provider_reported')
    expect(diagnostics.textContent).toContain(t('chat.console.capability.unknown'))
    expect(diagnostics.textContent).toContain('gemini_models_api_docs')
    expect((screen.getByTestId('google-ai-studio-models-list') as HTMLDetailsElement).open).toBe(false)

    await user.click(screen.getByTestId('google-ai-studio-models-refresh'))
    await user.click(screen.getByTestId('google-ai-studio-models-toggle'))
    await user.click(screen.getByTestId('google-ai-studio-model-use'))

    expect(view.emitted('refreshGoogleAIStudioModels')).toHaveLength(1)
    expect(view.emitted('updateRouteSelection')?.[0]).toEqual([{
      schemaVersion: 1, kind: 'provider_model', providerId: 'google_ai_studio', modelId: 'gemini-2.5-flash',
    }])

    const mainModelSelect = screen.getAllByRole('combobox')[0]
    expect(within(mainModelSelect).getByText('OpenRouter Claude 3')).toBeInTheDocument()
    expect(within(mainModelSelect).queryByText('gemini-2.5-flash')).not.toBeInTheDocument()
  })

  it('uses Gemini thinkingBudget controls for Gemini 2.5 models', async () => {
    const user = userEvent.setup()
    const view = render(ChatSessionConsole, {
      props: {
        disabled: false,
        isRunning: false,
        sessionConfig: {
          ...googleAIStudioSessionConfig(),
          generationParams: {
            detail: {
              thinkingBudget: { mode: 'custom', value: 2048 },
              includeThoughts: { mode: 'custom', value: false },
            },
          },
        },
        googleAIStudioModelAvailability: googleAvailability('gemini-2.5-flash'),
        capabilityProjection: geminiCapabilityProjection({ budget: { min: 1024, max: 32768 } }),
        reasoningDisplayMode: 'inline',
        modelCatalog: [],
        webSearchResolved: null,
        generationParamsResolved: null,
      },
    })

    expect(screen.getByTestId('session-google-thinking-budget-controls')).toBeInTheDocument()
    expect(screen.getByTestId('session-google-thinking-budget')).toHaveValue(2048)
    expect(screen.queryByTestId('session-google-thinking-level')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('session-google-thinking-include-thoughts'))
    await fireEvent.update(screen.getByTestId('session-google-thinking-budget'), '4096')

    expect(view.emitted('updateGenerationParamsLayer')?.[0]).toEqual([{
      thinkingBudget: { mode: 'custom', value: 2048 },
      includeThoughts: { mode: 'custom', value: true },
    }])
    expect(view.emitted('updateGenerationParamsLayer')?.[1]).toEqual([{
      thinkingLevel: { mode: 'omit' },
      thinkingBudget: { mode: 'custom', value: 4096 },
      includeThoughts: { mode: 'custom', value: false },
    }])
    expect(view.emitted('updateReasoningEffort')).toBeUndefined()
  })

  it('uses Gemini thinkingLevel controls for Gemini 3 models', async () => {
    const view = render(ChatSessionConsole, {
      props: {
        disabled: false,
        isRunning: false,
        sessionConfig: {
          ...googleAIStudioSessionConfig(),
          routeSelection: { schemaVersion: 1 as const, kind: 'provider_model' as const, providerId: 'google_ai_studio' as const, modelId: 'gemini-3.1-pro-preview'  },
          generationParams: {
            detail: {
              thinkingLevel: { mode: 'custom', value: 'high' },
              includeThoughts: { mode: 'custom', value: true },
            },
          },
        },
        googleAIStudioModelAvailability: googleAvailability('gemini-3.1-pro-preview'),
        capabilityProjection: geminiCapabilityProjection({ levels: ['medium', 'high'] }),
        reasoningDisplayMode: 'inline',
        modelCatalog: [],
        webSearchResolved: null,
        generationParamsResolved: null,
      },
    })

    expect(screen.getByTestId('session-google-thinking-level-controls')).toBeInTheDocument()
    expect(screen.getByTestId('session-google-thinking-level')).toHaveValue('high')
    expect(screen.queryByTestId('session-google-thinking-budget')).not.toBeInTheDocument()

    await fireEvent.update(screen.getByTestId('session-google-thinking-level'), 'medium')

    expect(view.emitted('updateGenerationParamsLayer')?.[0]).toEqual([{
      thinkingLevel: { mode: 'custom', value: 'medium' },
      thinkingBudget: { mode: 'omit' },
      includeThoughts: { mode: 'custom', value: true },
    }])
    expect(view.emitted('updateReasoningEffort')).toBeUndefined()
  })

  it('renders model-specific default labels and keeps Dynamic out of the level enum', () => {
    const view = render(ChatSessionConsole, {
      props: {
        disabled: false,
        isRunning: false,
        sessionConfig: {
          ...googleAIStudioSessionConfig(),
          routeSelection: { schemaVersion: 1 as const, kind: 'provider_model' as const, providerId: 'google_ai_studio' as const, modelId: 'gemini-3.6-flash'  },
        },
        googleAIStudioModelAvailability: googleAvailability('gemini-3.6-flash'),
        capabilityProjection: geminiCapabilityProjection({ levels: ['medium', 'high'] }),
        reasoningDisplayMode: 'inline',
        modelCatalog: [],
        webSearchResolved: null,
        generationParamsResolved: null,
      },
    })

    const level = screen.getByTestId('session-google-thinking-level')
    expect(within(level).getByRole('option', { name: '默认（medium）' })).toBeInTheDocument()
    expect(within(level).getByRole('option', { name: 'High（动态）' })).toBeInTheDocument()
    expect(within(level).queryByRole('option', { name: 'Dynamic' })).not.toBeInTheDocument()
    view.unmount()

    render(ChatSessionConsole, {
      props: {
        disabled: false,
        isRunning: false,
        sessionConfig: {
          ...googleAIStudioSessionConfig(),
          routeSelection: { schemaVersion: 1 as const, kind: 'provider_model' as const, providerId: 'google_ai_studio' as const, modelId: 'gemini-2.5-pro'  },
        },
        googleAIStudioModelAvailability: googleAvailability('gemini-2.5-pro'),
        capabilityProjection: geminiCapabilityProjection({ budget: { min: 1024, max: 32768 } }),
        reasoningDisplayMode: 'inline',
        modelCatalog: [],
        webSearchResolved: null,
        generationParamsResolved: null,
      },
    })
    const budget = screen.getByTestId('session-google-thinking-budget-mode')
    expect(within(budget).getByRole('option', { name: '默认（动态）' })).toBeInTheDocument()
    expect(within(budget).queryByRole('option', { name: '关闭' })).not.toBeInTheDocument()
  })

  it('uses managed Gemini image thinking controls and model-specific image sizes for Nano Banana 2 Lite', async () => {
    const view = render(ChatSessionConsole, {
      props: {
        disabled: false,
        isRunning: false,
        sessionConfig: {
          ...googleAIStudioSessionConfig(),
          routeSelection: { schemaVersion: 1 as const, kind: 'provider_model' as const, providerId: 'google_ai_studio' as const, modelId: 'gemini-3.1-flash-lite-image'  },
          generationParams: {
            detail: {
              thinkingLevel: { mode: 'custom', value: 'minimal' },
              thoughtSummaryMode: { mode: 'custom', value: 'none' },
            },
          },
          imageGeneration: {
            enabled: true,
            resolution: '1K' as const,
            aspectRatio: '1:1' as const,
            mode: 'default' as const,
            detail: null,
          },
        },
        reasoningDisplayMode: 'inline',
        capabilityProjection: geminiCapabilityProjection({
          levels: ['minimal', 'high'],
          imageSizes: ['1K'],
          aspectRatios: ['1:1', '16:9'],
          summaries: ['auto'],
        }),
        modelCatalog: [],
        webSearchResolved: null,
        generationParamsResolved: null,
      },
    })

    expect(screen.getByTestId('session-reasoning-enabled')).toBeDisabled()
    expect(screen.queryByTestId('session-google-thinking-budget')).not.toBeInTheDocument()
    const levelSelect = screen.getByTestId('session-google-thinking-level')
    expect(levelSelect).toHaveValue('minimal')
    expect(within(levelSelect).getByRole('option', { name: 'minimal' })).toBeInTheDocument()
    expect(within(levelSelect).getByRole('option', { name: 'high' })).toBeInTheDocument()
    expect(screen.getByTestId('session-google-thinking-provider-managed')).toHaveTextContent(t('chat.console.reasoning.geminiImageProviderManaged'))

    await userEvent.click(screen.getByTestId('session-google-thinking-include-thoughts'))

    expect(view.emitted('updateGenerationParamsLayer')?.[0]).toEqual([{
      thinkingLevel: { mode: 'custom', value: 'minimal' },
      thoughtSummaryMode: { mode: 'custom', value: 'auto' },
    }])
    expect(screen.getByRole('button', { name: '1K' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '2K' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '4K' })).not.toBeInTheDocument()
  })

  it('forces image generation on and keeps reasoning off for legacy Nano Banana', async () => {
    const view = render(ChatSessionConsole, {
      props: {
        disabled: false,
        isRunning: false,
        sessionConfig: {
          ...googleAIStudioSessionConfig(),
          routeSelection: { schemaVersion: 1 as const, kind: 'provider_model' as const, providerId: 'google_ai_studio' as const, modelId: 'gemini-2.5-flash-image'  },
          imageGeneration: {
            enabled: false,
            resolution: '4K' as const,
            aspectRatio: '16:9' as const,
            mode: 'default' as const,
            detail: null,
          },
        },
        reasoningDisplayMode: 'inline',
        capabilityProjection: geminiCapabilityProjection({ aspectRatios: ['1:1'] }),
        modelCatalog: [],
        webSearchResolved: null,
        generationParamsResolved: null,
      },
    })

    expect(screen.queryByTestId('session-reasoning-enabled')).not.toBeInTheDocument()
    expect(screen.queryByTestId('session-google-thinking-unsupported')).not.toBeInTheDocument()

    const imageToggle = screen.getByTestId('session-image-generation-enabled')
    expect(imageToggle).toBeDisabled()
    expect(imageToggle).toBeChecked()
    expect(screen.getByRole('button', { name: '1:1' })).toHaveClass('bg-gray-900')
    expect(screen.queryByRole('button', { name: '1K' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '2K' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '4K' })).not.toBeInTheDocument()

    await userEvent.click(imageToggle)
    expect(view.emitted('updateImageGenerationEnabled')).toBeUndefined()
  })

  it('keeps selected supported image size and aspect ratio for Google image models', () => {
    render(ChatSessionConsole, {
      props: {
        disabled: false,
        isRunning: false,
        sessionConfig: {
          ...googleAIStudioSessionConfig(),
          routeSelection: { schemaVersion: 1 as const, kind: 'provider_model' as const, providerId: 'google_ai_studio' as const, modelId: 'gemini-3.1-flash-image'  },
          generationParams: {
            detail: {
              thinkingLevel: { mode: 'custom', value: 'minimal' },
              thoughtSummaryMode: { mode: 'custom', value: 'none' },
            },
          },
          imageGeneration: {
            enabled: true,
            resolution: '4K' as const,
            aspectRatio: '16:9' as const,
            mode: 'custom' as const,
            detail: null,
          },
        },
        reasoningDisplayMode: 'inline',
        capabilityProjection: geminiCapabilityProjection({
          levels: ['minimal', 'high'],
          imageSizes: ['1K', '2K', '4K'],
          aspectRatios: ['1:1', '16:9'],
          summaries: ['auto'],
        }),
        modelCatalog: [],
        webSearchResolved: null,
        generationParamsResolved: null,
      },
    })

    expect(screen.getByRole('button', { name: '4K' })).toHaveClass('bg-gray-900')
    expect(screen.getByRole('button', { name: '16:9' })).toHaveClass('bg-gray-900')
  })
})
