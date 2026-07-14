import type { DecodedProviderBindingRecordV2 } from '../../domain/providerBindingV2'
import type { GenerationV2Identity } from '../../domain/identityV2'
import type { DecodedOpenRouterImageDescriptorCacheRecordV2 } from './descriptorCacheRecordV2'
import type { OpenRouterImageDescriptorFreshnessDecisionV2 } from './descriptorFreshnessDecisionV2'
import {
  projectOpenRouterImageCandidatesV2,
  type OpenRouterImageCandidateCapabilityV2,
  type OpenRouterImageCapabilityIssueV2,
  type OpenRouterImageIntentCapabilityProjectionV2,
} from './imageIntentCapabilityProjectionV2'

export type OpenRouterImageSelectionBindingFactV2 = Readonly<{
  trust: 'repository_decoded_unverified'
  bindingGeneration: number
  sourceDescriptorRowGeneration: number
  sourceEndpointSetRevision: GenerationV2Identity<'endpoint_set_revision'>
  record: DecodedProviderBindingRecordV2
}>

type DecisionBase = Readonly<{ trust: 'selection_decision_non_executable' }>

export type OpenRouterImageUsableCacheSelectionDecisionV2 =
  | (DecisionBase & Readonly<{
      kind: 'reuse_binding'
      candidate: OpenRouterImageCandidateCapabilityV2
      projection: OpenRouterImageIntentCapabilityProjectionV2
      bindingGeneration: number
      descriptorRowGeneration: number
    }>)
  | (DecisionBase & Readonly<{
      kind: 'binding_commit_required'
      selectedBy: 'sole_eligible' | 'user'
      candidate: OpenRouterImageCandidateCapabilityV2
      projection: OpenRouterImageIntentCapabilityProjectionV2
      expectedBindingGeneration: number | null
      expectedDescriptorRowGeneration: number
    }>)
  | (DecisionBase & Readonly<{
      kind: 'binding_revalidation_required'
      selectedBy: 'sole_eligible' | 'user'
      candidate: OpenRouterImageCandidateCapabilityV2
      projection: OpenRouterImageIntentCapabilityProjectionV2
      expectedBindingGeneration: number
      expectedDescriptorRowGeneration: number
    }>)
  | (DecisionBase & Readonly<{
      kind: 'selection_required'
      code: 'OPENROUTER_IMAGE_PROVIDER_SELECTION_REQUIRED'
      candidates: readonly OpenRouterImageCandidateCapabilityV2[]
    }>)
  | (DecisionBase & Readonly<{
      kind: 'unsupported'
      code: 'OPENROUTER_IMAGE_REQUEST_UNSUPPORTED'
      projectionIssues: readonly OpenRouterImageCapabilityIssueV2[]
      candidateIssues: readonly Readonly<{
        providerTag: string
        issues: readonly OpenRouterImageCapabilityIssueV2[]
      }>[]
      candidates: readonly OpenRouterImageCandidateCapabilityV2[]
    }>)
  | (DecisionBase & Readonly<{
      kind: 'bound_capability_mismatch'
      code: 'BOUND_ENDPOINT_CAPABILITY_MISMATCH'
      issues: readonly OpenRouterImageCapabilityIssueV2[]
      candidates: readonly OpenRouterImageCandidateCapabilityV2[]
    }>)
  | (DecisionBase & Readonly<{
      kind: 'stale_binding'
      code:
        | 'BOUND_ENDPOINT_DESCRIPTOR_MISSING'
        | 'BOUND_ENDPOINT_DESCRIPTOR_PROVENANCE_MISMATCH'
        | 'BOUND_ENDPOINT_DESCRIPTOR_HARD_EXPIRED'
    }>)
  | (DecisionBase & Readonly<{
      kind: 'stale_user_selection'
      code: 'OPENROUTER_IMAGE_PROVIDER_SELECTION_STALE'
      candidates: readonly OpenRouterImageCandidateCapabilityV2[]
    }>)

export type OpenRouterImageSelectionDecisionV2 =
  | OpenRouterImageUsableCacheSelectionDecisionV2
  | (DecisionBase & Readonly<{
      kind: 'refresh_required'
      reason: 'cache_missing' | 'soft_refresh_due' | 'hard_expired'
      fallbackAfterAllowedFailure?: OpenRouterImageUsableCacheSelectionDecisionV2
    }>)

export type OpenRouterImageSelectionDecisionInputV2 = Readonly<{
  descriptorCache: DecodedOpenRouterImageDescriptorCacheRecordV2 | null
  freshness: OpenRouterImageDescriptorFreshnessDecisionV2
  projection: OpenRouterImageIntentCapabilityProjectionV2
  binding: OpenRouterImageSelectionBindingFactV2 | null
  requestedProviderTag: GenerationV2Identity<'provider_tag'> | null
}>

const TRUST = 'selection_decision_non_executable' as const

function frozenCandidates(
  input: OpenRouterImageSelectionDecisionInputV2,
): readonly OpenRouterImageCandidateCapabilityV2[] {
  if (!input.descriptorCache) return Object.freeze([])
  const bound = input.binding?.record.endpointBinding
  return projectOpenRouterImageCandidatesV2({
    descriptorSet: input.descriptorCache.descriptorSet,
    projection: input.projection,
    boundProviderTag: bound?.kind === 'pinned' ? bound.selector.providerTag.value : null,
  })
}

function bindingIdentityMatches(
  binding: OpenRouterImageSelectionBindingFactV2,
  cache: DecodedOpenRouterImageDescriptorCacheRecordV2,
): boolean {
  const record = binding.record
  const endpointBinding = record.endpointBinding
  return binding.bindingGeneration > 0 && Number.isSafeInteger(binding.bindingGeneration) &&
    record.trust === 'decoded_unverified' &&
    record.credentialScopeId.value === cache.credentialScopeId.value &&
    record.modelId.value === cache.modelId.value &&
    record.providerId.value === 'openrouter' &&
    record.operation === 'image_generate' &&
    record.protocolContractId.value === 'openrouter-images-v1' &&
    endpointBinding.kind === 'pinned'
}

function selectedCandidateMatchesBinding(
  candidate: OpenRouterImageCandidateCapabilityV2,
  binding: OpenRouterImageSelectionBindingFactV2,
): boolean {
  const endpointBinding = binding.record.endpointBinding
  if (endpointBinding.kind !== 'pinned') return false
  const selector = endpointBinding.selector
  return candidate.providerTag === selector.providerTag.value &&
    candidate.providerSlug === selector.providerSlug.value &&
    candidate.descriptorRevision === selector.descriptorRevision.value &&
    candidate.descriptorDigest === selector.descriptorDigest.value
}

export function decideOpenRouterImageSelectionV2(
  input: OpenRouterImageSelectionDecisionInputV2,
): OpenRouterImageSelectionDecisionV2 {
  if (!input.descriptorCache) {
    if (input.binding) {
      return Object.freeze({ trust: TRUST, kind: 'stale_binding', code: 'BOUND_ENDPOINT_DESCRIPTOR_MISSING' })
    }
    return Object.freeze({ trust: TRUST, kind: 'refresh_required', reason: 'cache_missing' })
  }

  if (input.binding && !bindingIdentityMatches(input.binding, input.descriptorCache)) {
    return Object.freeze({
      trust: TRUST,
      kind: 'stale_binding',
      code: 'BOUND_ENDPOINT_DESCRIPTOR_PROVENANCE_MISMATCH',
    })
  }

  if (input.freshness.kind === 'refresh_required') {
    if (input.binding && input.freshness.reason === 'hard_expired') {
      return Object.freeze({
        trust: TRUST,
        kind: 'stale_binding',
        code: 'BOUND_ENDPOINT_DESCRIPTOR_HARD_EXPIRED',
      })
    }
    return Object.freeze({ trust: TRUST, kind: 'refresh_required', reason: input.freshness.reason })
  }
  if (input.freshness.kind === 'refresh_soft') {
    const fallback = decideOpenRouterImageSelectionV2({
      ...input,
      freshness: Object.freeze({
        kind: 'use_cached',
        ageMs: input.freshness.ageMs,
        settings: input.freshness.settings,
      }),
    })
    if (fallback.kind === 'refresh_required') {
      throw new Error('GENERATION_V2_OPENROUTER_SELECTION_FALLBACK_INVARIANT')
    }
    return Object.freeze({
      trust: TRUST,
      kind: 'refresh_required',
      reason: 'soft_refresh_due',
      fallbackAfterAllowedFailure: fallback,
    })
  }

  const candidates = frozenCandidates(input)
  const eligible = candidates.filter((candidate) => candidate.eligible)
  const requestedTag = input.requestedProviderTag?.value ?? null

  if (input.binding) {
    const endpointBinding = input.binding.record.endpointBinding
    const boundTag = endpointBinding.kind === 'pinned' ? endpointBinding.selector.providerTag.value : ''
    const boundCandidate = candidates.find((candidate) => candidate.providerTag === boundTag)
    if (!boundCandidate) {
      return Object.freeze({
        trust: TRUST,
        kind: 'stale_binding',
        code: 'BOUND_ENDPOINT_DESCRIPTOR_MISSING',
      })
    }
    if (requestedTag !== null && requestedTag !== boundTag) {
      const requested = eligible.find((candidate) => candidate.providerTag === requestedTag)
      if (!requested) {
        return Object.freeze({
          trust: TRUST,
          kind: 'stale_user_selection',
          code: 'OPENROUTER_IMAGE_PROVIDER_SELECTION_STALE',
          candidates,
        })
      }
      return Object.freeze({
        trust: TRUST,
        kind: 'binding_commit_required',
        selectedBy: 'user',
        candidate: requested,
        projection: input.projection,
        expectedBindingGeneration: input.binding.bindingGeneration,
        expectedDescriptorRowGeneration: input.descriptorCache.rowGeneration,
      })
    }
    if (!boundCandidate.eligible) {
      return Object.freeze({
        trust: TRUST,
        kind: 'bound_capability_mismatch',
        code: 'BOUND_ENDPOINT_CAPABILITY_MISMATCH',
        issues: boundCandidate.issues,
        candidates,
      })
    }
    if (input.binding.sourceDescriptorRowGeneration !== input.descriptorCache.rowGeneration ||
        input.binding.sourceEndpointSetRevision.value !== input.descriptorCache.endpointSetRevision.value ||
        !selectedCandidateMatchesBinding(boundCandidate, input.binding)) {
      return Object.freeze({
        trust: TRUST,
        kind: 'binding_revalidation_required',
        selectedBy: endpointBinding.kind === 'pinned' ? endpointBinding.selector.selectedBy : 'user',
        candidate: boundCandidate,
        projection: input.projection,
        expectedBindingGeneration: input.binding.bindingGeneration,
        expectedDescriptorRowGeneration: input.descriptorCache.rowGeneration,
      })
    }
    return Object.freeze({
      trust: TRUST,
      kind: 'reuse_binding',
      candidate: boundCandidate,
      projection: input.projection,
      bindingGeneration: input.binding.bindingGeneration,
      descriptorRowGeneration: input.descriptorCache.rowGeneration,
    })
  }

  if (requestedTag !== null) {
    const requested = eligible.find((candidate) => candidate.providerTag === requestedTag)
    if (!requested) {
      return Object.freeze({
        trust: TRUST,
        kind: 'stale_user_selection',
        code: 'OPENROUTER_IMAGE_PROVIDER_SELECTION_STALE',
        candidates,
      })
    }
    return Object.freeze({
      trust: TRUST,
      kind: 'binding_commit_required',
      selectedBy: 'user',
      candidate: requested,
      projection: input.projection,
      expectedBindingGeneration: null,
      expectedDescriptorRowGeneration: input.descriptorCache.rowGeneration,
    })
  }

  if (eligible.length === 0) {
    return Object.freeze({
      trust: TRUST,
      kind: 'unsupported',
      code: 'OPENROUTER_IMAGE_REQUEST_UNSUPPORTED',
      projectionIssues: input.projection.issues,
      candidateIssues: Object.freeze(candidates.map((candidate) => Object.freeze({
        providerTag: candidate.providerTag,
        issues: candidate.issues,
      }))),
      candidates,
    })
  }
  if (eligible.length > 1) {
    return Object.freeze({
      trust: TRUST,
      kind: 'selection_required',
      code: 'OPENROUTER_IMAGE_PROVIDER_SELECTION_REQUIRED',
      candidates,
    })
  }
  return Object.freeze({
    trust: TRUST,
    kind: 'binding_commit_required',
    selectedBy: 'sole_eligible',
    candidate: eligible[0],
    projection: input.projection,
    expectedBindingGeneration: null,
    expectedDescriptorRowGeneration: input.descriptorCache.rowGeneration,
  })
}
