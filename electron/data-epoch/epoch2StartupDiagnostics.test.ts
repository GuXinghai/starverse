import { describe, expect, it } from 'vitest'
import { formatEpoch2SchemaRecoverySuccess } from './epoch2StartupDiagnostics'

describe('epoch-2 startup diagnostics', () => {
  it('reports recovery without exposing an absolute backup path', () => {
    const message = formatEpoch2SchemaRecoverySuccess(3)
    expect(message).toBe('[epoch2-startup] EPOCH2_DATABASE_SCHEMA_MISMATCH_RECOVERED files=3\n')
    expect(message).not.toContain('backup=')
    expect(message).not.toMatch(/[A-Z]:\\|\/home\//u)
  })
})
