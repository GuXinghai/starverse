import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function workflow(name: string): string {
  return readFileSync(path.join(ROOT_DIR, '.github', 'workflows', name), 'utf8').replace(/\r\n/g, '\n')
}

// R6-08 (P8-08, P8-09, P8-13): text guards; the repository settings behind them are outside the repository.
describe('release workflow least privilege', () => {
  const release = workflow('release-magika-plugin.yml')

  it('grants write access only to the publish job', () => {
    const topLevel = /^permissions:\n((?:  .*\n)+)/m.exec(release)?.[1] ?? ''
    expect(topLevel).toContain('contents: read')
    expect(topLevel).not.toContain('write')
    const publishJob = release.slice(release.indexOf('  sign-and-publish:'))
    expect(publishJob).toContain('permissions:\n      contents: write')
    expect(release.slice(0, release.indexOf('  sign-and-publish:'))).not.toContain('contents: write')
  })

  it('refuses to sign or publish from a ref other than main or a tag, before the signing key is used', () => {
    const publishJob = release.slice(release.indexOf('  sign-and-publish:'))
    const guard = publishJob.indexOf('refs/heads/main|refs/tags/*')
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(publishJob.indexOf('STARVERSE_PLUGIN_SIGNING_PRIVATE_KEY'))
  })

  it('never replaces a published asset and publishes the release summary with the package', () => {
    expect(release).not.toContain('--clobber')
    expect(release).toMatch(/gh release create "\$tag" "\$zip" "\$sig" "\$summary"/)
  })

  it('does not interpolate dispatch inputs into shell text', () => {
    for (const line of release.split('\n')) {
      if (/^\s+(run:|tag=|test )/.test(line)) expect(line, line).not.toContain('${{ inputs.')
    }
  })

  it('keeps the CI workflow read-only', () => {
    expect(workflow('ci.yml')).toMatch(/^permissions:\n  contents: read\n/m)
  })
})
