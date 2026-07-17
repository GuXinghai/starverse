import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import {
  canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2,
  decodeAssistantAnswerGenerationSnapshotV2,
} from '../../../src/next/generation-v2/domain/assistantAnswerGenerationSnapshotV2'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import { ConversationGraphV2Repo, isPendingInitialTurnV2 } from './conversationGraphV2Repo'
import { GenerationExecutionV2Repo } from './generationExecutionV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from './generationV2AuthorityTransactionInternal'

const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)
const HASH_C = 'c'.repeat(64)
const HASH_D = 'd'.repeat(64)

function createDb() {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
  return db
}

function snapshotJson(operationId: string, answerRootId: string) {
  const record = canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({
    schemaVersion: 2,
    answerRootId,
    operationId,
    semanticIntent: {
      schemaVersion: 2,
      generation: { temperature: 0.2 },
      reasoning: { mode: 'disabled' },
      web: { mode: 'disabled' },
      image: { mode: 'disabled' },
      tools: { mode: 'disabled' },
      attachments: [],
      providerExtension: { kind: 'none' },
    },
    resolvedConfigRevisions: [
      { ownerKind: 'global', ownerId: 'global', revision: 'config:global:1' },
      { ownerKind: 'project', ownerId: 'project:1', revision: 'config:project:1' },
      { ownerKind: 'conversation', ownerId: 'conversation:1', revision: 'config:conversation:1' },
    ],
    providerBinding: {
      credentialScopeId: 'credential-scope:1',
      providerId: 'deepseek',
      endpointProfileId: 'profile:deepseek',
      endpointBinding: {
        kind: 'provider_managed_set',
        endpointSetRevision: 'endpoint-set:1',
        descriptors: [{ endpointId: 'endpoint:deepseek', descriptorRevision: 'descriptor:1' }],
      },
      protocolContractId: 'deepseek-chat-v1',
      contractRevision: `deepseek-chat-v1:${HASH_A}`,
      contractDefinitionDigest: HASH_A,
      registryRevision: `provider-contract-registry-v1:${HASH_B}`,
      modelId: 'deepseek-chat',
      operation: 'text',
    },
    capabilityBinding: {
      capabilityRevision: 'capability:1',
      evidenceDigest: HASH_C,
      semanticFieldsDigest: HASH_D,
    },
    attachmentProviderFileBindings: [],
    toolAuthority: { kind: 'none' },
  })
  return decodeAssistantAnswerGenerationSnapshotV2(record).canonicalJson
}

function seedContainer(db: BetterSqlite3.Database, graph: ConversationGraphV2Repo) {
  runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
    graph.createProject(context, { projectId: 'project:1', name: 'Project', createdAtMs: 1 })
    graph.createConversationAndDefaultBranch(context, {
      projectId: 'project:1',
      conversationId: 'conversation:1',
      branchId: 'branch:1',
      title: 'Conversation',
      branchName: 'Main',
      createdAtMs: 2,
    })
  })
}

function beginInput(overrides: Record<string, unknown> = {}) {
  return {
    operationId: 'operation:1',
    branchId: 'branch:1',
    expectedHeadMessageId: null,
    questionId: 'question:1',
    answerRootId: 'answer:1',
    userBody: 'hello',
    createdAtMs: 3,
    ...overrides,
  }
}

describe('ConversationGraphV2Repo dormant atomic graph authority', () => {
  it('commits initial question, streaming answer, operation, snapshot, chosen and head together', () => {
    const db = createDb()
    try {
      const graph = new ConversationGraphV2Repo(db)
      const execution = new GenerationExecutionV2Repo(db)
      seedContainer(db, graph)
      let pending: ReturnType<typeof graph.beginInitialTurn> | undefined
      const projection = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        pending = graph.beginInitialTurn(context, beginInput())
        expect(isPendingInitialTurnV2(pending)).toBe(true)
        execution.insertOperationAndSnapshot(context, {
          operationId: 'operation:1',
          actionKind: 'initial_send',
          branchId: 'branch:1',
          conversationId: 'conversation:1',
          questionId: 'question:1',
          targetAnswerRootId: null,
          resultAnswerRootId: 'answer:1',
          snapshot: snapshotJson('operation:1', 'answer:1'),
          createdAtMs: 3,
        })
        return graph.commitInitialTurnProjection(context, pending)
      })
      expect(isPendingInitialTurnV2(pending)).toBe(false)
      expect(projection.chosenAnswerRootId?.value).toBe('answer:1')
      expect(projection.headMessageId?.value).toBe('answer:1')
      expect(graph.getBranchProjection('branch:1', 'question:1')).toMatchObject({ deletedAtMs: null })
      expect(db.prepare('SELECT body_text AS body FROM message_body_v2 WHERE message_id=?').get('question:1'))
        .toEqual({ body: 'hello' })
      expect(db.prepare('SELECT status FROM message_v2 WHERE message_id=?').get('answer:1'))
        .toEqual({ status: 'streaming' })
    } finally { db.close() }
  })

  it('rolls the complete turn back when operation/snapshot is absent at pre-commit', () => {
    const db = createDb()
    try {
      const graph = new ConversationGraphV2Repo(db)
      seedContainer(db, graph)
      let pending: ReturnType<typeof graph.beginInitialTurn> | undefined
      expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        pending = graph.beginInitialTurn(context, beginInput())
        graph.commitInitialTurnProjection(context, pending)
      })).toThrow('GENERATION_V2_GRAPH_REPOSITORY_STATE_INVALID')
      expect(isPendingInitialTurnV2(pending)).toBe(false)
      expect(db.prepare('SELECT COUNT(*) AS count FROM message_v2').get()).toEqual({ count: 0 })
      expect(db.prepare('SELECT COUNT(*) AS count FROM branch_choice_v2').get()).toEqual({ count: 0 })
      expect(db.prepare('SELECT head_message_id AS head FROM branch_v2 WHERE branch_id=?').get('branch:1'))
        .toEqual({ head: null })
      expect(() => graph.getBranchProjection('branch:1', 'question:1'))
        .toThrow('GENERATION_V2_GRAPH_REPOSITORY_NOT_FOUND')
    } finally { db.close() }
  })

  it('rejects a stale branch head before creating any turn rows', () => {
    const db = createDb()
    try {
      const graph = new ConversationGraphV2Repo(db)
      seedContainer(db, graph)
      expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        graph.beginInitialTurn(context, beginInput({ expectedHeadMessageId: 'answer:stale' }))))
        .toThrow('GENERATION_V2_GRAPH_REPOSITORY_STALE_HEAD')
      expect(db.prepare('SELECT COUNT(*) AS count FROM message_v2').get()).toEqual({ count: 0 })
    } finally { db.close() }
  })

  it('rolls graph writes back when the operation snapshot identity conflicts', () => {
    const db = createDb()
    try {
      const graph = new ConversationGraphV2Repo(db)
      const execution = new GenerationExecutionV2Repo(db)
      seedContainer(db, graph)
      expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        graph.beginInitialTurn(context, beginInput())
        execution.insertOperationAndSnapshot(context, {
          operationId: 'operation:1',
          actionKind: 'initial_send',
          branchId: 'branch:1',
          conversationId: 'conversation:1',
          questionId: 'question:1',
          targetAnswerRootId: null,
          resultAnswerRootId: 'answer:1',
          snapshot: snapshotJson('operation:1', 'answer:different'),
          createdAtMs: 3,
        })
      })).toThrow('GENERATION_V2_EXECUTION_INPUT_INVALID')
      expect(db.prepare('SELECT COUNT(*) AS count FROM message_v2').get()).toEqual({ count: 0 })
      expect(db.prepare('SELECT COUNT(*) AS count FROM generation_operation_v2').get()).toEqual({ count: 0 })
    } finally { db.close() }
  })

  it('rolls back when the operation is attributed to another branch in the same conversation', () => {
    const db = createDb()
    try {
      const graph = new ConversationGraphV2Repo(db)
      const execution = new GenerationExecutionV2Repo(db)
      seedContainer(db, graph)
      db.prepare('INSERT INTO branch_v2 VALUES (?, ?, NULL, ?, ?, ?, NULL)')
        .run('branch:2', 'conversation:1', 'Other', 2, 2)
      expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        const pending = graph.beginInitialTurn(context, beginInput())
        execution.insertOperationAndSnapshot(context, {
          operationId: 'operation:1',
          actionKind: 'initial_send',
          branchId: 'branch:2',
          conversationId: 'conversation:1',
          questionId: 'question:1',
          targetAnswerRootId: null,
          resultAnswerRootId: 'answer:1',
          snapshot: snapshotJson('operation:1', 'answer:1'),
          createdAtMs: 3,
        })
        graph.commitInitialTurnProjection(context, pending)
      })).toThrow('GENERATION_V2_GRAPH_REPOSITORY_STATE_INVALID')
      expect(db.prepare('SELECT COUNT(*) AS count FROM message_v2').get()).toEqual({ count: 0 })
      expect(db.prepare('SELECT COUNT(*) AS count FROM generation_operation_v2').get()).toEqual({ count: 0 })
      expect(db.prepare('SELECT head_message_id AS head FROM branch_v2 WHERE branch_id=?').get('branch:1'))
        .toEqual({ head: null })
    } finally { db.close() }
  })

  it('keeps public projection reads outside live authority transactions', () => {
    const db = createDb()
    try {
      const graph = new ConversationGraphV2Repo(db)
      seedContainer(db, graph)
      expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, () =>
        graph.getBranchProjection('branch:1', 'question:1')))
        .toThrow('GENERATION_V2_GRAPH_REPOSITORY_STATE_INVALID')
    } finally { db.close() }
  })
})
