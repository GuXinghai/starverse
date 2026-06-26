import { render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import ReasoningArtifactDiagnostics from './ReasoningArtifactDiagnostics.vue'
import type { ReasoningArtifact } from '@/next/provider/reasoningArtifact'

const BASE = {
  id: 'ra-1',
  providerKey: 'anthropic_messages',
  messageId: 'assistant-1',
  sequence: 0,
  createdAtMs: 1,
  visibility: 'hidden_from_visible_text',
  warnings: [],
} as const

describe('ReasoningArtifactDiagnostics', () => {
  it('does not render when there are no artifacts', () => {
    render(ReasoningArtifactDiagnostics, { props: { artifacts: [] } })
    expect(screen.queryByTestId('reasoning-artifact-diagnostics')).toBeNull()
  })

  it('renders collapsed diagnostics count and expands provider/kind details', async () => {
    render(ReasoningArtifactDiagnostics, {
      props: {
        artifacts: [
          {
            ...BASE,
            kind: 'thinking_text',
            text: 'hidden thinking',
          },
        ] satisfies ReasoningArtifact[],
      },
    })

    const root = screen.getByTestId('reasoning-artifact-diagnostics')
    expect(root.textContent).toContain('Reasoning details · 1')
    expect(root.textContent).toContain('anthropic_messages')
    expect(root.textContent).toContain('thinking text')
    expect(root.textContent).toContain('hidden thinking')
  })

  it('shows signature as provider metadata, not ordinary thinking text', () => {
    render(ReasoningArtifactDiagnostics, {
      props: {
        artifacts: [
          {
            ...BASE,
            id: 'ra-sig',
            kind: 'signature',
            visibility: 'opaque_not_displayable',
            opaqueRef: 'provider-signature:anthropic_messages:abc:12',
            warnings: ['Anthropic signature is provider metadata, not human-readable reasoning text.'],
          },
        ] satisfies ReasoningArtifact[],
      },
    })

    const root = screen.getByTestId('reasoning-artifact-diagnostics')
    expect(root.textContent).toContain('provider signature')
    expect(root.textContent).toContain('Provider signature metadata')
    expect(root.textContent).not.toContain('sig-secret')
  })

  it('shows opaque reasoning as not displayable and does not expose raw text', () => {
    render(ReasoningArtifactDiagnostics, {
      props: {
        artifacts: [
          {
            ...BASE,
            id: 'ra-opaque',
            providerKey: 'openai_responses',
            kind: 'opaque_reasoning',
            visibility: 'opaque_not_displayable',
            opaqueRef: 'opaque-reasoning:openai_responses:abc:120',
            warnings: ['OpenAI opaque reasoning item is not displayable.'],
          },
        ] satisfies ReasoningArtifact[],
      },
    })

    const root = screen.getByTestId('reasoning-artifact-diagnostics')
    expect(root.textContent).toContain('opaque reasoning')
    expect(root.textContent).toContain('Opaque reasoning; not displayable.')
    expect(root.textContent).not.toContain('encrypted-provider-payload')
  })

  it('truncates long text previews without exposing a copy action', () => {
    const longText = `${'x'.repeat(260)} unique-tail-marker`
    render(ReasoningArtifactDiagnostics, {
      props: {
        artifacts: [
          {
            ...BASE,
            id: 'ra-long',
            kind: 'reasoning_text',
            text: longText,
          },
        ] satisfies ReasoningArtifact[],
      },
    })

    const root = screen.getByTestId('reasoning-artifact-diagnostics')
    expect(root.textContent).toContain(`${'x'.repeat(240)}...`)
    expect(root.textContent).not.toContain('unique-tail-marker')
    expect(root.textContent?.toLowerCase()).not.toContain('copy')
  })
})
