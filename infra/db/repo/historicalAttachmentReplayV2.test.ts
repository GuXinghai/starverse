import { createHash } from 'node:crypto'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  canonicalizeUnverifiedRuntimeCapabilitySnapshotV2,
  decodeRuntimeCapabilitySnapshotV2,
} from '../../../src/core/generation-v2/capability/runtimeCapabilitySnapshotV2'
import { MODEL_CAPABILITY_SEMANTIC_PATHS_V2 as PATHS } from '../../../src/core/generation-v2/capability/modelCapabilitySchemaV2'
import {
  canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2,
  decodeAssistantAnswerGenerationSnapshotV2,
} from '../../../src/core/generation-v2/domain/assistantAnswerGenerationSnapshotV2'
import {
  readReviewedAnthropicMessagesDefinitionV2,
  readReviewedGeminiGenerateContentDefinitionV2,
} from '../../../src/core/generation-v2/contracts/providerContractRegistryV2'
import { readVerifiedGeminiDeveloperApiEndpointProfileV2 } from '../../../src/core/generation-v2/providers/gemini/verifiedEndpointProfileV2'
import { createAnthropicNativeHistoryArtifactV1 } from '../../../src/core/generation-v2/providers/anthropic/nativeContentBlocksV1'
import { createSemanticConsumptionLedgerV2 } from '../../../src/core/generation-v2/compiler/semanticConsumptionLedgerV2'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import { GenerationExecutionV2Repo } from './generationExecutionV2Repo'
import { GenerationRequestV2Repo } from './generationRequestV2Repo'
import { AttachmentAssetV2Repo } from './attachmentAssetV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from './generationV2AuthorityTransactionInternal'
import { AnthropicNativeHistoryV2Repo } from './anthropicNativeHistoryV2Repo'
import { GeminiGenerateContentNativeHistoryV2Repo } from './geminiGenerateContentNativeHistoryV2Repo'
import { compileAnthropicMessagesPreparedRequestV2 } from '../../../electron/services/anthropicMessagesPreparedRequestCompilerV2'
import { geminiFunctionCallAssociationKeyV2 } from '../../../src/core/generation-v2/providers/gemini/toolContinuationCommandV2'
import { compileGeminiGenerateContentPreparedRequestV2 } from '../../../electron/services/geminiGenerateContentPreparedRequestCompilerV2'
import { geminiAttachmentCapabilityFieldsV2 } from '../../../electron/services/geminiGenerateContentGenerationAuthorityV2Service'

const root = path.resolve(process.cwd())
const HASH_A = 'a'.repeat(64)
const ledger = createSemanticConsumptionLedgerV2([{
  kind: 'consumed', path: 'generation.temperature', disposition: 'encoded',
  nativeField: 'temperature', encodingKind: 'identity', evidence: 'historical attachment replay test',
}])

type Kind = 'anthropic' | 'gemini'
type Attachment = Readonly<Record<string, unknown>>
type Turn = Readonly<{ attachments?: readonly Attachment[]; bindings?: readonly unknown[]; text: string; scope?: string }>

function config(kind: Kind) {
  if (kind === 'anthropic') {
    const definition = readReviewedAnthropicMessagesDefinitionV2()
    return {
      providerId: 'anthropic', contractId: 'anthropic-messages-2023-06-01', modelId: 'claude-sonnet-4-5',
      artifactKind: 'anthropic_messages_native_history_v1',
      binding: {
        credentialScopeId: 'credential-scope:p', providerId: 'anthropic', endpointProfileId: 'profile:anthropic',
        endpointBinding: { kind: 'provider_managed_set', endpointSetRevision: 'endpoint-set:1',
          descriptors: [{ endpointId: 'endpoint:anthropic', descriptorRevision: 'descriptor:1' }] },
        protocolContractId: 'anthropic-messages-2023-06-01', contractRevision: definition.contractRevision.value,
        contractDefinitionDigest: definition.definitionDigest.value, registryRevision: definition.registryRevision.value,
        modelId: 'claude-sonnet-4-5', operation: 'text',
      },
      extension: { kind: 'anthropic_messages', thinkingDisplay: 'provider_default', thinkingMode: 'model_recommended' },
      enums: {
        'providerExtension.kind': ['anthropic_messages'],
        'providerExtension.thinkingDisplay': ['provider_default', 'summarized', 'omitted'],
        'providerExtension.thinkingMode': ['model_recommended', 'manual', 'adaptive'],
      } as Record<string, readonly string[]>,
      generation: { maxOutputTokens: 2048 },
    }
  }
  const definition = readReviewedGeminiGenerateContentDefinitionV2()
  const profile = readVerifiedGeminiDeveloperApiEndpointProfileV2()
  const descriptor = profile.descriptors.generateContent
  return {
    providerId: 'google_ai_studio', contractId: 'gemini-generate-content-v1beta', modelId: 'gemini-2.5-flash',
    artifactKind: 'gemini_generate_content_native_history_v1',
    binding: {
      credentialScopeId: 'credential-scope:p', providerId: 'google_ai_studio',
      endpointProfileId: profile.endpointProfileId.value,
      endpointBinding: { kind: 'provider_managed_set', endpointSetRevision: profile.endpointSetRevision.value,
        descriptors: [{ endpointId: descriptor.endpointId.value, descriptorRevision: descriptor.descriptorRevision.value }] },
      protocolContractId: 'gemini-generate-content-v1beta', contractRevision: definition.contractRevision.value,
      contractDefinitionDigest: definition.definitionDigest.value, registryRevision: definition.registryRevision.value,
      modelId: 'gemini-2.5-flash', operation: 'text',
    },
    extension: { kind: 'gemini_generate_content', thinkingMode: 'default', includeThoughts: 'provider_default' },
    enums: {
      'providerExtension.kind': ['gemini_generate_content'],
      'providerExtension.thinkingMode': ['default'],
      'providerExtension.includeThoughts': ['provider_default'],
    } as Record<string, readonly string[]>,
    generation: {},
  }
}

function capabilityFor(kind: Kind, scope?: string) {
  const cfg = scope ? { ...config(kind), binding: { ...config(kind).binding, credentialScopeId: scope } } : config(kind)
  return decodeRuntimeCapabilitySnapshotV2(canonicalizeUnverifiedRuntimeCapabilitySnapshotV2({
    schemaVersion: 2, resolvedAt: '2026-07-18T00:00:00.000Z', binding: cfg.binding,
    evidence: [{ evidenceId: 'test.ev', kind: 'official_documentation', effect: 'supports',
      sourceRef: 'https://example.test/docs', verifiedAt: '2026-07-18T00:00:00.000Z', contentDigest: HASH_A }],
    fields: PATHS.map((field) => {
      const real = kind === 'gemini' ? geminiAttachmentCapabilityFieldsV2('test.ev').find((entry) => entry.path === field) : undefined
      if (real) return real
      const values: readonly (string | number | boolean)[] | undefined = ({
        'reasoning.mode': ['disabled', 'enabled'], 'web.mode': ['disabled'], 'image.mode': ['disabled'],
        'tools.mode': ['disabled'], ...cfg.enums,
      } as Record<string, readonly string[]>)[field]
      const domain = field === 'generation.maxOutputTokens'
        ? { kind: 'range' as const, min: 1, max: 1_000_000, integer: true }
        : values ? { kind: 'enum' as const, values } : undefined
      return domain
        ? { path: field, state: 'supported' as const, domain, constraints: [], evidenceIds: ['test.ev'] }
        : { path: field, state: 'missing' as const, constraints: [], evidenceIds: [] }
    }),
    tools: [],
    continuation: { kind: 'client_managed_native_replay', artifactKind: cfg.artifactKind,
      supportsBranchReplay: true, supportsRestartReplay: true, evidenceIds: ['test.ev'] },
  }))
}

function snapshotFor(kind: Kind, capability: ReturnType<typeof capabilityFor>, turn: number, value: Turn) {
  const cfg = config(kind)
  return decodeAssistantAnswerGenerationSnapshotV2(canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({
    schemaVersion: 2, answerRootId: `answer:${turn}`, operationId: `operation:${turn}`,
    semanticIntent: {
      schemaVersion: 2, generation: cfg.generation, reasoning: { mode: 'disabled' },
      web: { mode: 'disabled' }, image: { mode: 'disabled' }, tools: { mode: 'disabled' },
      attachments: value.attachments ?? [], providerExtension: cfg.extension,
    },
    resolvedConfigRevisions: [
      { ownerKind: 'global', ownerId: 'global', revision: 'config:global:1' },
      { ownerKind: 'project', ownerId: 'project:1', revision: 'config:project:1' },
      { ownerKind: 'conversation', ownerId: 'conversation:1', revision: 'config:conversation:1' },
    ],
    providerBinding: value.scope ? { ...cfg.binding, credentialScopeId: value.scope } : cfg.binding,
    capabilityBinding: {
      capabilityRevision: capability.revision.value, evidenceDigest: capability.evidenceDigest.value,
      semanticFieldsDigest: capability.semanticFieldsDigest.value, snapshotHash: capability.snapshotHash.value,
    },
    attachmentProviderFileBindings: value.bindings ?? [], toolAuthority: { kind: 'none' },
  })).canonicalJson
}

/** Builds turns 1..n-1 as completed answers and turn n as the pending (current) question. */
function createConversation(kind: Kind, turns: readonly Turn[]) {
  const cfg = config(kind)
  const capability = capabilityFor(kind)
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, root)
  db.prepare(`INSERT INTO runtime_capability_snapshot_v2 VALUES (?, ?, 2, ?, ?, ?, 1)`).run(
    capability.snapshotHash.value, capability.revision.value, capability.canonicalJson,
    capability.evidenceDigest.value, capability.semanticFieldsDigest.value)
  db.prepare('INSERT INTO project_v2 VALUES (?, ?, ?, ?)').run('project:1', 'Project', 1, 1)
  db.prepare('INSERT INTO conversation_v2 VALUES (?, ?, ?, ?, ?)').run('conversation:1', 'project:1', 'Conversation', 2, 2)
  db.prepare(`INSERT INTO branch_v2 VALUES ('branch:1', 'conversation:1', NULL, NULL, 12, 12, NULL, NULL)`).run()
  const executionRepo = new GenerationExecutionV2Repo(db)
  for (const scoped of new Set(turns.flatMap((turn) => turn.scope ? [turn.scope] : []))) {
    const other = capabilityFor(kind, scoped)
    db.prepare(`INSERT INTO runtime_capability_snapshot_v2 VALUES (?, ?, 2, ?, ?, ?, 1)`).run(
      other.snapshotHash.value, other.revision.value, other.canonicalJson, other.evidenceDigest.value, other.semanticFieldsDigest.value)
  }
  turns.forEach((turn, index) => {
    const n = index + 1
    const base = n * 100
    db.prepare(`INSERT INTO message_v2 (message_id, conversation_id, introduced_in_branch_id, role, status,
      parent_message_id, question_id, answer_root_id, ordinal, created_at_ms, updated_at_ms)
      VALUES (?, 'conversation:1', 'branch:1', 'user', 'completed', ?, NULL, NULL, ?, ?, ?),
        (?, 'conversation:1', 'branch:1', 'assistant', 'streaming', ?, ?, ?, ?, ?, ?)`).run(
      `question:${n}`, n === 1 ? null : `answer:${n - 1}`, 2 * n - 1, base, base,
      `answer:${n}`, `question:${n}`, `question:${n}`, `answer:${n}`, 2 * n, base + 1, base + 1)
    db.prepare(`UPDATE message_body_v2 SET body_text=? WHERE message_id=?`).run(`question ${n}`, `question:${n}`)
    db.prepare(`UPDATE branch_v2 SET head_message_id=? WHERE branch_id='branch:1'`).run(`answer:${n}`)
    db.prepare(`INSERT INTO branch_choice_v2 VALUES ('branch:1', 'conversation:1', ?, ?, ?)`).run(`question:${n}`, `answer:${n}`, 12 + n)
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => executionRepo.insertOperationAndSnapshot(context, {
      operationId: `operation:${n}`, actionKind: 'initial_send', branchId: 'branch:1', conversationId: 'conversation:1',
      questionId: `question:${n}`, sourceAnswerId: null, targetAnswerId: `answer:${n}`,
      snapshot: snapshotFor(kind, turn.scope ? capabilityFor(kind, turn.scope) : capability, n, turn), commandFingerprint: HASH_A, createdAtMs: base + 10,
    }))
    if (n === turns.length) return
    const snapshotHash = (db.prepare(`SELECT snapshot_hash AS hash FROM assistant_generation_snapshot_v2
      WHERE operation_id=?`).get(`operation:${n}`) as { hash: string }).hash
    const op = `operation:${n}`
    db.prepare(`INSERT INTO generation_request_v2 (operation_id, request_sequence, answer_root_id,
      snapshot_hash, provider_id, endpoint_profile_id, credential_scope_id, contract_id, model_id,
      effective_endpoint_id, capability_revision, compiler_ledger_json, compiler_ledger_hash,
      prepared_body_sha256, prepared_body_byte_length, state, created_at_ms, updated_at_ms)
      VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, 'endpoint:x', ?, ?, ?, ?, 2, 'prepared', ?, ?)`).run(
      op, `answer:${n}`, snapshotHash, cfg.providerId, cfg.binding.endpointProfileId, turns[index].scope ?? 'credential-scope:p', cfg.contractId, cfg.modelId,
      (turn.scope ? capabilityFor(kind, turn.scope) : capability).revision.value, ledger.canonicalJson, ledger.sha256, HASH_A, base + 11, base + 11)
    db.prepare(`INSERT INTO generation_attempt_v2 VALUES (?, 1, 1, 'open', NULL, NULL, ?, NULL)`).run(op, base + 12)
    db.prepare(`UPDATE generation_request_v2 SET state='streaming', updated_at_ms=? WHERE operation_id=?`).run(base + 13, op)
    db.prepare(`UPDATE generation_operation_v2 SET state='streaming', updated_at_ms=? WHERE operation_id=?`).run(base + 14, op)
    db.prepare(`UPDATE generation_attempt_v2 SET state='terminal', outcome_json='{"kind":"provider_completed"}',
      terminal_fingerprint=?, terminal_at_ms=? WHERE operation_id=?`).run(HASH_A, base + 19, op)
    db.prepare(`UPDATE generation_request_v2 SET state='completed', updated_at_ms=?, terminal_at_ms=? WHERE operation_id=?`)
      .run(base + 20, base + 20, op)
    db.prepare(`UPDATE generation_operation_v2 SET state='completed', updated_at_ms=?, terminal_at_ms=? WHERE operation_id=?`)
      .run(base + 21, base + 21, op)
    db.prepare(`UPDATE message_v2 SET status='completed', updated_at_ms=? WHERE message_id=?`).run(base + 21, `answer:${n}`)
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, op)!
      const request = new GenerationRequestV2Repo(db).loadExistingForOperation(context, execution, 1)
      if (kind === 'anthropic') {
        new AnthropicNativeHistoryV2Repo(db).insertRequestTerminalArtifact(context, execution, request,
          createAnthropicNativeHistoryArtifactV1({
            providerKey: 'anthropic', sourceApi: 'anthropic_messages', snapshotKey: 'assistant', role: 'assistant', status: 'final',
            content: [{ type: 'text', text: `answer ${n}`, citations: null }], model: cfg.modelId,
            stopReason: 'end_turn', stopSequence: null,
            usage: { cache_creation: null, cache_creation_input_tokens: null, cache_read_input_tokens: null,
              inference_geo: null, input_tokens: 3, output_tokens: 2, output_tokens_details: null,
              server_tool_use: null, service_tier: 'standard' },
          }), base + 30)
      } else {
        new GeminiGenerateContentNativeHistoryV2Repo(db).persistTerminalArtifact(context, execution, request,
          { role: 'model', parts: [{ text: `answer ${n}` }] }, base + 30)
      }
    })
  })
  return db
}

function textAttachment(assetId: string, revisionId: string, sha: string, include = true, sendAs = 'inline_text', conversion = 'plain_text') {
  return { kind: 'managed_file', assetId, assetRevisionId: revisionId, assetSha256: sha, include, sendAs, conversion }
}

function blobStoreFor(bytesByRevision: Record<string, Uint8Array>) {
  return { readRevisionBytes: (revision: { assetRevisionId: { value: string } }) =>
    new Uint8Array(bytesByRevision[revision.assetRevisionId.value]) } as never
}

const enc = (text: string) => new TextEncoder().encode(text)

function compileAnthropic(db: BetterSqlite3.Database, operation: string, extra: Record<string, unknown> = {}) {
  return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
    const execution = new GenerationExecutionV2Repo(db).findOperationInTransaction(context, operation)!
    const history = new AnthropicNativeHistoryV2Repo(db).loadRequestHistory(context, operation)
    const prepared = compileAnthropicMessagesPreparedRequestV2({
      context, execution, history, attachmentRepo: new AttachmentAssetV2Repo(db, () => 10), ...extra })
    return { history, prepared, body: JSON.parse(prepared.body.copyUtf8Text()) as { messages: unknown[] } }
  })
}

function compileGemini(db: BetterSqlite3.Database, operation: string, extra: Record<string, unknown> = {}) {
  return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
    const execution = new GenerationExecutionV2Repo(db).findOperationInTransaction(context, operation)!
    const history = new GeminiGenerateContentNativeHistoryV2Repo(db).loadRequestHistory(context, operation)
    const prepared = compileGeminiGenerateContentPreparedRequestV2({
      context, execution, history, attachmentRepo: new AttachmentAssetV2Repo(db, () => 10), ...extra })
    return { history, prepared, body: JSON.parse(prepared.body.copyUtf8Text()) as { contents: unknown[] } }
  })
}

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

function urlAttachment(mediaKind: string, url: string, include = true) {
  return {
    kind: 'url_reference', referenceId: `ref:${mediaKind}`, referenceRevision: 'ref-rev:1', originalUrl: url,
    urlDigest: sha(enc(url)), mediaKind, capturedAtMs: 5, provenance: 'user_supplied', include,
    sendAs: 'url_reference', conversion: 'none',
  }
}

function persistedState(db: BetterSqlite3.Database) {
  return JSON.stringify(['assistant_generation_snapshot_v2', 'message_body_v2', 'generation_native_artifact_v2', 'asset_revision_v2']
    .map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()))
}

function fakeAuthority(mimes: Record<string, string> = {}) {
  return vi.spyOn(AttachmentAssetV2Repo.prototype, 'withSynchronousSnapshotReferenceAuthority')
    .mockImplementation(((_context: unknown, intent: { assetRevisionId: { value: string } }, use: (value: unknown) => unknown) => {
      const mime = mimes[intent.assetRevisionId.value] ?? 'text/plain'
      return use({ revision: { assetKind: mime.startsWith('image/') ? 'image' : 'file', assetRevisionId: intent.assetRevisionId,
        blob: { mime, sizeBytes: 16 } } })
    }) as never)
}

let authoritySpy: ReturnType<typeof fakeAuthority> | null = null
function useFakeAuthority(mimes: Record<string, string>) {
  beforeEach(() => { authoritySpy = fakeAuthority(mimes) })
  afterEach(() => { authoritySpy?.mockRestore(); authoritySpy = null })
}

describe('Anthropic prior-turn attachment replay', () => {
  useFakeAuthority({ 'revision:i': 'image/png' })
  const textBytes = enc('hello from turn one')
  const pngBytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3])

  it('replays turn-1 attachments on the turn-1 user message for a text-only turn-2 follow-up', () => {
    const db = createConversation('anthropic', [
      { text: 'one', attachments: [textAttachment('asset:t', 'revision:t', sha(textBytes))] }, { text: 'two' }])
    try {
      const { body, history } = compileAnthropic(db, 'operation:2', { attachmentBlobStore: blobStoreFor({ 'revision:t': textBytes }) })
      expect(body.messages).toEqual([
        { role: 'user', content: [
          { type: 'text', text: 'question 1' },
          { type: 'document', source: { type: 'text', media_type: 'text/plain', data: 'hello from turn one' } },
        ] },
        { role: 'assistant', content: [{ type: 'text', text: 'answer 1', citations: null }] },
        { role: 'user', content: 'question 2' },
      ])
      expect(history.historicalTurnAttachments).toHaveLength(1)
      expect(history.historicalTurnAttachments[0]).toMatchObject({ replayIndex: 0, answerRootId: 'answer:1', operationId: 'operation:1' })
    } finally { db.close() }
  })

  it('keeps each prior turn attachment on its own turn across multiple turns, never on the current turn', () => {
    const db = createConversation('anthropic', [
      { text: 'one', attachments: [textAttachment('asset:t', 'revision:t', sha(textBytes))] },
      { text: 'two', attachments: [textAttachment('asset:i', 'revision:i', sha(pngBytes), true, 'image_reference', 'none')] },
      { text: 'three' }])
    try {
      const { body, history } = compileAnthropic(db, 'operation:3', {
        attachmentBlobStore: blobStoreFor({ 'revision:t': textBytes, 'revision:i': pngBytes }) })
      expect(body.messages).toEqual([
        { role: 'user', content: [{ type: 'text', text: 'question 1' },
          { type: 'document', source: { type: 'text', media_type: 'text/plain', data: 'hello from turn one' } }] },
        { role: 'assistant', content: [{ type: 'text', text: 'answer 1', citations: null }] },
        { role: 'user', content: [{ type: 'text', text: 'question 2' },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: Buffer.from(pngBytes).toString('base64') } }] },
        { role: 'assistant', content: [{ type: 'text', text: 'answer 2', citations: null }] },
        { role: 'user', content: 'question 3' },
      ])
      expect(history.historicalTurnAttachments.map((turn) => [turn.answerRootId, turn.replayIndex])).toEqual([['answer:1', 0], ['answer:2', 2]])
    } finally { db.close() }
  })

  it('replays included attachments only and keeps authoritative asset identity; excluded stay excluded', () => {
    const second = enc('excluded text')
    const db = createConversation('anthropic', [
      { text: 'one', attachments: [
        textAttachment('asset:t', 'revision:t', sha(textBytes)),
        textAttachment('asset:x', 'revision:x', sha(second), false)] },
      { text: 'two' }])
    try {
      const { body, history } = compileAnthropic(db, 'operation:2', {
        attachmentBlobStore: blobStoreFor({ 'revision:t': textBytes, 'revision:x': second }) })
      const replayed = history.historicalTurnAttachments[0].attachments
      expect(replayed).toHaveLength(1)
      expect(replayed[0]).toMatchObject({ kind: 'managed_file', include: true })
      const managed = replayed[0] as unknown as { assetRevisionId: { value: string }; assetSha256: { value: string } }
      expect(managed.assetRevisionId.value).toBe('revision:t')
      expect(managed.assetSha256.value).toBe(sha(textBytes))
      expect(authoritySpy!.mock.calls.map((call) => (call[1] as unknown as { assetRevisionId: { value: string } }).assetRevisionId.value)).toEqual(['revision:t'])
      expect(JSON.stringify(body)).not.toContain('excluded text')
      expect((body.messages[0] as { content: unknown[] }).content).toHaveLength(2)
    } finally { db.close() }
  })

  it('replays url, converted and provider-file attachments from the prior snapshot', () => {
    const url = 'https://example.test/pic.png'
    const converted = enc('converted body')
    const db = createConversation('anthropic', [
      { text: 'one', attachments: [
        urlAttachment('image', url),
        textAttachment('asset:c', 'revision:c', sha(converted), true, 'converted_document', 'plain_text'),
        textAttachment('asset:p', 'revision:p', sha(textBytes), true, 'provider_file', 'none')],
      bindings: [{ assetRevisionId: 'revision:p', providerFileDescriptor: {
        descriptorId: 'descriptor:p', descriptorRevision: 'descriptor-rev:1', descriptorHash: HASH_A, providerFileId: 'file_abc' } }] },
      { text: 'two' }])
    try {
      const { body, prepared } = compileAnthropic(db, 'operation:2', { attachmentBlobStore: blobStoreFor({ 'revision:c': converted }) })
      expect((body.messages[0] as { content: unknown[] }).content).toEqual([
        { type: 'text', text: 'question 1' },
        { type: 'image', source: { type: 'url', url } },
        { type: 'document', source: { type: 'content', content: [{ type: 'text', text: 'converted body' }] } },
        { type: 'document', source: { type: 'file', file_id: 'file_abc' } },
      ])
      expect(JSON.stringify(prepared.headersPlan)).toContain('files-api-2025-04-14')
    } finally { db.close() }
  })

  // R5-03 (P5b-04), characterization: a changed credential scope takes the portable history path, which re-encodes the
  // attachment bytes. The old scope's provider file id is therefore never sent, so no code change was needed.
  it('does not send a provider file id issued under another credential scope', () => {
    const binding = { assetRevisionId: 'revision:p', providerFileDescriptor: {
      descriptorId: 'descriptor:p', descriptorRevision: 'descriptor-rev:1', descriptorHash: HASH_A, providerFileId: 'file_old_scope' } }
    const db = createConversation('anthropic', [
      { text: 'one', scope: 'credential-scope:old', attachments: [textAttachment('asset:p', 'revision:p', sha(textBytes), true, 'provider_file', 'none')], bindings: [binding] },
      { text: 'two' }])
    try {
      const { body } = compileAnthropic(db, 'operation:2', { attachmentBlobStore: blobStoreFor({ 'revision:p': textBytes }) })
      expect(JSON.stringify(body)).not.toContain('file_old_scope')
    } finally { db.close() }
  })

  it('fails loudly instead of dropping an unsupported prior-turn attachment', () => {
    const db = createConversation('anthropic', [{ text: 'one', attachments: [urlAttachment('audio', 'https://example.test/a.mp3')] }, { text: 'two' }])
    try {
      expect(() => compileAnthropic(db, 'operation:2')).toThrow('GENERATION_V2_ANTHROPIC_COMPILER_SEMANTIC_REJECTED')
    } finally { db.close() }
  })

  it('does not mutate persisted snapshots, messages, artifacts or assets while replaying', () => {
    const db = createConversation('anthropic', [{ text: 'one', attachments: [textAttachment('asset:t', 'revision:t', sha(textBytes))] }, { text: 'two' }])
    try {
      const before = persistedState(db)
      const first = compileAnthropic(db, 'operation:2', { attachmentBlobStore: blobStoreFor({ 'revision:t': textBytes }) })
      const second = compileAnthropic(db, 'operation:2', { attachmentBlobStore: blobStoreFor({ 'revision:t': textBytes }) })
      expect(persistedState(db)).toBe(before)
      expect(second.prepared.body.copyUtf8Text()).toBe(first.prepared.body.copyUtf8Text())
      expect(first.history.historicalTurnAttachments.every((turn) => turn.answerRootId !== 'answer:2')).toBe(true)
    } finally { db.close() }
  })
})

describe('Gemini prior-turn attachment replay', () => {
  useFakeAuthority({ 'revision:i': 'image/png', 'revision:d': 'application/pdf' })
  const textBytes = enc('gemini turn one text')
  const pngBytes = new Uint8Array([137, 80, 78, 71, 9, 8, 7])
  const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64')

  it('replays turn-1 attachments on the turn-1 user content for a text-only turn-2 follow-up', () => {
    const db = createConversation('gemini', [
      { text: 'one', attachments: [textAttachment('asset:t', 'revision:t', sha(textBytes))] }, { text: 'two' }])
    try {
      const { body } = compileGemini(db, 'operation:2', { attachmentBlobStore: blobStoreFor({ 'revision:t': textBytes }) })
      expect(body.contents).toEqual([
        { role: 'user', parts: [{ text: 'question 1' }, { text: 'gemini turn one text' }] },
        { role: 'model', parts: [{ text: 'answer 1' }] },
        { role: 'user', parts: [{ text: 'question 2' }] },
      ])
    } finally { db.close() }
  })

  it('rebuilds multiple prior turns from per-turn slices of the cumulative artifacts, each with its own attachments', () => {
    const db = createConversation('gemini', [
      { text: 'one', attachments: [textAttachment('asset:t', 'revision:t', sha(textBytes))] },
      { text: 'two', attachments: [textAttachment('asset:i', 'revision:i', sha(pngBytes), true, 'image_reference', 'none')] },
      { text: 'three' }])
    try {
      const { body, history } = compileGemini(db, 'operation:3', {
        attachmentBlobStore: blobStoreFor({ 'revision:t': textBytes, 'revision:i': pngBytes }) })
      expect(body.contents).toEqual([
        { role: 'user', parts: [{ text: 'question 1' }, { text: 'gemini turn one text' }] },
        { role: 'model', parts: [{ text: 'answer 1' }] },
        { role: 'user', parts: [{ text: 'question 2' }, { inlineData: { mimeType: 'image/png', data: b64(pngBytes) } }] },
        { role: 'model', parts: [{ text: 'answer 2' }] },
        { role: 'user', parts: [{ text: 'question 3' }] },
      ])
      expect(history.historicalTurnAttachments.map((turn) => [turn.answerRootId, turn.replayIndex])).toEqual([['answer:1', 0], ['answer:2', 2]])
    } finally { db.close() }
  })

  it('replays included attachments only; excluded ones are never sent', () => {
    const excluded = enc('gemini excluded')
    const db = createConversation('gemini', [
      { text: 'one', attachments: [
        textAttachment('asset:x', 'revision:x', sha(excluded), false),
        textAttachment('asset:t', 'revision:t', sha(textBytes))] },
      { text: 'two' }])
    try {
      const { body, history } = compileGemini(db, 'operation:2', {
        attachmentBlobStore: blobStoreFor({ 'revision:t': textBytes, 'revision:x': excluded }) })
      expect(authoritySpy!.mock.calls.map((call) => (call[1] as unknown as { assetRevisionId: { value: string } }).assetRevisionId.value)).toEqual(['revision:t'])
      expect(JSON.stringify(body)).not.toContain('gemini excluded')
      const replayed = history.historicalTurnAttachments[0].attachments
      expect(replayed).toHaveLength(1)
      expect((replayed[0] as unknown as { assetRevisionId: { value: string } }).assetRevisionId.value).toBe('revision:t')
    } finally { db.close() }
  })

  it('replays a converted PDF and fails loudly on an unsupported prior-turn attachment', () => {
    const pdf = enc('%PDF-1.4 fake')
    const converted = createConversation('gemini', [
      { text: 'one', attachments: [textAttachment('asset:d', 'revision:d', sha(pdf), true, 'converted_document', 'pdf')] }, { text: 'two' }])
    try {
      const { body } = compileGemini(converted, 'operation:2', { attachmentBlobStore: blobStoreFor({ 'revision:d': pdf }) })
      expect((body.contents[0] as { parts: unknown[] }).parts).toEqual([
        { text: 'question 1' }, { inlineData: { mimeType: 'application/pdf', data: b64(pdf) } }])
    } finally { converted.close() }
    const unsupported = createConversation('gemini', [{ text: 'one', attachments: [urlAttachment('image', 'https://example.test/p.png')] }, { text: 'two' }])
    try {
      expect(() => compileGemini(unsupported, 'operation:2', { attachmentBlobStore: blobStoreFor({}) }))
        .toThrow('GENERATION_V2_GEMINI_COMPILER_SEMANTIC_REJECTED')
    } finally { unsupported.close() }
  })

  it('does not mutate persisted snapshots, messages, artifacts or assets while replaying', () => {
    const db = createConversation('gemini', [{ text: 'one', attachments: [textAttachment('asset:t', 'revision:t', sha(textBytes))] }, { text: 'two' }])
    try {
      const before = persistedState(db)
      const first = compileGemini(db, 'operation:2', { attachmentBlobStore: blobStoreFor({ 'revision:t': textBytes }) })
      const second = compileGemini(db, 'operation:2', { attachmentBlobStore: blobStoreFor({ 'revision:t': textBytes }) })
      expect(persistedState(db)).toBe(before)
      expect(second.prepared.body.copyUtf8Text()).toBe(first.prepared.body.copyUtf8Text())
      expect(first.history.historicalTurnAttachments.every((turn) => turn.answerRootId !== 'answer:2')).toBe(true)
    } finally { db.close() }
  })
})

describe('Gemini tool continuation with an attachment-bearing originating turn', () => {
  useFakeAuthority({ 'revision:i': 'image/png', 'revision:p': 'application/pdf' })
  const textBytes = enc('continuation file text')
  const pngBytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3])
  const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64')
  const pdfBytes = new Uint8Array([37, 80, 68, 70, 1])
  const store = () => blobStoreFor({ 'revision:t': textBytes, 'revision:i': pngBytes, 'revision:x': enc('excluded'), 'revision:p': pdfBytes })
  const revisionsRead = () => authoritySpy!.mock.calls.map((c) => (c[1] as unknown as { assetRevisionId: { value: string } }).assetRevisionId.value)

  /** Completes requests 1..rounds-1 of the last turn as function-call rounds, leaving request `rounds` pending. */
  function toolConversation(turns: readonly Turn[], rounds: number) {
    const db = createConversation('gemini', turns)
    const op = `operation:${turns.length}`; const answer = `answer:${turns.length}`
    const cfg = config('gemini'); const capability = capabilityFor('gemini')
    const snapshotHash = (db.prepare('SELECT snapshot_hash AS hash FROM assistant_generation_snapshot_v2 WHERE operation_id=?').get(op) as { hash: string }).hash
    for (let seq = 1; seq <= rounds; seq++) {
      const at = 1_000 + seq * 10
      db.prepare(`INSERT INTO generation_request_v2 (operation_id, request_sequence, answer_root_id,
        snapshot_hash, provider_id, endpoint_profile_id, credential_scope_id, contract_id, model_id,
        effective_endpoint_id, capability_revision, continuation_command_fingerprint, compiler_ledger_json,
        compiler_ledger_hash, prepared_body_sha256, prepared_body_byte_length, state, created_at_ms, updated_at_ms)
        VALUES (?, ?, ?, ?, ?, ?, 'credential-scope:p', ?, ?, 'endpoint:x', ?, ?, ?, ?, ?, 2, 'prepared', ?, ?)`).run(
        op, seq, answer, snapshotHash, cfg.providerId, cfg.binding.endpointProfileId, cfg.contractId, cfg.modelId,
        capability.revision.value, seq === 1 ? null : HASH_A, ledger.canonicalJson, ledger.sha256, HASH_A, at, at)
      if (seq > 1) seedToolOutput(db, op, seq)
      if (seq === rounds) break
      db.prepare(`INSERT INTO generation_attempt_v2 VALUES (?, ?, 1, 'open', NULL, NULL, ?, NULL)`).run(op, seq, at + 1)
      db.prepare(`UPDATE generation_request_v2 SET state='streaming', updated_at_ms=? WHERE operation_id=? AND request_sequence=?`).run(at + 2, op, seq)
      if (seq === 1) db.prepare(`UPDATE generation_operation_v2 SET state='streaming', updated_at_ms=? WHERE operation_id=?`).run(at + 2, op)
      db.prepare(`UPDATE generation_attempt_v2 SET state='terminal', outcome_json='{"kind":"provider_completed"}',
        terminal_fingerprint=?, terminal_at_ms=? WHERE operation_id=? AND request_sequence=?`).run(HASH_A, at + 3, op, seq)
      db.prepare(`UPDATE generation_request_v2 SET state='completed', updated_at_ms=?, terminal_at_ms=? WHERE operation_id=? AND request_sequence=?`).run(at + 4, at + 4, op, seq)
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        const execution = new GenerationExecutionV2Repo(db).findOperationInTransaction(context, op)!
        const request = new GenerationRequestV2Repo(db).loadExistingForOperation(context, execution, seq)
        new GeminiGenerateContentNativeHistoryV2Repo(db).persistTerminalArtifact(context, execution, request,
          { role: 'model', parts: [{ functionCall: { name: 'lookup', args: { round: seq } } }] }, at + 5)
      })
    }
    return { db, op }
  }

  function seedToolOutput(db: BetterSqlite3.Database, op: string, seq: number) {
    db.prepare(`INSERT INTO generation_tool_output_v2 (operation_id, request_sequence, answer_root_id, output_index,
      tool_call_id, tool_id, content, is_error, side_effect_policy, confirmation_state, confirmed_at_ms, created_at_ms)
      VALUES (?, ?, ?, 0, ?, 'tool:lookup', ?, 0, 'none', 'not_required', NULL, 2000)`).run(
      op, seq, op.replace('operation', 'answer'), geminiFunctionCallAssociationKeyV2(seq - 1, 0, 'lookup'),
      JSON.stringify({ result: `r${seq - 1}` }))
  }

  function compileRound(db: BetterSqlite3.Database, op: string, seq: number) {
    return compileSeeded(db, op, seq)
  }
  function compileSeeded(db: BetterSqlite3.Database, op: string, seq: number) {
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
      const execution = new GenerationExecutionV2Repo(db).findOperationInTransaction(context, op)!
      const history = new GeminiGenerateContentNativeHistoryV2Repo(db).loadPersistedRequestHistory(context, op, seq)
      const prepared = compileGeminiGenerateContentPreparedRequestV2({ context, execution, history,
        attachmentRepo: new AttachmentAssetV2Repo(db, () => 10), attachmentBlobStore: store() })
      return { prepared, body: JSON.parse(prepared.body.copyUtf8Text()) as { contents: unknown[] } }
    })
  }
  const bothIncluded = () => [textAttachment('asset:t', 'revision:t', sha(textBytes)),
    textAttachment('asset:i', 'revision:i', sha(pngBytes), true, 'image_reference', 'none')]
  const question = { role: 'user', parts: [{ text: 'question 1' }, { text: 'continuation file text' },
    { inlineData: { mimeType: 'image/png', data: b64(pngBytes) } }] }
  const call = (round: number) => ({ role: 'model', parts: [{ functionCall: { name: 'lookup', args: { round } } }] })
  const response = (round: number) => ({ role: 'user', parts: [{ functionResponse: { name: 'lookup', response: { result: `r${round}` } } }] })

  it('keeps attachments on the originating question and functionResponse as its own content', () => {
    const { db, op } = toolConversation([{ text: 'one', attachments: bothIncluded() }], 2)
    try {
      expect(compileRound(db, op, 2).body.contents).toEqual([question, call(1), response(1)])
    } finally { db.close() }
  })

  it('does not duplicate or move attachments across multiple continuation rounds', () => {
    const { db, op } = toolConversation([{ text: 'one', attachments: bothIncluded() }], 3)
    try {
      const { body } = compileRound(db, op, 3)
      expect(body.contents).toEqual([question, call(1), response(1), call(2), response(2)])
      expect(JSON.stringify(body).split('continuation file text')).toHaveLength(2)
    } finally { db.close() }
  })

  it('sends included attachments only; excluded ones stay excluded through a continuation', () => {
    const { db, op } = toolConversation([{ text: 'one', attachments: [
      textAttachment('asset:x', 'revision:x', sha(enc('excluded')), false),
      textAttachment('asset:t', 'revision:t', sha(textBytes))] }], 2)
    try {
      const { body } = compileRound(db, op, 2)
      expect(JSON.stringify(body)).not.toContain('excluded')
      expect(body.contents[0]).toEqual({ role: 'user', parts: [{ text: 'question 1' }, { text: 'continuation file text' }] })
      expect(revisionsRead()).toEqual(['revision:t'])
    } finally { db.close() }
  })

  it('keeps prior-turn attachments on their own turn and the current turn on its question', () => {
    const { db, op } = toolConversation([
      { text: 'one', attachments: [textAttachment('asset:t', 'revision:t', sha(textBytes))] },
      { text: 'two', attachments: [textAttachment('asset:i', 'revision:i', sha(pngBytes), true, 'image_reference', 'none')] }], 2)
    try {
      expect(compileRound(db, op, 2).body.contents).toEqual([
        { role: 'user', parts: [{ text: 'question 1' }, { text: 'continuation file text' }] },
        { role: 'model', parts: [{ text: 'answer 1' }] },
        { role: 'user', parts: [{ text: 'question 2' }, { inlineData: { mimeType: 'image/png', data: b64(pngBytes) } }] },
        call(1), response(1)])
    } finally { db.close() }
  })

  it('is immutable, deterministic and resolves only frozen snapshot attachments', () => {
    const { db, op } = toolConversation([{ text: 'one', attachments: bothIncluded() }], 2)
    try {
      const before = persistedState(db)
      const first = compileSeeded(db, op, 2)
      const second = compileSeeded(db, op, 2)
      expect(persistedState(db)).toBe(before)
      expect(second.prepared.body.copyUtf8Text()).toBe(first.prepared.body.copyUtf8Text())
      expect(new Set(revisionsRead())).toEqual(new Set(['revision:t', 'revision:i']))
    } finally { db.close() }
  })

  it('keeps an excluded url_reference in the snapshot without blocking or reaching the wire', () => {
    const { db, op } = toolConversation([{ text: 'one', attachments: [
      urlAttachment('image', 'https://example.test/p.png', false), textAttachment('asset:t', 'revision:t', sha(textBytes))] }], 2)
    try {
      const { body } = compileRound(db, op, 2)
      expect(body.contents[0]).toEqual({ role: 'user', parts: [{ text: 'question 1' }, { text: 'continuation file text' }] })
      expect(JSON.stringify(body)).not.toContain('example.test')
      const stored = db.prepare('SELECT canonical_json AS j FROM assistant_generation_snapshot_v2 WHERE operation_id=?').get(op) as { j: string } | undefined
      if (stored) expect(stored.j).toContain('https://example.test/p.png')
    } finally { db.close() }
  })

  it('encodes PDF forms (provider_file and converted_document) through production validation', () => {
    const pdf = pdfBytes
    const { db, op } = toolConversation([{ text: 'one', attachments: [
      textAttachment('asset:p', 'revision:p', sha(pdf), true, 'provider_file', 'none'),
      textAttachment('asset:p2', 'revision:p', sha(pdf), true, 'converted_document', 'pdf')] }], 2)
    try {
      const inline = { inlineData: { mimeType: 'application/pdf', data: Buffer.from(pdf).toString('base64') } }
      expect((compileRound(db, op, 2).body.contents[0] as { parts: unknown[] }).parts)
        .toEqual([{ text: 'question 1' }, inline, inline])
    } finally { db.close() }
  })

  it('still fails loudly for an unsupported attachment on the originating turn', () => {
    const { db, op } = toolConversation([{ text: 'one', attachments: [urlAttachment('image', 'https://example.test/p.png')] }], 2)
    try {
      expect(() => compileRound(db, op, 2)).toThrow('GENERATION_V2_RESOLVED_CAPABILITY_VALUE_UNSUPPORTED')
    } finally { db.close() }
  })
})
