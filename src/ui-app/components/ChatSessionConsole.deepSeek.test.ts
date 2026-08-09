import { render, screen, within } from '@testing-library/vue'
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
    generationParams: { detail: null },
  }
}

function deepSeekSessionConfig() {
  return {
    ...defaultSessionConfig(),
    model: { selectedProviderId: 'deepseek' as const, selectedModelKey: 'deepseek-chat' },
  }
}

describe('ChatSessionConsole DeepSeek official chat controls', () => {
  it('exposes explicit experimental DeepSeek official text chat without endpoint or profile picker UI', async () => {
    const user = userEvent.setup()
    const view = render(ChatSessionConsole, {
      props: {
        disabled: false,
        isRunning: false,
        sessionConfig: deepSeekSessionConfig(),
        deepSeekChat: {
          enabled: true,
          model: 'deepseek-chat',
          experimentalLabel: 'Experimental · DeepSeek official text-only · not OpenRouter',
        },
        reasoningDisplayMode: 'inline',
        modelCatalog: [],
        webSearchResolved: null,
        generationParamsResolved: null,
      },
    })

    expect(screen.getByTestId('deepseek-chat-controls').textContent).toContain('Experimental')
    expect(screen.getByTestId('deepseek-chat-controls').textContent).toContain('not OpenRouter')
    expect(screen.getByTestId('deepseek-chat-warning').textContent).toContain(t('chat.console.provider.deepSeek.warning'))
    expect(screen.getByTestId('deepseek-chat-selected-status').textContent).toContain(tf('chat.console.provider.deepSeek.status', { status: t('chat.console.status.active') }))
    expect(screen.getByTestId('deepseek-chat-selected-status').textContent).toContain(tf('chat.console.provider.deepSeek.selectedModel', { model: 'deepseek-chat' }))
    expect(screen.getByTestId('deepseek-chat-selected-status').textContent).toContain(t('chat.console.provider.deepSeek.credentialBridge'))
    expect(screen.queryByText(/endpoint picker/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/profile picker/i)).not.toBeInTheDocument()
    expect(screen.queryByTestId('deepseek-chat-model')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('deepseek-chat-enabled'))
    await user.click(screen.getByTestId('deepseek-chat-disable'))
    await user.click(screen.getByTestId('deepseek-chat-clear'))

    expect(view.emitted('updateDeepSeekChatEnabled')?.[0]).toEqual([false])
    expect(view.emitted('updateDeepSeekChatEnabled')?.[1]).toEqual([false])
    expect(view.emitted('updateDeepSeekChatModel')).toBeUndefined()
    expect(view.emitted('clearDeepSeekChat')).toHaveLength(1)
  })

  it('renders DeepSeek model availability diagnostics without publishing them to the main model select', async () => {
    const user = userEvent.setup()
    const view = render(ChatSessionConsole, {
      props: {
        disabled: false,
        isRunning: false,
        sessionConfig: defaultSessionConfig(),
        deepSeekChat: {
          enabled: true,
          model: 'deepseek-v4-flash',
          experimentalLabel: 'Experimental · DeepSeek official text-only · not OpenRouter',
        },
        deepSeekModelAvailability: {
          loading: false,
          result: {
            ok: true,
            providerKey: 'deepseek',
            endpointId: 'deepseek-official',
            profileId: 'deepseek_official_openai_compat',
            observedAtMs: Date.UTC(2026, 5, 21),
            warnings: [],
            sourceDocuments: [
              {
                source: 'deepseek_list_models_api_docs',
                url: 'https://api-docs.deepseek.com/api/list-models',
                observedAtMs: Date.UTC(2026, 5, 21),
              },
            ],
            models: [
              {
                providerKey: 'deepseek',
                endpointId: 'deepseek-official',
                profileId: 'deepseek_official_openai_compat',
                nativeModelId: 'deepseek-v4-flash',
                displayName: 'DeepSeek V4 Flash',
                ownedBy: 'deepseek',
                source: 'deepseek_models_api',
                confidence: 'provider_reported',
                observedAtMs: Date.UTC(2026, 5, 21),
                warnings: [],
                pricingSeed: {
                  inputCacheHitPer1MTokens: '0.0028',
                  inputCacheMissPer1MTokens: '0.14',
                  outputPer1MTokens: '0.28',
                  currency: 'USD',
                  source: 'deepseek_pricing_metadata',
                  observedAtMs: Date.UTC(2026, 5, 21),
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

    const diagnostics = screen.getByTestId('deepseek-models-diagnostics')
    expect(diagnostics.textContent).toContain(tf('chat.console.availability.records', {
      count: 1,
      source: t('chat.console.provider.deepSeek.sourceName'),
      observedAt: '2026-06-21T00:00:00.000Z',
    }))
    expect(diagnostics.textContent).toContain('deepseek-v4-flash')
    expect(diagnostics.textContent).toContain('deepseek_models_api')
    expect(diagnostics.textContent).toContain('provider_reported')
    expect(diagnostics.textContent).toContain('deepseek_list_models_api_docs')
    expect((screen.getByTestId('deepseek-models-list') as HTMLDetailsElement).open).toBe(false)

    await user.click(screen.getByTestId('deepseek-models-refresh'))
    await user.click(screen.getByTestId('deepseek-models-toggle'))
    await user.click(screen.getAllByTestId('deepseek-model-use')[0])

    expect(view.emitted('refreshDeepSeekModels')).toHaveLength(1)
    expect(view.emitted('updateModel')?.[0]).toEqual([{ providerId: 'deepseek', modelId: 'deepseek-v4-flash' }])

    const mainModelSelect = screen.getAllByRole('combobox')[0]
    expect(within(mainModelSelect).getByText('OpenRouter Claude 3')).toBeInTheDocument()
    expect(within(mainModelSelect).queryByText('deepseek-v4-flash')).not.toBeInTheDocument()
  })
})
