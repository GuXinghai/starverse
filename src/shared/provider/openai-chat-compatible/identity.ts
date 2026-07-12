import { z } from 'zod'

export const OPENAI_CHAT_COMPATIBLE_PROTOCOL_KEY = 'openai_chat_compatible' as const

type Brand<Value, Name extends string> = Value & { readonly __brand: Name }

export type ProviderInstanceId = Brand<string, 'ProviderInstanceId'>
export type EndpointRevisionId = Brand<string, 'EndpointRevisionId'>
export type CredentialVersionRef = Brand<string, 'CredentialVersionRef'>
export type RequestProfileId = Brand<string, 'RequestProfileId'>
export type RequestFieldMappingId = Brand<string, 'RequestFieldMappingId'>
export type ResponseProfileId = Brand<string, 'ResponseProfileId'>
export type ReasoningMappingId = Brand<string, 'ReasoningMappingId'>
export type InlinePolicyId = Brand<string, 'InlinePolicyId'>
export type CatalogSnapshotId = Brand<string, 'CatalogSnapshotId'>
export type RouteProvenanceId = Brand<string, 'RouteProvenanceId'>
export type RawExtensionRecordId = Brand<string, 'RawExtensionRecordId'>

const suffixPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{7,95}$/

function opaqueIdSchema<const Prefix extends string>(prefix: Prefix) {
  return z.string()
    .trim()
    .max(prefix.length + 96)
    .refine((value) => value.startsWith(prefix) && suffixPattern.test(value.slice(prefix.length)), {
      message: `Expected an opaque ${prefix} identifier`,
    })
}

export const providerInstanceIdSchema = opaqueIdSchema('ocp_provider_')
  .transform((value) => value as ProviderInstanceId)
export const endpointRevisionIdSchema = opaqueIdSchema('ocp_endpoint_')
  .transform((value) => value as EndpointRevisionId)
export const credentialVersionRefSchema = opaqueIdSchema('ocp_credential_')
  .transform((value) => value as CredentialVersionRef)
export const requestProfileIdSchema = opaqueIdSchema('ocp_request_profile_')
  .transform((value) => value as RequestProfileId)
export const requestFieldMappingIdSchema = opaqueIdSchema('ocp_request_mapping_')
  .transform((value) => value as RequestFieldMappingId)
export const responseProfileIdSchema = opaqueIdSchema('ocp_response_profile_')
  .transform((value) => value as ResponseProfileId)
export const reasoningMappingIdSchema = opaqueIdSchema('ocp_reasoning_mapping_')
  .transform((value) => value as ReasoningMappingId)
export const inlinePolicyIdSchema = opaqueIdSchema('ocp_inline_policy_')
  .transform((value) => value as InlinePolicyId)
export const catalogSnapshotIdSchema = opaqueIdSchema('ocp_catalog_snapshot_')
  .transform((value) => value as CatalogSnapshotId)
export const routeProvenanceIdSchema = opaqueIdSchema('ocp_route_')
  .transform((value) => value as RouteProvenanceId)
export const rawExtensionRecordIdSchema = opaqueIdSchema('ocp_raw_extension_')
  .transform((value) => value as RawExtensionRecordId)

export const compatibleProfileVersionSchema = z.number().int().positive().max(2_147_483_647)
export const compatibleRevisionSchema = z.number().int().positive().max(2_147_483_647)
export const compatibleChoiceIndexSchema = z.number().int().nonnegative().max(1024)
export const compatibleModelIdSchema = z.string().trim().min(1).max(512)
export const compatibleMessageIdSchema = z.string().trim().min(1).max(256)
export const compatibleRequestIdSchema = z.string().trim().min(1).max(256)

export type CompatibleModelIdentity = Readonly<{
  providerInstanceId: ProviderInstanceId
  modelId: string
}>

export const compatibleModelIdentitySchema = z.object({
  providerInstanceId: providerInstanceIdSchema,
  modelId: compatibleModelIdSchema,
}).strict()

const opaqueIdPrefixes = {
  provider: 'ocp_provider_',
  endpoint: 'ocp_endpoint_',
  credential: 'ocp_credential_',
  requestProfile: 'ocp_request_profile_',
  requestMapping: 'ocp_request_mapping_',
  responseProfile: 'ocp_response_profile_',
  reasoningMapping: 'ocp_reasoning_mapping_',
  inlinePolicy: 'ocp_inline_policy_',
  catalogSnapshot: 'ocp_catalog_snapshot_',
  route: 'ocp_route_',
  rawExtension: 'ocp_raw_extension_',
} as const

export type CompatibleOpaqueIdKind = keyof typeof opaqueIdPrefixes

export function formatCompatibleOpaqueId(kind: CompatibleOpaqueIdKind, suffix: string): string {
  const prefix = opaqueIdPrefixes[kind]
  const normalizedSuffix = String(suffix ?? '').trim()
  if (!suffixPattern.test(normalizedSuffix)) {
    throw new Error('Compatible opaque ID suffix is invalid.')
  }
  return `${prefix}${normalizedSuffix}`
}
