/* eslint-disable max-lines-per-function, max-statements, complexity, max-depth */
import type { DbWorkerRuntime } from '../runtime'
import type { RegisterHandler } from './types'
import { beginTurnPersistenceCore } from '../turnPersistence'
import { DbWorkerError } from '../../errors'
import { randomUUID } from 'node:crypto'
import { recoverOrphanAssistantStreaming } from '../orphanStreamingRecovery'
import {
  EnsureDefaultBranchSchema,
  ListBranchSchema,
  CreateBranchFromMessageSchema,
  DeleteBranchSchema,
  GetBranchPathSchema,
  GetCandidatesSchema,
  GetQuestionCandidatesSchema,
  EffectiveFilterSchema,
  BeginTurnSchema,
  SwitchCandidateSchema,
  SwitchQuestionCandidateSchema,
  RegenerateFromQuestionSchema,
  RegenerateQuestionWithCurrentConfigSchema,
  RetryChosenAnswerSchema,
  FinalizeAssistantAnswerGenerationSchema,
  ForkQuestionSchema,
  RetryReplaceQuestionSchema,
  TruncateBranchFromQuestionSchema,
  SetBranchHeadSchema,
  SetBranchChoiceSchema,
  SetBranchAnswerHideSchema,
  RetryReplaceAnswerSchema,
  SetBranchFilterSchema,
  ClearBranchFilterSchema,
  BuildContextForBranchSchema,
  GetRenderableTurnsSchema,
} from '../../validation'
export function registerBranchContextHandlers(register: RegisterHandler, runtime: DbWorkerRuntime) {
  const rt = runtime as any
  const debugDbOps = rt.debugDbOps === true
  const enableBranchInvariants = rt.enableBranchInvariants === true
  const dbgDb = typeof rt.dbgDb === 'function' ? rt.dbgDb.bind(rt) : (() => { })
  const requireNonToolHead = (_db: unknown, headMessageId: string, context: Record<string, unknown>) =>
    (typeof rt.requireNonToolHead === 'function' ? rt.requireNonToolHead(headMessageId, context) : undefined)
  const requireHeadEquals = (_db: unknown, branchId: string, expectedHeadMessageId: string, context: Record<string, unknown>) =>
    (typeof rt.requireHeadEquals === 'function' ? rt.requireHeadEquals(branchId, expectedHeadMessageId, context) : undefined)

  const assertSnapshotSafe = (value: unknown, path = 'snapshot'): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => assertSnapshotSafe(item, `${path}[${index}]`))
      return
    }
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (/(api[_-]?key|authorization|credential|password|proxy[_-]?(?:key|token|password)|access[_-]?token|secret|data[_-]?url|abort[_-]?controller)/i.test(key)) {
        throw new DbWorkerError('ERR_VALIDATION', `generation_snapshot_forbidden_field:${path}.${key}`)
      }
      assertSnapshotSafe(child, `${path}.${key}`)
    }
  }

  const assertSnapshotV1 = (snapshot: Record<string, unknown>): void => {
    const route = snapshot.route as Record<string, unknown> | undefined
    const tools = snapshot.tools as Record<string, unknown> | undefined
    const attachments = snapshot.attachments as Record<string, unknown> | undefined
    const requiredObjects = ['generationParams', 'reasoning', 'webSearch', 'imageGeneration', 'providerOptions']
    if (snapshot.schemaVersion !== 1 || !route || typeof route.providerId !== 'string' || !route.providerId.trim() ||
        typeof route.modelId !== 'string' || !route.modelId.trim() || typeof route.endpointId !== 'string' || !route.endpointId.trim() ||
        typeof route.profileId !== 'string' || !route.profileId.trim() || requiredObjects.some((key) => !snapshot[key] || typeof snapshot[key] !== 'object' || Array.isArray(snapshot[key])) ||
        !tools || typeof tools.enabled !== 'boolean' || !Array.isArray(tools.allowedToolIds) || typeof tools.requireExternalSideEffectConfirmation !== 'boolean' ||
        !attachments || typeof attachments.sourceQuestionId !== 'string' || !Array.isArray(attachments.items)) {
      throw new DbWorkerError('ERR_VALIDATION', 'ANSWER_GENERATION_SNAPSHOT_INVALID')
    }
    if (Object.prototype.hasOwnProperty.call(snapshot.providerOptions, 'geminiThinking')) {
      throw new DbWorkerError('ERR_VALIDATION', 'ANSWER_GENERATION_SNAPSHOT_LEGACY_GEMINI_THINKING')
    }
    for (const item of attachments.items as unknown[]) {
      if (!item || typeof item !== 'object' || typeof (item as any).assetId !== 'string' || typeof (item as any).include !== 'boolean') {
        throw new DbWorkerError('ERR_VALIDATION', 'ANSWER_GENERATION_SNAPSHOT_ATTACHMENT_INVALID')
      }
    }
    for (const endpointUrl of [(snapshot.providerOptions as any)?.endpointUrl, (snapshot.providerOptions as any)?.baseUrl]) {
      if (typeof endpointUrl !== 'string' || !endpointUrl) continue
      let parsed: URL
      try { parsed = new URL(endpointUrl) } catch { throw new DbWorkerError('ERR_VALIDATION', 'ANSWER_GENERATION_SNAPSHOT_ENDPOINT_INVALID') }
      if (parsed.username || parsed.password || [...parsed.searchParams.keys()].some((key) => /(key|token|secret|password|auth)/i.test(key))) {
        throw new DbWorkerError('ERR_VALIDATION', 'ANSWER_GENERATION_SNAPSHOT_ENDPOINT_CONTAINS_SECRET')
      }
    }
    assertSnapshotSafe(snapshot)
  }

  const createAnswerGeneration = (input: Readonly<{
    operationId: string
    actionKind: 'regenerate' | 'retry_replace' | 'retry_as_new'
    branchId: string
    questionId: string
    targetAnswerRootId?: string | null
    suppliedSnapshot?: Record<string, unknown> | null
    compatibleExecutionPins?: Record<string, unknown> | null
  }>) => {
    const existing = rt.db.prepare(`
      SELECT operation_id AS operationId, action_kind AS actionKind, branch_id AS branchId,
             question_id AS questionId, target_answer_root_id AS targetAnswerRootId,
             result_answer_root_id AS resultAnswerRootId, state
      FROM assistant_answer_generation_operations WHERE operation_id=@operationId
    `).get({ operationId: input.operationId }) as any
    if (existing) {
      const snapshotRow = rt.db.prepare(`SELECT snapshot_json AS snapshotJson FROM assistant_answer_generation_snapshots WHERE answer_root_id=?`)
        .get(String(existing.resultAnswerRootId)) as any
      const snapshot = snapshotRow?.snapshotJson ? JSON.parse(String(snapshotRow.snapshotJson)) : null
      const sameIdentity = existing.actionKind === input.actionKind && existing.branchId === input.branchId &&
        existing.questionId === input.questionId && String(existing.targetAnswerRootId ?? '') === String(input.targetAnswerRootId ?? '')
      const sameSnapshot = input.suppliedSnapshot == null || JSON.stringify(snapshot) === JSON.stringify(input.suppliedSnapshot)
      if (!sameIdentity || !sameSnapshot) throw new DbWorkerError('ERR_INVALID', 'answer_generation_operation_conflict')
      if (input.compatibleExecutionPins) {
        const route = rt.compatibleRouteRepo.getRouteByChoiceMessageId(String(existing.resultAnswerRootId))
        const pins = input.compatibleExecutionPins as any
        if (!route || route.providerInstanceId !== pins.providerInstanceId || route.modelId !== pins.modelId ||
            route.endpointRevisionId !== pins.endpointRevisionId || route.credentialVersionRef !== (pins.credentialVersionRef ?? null) ||
            route.requestProfileId !== pins.requestProfileId || route.requestProfileVersion !== pins.requestProfileVersion ||
            route.responseProfileId !== pins.responseProfileId || route.responseProfileVersion !== pins.responseProfileVersion ||
            route.reasoningMappingId !== pins.reasoningMappingId || route.reasoningMappingVersion !== pins.reasoningMappingVersion) {
          throw new DbWorkerError('ERR_INVALID', 'answer_generation_operation_conflict')
        }
      }
      const message = rt.db.prepare(`SELECT seq FROM message WHERE id=?`).get(String(existing.resultAnswerRootId)) as any
      const projection = rt.db.prepare(`
        SELECT b.head_message_id AS headMessageId, bc.chosen_answer_root_id AS chosenAnswerRootId
        FROM branch b LEFT JOIN branch_choice bc ON bc.branch_id=b.id AND bc.question_id=@questionId
        WHERE b.id=@branchId
      `).get({ branchId: input.branchId, questionId: input.questionId }) as any
      const compatibleRoute = rt.db.prepare(`SELECT route_provenance_id AS routeProvenanceId FROM compatible_route_choices WHERE message_id=?`)
        .get(String(existing.resultAnswerRootId)) as any
      return {
        ok: true, operationId: input.operationId, actionKind: input.actionKind,
        newAnswerRootId: String(existing.resultAnswerRootId), newAssistantSeq: Number(message?.seq),
        chosenAnswerRootId: String(projection?.chosenAnswerRootId ?? ''), headMessageId: String(projection?.headMessageId ?? ''),
        snapshot, state: String(existing.state), idempotentReplay: true,
        ...(compatibleRoute?.routeProvenanceId ? { compatibleRouteProvenanceId: String(compatibleRoute.routeProvenanceId) } : {}),
      }
    }

    const conflicting = rt.db.prepare(`
      SELECT operation_id AS operationId FROM assistant_answer_generation_operations
      WHERE branch_id=@branchId AND question_id=@questionId AND state IN ('committed', 'streaming')
      LIMIT 1
    `).get({ branchId: input.branchId, questionId: input.questionId }) as any
    if (conflicting) throw new DbWorkerError('ERR_INVALID', 'ANSWER_GENERATION_ALREADY_RUNNING')

    const branch = rt.branchRepo.get(input.branchId)
    if (!branch?.convoId) throw new DbWorkerError('ERR_NOT_FOUND', `Branch not found: ${input.branchId}`)
    if (branch.deletedAt != null) throw new DbWorkerError('ERR_INVALID', `Branch is deleted: ${input.branchId}`)
    const question = rt.db.prepare(`SELECT 1 FROM message WHERE id=@id AND convo_id=@convoId AND role='user'`)
      .get({ id: input.questionId, convoId: branch.convoId })
    if (!question) throw new DbWorkerError('ERR_VALIDATION', `Question not found in conversation: ${input.questionId}`)

    let snapshot = input.suppliedSnapshot ?? null
    if (input.actionKind !== 'regenerate') {
      const target = String(input.targetAnswerRootId ?? '')
      try {
        rt.branchRepo.canRetryReplace(input.branchId, input.questionId, target)
      } catch (error) {
        throw new DbWorkerError('ERR_INVALID', `STALE_CHOSEN_ANSWER:${error instanceof Error ? error.message : String(error)}`)
      }
      if (rt.db.prepare(`SELECT 1 FROM branch_answer_hide WHERE branch_id=? AND answer_root_id=?`).get(input.branchId, target)) {
        throw new DbWorkerError('ERR_INVALID', 'TARGET_ANSWER_HIDDEN')
      }
      const row = rt.db.prepare(`SELECT snapshot_json AS snapshotJson FROM assistant_answer_generation_snapshots WHERE answer_root_id=?`).get(target) as any
      if (!row?.snapshotJson) throw new DbWorkerError('ERR_INVALID', 'ANSWER_GENERATION_SNAPSHOT_MISSING')
      snapshot = JSON.parse(String(row.snapshotJson)) as Record<string, unknown>
    }
    if (!snapshot || Number((snapshot as any).schemaVersion) !== 1) throw new DbWorkerError('ERR_VALIDATION', 'ANSWER_GENERATION_SNAPSHOT_INVALID')
    assertSnapshotV1(snapshot)
    const snapshotJson = JSON.stringify(snapshot)
    if (Buffer.byteLength(snapshotJson, 'utf8') > 1048576) throw new DbWorkerError('ERR_VALIDATION', 'ANSWER_GENERATION_SNAPSHOT_TOO_LARGE')
    const now = Date.now()
    const created = rt.messageRepo.append({
      convoId: branch.convoId, role: 'assistant', body: '', parentId: input.questionId, status: 'streaming',
      meta: { providerId: (snapshot as any).route?.providerId ?? null, modelId: (snapshot as any).route?.modelId ?? null },
    })
    if (input.actionKind === 'retry_replace') {
      rt.branchRepo.setAnswerHide(input.branchId, input.questionId, String(input.targetAnswerRootId), true)
    }
    rt.db.prepare(`INSERT INTO assistant_answer_generation_snapshots (answer_root_id, schema_version, snapshot_json, created_at_ms) VALUES (?, 1, ?, ?)`)
      .run(created.id, snapshotJson, now)
    rt.db.prepare(`
      INSERT INTO assistant_answer_generation_operations (
        operation_id, action_kind, branch_id, question_id, target_answer_root_id,
        result_answer_root_id, state, created_at_ms, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, 'committed', ?, ?)
    `).run(input.operationId, input.actionKind, input.branchId, input.questionId, input.targetAnswerRootId ?? null, created.id, now, now)
    rt.branchRepo.setChoice(input.branchId, input.questionId, created.id)
    rt.branchRepo.setHead(input.branchId, created.id)
    let compatibleRouteProvenanceId: string | undefined
    if ((snapshot as any).route?.providerId === 'openai_chat_compatible') {
      const pins = input.compatibleExecutionPins as any
      if (!pins || pins.providerInstanceId !== (snapshot as any).providerOptions?.compatible?.providerInstanceId ||
          pins.modelId !== (snapshot as any).route?.modelId || pins.endpointRevisionId !== (snapshot as any).route?.endpointId) {
        throw new DbWorkerError('ERR_INVALID', 'COMPATIBLE_EXECUTION_PINS_MISSING_OR_STALE')
      }
      const endpoint = rt.compatibleProviderRepo.getEndpointRevision(String(pins.endpointRevisionId))
      const responseProfile = endpoint
        ? rt.compatibleProfileRepo.getResponseProfile(endpoint.responseProfileId, endpoint.responseProfileVersion)
        : null
      const reasoning = responseProfile
        ? rt.compatibleProfileRepo.getReasoningMapping(responseProfile.reasoningMappingId, responseProfile.reasoningMappingVersion)
        : null
      if (!endpoint || endpoint.providerInstanceId !== pins.providerInstanceId || endpoint.credentialVersionRef !== (pins.credentialVersionRef ?? null) ||
          endpoint.requestProfileId !== pins.requestProfileId || endpoint.requestProfileVersion !== pins.requestProfileVersion ||
          endpoint.responseProfileId !== pins.responseProfileId || endpoint.responseProfileVersion !== pins.responseProfileVersion ||
          !responseProfile || responseProfile.reasoningMappingId !== pins.reasoningMappingId ||
          responseProfile.reasoningMappingVersion !== pins.reasoningMappingVersion ||
          responseProfile.inlinePolicyId !== pins.inlinePolicyId || responseProfile.inlinePolicyVersion !== pins.inlinePolicyVersion || !reasoning) {
        throw new DbWorkerError('ERR_INVALID', 'COMPATIBLE_EXECUTION_PINS_STALE')
      }
      compatibleRouteProvenanceId = `ocp_route_${randomUUID()}`
      rt.compatibleRouteRepo.createRouteWithChoices({
        routeProvenanceId: compatibleRouteProvenanceId,
        requestId: `answer_generation_${randomUUID()}`,
        requestMessageId: input.questionId,
        protocolKey: 'openai_chat_compatible',
        providerInstanceId: String(pins.providerInstanceId),
        modelId: String(pins.modelId),
        endpointRevisionId: String(pins.endpointRevisionId),
        credentialVersionRef: pins.credentialVersionRef ?? null,
        requestProfileId: String(pins.requestProfileId),
        requestProfileVersion: Number(pins.requestProfileVersion),
        responseProfileId: String(pins.responseProfileId),
        responseProfileVersion: Number(pins.responseProfileVersion),
        reasoningMappingId: String(pins.reasoningMappingId),
        reasoningMappingVersion: Number(pins.reasoningMappingVersion),
        reasoningMode: reasoning.mode,
        inlinePolicyId: String(pins.inlinePolicyId),
        inlinePolicyVersion: Number(pins.inlinePolicyVersion),
        state: 'prepared',
        createdAtMs: now,
      }, [{ routeProvenanceId: compatibleRouteProvenanceId, choiceIndex: 0, messageId: created.id, createdAtMs: now }])
    }
    return {
      ok: true, operationId: input.operationId, actionKind: input.actionKind,
      newAnswerRootId: created.id, newAssistantSeq: created.seq,
      chosenAnswerRootId: created.id, headMessageId: created.id,
      snapshot, state: 'committed', idempotentReplay: false,
      ...(compatibleRouteProvenanceId ? { compatibleRouteProvenanceId } : {}),
    }
  }
  register('branch.ensureDefault', (raw) => {
      const input = EnsureDefaultBranchSchema.parse(raw)
      return rt.branchRepo.ensureDefault(input.convoId, input.name)
    })

  register('branch.list', (raw) => {
      const input = ListBranchSchema.parse(raw)
      return rt.branchRepo.list(input.convoId, !!input.includeDeleted)
    })

  register('branch.createFromMessage', (raw) => {
      const input = CreateBranchFromMessageSchema.parse(raw)
      return rt.branchRepo.createFromMessage(input)
    })

  register('branch.delete', (raw) => {
      const input = DeleteBranchSchema.parse(raw)
      return rt.branchRepo.delete(input.branchId)
    })

  register('branch.getPathMessages', (raw) => {
      const input = GetBranchPathSchema.parse(raw)
      return rt.branchRepo.getPathMessages(input.branchId, input.limit)
    })

  register('branch.getCandidates', (raw) => {
      const input = GetCandidatesSchema.parse(raw)
      const list = rt.branchRepo.getCandidates(input.branchId, input.questionId, input.limit)
      dbgDb('branch.getCandidates', {
        branchId: input.branchId,
        questionId: input.questionId,
        count: list.length,
        candidates: list.map((c: { answerRootId: string; status: string }) => ({ answerRootId: c.answerRootId, status: c.status })),
      })
      return list
    })

  register('branch.getQuestionCandidates', (raw) => {
      const input = GetQuestionCandidatesSchema.parse(raw)
      const list = rt.branchRepo.getQuestionCandidates(input.branchId, input.baseMessageId, input.limit)
      dbgDb('branch.getQuestionCandidates', {
        branchId: input.branchId,
        baseMessageId: input.baseMessageId ?? null,
        count: list.length,
        candidates: list.map((c: { questionId: string; status: string }) => ({ questionId: c.questionId, status: c.status })),
      })
      return list
    })

  register('branch.getEffectiveFilters', (raw) => {
      const input = EffectiveFilterSchema.parse(raw)
      return rt.branchRepo.getEffectiveFilters(input.branchId, input.questionId, input.chosenAnswerRootId)
    })

  register('branch.beginTurn', (raw) => {
      const input = BeginTurnSchema.parse(raw)
      const txn = rt.db.transaction(() => beginTurnPersistenceCore(runtime, input))

      const result = txn()
      // 事务提交后发射 activity_updated
      rt.emitActivityUpdated(result.convoId)
      return result
    })

  register('branch.switchCandidate', (raw) => {
      const input = SwitchCandidateSchema.parse(raw)
      const out = rt.branchRepo.switchCandidate(input.branchId, input.questionId, input.answerRootId)

      if (enableBranchInvariants) {
        const branch = rt.branchRepo.get(input.branchId)
        const convoId = branch?.convoId ? String(branch.convoId) : ''
        const expected = convoId ? rt.branchRepo.computePreferredHeadForAnswerRoot(convoId, input.answerRootId) : out.headMessageId
        requireNonToolHead(rt.db, out.headMessageId, {
          op: 'branch.switchCandidate',
          branchId: input.branchId,
          questionId: input.questionId,
          answerRootId: input.answerRootId,
        })
        requireHeadEquals(rt.db, input.branchId, expected, {
          op: 'branch.switchCandidate',
          branchId: input.branchId,
          questionId: input.questionId,
          answerRootId: input.answerRootId,
        })
      }

      return out
    })

  register('branch.switchQuestionCandidate', (raw) => {
      const input = SwitchQuestionCandidateSchema.parse(raw)
      const out = rt.branchRepo.switchQuestionCandidate(input.branchId, input.baseMessageId, input.questionId)

      if (enableBranchInvariants) {
        const branch = rt.branchRepo.get(input.branchId)
        const convoId = branch?.convoId ? String(branch.convoId) : ''
        if (convoId) {
          const choiceRow = rt.db
            .prepare(
              `SELECT chosen_answer_root_id AS chosen
               FROM branch_choice
               WHERE branch_id=@branchId AND question_id=@questionId
               LIMIT 1`
            )
            .get({ branchId: input.branchId, questionId: input.questionId }) as any
          const chosen = choiceRow?.chosen ? String(choiceRow.chosen) : null
          const expected = chosen ? rt.branchRepo.computePreferredHeadForAnswerRoot(convoId, chosen) : input.questionId
          requireNonToolHead(rt.db, out.headMessageId, {
            op: 'branch.switchQuestionCandidate',
            branchId: input.branchId,
            questionId: input.questionId,
            baseMessageId: input.baseMessageId ?? null,
          })
          requireHeadEquals(rt.db, input.branchId, expected, {
            op: 'branch.switchQuestionCandidate',
            branchId: input.branchId,
            questionId: input.questionId,
            baseMessageId: input.baseMessageId ?? null,
            chosenAnswerRootId: chosen,
          })
        }
      }

      return out
    })

  register('branch.regenerateFromQuestion', (raw) => {
      const input = RegenerateFromQuestionSchema.parse(raw)
      const branch = rt.branchRepo.get(input.branchId)
      if (!branch?.convoId) {
        throw new DbWorkerError('ERR_NOT_FOUND', `Branch not found: ${input.branchId}`)
      }
      if (branch.deletedAt != null) {
        throw new DbWorkerError('ERR_INVALID', `Branch is deleted: ${input.branchId}`)
      }

      if (debugDbOps) {
        const beforeChoice = rt.db
          .prepare(`SELECT chosen_answer_root_id AS chosen FROM branch_choice WHERE branch_id=@branchId AND question_id=@questionId LIMIT 1`)
          .get({ branchId: input.branchId, questionId: input.questionId }) as any
        dbgDb('branch.regenerateFromQuestion:before', {
          branchId: input.branchId,
          questionId: input.questionId,
          headMessageId: branch.headMessageId ?? null,
          chosenAnswerRootId: beforeChoice?.chosen ? String(beforeChoice.chosen) : null,
        })
      }

      // Validate question belongs to this conversation.
      const q = rt.db
        .prepare(`SELECT 1 FROM message WHERE id=@id AND convo_id=@convoId AND role='user' LIMIT 1`)
        .get({ id: input.questionId, convoId: branch.convoId }) as any
      if (!q) {
        throw new DbWorkerError('ERR_VALIDATION', `Question not found in conversation: ${input.questionId}`)
      }

      const txn = rt.db.transaction(() => {
        const created = rt.messageRepo.append({
          convoId: branch.convoId,
          role: 'assistant',
          body: '',
          parentId: input.questionId,
          status: 'streaming',
        })
        rt.branchRepo.setChoice(input.branchId, input.questionId, created.id)
        rt.branchRepo.setHead(input.branchId, created.id)
        return { ok: true, newAnswerRootId: created.id, newAssistantSeq: created.seq }
      })

      const out = txn()
      if (debugDbOps) {
        const afterChoice = rt.db
          .prepare(`SELECT chosen_answer_root_id AS chosen FROM branch_choice WHERE branch_id=@branchId AND question_id=@questionId LIMIT 1`)
          .get({ branchId: input.branchId, questionId: input.questionId }) as any
        const afterHead = rt.db.prepare(`SELECT head_message_id AS head FROM branch WHERE id=@branchId LIMIT 1`).get({ branchId: input.branchId }) as any
        dbgDb('branch.regenerateFromQuestion:after', {
          branchId: input.branchId,
          questionId: input.questionId,
          newAnswerRootId: out.newAnswerRootId,
          newAssistantSeq: out.newAssistantSeq,
          headMessageId: afterHead?.head ? String(afterHead.head) : null,
          chosenAnswerRootId: afterChoice?.chosen ? String(afterChoice.chosen) : null,
        })
      }
      return out
    })

  register('branch.regenerateQuestionWithCurrentConfig', (raw) => {
      const input = RegenerateQuestionWithCurrentConfigSchema.parse(raw)
      return rt.db.transaction(() => createAnswerGeneration({
        operationId: input.operationId,
        actionKind: 'regenerate',
        branchId: input.branchId,
        questionId: input.questionId,
        suppliedSnapshot: input.snapshot,
        compatibleExecutionPins: input.compatibleExecutionPins,
      }))()
    })

  register('branch.retryChosenAnswerReplacing', (raw) => {
      const input = RetryChosenAnswerSchema.parse(raw)
      return rt.db.transaction(() => createAnswerGeneration({
        operationId: input.operationId,
        actionKind: 'retry_replace',
        branchId: input.branchId,
        questionId: input.questionId,
        targetAnswerRootId: input.targetAnswerRootId,
        compatibleExecutionPins: input.compatibleExecutionPins,
      }))()
    })

  register('branch.retryChosenAnswerAsNew', (raw) => {
      const input = RetryChosenAnswerSchema.parse(raw)
      return rt.db.transaction(() => createAnswerGeneration({
        operationId: input.operationId,
        actionKind: 'retry_as_new',
        branchId: input.branchId,
        questionId: input.questionId,
        targetAnswerRootId: input.targetAnswerRootId,
        compatibleExecutionPins: input.compatibleExecutionPins,
      }))()
    })

  register('answerGeneration.finalize', (raw) => {
      const input = FinalizeAssistantAnswerGenerationSchema.parse(raw)
      return rt.db.transaction(() => {
        const existing = rt.db.prepare(`SELECT state FROM assistant_answer_generation_operations WHERE result_answer_root_id=?`)
          .get(input.answerRootId) as { state?: string } | undefined
        if (!existing) return { ok: true, found: false }
        if (['completed', 'failed', 'cancelled'].includes(String(existing.state))) {
          return { ok: true, found: true, state: existing.state, idempotentReplay: true }
        }
        const now = Date.now()
        rt.db.prepare(`
          UPDATE assistant_answer_generation_operations
          SET state=@state, error_code=@errorCode, error_message=@errorMessage,
              updated_at_ms=@now, terminal_at_ms=@now
          WHERE result_answer_root_id=@answerRootId
        `).run({
          answerRootId: input.answerRootId,
          state: input.state,
          errorCode: input.errorCode ?? null,
          errorMessage: input.errorMessage ?? null,
          now,
        })
        rt.db.prepare(`
          UPDATE message SET meta=json_patch(
            COALESCE(meta, '{}'),
            json_object(
              'answerGenerationState', @state,
              'answerGenerationErrorCode', @errorCode,
              'answerGenerationErrorMessage', @errorMessage
            )
          ), status=@messageStatus WHERE id=@answerRootId
        `).run({
          answerRootId: input.answerRootId,
          state: input.state,
          errorCode: input.errorCode ?? null,
          errorMessage: input.errorMessage ?? null,
          messageStatus: input.state === 'failed' ? 'error' : 'final',
        })
        return { ok: true, found: true, state: input.state, idempotentReplay: false }
      })()
  })

  register('answerGeneration.claimStream', (raw) => {
    const operationId = String((raw as any)?.operationId ?? '').trim()
    const answerRootId = String((raw as any)?.answerRootId ?? '').trim()
    if (!operationId || !answerRootId) throw new DbWorkerError('ERR_VALIDATION', 'Missing operationId/answerRootId')
    return rt.db.transaction(() => {
      const row = rt.db.prepare(`SELECT state, result_answer_root_id AS answerRootId FROM assistant_answer_generation_operations WHERE operation_id=?`)
        .get(operationId) as { state?: string; answerRootId?: string } | undefined
      if (!row || row.answerRootId !== answerRootId) throw new DbWorkerError('ERR_INVALID', 'ANSWER_GENERATION_OPERATION_MISMATCH')
      if (row.state !== 'committed') return { ok: true, claimed: false, state: row.state }
      const changed = rt.db.prepare(`UPDATE assistant_answer_generation_operations SET state='streaming', updated_at_ms=? WHERE operation_id=? AND state='committed'`)
        .run(Date.now(), operationId).changes
      return { ok: true, claimed: changed === 1, state: changed === 1 ? 'streaming' : row.state }
    })()
  })

  register('answerGeneration.recoverInterrupted', (raw) => {
    const atMs = Number((raw as any)?.atMs)
    return recoverOrphanAssistantStreaming(rt.db, atMs)
  })

  register('answerGeneration.getSnapshot', (raw) => {
      const answerRootId = String((raw as any)?.answerRootId ?? '').trim()
      if (!answerRootId) throw new DbWorkerError('ERR_VALIDATION', 'Missing answerRootId')
      const row = rt.db.prepare(`SELECT schema_version AS schemaVersion, snapshot_json AS snapshotJson FROM assistant_answer_generation_snapshots WHERE answer_root_id=?`)
        .get(answerRootId) as any
      if (!row?.snapshotJson) return { ok: true, snapshot: null }
      return { ok: true, snapshot: JSON.parse(String(row.snapshotJson)), schemaVersion: Number(row.schemaVersion) }
    })

  register('answerGeneration.persistSnapshot', (raw) => {
      const answerRootId = String((raw as any)?.answerRootId ?? '').trim()
      const snapshot = (raw as any)?.snapshot as Record<string, unknown> | undefined
      if (!answerRootId || !snapshot || Number(snapshot.schemaVersion) !== 1) {
        throw new DbWorkerError('ERR_VALIDATION', 'ANSWER_GENERATION_SNAPSHOT_INVALID')
      }
      assertSnapshotV1(snapshot)
      const message = rt.db.prepare(`SELECT 1 FROM message WHERE id=? AND role='assistant' AND answer_root_id=id`).get(answerRootId)
      if (!message) throw new DbWorkerError('ERR_VALIDATION', 'ANSWER_ROOT_NOT_FOUND')
      const snapshotJson = JSON.stringify(snapshot)
      if (Buffer.byteLength(snapshotJson, 'utf8') > 1048576) throw new DbWorkerError('ERR_VALIDATION', 'ANSWER_GENERATION_SNAPSHOT_TOO_LARGE')
      const existing = rt.db.prepare(`SELECT snapshot_json AS snapshotJson FROM assistant_answer_generation_snapshots WHERE answer_root_id=?`).get(answerRootId) as any
      if (existing) {
        if (String(existing.snapshotJson) !== snapshotJson) throw new DbWorkerError('ERR_INVALID', 'ANSWER_GENERATION_SNAPSHOT_IMMUTABLE')
        return { ok: true, idempotentReplay: true }
      }
      rt.db.prepare(`INSERT INTO assistant_answer_generation_snapshots (answer_root_id, schema_version, snapshot_json, created_at_ms) VALUES (?, 1, ?, ?)`)
        .run(answerRootId, snapshotJson, Date.now())
      return { ok: true, idempotentReplay: false }
    })

  register('branch.forkQuestion', (raw) => {
      const input = ForkQuestionSchema.parse(raw)
      const branch = rt.branchRepo.get(input.branchId)
      if (!branch?.convoId) throw new DbWorkerError('ERR_NOT_FOUND', `Branch not found: ${input.branchId}`)
      if (branch.deletedAt != null) throw new DbWorkerError('ERR_INVALID', `Branch is deleted: ${input.branchId}`)
      if (!branch.headMessageId) throw new DbWorkerError('ERR_INVALID', `Branch has no head: ${input.branchId}`)

      const oldQuestionId = String(input.oldQuestionId ?? '').trim()
      const newBody = typeof input.newBody === 'string' ? input.newBody : String(input.newBody ?? '')
      if (!oldQuestionId) throw new DbWorkerError('ERR_VALIDATION', 'Missing oldQuestionId')

      const oldRow = rt.db
        .prepare(`SELECT id, parent_id AS parentId FROM message WHERE id=@id AND convo_id=@convoId AND role='user' LIMIT 1`)
        .get({ id: oldQuestionId, convoId: branch.convoId }) as any
      if (!oldRow?.id) throw new DbWorkerError('ERR_VALIDATION', `Question not found in conversation: ${oldQuestionId}`)
      const baseMessageId = oldRow.parentId ? String(oldRow.parentId) : null

      // Guardrail: do not mutate branch while head is streaming (prevents head-switch + streaming writes divergence).
      const headStatus = rt.db.prepare(`SELECT status FROM message WHERE id=@id LIMIT 1`).get({ id: branch.headMessageId }) as any
      if (String(headStatus?.status ?? 'final') === 'streaming') {
        throw new DbWorkerError('ERR_INVALID', 'Branch is streaming; abort the run before editing questions')
      }

      const txn = rt.db.transaction(() => {
        const question = rt.messageRepo.append({
          convoId: branch.convoId,
          role: 'user',
          body: newBody,
          parentId: baseMessageId,
        })

        const questionDoc = rt.loadMessageSearchDoc(question.id)
        if (questionDoc) {
          rt.searchRepo.upsertDoc(questionDoc)
        }

        const assistant = rt.messageRepo.append({
          convoId: branch.convoId,
          role: 'assistant',
          body: '',
          parentId: question.id,
          status: 'streaming',
        })

        rt.branchRepo.setChoice(input.branchId, question.id, assistant.id)
        rt.branchRepo.setHead(input.branchId, assistant.id)

        return {
          ok: true as const,
          branchId: input.branchId,
          baseMessageId,
          newQuestionId: question.id,
          newQuestionSeq: question.seq,
          assistantId: assistant.id,
          assistantSeq: assistant.seq,
        }
      })

      return txn()
    })

  register('branch.retryReplaceQuestion', (raw) => {
      const input = RetryReplaceQuestionSchema.parse(raw)
      const branch = rt.branchRepo.get(input.branchId)
      if (!branch?.convoId) throw new DbWorkerError('ERR_NOT_FOUND', `Branch not found: ${input.branchId}`)
      if (branch.deletedAt != null) throw new DbWorkerError('ERR_INVALID', `Branch is deleted: ${input.branchId}`)
      if (!branch.headMessageId) throw new DbWorkerError('ERR_INVALID', `Branch has no head: ${input.branchId}`)

      const oldQuestionId = String(input.oldQuestionId ?? '').trim()
      const newBody = typeof input.newBody === 'string' ? input.newBody : String(input.newBody ?? '')
      if (!oldQuestionId) throw new DbWorkerError('ERR_VALIDATION', 'Missing oldQuestionId')

      const oldRow = rt.db
        .prepare(`SELECT id, parent_id AS parentId FROM message WHERE id=@id AND convo_id=@convoId AND role='user' LIMIT 1`)
        .get({ id: oldQuestionId, convoId: branch.convoId }) as any
      if (!oldRow?.id) throw new DbWorkerError('ERR_VALIDATION', `Question not found in conversation: ${oldQuestionId}`)
      const baseMessageId = oldRow.parentId ? String(oldRow.parentId) : null

      // Branch-local terminal check: oldQuestion must be the last user in the current head->root path.
      const path = rt.branchRepo.getPathMessages(input.branchId, 5000)
      if (path.length === 0) throw new DbWorkerError('ERR_INVALID', `Branch path is empty: ${input.branchId}`)
      let lastUserId: string | null = null
      for (let i = path.length - 1; i >= 0; i -= 1) {
        if (String((path[i] as any).role ?? '').trim() === 'user') {
          lastUserId = String((path[i] as any).id ?? '')
          break
        }
      }
      if (!lastUserId || lastUserId !== oldQuestionId) {
        throw new DbWorkerError('ERR_INVALID', 'Replace question is only allowed on the last question of the current branch')
      }

      // Guardrail (early reject): do not mutate branch while head is streaming (prevents head-switch + streaming writes divergence).
      // Safety boundary is enforced again inside the transaction.
      const headStatus = rt.db.prepare(`SELECT status FROM message WHERE id=@id LIMIT 1`).get({ id: branch.headMessageId }) as any
      if (String(headStatus?.status ?? 'final') === 'streaming') {
        throw new DbWorkerError('ERR_INVALID', 'Branch is streaming; abort the run before editing questions')
      }

      const baseKey = baseMessageId ?? '__root__'
      const upsertHide = rt.db.prepare(`
        INSERT INTO branch_question_hide(branch_id, base_message_id, question_id, hidden, updated_at)
        VALUES (@branchId, @baseMessageId, @questionId, @hidden, @updatedAt)
        ON CONFLICT(branch_id, base_message_id, question_id)
        DO UPDATE SET hidden = excluded.hidden, updated_at = excluded.updated_at
      `)
      const deleteHideAnyBase = rt.db.prepare(`
        DELETE FROM branch_question_hide
        WHERE branch_id = @branchId AND question_id = @questionId
      `)
      const getHeadGrouping = rt.db.prepare(`
        SELECT question_id AS questionId, answer_root_id AS answerRootId
        FROM message
        WHERE id=@id
        LIMIT 1
      `)

      const txn = rt.db.transaction(() => {
        // Re-fetch branch row inside txn to avoid acting on stale head/message graph state.
        const latest = rt.branchRepo.get(input.branchId)
        if (!latest?.convoId) throw new DbWorkerError('ERR_NOT_FOUND', `Branch not found: ${input.branchId}`)
        if (latest.deletedAt != null) throw new DbWorkerError('ERR_INVALID', `Branch is deleted: ${input.branchId}`)
        if (!latest.headMessageId) throw new DbWorkerError('ERR_INVALID', `Branch has no head: ${input.branchId}`)

        // Guardrail (DB-side safety boundary): do not mutate branch while head is streaming.
        const latestHeadStatus = rt.db.prepare(`SELECT status FROM message WHERE id=@id LIMIT 1`).get({ id: latest.headMessageId }) as any
        if (String(latestHeadStatus?.status ?? 'final') === 'streaming') {
          throw new DbWorkerError('ERR_INVALID', 'Branch is streaming; abort the run before editing questions')
        }

        // Branch-local terminal check (DB-side safety boundary): oldQuestion must be the last user in the current head->root path.
        const pathInTxn = rt.branchRepo.getPathMessages(input.branchId, 5000)
        if (pathInTxn.length === 0) throw new DbWorkerError('ERR_INVALID', `Branch path is empty: ${input.branchId}`)
        let lastUserIdInTxn: string | null = null
        for (let i = pathInTxn.length - 1; i >= 0; i -= 1) {
          if (String((pathInTxn[i] as any).role ?? '').trim() === 'user') {
            lastUserIdInTxn = String((pathInTxn[i] as any).id ?? '')
            break
          }
        }
        if (!lastUserIdInTxn || lastUserIdInTxn !== oldQuestionId) {
          throw new DbWorkerError('ERR_INVALID', 'Replace question is only allowed on the last question of the current branch')
        }

        // Strict terminal condition (DB-side safety boundary):
        // - Allow when head == oldQuestionId (question has no answer yet), OR
        // - Allow when head is within the chosen answer group for oldQuestionId.
        // Chosen group definition is fixed to branchRepo.ensureChoice(branchId, questionId), which:
        // - Uses existing branch_choice when present, OR
        // - Chooses a default answer root (branch-aware; excludes hidden candidates) and persists it.
        if (latest.headMessageId !== oldQuestionId) {
          const chosen = rt.branchRepo.ensureChoice(input.branchId, oldQuestionId)
          if (!chosen) {
            throw new DbWorkerError('ERR_INVALID', 'Replace question requires either head==question (no answer yet) or a chosen answer group')
          }

          const headGroup = getHeadGrouping.get({ id: latest.headMessageId }) as { questionId?: string | null; answerRootId?: string | null } | undefined
          const headQuestionId = headGroup?.questionId ? String(headGroup.questionId) : null
          const headAnswerRootId = headGroup?.answerRootId ? String(headGroup.answerRootId) : null

          if (headQuestionId !== oldQuestionId || headAnswerRootId !== chosen) {
            throw new DbWorkerError('ERR_INVALID', 'Replace question is only allowed when branch head is within the chosen answer group')
          }
        }

        const now = Date.now()
        // Enforce a single hide record per (branch_id, question_id) even if callers accidentally pass mismatched base keys.
        deleteHideAnyBase.run({ branchId: input.branchId, questionId: oldQuestionId })
        upsertHide.run({
          branchId: input.branchId,
          baseMessageId: baseKey,
          questionId: oldQuestionId,
          hidden: 1,
          updatedAt: now,
        })

        const question = rt.messageRepo.append({
          convoId: branch.convoId,
          role: 'user',
          body: newBody,
          parentId: baseMessageId,
        })

        const questionDoc = rt.loadMessageSearchDoc(question.id)
        if (questionDoc) {
          rt.searchRepo.upsertDoc(questionDoc)
        }

        const assistant = rt.messageRepo.append({
          convoId: branch.convoId,
          role: 'assistant',
          body: '',
          parentId: question.id,
          status: 'streaming',
        })

        rt.branchRepo.setChoice(input.branchId, question.id, assistant.id)
        rt.branchRepo.setHead(input.branchId, assistant.id)

        return {
          ok: true as const,
          branchId: input.branchId,
          baseMessageId,
          newQuestionId: question.id,
          newQuestionSeq: question.seq,
          assistantId: assistant.id,
          assistantSeq: assistant.seq,
        }
      })

      return txn()
    })

  register('branch.truncateFromQuestion', (raw) => {
      const input = TruncateBranchFromQuestionSchema.parse(raw)
      return rt.branchRepo.truncateFromQuestion(input.branchId, input.questionId)
    })

  register('branch.setHead', (raw) => {
      const input = SetBranchHeadSchema.parse(raw)
      return rt.branchRepo.setHead(input.branchId, input.headMessageId)
    })

  register('branchChoice.set', (raw) => {
      const input = SetBranchChoiceSchema.parse(raw)
      return rt.branchRepo.setChoice(input.branchId, input.questionId, input.chosenAnswerRootId)
    })

  register('branchAnswerHide.set', (raw) => {
      const input = SetBranchAnswerHideSchema.parse(raw)
      return rt.branchRepo.setAnswerHide(input.branchId, input.questionId, input.answerRootId, input.hidden)
    })

  register('branch.retryReplaceAnswer', (raw) => {
      const input = RetryReplaceAnswerSchema.parse(raw)
      const branch = rt.branchRepo.get(input.branchId)
      if (!branch?.convoId) {
        throw new DbWorkerError('ERR_NOT_FOUND', `Branch not found: ${input.branchId}`)
      }

      if (debugDbOps) {
        const beforeChoice = rt.db
          .prepare(`SELECT chosen_answer_root_id AS chosen FROM branch_choice WHERE branch_id=@branchId AND question_id=@questionId LIMIT 1`)
          .get({ branchId: input.branchId, questionId: input.questionId }) as any
        const beforeHide = rt.db
          .prepare(
            `SELECT hidden FROM branch_answer_hide WHERE branch_id=@branchId AND question_id=@questionId AND answer_root_id=@answerRootId LIMIT 1`
          )
          .get({ branchId: input.branchId, questionId: input.questionId, answerRootId: input.currentAnswerRootId }) as any
        dbgDb('branch.retryReplaceAnswer:before', {
          branchId: input.branchId,
          questionId: input.questionId,
          currentAnswerRootId: input.currentAnswerRootId,
          headMessageId: branch.headMessageId ?? null,
          chosenAnswerRootId: beforeChoice?.chosen ? String(beforeChoice.chosen) : null,
          currentHidden: beforeHide?.hidden != null ? Number(beforeHide.hidden) : null,
        })
      }

      const txn = rt.db.transaction(() => {
        // Validate terminal conditions (no follow-up question, head within group, etc.)
        rt.branchRepo.canRetryReplace(input.branchId, input.questionId, input.currentAnswerRootId)

        // Hide the old answer root for this branch (branch-local).
        rt.branchRepo.setAnswerHide(input.branchId, input.questionId, input.currentAnswerRootId, true)

        // Create a new answer variant root under the same question.
        const created = rt.messageRepo.append({
          convoId: branch.convoId,
          role: 'assistant',
          body: '',
          parentId: input.questionId,
          status: 'streaming',
        })

        // Choose the new answer root and move head to it.
        rt.branchRepo.setChoice(input.branchId, input.questionId, created.id)
        rt.branchRepo.setHead(input.branchId, created.id)

        return { ok: true, newAnswerRootId: created.id, newMessageId: created.id, newAssistantSeq: created.seq }
      })

      const out = txn()
      if (debugDbOps) {
        const afterChoice = rt.db
          .prepare(`SELECT chosen_answer_root_id AS chosen FROM branch_choice WHERE branch_id=@branchId AND question_id=@questionId LIMIT 1`)
          .get({ branchId: input.branchId, questionId: input.questionId }) as any
        const afterHead = rt.db.prepare(`SELECT head_message_id AS head FROM branch WHERE id=@branchId LIMIT 1`).get({ branchId: input.branchId }) as any
        const hiddenRows = rt.db
          .prepare(
            `SELECT answer_root_id AS answerRootId, hidden FROM branch_answer_hide WHERE branch_id=@branchId AND question_id=@questionId ORDER BY updated_at DESC LIMIT 5`
          )
          .all({ branchId: input.branchId, questionId: input.questionId }) as any[]
        dbgDb('branch.retryReplaceAnswer:after', {
          branchId: input.branchId,
          questionId: input.questionId,
          newAnswerRootId: out.newAnswerRootId,
          newAssistantSeq: out.newAssistantSeq,
          headMessageId: afterHead?.head ? String(afterHead.head) : null,
          chosenAnswerRootId: afterChoice?.chosen ? String(afterChoice.chosen) : null,
          recentHides: hiddenRows.map((r) => ({ answerRootId: String(r.answerRootId), hidden: Number(r.hidden) })),
        })
      }
      return out
    })

  register('branchFilter.set', (raw) => {
      const input = SetBranchFilterSchema.parse(raw)
      return rt.branchRepo.setFilter(input.branchId, input.targetType, input.targetId, input.mode)
    })

  register('branchFilter.clear', (raw) => {
      const input = ClearBranchFilterSchema.parse(raw)
      return rt.branchRepo.clearFilter(input.branchId, input.targetType, input.targetId)
    })

  register('context.buildForBranch', (raw) => {
      const input = BuildContextForBranchSchema.parse(raw)
      return rt.contextRepo.buildForBranch(input.branchId, { limit: input.limit, debug: input.debug })
    })

  register('context.getRenderableTurns', (raw) => {
      const input = GetRenderableTurnsSchema.parse(raw)
      return rt.contextRepo.getRenderableTurns(input.branchId, { limit: input.limit, debug: input.debug })
    })


}



