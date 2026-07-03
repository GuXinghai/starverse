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
    samplingParams: { detail: null },
  }
}

function openAIResponsesSessionConfig() {
  return {
    ...defaultSessionConfig(),
    model: { selectedProviderId: 'openai_responses' as const, selectedModelKey: 'gpt-4.1-mini' },
  }
}

describe('ChatSessionConsole OpenAI Responses chat controls', () => {
  it('exposes explicit experimental OpenAI Responses text chat without endpoint or profile picker UI', async () => {
    const user = userEvent.setup()
    const view = render(ChatSessionConsole, {
      props: {
        disabled: false,
        isRunning: false,
        sessionConfig: openAIResponsesSessionConfig(),
        openAIResponsesChat: {
          enabled: true,
          model: 'gpt-4.1-mini',
          experimentalLabel: 'Experimental · OpenAI Responses text-only · not OpenRouter',
        },
        reasoningDisplayMode: 'inline',
        modelCatalog: [],
        webSearchResolved: null,
        samplingParamsResolved: null,
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
          model: 'gpt-4.1-mini',
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
                warnings: ['OpenAI /models reports availability/basic ownership only; Responses capability hints are Starverse curated metadata.'],
                capabilitySeed: {
                  textChat: true,
                  responsesApi: true,
                  reasoning: 'unknown',
                  imageInput: 'unknown',
                  fileInput: 'unknown',
                  functionCalling: 'unknown',
                  hostedTools: 'unknown',
                  structuredOutput: 'unknown',
                  audioInput: 'unknown',
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
    expect(diagnostics.textContent).toContain('Responses API')
    expect(diagnostics.textContent).toContain(tf('chat.console.capability.structuredOutput', { value: 'unknown' }))
    expect(diagnostics.textContent).toContain('openai_list_models_api_docs')
    expect(diagnostics.textContent).toContain('availability/basic ownership')
    expect((screen.getByTestId('openai-responses-models-list') as HTMLDetailsElement).open).toBe(false)

    await user.click(screen.getByTestId('openai-responses-models-refresh'))
    await user.click(screen.getByTestId('openai-responses-models-toggle'))
    await user.click(screen.getByTestId('openai-responses-model-use'))

    expect(view.emitted('refreshOpenAIResponsesModels')).toHaveLength(1)
    expect(view.emitted('updateModel')?.[0]).toEqual([{ providerId: 'openai_responses', modelId: 'gpt-4.1-mini' }])

    const mainModelSelect = screen.getAllByRole('combobox')[0]
    expect(within(mainModelSelect).getByText('OpenRouter Claude 3')).toBeInTheDocument()
    expect(within(mainModelSelect).queryByText('gpt-4.1-mini')).not.toBeInTheDocument()
  })
})
