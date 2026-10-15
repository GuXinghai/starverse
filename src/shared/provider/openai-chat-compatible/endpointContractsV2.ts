type ProviderStatus = 'active' | 'disabled' | 'deleted'

export type OpenAICompatibleEndpointRevisionV2 = Readonly<{
  endpointRevisionId: string
  providerInstanceId: string
  revision: number
  baseUrl: string
  securityPolicy: 'compatibility_first' | 'strict_ssrf'
  auth: unknown
  ordinaryHeaders: unknown
  query: unknown
  requestProfileId: string
  requestProfileVersion: number
  responseProfileId: string
  responseProfileVersion: number
  endpointDigest: string
  createdAtMs: number
}>

export type OpenAICompatibleProviderDetailsV2 = Readonly<{
  providerInstanceId: string
  protocolContractId: 'openai_chat_compatible'
  displayName: string
  status: ProviderStatus
  createdAtMs: number
  updatedAtMs: number
  deletedAtMs: number | null
  endpointRevisions: readonly OpenAICompatibleEndpointRevisionV2[]
}>
