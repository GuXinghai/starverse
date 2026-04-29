import {
  decodeMessageAttachmentListResponse,
  type DecodedMessageAttachment,
} from '@/next/ipc/contracts/dbBridgeContracts'

type DbBridge = Readonly<{
  invoke: (method: string, params?: unknown) => Promise<unknown>
}>

function getDbBridge(): DbBridge | null {
  const bridge = (globalThis as any).dbBridge as DbBridge | undefined
  return bridge && typeof bridge.invoke === 'function' ? bridge : null
}

function requireDbBridge(): DbBridge {
  const bridge = getDbBridge()
  if (!bridge) throw new Error('Missing dbBridge')
  return bridge
}

function normalizeAttachmentRows(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object' && Array.isArray((raw as any).attachments)) return (raw as any).attachments
  return []
}

export async function listMessageAttachmentsByMessageId(messageId: string): Promise<DecodedMessageAttachment[]> {
  const id = String(messageId ?? '').trim()
  if (!id) return []

  const raw = await requireDbBridge().invoke('messageAttachment.listByMessageId', { messageId: id })
  return decodeMessageAttachmentListResponse(normalizeAttachmentRows(raw))
}

export async function listMessageAttachmentsByMessageIds(messageIds: ReadonlyArray<string>): Promise<DecodedMessageAttachment[]> {
  const ids = Array.from(new Set(messageIds.map((item) => String(item ?? '').trim()).filter((item) => item.length > 0)))
  if (ids.length === 0) return []

  const rows = await Promise.all(
    ids.map(async (messageId) => {
      try {
        return await listMessageAttachmentsByMessageId(messageId)
      } catch {
        return []
      }
    }),
  )
  return rows.flat()
}
