import { render, screen } from '@testing-library/vue'
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
})
