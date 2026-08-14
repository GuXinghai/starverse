import { render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import ChatMessageBubble from '@/ui-kit/chat/ChatMessageBubble.vue'

describe('AppChatApp explicit failure display', () => {
  it('renders the closed Generation V2 failure summary in the transcript bubble', () => {
    render(ChatMessageBubble, {
      props: {
        message: {
          messageId: 'a1',
          role: 'assistant',
          contentBlocks: [],
          toolCalls: [],
          reasoningView: { visibility: 'not_returned', panelState: 'collapsed' },
          streaming: { isTarget: false, isComplete: true },
        },
        errorView: {
          completionClass: 'error', phase: 'pre_stream', code: 'STATUS-ERR',
          message: 'provider rejected request', provider: 'openrouter', truncated: false,
        },
      },
    })

    expect(screen.getByText(/代码：STATUS-ERR/)).toBeInTheDocument()
    expect(screen.getByText(/provider rejected request/)).toBeInTheDocument()
  })
})
