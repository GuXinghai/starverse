import { describe, expect, it } from 'vitest'
import {
  createNoopMagikaAdapter,
  mapMagikaOutputToEvidence,
  runMagikaProbe,
  runMagikaRuntimeProbe,
} from './magikaAdapter'
import {
  createMockMagikaRuntimeLoader,
  createUnavailableMagikaRuntimeLoader,
} from './magikaRuntimeLoader'

describe('magikaAdapter', () => {
  it('maps known magika labels through taxonomy map', () => {
    const evidence = mapMagikaOutputToEvidence({ label: 'pdf', score: 0.94 })
    expect(evidence.detectedFormatId).toBe('pdf')
    expect(evidence.confidence).toBe('high')
    expect(evidence.source).toBe('magika')
  })

  it('keeps unknown labels in low-confidence unknown bucket', () => {
    const evidence = mapMagikaOutputToEvidence({ label: 'totally-unknown-label', score: 0.99 })
    expect(evidence.detectedFormatId).toBe('unknown')
    expect(evidence.confidence).toBe('low')
    expect(evidence.note).toContain('unmapped')
  })

  it('supports a noop adapter for mockable stage usage', async () => {
    const evidence = await runMagikaProbe(createNoopMagikaAdapter(), {
      bytes: new Uint8Array([1, 2, 3]),
      filename: 'a.bin',
    })
    expect(evidence).toBeNull()
  })

  it('records modelVersion from runtime loader on mapped evidence', async () => {
    const probe = await runMagikaRuntimeProbe(
      createMockMagikaRuntimeLoader({
        modelVersion: 'magika-model-v1',
        output: { label: 'pdf', score: 0.95 },
      }),
      {
        bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
        filename: 'a.pdf',
      }
    )
    expect(probe.unavailableReason).toBeNull()
    expect(probe.modelVersion).toBe('magika-model-v1')
    expect(probe.evidence?.engineVersion).toBe('magika-model-v1')
    expect(probe.evidence?.detectedFormatId).toBe('pdf')
  })

  it('returns structured unavailable result without throwing', async () => {
    const probe = await runMagikaRuntimeProbe(
      createUnavailableMagikaRuntimeLoader({
        reason: 'runtime_unavailable',
        detail: 'runtime disabled',
        modelVersion: 'magika-model-v2',
      }),
      {
        bytes: new Uint8Array([1]),
      }
    )
    expect(probe.evidence).toBeNull()
    expect(probe.unavailableReason).toBe('runtime_unavailable')
    expect(probe.modelVersion).toBe('magika-model-v2')
  })

  it('propagates adapter_only runtimeKind through evidence without mock label', async () => {
    const probe = await runMagikaRuntimeProbe(
      createMockMagikaRuntimeLoader({
        runtimeKind: 'adapter_only',
        modelVersion: null,
        output: { label: 'json', score: 0.93 },
      }),
      {
        bytes: new Uint8Array([0x7b, 0x22, 0x6b, 0x22, 0x3a, 0x31, 0x7d]),
        filename: 'data.json',
      }
    )
    expect(probe.unavailableReason).toBeNull()
    expect(probe.runtimeKind).toBe('adapter_only')
    expect(probe.modelVersion).toBeNull()
    expect(probe.evidence?.engineRuntimeKind).toBe('adapter_only')
    expect(probe.evidence?.engineVersion).toBeNull()
    expect(probe.evidence?.detectedFormatId).toBe('json')
  })
})
