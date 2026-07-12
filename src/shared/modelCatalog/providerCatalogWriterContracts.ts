export type CatalogScopedModelUpsertInput = Readonly<{
  modelId: string
  modelKey: string
  canonicalSlug?: string | null
  displayName: string
  description?: string | null
  vendor?: string | null
  family?: string | null
  status: 'active' | 'deprecated' | 'archived'
  visibility: 'visible' | 'hidden'
  contextLength?: number | null
  maxOutputTokens?: number | null
  inputModalitiesJson?: string
  outputModalitiesJson?: string
  supportedParametersJson?: string
  capabilitiesJson?: string
  pricingJson?: string | null
  rawJson?: string | null
  createdAtSec?: number | null
  firstSeenAtMs: number
  lastSeenAtMs: number
  syncedAtMs: number
}>

export type CatalogScopedSnapshotWriterInput = Readonly<{
  providerKey: string
  catalogScopeKey?: string
  baseUrl: string
  dataSource: 'models_user_primary' | 'models_fallback' | 'mixed'
  snapshotId: string
  snapshotChecksum?: string | null
  models: CatalogScopedModelUpsertInput[]
  syncedAtMs: number
  schemaVersion: number
}>
