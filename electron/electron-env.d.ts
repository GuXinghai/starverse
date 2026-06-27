/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}

type ProviderCredentialStatusSource =
  | 'secure_store'
  | 'plaintext_fallback'
  | 'missing'
type ProviderCredentialBackendKind = 'electron_safe_storage' | 'plaintext_fallback' | 'unavailable'
type OpenRouterCredentialSource = ProviderCredentialStatusSource

type OpenRouterEndpointCredentialRef = Readonly<{ kind: 'credential_ref'; id: 'openrouter-chat-legacy-store' }>
type OpenRouterCatalogCredentialRef = Readonly<{ kind: 'credential_ref'; id: 'openrouter-catalog-legacy-store' }>

interface OpenRouterEndpointMetadataBase {
  kind: 'openrouter_endpoint'
  providerId: 'openrouter'
  profileId: 'openrouter_v1_chat'
  source: OpenRouterCredentialSource
  defaultBaseUrl: string
  credentialRef: OpenRouterEndpointCredentialRef
  catalogCredentialRef: OpenRouterCatalogCredentialRef
  rendererVisible: true
}

type OpenRouterEndpointMetadata =
  | Readonly<OpenRouterEndpointMetadataBase & {
    endpointId: 'openrouter-official'
    endpointStatus: 'official'
    displayName: 'OpenRouter official endpoint'
    baseUrlConfigured: false
    baseUrlInvalid?: false
    displayBaseUrl: 'https://openrouter.ai/api/v1'
  }>
  | Readonly<OpenRouterEndpointMetadataBase & {
    endpointId: 'openrouter-custom-legacy-store'
    endpointStatus: 'custom'
    displayName: 'OpenRouter custom endpoint'
    baseUrlConfigured: true
    baseUrlInvalid?: false
    displayBaseUrl: string
  }>
  | Readonly<OpenRouterEndpointMetadataBase & {
    endpointId: 'openrouter-custom-legacy-store'
    endpointStatus: 'invalid_custom'
    displayName: 'OpenRouter custom endpoint'
    baseUrlConfigured: true
    baseUrlInvalid: true
    displayBaseUrl?: never
  }>

interface OpenRouterCredentialStatus {
  source: OpenRouterCredentialSource
  backend: ProviderCredentialBackendKind
  apiKeyConfigured: boolean
  maskedApiKey?: '***'
  migratedFromLegacy?: boolean
  warnings: string[]
  baseUrlConfigured: boolean
  baseUrlInvalid?: boolean
  displayBaseUrl?: string
  defaultBaseUrl: string
  endpoint: OpenRouterEndpointMetadata
}

interface OpenRouterCredentialUpdatePayload {
  apiKey?: string
  baseUrl?: string | null
}

type OpenRouterCredentialResult =
  | { ok: true; status: OpenRouterCredentialStatus }
  | { ok: false; code: 'invalid_payload' | 'store_unavailable'; message: string }

interface OpenAIResponsesCredentialStatus {
  source: ProviderCredentialStatusSource
  backend: ProviderCredentialBackendKind
  providerId: 'openai'
  profileId: 'openai_responses_v1'
  apiKeyConfigured: boolean
  maskedApiKey?: '***'
  migratedFromLegacy?: boolean
  warnings: string[]
  defaultBaseUrl: 'https://api.openai.com/v1'
  rendererVisible: true
}

interface OpenAIResponsesCredentialUpdatePayload {
  apiKey?: string
}

type OpenAIResponsesCredentialResult =
  | { ok: true; status: OpenAIResponsesCredentialStatus }
  | { ok: false; code: 'invalid_payload' | 'store_unavailable'; message: string }

type ProviderModelAvailabilityCommonSourceKind =
  | 'provider_api'
  | 'provider_docs'
  | 'starverse_curated_metadata'
  | 'manual_user_model_id'
  | 'local_probe'

interface ProviderModelAvailabilityProvenance {
  sourceKind: ProviderModelAvailabilityCommonSourceKind
  sourceLabel: string
  observedAtMs: number
  metadataVersion?: string
  parserVersion: number
}

type OpenAIModelSourceKind =
  | 'openai_models_api'
  | 'starverse_curated_metadata'
  | 'manual_user_model_id'

interface OpenAIProviderModelAvailability {
  providerKey: 'openai_responses'
  endpointId: 'openai-responses-official'
  profileId: 'openai_responses_v1'
  nativeModelId: string
  displayName?: string
  ownedBy?: string
  createdAtSec?: number
  source: OpenAIModelSourceKind
  confidence: 'provider_reported' | 'curated' | 'manual'
  observedAtMs: number
  warnings: string[]
  provenance?: ProviderModelAvailabilityProvenance
  providerSpecific?: unknown
  capabilitySeed?: {
    textChat?: boolean
    responsesApi?: boolean
    reasoning?: 'supported' | 'unsupported' | 'unknown'
    reasoningEffort?: Array<'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'>
    imageInput?: boolean | 'unknown'
    fileInput?: boolean | 'unknown'
    functionCalling?: boolean | 'unknown'
    hostedTools?: boolean | 'unknown'
    structuredOutput?: boolean | 'unknown'
    audioInput?: boolean | 'unknown'
  }
}

type OpenAIModelAvailabilityResult =
  | {
    ok: true
    providerKey: 'openai_responses'
    endpointId: 'openai-responses-official'
    profileId: 'openai_responses_v1'
    observedAtMs: number
    models: OpenAIProviderModelAvailability[]
    warnings: string[]
    sourceDocuments: Array<{
      source: 'openai_list_models_api_docs' | 'openai_responses_create_docs'
      url: string
      observedAtMs: number
    }>
  }
  | {
    ok: false
    providerKey: 'openai_responses'
    endpointId: 'openai-responses-official'
    profileId: 'openai_responses_v1'
    observedAtMs: number
    code: 'credential_missing' | 'store_unavailable' | 'invalid_payload' | 'invalid_response' | 'http_error' | 'network_error'
    message: string
    httpStatus?: number
  }

interface GoogleAIStudioCredentialStatus {
  source: ProviderCredentialStatusSource
  backend: ProviderCredentialBackendKind
  providerId: 'google-ai-studio'
  profileId: 'gemini_api_v1'
  apiKeyConfigured: boolean
  maskedApiKey?: '***'
  migratedFromLegacy?: boolean
  warnings: string[]
  defaultBaseUrl: 'https://generativelanguage.googleapis.com'
  rendererVisible: true
}

interface GoogleAIStudioCredentialUpdatePayload {
  apiKey?: string
}

type GoogleAIStudioCredentialResult =
  | { ok: true; status: GoogleAIStudioCredentialStatus }
  | { ok: false; code: 'invalid_payload' | 'store_unavailable'; message: string }

interface AnthropicCredentialStatus {
  source: ProviderCredentialStatusSource
  backend: ProviderCredentialBackendKind
  providerId: 'anthropic'
  profileId: 'anthropic_messages_v1'
  apiKeyConfigured: boolean
  maskedApiKey?: '***'
  migratedFromLegacy?: boolean
  warnings: string[]
  defaultBaseUrl: 'https://api.anthropic.com/v1'
  rendererVisible: true
}

interface AnthropicCredentialUpdatePayload {
  apiKey?: string
}

type AnthropicCredentialResult =
  | { ok: true; status: AnthropicCredentialStatus }
  | { ok: false; code: 'invalid_payload' | 'store_unavailable'; message: string }

type AnthropicModelSourceKind =
  | 'anthropic_models_api'
  | 'starverse_curated_metadata'
  | 'manual_user_model_id'

interface AnthropicProviderModelAvailability {
  providerKey: 'anthropic_messages'
  endpointId: 'anthropic-official'
  profileId: 'anthropic_messages_v1'
  nativeModelId: string
  displayName?: string
  createdAt?: string
  modelType?: string
  source: AnthropicModelSourceKind
  confidence: 'provider_reported' | 'curated' | 'manual'
  observedAtMs: number
  warnings: string[]
  provenance?: ProviderModelAvailabilityProvenance
  providerSpecific?: unknown
  capabilitySeed?: {
    textChat?: boolean
    imageInput?: boolean | 'unknown'
    maxInputTokens?: number
    maxOutputTokens?: number
    thinking?: 'supported' | 'unsupported' | 'unknown'
    adaptiveThinking?: boolean | 'unknown'
    toolUse?: boolean | 'unknown'
    files?: boolean | 'unknown'
    structuredOutput?: boolean | 'unknown'
    citations?: boolean | 'unknown'
    capabilitiesRawKeys?: string[]
  }
}

type AnthropicModelAvailabilityResult =
  | {
    ok: true
    providerKey: 'anthropic_messages'
    endpointId: 'anthropic-official'
    profileId: 'anthropic_messages_v1'
    observedAtMs: number
    models: AnthropicProviderModelAvailability[]
    warnings: string[]
    sourceDocuments: Array<{
      source: 'anthropic_list_models_api_docs' | 'anthropic_messages_api_docs' | 'anthropic_models_overview_docs'
      url: string
      observedAtMs: number
    }>
  }
  | {
    ok: false
    providerKey: 'anthropic_messages'
    endpointId: 'anthropic-official'
    profileId: 'anthropic_messages_v1'
    observedAtMs: number
    code: 'credential_missing' | 'store_unavailable' | 'invalid_payload' | 'invalid_response' | 'http_error' | 'network_error'
    message: string
    httpStatus?: number
  }

interface DeepSeekCredentialStatus {
  source: ProviderCredentialStatusSource
  backend: ProviderCredentialBackendKind
  providerId: 'deepseek'
  profileId: 'deepseek_official_openai_compat'
  apiKeyConfigured: boolean
  maskedApiKey?: '***'
  migratedFromLegacy?: boolean
  warnings: string[]
  defaultBaseUrl: 'https://api.deepseek.com/v1'
  rendererVisible: true
}

interface DeepSeekCredentialUpdatePayload {
  apiKey?: string
}

type DeepSeekCredentialResult =
  | { ok: true; status: DeepSeekCredentialStatus }
  | { ok: false; code: 'invalid_payload' | 'store_unavailable'; message: string }

type DeepSeekProviderModelSourceKind =
  | 'deepseek_models_api'
  | 'deepseek_pricing_metadata'
  | 'starverse_curated_metadata'
  | 'manual_user_model_id'

interface DeepSeekProviderModelAvailability {
  providerKey: 'deepseek'
  endpointId: 'deepseek-official'
  profileId: 'deepseek_official_openai_compat'
  nativeModelId: string
  displayName?: string
  ownedBy?: string
  source: DeepSeekProviderModelSourceKind
  confidence: 'provider_reported' | 'curated' | 'manual'
  observedAtMs: number
  warnings: string[]
  provenance?: ProviderModelAvailabilityProvenance
  providerSpecific?: unknown
  capabilitySeed?: {
    textChat?: boolean
    thinkingMode?: 'supported' | 'non_thinking_only' | 'thinking_only' | 'unknown'
    contextLength?: number
    maxOutputTokens?: number
    tools?: boolean
    jsonOutput?: boolean
    fim?: boolean
    chatPrefixCompletion?: boolean
  }
  pricingSeed?: {
    inputCacheHitPer1MTokens?: string
    inputCacheMissPer1MTokens?: string
    outputPer1MTokens?: string
    currency?: 'USD'
    source: 'deepseek_pricing_metadata'
    observedAtMs: number
  }
}

type DeepSeekModelAvailabilityResult =
  | {
    ok: true
    providerKey: 'deepseek'
    endpointId: 'deepseek-official'
    profileId: 'deepseek_official_openai_compat'
    observedAtMs: number
    models: DeepSeekProviderModelAvailability[]
    warnings: string[]
    sourceDocuments: Array<{
      source: 'deepseek_list_models_api_docs' | 'deepseek_models_pricing_docs' | 'deepseek_api_intro_docs'
      url: string
      observedAtMs: number
    }>
  }
  | {
    ok: false
    providerKey: 'deepseek'
    endpointId: 'deepseek-official'
    profileId: 'deepseek_official_openai_compat'
    observedAtMs: number
    code: 'credential_missing' | 'store_unavailable' | 'invalid_payload' | 'invalid_response' | 'http_error' | 'network_error'
    message: string
    httpStatus?: number
  }

type GeminiModelSourceKind =
  | 'gemini_models_api'
  | 'starverse_curated_metadata'
  | 'manual_user_model_id'

interface GeminiProviderModelAvailability {
  providerKey: 'google_ai_studio'
  endpointId: 'google-ai-studio-official'
  profileId: 'gemini_api_v1'
  nativeModelId: string
  providerModelName?: string
  displayName?: string
  description?: string
  source: GeminiModelSourceKind
  confidence: 'provider_reported' | 'curated' | 'manual'
  observedAtMs: number
  warnings: string[]
  provenance?: ProviderModelAvailabilityProvenance
  providerSpecific?: unknown
  capabilitySeed?: {
    textChat?: boolean
    supportedGenerationMethods?: string[]
    inputTokenLimit?: number
    outputTokenLimit?: number
    thinking?: 'supported' | 'unknown'
    functionCalling?: boolean | 'unknown'
    builtInTools?: boolean | 'unknown'
    vision?: boolean | 'unknown'
    structuredOutput?: boolean | 'unknown'
  }
}

type GeminiModelAvailabilityResult =
  | {
    ok: true
    providerKey: 'google_ai_studio'
    endpointId: 'google-ai-studio-official'
    profileId: 'gemini_api_v1'
    observedAtMs: number
    models: GeminiProviderModelAvailability[]
    warnings: string[]
    sourceDocuments: Array<{
      source: 'gemini_models_api_docs' | 'gemini_api_key_docs'
      url: string
      observedAtMs: number
    }>
  }
  | {
    ok: false
    providerKey: 'google_ai_studio'
    endpointId: 'google-ai-studio-official'
    profileId: 'gemini_api_v1'
    observedAtMs: number
    code: 'credential_missing' | 'store_unavailable' | 'invalid_payload' | 'invalid_response' | 'http_error' | 'network_error'
    message: string
    httpStatus?: number
  }

type LocalEndpointProbeModelList =
  | {
    ok: true
    source: 'openai_v1_models' | 'ollama_api_tags'
    models: string[]
    truncated: boolean
  }
  | {
    ok: false
    code: 'unavailable' | 'invalid_response' | 'timeout' | 'network_error'
    message: string
  }

interface LocalEndpointProbeDiagnostics {
  kind: 'local_endpoint_diagnostics'
  status: 'reachable' | 'unreachable'
  endpointFamily: 'openai_compatible' | 'ollama' | 'unknown'
  safeBaseUrl: string
  modelList: LocalEndpointProbeModelList
  capabilitySummary: {
    chatSendAvailable: false
    textChat: 'diagnostics_only'
    streaming: 'not_probed'
    tools: false
    files: false
    reasoning: false
    webSearch: false
  }
  message: string
}

type LocalEndpointProbeResult =
  | { ok: true; diagnostics: LocalEndpointProbeDiagnostics }
  | {
    ok: false
    code: 'invalid_url' | 'remote_host_rejected' | 'embedded_credentials_rejected' | 'timeout' | 'network_error' | 'invalid_response'
    message: string
    safeUrl?: string
  }

interface LocalEndpointStreamProbeDiagnostics {
  kind: 'local_endpoint_stream_diagnostics'
  status: 'supported' | 'failed'
  endpointFamily: 'openai_compatible' | 'ollama' | 'unknown'
  safeBaseUrl: string
  textDeltaPreview?: string
  evidence: 'text_delta_observed' | 'no_text_delta' | 'model_unavailable'
  capabilitySummary: {
    chatSendAvailable: false
    streaming: 'diagnostics_only_supported' | 'diagnostics_only_failed'
    tools: false
    files: false
    reasoning: false
    webSearch: false
  }
  message: string
}

type LocalEndpointStreamProbeResult =
  | { ok: true; diagnostics: LocalEndpointStreamProbeDiagnostics }
  | {
    ok: false
    code: 'invalid_url' | 'remote_host_rejected' | 'embedded_credentials_rejected' | 'timeout' | 'network_error' | 'invalid_response'
    message: string
    safeUrl?: string
  }

type LMStudioChatMode = 'openai_compatible' | 'native_rest'
type LMStudioPreferredEndpoint = 'chat_completions' | 'responses'

interface LMStudioNativeRestControls {
  diagnosticsEnabled: boolean
  manualLoadUnloadEnabled: boolean
  autoLoadBeforeSendEnabled: boolean
  autoUnloadAfterSendEnabled: boolean
  autoUnloadAfterIdleEnabled?: boolean
}

interface LMStudioLocalProviderConfig {
  providerKey: 'lm_studio'
  endpointUrl: string
  nativeRestControls: LMStudioNativeRestControls
  chatMode: LMStudioChatMode
  openAICompatible: {
    basePath: '/v1'
    preferredEndpoint: LMStudioPreferredEndpoint
  }
  nativeRest: {
    basePath: '/api/v1'
  }
}

interface LMStudioModelSummary {
  key: string
  displayName: string
  type: 'llm' | 'embedding' | 'unknown'
  loaded: boolean
  loadedInstances: string[]
  publisher?: string
  architecture?: string
  quantization?: string
  sizeBytes?: number
  paramsString?: string
  maxContextLength?: number
  format?: string
}

type LMStudioModelList =
  | {
    ok: true
    source: 'lm_studio_api_v1_models' | 'lm_studio_openai_v1_models'
    models: LMStudioModelSummary[]
    modelIds: string[]
    loadedCount: number
    unloadedCount: number
  }
  | {
    ok: false
    code: 'unavailable' | 'http_error' | 'invalid_response' | 'timeout' | 'network_error'
    message: string
  }

interface LMStudioProbeDiagnostics {
  kind: 'lm_studio_local_provider_diagnostics'
  providerKey: 'lm_studio'
  safeBaseUrl: string
  nativeRestAvailable: boolean
  openAICompatibleAvailable: boolean
  nativeRest: LMStudioModelList
  openAICompatible: LMStudioModelList
  selectedModelLoaded?: boolean
  selectedModelLoadedInstances?: string[]
  warnings: string[]
  message: string
}

type LMStudioProbeResult =
  | { ok: true; diagnostics: LMStudioProbeDiagnostics }
  | {
    ok: false
    code: 'invalid_url' | 'remote_host_rejected' | 'embedded_credentials_rejected'
    message: string
    safeUrl?: string
  }

type LMStudioControlResult =
  | {
    ok: true
    operation: 'load' | 'unload'
    model?: string
    instanceId: string
    status?: 'loaded'
    type?: 'llm' | 'embedding' | 'unknown'
    loadTimeSeconds?: number
    warnings: string[]
  }
  | {
    ok: false
    code:
      | 'invalid_payload'
      | 'invalid_url'
      | 'remote_host_rejected'
      | 'embedded_credentials_rejected'
      | 'controls_disabled'
      | 'timeout'
      | 'network_error'
      | 'http_error'
      | 'invalid_response'
    message: string
    safeUrl?: string
  }

type LocalEndpointTextChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

type LocalEndpointTextChatStartResult =
  | { ok: true }
  | {
    ok: false
    code: 'invalid_payload' | 'invalid_url' | 'remote_host_rejected' | 'embedded_credentials_rejected'
    error: string
    safeUrl?: string
  }

type LMStudioTextChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

type LMStudioTextChatStartResult =
  | { ok: true }
  | {
    ok: false
    code: 'invalid_payload' | 'invalid_url' | 'remote_host_rejected' | 'embedded_credentials_rejected'
    error: string
    safeUrl?: string
  }

type OpenAIResponsesTextChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

type OpenAIResponsesTextChatStartResult =
  | { ok: true }
  | {
    ok: false
    code: 'invalid_payload' | 'credential_missing' | 'store_unavailable'
    error: string
  }

type GoogleAIStudioTextChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

type GoogleAIStudioTextChatStartResult =
  | { ok: true }
  | {
    ok: false
    code: 'invalid_payload' | 'credential_missing' | 'store_unavailable'
    error: string
  }

type AnthropicTextChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

type AnthropicTextChatStartResult =
  | { ok: true }
  | {
    ok: false
    code: 'invalid_payload' | 'credential_missing' | 'store_unavailable'
    error: string
  }

type DeepSeekTextChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

type DeepSeekTextChatStartResult =
  | { ok: true }
  | {
    ok: false
    code: 'invalid_payload' | 'credential_missing' | 'store_unavailable'
    error: string
  }

// Used in Renderer process, expose in `preload.ts`
interface Window {
  openRouterCredential?: {
    getStatus?: () => Promise<OpenRouterCredentialResult>
    update?: (payload: OpenRouterCredentialUpdatePayload) => Promise<OpenRouterCredentialResult>
    clear?: () => Promise<OpenRouterCredentialResult>
  }
  openAIResponsesCredential?: {
    getStatus?: () => Promise<OpenAIResponsesCredentialResult>
    update?: (payload: OpenAIResponsesCredentialUpdatePayload) => Promise<OpenAIResponsesCredentialResult>
    clear?: () => Promise<OpenAIResponsesCredentialResult>
  }
  openAIResponsesModels?: {
    listAvailability?: (payload?: { timeoutMs?: number }) => Promise<OpenAIModelAvailabilityResult>
  }
  googleAIStudioCredential?: {
    getStatus?: () => Promise<GoogleAIStudioCredentialResult>
    update?: (payload: GoogleAIStudioCredentialUpdatePayload) => Promise<GoogleAIStudioCredentialResult>
    clear?: () => Promise<GoogleAIStudioCredentialResult>
  }
  anthropicCredential?: {
    getStatus?: () => Promise<AnthropicCredentialResult>
    update?: (payload: AnthropicCredentialUpdatePayload) => Promise<AnthropicCredentialResult>
    clear?: () => Promise<AnthropicCredentialResult>
  }
  anthropicModels?: {
    listAvailability?: (payload?: { timeoutMs?: number }) => Promise<AnthropicModelAvailabilityResult>
  }
  deepSeekCredential?: {
    getStatus?: () => Promise<DeepSeekCredentialResult>
    update?: (payload: DeepSeekCredentialUpdatePayload) => Promise<DeepSeekCredentialResult>
    clear?: () => Promise<DeepSeekCredentialResult>
  }
  deepSeekModels?: {
    listAvailability?: (payload?: { timeoutMs?: number }) => Promise<DeepSeekModelAvailabilityResult>
  }
  googleAIStudioModels?: {
    listAvailability?: (payload?: { timeoutMs?: number }) => Promise<GeminiModelAvailabilityResult>
  }
  localEndpointDiagnostics?: {
    probe?: (payload: { url?: string; timeoutMs?: number }) => Promise<LocalEndpointProbeResult>
    streamProbe?: (payload: { url?: string; timeoutMs?: number }) => Promise<LocalEndpointStreamProbeResult>
  }
  localEndpointChat?: {
    startTextChat?: (payload: {
      requestId: string
      url: string
      model: string
      messages: LocalEndpointTextChatMessage[]
      timeoutMs?: number
    }) => Promise<LocalEndpointTextChatStartResult>
    abortTextChat?: (requestId: string) => Promise<{ ok: true }>
    onTextChatChunk?: (requestId: string, callback: (payload: unknown) => void) => () => void
    onTextChatEnd?: (requestId: string, callback: () => void) => () => void
  }
  lmStudioProvider?: {
    probe?: (payload: { endpointUrl?: string; selectedModel?: string; timeoutMs?: number }) => Promise<LMStudioProbeResult>
    loadModel?: (payload: {
      endpointUrl: string
      model: string
      manualLoadUnloadEnabled?: boolean
      timeoutMs?: number
    }) => Promise<LMStudioControlResult>
    unloadModel?: (payload: {
      endpointUrl: string
      instanceId: string
      manualLoadUnloadEnabled?: boolean
      timeoutMs?: number
    }) => Promise<LMStudioControlResult>
  }
  lmStudioChat?: {
    startTextChat?: (payload: {
      requestId: string
      assistantMessageId: string
      config: LMStudioLocalProviderConfig
      model: string
      messages: LMStudioTextChatMessage[]
      timeoutMs?: number
    }) => Promise<LMStudioTextChatStartResult>
    abortTextChat?: (requestId: string) => Promise<{ ok: true }>
    onTextChatChunk?: (requestId: string, callback: (payload: unknown) => void) => () => void
    onTextChatEnd?: (requestId: string, callback: () => void) => () => void
  }
  openAIResponsesChat?: {
    startTextChat?: (payload: {
      requestId: string
      assistantMessageId: string
      model: string
      messages: OpenAIResponsesTextChatMessage[]
      timeoutMs?: number
    }) => Promise<OpenAIResponsesTextChatStartResult>
    abortTextChat?: (requestId: string) => Promise<{ ok: true }>
    onTextChatChunk?: (requestId: string, callback: (payload: unknown) => void) => () => void
    onTextChatEnd?: (requestId: string, callback: () => void) => () => void
  }
  googleAIStudioChat?: {
    startTextChat?: (payload: {
      requestId: string
      assistantMessageId: string
      model: string
      messages: GoogleAIStudioTextChatMessage[]
      timeoutMs?: number
    }) => Promise<GoogleAIStudioTextChatStartResult>
    abortTextChat?: (requestId: string) => Promise<{ ok: true }>
    onTextChatChunk?: (requestId: string, callback: (payload: unknown) => void) => () => void
    onTextChatEnd?: (requestId: string, callback: () => void) => () => void
  }
  anthropicChat?: {
    startTextChat?: (payload: {
      requestId: string
      assistantMessageId: string
      model: string
      messages: AnthropicTextChatMessage[]
      timeoutMs?: number
    }) => Promise<AnthropicTextChatStartResult>
    abortTextChat?: (requestId: string) => Promise<{ ok: true }>
    onTextChatChunk?: (requestId: string, callback: (payload: unknown) => void) => () => void
    onTextChatEnd?: (requestId: string, callback: () => void) => () => void
  }
  deepSeekChat?: {
    startTextChat?: (payload: {
      requestId: string
      assistantMessageId: string
      model: string
      messages: DeepSeekTextChatMessage[]
      timeoutMs?: number
    }) => Promise<DeepSeekTextChatStartResult>
    abortTextChat?: (requestId: string) => Promise<{ ok: true }>
    onTextChatChunk?: (requestId: string, callback: (payload: unknown) => void) => () => void
    onTextChatEnd?: (requestId: string, callback: () => void) => () => void
  }
  electronAPI?: {
    getNetExpRuntimeInfo?: () => Promise<unknown>
    onModelCatalogSynced?: (callback: () => void) => () => void
    modelCatalogSyncNow?: (options?: { providerKey?: string; force?: boolean; reason?: string }) => Promise<unknown>
    modelCatalogGetSyncStatus?: (options?: { providerKey?: string }) => Promise<unknown>
    modelCatalogQueryScopedCurrent?: (options?: unknown) => Promise<unknown>
    modelCatalogRepairCurrentScopedCache?: () => Promise<unknown>
    modelCatalogClearCurrentScopedCache?: () => Promise<unknown>
    modelCatalogClearAllOpenRouterScopedCaches?: () => Promise<unknown>
    importLibreOfficeSvpkg?: () => Promise<unknown>
    quarantineLibreOfficeRuntime?: () => Promise<unknown>
    probeLibreOfficeSystemProxyDownloadNetwork?: () => Promise<unknown>
    startOpenRouterStream?: (payload: unknown) => Promise<unknown>
    abortOpenRouterStream?: (requestId: string) => Promise<unknown>
    onOpenRouterChunk?: (requestId: string, callback: (payload: unknown) => void) => () => void
    onOpenRouterEnd?: (requestId: string, callback: () => void) => () => void
  }
}
