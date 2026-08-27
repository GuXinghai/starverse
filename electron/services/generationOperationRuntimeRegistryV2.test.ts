import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
// Approved Generation V2 main-process boundary fixture imports.
// eslint-disable-next-line no-restricted-imports
import {
  canonicalizeUnverifiedRuntimeCapabilitySnapshotV2,
  decodeRuntimeCapabilitySnapshotV2,
} from '../../src/next/generation-v2/capability/runtimeCapabilitySnapshotV2'
import { MODEL_CAPABILITY_SEMANTIC_PATHS_V2 as RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2 } from '../../src/next/generation-v2/capability/modelCapabilitySchemaV2'
// eslint-disable-next-line no-restricted-imports
import {
  canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2,
  decodeAssistantAnswerGenerationSnapshotV2,
} from '../../src/next/generation-v2/domain/assistantAnswerGenerationSnapshotV2'
// eslint-disable-next-line no-restricted-imports
import { readReviewedDeepSeekStableChatDefinitionV2 } from '../../src/next/generation-v2/contracts/providerContractRegistryV2'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { ConversationWorkspaceV2Repo } from '../../infra/db/repo/conversationWorkspaceV2Repo'
import {
  GenerationExecutionV2Repo,
  type GenerationExecutionOperationBundleV2,
} from '../../infra/db/repo/generationExecutionV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { GenerationOperationRuntimeRegistryV2 } from './generationOperationRuntimeRegistryV2'

const HASH = 'a'.repeat(64)

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

function snapshotJson(operationId: string, answerId: string, conversationId: string) {
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
        attachments: [],
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

function seedOperation(db: BetterSqlite3.Database, suffix: string): GenerationExecutionOperationBundleV2 {
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
      snapshot: snapshotJson(operationId, answerId, conversationId),
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
})
