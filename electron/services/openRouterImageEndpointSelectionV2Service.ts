import type BetterSqlite3 from 'better-sqlite3'
import { OpenRouterImageBindingRepo } from '../../infra/db/repo/openRouterImageBindingRepo'
import { OpenRouterImageSettingsRepo } from '../../infra/db/repo/openRouterImageSettingsRepo'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import { GenerationV2Identity } from '../../src/next/generation-v2/domain/identityV2'
import { projectDecodedProviderBindingRecordV2 } from '../../src/next/generation-v2/domain/providerBindingV2'
import {
  evaluateOpenRouterImageCandidatesV2,
  resolveOpenRouterImageSelectionInputV2,
} from '../../src/next/generation-v2/providers/openrouter-images/imageDescriptorSelectionV2'
import { decideOpenRouterImageSelectionV2 } from '../../src/next/generation-v2/providers/openrouter-images/selectionDecisionV2'
import { issueOpenRouterImageProviderBindingV2 } from '../../src/next/generation-v2/providers/openrouter-images/imageProviderBindingV2'
import { createOpenRouterImageDescriptorAuthorityV2Service } from './openRouterImageDescriptorAuthorityV2Service'

type Fetch = (url: string, init: RequestInit) => Promise<Response>

export class OpenRouterImageEndpointSelectionV2ServiceError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENROUTER_IMAGE_ENDPOINT_INPUT_INVALID'
    | 'GENERATION_V2_OPENROUTER_IMAGE_ENDPOINT_CREDENTIAL_INVALID'
    | 'OPENROUTER_IMAGE_PROVIDER_SELECTION_STALE'
    | 'OPENROUTER_IMAGE_REQUEST_UNSUPPORTED'
    | 'BOUND_ENDPOINT_CAPABILITY_MISMATCH'
    | 'BOUND_ENDPOINT_DESCRIPTOR_MISSING'
    | 'BOUND_ENDPOINT_DESCRIPTOR_PROVENANCE_MISMATCH'
    | 'BOUND_ENDPOINT_DESCRIPTOR_HARD_EXPIRED'
    | 'GENERATION_V2_OPENROUTER_IMAGE_ENDPOINT_SELECTION_INVARIANT') {
    super(code)
    this.name = 'OpenRouterImageEndpointSelectionV2ServiceError'
  }
}

function closedObject(value: unknown, keys: readonly string[]): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new OpenRouterImageEndpointSelectionV2ServiceError('GENERATION_V2_OPENROUTER_IMAGE_ENDPOINT_INPUT_INVALID')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.keys(descriptors).sort().join('\0') !== [...keys].sort().join('\0') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined)) {
    throw new OpenRouterImageEndpointSelectionV2ServiceError('GENERATION_V2_OPENROUTER_IMAGE_ENDPOINT_INPUT_INVALID')
  }
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, descriptors[key].value])))
}

function text(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512 || value.trim() !== value) {
    throw new OpenRouterImageEndpointSelectionV2ServiceError('GENERATION_V2_OPENROUTER_IMAGE_ENDPOINT_INPUT_INVALID')
  }
  return value
}

export type OpenRouterImageEndpointSelectionStateV2 = Readonly<{
  modelId: string
  credentialScopeId: string
  descriptorRowGeneration: number
  endpointSetRevision: string
  fetchedAtMs: number
  settings: Readonly<{ refreshAfterMs: number; hardExpireAfterMs: number; revision: number }>
  binding: null | Readonly<{
    providerTag: string
    providerSlug: string
    selectedBy: 'user' | 'sole_eligible'
    bindingGeneration: number
  }>
  decision: string
  candidates: readonly Readonly<{
    providerName: string
    providerTag: string
    providerSlug: string
    bound: boolean
    eligible: boolean
    issues: readonly Readonly<{ semanticPath: string; code: string; wireKey?: string }>[]
    allowedPassthroughParameters: readonly string[]
  }>[]
}>

export function createOpenRouterImageEndpointSelectionV2Service(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  fetchImpl?: Fetch
  nowMs?: () => number
}>) {
  const nowMs = input.nowMs ?? Date.now
  const settingsRepo = new OpenRouterImageSettingsRepo(input.db, nowMs)
  const bindingRepo = new OpenRouterImageBindingRepo(input.db, nowMs)
  const descriptorAuthority = createOpenRouterImageDescriptorAuthorityV2Service(input)

  async function resolveFacts(payload: unknown) {
    const raw = closedObject(payload, ['modelId', 'semanticIntent'])
    const modelId = GenerationV2Identity.create('model_id', text(raw.modelId))
    const projection = resolveOpenRouterImageSelectionInputV2(raw.semanticIntent)
    const credential = await input.credentialService.getStatus('openrouter')
    if (!credential.configured || !credential.credentialScopeId) {
      throw new OpenRouterImageEndpointSelectionV2ServiceError(
        'GENERATION_V2_OPENROUTER_IMAGE_ENDPOINT_CREDENTIAL_INVALID',
      )
    }
    const settings = settingsRepo.readOrRestore().settings
    const descriptor = await descriptorAuthority.resolve({
      modelId: modelId.value,
      credentialRevision: credential.revision,
      credentialScopeId: credential.credentialScopeId,
      settings: settings.pair,
    })
    const binding = bindingRepo.getBinding({ credentialScopeId: descriptor.credentialScopeId, modelId })
    return Object.freeze({ credential, settings, descriptor, binding, projection })
  }

  function projectState(
    facts: Awaited<ReturnType<typeof resolveFacts>>,
    decision: ReturnType<typeof decideOpenRouterImageSelectionV2>,
  ): OpenRouterImageEndpointSelectionStateV2 {
    const selector = facts.binding?.record.endpointBinding.kind === 'pinned'
      ? facts.binding.record.endpointBinding.selector : null
    const candidates = evaluateOpenRouterImageCandidatesV2({
      descriptorSet: facts.descriptor.descriptorSet,
      projection: facts.projection,
      boundProviderTag: selector?.providerTag.value ?? null,
    })
    const descriptorByTag = new Map(facts.descriptor.descriptorSet.descriptors.map((item) => [item.providerTag.value, item]))
    return Object.freeze({
      modelId: facts.descriptor.modelId.value,
      credentialScopeId: facts.descriptor.credentialScopeId.value,
      descriptorRowGeneration: facts.descriptor.rowGeneration,
      endpointSetRevision: facts.descriptor.endpointSetRevision.value,
      fetchedAtMs: facts.descriptor.fetchedAtMs,
      settings: Object.freeze({ ...facts.settings.pair, revision: facts.settings.revision }),
      binding: selector && facts.binding ? Object.freeze({
        providerTag: selector.providerTag.value,
        providerSlug: selector.providerSlug.value,
        selectedBy: selector.selectedBy,
        bindingGeneration: facts.binding.bindingGeneration,
      }) : null,
      decision: decision.kind,
      candidates: Object.freeze(candidates.map((candidate) => {
        const descriptor = descriptorByTag.get(candidate.providerTag)
        return Object.freeze({
          providerName: candidate.providerName,
          providerTag: candidate.providerTag,
          providerSlug: candidate.providerSlug,
          bound: selector?.providerTag.value === candidate.providerTag,
          eligible: candidate.eligible,
          issues: Object.freeze(candidate.issues.map((issue) => Object.freeze({ ...issue }))),
          allowedPassthroughParameters: descriptor?.allowedPassthroughParameters ?? Object.freeze([]),
        })
      })),
    })
  }

  function decisionFor(facts: Awaited<ReturnType<typeof resolveFacts>>, requestedProviderTag: string | null) {
    return decideOpenRouterImageSelectionV2({
      descriptorCache: facts.descriptor,
      freshness: Object.freeze({ kind: 'use_cached' as const, ageMs: Math.max(0, nowMs() - facts.descriptor.fetchedAtMs), settings: facts.settings.pair }),
      projection: facts.projection,
      binding: facts.binding === null ? null : Object.freeze({
        trust: 'repository_decoded_unverified' as const,
        bindingGeneration: facts.binding.bindingGeneration,
        sourceDescriptorRowGeneration: facts.binding.sourceDescriptorRowGeneration,
        sourceEndpointSetRevision: facts.binding.sourceEndpointSetRevision,
        record: facts.binding.record,
      }),
      requestedProviderTag: requestedProviderTag === null ? null : GenerationV2Identity.create('provider_tag', requestedProviderTag),
    })
  }

  function persistDecisionBinding(
    facts: Awaited<ReturnType<typeof resolveFacts>>,
    decision: Extract<ReturnType<typeof decideOpenRouterImageSelectionV2>, {
      kind: 'binding_commit_required' | 'binding_revalidation_required'
    }>,
  ): void {
    const descriptor = facts.descriptor.descriptorSet.descriptors.find((candidate) =>
      candidate.providerTag.value === decision.candidate.providerTag &&
      candidate.providerSlug.value === decision.candidate.providerSlug)
    if (!descriptor) throw new OpenRouterImageEndpointSelectionV2ServiceError(
      'GENERATION_V2_OPENROUTER_IMAGE_ENDPOINT_SELECTION_INVARIANT',
    )
    bindingRepo.compareAndSetBinding({
      record: projectDecodedProviderBindingRecordV2(issueOpenRouterImageProviderBindingV2({
        credentialScopeId: facts.descriptor.credentialScopeId.value,
        modelId: facts.descriptor.modelId.value,
        descriptor,
        selectedBy: decision.selectedBy,
        selectedAt: new Date(nowMs()).toISOString(),
      })),
      expectedBindingGeneration: decision.expectedBindingGeneration,
      expectedDescriptorRowGeneration: decision.expectedDescriptorRowGeneration,
    })
  }

  return Object.freeze({
    read: async (payload: unknown): Promise<OpenRouterImageEndpointSelectionStateV2> => {
      const facts = await resolveFacts(payload)
      const decision = decisionFor(facts, null)
      if ((decision.kind === 'binding_commit_required' && decision.selectedBy === 'sole_eligible') ||
          decision.kind === 'binding_revalidation_required') {
        persistDecisionBinding(facts, decision)
        const refreshed = await resolveFacts(payload)
        return projectState(refreshed, decisionFor(refreshed, null))
      }
      return projectState(facts, decision)
    },
    select: async (payload: unknown): Promise<OpenRouterImageEndpointSelectionStateV2> => {
      const raw = closedObject(payload, ['modelId', 'semanticIntent', 'providerTag'])
      const providerTag = text(raw.providerTag)
      const facts = await resolveFacts({ modelId: raw.modelId, semanticIntent: raw.semanticIntent })
      const decision = decisionFor(facts, providerTag)
      if (decision.kind === 'stale_user_selection' || decision.kind === 'unsupported' ||
          decision.kind === 'bound_capability_mismatch' || decision.kind === 'stale_binding') {
        throw new OpenRouterImageEndpointSelectionV2ServiceError(decision.code)
      }
      if (decision.kind === 'selection_required' || decision.kind === 'refresh_required') {
        throw new OpenRouterImageEndpointSelectionV2ServiceError(
          'GENERATION_V2_OPENROUTER_IMAGE_ENDPOINT_SELECTION_INVARIANT',
        )
      }
      if (decision.kind !== 'reuse_binding') persistDecisionBinding(facts,
        Object.freeze({ ...decision, selectedBy: 'user' }))
      const refreshed = await resolveFacts({ modelId: raw.modelId, semanticIntent: raw.semanticIntent })
      return projectState(refreshed, decisionFor(refreshed, null))
    },
    updateSettings: (payload: unknown) => {
      const raw = closedObject(payload, ['refreshAfterMs', 'hardExpireAfterMs', 'expectedRevision'])
      return settingsRepo.setPair({ refreshAfterMs: raw.refreshAfterMs, hardExpireAfterMs: raw.hardExpireAfterMs }, raw.expectedRevision)
    },
  })
}
