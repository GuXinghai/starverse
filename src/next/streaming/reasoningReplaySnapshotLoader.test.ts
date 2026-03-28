import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadReasoningReplaySnapshotRecord } from './reasoningReplaySnapshotLoader'

const listMessagesMock = vi.fn()

vi.mock('@/next/message/messageClient', () => ({
  listMessages: (...args: unknown[]) => listMessagesMock(...args),
}))

describe('loadReasoningReplaySnapshotRecord', () => {
  afterEach(() => {
    listMessagesMock.mockReset()
  })

  it('prefers the requested assistant message when message.list returns nearby rows', async () => {
    listMessagesMock.mockResolvedValue([
      {
        id: 'a-old',
        meta: { reasoningDetailsRaw: ['old'], reasoningSegmentsCount: 1 },
      },
      {
        id: 'a-target',
        meta: { reasoningDetailsRaw: ['target'], reasoningSegmentsCount: 3 },
      },
    ])

    await expect(loadReasoningReplaySnapshotRecord('c1', 'a-target', 9)).resolves.toEqual({
      replaySnapshot: ['target'],
      segmentsCount: 3,
    })
    expect(listMessagesMock).toHaveBeenCalledWith('c1', { fromSeq: 9, limit: 1 })
  })

  it('returns an empty snapshot when message.list fails', async () => {
    listMessagesMock.mockRejectedValue(new Error('boom'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await expect(loadReasoningReplaySnapshotRecord('c1', 'a1', 2)).resolves.toEqual({
      replaySnapshot: null,
      segmentsCount: undefined,
    })

    expect(warn).toHaveBeenCalledWith('[reasoning-verify] failed to load db replay snapshot:', expect.any(Error))
    warn.mockRestore()
  })
})
