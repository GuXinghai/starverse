export type ConversationListItem = Readonly<{
  id: string
  title: string
  updatedAt: number
}>

export type ProjectListItem = Readonly<{
  id: string
  name: string
  isSystem?: boolean
  convoCount?: number
}>
