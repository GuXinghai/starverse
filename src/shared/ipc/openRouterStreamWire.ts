export const OPENROUTER_STREAM_WIRE_VERSION = 1

export type OpenRouterStreamWireRequestConfig = Readonly<{
  apiKey?: string
  credentialSource?: 'legacy_store'
  model?: string
  requestedReasoningMode?: string
  requestedReasoningEffort?: string
  requestedReasoningExclude?: boolean
  tools?: unknown[]
  modalities?: ReadonlyArray<'image' | 'text'>
  imageConfig?: Readonly<Record<string, unknown>>
  timeoutMs?: number
  baseUrl?: string
  providerRequireParameters?: boolean
  forceHttp1?: boolean
  tcpKeepAliveEnable?: boolean
  tcpKeepAliveIdleMs?: number
}>

export type OpenRouterStreamWireRequest = Readonly<{
  requestId: string
  wireVersion?: number
  // Legacy fields kept for backward compatibility with older renderers.
  userText?: string
  assistantMessageId?: string
  contextMessages?: unknown[]
  contextMode?: string
  // Preferred payload for wireVersion>=1.
  requestBody?: unknown
  config: OpenRouterStreamWireRequestConfig
}>

export type OpenRouterStreamWireErrorKind = 'http_error' | 'transport_error' | 'aborted'

export type OpenRouterStreamWireError = Readonly<{
  kind: OpenRouterStreamWireErrorKind
  message: string
  name?: string
  code?: string | number
  status?: number
  statusText?: string
  headers?: Record<string, string>
  bodyText?: string
}>

export type OpenRouterStreamWireEvent =
  | Readonly<{
      type: 'chunk'
      data: string
    }>
  | Readonly<{
      type: 'responseMeta'
      status: number
      requestId?: string
      provider?: string
      headers?: Record<string, string>
    }>
  | Readonly<{
      type: 'error'
      error: OpenRouterStreamWireError
    }>
  | Readonly<{
      type: 'end'
    }>

export function isOpenRouterStreamWireEvent(value: unknown): value is OpenRouterStreamWireEvent {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.type === 'chunk') return typeof v.data === 'string'
  if (v.type === 'responseMeta') return typeof v.status === 'number'
  if (v.type === 'error') {
    const err = v.error
    return !!err && typeof err === 'object' && typeof (err as Record<string, unknown>).message === 'string'
  }
  return v.type === 'end'
}

export function isOpenRouterStreamWireRequest(value: unknown): value is OpenRouterStreamWireRequest {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (typeof v.requestId !== 'string' || v.requestId.trim().length === 0) return false
  if (!v.config || typeof v.config !== 'object') return false
  const config = v.config as Record<string, unknown>
  const hasLegacyApiKey = typeof config.apiKey === 'string' && config.apiKey.trim().length > 0
  const hasResolverBackedSource = config.credentialSource === 'legacy_store'
  if (!hasLegacyApiKey && !hasResolverBackedSource) return false
  if ('wireVersion' in v && typeof v.wireVersion !== 'number') return false
  return true
}
