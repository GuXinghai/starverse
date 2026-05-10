import { describe, expect, it } from 'vitest'
import {
  CONVERSION_RUNTIME_REQUIRED_ARTIFACT_CLASSES,
  createConversionRuntimeInventory,
  type ConversionPackageSeed,
} from './conversionRuntimePackage'
import {
  createPackageFileEntry,
  createRuntimePackageInventory,
  formatPackageIssues,
  hasPackageRequiredAttributions,
  hasPackageRequiredLicenses,
  PACKAGE_ARTIFACT_CLASSES,
  validatePackageFilePath,
  validatePackageRequiredArtifacts,
  validateRuntimePackageInventory,
  type PackageArtifactClass,
  type PackageFileEntry,
} from './enginePackageContract'
import { createExternalEngineRegistry } from './externalEngineRegistry'
import { runEngineHealthCheck } from './externalEngineHealth'
import { buildCapabilityAvailability } from './externalEngineAvailability'
import { EXTERNAL_PROCESS_POLICY_DEFAULTS } from './externalProcessPolicy'
import { isEngineTrustVerified } from './enginePluginTrustContracts'
import type { ManagedEnginePluginManifest, TrustVerificationStatus } from './externalEngineTypes'

function sha256(char: string): string {
  return char.repeat(64)
}

const H_A = sha256('a')
const H_B = sha256('b')
const H_C = sha256('c')
const H_D = sha256('d')
const H_E = sha256('e')
const H_F = sha256('f')
const H_0 = sha256('0')
const H_1 = sha256('1')
const H_2 = sha256('2')

function pandocInventory() {
  return createConversionRuntimeInventory(
    {
      engineId: 'pandoc',
      packageVersion: '3.6.6',
      platform: 'win32',
      runtimeEntryRelPath: 'runtime/pandoc.exe',
      license: 'GPL-2.0',
      attribution: 'Pandoc (https://pandoc.org/)',
    },
    [
      createPackageFileEntry({ relativePath: 'config/defaults.yaml', artifactClass: 'config', sha256: H_0 }),
      createPackageFileEntry({ relativePath: 'NOTICE', artifactClass: 'attribution', sha256: H_1 }),
    ]
  )
}

function registerPluginEngine(
  registry: ReturnType<typeof createExternalEngineRegistry>,
  overrides?: Partial<ManagedEnginePluginManifest>
) {
  registry.registerManifest({
    id: overrides?.id ?? 'pandoc',
    displayName: overrides?.displayName ?? 'Pandoc Smoke',
    version: overrides?.version ?? '3.6.6',
    platform: overrides?.platform ?? 'win32',
    kind: 'plugin',
    capabilities: overrides?.capabilities ?? ['document_conversion'],
    supportedFormatIds: overrides?.supportedFormatIds ?? [],
    supportedMimeTypes: overrides?.supportedMimeTypes ?? [],
    supportedOutputRoutes: overrides?.supportedOutputRoutes ?? [],
    resourceLimits: overrides?.resourceLimits ?? { maxInputBytes: null, maxDurationMs: null },
    sandbox: overrides?.sandbox ?? { enabled: true },
    network: overrides?.network ?? { allowed: false },
    healthcheck: overrides?.healthcheck ?? { command: 'pandoc', args: ['--version'], cwd: null },
    metadataAllowlist: overrides?.metadataAllowlist ?? null,
  })
}

const ALL_VERIFICATION_STATUSES: readonly TrustVerificationStatus[] = [
  'unverified',
  'verified',
  'failed',
  'revoked',
  'expired',
  'unconfigured',
]

describe('P5-E4 full Pandoc package lifecycle smoke', () => {
  it('builds valid Pandoc inventory, registers plugin, verifies trust, runs health check, and exposes availability', async () => {
    const inventory = pandocInventory()
    const validation = validateRuntimePackageInventory(inventory as unknown)
    expect(validation.ok).toBe(true)

    const requiredCheck = validatePackageRequiredArtifacts(
      inventory,
      CONVERSION_RUNTIME_REQUIRED_ARTIFACT_CLASSES as readonly typeof CONVERSION_RUNTIME_REQUIRED_ARTIFACT_CLASSES[number][]
    )
    expect(requiredCheck.ok).toBe(true)

    expect(hasPackageRequiredLicenses(inventory)).toBe(true)
    expect(hasPackageRequiredAttributions(inventory)).toBe(true)

    const registry = createExternalEngineRegistry()
    registerPluginEngine(registry)

    const blocked = await runEngineHealthCheck({
      registry,
      engineId: 'pandoc',
      runner: async () => ({ status: 'healthy', reason: null, detail: null }),
    })
    expect(blocked.healthStatus).toBe('failed')
    expect(blocked.failureReason).toBe('disabled_by_policy')

    registry.setVerificationStatus({ engineId: 'pandoc', verificationStatus: 'verified' })

    const healthy = await runEngineHealthCheck({
      registry,
      engineId: 'pandoc',
      runner: async () => ({ status: 'healthy', reason: null, detail: null }),
    })
    expect(healthy.healthStatus).toBe('healthy')

    const cap = buildCapabilityAvailability([registry.getEngineById('pandoc')!])
    expect(cap.document_conversion).toBe(true)
  })

  it('preserves builtin compatibility throughout full smoke', async () => {
    const registry = createExternalEngineRegistry()
    registry.registerBuiltInEngineDefinitions()

    for (const id of ['tika', 'libreoffice', 'ffprobe', 'pandoc'] as const) {
      const updated = await runEngineHealthCheck({
        registry,
        engineId: id,
        runner: async () => ({ status: 'healthy', reason: null, detail: null }),
      })
      expect(updated.healthStatus).toBe('healthy')
    }
  })
})

describe('P5-E4 every required artifact class missing', () => {
  const BASE_FILES: readonly PackageFileEntry[] = [
    createPackageFileEntry({ relativePath: 'runtime/pandoc.exe', artifactClass: 'runtime', required: true }),
    createPackageFileEntry({ relativePath: 'manifest.json', artifactClass: 'manifest', required: true }),
    createPackageFileEntry({ relativePath: 'manifest.json.sig', artifactClass: 'signature', required: true }),
    createPackageFileEntry({ relativePath: 'LICENSE', artifactClass: 'license', required: true }),
    createPackageFileEntry({ relativePath: 'ATTRIBUTION', artifactClass: 'attribution', required: true }),
  ]

  function invWithout(artifactClass: PackageArtifactClass) {
    return createRuntimePackageInventory(
      { engineId: 'pandoc', platform: 'win32' },
      BASE_FILES.filter((f) => f.artifactClass !== artifactClass)
    )
  }

  const REQUIRED = ['runtime', 'manifest', 'signature', 'license', 'attribution'] as const
  for (const missingClass of REQUIRED) {
    it(`fails when required artifact class '${missingClass}' is missing`, () => {
      const inv = invWithout(missingClass)
      const result = validatePackageRequiredArtifacts(
        inv,
        CONVERSION_RUNTIME_REQUIRED_ARTIFACT_CLASSES as readonly typeof CONVERSION_RUNTIME_REQUIRED_ARTIFACT_CLASSES[number][]
      )
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.missing).toContain(missingClass)
      }
    })
  }
})

describe('P5-E4 Pandoc smoke blocked for every non-verified trust status', () => {
  for (const status of ALL_VERIFICATION_STATUSES) {
    const shouldBlock = status !== 'verified'

    if (shouldBlock) {
      it(`blocks health check when verificationStatus is ${status}`, async () => {
        const registry = createExternalEngineRegistry()
        registerPluginEngine(registry)
        registry.setVerificationStatus({ engineId: 'pandoc', verificationStatus: status })

        const updated = await runEngineHealthCheck({
          registry,
          engineId: 'pandoc',
          runner: async () => ({ status: 'healthy', reason: null, detail: null }),
        })
        expect(updated.healthStatus).toBe('failed')
        expect(updated.failureReason).toBe('disabled_by_policy')
        expect(isEngineTrustVerified({ kind: 'plugin', verificationStatus: status })).toBe(false)
      })

      it(`excludes from availability when verificationStatus is ${status}`, () => {
        const capabilities = buildCapabilityAvailability([
          {
            id: 'pandoc',
            displayName: 'Pandoc',
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
            verificationStatus: status,
          },
        ])
        expect(capabilities.document_conversion).toBe(false)
      })
    } else {
      it(`allows health check when verificationStatus is ${status}`, async () => {
        const registry = createExternalEngineRegistry()
        registerPluginEngine(registry)
        registry.setVerificationStatus({ engineId: 'pandoc', verificationStatus: 'verified' })

        const updated = await runEngineHealthCheck({
          registry,
          engineId: 'pandoc',
          runner: async () => ({ status: 'healthy', reason: null, detail: null }),
        })
        expect(updated.healthStatus).toBe('healthy')
        expect(isEngineTrustVerified({ kind: 'plugin', verificationStatus: 'verified' })).toBe(true)
      })

      it(`includes in availability when verificationStatus is ${status}`, () => {
        const capabilities = buildCapabilityAvailability([
          {
            id: 'pandoc',
            displayName: 'Pandoc',
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
    }
  }
})

describe('P5-E4 blocks health check when verificationStatus is undefined (missing)', () => {
  it('undefined verificationStatus blocks Pandoc health check', async () => {
    const registry = createExternalEngineRegistry()
    registerPluginEngine(registry)

    const updated = await runEngineHealthCheck({
      registry,
      engineId: 'pandoc',
      runner: async () => ({ status: 'healthy', reason: null, detail: null }),
    })
    expect(updated.healthStatus).toBe('failed')
    expect(updated.failureReason).toBe('disabled_by_policy')
    expect(updated.failureDetails).toContain('unverified')
  })

  it('undefined verificationStatus excludes Pandoc from availability', () => {
    const capabilities = buildCapabilityAvailability([
      {
        id: 'pandoc',
        displayName: 'Pandoc',
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
})

describe('P5-E4 diagnostics sanitized in smoke context', () => {
  it('redacts paths from diagnostic messages', () => {
    const issues = [
      { field: 'files[0].relativePath', message: 'path C:\\Program Files\\Pandoc\\pandoc.exe rejected' },
      { field: 'files[1].relativePath', message: 'path /usr/local/bin/pandoc rejected' },
    ]
    const formatted = formatPackageIssues(issues)
    expect(formatted).toContain('[redacted-path]')
    expect(formatted).not.toContain('Program Files')
    expect(formatted).not.toContain('/usr/local/bin')
  })

  it('redacts paths in rejection reason output', () => {
    const result = validatePackageFilePath('C:\\abs\\path\\entry.js')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).not.toContain('C:')
      expect(result.reason).not.toContain('\\\\abs')
    }
  })

  it('valid Pandoc smoke diagnostics do not leak raw paths', () => {
    const inventory = pandocInventory()
    const validation = validateRuntimePackageInventory(inventory as unknown)
    expect(validation.ok).toBe(true)

    for (const file of inventory.files) {
      const pathCheck = validatePackageFilePath(file.relativePath)
      if (pathCheck.ok) {
        expect(pathCheck.normalized).not.toContain('\\')
      }
    }
  })
})

describe('P5-E4 process policy defaults intact', () => {
  it('shell is false', () => {
    expect(EXTERNAL_PROCESS_POLICY_DEFAULTS.shell).toBe(false)
  })

  it('allowBatchEntrypoint is false', () => {
    expect(EXTERNAL_PROCESS_POLICY_DEFAULTS.allowBatchEntrypoint).toBe(false)
  })

  it('no shell use permitted by process policy defaults', () => {
    expect(EXTERNAL_PROCESS_POLICY_DEFAULTS.shell).toBe(false)
  })
})

describe('P5-E4 all PACKAGE_ARTIFACT_CLASSES covered in smoke', () => {
  it('every artifact class is represented in PACKAGE_ARTIFACT_CLASSES', () => {
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

describe('P5-E4 path safety smoke', () => {
  it('rejects absolute drive-letter path', () => {
    const result = validatePackageFilePath('C:\\Program Files\\Pandoc\\pandoc.exe')
    expect(result.ok).toBe(false)
  })

  it('rejects absolute unix path', () => {
    const result = validatePackageFilePath('/usr/local/bin/pandoc')
    expect(result.ok).toBe(false)
  })

  it('rejects path traversal', () => {
    const result = validatePackageFilePath('../../bin/pandoc')
    expect(result.ok).toBe(false)
  })

  it('rejects NUL byte', () => {
    const result = validatePackageFilePath('pandoc\u0000.exe')
    expect(result.ok).toBe(false)
  })

  it('accepts normalized relative path', () => {
    const result = validatePackageFilePath('runtime/pandoc.exe')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.normalized).toBe('runtime/pandoc.exe')
  })
})

describe('P5-E4 hash-shaped metadata smoke', () => {
  it('accepts valid sha256-shaped hash in inventory', () => {
    const files: PackageFileEntry[] = [
      createPackageFileEntry({ relativePath: 'a', artifactClass: 'runtime', sha256: H_A }),
    ]
    const inventory = createRuntimePackageInventory({ engineId: 'test' }, files)
    const result = validateRuntimePackageInventory(inventory as unknown)
    expect(result.ok).toBe(true)
  })

  it('rejects non-hex sha256-shaped hash', () => {
    const files: PackageFileEntry[] = [
      createPackageFileEntry({ relativePath: 'a', artifactClass: 'runtime', sha256: 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz' }),
    ]
    const inventory = createRuntimePackageInventory({ engineId: 'test' }, files)
    const result = validateRuntimePackageInventory(inventory as unknown)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.field.includes('sha256'))).toBe(true)
    }
  })

  it('rejects short sha256-shaped hash', () => {
    const files: PackageFileEntry[] = [
      createPackageFileEntry({ relativePath: 'a', artifactClass: 'runtime', sha256: 'abc123' }),
    ]
    const inventory = createRuntimePackageInventory({ engineId: 'test' }, files)
    const result = validateRuntimePackageInventory(inventory as unknown)
    expect(result.ok).toBe(false)
  })

  it('accepts null sha256 (hash not yet computed)', () => {
    const files: PackageFileEntry[] = [
      createPackageFileEntry({ relativePath: 'a', artifactClass: 'runtime', sha256: null }),
    ]
    const inventory = createRuntimePackageInventory({ engineId: 'test' }, files)
    const result = validateRuntimePackageInventory(inventory as unknown)
    expect(result.ok).toBe(true)
  })
})

describe('P5-E4 builtin engines smoke', () => {
  it('all four builtin stubs pass health check with fake runner', async () => {
    const registry = createExternalEngineRegistry()
    registry.registerBuiltInEngineDefinitions()

    for (const id of ['tika', 'libreoffice', 'ffprobe', 'pandoc'] as const) {
      const updated = await runEngineHealthCheck({
        registry,
        engineId: id,
        runner: async () => ({ status: 'healthy', reason: null, detail: null }),
      })
      expect(updated.healthStatus).toBe('healthy')
    }
  })

  it('builtin engines are trust-verified by isEngineTrustVerified', () => {
    expect(isEngineTrustVerified({ kind: 'builtin' })).toBe(true)
  })

  it('plugin engines with no verificationStatus are NOT trust-verified', () => {
    expect(isEngineTrustVerified({ kind: 'plugin' })).toBe(false)
  })
})
