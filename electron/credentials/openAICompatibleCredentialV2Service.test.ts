import { beforeEach, describe, expect, it, vi } from 'vitest'
const safe = vi.hoisted(() => ({ available: true, generation: 0 }))
vi.mock('electron', () => ({ safeStorage: {
  isAsyncEncryptionAvailable: vi.fn(async () => safe.available),
  encryptStringAsync: vi.fn(async (value: string) => Buffer.from(`enc:${++safe.generation}:${value}`, 'utf8')),
  decryptStringAsync: vi.fn(async (value: Buffer) => ({ result: value.toString('utf8').replace(/^enc:\d+:/u, ''), shouldReEncrypt: false })),
} }))
import { createOpenAICompatibleCredentialV2Service } from './openAICompatibleCredentialV2Service'

describe('OpenAI-compatible V2 credential service', () => {
  const values = new Map<string, unknown>()
  const store = { get: (key: string) => values.get(key), set: (key: string, value: unknown) => values.set(key, value), delete: (key: string) => values.delete(key) }
  beforeEach(() => { values.clear(); safe.available = true; safe.generation = 0 })
  it('writes custom credential only through async safe storage and leases it main-side', async () => {
    const service = createOpenAICompatibleCredentialV2Service({ store, deriveScope: async () => `credential-scope-v2:${'a'.repeat(64)}` as never })
    const status = await service.write({ providerInstanceId: 'ocp_provider_12345678', credentialVersionRef: 'ocp_credential_12345678', expectedRevision: 0,
      credential: { mode: 'bearer', token: 'secret-value' } })
    expect(status).toMatchObject({ configured: true, revision: 1 })
    expect(JSON.stringify([...values.values()])).not.toContain('secret-value')
    await expect(service.withCredential({ providerInstanceId: 'ocp_provider_12345678', credentialVersionRef: 'ocp_credential_12345678',
      expectedRevision: 1, expectedCredentialScopeId: status.credentialScopeId!, consume: (lease) => lease.credential })).resolves.toEqual({ mode: 'bearer', token: 'secret-value' })
    const restarted = createOpenAICompatibleCredentialV2Service({ store, deriveScope: async () => { throw new Error('persisted scope must be reused') } })
    await expect(restarted.getStatus('ocp_provider_12345678', 'ocp_credential_12345678')).resolves.toMatchObject({ configured: true, revision: 1 })
    await expect(restarted.withCredential({ providerInstanceId: 'ocp_provider_12345678', credentialVersionRef: 'ocp_credential_12345678',
      expectedRevision: 1, expectedCredentialScopeId: status.credentialScopeId!, consume: (lease) => lease.credential })).resolves.toEqual({ mode: 'bearer', token: 'secret-value' })
    await expect(restarted.clear('ocp_provider_12345678', 'ocp_credential_12345678', 1)).resolves.toMatchObject({ configured: false, revision: 2 })
    expect(values.size).toBe(0)
  })
})
