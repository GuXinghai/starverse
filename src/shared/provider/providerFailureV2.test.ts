import { describe, expect, it } from 'vitest'
import {
  PROVIDER_FAILURE_RAW_LIMIT_BYTES_V2,
  createProviderFailureV2,
  decodeProviderFailureV2,
  ProviderFailureErrorV2,
  providerFailureFromUnknownV2,
  providerFailurePrimaryMessageV2,
} from './providerFailureV2'

describe('ProviderFailureV2', () => {
  it.each([
    '"headers":{"Authorization":"Bearer DUMMY_FRAME_SECRET","Cookie":"session=DUMMY_COOKIE"}',
    '"headers":{"Authorization":"Bearer prefix\'DUMMY_FRAME_SECRET","Cookie":"prefix\'DUMMY_COOKIE"}',
    "'headers':{'Proxy-Authorization':'Bearer prefix\"DUMMY_FRAME_SECRET','Set-Cookie':'prefix\"DUMMY_COOKIE'}",
  ])('redacts quoted credentials in malformed JSON SSE excerpts before truncation: %s', (headers) => {
    const failure = createProviderFailureV2({
      context: { origin: 'response_decoder', phase: 'stream_decode', provider: { namespace: 'generation_execution',
        id: 'google_ai_studio' }, contractId: 'gemini-interactions-v1beta', operationId: 'bad-frame', requestSequence: 1 },
      rawFrameExcerpt: `event: step.delta\ndata: {${headers},"index":"bad",BROKEN}`,
    })
    expect(failure.rawFrameExcerpt).toContain('step.delta')
    expect(failure.rawFrameExcerpt).toContain('"index":"bad"')
    expect(JSON.stringify(failure)).not.toMatch(/DUMMY_FRAME_SECRET|DUMMY_COOKIE/)
    expect(failure.redactions.map(r => r.reason)).toEqual(expect.arrayContaining(['authorization_header', 'cookie']))
  })
  it('preserves provider HTTP facts without assigning a semantic category', () => {
    const failure = createProviderFailureV2({
      context: {
        origin: 'http_response', phase: 'response_headers', provider: { namespace: 'generation_execution', id: 'openai_responses' }, contractId: 'openai-responses-v1', operationId: 'op-1', requestSequence: 1,
      },
      httpStatus: 400,
      httpStatusText: 'Bad Request',
      body: { error: { message: 'model does not exist or you do not have access', type: 'invalid_request_error', param: 'model', code: 'model_not_found', request_id: 'req-1' } },
      headers: { 'retry-after': '30' },
    })
    expect(failure).toMatchObject({
      origin: 'http_response', phase: 'response_headers', httpStatus: 400, httpStatusText: 'Bad Request',
      providerError: { code: 'model_not_found', type: 'invalid_request_error', param: 'model', requestId: 'req-1', retryAfterMs: 30_000 },
    })
    expect(failure).not.toHaveProperty('category')
    expect(providerFailurePrimaryMessageV2(failure)).toContain('model does not exist')
  })

  it('keeps non-JSON response text and records credential redaction', () => {
    const failure = createProviderFailureV2({
      context: { origin: 'network_transport', phase: 'response_body', provider: { namespace: 'catalog_source', id: 'anthropic_messages' }, contractId: 'anthropic-messages-v1', operationId: 'op-2', requestSequence: 1 },
      bodyText: 'Authorization: Bearer secret\nproxy https://user:password@example.test failed',
    })
    expect(failure.providerError?.rawText).toContain('[redacted]')
    expect(failure.redactions.map((item) => item.reason)).toEqual(expect.arrayContaining(['authorization_header', 'url_credential']))
  })

  it('bounds raw error text and records the original size and digest', () => {
    const bodyText = 'x'.repeat(PROVIDER_FAILURE_RAW_LIMIT_BYTES_V2 + 10)
    const failure = createProviderFailureV2({
      context: { origin: 'response_decoder', phase: 'stream_decode', provider: { namespace: 'generation_execution', id: 'deepseek' }, contractId: 'deepseek-chat-v1', operationId: 'op-3', requestSequence: 2 },
      bodyText,
    })
    expect(new TextEncoder().encode(failure.providerError?.rawText ?? '').byteLength).toBeLessThanOrEqual(PROVIDER_FAILURE_RAW_LIMIT_BYTES_V2)
    expect(failure.truncations).toHaveLength(1)
    expect(failure.redactions).toContainEqual({ path: 'providerError.rawText', reason: 'size_limit' })
  })

  it.each(['x-api-key:', 'X-Goog-Api-Key=', 'api_key:', 'API key ', 'apiKey="'])
  ('redacts the %s label with and without an unrelated safe URL', (label) => {
    for (const suffix of ['', ' See https://docs.example.test/api-key/docs?lang=en']) {
      const failure = createProviderFailureV2({
        context: { origin: 'http_response', phase: 'response_body', provider: { namespace: 'generation_execution', id: 'openai_responses' },
          contractId: 'openai-responses-v1', operationId: 'op-label', requestSequence: 1 },
        bodyText: `${label}AUDIT_DUMMY_LABEL${suffix}`,
      })
      expect(JSON.stringify(failure)).not.toContain('AUDIT_DUMMY_LABEL')
      expect(failure.providerError?.rawText).toContain('[redacted]')
      if (suffix) expect(failure.providerError?.rawText).toContain('https://docs.example.test/api-key/docs?lang=en')
      expect(failure.redactions).toContainEqual({ path: 'providerError.rawText', reason: 'credential' })
    }
  })

  it.each(['body', 'bodyText'] as const)('redacts nested provider headers through the %s factory input', (bodyInput) => {
    const body = { error: { code: 'invalid_api_key', type: 'authentication_error', param: 'model', request_id: 'req-safe',
      message: 'Invalid API key. See https://docs.example.test/api-key/docs',
      headers: { 'X-API-KEY': 'AUDIT_DUMMY_HEADER', nested: [{ 'x-Goog-api-KEY': 'AUDIT_DUMMY_GOOGLE',
        api_key: 'AUDIT_DUMMY_CONTROL', detail: 'x-api-key: AUDIT_DUMMY_DETAIL https://docs.example.test/help' }] } } }
    const failure = createProviderFailureV2({
      context: { origin: 'http_response', phase: 'response_body', provider: { namespace: 'catalog_source', id: 'google_ai_studio' },
        contractId: 'gemini-models-v1beta', operationId: 'op-header', requestSequence: 1 },
      ...(bodyInput === 'body' ? { body } : { bodyText: JSON.stringify(body) }),
      httpStatus: 401,
    })
    expect(JSON.stringify(failure)).not.toContain('AUDIT_DUMMY_')
    expect(failure.providerError).toMatchObject({ code: 'invalid_api_key', type: 'authentication_error', param: 'model', requestId: 'req-safe' })
    expect(failure.providerError?.rawJson).toMatchObject({ error: { headers: {
      'X-API-KEY': '[redacted]', nested: [{ 'x-Goog-api-KEY': '[redacted]', api_key: '[redacted]' }],
    } } })
    const rawPath = bodyInput === 'body' ? 'providerError.rawJson' : 'providerError.rawText'
    expect(failure.redactions).toContainEqual({ path: `${rawPath}.error.headers.X-API-KEY`, reason: 'credential' })
    expect(failure.redactions).toContainEqual({ path: `${rawPath}.error.headers.nested[0].x-Goog-api-KEY`, reason: 'credential' })
  })

  it.each([
    'failed: "x-api-key": "AUDIT_DUMMY_TOKEN" see https://docs.example.test/api-key/docs',
    'failed: "x-goog-api-key"=AUDIT_DUMMY_TOKEN see https://docs.example.test/api-key/docs',
    '{"error":{"x-api-key":"AUDIT_DUMMY_TOKEN","help":"https://docs.example.test/api-key/docs",',
  ])('redacts quoted header labels in non-JSON response and stream text: %s', (text) => {
    const failure = createProviderFailureV2({
      context: { origin: 'response_decoder', phase: 'stream_decode', provider: { namespace: 'generation_execution', id: 'openai_responses' },
        contractId: 'openai-responses-v1', operationId: 'op-quoted-label', requestSequence: 1 },
      bodyText: text,
      rawFrameExcerpt: text,
    })
    expect(JSON.stringify(failure)).not.toContain('AUDIT_DUMMY_TOKEN')
    expect(failure.providerError?.rawText).toContain('https://docs.example.test/api-key/docs')
    expect(failure.rawFrameExcerpt).toContain('https://docs.example.test/api-key/docs')
    expect(failure.redactions).toContainEqual({ path: 'providerError.rawText', reason: 'credential' })
    expect(failure.redactions).toContainEqual({ path: 'rawFrameExcerpt', reason: 'credential' })
  })

  it('redacts labels in transport and stream facts while preserving authorization, URL and diagnostic controls', () => {
    const failure = createProviderFailureV2({
      context: { origin: 'response_decoder', phase: 'stream_decode', provider: { namespace: 'generation_execution', id: 'deepseek' },
        contractId: 'deepseek-chat-v1', operationId: 'op-controls', requestSequence: 1 },
      bodyText: 'Authorization: Bearer AUDIT_DUMMY_AUTH\nSee https://docs.example.test/api-key/docs?api_key=AUDIT_DUMMY_QUERY&lang=en\nproxy https://user:AUDIT_DUMMY_PASSWORD@example.test failed',
      rawFrameExcerpt: 'x-goog-api-key: AUDIT_DUMMY_FRAME https://docs.example.test/help',
      transportError: new Error('x-api-key= AUDIT_DUMMY_TRANSPORT https://docs.example.test/help'),
    })
    expect(JSON.stringify(failure)).not.toContain('AUDIT_DUMMY_')
    expect(failure.providerError?.rawText).toContain('https://docs.example.test/api-key/docs?api_key=[redacted]&lang=en')
    expect(failure.redactions.map((item) => item.reason)).toEqual(expect.arrayContaining(['authorization_header', 'url_credential', 'credential']))
    expect(failure.redactions).toContainEqual({ path: 'rawFrameExcerpt', reason: 'credential' })
    expect(failure.redactions).toContainEqual({ path: 'transportError.message', reason: 'credential' })
  })

  it('preserves safe URLs and words that only contain a credential-label substring', () => {
    const bodyText = 'Invalid API key. See https://docs.example.test/api-key/docs?lang=en; not-an-x-api-key: public; api-keyword=public'
    const failure = createProviderFailureV2({
      context: { origin: 'http_response', phase: 'response_body', provider: { namespace: 'generation_execution', id: 'deepseek' },
        contractId: 'deepseek-chat-v1', operationId: 'op-safe', requestSequence: 1 },
      bodyText,
    })
    expect(failure.providerError?.rawText).toBe(bodyText)
    expect(failure.redactions).toEqual([])
  })

  it('redacts provider header names used as URL query credentials without consuming the useful URL', () => {
    const failure = createProviderFailureV2({
      context: { origin: 'http_response', phase: 'response_body', provider: { namespace: 'catalog_source', id: 'google_ai_studio' },
        contractId: 'gemini-models-v1beta', operationId: 'op-header-query', requestSequence: 1 },
      bodyText: 'See https://docs.example.test/api-key/docs?x-api-key=AUDIT_DUMMY_API&X-Goog-Api-Key=AUDIT_DUMMY_GOOGLE&lang=en',
    })
    expect(failure.providerError?.rawText).toBe('See https://docs.example.test/api-key/docs?x-api-key=[redacted]&X-Goog-Api-Key=[redacted]&lang=en')
    expect(failure.redactions).toEqual([{ path: 'providerError.rawText', reason: 'url_credential' }])
  })

  it('preserves compact provider JSON containing a safe URL while redacting only sensitive URL facts', () => {
    const failure = createProviderFailureV2({
      context: { origin: 'http_response', phase: 'response_body', provider: { namespace: 'catalog_source', id: 'google_ai_studio' },
        contractId: 'gemini-models-v1beta', operationId: 'op-url', requestSequence: 1 },
      bodyText: JSON.stringify({ error: { code: 400, status: 'INVALID_ARGUMENT',
        message: 'See https://ai.google.dev/gemini-api/docs?api_key=secret for details' } }),
    })
    expect(failure.providerError).toMatchObject({ code: 400, status: 'INVALID_ARGUMENT' })
    expect(failure.providerError?.message).toContain('https://ai.google.dev/gemini-api/docs?api_key=[redacted]')
    expect(failure.providerError?.rawJson).toMatchObject({
      error: { code: 400, message: expect.stringContaining('api_key=[redacted]') },
    })
    expect(failure.providerError?.rawText).toBeNull()
    expect(failure.redactions).toContainEqual(expect.objectContaining({ reason: 'url_credential' }))
  })

  it.each([
    { namespace: 'generation_execution', id: 'lmstudio' },
    { namespace: 'catalog_source', id: 'anthropic_messages' },
    { namespace: 'credential_slot', id: 'google_ai_studio' },
  ] as const)('strictly round-trips the $namespace provider namespace', (provider) => {
    const failure = createProviderFailureV2({
      context: { origin: 'provider_runtime', phase: 'request_open', provider,
        contractId: 'contract:1', operationId: 'operation:1', requestSequence: 1 },
      transportError: new Error('network unavailable'),
    })
    expect(decodeProviderFailureV2(JSON.parse(JSON.stringify(failure)))).toEqual(failure)
  })

  it('rejects missing, extra, aliased, and unqualified provider identity facts', () => {
    const valid = createProviderFailureV2({
      context: { origin: 'provider_runtime', phase: 'request_open',
        provider: { namespace: 'generation_execution', id: 'lmstudio' },
        contractId: 'contract:1', operationId: 'operation:1', requestSequence: 1 },
    })
    const raw = JSON.parse(JSON.stringify(valid)) as Record<string, unknown>
    const { httpStatusText: _omitted, ...missing } = raw
    expect(() => decodeProviderFailureV2(missing)).toThrow('PROVIDER_FAILURE_INVALID')
    expect(() => decodeProviderFailureV2({ ...raw, legacyProviderId: 'lm_studio' }))
      .toThrow('PROVIDER_FAILURE_INVALID')
    expect(() => decodeProviderFailureV2({ ...raw,
      provider: { namespace: 'generation_execution', id: 'lm_studio' } }))
      .toThrow('GENERATION_V2_EXECUTION_PROVIDER_ID_INVALID')
    expect(() => decodeProviderFailureV2({ ...raw, provider: 'lmstudio' }))
      .toThrow('PROVIDER_FAILURE_INVALID')
  })

  it('preserves provider facts while rebinding matching Catalog correlation to its operation authority', () => {
    const source = createProviderFailureV2({
      context: { origin: 'http_response', phase: 'response_headers',
        provider: { namespace: 'catalog_source', id: 'openrouter' },
        contractId: 'openrouter-chat-models-v1', operationId: 'source:1', requestSequence: 1 },
      httpStatus: 429,
      body: { error: { code: 'rate_limit', message: 'retry later' } },
    })
    const rebound = providerFailureFromUnknownV2(new ProviderFailureErrorV2(source), {
      origin: 'provider_runtime', phase: 'response_body',
      provider: { namespace: 'catalog_source', id: 'openrouter' },
      contractId: 'openrouter-chat-models-v1', operationId: 'catalog:authority:1', requestSequence: 2,
    })
    expect(rebound).toMatchObject({
      origin: 'http_response',
      operationId: 'catalog:authority:1',
      requestSequence: 2,
      httpStatus: 429,
      providerError: { code: 'rate_limit', message: 'retry later' },
    })
  })
})
