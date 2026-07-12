import { render, screen, waitFor } from '@testing-library/vue'
import ChatReasoningPanel from './ChatReasoningPanel.vue'
import type { ReasoningView } from './types'
import { t } from '@/shared/i18n'

function view(partial: Partial<ReasoningView> & Pick<ReasoningView, 'visibility'>): ReasoningView {
  return {
    visibility: partial.visibility,
    panelState: partial.panelState ?? 'expanded',
    hasEncrypted: partial.hasEncrypted,
    displayBlocks: partial.displayBlocks,
  }
}

describe('ChatReasoningPanel', () => {
  it('renders shown display blocks', async () => {
    render(ChatReasoningPanel, {
      props: {
        reasoningView: view({
          visibility: 'shown',
          panelState: 'expanded',
          displayBlocks: [
            {
              blockId: 'display-1',
              ordinal: 0,
              type: 'text',
              text: 'Display reasoning',
              semanticRole: 'summary',
              providerKey: 'google_ai_studio',
            },
          ],
        }),
      },
    })

    await waitFor(() => {
      expect(screen.getByText('Display reasoning')).toBeInTheDocument()
    })
  })

  it('renders content even when message panelState is collapsed', async () => {
    const r1 = render(ChatReasoningPanel, {
      props: {
        reasoningView: view({
          visibility: 'shown',
          panelState: 'collapsed',
          displayBlocks: [
            {
              blockId: 'display-1',
              ordinal: 0,
              type: 'text',
              text: 'Display reasoning',
              semanticRole: 'summary',
              providerKey: 'google_ai_studio',
            },
          ],
        }),
      },
    })

    expect(screen.queryByText('(collapsed)')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('Display reasoning')).toBeInTheDocument()
    })
    r1.unmount()

    render(ChatReasoningPanel, {
      props: {
        reasoningView: view({
          visibility: 'shown',
          panelState: 'expanded',
          displayBlocks: [
            {
              blockId: 'display-1',
              ordinal: 0,
              type: 'text',
              text: 'Display reasoning',
              semanticRole: 'summary',
              providerKey: 'google_ai_studio',
            },
          ],
        }),
      },
    })

    await waitFor(() => {
      expect(screen.getByText('Display reasoning')).toBeInTheDocument()
    })
  })

  it('renders reasoning math through the rich text pipeline', async () => {
    const { container } = render(ChatReasoningPanel, {
      props: {
        reasoningView: view({
          visibility: 'shown',
          panelState: 'expanded',
          displayBlocks: [
            {
              blockId: 'display-1',
              ordinal: 0,
              type: 'text',
              text: '公式：$E=mc^2$',
              semanticRole: 'summary',
              providerKey: 'google_ai_studio',
            },
          ],
        }),
      },
    })

    await waitFor(() => {
      expect(container.querySelector('.katex')).not.toBeNull()
    })
  })

  it('renders reasoning image display blocks inside the reasoning panel', () => {
    const { container } = render(ChatReasoningPanel, {
      props: {
        reasoningView: {
          visibility: 'shown',
          panelState: 'expanded',
          displayBlocks: [
            {
              blockId: 'display-1',
              ordinal: 0,
              type: 'text',
              text: 'Sketch.',
              semanticRole: 'summary',
              providerKey: 'google_ai_studio',
            },
            {
              blockId: 'display-2',
              ordinal: 1,
              type: 'image',
              url: 'data:image/png;base64,abc',
              mimeType: 'image/png',
              semanticRole: 'thought',
              providerKey: 'google_ai_studio',
            },
            {
              blockId: 'display-3',
              ordinal: 2,
              type: 'text',
              text: 'Refine.',
              semanticRole: 'summary',
              providerKey: 'google_ai_studio',
            },
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

  it('does not render legacy summary without display blocks', async () => {
    render(ChatReasoningPanel, {
      props: {
        reasoningView: {
          visibility: 'shown',
          panelState: 'expanded',
        },
      },
    })

    await waitFor(() => {
      expect(screen.getByText(t('chat.reasoning.noPayloadShort'))).toBeInTheDocument()
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
