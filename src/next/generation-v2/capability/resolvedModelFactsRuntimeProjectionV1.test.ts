import { describe, expect, it } from 'vitest'
import { decodeProviderBindingRecordV2 } from '../domain/providerBindingV2'
import { MODEL_CAPABILITY_SEMANTIC_PATHS_V2 } from './modelCapabilitySchemaV2'
import { projectResolvedModelFactsToRuntimeV2 } from './resolvedModelFactsRuntimeProjectionV1'
import type { ResolvedModelFactsV1 } from '../model-facts/resolvedModelFactsV1'

const binding = decodeProviderBindingRecordV2({
  credentialScopeId: 'credential-scope:test', providerId: 'openai_responses',
  endpointProfileId: 'openai-api-v1',
  endpointBinding: { kind: 'provider_managed_set', endpointSetRevision: 'endpoint-set:test',
    descriptors: [{ endpointId: 'responses', descriptorRevision: 'descriptor:test' }] },
  protocolContractId: 'openai-responses-v1', contractRevision: `openai-responses-v1:${'a'.repeat(64)}`,
  contractDefinitionDigest: 'a'.repeat(64), registryRevision: `provider-contract-registry-v1:${'b'.repeat(64)}`,
  modelId: 'gpt-5.4', operation: 'text',
})

function facts(...fields: readonly Readonly<Record<string, unknown>>[]): ResolvedModelFactsV1 {
  return {
    schemaVersion: 1,
    input: {} as ResolvedModelFactsV1['input'],
    fields: fields as unknown as ResolvedModelFactsV1['fields'],
    capabilityRevision: `capability-revision-v1:${'c'.repeat(64)}`,
  }
}

describe('Goal 3 model facts runtime projection V1', () => {
  it('projects only frozen facts, preserves the Goal 3 revision, and closes the runtime field set', () => {
    const projected = projectResolvedModelFactsToRuntimeV2({
      binding,
      resolvedFacts: facts({
        path: 'reasoning.support', state: 'resolved', selectedValue: { kind: 'support', value: 'supported' },
        completenessDisposition: 'complete', selectionReason: 'single_claim',
        supportingProvenance: [], opposingProvenance: [], overriddenProvenance: [], diagnostics: [],
      }),
    })
    expect(projected.capabilityRevision).toBe(`capability-revision-v1:${'c'.repeat(64)}`)
    expect(projected.fields.map((field) => field.path)).toEqual(MODEL_CAPABILITY_SEMANTIC_PATHS_V2)
    expect(projected.fields.find((field) => field.path === 'reasoning.mode')).toMatchObject({ state: 'supported' })
    expect(projected.fields.find((field) => field.path === 'generation.temperature')).toMatchObject({ state: 'unknown' })
  })

  it('keeps equal-priority conflict visible as runtime confirmation', () => {
    const projected = projectResolvedModelFactsToRuntimeV2({
      binding,
      resolvedFacts: facts({
        path: 'reasoning.support', state: 'conflict', completenessDisposition: 'complete',
        selectionReason: 'equal_priority_conflict', supportingProvenance: [], opposingProvenance: [],
        overriddenProvenance: [], diagnostics: [],
      }),
    })
    expect(projected.fields.find((field) => field.path === 'reasoning.mode')).toMatchObject({
      state: 'requires_confirmation',
    })
  })

  it('uses explicit source-path precedence while retaining model defaults and maxima', () => {
    const projected = projectResolvedModelFactsToRuntimeV2({
      binding,
      resolvedFacts: facts(
        { path: 'reasoning.effort.nativeValues', state: 'resolved', selectedValue: {
          kind: 'native_string_set', values: ['low', 'high'], completeness: 'complete',
        }, completenessDisposition: 'complete', selectionReason: 'single_claim',
          supportingProvenance: [], opposingProvenance: [], overriddenProvenance: [], diagnostics: [] },
        { path: 'reasoning.effort.providerDefault', state: 'resolved', selectedValue: {
          kind: 'native_string', value: 'low',
        }, completenessDisposition: 'complete', selectionReason: 'single_claim',
          supportingProvenance: [], opposingProvenance: [], overriddenProvenance: [], diagnostics: [] },
        { path: 'sampling.temperature.support', state: 'resolved', selectedValue: {
          kind: 'support', value: 'supported',
        }, completenessDisposition: 'complete', selectionReason: 'single_claim',
          supportingProvenance: [], opposingProvenance: [], overriddenProvenance: [], diagnostics: [] },
        { path: 'sampling.temperature.modelMaximum', state: 'resolved', selectedValue: {
          kind: 'decimal', value: 1.25,
        }, completenessDisposition: 'complete', selectionReason: 'single_claim',
          supportingProvenance: [], opposingProvenance: [], overriddenProvenance: [], diagnostics: [] },
      ),
    })
    expect(projected.fields.find((field) => field.path === 'reasoning.effort')).toMatchObject({
      state: 'supported', defaultValue: 'low', domain: { kind: 'enum', values: ['high', 'low'] },
    })
    expect(projected.fields.find((field) => field.path === 'generation.temperature')).toMatchObject({
      state: 'supported', domain: { kind: 'range', min: 0, max: 1.25 },
    })
  })
})
