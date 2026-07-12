import { describe, expect, it } from 'vitest'
import { BranchProjectionRefreshCoordinator, buildBranchViewSnapshot, mergePersistedMessageWithRuntimeOverlay } from './branchViewProjection'
import type { MessageState } from '@/next/state/types'

const question = {
  id: 'q1', convoId: 'c1', role: 'user', seq: 1, createdAt: 1, parentId: null,
  status: 'final', answerRootId: null, questionId: null, body: 'Q', meta: null,
  routeProvenanceId: null, choiceIndex: null,
}
const answer = {
  id: 'a1', convoId: 'c1', role: 'assistant', seq: 2, createdAt: 2, parentId: 'q1',
  status: 'final', answerRootId: 'a1', questionId: 'q1', body: 'A', meta: null,
  routeProvenanceId: null, choiceIndex: null,
}

describe('branch view projection', () => {
  it('builds chosen and context state from one renderable snapshot', () => {
    const snapshot = buildBranchViewSnapshot({
      branchId: 'b1', revision: 3, messageMetaById: new Map([['a1', { status: 'final' }]]),
      rendered: {
        messages: [question, answer],
        turns: [{
          questionId: 'q1', chosenAnswerRootId: 'a1', questionMode: 'include',
          answerMode: 'exclude', effectiveMode: 'exclude', lockedByQuestionExclude: false,
        }],
      },
    })

    expect(snapshot.answerByRootId.get('a1')).toEqual({
      answerRootId: 'a1', questionId: 'q1', isChosen: true, contextMode: 'exclude',
    })
    expect(snapshot.turnByQuestionId.get('q1')?.chosenAnswerRootId).toBe('a1')
    expect(snapshot.consistencyErrors).toEqual([])
  })

  it('reports a chosen answer that is missing from the same snapshot', () => {
    const snapshot = buildBranchViewSnapshot({
      branchId: 'b1', revision: 1, messageMetaById: new Map(),
      rendered: {
        messages: [question],
        turns: [{
          questionId: 'q1', chosenAnswerRootId: 'missing', questionMode: 'include',
          answerMode: 'include', effectiveMode: 'include', lockedByQuestionExclude: false,
        }],
      },
    })
    expect(snapshot.consistencyErrors).toEqual([{
      code: 'chosen_answer_missing', questionId: 'q1', answerRootId: 'missing',
    }])
  })

  it('rejects stale leases and branch switches', () => {
    const coordinator = new BranchProjectionRefreshCoordinator()
    const first = coordinator.begin('b1')
    const second = coordinator.begin('b1')
    expect(coordinator.isCurrent(first, 'b1')).toBe(false)
    expect(coordinator.isCurrent(second, 'b1')).toBe(true)
    expect(coordinator.isCurrent(second, 'b2')).toBe(false)
    coordinator.invalidate()
    expect(coordinator.isCurrent(second, 'b1')).toBe(false)
  })

  it('preserves an active stream runtime overlay across a persisted refresh', () => {
    const persisted = {
      messageId: 'a1', role: 'assistant', contentText: 'partial', contentBlocks: [{ type: 'text', text: 'partial' }],
      toolCalls: [], reasoningDetailsRaw: [], reasoningDisplayBlocks: [], providerNativeContents: [],
      reasoningPanelState: 'collapsed', hasEncryptedReasoning: false,
      streaming: { isTarget: false, isComplete: true }, textVersion: 0, reasoningVersion: 0,
      requestedReasoningMode: 'auto', requestedReasoningExclude: false,
    } as MessageState
    const runtime = {
      ...persisted,
      contentText: 'partial plus live token',
      contentBlocks: [{ type: 'text', text: 'partial plus live token' }],
      streaming: { isTarget: true, isComplete: false },
      textVersion: 4,
    } as MessageState

    expect(mergePersistedMessageWithRuntimeOverlay(persisted, runtime, true)).toMatchObject({
      contentText: 'partial plus live token',
      streaming: { isTarget: true, isComplete: false },
      textVersion: 4,
    })
  })
})
