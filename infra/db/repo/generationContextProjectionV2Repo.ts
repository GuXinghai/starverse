import { createHash } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import { stableSerializeProviderRequestV2 } from '../../../src/next/generation-v2/compiler/stableSerialize'
import { decodeAssistantAnswerGenerationSnapshotJsonV2 } from '../../../src/next/generation-v2/domain/assistantAnswerGenerationSnapshotV2'
import { ConversationGraphV2Identity } from '../../../src/next/generation-v2/domain/conversationGraphV2'
import { GenerationV2Identity } from '../../../src/next/generation-v2/domain/identityV2'
import { BranchContextFilterV2Repo } from './branchContextFilterV2Repo'
import {
  assertGenerationV2AuthorityTransactionContextV2,
  type GenerationV2AuthorityTransactionContextV2,
} from './generationV2AuthorityTransactionInternal'

export class GenerationContextProjectionV2RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_CONTEXT_PROJECTION_INPUT_INVALID'
    | 'GENERATION_V2_CONTEXT_PROJECTION_STATE_INVALID'
    | 'GENERATION_V2_CONTEXT_PROJECTION_NOT_FOUND') {
    super(code)
    this.name = 'GenerationContextProjectionV2RepoError'
  }
}

export type GenerationContextProjectionTurnV2 = Readonly<{
  questionId: string
  answerRootId: string | null
  mode: 'included' | 'excluded'
}>
export type GenerationContextProjectionSnapshotV2 = Readonly<{
  schemaVersion: 1
  branchId: string
  operationId: string
  /** The reviewed provider contract that compiled this immutable projection. */
  providerContractId: string
  /** The exact reviewed contract revision, which is the V2 typed-codec identity. */
  codecId: string
  turns: readonly GenerationContextProjectionTurnV2[]
  includedMessageIds: readonly string[]
  projectionDigest: string
}>

type Row = Readonly<Record<string, unknown>>
function invalid(code: GenerationContextProjectionV2RepoError['code']): never {
  throw new GenerationContextProjectionV2RepoError(code)
}
function digest(value: unknown): string { return createHash('sha256').update(stableSerializeProviderRequestV2(value), 'utf8').digest('hex') }

export class GenerationContextProjectionV2Repo {
  constructor(private readonly db: BetterSqlite3.Database) {}

  captureForOperation(
    context: GenerationV2AuthorityTransactionContextV2,
    input: Readonly<{ operationId: string; branchId: string; conversationId: string; questionId: string; createdAtMs: number }>,
  ): GenerationContextProjectionSnapshotV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    const operationId = GenerationV2Identity.create('operation_id', input.operationId).value
    const branchId = ConversationGraphV2Identity.create('branch_id', input.branchId).value
    const conversationId = ConversationGraphV2Identity.create('conversation_id', input.conversationId).value
    const questionId = ConversationGraphV2Identity.create('question_id', input.questionId).value
    if (!Number.isSafeInteger(input.createdAtMs) || input.createdAtMs < 0) invalid('GENERATION_V2_CONTEXT_PROJECTION_INPUT_INVALID')
    const operation = this.db.prepare(`SELECT operation_id AS operationId FROM generation_operation_v2
      WHERE operation_id=? AND branch_id=? AND conversation_id=? AND question_id=?`).get(
      operationId, branchId, conversationId, questionId,
    ) as Row | undefined
    if (operation?.operationId !== operationId) invalid('GENERATION_V2_CONTEXT_PROJECTION_STATE_INVALID')
    const persistedSnapshot = this.db.prepare(`SELECT canonical_json AS canonicalJson
      FROM assistant_generation_snapshot_v2 WHERE operation_id=?`).get(operationId) as Row | undefined
    if (typeof persistedSnapshot?.canonicalJson !== 'string') {
      invalid('GENERATION_V2_CONTEXT_PROJECTION_STATE_INVALID')
    }
    let generationSnapshot: ReturnType<typeof decodeAssistantAnswerGenerationSnapshotJsonV2>
    try { generationSnapshot = decodeAssistantAnswerGenerationSnapshotJsonV2(persistedSnapshot.canonicalJson) } catch {
      return invalid('GENERATION_V2_CONTEXT_PROJECTION_STATE_INVALID')
    }
    if (generationSnapshot.operationId.value !== operationId) invalid('GENERATION_V2_CONTEXT_PROJECTION_STATE_INVALID')
    const rows = this.db.prepare(`WITH RECURSIVE lineage(message_id,parent_message_id,ordinal) AS (
      SELECT question.message_id,question.parent_message_id,question.ordinal FROM message_v2 AS question
      WHERE question.message_id=? AND question.conversation_id=? AND question.role='user'
      UNION ALL
      SELECT parent.message_id,parent.parent_message_id,parent.ordinal FROM message_v2 AS parent
      JOIN lineage AS child ON child.parent_message_id=parent.message_id
      WHERE parent.conversation_id=?
    )
    SELECT question.message_id AS questionId,choice.chosen_answer_root_id AS answerRootId,
      answer.status AS answerStatus,question.ordinal AS ordinal
    FROM lineage JOIN message_v2 AS question ON question.message_id=lineage.message_id
    LEFT JOIN branch_choice_v2 AS choice ON choice.branch_id=? AND choice.question_id=question.message_id
    LEFT JOIN message_v2 AS answer ON answer.message_id=choice.chosen_answer_root_id
    WHERE question.role='user' AND question.status='completed'
    ORDER BY question.ordinal ASC,question.message_id ASC`).all(questionId, conversationId, conversationId, branchId) as Row[]
    if (rows.length === 0) invalid('GENERATION_V2_CONTEXT_PROJECTION_STATE_INVALID')
    const current = rows[rows.length - 1]
    if (current.questionId !== questionId) invalid('GENERATION_V2_CONTEXT_PROJECTION_STATE_INVALID')
    const historical = rows.slice(0, -1).map((row) => {
      if (typeof row.questionId !== 'string' || typeof row.answerRootId !== 'string' ||
          !['completed', 'failed', 'cancelled'].includes(String(row.answerStatus))) {
        return invalid('GENERATION_V2_CONTEXT_PROJECTION_STATE_INVALID')
      }
      return Object.freeze({ questionId: row.questionId, chosenAnswerRootId: row.answerRootId })
    })
    if (current.answerRootId !== null && typeof current.answerRootId !== 'string') invalid('GENERATION_V2_CONTEXT_PROJECTION_STATE_INVALID')
    const filters = new BranchContextFilterV2Repo(this.db).readForTurns(branchId, historical)
    const turns = Object.freeze([
      ...historical.map((turn) => Object.freeze({ questionId: turn.questionId, answerRootId: turn.chosenAnswerRootId,
        mode: filters.get(turn.questionId)?.effectiveMode === 'exclude' ? 'excluded' as const : 'included' as const })),
      Object.freeze({ questionId, answerRootId: null, mode: 'included' as const }),
    ])
    const includedMessageIds = Object.freeze(turns.flatMap((turn) => turn.mode === 'included'
      ? turn.answerRootId === null ? [turn.questionId] : [turn.questionId, turn.answerRootId] : []))
    const draft = Object.freeze({
      schemaVersion: 1 as const,
      branchId,
      operationId,
      providerContractId: generationSnapshot.providerBinding.protocolContractId.value,
      codecId: generationSnapshot.providerBinding.contractRevision.value,
      turns,
      includedMessageIds,
    })
    const projectionDigest = digest(draft)
    const contextProjection = Object.freeze({ ...draft, projectionDigest })
    const canonicalJson = stableSerializeProviderRequestV2(contextProjection)
    this.db.prepare(`INSERT INTO generation_context_projection_v2(operation_id,branch_id,conversation_id,canonical_json,projection_digest,created_at_ms)
      VALUES(?,?,?,?,?,?)`).run(operationId, branchId, conversationId, canonicalJson, projectionDigest, input.createdAtMs)
    return contextProjection
  }

  load(
    context: GenerationV2AuthorityTransactionContextV2,
    operationIdValue: string,
  ): GenerationContextProjectionSnapshotV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    const operationId = GenerationV2Identity.create('operation_id', operationIdValue).value
    const row = this.db.prepare(`SELECT canonical_json AS canonicalJson,projection_digest AS projectionDigest
      FROM generation_context_projection_v2 WHERE operation_id=?`).get(operationId) as Row | undefined
    if (typeof row?.canonicalJson !== 'string' || typeof row.projectionDigest !== 'string') invalid('GENERATION_V2_CONTEXT_PROJECTION_NOT_FOUND')
    let value: unknown
    try { value = JSON.parse(row.canonicalJson) } catch { return invalid('GENERATION_V2_CONTEXT_PROJECTION_STATE_INVALID') }
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('GENERATION_V2_CONTEXT_PROJECTION_STATE_INVALID')
    const candidate = value as Record<string, unknown>
    if (Object.keys(candidate).sort().join('\0') !== 'branchId\0codecId\0includedMessageIds\0operationId\0projectionDigest\0providerContractId\0schemaVersion\0turns' ||
        candidate.schemaVersion !== 1 || candidate.operationId !== operationId || typeof candidate.branchId !== 'string' ||
        typeof candidate.providerContractId !== 'string' || typeof candidate.codecId !== 'string' ||
        !Array.isArray(candidate.turns) || !Array.isArray(candidate.includedMessageIds) || typeof candidate.projectionDigest !== 'string') {
      invalid('GENERATION_V2_CONTEXT_PROJECTION_STATE_INVALID')
    }
    try { ConversationGraphV2Identity.create('branch_id', candidate.branchId) } catch { return invalid('GENERATION_V2_CONTEXT_PROJECTION_STATE_INVALID') }
    const candidateTurns = candidate.turns as unknown[]
    const candidateIncludedMessageIds = candidate.includedMessageIds as unknown[]
    const turns = candidateTurns.map((turn, index) => {
      if (!turn || typeof turn !== 'object' || Array.isArray(turn) ||
          Object.keys(turn as Record<string, unknown>).sort().join('\0') !== 'answerRootId\0mode\0questionId') {
        return invalid('GENERATION_V2_CONTEXT_PROJECTION_STATE_INVALID')
      }
      const record = turn as Record<string, unknown>
      if (typeof record.questionId !== 'string' || (record.answerRootId !== null && typeof record.answerRootId !== 'string') ||
          (record.mode !== 'included' && record.mode !== 'excluded') || (index === candidateTurns.length - 1) !== (record.answerRootId === null)) {
        return invalid('GENERATION_V2_CONTEXT_PROJECTION_STATE_INVALID')
      }
      try {
        ConversationGraphV2Identity.create('question_id', record.questionId)
        if (record.answerRootId !== null) ConversationGraphV2Identity.create('answer_root_id', record.answerRootId)
      } catch { return invalid('GENERATION_V2_CONTEXT_PROJECTION_STATE_INVALID') }
      return Object.freeze({ questionId: record.questionId, answerRootId: record.answerRootId, mode: record.mode }) as GenerationContextProjectionTurnV2
    })
    if (turns.length === 0 || new Set(turns.map((turn) => turn.questionId)).size !== turns.length ||
        turns.slice(0, -1).some((turn) => turn.answerRootId === null) || turns[turns.length - 1].mode !== 'included') {
      invalid('GENERATION_V2_CONTEXT_PROJECTION_STATE_INVALID')
    }
    if (candidateIncludedMessageIds.some((id) => typeof id !== 'string') ||
        stableSerializeProviderRequestV2(candidateIncludedMessageIds) !== stableSerializeProviderRequestV2(
          turns.flatMap((turn) => turn.mode === 'included' ? turn.answerRootId === null ? [turn.questionId] : [turn.questionId, turn.answerRootId] : []))) {
      invalid('GENERATION_V2_CONTEXT_PROJECTION_STATE_INVALID')
    }
    const draft = {
      schemaVersion: 1 as const,
      branchId: candidate.branchId,
      operationId: candidate.operationId,
      providerContractId: candidate.providerContractId,
      codecId: candidate.codecId,
      turns,
      includedMessageIds: candidateIncludedMessageIds as string[],
    }
    const persistedSnapshot = this.db.prepare(`SELECT canonical_json AS canonicalJson
      FROM assistant_generation_snapshot_v2 WHERE operation_id=?`).get(operationId) as Row | undefined
    if (typeof persistedSnapshot?.canonicalJson !== 'string') invalid('GENERATION_V2_CONTEXT_PROJECTION_STATE_INVALID')
    let snapshot: ReturnType<typeof decodeAssistantAnswerGenerationSnapshotJsonV2>
    try { snapshot = decodeAssistantAnswerGenerationSnapshotJsonV2(persistedSnapshot.canonicalJson) } catch {
      return invalid('GENERATION_V2_CONTEXT_PROJECTION_STATE_INVALID')
    }
    if (snapshot.operationId.value !== operationId ||
        snapshot.providerBinding.protocolContractId.value !== draft.providerContractId ||
        snapshot.providerBinding.contractRevision.value !== draft.codecId) {
      invalid('GENERATION_V2_CONTEXT_PROJECTION_STATE_INVALID')
    }
    if (candidate.projectionDigest !== row.projectionDigest || candidate.projectionDigest !== digest(draft) ||
        stableSerializeProviderRequestV2(candidate) !== row.canonicalJson) invalid('GENERATION_V2_CONTEXT_PROJECTION_STATE_INVALID')
    return Object.freeze({ ...draft, projectionDigest: candidate.projectionDigest,
      turns: Object.freeze(turns), includedMessageIds: Object.freeze([...candidateIncludedMessageIds] as string[]) })
  }
}
