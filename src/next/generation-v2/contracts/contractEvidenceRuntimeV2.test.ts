import { describe, expect, it } from 'vitest'
import { assertRuntimeEvidenceUsableV2 } from './contractEvidenceRuntimeV2'

describe('contract evidence runtime V2', () => {
  it('does not block ordinary contract review expiry', () => {
    expect(() => assertRuntimeEvidenceUsableV2({ nowMs: 100 })).not.toThrow()
  })

  it('blocks only explicit dynamic hard expiry and retirement evidence', () => {
    expect(() => assertRuntimeEvidenceUsableV2({ nowMs: 100, dynamicCapability: {
      evidenceId: 'endpoint', refreshAfter: '1970-01-01T00:00:00.000Z', expiresAt: null,
      hardExpireAt: '1970-01-01T00:00:00.050Z',
    } })).toThrow('DYNAMIC_CAPABILITY_HARD_EXPIRED')
    expect(() => assertRuntimeEvidenceUsableV2({ nowMs: 100, modelRetirement: {
      providerId: 'openai', modelId: 'gpt-5', retiredAt: '1970-01-01T00:00:00.050Z',
      sourceUrl: 'https://provider.test/retirement', sourceDigest: 'a'.repeat(64), reason: 'retired',
    } })).toThrow('MODEL_RETIRED')
  })
})
