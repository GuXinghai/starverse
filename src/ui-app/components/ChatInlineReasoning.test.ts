import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import ChatInlineReasoning from './ChatInlineReasoning.vue'
import type { ReasoningView } from '@/next/state/types'
import { t } from '@/shared/i18n'

const reasoningView: ReasoningView = {
  visibility: 'shown',
  panelState: 'expanded',
  displayBlocks: [
    {
      blockId: 'display-1',
      ordinal: 0,
      type: 'text',
      text: 'Reasoning body',
      semanticRole: 'summary',
      providerKey: 'google_ai_studio',
    },
  ],
}

describe('ChatInlineReasoning', () => {
  it('uses side-panel indicators in rail mode', () => {
    const first = render(ChatInlineReasoning, {
      props: {
        reasoningView,
        collapsed: true,
        displayMode: 'rail',
      },
    })

    expect(screen.getByText('<')).toBeInTheDocument()
    first.unmount()

    render(ChatInlineReasoning, {
      props: {
        reasoningView,
        collapsed: false,
        displayMode: 'rail',
      },
    })

    expect(screen.getByText('>')).toBeInTheDocument()
  })

  it('uses dropdown indicators in inline mode', () => {
    const first = render(ChatInlineReasoning, {
      props: {
        reasoningView,
        collapsed: true,
        displayMode: 'inline',
      },
    })

    expect(screen.getByText('v')).toBeInTheDocument()
    first.unmount()

    render(ChatInlineReasoning, {
      props: {
        reasoningView,
        collapsed: false,
        displayMode: 'inline',
      },
    })

    expect(screen.getByText('^')).toBeInTheDocument()
  })

  it('does not render inline reasoning body in rail mode', () => {
    render(ChatInlineReasoning, {
      props: {
        reasoningView,
        collapsed: false,
        displayMode: 'rail',
      },
    })

    expect(screen.queryByText('Reasoning body')).not.toBeInTheDocument()
  })

  it('renders reasoning display blocks from the reasoning view', async () => {
    render(ChatInlineReasoning, {
      props: {
        reasoningView: {
          visibility: 'shown',
          panelState: 'expanded',
          displayBlocks: [
            {
              blockId: 'display-1',
              ordinal: 0,
              type: 'text',
              text: 'Gemini thought text',
              semanticRole: 'summary',
              providerKey: 'google_ai_studio',
            },
          ],
        },
        collapsed: false,
        displayMode: 'inline',
      },
    })

    await waitFor(() => {
      expect(screen.getByText('Gemini thought text')).toBeInTheDocument()
      expect(screen.queryByText(t('chat.reasoning.emptyPayload'))).toBeNull()
    })
  })

  it('renders inline reasoning math through the rich text pipeline', async () => {
    const { container } = render(ChatInlineReasoning, {
      props: {
        reasoningView: {
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
        },
        collapsed: false,
        displayMode: 'inline',
      },
    })

    await waitFor(() => {
      expect(container.querySelector('.katex')).not.toBeNull()
    })
  })

  it('renders reasoning image display blocks inline', () => {
    const { container } = render(ChatInlineReasoning, {
      props: {
        reasoningView: {
          visibility: 'shown',
          panelState: 'expanded',
          displayBlocks: [
            {
              blockId: 'display-1',
              ordinal: 0,
              type: 'text',
              text: 'Before image.',
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
          ],
        },
        collapsed: false,
        displayMode: 'inline',
      },
    })

    expect(container.querySelector('img[src="data:image/png;base64,abc"]')).not.toBeNull()
    return waitFor(() => {
      expect(screen.getByText('Before image.')).toBeInTheDocument()
    })
  })

  it('does not render legacy summary without display blocks', async () => {
    render(ChatInlineReasoning, {
      props: {
        reasoningView: {
          visibility: 'shown',
          panelState: 'expanded',
        },
        collapsed: false,
        displayMode: 'inline',
      },
    })

    await waitFor(() => {
      expect(screen.getByText(t('chat.reasoning.emptyPayload'))).toBeInTheDocument()
    })
  })

  it('renders display blocks as the only reasoning payload', async () => {
    const { container } = render(ChatInlineReasoning, {
      props: {
        reasoningView: {
          visibility: 'shown',
          panelState: 'expanded',
          displayBlocks: [
            {
              blockId: 'display-text',
              ordinal: 0,
              type: 'text',
              text: 'Display text.',
              semanticRole: 'thought',
              providerKey: 'google_ai_studio',
            },
            {
              blockId: 'display-image',
              ordinal: 1,
              type: 'image',
              url: 'asset://display-image',
              semanticRole: 'thought',
              providerKey: 'google_ai_studio',
            },
          ],
        },
        collapsed: false,
        displayMode: 'inline',
      },
    })

    expect(container.querySelector('img[src="asset://display-image"]')).not.toBeNull()
    await waitFor(() => {
      expect(screen.getByText('Display text.')).toBeInTheDocument()
      expect(screen.queryByText('Legacy summary.')).toBeNull()
      expect(screen.queryByText('Legacy piece.')).toBeNull()
    })
  })

  it('emits toggle when the Reasoning strip is clicked', async () => {
    const view = render(ChatInlineReasoning, {
      props: {
        reasoningView,
        collapsed: true,
        displayMode: 'rail',
      },
    })

    await fireEvent.mouseDown(screen.getByRole('button', { name: t('chat.reasoning.title') }))
    await fireEvent.mouseUp(screen.getByRole('button', { name: t('chat.reasoning.title') }))

    expect(view.emitted().toggle).toHaveLength(1)
  })
})
