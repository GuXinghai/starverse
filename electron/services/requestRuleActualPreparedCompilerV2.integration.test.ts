import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationExecutionV2Repo } from '../../infra/db/repo/generationExecutionV2Repo'
import { OpenRouterNativeHistoryV2Repo } from '../../infra/db/repo/openRouterNativeHistoryV2Repo'
import { OpenAIResponsesNativeHistoryV2Repo } from '../../infra/db/repo/openAIResponsesNativeHistoryV2Repo'
import { GenericLocalOpenAIChatNativeHistoryV2Repo } from '../../infra/db/repo/genericLocalOpenAIChatNativeHistoryV2Repo'
import { OllamaChatNativeHistoryV2Repo } from '../../infra/db/repo/ollamaChatNativeHistoryV2Repo'
import { LmStudioOpenResponsesNativeHistoryV2Repo } from '../../infra/db/repo/lmStudioOpenResponsesNativeHistoryV2Repo'
import { DeepSeekNativeHistoryV2Repo } from '../../infra/db/repo/deepSeekNativeHistoryV2Repo'
import { OpenAIChatCompatibleNativeHistoryV2Repo } from '../../infra/db/repo/openAIChatCompatibleNativeHistoryV2Repo'
import { OpenAICompatibleV2Repo } from '../../infra/db/repo/openAICompatibleV2Repo'
import { ToolRegistryV2Repo } from '../../infra/db/repo/toolRegistryV2Repo'
import { decodeToolRegistryRevisionV2 } from '../../src/core/generation-v2/tools/toolRegistryV2'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2, type GenerationV2AuthorityTransactionContextV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { canonicalizeResolvedCapabilityV2, runtimeSnapshotRecordFromResolvedCapabilityV2 } from '../../src/core/generation-v2/capability/resolvedCapabilityV2'
import { decodeProviderBindingRecordV2, projectDecodedProviderBindingRecordV2 } from '../../src/core/generation-v2/domain/providerBindingV2'
import type { PersistedRuntimeContinuationCapabilityV2 } from '../../src/core/generation-v2/capability/runtimeCapabilitySnapshotV2'
import { MODEL_CAPABILITY_SEMANTIC_PATHS_V2 } from '../../src/core/generation-v2/capability/modelCapabilitySchemaV2'
import { decodeRuntimeCapabilitySnapshotV2 } from '../../src/core/generation-v2/capability/runtimeCapabilitySnapshotV2'
import { decodeCapabilityRuleCorePackV2, decodeCapabilityRuleOwnershipSnapshotV2 } from '../../src/core/generation-v2/capability-rules/capabilityRuleCoreV2'
import { bindRequestRulesToSubjectsV2 } from '../../src/core/generation-v2/capability-rules/boundRequestRulesV2'
import { resolveRequestRulesV2 } from '../../src/core/generation-v2/capability-rules/requestRuleResolverV2'
import { createEffectiveRequestPlanV2 } from '../../src/core/generation-v2/compiler/effectiveRequestPlanV2'
import { createResolvedInvocationV2 } from '../../src/core/generation-v2/compiler/resolvedInvocationV2'
import { canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2, decodeAssistantAnswerGenerationSnapshotV2 } from '../../src/core/generation-v2/domain/assistantAnswerGenerationSnapshotV2'
import { decodeResolvedGenerationIntentV2 } from '../../src/core/generation-v2/domain/resolvedGenerationIntentV2'
import { projectGenerationIntentLayerV2 } from '../../src/core/generation-v2/domain/generationIntentProjectionV2'
import { decodeCanonicalOpenRouterImageDescriptorSetV2 } from '../../src/core/generation-v2/providers/openrouter-images/canonicalDescriptorV2'
import { OPENROUTER_NATIVE_HISTORY_ARTIFACT_KIND_V1 } from '../../src/core/generation-v2/providers/openrouter/nativeMessagesV1'
import { readVerifiedOpenRouterFirstPartyEndpointProfileV2, resolveOpenRouterFirstPartyOperationV2 } from '../../src/core/generation-v2/providers/openrouter/verifiedFirstPartyEndpointProfileV2'
import { compileOpenRouterChatPreparedRequestV2 } from './openRouterChatPreparedRequestCompilerV2'
import { compileOpenRouterImagePreparedRequestV2 } from './openRouterImagePreparedRequestCompilerV2'
import { createGenericLocalOpenAIChatProviderBindingV2 } from '../../src/core/generation-v2/providers/generic-local-openai-chat/verifiedContractV2'
import { createOllamaChatProviderBindingV2 } from '../../src/core/generation-v2/providers/ollama-chat/verifiedContractV2'
import { createLmStudioOpenResponsesProviderBindingV2 } from '../../src/core/generation-v2/providers/lmstudio-openresponses/verifiedContractV2'
import { LMSTUDIO_OPENRESPONSES_ARTIFACT_KIND_V1 } from '../../src/core/generation-v2/providers/lmstudio-openresponses/continuationArtifactV1'
import { readVerifiedDeepSeekStableEndpointProfileV2 } from '../../src/core/generation-v2/providers/deepseek/stableEndpointProfileV2'
import { readReviewedDeepSeekStableChatDefinitionV2 } from '../../src/core/generation-v2/contracts/providerContractRegistryV2'
import { DEEPSEEK_NATIVE_HISTORY_ARTIFACT_KIND_V2 } from '../../src/core/generation-v2/providers/deepseek/nativeMessagesV1'
import { compileGenericLocalOpenAIChatPreparedRequestV2 } from './genericLocalOpenAIChatPreparedRequestCompilerV2'
import { compileOllamaChatPreparedRequestV2 } from './ollamaChatPreparedRequestCompilerV2'
import { compileLmStudioOpenResponsesPreparedRequestV2 } from './lmStudioOpenResponsesPreparedRequestCompilerV2'
import { compileDeepSeekPreparedRequestV2 } from './deepSeekInitialPreparedRequestCompilerV2'
import { compileOpenAIChatCompatiblePreparedRequestV2 } from './openAIChatCompatiblePreparedRequestCompilerV2'
import { createOpenAIChatCompatibleProviderBindingV2 } from '../../src/core/generation-v2/providers/openai-chat-compatible/verifiedContractV2'
import type { ToolDefinitionsContextV2 } from '../../src/core/generation-v2/capability-rules/operations/toolDefinitionsV2'
import { compileOpenAIResponsesPreparedRequestV2 } from './openAIResponsesPreparedRequestCompilerV2'
import { readVerifiedOpenAIResponsesEndpointProfileV2 } from '../../src/core/generation-v2/providers/openai-responses/verifiedEndpointProfileV2'
import { readReviewedOpenAIResponsesDefinitionV2 } from '../../src/core/generation-v2/contracts/providerContractRegistryV2'
import { OPENAI_RESPONSES_ARTIFACT_KIND_V2 } from '../../src/core/generation-v2/providers/openai-responses/continuationArtifactV2'
import { sha256HexBytes } from '../../src/shared/crypto/sha256Hex'
import { stableSerializeProviderRequestV2 } from '../../src/shared/serialization/canonicalJsonV2'
import type { LocalEndpointProfileV2 } from '../../src/shared/provider/localEndpointProfileContractsV2'

const at = '2026-10-17T00:00:00.000Z'
const credentialScopeId = `credential-scope-v2:${'b'.repeat(64)}`
const supportEvidenceId = 'test.prepared-rule.support'
const unknownEvidenceId = 'test.prepared-rule.unknown'
const testRuleOwner = 'local-user:prepared-rule-test'

function createBinding(operation: 'chat_completions' | 'image_generate', modelId: string, descriptor?: ReturnType<typeof decodeCanonicalOpenRouterImageDescriptorSetV2>['descriptors'][number]) {
  const profile = readVerifiedOpenRouterFirstPartyEndpointProfileV2()
  const route = resolveOpenRouterFirstPartyOperationV2(profile, operation)
  return {
    credentialScopeId,
    providerId: profile.providerId.value,
    endpointProfileId: profile.endpointProfileId.value,
    endpointBinding: operation === 'chat_completions'
      ? { kind: 'provider_managed_set' as const, endpointSetRevision: profile.endpointSetRevision.value,
          descriptors: [{ endpointId: profile.operations.chat_completions.descriptor.endpointId.value,
            descriptorRevision: profile.operations.chat_completions.descriptor.descriptorRevision.value }] }
      : { kind: 'pinned' as const, selector: {
          kind: 'openrouter_images_v1' as const,
          providerTag: descriptor!.providerTag.value,
          providerSlug: descriptor!.providerSlug.value,
          descriptorRevision: descriptor!.descriptorRevision.value,
          descriptorDigest: descriptor!.descriptorDigest.value,
          selectedBy: 'user' as const,
          selectedAt: at,
        } },
    protocolContractId: route.contract.protocolContractId.value,
    contractRevision: route.contract.contractRevision.value,
    contractDefinitionDigest: route.contract.definitionDigest.value,
    registryRevision: route.contract.registryRevision.value,
    modelId,
    operation: operation === 'chat_completions' ? 'text' as const : 'image_generate' as const,
  }
}

function makeRulePack(input: Readonly<{
  modelId: string
  protocolContractId: string
  rules: readonly Readonly<Record<string, unknown>>[]
}>) {
  const pack = decodeCapabilityRuleCorePackV2({
    schemaVersion: 2,
    packId: `prepared-compiler-${input.modelId}`,
    displayName: 'Prepared compiler integration rules',
    description: null,
    priority: 10,
    mode: 'override',
    target: 'enabled',
    rules: input.rules,
  })
  return decodeCapabilityRuleOwnershipSnapshotV2({
    schemaVersion: 2,
    ownership: 'user',
    ownerId: testRuleOwner,
    packs: [pack],
  })
}

function createCapability(binding: Readonly<Record<string, unknown>>, supportedPaths: Readonly<Record<string, unknown>>,
  continuation?: PersistedRuntimeContinuationCapabilityV2) {
  const operation = binding.operation === 'image_generate' ? 'image_generate' : 'text'
  const evidence = [
    { evidenceId: supportEvidenceId, kind: 'contract_invariant', effect: 'supports',
      sourceRef: 'test:prepared-compiler-v2-rule', verifiedAt: at, contentDigest: 'a'.repeat(64) },
    { evidenceId: unknownEvidenceId, kind: 'contract_invariant', effect: 'unknown',
      sourceRef: 'test:prepared-compiler-v2-unknown', verifiedAt: at, contentDigest: 'b'.repeat(64) },
  ]
  return canonicalizeResolvedCapabilityV2({
    binding,
    evidence,
    fields: MODEL_CAPABILITY_SEMANTIC_PATHS_V2.map(path => {
      const domain = supportedPaths[path]
      return domain === undefined
        ? { path, state: 'unknown', constraints: [], evidenceIds: [unknownEvidenceId] }
        : { path, state: 'supported', domain, constraints: [], evidenceIds: [supportEvidenceId] }
    }),
    continuation: continuation ?? { kind: operation === 'text' ? 'client_managed_native_replay' : 'none',
      ...(operation === 'text' ? { artifactKind: OPENROUTER_NATIVE_HISTORY_ARTIFACT_KIND_V1,
        supportsBranchReplay: true, supportsRestartReplay: true } : {}),
      evidenceIds: [supportEvidenceId] },
  })
}

function preparePlan(input: Readonly<{
  capability: ReturnType<typeof createCapability>
  modelId: string
  rules: readonly Readonly<Record<string, unknown>>[]
  requested: unknown
  toolDefinitions?: ToolDefinitionsContextV2
}>) {
  const requested = decodeResolvedGenerationIntentV2(input.requested).value
  const binding = input.capability.executionContext.binding
  const subject = { providerAuthorityId: binding.providerId.value, endpointProfileId: binding.endpointProfileId.value,
    nativeModelId: input.modelId }
  const snapshot = makeRulePack({ modelId: input.modelId, protocolContractId: binding.protocolContractId.value, rules: input.rules })
  const bundle = bindRequestRulesToSubjectsV2({ snapshots: [snapshot], subjects: [subject],
    defaultActivationPolicies: { cloud: 'disabled', user: 'enabled' } })[0]!
  const resolved = resolveRequestRulesV2({ requested, capability: input.capability, bundle,
    ...(input.toolDefinitions === undefined ? {} : { toolDefinitions: input.toolDefinitions }) })
  const invocation = createResolvedInvocationV2({ requested, capability: input.capability, bundle, resolution: resolved })
  const plan = createEffectiveRequestPlanV2({ requested, effective: resolved.intent.value, capability: input.capability,
    resolution: invocation, decisions: resolved.adaptations })
  return { requested, effective: resolved.intent.value, plan, invocation }
}

function prepareExecutionSnapshot(input: Readonly<{
  db: BetterSqlite3.Database
  capability: ReturnType<typeof createCapability>
  binding: unknown
  operationId: string
  answerId: string
  semanticIntent: unknown
  requestPlan?: ReturnType<typeof preparePlan>['plan']
  toolRegistry?: ReturnType<ToolRegistryV2Repo['installAndSelect']>
  providerConfiguration?: unknown
}>) {
  const record = runtimeSnapshotRecordFromResolvedCapabilityV2({ capability: input.capability, resolvedAt: at,
    tools: input.toolRegistry?.definitions.map(tool => ({ toolId: tool.toolId, kind: tool.kind, state: 'supported',
      sideEffectPolicy: tool.sideEffectPolicy, evidenceIds: [supportEvidenceId] })) ?? [] })
  const decodedRecord = decodeRuntimeCapabilitySnapshotV2(record)
  input.db.prepare('INSERT INTO runtime_capability_snapshot_v2 VALUES(?,?,2,?,?,?,1)').run(
    decodedRecord.snapshotHash.value, decodedRecord.revision.value, decodedRecord.canonicalJson,
    decodedRecord.evidenceDigest.value, decodedRecord.semanticFieldsDigest.value)
  const snapshot = decodeAssistantAnswerGenerationSnapshotV2(canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({
    schemaVersion: 2,
    operationId: input.operationId,
    answerRootId: input.answerId,
    semanticIntent: projectGenerationIntentLayerV2(input.semanticIntent as ReturnType<typeof decodeResolvedGenerationIntentV2>['value']),
    ...(input.requestPlan === undefined ? {} : { requestPlan: input.requestPlan }),
    resolvedConfigRevisions: [
      { ownerKind: 'global', ownerId: 'global', revision: 'config:global:1' },
      { ownerKind: 'project', ownerId: 'project:prepared-test', revision: 'config:project:1' },
      { ownerKind: 'conversation', ownerId: 'conversation:prepared-test', revision: 'config:conversation:1' },
    ],
    providerBinding: input.binding,
    capabilityBinding: { capabilityRevision: decodedRecord.revision.value, evidenceDigest: decodedRecord.evidenceDigest.value,
      semanticFieldsDigest: decodedRecord.semanticFieldsDigest.value, snapshotHash: decodedRecord.snapshotHash.value },
    attachmentProviderFileBindings: [],
    toolAuthority: input.toolRegistry ? { kind: 'registry', toolRegistryRevision: input.toolRegistry.revision,
      toolDefinitionsDigest: input.toolRegistry.definitionsDigest } : { kind: 'none' },
    ...(input.providerConfiguration === undefined ? {} : { providerConfiguration: input.providerConfiguration }),
  }))
  return { record, snapshot }
}

function beginOperation(execution: GenerationExecutionV2Repo, graph: ConversationGraphV2Repo,
  context: GenerationV2AuthorityTransactionContextV2,
  snapshot: ReturnType<typeof decodeAssistantAnswerGenerationSnapshotV2>, operationId: string, answerId: string) {
  graph.createProject(context, { projectId: 'project:prepared-test', name: 'Prepared compiler test', createdAtMs: 1 })
  graph.createConversationAndDefaultBranch(context, { projectId: 'project:prepared-test', conversationId: 'conversation:prepared-test',
    branchId: 'branch:prepared-test', title: 'Prepared compiler test', branchName: null, createdAtMs: 2 })
  const pending = graph.beginInitialTurn(context, { operationId, branchId: 'branch:prepared-test', expectedHeadMessageId: null,
    questionId: `question:${operationId}`, answerRootId: answerId, userBody: 'Draw a red kite.', createdAtMs: 10 })
  const inserted = execution.insertOperationAndSnapshot(context, { operationId, actionKind: 'initial_send', branchId: 'branch:prepared-test',
    conversationId: 'conversation:prepared-test', questionId: `question:${operationId}`, sourceAnswerId: null, targetAnswerId: answerId,
    snapshot: snapshot.canonicalJson, commandFingerprint: 'b'.repeat(64), createdAtMs: 10 })
  graph.commitInitialTurnProjection(context, pending)
  return inserted.bundle
}

function createToolRegistry(repo: ToolRegistryV2Repo, options: Readonly<{ parameters?: Readonly<Record<string, unknown>>; strict?: boolean }> = {}) {
  return repo.installAndSelect({ schemaVersion: 2, definitions: [{ toolId: 'tool:weather', kind: 'function',
    function: { name: 'weather', description: 'Read weather',
      ...(options.parameters === undefined ? {} : { parameters: options.parameters }),
      ...(options.strict === undefined ? {} : { strict: options.strict }) },
    sideEffectPolicy: 'none' }] }, null)
}

function createRule(ruleId: string, binding: Readonly<{ providerId: { value: string }; endpointProfileId: { value: string } }>, modelId: string,
  category: string, effect: Readonly<Record<string, unknown>>, when: Readonly<Record<string, unknown>> | null = null) {
  return { ruleId, label: null, description: 'Actual prepared compiler rule', priority: 0, configured: 'on',
    providerAuthorityId: binding.providerId.value, endpointProfileId: binding.endpointProfileId.value,
    selector: { kind: 'exact', nativeModelIds: [modelId] }, evidence: null, category, when, effect,
    decisionKey: `request.${ruleId}`, dependencies: [] }
}

function createLocalProfile(input: Readonly<{ endpointProfileId: string; providerId: 'generic_local' | 'ollama' | 'lmstudio';
  protocolContractId: 'generic-local-openai-chat-completions' | 'ollama-chat-v1' | 'lmstudio-openresponses'; modelId: string;
  baseUrl: string; protocolConfig?: Readonly<Record<string, unknown>> }>): LocalEndpointProfileV2 {
  return Object.freeze({ endpointProfileId: input.endpointProfileId, providerId: input.providerId,
    protocolContractId: input.protocolContractId, baseUrl: input.baseUrl, credentialMode: 'none', credentialScopeId,
    protocolConfig: Object.freeze({ modelId: input.modelId, ...input.protocolConfig }), revisionGeneration: 1,
    profileRevision: `${input.endpointProfileId}:revision:1`, profileDigest: 'd'.repeat(64), createdAtMs: 1, updatedAtMs: 1 })
}

function compatibleConfiguration() {
  const requestProfileId = 'ocp_request_profile_rule_12345678'
  const reasoningMappingId = 'ocp_reasoning_mapping_rule_12345678'
  const inlinePolicyId = 'ocp_inline_policy_rule_12345678'
  const responseProfileId = 'ocp_response_profile_rule_12345678'
  const mappings = [
    { id: 'ocp_request_mapping_enabled_12345678', version: 1, config: { schemaVersion: 1 as const,
      mappingId: 'ocp_request_mapping_enabled_12345678', requestProfileId, requestProfileVersion: 1,
      sourceField: 'reasoning_enabled' as const, targetPath: ['reasoning', 'enabled'], omission: 'required' as const } },
    { id: 'ocp_request_mapping_effort_12345678', version: 1, config: { schemaVersion: 1 as const,
      mappingId: 'ocp_request_mapping_effort_12345678', requestProfileId, requestProfileVersion: 1,
      sourceField: 'reasoning_effort' as const, targetPath: ['reasoning', 'effort'], omission: 'omit_when_unset' as const } },
  ]
  return {
    requestProfile: { id: requestProfileId, version: 1, config: { schemaVersion: 1 as const,
      standardFieldOwnership: 'builder' as const, unsupportedFieldPolicy: 'error_before_fetch' as const,
      defaults: {}, defaultExtraBody: { vendor_flag: true }, extraBody: { enabled: true, maxDepth: 8, maxKeys: 128, maxBytes: 32768 } } },
    requestMappings: mappings,
    reasoningMapping: { id: reasoningMappingId, version: 1, config: { schemaVersion: 1 as const, mode: 'custom_only' as const,
      rules: [], replay: { format: 'disabled' as const, scope: 'never' as const } } },
    inlinePolicy: { id: inlinePolicyId, version: 1, config: { schemaVersion: 1 as const, canonicalThinkTags: true, customTags: [] } },
    responseProfile: { id: responseProfileId, version: 1, config: { schemaVersion: 1 as const,
      choicePolicy: 'preserve_all' as const, unknownFieldPolicy: 'bounded_diagnostics' as const,
      reasoningMapping: { mappingId: reasoningMappingId, version: 1 }, inlinePolicy: { inlinePolicyId, version: 1 } } },
  }
}

function compatibleProviderConfiguration(providerInstanceId: string, endpointRevisionId: string, endpointDigest: string,
  configuration: ReturnType<OpenAICompatibleV2Repo['getConfigurationForEndpointRevision']>) {
  const reference = (entry: { configId: string; version: number; payloadDigest: string }) => ({
    id: entry.configId, version: entry.version, digest: entry.payloadDigest,
  })
  const requestProfile = configuration.requestProfile.payload as Readonly<{ defaultExtraBody?: unknown }>
  const extraBody = requestProfile.defaultExtraBody ?? null
  return { kind: 'openai_chat_compatible' as const, providerInstanceId, endpointRevisionId, endpointDigest,
    credentialRevision: 1, requestProfile: reference(configuration.requestProfile),
    requestMappings: configuration.requestMappings.map(reference), reasoningMapping: reference(configuration.reasoningMapping),
    inlinePolicy: reference(configuration.inlinePolicy), responseProfile: reference(configuration.responseProfile), extraBody,
    extraBodyDigest: sha256HexBytes(new TextEncoder().encode(stableSerializeProviderRequestV2(extraBody ?? {}))) }
}

describe('Rule V2 decisions reach real provider prepared compiler ledgers', () => {
  it('maps request reasoning through Rule V2, then emits actual chat tool and reasoning ledger fields', () => {
    const db = new BetterSqlite3(':memory:')
    applyGenerationV2SchemaForTest(db, process.cwd())
    try {
      const modelId = 'synthetic-openrouter-chat-model'
      const binding = createBinding('chat_completions', modelId)
      const capability = createCapability(binding, {
        'reasoning.mode': { kind: 'enum', values: ['disabled', 'enabled'] },
        'reasoning.effort': { kind: 'enum', values: ['minimal', 'low', 'medium', 'high', 'xhigh'] },
        'generation.temperature': { kind: 'range', min: 0, max: 2, integer: false },
        'tools.mode': { kind: 'enum', values: ['disabled', 'enabled'] },
        'tools.allowedToolIds': { kind: 'identity_list', maxItems: 128 },
        'tools.toolChoice': { kind: 'enum', values: ['omitted', 'auto', 'none', 'required', 'named'] },
        'tools.sideEffectConfirmation': { kind: 'enum', values: ['required_each_retry'] },
      })
      const requested = { schemaVersion: 2, generation: { temperature: 0.3 }, reasoning: { mode: 'enabled', effort: 'high' },
        web: { mode: 'disabled' }, image: { mode: 'disabled' }, tools: { mode: 'enabled', allowedToolIds: ['tool:weather'],
          toolChoice: { mode: 'auto' }, sideEffectConfirmation: 'required_each_retry' }, attachments: [], providerExtension: { kind: 'none' } }
      const rules = [{ ruleId: 'rule.openrouter.reasoning-high-to-low', label: null, description: 'Integration mapping', priority: 0,
        configured: 'on', providerAuthorityId: 'openrouter', endpointProfileId: 'openrouter-first-party-v1',
        selector: { kind: 'exact', nativeModelIds: [modelId] }, evidence: null, category: 'reasoning',
        when: { kind: 'eq', path: 'effective.reasoning.mode', value: 'enabled' },
        effect: { kind: 'enum_mapping', path: 'effective.reasoning.effort', mappings: [{ from: 'high', to: 'low' }] },
        decisionKey: 'request.reasoning.effort', dependencies: [] }]
      const rulePlan = preparePlan({ capability, modelId, rules, requested })
      expect(rulePlan.effective.reasoning).toEqual({ mode: 'enabled', effort: 'low' })
      expect(rulePlan.invocation.decisions).toContainEqual(expect.objectContaining({ ruleId: 'rule.openrouter.reasoning-high-to-low', outcome: 'applied' }))

      const toolRepo = new ToolRegistryV2Repo(db)
      const registry = createToolRegistry(toolRepo)
      const prepared = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, context => {
        const { snapshot } = prepareExecutionSnapshot({ db, capability, binding, operationId: 'operation:openrouter-chat-rule',
          answerId: 'answer:openrouter-chat-rule', semanticIntent: rulePlan.effective, requestPlan: rulePlan.plan, toolRegistry: registry })
        const graph = new ConversationGraphV2Repo(db)
        const execution = new GenerationExecutionV2Repo(db, () => 10)
        const bundle = beginOperation(execution, graph, context, snapshot, 'operation:openrouter-chat-rule', 'answer:openrouter-chat-rule')
        const history = new OpenRouterNativeHistoryV2Repo(db).loadRequestHistory(context, 'operation:openrouter-chat-rule')
        const toolRegistry = toolRepo.resolveCurrentForTools(context, ['tool:weather'])
        return compileOpenRouterChatPreparedRequestV2({ context, execution: bundle, history, toolRegistry })
      })
      const body = JSON.parse(prepared.body.copyUtf8Text())
      expect(body).toMatchObject({ temperature: 0.3, reasoning: { effort: 'low' },
        tools: [{ type: 'function', function: { name: 'weather' } }], tool_choice: 'auto' })
      expect(prepared.ledger.entries).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: 'reasoning.effort', disposition: 'encoded', nativeField: 'reasoning.effort' }),
        expect.objectContaining({ path: 'tools.allowedToolIds', disposition: 'encoded', nativeField: 'tools', encodingKind: 'structural' }),
      ]))
      expect(rulePlan.plan.resolution?.decisions).toContainEqual(expect.objectContaining({
        ruleId: 'rule.openrouter.reasoning-high-to-low', outcome: 'applied',
      }))
    } finally { db.close() }
  })

  it('validates an image request with Rule V2 and records actual descriptor-sized URL input encoding', () => {
    const db = new BetterSqlite3(':memory:')
    applyGenerationV2SchemaForTest(db, process.cwd())
    try {
      const modelId = 'synthetic-openrouter-image-model'
      const descriptorSet = decodeCanonicalOpenRouterImageDescriptorSetV2({ id: modelId, endpoints: [{
        provider_name: 'Test Images', provider_tag: 'test-images', provider_slug: 'test-images/endpoint',
        supported_parameters: { size: { type: 'enum', values: ['1024x1024'] } },
        allowed_passthrough_parameters: [], supports_streaming: false,
      }] })
      const descriptor = descriptorSet.descriptors[0]!
      const binding = createBinding('image_generate', modelId, descriptor)
      const capability = createCapability(binding, {
        'image.mode': { kind: 'enum', values: ['disabled', 'generate'] },
      })
      const requested = { schemaVersion: 2, generation: {}, reasoning: { mode: 'disabled' }, web: { mode: 'disabled' },
        image: { mode: 'generate', size: { width: 1024, height: 1024 }, format: 'png' }, tools: { mode: 'disabled' },
        attachments: [{ kind: 'url_reference', referenceId: 'url:reference-one', referenceRevision: 'revision:1',
          originalUrl: 'https://example.invalid/reference.png', urlDigest: 'c'.repeat(64), mediaKind: 'image',
          declaredMediaType: 'image/png', capturedAtMs: 1, provenance: 'user_supplied', include: true,
          sendAs: 'url_reference', conversion: 'none' }], providerExtension: { kind: 'none' } }
      const rules = [{ ruleId: 'rule.openrouter.image-generate-valid', label: null, description: 'Integration validation', priority: 0,
        configured: 'on', providerAuthorityId: 'openrouter', endpointProfileId: 'openrouter-first-party-v1',
        selector: { kind: 'exact', nativeModelIds: [modelId] }, evidence: null, category: 'image_generation',
        when: null, effect: { kind: 'validation', predicate: { kind: 'eq', path: 'target.operation', value: 'image_generate' },
          code: 'TEST_OPENROUTER_IMAGE_REQUEST_NOT_GENERATE' }, decisionKey: 'request.image.validation', dependencies: [] }]
      const rulePlan = preparePlan({ capability, modelId, rules, requested })
      expect(rulePlan.invocation.decisions).toContainEqual(expect.objectContaining({ ruleId: 'rule.openrouter.image-generate-valid', outcome: 'validated' }))
      const prepared = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, context => {
        const { snapshot } = prepareExecutionSnapshot({ db, capability, binding, operationId: 'operation:openrouter-image-rule',
          answerId: 'answer:openrouter-image-rule', semanticIntent: rulePlan.effective, requestPlan: rulePlan.plan })
        const graph = new ConversationGraphV2Repo(db)
        const execution = new GenerationExecutionV2Repo(db, () => 10)
        const bundle = beginOperation(execution, graph, context, snapshot, 'operation:openrouter-image-rule', 'answer:openrouter-image-rule')
        return compileOpenRouterImagePreparedRequestV2({ context, execution: bundle, prompt: 'Draw a red kite.', descriptorSet })
      })
      const body = JSON.parse(prepared.body.copyUtf8Text())
      expect(new URL(prepared.endpoint).pathname).toBe('/api/v1/images')
      expect(body).toMatchObject({ model: modelId, prompt: 'Draw a red kite.', size: '1024x1024', output_format: 'png',
        input_references: [{ type: 'image_url', image_url: { url: 'https://example.invalid/reference.png' } }],
        provider: { only: ['test-images'], allow_fallbacks: false } })
      expect(prepared.ledger.entries).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: 'image.size', disposition: 'encoded', nativeField: 'size', encodingKind: 'structural' }),
        expect.objectContaining({ path: 'attachments', disposition: 'encoded', nativeField: 'input_references', encodingKind: 'structural' }),
      ]))
      expect(rulePlan.plan.resolution?.decisions).toContainEqual(expect.objectContaining({
        ruleId: 'rule.openrouter.image-generate-valid', outcome: 'validated',
      }))
    } finally { db.close() }
  })

  it('applies Rule V2 sampling mapping before the Generic Local OpenAI Chat compiler and ledger', () => {
    const db = new BetterSqlite3(':memory:')
    applyGenerationV2SchemaForTest(db, process.cwd())
    try {
      const modelId = 'local-test-model'
      const profile = createLocalProfile({ endpointProfileId: 'generic-local-openai-chat:rule-test', providerId: 'generic_local',
        protocolContractId: 'generic-local-openai-chat-completions', modelId, baseUrl: 'http://127.0.0.1:8080' })
      const binding = projectDecodedProviderBindingRecordV2(createGenericLocalOpenAIChatProviderBindingV2(profile, modelId))
      const capability = createCapability(binding, {
        'generation.temperature': { kind: 'range', min: 0, max: 2, integer: false },
      }, { kind: 'client_managed_native_replay', artifactKind: 'generic_local_openai_chat_messages',
        supportsBranchReplay: true, supportsRestartReplay: true, evidenceIds: [supportEvidenceId] })
      const requested = { schemaVersion: 2, generation: { temperature: 0.25 }, reasoning: { mode: 'disabled' },
        web: { mode: 'disabled' }, image: { mode: 'disabled' }, tools: { mode: 'disabled' }, attachments: [],
        providerExtension: { kind: 'none' } }
      const rules = [createRule('rule.generic-local.temperature', capability.executionContext.binding, modelId, 'sampling',
        { kind: 'validation', predicate: { kind: 'lt', path: 'requested.generation.temperature', right: 1 },
          code: 'TEST_GENERIC_LOCAL_TEMPERATURE_WITHIN_BOUND' },
        { kind: 'eq', path: 'requested.generation.temperature', value: 0.25 })]
      const rulePlan = preparePlan({ capability, modelId, rules, requested })
      expect(rulePlan.effective.generation.temperature).toBe(0.25)
      const prepared = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, context => {
        const { snapshot } = prepareExecutionSnapshot({ db, capability, binding, operationId: 'operation:generic-local-rule',
          answerId: 'answer:generic-local-rule', semanticIntent: rulePlan.effective, requestPlan: rulePlan.plan })
        const graph = new ConversationGraphV2Repo(db); const execution = new GenerationExecutionV2Repo(db, () => 10)
        const bundle = beginOperation(execution, graph, context, snapshot, 'operation:generic-local-rule', 'answer:generic-local-rule')
        const history = new GenericLocalOpenAIChatNativeHistoryV2Repo(db).loadRequestHistory(context, 'operation:generic-local-rule')
        return compileGenericLocalOpenAIChatPreparedRequestV2({ context, execution: bundle, profile, history })
      })
      expect(JSON.parse(prepared.body.copyUtf8Text())).toMatchObject({ model: modelId, temperature: 0.25,
        messages: [{ role: 'user', content: 'Draw a red kite.' }] })
      expect(prepared.ledger.entries).toContainEqual(expect.objectContaining({ path: 'generation.temperature',
        disposition: 'encoded', nativeField: 'temperature' }))
      expect(rulePlan.plan.resolution?.decisions).toContainEqual(expect.objectContaining({
        ruleId: 'rule.generic-local.temperature', outcome: 'validated',
      }))
    } finally { db.close() }
  })

  it('applies Rule V2 reasoning mapping before the Ollama compiler and native think ledger', () => {
    const db = new BetterSqlite3(':memory:')
    applyGenerationV2SchemaForTest(db, process.cwd())
    try {
      const modelId = 'llama3.2-rule-test'
      const profile = createLocalProfile({ endpointProfileId: 'ollama-chat:rule-test', providerId: 'ollama',
        protocolContractId: 'ollama-chat-v1', modelId, baseUrl: 'http://127.0.0.1:11434', protocolConfig: { thinkingControl: 'effort' } })
      const binding = projectDecodedProviderBindingRecordV2(createOllamaChatProviderBindingV2(profile, modelId))
      const capability = createCapability(binding, {
        'reasoning.mode': { kind: 'enum', values: ['disabled', 'enabled'] },
        'reasoning.effort': { kind: 'enum', values: ['low', 'medium', 'high'] },
      }, { kind: 'client_managed_native_replay', artifactKind: 'ollama_chat_native_messages',
        supportsBranchReplay: true, supportsRestartReplay: true, evidenceIds: [supportEvidenceId] })
      const requested = { schemaVersion: 2, generation: { temperature: 0.4 }, reasoning: { mode: 'enabled', effort: 'high' },
        web: { mode: 'disabled' }, image: { mode: 'disabled' }, tools: { mode: 'disabled' }, attachments: [],
        providerExtension: { kind: 'none' } }
      const rules = [createRule('rule.ollama.reasoning-effort', capability.executionContext.binding, modelId, 'reasoning',
        { kind: 'enum_mapping', path: 'effective.reasoning.effort', mappings: [{ from: 'high', to: 'low' }] },
        { kind: 'eq', path: 'requested.reasoning.effort', value: 'high' })]
      const rulePlan = preparePlan({ capability, modelId, rules, requested })
      expect(rulePlan.effective.reasoning).toEqual({ mode: 'enabled', effort: 'low' })
      const prepared = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, context => {
        const { snapshot } = prepareExecutionSnapshot({ db, capability, binding, operationId: 'operation:ollama-rule',
          answerId: 'answer:ollama-rule', semanticIntent: rulePlan.effective, requestPlan: rulePlan.plan })
        const graph = new ConversationGraphV2Repo(db); const execution = new GenerationExecutionV2Repo(db, () => 10)
        const bundle = beginOperation(execution, graph, context, snapshot, 'operation:ollama-rule', 'answer:ollama-rule')
        const history = new OllamaChatNativeHistoryV2Repo(db).loadRequestHistory(context, 'operation:ollama-rule')
        return compileOllamaChatPreparedRequestV2({ context, execution: bundle, profile, history })
      })
      expect(JSON.parse(prepared.body.copyUtf8Text())).toMatchObject({ model: modelId, think: 'low',
        messages: [{ role: 'user', content: 'Draw a red kite.' }] })
      expect(prepared.ledger.entries).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: 'reasoning.mode', disposition: 'encoded', nativeField: 'think' }),
        expect.objectContaining({ path: 'reasoning.effort', disposition: 'encoded', nativeField: 'think' }),
      ]))
      expect(rulePlan.plan.resolution?.decisions).toContainEqual(expect.objectContaining({
        ruleId: 'rule.ollama.reasoning-effort', outcome: 'applied',
      }))
    } finally { db.close() }
  })

  it('runs a Rule V2 validation alongside LM Studio reasoning and actual registry-backed tool ledger fields', () => {
    const db = new BetterSqlite3(':memory:')
    applyGenerationV2SchemaForTest(db, process.cwd())
    try {
      const modelId = 'qwen3-rule-test'
      const profile = createLocalProfile({ endpointProfileId: 'lmstudio-openresponses:rule-test', providerId: 'lmstudio',
        protocolContractId: 'lmstudio-openresponses', modelId, baseUrl: 'http://127.0.0.1:1234' })
      const binding = projectDecodedProviderBindingRecordV2(createLmStudioOpenResponsesProviderBindingV2(profile, modelId))
      const capability = createCapability(binding, {
        'reasoning.mode': { kind: 'enum', values: ['disabled', 'enabled'] },
        'reasoning.effort': { kind: 'enum', values: ['low'] },
        'tools.mode': { kind: 'enum', values: ['disabled', 'enabled'] },
        'tools.allowedToolIds': { kind: 'identity_list', maxItems: 128 },
        'tools.toolChoice': { kind: 'enum', values: ['omitted', 'none', 'required'] },
        'tools.sideEffectConfirmation': { kind: 'enum', values: ['required_each_retry'] },
      }, { kind: 'client_managed_native_replay', artifactKind: LMSTUDIO_OPENRESPONSES_ARTIFACT_KIND_V1,
        supportsBranchReplay: true, supportsRestartReplay: true, evidenceIds: [supportEvidenceId] })
      const requested = { schemaVersion: 2, generation: { temperature: 0.35 }, reasoning: { mode: 'enabled', effort: 'low' },
        web: { mode: 'disabled' }, image: { mode: 'disabled' }, tools: { mode: 'enabled', allowedToolIds: ['tool:weather'],
          toolChoice: { mode: 'required' }, sideEffectConfirmation: 'required_each_retry' }, attachments: [],
        providerExtension: { kind: 'none' } }
      const rules = [createRule('rule.lmstudio.tool-validation', capability.executionContext.binding, modelId, 'tools',
        { kind: 'validation', predicate: { kind: 'eq', path: 'target.providerId', value: 'lmstudio' },
          code: 'TEST_LMSTUDIO_TOOLS_MUST_BE_ENABLED' }, { kind: 'eq', path: 'target.operation', value: 'text' }),
        createRule('rule.lmstudio.tool-definition-defaults', capability.executionContext.binding, modelId, 'tools',
          { kind: 'registered_operation', operationId: 'tool_definition_defaults', parameters: { parameters: 'empty_object', strict: true } })]
      const toolRepo = new ToolRegistryV2Repo(db); const registry = createToolRegistry(toolRepo, { strict: false })
      const toolDefinitions: ToolDefinitionsContextV2 = { registryRevision: registry.revision,
        definitionsDigest: registry.definitionsDigest, selectedDefinitions: registry.definitions }
      const completeRegistry = decodeToolRegistryRevisionV2({ schemaVersion: 2, definitions: [{ toolId: 'tool:weather', kind: 'function',
        function: { name: 'weather', description: 'Read weather', parameters: { type: 'object', properties: {} }, strict: false },
        sideEffectPolicy: 'none' }] })
      const preservedWithoutRule = preparePlan({ capability, modelId, rules: [], requested, toolDefinitions: {
        registryRevision: completeRegistry.revision, definitionsDigest: completeRegistry.definitionsDigest,
        selectedDefinitions: completeRegistry.definitions,
      } })
      expect(preservedWithoutRule.plan.resolution?.toolDefinitions?.definitions[0]).toMatchObject({
        sourceDefinition: completeRegistry.definitions[0], effectiveDefinition: completeRegistry.definitions[0], defaultsApplied: [],
      })
      const strictMissingRegistry = decodeToolRegistryRevisionV2({ schemaVersion: 2, definitions: [{ toolId: 'tool:weather', kind: 'function',
        function: { name: 'weather', description: 'Read weather', parameters: { type: 'object', properties: {} } },
        sideEffectPolicy: 'none' }] })
      const strictMissingContext: ToolDefinitionsContextV2 = { registryRevision: strictMissingRegistry.revision,
        definitionsDigest: strictMissingRegistry.definitionsDigest, selectedDefinitions: strictMissingRegistry.definitions }
      const strictDefaultPlan = preparePlan({ capability, modelId, rules, requested, toolDefinitions: strictMissingContext })
      expect(strictDefaultPlan.plan.resolution?.toolDefinitions?.definitions[0]).toMatchObject({
        effectiveDefinition: { function: { strict: true } },
        defaultsApplied: [{ path: 'function.strict', operationId: 'tool_definition_defaults', value: true }],
      })
      expect(() => preparePlan({ capability, modelId, rules: [], requested, toolDefinitions: strictMissingContext }))
        .toThrow('GENERATION_V2_TOOL_DEFINITION_REQUIRED_VALUE_MISSING')
      expect(() => preparePlan({ capability, modelId, rules: [], requested, toolDefinitions }))
        .toThrow('GENERATION_V2_TOOL_DEFINITION_REQUIRED_VALUE_MISSING')
      const rulePlan = preparePlan({ capability, modelId, rules, requested, toolDefinitions })
      expect(rulePlan.plan.resolution?.toolDefinitions).toMatchObject({ registryRevision: registry.revision,
        definitionsDigest: registry.definitionsDigest, definitions: [{
          sourceDefinition: { function: { strict: false } },
          effectiveDefinition: { function: { parameters: { type: 'object', properties: {}, additionalProperties: false }, strict: false } },
          defaultsApplied: [{ path: 'function.parameters', operationId: 'tool_definition_defaults', value: 'empty_object' }],
        }] })
      const prepared = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, context => {
        const { snapshot } = prepareExecutionSnapshot({ db, capability, binding, operationId: 'operation:lmstudio-rule',
          answerId: 'answer:lmstudio-rule', semanticIntent: rulePlan.effective, requestPlan: rulePlan.plan, toolRegistry: registry })
        const graph = new ConversationGraphV2Repo(db); const execution = new GenerationExecutionV2Repo(db, () => 10)
        const bundle = beginOperation(execution, graph, context, snapshot, 'operation:lmstudio-rule', 'answer:lmstudio-rule')
        const history = new LmStudioOpenResponsesNativeHistoryV2Repo(db).loadRequestHistory(context, 'operation:lmstudio-rule')
        const selectedTools = toolRepo.resolveCurrentForTools(context, ['tool:weather'])
        return compileLmStudioOpenResponsesPreparedRequestV2({ context, execution: bundle, profile, history, toolRegistry: selectedTools })
      })
      expect(JSON.parse(prepared.body.copyUtf8Text())).toMatchObject({ model: modelId, reasoning: { effort: 'low' },
        tools: [{ type: 'function', name: 'weather', parameters: { type: 'object', properties: {}, additionalProperties: false }, strict: false }],
        tool_choice: 'required' })
      expect(prepared.ledger.entries).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: 'reasoning.effort', disposition: 'encoded', nativeField: 'reasoning.effort' }),
        expect.objectContaining({ path: 'tools.allowedToolIds', disposition: 'encoded', nativeField: 'tools', encodingKind: 'structural' }),
      ]))
      expect(rulePlan.plan.resolution?.decisions).toContainEqual(expect.objectContaining({
        ruleId: 'rule.lmstudio.tool-validation', outcome: 'validated',
      }))
    } finally { db.close() }
  })

  it('preserves explicit strict:false from plan2 through the actual OpenAI Responses prepared body', () => {
    const db = new BetterSqlite3(':memory:')
    applyGenerationV2SchemaForTest(db, process.cwd())
    try {
      const profile = readVerifiedOpenAIResponsesEndpointProfileV2()
      const contract = readReviewedOpenAIResponsesDefinitionV2()
      const modelId = 'gpt-4.1-tool-schema-test'
      const binding = projectDecodedProviderBindingRecordV2(decodeProviderBindingRecordV2({
        credentialScopeId, providerId: profile.providerId.value, endpointProfileId: profile.endpointProfileId.value,
        endpointBinding: { kind: 'provider_managed_set', endpointSetRevision: profile.endpointSetRevision.value,
          descriptors: [{ endpointId: profile.descriptor.endpointId.value,
            descriptorRevision: profile.descriptor.descriptorRevision.value }] },
        protocolContractId: contract.protocolContractId.value, contractRevision: contract.contractRevision.value,
        contractDefinitionDigest: contract.definitionDigest.value, registryRevision: contract.registryRevision.value,
        modelId, operation: 'text',
      }))
      const capability = createCapability(binding, {
        'tools.mode': { kind: 'enum', values: ['disabled', 'enabled'] },
        'tools.allowedToolIds': { kind: 'identity_list', maxItems: 128 },
        'tools.toolChoice': { kind: 'enum', values: ['omitted', 'none', 'auto', 'required', 'named'] },
        'tools.sideEffectConfirmation': { kind: 'enum', values: ['required_each_retry'] },
      }, { kind: 'client_managed_native_replay', artifactKind: OPENAI_RESPONSES_ARTIFACT_KIND_V2,
        supportsBranchReplay: true, supportsRestartReplay: true, evidenceIds: [supportEvidenceId] })
      const requested = { schemaVersion: 2, generation: {}, reasoning: { mode: 'disabled' },
        web: { mode: 'disabled' }, image: { mode: 'disabled' }, tools: { mode: 'enabled', allowedToolIds: ['tool:weather'],
          toolChoice: { mode: 'omitted' }, sideEffectConfirmation: 'required_each_retry' }, attachments: [],
        providerExtension: { kind: 'none' } }
      const toolRepo = new ToolRegistryV2Repo(db)
      const registry = createToolRegistry(toolRepo, { parameters: { type: 'object', properties: {} }, strict: false })
      const toolDefinitions: ToolDefinitionsContextV2 = { registryRevision: registry.revision,
        definitionsDigest: registry.definitionsDigest, selectedDefinitions: registry.definitions }
      const rulePlan = preparePlan({ capability, modelId, rules: [], requested, toolDefinitions })
      expect(rulePlan.plan.resolution?.toolDefinitions).toMatchObject({
        registryRevision: registry.revision, definitionsDigest: registry.definitionsDigest,
        definitions: [{ sourceDefinition: registry.definitions[0], effectiveDefinition: registry.definitions[0], defaultsApplied: [] }],
      })
      const prepared = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, context => {
        const { snapshot } = prepareExecutionSnapshot({ db, capability, binding, operationId: 'operation:openai-tool-definition',
          answerId: 'answer:openai-tool-definition', semanticIntent: rulePlan.effective, requestPlan: rulePlan.plan, toolRegistry: registry })
        const graph = new ConversationGraphV2Repo(db); const execution = new GenerationExecutionV2Repo(db, () => 10)
        const bundle = beginOperation(execution, graph, context, snapshot, 'operation:openai-tool-definition', 'answer:openai-tool-definition')
        const history = new OpenAIResponsesNativeHistoryV2Repo(db).loadRequestHistory(context, 'operation:openai-tool-definition')
        const selectedTools = toolRepo.resolveCurrentForTools(context, ['tool:weather'])
        return compileOpenAIResponsesPreparedRequestV2({ context, execution: bundle, history, toolRegistry: selectedTools })
      })
      expect(JSON.parse(prepared.body.copyUtf8Text()).tools).toEqual([{ type: 'function', name: 'weather', description: 'Read weather',
        parameters: { type: 'object', properties: {} }, strict: false }])
      expect(prepared.encoderRevision).toBe(capability.executionContext.encodingCoverage.encoderRevision)
    } finally { db.close() }
  })

  it('applies Rule V2 sampling mapping before the verified DeepSeek compiler and ledger', () => {
    const db = new BetterSqlite3(':memory:')
    applyGenerationV2SchemaForTest(db, process.cwd())
    try {
      const modelId = 'deepseek-chat'
      const profile = readVerifiedDeepSeekStableEndpointProfileV2()
      const definition = readReviewedDeepSeekStableChatDefinitionV2()
      const binding = {
        credentialScopeId, providerId: profile.providerId.value, endpointProfileId: profile.endpointProfileId.value,
        endpointBinding: { kind: 'provider_managed_set', endpointSetRevision: profile.endpointSetRevision.value,
          descriptors: [{ endpointId: profile.descriptor.endpointId.value, descriptorRevision: profile.descriptor.descriptorRevision.value }] },
        protocolContractId: definition.protocolContractId.value, contractRevision: definition.contractRevision.value,
        contractDefinitionDigest: definition.definitionDigest.value, registryRevision: definition.registryRevision.value,
        modelId, operation: 'text' as const,
      }
      const capability = createCapability(binding, {
        'reasoning.mode': { kind: 'enum', values: ['disabled', 'enabled'] },
        'reasoning.effort': { kind: 'enum', values: ['low', 'medium', 'high'] },
      }, { kind: 'client_managed_native_replay', artifactKind: DEEPSEEK_NATIVE_HISTORY_ARTIFACT_KIND_V2,
        supportsBranchReplay: true, supportsRestartReplay: true, evidenceIds: [supportEvidenceId] })
      const requested = { schemaVersion: 2, generation: {}, reasoning: { mode: 'enabled', effort: 'high' },
        web: { mode: 'disabled' }, image: { mode: 'disabled' }, tools: { mode: 'disabled' }, attachments: [],
        providerExtension: { kind: 'none' } }
      const rules = [createRule('rule.deepseek.reasoning-effort', capability.executionContext.binding, modelId, 'reasoning',
        { kind: 'enum_mapping', path: 'effective.reasoning.effort', mappings: [{ from: 'high', to: 'low' }] },
        { kind: 'eq', path: 'requested.reasoning.effort', value: 'high' })]
      const rulePlan = preparePlan({ capability, modelId, rules, requested })
      const prepared = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, context => {
        const { snapshot } = prepareExecutionSnapshot({ db, capability, binding, operationId: 'operation:deepseek-rule',
          answerId: 'answer:deepseek-rule', semanticIntent: rulePlan.effective, requestPlan: rulePlan.plan })
        const graph = new ConversationGraphV2Repo(db); const execution = new GenerationExecutionV2Repo(db, () => 10)
        const bundle = beginOperation(execution, graph, context, snapshot, 'operation:deepseek-rule', 'answer:deepseek-rule')
        const history = new DeepSeekNativeHistoryV2Repo(db).loadRequestHistory(context, 'operation:deepseek-rule')
        return compileDeepSeekPreparedRequestV2({ context, execution: bundle, history })
      })
      expect(JSON.parse(prepared.body.copyUtf8Text())).toMatchObject({ model: modelId, reasoning_effort: 'low',
        messages: [{ role: 'user', content: 'Draw a red kite.' }] })
      expect(prepared.ledger.entries).toContainEqual(expect.objectContaining({ path: 'reasoning.effort',
        disposition: 'encoded', nativeField: 'reasoning_effort' }))
      expect(rulePlan.plan.resolution?.decisions).toContainEqual(expect.objectContaining({
        ruleId: 'rule.deepseek.reasoning-effort', outcome: 'applied',
      }))
    } finally { db.close() }
  })

  it('applies Rule V2 effort mapping through actual OpenAI-compatible endpoint/config facts and compiler ledger', () => {
    const db = new BetterSqlite3(':memory:')
    applyGenerationV2SchemaForTest(db, process.cwd())
    try {
      const providerInstanceId = 'ocp_provider_rule_12345678'
      const endpointRevisionId = 'ocp_endpoint_rule_12345678'
      const providers = new OpenAICompatibleV2Repo(db, () => 10)
      const provider = providers.create({ providerInstanceId, displayName: 'Compatible rule test', endpointRevisionId,
        baseUrl: 'https://example.invalid', securityPolicy: 'compatibility_first', auth: { mode: 'none' },
        ordinaryHeaders: [], query: [], configuration: compatibleConfiguration() })
      const endpoint = providers.getEndpointRevision(providerInstanceId, endpointRevisionId)
      const configuration = providers.getConfigurationForEndpointRevision(providerInstanceId, endpointRevisionId)
      const modelId = 'model-rule-test'
      const binding = projectDecodedProviderBindingRecordV2(createOpenAIChatCompatibleProviderBindingV2({
        provider, endpoint, credentialScopeId, modelId,
      }))
      const capability = createCapability(binding, {
        'reasoning.mode': { kind: 'enum', values: ['disabled', 'enabled'] },
        'reasoning.effort': { kind: 'enum', values: ['low', 'medium', 'high'] },
      })
      const requested = { schemaVersion: 2, generation: {}, reasoning: { mode: 'enabled', effort: 'high' },
        web: { mode: 'disabled' }, image: { mode: 'disabled' }, tools: { mode: 'disabled' }, attachments: [],
        providerExtension: { kind: 'none' } }
      const rules = [createRule('rule.openai-compatible.reasoning-effort', capability.executionContext.binding, modelId, 'reasoning',
        { kind: 'enum_mapping', path: 'effective.reasoning.effort', mappings: [{ from: 'high', to: 'low' }] },
        { kind: 'eq', path: 'requested.reasoning.effort', value: 'high' })]
      const rulePlan = preparePlan({ capability, modelId, rules, requested })
      expect(rulePlan.effective.reasoning).toEqual({ mode: 'enabled', effort: 'low' })
      const providerConfiguration = compatibleProviderConfiguration(providerInstanceId, endpointRevisionId, endpoint.endpointDigest, configuration)
      const prepared = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, context => {
        const { snapshot } = prepareExecutionSnapshot({ db, capability, binding, operationId: 'operation:compatible-rule',
          answerId: 'answer:compatible-rule', semanticIntent: rulePlan.effective, requestPlan: rulePlan.plan, providerConfiguration })
        const graph = new ConversationGraphV2Repo(db); const execution = new GenerationExecutionV2Repo(db, () => 10)
        const bundle = beginOperation(execution, graph, context, snapshot, 'operation:compatible-rule', 'answer:compatible-rule')
        const history = new OpenAIChatCompatibleNativeHistoryV2Repo(db).loadRequestHistory(context, 'operation:compatible-rule')
        return compileOpenAIChatCompatiblePreparedRequestV2({ context, execution: bundle, endpoint, configuration, history })
      })
      expect(JSON.parse(prepared.body.copyUtf8Text())).toMatchObject({ model: modelId, stream: true,
        reasoning: { enabled: true, effort: 'low' }, vendor_flag: true,
        messages: [{ role: 'user', content: 'Draw a red kite.' }] })
      expect(prepared.ledger.entries).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: 'reasoning.mode', disposition: 'encoded', nativeField: 'compat:reasoning/enabled' }),
        expect.objectContaining({ path: 'reasoning.effort', disposition: 'encoded', nativeField: 'compat:reasoning/effort' }),
      ]))
      expect(rulePlan.plan.resolution?.decisions).toContainEqual(expect.objectContaining({
        ruleId: 'rule.openai-compatible.reasoning-effort', outcome: 'applied',
      }))
    } finally { db.close() }
  })
})
