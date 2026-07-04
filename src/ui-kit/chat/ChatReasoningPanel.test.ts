import { render, screen, waitFor } from '@testing-library/vue'
import ChatReasoningPanel from './ChatReasoningPanel.vue'
import type { ReasoningView } from './types'
import { t } from '@/shared/i18n'

function view(partial: Partial<ReasoningView> & Pick<ReasoningView, 'visibility'>): ReasoningView {
  return {
    visibility: partial.visibility,
    panelState: partial.panelState ?? 'expanded',
    summaryText: partial.summaryText,
    reasoningText: partial.reasoningText,
    hasEncrypted: partial.hasEncrypted,
  }
}

describe('ChatReasoningPanel', () => {
  it('renders shown summary + reasoning', async () => {
    render(ChatReasoningPanel, {
      props: {
        reasoningView: view({
          visibility: 'shown',
          panelState: 'expanded',
          summaryText: 'S',
          reasoningText: 'R',
        }),
      },
    })

    expect(screen.getAllByText('摘要').length).toBeGreaterThan(0)
    await waitFor(() => {
      expect(screen.getByText('S')).toBeInTheDocument()
      expect(screen.getByText('R')).toBeInTheDocument()
    })
  })

  it('renders content even when message panelState is collapsed', async () => {
    const r1 = render(ChatReasoningPanel, {
      props: {
        reasoningView: view({
          visibility: 'shown',
          panelState: 'collapsed',
          summaryText: 'S',
          reasoningText: 'R',
        }),
      },
    })

    expect(screen.queryByText('(collapsed)')).not.toBeInTheDocument()
    expect(screen.getAllByText('摘要').length).toBeGreaterThan(0)
    await waitFor(() => {
      expect(screen.getByText('S')).toBeInTheDocument()
    })
    r1.unmount()

    render(ChatReasoningPanel, {
      props: {
        reasoningView: view({
          visibility: 'shown',
          panelState: 'expanded',
          summaryText: 'S',
          reasoningText: 'R',
        }),
      },
    })

    expect(screen.getAllByText('摘要').length).toBeGreaterThan(0)
    await waitFor(() => {
      expect(screen.getByText('S')).toBeInTheDocument()
      expect(screen.getByText('R')).toBeInTheDocument()
    })
  })

  it('renders reasoning math through the rich text pipeline', async () => {
    const { container } = render(ChatReasoningPanel, {
      props: {
        reasoningView: view({
          visibility: 'shown',
          panelState: 'expanded',
          reasoningText: '公式：$E=mc^2$',
        }),
      },
    })

    await waitFor(() => {
      expect(container.querySelector('.katex')).not.toBeNull()
    })
  })

  it('renders reasoning image pieces inside the reasoning panel', () => {
    const { container } = render(ChatReasoningPanel, {
      props: {
        reasoningView: {
          visibility: 'shown',
          panelState: 'expanded',
          reasoningPieces: [
            { id: 1, type: 'text', text: 'Sketch.' },
            { id: 2, type: 'image', url: 'data:image/png;base64,abc', mimeType: 'image/png' },
            { id: 3, type: 'text', text: 'Refine.' },
          ],
        },
      },
    })

    const image = container.querySelector('img[src="data:image/png;base64,abc"]')
    expect(image).not.toBeNull()
    return waitFor(() => {
      expect(screen.getByText('Sketch.')).toBeInTheDocument()
      expect(screen.getByText('Refine.')).toBeInTheDocument()
    })
  })

  it('does not render standalone summary when mixed reasoning pieces are present', async () => {
    const { container } = render(ChatReasoningPanel, {
      props: {
        reasoningView: {
          visibility: 'shown',
          panelState: 'expanded',
          summaryText: 'Sketch.',
          reasoningPieces: [
            { id: 1, type: 'text', text: 'Sketch.' },
            { id: 2, type: 'image', url: 'data:image/png;base64,abc', mimeType: 'image/png' },
          ],
        },
      },
    })

    expect(container.querySelector('img[src="data:image/png;base64,abc"]')).not.toBeNull()
    await waitFor(() => {
      expect(screen.getAllByText('Sketch.')).toHaveLength(1)
    })
  })

  it('renders excluded copy', () => {
    render(ChatReasoningPanel, {
      props: {
        reasoningView: view({ visibility: 'excluded', panelState: 'expanded' }),
      },
    })

    expect(screen.getByText(t('chat.reasoning.excluded'))).toBeInTheDocument()
  })

  it('renders not_returned copy', () => {
    render(ChatReasoningPanel, {
      props: {
        reasoningView: view({ visibility: 'not_returned', panelState: 'expanded' }),
      },
    })

    expect(screen.getByText(t('chat.reasoning.notReturned'))).toBeInTheDocument()
  })

  it('shows encrypted badge only when hasEncrypted is true', () => {
    const r1 = render(ChatReasoningPanel, {
      props: {
        reasoningView: view({ visibility: 'shown', panelState: 'expanded' }),
      },
    })

    expect(screen.queryByText(t('chat.reasoning.encryptedTitle'))).not.toBeInTheDocument()
    r1.unmount()

    render(ChatReasoningPanel, {
      props: {
        reasoningView: view({ visibility: 'shown', panelState: 'expanded', hasEncrypted: true }),
      },
    })

    expect(screen.getByText('已加密')).toBeInTheDocument()
    expect(screen.getByText(t('chat.reasoning.encryptedTitle'))).toBeInTheDocument()
  })
})
