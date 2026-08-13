import { computed, ref, type Ref } from 'vue'
import { t } from '@/shared/i18n'

export type ExperimentalProviderChatSettingsInput = Readonly<{
  isRunning: Readonly<Ref<boolean>>
  isDraftInteractionLocked: Readonly<Ref<boolean>>
}>

const OPENROUTER_CHAT_ENABLED_KEY = 'starverse.openRouterTextChat.enabled'
const LM_STUDIO_CHAT_ENABLED_KEY = 'starverse.lmStudioTextChat.enabled'
const LM_STUDIO_ENDPOINT_URL_KEY = 'starverse.lmStudio.endpointUrl'
const LM_STUDIO_CHAT_MODE_KEY = 'starverse.lmStudio.chatMode'
const LM_STUDIO_OPENAI_ENDPOINT_KEY = 'starverse.lmStudio.openAICompatible.preferredEndpoint'
const LM_STUDIO_DIAGNOSTICS_ENABLED_KEY = 'starverse.lmStudio.nativeRest.diagnosticsEnabled'
const LM_STUDIO_MANUAL_LOAD_UNLOAD_ENABLED_KEY = 'starverse.lmStudio.nativeRest.manualLoadUnloadEnabled'
const LM_STUDIO_AUTO_LOAD_BEFORE_SEND_ENABLED_KEY = 'starverse.lmStudio.nativeRest.autoLoadBeforeSendEnabled'
const LM_STUDIO_AUTO_UNLOAD_AFTER_SEND_ENABLED_KEY = 'starverse.lmStudio.nativeRest.autoUnloadAfterSendEnabled'
const LM_STUDIO_AUTO_UNLOAD_AFTER_IDLE_ENABLED_KEY = 'starverse.lmStudio.nativeRest.autoUnloadAfterIdleEnabled'
const LM_STUDIO_SETTINGS_EVENT = 'settings:lmStudioLocalProviderUpdated'
const DEFAULT_LM_STUDIO_ENDPOINT_URL = 'http://127.0.0.1:1234'
const OLLAMA_CHAT_ENABLED_KEY = 'starverse.ollamaTextChat.enabled'
const OLLAMA_ENDPOINT_URL_KEY = 'starverse.ollama.endpointUrl'
const OLLAMA_CHAT_MODE_KEY = 'starverse.ollama.chatMode'
const OLLAMA_NATIVE_ENDPOINT_KEY = 'starverse.ollama.nativeRest.preferredEndpoint'
const OLLAMA_OPENAI_ENDPOINT_KEY = 'starverse.ollama.openAICompatible.preferredEndpoint'
const OLLAMA_THINKING_CONTROL_KEY = 'starverse.ollama.nativeRest.thinkingControl'
const OLLAMA_TOOLS_SUPPORTED_KEY = 'starverse.ollama.nativeRest.toolsSupported'
const OLLAMA_DIAGNOSTICS_ENABLED_KEY = 'starverse.ollama.nativeRest.diagnosticsEnabled'
const OLLAMA_MANUAL_LOAD_UNLOAD_ENABLED_KEY = 'starverse.ollama.nativeRest.manualLoadUnloadEnabled'
const OLLAMA_AUTO_LOAD_BEFORE_SEND_ENABLED_KEY = 'starverse.ollama.nativeRest.autoLoadBeforeSendEnabled'
const OLLAMA_AUTO_UNLOAD_AFTER_SEND_ENABLED_KEY = 'starverse.ollama.nativeRest.autoUnloadAfterSendEnabled'
const OLLAMA_AUTO_UNLOAD_AFTER_IDLE_ENABLED_KEY = 'starverse.ollama.nativeRest.autoUnloadAfterIdleEnabled'
const OLLAMA_SETTINGS_EVENT = 'settings:ollamaLocalProviderUpdated'
const DEFAULT_OLLAMA_ENDPOINT_URL = 'http://127.0.0.1:11434'
const LOCAL_ENDPOINT_CHAT_ENABLED_KEY = 'starverse.localEndpointTextChat.enabled'
const LOCAL_ENDPOINT_CHAT_URL_KEY = 'starverse.localEndpointTextChat.url'
const LOCAL_ENDPOINT_CHAT_SETTINGS_EVENT = 'settings:localEndpointTextChatUpdated'
const DEFAULT_LOCAL_ENDPOINT_CHAT_URL = 'http://localhost:1234/v1'
const OPENAI_RESPONSES_CHAT_ENABLED_KEY = 'starverse.openAIResponsesTextChat.enabled'
const GOOGLE_AI_STUDIO_CHAT_ENABLED_KEY = 'starverse.googleAIStudioTextChat.enabled'
const ANTHROPIC_CHAT_ENABLED_KEY = 'starverse.anthropicMessagesTextChat.enabled'
const ANTHROPIC_THINKING_DISPLAY_KEY = 'starverse.anthropicMessagesTextChat.thinkingDisplay'
const DEEPSEEK_CHAT_ENABLED_KEY = 'starverse.deepSeekTextChat.enabled'

export function useExperimentalProviderChatSettings(input: ExperimentalProviderChatSettingsInput) {
  const openRouterChatEnabled = ref(false)
  const lmStudioChatEnabled = ref(false)
  const lmStudioEndpointUrl = ref(DEFAULT_LM_STUDIO_ENDPOINT_URL)
  const lmStudioChatMode = ref<'openai_compatible' | 'native_rest'>('openai_compatible')
  const lmStudioOpenAICompatiblePreferredEndpoint = ref<'chat_completions' | 'responses'>('responses')
  const lmStudioDiagnosticsEnabled = ref(true)
  const lmStudioManualLoadUnloadEnabled = ref(true)
  const lmStudioAutoLoadBeforeSendEnabled = ref(false)
  const lmStudioAutoUnloadAfterSendEnabled = ref(false)
  const lmStudioAutoUnloadAfterIdleEnabled = ref(false)
  const ollamaChatEnabled = ref(false)
  const ollamaEndpointUrl = ref(DEFAULT_OLLAMA_ENDPOINT_URL)
  const ollamaChatMode = ref<'native_rest' | 'openai_compatible'>('native_rest')
  const ollamaNativeRestPreferredEndpoint = ref<'chat' | 'generate'>('chat')
  const ollamaOpenAICompatiblePreferredEndpoint = ref<'chat_completions' | 'responses'>('chat_completions')
  const ollamaThinkingControl = ref<'boolean' | 'effort' | null>(null)
  const ollamaToolsSupported = ref<boolean | null>(null)
  const ollamaDiagnosticsEnabled = ref(true)
  const ollamaManualLoadUnloadEnabled = ref(true)
  const ollamaAutoLoadBeforeSendEnabled = ref(false)
  const ollamaAutoUnloadAfterSendEnabled = ref(false)
  const ollamaAutoUnloadAfterIdleEnabled = ref(false)
  const localEndpointChatEnabled = ref(false)
  const localEndpointChatUrl = ref(DEFAULT_LOCAL_ENDPOINT_CHAT_URL)
  const openAIResponsesChatEnabled = ref(false)
  const googleAIStudioChatEnabled = ref(false)
  const anthropicChatEnabled = ref(false)
  const anthropicThinkingDisplay = ref<'provider_default' | 'summarized' | 'omitted'>('summarized')
  const deepSeekChatEnabled = ref(false)

  const openRouterChatConfig = computed(() => ({
    enabled: openRouterChatEnabled.value,
    providerLabel: 'OpenRouter · first-class provider',
  }))
  const lmStudioProviderConfig = computed(() => ({
    providerKey: 'lm_studio' as const,
    endpointUrl: lmStudioEndpointUrl.value,
    nativeRestControls: {
      diagnosticsEnabled: lmStudioDiagnosticsEnabled.value,
      manualLoadUnloadEnabled: lmStudioManualLoadUnloadEnabled.value,
      autoLoadBeforeSendEnabled: lmStudioAutoLoadBeforeSendEnabled.value,
      autoUnloadAfterSendEnabled: lmStudioAutoUnloadAfterSendEnabled.value,
      autoUnloadAfterIdleEnabled: lmStudioAutoUnloadAfterIdleEnabled.value,
    },
    chatMode: lmStudioChatMode.value,
    openAICompatible: {
      basePath: '/v1' as const,
      preferredEndpoint: lmStudioOpenAICompatiblePreferredEndpoint.value,
    },
    nativeRest: {
      basePath: '/api/v1' as const,
    },
  }))
  const lmStudioChatConfig = computed(() => ({
    enabled: lmStudioChatEnabled.value,
    endpointUrl: lmStudioEndpointUrl.value,
    chatMode: lmStudioChatMode.value,
    openAICompatiblePreferredEndpoint: lmStudioOpenAICompatiblePreferredEndpoint.value,
    nativeRestControls: lmStudioProviderConfig.value.nativeRestControls,
    config: lmStudioProviderConfig.value,
    experimentalLabel: t('settings.lmStudio.experimentalLabel'),
  }))
  const ollamaProviderConfig = computed(() => ({
    providerKey: 'ollama_local' as const,
    endpointUrl: ollamaEndpointUrl.value,
    nativeControls: {
      diagnosticsEnabled: ollamaDiagnosticsEnabled.value,
      manualLoadUnloadEnabled: ollamaManualLoadUnloadEnabled.value,
      autoLoadBeforeSendEnabled: ollamaAutoLoadBeforeSendEnabled.value,
      autoUnloadAfterSendEnabled: ollamaAutoUnloadAfterSendEnabled.value,
      autoUnloadAfterIdleEnabled: ollamaAutoUnloadAfterIdleEnabled.value,
    },
    chatMode: ollamaChatMode.value,
    nativeRest: {
      basePath: '/api' as const,
      preferredEndpoint: ollamaNativeRestPreferredEndpoint.value,
    },
    openAICompatible: {
      basePath: '/v1' as const,
      preferredEndpoint: ollamaOpenAICompatiblePreferredEndpoint.value,
    },
  }))
  const ollamaChatConfig = computed(() => ({
    enabled: ollamaChatEnabled.value,
    endpointUrl: ollamaEndpointUrl.value,
    chatMode: ollamaChatMode.value,
    nativeRestPreferredEndpoint: ollamaNativeRestPreferredEndpoint.value,
    openAICompatiblePreferredEndpoint: ollamaOpenAICompatiblePreferredEndpoint.value,
    thinkingControl: ollamaThinkingControl.value,
    toolsSupported: ollamaToolsSupported.value,
    nativeControls: ollamaProviderConfig.value.nativeControls,
    config: ollamaProviderConfig.value,
    experimentalLabel: t('settings.ollama.experimentalLabel'),
  }))
  const localEndpointChatConfig = computed(() => ({
    enabled: localEndpointChatEnabled.value,
    endpointUrl: localEndpointChatUrl.value,
    experimentalLabel: 'Experimental · LocalEndpoint text-only · not OpenRouter',
  }))
  const openAIResponsesChatConfig = computed(() => ({
    enabled: openAIResponsesChatEnabled.value,
    experimentalLabel: 'Experimental · OpenAI Responses text-only · not OpenRouter',
  }))
  const googleAIStudioChatConfig = computed(() => ({
    enabled: googleAIStudioChatEnabled.value,
    experimentalLabel: 'Experimental · Google AI Studio Gemini text-only · not OpenRouter',
  }))
  const anthropicChatConfig = computed(() => ({
    enabled: anthropicChatEnabled.value,
    thinkingDisplay: anthropicThinkingDisplay.value,
    experimentalLabel: 'Experimental · Anthropic Messages text-only · not OpenRouter',
  }))
  const deepSeekChatConfig = computed(() => ({
    enabled: deepSeekChatEnabled.value,
    experimentalLabel: 'Experimental · DeepSeek official text-only · not OpenRouter',
  }))
  function applyLocalEndpointChatStorageValues(payload: Readonly<{ endpointUrl?: unknown }>) {
    const endpointUrl = String(payload.endpointUrl ?? '').trim()
    if (endpointUrl) localEndpointChatUrl.value = endpointUrl
  }

  function applyLMStudioStorageValues(payload: Readonly<{
    endpointUrl?: unknown
    chatMode?: unknown
    openAICompatiblePreferredEndpoint?: unknown
    thinkingControl?: unknown
    toolsSupported?: unknown
    diagnosticsEnabled?: unknown
    manualLoadUnloadEnabled?: unknown
    autoLoadBeforeSendEnabled?: unknown
    autoUnloadAfterSendEnabled?: unknown
    autoUnloadAfterIdleEnabled?: unknown
  }>) {
    const endpointUrl = String(payload.endpointUrl ?? '').trim()
    const chatMode = String(payload.chatMode ?? '').trim()
    const preferredEndpoint = String(payload.openAICompatiblePreferredEndpoint ?? '').trim()
    if (endpointUrl) lmStudioEndpointUrl.value = endpointUrl
    if (chatMode === 'openai_compatible' || chatMode === 'native_rest') lmStudioChatMode.value = chatMode
    if (preferredEndpoint === 'chat_completions' || preferredEndpoint === 'responses') {
      lmStudioOpenAICompatiblePreferredEndpoint.value = preferredEndpoint
    }
    if (typeof payload.diagnosticsEnabled === 'boolean') lmStudioDiagnosticsEnabled.value = payload.diagnosticsEnabled
    if (typeof payload.manualLoadUnloadEnabled === 'boolean') lmStudioManualLoadUnloadEnabled.value = payload.manualLoadUnloadEnabled
    if (typeof payload.autoLoadBeforeSendEnabled === 'boolean') lmStudioAutoLoadBeforeSendEnabled.value = payload.autoLoadBeforeSendEnabled
    if (typeof payload.autoUnloadAfterSendEnabled === 'boolean') lmStudioAutoUnloadAfterSendEnabled.value = payload.autoUnloadAfterSendEnabled
    if (typeof payload.autoUnloadAfterIdleEnabled === 'boolean') lmStudioAutoUnloadAfterIdleEnabled.value = payload.autoUnloadAfterIdleEnabled
  }

  function applyOllamaStorageValues(payload: Readonly<{
    endpointUrl?: unknown
    chatMode?: unknown
    nativeRestPreferredEndpoint?: unknown
    openAICompatiblePreferredEndpoint?: unknown
    thinkingControl?: unknown
    toolsSupported?: unknown
    diagnosticsEnabled?: unknown
    manualLoadUnloadEnabled?: unknown
    autoLoadBeforeSendEnabled?: unknown
    autoUnloadAfterSendEnabled?: unknown
    autoUnloadAfterIdleEnabled?: unknown
  }>) {
    const endpointUrl = String(payload.endpointUrl ?? '').trim()
    const chatMode = String(payload.chatMode ?? '').trim()
    const nativePreferredEndpoint = String(payload.nativeRestPreferredEndpoint ?? '').trim()
    const openAIPreferredEndpoint = String(payload.openAICompatiblePreferredEndpoint ?? '').trim()
    if (endpointUrl) ollamaEndpointUrl.value = endpointUrl
    if (chatMode === 'native_rest' || chatMode === 'openai_compatible') ollamaChatMode.value = chatMode
    if (nativePreferredEndpoint === 'chat' || nativePreferredEndpoint === 'generate') {
      ollamaNativeRestPreferredEndpoint.value = nativePreferredEndpoint
    }
    if (openAIPreferredEndpoint === 'chat_completions' || openAIPreferredEndpoint === 'responses') {
      ollamaOpenAICompatiblePreferredEndpoint.value = openAIPreferredEndpoint
    }
    const thinkingControl = String(payload.thinkingControl ?? '').trim()
    if (thinkingControl === 'boolean' || thinkingControl === 'effort') ollamaThinkingControl.value = thinkingControl
    if (typeof payload.toolsSupported === 'boolean') ollamaToolsSupported.value = payload.toolsSupported
    if (typeof payload.diagnosticsEnabled === 'boolean') ollamaDiagnosticsEnabled.value = payload.diagnosticsEnabled
    if (typeof payload.manualLoadUnloadEnabled === 'boolean') ollamaManualLoadUnloadEnabled.value = payload.manualLoadUnloadEnabled
    if (typeof payload.autoLoadBeforeSendEnabled === 'boolean') ollamaAutoLoadBeforeSendEnabled.value = payload.autoLoadBeforeSendEnabled
    if (typeof payload.autoUnloadAfterSendEnabled === 'boolean') ollamaAutoUnloadAfterSendEnabled.value = payload.autoUnloadAfterSendEnabled
    if (typeof payload.autoUnloadAfterIdleEnabled === 'boolean') ollamaAutoUnloadAfterIdleEnabled.value = payload.autoUnloadAfterIdleEnabled
  }

  function readOpenRouterChatStorage() {
    try {
      openRouterChatEnabled.value =
        String(globalThis.localStorage?.getItem(OPENROUTER_CHAT_ENABLED_KEY) ?? '').trim() === '1'
    } catch {
      // OpenRouter provider selection is a non-secret renderer preference; failure keeps unset.
    }
  }

  function readLMStudioChatStorage() {
    try {
      lmStudioChatEnabled.value =
        String(globalThis.localStorage?.getItem(LM_STUDIO_CHAT_ENABLED_KEY) ?? '').trim() === '1'
      applyLMStudioStorageValues({
        endpointUrl: globalThis.localStorage?.getItem(LM_STUDIO_ENDPOINT_URL_KEY),
        chatMode: globalThis.localStorage?.getItem(LM_STUDIO_CHAT_MODE_KEY),
        openAICompatiblePreferredEndpoint: globalThis.localStorage?.getItem(LM_STUDIO_OPENAI_ENDPOINT_KEY),
        diagnosticsEnabled: globalThis.localStorage?.getItem(LM_STUDIO_DIAGNOSTICS_ENABLED_KEY) !== '0',
        manualLoadUnloadEnabled: globalThis.localStorage?.getItem(LM_STUDIO_MANUAL_LOAD_UNLOAD_ENABLED_KEY) !== '0',
        autoLoadBeforeSendEnabled: globalThis.localStorage?.getItem(LM_STUDIO_AUTO_LOAD_BEFORE_SEND_ENABLED_KEY) === '1',
        autoUnloadAfterSendEnabled: globalThis.localStorage?.getItem(LM_STUDIO_AUTO_UNLOAD_AFTER_SEND_ENABLED_KEY) === '1',
        autoUnloadAfterIdleEnabled: globalThis.localStorage?.getItem(LM_STUDIO_AUTO_UNLOAD_AFTER_IDLE_ENABLED_KEY) === '1',
      })
    } catch {
      // LM Studio settings are non-secret renderer preferences; failure keeps defaults.
    }
  }

  function readOllamaChatStorage() {
    try {
      ollamaChatEnabled.value =
        String(globalThis.localStorage?.getItem(OLLAMA_CHAT_ENABLED_KEY) ?? '').trim() === '1'
      applyOllamaStorageValues({
        endpointUrl: globalThis.localStorage?.getItem(OLLAMA_ENDPOINT_URL_KEY),
        chatMode: globalThis.localStorage?.getItem(OLLAMA_CHAT_MODE_KEY),
        nativeRestPreferredEndpoint: globalThis.localStorage?.getItem(OLLAMA_NATIVE_ENDPOINT_KEY),
        openAICompatiblePreferredEndpoint: globalThis.localStorage?.getItem(OLLAMA_OPENAI_ENDPOINT_KEY),
        thinkingControl: globalThis.localStorage?.getItem(OLLAMA_THINKING_CONTROL_KEY),
        toolsSupported: globalThis.localStorage?.getItem(OLLAMA_TOOLS_SUPPORTED_KEY) === null
          ? undefined
          : globalThis.localStorage?.getItem(OLLAMA_TOOLS_SUPPORTED_KEY) === '1',
        diagnosticsEnabled: globalThis.localStorage?.getItem(OLLAMA_DIAGNOSTICS_ENABLED_KEY) !== '0',
        manualLoadUnloadEnabled: globalThis.localStorage?.getItem(OLLAMA_MANUAL_LOAD_UNLOAD_ENABLED_KEY) !== '0',
        autoLoadBeforeSendEnabled: globalThis.localStorage?.getItem(OLLAMA_AUTO_LOAD_BEFORE_SEND_ENABLED_KEY) === '1',
        autoUnloadAfterSendEnabled: globalThis.localStorage?.getItem(OLLAMA_AUTO_UNLOAD_AFTER_SEND_ENABLED_KEY) === '1',
        autoUnloadAfterIdleEnabled: globalThis.localStorage?.getItem(OLLAMA_AUTO_UNLOAD_AFTER_IDLE_ENABLED_KEY) === '1',
      })
    } catch {
      // Ollama settings are non-secret renderer preferences; failure keeps defaults.
    }
  }

  function readLocalEndpointChatStorage() {
    try {
      const enabled = String(globalThis.localStorage?.getItem(LOCAL_ENDPOINT_CHAT_ENABLED_KEY) ?? '').trim() === '1'
      localEndpointChatEnabled.value = enabled
      applyLocalEndpointChatStorageValues({
        endpointUrl: globalThis.localStorage?.getItem(LOCAL_ENDPOINT_CHAT_URL_KEY),
      })
    } catch {
      // LocalEndpoint chat settings are non-secret renderer preferences; failure keeps defaults.
    }
  }

  function readOpenAIResponsesChatStorage() {
    try {
      openAIResponsesChatEnabled.value =
        String(globalThis.localStorage?.getItem(OPENAI_RESPONSES_CHAT_ENABLED_KEY) ?? '').trim() === '1'
    } catch {
      // OpenAI Responses chat settings are non-secret renderer preferences; failure keeps defaults.
    }
  }

  function readGoogleAIStudioChatStorage() {
    try {
      googleAIStudioChatEnabled.value =
        String(globalThis.localStorage?.getItem(GOOGLE_AI_STUDIO_CHAT_ENABLED_KEY) ?? '').trim() === '1'
    } catch {
      // Google AI Studio chat settings are non-secret renderer preferences; failure keeps defaults.
    }
  }

  function readAnthropicChatStorage() {
    try {
      anthropicChatEnabled.value =
        String(globalThis.localStorage?.getItem(ANTHROPIC_CHAT_ENABLED_KEY) ?? '').trim() === '1'
      const display = String(globalThis.localStorage?.getItem(ANTHROPIC_THINKING_DISPLAY_KEY) ?? '').trim()
      if (display === 'provider_default' || display === 'summarized' || display === 'omitted') {
        anthropicThinkingDisplay.value = display
      }
    } catch {
      // Anthropic chat settings are non-secret renderer preferences; failure keeps defaults.
    }
  }

  function readDeepSeekChatStorage() {
    try {
      deepSeekChatEnabled.value =
        String(globalThis.localStorage?.getItem(DEEPSEEK_CHAT_ENABLED_KEY) ?? '').trim() === '1'
    } catch {
      // DeepSeek chat settings are non-secret renderer preferences; failure keeps defaults.
    }
  }

  function readExperimentalProviderChatStorage() {
    readOpenRouterChatStorage()
    readLMStudioChatStorage()
    readOllamaChatStorage()
    readLocalEndpointChatStorage()
    readOpenAIResponsesChatStorage()
    readGoogleAIStudioChatStorage()
    readAnthropicChatStorage()
    readDeepSeekChatStorage()
    enforceExperimentalChatMutualExclusion()
  }

  function handleLocalEndpointChatSettingsUpdated(event: Event) {
    const detail = (event as CustomEvent).detail
    if (!detail || typeof detail !== 'object') return
    applyLocalEndpointChatStorageValues(detail as { endpointUrl?: unknown })
  }

  function handleLMStudioSettingsUpdated(event: Event) {
    const detail = (event as CustomEvent).detail
    if (!detail || typeof detail !== 'object') return
    applyLMStudioStorageValues(detail as {
      endpointUrl?: unknown
      chatMode?: unknown
      openAICompatiblePreferredEndpoint?: unknown
      thinkingControl?: unknown
      toolsSupported?: unknown
      diagnosticsEnabled?: unknown
      manualLoadUnloadEnabled?: unknown
      autoLoadBeforeSendEnabled?: unknown
      autoUnloadAfterSendEnabled?: unknown
      autoUnloadAfterIdleEnabled?: unknown
    })
  }

  function handleOllamaSettingsUpdated(event: Event) {
    const detail = (event as CustomEvent).detail
    if (!detail || typeof detail !== 'object') return
    applyOllamaStorageValues(detail as {
      endpointUrl?: unknown
      chatMode?: unknown
      nativeRestPreferredEndpoint?: unknown
      openAICompatiblePreferredEndpoint?: unknown
      diagnosticsEnabled?: unknown
      manualLoadUnloadEnabled?: unknown
      autoLoadBeforeSendEnabled?: unknown
      autoUnloadAfterSendEnabled?: unknown
      autoUnloadAfterIdleEnabled?: unknown
    })
  }

  function handleOpenRouterChatStorage(event: StorageEvent) {
    if (event.key !== OPENROUTER_CHAT_ENABLED_KEY) return
    readOpenRouterChatStorage()
    enforceExperimentalChatMutualExclusion()
  }

  function handleLocalEndpointChatStorage(event: StorageEvent) {
    if (
      event.key !== LOCAL_ENDPOINT_CHAT_ENABLED_KEY &&
      event.key !== LOCAL_ENDPOINT_CHAT_URL_KEY
    ) return
    readLocalEndpointChatStorage()
    enforceExperimentalChatMutualExclusion()
  }

  function handleLMStudioChatStorage(event: StorageEvent) {
    if (
      event.key !== LM_STUDIO_CHAT_ENABLED_KEY &&
      event.key !== LM_STUDIO_ENDPOINT_URL_KEY &&
      event.key !== LM_STUDIO_CHAT_MODE_KEY &&
      event.key !== LM_STUDIO_OPENAI_ENDPOINT_KEY &&
      event.key !== LM_STUDIO_DIAGNOSTICS_ENABLED_KEY &&
      event.key !== LM_STUDIO_MANUAL_LOAD_UNLOAD_ENABLED_KEY &&
      event.key !== LM_STUDIO_AUTO_LOAD_BEFORE_SEND_ENABLED_KEY &&
      event.key !== LM_STUDIO_AUTO_UNLOAD_AFTER_SEND_ENABLED_KEY &&
      event.key !== LM_STUDIO_AUTO_UNLOAD_AFTER_IDLE_ENABLED_KEY
    ) return
    readLMStudioChatStorage()
    enforceExperimentalChatMutualExclusion()
  }

  function handleOllamaChatStorage(event: StorageEvent) {
    if (
      event.key !== OLLAMA_CHAT_ENABLED_KEY &&
      event.key !== OLLAMA_ENDPOINT_URL_KEY &&
      event.key !== OLLAMA_CHAT_MODE_KEY &&
      event.key !== OLLAMA_NATIVE_ENDPOINT_KEY &&
      event.key !== OLLAMA_OPENAI_ENDPOINT_KEY &&
      event.key !== OLLAMA_THINKING_CONTROL_KEY &&
      event.key !== OLLAMA_TOOLS_SUPPORTED_KEY &&
      event.key !== OLLAMA_DIAGNOSTICS_ENABLED_KEY &&
      event.key !== OLLAMA_MANUAL_LOAD_UNLOAD_ENABLED_KEY &&
      event.key !== OLLAMA_AUTO_LOAD_BEFORE_SEND_ENABLED_KEY &&
      event.key !== OLLAMA_AUTO_UNLOAD_AFTER_SEND_ENABLED_KEY &&
      event.key !== OLLAMA_AUTO_UNLOAD_AFTER_IDLE_ENABLED_KEY
    ) return
    readOllamaChatStorage()
    enforceExperimentalChatMutualExclusion()
  }

  function handleOpenAIResponsesChatStorage(event: StorageEvent) {
    if (event.key !== OPENAI_RESPONSES_CHAT_ENABLED_KEY) return
    readOpenAIResponsesChatStorage()
    enforceExperimentalChatMutualExclusion()
  }

  function handleGoogleAIStudioChatStorage(event: StorageEvent) {
    if (event.key !== GOOGLE_AI_STUDIO_CHAT_ENABLED_KEY) return
    readGoogleAIStudioChatStorage()
    enforceExperimentalChatMutualExclusion()
  }

  function handleAnthropicChatStorage(event: StorageEvent) {
    if (event.key !== ANTHROPIC_CHAT_ENABLED_KEY && event.key !== ANTHROPIC_THINKING_DISPLAY_KEY) return
    readAnthropicChatStorage()
    enforceExperimentalChatMutualExclusion()
  }

  function handleDeepSeekChatStorage(event: StorageEvent) {
    if (event.key !== DEEPSEEK_CHAT_ENABLED_KEY) return
    readDeepSeekChatStorage()
    enforceExperimentalChatMutualExclusion()
  }

  function addExperimentalProviderChatEventListeners() {
    if (typeof window === 'undefined') return
    window.addEventListener(LM_STUDIO_SETTINGS_EVENT, handleLMStudioSettingsUpdated)
    window.addEventListener(OLLAMA_SETTINGS_EVENT, handleOllamaSettingsUpdated)
    window.addEventListener(LOCAL_ENDPOINT_CHAT_SETTINGS_EVENT, handleLocalEndpointChatSettingsUpdated)
    window.addEventListener('storage', handleOpenRouterChatStorage)
    window.addEventListener('storage', handleLMStudioChatStorage)
    window.addEventListener('storage', handleOllamaChatStorage)
    window.addEventListener('storage', handleLocalEndpointChatStorage)
    window.addEventListener('storage', handleOpenAIResponsesChatStorage)
    window.addEventListener('storage', handleGoogleAIStudioChatStorage)
    window.addEventListener('storage', handleAnthropicChatStorage)
    window.addEventListener('storage', handleDeepSeekChatStorage)
  }

  function removeExperimentalProviderChatEventListeners() {
    if (typeof window === 'undefined') return
    window.removeEventListener(LM_STUDIO_SETTINGS_EVENT, handleLMStudioSettingsUpdated)
    window.removeEventListener(OLLAMA_SETTINGS_EVENT, handleOllamaSettingsUpdated)
    window.removeEventListener(LOCAL_ENDPOINT_CHAT_SETTINGS_EVENT, handleLocalEndpointChatSettingsUpdated)
    window.removeEventListener('storage', handleOpenRouterChatStorage)
    window.removeEventListener('storage', handleLMStudioChatStorage)
    window.removeEventListener('storage', handleOllamaChatStorage)
    window.removeEventListener('storage', handleLocalEndpointChatStorage)
    window.removeEventListener('storage', handleOpenAIResponsesChatStorage)
    window.removeEventListener('storage', handleGoogleAIStudioChatStorage)
    window.removeEventListener('storage', handleAnthropicChatStorage)
    window.removeEventListener('storage', handleDeepSeekChatStorage)
  }

  function persistLocalEndpointChatStorage() {
    try {
      globalThis.localStorage?.setItem(LOCAL_ENDPOINT_CHAT_ENABLED_KEY, localEndpointChatEnabled.value ? '1' : '0')
      globalThis.localStorage?.setItem(LOCAL_ENDPOINT_CHAT_URL_KEY, localEndpointChatUrl.value)
    } catch {
      // Non-fatal: the user can still use the current in-memory settings.
    }
  }

  function persistLMStudioChatStorage() {
    try {
      globalThis.localStorage?.setItem(LM_STUDIO_CHAT_ENABLED_KEY, lmStudioChatEnabled.value ? '1' : '0')
      globalThis.localStorage?.setItem(LM_STUDIO_ENDPOINT_URL_KEY, lmStudioEndpointUrl.value)
      globalThis.localStorage?.setItem(LM_STUDIO_CHAT_MODE_KEY, lmStudioChatMode.value)
      globalThis.localStorage?.setItem(LM_STUDIO_OPENAI_ENDPOINT_KEY, lmStudioOpenAICompatiblePreferredEndpoint.value)
      globalThis.localStorage?.setItem(LM_STUDIO_DIAGNOSTICS_ENABLED_KEY, lmStudioDiagnosticsEnabled.value ? '1' : '0')
      globalThis.localStorage?.setItem(LM_STUDIO_MANUAL_LOAD_UNLOAD_ENABLED_KEY, lmStudioManualLoadUnloadEnabled.value ? '1' : '0')
      globalThis.localStorage?.setItem(LM_STUDIO_AUTO_LOAD_BEFORE_SEND_ENABLED_KEY, lmStudioAutoLoadBeforeSendEnabled.value ? '1' : '0')
      globalThis.localStorage?.setItem(LM_STUDIO_AUTO_UNLOAD_AFTER_SEND_ENABLED_KEY, lmStudioAutoUnloadAfterSendEnabled.value ? '1' : '0')
      globalThis.localStorage?.setItem(LM_STUDIO_AUTO_UNLOAD_AFTER_IDLE_ENABLED_KEY, lmStudioAutoUnloadAfterIdleEnabled.value ? '1' : '0')
    } catch {
      // Non-fatal: the user can still use the current in-memory settings.
    }
  }

  function persistOllamaChatStorage() {
    try {
      globalThis.localStorage?.setItem(OLLAMA_CHAT_ENABLED_KEY, ollamaChatEnabled.value ? '1' : '0')
      globalThis.localStorage?.setItem(OLLAMA_ENDPOINT_URL_KEY, ollamaEndpointUrl.value)
      globalThis.localStorage?.setItem(OLLAMA_CHAT_MODE_KEY, ollamaChatMode.value)
      globalThis.localStorage?.setItem(OLLAMA_NATIVE_ENDPOINT_KEY, ollamaNativeRestPreferredEndpoint.value)
      globalThis.localStorage?.setItem(OLLAMA_OPENAI_ENDPOINT_KEY, ollamaOpenAICompatiblePreferredEndpoint.value)
      if (ollamaThinkingControl.value === null) globalThis.localStorage?.removeItem(OLLAMA_THINKING_CONTROL_KEY)
      else globalThis.localStorage?.setItem(OLLAMA_THINKING_CONTROL_KEY, ollamaThinkingControl.value)
      if (ollamaToolsSupported.value === null) globalThis.localStorage?.removeItem(OLLAMA_TOOLS_SUPPORTED_KEY)
      else globalThis.localStorage?.setItem(OLLAMA_TOOLS_SUPPORTED_KEY, ollamaToolsSupported.value ? '1' : '0')
      globalThis.localStorage?.setItem(OLLAMA_DIAGNOSTICS_ENABLED_KEY, ollamaDiagnosticsEnabled.value ? '1' : '0')
      globalThis.localStorage?.setItem(OLLAMA_MANUAL_LOAD_UNLOAD_ENABLED_KEY, ollamaManualLoadUnloadEnabled.value ? '1' : '0')
      globalThis.localStorage?.setItem(OLLAMA_AUTO_LOAD_BEFORE_SEND_ENABLED_KEY, ollamaAutoLoadBeforeSendEnabled.value ? '1' : '0')
      globalThis.localStorage?.setItem(OLLAMA_AUTO_UNLOAD_AFTER_SEND_ENABLED_KEY, ollamaAutoUnloadAfterSendEnabled.value ? '1' : '0')
      globalThis.localStorage?.setItem(OLLAMA_AUTO_UNLOAD_AFTER_IDLE_ENABLED_KEY, ollamaAutoUnloadAfterIdleEnabled.value ? '1' : '0')
    } catch {
      // Non-fatal: the user can still use the current in-memory settings.
    }
  }

  function persistOpenAIResponsesChatStorage() {
    try {
      globalThis.localStorage?.setItem(OPENAI_RESPONSES_CHAT_ENABLED_KEY, openAIResponsesChatEnabled.value ? '1' : '0')
    } catch {
      // Non-fatal: the user can still use the current in-memory settings.
    }
  }

  function persistGoogleAIStudioChatStorage() {
    try {
      globalThis.localStorage?.setItem(GOOGLE_AI_STUDIO_CHAT_ENABLED_KEY, googleAIStudioChatEnabled.value ? '1' : '0')
    } catch {
      // Non-fatal: the user can still use the current in-memory settings.
    }
  }

  function persistAnthropicChatStorage() {
    try {
      globalThis.localStorage?.setItem(ANTHROPIC_CHAT_ENABLED_KEY, anthropicChatEnabled.value ? '1' : '0')
      globalThis.localStorage?.setItem(ANTHROPIC_THINKING_DISPLAY_KEY, anthropicThinkingDisplay.value)
    } catch {
      // Non-fatal: the user can still use the current in-memory settings.
    }
  }

  function persistDeepSeekChatStorage() {
    try {
      globalThis.localStorage?.setItem(DEEPSEEK_CHAT_ENABLED_KEY, deepSeekChatEnabled.value ? '1' : '0')
    } catch {
      // Non-fatal: the user can still use the current in-memory settings.
    }
  }

  function persistOpenRouterChatStorage() {
    try {
      globalThis.localStorage?.setItem(OPENROUTER_CHAT_ENABLED_KEY, openRouterChatEnabled.value ? '1' : '0')
    } catch {
      // Non-fatal: the user can still use the current in-memory selection.
    }
  }

  function enforceExperimentalChatMutualExclusion() {
    if (deepSeekChatEnabled.value) {
      openRouterChatEnabled.value = false
      lmStudioChatEnabled.value = false
      ollamaChatEnabled.value = false
      localEndpointChatEnabled.value = false
      openAIResponsesChatEnabled.value = false
      googleAIStudioChatEnabled.value = false
      anthropicChatEnabled.value = false
      persistOpenRouterChatStorage()
      persistLMStudioChatStorage()
      persistOllamaChatStorage()
      persistLocalEndpointChatStorage()
      persistOpenAIResponsesChatStorage()
      persistGoogleAIStudioChatStorage()
      persistAnthropicChatStorage()
      return
    }
    if (anthropicChatEnabled.value) {
      openRouterChatEnabled.value = false
      lmStudioChatEnabled.value = false
      ollamaChatEnabled.value = false
      localEndpointChatEnabled.value = false
      openAIResponsesChatEnabled.value = false
      googleAIStudioChatEnabled.value = false
      deepSeekChatEnabled.value = false
      persistOpenRouterChatStorage()
      persistLMStudioChatStorage()
      persistOllamaChatStorage()
      persistLocalEndpointChatStorage()
      persistOpenAIResponsesChatStorage()
      persistGoogleAIStudioChatStorage()
      persistDeepSeekChatStorage()
      return
    }
    if (googleAIStudioChatEnabled.value) {
      openRouterChatEnabled.value = false
      lmStudioChatEnabled.value = false
      ollamaChatEnabled.value = false
      localEndpointChatEnabled.value = false
      openAIResponsesChatEnabled.value = false
      anthropicChatEnabled.value = false
      deepSeekChatEnabled.value = false
      persistOpenRouterChatStorage()
      persistLMStudioChatStorage()
      persistOllamaChatStorage()
      persistLocalEndpointChatStorage()
      persistOpenAIResponsesChatStorage()
      persistAnthropicChatStorage()
      persistDeepSeekChatStorage()
      return
    }
    if (openAIResponsesChatEnabled.value) {
      openRouterChatEnabled.value = false
      lmStudioChatEnabled.value = false
      ollamaChatEnabled.value = false
      localEndpointChatEnabled.value = false
      googleAIStudioChatEnabled.value = false
      anthropicChatEnabled.value = false
      deepSeekChatEnabled.value = false
      persistOpenRouterChatStorage()
      persistLMStudioChatStorage()
      persistOllamaChatStorage()
      persistLocalEndpointChatStorage()
      persistGoogleAIStudioChatStorage()
      persistAnthropicChatStorage()
      persistDeepSeekChatStorage()
      return
    }
    if (ollamaChatEnabled.value) {
      openRouterChatEnabled.value = false
      lmStudioChatEnabled.value = false
      localEndpointChatEnabled.value = false
      openAIResponsesChatEnabled.value = false
      googleAIStudioChatEnabled.value = false
      anthropicChatEnabled.value = false
      deepSeekChatEnabled.value = false
      persistOpenRouterChatStorage()
      persistLMStudioChatStorage()
      persistLocalEndpointChatStorage()
      persistOpenAIResponsesChatStorage()
      persistGoogleAIStudioChatStorage()
      persistAnthropicChatStorage()
      persistDeepSeekChatStorage()
      return
    }
    if (lmStudioChatEnabled.value) {
      openRouterChatEnabled.value = false
      ollamaChatEnabled.value = false
      localEndpointChatEnabled.value = false
      openAIResponsesChatEnabled.value = false
      googleAIStudioChatEnabled.value = false
      anthropicChatEnabled.value = false
      deepSeekChatEnabled.value = false
      persistOpenRouterChatStorage()
      persistOllamaChatStorage()
      persistLocalEndpointChatStorage()
      persistOpenAIResponsesChatStorage()
      persistGoogleAIStudioChatStorage()
      persistAnthropicChatStorage()
      persistDeepSeekChatStorage()
      return
    }
    if (localEndpointChatEnabled.value) {
      openRouterChatEnabled.value = false
      lmStudioChatEnabled.value = false
      ollamaChatEnabled.value = false
      openAIResponsesChatEnabled.value = false
      googleAIStudioChatEnabled.value = false
      anthropicChatEnabled.value = false
      deepSeekChatEnabled.value = false
      persistOpenRouterChatStorage()
      persistLMStudioChatStorage()
      persistOllamaChatStorage()
      persistOpenAIResponsesChatStorage()
      persistGoogleAIStudioChatStorage()
      persistAnthropicChatStorage()
      persistDeepSeekChatStorage()
    }
  }

  function onUpdateOpenRouterChatEnabled(enabled: boolean) {
    if (input.isDraftInteractionLocked.value || input.isRunning.value) return
    openRouterChatEnabled.value = enabled
    if (enabled) {
      lmStudioChatEnabled.value = false
      ollamaChatEnabled.value = false
      localEndpointChatEnabled.value = false
      openAIResponsesChatEnabled.value = false
      googleAIStudioChatEnabled.value = false
      anthropicChatEnabled.value = false
      deepSeekChatEnabled.value = false
      persistLMStudioChatStorage()
      persistOllamaChatStorage()
      persistLocalEndpointChatStorage()
      persistOpenAIResponsesChatStorage()
      persistGoogleAIStudioChatStorage()
      persistAnthropicChatStorage()
      persistDeepSeekChatStorage()
    }
    persistOpenRouterChatStorage()
  }

  function onUpdateLMStudioChatEnabled(enabled: boolean) {
    if (input.isDraftInteractionLocked.value || input.isRunning.value) return
    lmStudioChatEnabled.value = enabled
    if (enabled) {
      openRouterChatEnabled.value = false
      ollamaChatEnabled.value = false
      localEndpointChatEnabled.value = false
      openAIResponsesChatEnabled.value = false
      googleAIStudioChatEnabled.value = false
      anthropicChatEnabled.value = false
      deepSeekChatEnabled.value = false
      persistOpenRouterChatStorage()
      persistOllamaChatStorage()
      persistLocalEndpointChatStorage()
      persistOpenAIResponsesChatStorage()
      persistGoogleAIStudioChatStorage()
      persistAnthropicChatStorage()
      persistDeepSeekChatStorage()
    }
    persistLMStudioChatStorage()
  }

  function onUpdateLMStudioEndpointUrl(endpointUrl: string) {
    lmStudioEndpointUrl.value = String(endpointUrl ?? '')
    persistLMStudioChatStorage()
  }

  function onUpdateLMStudioChatMode(chatMode: 'openai_compatible' | 'native_rest') {
    lmStudioChatMode.value = chatMode === 'native_rest' ? 'native_rest' : 'openai_compatible'
    persistLMStudioChatStorage()
  }

  function onUpdateLMStudioOpenAICompatiblePreferredEndpoint(endpoint: 'chat_completions' | 'responses') {
    lmStudioOpenAICompatiblePreferredEndpoint.value = endpoint === 'responses' ? 'responses' : 'chat_completions'
    persistLMStudioChatStorage()
  }

  function onUpdateLMStudioNativeRestControl(
    key: 'diagnosticsEnabled' | 'manualLoadUnloadEnabled' | 'autoLoadBeforeSendEnabled' | 'autoUnloadAfterSendEnabled' | 'autoUnloadAfterIdleEnabled',
    enabled: boolean,
  ) {
    if (key === 'diagnosticsEnabled') lmStudioDiagnosticsEnabled.value = enabled
    if (key === 'manualLoadUnloadEnabled') lmStudioManualLoadUnloadEnabled.value = enabled
    if (key === 'autoLoadBeforeSendEnabled') lmStudioAutoLoadBeforeSendEnabled.value = enabled
    if (key === 'autoUnloadAfterSendEnabled') lmStudioAutoUnloadAfterSendEnabled.value = enabled
    if (key === 'autoUnloadAfterIdleEnabled') lmStudioAutoUnloadAfterIdleEnabled.value = enabled
    persistLMStudioChatStorage()
  }

  function onClearLMStudioChat() {
    if (input.isDraftInteractionLocked.value || input.isRunning.value) return
    lmStudioChatEnabled.value = false
    lmStudioEndpointUrl.value = DEFAULT_LM_STUDIO_ENDPOINT_URL
    lmStudioChatMode.value = 'openai_compatible'
    lmStudioOpenAICompatiblePreferredEndpoint.value = 'responses'
    lmStudioDiagnosticsEnabled.value = true
    lmStudioManualLoadUnloadEnabled.value = true
    lmStudioAutoLoadBeforeSendEnabled.value = false
    lmStudioAutoUnloadAfterSendEnabled.value = false
    lmStudioAutoUnloadAfterIdleEnabled.value = false
    try {
      globalThis.localStorage?.removeItem(LM_STUDIO_CHAT_ENABLED_KEY)
      globalThis.localStorage?.removeItem(LM_STUDIO_ENDPOINT_URL_KEY)
      globalThis.localStorage?.removeItem(LM_STUDIO_CHAT_MODE_KEY)
      globalThis.localStorage?.removeItem(LM_STUDIO_OPENAI_ENDPOINT_KEY)
      globalThis.localStorage?.removeItem(LM_STUDIO_DIAGNOSTICS_ENABLED_KEY)
      globalThis.localStorage?.removeItem(LM_STUDIO_MANUAL_LOAD_UNLOAD_ENABLED_KEY)
      globalThis.localStorage?.removeItem(LM_STUDIO_AUTO_LOAD_BEFORE_SEND_ENABLED_KEY)
      globalThis.localStorage?.removeItem(LM_STUDIO_AUTO_UNLOAD_AFTER_SEND_ENABLED_KEY)
      globalThis.localStorage?.removeItem(LM_STUDIO_AUTO_UNLOAD_AFTER_IDLE_ENABLED_KEY)
    } catch {
      // Non-fatal: in-memory state still leaves the runtime selection unset unless another provider is selected.
    }
  }

  function onUpdateOllamaChatEnabled(enabled: boolean) {
    if (input.isDraftInteractionLocked.value || input.isRunning.value) return
    ollamaChatEnabled.value = enabled
    if (enabled) {
      openRouterChatEnabled.value = false
      lmStudioChatEnabled.value = false
      localEndpointChatEnabled.value = false
      openAIResponsesChatEnabled.value = false
      googleAIStudioChatEnabled.value = false
      anthropicChatEnabled.value = false
      deepSeekChatEnabled.value = false
      persistOpenRouterChatStorage()
      persistLMStudioChatStorage()
      persistLocalEndpointChatStorage()
      persistOpenAIResponsesChatStorage()
      persistGoogleAIStudioChatStorage()
      persistAnthropicChatStorage()
      persistDeepSeekChatStorage()
    }
    persistOllamaChatStorage()
  }

  function onUpdateOllamaEndpointUrl(endpointUrl: string) {
    ollamaEndpointUrl.value = String(endpointUrl ?? '')
    persistOllamaChatStorage()
  }

  function onUpdateOllamaChatMode(chatMode: 'native_rest' | 'openai_compatible') {
    ollamaChatMode.value = chatMode === 'openai_compatible' ? 'openai_compatible' : 'native_rest'
    persistOllamaChatStorage()
  }

  function onUpdateOllamaNativeRestPreferredEndpoint(endpoint: 'chat' | 'generate') {
    ollamaNativeRestPreferredEndpoint.value = endpoint === 'generate' ? 'generate' : 'chat'
    persistOllamaChatStorage()
  }

  function onUpdateOllamaOpenAICompatiblePreferredEndpoint(endpoint: 'chat_completions' | 'responses') {
    ollamaOpenAICompatiblePreferredEndpoint.value = endpoint === 'responses' ? 'responses' : 'chat_completions'
    persistOllamaChatStorage()
  }

  function onUpdateOllamaProfileCapability(
    key: 'thinkingControl' | 'toolsSupported',
    value: 'boolean' | 'effort' | boolean,
  ) {
    if (key === 'thinkingControl' && (value === 'boolean' || value === 'effort')) ollamaThinkingControl.value = value
    if (key === 'toolsSupported' && typeof value === 'boolean') ollamaToolsSupported.value = value
    persistOllamaChatStorage()
  }

  function onUpdateOllamaNativeControl(
    key: 'diagnosticsEnabled' | 'manualLoadUnloadEnabled' | 'autoLoadBeforeSendEnabled' | 'autoUnloadAfterSendEnabled' | 'autoUnloadAfterIdleEnabled',
    enabled: boolean,
  ) {
    if (key === 'diagnosticsEnabled') ollamaDiagnosticsEnabled.value = enabled
    if (key === 'manualLoadUnloadEnabled') ollamaManualLoadUnloadEnabled.value = enabled
    if (key === 'autoLoadBeforeSendEnabled') ollamaAutoLoadBeforeSendEnabled.value = enabled
    if (key === 'autoUnloadAfterSendEnabled') ollamaAutoUnloadAfterSendEnabled.value = enabled
    if (key === 'autoUnloadAfterIdleEnabled') ollamaAutoUnloadAfterIdleEnabled.value = enabled
    persistOllamaChatStorage()
  }

  function onClearOllamaChat() {
    if (input.isDraftInteractionLocked.value || input.isRunning.value) return
    ollamaChatEnabled.value = false
    ollamaEndpointUrl.value = DEFAULT_OLLAMA_ENDPOINT_URL
    ollamaChatMode.value = 'native_rest'
    ollamaNativeRestPreferredEndpoint.value = 'chat'
    ollamaOpenAICompatiblePreferredEndpoint.value = 'chat_completions'
    ollamaThinkingControl.value = null
    ollamaToolsSupported.value = null
    ollamaDiagnosticsEnabled.value = true
    ollamaManualLoadUnloadEnabled.value = true
    ollamaAutoLoadBeforeSendEnabled.value = false
    ollamaAutoUnloadAfterSendEnabled.value = false
    ollamaAutoUnloadAfterIdleEnabled.value = false
    try {
      globalThis.localStorage?.removeItem(OLLAMA_CHAT_ENABLED_KEY)
      globalThis.localStorage?.removeItem(OLLAMA_ENDPOINT_URL_KEY)
      globalThis.localStorage?.removeItem(OLLAMA_CHAT_MODE_KEY)
      globalThis.localStorage?.removeItem(OLLAMA_NATIVE_ENDPOINT_KEY)
      globalThis.localStorage?.removeItem(OLLAMA_OPENAI_ENDPOINT_KEY)
      globalThis.localStorage?.removeItem(OLLAMA_THINKING_CONTROL_KEY)
      globalThis.localStorage?.removeItem(OLLAMA_TOOLS_SUPPORTED_KEY)
      globalThis.localStorage?.removeItem(OLLAMA_DIAGNOSTICS_ENABLED_KEY)
      globalThis.localStorage?.removeItem(OLLAMA_MANUAL_LOAD_UNLOAD_ENABLED_KEY)
      globalThis.localStorage?.removeItem(OLLAMA_AUTO_LOAD_BEFORE_SEND_ENABLED_KEY)
      globalThis.localStorage?.removeItem(OLLAMA_AUTO_UNLOAD_AFTER_SEND_ENABLED_KEY)
      globalThis.localStorage?.removeItem(OLLAMA_AUTO_UNLOAD_AFTER_IDLE_ENABLED_KEY)
    } catch {
      // Non-fatal: in-memory state still leaves the runtime selection unset unless another provider is selected.
    }
  }

  function onUpdateLocalEndpointChatEnabled(enabled: boolean) {
    if (input.isDraftInteractionLocked.value || input.isRunning.value) return
    localEndpointChatEnabled.value = enabled
    if (enabled) {
      openRouterChatEnabled.value = false
      lmStudioChatEnabled.value = false
      ollamaChatEnabled.value = false
      openAIResponsesChatEnabled.value = false
      googleAIStudioChatEnabled.value = false
      anthropicChatEnabled.value = false
      deepSeekChatEnabled.value = false
      persistOpenRouterChatStorage()
      persistLMStudioChatStorage()
      persistOllamaChatStorage()
      persistOpenAIResponsesChatStorage()
      persistGoogleAIStudioChatStorage()
      persistAnthropicChatStorage()
      persistDeepSeekChatStorage()
    }
    persistLocalEndpointChatStorage()
  }

  function onUpdateLocalEndpointChatUrl(endpointUrl: string) {
    localEndpointChatUrl.value = String(endpointUrl ?? '')
    persistLocalEndpointChatStorage()
  }

  function onClearLocalEndpointChat() {
    if (input.isDraftInteractionLocked.value || input.isRunning.value) return
    localEndpointChatEnabled.value = false
    localEndpointChatUrl.value = DEFAULT_LOCAL_ENDPOINT_CHAT_URL
    try {
      globalThis.localStorage?.removeItem(LOCAL_ENDPOINT_CHAT_ENABLED_KEY)
      globalThis.localStorage?.removeItem(LOCAL_ENDPOINT_CHAT_URL_KEY)
    } catch {
      // Non-fatal: in-memory state still leaves the runtime selection unset unless another provider is selected.
    }
  }

  function onUpdateOpenAIResponsesChatEnabled(enabled: boolean) {
    if (input.isDraftInteractionLocked.value || input.isRunning.value) return
    openAIResponsesChatEnabled.value = enabled
    if (enabled) {
      openRouterChatEnabled.value = false
      lmStudioChatEnabled.value = false
      ollamaChatEnabled.value = false
      localEndpointChatEnabled.value = false
      googleAIStudioChatEnabled.value = false
      anthropicChatEnabled.value = false
      deepSeekChatEnabled.value = false
      persistOpenRouterChatStorage()
      persistLMStudioChatStorage()
      persistOllamaChatStorage()
      persistLocalEndpointChatStorage()
      persistGoogleAIStudioChatStorage()
      persistAnthropicChatStorage()
      persistDeepSeekChatStorage()
    }
    persistOpenAIResponsesChatStorage()
  }

  function onClearOpenAIResponsesChat() {
    if (input.isDraftInteractionLocked.value || input.isRunning.value) return
    openAIResponsesChatEnabled.value = false
    try {
      globalThis.localStorage?.removeItem(OPENAI_RESPONSES_CHAT_ENABLED_KEY)
    } catch {
      // Non-fatal: in-memory state still leaves the runtime selection unset unless another provider is selected.
    }
  }

  function onUpdateGoogleAIStudioChatEnabled(enabled: boolean) {
    if (input.isDraftInteractionLocked.value || input.isRunning.value) return
    googleAIStudioChatEnabled.value = enabled
    if (enabled) {
      openRouterChatEnabled.value = false
      lmStudioChatEnabled.value = false
      ollamaChatEnabled.value = false
      localEndpointChatEnabled.value = false
      openAIResponsesChatEnabled.value = false
      anthropicChatEnabled.value = false
      deepSeekChatEnabled.value = false
      persistOpenRouterChatStorage()
      persistLMStudioChatStorage()
      persistOllamaChatStorage()
      persistLocalEndpointChatStorage()
      persistOpenAIResponsesChatStorage()
      persistAnthropicChatStorage()
      persistDeepSeekChatStorage()
    }
    persistGoogleAIStudioChatStorage()
  }

  function onClearGoogleAIStudioChat() {
    if (input.isDraftInteractionLocked.value || input.isRunning.value) return
    googleAIStudioChatEnabled.value = false
    try {
      globalThis.localStorage?.removeItem(GOOGLE_AI_STUDIO_CHAT_ENABLED_KEY)
    } catch {
      // Non-fatal: in-memory state still leaves the runtime selection unset unless another provider is selected.
    }
  }

  function onUpdateAnthropicChatEnabled(enabled: boolean) {
    if (input.isDraftInteractionLocked.value || input.isRunning.value) return
    anthropicChatEnabled.value = enabled
    if (enabled) {
      openRouterChatEnabled.value = false
      lmStudioChatEnabled.value = false
      ollamaChatEnabled.value = false
      localEndpointChatEnabled.value = false
      openAIResponsesChatEnabled.value = false
      googleAIStudioChatEnabled.value = false
      deepSeekChatEnabled.value = false
      persistOpenRouterChatStorage()
      persistLMStudioChatStorage()
      persistOllamaChatStorage()
      persistLocalEndpointChatStorage()
      persistOpenAIResponsesChatStorage()
      persistGoogleAIStudioChatStorage()
      persistDeepSeekChatStorage()
    }
    persistAnthropicChatStorage()
  }

  function onUpdateAnthropicThinkingDisplay(value: 'provider_default' | 'summarized' | 'omitted') {
    anthropicThinkingDisplay.value = value
    persistAnthropicChatStorage()
  }

  function applyAnthropicThinkingDisplayFromConversation(value: 'provider_default' | 'summarized' | 'omitted') {
    anthropicThinkingDisplay.value = value
  }

  function onClearAnthropicChat() {
    if (input.isDraftInteractionLocked.value || input.isRunning.value) return
    anthropicChatEnabled.value = false
    anthropicThinkingDisplay.value = 'summarized'
    try {
      globalThis.localStorage?.removeItem(ANTHROPIC_CHAT_ENABLED_KEY)
      globalThis.localStorage?.removeItem(ANTHROPIC_THINKING_DISPLAY_KEY)
    } catch {
      // Non-fatal: in-memory state still leaves the runtime selection unset unless another provider is selected.
    }
  }

  function onUpdateDeepSeekChatEnabled(enabled: boolean) {
    if (input.isDraftInteractionLocked.value || input.isRunning.value) return
    deepSeekChatEnabled.value = enabled
    if (enabled) {
      openRouterChatEnabled.value = false
      lmStudioChatEnabled.value = false
      ollamaChatEnabled.value = false
      localEndpointChatEnabled.value = false
      openAIResponsesChatEnabled.value = false
      googleAIStudioChatEnabled.value = false
      anthropicChatEnabled.value = false
      persistOpenRouterChatStorage()
      persistLMStudioChatStorage()
      persistOllamaChatStorage()
      persistLocalEndpointChatStorage()
      persistOpenAIResponsesChatStorage()
      persistGoogleAIStudioChatStorage()
      persistAnthropicChatStorage()
    }
    persistDeepSeekChatStorage()
  }

  function onClearDeepSeekChat() {
    if (input.isDraftInteractionLocked.value || input.isRunning.value) return
    deepSeekChatEnabled.value = false
    try {
      globalThis.localStorage?.removeItem(DEEPSEEK_CHAT_ENABLED_KEY)
    } catch {
      // Non-fatal: in-memory state still leaves the runtime selection unset unless another provider is selected.
    }
  }

  return {
    lmStudioProviderConfig,
    ollamaProviderConfig,
    openRouterChatConfig,
    lmStudioChatConfig,
    ollamaChatConfig,
    localEndpointChatConfig,
    openAIResponsesChatConfig,
    googleAIStudioChatConfig,
    anthropicChatConfig,
    deepSeekChatConfig,
    localEndpointChatUrl,
    readExperimentalProviderChatStorage,
    addExperimentalProviderChatEventListeners,
    removeExperimentalProviderChatEventListeners,
    onUpdateOpenRouterChatEnabled,
    onUpdateLMStudioChatEnabled,
    onUpdateLMStudioEndpointUrl,
    onUpdateLMStudioChatMode,
    onUpdateLMStudioOpenAICompatiblePreferredEndpoint,
    onUpdateLMStudioNativeRestControl,
    onClearLMStudioChat,
    onUpdateOllamaChatEnabled,
    onUpdateOllamaEndpointUrl,
    onUpdateOllamaChatMode,
    onUpdateOllamaNativeRestPreferredEndpoint,
    onUpdateOllamaOpenAICompatiblePreferredEndpoint,
    onUpdateOllamaProfileCapability,
    onUpdateOllamaNativeControl,
    onClearOllamaChat,
    onUpdateLocalEndpointChatEnabled,
    onUpdateLocalEndpointChatUrl,
    onClearLocalEndpointChat,
    onUpdateOpenAIResponsesChatEnabled,
    onClearOpenAIResponsesChat,
    onUpdateGoogleAIStudioChatEnabled,
    onClearGoogleAIStudioChat,
    onUpdateAnthropicChatEnabled,
    onUpdateAnthropicThinkingDisplay,
    applyAnthropicThinkingDisplayFromConversation,
    onClearAnthropicChat,
    onUpdateDeepSeekChatEnabled,
    onClearDeepSeekChat,
  }
}
