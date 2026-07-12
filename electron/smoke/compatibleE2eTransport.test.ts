import { afterEach, describe, expect, it } from 'vitest'
import {
  createCompatibleE2eSmokeTransportDependencies,
  isCompatibleE2eSmokeEnabled,
} from './compatibleE2eTransport'

const previousNodeEnv = process.env.NODE_ENV
const previousFlag = process.env.SV_ELECTRON_COMPATIBLE_E2E

afterEach(() => {
  process.env.NODE_ENV = previousNodeEnv
  if (previousFlag === undefined) delete process.env.SV_ELECTRON_COMPATIBLE_E2E
  else process.env.SV_ELECTRON_COMPATIBLE_E2E = previousFlag
})

describe('compatible Electron E2E transport fixture', () => {
  it('is unavailable unless both development mode and the exact explicit flag are present', () => {
    expect(isCompatibleE2eSmokeEnabled({ NODE_ENV: 'production', SV_ELECTRON_COMPATIBLE_E2E: '1' }, false)).toBe(false)
    expect(isCompatibleE2eSmokeEnabled({ NODE_ENV: 'development', SV_ELECTRON_COMPATIBLE_E2E: '0' }, false)).toBe(false)
    expect(isCompatibleE2eSmokeEnabled({ NODE_ENV: 'development', SV_ELECTRON_COMPATIBLE_E2E: '1' }, true)).toBe(false)
    expect(isCompatibleE2eSmokeEnabled({ NODE_ENV: 'development', SV_ELECTRON_COMPATIBLE_E2E: '1' }, false)).toBe(true)
    process.env.NODE_ENV = 'production'
    process.env.SV_ELECTRON_COMPATIBLE_E2E = '1'
    expect(() => createCompatibleE2eSmokeTransportDependencies({ isPackaged: false })).toThrow('compatible_e2e_smoke_not_enabled')
    expect(() => createCompatibleE2eSmokeTransportDependencies({
      env: { NODE_ENV: 'development', SV_ELECTRON_COMPATIBLE_E2E: '1' },
      isPackaged: true,
    })).toThrow('compatible_e2e_smoke_not_enabled')
  })

  it('does not claim connect-time lease consumption for either retained transport', () => {
    process.env.NODE_ENV = 'development'
    process.env.SV_ELECTRON_COMPATIBLE_E2E = '1'
    const fixture = createCompatibleE2eSmokeTransportDependencies({ isPackaged: false })
    expect(fixture.adapters.electron_session_fetch).toMatchObject({ kind: 'electron_session_fetch', securityCapability: 'pre_request_audit_only' })
    expect(fixture.adapters.node_undici).toMatchObject({ kind: 'node_undici', securityCapability: 'pre_request_audit_only' })
  })
})
