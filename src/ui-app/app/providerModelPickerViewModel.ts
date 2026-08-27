import type { RuntimeProviderId } from '@/next/provider/runtimeProviderId'
import type { CatalogQueryItem } from '@/next/modelCatalog/catalogQueryService'

export type ProviderModelPickerStatusKind =
  | 'ready'
  | 'loading'
  | 'not_loaded'
  | 'credential_missing'
  | 'unavailable'

export type ProviderModelPickerItem = Readonly<{
  providerId: RuntimeProviderId
  providerName: string
  modelId: string
  modelKey: string
  displayName: string
  description: string | null
  vendor: string | null
  observation?: CatalogQueryItem['observation']
  statusKind: ProviderModelPickerStatusKind
  statusLabel: string
  sourceLabel: string
  selectable: boolean
  inputModalities: string[]
  outputModalities: string[]
}>

export type ProviderModelPickerSource = Readonly<{
  providerId: RuntimeProviderId
  providerName: string
  statusKind: ProviderModelPickerStatusKind
  statusLabel: string
  loading: boolean
  items: readonly ProviderModelPickerItem[]
}>
