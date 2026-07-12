import { describe, expect, it, vi } from 'vitest'
import { createCompatibleLegacyResetService } from './compatibleLegacyResetService'

describe('compatibleLegacyResetService', () => {
  it('previews redacted counts and applies DB/config before retryable orphan cleanup', async () => {
    const values = new Map<string, unknown>([
      ['openRouterBaseUrl', 'https://must-not-appear.invalid'], ['openRouterApiKey', 'native-key-must-stay'],
      ['localEndpointChatSettings', { endpoint: 'http://127.0.0.1:1234' }], ['lmStudioLocalProviderSettings', { chatMode: 'openai_compatible' }],
      ['ollamaLocalProviderSettings', { chatMode: 'openai_compatible' }], ['deepSeekApiKey', 'native-deepseek-key'],
      ['providerCredentials', { v1: { openrouter: { backend: 'electron_safe_storage' } } }],
    ])
    const store = { get: vi.fn((key: string) => values.get(key)), delete: vi.fn((key: string) => values.delete(key)) }
    let applied = false
    const db = { call: vi.fn(async (method: string) => {
      if (method === 'compatibleReset.execute') { applied = true; return {} }
      if (method === 'compatibleReset.census') return { schemaVersion: 1, legacyProviderKeys: ['generic_openai_compatible'], counts: { providers: applied ? 0 : 2 }, retainedCredentialRefs: ['ocp_credential_active123'] }
      throw new Error(method)
    }) }
    const credentials = {
      listRefsForMain: vi.fn(() => ['ocp_credential_active123', 'ocp_credential_orphan12']),
      delete: vi.fn(),
    }
    const service = createCompatibleLegacyResetService({ db: db as any, store: store as any, credentials: credentials as any })
    const preview = await service.preview()
    expect(preview).toEqual({ schemaVersion: 1, database: { counts: { providers: 2 }, total: 2 }, ambiguous: { counts: {}, total: 0, destructiveAction: 'stopped' }, config: { deprecatedKeyCount: 1 }, secureStore: { orphanRefCount: 1, cleanupFailed: 0 } })
    expect(JSON.stringify(preview)).not.toContain('must-not-appear')

    const result = await service.apply('delete_incompatible_compatible_state')
    expect(db.call.mock.calls.findIndex(([method]) => method === 'compatibleReset.execute')).toBeLessThan(store.delete.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER)
    expect(store.delete).toHaveBeenCalledWith('openRouterBaseUrl')
    expect(values.get('openRouterApiKey')).toBe('native-key-must-stay')
    expect(values.get('localEndpointChatSettings')).toEqual({ endpoint: 'http://127.0.0.1:1234' })
    expect(values.get('lmStudioLocalProviderSettings')).toEqual({ chatMode: 'openai_compatible' })
    expect(values.get('ollamaLocalProviderSettings')).toEqual({ chatMode: 'openai_compatible' })
    expect(values.get('deepSeekApiKey')).toBe('native-deepseek-key')
    expect(values.get('providerCredentials')).toBeDefined()
    expect(credentials.delete).toHaveBeenCalledWith('ocp_credential_orphan12')
    expect(credentials.delete).not.toHaveBeenCalledWith('ocp_credential_active123')
    expect(result.database.total).toBe(0)
  })

  it('reports failed orphan deletion without revealing refs and retries on the next apply', async () => {
    const db = { call: vi.fn(async (method: string) => method === 'compatibleReset.census'
      ? { schemaVersion: 1, legacyProviderKeys: [], counts: {}, retainedCredentialRefs: [] }
      : {}) }
    let refs = ['ocp_credential_orphan12']
    const credentials = {
      listRefsForMain: vi.fn(() => refs),
      delete: vi.fn(() => { throw new Error('secure delete failed') }),
    }
    const service = createCompatibleLegacyResetService({ db: db as any, store: { get: () => undefined, delete: () => undefined } as any, credentials: credentials as any })
    const failed = await service.apply('delete_incompatible_compatible_state')
    expect(failed.secureStore).toEqual({ orphanRefCount: 1, cleanupFailed: 1 })
    expect(JSON.stringify(failed)).not.toContain('orphan12')
    ;(credentials.delete as any).mockImplementation(() => { refs = [] })
    expect((await service.apply('delete_incompatible_compatible_state')).secureStore).toEqual({ orphanRefCount: 0, cleanupFailed: 0 })
  })

  it('stops before secure cleanup when config deletion fails and can resume safely', async () => {
    let deleteAttempts = 0
    const store = {
      get: (key: string) => key === 'openRouterBaseUrl' ? 'legacy' : undefined,
      delete: () => { deleteAttempts += 1; if (deleteAttempts === 1) throw new Error('store unavailable') },
    }
    const db = { call: vi.fn(async (method: string) => method === 'compatibleReset.census'
      ? { schemaVersion: 1, legacyProviderKeys: [], counts: {}, ambiguous: {}, retainedCredentialRefs: [] }
      : {}) }
    const credentials = { listRefsForMain: vi.fn(() => ['ocp_credential_orphan12']), delete: vi.fn() }
    const service = createCompatibleLegacyResetService({ db: db as any, store: store as any, credentials: credentials as any })
    await expect(service.apply('delete_incompatible_compatible_state')).rejects.toThrow('store unavailable')
    expect(credentials.delete).not.toHaveBeenCalled()
    await expect(service.apply('delete_incompatible_compatible_state')).resolves.toBeDefined()
    expect(credentials.delete).toHaveBeenCalledTimes(1)
  })
})
