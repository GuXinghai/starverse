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
})
