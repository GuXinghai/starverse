import { describe, expect, it } from 'vitest'
import { createProviderFailureV2 } from './providerFailureV2'
import {
  PROVIDER_FAILURE_UI_LIMIT_BYTES_V2,
  projectProviderFailureEnvelopeForUiV2,
} from './providerFailureUiProjectionV2'

describe('ProviderFailure UI projection V2', () => {
  it('limits the complete UI envelope and records the original raw body digest', () => {
    const failure = createProviderFailureV2({
      context: { origin: 'http_response', phase: 'response_body', provider: { namespace: 'generation_execution', id: 'google_ai_studio' },
        contractId: 'gemini-models-v1beta', operationId: 'catalog:test', requestSequence: 1 },
      httpStatus: 400,
      bodyText: JSON.stringify({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'x'.repeat(200_000) } }),
    })
    const projection = projectProviderFailureEnvelopeForUiV2(failure)
    const encodedBytes = new TextEncoder().encode(JSON.stringify(projection)).byteLength
    expect(encodedBytes).toBeLessThanOrEqual(PROVIDER_FAILURE_UI_LIMIT_BYTES_V2)
    expect(projection.projectedBytes).toBe(encodedBytes)
    expect(projection.uiTruncations).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'providerError.rawJson', sha256: expect.stringMatching(/^[0-9a-f]{64}$/u) }),
    ]))
    expect(projection.failure.providerError).toMatchObject({ code: 400, status: 'INVALID_ARGUMENT' })
  })
})
