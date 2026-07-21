import { describe, expect, it, vi } from 'vitest'
import { buildCompatibleCatalogModelKey, createCompatibleCatalogClient } from './compatibleCatalogClient'

describe('compatibleCatalogClient', () => {
  it('keeps provider instance in the stable picker/query identity', () => {
    expect(buildCompatibleCatalogModelKey({ providerInstanceId: 'ocp_provider_12345678', modelId: 'same/model' }))
      .not.toBe(buildCompatibleCatalogModelKey({ providerInstanceId: 'ocp_provider_abcdefgh', modelId: 'same/model' }))
  })

  it('rejects a bridge response from another provider scope', async () => {
    const bridge = {
      queryModels: vi.fn(async () => ({ ok: true, value: {
        protocolKey: 'openai_chat_compatible' as const,
        providerInstanceId: 'ocp_provider_abcdefgh', providerName: 'B', providerStatus: 'active' as const,
        syncState: null, total: 0, items: [],
      } })),
    }
    const client = createCompatibleCatalogClient(bridge as any)
    await expect(client.query({ providerInstanceId: 'ocp_provider_12345678' })).rejects.toThrow('compatible_catalog_scope_mismatch')
  })

  it('sends only stable identity and query controls to the preload bridge', async () => {
    const queryModels = vi.fn(async (payload) => ({ ok: true, value: {
      protocolKey: 'openai_chat_compatible' as const,
      providerInstanceId: payload.providerInstanceId,
      providerName: 'A', providerStatus: 'active' as const, syncState: null, total: 0, items: [],
    } }))
    const client = createCompatibleCatalogClient({ queryModels } as any)
    await client.query({ providerInstanceId: 'ocp_provider_12345678', search: 'model', limit: 20 })
    expect(queryModels).toHaveBeenCalledWith({ providerInstanceId: 'ocp_provider_12345678', search: 'model', includeStale: false, offset: 0, limit: 20 })
    expect(JSON.stringify(queryModels.mock.calls)).not.toMatch(/baseUrl|credential|headers|body/iu)
  })
})
