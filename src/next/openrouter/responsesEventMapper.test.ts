import { afterEach, describe, expect, it, vi } from 'vitest'
import { getApprovedDebugFlagStorageKey } from '@/shared/diagnostics/flags'
import { mapResponsesEventToTerminal, RESPONSES_TRUNCATION_CODES } from './responsesEventMapper'
import { DEFAULT_OPENROUTER_TEST_MODEL } from './openRouterTestModels'

const request = { model: DEFAULT_OPENROUTER_TEST_MODEL, stream: true }

describe('mapResponsesEventToTerminal lifecycle', () => {
  afterEach(() => {
    globalThis.localStorage?.removeItem(getApprovedDebugFlagStorageKey('responses'))
    vi.restoreAllMocks()
  })

  it('maps response.failed to error envelope', () => {
    const result = mapResponsesEventToTerminal({
      event: {
        type: 'response.failed',
        response: {
          id: 'resp_1',
          status: 'failed',
          error: { code: 'server_error', message: 'Provider crashed' },
        },
      },
      request,
    })

    expect(result?.completionClass).toBe('error')
    expect(result?.envelope?.phase).toBe('responses')
    expect(result?.envelope?.openrouter?.code).toBe('server_error')
    expect(result?.envelope?.openrouter?.message).toBe('Provider crashed')
    expect(result?.envelope?.stream?.generation_id).toBe('resp_1')
  })

  it('maps response.error to error envelope', () => {
    const result = mapResponsesEventToTerminal({
      event: {
        type: 'response.error',
        error: { code: 'rate_limit_exceeded', message: 'slow down' },
      },
      request,
    })

    expect(result?.completionClass).toBe('error')
    expect(result?.envelope?.openrouter?.code).toBe('rate_limit_exceeded')
    expect(result?.envelope?.openrouter?.message).toBe('slow down')
  })

  it('maps plain error event to error envelope', () => {
    const result = mapResponsesEventToTerminal({
      event: {
        type: 'error',
        error: { code: 'invalid_api_key', message: 'bad key' },
      },
      request,
    })

    expect(result?.completionClass).toBe('error')
    expect(result?.envelope?.openrouter?.code).toBe('invalid_api_key')
    expect(result?.envelope?.openrouter?.message).toBe('bad key')
  })

  it('maps response.incomplete to truncated completionClass', () => {
    const result = mapResponsesEventToTerminal({
      event: {
        type: 'response.incomplete',
        response: {
          id: 'resp_2',
          status: 'incomplete',
          incomplete_details: { reason: 'max_tokens' },
        },
      },
      request,
    })

    expect(result?.completionClass).toBe('truncated')
    expect(result?.envelope?.openrouter?.code).toBe('max_tokens')
    expect(result?.envelope?.openrouter?.message).toContain('Response incomplete')
  })
})

describe('mapResponsesEventToTerminal completion state', () => {
  it('maps response.completed to ok without envelope', () => {
    const result = mapResponsesEventToTerminal({
      event: {
        type: 'response.completed',
        response: { id: 'resp_3', status: 'completed' },
      },
      request,
    })

    expect(result?.completionClass).toBe('ok')
    expect(result?.envelope).toBeUndefined()
  })

  it('maps configured truncation codes to truncated even on error events', () => {
    for (const code of RESPONSES_TRUNCATION_CODES) {
      const result = mapResponsesEventToTerminal({
        event: {
          type: 'response.error',
          error: { code, message: `hit ${code}` },
        },
        request,
      })
      expect(result?.completionClass).toBe('truncated')
      expect(result?.envelope?.openrouter?.code).toBe(code)
    }
  })

  it('ignores unknown event types', () => {
    const result = mapResponsesEventToTerminal({
      event: { type: 'response.delta', response: { id: 'resp_delta' } },
      request,
    })
    expect(result).toBeNull()
  })
})

describe('mapResponsesEventToTerminal debug logging', () => {
  it('only emits responses debug logs when the approved flag is enabled', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

    mapResponsesEventToTerminal({
      event: {
        type: 'response.error',
        error: { code: 'server_error', message: 'boom' },
      },
      request,
    })
    expect(debugSpy).not.toHaveBeenCalled()

    globalThis.localStorage?.setItem(getApprovedDebugFlagStorageKey('responses'), '1')

    mapResponsesEventToTerminal({
      event: {
        type: 'response.error',
        error: { code: 'server_error', message: 'boom' },
      },
      request,
    })
    expect(debugSpy).toHaveBeenCalledWith('[responses] error_code', {
      eventType: 'response.error',
      code: 'server_error',
    })
  })
})
