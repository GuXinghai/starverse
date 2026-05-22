import { describe, expect, it } from 'vitest'
import {
  collectPackageArtifactClasses,
  createPackageFileEntry,
  createRuntimePackageInventory,
  formatPackageIssues,
  hasPackageRequiredAttributions,
  hasPackageRequiredLicenses,
  normalizePackageFilePath,
  PACKAGE_ARTIFACT_CLASSES,
  validatePackageFilePath,
  validatePackageRequiredArtifacts,
  validateRuntimePackageInventory,
  type PackageFileEntry,
  type RuntimePackageInventory,
} from './enginePackageContract'
import { createExternalEngineRegistry } from './externalEngineRegistry'
import { runEngineHealthCheck } from './externalEngineHealth'
import { buildCapabilityAvailability } from './externalEngineAvailability'
import type { ManagedEnginePluginManifest } from './externalEngineTypes'

function sha256(char: string): string {
  return char.repeat(64)
}

const HEX_A = sha256('a')
const HEX_B = sha256('b')
const HEX_C = sha256('c')
const HEX_D = sha256('d')
const HEX_E = sha256('e')
const HEX_F = sha256('f')
const HEX_0 = sha256('0')
const HEX_1 = sha256('1')
const HEX_2 = sha256('2')

function magikaFiles(): readonly PackageFileEntry[] {
  return [
    createPackageFileEntry({
      relativePath: 'runtime/magika-cli.js',
      artifactClass: 'wrapper',
      sha256: HEX_A,
      required: true,
    }),
    createPackageFileEntry({
      relativePath: 'runtime/magika.js',
      artifactClass: 'runtime',
      sha256: HEX_B,
      required: true,
    }),
    createPackageFileEntry({
      relativePath: 'model/model_config.json',
      artifactClass: 'model',
      sha256: HEX_C,
      required: true,
    }),
    createPackageFileEntry({
      relativePath: 'model/model_data.json',
      artifactClass: 'model',
      sha256: HEX_D,
      required: true,
    }),
    createPackageFileEntry({
      relativePath: 'config/config.json',
      artifactClass: 'config',
      sha256: HEX_E,
    }),
    createPackageFileEntry({
      relativePath: 'manifest.json',
      artifactClass: 'manifest',
      sha256: HEX_F,
      required: true,
    }),
    createPackageFileEntry({
      relativePath: 'manifest.json.sig',
      artifactClass: 'signature',
      sha256: HEX_0,
    }),
    createPackageFileEntry({
      relativePath: 'LICENSE',
      artifactClass: 'license',
      sha256: HEX_1,
      required: true,
    }),
    createPackageFileEntry({
      relativePath: 'ATTRIBUTION',
      artifactClass: 'attribution',
      sha256: HEX_2,
      required: true,
    }),
  ]
}

function magikaInventory(overrides?: Partial<RuntimePackageInventory>): RuntimePackageInventory {
  return createRuntimePackageInventory({
    engineId: 'magika',
    packageVersion: '1.0.0',
    platform: 'any',
    modelVersion: '2024-01-01',
    license: 'Apache-2.0',
    attribution: 'Google Magika (https://github.com/google/magika)',
    ...overrides,
  }, magikaFiles())
}

function pluginManifest(overrides?: Partial<ManagedEnginePluginManifest>): ManagedEnginePluginManifest {
  return {
    id: overrides?.id ?? 'test-plugin',
    displayName: overrides?.displayName ?? 'Test Plugin',
    version: overrides?.version ?? '0.0.1',
    platform: overrides?.platform ?? 'any',
    kind: 'plugin',
    capabilities: overrides?.capabilities ?? ['document_conversion'],
    supportedFormatIds: overrides?.supportedFormatIds ?? [],
    supportedMimeTypes: overrides?.supportedMimeTypes ?? [],
    supportedOutputRoutes: overrides?.supportedOutputRoutes ?? [],
    resourceLimits: overrides?.resourceLimits ?? { maxInputBytes: null, maxDurationMs: null },
    sandbox: overrides?.sandbox ?? { enabled: true },
    network: overrides?.network ?? { allowed: false },
    healthcheck: overrides?.healthcheck ?? { command: 'echo', args: ['ok'], cwd: null },
    metadataAllowlist: overrides?.metadataAllowlist ?? null,
  }
}

describe('validatePackageFilePath', () => {
  it('accepts valid relative path', () => {
    const result = validatePackageFilePath('runtime/entry.js')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.normalized).toBe('runtime/entry.js')
  })

  it('normalizes backslashes to forward slashes', () => {
    const result = validatePackageFilePath('runtime\\entry.js')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.normalized).toBe('runtime/entry.js')
  })

  it('rejects absolute path starting with drive letter', () => {
    const result = validatePackageFilePath('C:\\Users\\test\\file.js')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('absolute')
  })

  it('rejects unix-style absolute path', () => {
    const result = validatePackageFilePath('/usr/local/file.js')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('absolute')
  })

  it('rejects .. traversal', () => {
    const result = validatePackageFilePath('../../etc/passwd')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('traversal')
  })

  it('rejects NUL byte in path', () => {
    const nulPath = 'runtime/file\u0000.js'
    expect(validatePackageFilePath(nulPath).ok).toBe(false)
  })

  it('rejects empty path', () => {
    const result = validatePackageFilePath('')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('empty')
  })

  it('rejects unicode traversal characters', () => {
    const result = validatePackageFilePath('file\u2024\u2025.js')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('traversal')
  })
})

describe('normalizePackageFilePath', () => {
  it('returns null for empty string', () => {
    expect(normalizePackageFilePath('')).toBeNull()
  })

  it('returns null for whitespace-only string', () => {
    expect(normalizePackageFilePath('   ')).toBeNull()
  })

  it('returns null for non-string input', () => {
    expect(normalizePackageFilePath(123 as unknown as string)).toBeNull()
  })

  it('normalizes backslashes and double slashes', () => {
    expect(normalizePackageFilePath('a\\b//c')).toBe('a/b/c')
  })

  it('strips leading ./', () => {
    expect(normalizePackageFilePath('./foo/bar')).toBe('foo/bar')
  })
})

describe('validateRuntimePackageInventory', () => {
  it('accepts valid fake Magika package inventory', () => {
    const result = validateRuntimePackageInventory(magikaInventory() as unknown)
    expect(result.ok).toBe(true)
  })

  it('rejects non-object input', () => {
    const result = validateRuntimePackageInventory(null)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.field === 'root')).toBe(true)
    }
  })

  it('rejects array input', () => {
    const result = validateRuntimePackageInventory([])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.field === 'root')).toBe(true)
    }
  })

  it('rejects missing schemaVersion', () => {
    const inv = magikaInventory() as Record<string, unknown>
    delete inv.schemaVersion
    const result = validateRuntimePackageInventory(inv)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.field === 'schemaVersion')).toBe(true)
    }
  })

  it('rejects wrong schemaVersion', () => {
    const inv = { ...magikaInventory(), schemaVersion: '2' } as Record<string, unknown>
    const result = validateRuntimePackageInventory(inv)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.field === 'schemaVersion')).toBe(true)
    }
  })

  it('rejects missing engineId', () => {
    const inv = magikaInventory() as Record<string, unknown>
    delete inv.engineId
    const result = validateRuntimePackageInventory(inv)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.field === 'engineId')).toBe(true)
    }
  })

  it('rejects missing packageVersion', () => {
    const inv = magikaInventory() as Record<string, unknown>
    delete inv.packageVersion
    const result = validateRuntimePackageInventory(inv)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.field === 'packageVersion')).toBe(true)
    }
  })

  it('rejects invalid platform', () => {
    const inv = { ...magikaInventory(), platform: 'android' }
    const result = validateRuntimePackageInventory(inv as unknown)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.field === 'platform')).toBe(true)
    }
  })

  it('rejects missing files array', () => {
    const inv = magikaInventory() as Record<string, unknown>
    delete inv.files
    const result = validateRuntimePackageInventory(inv)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.field === 'files')).toBe(true)
    }
  })

  it('rejects empty files array', () => {
    const inv = { ...magikaInventory(), files: [] }
    const result = validateRuntimePackageInventory(inv as unknown)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.field === 'files')).toBe(true)
    }
  })

  it('rejects absolute path in file entry', () => {
    const files = [
      createPackageFileEntry({ relativePath: 'C:\\abs\\path.js', artifactClass: 'runtime' }),
    ]
    const inv = createRuntimePackageInventory({ engineId: 'magika' }, files)
    const result = validateRuntimePackageInventory(inv as unknown)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.message.includes('absolute'))).toBe(true)
    }
  })

  it('rejects path traversal in file entry', () => {
    const files = [
      createPackageFileEntry({ relativePath: '../escape.js', artifactClass: 'runtime' }),
    ]
    const inv = createRuntimePackageInventory({ engineId: 'magika' }, files)
    const result = validateRuntimePackageInventory(inv as unknown)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.message.includes('traversal'))).toBe(true)
    }
  })

  it('rejects duplicate relative paths', () => {
    const files = [
      createPackageFileEntry({ relativePath: 'a.js', artifactClass: 'runtime' }),
      createPackageFileEntry({ relativePath: 'a.js', artifactClass: 'model' }),
    ]
    const inv = createRuntimePackageInventory({ engineId: 'magika' }, files)
    const result = validateRuntimePackageInventory(inv as unknown)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.message.includes('duplicate'))).toBe(true)
    }
  })

  it('rejects invalid sha256 hash', () => {
    const files = [
      createPackageFileEntry({ relativePath: 'a.js', artifactClass: 'runtime', sha256: 'bad-hash' }),
    ]
    const inv = createRuntimePackageInventory({ engineId: 'magika' }, files)
    const result = validateRuntimePackageInventory(inv as unknown)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.field.includes('sha256'))).toBe(true)
    }
  })

  it('accepts null sha256', () => {
    const files = [
      createPackageFileEntry({ relativePath: 'a.js', artifactClass: 'runtime', sha256: null }),
    ]
    const inv = createRuntimePackageInventory({ engineId: 'magika' }, files)
    const result = validateRuntimePackageInventory(inv as unknown)
    expect(result.ok).toBe(true)
  })

  it('rejects invalid artifactClass', () => {
    const files = [
      createPackageFileEntry({
        relativePath: 'a.js',
        artifactClass: 'invalid_class' as 'runtime',
      }),
    ]
    const inv = createRuntimePackageInventory({ engineId: 'magika' }, files)
    const result = validateRuntimePackageInventory(inv as unknown)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.field.includes('artifactClass'))).toBe(true)
    }
  })

  it('rejects NaN required field', () => {
    const files = [
      {
        relativePath: 'a.js',
        artifactClass: 'runtime',
        required: 'not-boolean',
      },
    ]
    const inv = createRuntimePackageInventory({ engineId: 'magika' }, files as unknown as PackageFileEntry[])
    const result = validateRuntimePackageInventory(inv as unknown)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.message.includes('required'))).toBe(true)
    }
  })
})

describe('collectPackageArtifactClasses', () => {
  it('returns all artifact classes present in valid inventory', () => {
    const inv = magikaInventory()
    const classes = collectPackageArtifactClasses(inv)
    expect(classes).toContain('runtime')
    expect(classes).toContain('model')
    expect(classes).toContain('wrapper')
    expect(classes).toContain('config')
    expect(classes).toContain('manifest')
    expect(classes).toContain('signature')
    expect(classes).toContain('license')
    expect(classes).toContain('attribution')
  })
})

describe('validatePackageRequiredArtifacts', () => {
  it('passes when all required classes are present', () => {
    const inv = magikaInventory()
    const result = validatePackageRequiredArtifacts(inv, ['runtime', 'model', 'license'])
    expect(result.ok).toBe(true)
  })

  it('fails when a required class is missing (no artifact of class "model")', () => {
    const files = [
      createPackageFileEntry({ relativePath: 'a.js', artifactClass: 'runtime' }),
      createPackageFileEntry({ relativePath: 'LICENSE', artifactClass: 'license' }),
    ]
    const inv = createRuntimePackageInventory({ engineId: 'magika' }, files)
    const result = validatePackageRequiredArtifacts(inv, ['runtime', 'model', 'license'])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.missing).toContain('model')
    }
  })

  it('fails when multiple required classes are missing', () => {
    const files = [
      createPackageFileEntry({ relativePath: 'a.js', artifactClass: 'runtime' }),
    ]
    const inv = createRuntimePackageInventory({ engineId: 'magika' }, files)
    const result = validatePackageRequiredArtifacts(inv, ['runtime', 'model', 'config'])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.missing.length).toBe(2)
    }
  })
})

describe('hasPackageRequiredLicenses', () => {
  it('returns true when license file is present', () => {
    const inv = magikaInventory()
    expect(hasPackageRequiredLicenses(inv)).toBe(true)
  })

  it('returns true when only license field is present', () => {
    const files = [
      createPackageFileEntry({ relativePath: 'a.js', artifactClass: 'runtime' }),
    ]
    const inv = createRuntimePackageInventory(
      { engineId: 'magika', license: 'MIT' },
      files
    )
    expect(hasPackageRequiredLicenses(inv)).toBe(true)
  })

  it('returns false when no license file or field', () => {
    const files = [
      createPackageFileEntry({ relativePath: 'a.js', artifactClass: 'runtime' }),
    ]
    const inv = createRuntimePackageInventory({ engineId: 'magika' }, files)
    expect(hasPackageRequiredLicenses(inv)).toBe(false)
  })
})

describe('hasPackageRequiredAttributions', () => {
  it('returns true when attribution file is present', () => {
    const inv = magikaInventory()
    expect(hasPackageRequiredAttributions(inv)).toBe(true)
  })

  it('returns true when only attribution field is present', () => {
    const files = [
      createPackageFileEntry({ relativePath: 'a.js', artifactClass: 'runtime' }),
    ]
    const inv = createRuntimePackageInventory(
      { engineId: 'magika', attribution: 'Some attribution' },
      files
    )
    expect(hasPackageRequiredAttributions(inv)).toBe(true)
  })

  it('returns false when no attribution file or field', () => {
    const files = [
      createPackageFileEntry({ relativePath: 'a.js', artifactClass: 'runtime' }),
    ]
    const inv = createRuntimePackageInventory({ engineId: 'magika' }, files)
    expect(hasPackageRequiredAttributions(inv)).toBe(false)
  })
})

describe('formatPackageIssues', () => {
  it('joins issues with semicolons', () => {
    const issues = [
      { field: 'engineId', message: 'engineId is required' },
      { field: 'files', message: 'files must not be empty' },
    ]
    const formatted = formatPackageIssues(issues)
    expect(formatted).toContain('engineId: engineId is required')
    expect(formatted).toContain('files: files must not be empty')
    expect(formatted).toContain(';')
  })

  it('redacts absolute paths in issue messages', () => {
    const issues = [
      { field: 'path', message: 'file at C:\\Users\\test\\file.js not found' },
    ]
    const formatted = formatPackageIssues(issues)
    expect(formatted).toContain('[redacted-path]')
    expect(formatted).not.toContain('C:')
  })

  it('redacts unix-style paths in issue messages', () => {
    const issues = [
      { field: 'path', message: 'file at /home/user/file.js not found' },
    ]
    const formatted = formatPackageIssues(issues)
    expect(formatted).toContain('[redacted-path]')
  })
})

describe('PACKAGE_ARTIFACT_CLASSES', () => {
  it('has the expected artifact classes', () => {
    expect(PACKAGE_ARTIFACT_CLASSES).toContain('runtime')
    expect(PACKAGE_ARTIFACT_CLASSES).toContain('model')
    expect(PACKAGE_ARTIFACT_CLASSES).toContain('config')
    expect(PACKAGE_ARTIFACT_CLASSES).toContain('wrapper')
    expect(PACKAGE_ARTIFACT_CLASSES).toContain('manifest')
    expect(PACKAGE_ARTIFACT_CLASSES).toContain('signature')
    expect(PACKAGE_ARTIFACT_CLASSES).toContain('license')
    expect(PACKAGE_ARTIFACT_CLASSES).toContain('attribution')
    expect(PACKAGE_ARTIFACT_CLASSES).toContain('healthcheck')
  })
})

describe('P5-E trust verification gate with package inventory', () => {
  it('blocks health check for plugin engine with valid package inventory but undefined verificationStatus', async () => {
    const validInv = magikaInventory()
    const invResult = validateRuntimePackageInventory(validInv as unknown)
    expect(invResult.ok).toBe(true)

    const registry = createExternalEngineRegistry()
    registry.registerManifest(
      pluginManifest({ id: 'magika', kind: 'plugin' })
    )

    const updated = await runEngineHealthCheck({
      registry,
      engineId: 'magika',
      runner: async () => ({ status: 'healthy', reason: null, detail: null }),
    })
    expect(updated.healthStatus).toBe('failed')
    expect(updated.failureReason).toBe('disabled_by_policy')
    expect(updated.failureDetails).toContain('unverified')
  })

  it('allows health check for plugin engine with valid package inventory and verified status', async () => {
    const validInv = magikaInventory()
    const invResult = validateRuntimePackageInventory(validInv as unknown)
    expect(invResult.ok).toBe(true)

    const registry = createExternalEngineRegistry()
    registry.registerManifest(
      pluginManifest({ id: 'magika', kind: 'plugin' })
    )
    registry.setVerificationStatus({ engineId: 'magika', verificationStatus: 'verified' })

    const updated = await runEngineHealthCheck({
      registry,
      engineId: 'magika',
      runner: async () => ({ status: 'healthy', reason: null, detail: null }),
    })
    expect(updated.healthStatus).toBe('healthy')
  })

  it('excludes plugin engine from availability when verificationStatus is undefined even with valid inventory', () => {
    const validInv = magikaInventory()
    const invResult = validateRuntimePackageInventory(validInv as unknown)
    expect(invResult.ok).toBe(true)

    const capabilities = buildCapabilityAvailability([
      {
        id: 'magika',
        displayName: 'Magika',
        version: '1.0.0',
        platform: 'any',
        kind: 'plugin',
        capabilities: ['text_extraction'],
        supportedFormatIds: [],
        supportedMimeTypes: [],
        enabled: true,
        healthStatus: 'healthy',
        failureReason: null,
        failureDetails: null,
        lastCheckedAt: null,
        healthcheck: null,
      },
    ])
    expect(capabilities.text_extraction).toBe(false)
  })

  it('includes plugin engine in availability when verificationStatus is verified', () => {
    const capabilities = buildCapabilityAvailability([
      {
        id: 'magika',
        displayName: 'Magika',
        version: '1.0.0',
        platform: 'any',
        kind: 'plugin',
        capabilities: ['text_extraction'],
        supportedFormatIds: [],
        supportedMimeTypes: [],
        enabled: true,
        healthStatus: 'healthy',
        failureReason: null,
        failureDetails: null,
        lastCheckedAt: null,
        healthcheck: null,
        verificationStatus: 'verified',
      },
    ])
    expect(capabilities.text_extraction).toBe(true)
  })
})

describe('P5-E builtin compatibility', () => {
  it('builtin engines are not affected by package inventory validation', async () => {
    const registry = createExternalEngineRegistry()
    registry.registerBuiltInEngineDefinitions()

    const updated = await runEngineHealthCheck({
      registry,
      engineId: 'tika',
      runner: async () => ({ status: 'healthy', reason: null, detail: null }),
    })
    expect(updated.healthStatus).toBe('healthy')
  })

  it('builtin engines appear in availability without verificationStatus', () => {
    const capabilities = buildCapabilityAvailability([
      {
        id: 'tika',
        displayName: 'Tika',
        version: 'stub-1',
        platform: 'any',
        kind: 'builtin',
        capabilities: ['document_conversion'],
        supportedFormatIds: [],
        supportedMimeTypes: [],
        enabled: true,
        healthStatus: 'healthy',
        failureReason: null,
        failureDetails: null,
        lastCheckedAt: null,
        healthcheck: null,
      },
    ])
    expect(capabilities.document_conversion).toBe(true)
  })
})
