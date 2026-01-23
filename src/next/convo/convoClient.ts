type DbBridge = Readonly<{
  invoke: (method: string, params?: unknown) => Promise<any>
}>

function getDbBridge(): DbBridge | null {
  const bridge = (globalThis as any).dbBridge as DbBridge | undefined
  return bridge && typeof bridge.invoke === 'function' ? bridge : null
}

export type ConvoSummary = Readonly<{
  id: string
  title: string
  createdAt: number
  updatedAt: number
}>

export async function listConvos(params?: Readonly<{ limit?: number; offset?: number; order?: 'updatedAt' | 'createdAt' }>): Promise<ConvoSummary[]> {
  const bridge = getDbBridge()
  if (!bridge) return []

  const rows = await bridge.invoke('convo.list', params ?? {})
  if (!Array.isArray(rows)) return []

  return rows
    .map((r: any) => {
      const id = String(r?.id ?? '').trim()
      const title = String(r?.title ?? '').trim()
      const createdAt = typeof r?.createdAt === 'number' ? r.createdAt : 0
      const updatedAt = typeof r?.updatedAt === 'number' ? r.updatedAt : createdAt
      return { id, title, createdAt, updatedAt } satisfies ConvoSummary
    })
    .filter((x) => x.id.length > 0 && x.title.length > 0)
}

export async function createConvo(input: Readonly<{ title: string; projectId?: string | null }>): Promise<ConvoSummary | null> {
  const bridge = getDbBridge()
  if (!bridge) return null

  const title = String(input.title ?? '').trim()
  if (title.length === 0) return null

  const r = await bridge.invoke('convo.create', { title, ...(input.projectId !== undefined ? { projectId: input.projectId } : {}) })
  const id = String(r?.id ?? '').trim()
  const createdAt = typeof r?.createdAt === 'number' ? r.createdAt : Date.now()
  const updatedAt = typeof r?.updatedAt === 'number' ? r.updatedAt : createdAt
  if (!id) return null
  return { id, title, createdAt, updatedAt }
}

