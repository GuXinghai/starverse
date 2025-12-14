import type { Meta, StoryObj } from '@storybook/vue3'
import ChatTranscript from './ChatTranscript.vue'
import type { MessageVM } from './types'

const meta: Meta<typeof ChatTranscript> = {
  title: 'ui-kit/chat/ChatTranscript',
  component: ChatTranscript,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    activeMessageId: 'a2',
    showDebug: false,
  },
}

export default meta
type Story = StoryObj<typeof ChatTranscript>

function message(partial: Partial<MessageVM> & Pick<MessageVM, 'messageId' | 'role'>): MessageVM {
  return {
    messageId: partial.messageId,
    role: partial.role,
    contentBlocks: partial.contentBlocks ?? [{ type: 'text', text: 'Hello' }],
    toolCalls: partial.toolCalls ?? [],
    reasoningView: partial.reasoningView ?? { visibility: 'not_returned' },
    streaming: partial.streaming ?? { isTarget: false, isComplete: true },
  }
}

export const Default: Story = {
  args: {
    messages: [
      message({ messageId: 'u1', role: 'user', contentBlocks: [{ type: 'text', text: 'Write a haiku about refactors.' }] }),
      message({
        messageId: 'a1',
        role: 'assistant',
        contentBlocks: [{ type: 'text', text: 'Old code falls away\nNew seams stitched with careful tests\nClean paths for the mind' }],
      }),
      message({
        messageId: 'a2',
        role: 'assistant',
        contentBlocks: [{ type: 'text', text: 'More...' }],
        streaming: { isTarget: true, isComplete: false },
      }),
    ],
  },
}

export const WithErrorTail: Story = {
  args: {
    messages: [
      message({ messageId: 'u1', role: 'user', contentBlocks: [{ type: 'text', text: 'Continue.' }] }),
      message({
        messageId: 'a1',
        role: 'assistant',
        contentBlocks: [{ type: 'text', text: 'Partial output...' }],
        streaming: { isTarget: false, isComplete: true },
      }),
    ],
    error: { message: 'mid-stream error', code: 'STREAM_ERROR' },
  },
}

