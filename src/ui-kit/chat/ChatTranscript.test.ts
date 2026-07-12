import { render, screen } from '@testing-library/vue'
import { beforeEach } from 'vitest'
import { resetI18nForTests, t } from '@/shared/i18n'
import ChatTranscript from './ChatTranscript.vue'
import type { MessageVM } from './types'

function msg(partial: Partial<MessageVM> & Pick<MessageVM, 'messageId' | 'role'>): MessageVM {
  return {
    messageId: partial.messageId,
    role: partial.role,
    contentBlocks: partial.contentBlocks ?? [{ type: 'text', text: `hello-${partial.messageId}` }],
    toolCalls: partial.toolCalls ?? [],
    reasoningView: partial.reasoningView ?? { visibility: 'not_returned', panelState: 'collapsed' },
    streaming: partial.streaming ?? { isTarget: false, isComplete: true },
  }
}

describe('ChatTranscript', () => {
  beforeEach(() => resetI18nForTests())

  it('renders activeMessageId streaming marker even if message.streaming.isTarget is false', () => {
    render(ChatTranscript, {
      props: {
        messageIds: ['a1', 'u1'],
        messagesById: {
          a1: msg({ messageId: 'a1', role: 'assistant', streaming: { isTarget: false, isComplete: false } }),
          u1: msg({ messageId: 'u1', role: 'user' }),
        },
        activeMessageId: 'a1',
      },
    })

    expect(screen.getByText(t('common.generating'))).toBeInTheDocument()
  })

  it('renders error tail when error is provided', () => {
    render(ChatTranscript, {
      props: {
        messageIds: ['u1'],
        messagesById: {
          u1: msg({ messageId: 'u1', role: 'user' }),
        },
        error: { message: 'boom' },
      },
    })

    expect(screen.getByText(t('chat.transcript.error'))).toBeInTheDocument()
    expect(screen.getByText(/boom/)).toBeInTheDocument()
  })
})

