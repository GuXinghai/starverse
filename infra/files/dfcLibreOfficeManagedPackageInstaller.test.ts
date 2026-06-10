import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getDfcLibreOfficeManagedRuntimeRoot, type DfcOfficePdfRuntimeManifest } from './dfcManagedLibreOfficeRuntime'
import {
  importDfcLibreOfficeManagedRuntimePackage,
  quarantineDfcLibreOfficeManagedRuntimePackage,
  repairDfcLibreOfficeManagedRuntimePackage,
  rollbackDfcLibreOfficeManagedRuntimePackage,
  updateDfcLibreOfficeManagedRuntimePackage,
} from './dfcLibreOfficeManagedPackageInstaller'

describe('dfc LibreOffice managed package installer scaffold', () => {
  it('imports a valid managed runtime into the active root and preserves previous known-good metadata', async () => {
    const appRoot = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-install-app-'))
    const first = await createRuntime('24.8.0')
    const second = await createRuntime('25.8.7')

    const firstResult = await importDfcLibreOfficeManagedRuntimePackage({
      appManagedRootDir: appRoot,
      sourceRuntimeRootDir: first.root,
      expectedArtifactSha256: first.artifactSha256,
    })
    expect(firstResult.ok).toBe(true)
    expect(firstResult).toMatchObject({
      activeRuntimeRootDir: getDfcLibreOfficeManagedRuntimeRoot(appRoot),
      previousKnownGood: null,
      pluginManagement: {
        operation: 'import',
        installKind: 'imported_dev_artifact',
        productionApproved: false,
        activeRuntimeRef: 'managed_runtime_root',
        bridge: expect.objectContaining({
          pluginId: 'libreoffice',
          engineId: 'libreoffice',
          runtimeId: 'libreoffice-office-pdf',
          installed: true,
          enabled: true,
          source: 'fake_seam',
          productionApproved: false,
          experimental: true,
        }),
        verification: {
          layoutContract: expect.objectContaining({
            layoutVersion: '1',
            manifestRelativePath: 'manifest.json',
            productionApproved: false,
            sourcePolicy: expect.objectContaining({
              importedDevArtifactAllowed: true,
              systemPathFallbackAllowed: false,
            }),
          }),
          manifestValidated: true,
          artifactHashVerified: true,
          executableHashVerified: true,
          packageMetadataVerified: true,
          securityPolicyVerified: true,
        },
      },
      diagnostics: [],
    })

    const secondResult = await importDfcLibreOfficeManagedRuntimePackage({
      appManagedRootDir: appRoot,
      sourceRuntimeRootDir: second.root,
      expectedArtifactSha256: second.artifactSha256,
    })
    expect(secondResult.ok).toBe(true)
    expect(secondResult).toMatchObject({
      activeRuntimeRootDir: getDfcLibreOfficeManagedRuntimeRoot(appRoot),
      runtime: expect.objectContaining({
        libreOfficeVersion: '25.8.7',
      }),
      previousKnownGood: expect.objectContaining({
        libreOfficeVersion: '24.8.0',
        revoked: false,
      }),
      diagnostics: [],
    })
    expect(JSON.stringify(secondResult.diagnostics)).not.toContain(appRoot)
    expect(JSON.stringify(secondResult.diagnostics)).not.toContain(first.root)
    expect(JSON.stringify(secondResult.diagnostics)).not.toContain(second.root)
    expect(JSON.stringify(secondResult.pluginManagement)).not.toContain(appRoot)
    expect(JSON.stringify(secondResult.pluginManagement)).not.toContain(second.root)
  })

  it('rejects artifact hash mismatch and cleans failed staging without activating a runtime', async () => {
    const appRoot = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-install-hash-'))
    const source = await createRuntime('25.8.7')

    const result = await importDfcLibreOfficeManagedRuntimePackage({
      appManagedRootDir: appRoot,
      sourceRuntimeRootDir: source.root,
      expectedArtifactSha256: 'f'.repeat(64),
    })

    expect(result).toMatchObject({
      ok: false,
      activeRuntimeRootDir: null,
      pluginManagement: {
        operation: 'import',
        installKind: 'imported_dev_artifact',
        productionApproved: false,
        bridge: expect.objectContaining({
          installed: false,
          enabled: false,
          productCode: 'conversion_engine_unhealthy',
        }),
        verification: {
          layoutContract: expect.objectContaining({
            layoutVersion: '1',
            manifestRelativePath: 'manifest.json',
          }),
          manifestValidated: true,
          artifactHashVerified: false,
          executableHashVerified: false,
          packageMetadataVerified: false,
          securityPolicyVerified: false,
        },
      },
      diagnostics: [expect.objectContaining({ code: 'office_pdf_install_artifact_hash_mismatch' })],
    })
    expect(JSON.stringify(result)).not.toContain(source.root)
    expect(JSON.stringify(result)).not.toContain(source.artifactSha256)
  })

  it('rejects missing or invalid manifests with sanitized diagnostics', async () => {
    const appRoot = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-install-invalid-app-'))
    const source = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-install-invalid-source-'))

    const result = await importDfcLibreOfficeManagedRuntimePackage({
      appManagedRootDir: appRoot,
      sourceRuntimeRootDir: source,
    })

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_install_manifest_invalid' })],
    })
    expect(JSON.stringify(result)).not.toContain(source)
  })

  it('rejects runtime gate failures including executable path escape and incomplete metadata', async () => {
    const appRoot = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-install-gate-app-'))
    const escaped = await createRuntime('25.8.7', { executablePath: '../outside/soffice' })
    const incomplete = await createRuntime('25.8.7', { licenseId: null })

    const escapedResult = await importDfcLibreOfficeManagedRuntimePackage({
      appManagedRootDir: appRoot,
      sourceRuntimeRootDir: escaped.root,
    })
    expect(escapedResult).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_install_runtime_unavailable' })],
    })
    expect(JSON.stringify(escapedResult)).not.toContain('../outside/soffice')

    const incompleteResult = await importDfcLibreOfficeManagedRuntimePackage({
      appManagedRootDir: appRoot,
      sourceRuntimeRootDir: incomplete.root,
    })
    expect(incompleteResult).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_install_runtime_unavailable' })],
    })
    expect(JSON.stringify(incompleteResult)).not.toContain('MPL-2.0')
  })

  it('rejects revoked imports and revoked rollback targets', async () => {
    const appRoot = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-install-revoked-'))
    const source = await createRuntime('25.8.7')

    const importResult = await importDfcLibreOfficeManagedRuntimePackage({
      appManagedRootDir: appRoot,
      sourceRuntimeRootDir: source.root,
      packageRevoked: true,
    })
    expect(importResult).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_install_revoked' })],
    })

    const rollback = await rollbackDfcLibreOfficeManagedRuntimePackage({
      appManagedRootDir: appRoot,
      previousKnownGood: {
        managedRuntimeRootDir: source.root,
        packageVersion: '25.8.7-test',
        libreOfficeVersion: '25.8.7',
        revoked: true,
      },
    })
    expect(rollback).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_rollback_target_revoked' })],
    })
    expect(JSON.stringify(rollback)).not.toContain(source.root)
  })

  it('rolls back only to a valid previous known-good runtime', async () => {
    const appRoot = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-install-rollback-'))
    const first = await createRuntime('24.8.0')
    const second = await createRuntime('25.8.7')
    await importDfcLibreOfficeManagedRuntimePackage({ appManagedRootDir: appRoot, sourceRuntimeRootDir: first.root })
    const secondResult = await importDfcLibreOfficeManagedRuntimePackage({ appManagedRootDir: appRoot, sourceRuntimeRootDir: second.root })
    expect(secondResult.ok).toBe(true)
    if (!secondResult.ok) return

    const rollback = await rollbackDfcLibreOfficeManagedRuntimePackage({
      appManagedRootDir: appRoot,
      previousKnownGood: secondResult.previousKnownGood,
    })

    expect(rollback).toMatchObject({
      ok: true,
      activeRuntimeRootDir: getDfcLibreOfficeManagedRuntimeRoot(appRoot),
      runtime: expect.objectContaining({
        libreOfficeVersion: '24.8.0',
      }),
      diagnostics: [],
    })
  })

  it('updates only to a verified existing runtime package', async () => {
    const appRoot = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-update-'))
    const first = await createRuntime('24.8.0')
    const second = await createRuntime('25.8.7')
    await importDfcLibreOfficeManagedRuntimePackage({ appManagedRootDir: appRoot, sourceRuntimeRootDir: first.root })

    const update = await updateDfcLibreOfficeManagedRuntimePackage({
      appManagedRootDir: appRoot,
      targetRuntimeRootDir: second.root,
      expectedArtifactSha256: second.artifactSha256,
    })

    expect(update).toMatchObject({
      ok: true,
      operation: 'update',
      activeRuntimeRootDir: getDfcLibreOfficeManagedRuntimeRoot(appRoot),
      runtime: expect.objectContaining({ libreOfficeVersion: '25.8.7' }),
      previousKnownGood: expect.objectContaining({ libreOfficeVersion: '24.8.0' }),
      lifecycleState: expect.objectContaining({
        quarantine: null,
      }),
      pluginManagement: {
        productionApproved: false,
        bridge: expect.objectContaining({
          installed: true,
          enabled: true,
          productionApproved: false,
        }),
      },
      diagnostics: [],
    })
    expect(JSON.stringify(update)).not.toContain(appRoot)
    expect(JSON.stringify(update)).not.toContain(second.root)
  })

  it('rejects update targets that are missing, invalid, or quarantined', async () => {
    const appRoot = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-update-reject-'))
    const missing = path.join(appRoot, 'missing-target')
    const invalid = await createRuntime('25.8.7', { licenseId: null })

    const missingResult = await updateDfcLibreOfficeManagedRuntimePackage({
      appManagedRootDir: appRoot,
      targetRuntimeRootDir: missing,
    })
    expect(missingResult).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_update_target_missing' })],
      pluginManagement: {
        bridge: expect.objectContaining({
          lifecycleStatus: 'missing',
          productCode: 'conversion_engine_missing',
        }),
      },
    })

    const invalidResult = await updateDfcLibreOfficeManagedRuntimePackage({
      appManagedRootDir: appRoot,
      targetRuntimeRootDir: invalid.root,
    })
    expect(invalidResult).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_update_target_invalid' })],
      pluginManagement: {
        bridge: expect.objectContaining({
          lifecycleStatus: 'unhealthy',
          productCode: 'conversion_engine_unhealthy',
        }),
      },
    })

    const quarantinedResult = await updateDfcLibreOfficeManagedRuntimePackage({
      appManagedRootDir: appRoot,
      targetRuntimeRootDir: invalid.root,
      targetQuarantined: true,
    })
    expect(quarantinedResult).toMatchObject({
      ok: false,
      lifecycleState: {
        quarantine: expect.objectContaining({
          quarantined: true,
          internalCode: 'office_pdf_runtime_quarantined',
        }),
      },
      diagnostics: [expect.objectContaining({ code: 'office_pdf_update_target_quarantined' })],
      pluginManagement: {
        bridge: expect.objectContaining({
          lifecycleStatus: 'blocked',
          healthStatus: 'blocked',
          productCode: 'conversion_sandbox_denied',
          internalCode: 'office_pdf_runtime_quarantined',
          installed: false,
          enabled: false,
          productionApproved: false,
        }),
      },
    })
    expect(JSON.stringify(quarantinedResult)).not.toContain(invalid.root)
  })

  it('rejects rollback without a known-good target or with a quarantined target', async () => {
    const appRoot = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-rollback-reject-'))
    const previous = await createRuntime('24.8.0')

    const missing = await rollbackDfcLibreOfficeManagedRuntimePackage({
      appManagedRootDir: appRoot,
      previousKnownGood: null,
    })
    expect(missing).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_rollback_target_missing' })],
    })

    const quarantined = await rollbackDfcLibreOfficeManagedRuntimePackage({
      appManagedRootDir: appRoot,
      previousKnownGood: {
        managedRuntimeRootDir: previous.root,
        packageVersion: '24.8.0-test',
        libreOfficeVersion: '24.8.0',
        revoked: false,
      },
      previousKnownGoodQuarantined: true,
    })
    expect(quarantined).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_rollback_target_quarantined' })],
    })
    expect(JSON.stringify(quarantined)).not.toContain(previous.root)
  })

  it('quarantines active runtime as blocked and not production healthy', async () => {
    const appRoot = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-quarantine-'))
    const source = await createRuntime('25.8.7')
    await importDfcLibreOfficeManagedRuntimePackage({ appManagedRootDir: appRoot, sourceRuntimeRootDir: source.root })

    const result = await quarantineDfcLibreOfficeManagedRuntimePackage({
      appManagedRootDir: appRoot,
      reason: `owner policy denied ${appRoot}`,
      actor: 'owner',
      now: '2026-06-11T00:00:00.000Z',
    })

    expect(result).toMatchObject({
      ok: true,
      operation: 'quarantine',
      lifecycleState: {
        activeRuntimeRootDir: getDfcLibreOfficeManagedRuntimeRoot(appRoot),
        quarantine: expect.objectContaining({
          quarantined: true,
          productCode: 'conversion_sandbox_denied',
          internalCode: 'office_pdf_runtime_quarantined',
          quarantinedAt: '2026-06-11T00:00:00.000Z',
          actor: 'owner',
        }),
      },
      pluginManagement: {
        bridge: expect.objectContaining({
          lifecycleStatus: 'blocked',
          healthStatus: 'blocked',
          source: 'quarantined_runtime',
          installed: false,
          enabled: false,
          productionApproved: false,
        }),
      },
      diagnostics: [expect.objectContaining({ code: 'office_pdf_quarantine_applied' })],
    })
    expect(JSON.stringify(result)).not.toContain(appRoot)
    expect(JSON.stringify(result)).not.toContain(source.root)
  })

  it('repairs by revalidating layout without bypassing active quarantine', async () => {
    const appRoot = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-repair-'))
    const source = await createRuntime('25.8.7')
    await importDfcLibreOfficeManagedRuntimePackage({ appManagedRootDir: appRoot, sourceRuntimeRootDir: source.root })
    const quarantine = await quarantineDfcLibreOfficeManagedRuntimePackage({
      appManagedRootDir: appRoot,
      reason: 'owner quarantine',
    })

    const retained = await repairDfcLibreOfficeManagedRuntimePackage({
      appManagedRootDir: appRoot,
      quarantine: quarantine.lifecycleState.quarantine,
    })
    expect(retained).toMatchObject({
      ok: true,
      operation: 'repair',
      repairStatus: 'quarantine_retained',
      lifecycleState: {
        quarantine: expect.objectContaining({
          quarantined: true,
        }),
      },
      pluginManagement: {
        bridge: expect.objectContaining({
          lifecycleStatus: 'blocked',
          healthStatus: 'blocked',
          internalCode: 'office_pdf_runtime_quarantined',
          productionApproved: false,
        }),
      },
      diagnostics: [expect.objectContaining({ code: 'office_pdf_repair_quarantine_retained' })],
    })

    const repaired = await repairDfcLibreOfficeManagedRuntimePackage({ appManagedRootDir: appRoot })
    expect(repaired).toMatchObject({
      ok: true,
      repairStatus: 'repaired',
      pluginManagement: {
        bridge: expect.objectContaining({
          lifecycleStatus: 'experimental',
          installed: true,
          enabled: true,
          productionApproved: false,
        }),
      },
      diagnostics: [expect.objectContaining({ code: 'office_pdf_repair_verified' })],
    })
    expect(JSON.stringify(retained)).not.toContain(appRoot)
    expect(JSON.stringify(repaired)).not.toContain(source.root)
  })

  it('reports repair failures without activating or inventing a runtime', async () => {
    const appRoot = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-repair-missing-'))

    const result = await repairDfcLibreOfficeManagedRuntimePackage({ appManagedRootDir: appRoot })

    expect(result).toMatchObject({
      ok: false,
      repairStatus: 'missing_runtime',
      pluginManagement: {
        bridge: expect.objectContaining({
          lifecycleStatus: 'missing',
          productCode: 'conversion_engine_missing',
          installed: false,
          enabled: false,
        }),
      },
      diagnostics: [expect.objectContaining({ code: 'office_pdf_repair_missing_runtime' })],
    })
    expect(JSON.stringify(result)).not.toContain(appRoot)
  })

  it('rejects symlink escape content during import', async () => {
    const appRoot = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-install-symlink-app-'))
    const source = await createRuntime('25.8.7')
    const outside = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-install-symlink-outside-'))
    try {
      await symlink(outside, path.join(source.root, 'program', 'escape'), 'dir')
    } catch (error) {
      expect(String((error as any)?.code ?? '')).toMatch(/EPERM|EACCES|ENOTSUP|UNKNOWN/)
      return
    }

    const result = await importDfcLibreOfficeManagedRuntimePackage({
      appManagedRootDir: appRoot,
      sourceRuntimeRootDir: source.root,
    })

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_install_path_rejected' })],
    })
    expect(JSON.stringify(result)).not.toContain(outside)
  })

  it('maps imported development artifacts into Plugin Management import semantics without production approval', async () => {
    const appRoot = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-install-dev-import-'))
    const source = await createRuntime('25.8.7', {
      pluginVersion: '25.8.7-dev',
      packageVersion: '25.8.7-dev-package',
      officialRelease: {
        sourceKind: 'development',
        packageRef: 'dev/libreoffice-dev.zip',
        releaseTag: 'dev-libreoffice',
        provenance: 'starverse-dev-import',
      },
    })

    const result = await importDfcLibreOfficeManagedRuntimePackage({
      appManagedRootDir: appRoot,
      sourceRuntimeRootDir: source.root,
    })

    expect(result).toMatchObject({
      ok: true,
      pluginManagement: {
        installKind: 'imported_dev_artifact',
        productionApproved: false,
        bridge: expect.objectContaining({
          source: 'imported_dev_artifact',
          lifecycleStatus: 'experimental',
          installed: true,
          enabled: true,
          productionApproved: false,
          runtime: expect.objectContaining({
            pluginId: 'libreoffice',
            runtimeId: 'libreoffice-office-pdf',
            manifestHashPrefix: expect.stringMatching(/^[a-f0-9]{12}$/u),
            executableRef: 'managed_relative_executable',
          }),
        }),
      },
    })
    expect(JSON.stringify(result.pluginManagement)).not.toContain(source.root)
  })
})

async function createRuntime(
  libreOfficeVersion: string,
  overrides: Partial<DfcOfficePdfRuntimeManifest> = {}
): Promise<Readonly<{ root: string; artifactSha256: string }>> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-runtime-source-'))
  const executable = Buffer.from(`fake soffice executable ${libreOfficeVersion}`)
  const executableName = process.platform === 'win32' ? 'soffice.exe' : 'soffice'
  await mkdir(path.join(root, 'program'), { recursive: true })
  await writeFile(path.join(root, 'program', executableName), executable)
  const executableSha256 = createHash('sha256').update(executable).digest('hex')
  const artifactSha256 = createHash('sha256').update(`artifact ${libreOfficeVersion}`).digest('hex')
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify({
    manifestSchemaVersion: '1',
    pluginId: 'libreoffice',
    packageId: 'starverse.dfc.libreoffice',
    runtimePackageId: 'starverse.dfc.libreoffice',
    engineId: 'libreoffice',
    runtimeId: 'libreoffice-office-pdf',
    displayName: 'LibreOffice Office PDF',
    pluginVersion: `${libreOfficeVersion}-test`,
    runtimeKind: 'managed_external_process',
    enabled: true,
    platform: process.platform,
    arch: process.arch,
    capabilities: ['office_to_pdf', 'docx_to_pdf'],
    executablePath: `program/${executableName}`,
    libreOfficeVersion,
    packageVersion: `${libreOfficeVersion}-test-package`,
    artifactSha256,
    executableSha256,
    executableSizeBytes: executable.byteLength,
    provenance: 'starverse-test-fixture',
    licenseId: 'MPL-2.0',
    attribution: 'The Document Foundation LibreOffice',
    notices: ['LibreOffice test fixture attribution'],
    minimumStarverseContractVersion: '1',
    officialRelease: {
      sourceKind: 'test_fixture',
      packageRef: 'fixtures/libreoffice-test.zip',
      releaseTag: `test-libreoffice-${libreOfficeVersion}`,
      provenance: 'starverse-test-fixture',
    },
    securityPolicy: {
      macrosDisabled: true,
      networkDisabled: true,
      externalLinksDisabled: true,
      embeddedObjectExecutionDisabled: true,
      isolatedProfileRequired: true,
    },
    ...overrides,
  }))
  return { root, artifactSha256 }
}

