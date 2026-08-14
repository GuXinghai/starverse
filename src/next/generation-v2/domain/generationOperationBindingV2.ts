import type { GenerationExecutionProviderId } from './generationExecutionProviderId'

export type GenerationOperationBindingV2 = Readonly<{
  operationId: string
  conversationId: string
  branchId: string
  targetAnswerId: string
  sourceAnswerId: string | null
  snapshotHash: string
  providerId: GenerationExecutionProviderId
  contractId: string
}>
