import type { Meta, StoryObj } from '@storybook/vue3'
import ChatMessageBubble from './ChatMessageBubble.vue'
import type { MessageVM } from './types'

const meta: Meta<typeof ChatMessageBubble> = {
  title: 'ui-kit/chat/ChatMessageBubble',
  component: ChatMessageBubble,
}

export default meta
type Story = StoryObj<typeof ChatMessageBubble>

function message(partial: Partial<MessageVM> & Pick<MessageVM, 'messageId' | 'role'>): MessageVM {
  return {
    messageId: partial.messageId,
    role: partial.role,
    contentBlocks: partial.contentBlocks ?? [{ type: 'text', text: 'Hello world' }],
    toolCalls: partial.toolCalls ?? [],
    reasoningView: partial.reasoningView ?? { visibility: 'not_returned' },
    streaming: partial.streaming ?? { isTarget: false, isComplete: true },
  }
}

export const User: Story = {
  args: {
    message: message({
      messageId: 'u1',
      role: 'user',
      contentBlocks: [{ type: 'text', text: 'Can you summarize the plan?' }],
    }),
  },
}

export const Assistant: Story = {
  args: {
    message: message({
      messageId: 'a1',
      role: 'assistant',
      contentBlocks: [{ type: 'text', text: 'Sure. Here is the summary...' }],
    }),
  },
}

export const StreamingAssistant: Story = {
  args: {
    message: message({
      messageId: 'a2',
      role: 'assistant',
      contentBlocks: [{ type: 'text', text: 'Generating...' }],
      streaming: { isTarget: true, isComplete: false },
    }),
  },
}

export const Tool: Story = {
  args: {
    message: message({
      messageId: 't1',
      role: 'tool',
      contentBlocks: [{ type: 'unknown', raw: { name: 'search', args: { q: 'foo' } } }],
      toolCalls: [{}],
    }),
  },
}

export const WithImagePlaceholder: Story = {
  args: {
    message: message({
      messageId: 'a3',
      role: 'assistant',
      contentBlocks: [
        { type: 'text', text: 'Here is the image URL placeholder:' },
        { type: 'image', url: 'https://example.com/image.png' },
      ],
    }),
  },
}

