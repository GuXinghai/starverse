import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { DbMethod } from '../../infra/db/dbMethodsRegistry'
import {
  COMPATIBLE_JSON_SCHEMA_VERSION,
  compatibleProviderIdCommandSchema,
  createCompatibleProviderCommandSchema,
  deleteCompatibleCredentialCommandSchema,
  formatCompatibleOpaqueId,
  rotateCompatibleCredentialCommandSchema,
  reviseCompatibleConfigurationCommandSchema,
  toCompatibleRendererCredentialDescriptor,
  toCompatibleRendererEndpointRevision,
  updateCompatibleEndpointCommandSchema,
  updateCompatibleProviderCommandSchema,
  type CompatibleCredentialDescriptor,
  type CompatibleEndpointRevision,
  type CompatibleProviderInstance,
  type CompatibleRegistryCredentialInput,
  type CredentialVersionRef,
  type ProviderInstanceId,
} from '../../src/shared/provider/openai-chat-compatible'
import type { CompatibleCredentialService } from '../credentials/compatibleCredentialService'
import type { RegisterInvoke } from './types'

type DbCaller = Readonly<{ call: (method: DbMethod, params?: unknown) => Promise<unknown> }>

type RegistryDetails = Readonly<{
  provider: CompatibleProviderInstance
  endpointRevisions: readonly ReturnType<typeof toCompatibleRendererEndpointRevision>[]
  credentials: readonly ReturnType<typeof toCompatibleRendererCredentialDescriptor>[]
  activeConfiguration: Readonly<{
    endpointRevisionId: string
    requestBundle: unknown
    responseProfile: unknown
    reasoningMapping: unknown
    inlinePolicy: unknown
  }> | null
}>

type RegistryResult<T> = Readonly<
  { ok: true; value: T } |
  { ok: false; error: Readonly<{ code: 'invalid_configuration' | 'registry_unavailable' | 'credential_unavailable'; message: string }> }
>

export type CompatibleProviderRegistryService = Readonly<{
  reconcileCredentialStore: () => Promise<Readonly<{ cleaned: number; cleanupFailed: number; missingActive: number }>>
  list: () => Promise<readonly RegistryDetails[]>
  get: (raw: unknown) => Promise<RegistryDetails>
  create: (raw: unknown) => Promise<RegistryDetails>
  update: (raw: unknown) => Promise<RegistryDetails>
  updateEndpoint: (raw: unknown) => Promise<RegistryDetails>
  reviseConfiguration: (raw: unknown) => Promise<RegistryDetails>
  listDiscovery: (raw: unknown) => Promise<readonly unknown[]>
  ignoreDiscovery: (raw: unknown) => Promise<readonly unknown[]>
  rotateCredential: (raw: unknown) => Promise<RegistryDetails>
  deleteCredential: (raw: unknown) => Promise<RegistryDetails>
  deleteProvider: (raw: unknown) => Promise<RegistryDetails>
}>

export const COMPATIBLE_PROVIDER_REGISTRY_CHANNELS = [
  'compatible-provider:list',
  'compatible-provider:get',
  'compatible-provider:create',
  'compatible-provider:update',
  'compatible-provider:update-endpoint',
  'compatible-provider:revise-configuration',
  'compatible-provider:list-discovery',
  'compatible-provider:ignore-discovery',
  'compatible-provider:rotate-credential',
  'compatible-provider:delete-credential',
  'compatible-provider:delete',
] as const

function opaque(kind: Parameters<typeof formatCompatibleOpaqueId>[0]): string {
  return formatCompatibleOpaqueId(kind, randomUUID())
}

function authDescriptor(payload: CompatibleRegistryCredentialInput, ref: CredentialVersionRef | null) {
  if (payload.mode === 'none') return { mode: 'none' as const }
  if (!ref) throw new Error('Credential reference is unavailable.')
  return { mode: payload.mode, credentialVersionRef: ref }
}

function sensitiveHeaderRefs(payload: CompatibleRegistryCredentialInput, ref: CredentialVersionRef | null) {
  if (payload.mode !== 'custom_headers') return []
  if (!ref) throw new Error('Credential reference is unavailable.')
  return payload.headers.map((entry: { name: string }) => ({ name: entry.name.trim().toLowerCase(), credentialVersionRef: ref }))
}

function isAmbiguousDbFailure(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error &&
    (error as { code?: unknown }).code === 'ERR_UNAVAILABLE'
}

export function createCompatibleProviderRegistryService(input: Readonly<{
  db: DbCaller
  credentials: CompatibleCredentialService
  nowMs?: () => number
}>): CompatibleProviderRegistryService {
  const nowMs = input.nowMs ?? Date.now
  const pendingCredentialCleanup = new Set<CredentialVersionRef>()

  function deleteSecurePayload(credentialVersionRef: CredentialVersionRef): void {
    try {
      input.credentials.delete(credentialVersionRef)
      pendingCredentialCleanup.delete(credentialVersionRef)
    } catch {
      pendingCredentialCleanup.add(credentialVersionRef)
      throw new Error('Compatible credential cleanup is unavailable.')
    }
  }

  function retryPendingCredentialCleanup(): void {
    for (const ref of [...pendingCredentialCleanup]) {
      try {
        input.credentials.delete(ref)
        pendingCredentialCleanup.delete(ref)
      } catch {
        // Keep the opaque ref in memory for a later retry; never log credential material.
      }
    }
  }

  async function reconcileCredentialStore(): Promise<Readonly<{ cleaned: number; cleanupFailed: number; missingActive: number }>> {
    retryPendingCredentialCleanup()
    const providers = await input.db.call('compatibleProvider.list', { includeDeleted: true }) as CompatibleProviderInstance[]
    const descriptors = (await Promise.all(providers.map((provider) => input.db.call('compatibleCredential.listDescriptors', {
      providerInstanceId: provider.providerInstanceId,
      includeDeleted: true,
    }) as Promise<CompatibleCredentialDescriptor[]>))).flat()
    const activeProviderIds = new Set(providers.filter((provider) => provider.status !== 'deleted' && provider.deletedAtMs === null).map((provider) => provider.providerInstanceId))
    const byRef = new Map(descriptors.map((descriptor) => [descriptor.credentialVersionRef, descriptor]))
    const secureRefs = input.credentials.listRefsForMain()
    let cleaned = 0
    let cleanupFailed = 0
    for (const ref of secureRefs) {
      const descriptor = byRef.get(ref)
      if (descriptor && descriptor.deletedAtMs === null && activeProviderIds.has(descriptor.providerInstanceId)) continue
      try {
        deleteSecurePayload(ref)
        cleaned += 1
      } catch {
        cleanupFailed += 1
      }
    }
    const missingActive = descriptors.filter((descriptor) => descriptor.deletedAtMs === null && activeProviderIds.has(descriptor.providerInstanceId) && !input.credentials.has(descriptor.credentialVersionRef)).length
    return Object.freeze({ cleaned, cleanupFailed, missingActive })
  }

  async function details(providerInstanceId: ProviderInstanceId): Promise<RegistryDetails> {
    const provider = await input.db.call('compatibleProvider.get', { providerInstanceId }) as CompatibleProviderInstance | null
    if (!provider) throw new Error('Compatible provider instance is unavailable.')
    const endpoints = await input.db.call('compatibleEndpoint.listRevisions', { providerInstanceId }) as CompatibleEndpointRevision[]
    const credentials = await input.db.call('compatibleCredential.listDescriptors', {
      providerInstanceId,
      includeDeleted: true,
    }) as CompatibleCredentialDescriptor[]
    const latestEndpoint = endpoints[0] ?? null
    const activeConfiguration = latestEndpoint ? {
      endpointRevisionId: latestEndpoint.endpointRevisionId,
      requestBundle: await input.db.call('compatibleProfile.getRequestBundle', { requestProfileId: latestEndpoint.requestProfileId, version: latestEndpoint.requestProfileVersion }),
      responseProfile: await input.db.call('compatibleProfile.getResponse', { responseProfileId: latestEndpoint.responseProfileId, version: latestEndpoint.responseProfileVersion }),
      reasoningMapping: null as unknown,
      inlinePolicy: null as unknown,
    } : null
    if (activeConfiguration && activeConfiguration.responseProfile && typeof activeConfiguration.responseProfile === 'object') {
      const profile = activeConfiguration.responseProfile as { reasoningMappingId?: unknown; reasoningMappingVersion?: unknown; inlinePolicyId?: unknown; inlinePolicyVersion?: unknown }
      activeConfiguration.reasoningMapping = await input.db.call('compatibleProfile.getReasoningMapping', { mappingId: profile.reasoningMappingId, version: profile.reasoningMappingVersion })
      activeConfiguration.inlinePolicy = await input.db.call('compatibleProfile.getInlinePolicy', { inlinePolicyId: profile.inlinePolicyId, version: profile.inlinePolicyVersion })
    }
    return {
      provider,
      endpointRevisions: endpoints.map(toCompatibleRendererEndpointRevision),
      credentials: credentials.map((descriptor) => toCompatibleRendererCredentialDescriptor(
        descriptor,
        descriptor.deletedAtMs === null && input.credentials.has(descriptor.credentialVersionRef),
      )),
      activeConfiguration,
    }
  }

  async function list(): Promise<readonly RegistryDetails[]> {
    retryPendingCredentialCleanup()
    const providers = await input.db.call('compatibleProvider.list', { includeDeleted: false }) as CompatibleProviderInstance[]
    return Promise.all(providers.map((provider) => details(provider.providerInstanceId)))
  }

  async function get(raw: unknown): Promise<RegistryDetails> {
    retryPendingCredentialCleanup()
    const command = compatibleProviderIdCommandSchema.parse(raw)
    return details(command.providerInstanceId)
  }

  async function create(raw: unknown): Promise<RegistryDetails> {
    const command = createCompatibleProviderCommandSchema.parse(raw)
    const createdAtMs = nowMs()
    const providerInstanceId = formatCompatibleOpaqueId('provider', randomUUID()) as ProviderInstanceId
    const credentialVersionRef = command.credential.mode === 'none'
      ? null
      : formatCompatibleOpaqueId('credential', randomUUID()) as CredentialVersionRef
    let maskedSummary = null
    if (credentialVersionRef) maskedSummary = input.credentials.write(credentialVersionRef, command.credential)
    try {
      const requestProfileId = opaque('requestProfile')
      const reasoningMappingId = opaque('reasoningMapping')
      const inlinePolicyId = opaque('inlinePolicy')
      const responseProfileId = opaque('responseProfile')
      await input.db.call('compatibleRegistry.create', {
        provider: { providerInstanceId, displayName: command.displayName, createdAtMs },
        credential: credentialVersionRef && maskedSummary ? {
          credentialVersionRef,
          providerInstanceId,
          version: 1,
          authMode: command.credential.mode,
          backend: 'electron_safe_storage',
          maskedSummary,
          createdAtMs,
        } : null,
        requestProfile: {
          requestProfileId,
          version: 1,
          config: {
            schemaVersion: COMPATIBLE_JSON_SCHEMA_VERSION,
            standardFieldOwnership: 'builder',
            unsupportedFieldPolicy: 'error_before_fetch',
            extraBody: { enabled: true, maxDepth: 8, maxKeys: 256, maxBytes: 64 * 1024 },
          },
          createdAtMs,
        },
        requestMappings: command.requestMappings.map((mapping) => {
          const mappingId = opaque('requestMapping')
          return {
            mappingId,
            version: 1,
            requestProfileId,
            requestProfileVersion: 1,
            targetPath: mapping.targetPath,
            config: {
              schemaVersion: COMPATIBLE_JSON_SCHEMA_VERSION,
              mappingId,
              requestProfileId,
              requestProfileVersion: 1,
              ...mapping,
            },
            createdAtMs,
          }
        }),
        reasoningMapping: {
          mappingId: reasoningMappingId,
          version: 1,
          config: {
            schemaVersion: COMPATIBLE_JSON_SCHEMA_VERSION,
            mode: 'custom_preferred_with_builtin_fallback',
            rules: [],
            replay: { format: 'disabled', scope: 'never' },
          },
          createdAtMs,
        },
        inlinePolicy: {
          inlinePolicyId,
          version: 1,
          config: { schemaVersion: COMPATIBLE_JSON_SCHEMA_VERSION, canonicalThinkTags: true, customTags: [] },
          createdAtMs,
        },
        responseProfile: {
          responseProfileId,
          version: 1,
          reasoningMappingId,
          reasoningMappingVersion: 1,
          inlinePolicyId,
          inlinePolicyVersion: 1,
          config: {
            schemaVersion: COMPATIBLE_JSON_SCHEMA_VERSION,
            choicePolicy: 'preserve_all',
            unknownFieldPolicy: 'bounded_diagnostics',
            reasoningMapping: { mappingId: reasoningMappingId, version: 1 },
            inlinePolicy: { inlinePolicyId, version: 1 },
          },
          createdAtMs,
        },
        endpoint: {
          endpointRevisionId: opaque('endpoint'),
          providerInstanceId,
          revision: 1,
          baseUrl: command.endpoint.baseUrl,
          allowInsecureHttp: command.endpoint.allowInsecureHttp,
          securityPolicy: command.endpoint.securityPolicy,
          auth: authDescriptor(command.credential, credentialVersionRef),
          credentialVersionRef,
          ordinaryHeaders: command.endpoint.ordinaryHeaders,
          sensitiveHeaderRefs: sensitiveHeaderRefs(command.credential, credentialVersionRef),
          query: command.endpoint.query,
          requestProfileId,
          requestProfileVersion: 1,
          responseProfileId,
          responseProfileVersion: 1,
          createdAtMs,
        },
      })
    } catch (error) {
      if (credentialVersionRef && isAmbiguousDbFailure(error)) {
        try {
          const committed = await input.db.call('compatibleProvider.get', { providerInstanceId }) as CompatibleProviderInstance | null
          if (committed) return details(providerInstanceId)
        } catch {
          throw error
        }
      }
      if (credentialVersionRef) deleteSecurePayload(credentialVersionRef)
      throw error
    }
    return details(providerInstanceId)
  }

  async function update(raw: unknown): Promise<RegistryDetails> {
    const command = updateCompatibleProviderCommandSchema.parse(raw)
    await input.db.call('compatibleProvider.update', { ...command, updatedAtMs: nowMs() })
    return details(command.providerInstanceId)
  }

  async function updateEndpoint(raw: unknown): Promise<RegistryDetails> {
    const command = updateCompatibleEndpointCommandSchema.parse(raw)
    const endpoints = await input.db.call('compatibleEndpoint.listRevisions', { providerInstanceId: command.providerInstanceId }) as CompatibleEndpointRevision[]
    const previousCredentialRef = command.clearAuthentication ? endpoints[0]?.credentialVersionRef ?? null : null
    await input.db.call('compatibleRegistry.updateEndpoint', {
      providerInstanceId: command.providerInstanceId,
      endpointRevisionId: opaque('endpoint'),
      ...command.endpoint,
      clearAuthentication: command.clearAuthentication,
      createdAtMs: nowMs(),
    })
    if (previousCredentialRef) {
      deleteSecurePayload(previousCredentialRef)
    }
    return details(command.providerInstanceId)
  }

  async function reviseConfiguration(raw: unknown): Promise<RegistryDetails> {
    const command = reviseCompatibleConfigurationCommandSchema.parse(raw)
    const createdAtMs = nowMs()
    const endpoints = await input.db.call('compatibleEndpoint.listRevisions', { providerInstanceId: command.providerInstanceId }) as CompatibleEndpointRevision[]
    const latest = endpoints[0]
    if (!latest) throw new Error('Compatible endpoint revision is unavailable.')
    const currentResponse = await input.db.call('compatibleProfile.getResponse', { responseProfileId: latest.responseProfileId, version: latest.responseProfileVersion }) as any
    if (!currentResponse) throw new Error('Compatible response profile is unavailable.')
    const requestProfileId = latest.requestProfileId
    const requestProfileVersion = latest.requestProfileVersion + 1
    const reasoningMappingId = currentResponse.reasoningMappingId
    const reasoningMappingVersion = currentResponse.reasoningMappingVersion + 1
    const inlinePolicyId = currentResponse.inlinePolicyId
    const inlinePolicyVersion = currentResponse.inlinePolicyVersion + 1
    const responseProfileId = latest.responseProfileId
    const responseProfileVersion = latest.responseProfileVersion + 1
    await input.db.call('compatibleRegistry.reviseConfiguration', {
      providerInstanceId: command.providerInstanceId,
      endpointRevisionId: opaque('endpoint'),
      requestProfile: { requestProfileId, version: requestProfileVersion, config: command.requestProfile, createdAtMs },
      requestMappings: command.requestMappings.map((mapping) => {
        const mappingId = opaque('requestMapping')
        return {
          mappingId, version: 1, requestProfileId, requestProfileVersion, targetPath: mapping.targetPath,
          config: { schemaVersion: COMPATIBLE_JSON_SCHEMA_VERSION, mappingId, requestProfileId, requestProfileVersion, ...mapping },
          createdAtMs,
        }
      }),
      reasoningMapping: { mappingId: reasoningMappingId, version: reasoningMappingVersion, config: command.reasoningMapping, createdAtMs },
      inlinePolicy: { inlinePolicyId, version: inlinePolicyVersion, config: command.inlinePolicy, createdAtMs },
      acceptedDiscoveryPaths: command.acceptedDiscoveryPaths,
      responseProfile: {
        responseProfileId, version: responseProfileVersion, reasoningMappingId, reasoningMappingVersion, inlinePolicyId, inlinePolicyVersion,
        config: {
          schemaVersion: COMPATIBLE_JSON_SCHEMA_VERSION, choicePolicy: 'preserve_all', unknownFieldPolicy: 'bounded_diagnostics',
          reasoningMapping: { mappingId: reasoningMappingId, version: reasoningMappingVersion }, inlinePolicy: { inlinePolicyId, version: inlinePolicyVersion },
        },
        createdAtMs,
      },
      createdAtMs,
    })
    return details(command.providerInstanceId)
  }

  async function listDiscovery(raw: unknown): Promise<readonly unknown[]> {
    const command = compatibleProviderIdCommandSchema.parse(raw)
    const endpoints = await input.db.call('compatibleEndpoint.listRevisions', command) as CompatibleEndpointRevision[]
    const latest = endpoints[0]
    if (!latest) throw new Error('Compatible endpoint revision is unavailable.')
    return input.db.call('compatibleDiagnostics.listDiscoveredFields', {
      providerInstanceId: command.providerInstanceId,
      responseProfileId: latest.responseProfileId,
      profileVersion: latest.responseProfileVersion,
      limit: 128,
    }) as Promise<readonly unknown[]>
  }

  async function ignoreDiscovery(raw: unknown): Promise<readonly unknown[]> {
    const command = z.object({ providerInstanceId: compatibleProviderIdCommandSchema.shape.providerInstanceId, streamPath: z.string().trim().min(1).max(1024) }).strict().parse(raw)
    const endpoints = await input.db.call('compatibleEndpoint.listRevisions', { providerInstanceId: command.providerInstanceId }) as CompatibleEndpointRevision[]
    const latest = endpoints[0]
    if (!latest) throw new Error('Compatible endpoint revision is unavailable.')
    await input.db.call('compatibleDiagnostics.setDiscoveredFieldState', {
      providerInstanceId: command.providerInstanceId, responseProfileId: latest.responseProfileId,
      profileVersion: latest.responseProfileVersion, streamPath: command.streamPath, state: 'ignored',
    })
    return listDiscovery({ providerInstanceId: command.providerInstanceId })
  }

  async function rotateCredential(raw: unknown): Promise<RegistryDetails> {
    const command = rotateCompatibleCredentialCommandSchema.parse(raw)
    const credentialVersionRef = formatCompatibleOpaqueId('credential', randomUUID()) as CredentialVersionRef
    const createdAtMs = nowMs()
    const maskedSummary = input.credentials.write(credentialVersionRef, command.credential)
    try {
      await input.db.call('compatibleRegistry.rotateCredential', {
        providerInstanceId: command.providerInstanceId,
        credential: {
          credentialVersionRef,
          providerInstanceId: command.providerInstanceId,
          authMode: command.credential.mode,
          backend: 'electron_safe_storage',
          maskedSummary,
          createdAtMs,
        },
        endpointRevisionId: opaque('endpoint'),
        auth: authDescriptor(command.credential, credentialVersionRef),
        sensitiveHeaderRefs: sensitiveHeaderRefs(command.credential, credentialVersionRef),
        createdAtMs,
      })
    } catch (error) {
      if (isAmbiguousDbFailure(error)) {
        try {
          const committed = await input.db.call('compatibleCredential.getDescriptor', { credentialVersionRef }) as CompatibleCredentialDescriptor | null
          if (committed) return details(command.providerInstanceId)
        } catch {
          throw error
        }
      }
      deleteSecurePayload(credentialVersionRef)
      throw error
    }
    return details(command.providerInstanceId)
  }

  async function deleteCredential(raw: unknown): Promise<RegistryDetails> {
    const command = deleteCompatibleCredentialCommandSchema.parse(raw)
    const descriptor = await input.db.call('compatibleCredential.getDescriptor', command) as CompatibleCredentialDescriptor | null
    if (!descriptor) throw new Error('Compatible credential is unavailable.')
    const endpoints = await input.db.call('compatibleEndpoint.listRevisions', { providerInstanceId: descriptor.providerInstanceId }) as CompatibleEndpointRevision[]
    const latest = endpoints[0]
    if (latest && (latest.credentialVersionRef === command.credentialVersionRef || latest.sensitiveHeaderRefs.some((entry) => entry.credentialVersionRef === command.credentialVersionRef))) {
      throw new Error('Active endpoint credential cannot be deleted before authentication is cleared or rotated.')
    }
    if (descriptor.deletedAtMs === null) {
      await input.db.call('compatibleCredential.deleteDescriptor', {
        credentialVersionRef: command.credentialVersionRef,
        deletedAtMs: nowMs(),
      })
    }
    deleteSecurePayload(command.credentialVersionRef)
    return details(descriptor.providerInstanceId)
  }

  async function deleteProvider(raw: unknown): Promise<RegistryDetails> {
    const command = compatibleProviderIdCommandSchema.parse(raw)
    const deleted = await input.db.call('compatibleRegistry.deleteProvider', { ...command, deletedAtMs: nowMs() }) as { credentialVersionRefs: CredentialVersionRef[] }
    let cleanupFailed = false
    for (const credentialVersionRef of deleted.credentialVersionRefs) {
      if (!input.credentials.has(credentialVersionRef)) continue
      try { deleteSecurePayload(credentialVersionRef) } catch { cleanupFailed = true }
    }
    if (cleanupFailed) throw new Error('Compatible provider credential cleanup is unavailable.')
    return details(command.providerInstanceId)
  }

  return { reconcileCredentialStore, list, get, create, update, updateEndpoint, reviseConfiguration, listDiscovery, ignoreDiscovery, rotateCredential, deleteCredential, deleteProvider }
}

function safeError(error: unknown): RegistryResult<never> {
  const unavailable = isAmbiguousDbFailure(error)
  const credential = error instanceof Error && /credential/i.test(error.message)
  const message = unavailable
    ? 'Compatible provider registry is unavailable.'
    : credential
      ? 'Compatible credential operation failed.'
      : 'Compatible provider configuration operation failed.'
  return {
    ok: false,
    error: {
      code: unavailable ? 'registry_unavailable' : credential ? 'credential_unavailable' : 'invalid_configuration',
      message,
    },
  }
}

async function execute<T>(work: () => Promise<T>): Promise<RegistryResult<T>> {
  try {
    return { ok: true, value: await work() }
  } catch (error) {
    return safeError(error)
  }
}

export function registerCompatibleProviderRegistryIpc(input: Readonly<{
  registerInvoke: RegisterInvoke
  service: CompatibleProviderRegistryService
}>): string[] {
  input.registerInvoke('compatible-provider:list', () => execute(() => input.service.list()))
  input.registerInvoke('compatible-provider:get', (_event, payload) => execute(() => input.service.get(payload)))
  input.registerInvoke('compatible-provider:create', (_event, payload) => execute(() => input.service.create(payload)))
  input.registerInvoke('compatible-provider:update', (_event, payload) => execute(() => input.service.update(payload)))
  input.registerInvoke('compatible-provider:update-endpoint', (_event, payload) => execute(() => input.service.updateEndpoint(payload)))
  input.registerInvoke('compatible-provider:revise-configuration', (_event, payload) => execute(() => input.service.reviseConfiguration(payload)))
  input.registerInvoke('compatible-provider:list-discovery', (_event, payload) => execute(() => input.service.listDiscovery(payload)))
  input.registerInvoke('compatible-provider:ignore-discovery', (_event, payload) => execute(() => input.service.ignoreDiscovery(payload)))
  input.registerInvoke('compatible-provider:rotate-credential', (_event, payload) => execute(() => input.service.rotateCredential(payload)))
  input.registerInvoke('compatible-provider:delete-credential', (_event, payload) => execute(() => input.service.deleteCredential(payload)))
  input.registerInvoke('compatible-provider:delete', (_event, payload) => execute(() => input.service.deleteProvider(payload)))
  return [...COMPATIBLE_PROVIDER_REGISTRY_CHANNELS]
}
