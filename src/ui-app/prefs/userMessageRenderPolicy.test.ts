import { describe, expect, it } from 'vitest'
import { nextTriState, resolveUserMessageRenderPolicy } from './userMessageRenderPolicy'

describe('userMessageRenderPolicy', () => {
  it('resolves follow mode from undefined convo value', () => {
    expect(resolveUserMessageRenderPolicy(true, undefined)).toEqual({
      effective: true,
      isOverride: false,
      mode: 'follow',
    })

    expect(resolveUserMessageRenderPolicy(false, undefined)).toEqual({
      effective: false,
      isOverride: false,
      mode: 'follow',
    })
  })

  it('falls back to false when global default is null', () => {
    expect(resolveUserMessageRenderPolicy(null, undefined)).toEqual({
      effective: false,
      isOverride: false,
      mode: 'follow',
    })
  })

  it('resolves override modes from convo values', () => {
    expect(resolveUserMessageRenderPolicy(false, true)).toEqual({
      effective: true,
      isOverride: true,
      mode: 'on',
    })

    expect(resolveUserMessageRenderPolicy(true, false)).toEqual({
      effective: false,
      isOverride: true,
      mode: 'off',
    })
  })

  it('cycles follow -> on -> off -> follow', () => {
    expect(nextTriState('follow')).toBe('on')
    expect(nextTriState('on')).toBe('off')
    expect(nextTriState('off')).toBe('follow')
  })
})

