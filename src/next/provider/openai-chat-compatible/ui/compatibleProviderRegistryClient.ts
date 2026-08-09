import { providerInstanceIdSchema } from '@/shared/provider/openai-chat-compatible/identity'

type V2Bridge = NonNullable<NonNullable<Window['generationV2']>['openAICompatible']>
type RegistryDetails = CompatibleProviderRegistryDetails
type RecordValue = Readonly<Record<string, any>>

function v2Bridge(): V2Bridge | undefined { return window.generationV2?.openAICompatible }
function unwrap<T>(value: unknown): T {
  const result = value as { ok?: unknown; value?: unknown; code?: unknown }
  if (!result || result.ok !== true) throw new Error(typeof result?.code === 'string' ? result.code : 'compatible_registry_unavailable')
  return result.value as T
}
function identifier(prefix: string): string { return `${prefix}${crypto.randomUUID().replace(/-/gu, '')}` }

export function createCompatibleProviderRegistryClient(bridge: V2Bridge | undefined = v2Bridge()) {
  const requireBridge = (): V2Bridge => {
    const resolved = bridge ?? v2Bridge()
    if (!resolved) throw new Error('compatible_registry_bridge_unavailable')
    return resolved
  }
  const bundle = async (providerInstanceId: string): Promise<RecordValue> => unwrap(await requireBridge().get(providerInstanceId))
  const project = async (rawBundle: RecordValue): Promise<RegistryDetails> => {
    const details = rawBundle.details as RecordValue; const active = rawBundle.activeConfiguration as RecordValue
    const endpoints = (details.endpointRevisions ?? []) as RecordValue[]; const latest = endpoints[0]
    const auth = (latest?.auth ?? { mode: 'none' }) as RecordValue
    const credentialVersionRef = typeof auth.credentialVersionRef === 'string' ? auth.credentialVersionRef : null
    const credentials: CompatibleRendererCredentialDescriptor[] = []
    if (credentialVersionRef) {
      const status = unwrap<RecordValue>(await requireBridge().getCredentialStatus({ providerInstanceId: details.providerInstanceId, credentialVersionRef }))
      credentials.push(Object.freeze({ credentialVersionRef, providerInstanceId: details.providerInstanceId,
        version: Number(status.revision), authMode: auth.mode, configured: status.configured === true,
        maskState: status.configured === true ? 'configured_masked' : 'not_configured', sensitiveHeaderNames: Object.freeze([]), deletedAtMs: null }))
    }
    const responsePayload = active.responseProfile?.payload ?? {}
    const activeConfiguration = latest ? Object.freeze({ endpointRevisionId: latest.endpointRevisionId,
      requestBundle: Object.freeze({ profile: Object.freeze({ requestProfileId: active.requestProfile.configId,
        version: active.requestProfile.version, config: active.requestProfile.payload }),
        mappings: Object.freeze((active.requestMappings ?? []).map((entry: RecordValue) => Object.freeze({ requestFieldMappingId: entry.configId,
          version: entry.version, config: entry.payload }))) }),
      responseProfile: Object.freeze({ responseProfileId: active.responseProfile.configId, version: active.responseProfile.version,
        reasoningMappingId: responsePayload.reasoningMapping?.mappingId, reasoningMappingVersion: responsePayload.reasoningMapping?.version,
        inlinePolicyId: responsePayload.inlinePolicy?.inlinePolicyId, inlinePolicyVersion: responsePayload.inlinePolicy?.version,
        config: responsePayload }),
      reasoningMapping: Object.freeze({ reasoningMappingId: active.reasoningMapping.configId,
        version: active.reasoningMapping.version, config: active.reasoningMapping.payload }),
      inlinePolicy: Object.freeze({ inlinePolicyId: active.inlinePolicy.configId,
        version: active.inlinePolicy.version, config: active.inlinePolicy.payload }),
    }) : null
    return Object.freeze({ provider: Object.freeze({ providerInstanceId: details.providerInstanceId,
      protocolKey: 'openai_chat_compatible', displayName: details.displayName, status: details.status,
      createdAtMs: details.createdAtMs, updatedAtMs: details.updatedAtMs, deletedAtMs: details.deletedAtMs }),
      endpointRevisions: Object.freeze(endpoints.map((endpoint) => {
        const endpointAuth = endpoint.auth as RecordValue
        return Object.freeze({ endpointRevisionId: endpoint.endpointRevisionId, providerInstanceId: endpoint.providerInstanceId,
          revision: endpoint.revision, baseUrl: endpoint.baseUrl, allowInsecureHttp: String(endpoint.baseUrl).startsWith('http:'),
          securityPolicy: endpoint.securityPolicy, credentialVersionRef: endpointAuth.credentialVersionRef ?? null,
          ordinaryHeaders: endpoint.ordinaryHeaders, sensitiveHeaderRefs: Object.freeze([]), query: endpoint.query,
          requestProfileId: endpoint.requestProfileId, requestProfileVersion: endpoint.requestProfileVersion,
          responseProfileId: endpoint.responseProfileId, responseProfileVersion: endpoint.responseProfileVersion,
          createdAtMs: endpoint.createdAtMs, authMode: endpointAuth.mode })
      })), credentials: Object.freeze(credentials), activeConfiguration }) as RegistryDetails
  }
  const get = async (providerInstanceId: string) => project(await bundle(providerInstanceIdSchema.parse(providerInstanceId)))
  const configuration = async (providerInstanceId: string, input: RecordValue) => {
    const current = await bundle(providerInstanceId); const active = current.activeConfiguration as RecordValue
    const requestVersion = Number(active.requestProfile.version) + 1
    const reasoningVersion = Number(active.reasoningMapping.version) + 1
    const inlineVersion = Number(active.inlinePolicy.version) + 1
    const responseVersion = Number(active.responseProfile.version) + 1
    const requestMappings = (input.requestMappings as RecordValue[]).map((config, index) => {
      const prior = active.requestMappings?.[index] as RecordValue | undefined
      const id = prior?.configId ?? identifier('ocp_request_mapping_'); const version = prior ? Number(prior.version) + 1 : 1
      return Object.freeze({ id, version, config: Object.freeze({ ...config, schemaVersion: 1, mappingId: id,
        requestProfileId: active.requestProfile.configId, requestProfileVersion: requestVersion }) })
    })
    return Object.freeze({ requestProfile: Object.freeze({ id: active.requestProfile.configId, version: requestVersion, config: input.requestProfile }),
      requestMappings: Object.freeze(requestMappings),
      reasoningMapping: Object.freeze({ id: active.reasoningMapping.configId, version: reasoningVersion, config: input.reasoningMapping }),
      inlinePolicy: Object.freeze({ id: active.inlinePolicy.configId, version: inlineVersion, config: input.inlinePolicy }),
      responseProfile: Object.freeze({ id: active.responseProfile.configId, version: responseVersion,
        config: Object.freeze({ ...(active.responseProfile.payload as RecordValue),
          reasoningMapping: Object.freeze({ mappingId: active.reasoningMapping.configId, version: reasoningVersion }),
          inlinePolicy: Object.freeze({ inlinePolicyId: active.inlinePolicy.configId, version: inlineVersion }) }) }),
    })
  }
  return Object.freeze({
    list: async () => {
      const providers = unwrap<readonly RecordValue[]>(await requireBridge().list())
      return Promise.all(providers.map((item) => get(item.providerInstanceId)))
    },
    get,
    create: async (input: RecordValue) => project(unwrap(await requireBridge().create({ displayName: input.displayName,
      baseUrl: input.endpoint.baseUrl, securityPolicy: input.endpoint.securityPolicy, ordinaryHeaders: input.endpoint.ordinaryHeaders,
      query: input.endpoint.query, credential: input.credential }))),
    update: async (input: RecordValue) => {
      const current = await get(input.providerInstanceId)
      unwrap(await requireBridge().update({ providerInstanceId: providerInstanceIdSchema.parse(input.providerInstanceId),
        displayName: input.displayName ?? current.provider.displayName, status: input.status ?? current.provider.status }))
      return get(input.providerInstanceId)
    },
    updateEndpoint: async (input: RecordValue & { credential?: unknown | null }) => project(unwrap(await requireBridge().updateEndpoint({
      providerInstanceId: providerInstanceIdSchema.parse(input.providerInstanceId), baseUrl: input.endpoint.baseUrl,
      securityPolicy: input.endpoint.securityPolicy, ordinaryHeaders: input.endpoint.ordinaryHeaders,
      query: input.endpoint.query, credential: input.credential ?? null }))),
    reviseConfiguration: async (input: RecordValue) => {
      const providerInstanceId = providerInstanceIdSchema.parse(input.providerInstanceId)
      const next = await configuration(providerInstanceId, input)
      if (Array.isArray(input.acceptedDiscoveryPaths) && input.acceptedDiscoveryPaths.length === 1) {
        const current = await get(providerInstanceId); const response = current.activeConfiguration?.responseProfile as RecordValue
        return project(unwrap(await requireBridge().confirmDiscovery({ providerInstanceId, configuration: next,
          responseProfileId: response.responseProfileId, responseProfileVersion: response.version,
          streamPath: input.acceptedDiscoveryPaths[0] })))
      }
      return project(unwrap(await requireBridge().reviseConfiguration({ providerInstanceId, configuration: next })))
    },
    listDiscovery: async (providerInstanceId: string) => unwrap<CompatibleDiscoveredResponseField[]>(await requireBridge().listDiscovery(providerInstanceIdSchema.parse(providerInstanceId))),
    ignoreDiscovery: async (input: RecordValue) => {
      const current = await get(input.providerInstanceId); const response = current.activeConfiguration?.responseProfile as RecordValue
      return unwrap<CompatibleDiscoveredResponseField[]>(await requireBridge().ignoreDiscovery({ providerInstanceId: input.providerInstanceId,
        responseProfileId: response.responseProfileId, responseProfileVersion: response.version, streamPath: input.streamPath }))
    },
    rotateCredential: async (input: RecordValue) => {
      const current = await get(input.providerInstanceId); const endpoint = current.endpointRevisions[0]!
      return project(unwrap(await requireBridge().updateEndpoint({ providerInstanceId: input.providerInstanceId,
        baseUrl: endpoint.baseUrl, securityPolicy: endpoint.securityPolicy, ordinaryHeaders: endpoint.ordinaryHeaders,
        query: endpoint.query, credential: input.credential })))
    },
    deleteCredential: async (credentialVersionRef: string) => {
      const providers = await Promise.all(unwrap<readonly RecordValue[]>(await requireBridge().list()).map((item) => get(item.providerInstanceId)))
      const owner = providers.find((item) => item.credentials.some((credential) => credential.credentialVersionRef === credentialVersionRef))
      if (!owner) throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_MISSING')
      const credential = owner.credentials.find((item) => item.credentialVersionRef === credentialVersionRef)!
      const result = unwrap<RecordValue>(await requireBridge().clearCredential({ providerInstanceId: owner.provider.providerInstanceId,
        credentialVersionRef, expectedRevision: credential.version }))
      return project(Object.freeze({ details: result.details, activeConfiguration: result.activeConfiguration }))
    },
    deleteProvider: async (providerInstanceId: string) => { unwrap(await requireBridge().delete(providerInstanceIdSchema.parse(providerInstanceId))); return null },
    testConnection: (providerInstanceId: string, requestId: string) => requireBridge().testConnection({ providerInstanceId, requestId }),
  })
}
