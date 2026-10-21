import BetterSqlite3 from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { stableSerializeProviderRequestV2 } from '../../../src/core/generation-v2/compiler/stableSerialize'
import { afterEach, describe, expect, it } from 'vitest'
import { listReviewedProviderContractDefinitionsV2 } from '../../../src/core/generation-v2/contracts/providerContractRegistryV2'
import { MODEL_CAPABILITY_SEMANTIC_PATHS_V2 as PATHS } from '../../../src/core/generation-v2/capability/modelCapabilitySchemaV2'
import { canonicalizeUnverifiedRuntimeCapabilitySnapshotV2, decodeRuntimeCapabilitySnapshotV2 } from '../../../src/core/generation-v2/capability/runtimeCapabilitySnapshotV2'
import { canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2, decodeAssistantAnswerGenerationSnapshotV2 } from '../../../src/core/generation-v2/domain/assistantAnswerGenerationSnapshotV2'
import { createSemanticConsumptionLedgerV2 } from '../../../src/core/generation-v2/compiler/semanticConsumptionLedgerV2'
import { requestAdaptationLedgerV2 } from '../../../src/core/generation-v2/compiler/requestAdaptationV2'
import { completeOpenAIResponsesProjectedRequestV2 } from '../../../src/core/generation-v2/providers/openai-responses/continuationArtifactV2'
import { decodeOpenAIResponsesReplayItemsV1 } from '../../../src/core/generation-v2/providers/openai-responses/nativeItemsV1'
import { compileOpenAIResponsesRequestV1 } from '../../../src/core/generation-v2/providers/openai-responses/responsesRequestV1'
import { createOpenRouterNativeHistoryArtifactV1 } from '../../../src/core/generation-v2/providers/openrouter/nativeMessagesV1'
import { compileOpenRouterChatRequestV1 } from '../../../src/core/generation-v2/providers/openrouter/chatRequestV1'
import { createDeepSeekNativeHistoryArtifactV2 } from '../../../src/core/generation-v2/providers/deepseek/nativeMessagesV1'
import { createAnthropicNativeHistoryArtifactV1 } from '../../../src/core/generation-v2/providers/anthropic/nativeContentBlocksV1'
import { createGeminiGenerateContentNativeHistoryArtifactV1 } from '../../../src/core/generation-v2/providers/gemini/generateContentNativeHistoryV1'
import { completeLmStudioOpenResponsesProjectedRequestV1 } from '../../../src/core/generation-v2/providers/lmstudio-openresponses/continuationArtifactV1'
import { decodeLmStudioOpenResponsesReplayItemsV1 } from '../../../src/core/generation-v2/providers/lmstudio-openresponses/nativeItemsV1'
import { compileLmStudioOpenResponsesRequestV1 } from '../../../src/core/generation-v2/providers/lmstudio-openresponses/responsesRequestV1'
import { createGenericLocalOpenAIChatArtifactV1 } from '../../../src/core/generation-v2/providers/generic-local-openai-chat/nativeMessagesV1'
import { createOllamaNativeChatArtifactV1 } from '../../../src/core/generation-v2/providers/ollama-chat/nativeMessagesV1'
import { createOpenAIChatCompatibleNativeArtifactV2 } from '../../../src/core/generation-v2/providers/openai-chat-compatible/nativeMessagesV2'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import { GenerationExecutionV2Repo } from './generationExecutionV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 as transaction } from './generationV2AuthorityTransactionInternal'
import { loadPortableGenerationHistoryV2, registerGenerationHistoryByteReaderV2, inspectRequestTextEncodingV2, type PortableHistoryTargetV2 as Target } from './portableGenerationHistoryV2'
import { AttachmentAssetV2Repo } from './attachmentAssetV2Repo'
import { OpenAIResponsesNativeHistoryV2Repo } from './openAIResponsesNativeHistoryV2Repo'
import { OpenRouterNativeHistoryV2Repo } from './openRouterNativeHistoryV2Repo'
import { DeepSeekNativeHistoryV2Repo } from './deepSeekNativeHistoryV2Repo'
import { AnthropicNativeHistoryV2Repo } from './anthropicNativeHistoryV2Repo'
import { GeminiGenerateContentNativeHistoryV2Repo } from './geminiGenerateContentNativeHistoryV2Repo'
import { OpenAIChatCompatibleNativeHistoryV2Repo } from './openAIChatCompatibleNativeHistoryV2Repo'
import { GenericLocalOpenAIChatNativeHistoryV2Repo } from './genericLocalOpenAIChatNativeHistoryV2Repo'
import { OllamaChatNativeHistoryV2Repo } from './ollamaChatNativeHistoryV2Repo'
import { LmStudioOpenResponsesNativeHistoryV2Repo } from './lmStudioOpenResponsesNativeHistoryV2Repo'
import { BranchContextFilterV2Repo } from './branchContextFilterV2Repo'
import { GenerationInterruptedReplayV2Repo } from './generationInterruptedReplayV2Repo'
import { loadNativeArtifactJsonV2, storeNativeArtifactJsonV2 } from './nativeArtifactStorageV2'
import { loadInterruptedReplayJsonV2 } from './interruptedReplayStorageV2'

const HASH = 'a'.repeat(64)
const routes = {
  openai: 'openai-responses-v1', openrouter: 'openrouter-chat-completions-v1', deepseek: 'deepseek-stable-chat-v1',
  anthropic: 'anthropic-messages-2023-06-01', gemini: 'gemini-generate-content-v1beta',
  compatible: 'openai_chat_compatible', generic: 'generic-local-openai-chat-completions', ollama: 'ollama-chat-v1', lmstudio: 'lmstudio-openresponses',
} satisfies Record<Target, string>
const targets = Object.keys(routes) as Target[]
const repositories = { openai: OpenAIResponsesNativeHistoryV2Repo, openrouter: OpenRouterNativeHistoryV2Repo,
  deepseek: DeepSeekNativeHistoryV2Repo, anthropic: AnthropicNativeHistoryV2Repo, gemini: GeminiGenerateContentNativeHistoryV2Repo,
  compatible: OpenAIChatCompatibleNativeHistoryV2Repo, generic: GenericLocalOpenAIChatNativeHistoryV2Repo,
  ollama: OllamaChatNativeHistoryV2Repo, lmstudio: LmStudioOpenResponsesNativeHistoryV2Repo }
const baseLedger = createSemanticConsumptionLedgerV2([{ kind: 'consumed', path: 'test', disposition: 'accepted_no_wire',
  nativeField: null, encodingKind: 'omitted', evidence: 'fixture' }])
const databases: BetterSqlite3.Database[] = []
afterEach(() => { while (databases.length) databases.pop()!.close() })

function details(target: Target) {
  const definition = listReviewedProviderContractDefinitionsV2().find(value => value.protocolContractId.value === routes[target])!
  const binding = { credentialScopeId: 'credential-scope:test', providerId: definition.providerId.value,
    endpointProfileId: `profile:${target}`, endpointBinding: { kind: 'provider_managed_set', endpointSetRevision: 'endpoint:1',
      descriptors: [{ endpointId: 'endpoint:main', descriptorRevision: 'descriptor:1' }] },
    protocolContractId: routes[target], contractRevision: definition.contractRevision.value,
    contractDefinitionDigest: definition.definitionDigest.value, registryRevision: definition.registryRevision.value,
    modelId: `model:${target}`, operation: 'text' }
  const extension = target === 'anthropic' ? { kind: 'anthropic_messages', thinkingDisplay: 'provider_default', thinkingMode: 'model_recommended' }
    : target === 'gemini' ? { kind: 'gemini_generate_content', thinkingMode: 'default', includeThoughts: 'provider_default' } : { kind: 'none' }
  const cap = decodeRuntimeCapabilitySnapshotV2(canonicalizeUnverifiedRuntimeCapabilitySnapshotV2({ schemaVersion: 2,
    resolvedAt: '2026-10-16T00:00:00.000Z', binding,
    evidence: [{ evidenceId: 'test.support', kind: 'official_documentation', effect: 'supports', sourceRef: 'https://example.test',
      verifiedAt: '2026-10-16T00:00:00.000Z', contentDigest: HASH }],
    fields: PATHS.map(path => ({ path, state: 'missing', constraints: [], evidenceIds: [] })), tools: [],
    continuation: { kind: 'none', evidenceIds: ['test.support'] } }))
  return { binding, extension, cap }
}

function database() {
  const db = new BetterSqlite3(':memory:'); databases.push(db); applyGenerationV2SchemaForTest(db, process.cwd())
  db.prepare("INSERT INTO project_v2 VALUES('project:1','Project',1,1)").run()
  db.prepare("INSERT INTO conversation_v2 VALUES('conversation:1','project:1','Conversation',2,2)").run()
  db.prepare("INSERT INTO branch_v2 VALUES('branch:1','conversation:1',NULL,NULL,12,12,NULL,NULL)").run()
  return db
}

function addTurn(db: BetterSqlite3.Database, target: Target, n: number, completed: boolean, attachments: readonly unknown[] = [],
  artifactValue?: ReturnType<typeof makeArtifact>, terminalState: 'completed' | 'cancelled' | 'failed' = 'completed', afterRequestTerminal?: () => void,
  storeArtifactInChunks = false, questionText = `question ${n}`) {
  const { binding, extension, cap } = details(target); const at = n * 100
  db.prepare('INSERT OR IGNORE INTO runtime_capability_snapshot_v2 VALUES(?,?,2,?,?,?,1)').run(cap.snapshotHash.value,
    cap.revision.value, cap.canonicalJson, cap.evidenceDigest.value, cap.semanticFieldsDigest.value)
  db.prepare(`INSERT INTO message_v2(message_id,conversation_id,introduced_in_branch_id,role,status,parent_message_id,
    question_id,answer_root_id,ordinal,created_at_ms,updated_at_ms) VALUES(?,'conversation:1','branch:1','user','completed',?,NULL,NULL,?,?,?),
    (?,'conversation:1','branch:1','assistant','streaming',?,?,?,?,?,?)`).run(`question:${n}`, n === 1 ? null : `answer:${n - 1}`,
      2 * n - 1, at, at, `answer:${n}`, `question:${n}`, `question:${n}`, `answer:${n}`, 2 * n, at + 1, at + 1)
  db.prepare('UPDATE message_body_v2 SET body_text=? WHERE message_id=?').run(questionText, `question:${n}`)
  db.prepare("UPDATE branch_v2 SET head_message_id=? WHERE branch_id='branch:1'").run(`answer:${n}`)
  db.prepare("INSERT INTO branch_choice_v2 VALUES('branch:1','conversation:1',?,?,?)").run(`question:${n}`, `answer:${n}`, at + 2)
  const snapshot = decodeAssistantAnswerGenerationSnapshotV2(canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({
    schemaVersion: 2, answerRootId: `answer:${n}`, operationId: `operation:${n}`,
    semanticIntent: { schemaVersion: 2, generation: {}, reasoning: { mode: 'disabled' }, web: { mode: 'disabled' },
      tools: { mode: 'disabled' }, image: { mode: 'disabled' }, attachments, providerExtension: extension },
    resolvedConfigRevisions: [{ ownerKind: 'global', ownerId: 'global', revision: 'config:1' }], providerBinding: binding,
    capabilityBinding: { capabilityRevision: cap.revision.value, evidenceDigest: cap.evidenceDigest.value,
      semanticFieldsDigest: cap.semanticFieldsDigest.value, snapshotHash: cap.snapshotHash.value },
    attachmentProviderFileBindings: [], toolAuthority: { kind: 'none' },
    ...(target === 'compatible' ? { providerConfiguration: {
      kind: 'openai_chat_compatible', providerInstanceId: 'ocp_provider_12345678', endpointRevisionId: 'ocp_endpoint_12345678',
      endpointDigest: HASH, credentialRevision: 1,
      requestProfile: { id: 'config:request', version: 1, digest: HASH }, requestMappings: [],
      reasoningMapping: { id: 'config:reasoning', version: 1, digest: HASH }, inlinePolicy: { id: 'config:inline', version: 1, digest: HASH },
      responseProfile: { id: 'config:response', version: 1, digest: HASH }, extraBody: null,
      extraBodyDigest: createHash('sha256').update('{}').digest('hex'),
    } } : {}),
  }))
  transaction(db, context => new GenerationExecutionV2Repo(db).insertOperationAndSnapshot(context, { operationId: `operation:${n}`,
    actionKind: 'initial_send', branchId: 'branch:1', conversationId: 'conversation:1', questionId: `question:${n}`, sourceAnswerId: null,
    targetAnswerId: `answer:${n}`, snapshot: snapshot.canonicalJson, commandFingerprint: HASH, createdAtMs: at + 10 }))
  if (!completed) return
  db.prepare(`INSERT INTO generation_request_v2(operation_id,request_sequence,answer_root_id,snapshot_hash,provider_id,endpoint_profile_id,
    credential_scope_id,contract_id,model_id,effective_endpoint_id,capability_revision,compiler_ledger_json,compiler_ledger_hash,
    prepared_body_sha256,prepared_body_byte_length,state,created_at_ms,updated_at_ms)
    VALUES(?,1,?,?,?,?,?,?,?,?,?,?,?,?,2,'prepared',?,?)`).run(`operation:${n}`, `answer:${n}`, snapshot.snapshotHash.value,
      binding.providerId, binding.endpointProfileId, binding.credentialScopeId, binding.protocolContractId, binding.modelId,
      'endpoint:main', cap.revision.value, baseLedger.canonicalJson, baseLedger.sha256, HASH, at + 11, at + 11)
  db.prepare("INSERT INTO generation_attempt_v2 VALUES(?,1,1,'open',NULL,NULL,?,NULL)").run(`operation:${n}`, at + 12)
  db.prepare("UPDATE generation_request_v2 SET state='streaming',updated_at_ms=? WHERE operation_id=?").run(at + 13, `operation:${n}`)
  db.prepare("UPDATE generation_operation_v2 SET state='streaming',updated_at_ms=? WHERE operation_id=?").run(at + 14, `operation:${n}`)
  db.prepare(`UPDATE generation_attempt_v2 SET state='terminal',outcome_json='{"kind":"provider_completed"}',terminal_fingerprint=?,terminal_at_ms=? WHERE operation_id=?`).run(HASH, at + 19, `operation:${n}`)
  db.prepare('UPDATE generation_request_v2 SET state=?,updated_at_ms=?,terminal_at_ms=? WHERE operation_id=?').run(terminalState, at + 20, at + 20, `operation:${n}`)
  afterRequestTerminal?.()
  db.prepare('UPDATE generation_operation_v2 SET state=?,updated_at_ms=?,terminal_at_ms=? WHERE operation_id=?').run(terminalState, at + 21, at + 21, `operation:${n}`)
  db.prepare('UPDATE message_v2 SET status=?,updated_at_ms=? WHERE message_id=?').run(terminalState, at + 21, `answer:${n}`)
  db.prepare('UPDATE message_body_v2 SET body_text=? WHERE message_id=?').run(`answer ${n}`, `answer:${n}`)
  if (terminalState !== 'completed') return
  const artifact = artifactValue ?? makeArtifact(target, n)
  const artifactJson = stableSerializeProviderRequestV2(artifact)
  const insertArtifact = () => {
    const artifactKind = artifact.artifactKind
    const codecVersion = 'artifactCodecVersion' in artifact ? artifact.artifactCodecVersion : 1
    const storedJson = storeArtifactInChunks ? storeNativeArtifactJsonV2(db, {
      operationId: `operation:${n}`, answerRootId: `answer:${n}`, requestSequence: 1, artifactKind,
    }, artifactJson, { artifactCodecVersion: codecVersion, artifactHash: artifact.artifactHash }) : artifactJson
    db.prepare(`INSERT INTO generation_native_artifact_v2(answer_root_id,request_sequence,operation_id,artifact_kind,codec_version,
      artifact_json,artifact_hash,created_at_ms,completion_scope) VALUES(?,1,?,?,?,?,?,?,?)`).run(
        `answer:${n}`, `operation:${n}`, artifactKind, codecVersion,
        storedJson, artifact.artifactHash, at + 30, target === 'anthropic' ? 'request_terminal' : 'operation_terminal')
  }
  if (storeArtifactInChunks) transaction(db, insertArtifact)
  else insertArtifact()
}

function makeArtifact(target: Target, n: number) {
  const user = { role: 'user' as const, content: `question ${n}` }; const assistant = { role: 'assistant' as const, content: `answer ${n}` }
  const input = { role: 'user', content: [{ type: 'input_text', text: user.content }] }
  const output = { role: 'assistant', type: 'message', id: `msg_${n}`, status: 'completed',
    content: [{ type: 'output_text', text: assistant.content, annotations: [], logprobs: [] }] }
  switch (target) {
    case 'openai': return completeOpenAIResponsesProjectedRequestV2({ projectedPrefixItems: [], clientItems: [input], returnedItems: [output] })
    case 'lmstudio': return completeLmStudioOpenResponsesProjectedRequestV1({ replayItems: [input], returnedItems: [output] })
    case 'openrouter': return createOpenRouterNativeHistoryArtifactV1({ lineageDepth: 1, parentArtifactHash: null, orderedMessages: [user, assistant] })
    case 'deepseek': return createDeepSeekNativeHistoryArtifactV2({ lineageDepth: 1, parentArtifactHash: null,
      orderedEntries: [{ kind: 'client', message: user }, { kind: 'assistant', generatedWithThinking: 'disabled', message: assistant }] })
    case 'gemini': return createGeminiGenerateContentNativeHistoryArtifactV1({ operationId: `operation:${n}`, answerRootId: `answer:${n}`,
      requestSequence: 1, lineageDepth: 1, parentArtifactHash: null, orderedContents: [
        { role: 'user', parts: [{ text: user.content }] }, { role: 'model', parts: [{ text: assistant.content }] }] })
    case 'generic': return createGenericLocalOpenAIChatArtifactV1([user, assistant])
    case 'ollama': return createOllamaNativeChatArtifactV1([user, assistant])
    case 'compatible': return createOpenAIChatCompatibleNativeArtifactV2({ messages: [user, assistant], reasoningReplay: [] })
    case 'anthropic': return createAnthropicNativeHistoryArtifactV1({ providerKey: 'anthropic', sourceApi: 'anthropic_messages',
      snapshotKey: 'assistant', role: 'assistant', status: 'final', content: [{ type: 'text', text: assistant.content, citations: null }],
      model: 'model:anthropic', stopReason: 'end_turn', stopSequence: null, usage: { input_tokens: 3, output_tokens: 2,
        cache_creation: null, cache_creation_input_tokens: null, cache_read_input_tokens: null, inference_geo: null,
        output_tokens_details: null, server_tool_use: null, service_tier: 'standard' } })
  }
}

function storedArtifactJson(db: BetterSqlite3.Database, operationId: string, answerRootId: string) {
  const row = db.prepare(`SELECT artifact_kind AS artifactKind,codec_version AS codecVersion,artifact_json AS artifactJson,
    artifact_hash AS artifactHash,request_sequence AS requestSequence FROM generation_native_artifact_v2
    WHERE operation_id=? AND answer_root_id=? ORDER BY request_sequence DESC LIMIT 1`).get(operationId, answerRootId) as {
      artifactKind: string; codecVersion: number; artifactJson: string; artifactHash: string; requestSequence: number
    } | undefined
  if (!row) throw new Error('test native artifact missing')
  const artifactJson = transaction(db, () => loadNativeArtifactJsonV2(db, {
    operationId, answerRootId, requestSequence: row.requestSequence, artifactKind: row.artifactKind,
  }, row.artifactJson, { artifactCodecVersion: row.codecVersion, artifactHash: row.artifactHash }))
  return { artifactJson, artifactHash: row.artifactHash }
}

describe('portable history across text protocols', () => {
  it.each([
    ['openai', 'openai_responses_terminal_v1'], ['openrouter', 'openrouter_chat_terminal_result_v1'],
    ['deepseek', 'deepseek_stable_terminal_result_v1'], ['gemini', 'gemini_generate_content_response_v1'],
  ] as const)('selects the canonical %s history alongside its persisted auxiliary terminal artifact', (source, kind) => {
    const db = database(); addTurn(db, source, 1, true)
    const auxiliary = JSON.stringify({ schemaVersion: 1, response: { usage: { total_tokens: 7 } } })
    db.prepare(`INSERT INTO generation_native_artifact_v2(answer_root_id,request_sequence,operation_id,artifact_kind,codec_version,
      artifact_json,artifact_hash,created_at_ms,completion_scope) VALUES('answer:1',1,'operation:1',?,1,?,?,150,'operation_terminal')`).run(
      kind, auxiliary, createHash('sha256').update(auxiliary).digest('hex'))
    addTurn(db, source === 'gemini' ? 'openrouter' : 'gemini', 2, false)
    transaction(db, context => {
      const result = JSON.stringify(loadPortableGenerationHistoryV2(db, context, 'operation:2', source === 'gemini' ? 'openrouter' : 'gemini'))
      expect(result.match(/question 1/gu)).toHaveLength(1); expect(result.match(/answer 1/gu)).toHaveLength(1)
    })
    expect(db.prepare('SELECT artifact_json AS json FROM generation_native_artifact_v2 WHERE artifact_kind=?').get(kind)).toEqual({ json: auxiliary })
  })
  it('records deferred unfinished OpenRouter tool facts while reusing its interrupted text in the same scope', () => {
    const db = database(); addTurn(db, 'openrouter', 1, true, [], undefined, 'cancelled')
    transaction(db, context => new GenerationInterruptedReplayV2Repo(db).insert(context, {
      operationId: 'operation:1', answerRootId: 'answer:1', requestSequence: 1, protocol: 'openrouter',
      requestBody: { messages: [{ role: 'user', content: 'question 1' }] }, native: {
        items: [{ role: 'assistant', tool_calls: [[0, { name: 'pending_lookup', arguments: '{"partial":' }]] }],
        complete: false, completeIndexes: [], text: 'partial answer',
      } }))
    addTurn(db, 'openrouter', 2, false)
    transaction(db, context => {
      const result = JSON.stringify(loadPortableGenerationHistoryV2(db, context, 'operation:2', 'openrouter'))
      expect(result).toContain('partial answer'); expect(result).not.toContain('pending_lookup')
      const decision = requestAdaptationLedgerV2('operation:2', baseLedger).entries.find(entry => entry.path.endsWith('.interruptedNative'))!
      expect(JSON.parse(decision.evidence)).toMatchObject({ outcome: 'deferred', reason: 'unfinished_native_facts_retained' })
    })
    expect(db.prepare('SELECT snapshot_json AS json FROM generation_interrupted_replay_v2').get()).toEqual({ json: expect.stringContaining('pending_lookup') })
  })
  it('encodes Gemini inline images and records non-replayable native media references', () => {
    const db = database(); const data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'
    const artifact = createGeminiGenerateContentNativeHistoryArtifactV1({ operationId: 'operation:1', answerRootId: 'answer:1',
      requestSequence: 1, lineageDepth: 1, parentArtifactHash: null, orderedContents: [
        { role: 'user', parts: [{ text: 'question 1' }] }, { role: 'model', parts: [
          { text: 'answer 1' }, { inlineData: { mimeType: 'image/png', data } },
          { inlineData: { mimeType: 'audio/wav', data: 'YXVkaW8=' } }, { fileData: { mimeType: 'image/png', fileUri: 'gs://private/source.png' } },
        ] }] })
    addTurn(db, 'gemini', 1, true, [], artifact); addTurn(db, 'openrouter', 2, false)
    transaction(db, context => {
      const result = JSON.stringify(loadPortableGenerationHistoryV2(db, context, 'operation:2', 'openrouter'))
      expect(result).toContain(`data:image/png;base64,${data}`)
      expect(result).not.toContain('gs://'); expect(result).not.toContain('YXVkaW8=')
      const decisions = requestAdaptationLedgerV2('operation:2', baseLedger).entries.filter(entry => entry.path.includes('.nativeMedia'))
      expect(decisions).toHaveLength(3)
      expect(decisions.filter(entry => JSON.parse(entry.evidence).outcome === 'deferred')).toHaveLength(2)
    })
    expect(db.prepare('SELECT artifact_json AS json FROM generation_native_artifact_v2').get()).toEqual({ json: expect.stringContaining('gs://private/source.png') })
  })

  it('records failed native image generation instead of treating its result as a completed image', () => {
    const db = database(); const artifact = completeOpenAIResponsesProjectedRequestV2({ projectedPrefixItems: [],
      clientItems: [{ role: 'user', content: [{ type: 'input_text', text: 'question 1' }] }],
      returnedItems: [{ type: 'image_generation_call', id: 'img_failed', status: 'failed', result: 'failed-output' }] })
    addTurn(db, 'openai', 1, true, [], artifact); addTurn(db, 'gemini', 2, false)
    transaction(db, context => {
      expect(JSON.stringify(loadPortableGenerationHistoryV2(db, context, 'operation:2', 'gemini'))).not.toContain('inlineData')
      expect(requestAdaptationLedgerV2('operation:2', baseLedger).canonicalJson).toContain('unfinished_or_failed_image_output_retained')
    })
  })
  it('checks original text encoding through the authorized revision reader', () => {
    const db = database(); const assets = new AttachmentAssetV2Repo(db); const bytes = new Uint8Array([0xff, 0xfe, 0xfd])
    const blob = assets.recordBlobFromBytes(bytes, 'text/plain')
    assets.createAsset({ assetId: 'asset:badtext', filename: 'legacy.txt', sourceKind: 'user_import', assetKind: 'file' })
    const revision = assets.appendSourceRevision({ assetId: 'asset:badtext', assetRevisionId: 'revision:badtext', blob })
    const unregister = registerGenerationHistoryByteReaderV2(db, () => new Uint8Array(bytes))
    expect(inspectRequestTextEncodingV2(db, revision)).toBe(false)
    expect(bytes).toEqual(new Uint8Array([0xff, 0xfe, 0xfd]))
    unregister()
  })

  it('defers excess historical media before exceeding the target request codec budget', () => {
    const db = database(); const assets = new AttachmentAssetV2Repo(db); const bytes = Buffer.alloc(8 * 1024 * 1024, 65)
    const revisions = [0, 1].map(index => {
      const blob = assets.recordBlobFromBytes(bytes, 'application/pdf')
      assets.createAsset({ assetId: `asset:large${index}`, filename: `large${index}.pdf`, sourceKind: 'user_import', assetKind: 'file' })
      return assets.appendSourceRevision({ assetId: `asset:large${index}`, assetRevisionId: `revision:large${index}`, blob })
    })
    const unregister = registerGenerationHistoryByteReaderV2(db, () => Buffer.from(bytes))
    addTurn(db, 'gemini', 1, true, revisions.map(revision => ({ kind: 'managed_file', assetId: revision.assetId.value,
      assetRevisionId: revision.assetRevisionId.value, assetSha256: revision.blob.sha256.value, include: true, sendAs: 'provider_file', conversion: 'none' })))
    addTurn(db, 'openrouter', 2, false)
    transaction(db, context => {
      const result = loadPortableGenerationHistoryV2(db, context, 'operation:2', 'openrouter')
      expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThan(20 * 1024 * 1024)
      expect(JSON.stringify(result).match(/file_data/gu)).toHaveLength(1)
      expect(requestAdaptationLedgerV2('operation:2', baseLedger).canonicalJson).toContain('target_request_media_budget_exceeded')
    })
    expect(db.prepare('SELECT count(*) AS n FROM asset_revision_v2').get()).toEqual({ n: 2 })
    unregister()
  })
  it.each(['openrouter', 'openai'] as const)('keeps the completed OpenRouter tool chain over an earlier checkpoint when targeting %s', target => {
    const db = database(); addTurn(db, 'gemini', 1, true)
    const artifact = createOpenRouterNativeHistoryArtifactV1({ lineageDepth: 1, parentArtifactHash: null, orderedMessages: [
      { role: 'user', content: 'question 2' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'call_742', type: 'function', function: { name: 'lookup', arguments: '{"input":"FINAL_CALL_INPUT"}' } }] },
      { role: 'tool', tool_call_id: 'call_742', content: 'FINAL_TOOL_OUTPUT' },
      { role: 'assistant', content: 'FINAL_ANSWER' },
    ] })
    addTurn(db, 'openrouter', 2, true, [], artifact, 'completed', () => transaction(db, context => new GenerationInterruptedReplayV2Repo(db).insert(context, {
      answerRootId: 'answer:2', operationId: 'operation:2', requestSequence: 1, protocol: 'openrouter',
      requestBody: { messages: [{ role: 'user', content: 'question 2' }] },
      native: { items: [{ role: 'assistant', content: 'STALE_CHECKPOINT' }], completeIndexes: [0], text: 'STALE_CHECKPOINT', complete: true },
    })))
    addTurn(db, target, 3, false)
    transaction(db, context => {
      const result = JSON.stringify(loadPortableGenerationHistoryV2(db, context, 'operation:3', target))
      expect(result.match(/FINAL_CALL_INPUT/gu)).toHaveLength(1)
      expect(result.match(/FINAL_TOOL_OUTPUT/gu)).toHaveLength(1)
      expect(result.match(/FINAL_ANSWER/gu)).toHaveLength(1)
      expect(result).not.toContain('STALE_CHECKPOINT')
    })
  })
  it('persists a near-limit OpenRouter interrupted native result once and derives its replay', () => {
    const db = database(), question = 'q'.repeat(19 * 1024 * 1024), reasoning = 'r'.repeat(55 * 1024 * 1024)
    addTurn(db, 'openrouter', 1, true, [], undefined, 'failed', undefined, false, question)
    const native = { items: [{ role: 'assistant', reasoning }], text: 'answer 1', completeIndexes: [0], complete: true }
    transaction(db, context => new GenerationInterruptedReplayV2Repo(db).insert(context, {
      operationId: 'operation:1', answerRootId: 'answer:1', requestSequence: 1, protocol: 'openrouter',
      requestBody: { messages: [{ role: 'user', content: question }] }, native }))
    const saved = db.prepare('SELECT snapshot_json AS json,snapshot_hash AS hash FROM generation_interrupted_replay_v2').get() as { json: string; hash: string }
    expect(Buffer.byteLength(saved.json)).toBeLessThan(128 * 1024 * 1024)
    transaction(db, context => {
      const hydrated = JSON.parse(loadInterruptedReplayJsonV2(db, {
        operationId: 'operation:1', answerRootId: 'answer:1', requestSequence: 1 }, saved.json, saved.hash))
      expect(hydrated.replayProjection).toBe('native_assistant_v1')
      expect(hydrated.replay).toHaveLength(1)
      const replay = new GenerationInterruptedReplayV2Repo(db).load(context, 'answer:1', 'openrouter')
      expect(replay).toEqual([{ role: 'user', content: question },
        { role: 'assistant', content: 'answer 1', reasoning }])
    })
    expect((db.prepare('SELECT snapshot_json AS json FROM generation_interrupted_replay_v2').get() as { json: string }).json).toBe(saved.json)
    expect(db.prepare("SELECT state FROM generation_operation_v2 WHERE operation_id='operation:1'").get()).toEqual({ state: 'failed' })
  }, 30_000)
  it.each((['generic', 'ollama', 'compatible', 'lmstudio'] as const).flatMap(target =>
    (['cancelled', 'failed'] as const).map(state => [target, state] as const)))('retains %s %s wire facts and replays only authoritative visible text', (target, state) => {
    const db = database(); addTurn(db, target, 1, true, [], undefined, state)
    const protocol = ({ generic: 'generic_local', ollama: 'ollama', compatible: 'openai_compatible', lmstudio: 'lmstudio' } as const)[target]
    const wireEvents = [{ type: 'partial', reasoning: 'INCOMPLETE_PRIVATE_REASONING', tool_call: { arguments: 'UNFINISHED_TOOL' }, text: 'answer 1' }]
    transaction(db, context => new GenerationInterruptedReplayV2Repo(db).insertLocalCheckpoint(context, {
      operationId: 'operation:1', answerRootId: 'answer:1', requestSequence: 1, protocol,
      requestBody: { messages: [{ role: 'user', content: 'question 1' }] }, wireEvents }))
    const saved = db.prepare('SELECT snapshot_json AS json,snapshot_hash AS hash FROM generation_interrupted_replay_v2').get() as { json: string; hash: string }
    expect(saved.hash).toBe(createHash('sha256').update(saved.json).digest('hex'))
    expect(JSON.parse(saved.json).native.wireEvents).toEqual(wireEvents)
    addTurn(db, target, 2, false)
    transaction(db, context => {
      new repositories[target](db).loadRequestHistory(context, 'operation:2')
      const result = loadPortableGenerationHistoryV2(db, context, 'operation:2', target)
      expect(JSON.stringify(result)).toContain('answer 1')
      expect(JSON.stringify(result)).not.toContain('INCOMPLETE_PRIVATE_REASONING')
      expect(JSON.stringify(result)).not.toContain('UNFINISHED_TOOL')
      if (target === 'lmstudio') expect(() => decodeLmStudioOpenResponsesReplayItemsV1(result)).not.toThrow()
    })
    expect(db.prepare('SELECT snapshot_json AS json FROM generation_interrupted_replay_v2').get()).toEqual({ json: saved.json })
  })
  it.each((['lmstudio', 'openai'] as const).flatMap(target =>
    ([true, false] as const).map(capturedWire => [target, capturedWire] as const)))('round-trips an LM terminal checkpoint for %s with captured wire=%s', (target, capturedWire) => {
    const db = database(); addTurn(db, 'lmstudio', 1, true, [], undefined, 'failed')
    const returnedItems = [
      { id: 'partial-message', type: 'message', role: 'assistant', status: 'incomplete',
        content: [{ type: 'output_text', text: 'answer 1', annotations: [], logprobs: [] }] },
      { id: 'partial-call', type: 'function_call', status: 'incomplete', call_id: 'partial-call-id',
        name: 'lookup', arguments: 'UNFINISHED_ARGUMENTS' },
    ]
    const terminalResult = { state: 'incomplete', returnedItems, responseId: 'response:partial',
      model: 'model:lmstudio', usage: { output_tokens: 7 }, error: null }
    const wireEvents = capturedWire ? [{ type: 'response.incomplete', sequence_number: 0,
      response: { id: 'response:partial', model: 'model:lmstudio', status: 'incomplete',
        output: returnedItems, usage: { output_tokens: 7 }, error: null } }] : []
    transaction(db, context => new GenerationInterruptedReplayV2Repo(db).insertLocalCheckpoint(context, {
      operationId: 'operation:1', answerRootId: 'answer:1', requestSequence: 1, protocol: 'lmstudio',
      requestBody: { input: [{ role: 'user', content: [{ type: 'input_text', text: 'question 1' }] }] },
      wireEvents, terminalResult }))
    const saved = (db.prepare('SELECT snapshot_json AS json FROM generation_interrupted_replay_v2').get() as { json: string }).json
    expect(JSON.parse(saved).replay).toHaveLength(1)
    expect(JSON.parse(saved).native).toHaveProperty(capturedWire ? 'terminalResultRef' : 'terminalResult')
    addTurn(db, target, 2, false)
    transaction(db, context => {
      const result = loadPortableGenerationHistoryV2(db, context, 'operation:2', target)
      expect(JSON.stringify(result)).toContain('answer 1')
      expect(JSON.stringify(result)).toContain('UNFINISHED_ARGUMENTS')
      expect(JSON.stringify(result)).toContain('incomplete')
      if (target === 'lmstudio') expect(() => decodeLmStudioOpenResponsesReplayItemsV1(result)).not.toThrow()
      else expect(() => decodeOpenAIResponsesReplayItemsV1(result)).not.toThrow()
    })
    expect((db.prepare('SELECT snapshot_json AS json FROM generation_interrupted_replay_v2').get() as { json: string }).json).toBe(saved)
  })
  it.each(['openai', 'openrouter', 'anthropic', 'gemini'] as const)('encodes foreign image and PDF bytes for %s without reusing file IDs', target => {
    const db = database(); const assets = new AttachmentAssetV2Repo(db)
    const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB', 'base64')
    const pdfBytes = Buffer.from('%PDF-1.7\n%historical PDF')
    const revisions = [['image', 'image/png', imageBytes], ['file', 'application/pdf', pdfBytes]].map(([kind, mime, bytes], i) => {
      const blob = assets.recordBlobFromBytes(bytes as Uint8Array, mime as string)
      assets.createAsset({ assetId: `asset:media${i}`, filename: i ? 'source.pdf' : 'source.png', sourceKind: 'user_import', assetKind: kind as 'image' | 'file' })
      return assets.appendSourceRevision({ assetId: `asset:media${i}`, assetRevisionId: `revision:media${i}`, blob })
    })
    const unregister = registerGenerationHistoryByteReaderV2(db, fact => Buffer.from(fact.blob.mime === 'image/png' ? imageBytes : pdfBytes))
    addTurn(db, target === 'gemini' ? 'openrouter' : 'gemini', 1, true, revisions.map(revision => ({ kind: 'managed_file', assetId: revision.assetId.value,
      assetRevisionId: revision.assetRevisionId.value, assetSha256: revision.blob.sha256.value, include: true,
      sendAs: revision.assetKind === 'image' ? 'image_reference' : 'provider_file', conversion: 'none' })))
    addTurn(db, target, 2, false)
    transaction(db, context => {
      const wire = loadPortableGenerationHistoryV2(db, context, 'operation:2', target)
      expect(JSON.stringify(wire)).toContain(imageBytes.toString('base64'))
      expect(JSON.stringify(wire)).toContain(pdfBytes.toString('base64'))
      expect(JSON.stringify(wire)).not.toContain('file_id')
      if (target === 'openai') expect(() => decodeOpenAIResponsesReplayItemsV1(wire)).not.toThrow()
    })
    unregister()
  })

  it('encodes an authorized current OpenAI inline image without a provider upload', () => {
    const db = database(); const assets = new AttachmentAssetV2Repo(db); const bytes = Buffer.from('iVBORw0KGgo=', 'base64')
    const blob = assets.recordBlobFromBytes(bytes, 'image/png')
    assets.createAsset({ assetId: 'asset:current', filename: 'current.png', sourceKind: 'user_import', assetKind: 'image' })
    const revision = assets.appendSourceRevision({ assetId: 'asset:current', assetRevisionId: 'revision:current', blob })
    const unregister = registerGenerationHistoryByteReaderV2(db, () => Buffer.from(bytes))
    addTurn(db, 'openai', 1, false, [{ kind: 'managed_file', assetId: revision.assetId.value, assetRevisionId: revision.assetRevisionId.value,
      assetSha256: revision.blob.sha256.value, include: true, sendAs: 'image_reference', conversion: 'none' }])
    transaction(db, context => {
      const history = new OpenAIResponsesNativeHistoryV2Repo(db).loadRequestHistory(context, 'operation:1')
      expect(JSON.stringify(history)).toContain(`data:image/png;base64,${bytes.toString('base64')}`)
    })
    unregister()
  })

  it.each(['openai', 'openrouter'] as const)('retains generated native image output when switching from %s to Gemini', source => {
    const db = database(); const data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'
    const artifact = source === 'openai' ? completeOpenAIResponsesProjectedRequestV2({ projectedPrefixItems: [],
      clientItems: [{ role: 'user', content: [{ type: 'input_text', text: 'question 1' }] }],
      returnedItems: [{ type: 'image_generation_call', id: 'img_1', status: 'completed', result: data }] })
      : createOpenRouterNativeHistoryArtifactV1({ lineageDepth: 1, parentArtifactHash: null, orderedMessages: [
        { role: 'user', content: 'question 1' }, { role: 'assistant', content: 'answer 1', images: [{ image_url: { url: `data:image/png;base64,${data}` } }] }] })
    addTurn(db, source, 1, true, [], artifact); addTurn(db, 'gemini', 2, false)
    transaction(db, context => {
      const wire = JSON.stringify(loadPortableGenerationHistoryV2(db, context, 'operation:2', 'gemini'))
      expect(wire).toContain('inlineData'); expect(wire).toContain(data)
    })
  })
  it.each(targets.flatMap(source => targets.map(target => [source, target] as const)))('%s -> %s preserves this turn and its source', (source, target) => {
    const db = database(); addTurn(db, source, 1, true); addTurn(db, target, 2, false)
    const original = db.prepare('SELECT artifact_json,snapshot_hash FROM generation_native_artifact_v2 JOIN assistant_generation_snapshot_v2 USING(operation_id,answer_root_id)').all()
    transaction(db, context => {
      new repositories[target](db).loadRequestHistory(context, 'operation:2')
      const result = loadPortableGenerationHistoryV2(db, context, 'operation:2', target)
      if (source === target) { expect(result).toBeNull(); return }
      const json = JSON.stringify(result)
      expect(json.match(/question 1/gu)).toHaveLength(1); expect(json.match(/answer 1/gu)).toHaveLength(1)
      expect(json).not.toContain('question 2')
      if (target === 'openai') expect(() => decodeOpenAIResponsesReplayItemsV1(result)).not.toThrow()
      if (target === 'lmstudio') expect(() => decodeLmStudioOpenResponsesReplayItemsV1(result)).not.toThrow()
      const ledger = requestAdaptationLedgerV2('operation:2', baseLedger)
      expect(ledger.entries.some(entry => entry.path === 'compatibility.history.answer:1.turn')).toBe(true)
    })
    expect(db.prepare('SELECT artifact_json,snapshot_hash FROM generation_native_artifact_v2 JOIN assistant_generation_snapshot_v2 USING(operation_id,answer_root_id)').all()).toEqual(original)
  })

  it('rebuilds the next mixed turn deterministically and honors a frozen exclusion', () => {
    const db = database(); addTurn(db, 'gemini', 1, true); addTurn(db, 'openrouter', 2, true)
    transaction(db, context => new BranchContextFilterV2Repo(db).set(context, { branchId: 'branch:1', targetType: 'question', targetId: 'question:1', mode: 'exclude', updatedAtMs: 250 }))
    addTurn(db, 'openai', 3, false)
    const read = () => transaction(db, context => JSON.stringify(new OpenAIResponsesNativeHistoryV2Repo(db).loadRequestHistory(context, 'operation:3').projectedPrefixItems))
    const first = read(); expect(first).toContain('question 2'); expect(first).toContain('answer 2'); expect(first).not.toContain('question 1')
    expect(read()).toBe(first)
  })

  it('retains foreign Gemini reasoning outside ordinary body text and keeps tool call/result information once', () => {
    const db = database()
    const artifact = createGeminiGenerateContentNativeHistoryArtifactV1({ operationId: 'operation:1', answerRootId: 'answer:1',
      requestSequence: 1, lineageDepth: 1, parentArtifactHash: null, orderedContents: [
        { role: 'user', parts: [{ text: 'question 1' }] },
        { role: 'model', parts: [{ text: 'PRIVATE_REASONING', thought: true, thoughtSignature: 'OPAQUE_SIGNATURE' },
          { functionCall: { name: 'lookup', args: { code: 'CALL_INPUT_742' } }, thoughtSignature: 'CALL_SIGNATURE' }] },
        { role: 'user', parts: [{ functionResponse: { name: 'lookup', response: { result: 'TOOL_OUTPUT_843' } } }] },
        { role: 'model', parts: [{ text: 'answer 1' }] },
      ] })
    addTurn(db, 'gemini', 1, true, [], artifact); addTurn(db, 'openrouter', 2, false)
    transaction(db, context => {
      const wire = JSON.stringify(loadPortableGenerationHistoryV2(db, context, 'operation:2', 'openrouter'))
      expect(wire).toContain('CALL_INPUT_742'); expect(wire.match(/TOOL_OUTPUT_843/gu)).toHaveLength(1)
      expect(wire).not.toContain('PRIVATE_REASONING'); expect(wire).not.toContain('SIGNATURE')
      expect(requestAdaptationLedgerV2('operation:2', baseLedger).canonicalJson).toContain('native_reasoning_scope_not_replayable')
    })
    expect(storedArtifactJson(db, 'operation:1', 'answer:1').artifactJson).toContain('PRIVATE_REASONING')
  })

  it('converts the documented OpenAI public reasoning summary while deferring opaque content and retaining the source', () => {
    const db = database()
    const artifact = completeOpenAIResponsesProjectedRequestV2({ projectedPrefixItems: [],
      clientItems: [{ role: 'user', content: [{ type: 'input_text', text: 'question 1' }] }],
      returnedItems: [
        { id: 'rs_1', type: 'reasoning', status: 'completed', summary: [{ type: 'summary_text', text: 'OPENAI_PUBLIC_SUMMARY' }],
          content: [{ type: 'reasoning_text', text: 'OPENAI_PRIVATE_THOUGHT' }], encrypted_content: 'OPENAI_OPAQUE_CIPHERTEXT' },
        { id: 'fc_1', type: 'function_call', call_id: 'call_1', name: 'lookup', arguments: '{"key":"value"}', status: 'completed' },
        { id: 'ig_1', type: 'image_generation_call', status: 'completed', result: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB' },
        { id: 'msg_1', type: 'message', role: 'assistant', status: 'completed',
          content: [{ type: 'output_text', text: 'answer 1', annotations: [], logprobs: [] }] },
      ] })
    addTurn(db, 'openai', 1, true, [], artifact); addTurn(db, 'openrouter', 2, false)
    const original = storedArtifactJson(db, 'operation:1', 'answer:1')
    transaction(db, context => {
      const history = loadPortableGenerationHistoryV2(db, context, 'operation:2', 'openrouter')!
      const result = JSON.stringify(history)
      const text = history.map(message => typeof message.content === 'string' ? message.content :
        Array.isArray(message.content) ? message.content.map(part => typeof part === 'object' && part !== null && 'text' in part ? part.text : '').join('\n') : '').join('\n')
      expect(result).toContain('OPENAI_PUBLIC_SUMMARY')
      expect(text).toContain('"call_id":"call_1"')
      expect(text).toContain('"name":"lookup"')
      expect(result).toContain('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB')
      expect(result).not.toContain('OPENAI_PRIVATE_THOUGHT')
      expect(result).not.toContain('OPENAI_OPAQUE_CIPHERTEXT')
      const ledger = requestAdaptationLedgerV2('operation:2', baseLedger).canonicalJson
      expect(ledger).toContain('public_reasoning_summary_preserved_as_history')
      expect(ledger).toContain('native_reasoning_scope_not_replayable')
    })
    expect(storedArtifactJson(db, 'operation:1', 'answer:1')).toEqual(original)
  })

  it('converts OpenRouter reasoning.summary while retaining tool history and public image media', () => {
    const db = database(); const image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'
    const artifact = createOpenRouterNativeHistoryArtifactV1({ lineageDepth: 1, parentArtifactHash: null, orderedMessages: [
      { role: 'user', content: 'question 1' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'call_2', type: 'function', function: { name: 'lookup', arguments: '{"key":"value"}' } }] },
      { role: 'tool', tool_call_id: 'call_2', content: 'OPENROUTER_TOOL_RESULT' },
      { role: 'assistant', content: 'answer 1',
        reasoning_details: [
          { type: 'reasoning.summary', summary: 'OPENROUTER_PUBLIC_SUMMARY' },
          { type: 'reasoning.text', text: 'OPENROUTER_PRIVATE_THOUGHT', signature: 'OPENROUTER_OPAQUE_SIGNATURE' },
          { type: 'reasoning.encrypted', encrypted_content: 'OPENROUTER_OPAQUE_CIPHERTEXT' },
        ], images: [{ image_url: { url: `data:image/png;base64,${image}` } }] },
    ] })
    addTurn(db, 'openrouter', 1, true, [], artifact); addTurn(db, 'openai', 2, false)
    const original = storedArtifactJson(db, 'operation:1', 'answer:1')
    transaction(db, context => {
      const result = JSON.stringify(loadPortableGenerationHistoryV2(db, context, 'operation:2', 'openai'))
      expect(result).toContain('OPENROUTER_PUBLIC_SUMMARY')
      expect(result).toContain('OPENROUTER_TOOL_RESULT')
      expect(result.match(/OPENROUTER_TOOL_RESULT/gu)).toHaveLength(1)
      expect(result).toContain(image)
      expect(result).not.toContain('OPENROUTER_PRIVATE_THOUGHT')
      expect(result).not.toContain('OPENROUTER_OPAQUE_CIPHERTEXT')
      expect(result).not.toContain('OPENROUTER_OPAQUE_SIGNATURE')
      expect(requestAdaptationLedgerV2('operation:2', baseLedger).canonicalJson).toContain('public_reasoning_summary_preserved_as_history')
    })
    expect(storedArtifactJson(db, 'operation:1', 'answer:1')).toEqual(original)
  })

  it('preserves over-budget text history and records the portable-prefix codec budget', () => {
    const db = database(); const text = 'x'.repeat(20 * 1024 * 1024 - 1024)
    const artifact = createGeminiGenerateContentNativeHistoryArtifactV1({ operationId: 'operation:1', answerRootId: 'answer:1',
      requestSequence: 1, lineageDepth: 1, parentArtifactHash: null, orderedContents: [
        { role: 'user', parts: [{ text: 'question 1' }] }, { role: 'model', parts: [{ text }] },
      ] })
    addTurn(db, 'gemini', 1, true, [], artifact); addTurn(db, 'openrouter', 2, false)
    transaction(db, context => {
      const result = loadPortableGenerationHistoryV2(db, context, 'operation:2', 'openrouter')!
      expect((result[1].content as string).length).toBe(text.length)
      expect((result[1].content as string).endsWith('x')).toBe(true)
      const budget = requestAdaptationLedgerV2('operation:2', baseLedger).entries.find(entry => entry.path === 'compatibility.historyBudget.text')
      expect(budget).toBeDefined()
      expect(JSON.parse(budget!.evidence)).toMatchObject({ outcome: 'preserved', reason: 'history_preserved_pending_complete_request_budget_validation' })
      expect(JSON.parse(budget!.evidence).source).toMatchObject({ stage: 'portable_history_prefix', target: 'openrouter' })
      expect(JSON.parse(budget!.evidence).source.encodedBytes).toBeGreaterThan(JSON.parse(budget!.evidence).source.availableBytes)
      // The reserve is an estimate: the complete, still-legal request can send.
      const compiled = compileOpenRouterChatRequestV1({model: 'model:test', messages: result})
      expect(compiled.preparedBody.byteLength).toBeLessThan(20 * 1024 * 1024)
      expect(() => compileOpenRouterChatRequestV1({model: 'model:test',
        messages: [...result, {role: 'user', content: 'y'.repeat(4096)}],
      })).toThrow('GENERATION_V2_OPENROUTER_CHAT_REQUEST_LIMIT_EXCEEDED')
    })
  })

  it('records compatible reasoning metadata when changing its native replay scope', () => {
    const db = database(); addTurn(db, 'compatible', 1, true, [], createOpenAIChatCompatibleNativeArtifactV2({
      messages: [{ role: 'user', content: 'question 1' }, { role: 'assistant', content: 'answer 1' }],
      reasoningReplay: [{ assistantMessageIndex: 1, reasoning: 'COMPATIBLE_PRIVATE_REASONING', hasCompleteToolChain: false }] }))
    addTurn(db, 'openai', 2, false)
    transaction(db, context => {
      expect(JSON.stringify(loadPortableGenerationHistoryV2(db, context, 'operation:2', 'openai'))).not.toContain('COMPATIBLE_PRIVATE_REASONING')
      expect(requestAdaptationLedgerV2('operation:2', baseLedger).entries.some(entry => entry.path.endsWith('.reasoningReplay'))).toBe(true)
    })
  })

  it('selects an array-form current question with an attachment suffix instead of an earlier repeated question', () => {
    const db = database()
    const artifact = createGeminiGenerateContentNativeHistoryArtifactV1({ operationId: 'operation:1', answerRootId: 'answer:1',
      requestSequence: 1, lineageDepth: 1, parentArtifactHash: null, orderedContents: [
        { role: 'user', parts: [{ text: 'question 1' }] }, { role: 'model', parts: [{ text: 'OLD_DUPLICATE' }] },
        { role: 'user', parts: [{ text: 'question 1\n\n[Prior attachment history.txt]\nATTACHMENT_BODY' }] },
        { role: 'model', parts: [{ text: 'answer 1' }] },
      ] })
    addTurn(db, 'gemini', 1, true, [], artifact); addTurn(db, 'openai', 2, false)
    transaction(db, context => {
      const wire = JSON.stringify(loadPortableGenerationHistoryV2(db, context, 'operation:2', 'openai'))
      expect(wire).not.toContain('OLD_DUPLICATE'); expect(wire).toContain('answer 1')
    })
  })

  it('reads authorized text revision bytes for a foreign historical attachment', () => {
    const db = database(); const bytes = new TextEncoder().encode('historical attachment body')
    const assets = new AttachmentAssetV2Repo(db)
    const blob = assets.recordBlobFromBytes(bytes, 'text/plain')
    assets.createAsset({ assetId: 'asset:text', filename: 'history.txt', sourceKind: 'user_import', assetKind: 'file' })
    const revision = assets.appendSourceRevision({ assetId: 'asset:text', assetRevisionId: 'revision:text', blob })
    const unregister = registerGenerationHistoryByteReaderV2(db, fact => { expect(fact.assetRevisionId.value).toBe(revision.assetRevisionId.value); return new Uint8Array(bytes) })
    addTurn(db, 'gemini', 1, true, [{ kind: 'managed_file', assetId: revision.assetId.value, assetRevisionId: revision.assetRevisionId.value,
      assetSha256: revision.blob.sha256.value, include: true, sendAs: 'inline_text', conversion: 'none' }])
    addTurn(db, 'anthropic', 2, false)
    transaction(db, context => expect(JSON.stringify(loadPortableGenerationHistoryV2(db, context, 'operation:2', 'anthropic'))).toContain('historical attachment body'))
    unregister()
  })

  it.each(['openai', 'lmstudio'] as const)(
    'loads a chunked 9 MiB %s terminal artifact and prepares the next bounded request',
    (target) => {
      const db = database()
      const responseText = 'x'.repeat(9 * 1024 * 1024)
      const user = { role: 'user' as const, content: [{ type: 'input_text' as const, text: 'question 1' }] }
      const returned = { id: 'msg_1', type: 'message' as const, role: 'assistant' as const, status: 'completed' as const,
        content: [{ type: 'output_text' as const, text: responseText, annotations: [] as const, logprobs: [] as const }] }
      const artifact = target === 'openai'
        ? completeOpenAIResponsesProjectedRequestV2({ projectedPrefixItems: [], clientItems: [user], returnedItems: [returned] })
        : completeLmStudioOpenResponsesProjectedRequestV1({ replayItems: [user], returnedItems: [returned] })
      addTurn(db, target, 1, true, [], artifact, 'completed', undefined, true)
      addTurn(db, target, 2, false)

      transaction(db, context => {
        if (target === 'openai') {
          const history = new OpenAIResponsesNativeHistoryV2Repo(db).loadRequestHistory(context, 'operation:2')
          expect(history.priorArtifact).not.toBeNull()
          const compiled = compileOpenAIResponsesRequestV1({ model: 'model:openai',
            priorArtifact: history.priorArtifact, clientItems: history.clientItems })
          expect(compiled.preparedBody.byteLength).toBeGreaterThan(9 * 1024 * 1024)
          expect(compiled.preparedBody.byteLength).toBeLessThanOrEqual(28 * 1024 * 1024)
          expect(() => compileOpenAIResponsesRequestV1({ model: 'model:openai', priorArtifact: history.priorArtifact,
            clientItems: history.clientItems, instructions: 'y'.repeat(19 * 1024 * 1024) }))
            .toThrow('GENERATION_V2_OPENAI_REQUEST_LIMIT_EXCEEDED')
        } else {
          const history = new LmStudioOpenResponsesNativeHistoryV2Repo(db).loadRequestHistory(context, 'operation:2')
          const compiled = compileLmStudioOpenResponsesRequestV1({ model: 'model:lmstudio', replayItems: history.projectedReplayItems })
          expect(compiled.preparedBody.byteLength).toBeGreaterThan(9 * 1024 * 1024)
          expect(compiled.preparedBody.byteLength).toBeLessThanOrEqual(24 * 1024 * 1024)
          expect(() => compileLmStudioOpenResponsesRequestV1({ model: 'model:lmstudio',
            replayItems: history.projectedReplayItems, tools: [{ type: 'function', name: 'lookup',
              description: 'd'.repeat(16 * 1024 * 1024), parameters: { type: 'object', properties: {} }, strict: true }],
            toolChoice: 'required' })).toThrow('GENERATION_V2_JSON_BYTE_LIMIT_EXCEEDED')
        }
      })
    },
    60_000,
  )
})
