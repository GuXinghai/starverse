type DbBridge = Readonly<{
  invoke: (method: string, params?: unknown) => Promise<any>
}>

function getDbBridge(): DbBridge | null {
  const bridge = (globalThis as any).dbBridge as DbBridge | undefined
  return bridge && typeof bridge.invoke === 'function' ? bridge : null
}

export type ProjectSummary = Readonly<{
  id: string
  name: string
  createdAt: number
  updatedAt: number
  meta?: Record<string, unknown> | null
}>

export async function listProjects(params?: Readonly<{ limit?: number; offset?: number; order?: 'updatedAt' | 'createdAt' | 'name' }>): Promise<ProjectSummary[]> {
  const bridge = getDbBridge()
  if (!bridge) return []

  const rows = await bridge.invoke('project.list', params ?? {})
  if (!Array.isArray(rows)) return []

  return rows
    .map((r: any) => {
      const id = String(r?.id ?? '').trim()
      const name = String(r?.name ?? '').trim()
      const createdAt = typeof r?.createdAt === 'number' ? r.createdAt : 0
      const updatedAt = typeof r?.updatedAt === 'number' ? r.updatedAt : createdAt
      const meta = r?.meta && typeof r.meta === 'object' ? (r.meta as Record<string, unknown>) : null
      return { id, name, createdAt, updatedAt, meta } satisfies ProjectSummary
    })
    .filter((p) => p.id.length > 0 && p.name.length > 0)
}

function requireDbBridge(): DbBridge {
  const bridge = getDbBridge()
  if (!bridge) throw new Error('Missing dbBridge')
  return bridge
}

export async function findProjectById(projectId: string): Promise<ProjectSummary | null> {
  const bridge = getDbBridge()
  if (!bridge) return null
  const id = String(projectId ?? '').trim()
  if (!id) return null
  const row = await bridge.invoke('project.findById', { id })
  if (!row || typeof row !== 'object') return null
  const name = String((row as any).name ?? '').trim()
  const createdAt = typeof (row as any).createdAt === 'number' ? (row as any).createdAt : 0
  const updatedAt = typeof (row as any).updatedAt === 'number' ? (row as any).updatedAt : createdAt
  const meta = (row as any).meta && typeof (row as any).meta === 'object' ? ((row as any).meta as Record<string, unknown>) : null
  if (!name) return null
  return { id, name, createdAt, updatedAt, meta }
}

export async function saveProject(input: Readonly<{ id: string; name: string; meta?: unknown; createdAt?: number; updatedAt?: number }>): Promise<boolean> {
  const bridge = requireDbBridge()
  const id = String(input.id ?? '').trim()
  if (!id) throw new Error('Missing project id')
  const name = String(input.name ?? '').trim()
  if (!name) throw new Error('Missing project name')

  const payload: any = { id, name }
  if (input.createdAt !== undefined) payload.createdAt = input.createdAt
  if (input.updatedAt !== undefined) payload.updatedAt = input.updatedAt
  if (input.meta !== undefined) payload.meta = input.meta

  const r = await bridge.invoke('project.save', payload)
  return !!(r && typeof r === 'object' && 'ok' in r ? (r as any).ok : true)
}

