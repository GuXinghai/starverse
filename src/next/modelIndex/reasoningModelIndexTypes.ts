export type ReasoningModelIndexStatus = 'visible' | 'hidden'

export type ReasoningModelIndexItem = Readonly<{
  modelId: string
  name: string
  status: ReasoningModelIndexStatus
  lastSyncedSnapshot: string
}>

