import { decodeRuntimeCapabilitySnapshotV2,
  RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2, type DecodedRuntimeCapabilitySnapshotV2,
  type PersistedRuntimeCapabilityFieldV2, type RuntimeCapabilitySemanticPathV2 } from '../../capability/runtimeCapabilitySnapshotV2'
import { canonicalizeResolvedCapabilityV2, runtimeSnapshotRecordFromResolvedCapabilityV2, type ResolvedCapabilityV2 } from '../../capability/resolvedCapabilityV2'
import { credentialRevisionEvidenceV2 } from '../../capability/credentialRevisionEvidenceV2'
import { projectDecodedProviderBindingRecordV2, type DecodedProviderBindingRecordV2 } from '../../domain/providerBindingV2'
import type { LocalEndpointProfileV2 } from '../../../../../infra/db/repo/localEndpointProfileV2Repo'
import { readOllamaThinkingControlV2 } from './verifiedContractV2'

const UNAVAILABLE = new Set<RuntimeCapabilitySemanticPathV2>(['web.mode','image.mode','tools.mode','providerExtension.kind'])
const GENERATION = new Map<RuntimeCapabilitySemanticPathV2, Readonly<Record<string, unknown>>>([
  ['generation.maxOutputTokens',{kind:'range',min:1,max:1048576,integer:true}], ['generation.temperature',{kind:'range',min:0,max:100,integer:false}],
  ['generation.topP',{kind:'range',min:0,max:1,integer:false}], ['generation.topK',{kind:'range',min:1,max:1048576,integer:true}],
  ['generation.seed',{kind:'range',min:-2147483648,max:2147483647,integer:true}], ['generation.stop',{kind:'string_list',maxItems:16,maxItemLength:16384}],
  ['generation.repetitionPenalty',{kind:'range',min:0.000001,max:100,integer:false}],
])
function resolveOllamaChatCapabilityRecordV2(input: Readonly<{ binding: DecodedProviderBindingRecordV2; profile: LocalEndpointProfileV2; resolvedAt: string; credentialRevision: number }>): ResolvedCapabilityV2 {
  if (input.binding.providerId.value !== 'ollama' || input.binding.protocolContractId.value !== 'ollama-chat-v1' || input.binding.endpointProfileId.value !== input.profile.endpointProfileId) throw new Error('GENERATION_V2_OLLAMA_CAPABILITY_INVALID')
  const thinkingControl = readOllamaThinkingControlV2(input.profile); const evidenceId = `ollama.chat.profile.${input.profile.profileDigest}`
  const fields: PersistedRuntimeCapabilityFieldV2[] = RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2.map((path) => {
    const generation = GENERATION.get(path); if (generation) return Object.freeze({ path, state:'supported',domain:Object.freeze(generation),constraints:Object.freeze([]),evidenceIds:Object.freeze([evidenceId]) }) as unknown as PersistedRuntimeCapabilityFieldV2
    if (path === 'reasoning.mode') return Object.freeze({ path,state:'supported',domain:Object.freeze({kind:'enum',values:Object.freeze(['disabled','enabled'])}),constraints:Object.freeze([]),evidenceIds:Object.freeze([evidenceId]) }) as PersistedRuntimeCapabilityFieldV2
    if (path === 'reasoning.effort' && thinkingControl === 'effort') return Object.freeze({ path,state:'supported',domain:Object.freeze({kind:'enum',values:Object.freeze(['low','medium','high'])}),constraints:Object.freeze([{kind:'requires_value',path:'reasoning.mode',values:Object.freeze(['enabled'])}]),evidenceIds:Object.freeze([evidenceId]) }) as PersistedRuntimeCapabilityFieldV2
    if (UNAVAILABLE.has(path)) return Object.freeze({ path,state:'supported',domain:Object.freeze({kind:'enum',values:Object.freeze([path === 'providerExtension.kind' ? 'none':'disabled'])}),constraints:Object.freeze([]),evidenceIds:Object.freeze([evidenceId]) }) as PersistedRuntimeCapabilityFieldV2
    return Object.freeze({path,state:'missing',constraints:Object.freeze([]),evidenceIds:Object.freeze([])}) as PersistedRuntimeCapabilityFieldV2
  })
  return canonicalizeResolvedCapabilityV2({binding:projectDecodedProviderBindingRecordV2(input.binding),evidence:[{evidenceId,kind:'contract_invariant',effect:'supports',
      sourceRef:`ollama-explicit-profile:${input.profile.endpointProfileId}`,verifiedAt:input.resolvedAt,contentDigest:input.profile.profileDigest},
    credentialRevisionEvidenceV2({ credentialRevision: input.credentialRevision, verifiedAt: input.resolvedAt })],fields,
    continuation:{kind:'client_managed_native_replay',artifactKind:'ollama_chat_native_messages',supportsBranchReplay:true,supportsRestartReplay:true,evidenceIds:[evidenceId]}})
}

export function composeOllamaChatCapabilityV2(input: Readonly<{ binding: DecodedProviderBindingRecordV2; profile: LocalEndpointProfileV2; resolvedAt: string; credentialRevision: number }>): DecodedRuntimeCapabilitySnapshotV2 {
  const capability = resolveOllamaChatCapabilityRecordV2(input)
  return decodeRuntimeCapabilitySnapshotV2(runtimeSnapshotRecordFromResolvedCapabilityV2({ capability, resolvedAt: input.resolvedAt, tools: [] }))
}

/** Independent model capability resolver; the runtime snapshot is only the persistence envelope. */
export function resolveOllamaChatCapabilityV2(input: Readonly<{ binding: DecodedProviderBindingRecordV2; profile: LocalEndpointProfileV2; resolvedAt: string; credentialRevision: number }>): ResolvedCapabilityV2 {
  return resolveOllamaChatCapabilityRecordV2(input)
}
