import { describe, it, expect } from 'vitest'
import { selectMessage, selectTranscript, selectUsageSessionTotalDerived, selectUsageThisTurn } from './selectors'
import { applyEvent, createInitialState, startGeneration } from './reducer'

describe('selectMessage visibility (SSOT 3.4 compliance)', () => {
  it('returns "excluded" when reasoning.exclude was true and no reasoning returned', () => {
    const state = createInitialState()
    const { state: s1, assistantMessageId } = startGeneration(state, {
      runId: 'run1',
      requestId: 'req1',
      model: 'test-model',
      requestedReasoningMode: 'effort',
      requestedReasoningEffort: 'high',
      requestedReasoningExclude: true, // User requested to exclude reasoning
    })

    const vm = selectMessage(s1, assistantMessageId)

    // SSOT 3.4: "excluded：请求使用了 reasoning.exclude = true 且未返回任何 reasoning 内容"
    expect(vm?.reasoningView.visibility).toBe('excluded')
  })

  it('separates visibility from panelState and provides a default panelState', () => {
    const state = createInitialState()
    const { state: s1, assistantMessageId } = startGeneration(state, {
      runId: 'run1',
      requestId: 'req1',
      model: 'test-model',
      requestedReasoningMode: 'effort',
      requestedReasoningEffort: 'high',
      requestedReasoningExclude: true,
    })

    const vm1 = selectMessage(s1, assistantMessageId)
    expect(vm1?.reasoningView.panelState).toBe('expanded')
    expect(vm1?.reasoningView.visibility).toBe('excluded')

    const nextMessages = {
      ...s1.messages,
      [assistantMessageId]: {
        ...s1.messages[assistantMessageId],
        reasoningPanelState: 'collapsed' as const,
      },
    }
    const s2 = {
      ...s1,
      messages: nextMessages,
      entities: { ...s1.entities, messagesById: nextMessages },
    }

    const vm2 = selectMessage(s2, assistantMessageId)
    expect(vm2?.reasoningView.panelState).toBe('collapsed')
    expect(vm2?.reasoningView.visibility).toBe('excluded')
  })

  it('uses requested initial reasoning panel presentation when starting a generation', () => {
    const state = createInitialState()
    const { state: s1, assistantMessageId } = startGeneration(state, {
      runId: 'run1',
      requestId: 'req1',
      model: 'test-model',
      reasoningPanelDefaultExpanded: false,
    })

    const vm = selectMessage(s1, assistantMessageId)
    expect(vm?.reasoningView.panelState).toBe('collapsed')
  })

  it('returns "not_returned" when no exclude config and no reasoning returned', () => {
    const state = createInitialState()
    const { state: s1, assistantMessageId } = startGeneration(state, {
      runId: 'run1',
      requestId: 'req1',
      model: 'test-model',
      // No requestedReasoningExclude - user expected reasoning but model didn't provide
    })

    const vm = selectMessage(s1, assistantMessageId)

    // SSOT 3.4: "not returned：未请求 exclude，但仍未返回 reasoning"
    expect(vm?.reasoningView.visibility).toBe('not_returned')
  })

  it('returns "shown" when reasoning content is present (regardless of exclude setting)', () => {
    const state = createInitialState()
    const { state: s1, assistantMessageId } = startGeneration(state, {
      runId: 'run1',
      requestId: 'req1',
      model: 'test-model',
      requestedReasoningMode: 'effort',
      requestedReasoningEffort: 'high',
      requestedReasoningExclude: true, // Even with exclude=true
    })

    // Simulate receiving reasoning content
    const messagesWithReasoning = {
      ...s1.messages,
      [assistantMessageId]: {
        ...s1.messages[assistantMessageId],
        reasoningDetailsRaw: [{ type: 'reasoning.text', text: 'thinking...' }],
      },
    }
    const stateWithReasoning = {
      ...s1,
      messages: messagesWithReasoning,
      entities: { ...s1.entities, messagesById: messagesWithReasoning },
    }

    const vm = selectMessage(stateWithReasoning, assistantMessageId)

    // SSOT 3.4: If we have content, always show
    expect(vm?.reasoningView.visibility).toBe('shown')
  })

  it('prefers reasoning display blocks over legacy reasoning pieces', () => {
    const state = createInitialState()
    const { state: s1, assistantMessageId } = startGeneration(state, {
      runId: 'run1',
      requestId: 'req1',
      model: 'gemini-3.1-flash-image',
    })
    const messages = {
      ...s1.messages,
      [assistantMessageId]: {
        ...s1.messages[assistantMessageId],
        reasoningDetailsRaw: [{ type: 'thought_summary', summary: 'raw summary' }],
        reasoningSummaryText: 'legacy summary',
        reasoningPieces: [{ id: 1, type: 'text' as const, text: 'legacy piece' }],
        reasoningDisplayBlocks: [
          { blockId: 'b1', ordinal: 0, type: 'text' as const, text: 'display text', semanticRole: 'summary' as const },
          { blockId: 'b2', ordinal: 1, type: 'image' as const, url: 'asset://image-1', semanticRole: 'thought' as const },
        ],
      },
    }
    const vm = selectMessage({
      ...s1,
      messages,
      entities: { ...s1.entities, messagesById: messages },
    }, assistantMessageId)

    expect(vm?.reasoningView.displayBlocks).toEqual([
      { blockId: 'b1', ordinal: 0, type: 'text', text: 'display text', semanticRole: 'summary' },
      { blockId: 'b2', ordinal: 1, type: 'image', url: 'asset://image-1', semanticRole: 'thought' },
    ])
    expect(vm?.reasoningView.reasoningPieces).toBeUndefined()
  })

  it('returns "shown" when display blocks exist even without raw details', () => {
    const state = createInitialState()
    const { state: s1, assistantMessageId } = startGeneration(state, {
      runId: 'run1',
      requestId: 'req1',
      model: 'gemini-3.1-flash-image',
      requestedReasoningMode: 'effort',
      requestedReasoningEffort: 'high',
      requestedReasoningExclude: true,
    })
    const messages = {
      ...s1.messages,
      [assistantMessageId]: {
        ...s1.messages[assistantMessageId],
        reasoningDetailsRaw: [],
        reasoningDisplayBlocks: [
          { blockId: 'display-1', ordinal: 0, type: 'image' as const, url: 'asset://reasoning-image-1', semanticRole: 'thought' as const },
        ],
      },
    }

    const vm = selectMessage({
      ...s1,
      messages,
      entities: { ...s1.entities, messagesById: messages },
    }, assistantMessageId)

    expect(vm?.reasoningView.visibility).toBe('shown')
    expect(vm?.reasoningView.displayBlocks).toEqual([
      { blockId: 'display-1', ordinal: 0, type: 'image', url: 'asset://reasoning-image-1', semanticRole: 'thought' },
    ])
  })

  it('does not derive UI display text from raw reasoning details', () => {
    const state = createInitialState()
    const { state: s1, assistantMessageId } = startGeneration(state, {
      runId: 'run1',
      requestId: 'req1',
      model: 'gemini-2.5-flash',
    })

    const messagesWithThought = {
      ...s1.messages,
      [assistantMessageId]: {
        ...s1.messages[assistantMessageId],
        reasoningDetailsRaw: [{ type: 'thought', text: 'Gemini thought text' }],
        reasoningPieces: [],
      },
    }
    const stateWithThought = {
      ...s1,
      messages: messagesWithThought,
      entities: { ...s1.entities, messagesById: messagesWithThought },
    }

    const vm = selectMessage(stateWithThought, assistantMessageId)

    expect(vm?.reasoningView.visibility).toBe('shown')
    expect(vm?.reasoningView.reasoningText).toBeUndefined()
    expect(vm?.reasoningView.reasoningPieces).toBeUndefined()
    expect(vm?.reasoningView.displayBlocks).toBeUndefined()
  })

  it('does not derive UI summary text from raw reasoning summaries', () => {
    const state = createInitialState()
    const { state: s1, assistantMessageId } = startGeneration(state, {
      runId: 'run1',
      requestId: 'req1',
      model: 'gemini-3.1-flash-image',
    })

    const messagesWithThoughtSummary = {
      ...s1.messages,
      [assistantMessageId]: {
        ...s1.messages[assistantMessageId],
        reasoningDetailsRaw: [{ type: 'thought_summary', summary: 'Gemini image reasoning summary' }],
        reasoningPieces: [],
      },
    }
    const stateWithThoughtSummary = {
      ...s1,
      messages: messagesWithThoughtSummary,
      entities: { ...s1.entities, messagesById: messagesWithThoughtSummary },
    }

    const vm = selectMessage(stateWithThoughtSummary, assistantMessageId)

    expect(vm?.reasoningView.visibility).toBe('shown')
    expect(vm?.reasoningView.summaryText).toBeUndefined()
    expect(vm?.reasoningView.reasoningPieces).toBeUndefined()
    expect(vm?.reasoningView.displayBlocks).toBeUndefined()
  })

  it('keeps persisted summary text but does not derive image pieces from raw thought images', () => {
    const state = createInitialState()
    const { state: s1, assistantMessageId } = startGeneration(state, {
      runId: 'run1',
      requestId: 'req1',
      model: 'gemini-3.1-flash-image',
    })

    const messagesWithThoughtImage = {
      ...s1.messages,
      [assistantMessageId]: {
        ...s1.messages[assistantMessageId],
        reasoningSummaryText: 'Persisted reasoning summary',
        reasoningDetailsRaw: [
          {
            type: 'thought_image',
            image: {
              url: 'asset://message-images/reasoning-image.png',
              mimeType: 'image/png',
            },
          },
        ],
        reasoningPieces: [],
      },
    }
    const stateWithThoughtImage = {
      ...s1,
      messages: messagesWithThoughtImage,
      entities: { ...s1.entities, messagesById: messagesWithThoughtImage },
    }

    const vm = selectMessage(stateWithThoughtImage, assistantMessageId)

    expect(vm?.reasoningView.visibility).toBe('shown')
    expect(vm?.reasoningView.summaryText).toBe('Persisted reasoning summary')
    expect(vm?.reasoningView.reasoningPieces).toBeUndefined()
    expect(vm?.reasoningView.displayBlocks).toBeUndefined()
  })

  it('uses display blocks, not raw details, to preserve Gemini reasoning display order', () => {
    const state = createInitialState()
    const { state: s1, assistantMessageId } = startGeneration(state, {
      runId: 'run1',
      requestId: 'req1',
      model: 'gemini-3.1-flash-image',
    })

    const messagesWithInterleavedPieces = {
      ...s1.messages,
      [assistantMessageId]: {
        ...s1.messages[assistantMessageId],
        reasoningSummaryText: 'Persisted reasoning summary',
        reasoningDetailsRaw: [
          {
            type: 'thought_summary',
            summary: 'before image',
            __starverseReasoningPiece: true,
          },
          {
            type: 'thought_image',
            image: {
              url: 'asset://message-images/reasoning-image.png',
              mimeType: 'image/png',
            },
          },
          {
            type: 'thought_summary',
            summary: 'after image',
            __starverseReasoningPiece: true,
          },
        ],
        reasoningPieces: [],
        reasoningDisplayBlocks: [
          { blockId: 'b1', ordinal: 0, type: 'text' as const, text: 'before image', semanticRole: 'summary' as const },
          {
            blockId: 'b2',
            ordinal: 1,
            type: 'image' as const,
            url: 'asset://message-images/reasoning-image.png',
            mimeType: 'image/png',
            semanticRole: 'thought' as const,
          },
          { blockId: 'b3', ordinal: 2, type: 'text' as const, text: 'after image', semanticRole: 'summary' as const },
        ],
      },
    }
    const stateWithInterleavedPieces = {
      ...s1,
      messages: messagesWithInterleavedPieces,
      entities: { ...s1.entities, messagesById: messagesWithInterleavedPieces },
    }

    const vm = selectMessage(stateWithInterleavedPieces, assistantMessageId)

    expect(vm?.reasoningView.reasoningPieces).toBeUndefined()
    expect(vm?.reasoningView.displayBlocks).toEqual([
      { blockId: 'b1', ordinal: 0, type: 'text', text: 'before image', semanticRole: 'summary' },
      {
        blockId: 'b2',
        ordinal: 1,
        type: 'image',
        url: 'asset://message-images/reasoning-image.png',
        mimeType: 'image/png',
        semanticRole: 'thought',
      },
      { blockId: 'b3', ordinal: 2, type: 'text', text: 'after image', semanticRole: 'summary' },
    ])
  })

  it('returns "shown" when hasEncryptedReasoning is true', () => {
    const state = createInitialState()
    const { state: s1, assistantMessageId } = startGeneration(state, {
      runId: 'run1',
      requestId: 'req1',
      model: 'test-model',
    })

    // Simulate receiving encrypted reasoning signal
    const messagesWithEncrypted = {
      ...s1.messages,
      [assistantMessageId]: {
        ...s1.messages[assistantMessageId],
        hasEncryptedReasoning: true,
      },
    }
    const stateWithEncrypted = {
      ...s1,
      messages: messagesWithEncrypted,
      entities: { ...s1.entities, messagesById: messagesWithEncrypted },
    }

    const vm = selectMessage(stateWithEncrypted, assistantMessageId)

    // SSOT 3.4: "encrypted：出现 type = reasoning.encrypted"
    expect(vm?.reasoningView.visibility).toBe('shown')
    expect(vm?.reasoningView.hasEncrypted).toBe(true)
  })

  it('never infers encrypted from empty reasoning (SSOT hard constraint)', () => {
    const state = createInitialState()
    const { state: s1, assistantMessageId } = startGeneration(state, {
      runId: 'run1',
      requestId: 'req1',
      model: 'test-model',
      // No exclude, no reasoning content
    })

    const vm = selectMessage(s1, assistantMessageId)

    // SSOT: "不允许用"excluded 且为空"去推断"encrypted""
    // We should get 'not_returned', NOT any encrypted-related state
    expect(vm?.reasoningView.visibility).toBe('not_returned')
    expect(vm?.reasoningView.hasEncrypted).toBeFalsy()
  })

  it('does not infer visibility from requestedReasoningEffort when no reasoning returned', () => {
    const state = createInitialState()
    const { state: s1, assistantMessageId } = startGeneration(state, {
      runId: 'run1',
      requestId: 'req1',
      model: 'test-model',
      requestedReasoningMode: 'effort',
      requestedReasoningEffort: 'high',
      requestedReasoningExclude: false,
    })

    const vm = selectMessage(s1, assistantMessageId)
    expect(vm?.reasoningView.visibility).toBe('not_returned')
  })
})

describe('selectTranscript', () => {
  it('returns messages with correct visibility in transcript', () => {
    const state = createInitialState()
    const { state: s1, assistantMessageId } = startGeneration(state, {
      runId: 'run1',
      requestId: 'req1',
      model: 'test-model',
      userMessageText: 'Hello',
      requestedReasoningMode: 'effort',
      requestedReasoningEffort: 'high',
      requestedReasoningExclude: true,
    })

    const transcript = selectTranscript(s1, 'run1')

    expect(transcript).toHaveLength(2)
    expect(transcript[0].role).toBe('user')
    expect(transcript[1].role).toBe('assistant')
    expect(transcript[1].messageId).toBe(assistantMessageId)
    expect(transcript[1].reasoningView.visibility).toBe('excluded')
  })
})

describe('selector reference stability', () => {
  it('reuses message VM when message is unchanged', () => {
    const state = createInitialState()
    const { state: s1, assistantMessageId } = startGeneration(state, {
      runId: 'run1',
      requestId: 'req1',
      model: 'test-model',
      userMessageId: 'u1',
      userMessageText: 'hello',
      assistantMessageId: 'a1',
    })

    const vm1 = selectMessage(s1, assistantMessageId)
    const vm2 = selectMessage(s1, assistantMessageId)
    expect(vm2).toBe(vm1)
  })

  it('returns stable transcript array when state is unchanged', () => {
    const state = createInitialState()
    const { state: s1 } = startGeneration(state, {
      runId: 'run1',
      requestId: 'req1',
      model: 'test-model',
      userMessageId: 'u1',
      userMessageText: 'hello',
      assistantMessageId: 'a1',
    })

    const t1 = selectTranscript(s1, 'run1')
    const t2 = selectTranscript(s1, 'run1')
    expect(t2).toBe(t1)
  })

  it('reuses unchanged message VM when only one message updates', () => {
    const state = createInitialState()
    const { state: s1 } = startGeneration(state, {
      runId: 'run1',
      requestId: 'req1',
      model: 'test-model',
      userMessageId: 'u1',
      userMessageText: 'hello',
      assistantMessageId: 'a1',
    })

    const t1 = selectTranscript(s1, 'run1')
    const userVm1 = t1.find((m) => m.messageId === 'u1')

    const s2 = applyEvent(s1, 'run1', { type: 'MessageDeltaText', messageId: 'a1', choiceIndex: 0, text: 'x' })
    const t2 = selectTranscript(s2, 'run1')
    const userVm2 = t2.find((m) => m.messageId === 'u1')

    expect(t2).not.toBe(t1)
    expect(userVm2).toBe(userVm1)
  })
})

describe('usage view (turn vs session total derived)', () => {
  it('labels this-turn as the active run usage, and session total as sum of runs', () => {
    let state = createInitialState()

    state = startGeneration(state, { runId: 'run1', requestId: 'req1', model: 'm' }).state
    state = applyEvent(state, 'run1', {
      type: 'UsageDelta',
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    })

    state = startGeneration(state, { runId: 'run2', requestId: 'req2', model: 'm' }).state
    state = applyEvent(state, 'run2', {
      type: 'UsageDelta',
      usage: { prompt_tokens: 3, completion_tokens: 7, total_tokens: 10 },
    })

    expect(selectUsageThisTurn(state, 'run2')).toEqual({
      promptTokens: 3,
      completionTokens: 7,
      totalTokens: 10,
    })

    expect(selectUsageSessionTotalDerived(state)).toEqual({
      promptTokens: 13,
      completionTokens: 12,
      totalTokens: 25,
    })
  })
})
