export type ProviderModelAvailabilityConfidence =
  | 'provider_reported'
  | 'curated'
  | 'manual'
  | 'probed'

export type ProviderModelSourceKind =
  | 'provider_api'
  | 'provider_docs'
  | 'manual_user_model_id'
  | 'local_probe'

export type ProviderModelAvailabilityProvenance = Readonly<{
  sourceKind: ProviderModelSourceKind
  sourceLabel: string
  observedAtMs: number
  metadataVersion?: string
  parserVersion: number
}>

export type ProviderModelAvailabilityEnvelope<
  TProviderKey extends string = string,
  TEndpointId extends string = string,
  TProfileId extends string = string,
  TProviderSpecific = unknown,
> = Readonly<{
  providerKey: TProviderKey
  endpointId: TEndpointId
  profileId: TProfileId
  nativeModelId: string

  displayName?: string
  description?: string

  source: string
  confidence: ProviderModelAvailabilityConfidence
  observedAtMs: number
  warnings: readonly string[]

  provenance?: ProviderModelAvailabilityProvenance

  providerSpecific?: TProviderSpecific
}>

export const PROVIDER_MODEL_AVAILABILITY_ENVELOPE_PARSER_VERSION = 1

export function createProviderModelAvailabilityProvenance(input: Readonly<{
  sourceKind: ProviderModelSourceKind
  sourceLabel: string
  observedAtMs: number
  metadataVersion?: string
  parserVersion?: number
}>): ProviderModelAvailabilityProvenance {
  return {
    sourceKind: input.sourceKind,
    sourceLabel: input.sourceLabel,
    observedAtMs: input.observedAtMs,
    ...(input.metadataVersion ? { metadataVersion: input.metadataVersion } : {}),
    parserVersion: input.parserVersion ?? PROVIDER_MODEL_AVAILABILITY_ENVELOPE_PARSER_VERSION,
  }
}

export function createProviderModelAvailabilityEnvelope<
  TProviderKey extends string,
  TEndpointId extends string,
  TProfileId extends string,
  TProviderSpecific,
>(input: ProviderModelAvailabilityEnvelope<TProviderKey, TEndpointId, TProfileId, TProviderSpecific>): ProviderModelAvailabilityEnvelope<TProviderKey, TEndpointId, TProfileId, TProviderSpecific> {
  return {
    ...input,
    warnings: [...input.warnings],
    ...(input.provenance ? { provenance: { ...input.provenance } } : {}),
    ...(input.providerSpecific !== undefined ? { providerSpecific: input.providerSpecific } : {}),
  }
}
