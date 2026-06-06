export type OpenRouterSyncFailureReason =
  | 'missing_api_key'
  | 'invalid_api_key'
  | 'insufficient_credits'
  | 'forbidden'
  | 'rate_limited'
  | 'timeout'
  | 'network_unreachable'
  | 'service_unavailable'
  | 'bad_response'
  | 'cache_corrupted'
  | 'db_unavailable'
  | 'unknown_error'

export type CatalogSyncErrorCodeResult = Readonly<{
  code: OpenRouterSyncFailureReason
  message: string
  retryAfterMs?: number | null
}>

function isTimeoutError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('timeout') || msg.includes('aborted')) return true
    if (error.name === 'AbortError' || error.name === 'TimeoutError') return true
  }
  return false
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) {
    const msg = error.message.toLowerCase()
    if (msg.includes('fetch') || msg.includes('network') || msg.includes('failed')) return true
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    if (
      msg.includes('econnreset') ||
      msg.includes('enotfound') ||
      msg.includes('econnrefused') ||
      msg.includes('ehostunreach') ||
      msg.includes('err_network_changed') ||
      msg.includes('err_internet_disconnected') ||
      msg.includes('network') ||
      msg.includes('dns')
    ) return true
    if ((error as any).code === 'ECONNRESET' || (error as any).code === 'ENOTFOUND') return true
  }
  return false
}

function parseRetryAfter(retryAfter: string | null | undefined): number | null {
  if (!retryAfter) return null
  const seconds = Number(retryAfter)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  return null
}

export function mapHttpErrorToCode(
  status: number,
  _openRouterCode: number | null | undefined,
  retryAfterHeader: string | null | undefined,
): CatalogSyncErrorCodeResult {
  const retryAfterMs = parseRetryAfter(retryAfterHeader)

  switch (status) {
    case 401:
      return { code: 'invalid_api_key', message: 'API Key 无效' }
    case 402:
      return { code: 'insufficient_credits', message: '余额不足', retryAfterMs }
    case 403:
      return { code: 'forbidden', message: '权限受限' }
    case 408:
      return { code: 'timeout', message: '请求超时' }
    case 429:
      return { code: 'rate_limited', message: '请求过于频繁', retryAfterMs }
    case 502:
    case 503:
      return { code: 'service_unavailable', message: 'OpenRouter 服务暂不可用', retryAfterMs }
    default:
      return { code: 'bad_response', message: `响应格式异常 (HTTP ${status})` }
  }
}

export function mapErrorToSyncCode(error: unknown): CatalogSyncErrorCodeResult {
  const code = error && typeof error === 'object' ? String((error as any).code ?? '') : ''
  const msg = error instanceof Error ? error.message : String(error ?? '')
  const normalized = `${code} ${msg}`.toLowerCase()

  if (code === 'cache_corrupted' || normalized.includes('cache_corrupted')) {
    return { code: 'cache_corrupted', message: '模型目录数据异常' }
  }

  if (
    code === 'ERR_UNAVAILABLE' ||
    code === 'db_unavailable' ||
    normalized.includes('db worker not initialized') ||
    normalized.includes('db worker call timed out') ||
    normalized.includes('sqlite')
  ) {
    return { code: 'db_unavailable', message: '数据库暂不可用' }
  }

  if (error && typeof error === 'object' && 'status' in error && typeof (error as any).status === 'number') {
    const httpError = error as { status: number; code?: number | null; retryAfter?: string | null }
    return mapHttpErrorToCode(httpError.status, httpError.code, httpError.retryAfter)
  }

  if (isTimeoutError(error)) {
    return { code: 'timeout', message: '请求超时' }
  }

  if (isNetworkError(error)) {
    return { code: 'network_unreachable', message: '网络不可达' }
  }
  return { code: 'unknown_error', message: msg || '未知错误' }
}

export function mapMissingApiKeyToCode(): CatalogSyncErrorCodeResult {
  return { code: 'missing_api_key', message: '未设置 API Key' }
}

export function mapCacheCorruptedToCode(): CatalogSyncErrorCodeResult {
  return { code: 'cache_corrupted', message: '模型目录数据异常' }
}

export function mapDbUnavailableToCode(): CatalogSyncErrorCodeResult {
  return { code: 'db_unavailable', message: '数据库暂不可用' }
}
