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

type OpenRouterCredentialSource = 'legacy_store'

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
  apiKeyConfigured: boolean
  maskedApiKey?: '***'
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
  source: 'legacy_store'
  providerId: 'openai'
  profileId: 'openai_responses_v1'
  apiKeyConfigured: boolean
  maskedApiKey?: '***'
  defaultBaseUrl: 'https://api.openai.com/v1'
  rendererVisible: true
}

interface OpenAIResponsesCredentialUpdatePayload {
  apiKey?: string
}

type OpenAIResponsesCredentialResult =
  | { ok: true; status: OpenAIResponsesCredentialStatus }
  | { ok: false; code: 'invalid_payload' | 'store_unavailable'; message: string }

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
  electronAPI?: {
    getNetExpRuntimeInfo?: () => Promise<unknown>
    onModelCatalogSynced?: (callback: () => void) => () => void
    modelCatalogSyncNow?: (options?: { providerKey?: string; force?: boolean; reason?: string }) => Promise<unknown>
    modelCatalogGetSyncStatus?: (options?: { providerKey?: string }) => Promise<unknown>
    modelCatalogQueryScopedCurrent?: (options?: unknown) => Promise<unknown>
    modelCatalogRepairCurrentScopedCache?: () => Promise<unknown>
    modelCatalogClearCurrentScopedCache?: () => Promise<unknown>
    modelCatalogClearAllOpenRouterScopedCaches?: () => Promise<unknown>
    startOpenRouterStream?: (payload: unknown) => Promise<unknown>
    abortOpenRouterStream?: (requestId: string) => Promise<unknown>
    onOpenRouterChunk?: (requestId: string, callback: (payload: unknown) => void) => () => void
    onOpenRouterEnd?: (requestId: string, callback: () => void) => () => void
  }
}
