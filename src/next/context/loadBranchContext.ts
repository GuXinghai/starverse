import { listBranchPathMessages, type BranchPathMessage } from '@/next/branch/branchClient'
import type { InternalMessage } from './buildMessages'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function extractContentBlocksFromMeta(meta: unknown): InternalMessage['contentBlocks'] | undefined {
  const obj = asRecord(meta)
  const raw = obj?.contentBlocks
  if (!Array.isArray(raw)) return undefined

  const blocks: any[] = []
  for (const b of raw) {
    if (!b || typeof b !== 'object') continue
    const type = String((b as any).type ?? '')
    if (!type) continue

    if (type === 'text') {
      blocks.push({ type: 'text', text: String((b as any).text ?? '') })
      continue
    }

    if (type === 'image' && typeof (b as any).url === 'string') {
      blocks.push({ type: 'image_url', image_url: { url: String((b as any).url ?? '') } })
      continue
    }

    if (type === 'image_url' && typeof (b as any).image_url?.url === 'string') {
      blocks.push(b)
      continue
    }

    blocks.push(b)
  }

  return blocks.length > 0 ? (blocks as any) : undefined
}

function extractToolMeta(meta: unknown): Pick<InternalMessage, 'toolCalls' | 'toolCallId' | 'toolName' | 'reasoningDetailsRaw'> {
  const obj = asRecord(meta)
  const toolCalls = Array.isArray(obj?.toolCalls) ? (obj?.toolCalls as any[]) : undefined
  const toolCallId = typeof obj?.toolCallId === 'string' ? String(obj.toolCallId) : undefined
  const toolName = typeof obj?.toolName === 'string' ? String(obj.toolName) : undefined
  const reasoningDetailsRaw = Array.isArray(obj?.reasoningDetailsRaw) ? (obj?.reasoningDetailsRaw as any[]) : undefined
  return { toolCalls, toolCallId, toolName, reasoningDetailsRaw }
}

export function toInternalMessagesFromBranchPath(rows: ReadonlyArray<BranchPathMessage>): InternalMessage[] {
  const out: InternalMessage[] = []

  for (const row of rows) {
    const roleRaw = String(row.role ?? '').trim()
    if (roleRaw !== 'user' && roleRaw !== 'assistant' && roleRaw !== 'tool') continue

    const body = typeof row.body === 'string' ? row.body : String((row as any).body ?? '')
    const contentBlocks = extractContentBlocksFromMeta(row.meta)

    const isEmptyText = body.trim().length === 0
    const isEmptyBlocks = !contentBlocks || contentBlocks.length === 0

    const metaBits = extractToolMeta(row.meta)
    const hasMeaningfulMeta =
      (Array.isArray(metaBits.toolCalls) && metaBits.toolCalls.length > 0) ||
      typeof metaBits.toolCallId === 'string' ||
      typeof metaBits.toolName === 'string' ||
      (Array.isArray(metaBits.reasoningDetailsRaw) && metaBits.reasoningDetailsRaw.length > 0)

    if (roleRaw === 'assistant' && isEmptyText && isEmptyBlocks && !hasMeaningfulMeta) {
      continue
    }

    out.push({
      role: roleRaw,
      ...(contentBlocks ? { contentBlocks } : { contentText: body }),
      ...metaBits,
    })
  }

  return out
}

export async function loadBranchContextMessages(branchId: string, params?: Readonly<{ limit?: number }>): Promise<InternalMessage[]> {
  const rows = await listBranchPathMessages(branchId, { limit: params?.limit ?? 200 })
  return toInternalMessagesFromBranchPath(rows)
}
