import { describe, expect, it } from 'vitest'
import { stableSerializeProviderRequestV2 } from '../../compiler/stableSerialize'
import { GenerationV2Identity } from '../../domain/identityV2'
import { decodeProviderBindingRecordV2 } from '../../domain/providerBindingV2'
import {
  decodeCanonicalOpenRouterImageDescriptorSetV2,
  projectCanonicalOpenRouterImageDescriptorSetForCacheV2,
} from './canonicalDescriptorV2'
import { decodeOpenRouterImageDescriptorCacheRecordV2 } from './descriptorCacheRecordV2'
import { decideOpenRouterImageDescriptorFreshnessV2 } from './descriptorFreshnessDecisionV2'
import { projectOpenRouterImageIntentCapabilityV2 } from './imageIntentCapabilityProjectionV2'
import {
  decideOpenRouterImageSelectionV2,
  type OpenRouterImageSelectionBindingFactV2,
  type OpenRouterImageSelectionDecisionInputV2,
} from './selectionDecisionV2'

const SCOPE = 'credential-scope-v2:' + '1'.repeat(64)
const MODEL = 'google/gemini-image'
const CONTRACT_DIGEST = '2'.repeat(64)
const REGISTRY_REVISION = 'provider-contract-registry-v1:' + '3'.repeat(64)
const SETTINGS = { refreshAfterMs: 6 * 60 * 60 * 1_000, hardExpireAfterMs: 24 * 60 * 60 * 1_000 }

function descriptorCache(tags: readonly string[] = ['z-provider', 'a-provider']) {
  const set = decodeCanonicalOpenRouterImageDescriptorSetV2({
    id: MODEL,
    endpoints: tags.map((tag) => ({
      provider_name: tag,
      provider_tag: tag,
      provider_slug: `${tag}-slug`,
      supported_parameters: tag === 'a-provider'
        ? { n: { type: 'range', min: 1, max: 4 }, quality: { type: 'enum', values: ['high'] } }
        : { n: { type: 'range', min: 1, max: 4 } },
      allowed_passthrough_parameters: [],
      supports_streaming: false,
    })),
  })
  return decodeOpenRouterImageDescriptorCacheRecordV2({
    credential_scope_id: SCOPE,
    model_id: MODEL,
    operation: 'image_generate',
    row_generation: 7,
    endpoint_set_revision: set.endpointSetRevision.value,
    fetched_at_ms: 1_000,
    descriptor_response_json: stableSerializeProviderRequestV2(
      projectCanonicalOpenRouterImageDescriptorSetForCacheV2(set),
    ),
  })
}

function projection(overrides: Record<string, unknown> = {}) {
  return projectOpenRouterImageIntentCapabilityV2({
    schemaVersion: 2,
    generation: { candidateCount: 1 },
    image: { mode: 'generate' },
    providerExtension: { kind: 'none' },
    ...overrides,
  })
}

function freshness(kind: 'fresh' | 'soft' | 'hard' | 'missing' = 'fresh') {
  const nowMs = kind === 'fresh' ? 1_001
    : kind === 'soft' ? 1_000 + SETTINGS.refreshAfterMs
      : 1_000 + SETTINGS.hardExpireAfterMs
  return decideOpenRouterImageDescriptorFreshnessV2({
    nowMs,
    fetchedAtMs: kind === 'missing' ? null : 1_000,
    settings: SETTINGS,
  })
}

function binding(
  cache: ReturnType<typeof descriptorCache>,
  providerTag: string,
  overrides: Partial<Pick<OpenRouterImageSelectionBindingFactV2,
    'bindingGeneration' | 'sourceDescriptorRowGeneration' | 'sourceEndpointSetRevision'>> = {},
): OpenRouterImageSelectionBindingFactV2 {
  const descriptor = cache.descriptorSet.descriptors.find((item) => item.providerTag.value === providerTag)!
  return Object.freeze({
    trust: 'repository_decoded_unverified',
    bindingGeneration: overrides.bindingGeneration ?? 4,
    sourceDescriptorRowGeneration: overrides.sourceDescriptorRowGeneration ?? cache.rowGeneration,
    sourceEndpointSetRevision: overrides.sourceEndpointSetRevision ?? cache.endpointSetRevision,
    record: decodeProviderBindingRecordV2({
      credentialScopeId: SCOPE,
      providerId: 'openrouter',
      endpointProfileId: 'openrouter-images',
      endpointBinding: {
        kind: 'pinned',
        selector: {
          kind: 'openrouter_images_v1',
          providerTag,
          providerSlug: descriptor.providerSlug.value,
          descriptorRevision: descriptor.descriptorRevision.value,
          descriptorDigest: descriptor.descriptorDigest.value,
          selectedBy: 'user',
          selectedAt: '2026-07-15T00:00:00.000Z',
        },
      },
      protocolContractId: 'openrouter-images-v1',
      contractRevision: `openrouter-images-v1:${CONTRACT_DIGEST}`,
      contractDefinitionDigest: CONTRACT_DIGEST,
      registryRevision: REGISTRY_REVISION,
      modelId: MODEL,
      operation: 'image_generate',
    }),
  })
}

function requested(providerTag: string) {
  return GenerationV2Identity.create('provider_tag', providerTag)
}

function input(overrides: Partial<OpenRouterImageSelectionDecisionInputV2> = {}): OpenRouterImageSelectionDecisionInputV2 {
  return {
    descriptorCache: descriptorCache(),
    freshness: freshness(),
    projection: projection(),
    binding: null,
    requestedProviderTag: null,
    ...overrides,
  }
}

describe('OpenRouter Images V2 endpoint selection decision', () => {
  it('requires explicit user selection when multiple endpoints are eligible without a binding', () => {
    const decision = decideOpenRouterImageSelectionV2(input())
    expect(decision).toMatchObject({
      trust: 'selection_decision_non_executable',
      kind: 'selection_required',
      code: 'OPENROUTER_IMAGE_PROVIDER_SELECTION_REQUIRED',
    })
    if (decision.kind !== 'selection_required') throw new Error('unexpected decision')
    expect(decision.candidates.map((candidate) => candidate.providerTag)).toEqual(['a-provider', 'z-provider'])
  })

  it('returns a sole-eligible CAS plan without writing or granting compiler authority', () => {
    const cache = descriptorCache(['a-provider'])
    const decision = decideOpenRouterImageSelectionV2(input({ descriptorCache: cache }))
    expect(decision).toMatchObject({
      trust: 'selection_decision_non_executable',
      kind: 'binding_commit_required',
      selectedBy: 'sole_eligible',
      expectedBindingGeneration: null,
      expectedDescriptorRowGeneration: 7,
      candidate: { providerTag: 'a-provider' },
    })
    expect(decision).not.toHaveProperty('preparedRequest')
    expect(decision).not.toHaveProperty('executionAuthority')
  })

  it('reuses an exact fresh binding and keeps it first only for display', () => {
    const cache = descriptorCache()
    const current = binding(cache, 'z-provider')
    const decision = decideOpenRouterImageSelectionV2(input({ descriptorCache: cache, binding: current }))
    expect(decision).toMatchObject({
      kind: 'reuse_binding', bindingGeneration: 4, descriptorRowGeneration: 7,
      candidate: { providerTag: 'z-provider' },
    })
  })

  it('revalidates the same providerTag after descriptor refresh without discarding or switching it', () => {
    const oldCache = descriptorCache()
    const refreshed = Object.freeze({ ...descriptorCache(), rowGeneration: 8 })
    const decision = decideOpenRouterImageSelectionV2(input({
      descriptorCache: refreshed,
      binding: binding(oldCache, 'z-provider'),
    }))
    expect(decision).toMatchObject({
      kind: 'binding_revalidation_required',
      selectedBy: 'user',
      expectedBindingGeneration: 4,
      expectedDescriptorRowGeneration: 8,
      candidate: { providerTag: 'z-provider' },
    })
  })

  it('does not switch away from a bound endpoint that cannot satisfy changed intent', () => {
    const cache = descriptorCache()
    const current = binding(cache, 'z-provider')
    const decision = decideOpenRouterImageSelectionV2(input({
      descriptorCache: cache,
      binding: current,
      projection: projection({ image: { mode: 'generate', quality: 'high' } }),
    }))
    expect(decision).toMatchObject({
      kind: 'bound_capability_mismatch',
      code: 'BOUND_ENDPOINT_CAPABILITY_MISMATCH',
    })
    if (decision.kind !== 'bound_capability_mismatch') throw new Error('unexpected decision')
    expect(decision.candidates.find((candidate) => candidate.providerTag === 'a-provider')?.eligible).toBe(true)
  })

  it('plans an explicit user rebind only to a current eligible candidate', () => {
    const cache = descriptorCache()
    const current = binding(cache, 'z-provider')
    expect(decideOpenRouterImageSelectionV2(input({
      descriptorCache: cache,
      binding: current,
      requestedProviderTag: requested('a-provider'),
    }))).toMatchObject({
      kind: 'binding_commit_required', selectedBy: 'user', expectedBindingGeneration: 4,
      expectedDescriptorRowGeneration: 7, candidate: { providerTag: 'a-provider' },
    })
    expect(decideOpenRouterImageSelectionV2(input({
      descriptorCache: cache,
      binding: current,
      requestedProviderTag: requested('gone-provider'),
    }))).toMatchObject({
      kind: 'stale_user_selection', code: 'OPENROUTER_IMAGE_PROVIDER_SELECTION_STALE',
    })
  })

  it('stale-rejects missing and hard-expired bound descriptors', () => {
    const cache = descriptorCache()
    expect(decideOpenRouterImageSelectionV2(input({
      descriptorCache: null,
      freshness: freshness('missing'),
      binding: binding(cache, 'a-provider'),
    }))).toMatchObject({ kind: 'stale_binding', code: 'BOUND_ENDPOINT_DESCRIPTOR_MISSING' })
    expect(decideOpenRouterImageSelectionV2(input({
      descriptorCache: cache,
      freshness: freshness('hard'),
      binding: binding(cache, 'a-provider'),
    }))).toMatchObject({ kind: 'stale_binding', code: 'BOUND_ENDPOINT_DESCRIPTOR_HARD_EXPIRED' })
  })

  it('requires refresh before selection for missing, soft-due or hard-expired unbound cache', () => {
    expect(decideOpenRouterImageSelectionV2(input({
      descriptorCache: null, freshness: freshness('missing'),
    }))).toEqual({ trust: 'selection_decision_non_executable', kind: 'refresh_required', reason: 'cache_missing' })
    expect(decideOpenRouterImageSelectionV2(input({ freshness: freshness('soft') }))).toMatchObject({
      kind: 'refresh_required', reason: 'soft_refresh_due',
    })
    expect(decideOpenRouterImageSelectionV2(input({ freshness: freshness('soft') }))).toMatchObject({
      kind: 'refresh_required',
      reason: 'soft_refresh_due',
      fallbackAfterAllowedFailure: { kind: 'selection_required' },
    })
    const cache = descriptorCache(['a-provider'])
    expect(decideOpenRouterImageSelectionV2(input({
      descriptorCache: cache,
      freshness: freshness('soft'),
      binding: binding(cache, 'a-provider'),
    }))).toMatchObject({
      kind: 'refresh_required',
      reason: 'soft_refresh_due',
      fallbackAfterAllowedFailure: { kind: 'reuse_binding', candidate: { providerTag: 'a-provider' } },
    })
    expect(decideOpenRouterImageSelectionV2(input({ freshness: freshness('hard') }))).toMatchObject({
      kind: 'refresh_required', reason: 'hard_expired',
    })
  })

  it('reports unsupported intent without choosing a candidate', () => {
    const decision = decideOpenRouterImageSelectionV2(input({
      projection: projection({ reasoning: { mode: 'enabled', effort: 'high' } }),
    }))
    expect(decision).toMatchObject({ kind: 'unsupported', code: 'OPENROUTER_IMAGE_REQUEST_UNSUPPORTED' })
    if (decision.kind !== 'unsupported') throw new Error('unexpected decision')
    expect(decision.projectionIssues).toContainEqual({ semanticPath: 'reasoning', code: 'UNSUPPORTED_EXPLICIT_FIELD' })
    expect(decision.candidateIssues).toHaveLength(2)
  })

  it('retains descriptor-specific diagnostics when every endpoint rejects a valid intent', () => {
    const decision = decideOpenRouterImageSelectionV2(input({
      projection: projection({ generation: { candidateCount: 5 }, image: { mode: 'generate' } }),
    }))
    expect(decision).toMatchObject({ kind: 'unsupported', projectionIssues: [] })
    if (decision.kind !== 'unsupported') throw new Error('unexpected decision')
    expect(decision.candidateIssues).toEqual([
      {
        providerTag: 'a-provider',
        issues: [{
          semanticPath: 'generation.candidateCount',
          code: 'DESCRIPTOR_VALUE_UNSUPPORTED',
          wireKey: 'n',
        }],
      },
      {
        providerTag: 'z-provider',
        issues: [{
          semanticPath: 'generation.candidateCount',
          code: 'DESCRIPTOR_VALUE_UNSUPPORTED',
          wireKey: 'n',
        }],
      },
    ])
  })
})
