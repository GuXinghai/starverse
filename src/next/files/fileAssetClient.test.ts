import { afterEach, describe, expect, it, vi } from 'vitest'
import { listFileAssetsByIds } from './fileAssetClient'

describe('fileAssetClient', () => {
  const originalDbBridge = (globalThis as any).dbBridge

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
    vi.restoreAllMocks()
  })

  it('calls fileAsset.listByIds through dbBridge', async () => {
    const invoke = vi.fn(async () => [
      {
        id: 'asset-1',
        sha256: 'sha',
        filename: 'report.pdf',
        extension: 'pdf',
        mime: 'application/pdf',
        sizeBytes: 12,
        assetKind: 'document',
        sourceKind: 'local_upload',
        storageBackend: 'local_fs',
        storageUri: 'assets/original/as/asset-1.pdf',
        ingestStatus: 'stored',
        previewStatus: 'not_requested',
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
      },
    ])
    ;(globalThis as any).dbBridge = { invoke }

    const result = await listFileAssetsByIds(['asset-1'])

    expect(invoke).toHaveBeenCalledWith('fileAsset.listByIds', { ids: ['asset-1'] })
    expect(result[0]?.filename).toBe('report.pdf')
  })
})
