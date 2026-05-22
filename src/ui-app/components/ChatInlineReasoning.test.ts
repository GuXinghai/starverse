import { fireEvent, render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import ChatInlineReasoning from './ChatInlineReasoning.vue'
import type { ReasoningView } from '@/next/state/types'

const reasoningView: ReasoningView = {
  visibility: 'shown',
  panelState: 'expanded',
  reasoningText: 'Reasoning body',
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

  it('emits toggle when the Reasoning strip is clicked', async () => {
    const view = render(ChatInlineReasoning, {
      props: {
        reasoningView,
        collapsed: true,
        displayMode: 'rail',
      },
    })

    await fireEvent.mouseDown(screen.getByRole('button', { name: /Reasoning/ }))
    await fireEvent.mouseUp(screen.getByRole('button', { name: /Reasoning/ }))

    expect(view.emitted().toggle).toHaveLength(1)
  })
})
