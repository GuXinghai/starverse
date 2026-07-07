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
    generationParams: { detail: null },
  }
}

function localEndpointSessionConfig() {
  return {
    ...defaultSessionConfig(),
    model: { selectedProviderId: 'local_endpoint' as const, selectedModelKey: 'local-model-a' },
  }
}

describe('ChatSessionConsole LocalEndpoint chat controls', () => {
  it('exposes an explicit experimental text-only LocalEndpoint chat entry without endpoint picker UI', async () => {
    const user = userEvent.setup()
    const view = render(ChatSessionConsole, {
      props: {
        disabled: false,
        isRunning: false,
        sessionConfig: localEndpointSessionConfig(),
        localEndpointChat: {
          enabled: true,
          endpointUrl: 'http://localhost:1234/v1',
          model: 'local-model-a',
          experimentalLabel: 'Experimental · LocalEndpoint text-only · not OpenRouter',
        },
        reasoningDisplayMode: 'inline',
        modelCatalog: [],
        webSearchResolved: null,
        generationParamsResolved: null,
      },
    })

    expect(screen.getByTestId('local-endpoint-chat-controls').textContent).toContain('Experimental')
    expect(screen.getByTestId('local-endpoint-chat-controls').textContent).toContain('not OpenRouter')
    expect(screen.getByTestId('local-endpoint-chat-warning').textContent).toContain('loopback')
    expect(screen.getByTestId('local-endpoint-chat-selected-status').textContent).toContain('LocalEndpoint')
    expect(screen.getByTestId('local-endpoint-chat-selected-status').textContent).toContain('http://localhost:1234/v1')
    expect(screen.getByTestId('local-endpoint-chat-selected-status').textContent).toContain('local-model-a')
    expect(screen.getByTestId('local-endpoint-chat-selected-status').textContent).toContain('API Key')
    expect(screen.queryByText(/endpoint picker/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/profile picker/i)).not.toBeInTheDocument()
    expect(screen.queryByTestId('local-endpoint-chat-model')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('local-endpoint-chat-enabled'))
    await user.type(screen.getByTestId('local-endpoint-chat-url'), 'http://localhost:4321/v1')
    await user.click(screen.getByTestId('local-endpoint-chat-disable'))
    await user.click(screen.getByTestId('local-endpoint-chat-clear'))

    expect(view.emitted('updateLocalEndpointChatEnabled')?.[0]).toEqual([false])
    expect(view.emitted('updateLocalEndpointChatEnabled')?.[1]).toEqual([false])
    expect(view.emitted('updateLocalEndpointChatUrl')?.length).toBeGreaterThan(0)
    expect(view.emitted('updateLocalEndpointChatModel')).toBeUndefined()
    expect(view.emitted('clearLocalEndpointChat')).toHaveLength(1)
  })
})
