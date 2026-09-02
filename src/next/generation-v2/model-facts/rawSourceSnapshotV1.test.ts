import { describe, expect, it } from 'vitest'
import {
  buildRawSourceSnapshotRefV1,
  decodeRawSourceSnapshotRefV1,
  InMemoryRawPayloadStoreV1,
  sanitizeRawSourcePayloadV1,
} from './rawSourceSnapshotV1'

describe('raw source snapshot V1', () => {
  it('persists sanitized audit payload and deterministic source revision', () => {
    const raw = sanitizeRawSourcePayloadV1({ recordKey: 'root', payload: {
      data: [{ id: 'model-a', context_length: 4096 }], authorization: 'Bearer secret',
    } })
    expect(raw.persistedPayload).toEqual({ authorization: '[redacted]',
      data: [{ context_length: 4096, id: 'model-a' }] })
    expect(raw.redactedPaths).toEqual(['authorization'])
    const snapshot = buildRawSourceSnapshotRefV1({ sourceKind: 'provider_native', sourceScopeId: 'scope:a',
      recordSetCompleteness: 'complete', rawEnvelopeRefs: [raw.ref] })
    expect(buildRawSourceSnapshotRefV1({ sourceKind: 'provider_native', sourceScopeId: 'scope:a',
      recordSetCompleteness: 'complete', rawEnvelopeRefs: [raw.ref] })).toEqual(snapshot)
    expect(decodeRawSourceSnapshotRefV1(snapshot)).toEqual(snapshot)
    expect(() => decodeRawSourceSnapshotRefV1({ ...snapshot, sourceScopeId: 'scope:other' })).toThrow()

    const store = new InMemoryRawPayloadStoreV1()
    store.put(raw)
    expect(store.readRawPayload(raw.ref)).toEqual(raw.persistedPayload)
  })

  it('rejects non-JSON and secret-bearing digest misuse', () => {
    expect(() => sanitizeRawSourcePayloadV1({ recordKey: 'x', payload: { value: Number.NaN } })).toThrow()
    expect(() => sanitizeRawSourcePayloadV1({ recordKey: 'x', payload: {}, networkPayloadSha256: 'bad' })).toThrow()
  })

  it('accepts a bounded full-distribution payload larger than the former 100k-key ceiling', () => {
    const payload = Object.fromEntries(Array.from({ length: 100_001 }, (_, index) => [`model-${index}`, index]))
    expect(sanitizeRawSourcePayloadV1({ recordKey: 'models-dev:api.json', payload }).ref.storeId)
      .toMatch(/^canonical-raw-v1:/u)
  })
})
