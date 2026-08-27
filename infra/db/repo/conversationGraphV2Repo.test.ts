import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import {
  canonicalizeUnverifiedRuntimeCapabilitySnapshotV2,
  decodeRuntimeCapabilitySnapshotV2,
} from '../../../src/next/generation-v2/capability/runtimeCapabilitySnapshotV2'
import { MODEL_CAPABILITY_SEMANTIC_PATHS_V2 as RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2 } from '../../../src/next/generation-v2/capability/modelCapabilitySchemaV2'
import {
  canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2,
  decodeAssistantAnswerGenerationSnapshotV2,
} from '../../../src/next/generation-v2/domain/assistantAnswerGenerationSnapshotV2'
import { readReviewedDeepSeekStableChatDefinitionV2 } from '../../../src/next/generation-v2/contracts/providerContractRegistryV2'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import { ConversationGraphV2Repo, isPendingInitialTurnV2 } from './conversationGraphV2Repo'
import { ComposerDraftV2Repo } from './composerDraftV2Repo'
import { GenerationExecutionV2Repo } from './generationExecutionV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from './generationV2AuthorityTransactionInternal'
import { SystemChatTemplateV2Repo } from './systemChatTemplateV2Repo'
import { ConversationRoutePreferenceV2Repo } from './conversationRoutePreferenceV2Repo'

const HASH_A = 'a'.repeat(64)

function providerBinding() {
  const contract = readReviewedDeepSeekStableChatDefinitionV2()
  return {
    credentialScopeId: 'credential-scope:1',
    providerId: 'deepseek',
    endpointProfileId: 'profile:deepseek',
    endpointBinding: {
      kind: 'provider_managed_set',
      endpointSetRevision: 'endpoint-set:1',
      descriptors: [{ endpointId: 'endpoint:deepseek', descriptorRevision: 'descriptor:1' }],
    },
    protocolContractId: contract.protocolContractId.value,
    contractRevision: contract.contractRevision.value,
    contractDefinitionDigest: contract.definitionDigest.value,
    registryRevision: contract.registryRevision.value,
    modelId: 'deepseek-chat',
    operation: 'text',
  }
}

const capability = decodeRuntimeCapabilitySnapshotV2(
  canonicalizeUnverifiedRuntimeCapabilitySnapshotV2({
    schemaVersion: 2,
    resolvedAt: '2026-07-17T12:00:00.000Z',
    binding: providerBinding(),
    evidence: [{
      evidenceId: 'test.deepseek.supports',
      kind: 'official_documentation',
      effect: 'supports',
      sourceRef: 'https://api-docs.deepseek.com/api/create-chat-completion',
      verifiedAt: '2026-07-17T00:00:00.000Z',
      contentDigest: HASH_A,
    }],
    fields: RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2.map((field) => ({
      path: field, state: 'missing', constraints: [], evidenceIds: [],
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
    capability.snapshotHash.value, capability.revision.value, capability.canonicalJson,
    capability.evidenceDigest.value, capability.semanticFieldsDigest.value,
  )
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
    providerBinding: providerBinding(),
    capabilityBinding: {
      capabilityRevision: capability.revision.value,
      evidenceDigest: capability.evidenceDigest.value,
      semanticFieldsDigest: capability.semanticFieldsDigest.value,
      snapshotHash: capability.snapshotHash.value,
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

function seedCompletedInitial(
  db: BetterSqlite3.Database,
  graph: ConversationGraphV2Repo,
  execution: GenerationExecutionV2Repo,
) {
  seedContainer(db, graph)
  runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
    const pending = graph.beginInitialTurn(context, beginInput())
    execution.insertOperationAndSnapshot(context, {
      operationId: 'operation:1',
      actionKind: 'initial_send',
      branchId: 'branch:1',
      conversationId: 'conversation:1',
      questionId: 'question:1',
      sourceAnswerId: null,
      targetAnswerId: 'answer:1',
      snapshot: snapshotJson('operation:1', 'answer:1'),
      commandFingerprint: HASH_A,
      createdAtMs: 3,
    })
    graph.commitInitialTurnProjection(context, pending)
    graph.terminalizeAssistantMessage(context, 'answer:1', 'completed', 'first answer', 4)
  })
  db.prepare(`UPDATE generation_operation_v2 SET state='cancelled',
    error_code='test_terminal',error_message='test terminal',updated_at_ms=4,terminal_at_ms=4
    WHERE operation_id='operation:1'`).run()
}

describe('ConversationGraphV2Repo dormant atomic graph authority', () => {
  it('promotes the hidden New Chat template and creates its successor in the initial-command transaction', () => {
    const db = createDb()
    try {
      const graph = new ConversationGraphV2Repo(db)
      const execution = new GenerationExecutionV2Repo(db)
      const templateRepo = new SystemChatTemplateV2Repo(db, () => 2)
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        graph.createProject(context, { projectId: 'project:1', name: 'Project', createdAtMs: 1 })
        templateRepo.ensure(context, {
          projectId: 'project:1', conversationId: 'conversation:1', branchId: 'branch:1', createdAtMs: 2,
        })
        new ConversationRoutePreferenceV2Repo(db, () => 2).upsert(context, {
          conversationId: 'conversation:1', expectedRevision: 0,
          selection: { schemaVersion: 1, kind: 'provider_model', providerId: 'deepseek', modelId: 'deepseek-v4-flash' },
        })
        templateRepo.setLifecycleSettings(context, {
          startupNavigation: 'open_new',
          startupTemplateReset: { modelConfig: false, draftAttachments: false },
          postSendTemplateReset: 'preserve_model_config',
        })
      })
      new ComposerDraftV2Repo(db, () => 3).updateText({
        conversationId: 'conversation:1', expectedRevision: 0, draftText: 'hello',
        draftMode: 'compose', editingSourceQuestionId: null,
      })

      const projection = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        const pending = graph.beginInitialTurn(context, beginInput())
        execution.insertOperationAndSnapshot(context, {
          operationId: 'operation:1', actionKind: 'initial_send', branchId: 'branch:1',
          conversationId: 'conversation:1', questionId: 'question:1', sourceAnswerId: null,
          targetAnswerId: 'answer:1', snapshot: snapshotJson('operation:1', 'answer:1'),
          commandFingerprint: HASH_A, createdAtMs: 3,
        })
        return graph.commitInitialTurnProjection(context, pending)
      })

      const next = templateRepo.get()
      expect(next.conversation.id).not.toBe('conversation:1')
      expect(next.conversation.branchId).not.toBe('branch:1')
      expect(next.draft).toMatchObject({ draftText: '', draftMode: 'compose', attachments: [] })
      expect(templateRepo.getLastFormalConversationId()).toBe('conversation:1')
      expect(new ConversationRoutePreferenceV2Repo(db).get(next.conversation.id)?.selection).toEqual({
        schemaVersion: 1, kind: 'provider_model', providerId: 'deepseek', modelId: 'deepseek-v4-flash',
      })
      expect(projection).toMatchObject({ branchId: { value: 'branch:1' }, headMessageId: { value: 'answer:1' } })
      expect(db.prepare(`SELECT COUNT(*) AS count FROM system_chat_template_v2
        WHERE conversation_id='conversation:1'`).get()).toEqual({ count: 0 })
    } finally { db.close() }
  })

  it('clears the route preference when the New Chat template model config is reset', () => {
    const db = createDb()
    try {
      const graph = new ConversationGraphV2Repo(db)
      const templateRepo = new SystemChatTemplateV2Repo(db, () => 3)
      const routeRepo = new ConversationRoutePreferenceV2Repo(db, () => 2)
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        graph.createProject(context, { projectId: 'project:1', name: 'Project', createdAtMs: 1 })
        templateRepo.ensure(context, {
          projectId: 'project:1', conversationId: 'conversation:1', branchId: 'branch:1', createdAtMs: 2,
        })
        routeRepo.upsert(context, { conversationId: 'conversation:1', expectedRevision: 0,
          selection: { schemaVersion: 1, kind: 'provider_model', providerId: 'openrouter', modelId: 'openai/gpt-4.1-mini' } })
      })

      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        templateRepo.reset(context, { templateConversationId: 'conversation:1', expectedTemplateRevision: 0,
          resetModelConfig: true, resetDraftAttachments: false })
      })

      expect(routeRepo.get('conversation:1')).toBeNull()
    } finally { db.close() }
  })

  it('rolls template promotion and successor creation back when initial-command precommit fails', () => {
    const db = createDb()
    try {
      const graph = new ConversationGraphV2Repo(db)
      const templateRepo = new SystemChatTemplateV2Repo(db, () => 2)
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        graph.createProject(context, { projectId: 'project:1', name: 'Project', createdAtMs: 1 })
        templateRepo.ensure(context, {
          projectId: 'project:1', conversationId: 'conversation:1', branchId: 'branch:1', createdAtMs: 2,
        })
      })
      new ComposerDraftV2Repo(db, () => 3).updateText({
        conversationId: 'conversation:1', expectedRevision: 0, draftText: 'hello',
        draftMode: 'compose', editingSourceQuestionId: null,
      })

      expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        const pending = graph.beginInitialTurn(context, beginInput())
        graph.commitInitialTurnProjection(context, pending)
      })).toThrow('GENERATION_V2_GRAPH_REPOSITORY_STATE_INVALID')

      expect(templateRepo.get().conversation).toMatchObject({ id: 'conversation:1', branchId: 'branch:1' })
      expect(templateRepo.getLastFormalConversationId()).toBeNull()
      expect(db.prepare('SELECT COUNT(*) AS count FROM conversation_v2').get()).toEqual({ count: 1 })
      expect(db.prepare('SELECT COUNT(*) AS count FROM message_v2').get()).toEqual({ count: 0 })
    } finally { db.close() }
  })

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
          sourceAnswerId: null,
          targetAnswerId: 'answer:1',
          snapshot: snapshotJson('operation:1', 'answer:1'),
          commandFingerprint: HASH_A,
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
          sourceAnswerId: null,
          targetAnswerId: 'answer:1',
          snapshot: snapshotJson('operation:1', 'answer:different'),
          commandFingerprint: HASH_A,
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
      db.prepare('INSERT INTO branch_v2 VALUES (?, ?, NULL, ?, ?, ?, NULL, NULL)')
        .run('branch:2', 'conversation:1', 'Other', 2, 2)
      expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        const pending = graph.beginInitialTurn(context, beginInput())
        execution.insertOperationAndSnapshot(context, {
          operationId: 'operation:1',
          actionKind: 'initial_send',
          branchId: 'branch:2',
          conversationId: 'conversation:1',
          questionId: 'question:1',
          sourceAnswerId: null,
          targetAnswerId: 'answer:1',
          snapshot: snapshotJson('operation:1', 'answer:1'),
          commandFingerprint: HASH_A,
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

  it('creates regenerate and edit-resend child branches without mutating the source route', () => {
    const db = createDb()
    try {
      const graph = new ConversationGraphV2Repo(db)
      const execution = new GenerationExecutionV2Repo(db)
      seedCompletedInitial(db, graph, execution)

      let regenerateBranch = ''
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        const pending = graph.beginAnswerAction(context, {
          operationId: 'operation:regenerate',
          actionKind: 'regenerate_question',
          sourceBranchId: 'branch:1',
          questionId: 'question:1',
          sourceAnswerId: 'answer:1',
          expectedHeadMessageId: 'answer:1',
          answerRootId: 'answer:regenerate',
          createdAtMs: 5,
        })
        regenerateBranch = pending.branchId.value
        execution.insertOperationAndSnapshot(context, {
          operationId: 'operation:regenerate',
          actionKind: 'regenerate_question',
          branchId: pending.branchId.value,
          conversationId: 'conversation:1',
          questionId: 'question:1',
          sourceAnswerId: 'answer:1',
          targetAnswerId: 'answer:regenerate',
          snapshot: snapshotJson('operation:regenerate', 'answer:regenerate'),
          commandFingerprint: HASH_A,
          createdAtMs: 5,
        })
        graph.commitAnswerActionProjection(context, pending)
      })

      let editBranch = ''
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        const pending = graph.beginEditedTurn(context, {
          operationId: 'operation:edit',
          sourceBranchId: 'branch:1',
          sourceQuestionId: 'question:1',
          sourceAnswerRootId: 'answer:1',
          expectedHeadMessageId: 'answer:1',
          questionId: 'question:edited',
          answerRootId: 'answer:edited',
          userBody: 'edited question',
          createdAtMs: 6,
        })
        editBranch = pending.branchId.value
        execution.insertOperationAndSnapshot(context, {
          operationId: 'operation:edit',
          actionKind: 'edit_resend',
          branchId: pending.branchId.value,
          conversationId: 'conversation:1',
          questionId: 'question:edited',
          sourceAnswerId: 'answer:1',
          targetAnswerId: 'answer:edited',
          snapshot: snapshotJson('operation:edit', 'answer:edited'),
          commandFingerprint: HASH_A,
          createdAtMs: 6,
        })
        graph.commitEditedTurnProjection(context, pending)
      })

      expect(graph.getBranchProjection('branch:1', 'question:1').headMessageId?.value).toBe('answer:1')
      expect(graph.getBranchProjection(regenerateBranch, 'question:1')).toMatchObject({
        headMessageId: { value: 'answer:regenerate' },
        chosenAnswerRootId: { value: 'answer:regenerate' },
      })
      expect(graph.getBranchProjection(editBranch, 'question:edited')).toMatchObject({
        headMessageId: { value: 'answer:edited' },
        chosenAnswerRootId: { value: 'answer:edited' },
      })
      expect(db.prepare(`SELECT parent_branch_id AS parentBranchId FROM branch_v2
        WHERE branch_id=?`).get(regenerateBranch)).toEqual({ parentBranchId: 'branch:1' })
      expect(db.prepare(`SELECT parent_branch_id AS parentBranchId FROM branch_v2
        WHERE branch_id=?`).get(editBranch)).toEqual({ parentBranchId: 'branch:1' })
      expect(db.prepare(`SELECT count(*) AS count FROM message_v2
        WHERE message_id IN ('question:1','answer:1')`).get()).toEqual({ count: 2 })
    } finally {
      db.close()
    }
  })

  it('retry-replace stays on the source branch and append-only hides the replaced answer', () => {
    const db = createDb()
    try {
      const graph = new ConversationGraphV2Repo(db)
      const execution = new GenerationExecutionV2Repo(db)
      seedCompletedInitial(db, graph, execution)
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        const pending = graph.beginAnswerAction(context, {
          operationId: 'operation:replace',
          actionKind: 'retry_replace',
          sourceBranchId: 'branch:1',
          questionId: 'question:1',
          sourceAnswerId: 'answer:1',
          expectedHeadMessageId: 'answer:1',
          answerRootId: 'answer:replace',
          createdAtMs: 5,
        })
        execution.insertOperationAndSnapshot(context, {
          operationId: 'operation:replace',
          actionKind: 'retry_replace',
          branchId: 'branch:1',
          conversationId: 'conversation:1',
          questionId: 'question:1',
          sourceAnswerId: 'answer:1',
          targetAnswerId: 'answer:replace',
          snapshot: snapshotJson('operation:replace', 'answer:replace'),
          commandFingerprint: HASH_A,
          createdAtMs: 5,
        })
        graph.commitAnswerActionProjection(context, pending)
      })

      expect(graph.getBranchProjection('branch:1', 'question:1')).toMatchObject({
        headMessageId: { value: 'answer:replace' },
        chosenAnswerRootId: { value: 'answer:replace' },
      })
      expect(db.prepare(`SELECT answer_root_id AS answerId FROM branch_answer_hide_v2
        WHERE branch_id='branch:1'`).all()).toEqual([{ answerId: 'answer:1' }])
      expect(db.prepare(`SELECT count(*) AS count FROM branch_v2`).get()).toEqual({ count: 1 })
    } finally {
      db.close()
    }
  })

  it('rejects retry-replace when an existing descendant still selects the source answer', () => {
    const db = createDb()
    try {
      const graph = new ConversationGraphV2Repo(db)
      const execution = new GenerationExecutionV2Repo(db)
      seedCompletedInitial(db, graph, execution)
      db.prepare(`INSERT INTO branch_v2(
        branch_id,conversation_id,head_message_id,name,created_at_ms,updated_at_ms,deleted_at_ms,parent_branch_id
      ) VALUES('branch:child','conversation:1','answer:1',NULL,5,5,NULL,'branch:1')`).run()

      expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        const pending = graph.beginAnswerAction(context, {
          operationId: 'operation:replace',
          actionKind: 'retry_replace',
          sourceBranchId: 'branch:1',
          questionId: 'question:1',
          sourceAnswerId: 'answer:1',
          expectedHeadMessageId: 'answer:1',
          answerRootId: 'answer:replace',
          createdAtMs: 6,
        })
        execution.insertOperationAndSnapshot(context, {
          operationId: 'operation:replace',
          actionKind: 'retry_replace',
          branchId: 'branch:1',
          conversationId: 'conversation:1',
          questionId: 'question:1',
          sourceAnswerId: 'answer:1',
          targetAnswerId: 'answer:replace',
          snapshot: snapshotJson('operation:replace', 'answer:replace'),
          commandFingerprint: HASH_A,
          createdAtMs: 6,
        })
        graph.commitAnswerActionProjection(context, pending)
      })).toThrow('GENERATION_V2_GRAPH_REPOSITORY_CONFLICT')

      expect(db.prepare(`SELECT count(*) AS count FROM message_v2
        WHERE message_id='answer:replace'`).get()).toEqual({ count: 0 })
      expect(db.prepare(`SELECT count(*) AS count FROM generation_operation_v2
        WHERE operation_id='operation:replace'`).get()).toEqual({ count: 0 })
      expect(graph.getBranchProjection('branch:1', 'question:1').headMessageId?.value).toBe('answer:1')
    } finally {
      db.close()
    }
  })
})
