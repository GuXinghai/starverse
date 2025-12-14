import type { Meta, StoryObj } from '@storybook/vue3'
import ChatReasoningPanel from './ChatReasoningPanel.vue'
import type { ReasoningView } from './types'

const meta: Meta<typeof ChatReasoningPanel> = {
  title: 'ui-kit/chat/ChatReasoningPanel',
  component: ChatReasoningPanel,
  args: {
    showDebug: false,
    title: 'Reasoning',
  },
}

export default meta
type Story = StoryObj<typeof ChatReasoningPanel>

const shownView: ReasoningView = {
  visibility: 'shown',
  panelState: 'expanded',
  summaryText: 'This is a short summary.',
  reasoningText: 'Step 1...\nStep 2...\nConclusion.',
  hasEncrypted: false,
}

export const Shown: Story = {
  args: {
    reasoningView: shownView,
  },
}

export const Excluded: Story = {
  args: {
    reasoningView: {
      visibility: 'excluded',
      panelState: 'expanded',
      hasEncrypted: false,
    },
  },
}

export const NotReturned: Story = {
  args: {
    reasoningView: {
      visibility: 'not_returned',
      panelState: 'expanded',
      hasEncrypted: false,
    },
  },
}

export const Encrypted: Story = {
  args: {
    reasoningView: {
      visibility: 'shown',
      panelState: 'expanded',
      hasEncrypted: true,
    },
  },
}
