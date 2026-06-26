import { describe, expect, it } from 'vitest'
import type { ReasoningArtifact } from '@/next/provider/reasoningArtifact'
import {
  removeReasoningArtifactsForMessages,
  replaceReasoningArtifactsForMessage,
  retainReasoningArtifactsForMessages,
} from './reasoningArtifactLifecycle'

function artifact(messageId: string, sequence: number, text: string): ReasoningArtifact {
  return {
    id: `ra_${messageId}_${sequence}`,
    providerKey: 'openrouter',
    messageId,
    streamTurnId: `turn_${messageId}`,
    sequence,
    kind: 'reasoning_text',
    visibility: 'hidden_from_visible_text',
    createdAtMs: 1,
    text,
    warnings: [],
  }
}

describe('reasoningArtifactLifecycle', () => {
  it('replaces artifacts for a new send on the same assistant message', () => {
    const current = replaceReasoningArtifactsForMessage({}, 'a1', [artifact('a1', 0, 'old')])
    const next = replaceReasoningArtifactsForMessage(current, 'a1', [artifact('a1', 0, 'new')])

    expect(next.a1?.map((item) => item.text)).toEqual(['new'])
    expect(next.a1?.map((item) => item.sequence)).toEqual([0])
  })

  it('keeps retry/regenerate artifacts isolated by assistant message id', () => {
    const current = replaceReasoningArtifactsForMessage({}, 'a_old', [artifact('a_old', 0, 'old')])
    const next = replaceReasoningArtifactsForMessage(current, 'a_new', [artifact('a_new', 0, 'new')])

    expect(next.a_old?.[0]?.text).toBe('old')
    expect(next.a_new?.[0]?.text).toBe('new')
  })

  it('removes artifacts for deleted messages', () => {
    const current = {
      a1: [artifact('a1', 0, 'one')],
      a2: [artifact('a2', 0, 'two')],
    }

    expect(removeReasoningArtifactsForMessages(current, ['a1'])).toEqual({
      a2: current.a2,
    })
  })

  it('clears conversation artifacts by retaining an empty visible message set', () => {
    const current = {
      a1: [artifact('a1', 0, 'one')],
      a2: [artifact('a2', 0, 'two')],
    }

    expect(retainReasoningArtifactsForMessages(current, [])).toEqual({})
  })

  it('drops artifacts that are no longer in the hydrated transcript', () => {
    const current = {
      a1: [artifact('a1', 0, 'one')],
      a2: [artifact('a2', 0, 'two')],
    }

    expect(retainReasoningArtifactsForMessages(current, ['u1', 'a2'])).toEqual({
      a2: current.a2,
    })
  })
})
