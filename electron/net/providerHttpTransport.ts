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
}>): ProviderFetch {
  const sessionFetch = (input?.session ?? session.defaultSession).fetch
  return (url, init) => {
    const sessionInput = url instanceof URL ? url.toString() : url
    return sessionFetch(sessionInput as string | Request, init)
  }
}
