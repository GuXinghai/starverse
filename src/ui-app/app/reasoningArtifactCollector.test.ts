import { describe, expect, it, vi } from 'vitest'
import type { DomainEvent } from '@/next/state/types'
import {
  collectReasoningArtifactsFromDomainEvent,
  createReasoningArtifactCollector,
  resetReasoningArtifactCollector,
} from './reasoningArtifactCollector'

describe('reasoningArtifactCollector', () => {
  it('does not create artifacts for visible assistant text', () => {
    const collector = createReasoningArtifactCollector({
      providerKey: 'deepseek',
      messageId: 'assistant-1',
      streamTurnId: 'turn-1',
    })

    const created = collectReasoningArtifactsFromDomainEvent(collector, {
      type: 'MessageDeltaText',
      messageId: 'assistant-1',
      choiceIndex: 0,
      text: 'visible text',
    })

    expect(created).toEqual([])
    expect(collector.artifacts).toEqual([])
  })

  it('creates artifacts with stable increasing sequence', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234)
    const collector = createReasoningArtifactCollector({
      providerKey: 'deepseek',
      messageId: 'assistant-1',
      streamTurnId: 'turn-1',
    })

    collectReasoningArtifactsFromDomainEvent(collector, {
      type: 'MessageDeltaReasoningDetail',
      messageId: 'assistant-1',
      choiceIndex: 0,
      detail: { type: 'reasoning_content', text: 'a' },
    })
    collectReasoningArtifactsFromDomainEvent(collector, {
      type: 'MessageDeltaReasoningDetailBatch',
      messageId: 'assistant-1',
      choiceIndex: 0,
      details: [
        { type: 'reasoning_content', text: 'b' },
        { type: 'reasoning_content', text: 'c' },
      ],
    })

    expect(collector.artifacts.map((artifact) => artifact.sequence)).toEqual([0, 1, 2])
    expect(collector.artifacts.map((artifact) => artifact.text)).toEqual(['a', 'b', 'c'])
    vi.restoreAllMocks()
  })

  it('resets per turn and can change provider/message scope', () => {
    const collector = createReasoningArtifactCollector({
      providerKey: 'deepseek',
      messageId: 'assistant-1',
      streamTurnId: 'turn-1',
    })
    collectReasoningArtifactsFromDomainEvent(collector, {
      type: 'MessageDeltaReasoningDetail',
      messageId: 'assistant-1',
      choiceIndex: 0,
      detail: { type: 'reasoning_content', text: 'old' },
    })

    resetReasoningArtifactCollector(collector, {
      providerKey: 'anthropic_messages',
      messageId: 'assistant-2',
      streamTurnId: 'turn-2',
    })
    collectReasoningArtifactsFromDomainEvent(collector, {
      type: 'MessageDeltaReasoningDetail',
      messageId: 'assistant-2',
      choiceIndex: 0,
      detail: { type: 'thinking_delta', thinking: 'new' },
    })

    expect(collector.artifacts).toHaveLength(1)
    expect(collector.artifacts[0]).toMatchObject({
      providerKey: 'anthropic_messages',
      messageId: 'assistant-2',
      streamTurnId: 'turn-2',
      sequence: 0,
      kind: 'thinking_text',
      text: 'new',
    })
  })

  it('keeps artifacts collected before abort or stop events', () => {
    const collector = createReasoningArtifactCollector({
      providerKey: 'anthropic_messages',
      messageId: 'assistant-1',
    })

    collectReasoningArtifactsFromDomainEvent(collector, {
      type: 'MessageDeltaReasoningDetail',
      messageId: 'assistant-1',
      choiceIndex: 0,
      detail: { type: 'thinking_delta', thinking: 'kept' },
    })
    collectReasoningArtifactsFromDomainEvent(collector, {
      type: 'StreamAbort',
      reason: 'user',
      envelope: {
        phase: 'mid_stream',
        completionClass: 'aborted',
        openrouter: { code: 'aborted', message: 'aborted' },
        truncated: false,
      },
    } as DomainEvent)

    expect(collector.artifacts).toHaveLength(1)
    expect(collector.artifacts[0].text).toBe('kept')
  })

  it('keeps artifacts collected before stream errors', () => {
    const collector = createReasoningArtifactCollector({
      providerKey: 'openrouter',
      messageId: 'assistant-1',
      streamTurnId: 'turn-error',
    })

    collectReasoningArtifactsFromDomainEvent(collector, {
      type: 'MessageDeltaReasoningDetail',
      messageId: 'assistant-1',
      choiceIndex: 0,
      detail: { type: 'reasoning.text', text: 'kept before error' },
    })
    collectReasoningArtifactsFromDomainEvent(collector, {
      type: 'StreamError',
      error: {
        phase: 'mid_stream',
        completionClass: 'error',
        openrouter: { code: 'fixture_error', message: 'fixture stream error' },
        truncated: false,
      },
      terminal: true,
    } as DomainEvent)

    expect(collector.artifacts).toHaveLength(1)
    expect(collector.artifacts[0]).toMatchObject({
      messageId: 'assistant-1',
      streamTurnId: 'turn-error',
      sequence: 0,
      text: 'kept before error',
    })
  })

  it('does not collect reasoning details for a different assistant message', () => {
    const collector = createReasoningArtifactCollector({
      providerKey: 'deepseek',
      messageId: 'assistant-1',
      streamTurnId: 'turn-1',
    })

    const created = collectReasoningArtifactsFromDomainEvent(collector, {
      type: 'MessageDeltaReasoningDetail',
      messageId: 'assistant-2',
      choiceIndex: 0,
      detail: { type: 'reasoning_content', text: 'wrong message' },
    })

    expect(created).toEqual([])
    expect(collector.artifacts).toEqual([])
    expect(collector.nextSequence).toBe(0)
  })

  it('downgrades unknown reasoning detail safely without polluting visible text', () => {
    const collector = createReasoningArtifactCollector({
      providerKey: 'openrouter',
      messageId: 'assistant-1',
    })

    const created = collectReasoningArtifactsFromDomainEvent(collector, {
      type: 'MessageDeltaReasoningDetail',
      messageId: 'assistant-1',
      choiceIndex: 0,
      detail: { type: 'future', value: 'metadata only' },
    })

    expect(created[0]).toMatchObject({
      kind: 'provider_metadata',
      visibility: 'diagnostic_collapsed',
    })
    expect(created[0].text).toBeUndefined()
    expect(created[0].summaryText).toBeUndefined()
  })
})
