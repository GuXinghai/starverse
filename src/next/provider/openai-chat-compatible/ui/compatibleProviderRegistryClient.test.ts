import { describe, expect, it, vi } from 'vitest'
import { createCompatibleProviderRegistryClient } from './compatibleProviderRegistryClient'

const rawDetails = { providerInstanceId: 'ocp_provider_12345678', protocolContractId: 'openai_chat_compatible',
  displayName: 'Endpoint', status: 'active', createdAtMs: 1, updatedAtMs: 1, deletedAtMs: null,
  endpointRevisions: [{ endpointRevisionId: 'ocp_endpoint_12345678', providerInstanceId: 'ocp_provider_12345678', revision: 1,
    baseUrl: 'https://example.test', securityPolicy: 'compatibility_first', auth: { mode: 'none' }, ordinaryHeaders: [], query: [],
    requestProfileId: 'ocp_request_profile_12345678', requestProfileVersion: 1,
    responseProfileId: 'ocp_response_profile_12345678', responseProfileVersion: 1, endpointDigest: 'a'.repeat(64), createdAtMs: 1 }] }
const active = { requestProfile: { configId: 'ocp_request_profile_12345678', version: 1, payload: {} }, requestMappings: [],
  reasoningMapping: { configId: 'ocp_reasoning_mapping_12345678', version: 1, payload: {} },
  inlinePolicy: { configId: 'ocp_inline_policy_12345678', version: 1, payload: {} },
  responseProfile: { configId: 'ocp_response_profile_12345678', version: 1, payload: {
    reasoningMapping: { mappingId: 'ocp_reasoning_mapping_12345678', version: 1 },
    inlinePolicy: { inlinePolicyId: 'ocp_inline_policy_12345678', version: 1 } } } }

describe('createCompatibleProviderRegistryClient', () => {
  it('projects V2 safe views and has no secret reveal operation', async () => {
    const bridge = { list: vi.fn(async () => ({ ok: true, value: [rawDetails] })),
      get: vi.fn(async () => ({ ok: true, value: { details: rawDetails, activeConfiguration: active } })) } as never
    const client = createCompatibleProviderRegistryClient(bridge)
    await expect(client.list()).resolves.toMatchObject([{ provider: { providerInstanceId: 'ocp_provider_12345678' }, credentials: [] }])
    expect(Object.keys(client)).not.toContain('reveal')
    expect(JSON.stringify(await client.list())).not.toContain('apiKey')
  })

  it('returns only stable error codes from failed commands', async () => {
    const client = createCompatibleProviderRegistryClient({ list: vi.fn(async () => ({ ok: false, code: 'registry_unavailable' })) } as never)
    await expect(client.list()).rejects.toThrow('registry_unavailable')
  })

  it('forwards an explicitly selected credential storage mode without adding a read path', async () => {
    const create = vi.fn(async () => ({ ok: true, value: { details: rawDetails, activeConfiguration: active } }))
    const bridge = {
      create,
      getCredentialStatus: vi.fn(async () => ({ ok: true, value: { configured: false, revision: 0 } })),
    } as never
    const client = createCompatibleProviderRegistryClient(bridge)
    await client.create({ displayName: 'Endpoint', endpoint: { baseUrl: 'https://example.test', securityPolicy: 'compatibility_first', ordinaryHeaders: [], query: [] },
      credential: { mode: 'none' }, storageMode: 'plaintext' })
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ storageMode: 'plaintext' }))
  })

  it('binds endpoint updates to the revision projected immediately before the command', async () => {
    const updateEndpoint = vi.fn(async () => ({ ok: true, value: { details: rawDetails, activeConfiguration: active } }))
    const bridge = {
      get: vi.fn(async () => ({ ok: true, value: { details: rawDetails, activeConfiguration: active } })),
      updateEndpoint,
    } as never
    const client = createCompatibleProviderRegistryClient(bridge)
    await client.updateEndpoint({ providerInstanceId: rawDetails.providerInstanceId,
      endpoint: { baseUrl: 'https://next.example.test', securityPolicy: 'strict_ssrf', ordinaryHeaders: [], query: [] },
      credential: null })
    expect(updateEndpoint).toHaveBeenCalledWith(expect.objectContaining({
      expectedEndpointRevisionId: 'ocp_endpoint_12345678',
    }))
  })
})
