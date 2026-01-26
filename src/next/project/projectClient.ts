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
      return { id, name, createdAt, updatedAt } satisfies ProjectSummary
    })
    .filter((p) => p.id.length > 0 && p.name.length > 0)
}

