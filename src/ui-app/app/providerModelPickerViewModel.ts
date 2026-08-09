import type { RuntimeProviderKey } from '@/next/provider/runtimeSelection'
import type { CatalogQueryItem } from '@/next/modelCatalog/catalogQueryService'

export type ProviderModelPickerStatusKind =
  | 'ready'
  | 'loading'
  | 'not_loaded'
  | 'credential_missing'
  | 'unavailable'

export type ProviderModelPickerItem = Readonly<{
  providerId: RuntimeProviderKey
  providerName: string
  modelId: string
  modelKey: string
  displayName: string
  description: string | null
  vendor: string | null
  capabilitySummary: string
  capabilityResolution?: CatalogQueryItem['capabilityResolution']
  observation?: CatalogQueryItem['observation']
  statusKind: ProviderModelPickerStatusKind
  statusLabel: string
  sourceLabel: string
  selectable: boolean
  inputModalities: string[]
  outputModalities: string[]
}>

export type ProviderModelPickerSource = Readonly<{
  providerId: RuntimeProviderKey
  providerName: string
  statusKind: ProviderModelPickerStatusKind
  statusLabel: string
  loading: boolean
  items: readonly ProviderModelPickerItem[]
}>
