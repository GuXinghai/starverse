import { render, screen } from '@testing-library/vue'
import ChatTranscript from './ChatTranscript.vue'
import type { MessageVM } from './types'

function msg(partial: Partial<MessageVM> & Pick<MessageVM, 'messageId' | 'role'>): MessageVM {
  return {
    messageId: partial.messageId,
    role: partial.role,
    contentBlocks: partial.contentBlocks ?? [{ type: 'text', text: `hello-${partial.messageId}` }],
    toolCalls: partial.toolCalls ?? [],
    reasoningView: partial.reasoningView ?? { visibility: 'not_returned' },
    streaming: partial.streaming ?? { isTarget: false, isComplete: true },
  }
}

describe('ChatTranscript', () => {
  it('renders activeMessageId streaming marker even if message.streaming.isTarget is false', () => {
    render(ChatTranscript, {
      props: {
        messages: [
          msg({ messageId: 'a1', role: 'assistant', streaming: { isTarget: false, isComplete: false } }),
          msg({ messageId: 'u1', role: 'user' }),
        ],
        activeMessageId: 'a1',
      },
    })

    expect(screen.getByText('正在生成')).toBeInTheDocument()
  })

  it('renders error tail when error is provided', () => {
    render(ChatTranscript, {
      props: {
        messages: [msg({ messageId: 'u1', role: 'user' })],
        error: { message: 'boom' },
      },
    })

    expect(screen.getByText('Error')).toBeInTheDocument()
    expect(screen.getByText(/boom/)).toBeInTheDocument()
  })
})

