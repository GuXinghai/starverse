import { describe, expect, it, vi } from 'vitest'
import { buildCompatibleCatalogModelKey, createCompatibleCatalogClient } from './compatibleCatalogClient'

describe('compatibleCatalogClient', () => {
  it('keeps provider instance in the stable picker/query identity', () => {
    expect(buildCompatibleCatalogModelKey({ providerInstanceId: 'ocp_provider_12345678', modelId: 'same/model' }))
      .not.toBe(buildCompatibleCatalogModelKey({ providerInstanceId: 'ocp_provider_abcdefgh', modelId: 'same/model' }))
  })

  it('rejects a bridge response from another provider scope', async () => {
    const bridge = {
      query: vi.fn(async () => ({
        protocolKey: 'openai_chat_compatible' as const,
        providerInstanceId: 'ocp_provider_abcdefgh', providerName: 'B', providerStatus: 'active' as const,
        syncState: null, total: 0, items: [],
      })),
    }
    const client = createCompatibleCatalogClient(bridge as any)
    await expect(client.query({ providerInstanceId: 'ocp_provider_12345678' })).rejects.toThrow('compatible_catalog_scope_mismatch')
  })

  it('sends only stable identity and query controls to the preload bridge', async () => {
    const query = vi.fn(async (payload) => ({
      protocolKey: 'openai_chat_compatible' as const,
      providerInstanceId: payload.providerInstanceId,
      providerName: 'A', providerStatus: 'active' as const, syncState: null, total: 0, items: [],
    }))
    const client = createCompatibleCatalogClient({ query } as any)
    await client.query({ providerInstanceId: 'ocp_provider_12345678', search: 'model', limit: 20 })
    expect(query).toHaveBeenCalledWith({ providerInstanceId: 'ocp_provider_12345678', search: 'model', limit: 20 })
    expect(JSON.stringify(query.mock.calls)).not.toMatch(/baseUrl|credential|headers|body/iu)
  })
})
