import { fireEvent, render, screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import ChatSessionConsole from './ChatSessionConsole.vue'
import { t, tf } from '@/shared/i18n'

function defaultSessionConfig() {
  return {
    model: { selectedModelKey: null },
    reasoning: { enabled: false, effort: 'medium' as const },
    webSearch: { enabled: false, level: 'high' as const, detail: null },
    imageGeneration: {
      enabled: false,
      resolution: '1K' as const,
      aspectRatio: '1:1' as const,
      mode: 'default' as const,
      detail: null,
    },
    samplingParams: { detail: null },
  }
}

function googleAIStudioSessionConfig() {
  return {
    ...defaultSessionConfig(),
    model: { selectedProviderId: 'google_ai_studio' as const, selectedModelKey: 'gemini-2.5-flash' },
  }
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
          model: 'gemini-2.5-flash',
          experimentalLabel: 'Experimental · Google AI Studio Gemini text-only · not OpenRouter',
        },
        reasoningDisplayMode: 'inline',
        modelCatalog: [],
        webSearchResolved: null,
        samplingParamsResolved: null,
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
          model: 'gemini-2.5-flash',
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
            warnings: ['Gemini models.list is treated as availability and capability seed.'],
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
                warnings: ['Starverse curated Gemini capability hints are supplemental metadata.'],
                capabilitySeed: {
                  textChat: true,
                  supportedGenerationMethods: ['generateContent', 'countTokens'],
                  inputTokenLimit: 1048576,
                  outputTokenLimit: 65536,
                  thinking: 'supported',
                  functionCalling: 'unknown',
                  vision: 'unknown',
                  structuredOutput: 'unknown',
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
        samplingParamsResolved: null,
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
    expect(diagnostics.textContent).toContain(tf('chat.console.capability.methods', { value: 'generateContent, countTokens' }))
    expect(diagnostics.textContent).toContain(tf('chat.console.capability.thinking', { value: 'supported' }))
    expect(diagnostics.textContent).toContain('gemini_models_api_docs')
    expect(diagnostics.textContent).toContain('supplemental metadata')
    expect((screen.getByTestId('google-ai-studio-models-list') as HTMLDetailsElement).open).toBe(false)

    await user.click(screen.getByTestId('google-ai-studio-models-refresh'))
    await user.click(screen.getByTestId('google-ai-studio-models-toggle'))
    await user.click(screen.getByTestId('google-ai-studio-model-use'))

    expect(view.emitted('refreshGoogleAIStudioModels')).toHaveLength(1)
    expect(view.emitted('updateModel')?.[0]).toEqual([{ providerId: 'google_ai_studio', modelId: 'gemini-2.5-flash' }])

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
          googleAIStudioThinking: {
            mode: 'budget',
            thinkingBudget: 2048,
            includeThoughts: false,
          },
        },
        reasoningDisplayMode: 'inline',
        modelCatalog: [],
        webSearchResolved: null,
        samplingParamsResolved: null,
      },
    })

    expect(screen.getByTestId('session-google-thinking-budget-controls')).toBeInTheDocument()
    expect(screen.getByTestId('session-google-thinking-budget')).toHaveValue(2048)
    expect(screen.queryByTestId('session-google-thinking-level')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('session-google-thinking-include-thoughts'))
    await fireEvent.update(screen.getByTestId('session-google-thinking-budget'), '4096')

    expect(view.emitted('updateGoogleAIStudioThinking')?.[0]).toEqual([{ includeThoughts: true }])
    expect(view.emitted('updateGoogleAIStudioThinking')?.[1]).toEqual([{ mode: 'budget', thinkingBudget: 4096 }])
    expect(view.emitted('updateReasoningEffort')).toBeUndefined()
  })

  it('uses Gemini thinkingLevel controls for Gemini 3 models', async () => {
    const view = render(ChatSessionConsole, {
      props: {
        disabled: false,
        isRunning: false,
        sessionConfig: {
          ...googleAIStudioSessionConfig(),
          model: { selectedProviderId: 'google_ai_studio' as const, selectedModelKey: 'gemini-3-pro' },
          googleAIStudioThinking: {
            mode: 'level',
            thinkingLevel: 'high' as const,
            includeThoughts: true,
          },
        },
        reasoningDisplayMode: 'inline',
        modelCatalog: [],
        webSearchResolved: null,
        samplingParamsResolved: null,
      },
    })

    expect(screen.getByTestId('session-google-thinking-level-controls')).toBeInTheDocument()
    expect(screen.getByTestId('session-google-thinking-level')).toHaveValue('high')
    expect(screen.queryByTestId('session-google-thinking-budget')).not.toBeInTheDocument()

    await fireEvent.update(screen.getByTestId('session-google-thinking-level'), 'minimal')

    expect(view.emitted('updateGoogleAIStudioThinking')?.[0]).toEqual([{ mode: 'level', thinkingLevel: 'minimal' }])
    expect(view.emitted('updateReasoningEffort')).toBeUndefined()
  })
})
