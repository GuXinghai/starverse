import { describe, expect, it, vi } from 'vitest'
import {
  assertExpectedCapabilityRevisionV2,
  readExpectedCapabilityRevisionV2,
  runWithExpectedCapabilityRevisionV2,
} from './capabilityRevisionExpectationV2'

describe('Generation V2 capability revision expectation', () => {
  it('dispatches exactly once when the resolved revision matches', async () => {
    const dispatch = vi.fn(async () => 'accepted')
    const result = await runWithExpectedCapabilityRevisionV2('capability-v2:current', async () => {
      assertExpectedCapabilityRevisionV2('capability-v2:current')
      return dispatch()
    })

    expect(result).toBe('accepted')
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(readExpectedCapabilityRevisionV2()).toBeNull()
  })

  it('rejects stale revision before dispatch and does not retry', async () => {
    const dispatch = vi.fn()

    await expect(runWithExpectedCapabilityRevisionV2('capability-v2:seen', async () => {
      assertExpectedCapabilityRevisionV2('capability-v2:current')
      return dispatch()
    })).rejects.toMatchObject({ code: 'STALE_CAPABILITY_REVISION' })
    expect(dispatch).not.toHaveBeenCalled()
  })

  it.each(['', ' capability-v2:seen', 'capability-v2:seen '])(
    'rejects an invalid expected revision envelope: %j',
    (revision) => {
      expect(() => runWithExpectedCapabilityRevisionV2(revision, () => undefined))
        .toThrowError(expect.objectContaining({ code: 'CAPABILITY_REVISION_EXPECTATION_MISSING' }))
    },
  )
})
