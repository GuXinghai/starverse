import {
  canonicalizeUnverifiedRuntimeCapabilitySnapshotV2,
  decodeRuntimeCapabilitySnapshotV2,
  RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2,
  type DecodedRuntimeCapabilitySnapshotV2,
  type PersistedRuntimeCapabilityFieldV2,
  type RuntimeCapabilityDomainV2,
  type RuntimeCapabilitySemanticPathV2,
} from '../../capability/runtimeCapabilitySnapshotV2'
import { projectDecodedProviderBindingRecordV2, type DecodedProviderBindingRecordV2 } from '../../domain/providerBindingV2'
import type { ToolDefinitionV2 } from '../../tools/toolRegistryV2'
import { LMSTUDIO_OPENRESPONSES_COMPLIANCE_EVIDENCE_SHA256_V2 } from './verifiedContractV2'

function supported(
  path: RuntimeCapabilitySemanticPathV2,
  domain: RuntimeCapabilityDomainV2,
  evidenceId: string,
): PersistedRuntimeCapabilityFieldV2 {
  return Object.freeze({ path, state: 'supported', domain, constraints: Object.freeze([]),
    evidenceIds: Object.freeze([evidenceId]) })
}
function unavailable(path: RuntimeCapabilitySemanticPathV2): PersistedRuntimeCapabilityFieldV2 {
  return Object.freeze({ path, state: 'unavailable', constraints: Object.freeze([]), evidenceIds: Object.freeze([]) })
}

/** Exact LM Studio 0.4.19 OpenResponses contract proven by the checked-in Gate 0 evidence. */
export function composeLmStudioOpenResponsesBaselineCapabilityV2(input: Readonly<{
  binding: DecodedProviderBindingRecordV2
  resolvedAt: string
  selectedTools?: readonly ToolDefinitionV2[]
}>): DecodedRuntimeCapabilitySnapshotV2 {
  if (input.binding.providerId.value !== 'lmstudio' || input.binding.protocolContractId.value !== 'lmstudio-openresponses' ||
      input.binding.operation !== 'text' || Number.isNaN(Date.parse(input.resolvedAt)) || new Date(input.resolvedAt).toISOString() !== input.resolvedAt) {
    throw new Error('GENERATION_V2_LMSTUDIO_CAPABILITY_INVALID')
  }
  const evidenceId = `lmstudio.openresponses.smoke.${LMSTUDIO_OPENRESPONSES_COMPLIANCE_EVIDENCE_SHA256_V2}`
  const confirmationEvidenceId = 'starverse.tool-confirmation.required-each-execution.v2'
  const fields = new Map<RuntimeCapabilitySemanticPathV2, PersistedRuntimeCapabilityFieldV2>()
  for (const path of RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2) fields.set(path, unavailable(path))
  fields.set('generation.temperature', supported('generation.temperature', { kind: 'range', min: 0, max: 2, integer: false }, evidenceId))
  fields.set('generation.topP', supported('generation.topP', { kind: 'range', min: 0, max: 1, integer: false }, evidenceId))
  fields.set('generation.maxOutputTokens', supported('generation.maxOutputTokens', { kind: 'range', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true }, evidenceId))
  fields.set('generation.frequencyPenalty', supported('generation.frequencyPenalty', { kind: 'range', min: -2, max: 2, integer: false }, evidenceId))
  fields.set('generation.presencePenalty', supported('generation.presencePenalty', { kind: 'range', min: -2, max: 2, integer: false }, evidenceId))
  fields.set('reasoning.mode', supported('reasoning.mode', { kind: 'enum', values: Object.freeze(['disabled', 'enabled']) }, evidenceId))
  fields.set('reasoning.effort', supported('reasoning.effort', { kind: 'enum', values: Object.freeze(['low']) }, evidenceId))
  fields.set('web.mode', supported('web.mode', { kind: 'enum', values: Object.freeze(['disabled']) }, evidenceId))
  fields.set('image.mode', supported('image.mode', { kind: 'enum', values: Object.freeze(['disabled']) }, evidenceId))
  const selectedTools = input.selectedTools ?? Object.freeze([])
  fields.set('tools.mode', supported('tools.mode', { kind: 'enum', values: Object.freeze(
    selectedTools.length === 0 ? ['disabled'] : ['disabled', 'enabled'],
  ) }, evidenceId))
  if (selectedTools.length > 0) {
    fields.set('tools.allowedToolIds', supported('tools.allowedToolIds', { kind: 'identity_list', maxItems: 128 }, evidenceId))
    fields.set('tools.toolChoice', supported('tools.toolChoice', { kind: 'enum', values: Object.freeze(['omitted', 'none', 'required']) }, evidenceId))
    fields.set('tools.sideEffectConfirmation', Object.freeze({ path: 'tools.sideEffectConfirmation',
      state: 'requires_confirmation', domain: Object.freeze({ kind: 'enum' as const,
        values: Object.freeze(['required_each_retry']) }), constraints: Object.freeze([]),
      evidenceIds: Object.freeze([confirmationEvidenceId]) }))
  }
  fields.set('providerExtension.kind', supported('providerExtension.kind', { kind: 'enum', values: Object.freeze(['none']) }, evidenceId))
  return decodeRuntimeCapabilitySnapshotV2(canonicalizeUnverifiedRuntimeCapabilitySnapshotV2({
    schemaVersion: 2, resolvedAt: input.resolvedAt, binding: projectDecodedProviderBindingRecordV2(input.binding),
    evidence: [{ evidenceId, kind: 'live_probe', effect: 'supports',
      sourceRef: 'lmstudio-openresponses-compliance-20260714', verifiedAt: input.resolvedAt,
      contentDigest: LMSTUDIO_OPENRESPONSES_COMPLIANCE_EVIDENCE_SHA256_V2 },
    { evidenceId: confirmationEvidenceId, kind: 'contract_invariant', effect: 'requires_confirmation',
      sourceRef: 'generation-compiler-v2-tool-side-effect-policy', verifiedAt: input.resolvedAt,
      contentDigest: LMSTUDIO_OPENRESPONSES_COMPLIANCE_EVIDENCE_SHA256_V2 }],
    fields: RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2.map((path) => fields.get(path)!),
    tools: selectedTools.map((tool) => Object.freeze({ toolId: tool.toolId, kind: tool.kind,
      state: tool.sideEffectPolicy === 'none' ? 'supported' as const : 'requires_confirmation' as const,
      sideEffectPolicy: tool.sideEffectPolicy, evidenceIds: Object.freeze([
        tool.sideEffectPolicy === 'none' ? evidenceId : confirmationEvidenceId,
      ]) })),
    continuation: { kind: 'client_managed_native_replay', artifactKind: 'lmstudio_openresponses_native_items',
      supportsBranchReplay: true, supportsRestartReplay: true, evidenceIds: [evidenceId] },
  }))
}
