import type BetterSqlite3 from 'better-sqlite3'
import { ConversationGraphV2Identity } from '../../../src/next/generation-v2/domain/conversationGraphV2'
import { AnswerReasoningProjectionV2Repo } from './answerReasoningProjectionV2Repo'
import { BranchContextFilterV2Repo, type BranchTurnContextFilterV2 } from './branchContextFilterV2Repo'
import { decodeAssistantAnswerGenerationSnapshotJsonV2 } from '../../../src/next/generation-v2/domain/assistantAnswerGenerationSnapshotV2'
import { decodeProviderFailureFact } from './generationExecutionV2Repo'
import type { ProviderFailureV2 } from '../../../src/shared/provider/providerFailureV2'
import { BranchRouteResolverV2 } from './branchRouteResolverV2'

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
  beforeMessageId: string | null
  hasMoreTurns: boolean
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
      errorFact: ProviderFailureV2 | null
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

export type ConversationListCursorV2 = Readonly<{
  updatedAtMs: number
  conversationId: string
}>

export type ConversationListPageV2 = Readonly<{
  items: readonly Readonly<{
    conversationId: string
    projectId: string
    title: string
    updatedAtMs: number
    branches: readonly Readonly<{
      branchId: string
      name: string | null
      headMessageId: string | null
      updatedAtMs: number
    }>[]
    branchesHasMore: boolean
  }>[]
  nextCursor: ConversationListCursorV2 | null
  totalCount: number
}>

export type BranchListCursorV2 = Readonly<{
  updatedAtMs: number
  branchId: string
}>

export type BranchListPageV2 = Readonly<{
  items: readonly Readonly<{
    branchId: string
    name: string | null
    headMessageId: string | null
    updatedAtMs: number
  }>[]
  nextCursor: BranchListCursorV2 | null
  totalCount: number
}>

export type MessageCandidateTargetV2 = Readonly<{
  messageId: string
  branchId: string
}>

export type MessageCandidateNavigationV2 = Readonly<{
  conversationId: string
  currentBranchId: string
  messageId: string
  parentMessageId: string | null
  role: 'user' | 'assistant'
  currentIndex: number
  total: number
  previous: MessageCandidateTargetV2 | null
  next: MessageCandidateTargetV2 | null
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

  listConversationPage(
    projectIdValue: string,
    cursorValue: ConversationListCursorV2 | null = null,
    limitValue = 50,
  ): ConversationListPageV2 {
    const projectId = ConversationGraphV2Identity.create('project_id', projectIdValue)
    if (!Number.isSafeInteger(limitValue) || limitValue < 1 || limitValue > 50 ||
        cursorValue !== null && (
          !Number.isSafeInteger(cursorValue.updatedAtMs) || cursorValue.updatedAtMs < 0 ||
          typeof cursorValue.conversationId !== 'string' ||
          cursorValue.conversationId.trim() !== cursorValue.conversationId
        )) {
      throw new ConversationReadV2RepoError('GENERATION_V2_CONVERSATION_READ_INPUT_INVALID')
    }
    const cursorConversationId = cursorValue === null ? null
      : ConversationGraphV2Identity.create('conversation_id', cursorValue.conversationId).value
    const conversations = this.db.prepare(`SELECT conversation_id AS conversationId, project_id AS projectId,
      title, updated_at_ms AS updatedAtMs FROM conversation_v2 AS conversation WHERE project_id=?
      AND NOT EXISTS (SELECT 1 FROM system_chat_template_v2 AS template
        WHERE template.conversation_id=conversation.conversation_id)
      AND (? IS NULL OR updated_at_ms < ? OR (updated_at_ms = ? AND conversation_id > ?))
      ORDER BY updated_at_ms DESC, conversation_id ASC LIMIT ?`).all(
      projectId.value,
      cursorConversationId,
      cursorValue?.updatedAtMs ?? null,
      cursorValue?.updatedAtMs ?? null,
      cursorConversationId,
      limitValue + 1,
    ) as Row[]
    const hasMore = conversations.length > limitValue
    const pageRows = conversations.slice(0, limitValue)
    const items = pageRows.map((row) => {
      const conversationId = string(row.conversationId)
      const branches = this.db.prepare(`SELECT branch_id AS branchId, name,
        head_message_id AS headMessageId, updated_at_ms AS updatedAtMs
        FROM branch_v2 WHERE conversation_id=? AND deleted_at_ms IS NULL
        ORDER BY updated_at_ms DESC, branch_id ASC LIMIT 51`).all(conversationId) as Row[]
      return Object.freeze({
        conversationId,
        projectId: string(row.projectId),
        title: string(row.title),
        updatedAtMs: time(row.updatedAtMs),
        branches: Object.freeze(branches.slice(0, 50).map((branch) => Object.freeze({
          branchId: string(branch.branchId),
          name: branch.name === null ? null : string(branch.name),
          headMessageId: branch.headMessageId === null ? null : string(branch.headMessageId),
          updatedAtMs: time(branch.updatedAtMs),
        }))),
        branchesHasMore: branches.length > 50,
      })
    })
    const last = pageRows.at(-1)
    const totalRow = this.db.prepare(`SELECT count(*) AS count FROM conversation_v2 AS conversation
      WHERE project_id=? AND NOT EXISTS (SELECT 1 FROM system_chat_template_v2 AS template
        WHERE template.conversation_id=conversation.conversation_id)`).get(projectId.value) as Row
    return Object.freeze({
      items: Object.freeze(items),
      nextCursor: hasMore && last ? Object.freeze({
        updatedAtMs: time(last.updatedAtMs),
        conversationId: string(last.conversationId),
      }) : null,
      totalCount: time(totalRow.count),
    })
  }

  listBranchPage(
    conversationIdValue: string,
    cursorValue: BranchListCursorV2 | null = null,
    limitValue = 50,
  ): BranchListPageV2 {
    const conversationId = ConversationGraphV2Identity.create('conversation_id', conversationIdValue)
    if (!Number.isSafeInteger(limitValue) || limitValue < 1 || limitValue > 50 ||
        cursorValue !== null && (
          !Number.isSafeInteger(cursorValue.updatedAtMs) || cursorValue.updatedAtMs < 0 ||
          typeof cursorValue.branchId !== 'string'
        )) {
      throw new ConversationReadV2RepoError('GENERATION_V2_CONVERSATION_READ_INPUT_INVALID')
    }
    const cursorBranchId = cursorValue === null ? null
      : ConversationGraphV2Identity.create('branch_id', cursorValue.branchId).value
    const rows = this.db.prepare(`SELECT branch_id AS branchId,name,head_message_id AS headMessageId,
      updated_at_ms AS updatedAtMs FROM branch_v2
      WHERE conversation_id=? AND deleted_at_ms IS NULL
        AND (? IS NULL OR updated_at_ms < ? OR (updated_at_ms = ? AND branch_id < ?))
      ORDER BY updated_at_ms DESC,branch_id DESC LIMIT ?`).all(
      conversationId.value,
      cursorBranchId,
      cursorValue?.updatedAtMs ?? null,
      cursorValue?.updatedAtMs ?? null,
      cursorBranchId,
      limitValue + 1,
    ) as Row[]
    const hasMore = rows.length > limitValue
    const pageRows = rows.slice(0, limitValue)
    const items = pageRows.map((row) => Object.freeze({
      branchId: string(row.branchId),
      name: row.name === null ? null : string(row.name),
      headMessageId: row.headMessageId === null ? null : string(row.headMessageId),
      updatedAtMs: time(row.updatedAtMs),
    }))
    const last = pageRows.at(-1)
    const total = this.db.prepare(`SELECT count(*) AS count FROM branch_v2
      WHERE conversation_id=? AND deleted_at_ms IS NULL`).get(conversationId.value) as Row
    return Object.freeze({
      items: Object.freeze(items),
      nextCursor: hasMore && last ? Object.freeze({
        updatedAtMs: time(last.updatedAtMs),
        branchId: string(last.branchId),
      }) : null,
      totalCount: time(total.count),
    })
  }

  getMessageCandidateNavigation(
    branchIdValue: string,
    messageIdValue: string,
  ): MessageCandidateNavigationV2 {
    const branchId = ConversationGraphV2Identity.create('branch_id', branchIdValue)
    const messageId = ConversationGraphV2Identity.create('message_id', messageIdValue)
    const resolver = new BranchRouteResolverV2(this.db)
    let currentRoute: ReturnType<BranchRouteResolverV2['resolve']>
    try {
      currentRoute = resolver.resolve(branchId.value)
    } catch {
      throw new ConversationReadV2RepoError('GENERATION_V2_CONVERSATION_READ_STATE_INVALID')
    }
    const current = currentRoute.messages.find((message) => message.messageId === messageId.value)
    if (!current || current.role !== 'user' && (
      current.role !== 'assistant' || current.answerRootId !== current.messageId
    ) || current.role === 'user' && currentRoute.hiddenQuestionIds.has(current.messageId) ||
      current.role === 'assistant' && currentRoute.hiddenAnswerIds.has(current.messageId)) {
      throw new ConversationReadV2RepoError('GENERATION_V2_CONVERSATION_READ_NOT_FOUND')
    }

    const rows = this.db.prepare(`SELECT message.message_id AS messageId,
      message.introduced_in_branch_id AS introducedInBranchId,message.role,message.status,
      message.parent_message_id AS parentMessageId,message.answer_root_id AS answerRootId,
      message.ordinal
      FROM message_v2 AS message
      JOIN branch_v2 AS introduced ON introduced.branch_id=message.introduced_in_branch_id
        AND introduced.conversation_id=message.conversation_id AND introduced.deleted_at_ms IS NULL
      WHERE message.conversation_id=? AND message.role=? AND message.parent_message_id IS ?
        AND (message.role='user' OR
          (message.role='assistant' AND message.answer_root_id=message.message_id))
      ORDER BY message.ordinal ASC`).all(
      currentRoute.conversationId,
      current.role,
      current.parentMessageId,
    ) as Row[]

    const candidates: MessageCandidateTargetV2[] = []
    for (const row of rows) {
      const candidateMessageId = string(row.messageId)
      const introducedBranchId = string(row.introducedInBranchId)
      const role = string(row.role)
      const status = string(row.status)
      if (role !== current.role || !['streaming', 'completed', 'failed', 'cancelled'].includes(status) ||
          !Number.isSafeInteger(row.ordinal) || (row.ordinal as number) < 0) {
        throw new ConversationReadV2RepoError('GENERATION_V2_CONVERSATION_READ_STATE_INVALID')
      }
      let introducedRoute: ReturnType<BranchRouteResolverV2['resolve']>
      try {
        introducedRoute = resolver.resolve(introducedBranchId)
      } catch {
        throw new ConversationReadV2RepoError('GENERATION_V2_CONVERSATION_READ_STATE_INVALID')
      }
      const stillOnIntroducedRoute = introducedRoute.conversationId === currentRoute.conversationId &&
        introducedRoute.messages.some((message) =>
          message.messageId === candidateMessageId &&
          message.introducedInBranchId === introducedBranchId)
      const hidden = role === 'user'
        ? introducedRoute.hiddenQuestionIds.has(candidateMessageId)
        : introducedRoute.hiddenAnswerIds.has(candidateMessageId)
      if (!stillOnIntroducedRoute || hidden) continue
      candidates.push(Object.freeze({ messageId: candidateMessageId, branchId: introducedBranchId }))
    }
    const currentIndex = candidates.findIndex((candidate) => candidate.messageId === current.messageId)
    if (currentIndex < 0) {
      throw new ConversationReadV2RepoError('GENERATION_V2_CONVERSATION_READ_NOT_FOUND')
    }
    return Object.freeze({
      conversationId: currentRoute.conversationId,
      currentBranchId: currentRoute.branchId,
      messageId: current.messageId,
      parentMessageId: current.parentMessageId,
      role: current.role,
      currentIndex,
      total: candidates.length,
      previous: currentIndex > 0 ? candidates[currentIndex - 1]! : null,
      next: currentIndex + 1 < candidates.length ? candidates[currentIndex + 1]! : null,
    })
  }

  readBranch(
    branchIdValue: string,
    beforeMessageIdValue: string | null = null,
    limitValue = 50,
  ): ConversationBranchViewV2 {
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
    if (!Number.isSafeInteger(limitValue) || limitValue < 1 || limitValue > 50) {
      throw new ConversationReadV2RepoError('GENERATION_V2_CONVERSATION_READ_INPUT_INVALID')
    }
    const beforeMessageId = beforeMessageIdValue === null ? null
      : ConversationGraphV2Identity.create('message_id', beforeMessageIdValue).value
    let resolvedRoute: ReturnType<BranchRouteResolverV2['resolve']>
    try { resolvedRoute = new BranchRouteResolverV2(this.db).resolve(branchId.value) } catch {
      throw new ConversationReadV2RepoError('GENERATION_V2_CONVERSATION_READ_STATE_INVALID')
    }
    let turnEnd = resolvedRoute.turns.length
    if (beforeMessageId !== null) {
      const beforeIndex = resolvedRoute.turns.findIndex((turn) => turn.questionId === beforeMessageId)
      if (beforeIndex < 0) {
        throw new ConversationReadV2RepoError('GENERATION_V2_CONVERSATION_READ_INPUT_INVALID')
      }
      turnEnd = beforeIndex
    }
    const turnStart = Math.max(0, turnEnd - limitValue)
    const questions = resolvedRoute.turns.slice(turnStart, turnEnd).flatMap((turn) => {
      if (turn.selectedAnswerId === null) {
        throw new ConversationReadV2RepoError('GENERATION_V2_CONVERSATION_READ_STATE_INVALID')
      }
      if (resolvedRoute.hiddenQuestionIds.has(turn.questionId)) return []
      const question = this.db.prepare(`SELECT body.body_text AS questionBody,
        message.created_at_ms AS questionCreatedAtMs
        FROM message_v2 AS message JOIN message_body_v2 AS body ON body.message_id=message.message_id
        WHERE message.message_id=? AND message.conversation_id=? AND message.role='user'
      `).get(
        turn.questionId, conversationId,
      ) as Row | undefined
      return question ? [Object.freeze({
        questionId: turn.questionId,
        chosenAnswerRootId: turn.selectedAnswerId,
        questionBody: question.questionBody,
        questionCreatedAtMs: question.questionCreatedAtMs,
      })] : []
    })
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
        JOIN generation_operation_v2 AS operation ON operation.target_answer_id=answer.message_id
        JOIN assistant_generation_snapshot_v2 AS snapshot ON snapshot.operation_id=operation.operation_id
        JOIN generation_request_v2 AS request ON request.operation_id=operation.operation_id AND request.request_sequence=1
        WHERE answer.conversation_id=? AND answer.question_id=? AND answer.role='assistant'
          AND answer.answer_root_id=answer.message_id
          AND answer.message_id=?
        ORDER BY answer.ordinal ASC, answer.answer_root_id ASC`).all(conversationId, questionId, chosen) as Row[])
        .filter((answer) => typeof answer.answerRootId === 'string' &&
          !resolvedRoute.hiddenAnswerIds.has(answer.answerRootId))
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
          const operationError = this.db.prepare('SELECT error_fact_json FROM generation_operation_v2 WHERE operation_id=?').get(answer.operationId) as Row | undefined
          const errorFact = decodeProviderFailureFact(operationError?.error_fact_json ?? null)
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
            errorMessage: answer.errorMessage as string | null, errorFact, reasoningDetails, attachments, images: Object.freeze(images) })
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
      headMessageId: branch.headMessageId === null ? null : string(branch.headMessageId),
      beforeMessageId: turnStart > 0 ? resolvedRoute.turns[turnStart]?.questionId ?? null : null,
      hasMoreTurns: turnStart > 0,
      turns: Object.freeze(turns) })
  }
}
