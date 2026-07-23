import { describe, expect, it } from 'vitest'
import { decodeToolRegistryRevisionV2, selectToolDefinitionsV2 } from './toolRegistryV2'

describe('toolRegistryV2', () => {
  it('canonicalizes exact immutable function definitions', () => {
    const registry = decodeToolRegistryRevisionV2({
      schemaVersion: 2,
      definitions: [{
        toolId: 'tool:weather', kind: 'function', sideEffectPolicy: 'none',
        function: { name: 'weather', description: 'Lookup weather', parameters: {
          required: ['city'], type: 'object', properties: { city: { type: 'string' } },
        }, strict: true },
      }],
    })
    expect(registry.revision).toBe(`tool-registry-v2:${registry.definitionsDigest}`)
    expect(selectToolDefinitionsV2(registry, ['tool:weather'])[0].function).toMatchObject({ name: 'weather', strict: true })
  })

  it('rejects duplicate ids, names, unknown fields and missing selections', () => {
    const base = { kind: 'function', sideEffectPolicy: 'none', function: { name: 'weather' } }
    expect(() => decodeToolRegistryRevisionV2({ schemaVersion: 2, definitions: [
      { ...base, toolId: 'tool:a' }, { ...base, toolId: 'tool:b' },
    ] })).toThrow('GENERATION_V2_TOOL_REGISTRY_DUPLICATE_VALUE')
    expect(() => decodeToolRegistryRevisionV2({ schemaVersion: 2, definitions: [
      { ...base, toolId: 'tool:a', extra: true },
    ] })).toThrow('GENERATION_V2_TOOL_REGISTRY_INVALID_SHAPE')
    const registry = decodeToolRegistryRevisionV2({ schemaVersion: 2, definitions: [{ ...base, toolId: 'tool:a' }] })
    expect(() => selectToolDefinitionsV2(registry, ['tool:missing']))
      .toThrow('GENERATION_V2_TOOL_REGISTRY_INVALID_VALUE')
  })
})
