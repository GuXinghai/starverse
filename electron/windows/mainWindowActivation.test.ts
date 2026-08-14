import { afterEach, describe, expect, it } from 'vitest'
import {
  clearMainWindowActivator,
  registerMainWindowActivator,
  requestMainWindowActivation,
} from './mainWindowActivation'

afterEach(() => clearMainWindowActivator())

describe('main window second-instance activation', () => {
  it('retains an early request until a window can be focused', () => {
    const attempts: string[] = []
    requestMainWindowActivation()
    registerMainWindowActivator(() => { attempts.push('first'); return false })
    registerMainWindowActivator(() => { attempts.push('second'); return true })
    expect(attempts).toEqual(['first', 'second'])
  })

  it('activates an already registered window immediately', () => {
    let calls = 0
    registerMainWindowActivator(() => { calls += 1; return true })
    requestMainWindowActivation()
    expect(calls).toBe(1)
  })
})
