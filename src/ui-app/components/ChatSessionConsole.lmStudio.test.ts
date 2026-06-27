import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

function lmStudioChat(overrides: Partial<{
  diagnosticsEnabled: boolean
  manualLoadUnloadEnabled: boolean
  autoLoadBeforeSendEnabled: boolean
  autoUnloadAfterSendEnabled: boolean
  autoUnloadAfterIdleEnabled: boolean
}> = {}) {
  const nativeRestControls = {
    diagnosticsEnabled: true,
    manualLoadUnloadEnabled: true,
    autoLoadBeforeSendEnabled: false,
    autoUnloadAfterSendEnabled: false,
    autoUnloadAfterIdleEnabled: false,
    ...overrides,
  }

  return {
    enabled: true,
    endpointUrl: 'http://127.0.0.1:1234',
    model: 'openai/gpt-oss-20b',
    chatMode: 'openai_compatible' as const,
    openAICompatiblePreferredEndpoint: 'chat_completions' as const,
    nativeRestControls,
    config: {
      providerKey: 'lm_studio' as const,
      endpointUrl: 'http://127.0.0.1:1234',
      nativeRestControls: { ...nativeRestControls },
      chatMode: 'openai_compatible' as const,
      openAICompatible: { basePath: '/v1' as const, preferredEndpoint: 'chat_completions' as const },
      nativeRest: { basePath: '/api/v1' as const },
    },
    experimentalLabel: 'LM Studio Local · native REST controls · loopback only',
  }
}

describe('ChatSessionConsole LM Studio controls', () => {
  const originalLMStudioProvider = (globalThis as any).lmStudioProvider

  afterEach(() => {
    ;(globalThis as any).lmStudioProvider = originalLMStudioProvider
  })

  it('exposes LM Studio Local configuration, diagnostics, and native REST controls without catalog or download UI', async () => {
    const user = userEvent.setup()
    const probe = vi.fn(async () => ({
      ok: true,
      diagnostics: {
        nativeRestAvailable: true,
        openAICompatibleAvailable: true,
        nativeRest: {
          ok: true,
          models: [{
            key: 'openai/gpt-oss-20b',
            displayName: 'GPT OSS 20B',
            loaded: true,
            loadedInstances: ['inst-loaded'],
          }],
        },
      },
    }))
    const loadModel = vi.fn(async () => ({
      ok: true,
      operation: 'load',
      model: 'openai/gpt-oss-20b',
      instanceId: 'inst-loaded',
      warnings: [],
    }))
    const unloadModel = vi.fn(async () => ({
      ok: true,
      operation: 'unload',
      instanceId: 'inst-loaded',
      warnings: [],
    }))
    ;(globalThis as any).lmStudioProvider = { probe, loadModel, unloadModel }

    const view = render(ChatSessionConsole, {
      props: {
        disabled: false,
        isRunning: false,
        sessionConfig: defaultSessionConfig(),
        lmStudioChat: lmStudioChat(),
        reasoningDisplayMode: 'inline',
        modelCatalog: [],
        webSearchResolved: null,
        samplingParamsResolved: null,
      },
    })

    expect(screen.getByTestId('lm-studio-chat-controls').textContent).toContain('LM Studio Local')
    expect(screen.getByTestId('lm-studio-selected-status').textContent).toContain('Endpoint: http://127.0.0.1:1234')
    expect(screen.getByTestId('lm-studio-selected-status').textContent).toContain('openai/gpt-oss-20b')
    expect(screen.getByTestId('lm-studio-selected-status').textContent).toContain('native REST')
    expect(screen.queryByText(/download/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/OpenRouter catalog/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/ModelPicker/i)).not.toBeInTheDocument()

    await user.click(screen.getByTestId('lm-studio-chat-mode-native'))
    await user.click(screen.getByTestId('lm-studio-openai-endpoint-responses'))
    await user.click(screen.getByTestId('lm-studio-auto-load-enabled'))
    await user.click(screen.getByTestId('lm-studio-auto-unload-after-send-enabled'))
    await user.click(screen.getByTestId('lm-studio-auto-unload-after-idle-enabled'))
    await user.type(screen.getByTestId('lm-studio-endpoint-url'), '1')
    await user.type(screen.getByTestId('lm-studio-model'), '-alt')

    await user.click(screen.getByTestId('lm-studio-probe'))
    await waitFor(() => expect(screen.getByTestId('lm-studio-models').textContent).toContain('GPT OSS 20B'))
    await user.click(screen.getByTestId('lm-studio-load-model'))
    await waitFor(() => expect(screen.getByTestId('lm-studio-action-result').textContent).toContain('inst-loaded'))
    await user.click(screen.getByTestId('lm-studio-unload-model'))
    await waitFor(() => expect(screen.getByTestId('lm-studio-action-result').textContent).toContain('inst-loaded'))
    await user.click(screen.getByTestId('lm-studio-chat-disable'))
    await user.click(screen.getByTestId('lm-studio-chat-clear'))

    expect(view.emitted('updateLMStudioChatMode')?.[0]).toEqual(['native_rest'])
    expect(view.emitted('updateLMStudioOpenAICompatiblePreferredEndpoint')?.[0]).toEqual(['responses'])
    expect(view.emitted('updateLMStudioNativeRestControl')).toEqual([
      ['autoLoadBeforeSendEnabled', true],
      ['autoUnloadAfterSendEnabled', true],
      ['autoUnloadAfterIdleEnabled', true],
    ])
    expect(view.emitted('updateLMStudioEndpointUrl')?.length).toBeGreaterThan(0)
    expect(view.emitted('updateLMStudioModel')?.length).toBeGreaterThan(0)
    const chatEnabledEvents = view.emitted('updateLMStudioChatEnabled') ?? []
    expect(chatEnabledEvents[chatEnabledEvents.length - 1]).toEqual([false])
    expect(view.emitted('clearLMStudioChat')).toHaveLength(1)
    expect(probe).toHaveBeenCalledWith(expect.objectContaining({
      endpointUrl: 'http://127.0.0.1:1234',
      selectedModel: 'openai/gpt-oss-20b',
    }))
    expect(loadModel).toHaveBeenCalledWith(expect.objectContaining({
      endpointUrl: 'http://127.0.0.1:1234',
      model: 'openai/gpt-oss-20b',
      manualLoadUnloadEnabled: true,
    }))
    expect(unloadModel).toHaveBeenCalledWith(expect.objectContaining({
      endpointUrl: 'http://127.0.0.1:1234',
      instanceId: 'inst-loaded',
      manualLoadUnloadEnabled: true,
    }))
  })

  it('disables diagnostics actions when the diagnostics control is off', async () => {
    const user = userEvent.setup()
    const probe = vi.fn(async () => ({ ok: true }))
    ;(globalThis as any).lmStudioProvider = {
      probe,
      loadModel: vi.fn(),
      unloadModel: vi.fn(),
    }

    render(ChatSessionConsole, {
      props: {
        disabled: false,
        isRunning: false,
        sessionConfig: defaultSessionConfig(),
        lmStudioChat: lmStudioChat({ diagnosticsEnabled: false }),
        reasoningDisplayMode: 'inline',
        modelCatalog: [],
        webSearchResolved: null,
        samplingParamsResolved: null,
      },
    })

    const probeButton = screen.getByTestId('lm-studio-probe')
    expect(probeButton).toBeDisabled()
    await user.click(probeButton)
    expect(probe).not.toHaveBeenCalled()
  })

  it('emits the auto-unload-after-idle toggle separately from implemented after-send unload', async () => {
    const user = userEvent.setup()
    ;(globalThis as any).lmStudioProvider = {
      probe: vi.fn(),
      loadModel: vi.fn(),
      unloadModel: vi.fn(),
    }

    const view = render(ChatSessionConsole, {
      props: {
        disabled: false,
        isRunning: false,
        sessionConfig: defaultSessionConfig(),
        lmStudioChat: lmStudioChat({ autoUnloadAfterIdleEnabled: false }),
        reasoningDisplayMode: 'inline',
        modelCatalog: [],
        webSearchResolved: null,
        samplingParamsResolved: null,
      },
    })

    const idleToggle = screen.getByTestId('lm-studio-auto-unload-after-idle-enabled') as HTMLInputElement
    expect(idleToggle.checked).toBe(false)
    await user.click(idleToggle)

    expect(view.emitted('updateLMStudioNativeRestControl')).toEqual([
      ['autoUnloadAfterIdleEnabled', true],
    ])
  })
})
