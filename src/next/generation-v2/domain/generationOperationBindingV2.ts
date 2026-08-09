export type GenerationOperationBindingV2 = Readonly<{
  operationId: string
  conversationId: string
  branchId: string
  targetAnswerId: string
  sourceAnswerId: string | null
  snapshotHash: string
  providerId: string
  contractId: string
}>
