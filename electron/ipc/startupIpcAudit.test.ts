import { describe, expect, it } from 'vitest'
import {
  STARTUP_IPC_CHANNELS,
  STARTUP_IPC_CRITICAL_CHANNELS,
  validateStartupIpcRegistration,
} from './startupIpcAudit'

describe('validateStartupIpcRegistration', () => {
  it('passes when all startup channels are present', () => {
    const result = validateStartupIpcRegistration(STARTUP_IPC_CHANNELS)
    expect(result.ok).toBe(true)
  })

  it('reports missing critical channels', () => {
    const channels = STARTUP_IPC_CHANNELS.filter((channel) => channel !== 'db:invoke')
    const result = validateStartupIpcRegistration(channels)
    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('unexpected ok result')
    }
    expect(result.missing).toContain('db:invoke')
    expect(result.missingCritical).toContain('db:invoke')
    expect(STARTUP_IPC_CRITICAL_CHANNELS).toContain('db:invoke')
  })
})
