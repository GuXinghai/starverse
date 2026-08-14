import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useExperimentalProviderChatSettings } from './useExperimentalProviderChatSettings'

const keys = {
  openRouterEnabled: 'starverse.openRouterTextChat.enabled',
  lmStudioEnabled: 'starverse.lmStudioTextChat.enabled',
  lmStudioEndpointUrl: 'starverse.lmStudio.endpointUrl',
  lmStudioChatMode: 'starverse.lmStudio.chatMode',
  lmStudioOpenAIEndpoint: 'starverse.lmStudio.openAICompatible.preferredEndpoint',
  lmStudioDiagnosticsEnabled: 'starverse.lmStudio.nativeRest.diagnosticsEnabled',
  lmStudioManualLoadUnloadEnabled: 'starverse.lmStudio.nativeRest.manualLoadUnloadEnabled',
  lmStudioAutoLoadBeforeSendEnabled: 'starverse.lmStudio.nativeRest.autoLoadBeforeSendEnabled',
  lmStudioAutoUnloadAfterSendEnabled: 'starverse.lmStudio.nativeRest.autoUnloadAfterSendEnabled',
  lmStudioAutoUnloadAfterIdleEnabled: 'starverse.lmStudio.nativeRest.autoUnloadAfterIdleEnabled',
  ollamaEnabled: 'starverse.ollamaTextChat.enabled',
  ollamaEndpointUrl: 'starverse.ollama.endpointUrl',
  ollamaChatMode: 'starverse.ollama.chatMode',
  ollamaNativeEndpoint: 'starverse.ollama.nativeRest.preferredEndpoint',
  ollamaOpenAIEndpoint: 'starverse.ollama.openAICompatible.preferredEndpoint',
  ollamaDiagnosticsEnabled: 'starverse.ollama.nativeRest.diagnosticsEnabled',
  ollamaManualLoadUnloadEnabled: 'starverse.ollama.nativeRest.manualLoadUnloadEnabled',
  ollamaAutoLoadBeforeSendEnabled: 'starverse.ollama.nativeRest.autoLoadBeforeSendEnabled',
  ollamaAutoUnloadAfterSendEnabled: 'starverse.ollama.nativeRest.autoUnloadAfterSendEnabled',
  ollamaAutoUnloadAfterIdleEnabled: 'starverse.ollama.nativeRest.autoUnloadAfterIdleEnabled',
  localEndpointEnabled: 'starverse.localEndpointTextChat.enabled',
  openAIResponsesEnabled: 'starverse.openAIResponsesTextChat.enabled',
  deepSeekEnabled: 'starverse.deepSeekTextChat.enabled',
} as const

function createSettings() {
  const isRunning = ref(false)
  const isDraftInteractionLocked = ref(false)
  const settings = useExperimentalProviderChatSettings({
    isRunning,
    isDraftInteractionLocked,
  })
  return { settings, isRunning, isDraftInteractionLocked }
}

describe('useExperimentalProviderChatSettings', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('builds default provider settings without deriving a runtime selection', () => {
    const { settings } = createSettings()

    expect(settings.openRouterChatConfig.value).toMatchObject({
      enabled: false,
      providerLabel: 'OpenRouter · first-class provider',
    })
    expect(settings.lmStudioChatConfig.value).toMatchObject({
      enabled: false,
      endpointUrl: 'http://127.0.0.1:1234',
      chatMode: 'openai_compatible',
      openAICompatiblePreferredEndpoint: 'responses',
      config: {
        providerKey: 'lm_studio',
        endpointUrl: 'http://127.0.0.1:1234',
        nativeRestControls: {
          diagnosticsEnabled: true,
          manualLoadUnloadEnabled: true,
          autoLoadBeforeSendEnabled: false,
          autoUnloadAfterSendEnabled: false,
          autoUnloadAfterIdleEnabled: false,
        },
        chatMode: 'openai_compatible',
        openAICompatible: { basePath: '/v1', preferredEndpoint: 'responses' },
        nativeRest: { basePath: '/api/v1' },
      },
    })
    expect(settings.ollamaChatConfig.value).toMatchObject({
      enabled: false,
      endpointUrl: 'http://127.0.0.1:11434',
      chatMode: 'native_rest',
      nativeRestPreferredEndpoint: 'chat',
      openAICompatiblePreferredEndpoint: 'chat_completions',
      config: {
        providerKey: 'ollama_local',
        endpointUrl: 'http://127.0.0.1:11434',
        nativeControls: {
          diagnosticsEnabled: true,
          manualLoadUnloadEnabled: true,
          autoLoadBeforeSendEnabled: false,
          autoUnloadAfterSendEnabled: false,
          autoUnloadAfterIdleEnabled: false,
        },
        chatMode: 'native_rest',
        nativeRest: { basePath: '/api', preferredEndpoint: 'chat' },
        openAICompatible: { basePath: '/v1', preferredEndpoint: 'chat_completions' },
      },
    })
    expect(settings.localEndpointChatConfig.value).toMatchObject({
      enabled: false,
      endpointUrl: 'http://localhost:1234/v1',
    })
  })

  it('reads, persists, and clears LM Studio provider settings', () => {
    localStorage.setItem(keys.lmStudioEnabled, '1')
    localStorage.setItem(keys.lmStudioEndpointUrl, 'http://localhost:4321')
    localStorage.setItem(keys.lmStudioChatMode, 'native_rest')
    localStorage.setItem(keys.lmStudioOpenAIEndpoint, 'responses')
    localStorage.setItem(keys.lmStudioDiagnosticsEnabled, '0')
    localStorage.setItem(keys.lmStudioManualLoadUnloadEnabled, '0')
    localStorage.setItem(keys.lmStudioAutoLoadBeforeSendEnabled, '1')
    localStorage.setItem(keys.lmStudioAutoUnloadAfterSendEnabled, '1')
    localStorage.setItem(keys.lmStudioAutoUnloadAfterIdleEnabled, '1')

    const { settings } = createSettings()
    settings.readExperimentalProviderChatStorage()

    expect(settings.lmStudioChatConfig.value).toMatchObject({
      enabled: true,
      endpointUrl: 'http://localhost:4321',
      chatMode: 'native_rest',
      openAICompatiblePreferredEndpoint: 'responses',
      config: {
        nativeRestControls: {
          diagnosticsEnabled: false,
          manualLoadUnloadEnabled: false,
          autoLoadBeforeSendEnabled: true,
          autoUnloadAfterSendEnabled: true,
          autoUnloadAfterIdleEnabled: true,
        },
      },
    })

    settings.onClearLMStudioChat()
    expect(settings.lmStudioChatConfig.value).toMatchObject({
      enabled: false,
      endpointUrl: 'http://127.0.0.1:1234',
      chatMode: 'openai_compatible',
    })
    expect(localStorage.getItem(keys.lmStudioEndpointUrl)).toBeNull()
  })

  it('reads, persists, and clears Ollama provider settings', () => {
    localStorage.setItem(keys.ollamaEnabled, '1')
    localStorage.setItem(keys.ollamaEndpointUrl, 'http://localhost:11434')
    localStorage.setItem(keys.ollamaChatMode, 'openai_compatible')
    localStorage.setItem(keys.ollamaNativeEndpoint, 'generate')
    localStorage.setItem(keys.ollamaOpenAIEndpoint, 'responses')
    localStorage.setItem(keys.ollamaDiagnosticsEnabled, '0')
    localStorage.setItem(keys.ollamaManualLoadUnloadEnabled, '0')
    localStorage.setItem(keys.ollamaAutoLoadBeforeSendEnabled, '1')
    localStorage.setItem(keys.ollamaAutoUnloadAfterSendEnabled, '1')
    localStorage.setItem(keys.ollamaAutoUnloadAfterIdleEnabled, '1')

    const { settings } = createSettings()
    settings.readExperimentalProviderChatStorage()

    expect(settings.ollamaChatConfig.value).toMatchObject({
      enabled: true,
      endpointUrl: 'http://localhost:11434',
      chatMode: 'openai_compatible',
      nativeRestPreferredEndpoint: 'generate',
      openAICompatiblePreferredEndpoint: 'responses',
      config: {
        nativeControls: {
          diagnosticsEnabled: false,
          manualLoadUnloadEnabled: false,
          autoLoadBeforeSendEnabled: true,
          autoUnloadAfterSendEnabled: true,
          autoUnloadAfterIdleEnabled: true,
        },
        openAICompatible: { preferredEndpoint: 'responses' },
        nativeRest: { preferredEndpoint: 'generate' },
      },
    })

    settings.onUpdateOllamaNativeControl('autoLoadBeforeSendEnabled', false)
    expect(localStorage.getItem(keys.ollamaAutoLoadBeforeSendEnabled)).toBe('0')

    settings.onClearOllamaChat()
    expect(settings.ollamaChatConfig.value).toMatchObject({
      enabled: false,
      endpointUrl: 'http://127.0.0.1:11434',
      chatMode: 'native_rest',
      nativeRestPreferredEndpoint: 'chat',
      openAICompatiblePreferredEndpoint: 'chat_completions',
    })
    expect(localStorage.getItem(keys.ollamaEndpointUrl)).toBeNull()
    expect(localStorage.getItem(keys.ollamaAutoUnloadAfterIdleEnabled)).toBeNull()
  })

  it('persists simple provider values and keeps provider selection mutually exclusive', () => {
    const { settings } = createSettings()

    settings.onUpdateLMStudioChatEnabled(true)
    expect(settings.lmStudioChatConfig.value.enabled).toBe(true)
    expect(localStorage.getItem(keys.lmStudioEnabled)).toBe('1')

    settings.onUpdateOllamaChatEnabled(true)
    expect(settings.lmStudioChatConfig.value.enabled).toBe(false)
    expect(settings.ollamaChatConfig.value).toMatchObject({
      enabled: true,
    })
    expect(localStorage.getItem(keys.lmStudioEnabled)).toBe('0')
    expect(localStorage.getItem(keys.ollamaEnabled)).toBe('1')

    settings.onUpdateOpenAIResponsesChatEnabled(true)
    expect(settings.lmStudioChatConfig.value.enabled).toBe(false)
    expect(settings.ollamaChatConfig.value.enabled).toBe(false)
    expect(settings.openAIResponsesChatConfig.value).toMatchObject({
      enabled: true,
    })
    expect(localStorage.getItem(keys.lmStudioEnabled)).toBe('0')
    expect(localStorage.getItem(keys.ollamaEnabled)).toBe('0')
    expect(localStorage.getItem(keys.openAIResponsesEnabled)).toBe('1')
  })

  it('does not update or clear provider selection while running or locked', () => {
    const { settings, isRunning, isDraftInteractionLocked } = createSettings()

    isRunning.value = true
    settings.onUpdateLMStudioChatEnabled(true)
    expect(settings.lmStudioChatConfig.value.enabled).toBe(false)
    settings.onUpdateOllamaChatEnabled(true)
    expect(settings.ollamaChatConfig.value.enabled).toBe(false)

    isRunning.value = false
    settings.onUpdateOllamaChatEnabled(true)
    expect(settings.ollamaChatConfig.value.enabled).toBe(true)
    settings.onUpdateLMStudioChatEnabled(true)
    expect(settings.ollamaChatConfig.value.enabled).toBe(false)
    expect(settings.lmStudioChatConfig.value.enabled).toBe(true)

    isDraftInteractionLocked.value = true
    settings.onClearLMStudioChat()
    expect(settings.lmStudioChatConfig.value.enabled).toBe(true)
    settings.onClearOllamaChat()
    expect(settings.ollamaChatConfig.value.enabled).toBe(false)

    settings.onUpdateOpenRouterChatEnabled(true)
    expect(settings.openRouterChatConfig.value.enabled).toBe(false)
  })

  it('refreshes provider settings from custom and storage events', () => {
    const { settings } = createSettings()
    settings.addExperimentalProviderChatEventListeners()
    try {
      window.dispatchEvent(new CustomEvent('settings:lmStudioLocalProviderUpdated', {
        detail: {
          endpointUrl: 'http://localhost:5678',
          chatMode: 'native_rest',
          autoLoadBeforeSendEnabled: true,
        },
      }))
      expect(settings.lmStudioChatConfig.value).toMatchObject({
        endpointUrl: 'http://localhost:5678',
        chatMode: 'native_rest',
        config: {
          nativeRestControls: {
            autoLoadBeforeSendEnabled: true,
          },
        },
      })

      window.dispatchEvent(new CustomEvent('settings:ollamaLocalProviderUpdated', {
        detail: {
          endpointUrl: 'http://localhost:11434',
          chatMode: 'openai_compatible',
          nativeRestPreferredEndpoint: 'generate',
          openAICompatiblePreferredEndpoint: 'responses',
          autoLoadBeforeSendEnabled: true,
        },
      }))
      expect(settings.ollamaChatConfig.value).toMatchObject({
        endpointUrl: 'http://localhost:11434',
        chatMode: 'openai_compatible',
        nativeRestPreferredEndpoint: 'generate',
        openAICompatiblePreferredEndpoint: 'responses',
        config: {
          nativeControls: {
            autoLoadBeforeSendEnabled: true,
          },
        },
      })

      settings.onUpdateOllamaChatEnabled(true)
      localStorage.setItem(keys.deepSeekEnabled, '1')
      window.dispatchEvent(new StorageEvent('storage', { key: keys.deepSeekEnabled }))

      expect(settings.lmStudioChatConfig.value.enabled).toBe(false)
      expect(settings.ollamaChatConfig.value.enabled).toBe(false)
      expect(settings.deepSeekChatConfig.value.enabled).toBe(true)
    } finally {
      settings.removeExperimentalProviderChatEventListeners()
    }
  })
})
