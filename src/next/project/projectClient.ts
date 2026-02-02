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
  alreadyExists?: boolean
  isSystemProject?: boolean
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

/**
 * 获取系统默认项目 Inbox
 * Inbox 在 Worker 启动时自动创建，永久存在不可删除
 * @returns Inbox 项目记录，或 null（仅在 dbBridge 不可用时）
 */
export async function getInbox(): Promise<ProjectSummary | null> {
  const bridge = getDbBridge()
  if (!bridge) return null

  const row = await bridge.invoke('project.getInbox')
  if (!row || typeof row !== 'object') return null

  const id = String((row as any).id ?? '').trim()
  const name = String((row as any).name ?? '').trim()
  const createdAt = typeof (row as any).createdAt === 'number' ? (row as any).createdAt : 0
  const updatedAt = typeof (row as any).updatedAt === 'number' ? (row as any).updatedAt : createdAt
  const meta = (row as any).meta && typeof (row as any).meta === 'object' ? ((row as any).meta as Record<string, unknown>) : null

  if (!id || !name) return null
  return { id, name, createdAt, updatedAt, meta }
}

/**
 * 创建新项目
 * @returns 创建的项目记录
 */
export async function createProject(input: Readonly<{ name: string; meta?: unknown }>): Promise<ProjectSummary> {
  const bridge = requireDbBridge()
  const name = String(input.name ?? '').trim()
  if (!name) throw new Error('Missing project name')

  const payload: any = { name }
  if (input.meta !== undefined) payload.meta = input.meta

  const row = await bridge.invoke('project.create', payload)
  if (!row || typeof row !== 'object') throw new Error('Failed to create project')

  return {
    id: String((row as any).id),
    name: String((row as any).name),
    createdAt: typeof (row as any).createdAt === 'number' ? (row as any).createdAt : Date.now(),
    updatedAt: typeof (row as any).updatedAt === 'number' ? (row as any).updatedAt : Date.now(),
    meta: (row as any).meta ?? null,
    alreadyExists: (row as any).alreadyExists === true,
    isSystemProject: (row as any).isSystemProject === true,
  }
}

/**
 * 删除项目
 * 注意：系统项目（Inbox）无法删除
 * @returns 删除结果，包含 ok 和可能的错误信息
 */
export async function deleteProject(projectId: string): Promise<{ ok: boolean; error?: { code: string; message: string } }> {
  const bridge = requireDbBridge()
  const id = String(projectId ?? '').trim()
  if (!id) throw new Error('Missing project id')

  const result = await bridge.invoke('project.delete', { id })
  if (result && typeof result === 'object' && 'ok' in result) {
    return result as { ok: boolean; error?: { code: string; message: string } }
  }
  return { ok: true }
}

/**
 * 获取项目下的对话数量
 * @param projectId 项目 ID，传 null 获取未分类对话数量
 */
export async function countConversations(projectId: string | null): Promise<number> {
  const bridge = getDbBridge()
  if (!bridge) return 0

  const result = await bridge.invoke('project.countConversations', { projectId })
  if (result && typeof result === 'object' && 'count' in result) {
    return typeof (result as any).count === 'number' ? (result as any).count : 0
  }
  return 0
}

/**
 * 批量获取多个项目的对话计数（避免 N+1 查询）
 * @returns Map<projectId, count>
 */
export async function countConversationsBatch(projectIds: string[]): Promise<Map<string, number>> {
  const bridge = getDbBridge()
  if (!bridge || projectIds.length === 0) return new Map()

  const result = await bridge.invoke('project.countConversationsBatch', { projectIds })
  if (result && typeof result === 'object' && 'counts' in result) {
    const counts = (result as any).counts as Record<string, number>
    return new Map(Object.entries(counts))
  }
  return new Map()
}
