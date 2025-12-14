import { render, screen, fireEvent } from '@testing-library/vue'
import ChatReasoningPanel from './ChatReasoningPanel.vue'
import type { ReasoningView } from './types'

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
  it('renders shown summary + reasoning', () => {
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

    expect(screen.getByText('Summary')).toBeInTheDocument()
    expect(screen.getByText('S')).toBeInTheDocument()
    expect(screen.getAllByText('Reasoning').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('R')).toBeInTheDocument()
  })

  it('keeps visibility (disclosure) independent from panelState (presentation)', () => {
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

    expect(screen.getByText('(collapsed)')).toBeInTheDocument()
    expect(screen.getByText('shown')).toBeInTheDocument()
    expect(screen.queryByText('Summary')).not.toBeInTheDocument()
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

    expect(screen.queryByText('(collapsed)')).not.toBeInTheDocument()
    expect(screen.getByText('Summary')).toBeInTheDocument()
    expect(screen.getByText('S')).toBeInTheDocument()
    expect(screen.getAllByText('Reasoning').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('R')).toBeInTheDocument()
  })

  it('renders excluded copy', () => {
    render(ChatReasoningPanel, {
      props: {
        reasoningView: view({ visibility: 'excluded', panelState: 'expanded' }),
      },
    })

    expect(screen.getByText('本次请求已要求不返回推理内容（excluded）')).toBeInTheDocument()
  })

  it('renders not_returned copy', () => {
    render(ChatReasoningPanel, {
      props: {
        reasoningView: view({ visibility: 'not_returned', panelState: 'expanded' }),
      },
    })

    expect(screen.getByText('模型未返回推理内容 / 或该模型不支持')).toBeInTheDocument()
  })

  it('shows encrypted badge only when hasEncrypted is true', () => {
    const r1 = render(ChatReasoningPanel, {
      props: {
        reasoningView: view({ visibility: 'shown', panelState: 'expanded' }),
      },
    })

    expect(screen.queryByText('encrypted')).not.toBeInTheDocument()
    r1.unmount()

    render(ChatReasoningPanel, {
      props: {
        reasoningView: view({ visibility: 'shown', panelState: 'expanded', hasEncrypted: true }),
      },
    })

    expect(screen.getByText('encrypted')).toBeInTheDocument()
  })

  it('emits toggle-panel-state', async () => {
    const r = render(ChatReasoningPanel, {
      props: {
        reasoningView: view({ visibility: 'shown', panelState: 'collapsed' }),
      },
    })

    await fireEvent.click(screen.getByRole('button', { name: 'Expand' }))
    expect(r.emitted('toggle-panel-state')).toHaveLength(1)
  })
})
