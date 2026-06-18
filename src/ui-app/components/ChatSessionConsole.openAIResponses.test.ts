import { render, screen } from '@testing-library/vue'
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

describe('ChatSessionConsole OpenAI Responses chat controls', () => {
  it('exposes explicit experimental OpenAI Responses text chat without endpoint or profile picker UI', async () => {
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
        reasoningDisplayMode: 'inline',
        modelCatalog: [],
        webSearchResolved: null,
        samplingParamsResolved: null,
      },
    })

    expect(screen.getByTestId('openai-responses-chat-controls').textContent).toContain('Experimental')
    expect(screen.getByTestId('openai-responses-chat-controls').textContent).toContain('not OpenRouter')
    expect(screen.getByTestId('openai-responses-chat-warning').textContent).toContain('Native OpenAI Responses API text-only')
    expect(screen.getByTestId('openai-responses-chat-selected-status').textContent).toContain('OpenAI Responses chat is active')
    expect(screen.getByTestId('openai-responses-chat-selected-status').textContent).toContain('Selected Responses model: gpt-4.1-mini')
    expect(screen.getByTestId('openai-responses-chat-selected-status').textContent).toContain('does not expose API keys')
    expect(screen.queryByText(/endpoint picker/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/profile picker/i)).not.toBeInTheDocument()

    await user.click(screen.getByTestId('openai-responses-chat-enabled'))
    await user.type(screen.getByTestId('openai-responses-chat-model'), 'gpt-4.1')
    await user.click(screen.getByTestId('openai-responses-chat-disable'))
    await user.click(screen.getByTestId('openai-responses-chat-clear'))

    expect(view.emitted('updateOpenAIResponsesChatEnabled')?.[0]).toEqual([false])
    expect(view.emitted('updateOpenAIResponsesChatEnabled')?.[1]).toEqual([false])
    expect(view.emitted('updateOpenAIResponsesChatModel')?.length).toBeGreaterThan(0)
    expect(view.emitted('clearOpenAIResponsesChat')).toHaveLength(1)
  })
})
