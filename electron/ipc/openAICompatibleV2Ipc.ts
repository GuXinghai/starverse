import { randomUUID } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import { OpenAICompatibleV2Repo } from '../../infra/db/repo/openAICompatibleV2Repo'
import { compatibleRegistryCredentialInputSchema } from '../../src/shared/provider/openai-chat-compatible'
import { createOpenAICompatibleCredentialV2Service } from '../credentials/openAICompatibleCredentialV2Service'
import { createOpenAICompatibleCatalogV2Service } from '../services/openAICompatibleCatalogV2Service'
import type { RegisterInvoke } from './types'

const OPENAI_COMPATIBLE_IPC_CODES = new Set([
  'GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID', 'GENERATION_V2_OPENAI_COMPATIBLE_NOT_FOUND',
  'GENERATION_V2_OPENAI_COMPATIBLE_CONFLICT', 'GENERATION_V2_OPENAI_COMPATIBLE_STATE_INVALID',
  'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_INVALID', 'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_MISSING',
  'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_STALE', 'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_STORAGE_UNAVAILABLE',
  'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_SAFE_STORAGE_UNAVAILABLE',
  'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_SAFE_STORAGE_BACKEND_UNTRUSTED',
  'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_PLAINTEXT_UNSUPPORTED',
  'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_DECRYPT_FAILED',
  'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_RECORD_INVALID', 'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_DRIFT',
  'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_REENTRANT', 'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_NOT_INITIALIZED',
])

function commandFailure(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error
    ? (error as { code?: unknown }).code
    : error instanceof Error ? error.message : undefined
  return typeof code === 'string' && OPENAI_COMPATIBLE_IPC_CODES.has(code)
    ? code
    : 'GENERATION_V2_OPENAI_COMPATIBLE_COMMAND_FAILED'
}

export const OPENAI_COMPATIBLE_V2_IPC_CHANNELS = Object.freeze([
  'generation-v2:openai-compatible:list',
  'generation-v2:openai-compatible:get',
  'generation-v2:openai-compatible:create',
  'generation-v2:openai-compatible:revise-configuration',
  'generation-v2:openai-compatible:get-credential-status',
  'generation-v2:openai-compatible:update',
  'generation-v2:openai-compatible:update-endpoint',
  'generation-v2:openai-compatible:delete',
  'generation-v2:openai-compatible:clear-credential',
  'generation-v2:openai-compatible:test-connection',
  'generation-v2:openai-compatible:abort-connection-test',
  'generation-v2:openai-compatible:model-sync',
  'generation-v2:openai-compatible:model-abort-sync',
  'generation-v2:openai-compatible:model-query',
  'generation-v2:openai-compatible:model-status',
  'generation-v2:openai-compatible:model-upsert-manual',
  'generation-v2:openai-compatible:model-delete-manual',
  'generation-v2:openai-compatible:list-discovery',
  'generation-v2:openai-compatible:ignore-discovery',
  'generation-v2:openai-compatible:confirm-discovery',
] as const)

function raw(value: unknown, keys: readonly string[], optionalKeys: readonly string[] = []): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const actualKeys = Object.keys(descriptors)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      keys.some((key) => !Object.hasOwn(descriptors, key)) ||
      actualKeys.some((key) => !keys.includes(key) && !optionalKeys.includes(key)) ||
      Object.entries(descriptors).some(([key, descriptor]) => !descriptor.enumerable || !('value' in descriptor) ||
        (!optionalKeys.includes(key) && descriptor.value === undefined))) {
    throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
  }
  return Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value]))
}
function identifier(prefix: string): string { return `${prefix}${randomUUID().replace(/-/gu, '')}` }
function initialConfiguration(): Readonly<Record<string, unknown>> {
  const requestProfileId = identifier('ocp_request_profile_')
  const reasoningMappingId = identifier('ocp_reasoning_mapping_')
  const inlinePolicyId = identifier('ocp_inline_policy_')
  const responseProfileId = identifier('ocp_response_profile_')
  return Object.freeze({
    requestProfile: Object.freeze({ id: requestProfileId, version: 1, config: Object.freeze({ schemaVersion: 1,
      standardFieldOwnership: 'builder', unsupportedFieldPolicy: 'error_before_fetch', defaults: Object.freeze({}),
      extraBody: Object.freeze({ enabled: true, maxDepth: 8, maxKeys: 512, maxBytes: 262144 }) }) }),
    requestMappings: Object.freeze([]),
    reasoningMapping: Object.freeze({ id: reasoningMappingId, version: 1, config: Object.freeze({ schemaVersion: 1,
      mode: 'custom_only', rules: Object.freeze([]), replay: Object.freeze({ format: 'disabled', scope: 'never' }) }) }),
    inlinePolicy: Object.freeze({ id: inlinePolicyId, version: 1, config: Object.freeze({ schemaVersion: 1, canonicalThinkTags: true, customTags: Object.freeze([]) }) }),
    responseProfile: Object.freeze({ id: responseProfileId, version: 1, config: Object.freeze({ schemaVersion: 1,
      choicePolicy: 'preserve_all', unknownFieldPolicy: 'bounded_diagnostics', reasoningMapping: Object.freeze({ mappingId: reasoningMappingId, version: 1 }),
      inlinePolicy: Object.freeze({ inlinePolicyId, version: 1 }) }) }),
  })
}

/** Fixed IPC authority for the compatible configuration plane; it never invokes a legacy worker channel. */
export function registerOpenAICompatibleV2Ipc(input: Readonly<{ registerInvoke: RegisterInvoke; db: BetterSqlite3.Database;
  credentialService: ReturnType<typeof createOpenAICompatibleCredentialV2Service>
  fetchImpl: (url: string, init: RequestInit) => Promise<Response>
  proxyMode: () => 'environment' | 'manual' | 'direct' | 'system'
}>): readonly string[] {
  const repo = new OpenAICompatibleV2Repo(input.db)
  const catalog = createOpenAICompatibleCatalogV2Service({ db: input.db, credentialService: input.credentialService,
    fetchImpl: input.fetchImpl, proxyMode: input.proxyMode })
  const connectionControllers = new Map<string, AbortController>()
  const safe = (callback: (payload: unknown) => unknown) => (_event: unknown, payload?: unknown) => {
    try { return Object.freeze({ ok: true, value: callback(payload) }) }
    catch (error) { return Object.freeze({ ok: false, code: commandFailure(error) }) }
  }
  input.registerInvoke(OPENAI_COMPATIBLE_V2_IPC_CHANNELS[0], safe(() => repo.list()))
  input.registerInvoke(OPENAI_COMPATIBLE_V2_IPC_CHANNELS[1], safe((payload) => {
    const value = raw(payload, ['providerInstanceId']); if (typeof value.providerInstanceId !== 'string') throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
    return Object.freeze({ details: repo.get(value.providerInstanceId), activeConfiguration: repo.getActiveConfiguration(value.providerInstanceId) })
  }))
  input.registerInvoke(OPENAI_COMPATIBLE_V2_IPC_CHANNELS[2], async (_event: unknown, payload?: unknown) => {
    try {
      const value = raw(payload, ['displayName', 'baseUrl', 'securityPolicy', 'credential', 'ordinaryHeaders', 'query'], ['storageMode'])
      if (typeof value.displayName !== 'string' || typeof value.baseUrl !== 'string' ||
          (value.securityPolicy !== 'compatibility_first' && value.securityPolicy !== 'strict_ssrf')) throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
      const credential = compatibleRegistryCredentialInputSchema.parse(value.credential)
      const providerInstanceId = identifier('ocp_provider_')
      let auth: unknown = { mode: 'none' }
      let prepared: Awaited<ReturnType<typeof input.credentialService.prepare>> | undefined
      if (credential.mode !== 'none') {
        prepared = await input.credentialService.prepare({ providerInstanceId, credentialVersionRef: identifier('ocp_credential_'), credential, expectedRevision: 0,
          storageMode: value.storageMode as never })
        auth = { mode: credential.mode, credentialVersionRef: prepared.credentialVersionRef }
      }
      try {
        const details = await input.credentialService.commit(providerInstanceId, () => repo.createWithCredential({ providerInstanceId, displayName: value.displayName as string,
          endpointRevisionId: identifier('ocp_endpoint_'), baseUrl: value.baseUrl as string, securityPolicy: value.securityPolicy as 'compatibility_first' | 'strict_ssrf',
          auth, ordinaryHeaders: value.ordinaryHeaders, query: value.query, configuration: initialConfiguration() as never },
        () => { if (prepared) input.credentialService.writePrepared(prepared) }))
        return Object.freeze({ ok: true, value: Object.freeze({ details, activeConfiguration: repo.getActiveConfiguration(details.providerInstanceId) }) })
      } finally { if (prepared) input.credentialService.discardPrepared(prepared) }
    } catch (error) {
      return Object.freeze({ ok: false, code: commandFailure(error) })
    }
  })
  input.registerInvoke(OPENAI_COMPATIBLE_V2_IPC_CHANNELS[3], safe((payload) => {
    const value = raw(payload, ['providerInstanceId', 'configuration'])
    if (typeof value.providerInstanceId !== 'string') throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
    const details = repo.reviseConfiguration({ providerInstanceId: value.providerInstanceId, endpointRevisionId: identifier('ocp_endpoint_'), configuration: value.configuration as never })
    return Object.freeze({ details, activeConfiguration: repo.getActiveConfiguration(details.providerInstanceId) })
  }))
  input.registerInvoke(OPENAI_COMPATIBLE_V2_IPC_CHANNELS[4], async (_event: unknown, payload?: unknown) => {
    try { const value = raw(payload, ['providerInstanceId', 'credentialVersionRef']);
      if (typeof value.providerInstanceId !== 'string' || typeof value.credentialVersionRef !== 'string') throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
      return Object.freeze({ ok: true, value: await input.credentialService.getStatus(value.providerInstanceId, value.credentialVersionRef) })
    } catch (error) { return Object.freeze({ ok: false, code: commandFailure(error) }) }
  })
  input.registerInvoke(OPENAI_COMPATIBLE_V2_IPC_CHANNELS[5], safe((payload) => {
    const value = raw(payload, ['providerInstanceId', 'displayName', 'status'])
    if (typeof value.providerInstanceId !== 'string' || value.displayName !== undefined && typeof value.displayName !== 'string' ||
        value.status !== undefined && value.status !== 'active' && value.status !== 'disabled') throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
    return repo.updateProvider({ providerInstanceId: value.providerInstanceId, ...(value.displayName === undefined ? {} : { displayName: value.displayName }),
      ...(value.status === undefined ? {} : { status: value.status }) })
  }))
  input.registerInvoke(OPENAI_COMPATIBLE_V2_IPC_CHANNELS[6], async (_event: unknown, payload?: unknown) => {
    try {
      const value = raw(payload, ['providerInstanceId', 'expectedEndpointRevisionId', 'baseUrl', 'securityPolicy', 'credential', 'ordinaryHeaders', 'query'], ['storageMode'])
      if (typeof value.providerInstanceId !== 'string' || typeof value.baseUrl !== 'string' ||
          typeof value.expectedEndpointRevisionId !== 'string' ||
          (value.securityPolicy !== 'compatibility_first' && value.securityPolicy !== 'strict_ssrf')) throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
      const credential = value.credential === null ? null : compatibleRegistryCredentialInputSchema.parse(value.credential)
      const latest = repo.get(value.providerInstanceId).endpointRevisions[0]!
      let auth: unknown = credential === null ? latest.auth : { mode: 'none' }
      let prepared: Awaited<ReturnType<typeof input.credentialService.prepare>> | undefined
      const previousRef = (latest.auth as { credentialVersionRef?: unknown }).credentialVersionRef
      if (credential !== null && credential.mode !== 'none') {
        const sessionOverride = value.storageMode === 'session' && typeof previousRef === 'string'
        const previousStatus = sessionOverride
          ? await input.credentialService.getStatus(value.providerInstanceId, previousRef)
          : undefined
        prepared = await input.credentialService.prepare({ providerInstanceId: value.providerInstanceId,
          credentialVersionRef: sessionOverride ? previousRef : identifier('ocp_credential_'), credential,
          expectedRevision: previousStatus?.revision ?? 0,
          storageMode: value.storageMode as never })
        auth = { mode: credential.mode, credentialVersionRef: prepared.credentialVersionRef }
      }
      try {
        const details = await input.credentialService.commit(value.providerInstanceId, () => repo.updateEndpointWithCredential({ providerInstanceId: value.providerInstanceId as string, endpointRevisionId: identifier('ocp_endpoint_'), expectedEndpointRevisionId: value.expectedEndpointRevisionId as string, baseUrl: value.baseUrl as string,
          securityPolicy: value.securityPolicy as 'compatibility_first' | 'strict_ssrf', auth, ordinaryHeaders: value.ordinaryHeaders, query: value.query }, () => {
          if (prepared) input.credentialService.writePrepared(prepared)
          if (credential !== null && typeof previousRef === 'string' && prepared?.credentialVersionRef !== previousRef) {
            input.credentialService.clearCurrentPersisted(value.providerInstanceId as string, previousRef)
          }
        }))
        return Object.freeze({ ok: true, value: Object.freeze({ details, activeConfiguration: repo.getActiveConfiguration(details.providerInstanceId) }) })
      } finally { if (prepared) input.credentialService.discardPrepared(prepared) }
    } catch (error) {
      return Object.freeze({ ok: false, code: commandFailure(error) })
    }
  })
  input.registerInvoke(OPENAI_COMPATIBLE_V2_IPC_CHANNELS[7], async (_event: unknown, payload?: unknown) => {
    try { const value = raw(payload, ['providerInstanceId']); if (typeof value.providerInstanceId !== 'string') throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
      await input.credentialService.commit(value.providerInstanceId as string, () => {
        repo.deleteProviderWithCredentials(value.providerInstanceId as string)
        input.credentialService.clearProviderSessions(value.providerInstanceId as string)
      })
      return Object.freeze({ ok: true, value: Object.freeze({ deleted: true }) })
    } catch (error) { return Object.freeze({ ok: false, code: commandFailure(error) }) }
  })
  input.registerInvoke(OPENAI_COMPATIBLE_V2_IPC_CHANNELS[8], async (_event: unknown, payload?: unknown) => {
    try {
      const value = raw(payload, ['providerInstanceId', 'credentialVersionRef', 'expectedRevision'])
      if (typeof value.providerInstanceId !== 'string' || typeof value.credentialVersionRef !== 'string' ||
          typeof value.expectedRevision !== 'number' || !Number.isSafeInteger(value.expectedRevision) || value.expectedRevision < 0) {
        throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
      }
      const providerInstanceId = value.providerInstanceId as string; const credentialVersionRef = value.credentialVersionRef as string; const expectedRevision = value.expectedRevision as number
      const status = await input.credentialService.commit(providerInstanceId, () => {
        let next: Awaited<ReturnType<typeof input.credentialService.clearPersisted>> | undefined
        const details = repo.clearCredential({ providerInstanceId, credentialVersionRef, endpointRevisionId: identifier('ocp_endpoint_'),
          clearPersisted: () => { next = input.credentialService.clearPersisted(providerInstanceId, credentialVersionRef, expectedRevision) } })
        return Object.freeze({ status: next!, details })
      })
      return Object.freeze({ ok: true, value: Object.freeze({ status: status.status, details: status.details, activeConfiguration: repo.getActiveConfiguration(providerInstanceId) }) })
    } catch (error) { return Object.freeze({ ok: false, code: commandFailure(error) }) }
  })
  input.registerInvoke(OPENAI_COMPATIBLE_V2_IPC_CHANNELS[9], async (_event: unknown, payload?: unknown) => {
    let requestId = ''
    try {
      const value = raw(payload, ['providerInstanceId', 'requestId'])
      if (typeof value.providerInstanceId !== 'string' || typeof value.requestId !== 'string') throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
      requestId = value.requestId; if (connectionControllers.has(requestId)) throw new Error('compatible_request_capacity')
      const controller = new AbortController(); connectionControllers.set(requestId, controller)
      try { return await catalog.testConnection(value.providerInstanceId, requestId, controller.signal) }
      finally { connectionControllers.delete(requestId) }
    } catch (error) { return Object.freeze({ ok: false, requestId, error: Object.freeze({
      code: error instanceof Error ? error.message : 'compatible_network_unknown', stage: 'request',
      safeMessage: error instanceof Error ? error.message : 'compatible_network_unknown', retryable: false,
    }) }) }
  })
  input.registerInvoke(OPENAI_COMPATIBLE_V2_IPC_CHANNELS[10], (_event: unknown, payload?: unknown) => {
    try { const value = raw(payload, ['requestId']); if (typeof value.requestId !== 'string') throw new Error()
      const controller = connectionControllers.get(value.requestId); if (!controller) return Object.freeze({ ok: true, aborted: false })
      controller.abort('user_cancelled'); return Object.freeze({ ok: true, aborted: true })
    } catch { return Object.freeze({ ok: false, code: 'GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID' }) }
  })
  input.registerInvoke(OPENAI_COMPATIBLE_V2_IPC_CHANNELS[11], async (_event: unknown, payload?: unknown) => {
    try { const value = raw(payload, ['providerInstanceId', 'requestId', 'force']);
      if (typeof value.providerInstanceId !== 'string' || typeof value.requestId !== 'string' || typeof value.force !== 'boolean') throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
      return await catalog.sync(value.providerInstanceId, value.requestId)
    } catch (error) { return Object.freeze({ ok: false, code: error instanceof Error ? error.message : 'compatible_catalog_sync_failed' }) }
  })
  input.registerInvoke(OPENAI_COMPATIBLE_V2_IPC_CHANNELS[12], safe((payload) => {
    const value = raw(payload, ['requestId']); if (typeof value.requestId !== 'string') throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
    return Object.freeze({ aborted: catalog.abort(value.requestId) })
  }))
  input.registerInvoke(OPENAI_COMPATIBLE_V2_IPC_CHANNELS[13], safe((payload) => {
    const value = raw(payload, ['providerInstanceId', 'search', 'includeStale', 'offset', 'limit'])
    if (typeof value.providerInstanceId !== 'string' || typeof value.search !== 'string' || typeof value.includeStale !== 'boolean' ||
        typeof value.offset !== 'number' || typeof value.limit !== 'number') throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
    const result = catalog.query(value.providerInstanceId, value.includeStale); const query = value.search.toLowerCase()
    const filtered = result.items.filter((item) => !query || item.modelId.toLowerCase().includes(query) || item.metadata.displayName?.toLowerCase().includes(query))
    return Object.freeze({ protocolKey: 'openai_chat_compatible', providerInstanceId: result.provider.providerInstanceId,
      providerName: result.provider.displayName, providerStatus: result.provider.status, syncState: result.syncState,
      total: filtered.length, items: Object.freeze(filtered.slice(value.offset, value.offset + value.limit)) })
  }))
  input.registerInvoke(OPENAI_COMPATIBLE_V2_IPC_CHANNELS[14], safe((payload) => {
    const value = raw(payload, ['providerInstanceId']); if (typeof value.providerInstanceId !== 'string') throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
    return catalog.getStatus(value.providerInstanceId)
  }))
  input.registerInvoke(OPENAI_COMPATIBLE_V2_IPC_CHANNELS[15], safe((payload) => {
    const value = raw(payload, ['providerInstanceId', 'modelId', 'metadata'])
    if (typeof value.providerInstanceId !== 'string' || typeof value.modelId !== 'string' || !value.metadata || typeof value.metadata !== 'object') throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
    const metadata = value.metadata as Record<string, unknown>
    return catalog.upsertManual(value.providerInstanceId, value.modelId, { ...metadata, fieldProvenance: Object.freeze({}) })
  }))
  input.registerInvoke(OPENAI_COMPATIBLE_V2_IPC_CHANNELS[16], safe((payload) => {
    const value = raw(payload, ['providerInstanceId', 'modelId'])
    if (typeof value.providerInstanceId !== 'string' || typeof value.modelId !== 'string') throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
    return catalog.deleteManual(value.providerInstanceId, value.modelId)
  }))
  input.registerInvoke(OPENAI_COMPATIBLE_V2_IPC_CHANNELS[17], safe((payload) => {
    const value = raw(payload, ['providerInstanceId']); if (typeof value.providerInstanceId !== 'string') throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
    return repo.listDiscovery(value.providerInstanceId)
  }))
  input.registerInvoke(OPENAI_COMPATIBLE_V2_IPC_CHANNELS[18], safe((payload) => {
    const value = raw(payload, ['providerInstanceId', 'responseProfileId', 'responseProfileVersion', 'streamPath'])
    if (typeof value.providerInstanceId !== 'string' || typeof value.responseProfileId !== 'string' || typeof value.responseProfileVersion !== 'number' || typeof value.streamPath !== 'string') throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
    const { providerInstanceId, responseProfileId, responseProfileVersion, streamPath } = value as Readonly<{
      providerInstanceId: string; responseProfileId: string; responseProfileVersion: number; streamPath: string
    }>
    return repo.setDiscoveryState(providerInstanceId, responseProfileId, responseProfileVersion, streamPath, 'ignored')
  }))
  input.registerInvoke(OPENAI_COMPATIBLE_V2_IPC_CHANNELS[19], safe((payload) => {
    const value = raw(payload, ['providerInstanceId', 'configuration', 'responseProfileId', 'responseProfileVersion', 'streamPath'])
    if (typeof value.providerInstanceId !== 'string' || typeof value.responseProfileId !== 'string' || typeof value.responseProfileVersion !== 'number' || typeof value.streamPath !== 'string') throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
    const { providerInstanceId, responseProfileId, responseProfileVersion, streamPath } = value as Readonly<{
      providerInstanceId: string; responseProfileId: string; responseProfileVersion: number; streamPath: string
    }>
    return input.db.transaction(() => {
      const details = repo.reviseConfiguration({ providerInstanceId,
        endpointRevisionId: identifier('ocp_endpoint_'), configuration: value.configuration as never })
      repo.setDiscoveryState(providerInstanceId, responseProfileId, responseProfileVersion, streamPath, 'confirmed')
      return Object.freeze({ details, activeConfiguration: repo.getActiveConfiguration(providerInstanceId) })
    })()
  }))
  return OPENAI_COMPATIBLE_V2_IPC_CHANNELS
}
