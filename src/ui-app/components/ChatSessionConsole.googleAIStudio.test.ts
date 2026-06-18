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

describe('ChatSessionConsole Google AI Studio chat controls', () => {
  it('exposes explicit experimental Google AI Studio text chat without endpoint or profile picker UI', async () => {
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
        reasoningDisplayMode: 'inline',
        modelCatalog: [],
        webSearchResolved: null,
        samplingParamsResolved: null,
      },
    })

    expect(screen.getByTestId('google-ai-studio-chat-controls').textContent).toContain('Experimental')
    expect(screen.getByTestId('google-ai-studio-chat-controls').textContent).toContain('not OpenRouter')
    expect(screen.getByTestId('google-ai-studio-chat-warning').textContent).toContain('Native Google AI Studio Gemini text-only')
    expect(screen.getByTestId('google-ai-studio-chat-warning').textContent).toContain('legacy Gemini runtime')
    expect(screen.getByTestId('google-ai-studio-chat-selected-status').textContent).toContain('Google AI Studio chat is active')
    expect(screen.getByTestId('google-ai-studio-chat-selected-status').textContent).toContain('Selected Gemini model: gemini-2.5-flash')
    expect(screen.getByTestId('google-ai-studio-chat-selected-status').textContent).toContain('does not expose API keys')
    expect(screen.queryByText(/endpoint picker/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/profile picker/i)).not.toBeInTheDocument()

    await user.click(screen.getByTestId('google-ai-studio-chat-enabled'))
    await user.type(screen.getByTestId('google-ai-studio-chat-model'), 'gemini-2.5-pro')
    await user.click(screen.getByTestId('google-ai-studio-chat-disable'))
    await user.click(screen.getByTestId('google-ai-studio-chat-clear'))

    expect(view.emitted('updateGoogleAIStudioChatEnabled')?.[0]).toEqual([false])
    expect(view.emitted('updateGoogleAIStudioChatEnabled')?.[1]).toEqual([false])
    expect(view.emitted('updateGoogleAIStudioChatModel')?.length).toBeGreaterThan(0)
    expect(view.emitted('clearGoogleAIStudioChat')).toHaveLength(1)
  })
})
