import { describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { render, screen } from '@testing-library/vue'
import { applyEvent, createInitialState, startGeneration } from '@/next/state/reducer'
import { replayOpenRouterSSEFixtureAsEvents } from '@/next/openrouter/replayFixtureStream'
import { selectTranscript } from '@/next/state/selectors'
import ChatTranscript from '@/ui-kit/chat/ChatTranscript.vue'

async function readFixture(name: string): Promise<string> {
  return fs.readFile(path.resolve(process.cwd(), 'src/next/openrouter/sse/fixtures', name), 'utf8')
}

describe('TC-11 — image block UI smoke (fixture replay)', () => {
  it('renders image content block and does not crash', async () => {
    const fixtureText = await readFixture('image_block.txt')

    const runId = 'run_image_block'
    const assistantMessageId = 'assistant_image_block'

    let state = createInitialState()
    state = startGeneration(state, {
      runId,
      requestId: 'req_image_block',
      model: 'openrouter/auto',
      assistantMessageId,
      userMessageId: 'user_image_block',
      userMessageText: 'hello',
    }).state

    for await (const ev of replayOpenRouterSSEFixtureAsEvents(fixtureText, { assistantMessageId })) {
      state = applyEvent(state, runId, ev)
    }

    const messages = selectTranscript(state, runId)
    const messageIds = messages.map((m) => m.messageId)
    const messagesById = Object.fromEntries(messages.map((m) => [m.messageId, m]))
    render(ChatTranscript, { props: { messageIds, messagesById } })

    expect(screen.getByText(/Here is an image/)).toBeInTheDocument()
    expect(screen.getByAltText('image')).toHaveAttribute('src', 'https://example.com/cat.png')
  })
})

