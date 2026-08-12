import type {
  CompatibleCredentialDescriptor,
  CompatibleEndpointRevision,
  CompatibleProviderInstance,
} from './domain'

export type CompatibleRendererCredentialDescriptor = Readonly<{
  credentialVersionRef: CompatibleCredentialDescriptor['credentialVersionRef']
  providerInstanceId: CompatibleCredentialDescriptor['providerInstanceId']
  version: number
  authMode: CompatibleCredentialDescriptor['authMode']
  configured: boolean
  availability: 'unknown' | 'available' | 'unavailable'
  diagnosticCode?: string
  storageBackend?: 'electron_safe_storage' | 'session' | 'plaintext'
  sessionOverridesPersistent: boolean
  maskState: CompatibleCredentialDescriptor['maskedSummary']['maskState']
  sensitiveHeaderNames: readonly string[]
  deletedAtMs: number | null
}>

export type CompatibleRendererEndpointRevision = Omit<
  CompatibleEndpointRevision,
  'auth' | 'ordinaryHeaders' | 'sensitiveHeaderRefs' | 'query'
> & Readonly<{
  authMode: CompatibleEndpointRevision['auth']['mode']
  ordinaryHeaders: readonly Readonly<CompatibleEndpointRevision['ordinaryHeaders'][number]>[]
  sensitiveHeaderRefs: readonly Readonly<CompatibleEndpointRevision['sensitiveHeaderRefs'][number]>[]
  query: readonly Readonly<CompatibleEndpointRevision['query'][number]>[]
}>

export type CompatibleRendererProviderInstance = CompatibleProviderInstance

export function toCompatibleRendererCredentialDescriptor(
  descriptor: CompatibleCredentialDescriptor,
  securePayloadAvailable = descriptor.deletedAtMs === null,
): CompatibleRendererCredentialDescriptor {
  const configured = descriptor.deletedAtMs === null && securePayloadAvailable && descriptor.maskedSummary.configured
  return Object.freeze({
    credentialVersionRef: descriptor.credentialVersionRef,
    providerInstanceId: descriptor.providerInstanceId,
    version: descriptor.version,
    authMode: descriptor.authMode,
    configured,
    availability: configured ? 'unknown' : 'unknown',
    sessionOverridesPersistent: false,
    maskState: descriptor.authMode === 'none' ? 'not_applicable' : configured ? 'configured_masked' : 'not_configured',
    sensitiveHeaderNames: Object.freeze([...descriptor.maskedSummary.sensitiveHeaderNames]),
    deletedAtMs: descriptor.deletedAtMs,
  })
}

export function toCompatibleRendererEndpointRevision(
  endpoint: CompatibleEndpointRevision,
): CompatibleRendererEndpointRevision {
  const { auth, ...safe } = endpoint
  return Object.freeze({
    ...safe,
    ordinaryHeaders: Object.freeze(endpoint.ordinaryHeaders.map((entry) => Object.freeze({ ...entry }))),
    sensitiveHeaderRefs: Object.freeze(endpoint.sensitiveHeaderRefs.map((entry) => Object.freeze({ ...entry }))),
    query: Object.freeze(endpoint.query.map((entry) => Object.freeze({ ...entry }))),
    authMode: auth.mode,
  })
}
