export type BranchMutationCommandV2 = Readonly<{
  sourceBranchId: string
  expectedHeadMessageId: string
  clientActionId: string
}>
