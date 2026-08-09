import type { JsonObject, JsonValue } from './internalSchema'
import type { ProviderCatalogKnownProviderKey } from './providerCatalogContracts'

export type ProviderModelCapabilityKeyV2 =
  | 'textChat'
  | 'reasoning'
  | 'tools'
  | 'structuredOutputs'
  | 'vision'

export type ProviderReportedFactV2<T extends JsonValue = JsonValue> = Readonly<{
  providerPath: string
  ownProperty: boolean
  presence: 'present' | 'missing' | 'invalid'
  value?: T
  rawValue?: JsonValue
}>

export type CatalogProviderModelObservationV2 = Readonly<{
  schemaVersion: 2
  providerKey: ProviderCatalogKnownProviderKey
  endpointId: string
  nativeModelId: string
  observedAtMs: number
  rawProviderRecord: JsonObject
  facts: Readonly<Record<ProviderModelCapabilityKeyV2, ProviderReportedFactV2<boolean>>>
  provenance: Readonly<{
    sourceKind: 'provider_api'
    sourceLabel: string
    observedAtMs: number
    parserVersion: 2
  }>
}>

export type CapabilityFactV2 = Readonly<{
  state: 'supported' | 'unsupported' | 'unknown'
  source: 'provider_catalog' | 'verified_contract'
  rawPath: string | null
}>

export type ResolvedModelCapabilityV2 = Readonly<{
  capability: ProviderModelCapabilityKeyV2
  providerReported: ProviderReportedFactV2<boolean>
  modelSupport: 'supported' | 'unsupported' | 'unknown'
  enabled: boolean
  resolutionSource: 'provider_reported' | 'reviewed_contract_supplement' | 'none'
  wireImplementation: 'implemented' | 'not_implemented'
  executionAuthority: 'none'
  reported: CapabilityFactV2 | null
  contract: CapabilityFactV2 | null
  effective: Readonly<{
    state: 'supported' | 'unsupported' | 'unknown'
    source: 'provider_catalog' | 'verified_contract' | 'none'
  }>
  wireSupport: 'implemented' | 'unsupported'
  conflict: boolean
  reviewedContract?: Readonly<{
    protocolContractId: string
    contractRevision: string
    registryRevision: string
  }>
}>

const SENSITIVE_KEY = /^(?:authorization|api[-_]?key|token|secret|password)$/iu

function toSafeJsonValue(value: unknown, depth = 0): JsonValue {
  if (depth > 20) return '[max-depth]'
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value)
  if (Array.isArray(value)) return value.map((item) => toSafeJsonValue(item, depth + 1))
  if (!value || typeof value !== 'object') return String(value)
  const out: Record<string, JsonValue> = {}
  for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(childKey)) continue
    out[childKey] = toSafeJsonValue(childValue, depth + 1)
  }
  return out
}

export function preserveProviderRecordV2(record: Readonly<Record<string, unknown>>): JsonObject {
  return toSafeJsonValue(record) as JsonObject
}

export function providerBooleanFactV2(input: Readonly<{
  owner: Readonly<Record<string, unknown>> | null
  key: string
  providerPath: string
}>): ProviderReportedFactV2<boolean> {
  const ownProperty = Boolean(input.owner && Object.prototype.hasOwnProperty.call(input.owner, input.key))
  const raw = ownProperty ? input.owner?.[input.key] : undefined
  return {
    providerPath: input.providerPath,
    ownProperty,
    presence: typeof raw === 'boolean' ? 'present' : ownProperty ? 'invalid' : 'missing',
    ...(typeof raw === 'boolean' ? { value: raw, rawValue: raw } : ownProperty ? { rawValue: toSafeJsonValue(raw) } : {}),
  }
}

export function missingProviderBooleanFactV2(providerPath: string): ProviderReportedFactV2<boolean> {
  return { providerPath, ownProperty: false, presence: 'missing' }
}
