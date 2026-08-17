import { describe, expect, it } from 'vitest'
import { decodeGenerationIntentLayerV2 } from '../domain/generationIntentV2'
import {
  RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2,
  canonicalizeUnverifiedRuntimeCapabilitySnapshotV2,
  type RuntimeCapabilitySemanticPathV2,
} from './runtimeCapabilitySnapshotV2'
import {
  canonicalizeResolvedCapabilityV2,
  projectGenerationControlsProjectionV2,
  resolvedCapabilityFromRecordV2,
  validateSemanticIntentAgainstResolvedCapabilityV2,
} from './resolvedCapabilityV2'
import { resolveEncodingCoverageRegistryV2 } from './encodingCoverageRegistryV2'

const digest = 'a'.repeat(64)

function draft(overrides: Readonly<Record<string, unknown>> = {}) {
  const fields: Array<{
    path: RuntimeCapabilitySemanticPathV2
    state: string
    constraints: unknown[]
    evidenceIds: string[]
    domain?: Record<string, unknown>
  }> = RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2.map((path) => ({
    path,
    state: 'missing',
    constraints: [],
    evidenceIds: [],
  }))
  const evidenceId = 'capability.test.supports'
  const supportedPaths: RuntimeCapabilitySemanticPathV2[] = ['reasoning.mode', 'reasoning.effort']
  for (const path of supportedPaths) {
    const field = fields.find((candidate) => candidate.path === path)!
    field.state = 'supported'
    field.evidenceIds = [evidenceId]
    field.domain = path === 'reasoning.mode'
      ? { kind: 'enum' as const, values: ['disabled', 'enabled'] }
      : { kind: 'enum' as const, values: ['high', 'max'] }
    if (path === 'reasoning.effort') {
      field.constraints = [{ kind: 'requires_value', path: 'reasoning.mode', values: ['enabled'] }]
    }
  }
  return {
    binding: {
      credentialScopeId: 'credential-scope:test',
      providerId: 'deepseek',
      endpointProfileId: 'deepseek-official-v1',
      endpointBinding: {
        kind: 'provider_managed_set',
        endpointSetRevision: 'endpoint-set:test',
        descriptors: [{ endpointId: 'deepseek-chat', descriptorRevision: 'descriptor:test' }],
      },
      protocolContractId: 'deepseek-stable-chat-v1',
      contractRevision: `deepseek-stable-chat-v1:${digest}`,
      contractDefinitionDigest: digest,
      registryRevision: `provider-contract-registry-v1:${digest}`,
      modelId: 'deepseek-reasoner',
      operation: 'text',
    },
    evidence: [{
      evidenceId,
      kind: 'official_documentation',
      effect: 'supports',
      sourceRef: 'https://example.invalid/deepseek',
      verifiedAt: '2026-08-17T00:00:00.000Z',
      contentDigest: digest,
    }],
    fields,
    continuation: { kind: 'none', evidenceIds: [evidenceId] },
    ...overrides,
  }
}

function runtimeRecord(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    schemaVersion: 2,
    resolvedAt: '2026-08-17T00:00:00.000Z',
    ...draft(),
    tools: [],
    ...overrides,
  }
}

describe('ResolvedCapabilityV2', () => {
  it('has a deterministic base revision independent of timestamps and command tools', () => {
    const first = canonicalizeResolvedCapabilityV2(draft())
    const changedEvidence = draft()
    changedEvidence.evidence[0]!.verifiedAt = '2026-08-17T00:00:01.000Z'
    const second = canonicalizeResolvedCapabilityV2({
      ...changedEvidence,
    })
    expect(second.capabilityRevision).toBe(first.capabilityRevision)
    expect(projectGenerationControlsProjectionV2(second).capabilityRevision)
      .toBe(first.capabilityRevision)
  })

  it('keeps missing, unknown and unsupported distinct in the shared validator', () => {
    const missing = canonicalizeResolvedCapabilityV2(draft())
    const unknownRecord = draft()
    unknownRecord.evidence.push({
      evidenceId: 'capability.test.unknown',
      kind: 'live_probe',
      effect: 'unknown',
      sourceRef: 'generation-v2-test-unknown',
      verifiedAt: '2026-08-17T00:00:00.000Z',
      contentDigest: digest,
    })
    const unknownField = unknownRecord.fields.find((candidate) => candidate.path === 'generation.maxOutputTokens')!
    unknownField.state = 'unknown'
    unknownField.evidenceIds = ['capability.test.unknown']
    const unknown = canonicalizeResolvedCapabilityV2(unknownRecord)
    const unsupportedRecord = draft()
    unsupportedRecord.evidence.push({
      evidenceId: 'capability.test.rejects',
      kind: 'contract_invariant',
      effect: 'rejects',
      sourceRef: 'generation-v2-test-rejection',
      verifiedAt: '2026-08-17T00:00:00.000Z',
      contentDigest: digest,
    })
    const field = unsupportedRecord.fields.find((candidate) => candidate.path === 'generation.maxOutputTokens')!
    field.state = 'unsupported'
    field.evidenceIds = ['capability.test.rejects']
    const unsupported = canonicalizeResolvedCapabilityV2(unsupportedRecord)
    const intent = decodeGenerationIntentLayerV2({ schemaVersion: 2, generation: { maxOutputTokens: 128 } })
    expect(() => validateSemanticIntentAgainstResolvedCapabilityV2(missing, intent))
      .toThrow('GENERATION_V2_RESOLVED_CAPABILITY_FIELD_UNSUPPORTED')
    expect(() => validateSemanticIntentAgainstResolvedCapabilityV2(unknown, intent))
      .toThrow('GENERATION_V2_RESOLVED_CAPABILITY_FIELD_UNAVAILABLE')
    expect(() => validateSemanticIntentAgainstResolvedCapabilityV2(unsupported, intent))
      .toThrow('GENERATION_V2_RESOLVED_CAPABILITY_FIELD_UNSUPPORTED')
  })

  it('allows only the resolved native DeepSeek effort values', () => {
    const capability = resolvedCapabilityFromRecordV2(canonicalizeUnverifiedRuntimeCapabilitySnapshotV2(runtimeRecord()))
    expect(() => validateSemanticIntentAgainstResolvedCapabilityV2(
      capability,
      decodeGenerationIntentLayerV2({ schemaVersion: 2, reasoning: { mode: 'enabled', effort: 'high' } }),
    )).not.toThrow()
    expect(() => validateSemanticIntentAgainstResolvedCapabilityV2(
      capability,
      decodeGenerationIntentLayerV2({ schemaVersion: 2, reasoning: { mode: 'enabled', effort: 'low' } }),
    )).toThrow('GENERATION_V2_RESOLVED_CAPABILITY_VALUE_UNSUPPORTED')
  })

  it('rejects supported semantic paths without registered encoder coverage', () => {
    const value = draft()
    const evidenceId = 'capability.test.supports'
    const field = value.fields.find((candidate) => candidate.path === 'generation.topK')!
    field.state = 'supported'
    field.domain = { kind: 'range', min: 1, max: 100, integer: true }
    field.evidenceIds = [evidenceId]
    expect(() => canonicalizeResolvedCapabilityV2(value))
      .toThrow('GENERATION_V2_ENCODING_COVERAGE_INVALID')
    expect(resolveEncodingCoverageRegistryV2({
      providerId: 'deepseek', protocolContractId: 'deepseek-stable-chat-v1', operation: 'text',
    }).semanticPaths).not.toContain('generation.topK')
  })

  it('keeps capability domains and constraints owned by resolved facts', () => {
    const widened = draft()
    const effort = widened.fields.find((candidate) => candidate.path === 'reasoning.effort')!
    effort.domain = { kind: 'enum', values: ['high', 'low', 'max'] }
    const widenedCapability = canonicalizeResolvedCapabilityV2(widened)
    expect(widenedCapability.fields.find((candidate) => candidate.path === 'reasoning.effort')?.domain)
      .toEqual({ kind: 'enum', values: ['high', 'low', 'max'] })

    const deletedConstraint = draft()
    const deleted = deletedConstraint.fields.find((candidate) => candidate.path === 'reasoning.effort')!
    deleted.constraints = []
    const deletedConstraintCapability = canonicalizeResolvedCapabilityV2(deletedConstraint)
    expect(deletedConstraintCapability.fields.find((candidate) => candidate.path === 'reasoning.effort')?.constraints)
      .toEqual([])
  })

  it('validates arbitrary provider-owned strings against the resolved domain', () => {
    const value = draft()
    const effort = value.fields.find((candidate) => candidate.path === 'reasoning.effort')!
    effort.domain = { kind: 'string', maxLength: 256 }
    const capability = canonicalizeResolvedCapabilityV2(value)
    const accepted = 'x'.repeat(129)
    expect(() => validateSemanticIntentAgainstResolvedCapabilityV2(
      capability,
      decodeGenerationIntentLayerV2({ schemaVersion: 2, reasoning: { mode: 'enabled', effort: accepted } }),
    )).not.toThrow()
    expect(() => validateSemanticIntentAgainstResolvedCapabilityV2(
      capability,
      decodeGenerationIntentLayerV2({ schemaVersion: 2, reasoning: { mode: 'enabled', effort: 'x'.repeat(257) } }),
    )).toThrow('GENERATION_V2_RESOLVED_CAPABILITY_VALUE_UNSUPPORTED')
  })
})
