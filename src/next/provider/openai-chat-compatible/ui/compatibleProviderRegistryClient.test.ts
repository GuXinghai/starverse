import { describe, expect, it, vi } from 'vitest'
import { createCompatibleProviderRegistryClient } from './compatibleProviderRegistryClient'

describe('createCompatibleProviderRegistryClient', () => {
  it('unwraps safe registry views and has no secret reveal operation', async () => {
    const details = { provider: { providerInstanceId: 'ocp_provider_12345678' }, endpointRevisions: [], credentials: [{ configured: true, maskState: 'configured_masked' }], activeConfiguration: null }
    const bridge = { list: vi.fn(async () => ({ ok: true as const, value: [details] })) } as never
    const client = createCompatibleProviderRegistryClient(bridge)
    await expect(client.list()).resolves.toEqual([details])
    expect(Object.keys(client)).not.toContain('reveal')
    expect(JSON.stringify(await client.list())).not.toContain('apiKey')
  })

  it('returns only stable error codes from failed commands', async () => {
    const client = createCompatibleProviderRegistryClient({ list: vi.fn(async () => ({ ok: false as const, error: { code: 'registry_unavailable' as const, message: 'safe' } })) } as never)
    await expect(client.list()).rejects.toThrow('registry_unavailable')
  })
})
