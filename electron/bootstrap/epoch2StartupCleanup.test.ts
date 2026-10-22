import { describe, expect, it, vi } from 'vitest'
import { startWithEpoch2RuntimeCleanup } from './epoch2StartupCleanup'

describe('startWithEpoch2RuntimeCleanup', () => {
  it('leaves the runtime open when startup succeeds', async () => {
    const close = vi.fn(async () => {})
    await startWithEpoch2RuntimeCleanup({ epoch2: { close } }, async () => {})
    expect(close).not.toHaveBeenCalled()
  })

  it('P1-06: closes the runtime and rethrows when startup fails after bootstrap', async () => {
    const close = vi.fn(async () => {})
    const failure = new Error('startMainV2 failed')
    await expect(startWithEpoch2RuntimeCleanup({ epoch2: { close } }, async () => { throw failure }))
      .rejects.toBe(failure)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('P1-06: keeps the original startup failure when closing also fails', async () => {
    const log = vi.fn()
    const failure = new Error('startMainV2 failed')
    await expect(startWithEpoch2RuntimeCleanup(
      { epoch2: { close: async () => { throw new Error('close failed') } } },
      async () => { throw failure },
      log,
    )).rejects.toBe(failure)
    expect(log).toHaveBeenCalledWith('[epoch2-startup] EPOCH2_STARTUP_RUNTIME_CLOSE_FAILED\n')
  })
})
