/**
 * Vitest 测试环境全局设置
 */

import '@testing-library/jest-dom/vitest'
import { beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { config } from '@vue/test-utils'

type DbInvoke = <T = unknown>(method: string, params?: unknown) => Promise<T>

const createDbBridgeMock = () => {
  const convos = new Map<string, any>()
  const projects = new Map<string, any>()
  const messagesByConvo = new Map<string, any[]>()

  const invoke: DbInvoke = async (method, params) => {
    switch (method) {
      case 'health.ping':
        return { ok: true } as any
      case 'health.stats':
        return { ok: true } as any

      case 'project.list':
        return Array.from(projects.values()) as any
      case 'project.create': {
        const payload = params as any
        const record = { id: payload?.id ?? `project-${projects.size + 1}`, ...payload }
        projects.set(record.id, record)
        return record as any
      }
      case 'project.save':
      case 'project.delete':
      case 'project.countConversations':
        return { ok: true, count: 0 } as any
      case 'project.findById':
      case 'project.findByName':
        return null as any

      case 'convo.create': {
        const payload = params as any
        const record = { id: payload?.id ?? `convo-${convos.size + 1}`, ...payload }
        convos.set(record.id, record)
        if (!messagesByConvo.has(record.id)) messagesByConvo.set(record.id, [])
        return record as any
      }
      case 'convo.save':
      case 'convo.saveWithMessages':
      case 'convo.archive':
      case 'convo.restore':
        return { ok: true } as any
      case 'convo.list':
        return Array.from(convos.values()) as any
      case 'convo.delete': {
        const payload = params as any
        const id = payload?.id
        if (id) convos.delete(id)
        if (id) messagesByConvo.delete(id)
        return { ok: true } as any
      }
      case 'convo.deleteMany':
        return { deleted: 0 } as any
      case 'convo.archiveMany':
        return { archived: 0, failed: [] } as any
      case 'convo.listArchived':
        return [] as any

      case 'message.append':
        return { ok: true } as any
      case 'message.appendDelta':
        return { ok: true } as any
      case 'message.list': {
        const payload = params as any
        return (messagesByConvo.get(payload?.convoId) ?? []) as any
      }
      case 'message.replace':
        return { ok: true } as any

      case 'search.fulltext':
        return [] as any
      case 'maintenance.optimize':
        return { ok: true } as any

      // Usage statistics are unit-tested elsewhere; return safe defaults.
      case 'usage.log':
        return { ok: true } as any
      case 'usage.getProjectStats':
      case 'usage.getConvoStats':
      case 'usage.getModelStats':
      case 'usage.getDateRangeStats':
        return [] as any
      case 'usage.aggregate':
      case 'usage.reasoningTrend':
      case 'usage.reasoningModelComparison':
        return { data: [] } as any
      case 'usage.drillDown':
        return { data: [] } as any
      case 'prefs.save':
        return { id: 'pref-1' } as any
      case 'prefs.list':
        return { data: [] } as any
      case 'prefs.delete':
        return { deleted: 0 } as any
      case 'prefs.default':
        return null as any

      default:
        return { ok: true } as any
    }
  }

  return {
    invoke: vi.fn(invoke)
  }
}

// Mock Electron preload bridges expected by src/utils/electronBridge.ts
const w = window as any
w.electronStore = {
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => true),
  delete: vi.fn(async () => true)
}

w.electronAPI = {
  selectImage: vi.fn(async () => null),
  selectFile: vi.fn(async () => null),
  openExternal: vi.fn(async () => ({ success: true })),
  openInAppLink: vi.fn(async () => ({ tabId: undefined, windowId: undefined }))
}

w.ipcRenderer = {
  on: vi.fn(),
  off: vi.fn(),
  send: vi.fn(),
  invoke: vi.fn(async () => undefined)
}

w.dbBridge = createDbBridgeMock()

// Keep legacy mock shape for older tests that still reference window.electron
w.electron = {
  store: w.electronStore,
  api: w.electronAPI,
  ipc: w.ipcRenderer,
  db: w.dbBridge
}

// 配置 Vue Test Utils
config.global.mocks = {
  $electron: (global.window as any).electron
}

// 每个测试前重置所有 mocks
beforeEach(() => {
  vi.clearAllMocks()

  // Ensure Pinia is active for all tests (including component setup()).
  setActivePinia(createPinia())
})

// Default fetch stub: fail fast on unexpected real network.
// Individual tests can override with vi.stubGlobal('fetch', ...)
if (typeof (globalThis as any).fetch === 'function') {
  vi.stubGlobal('fetch', vi.fn(async (input: any) => {
    throw new Error(`[tests] Unexpected fetch call: ${String(input)}`)
  }))
}
