export const CONVERSATION_GRAPH_V2_SCHEMA_VERSION = 1 as const

export const CONVERSATION_GRAPH_V2_ROLES = Object.freeze([
  'system', 'user', 'assistant', 'tool',
] as const)

export const CONVERSATION_GRAPH_V2_MESSAGE_STATUSES = Object.freeze([
  'streaming', 'completed', 'failed', 'cancelled',
] as const)

export type ConversationGraphV2Role = typeof CONVERSATION_GRAPH_V2_ROLES[number]
export type ConversationGraphV2MessageStatus = typeof CONVERSATION_GRAPH_V2_MESSAGE_STATUSES[number]

export type ConversationGraphV2IdentityKind =
  | 'project_id'
  | 'conversation_id'
  | 'message_id'
  | 'branch_id'
  | 'question_id'
  | 'answer_root_id'

const IDENTITY_KINDS = new Set<ConversationGraphV2IdentityKind>([
  'project_id', 'conversation_id', 'message_id', 'branch_id', 'question_id', 'answer_root_id',
])
const IDENTITY_TOKEN: unique symbol = Symbol('starverse.generation-v2.conversation-graph-identity')
const identities = new WeakSet<object>()

export class ConversationGraphV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_GRAPH_IDENTITY_KIND_INVALID'
    | 'GENERATION_V2_GRAPH_IDENTITY_VALUE_INVALID') {
    super(code)
    this.name = 'ConversationGraphV2Error'
  }
}

export class ConversationGraphV2Identity<K extends ConversationGraphV2IdentityKind> {
  private constructor(
    token: typeof IDENTITY_TOKEN,
    readonly kind: K,
    readonly value: string,
  ) {
    if (token !== IDENTITY_TOKEN) {
      throw new ConversationGraphV2Error('GENERATION_V2_GRAPH_IDENTITY_VALUE_INVALID')
    }
    identities.add(this)
    Object.freeze(this)
  }

  static create<K extends ConversationGraphV2IdentityKind>(
    kind: K,
    value: string,
  ): ConversationGraphV2Identity<K> {
    if (!IDENTITY_KINDS.has(kind)) {
      throw new ConversationGraphV2Error('GENERATION_V2_GRAPH_IDENTITY_KIND_INVALID')
    }
    if (typeof value !== 'string' || value.length === 0 || value.length > 512 ||
        value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
      throw new ConversationGraphV2Error('GENERATION_V2_GRAPH_IDENTITY_VALUE_INVALID')
    }
    return new ConversationGraphV2Identity(IDENTITY_TOKEN, kind, value)
  }
}

Object.freeze(ConversationGraphV2Identity.prototype)

export function isConversationGraphV2Identity<K extends ConversationGraphV2IdentityKind>(
  value: unknown,
  kind: K,
): value is ConversationGraphV2Identity<K> {
  return Boolean(value && typeof value === 'object' && identities.has(value) &&
    (value as ConversationGraphV2Identity<ConversationGraphV2IdentityKind>).kind === kind)
}
