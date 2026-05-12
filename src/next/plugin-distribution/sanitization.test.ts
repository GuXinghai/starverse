import { describe, expect, it } from 'vitest'
import { sanitizePluginDistributionText } from './index'

describe('sanitizePluginDistributionText', () => {
  it('redacts Linux absolute paths under /opt', () => {
    const sanitized = sanitizePluginDistributionText('failed at /opt/starverse/plugins/runtime.bin')
    expect(sanitized).toContain('[redacted-path]')
    expect(sanitized).not.toContain('/opt/starverse/plugins/runtime.bin')
  })

  it('redacts Linux absolute paths under /usr/local and /etc', () => {
    const sanitized = sanitizePluginDistributionText(
      'check /usr/local/bin/plugin and /etc/starverse/plugin.conf'
    )
    expect(sanitized).toContain('[redacted-path]')
    expect(sanitized).not.toContain('/usr/local/bin/plugin')
    expect(sanitized).not.toContain('/etc/starverse/plugin.conf')
  })

  it('redacts UNC paths', () => {
    const sanitized = sanitizePluginDistributionText(
      'unc source \\\\server\\share\\plugins\\pkg'
    )
    expect(sanitized).toContain('[redacted-path]')
    expect(sanitized).not.toContain('\\\\server\\share\\plugins\\pkg')
  })
})
