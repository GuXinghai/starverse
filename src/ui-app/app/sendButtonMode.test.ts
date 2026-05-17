import { describe, expect, it } from 'vitest'
import { deriveSendButtonMode } from './sendButtonMode'

describe('deriveSendButtonMode', () => {
  it('returns stop_square when isRunning is true regardless of other flags', () => {
    expect(deriveSendButtonMode({ isRunning: true, isSendPlanLoading: false, canSend: false })).toBe('stop_square')
    expect(deriveSendButtonMode({ isRunning: true, isSendPlanLoading: true, canSend: false })).toBe('stop_square')
    expect(deriveSendButtonMode({ isRunning: true, isSendPlanLoading: false, canSend: true })).toBe('stop_square')
    expect(deriveSendButtonMode({ isRunning: true, isSendPlanLoading: true, canSend: true })).toBe('stop_square')
  })

  it('returns busy_spinner when isSendPlanLoading is true and isRunning is false', () => {
    expect(deriveSendButtonMode({ isRunning: false, isSendPlanLoading: true, canSend: false })).toBe('busy_spinner')
    expect(deriveSendButtonMode({ isRunning: false, isSendPlanLoading: true, canSend: true })).toBe('busy_spinner')
  })

  it('returns enabled_arrow when canSend is true and neither running nor loading', () => {
    expect(deriveSendButtonMode({ isRunning: false, isSendPlanLoading: false, canSend: true })).toBe('enabled_arrow')
  })

  it('returns disabled_arrow when all flags are false', () => {
    expect(deriveSendButtonMode({ isRunning: false, isSendPlanLoading: false, canSend: false })).toBe('disabled_arrow')
  })
})
