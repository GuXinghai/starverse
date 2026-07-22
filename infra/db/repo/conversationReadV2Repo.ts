import type BetterSqlite3 from 'better-sqlite3'
import { ConversationGraphV2Identity } from '../../../src/next/generation-v2/domain/conversationGraphV2'
import { AnswerReasoningProjectionV2Repo } from './answerReasoningProjectionV2Repo'
import { BranchContextFilterV2Repo, type BranchTurnContextFilterV2 } from './branchContextFilterV2Repo'
import { decodeAssistantAnswerGenerationSnapshotJsonV2 } from '../../../src/next/generation-v2/domain/assistantAnswerGenerationSnapshotV2'

export class ConversationReadV2RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_CONVERSATION_READ_INPUT_INVALID'
    | 'GENERATION_V2_CONVERSATION_READ_NOT_FOUND'
    | 'GENERATION_V2_CONVERSATION_READ_STATE_INVALID') {
    super(code)
    this.name = 'ConversationReadV2RepoError'
  }
}

type Row = Readonly<Record<string, unknown>>
function time(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new ConversationReadV2RepoError('GENERATION_V2_CONVERSATION_READ_STATE_INVALID')
  return value as number
}
function string(value: unknown): string {
  if (typeof value !== 'string') throw new ConversationReadV2RepoError('GENERATION_V2_CONVERSATION_READ_STATE_INVALID')
  return value
}

export type ConversationBranchViewV2 = Readonly<{
  branchId: string
  conversationId: string
  projectId: string
  title: string
  branchName: string | null
  headMessageId: string | null
  turns: readonly Readonly<{
    questionId: string
    questionBody: string
    questionCreatedAtMs: number
    chosenAnswerRootId: string
    contextFilter: BranchTurnContextFilterV2
    answers: readonly Readonly<{
      answerRootId: string
      status: 'streaming' | 'completed' | 'failed' | 'cancelled'
      body: string
      createdAtMs: number
      updatedAtMs: number
      chosen: boolean
      operationId: string
      actionKind: 'initial_send' | 'edit_resend' | 'regenerate_question' | 'retry_as_new' | 'retry_replace'
      providerId: string
      modelId: string
      endpointProfileId: string
      protocolContractId: string
      errorCode: string | null
      errorMessage: string | null
      reasoningDetails: readonly Readonly<Record<string, unknown>>[]
      attachments: readonly (Readonly<{kind:'managed_file';assetId:string;assetRevisionId:string;assetSha256:string;include:boolean;
        sendAs:'provider_file'|'inline_text'|'image_reference'|'converted_document';conversion:'none'|'pdf'|'plain_text'|'images';
        filename:string;assetKind:'file'|'image';mime:string;sourceKind:'user_import'|'url_import'|'generated'|'derived'}>
        | Readonly<{kind:'url_reference';referenceId:string;referenceRevision:string;urlDigest:string;
          mediaKind:'image'|'document'|'audio'|'video'|'other';capturedAtMs:number;provenance:'user_supplied';
          include:boolean;sendAs:'url_reference';conversion:'none'}>)[]
      images: readonly Readonly<{ assetId: string; assetRevisionId: string; sha256: string; mime: string; storageRef: string }>[]
    }>[]
  }>[]
}>

export class ConversationReadV2Repo {
  constructor(private readonly db: BetterSqlite3.Database) {
    db.pragma('foreign_keys = ON')
    if (db.pragma('foreign_keys', { simple: true }) !== 1) {
      throw new ConversationReadV2RepoError('GENERATION_V2_CONVERSATION_READ_STATE_INVALID')
    }
  }

  listProjects(): readonly Readonly<{ projectId: string; name: string; createdAtMs: number; updatedAtMs: number }>[] {
    return Object.freeze((this.db.prepare(`SELECT project_id AS projectId, name, created_at_ms AS createdAtMs,
      updated_at_ms AS updatedAtMs FROM project_v2 ORDER BY updated_at_ms DESC, project_id ASC`).all() as Row[])
      .map((row) => Object.freeze({ projectId: string(row.projectId), name: string(row.name),
        createdAtMs: time(row.createdAtMs), updatedAtMs: time(row.updatedAtMs) })))
  }

  listConversations(projectIdValue: string): readonly Readonly<{
    conversationId: string; projectId: string; title: string; updatedAtMs: number
    branches: readonly Readonly<{ branchId: string; name: string | null; headMessageId: string | null; updatedAtMs: number }>[]
  }>[] {
    const projectId = ConversationGraphV2Identity.create('project_id', projectIdValue)
    const conversations = this.db.prepare(`SELECT conversation_id AS conversationId, project_id AS projectId,
      title, updated_at_ms AS updatedAtMs FROM conversation_v2 AS conversation WHERE project_id=?
      AND NOT EXISTS (SELECT 1 FROM system_chat_template_v2 AS template
        WHERE template.conversation_id=conversation.conversation_id)
      ORDER BY updated_at_ms DESC, conversation_id ASC`).all(projectId.value) as Row[]
    return Object.freeze(conversations.map((row) => {
      const conversationId = string(row.conversationId)
      const branches = (this.db.prepare(`SELECT branch_id AS branchId, name, head_message_id AS headMessageId,
        updated_at_ms AS updatedAtMs FROM branch_v2 WHERE conversation_id=? AND deleted_at_ms IS NULL
        ORDER BY updated_at_ms DESC, branch_id ASC`).all(conversationId) as Row[]).map((branch) => Object.freeze({
          branchId: string(branch.branchId), name: branch.name === null ? null : string(branch.name),
          headMessageId: branch.headMessageId === null ? null : string(branch.headMessageId), updatedAtMs: time(branch.updatedAtMs),
        }))
      return Object.freeze({ conversationId, projectId: string(row.projectId), title: string(row.title),
        updatedAtMs: time(row.updatedAtMs), branches: Object.freeze(branches) })
    }))
  }

  listQuestionCandidates(branchIdValue: string, baseMessageIdValue: string | null, limitValue: number): readonly Readonly<{
    questionId: string; createdAtMs: number; status: 'completed'
  }>[] {
    const branchId = ConversationGraphV2Identity.create('branch_id', branchIdValue)
    const baseMessageId = baseMessageIdValue === null ? null
      : ConversationGraphV2Identity.create('message_id', baseMessageIdValue).value
    if (!Number.isSafeInteger(limitValue) || limitValue < 1 || limitValue > 500) {
      throw new ConversationReadV2RepoError('GENERATION_V2_CONVERSATION_READ_INPUT_INVALID')
    }
    const branch = this.db.prepare(`SELECT conversation_id AS conversationId FROM branch_v2
      WHERE branch_id=? AND deleted_at_ms IS NULL`).get(branchId.value) as Row | undefined
    if (!branch || typeof branch.conversationId !== 'string') {
      throw new ConversationReadV2RepoError('GENERATION_V2_CONVERSATION_READ_NOT_FOUND')
    }
    const rows = this.db.prepare(`SELECT question.message_id AS questionId,
      question.created_at_ms AS createdAtMs,question.status
      FROM message_v2 AS question
      JOIN branch_choice_v2 AS choice ON choice.branch_id=? AND choice.question_id=question.message_id
      JOIN message_v2 AS chosen ON chosen.message_id=choice.chosen_answer_root_id
        AND chosen.conversation_id=question.conversation_id AND chosen.question_id=question.message_id
        AND chosen.role='assistant' AND chosen.answer_root_id=chosen.message_id
      LEFT JOIN branch_question_hide_v2 AS question_hidden
        ON question_hidden.branch_id=? AND question_hidden.question_id=question.message_id
      LEFT JOIN branch_answer_hide_v2 AS answer_hidden
        ON answer_hidden.branch_id=? AND answer_hidden.question_id=question.message_id
        AND answer_hidden.answer_root_id=chosen.message_id
      WHERE question.conversation_id=? AND question.role='user' AND question.status='completed'
        AND ((? IS NULL AND question.parent_message_id IS NULL) OR question.parent_message_id=?)
        AND question_hidden.question_id IS NULL AND answer_hidden.answer_root_id IS NULL
      ORDER BY question.created_at_ms DESC,question.ordinal DESC,question.message_id DESC LIMIT ?`).all(
      branchId.value, branchId.value, branchId.value, branch.conversationId,
      baseMessageId, baseMessageId, limitValue,
    ) as Row[]
    return Object.freeze(rows.map((row) => {
      if (row.status !== 'completed') throw new ConversationReadV2RepoError('GENERATION_V2_CONVERSATION_READ_STATE_INVALID')
      return Object.freeze({ questionId: string(row.questionId), createdAtMs: time(row.createdAtMs), status: 'completed' as const })
    }))
  }

  readBranch(branchIdValue: string): ConversationBranchViewV2 {
    const reasoningProjection = new AnswerReasoningProjectionV2Repo(this.db)
    const contextFilters = new BranchContextFilterV2Repo(this.db)
    const branchId = ConversationGraphV2Identity.create('branch_id', branchIdValue)
    const branch = this.db.prepare(`SELECT branch.branch_id AS branchId, branch.conversation_id AS conversationId,
      branch.name AS branchName, branch.head_message_id AS headMessageId, branch.deleted_at_ms AS deletedAtMs,
      conversation.project_id AS projectId, conversation.title AS title
      FROM branch_v2 AS branch JOIN conversation_v2 AS conversation
        ON conversation.conversation_id=branch.conversation_id WHERE branch.branch_id=?`).get(branchId.value) as Row | undefined
    if (!branch || branch.deletedAtMs !== null) throw new ConversationReadV2RepoError('GENERATION_V2_CONVERSATION_READ_NOT_FOUND')
    const conversationId = string(branch.conversationId)
    const questions = this.db.prepare(`WITH RECURSIVE lineage(message_id, parent_message_id, ordinal) AS (
      SELECT message_id, parent_message_id, ordinal FROM message_v2 WHERE message_id=? AND conversation_id=?
      UNION ALL
      SELECT parent.message_id, parent.parent_message_id, parent.ordinal FROM message_v2 AS parent
      JOIN lineage AS child ON child.parent_message_id=parent.message_id WHERE parent.conversation_id=?
    )
    SELECT question.message_id AS questionId, body.body_text AS questionBody, choice.chosen_answer_root_id AS chosenAnswerRootId,
      question.ordinal AS ordinal,question.created_at_ms AS questionCreatedAtMs FROM lineage JOIN message_v2 AS question ON question.message_id=lineage.message_id
      JOIN message_body_v2 AS body ON body.message_id=question.message_id
      JOIN branch_choice_v2 AS choice ON choice.branch_id=? AND choice.question_id=question.message_id
      LEFT JOIN branch_question_hide_v2 AS hidden ON hidden.branch_id=? AND hidden.question_id=question.message_id
      WHERE question.role='user' AND hidden.question_id IS NULL ORDER BY question.ordinal ASC`).all(
      branch.headMessageId, conversationId, conversationId, branchId.value, branchId.value,
    ) as Row[]
    const unresolvedTurns = questions.map((question) => {
      const questionId = string(question.questionId)
      let chosen: string
      try {
        chosen = ConversationGraphV2Identity.create('answer_root_id', string(question.chosenAnswerRootId)).value
      } catch {
        throw new ConversationReadV2RepoError('GENERATION_V2_CONVERSATION_READ_STATE_INVALID')
      }
      const answers = (this.db.prepare(`SELECT answer.answer_root_id AS answerRootId, answer.status,
        body.body_text AS body, answer.created_at_ms AS createdAtMs, answer.updated_at_ms AS updatedAtMs,
        operation.operation_id AS operationId,operation.action_kind AS actionKind,operation.error_code AS errorCode,
        operation.error_message AS errorMessage,request.provider_id AS providerId,request.model_id AS modelId,
        request.endpoint_profile_id AS endpointProfileId,request.contract_id AS protocolContractId,
        snapshot.canonical_json AS snapshotCanonicalJson
        FROM message_v2 AS answer JOIN message_body_v2 AS body ON body.message_id=answer.message_id
        JOIN generation_operation_v2 AS operation ON operation.result_answer_root_id=answer.message_id
        JOIN assistant_generation_snapshot_v2 AS snapshot ON snapshot.operation_id=operation.operation_id
        JOIN generation_request_v2 AS request ON request.operation_id=operation.operation_id AND request.request_sequence=1
        LEFT JOIN branch_answer_hide_v2 AS hidden ON hidden.branch_id=? AND hidden.question_id=answer.question_id
          AND hidden.answer_root_id=answer.answer_root_id
        WHERE answer.conversation_id=? AND answer.question_id=? AND answer.role='assistant'
          AND answer.answer_root_id=answer.message_id AND hidden.answer_root_id IS NULL
        ORDER BY answer.ordinal ASC, answer.answer_root_id ASC`).all(branchId.value, conversationId, questionId) as Row[])
        .map((answer) => {
          const answerRootId = string(answer.answerRootId)
          if (!['streaming', 'completed', 'failed', 'cancelled'].includes(String(answer.status))) {
            throw new ConversationReadV2RepoError('GENERATION_V2_CONVERSATION_READ_STATE_INVALID')
          }
          if (typeof answer.operationId !== 'string' || typeof answer.actionKind !== 'string' || typeof answer.providerId !== 'string' || typeof answer.modelId !== 'string' ||
              typeof answer.endpointProfileId !== 'string' || typeof answer.protocolContractId !== 'string' ||
              answer.errorCode !== null && typeof answer.errorCode !== 'string' || answer.errorMessage !== null && typeof answer.errorMessage !== 'string') {
            throw new ConversationReadV2RepoError('GENERATION_V2_CONVERSATION_READ_STATE_INVALID')
          }
          const images = (this.db.prepare(`SELECT output.asset_id AS assetId,output.asset_revision_id AS assetRevisionId,
            output.asset_sha256 AS sha256,output.mime,blob.storage_ref AS storageRef FROM generation_image_output_v2 output
            JOIN asset_revision_v2 revision ON revision.asset_revision_id=output.asset_revision_id
            JOIN file_blob_v2 blob ON blob.blob_id=revision.blob_id WHERE output.answer_root_id=? ORDER BY output.output_index ASC`)
            .all(answerRootId) as Row[]).map((image) => Object.freeze({ assetId: string(image.assetId),
              assetRevisionId: string(image.assetRevisionId), sha256: string(image.sha256), mime: string(image.mime), storageRef: string(image.storageRef) }))
          const reasoningDetails = reasoningProjection.list(answerRootId)
          if (typeof answer.snapshotCanonicalJson !== 'string') throw new ConversationReadV2RepoError('GENERATION_V2_CONVERSATION_READ_STATE_INVALID')
          const snapshot = decodeAssistantAnswerGenerationSnapshotJsonV2(answer.snapshotCanonicalJson)
          const attachments = Object.freeze(snapshot.semanticIntent.attachments.map((attachment) => Object.freeze(
            attachment.kind === 'managed_file'
              ? (() => {
                const managed = this.db.prepare(`SELECT asset.filename,asset.asset_kind AS assetKind,blob.mime,asset.source_kind AS sourceKind
                  FROM asset_revision_v2 AS revision JOIN file_asset_v2 AS asset ON asset.asset_id=revision.asset_id
                  JOIN file_blob_v2 AS blob ON blob.blob_id=revision.blob_id
                  WHERE revision.asset_revision_id=? AND revision.asset_id=? AND blob.sha256=?`).get(
                    attachment.assetRevisionId.value, attachment.assetId.value, attachment.assetSha256.value,
                  ) as Row | undefined
                if (!managed || typeof managed.filename !== 'string' || (managed.assetKind !== 'file' && managed.assetKind !== 'image') ||
                    typeof managed.mime !== 'string' || !['user_import','url_import','generated','derived'].includes(String(managed.sourceKind))) {
                  throw new ConversationReadV2RepoError('GENERATION_V2_CONVERSATION_READ_STATE_INVALID')
                }
                return { kind:'managed_file' as const,assetId: attachment.assetId.value, assetRevisionId: attachment.assetRevisionId.value,
                  assetSha256: attachment.assetSha256.value, include: attachment.include, sendAs: attachment.sendAs,conversion: attachment.conversion,
                  filename: managed.filename, assetKind: managed.assetKind as 'file'|'image', mime: managed.mime,
                  sourceKind: managed.sourceKind as 'user_import'|'url_import'|'generated'|'derived' }
              })()
              : { kind:'url_reference' as const,referenceId:attachment.referenceId.value,referenceRevision:attachment.referenceRevision.value,
                urlDigest:attachment.urlDigest.value,mediaKind:attachment.mediaKind,capturedAtMs:attachment.capturedAtMs,
                provenance:attachment.provenance,include:attachment.include,sendAs:attachment.sendAs,conversion:attachment.conversion },
          )))
          return Object.freeze({ answerRootId, status: answer.status as 'streaming' | 'completed' | 'failed' | 'cancelled',
            body: string(answer.body), createdAtMs: time(answer.createdAtMs), updatedAtMs: time(answer.updatedAtMs),
            chosen: answerRootId === chosen, operationId: answer.operationId, actionKind: answer.actionKind as 'initial_send' | 'edit_resend' | 'regenerate_question' | 'retry_as_new' | 'retry_replace',
            providerId: answer.providerId, modelId: answer.modelId, endpointProfileId: answer.endpointProfileId,
            protocolContractId: answer.protocolContractId, errorCode: answer.errorCode as string | null,
            errorMessage: answer.errorMessage as string | null, reasoningDetails, attachments, images: Object.freeze(images) })
        })
      if (answers.filter((answer) => answer.chosen).length !== 1) {
        throw new ConversationReadV2RepoError('GENERATION_V2_CONVERSATION_READ_STATE_INVALID')
      }
      return Object.freeze({ questionId, questionBody: string(question.questionBody), questionCreatedAtMs: time(question.questionCreatedAtMs), chosenAnswerRootId: chosen,
        answers: Object.freeze(answers) })
    })
    const filters = contextFilters.readForTurns(branchId.value, unresolvedTurns)
    const turns = unresolvedTurns.map((turn) => Object.freeze({ ...turn,
      contextFilter: filters.get(turn.questionId) ?? Object.freeze({ questionMode:'include' as const,
        answerMode:'include' as const,effectiveMode:'include' as const,lockedByQuestionExclude:false }),
    }))
    return Object.freeze({ branchId: string(branch.branchId), conversationId, projectId: string(branch.projectId),
      title: string(branch.title), branchName: branch.branchName === null ? null : string(branch.branchName),
      headMessageId: branch.headMessageId === null ? null : string(branch.headMessageId), turns: Object.freeze(turns) })
  }
}
