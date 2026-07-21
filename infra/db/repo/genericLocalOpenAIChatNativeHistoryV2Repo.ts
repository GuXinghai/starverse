import type BetterSqlite3 from 'better-sqlite3'
import { createGenericLocalOpenAIChatArtifactV1, decodeGenericLocalOpenAIChatArtifactV1,
  type GenericLocalOpenAIChatArtifactV1, type GenericLocalOpenAIChatMessageV1 } from '../../../src/next/generation-v2/providers/generic-local-openai-chat/nativeMessagesV1'
import { stableSerializeProviderRequestV2 } from '../../../src/next/generation-v2/compiler/stableSerialize'
import { assertGenerationV2AuthorityTransactionContextV2, registerGenerationV2AuthorityTransactionParticipantV2,
  type GenerationV2AuthorityTransactionContextV2 } from './generationV2AuthorityTransactionInternal'
import { isGenerationExecutionOperationBundleForContextV2, type GenerationExecutionOperationBundleV2 } from './generationExecutionV2Repo'
import { isGenerationRequestRepositoryFactForContextV2, type GenerationRequestRepositoryFactV2 } from './generationRequestV2Repo'
import { GenerationContextProjectionV2Repo } from './generationContextProjectionV2Repo'

const ARTIFACT_KIND = 'generic_local_openai_chat_messages'
export type GenericLocalOpenAIChatRequestHistoryFactV2 = Readonly<{
  replayMessages: readonly GenericLocalOpenAIChatMessageV1[]
  systemBody: string | null
}>

const facts = new WeakSet<object>()
const factContexts = new WeakMap<object, GenerationV2AuthorityTransactionContextV2>()
export function isGenericLocalOpenAIChatRequestHistoryFactForContextV2(
  value: unknown,
  context: GenerationV2AuthorityTransactionContextV2,
): value is GenericLocalOpenAIChatRequestHistoryFactV2 {
  return Boolean(value && typeof value === 'object' && facts.has(value) && factContexts.get(value) === context)
}

export class GenericLocalOpenAIChatNativeHistoryV2Repo {
  constructor(private readonly db: BetterSqlite3.Database) {}
  #systemForQuestion(conversationId: string, questionId: string): string | null {
    const rows = this.db.prepare(`WITH RECURSIVE lineage(message_id,parent_message_id) AS (
      SELECT message_id,parent_message_id FROM message_v2 WHERE message_id=? AND conversation_id=?
      UNION ALL SELECT parent.message_id,parent.parent_message_id FROM message_v2 AS parent
      JOIN lineage AS child ON child.parent_message_id=parent.message_id WHERE parent.conversation_id=?
    ) SELECT body.body_text AS body FROM lineage JOIN message_v2 AS message ON message.message_id=lineage.message_id
      JOIN message_body_v2 AS body ON body.message_id=message.message_id WHERE message.role='system'`).all(
      questionId, conversationId, conversationId,
    ) as readonly Readonly<Record<string, unknown>>[]
    if (rows.length > 1 || (rows.length === 1 && typeof rows[0].body !== 'string')) {
      throw new Error('GENERATION_V2_GENERIC_LOCAL_HISTORY_STATE_INVALID')
    }
    return rows.length === 0 ? null : rows[0].body as string
  }
  #completeTurnMessages(context: GenerationV2AuthorityTransactionContextV2, answerRootId: string): readonly GenericLocalOpenAIChatMessageV1[] {
    const row = this.db.prepare(`SELECT artifact.artifact_json AS artifactJson, artifact.artifact_hash AS artifactHash,
      operation.operation_id AS operationId, operation.question_id AS questionId, questionBody.body_text AS questionBody
      FROM generation_native_artifact_v2 AS artifact
      JOIN generation_request_v2 AS request ON request.operation_id=artifact.operation_id AND request.request_sequence=artifact.request_sequence
        AND request.answer_root_id=artifact.answer_root_id
      JOIN generation_operation_v2 AS operation ON operation.operation_id=artifact.operation_id
      JOIN message_v2 AS answer ON answer.message_id=artifact.answer_root_id
      JOIN message_body_v2 AS questionBody ON questionBody.message_id=operation.question_id
      WHERE artifact.answer_root_id=? AND artifact.artifact_kind=? AND artifact.completion_scope='operation_terminal'
        AND request.state='completed' AND operation.state='completed' AND answer.status='completed'
      ORDER BY artifact.request_sequence DESC LIMIT 1`).get(answerRootId, ARTIFACT_KIND) as Readonly<Record<string, unknown>> | undefined
    if (!row || typeof row.artifactJson !== 'string' || typeof row.artifactHash !== 'string' ||
        typeof row.operationId !== 'string' || typeof row.questionId !== 'string' || typeof row.questionBody !== 'string') {
      throw new Error('CONTEXT_TURN_NATIVE_BUNDLE_INCOMPLETE')
    }
    let artifact: GenericLocalOpenAIChatArtifactV1
    try { artifact = decodeGenericLocalOpenAIChatArtifactV1(JSON.parse(row.artifactJson)) } catch {
      throw new Error('CONTEXT_TURN_NATIVE_BUNDLE_INCOMPLETE')
    }
    const projection = new GenerationContextProjectionV2Repo(this.db).load(context, row.operationId)
    const current = projection.turns.at(-1)
    const user = artifact.messages.at(-2)
    const assistant = artifact.messages.at(-1)
    if (artifact.artifactHash !== row.artifactHash || current?.questionId !== row.questionId || current.answerRootId !== null ||
        current.mode !== 'included' || user?.role !== 'user' || user.content !== row.questionBody || assistant?.role !== 'assistant') {
      throw new Error('CONTEXT_TURN_NATIVE_BUNDLE_INCOMPLETE')
    }
    return Object.freeze([user, assistant])
  }
  loadRequestHistory(context: GenerationV2AuthorityTransactionContextV2, operationId: string): GenericLocalOpenAIChatRequestHistoryFactV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    const row = this.db.prepare(`SELECT operation.branch_id AS branchId, operation.conversation_id AS conversationId,
      operation.question_id AS questionId, body.body_text AS userBody,
      request.provider_id AS providerId, request.contract_id AS contractId
      FROM generation_operation_v2 AS operation
      JOIN generation_request_v2 AS request ON request.operation_id=operation.operation_id AND request.request_sequence=1
      JOIN message_v2 AS question ON question.message_id=operation.question_id AND question.role='user'
      JOIN message_body_v2 AS body ON body.message_id=question.message_id WHERE operation.operation_id=?`).get(operationId) as Record<string, unknown> | undefined
    if (!row || typeof row.userBody !== 'string' || row.providerId !== 'generic_local' || row.contractId !== 'generic-local-openai-chat-completions') {
      throw new Error('GENERATION_V2_GENERIC_LOCAL_HISTORY_STATE_INVALID')
    }
    if (typeof row.branchId !== 'string' || typeof row.conversationId !== 'string' || typeof row.questionId !== 'string') {
      throw new Error('GENERATION_V2_GENERIC_LOCAL_HISTORY_STATE_INVALID')
    }
    const projection = new GenerationContextProjectionV2Repo(this.db).load(context, operationId)
    if (projection.branchId !== row.branchId) throw new Error('GENERATION_V2_GENERIC_LOCAL_HISTORY_STATE_INVALID')
    const replayMessages: GenericLocalOpenAIChatMessageV1[] = []
    const systemBody = this.#systemForQuestion(row.conversationId, row.questionId)
    if (systemBody !== null) replayMessages.push(Object.freeze({ role: 'system' as const, content: systemBody }))
    for (const turn of projection.turns) {
      if (turn.answerRootId === null) {
        if (turn.questionId !== row.questionId || turn.mode !== 'included') throw new Error('GENERATION_V2_GENERIC_LOCAL_HISTORY_STATE_INVALID')
        replayMessages.push(Object.freeze({ role: 'user' as const, content: row.userBody }))
      } else if (turn.mode === 'included') replayMessages.push(...this.#completeTurnMessages(context, turn.answerRootId))
    }
    if (replayMessages.at(-1)?.role !== 'user') throw new Error('GENERATION_V2_GENERIC_LOCAL_HISTORY_STATE_INVALID')
    const fact = Object.freeze({ replayMessages: createGenericLocalOpenAIChatArtifactV1(replayMessages).messages, systemBody })
    facts.add(fact)
    factContexts.set(fact, context)
    registerGenerationV2AuthorityTransactionParticipantV2(context, this.db, {
      preCommit: () => undefined,
      committed: () => { facts.delete(fact); factContexts.delete(fact) },
      rolledBack: () => { facts.delete(fact); factContexts.delete(fact) },
    })
    return fact
  }
  persistCompletedArtifact(input: Readonly<{ context: GenerationV2AuthorityTransactionContextV2;
    execution: GenerationExecutionOperationBundleV2; request: GenerationRequestRepositoryFactV2;
    requestMessages: readonly GenericLocalOpenAIChatMessageV1[]; assistantMessage: GenericLocalOpenAIChatMessageV1;
    createdAtMs: number }>): GenericLocalOpenAIChatArtifactV1 {
    assertGenerationV2AuthorityTransactionContextV2(input.context, this.db)
    const requestState = this.db.prepare(`SELECT state FROM generation_request_v2
      WHERE operation_id=? AND request_sequence=?`).get(input.request.operationId, input.request.requestSequence) as { state?: unknown } | undefined
    if (!isGenerationExecutionOperationBundleForContextV2(input.execution, input.context) ||
        !isGenerationRequestRepositoryFactForContextV2(input.request, input.context) ||
        input.execution.operation.state !== 'completed' || requestState?.state !== 'completed' ||
        input.execution.snapshot.providerBinding.protocolContractId.value !== 'generic-local-openai-chat-completions') {
      throw new Error('GENERATION_V2_GENERIC_LOCAL_HISTORY_STATE_INVALID')
    }
    const artifact = createGenericLocalOpenAIChatArtifactV1([...input.requestMessages, input.assistantMessage])
    const artifactJson = stableSerializeProviderRequestV2(artifact)
    const existing = this.db.prepare(`SELECT artifact_json AS artifactJson, artifact_hash AS artifactHash FROM generation_native_artifact_v2
      WHERE answer_root_id=? AND request_sequence=? AND artifact_kind=?`).get(input.request.answerRootId, input.request.requestSequence, ARTIFACT_KIND) as Record<string, unknown> | undefined
    if (existing) {
      if (existing.artifactJson !== artifactJson || existing.artifactHash !== artifact.artifactHash) throw new Error('GENERATION_V2_GENERIC_LOCAL_HISTORY_CONFLICT')
      return artifact
    }
    this.db.prepare(`INSERT INTO generation_native_artifact_v2 (answer_root_id, request_sequence, operation_id,
      artifact_kind, codec_version, artifact_json, artifact_hash, created_at_ms, completion_scope)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?, 'operation_terminal')`).run(input.request.answerRootId, input.request.requestSequence,
      input.request.operationId, ARTIFACT_KIND, artifactJson, artifact.artifactHash, input.createdAtMs)
    return artifact
  }
}
