/* eslint-disable max-lines-per-function, max-statements, complexity, max-depth */
import type { DbWorkerRuntime } from '../../worker'
import type { RegisterHandler } from './types'
import {
  CreateProjectSchema,
  SaveProjectSchema,
  DeleteProjectSchema,
  ListProjectSchema,
  FindProjectByIdSchema,
  FindProjectByNameSchema,
  CountConversationsSchema,
} from '../../validation'
export function registerProjectHandlers(register: RegisterHandler, runtime: DbWorkerRuntime) {
  const rt = runtime as any

  register('health.ping', () => ({ ok: true, now: Date.now() }))
    
    // ========== Project Handlers ==========
  register('project.create', (raw) => {
      const input = CreateProjectSchema.parse(raw)
      
      // 特殊处理：禁止通过 UI 创建 Inbox（系统项目由 ensureInboxProjectData 管理）
      if (input.name.trim().toLowerCase() === 'inbox') {
        const inbox = rt.projectRepo.findById(rt.inboxId)
        if (inbox) {
          rt.searchRepo.upsertDoc(rt.buildProjectSearchDoc(inbox))
          return { ...inbox, alreadyExists: true, isSystemProject: true }
        }
      }
      
      // 检查同名项目
      const existing = rt.projectRepo.findByName(input.name)
      if (existing) {
        rt.searchRepo.upsertDoc(rt.buildProjectSearchDoc(existing))
        return { ...existing, alreadyExists: true, isSystemProject: false }
      }

      const createTxn = rt.db.transaction(() => {
        const project = rt.projectRepo.create(input)
        rt.searchRepo.upsertDoc(rt.buildProjectSearchDoc(project))
        return project
      })

      const project = createTxn()
      
      // 仅在真正创建新项目时发送事件
      rt.emitEvent({ type: 'project.created', projectId: project.id, name: project.name })
      
      return { ...project, alreadyExists: false, isSystemProject: false }
    })

  register('project.save', (raw) => {
      const input = SaveProjectSchema.parse(raw)
      const saveTxn = rt.db.transaction(() => {
        rt.projectRepo.save(input)
        const saved = rt.projectRepo.findById(input.id)
        if (saved) {
          rt.searchRepo.upsertDoc(rt.buildProjectSearchDoc(saved))
        }
      })

      saveTxn()
      
      // 发送 project.updated 事件
      rt.emitEvent({ type: 'project.updated', projectId: input.id, name: input.name })
      
      return { ok: true }
    })

  register('project.list', (raw) => {
      const input = ListProjectSchema.parse(raw ?? {})
      return rt.projectRepo.list(input)
    })

  register('project.delete', (raw) => {
      const input = DeleteProjectSchema.parse(raw)
      
      // 禁止删除系统项目（Inbox）
      if (input.id === rt.inboxId) {
        return {
          ok: false,
          error: {
            code: 'ERR_DELETE_FORBIDDEN',
            message: 'Cannot delete system project (Inbox)',
          },
        }
      }

      const deleteTxn = rt.db.transaction(() => {
        rt.projectRepo.delete(input.id)
        rt.searchRepo.deleteDoc('project', input.id)
        rt.searchRepo.clearProjectId(input.id, rt.toEpochSec(Date.now()))
      })

      deleteTxn()
      
      // 发送 project.deleted 事件
      rt.emitEvent({ type: 'project.deleted', projectId: input.id })
      
      return { ok: true }
    })

  register('project.findById', (raw) => {
      const input = FindProjectByIdSchema.parse(raw)
      return rt.projectRepo.findById(input.id)
    })

  register('project.findByName', (raw) => {
      const input = FindProjectByNameSchema.parse(raw)
      return rt.projectRepo.findByName(input.name)
    })
    
    /**
     * 获取 Inbox 项目记录
     * 渲染进程可通过此方法获取 inboxId 用于 UI 展示判断
     */
  register('project.getInbox', () => {
      return rt.projectRepo.findById(rt.inboxId)
    })

  register('project.countConversations', (raw) => {
      const input = CountConversationsSchema.parse(raw)
      return { count: rt.projectRepo.countConversations(input.projectId) }
    })
    
    /**
     * 批量获取项目的对话计数（避免 N+1 查询）
     */
  register('project.countConversationsBatch', (raw) => {
      const projectIds = (raw && typeof raw === 'object' && 'projectIds' in raw && Array.isArray((raw as any).projectIds))
        ? (raw as any).projectIds as string[]
        : []
      
      if (projectIds.length === 0) return { counts: {} }
      
      // 使用 GROUP BY 一次查询所有项目的计数
      const placeholders = projectIds.map(() => '?').join(',')
      const sql = `SELECT project_id, COUNT(*) as count FROM convo WHERE project_id IN (${placeholders}) GROUP BY project_id`
      const stmt = rt.db.prepare(sql)
      const rows = stmt.all(...projectIds) as Array<{ project_id: string; count: number }>
      
      const counts: Record<string, number> = {}
      for (const row of rows) {
        counts[row.project_id] = row.count
      }
      
      // 补充计数为0的项目
      for (const id of projectIds) {
        if (!(id in counts)) {
          counts[id] = 0
        }
      }
      
      return { counts }
    })

    // ========== Conversation Handlers ==========

}



