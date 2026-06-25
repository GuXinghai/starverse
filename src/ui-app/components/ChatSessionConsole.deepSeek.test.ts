import { render, screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import ChatSessionConsole from './ChatSessionConsole.vue'

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

describe('ChatSessionConsole DeepSeek official chat controls', () => {
  it('exposes explicit experimental DeepSeek official text chat without endpoint or profile picker UI', async () => {
    const user = userEvent.setup()
    const view = render(ChatSessionConsole, {
      props: {
        disabled: false,
        isRunning: false,
        sessionConfig: defaultSessionConfig(),
        deepSeekChat: {
          enabled: true,
          model: 'deepseek-chat',
          experimentalLabel: 'Experimental · DeepSeek official text-only · not OpenRouter',
        },
        reasoningDisplayMode: 'inline',
        modelCatalog: [],
        webSearchResolved: null,
        samplingParamsResolved: null,
      },
    })

    expect(screen.getByTestId('deepseek-chat-controls').textContent).toContain('Experimental')
    expect(screen.getByTestId('deepseek-chat-controls').textContent).toContain('not OpenRouter')
    expect(screen.getByTestId('deepseek-chat-warning').textContent).toContain('DeepSeek official API text-only')
    expect(screen.getByTestId('deepseek-chat-warning').textContent).toContain('reasoning_content display')
    expect(screen.getByTestId('deepseek-chat-warning').textContent).toContain('Generic compatibility routing are disabled')
    expect(screen.getByTestId('deepseek-chat-selected-status').textContent).toContain('DeepSeek official chat is active')
    expect(screen.getByTestId('deepseek-chat-selected-status').textContent).toContain('Selected DeepSeek model: deepseek-chat')
    expect(screen.getByTestId('deepseek-chat-selected-status').textContent).toContain('does not expose API keys')
    expect(screen.queryByText(/endpoint picker/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/profile picker/i)).not.toBeInTheDocument()

    await user.click(screen.getByTestId('deepseek-chat-enabled'))
    await user.type(screen.getByTestId('deepseek-chat-model'), 'deepseek')
    await user.click(screen.getByTestId('deepseek-chat-disable'))
    await user.click(screen.getByTestId('deepseek-chat-clear'))

    expect(view.emitted('updateDeepSeekChatEnabled')?.[0]).toEqual([false])
    expect(view.emitted('updateDeepSeekChatEnabled')?.[1]).toEqual([false])
    expect(view.emitted('updateDeepSeekChatModel')?.length).toBeGreaterThan(0)
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
            warnings: ['DeepSeek pricing/model details are curated metadata seeds.'],
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
                warnings: ['Model details and pricing are seeded from DeepSeek Models & Pricing docs, not from the /models API.'],
                capabilitySeed: {
                  textChat: true,
                  thinkingMode: 'supported',
                  contextLength: 1000000,
                  maxOutputTokens: 384000,
                },
                pricingSeed: {
                  inputCacheHitPer1MTokens: '0.0028',
                  inputCacheMissPer1MTokens: '0.14',
                  outputPer1MTokens: '0.28',
                  currency: 'USD',
                  source: 'deepseek_pricing_metadata',
                  observedAtMs: Date.UTC(2026, 5, 21),
                },
              },
              {
                providerKey: 'deepseek',
                endpointId: 'deepseek-official',
                profileId: 'deepseek_official_openai_compat',
                nativeModelId: 'deepseek-chat',
                displayName: 'DeepSeek Chat (deprecated alias)',
                ownedBy: 'deepseek',
                source: 'starverse_curated_metadata',
                confidence: 'curated',
                observedAtMs: Date.UTC(2026, 5, 21),
                warnings: [
                  'deepseek-chat is a deprecated compatibility alias until 2026-07-24T15:59:00.000Z; use deepseek-v4-flash non-thinking mode instead.',
                ],
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

    const diagnostics = screen.getByTestId('deepseek-models-diagnostics')
    expect(diagnostics.textContent).toContain('2 DeepSeek model availability records')
    expect(diagnostics.textContent).toContain('deepseek-v4-flash')
    expect(diagnostics.textContent).toContain('deepseek_models_api')
    expect(diagnostics.textContent).toContain('provider_reported')
    expect(diagnostics.textContent).toContain('deepseek-chat')
    expect(diagnostics.textContent).toContain('deprecated compatibility alias')
    expect(diagnostics.textContent).toContain('deepseek_list_models_api_docs')

    await user.click(screen.getByTestId('deepseek-models-refresh'))
    await user.click(screen.getAllByTestId('deepseek-model-use')[0])

    expect(view.emitted('refreshDeepSeekModels')).toHaveLength(1)
    expect(view.emitted('updateDeepSeekChatModel')?.[0]).toEqual(['deepseek-v4-flash'])

    const mainModelSelect = screen.getAllByRole('combobox')[0]
    expect(within(mainModelSelect).getByText('OpenRouter Claude 3')).toBeInTheDocument()
    expect(within(mainModelSelect).queryByText('deepseek-v4-flash')).not.toBeInTheDocument()
    expect(within(mainModelSelect).queryByText('deepseek-chat')).not.toBeInTheDocument()
  })
})
