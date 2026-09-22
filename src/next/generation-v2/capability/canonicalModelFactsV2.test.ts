import { describe, expect, it } from 'vitest'
import {
  canonicalizeModelFactsV2,
  projectCanonicalModelFactsDraftV2,
} from './canonicalModelFactsV2'
import { MODEL_CAPABILITY_SEMANTIC_PATHS_V2 } from './modelCapabilitySchemaV2'

const digest = 'c'.repeat(64)

function facts(overrides: Readonly<Record<string, unknown>> = {}) {
  const evidence = [{
    evidenceId: 'capability.rule.example',
    kind: 'capability_rule',
    effect: 'supports',
    sourceRef: 'rule:example',
    verifiedAt: null,
    contentDigest: digest,
  }]
  const fields = MODEL_CAPABILITY_SEMANTIC_PATHS_V2.map((path) => path === 'generation.maxOutputTokens'
    ? {
        path,
        state: 'supported',
        domain: { kind: 'range', min: 1, max: 100000, integer: true },
        constraints: [],
        evidenceIds: ['capability.rule.example'],
      }
    : { path, state: 'missing', constraints: [], evidenceIds: [] })
  return {
    identity: {
      providerId: 'openai_responses',
      endpointProfileId: 'profile:first-party',
      nativeModelId: 'gpt-5.4',
    },
    evidence,
    fields,
    ...overrides,
  }
}

describe('CanonicalModelFactsV2 evidence schema', () => {
  it('preserves an unverified capability rule and keeps digest boundaries deterministic', () => {
    const first = canonicalizeModelFactsV2(facts())
    const second = canonicalizeModelFactsV2(facts())
    expect(first).toEqual(second)
    expect(first.evidence[0]?.verifiedAt).toBeNull()
    const projected = projectCanonicalModelFactsDraftV2(first)
    expect(projected.evidence[0]?.verifiedAt).toBeNull()

    const verified = canonicalizeModelFactsV2(facts({
      evidence: [{ ...facts().evidence[0], verifiedAt: '2026-09-21T00:00:00.000Z' }],
    }))
    expect(verified.evidence[0]?.entryDigest.value).not.toBe(first.evidence[0]?.entryDigest.value)
    expect(verified.evidenceDigest).not.toBe(first.evidenceDigest)
    expect(verified.capabilityRevision).toBe(first.capabilityRevision)
  })

  it('requires timestamps for non-rule evidence and rejects createdAt/updatedAt aliases', () => {
    expect(() => canonicalizeModelFactsV2(facts({
      evidence: [{ ...facts().evidence[0], kind: 'official_documentation',
        sourceRef: 'https://example.invalid/docs', verifiedAt: null }],
    }))).toThrow('GENERATION_V2_CANONICAL_MODEL_FACTS_INVALID')

    const aliasedEvidence: Record<string, unknown> = { ...facts().evidence[0] }
    delete aliasedEvidence.verifiedAt
    aliasedEvidence.createdAt = '2026-09-21T00:00:00.000Z'
    aliasedEvidence.updatedAt = '2026-09-21T00:00:00.000Z'
    expect(() => canonicalizeModelFactsV2(facts({ evidence: [aliasedEvidence] })))
      .toThrow('GENERATION_V2_CANONICAL_MODEL_FACTS_INVALID')
  })

  it('allows supported facts without a domain but rejects blocked states with defaults', () => {
    const supported = facts() as { fields: Array<Record<string, unknown>> }
    const supportedField = supported.fields.find((field) => field.path === 'generation.maxOutputTokens')!
    delete supportedField.domain
    supportedField.defaultValue = 1
    expect(() => canonicalizeModelFactsV2(supported)).not.toThrow()

    const blocked = facts() as { evidence: Array<Record<string, unknown>>; fields: Array<Record<string, unknown>> }
    const blockedField = blocked.fields.find((field) => field.path === 'generation.maxOutputTokens')!
    blockedField.state = 'unknown'
    delete blockedField.domain
    blocked.evidence[0].effect = 'unknown'
    blockedField.evidenceIds = ['capability.rule.example']
    blockedField.constraints = []
    blockedField.defaultValue = 1
    expect(() => canonicalizeModelFactsV2(blocked))
      .toThrow('GENERATION_V2_CANONICAL_MODEL_FACTS_INVALID')
  })
})
