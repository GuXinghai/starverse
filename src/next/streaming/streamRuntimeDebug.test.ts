import { afterEach, describe, expect, it } from 'vitest'
import { getApprovedDebugFlagStorageKey } from '@/shared/diagnostics/flags'
import { isStreamErrorDebugEnabled, isTimingDebugEnabled, resolveStreamDebugPatch } from './streamRuntimeDebug'

describe('streamRuntimeDebug', () => {
  afterEach(() => {
    globalThis.localStorage?.removeItem(getApprovedDebugFlagStorageKey('streamError'))
    globalThis.localStorage?.removeItem(getApprovedDebugFlagStorageKey('timing'))
    globalThis.localStorage?.removeItem(getApprovedDebugFlagStorageKey('openrouterEchoUpstreamBody'))
  })

  it('reads stream debug flags from localStorage through a single runtime entry', () => {
    globalThis.localStorage?.setItem(getApprovedDebugFlagStorageKey('streamError'), '1')
    globalThis.localStorage?.setItem(getApprovedDebugFlagStorageKey('timing'), '1')

    expect(isStreamErrorDebugEnabled()).toBe(true)
    expect(isTimingDebugEnabled()).toBe(true)
  })

  it('emits debug echo patch only when the debug flag is enabled', () => {
    expect(resolveStreamDebugPatch()).toEqual({})

    globalThis.localStorage?.setItem(getApprovedDebugFlagStorageKey('openrouterEchoUpstreamBody'), '1')

    expect(resolveStreamDebugPatch()).toEqual({ debug: { echoUpstreamBody: true } })
  })

  it('drops dev-only debug echo patch outside DEV runtime even with stale storage', () => {
    globalThis.localStorage?.setItem(getApprovedDebugFlagStorageKey('openrouterEchoUpstreamBody'), '1')

    expect(resolveStreamDebugPatch({ devRuntime: false })).toEqual({})
    expect(globalThis.localStorage?.getItem(getApprovedDebugFlagStorageKey('openrouterEchoUpstreamBody'))).toBeNull()
  })
})
