import type { Meta, StoryObj } from '@storybook/vue3'
import ChatStatusBar from './ChatStatusBar.vue'
import type { RunVM } from './types'

const meta: Meta<typeof ChatStatusBar> = {
  title: 'ui-kit/chat/ChatStatusBar',
  component: ChatStatusBar,
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta
type Story = StoryObj<typeof ChatStatusBar>

function run(partial: Partial<RunVM> & Pick<RunVM, 'runId' | 'status'>): RunVM {
  return {
    runId: partial.runId,
    status: partial.status,
    requestId: partial.requestId,
    generationId: partial.generationId,
    model: partial.model,
    provider: partial.provider,
    finishReason: partial.finishReason,
    nativeFinishReason: partial.nativeFinishReason,
    usage: partial.usage,
    error: partial.error,
  }
}

export const Requesting: Story = {
  args: {
    title: 'Chat Next',
    run: run({ runId: 'r1', status: 'requesting', model: 'openrouter/auto' }),
    isRunning: true,
    showReset: true,
  },
}

export const StreamingWithUsage: Story = {
  args: {
    title: 'Chat Next',
    run: run({
      runId: 'r2',
      status: 'streaming',
      model: 'openrouter/auto',
      provider: 'openrouter',
      generationId: 'gen_123',
      usage: { prompt_tokens: 12, completion_tokens: 34, total_tokens: 46 },
    }),
    isRunning: true,
    showReset: true,
  },
}

export const Done: Story = {
  args: {
    title: 'Chat Next',
    run: run({
      runId: 'r3',
      status: 'done',
      finishReason: 'stop',
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    }),
    isRunning: false,
    showReset: true,
  },
}

export const Aborted: Story = {
  args: {
    title: 'Chat Next',
    run: run({ runId: 'r4', status: 'aborted' }),
    isRunning: false,
    showReset: true,
  },
}

export const Error: Story = {
  args: {
    title: 'Chat Next',
    run: run({ runId: 'r5', status: 'error', error: { message: 'boom' } }),
    isRunning: false,
    showReset: true,
  },
}

