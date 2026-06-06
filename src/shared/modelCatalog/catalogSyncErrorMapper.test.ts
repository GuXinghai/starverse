import { describe, expect, it } from 'vitest'
import {
  mapCacheCorruptedToCode,
  mapDbUnavailableToCode,
  mapHttpErrorToCode,
  mapErrorToSyncCode,
  mapMissingApiKeyToCode,
} from './catalogSyncErrorMapper'

describe('mapMissingApiKeyToCode', () => {
  it('returns missing_api_key', () => {
    expect(mapMissingApiKeyToCode()).toEqual({ code: 'missing_api_key', message: '未设置 API Key' })
  })
})

describe('mapHttpErrorToCode', () => {
  it('maps 401 to invalid_api_key', () => {
    const result = mapHttpErrorToCode(401, null, null)
    expect(result.code).toBe('invalid_api_key')
  })

  it('maps 402 to insufficient_credits', () => {
    const result = mapHttpErrorToCode(402, null, null)
    expect(result.code).toBe('insufficient_credits')
  })

  it('maps 403 to forbidden', () => {
    const result = mapHttpErrorToCode(403, null, null)
    expect(result.code).toBe('forbidden')
  })

  it('maps 408 to timeout', () => {
    const result = mapHttpErrorToCode(408, null, null)
    expect(result.code).toBe('timeout')
  })

  it('maps 429 to rate_limited', () => {
    const result = mapHttpErrorToCode(429, null, null)
    expect(result.code).toBe('rate_limited')
  })

  it('maps 429 with Retry-After to rate_limited with retryAfterMs', () => {
    const result = mapHttpErrorToCode(429, null, '30')
    expect(result.code).toBe('rate_limited')
    expect(result.retryAfterMs).toBe(30000)
  })

  it('maps 502 to service_unavailable', () => {
    const result = mapHttpErrorToCode(502, null, null)
    expect(result.code).toBe('service_unavailable')
  })

  it('maps 503 to service_unavailable', () => {
    const result = mapHttpErrorToCode(503, null, null)
    expect(result.code).toBe('service_unavailable')
  })

  it('maps 503 with Retry-After to service_unavailable with retryAfterMs', () => {
    const result = mapHttpErrorToCode(503, null, '60')
    expect(result.code).toBe('service_unavailable')
    expect(result.retryAfterMs).toBe(60000)
  })

  it('maps unknown status to bad_response', () => {
    const result = mapHttpErrorToCode(500, null, null)
    expect(result.code).toBe('bad_response')
  })
})

describe('mapErrorToSyncCode', () => {
  it('maps cache_corrupted errors without falling through to unknown_error', () => {
    const result = mapErrorToSyncCode(new Error('cache_corrupted: scoped active snapshot is missing'))
    expect(result.code).toBe('cache_corrupted')
  })

  it('maps DB worker unavailable errors without falling through to unknown_error', () => {
    const result = mapErrorToSyncCode({ code: 'ERR_UNAVAILABLE', message: 'DB worker not initialized' })
    expect(result.code).toBe('db_unavailable')
  })

  it('maps HTTP error object with status 401', () => {
    const error = { status: 401, statusText: 'Unauthorized', message: 'Invalid API key' }
    const result = mapErrorToSyncCode(error)
    expect(result.code).toBe('invalid_api_key')
  })

  it('maps HTTP error object with status 429', () => {
    const error = { status: 429, statusText: 'Too Many Requests', message: 'Rate limited', retryAfter: '15' }
    const result = mapErrorToSyncCode(error)
    expect(result.code).toBe('rate_limited')
    expect(result.retryAfterMs).toBe(15000)
  })

  it('maps AbortError to timeout', () => {
    const error = new Error('The operation was aborted')
    error.name = 'AbortError'
    const result = mapErrorToSyncCode(error)
    expect(result.code).toBe('timeout')
  })

  it('maps timeout message to timeout', () => {
    const error = new Error('Request timeout after 30000ms')
    const result = mapErrorToSyncCode(error)
    expect(result.code).toBe('timeout')
  })

  it('maps TypeError fetch failure to network_unreachable', () => {
    const error = new TypeError('Failed to fetch')
    const result = mapErrorToSyncCode(error)
    expect(result.code).toBe('network_unreachable')
  })

  it('maps ECONNRESET to network_unreachable', () => {
    const error = new Error('read ECONNRESET') as any
    error.code = 'ECONNRESET'
    const result = mapErrorToSyncCode(error)
    expect(result.code).toBe('network_unreachable')
  })

  it('maps ENOTFOUND to network_unreachable', () => {
    const error = new Error('getaddrinfo ENOTFOUND') as any
    error.code = 'ENOTFOUND'
    const result = mapErrorToSyncCode(error)
    expect(result.code).toBe('network_unreachable')
  })

  it('maps unknown error to unknown_error', () => {
    const error = new Error('something weird')
    const result = mapErrorToSyncCode(error)
    expect(result.code).toBe('unknown_error')
  })

  it('maps non-Error value to unknown_error', () => {
    const result = mapErrorToSyncCode('string error')
    expect(result.code).toBe('unknown_error')
  })
})

describe('explicit catalog sync error mappers', () => {
  it('maps cache_corrupted', () => {
    expect(mapCacheCorruptedToCode()).toEqual({ code: 'cache_corrupted', message: '模型目录数据异常' })
  })

  it('maps db_unavailable', () => {
    expect(mapDbUnavailableToCode()).toEqual({ code: 'db_unavailable', message: '数据库暂不可用' })
  })
})
