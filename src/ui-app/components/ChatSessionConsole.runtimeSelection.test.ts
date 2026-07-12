import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import ChatSessionConsole from './ChatSessionConsole.vue'
import { DEFAULT_OPENROUTER_MODEL_ID } from '@/next/provider/modelSelection'
import { getRuntimeCapabilitySummaryLite, type CurrentRuntimeSelection } from '@/next/provider/runtimeSelection'
import { t, tf } from '@/shared/i18n'

function defaultSessionConfig() {
  return {
    model: { selectedProviderId: 'openrouter' as const, selectedModelKey: DEFAULT_OPENROUTER_MODEL_ID },
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

describe('ChatSessionConsole runtime selection controls', () => {
  it('emits an explicit OpenRouter provider/model pair from the model control', async () => {
    const user = userEvent.setup()
    const view = render(ChatSessionConsole, {
      props: {
        disabled: false,
        isRunning: false,
        sessionConfig: defaultSessionConfig(),
        reasoningDisplayMode: 'inline',
        modelCatalog: [{
          modelId: 'openai/gpt-4o',
          name: 'GPT-4o',
          vendor: 'openai',
          status: 'visible',
          supportedParameters: [],
          lastSeenSnapshotId: 'snapshot-1',
        }],
        webSearchResolved: null,
        generationParamsResolved: null,
      },
    })

    await user.selectOptions(screen.getByTestId('session-openrouter-model'), 'openai/gpt-4o')

    expect(view.emitted('updateModel')?.[0]).toEqual([{
      providerId: 'openrouter',
      modelId: 'openai/gpt-4o',
    }])
  })

  it('emits reasoning panel default expansion preference from display controls', async () => {
    const user = userEvent.setup()
    const view = render(ChatSessionConsole, {
      props: {
        disabled: false,
        isRunning: false,
        sessionConfig: defaultSessionConfig(),
        reasoningDisplayMode: 'inline',
        reasoningPanelDefaultExpanded: false,
        modelCatalog: [],
        webSearchResolved: null,
        generationParamsResolved: null,
      },
    })

    const toggle = screen.getByTestId('session-reasoning-panel-default-expanded')
    expect(toggle).not.toBeChecked()

    await user.click(toggle)

    expect(view.emitted('updateReasoningPanelDefaultExpanded')?.[0]).toEqual([true])
  })

  it('emits reasoning panel auto-collapse preference from display controls', async () => {
    const user = userEvent.setup()
    const view = render(ChatSessionConsole, {
      props: {
        disabled: false,
        isRunning: false,
        sessionConfig: defaultSessionConfig(),
        reasoningDisplayMode: 'inline',
        reasoningPanelAutoCollapseAfterReasoning: false,
        modelCatalog: [],
        webSearchResolved: null,
        generationParamsResolved: null,
      },
    })

    const toggle = screen.getByTestId('session-reasoning-panel-auto-collapse-after-reasoning')
    expect(toggle).not.toBeChecked()

    await user.click(toggle)

    expect(view.emitted('updateReasoningPanelAutoCollapseAfterReasoning')?.[0]).toEqual([true])
  })

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
          model: DEFAULT_OPENROUTER_MODEL_ID,
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
        generationParamsResolved: null,
      },
    })

    expect(screen.getByTestId('runtime-selection-status').textContent).toContain('No runtime provider selected')
    expect(screen.getByTestId('runtime-selection-state').textContent).toContain(t('chat.console.status.unset'))
    expect(screen.getByTestId('runtime-capability-summary').textContent).toContain(tf('chat.console.status.source', { source: 'unset' }))
    expect(screen.getByTestId('openrouter-chat-selected-status').textContent).toContain(tf('chat.console.provider.openRouter.status', { status: t('chat.console.status.inactive') }))
    expect(screen.getByTestId('openrouter-chat-selected-status').textContent).toContain(t('chat.console.provider.openRouter.notFallback'))

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
      modelId: DEFAULT_OPENROUTER_MODEL_ID,
      modelKey: DEFAULT_OPENROUTER_MODEL_ID,
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
          model: DEFAULT_OPENROUTER_MODEL_ID,
          providerLabel: 'OpenRouter · first-class provider',
        },
        currentRuntimeSelection: selection,
        currentRuntimeCapability: getRuntimeCapabilitySummaryLite(selection),
        currentRuntimeStatus: {
          selectionLabel: `OpenRouter · ${DEFAULT_OPENROUTER_MODEL_ID}`,
          capabilitySummary: 'text chat supported · streaming supported · attachments supported',
          warnings: ['OpenRouter uses the existing first-class send path and legacy-store credential source.'],
        },
        reasoningDisplayMode: 'inline',
        modelCatalog: [],
        webSearchResolved: null,
        generationParamsResolved: null,
      },
    })

    expect(screen.getByTestId('runtime-selection-label').textContent).toContain('OpenRouter')
    expect(screen.getByTestId('runtime-selection-state').textContent).toContain(t('chat.console.status.selected'))
    expect(screen.getByTestId('runtime-capability-summary').textContent).toContain(tf('chat.console.status.source', { source: 'openrouter_existing' }))
    expect(screen.getByTestId('openrouter-chat-selected-status').textContent).toContain(tf('chat.console.provider.openRouter.status', { status: t('chat.console.status.active') }))
  })
})
