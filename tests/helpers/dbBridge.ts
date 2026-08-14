import { vi } from 'vitest'

type DbInvoke = <T = unknown>(method: string, params?: unknown) => Promise<T>

/**
 * Creates the small in-memory dbBridge authority used by renderer and node
 * tests.  It intentionally implements only deterministic test semantics; no
 * sqlite connection is opened by the Vitest harness.
 */
export function createDbBridgeMock() {
  const convos = new Map<string, any>()
  const projects = new Map<string, any>()
  const messagesByConvo = new Map<string, any[]>()

  const invoke: DbInvoke = async (method, params) => {
    switch (method) {
      case 'health.ping':
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
      case 'message.appendDelta':
      case 'message.replace':
        return { ok: true } as any
      case 'message.list': {
        const payload = params as any
        return (messagesByConvo.get(payload?.convoId) ?? []) as any
      }

      case 'search.fulltext':
        return [] as any
      case 'maintenance.optimize':
        return { ok: true } as any

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

  return { invoke: vi.fn(invoke) }
}

/** Install a fresh mock on globalThis and return it for test-specific setup. */
export function installDbBridgeMock() {
  const bridge = createDbBridgeMock()
  ;(globalThis as any).dbBridge = bridge
  return bridge
}

export const installDbBridge = installDbBridgeMock
