import type { LocalEndpointExecutionProviderId, LocalEndpointProtocolV2 } from './localProviderRouteDescriptor'

export type LocalEndpointProfileV2 = Readonly<{
  endpointProfileId: string
  providerId: LocalEndpointExecutionProviderId
  protocolContractId: LocalEndpointProtocolV2
  baseUrl: string
  credentialMode: 'none'
  credentialScopeId: string
  protocolConfig: Readonly<Record<string, unknown>>
  revisionGeneration: number
  profileRevision: string
  profileDigest: string
  createdAtMs: number
  updatedAtMs: number
}>
