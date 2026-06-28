import { lookup } from 'node:dns/promises'
import net from 'node:net'

export type UrlProbeStatus = 'accessible' | 'probe_failed' | 'rejected'

export type UrlProbeResult = Readonly<{
  originalUrl: string
  resolvedUrl: string
  probeStatus: UrlProbeStatus
  contentType: string | null
  contentLength: number | null
  statusCode: number | null
  lastProbeAt: number
  warning: string | null
}>

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>
export type ResolveHostname = (hostname: string) => Promise<readonly string[]>

export type ProbeUrlOptions = Readonly<{
  fetch?: FetchLike
  now?: () => number
  resolveHostname?: ResolveHostname
  maxRedirects?: number
}>

type FetchPublicHttpUrlOptions = Readonly<{
  fetch?: FetchLike
  resolveHostname?: ResolveHostname
  maxRedirects?: number
}>

type FetchWithRedirectsResult = Readonly<{
  response: Response
  resolvedUrl: string
}>

type FetchWithRedirectsOptions = Readonly<{
  fetch: FetchLike
  resolveHostname?: ResolveHostname
  maxRedirects?: number
}>

class UrlAccessPolicyError extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.name = 'UrlAccessPolicyError'
    this.code = code
  }
}

const DEFAULT_MAX_REDIRECTS = 5

export async function probeUrl(rawUrl: string, options: ProbeUrlOptions = {}): Promise<UrlProbeResult> {
  const originalUrl = rawUrl.trim()
  const now = options.now ?? Date.now
  const fetchImpl = options.fetch ?? globalThis.fetch
  if (!fetchImpl) {
    return failedProbe(originalUrl, originalUrl, now(), 'fetch_unavailable', null)
  }

  let parsed: URL
  try {
    parsed = new URL(originalUrl)
  } catch {
    return failedProbe(originalUrl, originalUrl, now(), 'invalid_url', null, 'rejected')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return failedProbe(originalUrl, originalUrl, now(), 'url_scheme_not_allowed', null, 'rejected')
  }

  try {
    const head = await fetchWithValidatedRedirects(parsed.toString(), {
      method: 'HEAD',
      redirect: 'manual',
    }, {
      fetch: fetchImpl,
      resolveHostname: options.resolveHostname,
      maxRedirects: options.maxRedirects,
    })
    if (head.response.ok) return successfulProbe(originalUrl, head.resolvedUrl, head.response, now())
    if (head.response.status !== 405 && head.response.status !== 501) {
      return failedProbe(originalUrl, head.resolvedUrl, now(), `http_status_${head.response.status}`, head.response.status)
    }
  } catch (error) {
    if (isUrlAccessPolicyError(error)) {
      return failedProbe(originalUrl, parsed.toString(), now(), error.code, null, 'rejected')
    }
    // Fall through to a controlled GET probe.
  }

  try {
    const get = await fetchWithValidatedRedirects(parsed.toString(), {
      method: 'GET',
      redirect: 'manual',
      headers: { Range: 'bytes=0-0' },
    }, {
      fetch: fetchImpl,
      resolveHostname: options.resolveHostname,
      maxRedirects: options.maxRedirects,
    })
    if (get.response.ok || get.response.status === 206) return successfulProbe(originalUrl, get.resolvedUrl, get.response, now())
    return failedProbe(originalUrl, get.resolvedUrl, now(), `http_status_${get.response.status}`, get.response.status)
  } catch (error) {
    if (isUrlAccessPolicyError(error)) {
      return failedProbe(originalUrl, parsed.toString(), now(), error.code, null, 'rejected')
    }
    return failedProbe(originalUrl, parsed.toString(), now(), error instanceof Error ? error.message : 'network_error', null)
  }
}

export async function fetchPublicHttpUrl(
  rawUrl: string,
  init: RequestInit,
  options: FetchPublicHttpUrlOptions = {},
): Promise<Response> {
  const fetchImpl = options.fetch ?? globalThis.fetch
  if (!fetchImpl) throw new Error('fetch_unavailable')
  const result = await fetchWithValidatedRedirects(rawUrl, {
    ...init,
    redirect: 'manual',
  }, {
    fetch: fetchImpl,
    resolveHostname: options.resolveHostname,
    maxRedirects: options.maxRedirects,
  })
  return result.response
}

function successfulProbe(originalUrl: string, resolvedUrl: string, response: Response, lastProbeAt: number): UrlProbeResult {
  return {
    originalUrl,
    resolvedUrl,
    probeStatus: 'accessible',
    contentType: normalizeContentType(response.headers.get('content-type')),
    contentLength: parseContentLength(response.headers.get('content-length')),
    statusCode: response.status,
    lastProbeAt,
    warning: null,
  }
}

function failedProbe(
  originalUrl: string,
  resolvedUrl: string,
  lastProbeAt: number,
  warning: string,
  statusCode: number | null,
  probeStatus: UrlProbeStatus = 'probe_failed'
): UrlProbeResult {
  return {
    originalUrl,
    resolvedUrl,
    probeStatus,
    contentType: null,
    contentLength: null,
    statusCode,
    lastProbeAt,
    warning,
  }
}

function normalizeContentType(value: string | null): string | null {
  const normalized = value?.split(';', 1)[0]?.trim().toLowerCase()
  return normalized || null
}

function parseContentLength(value: string | null): number | null {
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

async function fetchWithValidatedRedirects(
  rawUrl: string,
  init: RequestInit,
  options: FetchWithRedirectsOptions,
): Promise<FetchWithRedirectsResult> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS
  let current = await assertPublicHttpUrl(rawUrl, options.resolveHostname)

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const response = await options.fetch(current.toString(), {
      ...init,
      redirect: 'manual',
    })
    const responseUrl = await assertPublicHttpUrl(response.url || current.toString(), options.resolveHostname)
    current = responseUrl

    if (!isRedirectStatus(response.status)) {
      return { response, resolvedUrl: current.toString() }
    }

    const location = response.headers.get('location')
    if (!location) return { response, resolvedUrl: current.toString() }
    if (redirectCount >= maxRedirects) throw new UrlAccessPolicyError('url_redirect_limit_exceeded')
    current = await assertPublicHttpUrl(new URL(location, current).toString(), options.resolveHostname)
  }

  throw new UrlAccessPolicyError('url_redirect_limit_exceeded')
}

async function assertPublicHttpUrl(rawUrl: string, resolveHostname?: ResolveHostname): Promise<URL> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new UrlAccessPolicyError('invalid_url')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UrlAccessPolicyError('url_scheme_not_allowed')
  }
  if (url.username || url.password) {
    throw new UrlAccessPolicyError('url_credentials_not_allowed')
  }

  const hostname = normalizeHostname(url.hostname)
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new UrlAccessPolicyError('url_host_not_allowed')
  }

  const addresses = net.isIP(hostname) ? [hostname] : await resolveHostAddresses(hostname, resolveHostname)
  if (addresses.length === 0 || addresses.some((address) => isBlockedIpAddress(address))) {
    throw new UrlAccessPolicyError('url_host_not_allowed')
  }
  return url
}

async function resolveHostAddresses(hostname: string, resolveHostname?: ResolveHostname): Promise<readonly string[]> {
  if (resolveHostname) return resolveHostname(hostname)
  const records = await lookup(hostname, { all: true, verbatim: true })
  return records.map((record) => record.address)
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '').replace(/\.$/, '')
}

function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400
}

function isUrlAccessPolicyError(error: unknown): error is UrlAccessPolicyError {
  return error instanceof UrlAccessPolicyError
}

function isBlockedIpAddress(address: string): boolean {
  const normalized = normalizeHostname(address)
  const mappedIpv4 = parseIpv4MappedIpv6(normalized)
  if (mappedIpv4 && isBlockedIpv4(mappedIpv4)) return true
  const ipVersion = net.isIP(normalized)
  if (ipVersion === 4) return isBlockedIpv4(normalized)
  if (ipVersion === 6) return isBlockedIpv6(normalized)
  return true
}

function isBlockedIpv4(address: string): boolean {
  const parts = address.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b] = parts
  if (a === undefined || b === undefined) return true
  if (a === 0) return true
  if (a === 10) return true
  if (a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 224 || a >= 240) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  return false
}

function isBlockedIpv6(address: string): boolean {
  const normalized = address.split('%', 1)[0] ?? address
  if (normalized === '::' || normalized === '::1') return true
  const first = firstIpv6Hextet(normalized)
  if (first === null) return true
  if (first >= 0xfc00 && first <= 0xfdff) return true
  if (first >= 0xfe80 && first <= 0xfebf) return true
  if (first >= 0xff00 && first <= 0xffff) return true
  return false
}

function firstIpv6Hextet(address: string): number | null {
  const first = address.split(':').find((part) => part.length > 0) ?? '0'
  const parsed = Number.parseInt(first, 16)
  return Number.isFinite(parsed) ? parsed : null
}

function parseIpv4MappedIpv6(address: string): string | null {
  const dotted = address.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i)
  if (dotted?.[1]) return dotted[1]
  const hex = address.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i)
  if (!hex?.[1] || !hex[2]) return null
  const high = Number.parseInt(hex[1], 16)
  const low = Number.parseInt(hex[2], 16)
  if (!Number.isFinite(high) || !Number.isFinite(low)) return null
  return [
    (high >> 8) & 0xff,
    high & 0xff,
    (low >> 8) & 0xff,
    low & 0xff,
  ].join('.')
}

