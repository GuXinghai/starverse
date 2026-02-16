import { render, screen, waitFor } from '@testing-library/vue'
import ChatMessageBubble from './ChatMessageBubble.vue'
import type { MessageVM } from './types'

function msg(partial: Partial<MessageVM> & Pick<MessageVM, 'messageId' | 'role'>): MessageVM {
  return {
    messageId: partial.messageId,
    role: partial.role,
    contentBlocks: partial.contentBlocks ?? [{ type: 'text', text: 'hello' }],
    toolCalls: partial.toolCalls ?? [],
    reasoningView: partial.reasoningView ?? { visibility: 'not_returned', panelState: 'expanded' },
    streaming: partial.streaming ?? { isTarget: false, isComplete: true },
  }
}

describe('ChatMessageBubble', () => {
  it('shows generating marker only for target assistant streaming messages', () => {
    render(ChatMessageBubble, {
      props: {
        message: msg({ messageId: 'a1', role: 'assistant', streaming: { isTarget: true, isComplete: false } }),
      },
    })
    expect(screen.getByText('正在生成')).toBeInTheDocument()
  })

  it('hides debug block by default, shows when showDebug=true', () => {
    render(ChatMessageBubble, {
      props: {
        message: msg({ messageId: 'u1', role: 'user' }),
      },
    })
    expect(screen.queryByText(/id:/)).not.toBeInTheDocument()

    render(ChatMessageBubble, {
      props: {
        message: msg({ messageId: 'u2', role: 'user' }),
        showDebug: true,
      },
    })
    expect(screen.getByText(/id:/)).toBeInTheDocument()
    expect(screen.getByText('u2')).toBeInTheDocument()
  })

  it('renders tool calls in a structured block (name + arguments)', () => {
    render(ChatMessageBubble, {
      props: {
        message: msg({
          messageId: 'a3',
          role: 'assistant',
          toolCalls: [
            {
              index: 0,
              id: 'call_1',
              type: 'function',
              name: 'lookup',
              argumentsText: '{"q":"x"}',
            },
          ],
        }),
      },
    })

    expect(screen.getByText(/Tool calls/)).toBeInTheDocument()
    expect(screen.getByText('lookup')).toBeInTheDocument()
    expect(screen.getByText('call_1')).toBeInTheDocument()
    expect(screen.getByText('{"q":"x"}')).toBeInTheDocument()
  })

  it('renders completed assistant math content through rich text pipeline', async () => {
    const { container } = render(ChatMessageBubble, {
      props: {
        message: msg({
          messageId: 'a4',
          role: 'assistant',
          contentBlocks: [{ type: 'text', text: '公式：$E=mc^2$' }],
          streaming: { isTarget: false, isComplete: true },
        }),
      },
    })

    await waitFor(() => {
      expect(container.querySelector('.katex')).not.toBeNull()
    })
  })

  it('keeps user message plaintext by default', async () => {
    const { container } = render(ChatMessageBubble, {
      props: {
        message: msg({
          messageId: 'u_math_plain',
          role: 'user',
          contentBlocks: [{ type: 'text', text: '公式：$E=mc^2$' }],
        }),
      },
    })

    await waitFor(() => {
      expect(container.querySelector('.katex')).toBeNull()
    })
  })

  it('renders user message through rich text pipeline when enabled', async () => {
    const { container } = render(ChatMessageBubble, {
      props: {
        renderUserMessageRichText: true,
        message: msg({
          messageId: 'u_math_rich',
          role: 'user',
          contentBlocks: [{ type: 'text', text: '公式：$E=mc^2$' }],
        }),
      },
    })

    await waitFor(() => {
      expect(container.querySelector('.katex')).not.toBeNull()
    })
  })

  it('keeps message layout stable when user math contains invalid TeX', async () => {
    const { container } = render(ChatMessageBubble, {
      props: {
        renderUserMessageRichText: true,
        message: msg({
          messageId: 'u_invalid_math',
          role: 'user',
          contentBlocks: [{ type: 'text', text: 'A $\\invalidcommand$ B' }],
        }),
      },
    })

    await waitFor(() => {
      expect(container.textContent).toContain('A')
      expect(container.textContent).toContain('B')
      expect(container.querySelector('.rt-math-error')).not.toBeNull()
    })
  })
})
