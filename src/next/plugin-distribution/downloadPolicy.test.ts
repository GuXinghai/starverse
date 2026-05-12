import { describe, expect, it } from 'vitest'
import { validateDownloadPolicy, type DownloadPolicyCatalogPackageRef } from './index'

const HASH = 'a'.repeat(64)

function ref(overrides?: Partial<DownloadPolicyCatalogPackageRef>): DownloadPolicyCatalogPackageRef {
  return {
    pluginId: 'magika-managed',
    pluginVersion: '1.2.3',
    packageRef: 'https://plugins.starverse.local/packages/magika-managed.svpkg',
    sourceKind: 'catalog_official',
    catalogStatus: 'valid_metadata_only',
    installabilityStatus: 'metadata_compatible_future_install',
    packageSha256: HASH,
    packageSizeBytes: 12,
    ...overrides,
  }
}

const policy = {
  maxBytes: 1024,
  allowedOfficialHosts: ['plugins.starverse.local'],
}

describe('validateDownloadPolicy', () => {
  it('accepts official HTTPS package refs', () => {
    const result = validateDownloadPolicy(ref(), policy)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.policy.transportRef).toBe('https://plugins.starverse.local/packages/magika-managed.svpkg')
    expect(result.policy.packageRef).toBe('magika-managed.svpkg')
  })

  it('rejects user URLs', () => {
    const result = validateDownloadPolicy(ref({ sourceKind: 'user_url' }), policy)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failureReasons).toContain('user_url_not_allowed')
  })

  it('rejects third-party source', () => {
    const result = validateDownloadPolicy(ref({ sourceKind: 'third_party' }), policy)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failureReasons).toContain('third_party_source_not_allowed')
  })

  it('rejects non-HTTPS remote package refs', () => {
    const result = validateDownloadPolicy(
      ref({ packageRef: 'http://plugins.starverse.local/packages/magika-managed.svpkg' }),
      policy
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failureReasons).toContain('non_https_remote')
  })

  it('rejects file URLs as remote package refs', () => {
    const result = validateDownloadPolicy(ref({ packageRef: 'file:///tmp/plugin.svpkg' }), policy)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failureReasons).toContain('file_url_not_allowed')
  })

  it('rejects catalog official downloads without explicit host pinning', () => {
    const result = validateDownloadPolicy(ref(), { maxBytes: 1024 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failureReasons).toContain('official_host_required')
  })

  it('rejects missing expected hash and size', () => {
    const result = validateDownloadPolicy(
      ref({ packageSha256: 'not-a-sha', packageSizeBytes: 0 }),
      policy
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.failureReasons).toContain('missing_expected_hash')
      expect(result.failureReasons).toContain('missing_expected_size')
    }
  })

  it('accepts local official fixture only with explicit fixture opt-in', () => {
    const rejected = validateDownloadPolicy(
      ref({ sourceKind: 'local_official_fixture', packageRef: 'fixture_pkg_1' }),
      policy
    )
    expect(rejected.ok).toBe(false)

    const accepted = validateDownloadPolicy(
      ref({ sourceKind: 'local_official_fixture', packageRef: 'fixture_pkg_1' }),
      { ...policy, allowLocalFixtures: true }
    )
    expect(accepted.ok).toBe(true)
  })

  it('sanitizes diagnostics', () => {
    const result = validateDownloadPolicy(
      ref({ packageRef: 'C:\\Users\\owner\\plugin.svpkg', packageSha256: HASH }),
      policy
    )
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain('C:\\Users\\owner')
    expect(JSON.stringify(result)).not.toContain(HASH)
  })
})
