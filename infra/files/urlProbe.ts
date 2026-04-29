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

export type ProbeUrlOptions = Readonly<{
  fetch?: FetchLike
  now?: () => number
}>

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
    const head = await fetchImpl(parsed.toString(), {
      method: 'HEAD',
      redirect: 'follow',
    })
    const resolvedUrl = head.url || parsed.toString()
    if (head.ok) return successfulProbe(originalUrl, resolvedUrl, head, now())
    if (head.status !== 405 && head.status !== 501) {
      return failedProbe(originalUrl, resolvedUrl, now(), `http_status_${head.status}`, head.status)
    }
  } catch {
    // Fall through to a controlled GET probe.
  }

  try {
    const get = await fetchImpl(parsed.toString(), {
      method: 'GET',
      redirect: 'follow',
      headers: { Range: 'bytes=0-0' },
    })
    const resolvedUrl = get.url || parsed.toString()
    if (get.ok || get.status === 206) return successfulProbe(originalUrl, resolvedUrl, get, now())
    return failedProbe(originalUrl, resolvedUrl, now(), `http_status_${get.status}`, get.status)
  } catch (error) {
    return failedProbe(originalUrl, parsed.toString(), now(), error instanceof Error ? error.message : 'network_error', null)
  }
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

