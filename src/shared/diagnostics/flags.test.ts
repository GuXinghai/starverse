import { afterEach, describe, expect, it, vi } from 'vitest'
import * as diagnosticsFlags from './flags'

const APPROVED_FLAG_NAMES = diagnosticsFlags.listApprovedDebugFlags()

function clearApprovedDebugFlags() {
  for (const name of APPROVED_FLAG_NAMES) {
    globalThis.localStorage?.removeItem(diagnosticsFlags.getApprovedDebugFlagStorageKey(name))
  }
}

describe('shared diagnostics flags', () => {
  afterEach(() => {
    clearApprovedDebugFlags()
    diagnosticsFlags.resetDiagnosticsFlagsCache()
    vi.restoreAllMocks()
  })

  it('keeps the approved debug flag list bounded to current active keys', () => {
    expect(APPROVED_FLAG_NAMES).toEqual([
      'streamError',
      'timing',
      'openrouterEchoUpstreamBody',
      'chat',
      'reasoning',
      'responses',
    ])
    expect(diagnosticsFlags.listSettingsPanelDebugFlags()).toEqual(['openrouterEchoUpstreamBody'])
  })

  it('defaults every approved debug flag to disabled when storage is unset', () => {
    for (const name of APPROVED_FLAG_NAMES) {
      expect(diagnosticsFlags.readApprovedDebugFlag(name)).toBe(false)
    }
  })

  it('rejects storage keys outside the approved list and keeps SettingsPanel on its single maintenance entry', () => {
    expect(diagnosticsFlags.resolveApprovedDebugFlagName('sv_debug_unknown')).toBeNull()
    expect(
      diagnosticsFlags.resolveApprovedDebugFlagName(
        diagnosticsFlags.getApprovedDebugFlagStorageKey('openrouterEchoUpstreamBody'),
      ),
    ).toBe('openrouterEchoUpstreamBody')

    diagnosticsFlags.writeApprovedDebugFlag('chat', true)
    expect(globalThis.localStorage?.getItem(diagnosticsFlags.getApprovedDebugFlagStorageKey('chat'))).toBe('1')
    expect(diagnosticsFlags.readApprovedDebugFlag('chat')).toBe(true)

    diagnosticsFlags.writeSettingsPanelDebugFlag('openrouterEchoUpstreamBody', true)
    expect(
      globalThis.localStorage?.getItem(
        diagnosticsFlags.getSettingsPanelDebugFlagStorageKey('openrouterEchoUpstreamBody'),
      ),
    ).toBe('1')
    expect(diagnosticsFlags.readSettingsPanelDebugFlag('openrouterEchoUpstreamBody')).toBe(true)
  })

  it('forces dev-only debug flags off outside DEV runtime and clears stale storage', () => {
    globalThis.localStorage?.setItem(diagnosticsFlags.getApprovedDebugFlagStorageKey('openrouterEchoUpstreamBody'), '1')

    expect(diagnosticsFlags.readApprovedDebugFlag('openrouterEchoUpstreamBody', { devRuntime: false })).toBe(false)
    expect(globalThis.localStorage?.getItem(diagnosticsFlags.getApprovedDebugFlagStorageKey('openrouterEchoUpstreamBody'))).toBeNull()

    diagnosticsFlags.writeSettingsPanelDebugFlag('openrouterEchoUpstreamBody', true, { devRuntime: false })
    expect(globalThis.localStorage?.getItem(diagnosticsFlags.getApprovedDebugFlagStorageKey('openrouterEchoUpstreamBody'))).toBeNull()
  })
})
