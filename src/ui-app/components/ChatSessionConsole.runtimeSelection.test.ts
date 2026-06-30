import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import ChatSessionConsole from './ChatSessionConsole.vue'
import { getRuntimeCapabilitySummaryLite, type CurrentRuntimeSelection } from '@/next/provider/runtimeSelection'

function defaultSessionConfig() {
  return {
    model: { selectedModelKey: 'openrouter/auto' },
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

describe('ChatSessionConsole runtime selection controls', () => {
  it('shows unset runtime status and explicit OpenRouter selection control', async () => {
    const user = userEvent.setup()
    const selection = { state: 'unset', source: 'unset' } satisfies CurrentRuntimeSelection
    const view = render(ChatSessionConsole, {
      props: {
        disabled: false,
        isRunning: false,
        sessionConfig: defaultSessionConfig(),
        openRouterChat: {
          enabled: false,
          model: 'openrouter/auto',
          providerLabel: 'OpenRouter · first-class provider',
        },
        currentRuntimeSelection: selection,
        currentRuntimeCapability: getRuntimeCapabilitySummaryLite(selection),
        currentRuntimeStatus: {
          selectionLabel: 'No runtime provider selected',
          capabilitySummary: 'text chat blocked',
          warnings: ['Select a runtime provider and model before sending.'],
        },
        reasoningDisplayMode: 'inline',
        modelCatalog: [],
        webSearchResolved: null,
        samplingParamsResolved: null,
      },
    })

    expect(screen.getByTestId('runtime-selection-status').textContent).toContain('No runtime provider selected')
    expect(screen.getByTestId('runtime-selection-state').textContent).toContain('unset')
    expect(screen.getByTestId('runtime-capability-summary').textContent).toContain('source unset')
    expect(screen.getByTestId('openrouter-chat-selected-status').textContent).toContain('OpenRouter chat is inactive')
    expect(screen.getByTestId('openrouter-chat-selected-status').textContent).toContain('not an implicit fallback')

    await user.click(screen.getByTestId('openrouter-chat-enabled'))

    expect(view.emitted('updateOpenRouterChatEnabled')?.[0]).toEqual([true])
  })

  it('shows selected OpenRouter capability-lite summary', () => {
    const selection = {
      state: 'selected',
      providerKey: 'openrouter',
      providerId: 'openrouter',
      endpointId: 'openrouter-official',
      profileId: 'openrouter_v1_chat',
      modelId: 'openrouter/auto',
      modelKey: 'openrouter/auto',
      source: 'explicit_user_selection',
      mode: 'production',
    } satisfies CurrentRuntimeSelection
    render(ChatSessionConsole, {
      props: {
        disabled: false,
        isRunning: false,
        sessionConfig: defaultSessionConfig(),
        openRouterChat: {
          enabled: true,
          model: 'openrouter/auto',
          providerLabel: 'OpenRouter · first-class provider',
        },
        currentRuntimeSelection: selection,
        currentRuntimeCapability: getRuntimeCapabilitySummaryLite(selection),
        currentRuntimeStatus: {
          selectionLabel: 'OpenRouter · openrouter/auto',
          capabilitySummary: 'text chat supported · streaming supported · attachments supported',
          warnings: ['OpenRouter uses the existing first-class send path and legacy-store credential source.'],
        },
        reasoningDisplayMode: 'inline',
        modelCatalog: [],
        webSearchResolved: null,
        samplingParamsResolved: null,
      },
    })

    expect(screen.getByTestId('runtime-selection-label').textContent).toContain('OpenRouter')
    expect(screen.getByTestId('runtime-selection-state').textContent).toContain('selected')
    expect(screen.getByTestId('runtime-capability-summary').textContent).toContain('source openrouter_existing')
    expect(screen.getByTestId('openrouter-chat-selected-status').textContent).toContain('OpenRouter chat is active')
  })
})
