import { describe, expect, it, vi } from 'vitest'
import type Store from 'electron-store'
import { createCompatibleCredentialService } from '../credentials/compatibleCredentialService'
import {
  COMPATIBLE_PROVIDER_REGISTRY_CHANNELS,
  createCompatibleProviderRegistryService,
  registerCompatibleProviderRegistryIpc,
} from './compatibleProviderRegistryIpc'

function createStore() {
  const values = new Map<string, unknown>()
  const store = {
    get: (key: string) => values.get(key),
    set: (key: string, value: unknown) => values.set(key, value),
    delete: (key: string) => values.delete(key),
  } as unknown as Store
  Object.defineProperty(store, 'store', { get: () => Object.fromEntries(values) })
  return {
    values,
    store,
  }
}

function createCredentialService(store: Store) {
  return createCompatibleCredentialService(store, {
    secureStorage: {
      kind: 'electron_safe_storage',
      isEncryptionAvailable: () => true,
      encryptString: (value) => Buffer.from(`encrypted:${value}`, 'utf8'),
      decryptString: (value) => value.toString('utf8').replace(/^encrypted:/u, ''),
    },
    nowMs: () => 10,
  })
}

function createDb() {
  const providers = new Map<string, any>()
  const endpoints = new Map<string, any[]>()
  const credentials = new Map<string, any[]>()
  const requestBundles = new Map<string, any>()
  const responseProfiles = new Map<string, any>()
  const reasoningMappings = new Map<string, any>()
  const inlinePolicies = new Map<string, any>()
  const call = vi.fn(async (method: string, raw?: any) => {
    if (method === 'compatibleRegistry.create') {
      const provider = { ...raw.provider, protocolKey: 'openai_chat_compatible', status: 'active', updatedAtMs: raw.provider.createdAtMs, deletedAtMs: null }
      providers.set(provider.providerInstanceId, provider)
      endpoints.set(provider.providerInstanceId, [raw.endpoint])
      credentials.set(provider.providerInstanceId, raw.credential ? [{ ...raw.credential, deletedAtMs: null }] : [])
      requestBundles.set(`${raw.requestProfile.requestProfileId}:${raw.requestProfile.version}`, {
        profile: raw.requestProfile,
        mappings: raw.requestMappings,
      })
      responseProfiles.set(`${raw.responseProfile.responseProfileId}:${raw.responseProfile.version}`, raw.responseProfile)
      reasoningMappings.set(`${raw.reasoningMapping.reasoningMappingId}:${raw.reasoningMapping.version}`, raw.reasoningMapping)
      inlinePolicies.set(`${raw.inlinePolicy.inlinePolicyId}:${raw.inlinePolicy.version}`, raw.inlinePolicy)
      return { provider, endpoint: raw.endpoint, credential: raw.credential }
    }
    if (method === 'compatibleProvider.list') return [...providers.values()].filter((item) => raw?.includeDeleted || item.deletedAtMs === null)
    if (method === 'compatibleProvider.get') return providers.get(raw.providerInstanceId) ?? null
    if (method === 'compatibleEndpoint.listRevisions') return endpoints.get(raw.providerInstanceId) ?? []
    if (method === 'compatibleCredential.listDescriptors') return credentials.get(raw.providerInstanceId) ?? []
    if (method === 'compatibleProfile.getRequestBundle') return requestBundles.get(`${raw.requestProfileId}:${raw.version}`) ?? null
    if (method === 'compatibleProfile.getResponse') return responseProfiles.get(`${raw.responseProfileId}:${raw.version}`) ?? null
    if (method === 'compatibleProfile.getReasoningMapping') return reasoningMappings.get(`${raw.mappingId}:${raw.version}`) ?? null
    if (method === 'compatibleProfile.getInlinePolicy') return inlinePolicies.get(`${raw.inlinePolicyId}:${raw.version}`) ?? null
    if (method === 'compatibleProvider.update') {
      const current = providers.get(raw.providerInstanceId)
      providers.set(raw.providerInstanceId, { ...current, ...raw })
      return providers.get(raw.providerInstanceId)
    }
    if (method === 'compatibleRegistry.updateEndpoint') {
      const current = endpoints.get(raw.providerInstanceId) ?? []
      const latest = current[0]
      current.unshift({ ...latest, ...raw, revision: latest.revision + 1, ...(raw.clearAuthentication ? { auth: { mode: 'none' }, credentialVersionRef: null, sensitiveHeaderRefs: [] } : {}) })
      if (raw.clearAuthentication && latest.credentialVersionRef) {
        const descriptor = (credentials.get(raw.providerInstanceId) ?? []).find((item) => item.credentialVersionRef === latest.credentialVersionRef)
        if (descriptor) descriptor.deletedAtMs = raw.createdAtMs
      }
      return current[0]
    }
    if (method === 'compatibleRegistry.rotateCredential') {
      const currentCredentials = credentials.get(raw.providerInstanceId) ?? []
      const descriptor = { ...raw.credential, version: currentCredentials.length + 1, deletedAtMs: null }
      currentCredentials.unshift(descriptor)
      credentials.set(raw.providerInstanceId, currentCredentials)
      const currentEndpoints = endpoints.get(raw.providerInstanceId) ?? []
      const latest = currentEndpoints[0]
      currentEndpoints.unshift({
        ...latest,
        endpointRevisionId: raw.endpointRevisionId,
        revision: latest.revision + 1,
        auth: raw.auth,
        credentialVersionRef: descriptor.credentialVersionRef,
        sensitiveHeaderRefs: raw.sensitiveHeaderRefs,
        createdAtMs: raw.createdAtMs,
      })
      return { credential: descriptor, endpoint: currentEndpoints[0] }
    }
    if (method === 'compatibleCredential.getDescriptor') {
      return [...credentials.values()].flat().find((item) => item.credentialVersionRef === raw.credentialVersionRef) ?? null
    }
    if (method === 'compatibleCredential.deleteDescriptor') {
      for (const list of credentials.values()) {
        const item = list.find((candidate) => candidate.credentialVersionRef === raw.credentialVersionRef)
        if (item) item.deletedAtMs = raw.deletedAtMs
      }
      return null
    }
    if (method === 'compatibleProvider.tombstone') {
      const current = providers.get(raw.providerInstanceId)
      providers.set(raw.providerInstanceId, { ...current, status: 'deleted', deletedAtMs: raw.deletedAtMs, updatedAtMs: raw.deletedAtMs })
      return providers.get(raw.providerInstanceId)
    }
    if (method === 'compatibleRegistry.deleteProvider') {
      const current = providers.get(raw.providerInstanceId)
      providers.set(raw.providerInstanceId, { ...current, status: 'deleted', deletedAtMs: raw.deletedAtMs, updatedAtMs: raw.deletedAtMs })
      const refs = (credentials.get(raw.providerInstanceId) ?? []).map((item) => {
        if (item.deletedAtMs === null) item.deletedAtMs = raw.deletedAtMs
        return item.credentialVersionRef
      })
      return { provider: providers.get(raw.providerInstanceId), credentialVersionRefs: refs }
    }
    throw new Error(`unsupported fake method: ${method}`)
  })
  return { call, providers, endpoints, credentials }
}

const endpoint = {
  baseUrl: 'https://api.example.test/v1/',
  securityPolicy: 'compatibility_first' as const,
  ordinaryHeaders: [{ name: 'X-Tenant', value: 'public', classification: 'public_non_secret' as const }],
  query: [{ name: 'region', value: 'us', classification: 'public_non_secret' as const }],
}

describe('compatible provider registry IPC', () => {
  it('clears authentication with a new endpoint revision and removes the superseded secure credential', async () => {
    const { store, values } = createStore()
    const db = createDb()
    const service = createCompatibleProviderRegistryService({ db: db as any, credentials: createCredentialService(store), nowMs: () => 100 })
    const created = await service.create({ displayName: 'Clear auth', endpoint, credential: { mode: 'bearer', token: 'remove-me' } })
    const cleared = await service.updateEndpoint({ providerInstanceId: created.provider.providerInstanceId, endpoint, clearAuthentication: true })
    expect(cleared.endpointRevisions[0]).toMatchObject({ authMode: 'none', credentialVersionRef: null, sensitiveHeaderRefs: [] })
    expect(cleared.credentials[0]).toMatchObject({ configured: false, deletedAtMs: 100 })
    expect(values.size).toBe(0)
  })

  it('rejects deleting an active endpoint credential and purges all secure versions when deleting the provider', async () => {
    const { store, values } = createStore()
    const db = createDb()
    const service = createCompatibleProviderRegistryService({ db: db as any, credentials: createCredentialService(store), nowMs: () => 100 })
    const created = await service.create({ displayName: 'Delete lifecycle', endpoint, credential: { mode: 'bearer', token: 'first' } })
    const activeRef = created.credentials[0]!.credentialVersionRef
    await expect(service.deleteCredential({ credentialVersionRef: activeRef })).rejects.toThrow(/active endpoint credential/i)
    await service.rotateCredential({ providerInstanceId: created.provider.providerInstanceId, credential: { mode: 'bearer', token: 'second' } })
    expect(values.size).toBe(2)
    const deleted = await service.deleteProvider({ providerInstanceId: created.provider.providerInstanceId })
    expect(deleted.provider.status).toBe('deleted')
    expect(deleted.credentials.every((item) => item.deletedAtMs === 100 && item.configured === false)).toBe(true)
    expect(values.size).toBe(0)
  })

  it('attempts every provider credential cleanup and retries each failed secure ref without restart', async () => {
    const { store, values } = createStore()
    const db = createDb()
    const baseCredentials = createCredentialService(store)
    let failFirst = true
    const attempted: string[] = []
    const credentials = { ...baseCredentials, delete: (ref: any) => {
      attempted.push(ref)
      if (failFirst) { failFirst = false; throw new Error('first secure delete failed') }
      baseCredentials.delete(ref)
    } }
    const service = createCompatibleProviderRegistryService({ db: db as any, credentials, nowMs: () => 100 })
    const created = await service.create({ displayName: 'Delete retry all', endpoint, credential: { mode: 'bearer', token: 'first' } })
    await service.rotateCredential({ providerInstanceId: created.provider.providerInstanceId, credential: { mode: 'bearer', token: 'second' } })
    await expect(service.deleteProvider({ providerInstanceId: created.provider.providerInstanceId })).rejects.toThrow(/cleanup/i)
    expect(attempted).toHaveLength(2)
    expect(values.size).toBe(1)
    await service.list()
    expect(values.size).toBe(0)
  })

  it('creates, lists, edits and rotates two independent instances without returning secrets', async () => {
    const { store } = createStore()
    const db = createDb()
    const service = createCompatibleProviderRegistryService({ db: db as any, credentials: createCredentialService(store), nowMs: () => 100 })

    const first = await service.create({
      displayName: 'First', endpoint, credential: { mode: 'bearer', token: 'first-secret-value' },
      requestMappings: [{
        sourceField: 'reasoning_effort', targetPath: ['reasoning', 'effort'], valueKind: 'string',
        valueMapping: { low: 'low', high: 'high' }, omission: 'omit_when_unset',
      }],
    })
    const second = await service.create({ displayName: 'Second', endpoint, credential: { mode: 'basic', username: 'user', password: 'second-secret-value' } })
    expect(first.provider.providerInstanceId).not.toBe(second.provider.providerInstanceId)
    expect(first.endpointRevisions[0]).toMatchObject({ baseUrl: 'https://api.example.test/v1', authMode: 'bearer' })
    expect(await service.list()).toHaveLength(2)
    expect(JSON.stringify([first, second])).not.toContain('first-secret-value')
    expect(JSON.stringify([first, second])).not.toContain('second-secret-value')
    expect(db.call).toHaveBeenCalledWith('compatibleRegistry.create', expect.objectContaining({
      requestMappings: [expect.objectContaining({
        requestProfileId: expect.stringMatching(/^ocp_request_profile_/),
        config: expect.objectContaining({ sourceField: 'reasoning_effort', targetPath: ['reasoning', 'effort'] }),
      })],
    }))

    const rotated = await service.rotateCredential({
      providerInstanceId: first.provider.providerInstanceId,
      credential: { mode: 'custom_headers', headers: [{ name: 'X-Api-Key', value: 'rotated-secret-value' }] },
    })
    expect(rotated.credentials).toHaveLength(2)
    expect(rotated.endpointRevisions).toHaveLength(2)
    expect(rotated.endpointRevisions[0]?.authMode).toBe('custom_headers')
    expect(JSON.stringify(rotated)).not.toContain('rotated-secret-value')

    const edited = await service.updateEndpoint({
      providerInstanceId: second.provider.providerInstanceId,
      endpoint: { ...endpoint, baseUrl: 'http://plain.example.test/v1/', securityPolicy: 'strict_ssrf' },
    })
    expect(edited.endpointRevisions[0]).toMatchObject({
      baseUrl: 'http://plain.example.test/v1',
      allowInsecureHttp: true,
      securityPolicy: 'strict_ssrf',
    })
  })

  it('compensates a secure write when the atomic DB create fails', async () => {
    const { store, values } = createStore()
    const service = createCompatibleProviderRegistryService({
      db: { call: vi.fn(async (method: string) => {
        if (method === 'compatibleRegistry.create') throw new Error('db failed')
        return []
      }) } as any,
      credentials: createCredentialService(store),
    })
    await expect(service.create({ displayName: 'Failure', endpoint, credential: { mode: 'bearer', token: 'rollback-secret' } })).rejects.toThrow('db failed')
    expect(values.size).toBe(0)
  })

  it('reconciles ambiguous DB completion before deleting a secure payload', async () => {
    const { store, values } = createStore()
    const db = createDb()
    const call = vi.fn(async (method: string, raw?: any) => {
      const result = await db.call(method, raw)
      if (method === 'compatibleRegistry.create') {
        throw Object.assign(new Error('late worker response'), { code: 'ERR_UNAVAILABLE' })
      }
      return result
    })
    const service = createCompatibleProviderRegistryService({
      db: { call } as any,
      credentials: createCredentialService(store),
      nowMs: () => 100,
    })

    const created = await service.create({
      displayName: 'Late commit',
      endpoint,
      credential: { mode: 'bearer', token: 'late-secret' },
    })

    expect(created.provider.displayName).toBe('Late commit')
    expect(values.size).toBe(1)
    expect(call).toHaveBeenCalledWith('compatibleProvider.get', expect.anything())
  })

  it('removes an uncommitted secure payload after an ambiguous failure is reconciled as absent', async () => {
    const { store, values } = createStore()
    const call = vi.fn(async (method: string) => {
      if (method === 'compatibleRegistry.create') {
        throw Object.assign(new Error('worker unavailable'), { code: 'ERR_UNAVAILABLE' })
      }
      if (method === 'compatibleProvider.get') return null
      return []
    })
    const service = createCompatibleProviderRegistryService({ db: { call } as any, credentials: createCredentialService(store) })

    await expect(service.create({
      displayName: 'Not committed',
      endpoint,
      credential: { mode: 'bearer', token: 'uncommitted-secret' },
    })).rejects.toMatchObject({ code: 'ERR_UNAVAILABLE' })
    expect(values.size).toBe(0)
  })

  it('reconciles an ambiguously completed credential rotation by immutable ref', async () => {
    const { store, values } = createStore()
    const db = createDb()
    let makeRotationAmbiguous = false
    const call = vi.fn(async (method: string, raw?: any) => {
      const result = await db.call(method, raw)
      if (makeRotationAmbiguous && method === 'compatibleRegistry.rotateCredential') {
        throw Object.assign(new Error('late rotation response'), { code: 'ERR_UNAVAILABLE' })
      }
      return result
    })
    const service = createCompatibleProviderRegistryService({
      db: { call } as any,
      credentials: createCredentialService(store),
      nowMs: () => 100,
    })
    const created = await service.create({ displayName: 'Rotate late', endpoint, credential: { mode: 'bearer', token: 'first-secret' } })
    makeRotationAmbiguous = true

    const rotated = await service.rotateCredential({
      providerInstanceId: created.provider.providerInstanceId,
      credential: { mode: 'bearer', token: 'second-secret' },
    })

    expect(rotated.credentials).toHaveLength(2)
    expect(rotated.endpointRevisions).toHaveLength(2)
    expect(values.size).toBe(2)
    expect(call).toHaveBeenCalledWith('compatibleCredential.getDescriptor', expect.anything())
  })

  it('tombstones a descriptor before deleting its secure payload', async () => {
    const { store } = createStore()
    const db = createDb()
    let failDelete = false
    const call = vi.fn(async (method: string, raw?: any) => {
      if (failDelete && method === 'compatibleCredential.deleteDescriptor') throw new Error('db delete failed')
      return db.call(method, raw)
    })
    const credentials = createCredentialService(store)
    const service = createCompatibleProviderRegistryService({ db: { call } as any, credentials, nowMs: () => 100 })
    const created = await service.create({ displayName: 'Delete order', endpoint, credential: { mode: 'bearer', token: 'keep-on-db-failure' } })
    const ref = created.credentials[0]!.credentialVersionRef
    await service.rotateCredential({ providerInstanceId: created.provider.providerInstanceId, credential: { mode: 'bearer', token: 'replacement' } })
    failDelete = true

    await expect(service.deleteCredential({ credentialVersionRef: ref })).rejects.toThrow('db delete failed')
    expect(credentials.has(ref)).toBe(true)
    expect(db.credentials.get(created.provider.providerInstanceId)?.find((item) => item.credentialVersionRef === ref)?.deletedAtMs).toBeNull()
  })

  it('retries secure deletion after a descriptor was already tombstoned', async () => {
    const { store, values } = createStore()
    const db = createDb()
    const baseCredentials = createCredentialService(store)
    let failOnce = true
    const credentials = {
      ...baseCredentials,
      delete: (ref: any) => {
        if (failOnce) {
          failOnce = false
          throw new Error('secure delete unavailable')
        }
        baseCredentials.delete(ref)
      },
    }
    const service = createCompatibleProviderRegistryService({ db: db as any, credentials, nowMs: () => 100 })
    const created = await service.create({ displayName: 'Delete retry', endpoint, credential: { mode: 'bearer', token: 'retry-secret' } })
    const ref = created.credentials[0]!.credentialVersionRef
    await service.rotateCredential({ providerInstanceId: created.provider.providerInstanceId, credential: { mode: 'bearer', token: 'replacement' } })

    await expect(service.deleteCredential({ credentialVersionRef: ref })).rejects.toThrow(/cleanup/i)
    expect(db.credentials.get(created.provider.providerInstanceId)?.find((item) => item.credentialVersionRef === ref)?.deletedAtMs).toBe(100)
    expect(values.size).toBe(2)

    const retried = await service.deleteCredential({ credentialVersionRef: ref })
    expect(retried.credentials.find((item) => item.credentialVersionRef === ref)?.deletedAtMs).toBe(100)
    expect(values.size).toBe(1)
  })

  it('retries a failed rollback cleanup on the next registry access', async () => {
    const { store, values } = createStore()
    const baseCredentials = createCredentialService(store)
    let failOnce = true
    const credentials = {
      ...baseCredentials,
      delete: (ref: any) => {
        if (failOnce) {
          failOnce = false
          throw new Error('secure delete unavailable')
        }
        baseCredentials.delete(ref)
      },
    }
    const call = vi.fn(async (method: string) => {
      if (method === 'compatibleRegistry.create') throw new Error('db failed')
      if (method === 'compatibleProvider.list') return []
      return null
    })
    const service = createCompatibleProviderRegistryService({ db: { call } as any, credentials })

    await expect(service.create({ displayName: 'Rollback retry', endpoint, credential: { mode: 'bearer', token: 'orphan-secret' } })).rejects.toThrow(/cleanup/i)
    expect(values.size).toBe(1)
    await service.list()
    expect(values.size).toBe(0)
  })

  it('reconciles orphaned and tombstoned secure payloads without exposing values', async () => {
    const { store, values } = createStore()
    const db = createDb()
    const credentials = createCredentialService(store)
    const service = createCompatibleProviderRegistryService({ db: db as any, credentials, nowMs: () => 100 })
    const created = await service.create({ displayName: 'Reconcile', endpoint, credential: { mode: 'bearer', token: 'tombstoned-secret' } })
    const activeRef = created.credentials[0]!.credentialVersionRef
    await db.call('compatibleCredential.deleteDescriptor', { credentialVersionRef: activeRef, deletedAtMs: 100 })
    credentials.write('ocp_credential_orphan123' as any, { mode: 'bearer', token: 'orphan-secret' })

    const result = await service.reconcileCredentialStore()
    expect(result).toEqual({ cleaned: 2, cleanupFailed: 0, missingActive: 0 })
    expect(values.size).toBe(0)
  })

  it('reports an active descriptor with a missing secure payload as not configured', async () => {
    const { store } = createStore()
    const db = createDb()
    const credentials = createCredentialService(store)
    const service = createCompatibleProviderRegistryService({ db: db as any, credentials, nowMs: () => 100 })
    const created = await service.create({ displayName: 'Missing payload', endpoint, credential: { mode: 'bearer', token: 'missing-secret' } })
    const ref = created.credentials[0]!.credentialVersionRef
    credentials.delete(ref)

    expect(await service.reconcileCredentialStore()).toMatchObject({ missingActive: 1 })
    const details = await service.get({ providerInstanceId: created.provider.providerInstanceId })
    expect(details.credentials[0]).toMatchObject({ configured: false, maskState: 'not_configured', deletedAtMs: null })
  })

  it('registers only typed CRUD channels and returns redacted validation errors', async () => {
    const handlers = new Map<string, (...args: any[]) => unknown>()
    const service = {
      list: vi.fn(async () => []),
      get: vi.fn(async () => { throw new Error('raw-secret-value') }),
      create: vi.fn(async () => []),
      update: vi.fn(async () => []),
      updateEndpoint: vi.fn(async () => []),
      rotateCredential: vi.fn(async () => []),
      deleteCredential: vi.fn(async () => []),
      deleteProvider: vi.fn(async () => []),
    }
    const channels = registerCompatibleProviderRegistryIpc({
      registerInvoke: (channel, handler) => handlers.set(channel, handler as any),
      service: service as any,
    })
    expect(channels).toEqual([...COMPATIBLE_PROVIDER_REGISTRY_CHANNELS])
    expect(channels.some((channel) => /reveal|send|stream|probe/u.test(channel))).toBe(false)
    const result = await handlers.get('compatible-provider:get')?.({}, { providerInstanceId: 'ocp_provider_12345678' })
    expect(JSON.stringify(result)).not.toContain('raw-secret-value')
  })
})
