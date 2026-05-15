import { describe, expect, it } from 'vitest'
import {
  isOfficialInstallOperationActive,
  isOfficialInstallOperationTerminal,
  validateOfficialInstallOperationTransition,
} from './index'

describe('official install operation state machine', () => {
  it('accepts the valid official install transition sequence', () => {
    const sequence = [
      'accepted',
      'pending',
      'downloading',
      'verifying',
      'staging',
      'registering',
      'health_checking',
      'installed',
    ] as const

    for (let index = 0; index < sequence.length - 1; index += 1) {
      expect(validateOfficialInstallOperationTransition(sequence[index], sequence[index + 1])).toEqual({ ok: true })
    }
  })

  it('rejects invalid and terminal transitions', () => {
    expect(validateOfficialInstallOperationTransition('downloading', 'registering')).toEqual({
      ok: false,
      reason: 'invalid_transition',
    })
    expect(validateOfficialInstallOperationTransition('failed', 'downloading')).toEqual({
      ok: false,
      reason: 'terminal_state',
    })
    expect(validateOfficialInstallOperationTransition('installed', 'failed')).toEqual({
      ok: false,
      reason: 'terminal_state',
    })
  })

  it('distinguishes active and terminal operation states', () => {
    expect(isOfficialInstallOperationActive('health_checking')).toBe(true)
    expect(isOfficialInstallOperationActive('failed')).toBe(false)
    expect(isOfficialInstallOperationTerminal('installed')).toBe(true)
    expect(isOfficialInstallOperationTerminal('stale')).toBe(true)
  })
})
