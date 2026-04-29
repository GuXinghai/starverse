/* eslint-disable max-lines-per-function, max-statements, complexity, max-depth */
import type { DbWorkerRuntime } from '../runtime'
import type { RegisterHandler } from './types'
import { DbWorkerError } from '../../errors'
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
      const branch = rt.branchRepo.get(input.branchId)
      if (!branch?.convoId) {
        throw new DbWorkerError('ERR_NOT_FOUND', `Branch not found: ${input.branchId}`)
      }
      if (branch.deletedAt != null) {
        throw new DbWorkerError('ERR_INVALID', `Branch is deleted: ${input.branchId}`)
      }

      const txn = rt.db.transaction(() => {
        const latest = rt.branchRepo.get(input.branchId)
        if (!latest?.convoId) throw new DbWorkerError('ERR_NOT_FOUND', `Branch not found: ${input.branchId}`)
        if (latest.deletedAt != null) throw new DbWorkerError('ERR_INVALID', `Branch is deleted: ${input.branchId}`)

        const question = rt.messageRepo.append({
          convoId: latest.convoId,
          role: 'user',
          body: input.userBody,
          ...(input.userMeta !== undefined ? { meta: input.userMeta } : {}),
          parentId: latest.headMessageId,
        })

        const questionDoc = rt.loadMessageSearchDoc(question.id)
        if (questionDoc) {
          rt.searchRepo.upsertDoc(questionDoc)
        }

        if (input.attachConversationDraft === true) {
          rt.conversationAttachmentService.attachDraftToMessage({
            conversationId: latest.convoId,
            messageId: question.id,
            ...(input.sentAssetIds && input.sentAssetIds.length > 0 ? { sentAssetIds: input.sentAssetIds } : {}),
          })
        }

        const assistant = rt.messageRepo.append({
          convoId: latest.convoId,
          role: 'assistant',
          body: '',
          parentId: question.id,
          status: 'streaming',
        })

        rt.branchRepo.setChoice(input.branchId, question.id, assistant.id)
        rt.branchRepo.setHead(input.branchId, assistant.id)

        return {
          ok: true as const,
          convoId: latest.convoId,
          branchId: input.branchId,
          questionId: question.id,
          questionSeq: question.seq,
          assistantId: assistant.id,
          assistantSeq: assistant.seq,
        }
      })

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



