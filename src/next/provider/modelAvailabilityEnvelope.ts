export type ProviderModelAvailabilityConfidence =
  | 'provider_reported'
  | 'curated'
  | 'manual'
  | 'probed'

export type ProviderModelSourceKind =
  | 'provider_api'
  | 'provider_docs'
  | 'starverse_curated_metadata'
  | 'manual_user_model_id'
  | 'local_probe'

export type ProviderModelAvailabilityProvenance = Readonly<{
  sourceKind: ProviderModelSourceKind
  sourceLabel: string
  observedAtMs: number
  metadataVersion?: string
  parserVersion: number
}>

export type ProviderModelCapabilityValue =
  | boolean
  | 'supported'
  | 'unsupported'
  | 'unknown'

export type ProviderModelCapabilitySeed = Readonly<{
  textChat?: boolean
  contextLength?: number
  maxInputTokens?: number
  maxOutputTokens?: number

  reasoning?: 'supported' | 'unsupported' | 'unknown'
  thinking?: 'supported' | 'unsupported' | 'unknown'

  imageInput?: boolean | 'unknown'
  fileInput?: boolean | 'unknown'
  functionCalling?: boolean | 'unknown'
  hostedTools?: boolean | 'unknown'
  structuredOutput?: boolean | 'unknown'
  toolUse?: boolean | 'unknown'
  citations?: boolean | 'unknown'
  audioInput?: boolean | 'unknown'

  rawCapabilityKeys?: readonly string[]
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
  capabilitySeed?: ProviderModelCapabilitySeed

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
    ...(input.capabilitySeed ? { capabilitySeed: { ...input.capabilitySeed } } : {}),
    ...(input.provenance ? { provenance: { ...input.provenance } } : {}),
    ...(input.providerSpecific !== undefined ? { providerSpecific: input.providerSpecific } : {}),
  }
}
