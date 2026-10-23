import path from 'node:path'
import { createHash } from 'node:crypto'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
// Approved Generation V2 main-process boundary fixture imports.
import {
  canonicalizeUnverifiedRuntimeCapabilitySnapshotV2,
  decodeRuntimeCapabilitySnapshotV2,
} from '../../src/core/generation-v2/capability/runtimeCapabilitySnapshotV2'
import { MODEL_CAPABILITY_SEMANTIC_PATHS_V2 as RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2 } from '../../src/core/generation-v2/capability/modelCapabilitySchemaV2'
import {
  canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2,
  decodeAssistantAnswerGenerationSnapshotV2,
} from '../../src/core/generation-v2/domain/assistantAnswerGenerationSnapshotV2'
import { readReviewedDeepSeekStableChatDefinitionV2 } from '../../src/core/generation-v2/contracts/providerContractRegistryV2'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { ConversationReadV2Repo } from '../../infra/db/repo/conversationReadV2Repo'
import { ConversationWorkspaceV2Repo } from '../../infra/db/repo/conversationWorkspaceV2Repo'
import {
  GenerationExecutionV2Repo,
  type GenerationExecutionOperationBundleV2,
} from '../../infra/db/repo/generationExecutionV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { GenerationNativeCompletionMaterializationPendingV2Error } from './generationNativeCompletionV2'
import { GenerationOperationRuntimeRegistryV2 } from './generationOperationRuntimeRegistryV2'
import { readGenerationRecoveryBranchRestrictionsV2, recoverGenerationOrphansV2 } from './generationOrphanRecoveryV2'
import { registerGenerationV2WorkspaceIpc } from '../ipc/generationV2WorkspaceIpc'
import type { IpcInvokeHandler } from '../ipc/types'
import { readRegenerateSourceAttachmentsV2 } from './regenerateSourceAttachmentsV2'
import { createSemanticConsumptionLedgerV2 } from '../../src/core/generation-v2/compiler/semanticConsumptionLedgerV2'

const HASH = 'a'.repeat(64)

function seedOrphanRequest(db: BetterSqlite3.Database, suffix: string, streaming: boolean) {
  const bundle = seedOperation(db, suffix)
  const emptyLedger = createSemanticConsumptionLedgerV2([{ kind: 'consumed', path: 'reasoning.mode',
    disposition: 'accepted_no_wire', nativeField: null, encodingKind: 'omitted', evidence: 'orphan fixture' }])
  db.prepare(`INSERT INTO generation_request_v2(operation_id,request_sequence,answer_root_id,snapshot_hash,
    provider_id,endpoint_profile_id,credential_scope_id,contract_id,model_id,effective_endpoint_id,
    capability_revision,compiler_ledger_json,compiler_ledger_hash,prepared_body_sha256,prepared_body_byte_length,
    continuation_command_fingerprint,state,created_at_ms,updated_at_ms,terminal_at_ms)
    VALUES(?,1,?,?,?,?,?,?,?,?,?,?,?,?,2,NULL,'prepared',20,20,NULL)`).run(
    bundle.operation.operationId.value, bundle.operation.targetAnswerId.value, bundle.snapshot.snapshotHash.value,
    'deepseek', 'profile:deepseek', 'credential-scope:1', bundle.snapshot.providerBinding.protocolContractId.value,
    'deepseek-chat', 'endpoint:deepseek', capability.revision.value,
    emptyLedger.canonicalJson, emptyLedger.sha256, HASH,
  )
  db.prepare('UPDATE message_v2 SET updated_at_ms=30 WHERE message_id=?').run(`answer:${suffix}`)
  if (streaming) {
    db.prepare(`INSERT INTO generation_attempt_v2 VALUES(?,1,1,'open',NULL,NULL,60,NULL)`).run(`operation:${suffix}`)
    db.prepare("UPDATE generation_request_v2 SET state='streaming',updated_at_ms=50 WHERE operation_id=?").run(`operation:${suffix}`)
    db.prepare("UPDATE generation_operation_v2 SET state='streaming',updated_at_ms=40 WHERE operation_id=?").run(`operation:${suffix}`)
  }
}

describe('orphan recovery isolation and clock rollback', () => {
  it.each([false, true])('recovers an interrupted request without decreasing any persisted timestamp (streaming=%s)', streaming => {
    const db = createDb()
    try {
      seedOrphanRequest(db, 'clock', streaming)
      expect(recoverGenerationOrphansV2(db, 1)).toEqual({ recovered: 1,
        operationIds: ['operation:clock'], unrecoveredOperationIds: [], failedOperationIds: [] })
      const at = streaming ? 60 : 30
      for (const table of ['generation_operation_v2', 'generation_request_v2']) {
        expect(db.prepare(`SELECT state,terminal_at_ms AS at FROM ${table} WHERE operation_id=?`)
          .get('operation:clock')).toEqual({ state: 'failed', at })
      }
      expect(db.prepare('SELECT status,updated_at_ms AS at FROM message_v2 WHERE message_id=?')
        .get('answer:clock')).toEqual({ status: 'failed', at })
      if (streaming) expect(db.prepare('SELECT state,terminal_at_ms AS at FROM generation_attempt_v2')
        .get()).toEqual({ state: 'terminal', at })
    } finally { db.close() }
  })

  it('preserves an incoherent operation while recovering an unrelated valid operation', () => {
    const db = createDb()
    try {
      seedOperation(db, 'broken')
      seedOrphanRequest(db, 'valid', false)
      expect(recoverGenerationOrphansV2(db, 1)).toEqual({ recovered: 1,
        operationIds: ['operation:valid'], unrecoveredOperationIds: ['operation:broken'], failedOperationIds: [] })
      expect(db.prepare('SELECT state FROM generation_operation_v2 WHERE operation_id=?')
        .get('operation:broken')).toEqual({ state: 'committed' })
      expect(db.prepare('SELECT status FROM message_v2 WHERE message_id=?')
        .get('answer:broken')).toEqual({ status: 'streaming' })
    } finally { db.close() }
  })

  it('isolates an undecodable frozen snapshot without rewriting it or aborting unrelated recovery', () => {
    const db = createDb()
    try {
      seedOperation(db, 'corrupt')
      seedOrphanRequest(db, 'valid', false)
      db.exec('DROP TRIGGER trg_assistant_generation_snapshot_v2_immutable')
      db.prepare("UPDATE assistant_generation_snapshot_v2 SET canonical_json='{}' WHERE operation_id=?").run('operation:corrupt')
      expect(recoverGenerationOrphansV2(db, 1)).toEqual({ recovered: 1,
        operationIds: ['operation:valid'], unrecoveredOperationIds: ['operation:corrupt'], failedOperationIds: [] })
      expect(db.prepare('SELECT canonical_json AS json FROM assistant_generation_snapshot_v2 WHERE operation_id=?')
        .get('operation:corrupt')).toEqual({ json: '{}' })
    } finally { db.close() }
  })

  it('does not hide database failures as isolated malformed operations', () => {
    const db = createDb()
    db.close()
    expect(() => recoverGenerationOrphansV2(db, 1)).toThrow()
  })

  it('isolates a mismatched request binding while preserving that row', () => {
    const db = createDb()
    try {
      seedOrphanRequest(db, 'broken', false)
      seedOrphanRequest(db, 'valid', false)
      db.exec('DROP TRIGGER trg_generation_request_v2_structure_immutable')
      db.prepare("UPDATE generation_request_v2 SET model_id='corrupted-model' WHERE operation_id=?").run('operation:broken')
      expect(recoverGenerationOrphansV2(db, 1)).toEqual({ recovered: 1,
        operationIds: ['operation:valid'], unrecoveredOperationIds: ['operation:broken'], failedOperationIds: [] })
      expect(db.prepare('SELECT model_id AS model,state FROM generation_request_v2 WHERE operation_id=?')
        .get('operation:broken')).toEqual({ model: 'corrupted-model', state: 'prepared' })
    } finally { db.close() }
  })

  it.each(['gemini_generate_content_native_history_v1', 'lmstudio_openresponses_native_items'])(
    'isolates malformed awaiting-tool history %s without rewriting its evidence', artifactKind => {
      const db = createDb()
      try {
        seedOrphanRequest(db, 'broken', true)
        seedOrphanRequest(db, 'valid', false)
        db.prepare(`UPDATE generation_attempt_v2 SET state='terminal',outcome_json='{"kind":"provider_completed"}',
          terminal_fingerprint=?,terminal_at_ms=70 WHERE operation_id=?`).run(HASH, 'operation:broken')
        db.prepare("UPDATE generation_request_v2 SET state='completed',updated_at_ms=70,terminal_at_ms=70 WHERE operation_id=?")
          .run('operation:broken')
        const malformedJson = JSON.stringify({ artifactKind, artifactCodecVersion: 1, artifactHash: HASH })
        db.prepare(`INSERT INTO generation_native_artifact_v2 VALUES(?,1,?,?,1,?,?,70,'request_terminal')`)
          .run('answer:broken', 'operation:broken', artifactKind, malformedJson, HASH)
        expect(recoverGenerationOrphansV2(db, 1)).toEqual({ recovered: 1,
          operationIds: ['operation:valid'], unrecoveredOperationIds: ['operation:broken'], failedOperationIds: [] })
        expect(db.prepare('SELECT artifact_json AS json FROM generation_native_artifact_v2 WHERE operation_id=?')
          .get('operation:broken')).toEqual({ json: malformedJson })
        expect(db.prepare('SELECT state FROM generation_operation_v2 WHERE operation_id=?')
          .get('operation:broken')).toEqual({ state: 'streaming' })
      } finally { db.close() }
    })

  // P2b-05 (+I4a-07), R2-06: a chunked artifact whose content chunk is missing
  // fails in the storage layer. It must not abort recovery or startup, and the
  // operation it belongs to must end as failed, releasing its branch lock,
  // while every row and the corrupt artifact stay as evidence.
  function seedCorruptAwaitingToolOperation(db: BetterSqlite3.Database, artifactKind: string): string {
    seedOrphanRequest(db, 'broken', true)
    db.prepare(`UPDATE generation_attempt_v2 SET state='terminal',outcome_json='{"kind":"provider_completed"}',
      terminal_fingerprint=?,terminal_at_ms=70 WHERE operation_id=?`).run(HASH, 'operation:broken')
    db.prepare("UPDATE generation_request_v2 SET state='completed',updated_at_ms=70,terminal_at_ms=70 WHERE operation_id=?")
      .run('operation:broken')
    const manifestJson = JSON.stringify({ artifactStorageVersion: 1, artifactKind, artifactCodecVersion: 1,
      artifactHash: HASH, rawByteLength: 2, rawSha256: HASH, chunkHashes: [HASH] })
    db.prepare(`INSERT INTO generation_native_artifact_v2 VALUES(?,1,?,?,1,?,?,70,'request_terminal')`)
      .run('answer:broken', 'operation:broken', artifactKind, manifestJson, HASH)
    return manifestJson
  }

  const evidence = (db: BetterSqlite3.Database) => ({
    request: db.prepare('SELECT state,terminal_at_ms AS at FROM generation_request_v2 WHERE operation_id=?').get('operation:broken'),
    attempt: db.prepare('SELECT state,outcome_json AS outcome FROM generation_attempt_v2 WHERE operation_id=?').get('operation:broken'),
    artifacts: db.prepare('SELECT * FROM generation_native_artifact_v2 WHERE operation_id=?').all('operation:broken'),
  })

  it.each(['anthropic_messages_native_history_v1'])(
    'P2b-05, R2-06: fails awaiting-tool history %s with a missing content chunk, keeps its evidence and recovers the rest',
    artifactKind => {
      const db = createDb()
      try {
        seedOrphanRequest(db, 'valid', false)
        const manifestJson = seedCorruptAwaitingToolOperation(db, artifactKind)
        const before = evidence(db)
        expect(recoverGenerationOrphansV2(db, 100)).toEqual({ recovered: 1, operationIds: ['operation:valid'],
          unrecoveredOperationIds: [], failedOperationIds: ['operation:broken'] })

        expect(db.prepare(`SELECT state,error_code AS code,error_message AS message,terminal_at_ms AS at
          FROM generation_operation_v2 WHERE operation_id=?`).get('operation:broken')).toEqual({ state: 'failed',
          code: 'GENERATION_V2_RECOVERY_ARTIFACT_CORRUPT', at: 100,
          message: 'A stored result of this generation is corrupt. The generation was stopped and its records were kept.' })
        expect(db.prepare('SELECT status FROM message_v2 WHERE message_id=?').get('answer:broken'))
          .toEqual({ status: 'failed' })
        // The branch lock is the partial unique index over committed/streaming operations.
        expect(db.prepare(`SELECT count(*) AS n FROM generation_operation_v2
          WHERE branch_id=? AND state IN ('committed','streaming')`).get('branch:broken')).toEqual({ n: 0 })
        expect(evidence(db)).toEqual(before)
        expect(db.prepare('SELECT artifact_json AS json FROM generation_native_artifact_v2 WHERE operation_id=?')
          .get('operation:broken')).toEqual({ json: manifestJson })

        // The conversation read shows the failure, not a completed answer.
        const answer = new ConversationReadV2Repo(db).readBranch('branch:broken').turns[0]!.answers[0]!
        expect(answer).toMatchObject({ status: 'failed', errorCode: 'GENERATION_V2_RECOVERY_ARTIFACT_CORRUPT' })

        // The unaffected operation was recovered as an ordinary interrupted stream.
        expect(db.prepare('SELECT state,error_code AS code FROM generation_operation_v2 WHERE operation_id=?')
          .get('operation:valid')).toEqual({ state: 'failed', code: 'stream_interrupted' })

        // A restart finds nothing left to recover and changes nothing.
        const afterFirst = db.prepare('SELECT * FROM generation_operation_v2 ORDER BY operation_id').all()
        expect(recoverGenerationOrphansV2(db, 200)).toEqual({ recovered: 0, operationIds: [],
          unrecoveredOperationIds: [], failedOperationIds: [] })
        expect(db.prepare('SELECT * FROM generation_operation_v2 ORDER BY operation_id').all()).toEqual(afterFirst)
        expect(evidence(db)).toEqual(before)
      } finally { db.close() }
    })

  // R2-06: an operation recovery cannot end safely keeps its lock, which
  // restricts only its own branch. The branch read reports that restriction.
  it('R2-06: restricts only the branch whose operation could not be ended and reports it through the branch read', async () => {
    const db = createDb()
    try {
      seedOrphanRequest(db, 'locked', true)
      db.prepare("UPDATE message_v2 SET status='failed' WHERE message_id=?").run('answer:locked')
      seedOrphanRequest(db, 'valid', false)
      const result = recoverGenerationOrphansV2(db, 100)
      expect(result).toEqual({ recovered: 1, operationIds: ['operation:valid'],
        unrecoveredOperationIds: ['operation:locked'], failedOperationIds: [] })
      const restriction = { scope: 'branch', code: 'GENERATION_V2_RECOVERY_STATE_INVALID' }
      const restrictions = readGenerationRecoveryBranchRestrictionsV2(db, result)
      expect([...restrictions]).toEqual([['branch:locked', restriction]])

      const handlers = new Map<string, IpcInvokeHandler>()
      registerGenerationV2WorkspaceIpc({ registerInvoke: (channel, handler) => handlers.set(channel, handler), db,
        branchIntegrityRestrictions: restrictions,
        runtimeRegistry: { runWithBranchQuiesced: async (_id, action) => action(),
          runWithConversationQuiesced: async (_id, action) => action(), runWithProjectQuiesced: async (_id, action) => action() } })
      const read = (branchId: string) => handlers.get('generation-v2:workspace:read-branch')!({},
        { branchId, beforeMessageId: null, limit: 50 })
      expect(await read('branch:locked')).toMatchObject({ ok: true,
        value: { branchId: 'branch:locked', integrityRestriction: restriction } })
      expect(await read('branch:valid')).toMatchObject({ ok: true,
        value: { branchId: 'branch:valid', integrityRestriction: null } })
      // The database lock still holds for the restricted branch only.
      const active = (branchId: string) => db.prepare(`SELECT count(*) AS n FROM generation_operation_v2
        WHERE branch_id=? AND state IN ('committed','streaming')`).get(branchId)
      expect(active('branch:locked')).toEqual({ n: 1 })
      expect(active('branch:valid')).toEqual({ n: 0 })
    } finally { db.close() }
  })

  it('R2-06: keeps a corrupt-artifact operation whose answer is no longer streaming, without terminalizing it', () => {
    const db = createDb()
    try {
      seedCorruptAwaitingToolOperation(db, 'anthropic_messages_native_history_v1')
      db.prepare("UPDATE message_v2 SET status='failed' WHERE message_id=?").run('answer:broken')
      const before = evidence(db)
      expect(recoverGenerationOrphansV2(db, 100)).toEqual({ recovered: 0, operationIds: [],
        unrecoveredOperationIds: ['operation:broken'], failedOperationIds: [] })
      expect(db.prepare('SELECT state,error_code AS code FROM generation_operation_v2 WHERE operation_id=?')
        .get('operation:broken')).toEqual({ state: 'streaming', code: null })
      expect(evidence(db)).toEqual(before)
    } finally { db.close() }
  })
})

function providerBinding() {
  const contract = readReviewedDeepSeekStableChatDefinitionV2()
  return {
    credentialScopeId: 'credential-scope:1',
    providerId: 'deepseek',
    endpointProfileId: 'profile:deepseek',
    endpointBinding: {
      kind: 'provider_managed_set' as const,
      endpointSetRevision: 'endpoint-set:1',
      descriptors: [{ endpointId: 'endpoint:deepseek', descriptorRevision: 'descriptor:1' }],
    },
    protocolContractId: contract.protocolContractId.value,
    contractRevision: contract.contractRevision.value,
    contractDefinitionDigest: contract.definitionDigest.value,
    registryRevision: contract.registryRevision.value,
    modelId: 'deepseek-chat',
    operation: 'text' as const,
  }
}

const capability = decodeRuntimeCapabilitySnapshotV2(
  canonicalizeUnverifiedRuntimeCapabilitySnapshotV2({
    schemaVersion: 2,
    resolvedAt: '2026-07-25T00:00:00.000Z',
    binding: providerBinding(),
    evidence: [{
      evidenceId: 'test.deepseek.supports',
      kind: 'official_documentation',
      effect: 'supports',
      sourceRef: 'https://api-docs.deepseek.com/api/create-chat-completion',
      verifiedAt: '2026-07-25T00:00:00.000Z',
      contentDigest: HASH,
    }],
    fields: RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2.map((field) => ({
      path: field,
      state: 'missing',
      constraints: [],
      evidenceIds: [],
    })),
    tools: [],
    continuation: { kind: 'none', evidenceIds: ['test.deepseek.supports'] },
  }),
)

function createDb() {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
  db.prepare(`INSERT INTO runtime_capability_snapshot_v2
    VALUES (?, ?, 2, ?, ?, ?, 1)`).run(
    capability.snapshotHash.value,
    capability.revision.value,
    capability.canonicalJson,
    capability.evidenceDigest.value,
    capability.semanticFieldsDigest.value,
  )
  const graph = new ConversationGraphV2Repo(db)
  runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
    graph.createProject(context, { projectId: 'project:1', name: 'Project', createdAtMs: 1 })
  })
  return db
}

function snapshotJson(operationId: string, answerId: string, conversationId: string, attachments: readonly unknown[] = []) {
  return decodeAssistantAnswerGenerationSnapshotV2(
    canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({
      schemaVersion: 2,
      answerRootId: answerId,
      operationId,
      semanticIntent: {
        schemaVersion: 2,
        generation: {},
        reasoning: { mode: 'disabled' },
        web: { mode: 'disabled' },
        image: { mode: 'disabled' },
        tools: { mode: 'disabled' },
        attachments,
        providerExtension: { kind: 'none' },
      },
      resolvedConfigRevisions: [
        { ownerKind: 'global', ownerId: 'global', revision: 'config:global:1' },
        { ownerKind: 'project', ownerId: 'project:1', revision: 'config:project:1' },
        { ownerKind: 'conversation', ownerId: conversationId, revision: 'config:conversation:1' },
      ],
      providerBinding: providerBinding(),
      capabilityBinding: {
        capabilityRevision: capability.revision.value,
        evidenceDigest: capability.evidenceDigest.value,
        semanticFieldsDigest: capability.semanticFieldsDigest.value,
        snapshotHash: capability.snapshotHash.value,
      },
      attachmentProviderFileBindings: [],
      toolAuthority: { kind: 'none' },
    }),
  ).canonicalJson
}

function seedOperation(db: BetterSqlite3.Database, suffix: string, attachments: readonly unknown[] = []): GenerationExecutionOperationBundleV2 {
  const graph = new ConversationGraphV2Repo(db)
  const execution = new GenerationExecutionV2Repo(db)
  const conversationId = `conversation:${suffix}`
  const branchId = `branch:${suffix}`
  const operationId = `operation:${suffix}`
  const questionId = `question:${suffix}`
  const answerId = `answer:${suffix}`
  let bundle!: GenerationExecutionOperationBundleV2
  runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
    graph.createConversationAndDefaultBranch(context, {
      projectId: 'project:1',
      conversationId,
      branchId,
      title: suffix,
      branchName: null,
      createdAtMs: 2,
    })
    const pending = graph.beginInitialTurn(context, {
      operationId,
      branchId,
      expectedHeadMessageId: null,
      questionId,
      answerRootId: answerId,
      userBody: suffix,
      createdAtMs: 3,
    })
    bundle = execution.insertOperationAndSnapshot(context, {
      operationId,
      actionKind: 'initial_send',
      branchId,
      conversationId,
      questionId,
      sourceAnswerId: null,
      targetAnswerId: answerId,
      snapshot: snapshotJson(operationId, answerId, conversationId, attachments),
      commandFingerprint: HASH,
      createdAtMs: 3,
    }).bundle
    graph.commitInitialTurnProjection(context, pending)
  })
  return bundle
}

async function terminalizeOnAbort(input: Readonly<{
  db: BetterSqlite3.Database
  registry: GenerationOperationRuntimeRegistryV2
  signal: AbortSignal
  suffix: string
  order: string[]
}>): Promise<void> {
  if (!input.signal.aborted) {
    await new Promise<void>((resolve) => input.signal.addEventListener('abort', () => resolve(), { once: true }))
  }
  input.order.push(`aborted:${input.suffix}`)
  const execution = new GenerationExecutionV2Repo(input.db, () => 10)
  const graph = new ConversationGraphV2Repo(input.db)
  runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
    graph.terminalizeAssistantMessage(context, `answer:${input.suffix}`, 'cancelled', null, 10)
    execution.terminalizeOperation(context, execution.findOperationInTransaction(
      context,
      `operation:${input.suffix}`,
    )!, {
      state: 'cancelled',
      errorCode: 'user_cancelled',
      errorMessage: 'Generation cancelled by user.',
    }, 10)
  })
  input.registry.publishPersistedProjection({
    type: 'terminal',
    operationId: `operation:${input.suffix}`,
    answerRootId: `answer:${input.suffix}`,
    state: 'cancelled',
    errorCode: 'user_cancelled',
    errorMessage: 'Generation cancelled by user.',
  })
}

describe('GenerationOperationRuntimeRegistryV2', () => {
  it('sources regenerate attachments from the immutable question snapshot, preserving full URL identity', () => {
    const db = createDb()
    try {
      const url = 'https://example.test/question.pdf'
      const attachment = { kind: 'url_reference', referenceId: 'url:question', referenceRevision: 'url-revision:question',
        originalUrl: url, urlDigest: createHash('sha256').update(url).digest('hex'), mediaKind: 'document',
        capturedAtMs: 1, provenance: 'user_supplied', include: true, sendAs: 'url_reference', conversion: 'none' }
      seedOperation(db, 'source', [attachment])
      seedOperation(db, 'other')
      const read = (branchId = 'branch:source', questionId = 'question:source') =>
        readRegenerateSourceAttachmentsV2({ db, sourceAnswerId: 'answer:source', sourceBranchId: branchId, questionId })
      expect(read()[0]).toMatchObject({ originalUrl: url, referenceId: { value: 'url:question' } })
      expect(read()).toHaveLength(1)
      expect(() => read('branch:other')).toThrow('GENERATION_V2_REGENERATE_SOURCE_INVALID')
      expect(() => read('branch:source', 'question:other')).toThrow('GENERATION_V2_REGENERATE_SOURCE_INVALID')
      expect(new GenerationExecutionV2Repo(db).getSnapshotByAnswerRootId('answer:source')?.semanticIntent.attachments)
        .toEqual(read())
    } finally { db.close() }
  })
  it('keeps interleaved operations bound to their persisted target answers with per-operation sequences', () => {
    const db = createDb()
    try {
      const first = seedOperation(db, 'one')
      const second = seedOperation(db, 'two')
      const registry = new GenerationOperationRuntimeRegistryV2(db, () => 10)
      registry.register({ kind: 'created', execution: first })
      registry.register({ kind: 'created', execution: second })
      registry.register({ kind: 'idempotent_replay', execution: first })
      expect(db.prepare(`SELECT use_count AS useCount FROM model_recents
        WHERE scope_type='global' AND scope_id='' AND provider_key='deepseek' AND model_id='deepseek-chat'`)
        .get()).toEqual({ useCount: 2 })
      expect(db.prepare('SELECT COUNT(*) AS count FROM model_recent_operation_v2').get()).toEqual({ count: 2 })
      const events: Array<Readonly<{ operationId: string; sequence: number }>> = []
      registry.subscribe((event) => events.push(event))

      const graph = new ConversationGraphV2Repo(db)
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        graph.compareAndSetStreamingAssistantBody(context, 'answer:one', '', 'one body', 4)
        graph.compareAndSetStreamingAssistantBody(context, 'answer:two', '', 'two body', 4)
      })
      registry.publishPersistedProjection({
        type: 'assistant_body',
        operationId: 'operation:two',
        answerRootId: 'answer:two',
        content: 'two body',
      })
      registry.publishPersistedProjection({
        type: 'assistant_body',
        operationId: 'operation:one',
        answerRootId: 'answer:one',
        content: 'one body',
      })
      registry.publishPersistedProjection({
        type: 'reasoning_detail',
        operationId: 'operation:one',
        answerRootId: 'answer:one',
        detail: { kind: 'reasoning', text: 'fact' },
      })

      expect(events.map(({ operationId, sequence }) => ({ operationId, sequence }))).toEqual([
        { operationId: 'operation:two', sequence: 1 },
        { operationId: 'operation:one', sequence: 1 },
        { operationId: 'operation:one', sequence: 2 },
      ])
      expect(registry.getSnapshot('operation:one')).toMatchObject({
        binding: {
          branchId: 'branch:one',
          targetAnswerId: 'answer:one',
        },
        body: 'one body',
        lastSequence: 2,
      })
      expect(registry.getSnapshot('operation:two')).toMatchObject({
        binding: {
          branchId: 'branch:two',
          targetAnswerId: 'answer:two',
        },
        body: 'two body',
        lastSequence: 1,
      })
    } finally {
      db.close()
    }
  })

  it('rejects identity conflicts and projections that were not persisted first', () => {
    const db = createDb()
    try {
      const first = seedOperation(db, 'one')
      seedOperation(db, 'two')
      const registry = new GenerationOperationRuntimeRegistryV2(db)
      registry.register({ kind: 'created', execution: first })
      expect(() => registry.publishPersistedProjection({
        type: 'assistant_body',
        operationId: 'operation:one',
        answerRootId: 'answer:two',
        content: '',
      })).toThrow('GENERATION_V2_RUNTIME_BINDING_CONFLICT')
      expect(() => registry.publishPersistedProjection({
        type: 'assistant_body',
        operationId: 'operation:one',
        answerRootId: 'answer:one',
        content: 'not persisted',
      })).toThrow('GENERATION_V2_RUNTIME_PROJECTION_NOT_PERSISTED')
    } finally {
      db.close()
    }
  })

  it('terminalizes the bound operation and answer when a runner rejects before persisting failure', async () => {
    const db = createDb()
    try {
      const execution = seedOperation(db, 'runner-failure')
      const registry = new GenerationOperationRuntimeRegistryV2(db, () => 10)
      const terminal = new Promise<void>((resolve) => {
        registry.subscribe((event) => {
          if (event.operationId === 'operation:runner-failure' && event.payload.type === 'terminal') resolve()
        })
      })

      expect(registry.start(
        { kind: 'created', execution },
        async () => { throw new Error('runner exploded') },
      )).toBe(true)
      await terminal

      expect(new GenerationExecutionV2Repo(db).getOperation('operation:runner-failure').operation)
        .toMatchObject({
          state: 'failed',
          errorCode: 'GENERATION_V2_RUNTIME_RUNNER_FAILED',
          errorMessage: 'runner exploded',
        })
      expect(db.prepare('SELECT status FROM message_v2 WHERE message_id=?')
        .get('answer:runner-failure')).toEqual({ status: 'failed' })
      expect(registry.getSnapshot('operation:runner-failure')).toMatchObject({
        status: 'failed',
        lastSequence: 1,
      })
    } finally {
      db.close()
    }
  })

  // P4a-01: when the native-completion receipt insert fails, the runner rethrows
  // a materialization-pending error with `receiptPersisted: false`. No receipt
  // exists to recover from, so the registry must end the operation as failed.
  it('P4a-01: terminalizes the operation when the completion receipt could not be persisted', async () => {
    const db = createDb()
    try {
      const execution = seedOperation(db, 'receipt-insert-failure')
      const registry = new GenerationOperationRuntimeRegistryV2(db, () => 10)
      expect(registry.start(
        { kind: 'created', execution },
        async () => { throw new GenerationNativeCompletionMaterializationPendingV2Error({ receiptPersisted: false }) },
      )).toBe(true)
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(new GenerationExecutionV2Repo(db).getOperation('operation:receipt-insert-failure').operation)
        .toMatchObject({ state: 'failed', errorCode: 'GENERATION_V2_NATIVE_COMPLETION_RECEIPT_PERSIST_FAILED' })
      expect(db.prepare('SELECT status FROM message_v2 WHERE message_id=?')
        .get('answer:receipt-insert-failure')).toEqual({ status: 'failed' })
      expect(registry.countActive()).toBe(0)
    } finally {
      db.close()
    }
  })

  describe('admission vs quiesce after commit (P2-8)', () => {
    const stateOf = (db: BetterSqlite3.Database, suffix: string) =>
      new GenerationExecutionV2Repo(db).getOperation(`operation:${suffix}`).operation.state

    it('runs a normally admitted operation and leaves no quiesce state behind', async () => {
      const db = createDb()
      try {
        const bundle = seedOperation(db, 'p28-normal')
        const registry = new GenerationOperationRuntimeRegistryV2(db, () => 10)
        let ran = false
        expect(registry.start({ kind: 'created', execution: bundle }, async () => { ran = true })).toBe(true)
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(ran).toBe(true)
        expect(stateOf(db, 'p28-normal')).toBe('committed')
        expect(registry.getSnapshot('operation:p28-normal')).not.toBeNull()
        await registry.runWithConversationQuiesced('conversation:p28-normal', () => undefined, 1_000)
      } finally { db.close() }
    })

    it('terminalizes a committed operation when quiesce began before registration, and releases the lock', async () => {
      const db = createDb()
      try {
        const bundle = seedOperation(db, 'p28-quiesce')
        const registry = new GenerationOperationRuntimeRegistryV2(db, () => 10)
        const run = vi.fn(async () => undefined)
        await registry.runWithConversationQuiesced('conversation:p28-quiesce', () => {
          // commit happened; quiesce is in force when registration is attempted
          expect(() => registry.start({ kind: 'created', execution: bundle }, run))
            .toThrow('GENERATION_V2_RUNTIME_CONVERSATION_QUIESCING')
        })
        await Promise.resolve()
        expect(run).not.toHaveBeenCalled()
        expect(stateOf(db, 'p28-quiesce')).toBe('failed')
        expect(db.prepare('SELECT status FROM message_v2 WHERE message_id=?')
          .get('answer:p28-quiesce')).toEqual({ status: 'failed' })
        expect(registry.countActive()).toBe(0)
        // quiesce state released: a fresh operation is admitted
        const next = seedOperation(db, 'p28-after')
        expect(registry.start({ kind: 'created', execution: next }, async () => undefined)).toBe(true)
      } finally { db.close() }
    })

    it('terminalizes when quiesce begins between commit and registration (branch and shutdown scopes)', async () => {
      const db = createDb()
      try {
        const branch = seedOperation(db, 'p28-branch')
        const registry = new GenerationOperationRuntimeRegistryV2(db, () => 10)
        const committed = Promise.resolve(branch) // commit resolved; start runs on a later tick
        const quiescing = registry.runWithBranchQuiesced('branch:p28-branch', async () => {
          await committed.then((execution) => {
            expect(() => registry.start({ kind: 'created', execution }, async () => undefined))
              .toThrow('GENERATION_V2_RUNTIME_BRANCH_QUIESCING')
          })
        })
        await quiescing
        expect(stateOf(db, 'p28-branch')).toBe('failed')

        const quit = seedOperation(db, 'p28-quit')
        await registry.quiesceForShutdown(100)
        expect(() => registry.start({ kind: 'created', execution: quit }, async () => undefined))
          .toThrow('GENERATION_V2_RUNTIME_SHUTTING_DOWN')
        expect(stateOf(db, 'p28-quit')).toBe('failed')
      } finally { db.close() }
    })

    it('leaves an idempotent replay untouched when admission is rejected', async () => {
      const db = createDb()
      try {
        const bundle = seedOperation(db, 'p28-replay')
        const registry = new GenerationOperationRuntimeRegistryV2(db, () => 10)
        await registry.runWithConversationQuiesced('conversation:p28-replay', () => {
          expect(() => registry.start({ kind: 'idempotent_replay', execution: bundle }, async () => undefined))
            .toThrow('GENERATION_V2_RUNTIME_CONVERSATION_QUIESCING')
        })
        expect(stateOf(db, 'p28-replay')).toBe('committed')
      } finally { db.close() }
    })

    it('does not touch the database after seal when registration fails', () => {
      const db = createDb()
      try {
        const bundle = seedOperation(db, 'p28-sealed')
        const registry = new GenerationOperationRuntimeRegistryV2(db, () => 10)
        registry.seal()
        expect(() => registry.start({ kind: 'created', execution: bundle }, async () => undefined))
          .toThrow('GENERATION_V2_RUNTIME_SHUTTING_DOWN')
        expect(stateOf(db, 'p28-sealed')).toBe('committed')
      } finally { db.close() }
    })
  })

  it('aborts and drains active operations before running a conversation-scoped action', async () => {
    const db = createDb()
    try {
      const bundle = seedOperation(db, 'delete')
      const registry = new GenerationOperationRuntimeRegistryV2(db, () => 10)
      const order: string[] = []
      expect(registry.start({ kind: 'created', execution: bundle }, (signal) => terminalizeOnAbort({
        db, registry, signal, suffix: 'delete', order,
      }))).toBe(true)

      await registry.runWithConversationQuiesced('conversation:delete', () => {
        order.push('delete')
        expect(registry.getSnapshot('operation:delete')?.status).toBe('cancelled')
        expect(() => registry.register({ kind: 'created', execution: bundle }))
          .toThrow('GENERATION_V2_RUNTIME_CONVERSATION_QUIESCING')
      })

      expect(order).toEqual(['aborted:delete', 'delete'])
      expect(registry.register({ kind: 'created', execution: bundle }).status).toBe('cancelled')
    } finally {
      db.close()
    }
  })

  it('aborts only the target branch before running a branch-scoped action', async () => {
    const db = createDb()
    try {
      const first = seedOperation(db, 'branch-one')
      const second = seedOperation(db, 'branch-two')
      const registry = new GenerationOperationRuntimeRegistryV2(db, () => 10)
      const order: string[] = []
      let finishSecond!: () => void
      const secondDone = new Promise<void>((resolve) => { finishSecond = resolve })
      expect(registry.start({ kind: 'created', execution: first }, (signal) => terminalizeOnAbort({
        db, registry, signal, suffix: 'branch-one', order,
      }))).toBe(true)
      expect(registry.start({ kind: 'created', execution: second }, async (signal) => {
        await terminalizeOnAbort({ db, registry, signal, suffix: 'branch-two', order })
        finishSecond()
      })).toBe(true)

      await registry.runWithBranchQuiesced('branch:branch-one', () => {
        order.push('mutate-branch')
        expect(registry.getSnapshot('operation:branch-one')?.status).toBe('cancelled')
        expect(registry.getSnapshot('operation:branch-two')?.status).toBe('generating')
        expect(() => registry.register({ kind: 'created', execution: first }))
          .toThrow('GENERATION_V2_RUNTIME_BRANCH_QUIESCING')
      })

      expect(order).toEqual(['aborted:branch-one', 'mutate-branch'])
      expect(registry.abort('operation:branch-two')).toBe(true)
      await secondDone
    } finally {
      db.close()
    }
  })

  it('rejects destructive branch mutations while an active generation remains', () => {
    const db = createDb()
    try {
      seedOperation(db, 'active-branch')
      const workspace = new ConversationWorkspaceV2Repo(db)
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        workspace.forkBranch(context, { sourceBranchId: 'branch:active-branch', branchId: 'branch:keep',
          headMessageId: 'answer:active-branch', name: null, createdAtMs: 4 })
      })

      expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        workspace.deleteBranch(context, { branchId: 'branch:active-branch', deletedAtMs: 5 })
      })).toThrow('GENERATION_V2_WORKSPACE_BRANCH_HAS_ACTIVE_GENERATION')
      expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        workspace.truncateBranchFromQuestion(context, { branchId: 'branch:active-branch',
          questionId: 'question:active-branch', expectedHeadMessageId: 'answer:active-branch', updatedAtMs: 5 })
      })).toThrow('GENERATION_V2_WORKSPACE_BRANCH_HAS_ACTIVE_GENERATION')
      expect(db.prepare(`SELECT head_message_id AS headMessageId,deleted_at_ms AS deletedAtMs
        FROM branch_v2 WHERE branch_id='branch:active-branch'`).get()).toEqual({
        headMessageId: 'answer:active-branch', deletedAtMs: null,
      })
    } finally {
      db.close()
    }
  })

  it('aborts and drains every active operation in a project before running the action', async () => {
    const db = createDb()
    try {
      const first = seedOperation(db, 'project-one')
      const second = seedOperation(db, 'project-two')
      const registry = new GenerationOperationRuntimeRegistryV2(db, () => 10)
      const order: string[] = []
      expect(registry.start({ kind: 'created', execution: first }, (signal) => terminalizeOnAbort({
        db, registry, signal, suffix: 'project-one', order,
      }))).toBe(true)
      expect(registry.start({ kind: 'created', execution: second }, (signal) => terminalizeOnAbort({
        db, registry, signal, suffix: 'project-two', order,
      }))).toBe(true)

      await registry.runWithProjectQuiesced('project:1', () => {
        order.push('delete-project')
        expect(registry.getSnapshot('operation:project-one')?.status).toBe('cancelled')
        expect(registry.getSnapshot('operation:project-two')?.status).toBe('cancelled')
        expect(() => registry.register({ kind: 'created', execution: first }))
          .toThrow('GENERATION_V2_RUNTIME_PROJECT_QUIESCING')
      })

      expect(order.slice(0, 2).sort()).toEqual(['aborted:project-one', 'aborted:project-two'])
      expect(order[2]).toBe('delete-project')
    } finally {
      db.close()
    }
  })

  it('fails closed without running the action when an aborted runner does not drain', async () => {
    const db = createDb()
    try {
      const bundle = seedOperation(db, 'stuck')
      const registry = new GenerationOperationRuntimeRegistryV2(db)
      expect(registry.start({ kind: 'created', execution: bundle }, async () =>
        new Promise<void>(() => undefined))).toBe(true)
      let actionCalled = false

      await expect(registry.runWithConversationQuiesced('conversation:stuck', () => {
        actionCalled = true
      }, 10)).rejects.toThrow('GENERATION_V2_RUNTIME_CONVERSATION_ABORT_TIMEOUT')
      expect(actionCalled).toBe(false)
    } finally {
      db.close()
    }
  })

  it('quiesces every active operation for app shutdown, rejects new work and seals late callbacks', async () => {
    const db = createDb()
    try {
      const bundle = seedOperation(db, 'quit')
      const registry = new GenerationOperationRuntimeRegistryV2(db, () => 10)
      const order: string[] = []
      expect(registry.countActive()).toBe(0)
      registry.start({ kind: 'created', execution: bundle }, (signal) => terminalizeOnAbort({
        db, registry, signal, suffix: 'quit', order,
      }))
      expect(registry.countActive()).toBe(1)
      await registry.quiesceForShutdown(1_000)
      expect(order).toEqual(['aborted:quit'])
      expect(registry.countActive()).toBe(0)
      const other = seedOperation(db, 'quit-late')
      expect(() => registry.register({ kind: 'created', execution: other }))
        .toThrow('GENERATION_V2_RUNTIME_SHUTTING_DOWN')
    } finally {
      db.close()
    }
  })

  // P4a-18: a runner failure whose terminalization itself throws must not
  // escape as an unhandled rejection in the main process.
  it('P4a-18: logs instead of rejecting when terminalizing a failed runner throws', async () => {
    const db = createDb()
    try {
      const bundle = seedOperation(db, 'terminalize-throws')
      const registry = new GenerationOperationRuntimeRegistryV2(db)
      let fail!: (error: Error) => void
      registry.start({ kind: 'created', execution: bundle }, () => new Promise<void>((_resolve, reject) => { fail = reject }))
      await vi.waitFor(() => expect(fail).toBeTypeOf('function'))
      const lookup = vi.spyOn(GenerationExecutionV2Repo.prototype, 'findOperation')
        .mockImplementation(() => { throw new Error('injected database failure') })
      const unhandled = vi.fn()
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
      process.once('unhandledRejection', unhandled)
      let loggedCalls: unknown[][]
      try {
        fail(new Error('runner failure'))
        await new Promise((resolve) => setTimeout(resolve, 20))
        loggedCalls = [...logged.mock.calls]
      } finally {
        process.off('unhandledRejection', unhandled)
        logged.mockRestore()
        lookup.mockRestore()
      }
      expect(unhandled).not.toHaveBeenCalled()
      expect(loggedCalls).toContainEqual(['[generation-runtime] GENERATION_V2_RUNTIME_TERMINALIZE_FAILED'])
    } finally { db.close() }
  })

  it('times out a stuck operation at shutdown and then ignores its late failure instead of writing to a closed db', async () => {
    const db = createDb()
    const bundle = seedOperation(db, 'late')
    const registry = new GenerationOperationRuntimeRegistryV2(db)
    let fail!: (error: Error) => void
    registry.start({ kind: 'created', execution: bundle }, () => new Promise<void>((_resolve, reject) => { fail = reject }))
    await expect(registry.quiesceForShutdown(10)).rejects.toThrow('GENERATION_V2_RUNTIME_SHUTDOWN_ABORT_TIMEOUT')
    registry.seal()
    db.close()
    const unhandled = vi.fn()
    process.once('unhandledRejection', unhandled)
    fail(new Error('late runner failure'))
    await new Promise((resolve) => setTimeout(resolve, 20))
    process.off('unhandledRejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
  })

  // P4b-04, P4a-19: a stream that ended awaiting a tool result has no runner
  // and, with tools disabled, no continuation. Stop, deletion quiesce and the
  // shutdown drain end it as cancelled instead of leaving it unstoppable.
  function endStreamAwaitingTool(db: BetterSqlite3.Database, suffix: string) {
    db.prepare(`UPDATE generation_attempt_v2 SET state='terminal',outcome_json='{"kind":"provider_completed"}',
      terminal_fingerprint=?,terminal_at_ms=70 WHERE operation_id=?`).run(HASH, `operation:${suffix}`)
    db.prepare("UPDATE generation_request_v2 SET state='completed',updated_at_ms=70,terminal_at_ms=70 WHERE operation_id=?")
      .run(`operation:${suffix}`)
  }
  const lockCount = (db: BetterSqlite3.Database, suffix: string) => db.prepare(`SELECT count(*) AS n
    FROM generation_operation_v2 WHERE branch_id=? AND state IN ('committed','streaming')`).get(`branch:${suffix}`)

  it('P4b-04: Stop cancels an operation left awaiting a tool result and releases its branch', () => {
    const db = createDb()
    try {
      seedOrphanRequest(db, 'tool', true)
      endStreamAwaitingTool(db, 'tool')
      const registry = new GenerationOperationRuntimeRegistryV2(db, () => 100)
      const events: unknown[] = []
      registry.subscribe((event) => events.push(event.payload))
      expect(registry.getSnapshot('operation:tool')?.status).toBe('generating')

      expect(registry.abort('operation:tool')).toBe(true)
      expect(db.prepare('SELECT state,error_code AS code,terminal_at_ms AS at FROM generation_operation_v2 WHERE operation_id=?')
        .get('operation:tool')).toEqual({ state: 'cancelled', code: 'user_cancelled', at: 100 })
      expect(db.prepare('SELECT status FROM message_v2 WHERE message_id=?').get('answer:tool')).toEqual({ status: 'cancelled' })
      expect(lockCount(db, 'tool')).toEqual({ n: 0 })
      expect(events).toEqual([expect.objectContaining({ type: 'terminal', state: 'cancelled', errorCode: 'user_cancelled' })])
      expect(registry.getSnapshot('operation:tool')?.status).toBe('cancelled')
      expect(registry.abort('operation:tool')).toBe(false)
    } finally { db.close() }
  })

  it('P4b-04: Stop leaves a prepared, streaming or receipt-pending operation to its own owner', () => {
    const db = createDb()
    try {
      seedOrphanRequest(db, 'prepared', false)
      seedOrphanRequest(db, 'streaming', true)
      const registry = new GenerationOperationRuntimeRegistryV2(db, () => 100)
      expect(registry.abort('operation:prepared')).toBe(false)
      expect(registry.abort('operation:streaming')).toBe(false)
      expect(registry.abort('operation:unknown')).toBe(false)
      expect(db.prepare(`SELECT operation_id AS id,state FROM generation_operation_v2 ORDER BY operation_id`).all())
        .toEqual([{ id: 'operation:prepared', state: 'committed' }, { id: 'operation:streaming', state: 'streaming' }])
    } finally { db.close() }
  })

  it('P4b-04: conversation quiesce cancels an awaiting-tool operation so deletion is not blocked', async () => {
    const db = createDb()
    try {
      seedOrphanRequest(db, 'tool-delete', true)
      endStreamAwaitingTool(db, 'tool-delete')
      seedOrphanRequest(db, 'tool-other', true)
      endStreamAwaitingTool(db, 'tool-other')
      // A fresh registry, as after a restart: the operation has no runtime entry.
      const registry = new GenerationOperationRuntimeRegistryV2(db, () => 100)
      let locked: unknown
      await registry.runWithConversationQuiesced('conversation:tool-delete', () => { locked = lockCount(db, 'tool-delete') }, 50)
      expect(locked).toEqual({ n: 0 })
      expect(lockCount(db, 'tool-other')).toEqual({ n: 1 })
    } finally { db.close() }
  })

  it('P4a-19: shutdown drains a runner that ends awaiting a tool result after the abort, without timing out', async () => {
    const db = createDb()
    try {
      seedOrphanRequest(db, 'tool-quit', true)
      const bundle = new GenerationExecutionV2Repo(db).findOperation('operation:tool-quit')!
      const registry = new GenerationOperationRuntimeRegistryV2(db, () => 100)
      const states: unknown[] = []
      registry.subscribe((event) => { if (event.payload.type === 'terminal') states.push(event.payload.state) })
      registry.start({ kind: 'created', execution: bundle }, async (signal) => {
        if (!signal.aborted) await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }))
        endStreamAwaitingTool(db, 'tool-quit')
        registry.publishPersistedProjection({ type: 'terminal', operationId: 'operation:tool-quit',
          answerRootId: 'answer:tool-quit', state: 'awaiting_tool', errorCode: null, errorMessage: null })
      })
      await registry.quiesceForShutdown(1_000)
      expect(states).toEqual(['awaiting_tool', 'cancelled'])
      expect(lockCount(db, 'tool-quit')).toEqual({ n: 0 })
    } finally { db.close() }
  })
})
