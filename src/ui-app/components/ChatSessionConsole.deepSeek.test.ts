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
})
