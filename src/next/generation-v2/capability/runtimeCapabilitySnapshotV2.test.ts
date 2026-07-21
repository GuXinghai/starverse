import { describe, expect, it } from 'vitest'
import {
  RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2,
  RUNTIME_CAPABILITY_SNAPSHOT_V2_MAX_UTF8_BYTES,
  canonicalizeUnverifiedRuntimeCapabilitySnapshotV2,
  decodeRuntimeCapabilitySnapshotJsonV2,
  decodeRuntimeCapabilitySnapshotV2,
  type RuntimeCapabilitySemanticPathV2,
} from './runtimeCapabilitySnapshotV2'

const contractDigest = 'a'.repeat(64)
const registryDigest = 'b'.repeat(64)
const evidenceContentDigest = 'c'.repeat(64)

function binding() {
  return {
    credentialScopeId: 'credential-scope:1',
    providerId: 'openai',
    endpointProfileId: 'profile:first-party',
    endpointBinding: {
      kind: 'provider_managed_set',
      endpointSetRevision: 'endpoint-set:1',
      descriptors: [{ endpointId: 'responses', descriptorRevision: 'descriptor:1' }],
    },
    protocolContractId: 'openai-responses-v1',
    contractRevision: `openai-responses-v1:${contractDigest}`,
    contractDefinitionDigest: contractDigest,
    registryRevision: `provider-contract-registry-v1:${registryDigest}`,
    modelId: 'gpt-5.4',
    operation: 'text',
  }
}

type MutableField = {
  path: RuntimeCapabilitySemanticPathV2
  state: string
  domain?: Record<string, unknown>
  constraints: unknown[]
  evidenceIds: string[]
}

type MutableDraft = {
  schemaVersion: number
  resolvedAt: string
  binding: Record<string, unknown>
  evidence: Array<{
    evidenceId: string
    kind: string
    effect: string
    sourceRef: string
    verifiedAt: string
    contentDigest: string
  }>
  fields: MutableField[]
  tools: Array<{
    toolId: string
    kind: string
    state: string
    sideEffectPolicy: string
    evidenceIds: string[]
  }>
  continuation: Record<string, unknown>
}

function draft(): MutableDraft {
  return {
    schemaVersion: 2,
    resolvedAt: '2026-07-15T08:00:00.000Z',
    binding: binding(),
    evidence: [{
      evidenceId: 'contract.openai.responses.v1',
      kind: 'official_documentation',
      effect: 'supports',
      sourceRef: 'https://platform.openai.com/docs/api-reference/responses/create',
      verifiedAt: '2026-07-15T07:00:00.000Z',
      contentDigest: evidenceContentDigest,
    }],
    fields: [...RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2].reverse().map((path) => path === 'generation.temperature'
      ? {
          path,
          state: 'supported',
          domain: { kind: 'range', min: 0, max: 2, integer: false },
          constraints: [],
          evidenceIds: ['contract.openai.responses.v1'],
        }
      : { path, state: 'unavailable', constraints: [], evidenceIds: [] }),
    tools: [],
    continuation: {
      kind: 'none',
      evidenceIds: ['contract.openai.responses.v1'],
    },
  }
}

describe('RuntimeCapabilitySnapshotV2 structural codec', () => {
  it('canonicalizes one complete closed field projection and verifies all content identities', () => {
    const first = canonicalizeUnverifiedRuntimeCapabilitySnapshotV2(draft())
    const second = canonicalizeUnverifiedRuntimeCapabilitySnapshotV2(draft())
    expect(first).toEqual(second)
    expect(first.fields.map((field) => field.path)).toEqual(RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2)
    expect(first.evidence[0].entryDigest).toMatch(/^[0-9a-f]{64}$/u)
    expect(first.evidenceDigest).toMatch(/^[0-9a-f]{64}$/u)
    expect(first.semanticFieldsDigest).toMatch(/^[0-9a-f]{64}$/u)
    expect(first.revision).toMatch(/^capability-v2:[0-9a-f]{64}$/u)
    expect(first.snapshotHash).toMatch(/^[0-9a-f]{64}$/u)
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.binding)).toBe(true)
    expect(Object.isFrozen((first.binding as { endpointBinding: object }).endpointBinding)).toBe(true)
    expect(Object.isFrozen(first.continuation)).toBe(true)

    const decoded = decodeRuntimeCapabilitySnapshotV2(first)
    expect(decoded.trust).toBe('decoded_unverified')
    expect(decoded.executionAuthority).toBe('none')
    expect(decoded.binding.providerId.value).toBe('openai')
    expect(decoded.evidence[0].entryDigest.value).toBe(first.evidence[0].entryDigest)
    expect(decoded.tools).toEqual([])
    expect(decoded.continuation).toEqual({
      kind: 'none', evidenceIds: ['contract.openai.responses.v1'],
    })
    expect(JSON.parse(decoded.canonicalJson)).toEqual(first)
    expect(decodeRuntimeCapabilitySnapshotJsonV2(decoded.canonicalJson).revision.value).toBe(first.revision)
    expect(() => decodeRuntimeCapabilitySnapshotJsonV2(JSON.stringify(first)))
      .toThrow('GENERATION_V2_CAPABILITY_NON_CANONICAL_JSON')
  })

  it('preserves an exact discrete image-size set without widening it into a range', () => {
    const value = draft()
    const size = value.fields.find((field) => field.path === 'image.size')!
    size.state = 'supported'
    size.domain = {
      kind: 'dimensions_enum',
      values: [{ width: 1536, height: 1024 }, { width: 1024, height: 1024 }],
    }
    size.evidenceIds = ['contract.openai.responses.v1']
    const decoded = decodeRuntimeCapabilitySnapshotV2(canonicalizeUnverifiedRuntimeCapabilitySnapshotV2(value))
    const field = decoded.fields.find((item) => item.path === 'image.size')!
    expect(field.domain).toEqual({
      kind: 'dimensions_enum',
      values: [{ width: 1024, height: 1024 }, { width: 1536, height: 1024 }],
    })
  })

  it('makes provider binding, evidence, fields and resolution time part of immutable identity', () => {
    const baseline = canonicalizeUnverifiedRuntimeCapabilitySnapshotV2(draft())
    expect(canonicalizeUnverifiedRuntimeCapabilitySnapshotV2({
      ...draft(), resolvedAt: '2026-07-15T08:00:01.000Z',
    }).snapshotHash).not.toBe(baseline.snapshotHash)
    expect(canonicalizeUnverifiedRuntimeCapabilitySnapshotV2({
      ...draft(), binding: { ...binding(), modelId: 'gpt-5.5' },
    }).revision).not.toBe(baseline.revision)
    const changedEvidence = draft()
    changedEvidence.evidence[0] = { ...changedEvidence.evidence[0], contentDigest: 'd'.repeat(64) }
    expect(canonicalizeUnverifiedRuntimeCapabilitySnapshotV2(changedEvidence).evidenceDigest)
      .not.toBe(baseline.evidenceDigest)
    const changedField = draft()
    const temperatureIndex = changedField.fields.findIndex((field) => field.path === 'generation.temperature')
    changedField.fields[temperatureIndex] = {
      ...changedField.fields[temperatureIndex],
      domain: { kind: 'range', min: 0, max: 1, integer: false },
    }
    expect(canonicalizeUnverifiedRuntimeCapabilitySnapshotV2(changedField).semanticFieldsDigest)
      .not.toBe(baseline.semanticFieldsDigest)
  })

  it('rejects missing, duplicate and unknown semantic paths instead of treating them as supported', () => {
    const missing = draft()
    missing.fields.pop()
    expect(() => canonicalizeUnverifiedRuntimeCapabilitySnapshotV2(missing))
      .toThrow('GENERATION_V2_CAPABILITY_INCOMPLETE_FIELDS')
    const duplicate = draft()
    duplicate.fields[0] = { ...duplicate.fields[1] }
    expect(() => canonicalizeUnverifiedRuntimeCapabilitySnapshotV2(duplicate))
      .toThrow('GENERATION_V2_CAPABILITY_INCOMPLETE_FIELDS')
    const unknown = draft()
    unknown.fields[0] = { ...unknown.fields[0], path: 'wire.temperature' as typeof unknown.fields[number]['path'] }
    expect(() => canonicalizeUnverifiedRuntimeCapabilitySnapshotV2(unknown))
      .toThrow('GENERATION_V2_CAPABILITY_INVALID_VALUE')
  })

  it('requires evidence for every claim and permits evidence-free unavailable fields only', () => {
    const missingReference = draft()
    const index = missingReference.fields.findIndex((field) => field.path === 'generation.temperature')
    missingReference.fields[index] = { ...missingReference.fields[index], evidenceIds: ['missing'] }
    expect(() => canonicalizeUnverifiedRuntimeCapabilitySnapshotV2(missingReference))
      .toThrow('GENERATION_V2_CAPABILITY_EVIDENCE_MISMATCH')
    const unsupportedWithSupportEvidence = draft()
    unsupportedWithSupportEvidence.fields[index] = {
      path: 'generation.temperature', state: 'unsupported', constraints: [],
      evidenceIds: ['contract.openai.responses.v1'],
    }
    expect(() => canonicalizeUnverifiedRuntimeCapabilitySnapshotV2(unsupportedWithSupportEvidence))
      .toThrow('GENERATION_V2_CAPABILITY_EVIDENCE_MISMATCH')
    const unavailableWithEvidence = draft()
    unavailableWithEvidence.fields[index] = {
      path: 'generation.temperature', state: 'unavailable', constraints: [],
      evidenceIds: ['contract.openai.responses.v1'],
    }
    expect(() => canonicalizeUnverifiedRuntimeCapabilitySnapshotV2(unavailableWithEvidence))
      .toThrow('GENERATION_V2_CAPABILITY_EVIDENCE_MISMATCH')
    const validUnavailable = draft()
    validUnavailable.fields[index] = {
      path: 'generation.temperature', state: 'unavailable', constraints: [], evidenceIds: [],
    }
    expect(canonicalizeUnverifiedRuntimeCapabilitySnapshotV2(validUnavailable).fields
      .find((field) => field.path === 'generation.temperature')?.state)
      .toBe('unavailable')
  })

  it('uses closed domains and cross-field constraints without provider wire paths', () => {
    const value = draft()
    const temperature = value.fields.find((field) => field.path === 'generation.temperature')!
    Object.assign(temperature, {
      constraints: [{ kind: 'requires_value', path: 'reasoning.mode', values: ['enabled'] }],
    })
    const reasoningMode = value.fields.find((field) => field.path === 'reasoning.mode')!
    Object.assign(reasoningMode, {
      state: 'supported',
      domain: { kind: 'enum', values: ['disabled', 'enabled'] },
      evidenceIds: ['contract.openai.responses.v1'],
    })
    const record = canonicalizeUnverifiedRuntimeCapabilitySnapshotV2(value)
    const decodedField = record.fields.find((field) => field.path === 'generation.temperature')!
    expect(decodedField.domain).toEqual({ kind: 'range', min: 0, max: 2, integer: false })
    expect(decodedField.constraints).toEqual([
      { kind: 'requires_value', path: 'reasoning.mode', values: ['enabled'] },
    ])
    expect(() => canonicalizeUnverifiedRuntimeCapabilitySnapshotV2({
      ...draft(), fields: draft().fields.map((field, index) => index === 0
        ? { ...field, constraints: ['reasoning.enabled == true'] }
        : field),
    })).toThrow('GENERATION_V2_CAPABILITY_INVALID_SHAPE')
  })

  it('requires a positive integer capability domain for a manual thinking budget', () => {
    const invalid = draft()
    Object.assign(invalid.fields.find((field) => field.path === 'providerExtension.manualThinkingBudgetTokens')!, {
      state: 'supported', domain: { kind: 'range', min: 0, max: 4096, integer: true },
      evidenceIds: ['contract.openai.responses.v1'],
    })
    expect(() => canonicalizeUnverifiedRuntimeCapabilitySnapshotV2(invalid))
      .toThrow('GENERATION_V2_CAPABILITY_INVALID_VALUE')
  })

  it('rejects conflicting effects, future evidence and impossible semantic domains', () => {
    const conflicting = draft()
    conflicting.evidence.push({
      ...conflicting.evidence[0],
      evidenceId: 'contract.openai.responses.reject',
      effect: 'rejects',
    })
    const temperature = conflicting.fields.find((field) => field.path === 'generation.temperature')!
    temperature.evidenceIds.push('contract.openai.responses.reject')
    expect(() => canonicalizeUnverifiedRuntimeCapabilitySnapshotV2(conflicting))
      .toThrow('GENERATION_V2_CAPABILITY_EVIDENCE_MISMATCH')

    const future = draft()
    future.evidence[0] = { ...future.evidence[0], verifiedAt: '2026-07-15T08:00:00.001Z' }
    expect(() => canonicalizeUnverifiedRuntimeCapabilitySnapshotV2(future))
      .toThrow('GENERATION_V2_CAPABILITY_INVALID_VALUE')

    const futureSelection = draft()
    futureSelection.binding = {
      ...binding(),
      providerId: 'openrouter',
      endpointProfileId: 'profile:openrouter-images',
      endpointBinding: {
        kind: 'pinned',
        selector: {
          kind: 'openrouter_images_v1',
          providerTag: 'google-ai-studio',
          providerSlug: 'google-ai-studio',
          descriptorRevision: 'descriptor:1',
          descriptorDigest: 'd'.repeat(64),
          selectedBy: 'user',
          selectedAt: '2026-07-15T08:00:00.001Z',
        },
      },
      protocolContractId: 'openrouter-images-v1',
      contractRevision: `openrouter-images-v1:${contractDigest}`,
      modelId: 'google/gemini-3.1-flash-image',
      operation: 'image_generate',
    }
    expect(() => canonicalizeUnverifiedRuntimeCapabilitySnapshotV2(futureSelection))
      .toThrow('GENERATION_V2_CAPABILITY_INVALID_VALUE')

    const wrongDomain = draft()
    Object.assign(wrongDomain.fields.find((field) => field.path === 'generation.temperature')!, {
      domain: { kind: 'boolean' },
    })
    expect(() => canonicalizeUnverifiedRuntimeCapabilitySnapshotV2(wrongDomain))
      .toThrow('GENERATION_V2_CAPABILITY_INVALID_VALUE')

    const impossibleConstraint = draft()
    const reasoningMode = impossibleConstraint.fields.find((field) => field.path === 'reasoning.mode')!
    Object.assign(reasoningMode, {
      state: 'supported', domain: { kind: 'enum', values: ['disabled'] },
      evidenceIds: ['contract.openai.responses.v1'],
    })
    Object.assign(impossibleConstraint.fields.find((field) => field.path === 'generation.temperature')!, {
      constraints: [{ kind: 'requires_value', path: 'reasoning.mode', values: ['enabled'] }],
    })
    expect(() => canonicalizeUnverifiedRuntimeCapabilitySnapshotV2(impossibleConstraint))
      .toThrow('GENERATION_V2_CAPABILITY_INVALID_VALUE')

    const contradictory = draft()
    Object.assign(contradictory.fields.find((field) => field.path === 'reasoning.mode')!, {
      state: 'supported', domain: { kind: 'enum', values: ['disabled', 'enabled'] },
      evidenceIds: ['contract.openai.responses.v1'],
    })
    Object.assign(contradictory.fields.find((field) => field.path === 'generation.temperature')!, {
      constraints: [
        { kind: 'requires_value', path: 'reasoning.mode', values: ['enabled'] },
        { kind: 'forbids_value', path: 'reasoning.mode', values: ['enabled'] },
      ],
    })
    expect(() => canonicalizeUnverifiedRuntimeCapabilitySnapshotV2(contradictory))
      .toThrow('GENERATION_V2_CAPABILITY_INVALID_VALUE')
  })

  it('binds closed tool and continuation capabilities into the snapshot hash', () => {
    const value = draft()
    value.tools.push({
      toolId: 'tool:web-search',
      kind: 'provider_server',
      state: 'supported',
      sideEffectPolicy: 'none',
      evidenceIds: ['contract.openai.responses.v1'],
    })
    value.continuation = {
      kind: 'client_managed_native_replay',
      artifactKind: 'openai.responses.items.v1',
      supportsBranchReplay: true,
      supportsRestartReplay: true,
      evidenceIds: ['contract.openai.responses.v1'],
    }
    const record = canonicalizeUnverifiedRuntimeCapabilitySnapshotV2(value)
    const baseline = canonicalizeUnverifiedRuntimeCapabilitySnapshotV2(draft())
    expect(record.tools[0].toolId).toBe('tool:web-search')
    expect(record.continuation.kind).toBe('client_managed_native_replay')
    expect(record.snapshotHash).not.toBe(baseline.snapshotHash)
    expect(record.semanticFieldsDigest).not.toBe(baseline.semanticFieldsDigest)
    expect(record.revision).not.toBe(baseline.revision)
    const changedToolPolicy = structuredClone(value)
    changedToolPolicy.tools[0].sideEffectPolicy = 'confirmation_required_each_execution'
    expect(canonicalizeUnverifiedRuntimeCapabilitySnapshotV2(changedToolPolicy).revision).not.toBe(record.revision)
    const changedReplay = structuredClone(value)
    changedReplay.continuation.supportsBranchReplay = false
    expect(canonicalizeUnverifiedRuntimeCapabilitySnapshotV2(changedReplay).revision).not.toBe(record.revision)
    expect(() => canonicalizeUnverifiedRuntimeCapabilitySnapshotV2({
      ...draft(), continuation: { kind: 'client_managed_native_replay', artifactKind: 'x',
        supportsBranchReplay: true, supportsRestartReplay: true, evidenceIds: [] },
    })).toThrow('GENERATION_V2_CAPABILITY_EVIDENCE_MISMATCH')
  })

  it('keeps provider domains inside the base semantic value domains', () => {
    const invalidCases: Array<[RuntimeCapabilitySemanticPathV2, Record<string, unknown>]> = [
      ['generation.maxOutputTokens', { kind: 'range', min: 0, max: 10, integer: true }],
      ['generation.topK', { kind: 'range', min: 0, max: 10, integer: true }],
      ['generation.candidateCount', { kind: 'range', min: 0, max: 10, integer: true }],
      ['generation.temperature', { kind: 'range', min: -0.1, max: 1, integer: false }],
      ['generation.topP', { kind: 'range', min: 0, max: 1.1, integer: false }],
      ['generation.repetitionPenalty', { kind: 'range', min: 0, max: 2, integer: false }],
      ['image.outputCompression', { kind: 'range', min: 0, max: 101, integer: true }],
      ['image.aspectRatio', { kind: 'enum', values: [true] }],
      ['image.aspectRatio', { kind: 'enum', values: ['wide'] }],
    ]
    for (const [path, domain] of invalidCases) {
      const value = draft()
      const index = value.fields.findIndex((field) => field.path === path)
      value.fields[index] = {
        path, state: 'supported', domain, constraints: [],
        evidenceIds: ['contract.openai.responses.v1'],
      }
      expect(() => canonicalizeUnverifiedRuntimeCapabilitySnapshotV2(value), path)
        .toThrow('GENERATION_V2_CAPABILITY_INVALID_VALUE')
    }
  })

  it('rejects sensitive/unknown data, accessors, sparse arrays, duplicates and unsafe evidence', () => {
    expect(() => canonicalizeUnverifiedRuntimeCapabilitySnapshotV2({ ...draft(), apiKey: 'secret' }))
      .toThrow('GENERATION_V2_CAPABILITY_UNKNOWN_FIELD')
    expect(() => canonicalizeUnverifiedRuntimeCapabilitySnapshotV2({
      ...draft(), evidence: [{ ...draft().evidence[0], authorization: 'secret' }],
    })).toThrow('GENERATION_V2_CAPABILITY_UNKNOWN_FIELD')
    expect(() => canonicalizeUnverifiedRuntimeCapabilitySnapshotV2({
      ...draft(), evidence: [{ ...draft().evidence[0], sourceRef: 'https://user:secret@example.com/docs' }],
    })).toThrow('GENERATION_V2_CAPABILITY_INVALID_VALUE')
    expect(() => canonicalizeUnverifiedRuntimeCapabilitySnapshotV2({
      ...draft(), evidence: [draft().evidence[0], draft().evidence[0]],
    })).toThrow('GENERATION_V2_CAPABILITY_DUPLICATE_VALUE')
    expect(() => canonicalizeUnverifiedRuntimeCapabilitySnapshotV2({ ...draft(), fields: new Array(2) }))
      .toThrow('GENERATION_V2_CAPABILITY_INVALID_SHAPE')
    let reads = 0
    const accessor = Object.defineProperty({ ...draft() }, 'evidence', {
      enumerable: true, get: () => { reads += 1; return [] },
    })
    expect(() => canonicalizeUnverifiedRuntimeCapabilitySnapshotV2(accessor))
      .toThrow('GENERATION_V2_CAPABILITY_INVALID_SHAPE')
    expect(reads).toBe(0)
  })

  it('detects digest and hash tampering and never promotes a decoded clone to authority', () => {
    const record = canonicalizeUnverifiedRuntimeCapabilitySnapshotV2(draft())
    expect(() => decodeRuntimeCapabilitySnapshotV2({
      ...record,
      evidence: [{ ...record.evidence[0], entryDigest: 'f'.repeat(64) }],
    })).toThrow('GENERATION_V2_CAPABILITY_DIGEST_MISMATCH')
    expect(() => decodeRuntimeCapabilitySnapshotV2({ ...record, evidenceDigest: 'f'.repeat(64) }))
      .toThrow('GENERATION_V2_CAPABILITY_DIGEST_MISMATCH')
    expect(() => decodeRuntimeCapabilitySnapshotV2({ ...record, snapshotHash: 'f'.repeat(64) }))
      .toThrow('GENERATION_V2_CAPABILITY_HASH_MISMATCH')
    const clone = structuredClone(record)
    const decoded = decodeRuntimeCapabilitySnapshotV2(clone)
    expect(decoded).not.toHaveProperty('resolve')
    expect(decoded).not.toHaveProperty('preparedRequest')
    expect(decoded.executionAuthority).toBe('none')
  })

  it('bounds canonical JSON before it can become a persisted capability value', () => {
    const oversized = draft()
    oversized.evidence[0] = {
      ...oversized.evidence[0],
      sourceRef: `record:${'x'.repeat(RUNTIME_CAPABILITY_SNAPSHOT_V2_MAX_UTF8_BYTES)}`,
      kind: 'contract_invariant',
    }
    expect(() => canonicalizeUnverifiedRuntimeCapabilitySnapshotV2(oversized)).toThrow()
    expect(() => decodeRuntimeCapabilitySnapshotJsonV2(' '.repeat(RUNTIME_CAPABILITY_SNAPSHOT_V2_MAX_UTF8_BYTES + 1)))
      .toThrow('GENERATION_V2_CAPABILITY_BYTE_LIMIT_EXCEEDED')
  })
})
