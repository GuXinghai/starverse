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
  | 'missing'
type ProviderCredentialBackendKind = 'electron_safe_storage' | 'unavailable'
type OpenRouterCredentialSource = ProviderCredentialStatusSource

type OpenRouterEndpointCredentialRef = Readonly<{ kind: 'credential_ref'; id: 'openrouter-first-party-v1' }>
type OpenRouterCatalogCredentialRef = Readonly<{ kind: 'credential_ref'; id: 'openrouter-first-party-v1' }>

interface OpenRouterEndpointMetadataBase {
  kind: 'openrouter_endpoint'
  providerId: 'openrouter'
  profileId: 'openrouter-first-party-v1'
  source: OpenRouterCredentialSource
  defaultBaseUrl: string
  credentialRef: OpenRouterEndpointCredentialRef
  catalogCredentialRef: OpenRouterCatalogCredentialRef
  rendererVisible: true
}

type OpenRouterEndpointMetadata = Readonly<OpenRouterEndpointMetadataBase & {
    endpointId: 'openrouter-official'
    endpointStatus: 'official'
    displayName: 'OpenRouter official endpoint'
    baseUrlConfigured: false
    displayBaseUrl: 'https://openrouter.ai/api/v1'
  }>

interface OpenRouterCredentialStatus {
  source: OpenRouterCredentialSource
  backend: ProviderCredentialBackendKind
  apiKeyConfigured: boolean
  maskedApiKey?: '***'
  migratedFromLegacy?: boolean
  warnings: string[]
  baseUrlConfigured: false
  displayBaseUrl: 'https://openrouter.ai/api/v1'
  defaultBaseUrl: 'https://openrouter.ai/api/v1'
  endpoint: OpenRouterEndpointMetadata
}

interface OpenRouterCredentialUpdatePayload {
  apiKey?: string
}

type OpenRouterCredentialResult =
  | { ok: true; status: OpenRouterCredentialStatus }
  | { ok: false; code: 'invalid_payload' | 'store_unavailable'; message: string }

type ProviderCredentialRevealResult =
  | { ok: true; apiKey: string }
  | { ok: false; code: 'credential_missing' | 'store_unavailable'; message: string }

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

type NetworkProxyProductMode = 'environment' | 'manual' | 'direct' | 'system'
type NetworkProxyProductErrorCode =
  | 'proxy_settings_invalid'
  | 'proxy_environment_unavailable'
  | 'proxy_environment_invalid'
  | 'proxy_manual_invalid'
  | 'proxy_auth_required'
  | 'proxy_bypass_invalid'
  | 'proxy_strict_ssl_unsupported'
  | 'proxy_session_apply_failed'
  | 'proxy_store_unavailable'
  | 'proxy_store_rollback_failed'

interface NetworkProxyProductSettings {
  proxyMode: NetworkProxyProductMode
  manualProxyUrl: string
  noProxy: string
  strictSSL: boolean
}

interface NetworkProxyProductState {
  status: 'uninitialized' | 'ready' | 'blocked'
  settings: NetworkProxyProductSettings
  errorCode: NetworkProxyProductErrorCode | null
  appliedAtMs: number | null
}

type NetworkProxyProductResult =
  | { ok: true; settings: NetworkProxyProductSettings; state: NetworkProxyProductState }
  | { ok: false; code: NetworkProxyProductErrorCode; message: string; settings: NetworkProxyProductSettings; state: NetworkProxyProductState }

type NetworkProxyResolveResult =
  | {
    ok: true
    resolvedProxy: string
    proxyKind: 'DIRECT' | 'PROXY configured' | 'unknown/error'
  }
  | {
    ok: false
    code: 'invalid_url' | NetworkProxyProductErrorCode
    message: string
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

type OllamaChatMode = 'native_rest' | 'openai_compatible'
type OllamaNativePreferredEndpoint = 'chat' | 'generate'
type OllamaPreferredEndpoint = 'chat_completions' | 'responses'

interface OllamaNativeControls {
  diagnosticsEnabled: boolean
  manualLoadUnloadEnabled: boolean
  autoLoadBeforeSendEnabled: boolean
  autoUnloadAfterSendEnabled: boolean
  autoUnloadAfterIdleEnabled?: boolean
}

interface OllamaLocalProviderConfig {
  providerKey: 'ollama_local'
  endpointUrl: string
  nativeControls: OllamaNativeControls
  chatMode: OllamaChatMode
  nativeRest: {
    basePath: '/api'
    preferredEndpoint: OllamaNativePreferredEndpoint
  }
  openAICompatible: {
    basePath: '/v1'
    preferredEndpoint: OllamaPreferredEndpoint
  }
}

interface OllamaModelSummary {
  key: string
  displayName: string
  running: boolean
  digest?: string
  sizeBytes?: number
  sizeVramBytes?: number
  expiresAt?: string
}

type OllamaModelList =
  | {
    ok: true
    source: 'ollama_api_tags' | 'ollama_api_ps' | 'ollama_openai_v1_models'
    models: OllamaModelSummary[]
    modelIds: string[]
    count: number
  }
  | {
    ok: false
    code: 'unavailable' | 'http_error' | 'invalid_response' | 'timeout' | 'network_error'
    message: string
  }

type OllamaVersionProbe =
  | { ok: true; version: string }
  | {
    ok: false
    code: 'unavailable' | 'http_error' | 'invalid_response' | 'timeout' | 'network_error'
    message: string
  }

interface OllamaProbeDiagnostics {
  kind: 'ollama_local_provider_diagnostics'
  providerKey: 'ollama_local'
  safeBaseUrl: string
  nativeRestAvailable: boolean
  openAICompatibleAvailable: boolean
  localModels: OllamaModelList
  runningModels: OllamaModelList
  version: OllamaVersionProbe
  openAICompatible: OllamaModelList
  selectedModelKnown?: boolean
  selectedModelRunning?: boolean
  warnings: string[]
  message: string
}

type OllamaProbeResult =
  | { ok: true; diagnostics: OllamaProbeDiagnostics }
  | {
    ok: false
    code: 'invalid_url' | 'remote_host_rejected' | 'embedded_credentials_rejected'
    message: string
    safeUrl?: string
  }

type OllamaControlResult =
  | {
    ok: true
    operation: 'load' | 'unload'
    model: string
    status: 'loaded' | 'unloaded'
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

type OpenAICompatibleImageContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

type LocalEndpointTextChatMessage = {
  role: 'user' | 'assistant'
  content: string | OpenAICompatibleImageContentPart[]
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
  content: string | OpenAICompatibleImageContentPart[]
}

type LMStudioTextChatStartResult =
  | { ok: true }
  | {
    ok: false
    code: 'invalid_payload' | 'invalid_url' | 'remote_host_rejected' | 'embedded_credentials_rejected'
    error: string
    safeUrl?: string
  }

type OllamaTextChatMessage = {
  role: 'user' | 'assistant'
  content: string | OpenAICompatibleImageContentPart[]
}

type OllamaTextChatStartResult =
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

type CompatibleProviderInstanceId = string
type CompatibleCredentialVersionRef = string

type CompatibleProviderRegistryError = Readonly<{
  code: 'invalid_configuration' | 'registry_unavailable' | 'credential_unavailable'
  message: string
}>

type CompatibleProviderRegistryResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: CompatibleProviderRegistryError }>

type CompatibleRegistryPublicValue = Readonly<{
  name: string
  value: string
  classification: 'public_non_secret'
}>

type CompatibleRegistryEndpointInput = Readonly<{
  baseUrl: string
  securityPolicy: 'compatibility_first' | 'strict_ssrf'
  ordinaryHeaders: readonly CompatibleRegistryPublicValue[]
  query: readonly CompatibleRegistryPublicValue[]
}>

type CompatibleRegistryCredentialInput =
  | Readonly<{ mode: 'none' }>
  | Readonly<{ mode: 'bearer'; token: string }>
  | Readonly<{ mode: 'basic'; username: string; password: string }>
  | Readonly<{ mode: 'custom_headers'; headers: readonly Readonly<{ name: string; value: string }>[] }>

type CompatibleRegistryRequestMappingInput = Readonly<{
  sourceField: 'reasoning_enabled' | 'reasoning_effort' | 'reasoning_budget'
  targetPath: readonly (string | number)[]
  valueKind: 'boolean' | 'number' | 'string'
  valueMapping: Readonly<Record<string, null | boolean | number | string>>
  omission: 'omit_when_unset' | 'required'
}>

type CompatibleRendererProviderInstance = Readonly<{
  providerInstanceId: CompatibleProviderInstanceId
  protocolKey: 'openai_chat_compatible'
  displayName: string
  status: 'active' | 'disabled' | 'deleted'
  createdAtMs: number
  updatedAtMs: number
  deletedAtMs: number | null
}>

type CompatibleRendererCredentialDescriptor = Readonly<{
  credentialVersionRef: CompatibleCredentialVersionRef
  providerInstanceId: CompatibleProviderInstanceId
  version: number
  authMode: 'none' | 'bearer' | 'basic' | 'custom_headers'
  configured: boolean
  maskState: 'not_applicable' | 'not_configured' | 'configured_masked'
  sensitiveHeaderNames: readonly string[]
  deletedAtMs: number | null
}>

type CompatibleRendererEndpointRevision = Readonly<{
  endpointRevisionId: string
  providerInstanceId: CompatibleProviderInstanceId
  revision: number
  baseUrl: string
  allowInsecureHttp: boolean
  securityPolicy: 'compatibility_first' | 'strict_ssrf'
  credentialVersionRef: CompatibleCredentialVersionRef | null
  ordinaryHeaders: readonly CompatibleRegistryPublicValue[]
  sensitiveHeaderRefs: readonly Readonly<{
    name: string
    credentialVersionRef: CompatibleCredentialVersionRef
  }>[]
  query: readonly CompatibleRegistryPublicValue[]
  requestProfileId: string
  requestProfileVersion: number
  responseProfileId: string
  responseProfileVersion: number
  createdAtMs: number
  authMode: 'none' | 'bearer' | 'basic' | 'custom_headers'
}>

type CompatibleProviderRegistryDetails = Readonly<{
  provider: CompatibleRendererProviderInstance
  endpointRevisions: readonly CompatibleRendererEndpointRevision[]
  credentials: readonly CompatibleRendererCredentialDescriptor[]
  activeConfiguration: Readonly<{
    endpointRevisionId: string
    requestBundle: unknown
    responseProfile: unknown
    reasoningMapping: unknown
    inlinePolicy: unknown
  }> | null
}>

type CompatibleDiscoveredResponseField = Readonly<{
  providerInstanceId: CompatibleProviderInstanceId
  responseProfileId: string
  profileVersion: number
  streamPath: string
  state: 'candidate' | 'ignored' | 'confirmed'
  aggregate: Readonly<{
    schemaVersion: 1
    observedShapes: readonly ('null' | 'boolean' | 'number' | 'string' | 'array' | 'object')[]
    redactedPreview: unknown
    sampleCount: number
  }>
  occurrenceCount: number
  firstObservedAtMs: number
  lastObservedAtMs: number
}>

type CompatibleNetworkErrorEnvelope = Readonly<{
  code:
    | 'compatible_config_invalid'
    | 'compatible_url_invalid'
    | 'compatible_address_blocked'
    | 'compatible_dns_rebinding_blocked'
    | 'compatible_strict_ssrf_unavailable'
    | 'compatible_redirect_blocked'
    | 'compatible_proxy_route_invalid'
    | 'compatible_transport_unavailable'
    | 'compatible_request_capacity'
    | 'compatible_credential_missing'
    | 'compatible_auth_invalid'
    | 'compatible_header_forbidden'
    | 'compatible_query_invalid'
    | 'compatible_extra_body_conflict'
    | 'compatible_request_mapping_invalid'
    | 'compatible_timeout'
    | 'compatible_aborted'
    | 'compatible_window_destroyed'
    | 'compatible_response_overflow'
    | 'compatible_sse_overflow'
    | 'compatible_json_malformed'
    | 'compatible_sse_malformed'
    | 'compatible_response_unsupported'
    | 'compatible_tool_delta_invalid'
    | 'compatible_reasoning_mapping_invalid'
    | 'compatible_inline_conflict'
    | 'compatible_extension_overflow'
    | 'compatible_network_proxy_tls'
    | 'compatible_http_auth'
    | 'compatible_http_rate_limit'
    | 'compatible_http_provider'
    | 'compatible_network_unknown'
    | 'compatible_catalog_sync_failed'
  stage: 'url' | 'dns' | 'connect' | 'redirect' | 'headers' | 'request' | 'response' | 'stream' | 'lifecycle'
  safeMessage: string
  retryable: boolean
  httpStatus?: number
}>

type CompatibleConnectionTestResult =
  | Readonly<{
      ok: true
      requestId: string
      httpStatus: number
      diagnostics: Readonly<{
        securityPolicy: 'compatibility_first' | 'strict_ssrf'
        proxyRoute: 'system' | 'manual' | 'environment' | 'direct'
        transportKind: 'electron_session_fetch' | 'node_undici'
        transportCapability: 'pre_request_audit_only' | 'validated_address_lease_v1'
        proxyBypassed: boolean
        redirectCount: number
        insecureHttp: boolean
      }>
    }>
  | Readonly<{ ok: false; requestId: string; error: CompatibleNetworkErrorEnvelope }>

type CompatibleCatalogManualMetadataInput = Readonly<{
  schemaVersion: 1
  displayName: string | null
  contextLength: number | null
  maxOutputTokens: number | null
  capabilities: Readonly<{ text: boolean | null; vision: boolean | null; tools: boolean | null; structuredOutputs: boolean | null; reasoning: boolean | null }>
  pricing: Readonly<{ prompt: string | null; completion: string | null; request: string | null; image: string | null }>
}>

type CompatibleCatalogMergedModel = Readonly<{
  protocolKey: 'openai_chat_compatible'
  providerInstanceId: CompatibleProviderInstanceId
  modelId: string
  availability: 'active' | 'stale'
  metadata: CompatibleCatalogManualMetadataInput & Readonly<{ fieldProvenance: Readonly<Record<string, 'remote_sync' | 'manual' | 'unknown'>> }>
  sourcePresence: Readonly<{ remote: 'active' | 'stale' | 'absent'; manual: boolean }>
  conflictFields: readonly string[]
}>

type CompatibleCatalogSyncState = Readonly<{
  providerInstanceId: CompatibleProviderInstanceId
  status: 'never' | 'syncing' | 'success' | 'empty_success' | 'failed' | 'backoff'
  lastAttemptAtMs: number | null
  lastSuccessAtMs: number | null
  lastSuccessSnapshotId: string | null
  failureCount: number
  backoffUntilMs: number | null
  diagnostics: Readonly<{ schemaVersion: 1; code: string; messageKey: string; retryable: boolean; httpStatus: number | null }> | null
  updatedAtMs: number
}>

type CompatibleCatalogSyncResult =
  | Readonly<{
      ok: true
      requestId: string
      providerInstanceId: CompatibleProviderInstanceId
      snapshotId: string
      status: 'success' | 'empty_success'
      models: readonly CompatibleCatalogMergedModel[]
      syncState: CompatibleCatalogSyncState
      sourceDiagnostics: Readonly<{ totalRows: number; acceptedRows: number; malformedRows: number; duplicateRows: number }>
    }>

type GenerationV2IpcResult = Readonly<{
  ok: boolean
  code?: string
  kind?: 'created' | 'idempotent_replay'
  operationId?: string
  answerRootId?: string
  actionKind?: string
  branch?: Readonly<{
    branchId: string; conversationId: string; questionId: string
    headMessageId: string | null; chosenAnswerRootId: string | null; deletedAtMs: number | null
  }>
  visibleAnswerRootIds?: readonly string[]
  visibleQuestionIds?: readonly string[]
}>

type GenerationV2TextBridge = Readonly<{
  initial: (command: unknown) => Promise<GenerationV2IpcResult>
  retry: (command: unknown) => Promise<GenerationV2IpcResult>
  regenerate: (command: unknown) => Promise<GenerationV2IpcResult>
  editResend: (command: unknown) => Promise<GenerationV2IpcResult>
  continueTool?: (command: unknown) => Promise<GenerationV2IpcResult>
  abort: (operationId: string) => Promise<Readonly<{ ok: boolean; aborted?: boolean; code?: string }>>
  onProjection: (listener: (projection: unknown) => void) => () => void
}>

type GenerationV2CredentialBridge = Readonly<{
  getStatus: () => Promise<unknown>
  reveal: () => Promise<unknown>
  update: (payload: unknown) => Promise<unknown>
  clear: () => Promise<unknown>
}>

type OpenRouterImageGenerationV2Bridge = GenerationV2TextBridge & Readonly<{
  getEndpointSelection: (payload: unknown) => Promise<unknown>
  selectEndpoint: (payload: unknown) => Promise<unknown>
  updateEndpointSettings: (payload: unknown) => Promise<unknown>
}>
  | Readonly<{
      ok: false
      requestId: string
      providerInstanceId: string
      error: CompatibleNetworkErrorEnvelope
      syncState: CompatibleCatalogSyncState | null
    }>

// Used in Renderer process, expose in `preload.ts`
interface Window {
  generationV2?: Readonly<{
    credentials: Readonly<{
      openRouter: GenerationV2CredentialBridge
      openAIResponses: GenerationV2CredentialBridge
      googleAIStudio: GenerationV2CredentialBridge
      anthropic: GenerationV2CredentialBridge
      deepSeek: GenerationV2CredentialBridge
    }>
    localRuntime: Readonly<{
      generic: Readonly<{
        probe: (payload: { url?: string; timeoutMs?: number }) => Promise<LocalEndpointProbeResult>
        streamProbe: (payload: { url?: string; timeoutMs?: number }) => Promise<LocalEndpointStreamProbeResult>
      }>
      lmStudio: Readonly<{
        probe: (payload: { endpointUrl?: string; selectedModel?: string; timeoutMs?: number }) => Promise<LMStudioProbeResult>
        loadModel: (payload: { endpointUrl: string; model: string; manualLoadUnloadEnabled?: boolean;
          timeoutMs?: number }) => Promise<LMStudioControlResult>
        unloadModel: (payload: { endpointUrl: string; instanceId: string; manualLoadUnloadEnabled?: boolean;
          timeoutMs?: number }) => Promise<LMStudioControlResult>
      }>
      ollama: Readonly<{
        probe: (payload: { endpointUrl?: string; selectedModel?: string; timeoutMs?: number }) => Promise<OllamaProbeResult>
        loadModel: (payload: { endpointUrl: string; model: string; manualLoadUnloadEnabled?: boolean;
          timeoutMs?: number }) => Promise<OllamaControlResult>
        unloadModel: (payload: { endpointUrl: string; model: string; manualLoadUnloadEnabled?: boolean;
          timeoutMs?: number }) => Promise<OllamaControlResult>
      }>
    }>
    workspace: Readonly<{
      ensureDefault: () => Promise<unknown>
      listProjects: () => Promise<unknown>
      listConversations: (projectId: string) => Promise<unknown>
      readBranch: (branchId: string) => Promise<unknown>
      listQuestionCandidates: (branchId: string, baseMessageId: string | null, limit: number) => Promise<unknown>
      selectQuestionCandidate: (payload: Readonly<{ branchId: string; baseMessageId: string | null;
        expectedCurrentQuestionId: string; targetQuestionId: string; expectedHeadMessageId: string }>) => Promise<unknown>
      selectAnswer: (payload: Readonly<{ branchId: string; questionId: string;
        expectedChosenAnswerRootId: string; targetAnswerRootId: string }>) => Promise<unknown>
      setContextFilter: (payload: Readonly<{branchId:string;targetType:'question'|'answer';targetId:string;mode:'include'|'exclude'}>) => Promise<unknown>
      clearContextFilter: (payload: Readonly<{branchId:string;targetType:'question'|'answer';targetId:string}>) => Promise<unknown>
      getConfig: (ownerKind: 'global' | 'project' | 'conversation', ownerId: string) => Promise<unknown>
      updateConfig: (payload: Readonly<{ ownerKind: 'global' | 'project' | 'conversation'; ownerId: string;
        expectedConfigRevision: string; semanticLayer: unknown }>) => Promise<unknown>
      createProject: (name: string) => Promise<unknown>
      renameProject: (projectId: string, name: string) => Promise<unknown>
      deleteProject: (projectId: string) => Promise<unknown>
      createConversation: (projectId: string, title: string) => Promise<unknown>
      renameConversation: (conversationId: string, title: string) => Promise<unknown>
      moveConversation: (conversationId: string, projectId: string) => Promise<unknown>
      deleteConversation: (conversationId: string) => Promise<unknown>
      forkBranch: (sourceBranchId: string, headMessageId: string, name: string | null) => Promise<unknown>
      renameBranch: (branchId: string, name: string | null) => Promise<unknown>
      deleteBranch: (branchId: string) => Promise<unknown>
      truncateFromQuestion: (payload: Readonly<{ branchId: string; questionId: string; expectedHeadMessageId: string }>) => Promise<unknown>
      getSystemTemplate: () => Promise<unknown>
      updateSystemTemplateConfig: (payload: Readonly<{ templateConversationId: string; expectedTemplateRevision: number;
        meta: Readonly<Record<string, unknown>> | null }>) => Promise<unknown>
      resetSystemTemplate: (payload: Readonly<{ templateConversationId: string; expectedTemplateRevision: number;
        resetModelConfig: boolean; resetDraftAttachments: boolean }>) => Promise<unknown>
      setNewChatLifecycle: (payload: Readonly<{ startupNavigation: 'open_new' | 'restore_last_formal' | 'projects_only';
        startupTemplateReset: Readonly<{ modelConfig: boolean; draftAttachments: boolean }>;
        postSendTemplateReset: 'reset_all' | 'preserve_model_config' }>) => Promise<unknown>
      getLastFormalConversation: () => Promise<unknown>
      setLastFormalConversation: (conversationId: string | null) => Promise<unknown>
    }>
    composer: Readonly<{
      get: (conversationId: string) => Promise<unknown>
      updateText: (payload: Readonly<{conversationId:string;expectedRevision:number;draftText:string;
        draftMode:'compose'|'edit';editingSourceQuestionId:string|null}>) => Promise<unknown>
      importLocal: (payload: Readonly<{conversationId:string;expectedRevision:number;filePath:string;selectionGrantToken:string}>) => Promise<unknown>
      addUrlReference: (payload: Readonly<{conversationId:string;expectedRevision:number;url:string}>) => Promise<unknown>
      importUrlFile: (payload: Readonly<{conversationId:string;expectedRevision:number;url:string}>) => Promise<unknown>
      removeAttachment: (payload: Readonly<{conversationId:string;expectedRevision:number;assetRevisionId:string}>) => Promise<unknown>
      clearCommitted: (payload: Readonly<{conversationId:string;expectedRevision:number}>) => Promise<unknown>
      readPreview: (payload: Readonly<{assetId:string;assetRevisionId:string}>) => Promise<unknown>
      replace: (payload: Readonly<{conversationId:string;expectedRevision:number;draftText:string;draftMode:'compose'|'edit';
        editingSourceQuestionId:string|null;attachments:readonly unknown[]}>) => Promise<unknown>
      replaceFromAnswerSnapshot: (payload: Readonly<{conversationId:string;expectedRevision:number;questionId:string;answerRootId:string;draftText:string}>) => Promise<unknown>
      dfcOptions: (payload: Readonly<{conversationId:string;assetId:string;providerId:string;operation:'chat_completions'|'images'|'responses'}>) => Promise<unknown>
      dfcSelect: (payload: Readonly<{conversationId:string;expectedRevision:number;assetId:string;optionId:string;providerId:string;operation:'chat_completions'|'images'|'responses'}>) => Promise<unknown>
      dfcPreview: (payload: Readonly<{conversationId:string;assetId:string;maxCharacters:number}>) => Promise<unknown>
    }>
    search: Readonly<{
      query: (payload: unknown) => Promise<unknown>
      rebuild: () => Promise<unknown>
    }>
    plugins: Readonly<{
      listOfficial: (payload?: unknown) => Promise<unknown>
      listInstalled: () => Promise<unknown>
      registerLocalOfficial: (payload: unknown) => Promise<unknown>
      installOfficial: (payload: unknown) => Promise<unknown>
      installStatus: (payload?: unknown) => Promise<unknown>
      cancelInstall: (payload?: unknown) => Promise<unknown>
      enable: (payload: unknown) => Promise<unknown>
      disable: (payload: unknown) => Promise<unknown>
      uninstall: (payload: unknown) => Promise<unknown>
      health: (payload: unknown) => Promise<unknown>
      registerLocalPackage: (payload: unknown) => Promise<unknown>
      quarantineLibreOffice: () => Promise<unknown>
      diagnostics: () => Promise<unknown>
      probeLibreOfficeDownload: () => Promise<unknown>
    }>
    models: Readonly<{
      listOpenRouter: (payload?: unknown) => Promise<unknown>
      listOpenAIResponses: (payload?: unknown) => Promise<unknown>
      listAnthropic: (payload?: unknown) => Promise<unknown>
      listGoogleAIStudio: (payload?: unknown) => Promise<unknown>
      listDeepSeek: (payload?: unknown) => Promise<unknown>
    }>
    modelPreferences: Readonly<{
      listFavorites: (payload: unknown) => Promise<unknown>
      addFavorite: (payload: unknown) => Promise<unknown>
      removeFavorite: (payload: unknown) => Promise<unknown>
      reorderFavorites: (payload: unknown) => Promise<unknown>
      listRecents: (payload: unknown) => Promise<unknown>
      recordRecent: (payload: unknown) => Promise<unknown>
    }>
    localProfiles: Readonly<{
      list: () => Promise<unknown>
      create: (payload: Readonly<{ providerId: 'lmstudio' | 'ollama' | 'generic_local';
        protocolContractId: string; baseUrl: string; protocolConfig?: Readonly<Record<string, unknown>> }>) => Promise<unknown>
      delete: (endpointProfileId: string) => Promise<unknown>
    }>
    lmStudio: Readonly<{ openResponses: GenerationV2TextBridge }>
    genericLocal: Readonly<{ openAIChatCompletions: GenerationV2TextBridge }>
    ollama: Readonly<{ chat: GenerationV2TextBridge }>
    openAICompatible: Readonly<{
      list: () => Promise<unknown>
      get: (providerInstanceId: string) => Promise<unknown>
      create: (payload: unknown) => Promise<unknown>
      reviseConfiguration: (payload: unknown) => Promise<unknown>
      writeCredential: (payload: unknown) => Promise<unknown>
      getCredentialStatus: (payload: unknown) => Promise<unknown>
      update: (payload: unknown) => Promise<unknown>
      updateEndpoint: (payload: unknown) => Promise<unknown>
      delete: (providerInstanceId: string) => Promise<unknown>
      clearCredential: (payload: unknown) => Promise<unknown>
      testConnection: (payload: unknown) => Promise<unknown>
      abortConnectionTest: (requestId: string) => Promise<unknown>
      syncModels: (payload: unknown) => Promise<unknown>
      abortModelSync: (requestId: string) => Promise<unknown>
      queryModels: (payload: unknown) => Promise<unknown>
      getModelStatus: (providerInstanceId: string) => Promise<unknown>
      upsertManualModel: (payload: unknown) => Promise<unknown>
      deleteManualModel: (payload: unknown) => Promise<unknown>
      listDiscovery: (providerInstanceId: string) => Promise<unknown>
      ignoreDiscovery: (payload: unknown) => Promise<unknown>
      confirmDiscovery: (payload: unknown) => Promise<unknown>
      commands: GenerationV2TextBridge
    }>
    openRouter: Readonly<{ chat: GenerationV2TextBridge; images: OpenRouterImageGenerationV2Bridge }>
    openAIResponses: GenerationV2TextBridge
    anthropic: GenerationV2TextBridge
    deepSeek: GenerationV2TextBridge
    gemini: Readonly<{ generateContent: GenerationV2TextBridge; interactionsImage: GenerationV2TextBridge }>
  }>
  rawGenerationDebug?: Readonly<{
    getStatus: () => Promise<Readonly<{
      available: boolean
      dbPath: string
      schemaReady: boolean
      lastCaptureError?: Readonly<{ code: 'RAW_DEBUG_CAPTURE_FAILED'; atMs: number }> | null
      errorCode?: 'RAW_DEBUG_STORE_OPEN_FAILED'
    }>>
    listByAnswerRootId: (answerRootId: string) => Promise<readonly Readonly<{
      id: string; operationId: string; answerRootId: string; requestSequence: number
      providerId: string; modelId: string; serializedBody: string; bodyBytes: number
      bodySha256: string; capturedAtMs: number
    }>[]>
  }>
  networkProxy?: {
    getSettings?: () => Promise<NetworkProxyProductResult>
    updateSettings?: (settings: NetworkProxyProductSettings) => Promise<NetworkProxyProductResult>
    resetSettings?: () => Promise<NetworkProxyProductResult>
    reapplySettings?: () => Promise<NetworkProxyProductResult>
    resolveProxy?: (payload: string | { url?: string }) => Promise<NetworkProxyResolveResult>
  }
  electronAPI?: {
    selectLocalFiles?: (options?: { context?: 'file' | 'image'; allowMultiple?: boolean }) => Promise<{
      filePaths: string[]
      fileGrants?: Array<{ filePath: string; token: string; expiresAtMs: number }>
    } | null>
    importLibreOfficeSvpkg?: () => Promise<unknown>
    quarantineLibreOfficeRuntime?: () => Promise<unknown>
  }
}
