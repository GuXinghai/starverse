import BetterSqlite3 from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationConfigV2Repo } from '../../infra/db/repo/generationConfigV2Repo'
import { withSynchronousGenerationCommandFactsAuthorityV2 } from '../../infra/db/repo/generationCommandFactsAuthorityV2'
import { GenerationExecutionV2Repo } from '../../infra/db/repo/generationExecutionV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { RuntimeCapabilityV2Repo } from '../../infra/db/repo/runtimeCapabilityV2Repo'
import { GenerationV2Identity } from '../../src/next/generation-v2/domain/identityV2'
import { decodeDeepSeekPlainTextInitialSendCommandV2 } from '../../src/next/generation-v2/providers/deepseek/plainTextInitialSendCommandV2'
import { readVerifiedDeepSeekStableEndpointProfileV2 } from '../../src/next/generation-v2/providers/deepseek/stableEndpointProfileV2'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  leases: new WeakSet<object>(),
  scopes: new WeakSet<object>(),
}))

vi.mock('electron', () => ({ session: { defaultSession: { fetch: mocks.fetch } } }))
vi.mock('../credentials/epoch2RuntimeCredentialService', () => ({
  isEpoch2RuntimeCredentialLease: (value: unknown) =>
    Boolean(value && typeof value === 'object' && mocks.leases.has(value)),
  isEpoch2CredentialScopeBindingAuthority: (value: unknown) =>
    Boolean(value && typeof value === 'object' && mocks.scopes.has(value)),
}))

import { createDeepSeekStableModelEvidenceV2Service } from './deepSeekStableModelEvidenceV2Service'
import { withVerifiedDeepSeekStableGenerationAuthoritiesV2 } from './deepSeekStableGenerationAuthorityV2Service'
import { commitVerifiedDeepSeekPlainTextInitialSnapshotV2 } from './deepSeekPlainTextSnapshotCommitV2'

const profile = readVerifiedDeepSeekStableEndpointProfileV2()
const scope = 'credential-scope-v2:'.concat('a'.repeat(64)) as never
const modelId = GenerationV2Identity.create('model_id', 'deepseek-v4-pro')
const resolvedAt = '2026-07-17T12:00:00.000Z'

function response(): Response {
  const value = new Response(JSON.stringify({
    object: 'list', data: [{ id: modelId.value, object: 'model', owned_by: 'deepseek' }],
  }), { status: 200, headers: { 'content-type': 'application/json' } })
  return Object.freeze({
    status: 200,
    url: 'https://api.deepseek.com/models',
    headers: value.headers,
    body: value.body,
  }) as unknown as Response
}

function credentialService() {
  return {
    withCredential: async ({ consume }: { consume: (lease: never) => Promise<unknown> }) => {
      const state = { active: true }
      const lease = Object.freeze({
        trust: 'epoch2_runtime_credential_lease',
        usage: 'provider_transport_only',
        providerKey: 'deepseek',
        credential: 'sk-test',
        revision: 1,
        credentialScopeId: scope,
        assertCurrent: () => { if (!state.active) throw new Error('stale credential') },
      })
      mocks.leases.add(lease)
      try {
        const result = await consume(lease as never)
        lease.assertCurrent()
        return result
      } finally {
        state.active = false
        mocks.leases.delete(lease)
      }
    },
  } as never
}

function database(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, process.cwd())
  const graph = new ConversationGraphV2Repo(db)
  runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
    graph.createProject(context, { projectId: 'project:1', name: 'Project', createdAtMs: 1 })
    graph.createConversationAndDefaultBranch(context, {
      projectId: 'project:1', conversationId: 'conversation:1', branchId: 'branch:1',
      title: 'Conversation', branchName: 'Main', createdAtMs: 2,
    })
    graph.createConversationAndDefaultBranch(context, {
      projectId: 'project:1', conversationId: 'conversation:2', branchId: 'branch:2',
      title: 'Other Conversation', branchName: 'Main', createdAtMs: 2,
    })
  })
  return db
}

async function execute(input: Readonly<{
  db: BetterSqlite3.Database
  twice?: boolean
  abort?: boolean
  forgedBinding?: boolean
  factsConversationId?: string
  catchFacadeAfterWrite?: boolean
  commandModelId?: string
}>) {
  mocks.fetch.mockResolvedValueOnce(response())
  const graph = new ConversationGraphV2Repo(input.db)
  const config = new GenerationConfigV2Repo(input.db)
  const attachments = new AttachmentAssetV2Repo(input.db)
  const execution = new GenerationExecutionV2Repo(input.db)
  const capability = new RuntimeCapabilityV2Repo(input.db)
  const modelService = createDeepSeekStableModelEvidenceV2Service({
    db: input.db,
    credentialService: credentialService(),
    nowMs: () => 100,
  })
  return modelService.withRefreshedExactModelEvidence({
    expectedCredentialRevision: 1,
    expectedCredentialScopeId: scope,
    endpointProfile: profile,
    modelId,
    consume: (modelEvidence) => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(
      input.db,
      (context) => {
        const command = decodeDeepSeekPlainTextInitialSendCommandV2({
          operationId: 'operation:1', branchId: 'branch:1', expectedHeadMessageId: null,
          userBody: 'hello', modelId: input.commandModelId ?? modelId.value, commandAttachments: [],
        })
        const pending = graph.beginInitialTurn(context, {
          operationId: 'operation:1', branchId: 'branch:1', expectedHeadMessageId: null,
          questionId: 'question:1', answerRootId: 'answer:1', userBody: 'hello', createdAtMs: 3,
        })
        return withSynchronousGenerationCommandFactsAuthorityV2(
          context, config, attachments, input.factsConversationId ?? 'conversation:1', [], undefined,
          (commandFacts) => withVerifiedDeepSeekStableGenerationAuthoritiesV2({
            context,
            modelEvidence,
            commandFacts,
            operation: 'text',
            use: (authorities) => {
              if (input.catchFacadeAfterWrite) {
                const original = execution.insertOperationAndSnapshot.bind(execution)
                vi.spyOn(execution, 'insertOperationAndSnapshot').mockImplementation((...args) => {
                  original(...args)
                  throw new Error('after execution persistence')
                })
              }
              const commit = () => commitVerifiedDeepSeekPlainTextInitialSnapshotV2({
                context,
                executionRepo: execution,
                capabilityRepo: capability,
                pending,
                command,
                commandFacts,
                binding: input.forgedBinding ? {} as never : authorities.binding,
                capability: authorities.capability,
              })
              let first: ReturnType<typeof commit> | undefined
              if (input.catchFacadeAfterWrite) {
                try { first = commit() } catch { /* command caller cannot swallow a failed facade */ }
              } else {
                first = commit()
              }
              const second = input.twice ? commit() : undefined
              graph.commitInitialTurnProjection(context, pending)
              if (input.abort) throw new Error('abort snapshot commit')
              return { first: first!, second }
            },
          }),
        )
      },
    ),
  })
}

beforeEach(() => {
  mocks.fetch.mockReset()
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse(resolvedAt))
})

afterEach(() => vi.restoreAllMocks())

describe('DeepSeek plain-text initial snapshot commit V2', () => {
  it('atomically persists exact capability, snapshot, operation, chosen and head', async () => {
    const db = database()
    try {
      const result = await execute({ db })
      expect(result.first).toMatchObject({
        capabilityPersistence: 'created', executionPersistence: 'created',
        bundle: { operation: { actionKind: 'initial_send', state: 'committed' } },
      })
      const snapshot = new GenerationExecutionV2Repo(db).getOperation('operation:1').snapshot
      const persistedCapability = new RuntimeCapabilityV2Repo(db)
        .getBySnapshotHash(snapshot.capabilityBinding.snapshotHash.value)
      expect(snapshot.semanticIntent).toMatchObject({
        tools: { mode: 'disabled' }, attachments: [], web: { mode: 'disabled' },
        image: { mode: 'disabled' }, providerExtension: { kind: 'none' },
      })
      expect(snapshot.providerBinding).toMatchObject({
        providerId: { value: 'deepseek' }, modelId: { value: modelId.value }, operation: 'text',
      })
      expect(snapshot.capabilityBinding).toMatchObject({
        snapshotHash: persistedCapability.snapshotHash,
        capabilityRevision: persistedCapability.revision,
        evidenceDigest: persistedCapability.evidenceDigest,
        semanticFieldsDigest: persistedCapability.semanticFieldsDigest,
      })
      expect(db.prepare(`SELECT chosen_answer_root_id FROM branch_choice_v2
        WHERE branch_id='branch:1' AND question_id='question:1'`).get())
        .toEqual({ chosen_answer_root_id: 'answer:1' })
      expect(db.prepare("SELECT head_message_id FROM branch_v2 WHERE branch_id='branch:1'").get())
        .toEqual({ head_message_id: 'answer:1' })
    } finally { db.close() }
  })

  it('returns exact transaction-local persistence replay without creating duplicate records', async () => {
    const db = database()
    try {
      const result = await execute({ db, twice: true })
      expect(result.second).toMatchObject({
        capabilityPersistence: 'idempotent_replay', executionPersistence: 'idempotent_replay',
      })
      expect(db.prepare('SELECT count(*) AS count FROM runtime_capability_snapshot_v2').get())
        .toEqual({ count: 1 })
      expect(db.prepare('SELECT count(*) AS count FROM assistant_generation_snapshot_v2').get())
        .toEqual({ count: 1 })
      expect(db.prepare('SELECT count(*) AS count FROM generation_operation_v2').get())
        .toEqual({ count: 1 })
    } finally { db.close() }
  })

  it('rolls capability, graph, operation and snapshot back together', async () => {
    const db = database()
    try {
      await expect(execute({ db, abort: true })).rejects.toThrow('abort snapshot commit')
      for (const table of [
        'runtime_capability_snapshot_v2', 'assistant_generation_snapshot_v2',
        'generation_operation_v2', 'message_v2', 'branch_choice_v2',
      ]) {
        expect(db.prepare(`SELECT count(*) AS count FROM ${table}`).get()).toEqual({ count: 0 })
      }
      expect(db.prepare("SELECT head_message_id FROM branch_v2 WHERE branch_id='branch:1'").get())
        .toEqual({ head_message_id: null })
    } finally { db.close() }
  })

  it('rejects forged generation authority before persisting any command fact', async () => {
    const db = database()
    try {
      await expect(execute({ db, forgedBinding: true }))
        .rejects.toThrow('GENERATION_V2_DEEPSEEK_SNAPSHOT_COMMIT_INPUT_INVALID')
      expect(db.prepare('SELECT count(*) AS count FROM runtime_capability_snapshot_v2').get())
        .toEqual({ count: 0 })
      expect(db.prepare('SELECT count(*) AS count FROM generation_operation_v2').get())
        .toEqual({ count: 0 })
      expect(db.prepare('SELECT count(*) AS count FROM message_v2').get()).toEqual({ count: 0 })
    } finally { db.close() }
  })

  it('rejects cross-conversation command facts and rolls the pending graph back', async () => {
    const db = database()
    try {
      await expect(execute({ db, factsConversationId: 'conversation:2' }))
        .rejects.toThrow('GENERATION_V2_DEEPSEEK_SNAPSHOT_COMMIT_INPUT_INVALID')
      expect(db.prepare('SELECT count(*) AS count FROM runtime_capability_snapshot_v2').get())
        .toEqual({ count: 0 })
      expect(db.prepare('SELECT count(*) AS count FROM generation_operation_v2').get())
        .toEqual({ count: 0 })
      expect(db.prepare('SELECT count(*) AS count FROM message_v2').get()).toEqual({ count: 0 })
    } finally { db.close() }
  })

  it('rejects a branded command whose model differs from the verified binding', async () => {
    const db = database()
    try {
      await expect(execute({ db, commandModelId: 'deepseek-other' }))
        .rejects.toThrow('GENERATION_V2_DEEPSEEK_SNAPSHOT_COMMIT_INPUT_INVALID')
      for (const table of [
        'runtime_capability_snapshot_v2', 'assistant_generation_snapshot_v2',
        'generation_operation_v2', 'message_v2', 'branch_choice_v2',
      ]) {
        expect(db.prepare(`SELECT count(*) AS count FROM ${table}`).get()).toEqual({ count: 0 })
      }
    } finally { db.close() }
  })

  it('forces rollback when a caller catches a facade failure after persistence', async () => {
    const db = database()
    try {
      await expect(execute({ db, catchFacadeAfterWrite: true }))
        .rejects.toThrow('GENERATION_V2_DEEPSEEK_SNAPSHOT_COMMIT_AUTHORITY_INVALID')
      for (const table of [
        'runtime_capability_snapshot_v2', 'assistant_generation_snapshot_v2',
        'generation_operation_v2', 'message_v2', 'branch_choice_v2',
      ]) {
        expect(db.prepare(`SELECT count(*) AS count FROM ${table}`).get()).toEqual({ count: 0 })
      }
    } finally { db.close() }
  })
})
