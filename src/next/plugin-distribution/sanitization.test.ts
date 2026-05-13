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

  it('redacts key-value Unix path diagnostics', () => {
    const sanitized = sanitizePluginDistributionText('download failed path=/opt/starverse/plugin')
    expect(sanitized).toContain('path=[redacted-path]')
    expect(sanitized).not.toContain('/opt/starverse/plugin')
  })

  it('redacts quoted key-value Unix path diagnostics', () => {
    const sanitized = sanitizePluginDistributionText('download failed path="/opt/starverse/plugin"')
    expect(sanitized).toContain('path="[redacted-path]"')
    expect(sanitized).not.toContain('/opt/starverse/plugin')
  })

  it('redacts quoted key-value Unix paths containing spaces', () => {
    const sanitized = sanitizePluginDistributionText('download failed path="/opt/Starverse Plugin/plugin"')
    expect(sanitized).toContain('path="[redacted-path]"')
    expect(sanitized).not.toContain('/opt/Starverse Plugin/plugin')
    expect(sanitized).not.toContain('Plugin/plugin')
  })

  it('redacts unterminated quoted key-value Unix path diagnostics', () => {
    const sanitized = sanitizePluginDistributionText('download failed path="/opt/starverse/plugin')
    expect(sanitized).toContain('path="[redacted-path]"')
    expect(sanitized).not.toContain('/opt/starverse/plugin')
  })

  it('redacts mixed-delimiter Windows diagnostics', () => {
    const sanitized = sanitizePluginDistributionText('cleanup path=C:/Users/owner/plugin')
    expect(sanitized).toContain('path=[redacted-path]')
    expect(sanitized).not.toContain('C:/Users/owner/plugin')
  })

  it('redacts Windows paths containing spaces', () => {
    const sanitized = sanitizePluginDistributionText('failed at C:\\Users\\owner\\My Documents\\plugin')
    expect(sanitized).toContain('[redacted-path]')
    expect(sanitized).not.toContain('C:\\Users\\owner\\My Documents\\plugin')
    expect(sanitized).not.toContain('Documents\\plugin')
  })

  it('redacts unterminated quoted mixed-delimiter Windows diagnostics', () => {
    const sanitized = sanitizePluginDistributionText('cleanup path="C:/Users/owner/plugin')
    expect(sanitized).toContain('path="[redacted-path]"')
    expect(sanitized).not.toContain('C:/Users/owner/plugin')
  })

  it('redacts http and https URLs including query strings', () => {
    const sanitized = sanitizePluginDistributionText(
      'fetch http://example.test/plugin.svpkg?token=secret and https://example.test/a/b?hash=abc#frag'
    )
    expect(sanitized).toContain('[redacted-url]')
    expect(sanitized).not.toContain('http://example.test')
    expect(sanitized).not.toContain('https://example.test')
    expect(sanitized).not.toContain('token=secret')
    expect(sanitized).not.toContain('hash=abc')
  })

  it('redacts file URLs without leaking raw URL paths', () => {
    const sanitized = sanitizePluginDistributionText('loaded file:///C:/Users/owner/plugin.svpkg?sig=secret')
    expect(sanitized).toContain('[redacted-url]')
    expect(sanitized).not.toContain('file:///C:/Users/owner/plugin.svpkg')
    expect(sanitized).not.toContain('sig=secret')
  })
})
