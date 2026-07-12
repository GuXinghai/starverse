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

type NetworkProxyPolicyMode = 'system' | 'direct' | 'fixed_servers' | 'pac_script' | 'auto_detect'

interface NetworkProxyPolicy {
  mode: NetworkProxyPolicyMode
  proxyRules: string
  proxyBypassRules: string
  pacScript: string
  credentialRef: string | null
}

interface NetworkProxyPolicyValidationIssue {
  code:
    | 'proxy_policy_fixed_servers_requires_proxy_rules'
    | 'proxy_policy_pac_script_requires_pac_script'
    | 'proxy_policy_proxy_rules_contains_credentials'
    | 'proxy_policy_pac_script_contains_credentials'
  field: keyof NetworkProxyPolicy
  message: string
}

type NetworkProxyPolicyResult =
  | { ok: true; policy: NetworkProxyPolicy }
  | {
    ok: false
    code: 'invalid_policy' | 'store_unavailable'
    message: string
    issues?: readonly NetworkProxyPolicyValidationIssue[]
  }

type NetworkProxyApplyResult =
  | {
    ok: true
    policy: NetworkProxyPolicy
    config: {
      mode?: NetworkProxyPolicyMode
      pacScript?: string
      proxyBypassRules?: string
      proxyRules?: string
    }
    reason: 'startup' | 'manual'
    closedConnections: boolean
    appliedAtMs: number
  }
  | {
    ok: false
    code: 'invalid_policy' | 'session_proxy_failed' | 'store_unavailable'
    message: string
    policy: NetworkProxyPolicy
    issues?: readonly NetworkProxyPolicyValidationIssue[]
  }

type NetworkProxyResolveResult =
  | {
    ok: true
    url: string
    resolvedProxy: string
    proxyKind: 'DIRECT' | 'PROXY configured' | 'unknown/error'
    observedAtMs: number
  }
  | {
    ok: false
    code: 'invalid_url' | 'session_proxy_failed'
    message: string
    safeUrl?: string
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
  | Readonly<{
      ok: false
      requestId: string
      providerInstanceId: string
      error: CompatibleNetworkErrorEnvelope
      syncState: CompatibleCatalogSyncState | null
    }>

// Used in Renderer process, expose in `preload.ts`
interface Window {
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
  compatibleProviderRegistry?: {
    list?: () => Promise<CompatibleProviderRegistryResult<readonly CompatibleProviderRegistryDetails[]>>
    get?: (payload: Readonly<{ providerInstanceId: CompatibleProviderInstanceId }>) => Promise<CompatibleProviderRegistryResult<CompatibleProviderRegistryDetails>>
    create?: (payload: Readonly<{
      displayName: string
      endpoint: CompatibleRegistryEndpointInput
      credential: CompatibleRegistryCredentialInput
      requestMappings?: readonly CompatibleRegistryRequestMappingInput[]
    }>) => Promise<CompatibleProviderRegistryResult<CompatibleProviderRegistryDetails>>
    reviseConfiguration?: (payload: Readonly<{
      providerInstanceId: CompatibleProviderInstanceId
      requestProfile: unknown
      requestMappings: readonly CompatibleRegistryRequestMappingInput[]
      reasoningMapping: unknown
      inlinePolicy: unknown
      acceptedDiscoveryPaths?: readonly string[]
    }>) => Promise<CompatibleProviderRegistryResult<CompatibleProviderRegistryDetails>>
    listDiscovery?: (payload: Readonly<{ providerInstanceId: CompatibleProviderInstanceId }>) => Promise<CompatibleProviderRegistryResult<readonly CompatibleDiscoveredResponseField[]>>
    ignoreDiscovery?: (payload: Readonly<{ providerInstanceId: CompatibleProviderInstanceId; streamPath: string }>) => Promise<CompatibleProviderRegistryResult<readonly CompatibleDiscoveredResponseField[]>>
    update?: (payload: Readonly<{
      providerInstanceId: CompatibleProviderInstanceId
      displayName?: string
      status?: 'active' | 'disabled'
    }>) => Promise<CompatibleProviderRegistryResult<CompatibleProviderRegistryDetails>>
    updateEndpoint?: (payload: Readonly<{
      providerInstanceId: CompatibleProviderInstanceId
      endpoint: CompatibleRegistryEndpointInput
      clearAuthentication?: boolean
    }>) => Promise<CompatibleProviderRegistryResult<CompatibleProviderRegistryDetails>>
    rotateCredential?: (payload: Readonly<{
      providerInstanceId: CompatibleProviderInstanceId
      credential: Exclude<CompatibleRegistryCredentialInput, Readonly<{ mode: 'none' }>>
    }>) => Promise<CompatibleProviderRegistryResult<CompatibleProviderRegistryDetails>>
    deleteCredential?: (payload: Readonly<{
      credentialVersionRef: CompatibleCredentialVersionRef
    }>) => Promise<CompatibleProviderRegistryResult<CompatibleProviderRegistryDetails>>
    deleteProvider?: (payload: Readonly<{
      providerInstanceId: CompatibleProviderInstanceId
    }>) => Promise<CompatibleProviderRegistryResult<CompatibleProviderRegistryDetails>>
  }
  compatibleProviderTransport?: {
    testConnection?: (payload: Readonly<{
      providerInstanceId: CompatibleProviderInstanceId
      requestId: string
    }>) => Promise<CompatibleConnectionTestResult>
    abortConnectionTest?: (payload: Readonly<{ requestId: string }>) => Promise<Readonly<{ aborted: boolean }>>
  }
  compatibleChat?: {
    preflight?: (payload: unknown) => Promise<Readonly<{
      ok: boolean
      code?: string
      route?: Readonly<{
        routeProvenanceId: string; requestId: string; providerInstanceId: string; modelId: string; createdAtMs: number
      }>
    }>>
    start?: (payload: unknown) => Promise<unknown>
    abort?: (payload: Readonly<{ requestId: string }>) => Promise<Readonly<{ aborted: boolean }>>
    resolveHistorical?: (payload: unknown) => Promise<unknown>
    onEvent?: (listener: (payload: unknown) => void) => () => void
    onPrepared?: (listener: (payload: unknown) => void) => () => void
    onEnd?: (listener: (payload: unknown) => void) => () => void
  }
  compatibleMaintenance?: {
    previewReset: () => Promise<unknown>
    applyReset: (confirmation: string) => Promise<unknown>
  }
  compatibleCatalog?: {
    sync?: (payload: Readonly<{ providerInstanceId: CompatibleProviderInstanceId; requestId: string; force?: boolean }>) => Promise<CompatibleCatalogSyncResult>
    abortSync?: (payload: Readonly<{ requestId: string }>) => Promise<Readonly<{ aborted: boolean }>>
    query?: (payload: Readonly<{
      providerInstanceId: CompatibleProviderInstanceId
      search?: string
      includeStale?: boolean
      offset?: number
      limit?: number
    }>) => Promise<Readonly<{
      protocolKey: 'openai_chat_compatible'
      providerInstanceId: CompatibleProviderInstanceId
      providerName: string
      providerStatus: 'active' | 'disabled' | 'deleted'
      syncState: CompatibleCatalogSyncState | null
      total: number
      items: readonly CompatibleCatalogMergedModel[]
    }>>
    getStatus?: (payload: Readonly<{ providerInstanceId: CompatibleProviderInstanceId }>) => Promise<CompatibleCatalogSyncState | null>
    upsertManual?: (payload: Readonly<{
      providerInstanceId: CompatibleProviderInstanceId
      modelId: string
      metadata: CompatibleCatalogManualMetadataInput
    }>) => Promise<CompatibleCatalogMergedModel>
    deleteManual?: (payload: Readonly<{ providerInstanceId: CompatibleProviderInstanceId; modelId: string }>) => Promise<Readonly<{ deleted: boolean }>>
  }
  openRouterCredential?: {
    getStatus?: () => Promise<OpenRouterCredentialResult>
    reveal?: () => Promise<ProviderCredentialRevealResult>
    update?: (payload: OpenRouterCredentialUpdatePayload) => Promise<OpenRouterCredentialResult>
    clear?: () => Promise<OpenRouterCredentialResult>
  }
  openAIResponsesCredential?: {
    getStatus?: () => Promise<OpenAIResponsesCredentialResult>
    reveal?: () => Promise<ProviderCredentialRevealResult>
    update?: (payload: OpenAIResponsesCredentialUpdatePayload) => Promise<OpenAIResponsesCredentialResult>
    clear?: () => Promise<OpenAIResponsesCredentialResult>
  }
  openAIResponsesModels?: {
    listAvailability?: (payload?: { timeoutMs?: number }) => Promise<OpenAIModelAvailabilityResult>
  }
  googleAIStudioCredential?: {
    getStatus?: () => Promise<GoogleAIStudioCredentialResult>
    reveal?: () => Promise<ProviderCredentialRevealResult>
    update?: (payload: GoogleAIStudioCredentialUpdatePayload) => Promise<GoogleAIStudioCredentialResult>
    clear?: () => Promise<GoogleAIStudioCredentialResult>
  }
  anthropicCredential?: {
    getStatus?: () => Promise<AnthropicCredentialResult>
    reveal?: () => Promise<ProviderCredentialRevealResult>
    update?: (payload: AnthropicCredentialUpdatePayload) => Promise<AnthropicCredentialResult>
    clear?: () => Promise<AnthropicCredentialResult>
  }
  anthropicModels?: {
    listAvailability?: (payload?: { timeoutMs?: number }) => Promise<AnthropicModelAvailabilityResult>
  }
  deepSeekCredential?: {
    getStatus?: () => Promise<DeepSeekCredentialResult>
    reveal?: () => Promise<ProviderCredentialRevealResult>
    update?: (payload: DeepSeekCredentialUpdatePayload) => Promise<DeepSeekCredentialResult>
    clear?: () => Promise<DeepSeekCredentialResult>
  }
  deepSeekModels?: {
    listAvailability?: (payload?: { timeoutMs?: number }) => Promise<DeepSeekModelAvailabilityResult>
  }
  googleAIStudioModels?: {
    listAvailability?: (payload?: { timeoutMs?: number }) => Promise<GeminiModelAvailabilityResult>
  }
  networkProxy?: {
    getPolicy?: () => Promise<NetworkProxyPolicyResult>
    updatePolicy?: (policy: Partial<NetworkProxyPolicy>) => Promise<NetworkProxyApplyResult>
    resetPolicy?: () => Promise<NetworkProxyApplyResult>
    resolveProxy?: (payload: string | { url?: string }) => Promise<NetworkProxyResolveResult>
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
  ollamaProvider?: {
    probe?: (payload: { endpointUrl?: string; selectedModel?: string; timeoutMs?: number }) => Promise<OllamaProbeResult>
    loadModel?: (payload: {
      endpointUrl: string
      model: string
      manualLoadUnloadEnabled?: boolean
      timeoutMs?: number
    }) => Promise<OllamaControlResult>
    unloadModel?: (payload: {
      endpointUrl: string
      model: string
      manualLoadUnloadEnabled?: boolean
      timeoutMs?: number
    }) => Promise<OllamaControlResult>
  }
  ollamaChat?: {
    startTextChat?: (payload: {
      requestId: string
      assistantMessageId: string
      config: OllamaLocalProviderConfig
      model: string
      messages: OllamaTextChatMessage[]
      timeoutMs?: number
    }) => Promise<OllamaTextChatStartResult>
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
      generationParams?: unknown
      imageGeneration?: unknown
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
      generationParams?: unknown
      imageGeneration?: unknown
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
      generationParams?: unknown
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
      generationParams?: unknown
      timeoutMs?: number
    }) => Promise<DeepSeekTextChatStartResult>
    abortTextChat?: (requestId: string) => Promise<{ ok: true }>
    onTextChatChunk?: (requestId: string, callback: (payload: unknown) => void) => () => void
    onTextChatEnd?: (requestId: string, callback: () => void) => () => void
  }
  electronAPI?: {
    selectLocalFiles?: (options?: { context?: 'file' | 'image'; allowMultiple?: boolean }) => Promise<{
      filePaths: string[]
      fileGrants?: Array<{ filePath: string; token: string; expiresAtMs: number }>
    } | null>
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
