export type PersistedMessageRole = 'user' | 'assistant' | 'tool' | 'notice' | 'openrouter' | string

export type PersistedMessage = Readonly<{
  id: string
  convoId: string
  role: PersistedMessageRole
  seq: number
  createdAt: number
  body: string
  meta: unknown
}>

type DbBridge = Readonly<{
  invoke: (method: string, params?: unknown) => Promise<any>
}>

function getDbBridge(): DbBridge | null {
  const bridge = (globalThis as any).dbBridge as DbBridge | undefined
  return bridge && typeof bridge.invoke === 'function' ? bridge : null
}

export async function listMessages(
  convoId: string,
  params?: Readonly<{ fromSeq?: number; limit?: number; direction?: 'asc' | 'desc' }>
): Promise<PersistedMessage[]> {
  const bridge = getDbBridge()
  if (!bridge) return []

  const cid = String(convoId ?? '').trim()
  if (!cid) return []

  const rows = await bridge.invoke('message.list', { convoId: cid, ...(params ?? {}) })
  if (!Array.isArray(rows)) return []

  return rows
    .map((r: any) => {
      const id = String(r?.id ?? '').trim()
      const c = String(r?.convoId ?? '').trim()
      const role = String(r?.role ?? '').trim()
      const seq = typeof r?.seq === 'number' ? r.seq : NaN
      const createdAt = typeof r?.createdAt === 'number' ? r.createdAt : 0
      const body = typeof r?.body === 'string' ? r.body : String(r?.body ?? '')
      const meta = r?.meta ?? null
      return { id, convoId: c, role, seq, createdAt, body, meta } satisfies PersistedMessage
    })
    .filter((m) => m.id.length > 0 && m.convoId.length > 0 && Number.isFinite(m.seq))
    .sort((a, b) => a.seq - b.seq)
}

