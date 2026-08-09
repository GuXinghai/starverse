import { describe, expect, it } from 'vitest'
import {
  GenerationV2Digest,
  GenerationV2Identity,
  isGenerationV2Digest,
  isGenerationV2Identity,
  readGenerationV2Digest,
  readGenerationV2Identity,
} from './identityV2'

describe('Generation V2 runtime identities', () => {
  it('creates immutable kind-bound identities without exposing a public constructor', () => {
    const provider = GenerationV2Identity.create('provider_id', 'openai')
    expect(readGenerationV2Identity(provider, 'provider_id')).toBe('openai')
    expect(isGenerationV2Identity(provider, 'provider_id')).toBe(true)
    expect(isGenerationV2Identity(provider, 'model_id')).toBe(false)
    expect(provider.toJSON()).toEqual({ kind: 'provider_id', value: 'openai' })
    expect(() => Reflect.construct(GenerationV2Identity as never, ['provider_id', 'openai']))
      .toThrow('GENERATION_V2_IDENTITY_INVALID_VALUE')
    expect(() => Object.setPrototypeOf(provider, {})).toThrow()
  })

  it('rejects empty, padded, controlled and oversized identity values', () => {
    for (const value of ['', ' openai', 'openai ', 'open\nrouter', 'x'.repeat(513)]) {
      expect(() => GenerationV2Identity.create('provider_id', value)).toThrow('GENERATION_V2_IDENTITY_INVALID_VALUE')
    }
    expect(() => GenerationV2Identity.create('unknown' as never, 'openai'))
      .toThrow('GENERATION_V2_IDENTITY_INVALID_KIND')
  })

  it('accepts only lowercase sha-256 digests and binds them to their purpose', () => {
    const hash = 'a'.repeat(64)
    const snapshot = GenerationV2Digest.create('snapshot_hash', hash)
    expect(readGenerationV2Digest(snapshot, 'snapshot_hash')).toBe(hash)
    expect(isGenerationV2Digest(snapshot, 'snapshot_hash')).toBe(true)
    expect(isGenerationV2Digest(snapshot, 'body_sha256')).toBe(false)
    expect(() => GenerationV2Digest.create('snapshot_hash', 'A'.repeat(64))).toThrow('GENERATION_V2_DIGEST_INVALID')
    expect(() => GenerationV2Digest.create('snapshot_hash', 'a'.repeat(63))).toThrow('GENERATION_V2_DIGEST_INVALID')
    expect(() => GenerationV2Digest.create('unknown' as never, hash)).toThrow('GENERATION_V2_DIGEST_INVALID')
    let coercionCalls = 0
    const coercible = { toString: () => { coercionCalls += 1; return hash } }
    expect(() => GenerationV2Digest.create('snapshot_hash', coercible as never)).toThrow('GENERATION_V2_DIGEST_INVALID')
    expect(coercionCalls).toBe(0)
    expect(() => Reflect.construct(GenerationV2Digest as never, ['snapshot_hash', hash]))
      .toThrow('GENERATION_V2_DIGEST_INVALID')
  })

  it('rejects structurally similar unbranded values at runtime', () => {
    const forged = { kind: 'provider_id', value: 'openai' }
    expect(isGenerationV2Identity(forged, 'provider_id')).toBe(false)
    expect(() => readGenerationV2Identity(forged as never, 'provider_id'))
      .toThrow('GENERATION_V2_IDENTITY_INVALID_KIND')
    expect(isGenerationV2Identity(JSON.parse(JSON.stringify(
      GenerationV2Identity.create('provider_id', 'openai'),
    )), 'provider_id')).toBe(false)
  })
})
