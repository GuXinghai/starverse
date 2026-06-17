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

describe('ChatSessionConsole LocalEndpoint chat controls', () => {
  it('exposes an explicit experimental text-only LocalEndpoint chat entry without endpoint picker UI', async () => {
    const user = userEvent.setup()
    const view = render(ChatSessionConsole, {
      props: {
        disabled: false,
        isRunning: false,
        sessionConfig: defaultSessionConfig(),
        localEndpointChat: {
          enabled: true,
          endpointUrl: 'http://localhost:1234/v1',
          model: '',
          experimentalLabel: 'Experimental · LocalEndpoint text-only',
        },
        reasoningDisplayMode: 'inline',
        modelCatalog: [],
        webSearchResolved: null,
        samplingParamsResolved: null,
      },
    })

    expect(screen.getByTestId('local-endpoint-chat-controls').textContent).toContain('Experimental')
    expect(screen.getByTestId('local-endpoint-chat-warning').textContent).toContain('Text-only loopback')
    expect(screen.queryByText(/endpoint picker/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/profile picker/i)).not.toBeInTheDocument()

    await user.click(screen.getByTestId('local-endpoint-chat-enabled'))
    await user.type(screen.getByTestId('local-endpoint-chat-url'), 'http://localhost:4321/v1')
    await user.type(screen.getByTestId('local-endpoint-chat-model'), 'local-model')

    expect(view.emitted('updateLocalEndpointChatEnabled')?.[0]).toEqual([false])
    expect(view.emitted('updateLocalEndpointChatUrl')?.length).toBeGreaterThan(0)
    expect(view.emitted('updateLocalEndpointChatModel')?.length).toBeGreaterThan(0)
  })
})
