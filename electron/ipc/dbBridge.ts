import { ipcMain } from 'electron'
import type { DbMethod } from '../../infra/db/types'
import { DbWorkerError } from '../../infra/db/errors'
import { DbWorkerManager } from '../db/workerManager'

const allowedMethods: DbMethod[] = [
  // Health
  'health.ping',
  
  // Project Management
  'project.create',
  'project.save',
  'project.list',
  'project.delete',
  'project.findById',
  'project.findByName',
  'project.countConversations',
  
  // Conversation Management
  'convo.create',
  'convo.save',
  'convo.list',
  'convo.delete',
  
  // Message Management
  'message.append',
  'message.list',
  'message.replace',
  
  // Search
  'search.fulltext',
  
  // Maintenance
  'maintenance.optimize'
]

type InvokePayload = {
  method: DbMethod
  params?: unknown
}

export const registerDbBridge = (manager: DbWorkerManager) => {
  const allowSet = new Set<DbMethod>(allowedMethods)

  ipcMain.handle('db:invoke', async (_event, payload: InvokePayload) => {
    if (!payload || typeof payload !== 'object') {
      throw new DbWorkerError('ERR_VALIDATION', 'Invalid DB IPC payload')
    }

    if (!allowSet.has(payload.method)) {
      throw new DbWorkerError('ERR_NOT_FOUND', `Method not allowed: ${payload.method}`)
    }

    return manager.call(payload.method, payload.params)
  })
}
