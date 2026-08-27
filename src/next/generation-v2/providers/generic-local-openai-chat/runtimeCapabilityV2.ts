import { decodeRuntimeCapabilitySnapshotV2, type DecodedRuntimeCapabilitySnapshotV2 } from '../../capability/runtimeCapabilitySnapshotV2'
import { MODEL_CAPABILITY_SEMANTIC_PATHS_V2 as RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2,
  type PersistedModelCapabilityFieldV2 as PersistedRuntimeCapabilityFieldV2,
  type ModelCapabilitySemanticPathV2 as RuntimeCapabilitySemanticPathV2 } from '../../capability/modelCapabilitySchemaV2'
import { canonicalizeResolvedCapabilityV2, runtimeSnapshotRecordFromResolvedCapabilityV2, type ResolvedCapabilityV2 } from '../../capability/resolvedCapabilityV2'
import { projectDecodedProviderBindingRecordV2, type DecodedProviderBindingRecordV2 } from '../../domain/providerBindingV2'
import { GENERIC_LOCAL_OPENAI_CHAT_CONTRACT_DIGEST_V2 } from './verifiedContractV2'

const DISABLED = new Set<RuntimeCapabilitySemanticPathV2>(['reasoning.mode','web.mode','image.mode','tools.mode','providerExtension.kind'])
const GENERATION = new Map<RuntimeCapabilitySemanticPathV2, Readonly<Record<string, unknown>>>([
  ['generation.maxOutputTokens', { kind: 'range', min: 1, max: 1048576, integer: true }],
  ['generation.temperature', { kind: 'range', min: 0, max: 2, integer: false }],
  ['generation.topP', { kind: 'range', min: 0, max: 1, integer: false }],
  ['generation.stop', { kind: 'string_list', maxItems: 16, maxItemLength: 16384 }],
])
function resolveGenericLocalOpenAIChatCapabilityRecordV2(input: Readonly<{ binding: DecodedProviderBindingRecordV2; resolvedAt: string }>): ResolvedCapabilityV2 {
  if (input.binding.providerId.value !== 'generic_local' || input.binding.protocolContractId.value !== 'generic-local-openai-chat-completions') throw new Error('GENERATION_V2_GENERIC_LOCAL_CAPABILITY_INVALID')
  const evidenceId = `generic-local.openai-chat.contract.${GENERIC_LOCAL_OPENAI_CHAT_CONTRACT_DIGEST_V2}`
  const fields: PersistedRuntimeCapabilityFieldV2[] = RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2.map((path) => {
    if (DISABLED.has(path)) return Object.freeze({ path, state: 'supported', domain: Object.freeze({ kind: 'enum', values: Object.freeze([path === 'providerExtension.kind' ? 'none' : 'disabled']) }), constraints: Object.freeze([]), evidenceIds: Object.freeze([evidenceId]) }) as PersistedRuntimeCapabilityFieldV2
    const domain = GENERATION.get(path)
    return domain ? Object.freeze({ path, state: 'supported', domain: Object.freeze(domain), constraints: Object.freeze([]), evidenceIds: Object.freeze([evidenceId]) }) as unknown as PersistedRuntimeCapabilityFieldV2
      : Object.freeze({ path, state: 'missing', constraints: Object.freeze([]), evidenceIds: Object.freeze([]) }) as PersistedRuntimeCapabilityFieldV2
  })
  return canonicalizeResolvedCapabilityV2({ binding: projectDecodedProviderBindingRecordV2(input.binding), evidence: [{ evidenceId,
      kind: 'contract_invariant', effect: 'supports', sourceRef: 'generic-local-explicit-openai-chat-profile-v1',
      verifiedAt: input.resolvedAt, contentDigest: GENERIC_LOCAL_OPENAI_CHAT_CONTRACT_DIGEST_V2 }], fields,
    continuation: { kind: 'client_managed_native_replay', artifactKind: 'generic_local_openai_chat_messages',
      supportsBranchReplay: true, supportsRestartReplay: true, evidenceIds: [evidenceId] } })
}

export function composeGenericLocalOpenAIChatBaselineCapabilityV2(input: Readonly<{ binding: DecodedProviderBindingRecordV2; resolvedAt: string }>): DecodedRuntimeCapabilitySnapshotV2 {
  const capability = resolveGenericLocalOpenAIChatCapabilityRecordV2(input)
  return decodeRuntimeCapabilitySnapshotV2(runtimeSnapshotRecordFromResolvedCapabilityV2({ capability, resolvedAt: input.resolvedAt, tools: [] }))
}

/** Independent model capability resolver; the runtime snapshot is only the persistence envelope. */
export function resolveGenericLocalOpenAIChatCapabilityV2(input: Readonly<{ binding: DecodedProviderBindingRecordV2; resolvedAt: string }>): ResolvedCapabilityV2 {
  return resolveGenericLocalOpenAIChatCapabilityRecordV2(input)
}
