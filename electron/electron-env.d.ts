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

// Used in Renderer process, expose in `preload.ts`
interface Window {
  openRouterCredential?: {
    getStatus?: () => Promise<OpenRouterCredentialResult>
    update?: (payload: OpenRouterCredentialUpdatePayload) => Promise<OpenRouterCredentialResult>
    clear?: () => Promise<OpenRouterCredentialResult>
  }
  localEndpointDiagnostics?: {
    probe?: (payload: { url?: string; timeoutMs?: number }) => Promise<LocalEndpointProbeResult>
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
