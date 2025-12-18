export type ModelCatalogStatus = 'visible' | 'hidden'

export type ModelCatalogItem = Readonly<{
  modelId: string
  name: string
  vendor: string
  status: ModelCatalogStatus
  supportedParameters: string[]
  lastSeenSnapshotId: string
}>

