import { describe, expect, it } from 'vitest'
import { createConversationConfigUpdateQueue } from './conversationConfigUpdateQueue'

describe('conversation config update queue', () => {
  it('serializes updates for one conversation and keeps other conversations independent', async () => {
    const queue = createConversationConfigUpdateQueue()
    const events: string[] = []
    let releaseFirst!: () => void
    const firstReleased = new Promise<void>((resolve) => { releaseFirst = resolve })

    const first = queue.enqueue('conversation-a', async () => {
      events.push('a:first:start')
      await firstReleased
      events.push('a:first:end')
      return 'first'
    })
    const second = queue.enqueue('conversation-a', async () => {
      events.push('a:second')
      return 'second'
    })
    const other = queue.enqueue('conversation-b', async () => {
      events.push('b:first')
      return 'other'
    })

    await expect(other).resolves.toBe('other')
    await Promise.resolve()
    expect(events).toEqual(['a:first:start', 'b:first'])

    releaseFirst()
    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second'])
    expect(events).toEqual(['a:first:start', 'b:first', 'a:first:end', 'a:second'])
  })
})
