import { describe, expect, it } from 'vitest'
import {
  isContractReviewDueV2,
  isDynamicCapabilityHardExpiredV2,
  isModelRetiredV2,
  validateContractEvidenceV2,
} from './contractEvidenceV2'

const digest = 'a'.repeat(64)

describe('ContractEvidenceV2', () => {
  const evidence = validateContractEvidenceV2({
    contractId: 'openai-responses-v1', contractRevision: 'openai-responses-v1:1', verifiedAt: '2026-07-22T00:00:00Z',
    reviewAfter: '2026-08-22T00:00:00Z', stability: 'stable', sources: [{ url: 'https://platform.openai.com/docs', retrievedAt: '2026-07-22T00:00:00Z', digest }],
  })

  it('separates review governance from runtime blocking', () => {
    expect(isContractReviewDueV2(evidence, Date.parse('2026-09-01T00:00:00Z'))).toBe(true)
    expect(isDynamicCapabilityHardExpiredV2({ evidenceId: 'endpoint', refreshAfter: '2026-07-23T00:00:00Z', expiresAt: null, hardExpireAt: null }, Date.now())).toBe(false)
  })

  it('only marks a model retired from explicit retirement evidence', () => {
    expect(isModelRetiredV2({ providerId: 'openai', modelId: 'gpt-5', retiredAt: '2026-07-22T00:00:00Z', sourceUrl: 'https://status.example.test', sourceDigest: digest, reason: 'retired' }, Date.parse('2026-07-23T00:00:00Z'))).toBe(true)
  })
})
