import { describe, expect, it } from 'vitest'
import {
  CONVERSATION_GRAPH_V2_MESSAGE_STATUSES,
  CONVERSATION_GRAPH_V2_ROLES,
  ConversationGraphV2Identity,
  isConversationGraphV2Identity,
} from './conversationGraphV2'

describe('Generation V2 conversation graph domain', () => {
  it('owns a closed minimal role/status vocabulary', () => {
    expect(CONVERSATION_GRAPH_V2_ROLES).toEqual(['system', 'user', 'assistant', 'tool'])
    expect(CONVERSATION_GRAPH_V2_MESSAGE_STATUSES)
      .toEqual(['streaming', 'completed', 'failed', 'cancelled'])
    expect(Object.isFrozen(CONVERSATION_GRAPH_V2_ROLES)).toBe(true)
    expect(Object.isFrozen(CONVERSATION_GRAPH_V2_MESSAGE_STATUSES)).toBe(true)
  })

  it('brands graph identities without accepting forged or unsafe values', () => {
    const message = ConversationGraphV2Identity.create('message_id', 'message:01')
    expect(isConversationGraphV2Identity(message, 'message_id')).toBe(true)
    expect(isConversationGraphV2Identity(message, 'question_id')).toBe(false)
    expect(isConversationGraphV2Identity({ ...message }, 'message_id')).toBe(false)
    for (const value of ['', ' message', 'message\n', 'x'.repeat(513)]) {
      expect(() => ConversationGraphV2Identity.create('message_id', value))
        .toThrow('GENERATION_V2_GRAPH_IDENTITY_VALUE_INVALID')
    }
  })
})
