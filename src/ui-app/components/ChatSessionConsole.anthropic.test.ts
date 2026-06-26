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

describe('ChatSessionConsole Anthropic Messages chat controls', () => {
  it('exposes explicit experimental Anthropic Messages text chat without endpoint or profile picker UI', async () => {
    const user = userEvent.setup()
    const view = render(ChatSessionConsole, {
      props: {
        disabled: false,
        isRunning: false,
        sessionConfig: defaultSessionConfig(),
        anthropicChat: {
          enabled: true,
          model: 'claude-sonnet-4-5',
          experimentalLabel: 'Experimental · Anthropic Messages text-only · not OpenRouter',
        },
        reasoningDisplayMode: 'inline',
        modelCatalog: [],
        webSearchResolved: null,
        samplingParamsResolved: null,
      },
    })

    expect(screen.getByTestId('anthropic-chat-controls').textContent).toContain('Experimental')
    expect(screen.getByTestId('anthropic-chat-controls').textContent).toContain('not OpenRouter')
    expect(screen.getByTestId('anthropic-chat-warning').textContent).toContain('Native Anthropic Messages API text-only')
    expect(screen.getByTestId('anthropic-chat-warning').textContent).toContain('Generic compatibility routing are disabled')
    expect(screen.getByTestId('anthropic-chat-selected-status').textContent).toContain('Anthropic Messages chat is active')
    expect(screen.getByTestId('anthropic-chat-selected-status').textContent).toContain('Selected Claude model: claude-sonnet-4-5')
    expect(screen.getByTestId('anthropic-chat-selected-status').textContent).toContain('does not expose API keys')
    expect(screen.queryByText(/endpoint picker/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/profile picker/i)).not.toBeInTheDocument()

    await user.click(screen.getByTestId('anthropic-chat-enabled'))
    await user.type(screen.getByTestId('anthropic-chat-model'), 'claude')
    await user.click(screen.getByTestId('anthropic-chat-disable'))
    await user.click(screen.getByTestId('anthropic-chat-clear'))

    expect(view.emitted('updateAnthropicChatEnabled')?.[0]).toEqual([false])
    expect(view.emitted('updateAnthropicChatEnabled')?.[1]).toEqual([false])
    expect(view.emitted('updateAnthropicChatModel')?.length).toBeGreaterThan(0)
    expect(view.emitted('clearAnthropicChat')).toHaveLength(1)
  })

  it('renders Anthropic model availability diagnostics without publishing them to the main model select', async () => {
    const user = userEvent.setup()
    const view = render(ChatSessionConsole, {
      props: {
        disabled: false,
        isRunning: false,
        sessionConfig: defaultSessionConfig(),
        anthropicChat: {
          enabled: true,
          model: 'claude-sonnet-4-5',
          experimentalLabel: 'Experimental · Anthropic Messages text-only · not OpenRouter',
        },
        anthropicModelAvailability: {
          loading: false,
          result: {
            ok: true,
            providerKey: 'anthropic_messages',
            endpointId: 'anthropic-official',
            profileId: 'anthropic_messages_v1',
            observedAtMs: Date.UTC(2026, 5, 25),
            warnings: ['Anthropic models pagination was truncated after the bounded R5 page limit.'],
            sourceDocuments: [
              {
                source: 'anthropic_list_models_api_docs',
                url: 'https://platform.claude.com/docs/en/api/models/list',
                observedAtMs: Date.UTC(2026, 5, 25),
              },
            ],
            models: [
              {
                providerKey: 'anthropic_messages',
                endpointId: 'anthropic-official',
                profileId: 'anthropic_messages_v1',
                nativeModelId: 'claude-sonnet-4-5',
                displayName: 'Claude Sonnet 4.5',
                createdAt: '2026-01-15T00:00:00Z',
                modelType: 'model',
                source: 'anthropic_models_api',
                confidence: 'provider_reported',
                observedAtMs: Date.UTC(2026, 5, 25),
                warnings: ['Anthropic Models API is the provider-reported source; Starverse curated metadata is supplemental.'],
                capabilitySeed: {
                  textChat: true,
                  imageInput: true,
                  maxInputTokens: 200000,
                  maxOutputTokens: 64000,
                  thinking: 'supported',
                  adaptiveThinking: true,
                  toolUse: true,
                  files: 'unknown',
                  structuredOutput: 'unknown',
                  citations: 'unknown',
                  capabilitiesRawKeys: ['adaptive_thinking', 'thinking', 'tool_use', 'vision'],
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

    const diagnostics = screen.getByTestId('anthropic-models-diagnostics')
    expect(diagnostics.textContent).toContain('1 Anthropic model availability records')
    expect(diagnostics.textContent).toContain('claude-sonnet-4-5')
    expect(diagnostics.textContent).toContain('anthropic_models_api')
    expect(diagnostics.textContent).toContain('provider_reported')
    expect(diagnostics.textContent).toContain('type model')
    expect(diagnostics.textContent).toContain('image input true')
    expect(diagnostics.textContent).toContain('thinking supported')
    expect(diagnostics.textContent).toContain('adaptive thinking true')
    expect(diagnostics.textContent).toContain('max input 200000')
    expect(diagnostics.textContent).toContain('max output 64000')
    expect(diagnostics.textContent).toContain('tool use true')
    expect(diagnostics.textContent).toContain('structured output unknown')
    expect(diagnostics.textContent).toContain('raw capability keys adaptive_thinking, thinking, tool_use, vision')
    expect(diagnostics.textContent).toContain('anthropic_list_models_api_docs')
    expect(diagnostics.textContent).toContain('bounded R5 page limit')
    expect(diagnostics.textContent).toContain('Starverse curated metadata')

    await user.click(screen.getByTestId('anthropic-models-refresh'))
    await user.click(screen.getByTestId('anthropic-model-use'))

    expect(view.emitted('refreshAnthropicModels')).toHaveLength(1)
    expect(view.emitted('updateAnthropicChatModel')?.[0]).toEqual(['claude-sonnet-4-5'])

    const mainModelSelect = screen.getAllByRole('combobox')[0]
    expect(within(mainModelSelect).getByText('OpenRouter Claude 3')).toBeInTheDocument()
    expect(within(mainModelSelect).queryByText('claude-sonnet-4-5')).not.toBeInTheDocument()
  })
})
