import { describe, expect, it } from 'vitest'
import {
  createReasoningArtifact,
  reasoningArtifactFromDetail,
  reasoningArtifactPreviewText,
} from './reasoningArtifact'

const BASE = {
  messageId: 'assistant-1',
  streamTurnId: 'turn-1',
  sequence: 0,
  createdAtMs: Date.UTC(2026, 5, 25),
} as const

describe('ReasoningArtifact model', () => {
  it('creates reasoning text artifacts without making visible assistant text', () => {
    const artifact = reasoningArtifactFromDetail({
      ...BASE,
      providerKey: 'deepseek',
      detail: { type: 'reasoning_content', text: 'hidden chain' },
    })

    expect(artifact).toMatchObject({
      providerKey: 'deepseek',
      kind: 'reasoning_text',
      visibility: 'hidden_from_visible_text',
      text: 'hidden chain',
    })
    expect(artifact?.summaryText).toBeUndefined()
  })

  it('maps OpenAI reasoning summary and opaque reasoning separately', () => {
    const summary = reasoningArtifactFromDetail({
      ...BASE,
      providerKey: 'openai_responses',
      detail: { type: 'reasoning_summary', text: 'short summary' },
    })
    const opaque = reasoningArtifactFromDetail({
      ...BASE,
      providerKey: 'openai_responses',
      sequence: 1,
      detail: {
        type: 'reasoning_item',
        id: 'rs_1',
        encrypted_content: 'encrypted-provider-payload',
        summary: [{ text: 'not copied into opaque text' }],
      },
    })

    expect(summary).toMatchObject({
      kind: 'reasoning_summary',
      visibility: 'diagnostic_collapsed',
      summaryText: 'short summary',
    })
    expect(opaque).toMatchObject({
      kind: 'opaque_reasoning',
      visibility: 'opaque_not_displayable',
    })
    expect(opaque?.text).toBeUndefined()
    expect(opaque?.summaryText).toBeUndefined()
    expect(JSON.stringify(opaque)).not.toContain('encrypted-provider-payload')
  })

  it('keeps Anthropic signature as opaque provider metadata, not reasoning text', () => {
    const artifact = reasoningArtifactFromDetail({
      ...BASE,
      providerKey: 'anthropic_messages',
      detail: { type: 'signature_delta', signature: 'sig-secret-provider-metadata' },
    })

    expect(artifact).toMatchObject({
      kind: 'signature',
      visibility: 'opaque_not_displayable',
    })
    expect(artifact?.text).toBeUndefined()
    expect(reasoningArtifactPreviewText(artifact!)).toContain('Provider signature metadata')
    expect(JSON.stringify(artifact)).not.toContain('sig-secret-provider-metadata')
  })

  it('maps Gemini thought text to thought_text', () => {
    const artifact = reasoningArtifactFromDetail({
      ...BASE,
      providerKey: 'google_ai_studio',
      detail: { type: 'thought', text: 'model thought' },
    })

    expect(artifact).toMatchObject({
      providerKey: 'google_ai_studio',
      kind: 'thought_text',
      visibility: 'hidden_from_visible_text',
      text: 'model thought',
    })
  })

  it('does not allow secret-like fields in providerSpecific', () => {
    const artifact = createReasoningArtifact({
      ...BASE,
      providerKey: 'openrouter',
      kind: 'provider_metadata',
      visibility: 'diagnostic_collapsed',
      providerSpecific: {
        safe: 'kept',
        Authorization: 'Bearer sk-provider-secret',
        nested: {
          'x-api-key': 'sk-provider-secret',
          status: 'ok',
        },
      },
    })

    expect(artifact.providerSpecific).toEqual({
      safe: 'kept',
      nested: { status: 'ok' },
    })
    expect(JSON.stringify(artifact)).not.toContain('Bearer')
    expect(JSON.stringify(artifact)).not.toContain('sk-provider-secret')
    expect(JSON.stringify(artifact)).not.toContain('x-api-key')
  })

  it('captures unknown reasoning details as metadata only', () => {
    const artifact = reasoningArtifactFromDetail({
      ...BASE,
      providerKey: 'openrouter',
      detail: { type: 'future_reasoning_detail', shape: 'unknown' },
    })

    expect(artifact).toMatchObject({
      kind: 'provider_metadata',
      visibility: 'diagnostic_collapsed',
      warnings: ['Unknown provider reasoning detail was captured as metadata only.'],
    })
    expect(artifact?.text).toBeUndefined()
  })
})
