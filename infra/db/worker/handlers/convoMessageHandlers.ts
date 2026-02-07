/* eslint-disable max-lines-per-function, max-statements, complexity, max-depth */
import type { DbWorkerRuntime } from '../../worker'
import type { RegisterHandler } from './types'
import { DbWorkerError } from '../../errors'
import {
  CreateConvoSchema,
  SaveConvoSchema,
  SaveConvoWithMessagesSchema,
  DeleteConvoSchema,
  ArchiveConvoSchema,
  RestoreConvoSchema,
  SetConvoProjectSchema,
  SetConvoProjectManySchema,
  ListArchivedSchema,
  ListConvoSchema,
  AppendMessageSchema,
  AppendMessageDeltaSchema,
  SetMessageStatusSchema,
  UpsertMessageErrorSchema,
  ListMessageErrorByIdsSchema,
  AppendReasoningDetailSegmentsSchema,
  FinalizeReasoningDetailsSchema,
  SetReasoningRequestConfigSchema,
  GetReasoningSegmentsStatsSchema,
  ListMessageSchema,
  ReplaceMessagesSchema,
  BatchDeleteSchema,
} from '../../validation'
export function registerConvoMessageHandlers(register: RegisterHandler, runtime: DbWorkerRuntime) {
  const rt = runtime as any

  register('convo.create', (raw) => {
      const input = CreateConvoSchema.parse(raw)
      
      // 缺省 projectId 时默认写入 Inbox
      // undefined = 未指定 → 使用 inboxId
      // null = 显式传 null → 保留 null（不推荐，但保留能力）
      // string = 指定项目 → 使用指定值
      const effectiveProjectId = input.projectId !== undefined ? input.projectId : rt.inboxId

      const createTxn = rt.db.transaction(() => {
        const convo = rt.convoRepo.create({
          ...input,
          projectId: effectiveProjectId
        })
        const row = rt.loadConvoRow(convo.id)
        if (row) {
          rt.searchRepo.upsertDoc(rt.buildConvoSearchDocFromRow(row))
        }
        return convo
      })

      return createTxn()
    })

  register('convo.save', (raw) => {
      const input = SaveConvoSchema.parse(raw)
      const saveTxn = rt.db.transaction(() => {
        rt.convoRepo.save(input)
        const row = rt.loadConvoRow(input.id)
        if (row) {
          rt.searchRepo.upsertDoc(rt.buildConvoSearchDocFromRow(row))
          rt.searchRepo.updateProjectForConvo(row.id, row.project_id ?? null, rt.toEpochSec(row.updated_at))
        }
      })

      saveTxn()
      return { ok: true }
    })

  register('convo.saveWithMessages', (raw) => {
      const input = SaveConvoWithMessagesSchema.parse(raw)
      const messages = input.messages.map((message, index) => ({
        convoId: input.convo.id,
        role: message.role,
        body: message.body,
        createdAt: message.createdAt,
        seq: message.seq ?? index + 1,
        meta: message.meta
      }))

      const saveTxn = rt.db.transaction(() => {
        rt.convoRepo.save(input.convo)
        rt.messageRepo.replaceForConvo(input.convo.id, messages)
        const row = rt.loadConvoRow(input.convo.id)
        if (row) {
          rt.searchRepo.upsertDoc(rt.buildConvoSearchDocFromRow(row))
        }
        rt.reindexMessagesForConvo(input.convo.id)
      })

      saveTxn()
      return { ok: true }
    })

  register('convo.list', (raw) => {
      const input = ListConvoSchema.parse(raw ?? {})
      return rt.convoRepo.list(input)
    })

  register('convo.delete', (raw) => {
      const input = DeleteConvoSchema.parse(raw)
      const deleteTxn = rt.db.transaction(() => {
        rt.convoRepo.delete(input.id)
        rt.searchRepo.deleteByConvoId(input.id)
      })

      deleteTxn()
      return { ok: true }
    })

  register('convo.deleteMany', (raw) => {
      const input = BatchDeleteSchema.parse(raw)
      const deleteTxn = rt.db.transaction(() => {
        const deleted = rt.convoRepo.deleteMany(input.ids)
        for (const id of input.ids) {
          rt.searchRepo.deleteByConvoId(id)
        }
        return deleted
      })

      const deleted = deleteTxn()
      return { deleted }
    })

  register('convo.archive', (raw) => {
      const input = ArchiveConvoSchema.parse(raw)
      rt.convoRepo.archive(input.id)
      return { ok: true }
    })

  register('convo.archiveMany', (raw) => {
      const input = BatchDeleteSchema.parse(raw) // 复用 BatchDeleteSchema，因为参数相同
      const result = rt.convoRepo.archiveMany(input.ids)
      return result
    })

  register('convo.restore', (raw) => {
      const input = RestoreConvoSchema.parse(raw)
      const restoreTxn = rt.db.transaction(() => {
        rt.convoRepo.restore(input.id)
        const row = rt.loadConvoRow(input.id)
        if (row) {
          rt.searchRepo.upsertDoc(rt.buildConvoSearchDocFromRow(row))
        }
        rt.reindexMessagesForConvo(input.id)
      })

      restoreTxn()
      return { ok: true }
    })

  register('convo.setProject', (raw) => {
      const input = SetConvoProjectSchema.parse(raw)
      
      // 查询当前 projectId 用于事件发射
      const current = rt.db.prepare('SELECT project_id FROM convo WHERE id = ?').get(input.id) as { project_id: string | null } | undefined
      const fromProjectId = current?.project_id ?? null

      const updateTxn = rt.db.transaction(() => {
        rt.convoRepo.setProject(input.id, input.projectId)
        rt.searchRepo.updateProjectForConvo(input.id, input.projectId ?? null, rt.toEpochSec(Date.now()))
      })

      updateTxn()
      
      // 发送 conversation.moved 事件
      rt.emitEvent({
        type: 'conversation.moved',
        convoId: input.id,
        fromProjectId,
        toProjectId: input.projectId,
      })
      
      return { ok: true }
    })

  register('convo.setProjectMany', (raw) => {
      const input = SetConvoProjectManySchema.parse(raw)

      const updateTxn = rt.db.transaction(() => {
        const result = rt.convoRepo.setProjectMany(input.ids, input.projectId)
        const updatedAtSec = rt.toEpochSec(Date.now())
        for (const id of input.ids) {
          if (!result.failed.includes(id)) {
            rt.searchRepo.updateProjectForConvo(id, input.projectId ?? null, updatedAtSec)
          }
        }
        return result
      })

      const result = updateTxn()
      
      // 为每个成功移动的对话发送事件（移动不多，逐条发送可接受）
      // 注意：这里无法获取 fromProjectId，可考虑后续优化为批量查询
      for (const id of input.ids) {
        if (!result.failed.includes(id)) {
          rt.emitEvent({
            type: 'conversation.moved',
            convoId: id,
            fromProjectId: null, // 批量移动暂不追踪来源
            toProjectId: input.projectId,
          })
        }
      }
      
      return result
    })

  register('convo.listArchived', (raw) => {
      const input = ListArchivedSchema.parse(raw ?? {})
      return rt.convoRepo.listArchived(input)
    })

    // ========== Message Handlers ==========
  register('message.append', (raw) => {
      const input = AppendMessageSchema.parse(raw)
      const appendTxn = rt.db.transaction(() => {
        const result = rt.messageRepo.append(input)
        const doc = rt.loadMessageSearchDoc(result.id)
        if (doc) {
          rt.searchRepo.upsertDoc(doc)
        }
        return result
      })

      const result = appendTxn()
      rt.emitActivityUpdated(input.convoId)
      return result
    })

  register('message.appendDelta', (raw) => {
      const input = AppendMessageDeltaSchema.parse(raw)
      const result = rt.messageRepo.appendDelta(input)
      rt.emitActivityUpdated(input.convoId)
      return result
    })

  register('message.setStatus', (raw) => {
      const input = SetMessageStatusSchema.parse(raw)
      const updateTxn = rt.db.transaction(() => {
        const result = rt.messageRepo.setStatus(input)
        if (input.status === 'final') {
          const doc = rt.loadMessageSearchDoc(input.messageId)
          if (doc) {
            rt.searchRepo.upsertDoc(doc)
          }
        } else {
          // v0 语义：仅索引 final；streaming/error 视为不可搜索。
          // 归档/可见性过滤留待后续演进（如 is_visible/is_archived）。
          rt.searchRepo.deleteDoc('message', input.messageId)
        }
        return result
      })

      const result = updateTxn()
      // setStatus 需要从 messageRepo 获取 convoId
      // 由于 input 只有 messageId，需要查询获取 convoId
      const msgRow = rt.db.prepare('SELECT convo_id FROM message WHERE id = ?').get(input.messageId) as { convo_id: string } | undefined
      if (msgRow?.convo_id) {
        rt.emitActivityUpdated(msgRow.convo_id)
      }
      return result
    })

  register('messageError.upsert', (raw) => {
      const input = UpsertMessageErrorSchema.parse(raw)
      const txn = rt.db.transaction(() => {
        const result = rt.messageErrorRepo.upsert(input)
        if (input.metaPatch && typeof input.metaPatch === 'object') {
          rt.messageRepo.patchMeta({ messageId: input.messageId, patch: input.metaPatch as Record<string, unknown> })
        }
        return result
      })
      return txn()
    })

  register('messageError.listByMessageIds', (raw) => {
      const input = ListMessageErrorByIdsSchema.parse(raw)
      return rt.messageErrorRepo.listByMessageIds(input)
    })

  register('message.appendReasoningDetailSegments', (raw) => {
      const input = AppendReasoningDetailSegmentsSchema.parse(raw)
      return rt.messageRepo.appendReasoningDetailSegments(input)
    })

  register('message.finalizeReasoningDetails', (raw) => {
      const input = FinalizeReasoningDetailsSchema.parse(raw)
      return rt.messageRepo.finalizeReasoningDetails(input)
    })

  register('message.getReasoningSegmentsStats', (raw) => {
      const input = GetReasoningSegmentsStatsSchema.parse(raw)
      return rt.messageRepo.getReasoningSegmentsStats(input)
    })

  register('message.setReasoningRequestConfig', (raw) => {
      const input = SetReasoningRequestConfigSchema.parse(raw)
      return rt.messageRepo.setReasoningRequestConfig(input)
    })

  register('message.list', (raw) => {
      const input = ListMessageSchema.parse(raw)
      return rt.messageRepo.list(input)
    })

  register('message.replace', (raw) => {
      const input = ReplaceMessagesSchema.parse(raw)
      if (rt.branchRepo.hasAnyBranchForConvo(input.convoId)) {
        throw new DbWorkerError(
          'ERR_MUTATION_FORBIDDEN_ON_BRANCHING_CONVO',
          `message.replace is forbidden for branching-enabled conversations: ${input.convoId}`
        )
      }
      const messages = input.messages.map((message, index) => ({
        convoId: input.convoId,
        role: message.role,
        body: message.body,
        createdAt: message.createdAt,
        seq: message.seq ?? index + 1,
        meta: message.meta
      }))
      const replaceTxn = rt.db.transaction(() => {
        rt.messageRepo.replaceForConvo(input.convoId, messages)
        rt.reindexMessagesForConvo(input.convoId)
      })

      replaceTxn()
      return { ok: true }
    })

    // ========== Branching (read-only, Phase 4+) ==========

}



