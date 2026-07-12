export type AssistantAnswerGenerationSnapshotV1 = Readonly<{
  schemaVersion: 1
  route: Readonly<{
    providerId: string
    modelId: string
    endpointId: string
    profileId: string
  }>
  generationParams: Readonly<Record<string, unknown>>
  reasoning: Readonly<Record<string, unknown>>
  webSearch: Readonly<Record<string, unknown>>
  imageGeneration: Readonly<Record<string, unknown>>
  providerOptions: Readonly<Record<string, unknown>>
  tools: Readonly<{
    enabled: boolean
    allowedToolIds: readonly string[]
    requireExternalSideEffectConfirmation: true
  }>
  attachments: Readonly<{
    sourceQuestionId: string
    items: readonly Readonly<Record<string, unknown>>[]
  }>
}>

export type AssistantAnswerGenerationOperationState = 'committed' | 'streaming' | 'completed' | 'failed' | 'cancelled'

export type AssistantAnswerGenerationCommandResult = Readonly<{
  operationId: string
  actionKind: 'regenerate' | 'retry_replace' | 'retry_as_new'
  newAnswerRootId: string
  newAssistantSeq: number
  chosenAnswerRootId: string
  headMessageId: string
  snapshot: AssistantAnswerGenerationSnapshotV1
  state: AssistantAnswerGenerationOperationState
  idempotentReplay: boolean
  compatibleRouteProvenanceId?: string
}>
