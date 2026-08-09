import { session } from 'electron'

export type ProviderFetch = typeof fetch

export type ProviderHttpProxyEnvDiagnostics = Readonly<{
  HTTP_PROXY: 'configured' | 'missing'
  HTTPS_PROXY: 'configured' | 'missing'
  NO_PROXY: 'configured' | 'missing'
}>

export type ProviderHttpResolvedProxyKind =
  | 'DIRECT'
  | 'PROXY configured'
  | 'unknown/error'

type ElectronSessionFetch = (input: string | Request, init?: RequestInit & {
  bypassCustomProtocolHandlers?: boolean
}) => Promise<Response>

type ElectronSessionLike = Readonly<{
  fetch: ElectronSessionFetch
}>

export type ProviderHttpTransportDiagnostic =
  | 'proxy_environment_unavailable'
  | `ERR_${string}`
  | 'UNKNOWN_TRANSPORT_ERROR'
  | string

export function classifyProviderHttpTransportDiagnostic(error: unknown): ProviderHttpTransportDiagnostic {
  const record = error && typeof error === 'object' ? error as { name?: unknown; message?: unknown; cause?: unknown } : null
  const cause = record?.cause && typeof record.cause === 'object'
    ? record.cause as { code?: unknown; message?: unknown }
    : null
  const text = [record?.message, cause?.message, cause?.code].map((value) => String(value ?? '')).join(' ')
  if (record?.message === 'proxy_environment_unavailable') return 'proxy_environment_unavailable'
  const networkCode = /\b(?:net::)?ERR_[A-Z0-9_]+\b/u.exec(text)?.[0]
  if (networkCode) return networkCode.replace(/^net::/u, '')
  return typeof record?.name === 'string' && /^[A-Za-z][A-Za-z0-9]{0,63}$/u.test(record.name)
    ? record.name
    : 'UNKNOWN_TRANSPORT_ERROR'
}

export class ProviderHttpTransportError extends Error {
  readonly diagnosticCode: ProviderHttpTransportDiagnostic

  constructor(error: unknown) {
    const diagnosticCode = classifyProviderHttpTransportDiagnostic(error)
    super(diagnosticCode)
    this.name = 'ProviderHttpTransportError'
    this.diagnosticCode = diagnosticCode
  }
}

function configured(value: unknown): 'configured' | 'missing' {
  return typeof value === 'string' && value.trim().length > 0 ? 'configured' : 'missing'
}

export function getProviderHttpProxyEnvDiagnostics(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ProviderHttpProxyEnvDiagnostics {
  return {
    HTTP_PROXY: configured(env.HTTP_PROXY ?? env.http_proxy),
    HTTPS_PROXY: configured(env.HTTPS_PROXY ?? env.https_proxy),
    NO_PROXY: configured(env.NO_PROXY ?? env.no_proxy),
  }
}

export function classifyProviderResolvedProxy(value: unknown): ProviderHttpResolvedProxyKind {
  const text = String(value ?? '').trim()
  if (!text) return 'unknown/error'
  if (/^DIRECT(?:\s|$)/i.test(text)) return 'DIRECT'
  if (/\b(PROXY|HTTPS|SOCKS|SOCKS5)\b/i.test(text)) return 'PROXY configured'
  return 'unknown/error'
}

export function createElectronSessionProviderFetch(input?: Readonly<{
  session?: ElectronSessionLike
  beforeRequest?: (url: string | Request) => void
}>): ProviderFetch {
  return async (url, init) => {
    const sessionInput = url instanceof URL ? url.toString() : url
    try {
      input?.beforeRequest?.(sessionInput as string | Request)
      const electronSession = input?.session ?? session.defaultSession
      return await electronSession.fetch(sessionInput as string | Request, init)
    } catch (error) {
      const classified = new ProviderHttpTransportError(error)
      if (process.env.SV_GENERATION_V2_REAL_SMOKE === '1') {
        process.stderr.write(`[provider-fetch] ${classified.diagnosticCode}\n`)
      }
      throw classified
    }
  }
}
