import { describe, expect, it } from 'vitest'
import {
  buildSourcePriorityConfigV1,
  DEFAULT_SOURCE_PRIORITY_CONFIG_V1,
  DEFAULT_SOURCE_PRIORITY_MAP_V1,
  decodeSourcePriorityConfigV1,
  sourcePriorityConfigSemanticJsonV1,
} from './sourcePriorityConfigV1'

describe('source priority configuration V1', () => {
  it('uses the frozen default ordering and canonical semantic JSON', () => {
    expect(DEFAULT_SOURCE_PRIORITY_CONFIG_V1.priorities).toEqual(DEFAULT_SOURCE_PRIORITY_MAP_V1)
    expect(sourcePriorityConfigSemanticJsonV1(DEFAULT_SOURCE_PRIORITY_MAP_V1)).toBe(
      '{"priorities":{"capability_rule":1,"models_dev":2,"provider_native":3},"schemaVersion":1}',
    )
    expect(DEFAULT_SOURCE_PRIORITY_CONFIG_V1.sourcePriorityConfigRevision).toBe(
      'source-priority-config-v1:7a9d26087a8c59524515118084e871ba713028c058e08029882d36f1572c13c7',
    )
  })

  it('accepts equal priorities and produces insertion-order-independent revisions', () => {
    const first = buildSourcePriorityConfigV1({ provider_native: 4, models_dev: 4, capability_rule: 4 })
    const second = buildSourcePriorityConfigV1({ capability_rule: 4, provider_native: 4, models_dev: 4 })
    expect(first).toEqual(second)
    expect(decodeSourcePriorityConfigV1(first)).toEqual(first)
  })

  it('rejects non-safe integer priorities and unknown keys', () => {
    expect(() => buildSourcePriorityConfigV1({ provider_native: 1.5, models_dev: 2, capability_rule: 3 }))
      .toThrow('GENERATION_V2_SOURCE_PRIORITY_CONFIG_INVALID')
    expect(() => buildSourcePriorityConfigV1({ provider_native: Number.MAX_SAFE_INTEGER + 1, models_dev: 2, capability_rule: 3 }))
      .toThrow('GENERATION_V2_SOURCE_PRIORITY_CONFIG_INVALID')
    expect(() => buildSourcePriorityConfigV1({ provider_native: 1, models_dev: 2, capability_rule: 3, extra: 4 }))
      .toThrow('GENERATION_V2_SOURCE_PRIORITY_CONFIG_INVALID')
  })

  it('rejects a revision that does not match the semantic priorities', () => {
    expect(() => decodeSourcePriorityConfigV1({
      schemaVersion: 1,
      priorities: DEFAULT_SOURCE_PRIORITY_MAP_V1,
      sourcePriorityConfigRevision: 'source-priority-config-v1:' + '0'.repeat(64),
    })).toThrow('GENERATION_V2_SOURCE_PRIORITY_CONFIG_INVALID')
  })
})
