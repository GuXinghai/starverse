import { afterEach, describe, expect, it, vi } from 'vitest'
import { ingestLocalFile, ingestUrl } from './fileIngestionClient'

describe('fileIngestionClient', () => {
  const originalDbBridge = (globalThis as any).dbBridge

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
    vi.restoreAllMocks()
  })

  it('calls fileIngestion.ingestLocalFile through dbBridge', async () => {
    const invoke = vi.fn(async () => ({
      success: true,
      sourceKind: 'local_upload',
      assetId: 'asset-1',
      normalizedExtension: 'png',
      assetKind: 'image',
      aiPayloadKind: 'image',
      processingStatus: 'native_supported',
      isNativeSupportedForMvp: true,
      isConvertibleCandidate: false,
      importStatus: 'ready',
      sendEligibilityHints: {
        canUseUrlRef: false,
        canUseLocalFile: true,
        canUseInlinePayload: true,
        urlReferenceMayStillBeUsable: false,
        notes: [],
      },
      warnings: [],
      failureReasonCode: null,
    }))
    ;(globalThis as any).dbBridge = { invoke }

    const result = await ingestLocalFile({ filePath: 'C:/tmp/a.png', mimeType: 'image/png' })

    expect(invoke).toHaveBeenCalledWith('fileIngestion.ingestLocalFile', { filePath: 'C:/tmp/a.png', mimeType: 'image/png' })
    expect(result.success).toBe(true)
    expect(result.assetId).toBe('asset-1')
  })

  it('calls fileIngestion.ingestUrl through dbBridge', async () => {
    const invoke = vi.fn(async () => ({
      success: true,
      sourceKind: 'url_import',
      assetId: 'asset-url-1',
      normalizedExtension: 'pdf',
      assetKind: 'document',
      aiPayloadKind: 'pdf',
      processingStatus: 'native_supported',
      isNativeSupportedForMvp: true,
      isConvertibleCandidate: false,
      importStatus: 'ready',
      sendEligibilityHints: {
        canUseUrlRef: true,
        canUseLocalFile: false,
        canUseInlinePayload: false,
        urlReferenceMayStillBeUsable: true,
        notes: [],
      },
      warnings: [],
      failureReasonCode: null,
      retentionMode: 'link_only',
      probeStatus: 'accessible',
      materializationStatus: 'not_requested',
      originalUrl: 'https://example.com/doc.pdf',
      resolvedUrl: 'https://example.com/doc.pdf',
    }))
    ;(globalThis as any).dbBridge = { invoke }

    const result = await ingestUrl({ url: 'https://example.com/doc.pdf', retentionMode: 'link_only' })

    expect(invoke).toHaveBeenCalledWith('fileIngestion.ingestUrl', {
      url: 'https://example.com/doc.pdf',
      retentionMode: 'link_only',
    })
    expect(result.sourceKind).toBe('url_import')
    expect(result.retentionMode).toBe('link_only')
  })
})
