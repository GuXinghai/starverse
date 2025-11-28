export const CONVERSATION_STATUS_OPTIONS = ['draft', 'active', 'completed', 'archived'] as const

export type ConversationStatus = (typeof CONVERSATION_STATUS_OPTIONS)[number]

export const CONVERSATION_STATUS_LABELS: Record<ConversationStatus, string> = {
  draft: '草稿',
  active: '进行中',
  completed: '已完成',
  archived: '已归档'
}

export const DEFAULT_CONVERSATION_STATUS: ConversationStatus = 'draft'

export const normalizeConversationStatus = (value?: string | null): ConversationStatus => {
  if (value && CONVERSATION_STATUS_OPTIONS.includes(value as ConversationStatus)) {
    return value as ConversationStatus
  }
  return DEFAULT_CONVERSATION_STATUS
}

export const normalizeConversationTags = (input?: unknown): string[] => {
  if (!Array.isArray(input)) {
    return []
  }

  const normalized = input
    .map(item => (typeof item === 'string' ? item.trim() : ''))
    .filter(item => item.length > 0 && item.length <= 48)

  return Array.from(new Set(normalized)).slice(0, 32)
}
