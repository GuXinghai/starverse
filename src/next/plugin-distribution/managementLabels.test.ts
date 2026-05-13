import { describe, expect, it } from 'vitest'
import {
  labelPdpFailureReason,
  labelPdpInstallState,
  labelPdpReasonCode,
  labelPdpVerificationStatus,
  sanitizePdpManagementText,
} from './managementLabels'

describe('management labels', () => {
  it('maps verified and installed status to safe user-facing labels', () => {
    expect(labelPdpVerificationStatus('verified')).toMatchObject({
      label: 'Verified by supported policy',
      severity: 'success',
    })
    expect(labelPdpInstallState('installed')).toMatchObject({
      label: 'Installed',
      severity: 'success',
    })
  })

  it('maps quarantined and revocation states without overclaiming a verdict', () => {
    expect(labelPdpInstallState('quarantined')).toMatchObject({
      label: 'Quarantined / disabled',
      severity: 'danger',
    })
    expect(labelPdpFailureReason('revoked')).toMatchObject({
      label: 'Revoked by trust metadata',
      severity: 'danger',
    })
  })

  it('sanitizes raw paths, URLs, hashes, and signature values in label inputs', () => {
    const hash = 'a'.repeat(64)
    const input = `failed at C:\\Users\\owner\\plugin.svpkg https://example.test/${hash} value=${hash}`
    const sanitized = sanitizePdpManagementText(input)
    expect(sanitized).not.toContain('C:\\Users\\owner')
    expect(sanitized).not.toContain('https://example.test')
    expect(sanitized).not.toContain(hash)
  })

  it('humanizes unknown reason codes without unsafe text', () => {
    const label = labelPdpReasonCode('unsupported_future_action')
    expect(label).toMatchObject({
      code: 'unsupported_future_action',
      label: 'Unsupported Future Action',
      severity: 'warning',
    })
  })
})
