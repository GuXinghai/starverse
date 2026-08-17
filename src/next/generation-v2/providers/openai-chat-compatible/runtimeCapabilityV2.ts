import {
  decodeRuntimeCapabilitySnapshotV2,
  RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2, type DecodedRuntimeCapabilitySnapshotV2,
  type PersistedRuntimeCapabilityFieldV2, type RuntimeCapabilitySemanticPathV2,
} from '../../capability/runtimeCapabilitySnapshotV2'
import { canonicalizeResolvedCapabilityV2, runtimeSnapshotRecordFromResolvedCapabilityV2, type ResolvedCapabilityV2 } from '../../capability/resolvedCapabilityV2'
import { credentialRevisionEvidenceV2 } from '../../capability/credentialRevisionEvidenceV2'
import { projectDecodedProviderBindingRecordV2, type DecodedProviderBindingRecordV2 } from '../../domain/providerBindingV2'
import { OPENAI_CHAT_COMPATIBLE_CONTRACT_DIGEST_V2 } from './verifiedContractV2'

const STANDARD_GENERATION = new Map<RuntimeCapabilitySemanticPathV2, Readonly<Record<string, unknown>>>([
  ['generation.maxOutputTokens', { kind: 'range', min: 1, max: 2_147_483_647, integer: true }],
  ['generation.temperature', { kind: 'range', min: 0, max: 2, integer: false }],
  ['generation.topP', { kind: 'range', min: 0, max: 1, integer: false }],
  ['generation.stop', { kind: 'string_list', maxItems: 4, maxItemLength: 1024 }],
  ['generation.seed', { kind: 'range', min: 0, max: 2_147_483_647, integer: true }],
  ['generation.frequencyPenalty', { kind: 'range', min: -2, max: 2, integer: false }],
  ['generation.presencePenalty', { kind: 'range', min: -2, max: 2, integer: false }],
])
const NO_WIRE_DISABLED = new Set<RuntimeCapabilitySemanticPathV2>(['web.mode', 'image.mode', 'tools.mode', 'providerExtension.kind'])

/**
 * The compatible family has no guessed capability discovery.  This baseline
 * contains only fields owned by its fixed Chat-Completions codec; mapping
 * dependent reasoning is advertised only when the frozen request profile has
 * an explicit source-field mapping.
 */
function resolveOpenAIChatCompatibleCapabilityRecordV2(input: Readonly<{
  binding: DecodedProviderBindingRecordV2
  resolvedAt: string
  credentialRevision: number
  mappedReasoningSourceFields: readonly ('reasoning_enabled' | 'reasoning_effort' | 'reasoning_budget')[]
}>): ResolvedCapabilityV2 {
  if (input.binding.providerId.value !== 'openai_compatible' || input.binding.protocolContractId.value !== 'openai_chat_compatible') {
    throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_CAPABILITY_INVALID')
  }
  const mapped = new Set(input.mappedReasoningSourceFields)
  const evidenceId = `openai-chat-compatible.contract.${OPENAI_CHAT_COMPATIBLE_CONTRACT_DIGEST_V2}`
  const fields: PersistedRuntimeCapabilityFieldV2[] = RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2.map((path) => {
    const generation = STANDARD_GENERATION.get(path)
    if (generation) return Object.freeze({ path, state: 'supported', domain: Object.freeze(generation), constraints: Object.freeze([]), evidenceIds: Object.freeze([evidenceId]) }) as unknown as PersistedRuntimeCapabilityFieldV2
    if (NO_WIRE_DISABLED.has(path)) return Object.freeze({ path, state: 'supported', domain: Object.freeze({ kind: 'enum', values: Object.freeze([path === 'providerExtension.kind' ? 'none' : 'disabled']) }), constraints: Object.freeze([]), evidenceIds: Object.freeze([evidenceId]) }) as PersistedRuntimeCapabilityFieldV2
    if (path === 'reasoning.mode') return Object.freeze({ path, state: 'supported', domain: Object.freeze({ kind: 'enum',
      values: Object.freeze(mapped.has('reasoning_enabled') ? ['disabled', 'enabled'] : ['disabled']) }), constraints: Object.freeze([]), evidenceIds: Object.freeze([evidenceId]) }) as PersistedRuntimeCapabilityFieldV2
    if (path === 'reasoning.effort' && mapped.has('reasoning_effort')) return Object.freeze({ path, state: 'supported', domain: Object.freeze({ kind: 'enum', values: Object.freeze(['low', 'medium', 'high']) }), constraints: Object.freeze([]), evidenceIds: Object.freeze([evidenceId]) }) as PersistedRuntimeCapabilityFieldV2
    return Object.freeze({ path, state: 'missing', constraints: Object.freeze([]), evidenceIds: Object.freeze([]) }) as PersistedRuntimeCapabilityFieldV2
  })
  return canonicalizeResolvedCapabilityV2({ binding: projectDecodedProviderBindingRecordV2(input.binding),
    evidence: [{ evidenceId, kind: 'contract_invariant', effect: 'supports', sourceRef: 'openai_chat_compatible',
      verifiedAt: input.resolvedAt, contentDigest: OPENAI_CHAT_COMPATIBLE_CONTRACT_DIGEST_V2 },
      credentialRevisionEvidenceV2({ credentialRevision: input.credentialRevision, verifiedAt: input.resolvedAt })],
    fields, continuation: { kind: 'client_managed_native_replay', artifactKind: 'openai_chat_compatible_messages',
      supportsBranchReplay: true, supportsRestartReplay: true, evidenceIds: [evidenceId] },
  })
}

export function composeOpenAIChatCompatibleBaselineCapabilityV2(input: Readonly<{
  binding: DecodedProviderBindingRecordV2
  resolvedAt: string
  credentialRevision: number
  mappedReasoningSourceFields: readonly ('reasoning_enabled' | 'reasoning_effort' | 'reasoning_budget')[]
}>): DecodedRuntimeCapabilitySnapshotV2 {
  const capability = resolveOpenAIChatCompatibleCapabilityRecordV2(input)
  return decodeRuntimeCapabilitySnapshotV2(runtimeSnapshotRecordFromResolvedCapabilityV2({ capability, resolvedAt: input.resolvedAt, tools: [] }))
}

/** Independent model capability resolver; the runtime snapshot is only the persistence envelope. */
export function resolveOpenAIChatCompatibleCapabilityV2(input: Readonly<{
  binding: DecodedProviderBindingRecordV2
  resolvedAt: string
  credentialRevision: number
  mappedReasoningSourceFields: readonly ('reasoning_enabled' | 'reasoning_effort' | 'reasoning_budget')[]
}>): ResolvedCapabilityV2 {
  return resolveOpenAIChatCompatibleCapabilityRecordV2(input)
}
