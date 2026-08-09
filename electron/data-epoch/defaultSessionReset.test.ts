import { describe, expect, it, vi } from 'vitest'
import type { Session } from 'electron'
import {
  clearEpoch2DefaultSessionState,
  createEpoch2DefaultSessionReset,
  type Epoch2DefaultSessionTarget,
} from './defaultSessionReset'

const compileTimeSessionAssignment = (session: Session): Epoch2DefaultSessionTarget => session
void compileTimeSessionAssignment

describe('epoch-2 default-session reset', () => {
  it('clears only localStorage and then the HTTP cache on the injected session', async () => {
    const order: string[] = []
    const target = {
      clearStorageData: vi.fn(async (options: unknown) => {
        order.push('localstorage')
        expect(options).toEqual({ storages: ['localstorage'] })
      }),
      clearCache: vi.fn(async () => {
        order.push('cache')
      }),
    }
    await createEpoch2DefaultSessionReset(target)()
    expect(order).toEqual(['localstorage', 'cache'])
    expect(target.clearStorageData).toHaveBeenCalledTimes(1)
    expect(target.clearCache).toHaveBeenCalledTimes(1)
  })

  it('stops after a localStorage failure and retries the complete sequence', async () => {
    const target = {
      clearStorageData: vi.fn()
        .mockRejectedValueOnce(new Error('storage failed'))
        .mockResolvedValueOnce(undefined),
      clearCache: vi.fn(async () => {}),
    }
    await expect(clearEpoch2DefaultSessionState(target)).rejects.toThrow('storage failed')
    expect(target.clearCache).not.toHaveBeenCalled()
    await clearEpoch2DefaultSessionState(target)
    expect(target.clearStorageData).toHaveBeenCalledTimes(2)
    expect(target.clearCache).toHaveBeenCalledTimes(1)
  })

  it('repeats localStorage when cache fails and never touches another partition object', async () => {
    const target = {
      clearStorageData: vi.fn(async () => {}),
      clearCache: vi.fn()
        .mockRejectedValueOnce(new Error('cache failed'))
        .mockResolvedValueOnce(undefined),
    }
    const intraLinksPartition = {
      clearStorageData: vi.fn(async () => {}),
      clearCache: vi.fn(async () => {}),
    }
    await expect(clearEpoch2DefaultSessionState(target)).rejects.toThrow('cache failed')
    await clearEpoch2DefaultSessionState(target)
    expect(target.clearStorageData).toHaveBeenCalledTimes(2)
    expect(target.clearCache).toHaveBeenCalledTimes(2)
    expect(intraLinksPartition.clearStorageData).not.toHaveBeenCalled()
    expect(intraLinksPartition.clearCache).not.toHaveBeenCalled()
  })
})
