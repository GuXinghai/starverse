import { describe, expect, it } from 'vitest'
import {
  createConversionRuntimeInventory,
  CONVERSION_RUNTIME_REQUIRED_ARTIFACT_CLASSES,
  type ConversionPackageSeed,
} from './conversionRuntimePackage'
import {
  createPackageFileEntry,
  createRuntimePackageInventory,
  formatPackageIssues,
  hasPackageRequiredAttributions,
  hasPackageRequiredLicenses,
  validatePackageRequiredArtifacts,
  validateRuntimePackageInventory,
  type PackageFileEntry,
} from './enginePackageContract'
import { createExternalEngineRegistry } from './externalEngineRegistry'
import { runEngineHealthCheck } from './externalEngineHealth'
import { buildCapabilityAvailability } from './externalEngineAvailability'
import { EXTERNAL_PROCESS_POLICY_DEFAULTS } from './externalProcessPolicy'
import type { ManagedEnginePluginManifest } from './externalEngineTypes'

function sha256(char: string): string {
  return char.repeat(64)
}

const HEX_A = sha256('a')
const HEX_B = sha256('b')
const HEX_3 = sha256('3')
const HEX_4 = sha256('4')
const HEX_5 = sha256('5')
const HEX_6 = sha256('6')
const HEX_9 = sha256('9')

function pandocSeed(overrides?: Partial<ConversionPackageSeed>): ConversionPackageSeed {
  return {
    engineId: 'pandoc',
    packageVersion: '3.6.6',
    platform: 'win32',
    runtimeEntryRelPath: 'runtime/pandoc.exe',
    license: 'GPL-2.0',
    attribution: 'Pandoc (https://pandoc.org/)',
    ...overrides,
  }
}

function pandocExtraFiles(): readonly PackageFileEntry[] {
  return [
    createPackageFileEntry({
      relativePath: 'config/defaults.yaml',
      artifactClass: 'config',
      sha256: HEX_5,
    }),
    createPackageFileEntry({
      relativePath: 'NOTICE',
      artifactClass: 'attribution',
      sha256: HEX_6,
    }),
  ]
}

function pandocInventory(
  seedOverrides?: Partial<ConversionPackageSeed>,
  extra?: readonly PackageFileEntry[]
) {
  return createConversionRuntimeInventory(pandocSeed(seedOverrides), extra ?? pandocExtraFiles())
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

describe('CONVERSION_RUNTIME_REQUIRED_ARTIFACT_CLASSES', () => {
  it('contains the five required artifact classes for a conversion runtime', () => {
    expect(CONVERSION_RUNTIME_REQUIRED_ARTIFACT_CLASSES).toContain('runtime')
    expect(CONVERSION_RUNTIME_REQUIRED_ARTIFACT_CLASSES).toContain('manifest')
    expect(CONVERSION_RUNTIME_REQUIRED_ARTIFACT_CLASSES).toContain('signature')
    expect(CONVERSION_RUNTIME_REQUIRED_ARTIFACT_CLASSES).toContain('license')
    expect(CONVERSION_RUNTIME_REQUIRED_ARTIFACT_CLASSES).toContain('attribution')
  })
})

describe('createConversionRuntimeInventory', () => {
  it('creates a valid Pandoc pilot inventory with all required classes', () => {
    const inv = pandocInventory()
    const result = validateRuntimePackageInventory(inv as unknown)
    expect(result.ok).toBe(true)

    const classes = validatePackageRequiredArtifacts(
      inv,
      CONVERSION_RUNTIME_REQUIRED_ARTIFACT_CLASSES as readonly typeof CONVERSION_RUNTIME_REQUIRED_ARTIFACT_CLASSES[number][]
    )
    expect(classes.ok).toBe(true)
  })

  it('includes runtime entry, manifest, signature, license, and attribution', () => {
    const inv = pandocInventory()
    const result = validateRuntimePackageInventory(inv as unknown)
    expect(result.ok).toBe(true)

    expect(hasPackageRequiredLicenses(inv)).toBe(true)
    expect(hasPackageRequiredAttributions(inv)).toBe(true)

    const paths = inv.files.map((f) => f.relativePath)
    expect(paths).toContain('runtime/pandoc.exe')
    expect(paths).toContain('manifest.json')
    expect(paths).toContain('manifest.json.sig')
    expect(paths).toContain('LICENSE')
    expect(paths).toContain('ATTRIBUTION')
  })

  it('carries the platform through from the seed', () => {
    const inv = pandocInventory({ platform: 'darwin' })
    expect(inv.platform).toBe('darwin')
  })

  it('carries the license and attribution through', () => {
    const inv = pandocInventory({ license: 'MIT', attribution: 'Acme Corp' })
    expect(inv.license).toBe('MIT')
    expect(inv.attribution).toBe('Acme Corp')
  })
})

describe('P5-E3 Pandoc pilot missing artifact validation', () => {
  it('fails required artifact check when runtime entry is missing', () => {
    const inv = createRuntimePackageInventory(
      { engineId: 'pandoc', platform: 'win32' },
      [
        createPackageFileEntry({ relativePath: 'manifest.json', artifactClass: 'manifest', required: true }),
        createPackageFileEntry({ relativePath: 'manifest.json.sig', artifactClass: 'signature', required: true }),
        createPackageFileEntry({ relativePath: 'LICENSE', artifactClass: 'license', required: true }),
        createPackageFileEntry({ relativePath: 'ATTRIBUTION', artifactClass: 'attribution', required: true }),
      ]
    )
    const result = validatePackageRequiredArtifacts(
      inv,
      CONVERSION_RUNTIME_REQUIRED_ARTIFACT_CLASSES as readonly typeof CONVERSION_RUNTIME_REQUIRED_ARTIFACT_CLASSES[number][]
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.missing).toContain('runtime')
    }
  })

  it('fails when license file is missing and no license field', () => {
    const inv = createRuntimePackageInventory(
      { engineId: 'pandoc' },
      [createPackageFileEntry({ relativePath: 'bin/pandoc', artifactClass: 'runtime' })]
    )
    expect(hasPackageRequiredLicenses(inv)).toBe(false)
  })

  it('fails when attribution file is missing and no attribution field', () => {
    const inv = createRuntimePackageInventory(
      { engineId: 'pandoc' },
      [createPackageFileEntry({ relativePath: 'bin/pandoc', artifactClass: 'runtime' })]
    )
    expect(hasPackageRequiredAttributions(inv)).toBe(false)
  })

  it('fails when signature placeholder is missing from required artifacts', () => {
    const inv = createRuntimePackageInventory(
      { engineId: 'pandoc', platform: 'win32' },
      [
        createPackageFileEntry({ relativePath: 'bin/pandoc.exe', artifactClass: 'runtime', required: true }),
        createPackageFileEntry({ relativePath: 'manifest.json', artifactClass: 'manifest', required: true }),
        createPackageFileEntry({ relativePath: 'LICENSE', artifactClass: 'license', required: true }),
        createPackageFileEntry({ relativePath: 'ATTRIBUTION', artifactClass: 'attribution', required: true }),
      ]
    )
    const result = validatePackageRequiredArtifacts(
      inv,
      CONVERSION_RUNTIME_REQUIRED_ARTIFACT_CLASSES as readonly typeof CONVERSION_RUNTIME_REQUIRED_ARTIFACT_CLASSES[number][]
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.missing).toContain('signature')
    }
  })
})

describe('P5-E3 path safety', () => {
  it('rejects Pandoc pilot inventory with absolute runtime path', () => {
    const inv = createConversionRuntimeInventory(
      pandocSeed({ runtimeEntryRelPath: 'C:\\Program Files\\Pandoc\\pandoc.exe' })
    )
    const result = validateRuntimePackageInventory(inv as unknown)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.message.includes('absolute'))).toBe(true)
    }
  })

  it('rejects Pandoc pilot inventory with traversal path', () => {
    const inv = createConversionRuntimeInventory(
      pandocSeed({ runtimeEntryRelPath: '../../bin/pandoc' })
    )
    const result = validateRuntimePackageInventory(inv as unknown)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.message.includes('traversal'))).toBe(true)
    }
  })

  it('creates valid Pandoc pilot inventory with darwin platform', () => {
    const inv = pandocInventory({
      platform: 'darwin',
      runtimeEntryRelPath: 'runtime/pandoc',
    })
    expect(inv.platform).toBe('darwin')
    const result = validateRuntimePackageInventory(inv as unknown)
    expect(result.ok).toBe(true)
  })

  it('creates valid Pandoc pilot inventory with linux platform', () => {
    const inv = pandocInventory({
      platform: 'linux',
      runtimeEntryRelPath: 'runtime/pandoc',
    })
    expect(inv.platform).toBe('linux')
    const result = validateRuntimePackageInventory(inv as unknown)
    expect(result.ok).toBe(true)
  })
})

describe('P5-E3 diagnostic sanitization', () => {
  it('formatPackageIssues redacts paths from Pandoc-specific issues', () => {
    const issues = [
      { field: 'files[0].relativePath', message: 'path C:\\Program Files\\Pandoc\\pandoc.exe is not valid' },
    ]
    const formatted = formatPackageIssues(issues)
    expect(formatted).toContain('[redacted-path]')
    expect(formatted).not.toContain('Program Files')
  })
})

describe('P5-E3 trust verification gate with conversion pilot', () => {
  it('blocks health check for Pandoc pilot engine when verificationStatus is undefined', async () => {
    const validInv = pandocInventory()
    const invResult = validateRuntimePackageInventory(validInv as unknown)
    expect(invResult.ok).toBe(true)

    const registry = createExternalEngineRegistry()
    registry.registerManifest(
      pluginManifest({ id: 'pandoc', kind: 'plugin', capabilities: ['document_conversion'] })
    )

    const updated = await runEngineHealthCheck({
      registry,
      engineId: 'pandoc',
      runner: async () => ({ status: 'healthy', reason: null, detail: null }),
    })
    expect(updated.healthStatus).toBe('failed')
    expect(updated.failureReason).toBe('disabled_by_policy')
    expect(updated.failureDetails).toContain('unverified')
  })

  it('allows health check for Pandoc pilot engine when verificationStatus is verified', async () => {
    const validInv = pandocInventory()
    const invResult = validateRuntimePackageInventory(validInv as unknown)
    expect(invResult.ok).toBe(true)

    const registry = createExternalEngineRegistry()
    registry.registerManifest(
      pluginManifest({ id: 'pandoc', kind: 'plugin', capabilities: ['document_conversion'] })
    )
    registry.setVerificationStatus({ engineId: 'pandoc', verificationStatus: 'verified' })

    const updated = await runEngineHealthCheck({
      registry,
      engineId: 'pandoc',
      runner: async () => ({ status: 'healthy', reason: null, detail: null }),
    })
    expect(updated.healthStatus).toBe('healthy')
    expect(updated.failureReason).toBeNull()
  })

  it('excludes Pandoc pilot engine from availability when verificationStatus is undefined', () => {
    const validInv = pandocInventory()
    const invResult = validateRuntimePackageInventory(validInv as unknown)
    expect(invResult.ok).toBe(true)

    const capabilities = buildCapabilityAvailability([
      {
        id: 'pandoc',
        displayName: 'Pandoc Pilot',
        version: '3.6.6',
        platform: 'win32',
        kind: 'plugin',
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
    expect(capabilities.document_conversion).toBe(false)
  })

  it('includes Pandoc pilot engine in availability when verificationStatus is verified', () => {
    const capabilities = buildCapabilityAvailability([
      {
        id: 'pandoc',
        displayName: 'Pandoc Pilot',
        version: '3.6.6',
        platform: 'win32',
        kind: 'plugin',
        capabilities: ['document_conversion'],
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
    expect(capabilities.document_conversion).toBe(true)
  })
})

describe('P5-E3 Pandoc builtin compatibility', () => {
  it('pandoc builtin stub is not blocked by conversion pilot contracts', async () => {
    const registry = createExternalEngineRegistry()
    registry.registerBuiltInEngineDefinitions()

    const updated = await runEngineHealthCheck({
      registry,
      engineId: 'pandoc',
      runner: async () => ({ status: 'healthy', reason: null, detail: null }),
    })
    expect(updated.healthStatus).toBe('healthy')
  })

  it('pandoc builtin stub appears in availability without verificationStatus', () => {
    const capabilities = buildCapabilityAvailability([
      {
        id: 'pandoc',
        displayName: 'Pandoc (stub)',
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

describe('P5-E3 process policy defaults', () => {
  it('shell is false by default', () => {
    expect(EXTERNAL_PROCESS_POLICY_DEFAULTS.shell).toBe(false)
  })

  it('allowBatchEntrypoint is false by default', () => {
    expect(EXTERNAL_PROCESS_POLICY_DEFAULTS.allowBatchEntrypoint).toBe(false)
  })

  it('conversion timeout is the largest default timeout', () => {
    expect(EXTERNAL_PROCESS_POLICY_DEFAULTS.conversionTimeoutMs).toBe(60000)
  })
})

describe('P5-E3 Pandoc pilot package is generic across engines', () => {
  it('can represent a Tika conversion package', () => {
    const inv = createConversionRuntimeInventory({
      engineId: 'tika',
      packageVersion: '3.0.0',
      platform: 'any',
      runtimeEntryRelPath: 'runtime/tika-server.jar',
      license: 'Apache-2.0',
      attribution: 'Apache Tika (https://tika.apache.org/)',
    })
    const result = validateRuntimePackageInventory(inv as unknown)
    expect(result.ok).toBe(true)
    expect(inv.engineId).toBe('tika')
    expect(inv.license).toBe('Apache-2.0')
  })

  it('can represent an ffprobe metadata probe package', () => {
    const inv = createConversionRuntimeInventory({
      engineId: 'ffprobe',
      packageVersion: '7.1.0',
      platform: 'win32',
      runtimeEntryRelPath: 'runtime/ffprobe.exe',
      license: 'GPL',
      attribution: 'FFmpeg (https://ffmpeg.org/)',
    })
    const result = validateRuntimePackageInventory(inv as unknown)
    expect(result.ok).toBe(true)
    expect(inv.engineId).toBe('ffprobe')
    expect(inv.platform).toBe('win32')
  })

  it('can represent a LibreOffice conversion package', () => {
    const inv = createConversionRuntimeInventory({
      engineId: 'libreoffice',
      packageVersion: '24.2.0',
      platform: 'win32',
      runtimeEntryRelPath: 'runtime/soffice.exe',
      license: 'MPL-2.0',
      attribution: 'LibreOffice (https://www.libreoffice.org/)',
    })
    const result = validateRuntimePackageInventory(inv as unknown)
    expect(result.ok).toBe(true)
    expect(inv.engineId).toBe('libreoffice')
  })
})
