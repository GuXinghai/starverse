import type { OpenAICompatibleActiveConfigurationV2, OpenAICompatibleEndpointRevisionV2 } from '../../infra/db/repo/openAICompatibleV2Repo'
import type { GenerationV2AuthorityTransactionContextV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { isOpenAIChatCompatibleRequestHistoryFactForContextV2, type OpenAIChatCompatibleRequestHistoryFactV2 } from '../../infra/db/repo/openAIChatCompatibleNativeHistoryV2Repo'
import { isGenerationExecutionOperationBundleForContextV2, type GenerationExecutionOperationBundleV2 } from '../../infra/db/repo/generationExecutionV2Repo'
import { createSemanticConsumptionLedgerV2 } from '../../src/next/generation-v2/compiler/semanticConsumptionLedgerV2'
import { createNoCredentialHeaderPlanV2, createOpenAICompatibleCredentialHeaderPlanV2, issuePreparedProviderRequestV2, type PreparedProviderRequestV2 } from '../../src/next/generation-v2/compiler/preparedProviderRequestV2'
import { ImmutablePreparedBodyV2, sha256PreparedBytesV2, stableSerializeProviderRequestV2 } from '../../src/next/generation-v2/compiler/stableSerialize'
import { buildCompatibleChatRequest } from '../../src/shared/provider/openai-chat-compatible/request/buildCompatibleChatRequest'
import { compatibleAuthDescriptorSchema, compatibleInlinePolicyConfigSchema, compatibleReasoningMappingConfigSchema, compatibleRequestFieldMappingConfigSchema, compatibleRequestProfileConfigSchema, compatibleResponseProfileConfigSchema } from '../../src/shared/provider/openai-chat-compatible/schemas'
import { projectOpenAIChatCompatibleIntentV2 } from '../../src/next/generation-v2/providers/openai-chat-compatible/intentProjectionV2'
import { readOpenAIChatCompatibleChatEndpointV2 } from '../../src/next/generation-v2/providers/openai-chat-compatible/verifiedContractV2'

export class OpenAIChatCompatiblePreparedRequestCompilerV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENAI_COMPATIBLE_COMPILER_AUTHORITY_INVALID'
    | 'GENERATION_V2_OPENAI_COMPATIBLE_COMPILER_PROVENANCE_INVALID'
    | 'GENERATION_V2_OPENAI_COMPATIBLE_COMPILER_CONFIG_INVALID') {
    super(code)
    this.name = 'OpenAIChatCompatiblePreparedRequestCompilerV2Error'
  }
}

function digest(value: unknown): string {
  return sha256PreparedBytesV2(new TextEncoder().encode(stableSerializeProviderRequestV2(value)))
}
function fail(code: OpenAIChatCompatiblePreparedRequestCompilerV2Error['code']): never {
  throw new OpenAIChatCompatiblePreparedRequestCompilerV2Error(code)
}

/**
 * Compiles a single stored compatible snapshot. The caller may supply only
 * repository-loaded endpoint/config facts and complete native messages.
 */
export function compileOpenAIChatCompatiblePreparedRequestV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  execution: GenerationExecutionOperationBundleV2
  endpoint: OpenAICompatibleEndpointRevisionV2
  configuration: OpenAICompatibleActiveConfigurationV2
  history: OpenAIChatCompatibleRequestHistoryFactV2
}>): PreparedProviderRequestV2 {
  if (!isGenerationExecutionOperationBundleForContextV2(input.execution, input.context) ||
      !isOpenAIChatCompatibleRequestHistoryFactForContextV2(input.history, input.context) ||
      !['committed', 'streaming', 'completed', 'failed', 'cancelled'].includes(input.execution.operation.state)) {
    return fail('GENERATION_V2_OPENAI_COMPATIBLE_COMPILER_AUTHORITY_INVALID')
  }
  const { operation, snapshot, capability } = input.execution
  const binding = snapshot.providerBinding
  const provenance = snapshot.providerConfiguration
  if (binding.providerId.value !== 'openai_compatible' || binding.protocolContractId.value !== 'openai_chat_compatible' ||
      binding.operation !== 'text' || binding.endpointBinding.kind !== 'provider_managed_set' ||
      provenance.kind !== 'openai_chat_compatible' || input.endpoint.providerInstanceId !== provenance.providerInstanceId.value ||
      input.endpoint.endpointRevisionId !== provenance.endpointRevisionId.value || input.endpoint.endpointDigest !== provenance.endpointDigest.value ||
      binding.endpointProfileId.value !== input.endpoint.providerInstanceId || binding.endpointBinding.endpointSetRevision.value !== input.endpoint.endpointRevisionId) {
    return fail('GENERATION_V2_OPENAI_COMPATIBLE_COMPILER_PROVENANCE_INVALID')
  }
  let requestProfile: ReturnType<typeof compatibleRequestProfileConfigSchema.parse>
  let requestMappings: ReturnType<typeof compatibleRequestFieldMappingConfigSchema.parse>[]
  let reasoningMapping: ReturnType<typeof compatibleReasoningMappingConfigSchema.parse>
  let inlinePolicy: ReturnType<typeof compatibleInlinePolicyConfigSchema.parse>
  let responseProfile: ReturnType<typeof compatibleResponseProfileConfigSchema.parse>
  let auth: ReturnType<typeof compatibleAuthDescriptorSchema.parse>
  try {
    requestProfile = compatibleRequestProfileConfigSchema.parse(input.configuration.requestProfile.payload)
    requestMappings = input.configuration.requestMappings.map((entry) => compatibleRequestFieldMappingConfigSchema.parse(entry.payload))
    reasoningMapping = compatibleReasoningMappingConfigSchema.parse(input.configuration.reasoningMapping.payload)
    inlinePolicy = compatibleInlinePolicyConfigSchema.parse(input.configuration.inlinePolicy.payload)
    responseProfile = compatibleResponseProfileConfigSchema.parse(input.configuration.responseProfile.payload)
    auth = compatibleAuthDescriptorSchema.parse(input.endpoint.auth)
  } catch { return fail('GENERATION_V2_OPENAI_COMPATIBLE_COMPILER_CONFIG_INVALID') }
  const matching = (entry: { configId: string; version: number; payloadDigest: string }, expected: { id: { value: string }; version: number; digest: { value: string } }) =>
    entry.configId === expected.id.value && entry.version === expected.version && entry.payloadDigest === expected.digest.value
  if (!matching(input.configuration.requestProfile, provenance.requestProfile) ||
      !matching(input.configuration.reasoningMapping, provenance.reasoningMapping) ||
      !matching(input.configuration.inlinePolicy, provenance.inlinePolicy) ||
      !matching(input.configuration.responseProfile, provenance.responseProfile) ||
      input.configuration.requestMappings.length !== provenance.requestMappings.length ||
      input.configuration.requestMappings.some((entry, index) => !matching(entry, provenance.requestMappings[index]!)) ||
      digest(provenance.extraBody ?? {}) !== provenance.extraBodyDigest.value) {
    return fail('GENERATION_V2_OPENAI_COMPATIBLE_COMPILER_PROVENANCE_INVALID')
  }
  // Parsing these now proves the profile links frozen by the response profile.
  if ((responseProfile.reasoningMapping.mappingId !== provenance.reasoningMapping.id.value ||
       responseProfile.reasoningMapping.version !== provenance.reasoningMapping.version) ||
      responseProfile.inlinePolicy.inlinePolicyId !== provenance.inlinePolicy.id.value ||
      responseProfile.inlinePolicy.version !== provenance.inlinePolicy.version ||
      reasoningMapping.schemaVersion !== 1 || inlinePolicy.schemaVersion !== 1) {
    return fail('GENERATION_V2_OPENAI_COMPATIBLE_COMPILER_PROVENANCE_INVALID')
  }
  const semantic = projectOpenAIChatCompatibleIntentV2(snapshot.semanticIntent, requestMappings.map((mapping) => mapping.sourceField))
  let built: ReturnType<typeof buildCompatibleChatRequest>
  try {
    built = buildCompatibleChatRequest({ modelId: binding.modelId.value, messages: input.history.replayMessages, stream: true,
      profile: requestProfile, fields: semantic.fields, reasoningControls: semantic.reasoningControls,
      requestMappings, ...(provenance.extraBody === null ? {} : { extraBody: provenance.extraBody as never }),
      historyReasoningReplay: { policy: reasoningMapping.replay, entries: input.history.reasoningReplay } })
  } catch { return fail('GENERATION_V2_OPENAI_COMPATIBLE_COMPILER_CONFIG_INVALID') }
  const mappingEntries = built.diagnostics.map((item) => ({ kind: 'consumed' as const,
    path: `compatible.ownership.${item.path.map(String).join('.')}`, disposition: 'accepted_no_wire' as const,
    nativeField: null, evidence: `openai_chat_compatible:${item.owner}` }))
  const ledger = createSemanticConsumptionLedgerV2([...semantic.ledgerEntries, ...mappingEntries])
  const ordinaryHeaders = (input.endpoint.ordinaryHeaders as readonly { name: string; value: string }[]).map(({ name, value }) => ({ name, value }))
  const headersPlan = auth.mode === 'none' ? createNoCredentialHeaderPlanV2(ordinaryHeaders)
    : createOpenAICompatibleCredentialHeaderPlanV2(auth.mode, ordinaryHeaders)
  return issuePreparedProviderRequestV2({ operationId: operation.operationId.value, answerRootId: operation.resultAnswerRootId.value,
    requestSequence: 1, providerId: 'openai_compatible', endpointProfileId: input.endpoint.providerInstanceId,
    credentialScopeId: binding.credentialScopeId.value, contractId: 'openai_chat_compatible', modelId: binding.modelId.value,
    effectiveEndpointId: input.endpoint.providerInstanceId, endpoint: readOpenAIChatCompatibleChatEndpointV2(input.endpoint),
    headersPlan, body: ImmutablePreparedBodyV2.fromNativeRequestWithMaxBytes(built.body, 20 * 1024 * 1024), ledger,
    capabilityRevision: capability.revision.value, snapshotHash: snapshot.snapshotHash.value })
}
