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

function ollamaChat(overrides: Partial<{
  diagnosticsEnabled: boolean
  manualLoadUnloadEnabled: boolean
  autoLoadBeforeSendEnabled: boolean
  autoUnloadAfterSendEnabled: boolean
  autoUnloadAfterIdleEnabled: boolean
}> = {}) {
  const nativeControls = {
    diagnosticsEnabled: true,
    manualLoadUnloadEnabled: true,
    autoLoadBeforeSendEnabled: false,
    autoUnloadAfterSendEnabled: false,
    autoUnloadAfterIdleEnabled: false,
    ...overrides,
  }

  return {
    enabled: true,
    endpointUrl: 'http://127.0.0.1:11434',
    model: 'llama3.2:latest',
    chatMode: 'native_rest' as const,
    nativeRestPreferredEndpoint: 'chat' as const,
    openAICompatiblePreferredEndpoint: 'chat_completions' as const,
    nativeControls,
    config: {
      providerKey: 'ollama_local' as const,
      endpointUrl: 'http://127.0.0.1:11434',
      nativeControls: { ...nativeControls },
      chatMode: 'native_rest' as const,
      nativeRest: { basePath: '/api' as const, preferredEndpoint: 'chat' as const },
      openAICompatible: { basePath: '/v1' as const, preferredEndpoint: 'chat_completions' as const },
    },
    experimentalLabel: 'Ollama Local · native REST controls · loopback only',
  }
}

describe('ChatSessionConsole Ollama controls', () => {
  const originalOllamaProvider = (globalThis as any).ollamaProvider

  afterEach(() => {
    ;(globalThis as any).ollamaProvider = originalOllamaProvider
  })

  it('exposes Ollama Local configuration, diagnostics, and native REST controls without catalog or pull UI', async () => {
    const user = userEvent.setup()
    const probe = vi.fn(async () => ({
      ok: true,
      diagnostics: {
        nativeRestAvailable: true,
        openAICompatibleAvailable: true,
        version: { ok: true, version: '0.12.0' },
        localModels: {
          ok: true,
          models: [{
            key: 'llama3.2:latest',
            displayName: 'llama3.2:latest',
            running: false,
            details: { family: 'llama', parameterSize: '3.2B', quantizationLevel: 'Q4_K_M' },
          }],
        },
        runningModels: {
          ok: true,
          models: [{
            key: 'llama3.2:latest',
            displayName: 'llama3.2:latest',
            running: true,
          }],
        },
        openAICompatible: { ok: true, models: [{ key: 'llama3.2:latest', displayName: 'llama3.2:latest', running: false }] },
      },
    }))
    const loadModel = vi.fn(async () => ({
      ok: true,
      operation: 'load',
      model: 'llama3.2:latest',
      status: 'loaded',
      warnings: [],
    }))
    const unloadModel = vi.fn(async () => ({
      ok: true,
      operation: 'unload',
      model: 'llama3.2:latest',
      status: 'unloaded',
      warnings: [],
    }))
    ;(globalThis as any).ollamaProvider = { probe, loadModel, unloadModel }

    const view = render(ChatSessionConsole, {
      props: {
        disabled: false,
        isRunning: false,
        sessionConfig: defaultSessionConfig(),
        ollamaChat: ollamaChat(),
        reasoningDisplayMode: 'inline',
        modelCatalog: [],
        webSearchResolved: null,
        samplingParamsResolved: null,
      },
    })

    expect(screen.getByTestId('ollama-chat-controls').textContent).toContain('Ollama Local')
    expect(screen.getByTestId('ollama-selected-status').textContent).toContain('Endpoint: http://127.0.0.1:11434')
    expect(screen.getByTestId('ollama-selected-status').textContent).toContain('llama3.2:latest')
    expect(screen.getByTestId('ollama-selected-status').textContent).toContain('native_rest')
    expect(screen.queryByText(/OpenRouter catalog/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/ModelPicker/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /pull|download/i })).not.toBeInTheDocument()

    await user.click(screen.getByTestId('ollama-native-endpoint-generate'))
    await user.click(screen.getByTestId('ollama-chat-mode-openai'))
    const openAIChat = {
      ...ollamaChat(),
      chatMode: 'openai_compatible' as const,
      nativeRestPreferredEndpoint: 'generate' as const,
      config: {
        ...ollamaChat().config,
        chatMode: 'openai_compatible' as const,
        nativeRest: { basePath: '/api' as const, preferredEndpoint: 'generate' as const },
      },
    }
    await view.rerender({
      disabled: false,
      isRunning: false,
      sessionConfig: defaultSessionConfig(),
      ollamaChat: openAIChat,
      reasoningDisplayMode: 'inline',
      modelCatalog: [],
      webSearchResolved: null,
      samplingParamsResolved: null,
    })
    await user.click(screen.getByTestId('ollama-openai-endpoint-responses'))
    await user.click(screen.getByTestId('ollama-auto-load-enabled'))
    await user.click(screen.getByTestId('ollama-auto-unload-after-send-enabled'))
    await user.click(screen.getByTestId('ollama-auto-unload-after-idle-enabled'))
    await user.type(screen.getByTestId('ollama-endpoint-url'), '1')
    await user.type(screen.getByTestId('ollama-model'), '-alt')

    await user.click(screen.getByTestId('ollama-probe'))
    await waitFor(() => expect(screen.getByTestId('ollama-local-models').textContent).toContain('llama3.2:latest'))
    await user.click(screen.getByTestId('ollama-load-model'))
    await waitFor(() => expect(screen.getByTestId('ollama-action-result').textContent).toContain('llama3.2:latest'))
    await user.click(screen.getByTestId('ollama-unload-model'))
    await waitFor(() => expect(screen.getByTestId('ollama-action-result').textContent).toContain('llama3.2:latest'))
    await user.click(screen.getByTestId('ollama-chat-disable'))
    await user.click(screen.getByTestId('ollama-chat-clear'))

    expect(view.emitted('updateOllamaNativeRestPreferredEndpoint')?.[0]).toEqual(['generate'])
    expect(view.emitted('updateOllamaChatMode')?.[0]).toEqual(['openai_compatible'])
    expect(view.emitted('updateOllamaOpenAICompatiblePreferredEndpoint')?.[0]).toEqual(['responses'])
    expect(view.emitted('updateOllamaNativeControl')).toEqual([
      ['autoLoadBeforeSendEnabled', true],
      ['autoUnloadAfterSendEnabled', true],
      ['autoUnloadAfterIdleEnabled', true],
    ])
    expect(view.emitted('updateOllamaEndpointUrl')?.length).toBeGreaterThan(0)
    expect(view.emitted('updateOllamaModel')?.length).toBeGreaterThan(0)
    const chatEnabledEvents = view.emitted('updateOllamaChatEnabled') ?? []
    expect(chatEnabledEvents[chatEnabledEvents.length - 1]).toEqual([false])
    expect(view.emitted('clearOllamaChat')).toHaveLength(1)
    expect(probe).toHaveBeenCalledWith(expect.objectContaining({
      endpointUrl: 'http://127.0.0.1:11434',
      selectedModel: 'llama3.2:latest',
    }))
    expect(loadModel).toHaveBeenCalledWith(expect.objectContaining({
      endpointUrl: 'http://127.0.0.1:11434',
      model: 'llama3.2:latest',
      manualLoadUnloadEnabled: true,
    }))
    expect(unloadModel).toHaveBeenCalledWith(expect.objectContaining({
      endpointUrl: 'http://127.0.0.1:11434',
      model: 'llama3.2:latest',
      manualLoadUnloadEnabled: true,
    }))
  })

  it('disables diagnostics actions when the diagnostics control is off', async () => {
    const user = userEvent.setup()
    const probe = vi.fn(async () => ({ ok: true }))
    ;(globalThis as any).ollamaProvider = {
      probe,
      loadModel: vi.fn(),
      unloadModel: vi.fn(),
    }

    render(ChatSessionConsole, {
      props: {
        disabled: false,
        isRunning: false,
        sessionConfig: defaultSessionConfig(),
        ollamaChat: ollamaChat({ diagnosticsEnabled: false }),
        reasoningDisplayMode: 'inline',
        modelCatalog: [],
        webSearchResolved: null,
        samplingParamsResolved: null,
      },
    })

    const probeButton = screen.getByTestId('ollama-probe')
    expect(probeButton).toBeDisabled()
    await user.click(probeButton)
    expect(probe).not.toHaveBeenCalled()
  })

  it('emits the deferred auto-unload-after-idle toggle separately from implemented after-send unload', async () => {
    const user = userEvent.setup()
    ;(globalThis as any).ollamaProvider = {
      probe: vi.fn(),
      loadModel: vi.fn(),
      unloadModel: vi.fn(),
    }

    const view = render(ChatSessionConsole, {
      props: {
        disabled: false,
        isRunning: false,
        sessionConfig: defaultSessionConfig(),
        ollamaChat: ollamaChat({ autoUnloadAfterIdleEnabled: false }),
        reasoningDisplayMode: 'inline',
        modelCatalog: [],
        webSearchResolved: null,
        samplingParamsResolved: null,
      },
    })

    const idleToggle = screen.getByTestId('ollama-auto-unload-after-idle-enabled') as HTMLInputElement
    expect(idleToggle.checked).toBe(false)
    await user.click(idleToggle)

    expect(view.emitted('updateOllamaNativeControl')).toEqual([
      ['autoUnloadAfterIdleEnabled', true],
    ])
  })
})
