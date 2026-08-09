import { afterEach, describe, expect, it, vi } from 'vitest'
import { GenerationBodyCheckpointV2 } from './generationBodyCheckpointV2'

afterEach(() => {
  vi.useRealTimers()
})

describe('GenerationBodyCheckpointV2', () => {
  it('batches small deltas on the interval and publishes only persisted bodies', () => {
    vi.useFakeTimers()
    const persisted: Array<readonly [string, string]> = []
    const published: string[] = []
    const checkpoint = new GenerationBodyCheckpointV2({
      initialBody: '',
      intervalMs: 50,
      byteThreshold: 4096,
      persist: (expected, next) => persisted.push([expected, next]),
      publish: (body) => published.push(body),
      onFailure: () => undefined,
    })

    checkpoint.update('a')
    checkpoint.update('ab')
    expect(persisted).toEqual([])
    vi.advanceTimersByTime(49)
    expect(persisted).toEqual([])
    vi.advanceTimersByTime(1)
    expect(persisted).toEqual([['', 'ab']])
    expect(published).toEqual(['ab'])
  })

  it('flushes at 4 KiB and forces the terminal body before close', () => {
    vi.useFakeTimers()
    const persisted: Array<readonly [string, string]> = []
    const checkpoint = new GenerationBodyCheckpointV2({
      initialBody: '',
      intervalMs: 50,
      byteThreshold: 4096,
      persist: (expected, next) => persisted.push([expected, next]),
      publish: () => undefined,
      onFailure: () => undefined,
    })

    checkpoint.update('x'.repeat(4096))
    expect(persisted).toEqual([['', 'x'.repeat(4096)]])
    checkpoint.update(`${'x'.repeat(4096)}tail`)
    checkpoint.close()
    expect(persisted.at(-1)).toEqual(['x'.repeat(4096), `${'x'.repeat(4096)}tail`])
    expect(() => checkpoint.update('later')).toThrow('GENERATION_V2_BODY_CHECKPOINT_CLOSED')
  })

  it('surfaces asynchronous persistence failures instead of silently continuing', () => {
    vi.useFakeTimers()
    const failures: unknown[] = []
    const checkpoint = new GenerationBodyCheckpointV2({
      initialBody: '',
      intervalMs: 50,
      persist: () => {
        throw new Error('disk failed')
      },
      publish: () => {
        throw new Error('must not publish')
      },
      onFailure: (error) => failures.push(error),
    })

    checkpoint.update('delta')
    vi.advanceTimersByTime(50)
    expect(failures).toHaveLength(1)
    expect(() => checkpoint.flush()).toThrow('GENERATION_V2_BODY_CHECKPOINT_FAILED')
  })
})
