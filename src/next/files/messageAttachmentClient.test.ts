import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  listMessageAttachmentsByMessageId,
  listMessageAttachmentsByMessageIds,
} from './messageAttachmentClient'

describe('messageAttachmentClient', () => {
  const originalDbBridge = (globalThis as any).dbBridge

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
    vi.restoreAllMocks()
  })

  it('calls messageAttachment.listByMessageId through dbBridge', async () => {
    const invoke = vi.fn(async () => [
      {
        id: 'att-1',
        messageId: 'm1',
        assetId: 'asset-1',
        aiPayloadKind: 'pdf',
        processingStatus: 'native_supported',
        includeInNextRequest: true,
        excludedReason: null,
        createdAt: 1,
        updatedAt: 1,
      },
    ])
    ;(globalThis as any).dbBridge = { invoke }

    const result = await listMessageAttachmentsByMessageId('m1')

    expect(invoke).toHaveBeenCalledWith('messageAttachment.listByMessageId', { messageId: 'm1' })
    expect(result[0]?.assetId).toBe('asset-1')
  })

  it('deduplicates message ids before querying attachments', async () => {
    const invoke = vi.fn(async (_method: string, params?: any) => [
      {
        id: `att-${String(params?.messageId ?? 'm1')}`,
        messageId: String(params?.messageId ?? 'm1'),
        assetId: 'asset-1',
        aiPayloadKind: 'text',
        processingStatus: 'native_supported',
        includeInNextRequest: true,
        excludedReason: null,
        createdAt: 1,
        updatedAt: 1,
      },
    ])
    ;(globalThis as any).dbBridge = { invoke }

    const result = await listMessageAttachmentsByMessageIds(['m1', 'm1', 'm2'])

    expect(invoke).toHaveBeenCalledTimes(2)
    expect(result.length).toBe(2)
  })
})
