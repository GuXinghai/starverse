import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DFC_OFFICE_PDF_CAPABILITIES,
  DFC_OFFICE_PDF_ENGINE_ID,
  DFC_OFFICE_PDF_PLUGIN_MANAGEMENT_CAPABILITY_ID,
  DFC_OFFICE_PDF_PLUGIN_ID,
  DFC_OFFICE_PDF_PLUGIN_PROVIDER,
  DFC_OFFICE_PDF_RUNTIME_ID,
  DFC_OFFICE_PDF_RUNTIME_KIND,
  DFC_OFFICE_PDF_RUNTIME_PACKAGE_ID,
  DFC_LIBREOFFICE_WINDOWS_X64_PRODUCTION_APPROVAL,
  checkDfcLibreOfficeRuntimeAvailability,
  checkDfcLibreOfficeRuntimeAvailabilitySync,
  createDfcLibreOfficeQuarantinedAvailabilitySummary,
  createDfcLibreOfficeTrustBlockedAvailabilitySummary,
  getDfcLibreOfficeFirstPartyRuntimeCatalogEntry,
  getDfcLibreOfficeRuntimePackageLayoutContract,
  resolveDfcLibreOfficePluginManagedRuntimeHandle,
  toDfcLibreOfficeManagedEnginePluginManifest,
  toDfcLibreOfficePluginLifecycleBridge,
  type DfcOfficePdfRuntimeManifest,
} from './dfcManagedLibreOfficeRuntime'

describe('dfc managed LibreOffice runtime gate', () => {
  it('reports a symbolic missing diagnostic when the managed runtime manifest is absent', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-runtime-missing-'))

    const result = await checkDfcLibreOfficeRuntimeAvailability({ managedRuntimeRootDir: root })

    expect(result).toMatchObject({
      ok: false,
      runtime: null,
      summary: expect.objectContaining({
        status: 'unavailable',
        healthStatus: 'missing',
        productCode: 'conversion_engine_missing',
        internalCode: 'office_pdf_runtime_missing',
        retryable: true,
        recoverable: true,
        source: 'missing_manifest',
        runtime: null,
      }),
      diagnostics: [expect.objectContaining({ code: 'office_pdf_runtime_missing' })],
    })
    expect(JSON.stringify(result)).not.toContain(root)
  })

  it('accepts a fake manifest only when executable and required metadata are managed and complete', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-runtime-ok-'))
    const executable = Buffer.from('fake soffice executable')
    await mkdir(path.join(root, 'program'), { recursive: true })
    await writeFile(path.join(root, 'program', process.platform === 'win32' ? 'soffice.exe' : 'soffice'), executable)
    await writeManifest(root, {
      executablePath: process.platform === 'win32' ? 'program/soffice.exe' : 'program/soffice',
      executableSha256: createHash('sha256').update(executable).digest('hex'),
      executableSizeBytes: executable.byteLength,
    })

    const result = await checkDfcLibreOfficeRuntimeAvailability({ managedRuntimeRootDir: root })

    expect(result).toMatchObject({
      ok: true,
      summary: expect.objectContaining({
        status: 'experimental',
        healthStatus: 'healthy',
        productCode: null,
        internalCode: null,
        source: 'fake_seam',
        runtime: expect.objectContaining({
          pluginId: DFC_OFFICE_PDF_PLUGIN_ID,
          engineId: DFC_OFFICE_PDF_ENGINE_ID,
          runtimeId: DFC_OFFICE_PDF_RUNTIME_ID,
          packageVersion: '2026.06.01',
          libreOfficeVersion: '24.8.0',
          executableRef: 'managed_relative_executable',
        }),
      }),
      runtime: expect.objectContaining({
        packageId: DFC_OFFICE_PDF_RUNTIME_PACKAGE_ID,
        pluginId: DFC_OFFICE_PDF_PLUGIN_ID,
        runtimePackageId: DFC_OFFICE_PDF_RUNTIME_PACKAGE_ID,
        engineId: DFC_OFFICE_PDF_ENGINE_ID,
        runtimeId: DFC_OFFICE_PDF_RUNTIME_ID,
        displayName: 'LibreOffice Office PDF',
        pluginVersion: '0.1.0',
        runtimeKind: DFC_OFFICE_PDF_RUNTIME_KIND,
        platform: process.platform,
        arch: process.arch,
        capabilities: [...DFC_OFFICE_PDF_CAPABILITIES],
        libreOfficeVersion: '24.8.0',
        packageVersion: '2026.06.01',
        minimumStarverseContractVersion: '1',
        provenance: 'starverse-test-fixture',
        licenseId: 'MPL-2.0',
        attribution: 'The Document Foundation LibreOffice',
        officialRelease: expect.objectContaining({
          sourceKind: 'test_fixture',
          packageRef: 'fixtures/libreoffice-test.zip',
        }),
      }),
      diagnostics: [],
    })
    expect(result.summary.runtime?.manifestHashPrefix).toMatch(/^[a-f0-9]{12}$/)
    expect(JSON.stringify(result)).not.toContain(root)
    expect(JSON.stringify(result)).not.toContain('program/soffice')
    expect(JSON.stringify(result)).not.toContain('fake soffice executable')
  })

  it('maps a fake managed plugin runtime into the external engine registry manifest contract', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-runtime-registry-'))
    const executable = Buffer.from('fake soffice executable')
    await mkdir(path.join(root, 'program'), { recursive: true })
    await writeFile(path.join(root, 'program', process.platform === 'win32' ? 'soffice.exe' : 'soffice'), executable)
    await writeManifest(root, {
      executablePath: process.platform === 'win32' ? 'program/soffice.exe' : 'program/soffice',
      executableSha256: createHash('sha256').update(executable).digest('hex'),
      executableSizeBytes: executable.byteLength,
    })

    const availability = await checkDfcLibreOfficeRuntimeAvailability({ managedRuntimeRootDir: root })
    expect(availability.ok).toBe(true)
    if (!availability.ok) return

    const registryManifest = toDfcLibreOfficeManagedEnginePluginManifest(availability.runtime)

    expect(registryManifest).toMatchObject({
      id: DFC_OFFICE_PDF_ENGINE_ID,
      displayName: 'LibreOffice Office PDF',
      version: '0.1.0',
      kind: 'plugin',
      platform: process.platform,
      capabilities: ['document_conversion'],
      supportedFormatIds: ['docx'],
      supportedMimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      sandbox: { enabled: true },
      network: { allowed: false },
    })
    expect(JSON.stringify(registryManifest)).not.toContain(root)
    expect(JSON.stringify(registryManifest)).not.toContain('fake soffice executable')
  })

  it('fails closed when the managed plugin runtime is disabled', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-runtime-disabled-'))
    await writeManifest(root, { enabled: false })

    const byManifest = await checkDfcLibreOfficeRuntimeAvailability({ managedRuntimeRootDir: root })
    expect(byManifest).toMatchObject({
      ok: false,
      summary: expect.objectContaining({
        status: 'blocked',
        healthStatus: 'blocked',
        productCode: 'conversion_sandbox_denied',
        internalCode: 'office_pdf_runtime_disabled',
        source: 'disabled_policy',
      }),
      diagnostics: [expect.objectContaining({ code: 'office_pdf_runtime_disabled' })],
    })
    expect(JSON.stringify(byManifest)).not.toContain(root)

    const byRegistryState = await checkDfcLibreOfficeRuntimeAvailability({
      managedRuntimeRootDir: root,
      pluginEnabled: false,
    })
    expect(byRegistryState).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_runtime_disabled' })],
    })
    expect(JSON.stringify(byRegistryState)).not.toContain(root)
  })

  it('reports missing executable separately from metadata and path failures', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-runtime-exe-missing-'))
    await writeManifest(root, {
      executablePath: process.platform === 'win32' ? 'program/missing-soffice.exe' : 'program/missing-soffice',
      executableSha256: 'b'.repeat(64),
      executableSizeBytes: 123,
    })

    const result = await checkDfcLibreOfficeRuntimeAvailability({ managedRuntimeRootDir: root })

    expect(result).toMatchObject({
      ok: false,
      summary: expect.objectContaining({
        status: 'unavailable',
        healthStatus: 'unhealthy',
        productCode: 'conversion_engine_unhealthy',
        internalCode: 'office_pdf_runtime_executable_missing',
      }),
      diagnostics: [expect.objectContaining({ code: 'office_pdf_runtime_executable_missing' })],
    })
    expect(JSON.stringify(result)).not.toContain('program/missing-soffice')
    expect(JSON.stringify(result)).not.toContain(root)
  })

  it.each([
    ['traversal', '../outside/soffice'],
    ['unc', '\\\\server\\share\\soffice.exe'],
    ['nul', 'program/soffice\u0000.exe'],
    ['drive', 'C:\\Users\\private\\soffice.exe'],
  ])('rejects %s executable paths without leaking the raw path', async (_name, executablePath) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-runtime-reject-'))
    await writeManifest(root, { executablePath })

    const result = await checkDfcLibreOfficeRuntimeAvailability({ managedRuntimeRootDir: root })

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_runtime_path_rejected' })],
    })
    expect(JSON.stringify(result)).not.toContain(executablePath)
    expect(JSON.stringify(result)).not.toContain(root)
  })

  it('rejects symlinked executable paths that resolve outside the managed root', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-runtime-symlink-root-'))
    const outside = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-runtime-symlink-outside-'))
    const executable = Buffer.from('external fake soffice executable')
    await writeFile(path.join(outside, 'soffice'), executable)
    await mkdir(path.join(root, 'program'), { recursive: true })
    try {
      await symlink(path.join(outside, 'soffice'), path.join(root, 'program', 'soffice'), 'file')
    } catch (error) {
      expect(String((error as any)?.code ?? '')).toMatch(/EPERM|EACCES|ENOTSUP|UNKNOWN/)
      return
    }
    await writeManifest(root, {
      executablePath: 'program/soffice',
      executableSha256: createHash('sha256').update(executable).digest('hex'),
      executableSizeBytes: executable.byteLength,
    })

    const result = await checkDfcLibreOfficeRuntimeAvailability({ managedRuntimeRootDir: root })

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_runtime_path_rejected' })],
    })
    expect(JSON.stringify(result)).not.toContain(root)
    expect(JSON.stringify(result)).not.toContain(outside)
    expect(JSON.stringify(result)).not.toContain('external fake soffice executable')
  })

  it('rejects invalid manifest shape and unsupported platform without raw manifest leakage', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-runtime-invalid-'))
    await writeFile(path.join(root, 'manifest.json'), JSON.stringify({
      engineId: DFC_OFFICE_PDF_ENGINE_ID,
      runtimeId: DFC_OFFICE_PDF_RUNTIME_ID,
      platform: process.platform,
      executablePath: 'program/soffice',
      libreOfficeVersion: '24.8.0',
      packageVersion: '2026.06.01',
      executableSha256: 'not-a-full-hash',
      licenseId: 'LICENSE BODY SECRET',
    }))

    const invalid = await checkDfcLibreOfficeRuntimeAvailability({ managedRuntimeRootDir: root })
    expect(invalid).toMatchObject({
      ok: false,
      summary: expect.objectContaining({
        productCode: 'conversion_engine_unhealthy',
        internalCode: 'office_pdf_runtime_manifest_invalid',
      }),
      diagnostics: [expect.objectContaining({ code: 'office_pdf_runtime_manifest_invalid' })],
    })
    expect(JSON.stringify(invalid)).not.toContain('not-a-full-hash')
    expect(JSON.stringify(invalid)).not.toContain('LICENSE BODY SECRET')

    await writeManifest(root, { platform: 'unsupported-platform' })
    const unsupported = await checkDfcLibreOfficeRuntimeAvailability({ managedRuntimeRootDir: root })
    expect(unsupported).toMatchObject({
      ok: false,
      summary: expect.objectContaining({
        status: 'blocked',
        productCode: 'conversion_sandbox_denied',
        internalCode: 'office_pdf_runtime_platform_unsupported',
        recoverable: false,
      }),
      diagnostics: [expect.objectContaining({ code: 'office_pdf_runtime_platform_unsupported' })],
    })
  })

  it('enforces platform-specific executable path policy without requiring real platform binaries', async () => {
    const winRoot = await runtimeWithExecutableForPlatform('win32', 'program/soffice.exe')
    const win = await checkDfcLibreOfficeRuntimeAvailability({
      managedRuntimeRootDir: winRoot.root,
      platform: 'win32',
      arch: process.arch,
    })
    expect(win.ok).toBe(true)

    const darwinRoot = await runtimeWithExecutableForPlatform('darwin', 'LibreOffice.app/Contents/MacOS/soffice')
    const darwin = await checkDfcLibreOfficeRuntimeAvailability({
      managedRuntimeRootDir: darwinRoot.root,
      platform: 'darwin',
      arch: process.arch,
    })
    expect(darwin.ok).toBe(true)

    const linuxRoot = await runtimeWithExecutableForPlatform('linux', 'program/soffice')
    const linux = await checkDfcLibreOfficeRuntimeAvailability({
      managedRuntimeRootDir: linuxRoot.root,
      platform: 'linux',
      arch: process.arch,
    })
    expect(linux.ok).toBe(true)

    const invalidWinRoot = await runtimeWithExecutableForPlatform('win32', 'program/soffice')
    const invalidWin = await checkDfcLibreOfficeRuntimeAvailability({
      managedRuntimeRootDir: invalidWinRoot.root,
      platform: 'win32',
      arch: process.arch,
    })
    expect(invalidWin).toMatchObject({
      ok: false,
      summary: expect.objectContaining({
        productCode: 'conversion_sandbox_denied',
        internalCode: 'office_pdf_runtime_path_rejected',
      }),
    })
    expect(JSON.stringify(invalidWin)).not.toContain(invalidWinRoot.root)
    expect(JSON.stringify(invalidWin)).not.toContain('program/soffice')
  })

  it('rejects packages with incomplete provenance, license, capability, or security policy metadata', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-runtime-metadata-'))
    await mkdir(path.join(root, 'program'), { recursive: true })
    await writeFile(path.join(root, 'program', 'soffice'), Buffer.from('fake soffice executable'))
    await writeManifest(root, {
      executablePath: 'program/soffice',
      executableSha256: null,
      executableSizeBytes: null,
      provenance: null,
      capabilities: ['office_to_pdf'],
      securityPolicy: {
        macrosDisabled: true,
        networkDisabled: false,
        externalLinksDisabled: true,
        embeddedObjectExecutionDisabled: true,
        isolatedProfileRequired: true,
      },
    })

    const result = await checkDfcLibreOfficeRuntimeAvailability({ managedRuntimeRootDir: root })

    expect(result).toMatchObject({
      ok: false,
      summary: expect.objectContaining({
        productCode: 'conversion_engine_unhealthy',
        internalCode: 'office_pdf_runtime_metadata_incomplete',
      }),
      diagnostics: [expect.objectContaining({ code: 'office_pdf_runtime_metadata_incomplete' })],
    })
    expect(JSON.stringify(result)).not.toContain(root)
    expect(JSON.stringify(result)).not.toContain('fake soffice executable')
  })

  it('exposes a stable Plugin Management identity bridge from the runtime summary', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-runtime-plugin-id-'))
    const executable = Buffer.from('fake soffice executable')
    await mkdir(path.join(root, 'program'), { recursive: true })
    await writeFile(path.join(root, 'program', process.platform === 'win32' ? 'soffice.exe' : 'soffice'), executable)
    await writeManifest(root, {
      executablePath: process.platform === 'win32' ? 'program/soffice.exe' : 'program/soffice',
      executableSha256: createHash('sha256').update(executable).digest('hex'),
      executableSizeBytes: executable.byteLength,
    })

    const availability = checkDfcLibreOfficeRuntimeAvailabilitySync({ managedRuntimeRootDir: root })
    const bridge = toDfcLibreOfficePluginLifecycleBridge(availability.summary)

    expect(bridge).toMatchObject({
      pluginId: DFC_OFFICE_PDF_PLUGIN_ID,
      engineId: DFC_OFFICE_PDF_ENGINE_ID,
      runtimeId: DFC_OFFICE_PDF_RUNTIME_ID,
      provider: DFC_OFFICE_PDF_PLUGIN_PROVIDER,
      lifecycleStatus: 'experimental',
      source: 'fake_seam',
      productionApproved: false,
      experimental: true,
      installed: true,
      enabled: true,
      trust: expect.objectContaining({
        trustModel: 'owner_gated_hash_pinned_signed_catalog_required_for_production',
        trustStates: expect.arrayContaining([
          'unsigned_owner_gated',
          'hash_pinned',
          'signature_missing',
          'catalog_untrusted',
          'production_source_unapproved',
        ]),
        distributionStates: expect.arrayContaining([
          'prerelease_source_owner_gated',
          'offline_import_allowed',
          'download_disabled_by_policy',
          'system_libreoffice_disallowed',
        ]),
        packageDecision: 'candidate_production_asset_pending_signing_legal_approval',
        signatureCatalogStatus: 'signature_missing_catalog_unsigned',
        catalogSignatureStatus: 'missing',
        keyIdStatus: 'not_checked',
        revocationStatus: 'not_checked',
        expirationStatus: 'not_checked',
        rollbackEligibility: 'not_evaluated',
        productionTrustReadiness: 'blocked_signature_missing',
        ownerGatedCandidateReadiness: 'owner_gated_hash_pinned_ready',
        downloadEnabled: false,
        productionApproved: false,
      }),
    })
    expect(bridge.capabilityIds).toEqual([
      DFC_OFFICE_PDF_PLUGIN_MANAGEMENT_CAPABILITY_ID,
      ...DFC_OFFICE_PDF_CAPABILITIES,
    ])
    expect(JSON.stringify(bridge)).not.toContain(root)
    expect(JSON.stringify(bridge)).not.toContain('program/soffice')
  })

  it('resolves a plugin-managed runtime handle for the DFC adapter without exposing absolute paths in diagnostics', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-runtime-handle-'))
    const executable = Buffer.from('fake soffice executable')
    const executablePath = process.platform === 'win32' ? 'program/soffice.exe' : 'program/soffice'
    await mkdir(path.join(root, 'program'), { recursive: true })
    await writeFile(path.join(root, executablePath), executable)
    await writeManifest(root, {
      executablePath,
      executableSha256: createHash('sha256').update(executable).digest('hex'),
      executableSizeBytes: executable.byteLength,
    })

    const result = await resolveDfcLibreOfficePluginManagedRuntimeHandle({
      managedRuntimeRootDir: root,
      capabilityId: 'docx_to_pdf',
      allowExperimental: true,
    })

    expect(result).toMatchObject({
      ok: true,
      handle: expect.objectContaining({
        pluginId: DFC_OFFICE_PDF_PLUGIN_ID,
        runtimeId: DFC_OFFICE_PDF_RUNTIME_ID,
        capabilityId: 'docx_to_pdf',
        executablePath: path.join(root, executablePath),
        executableRelativePath: executablePath,
        source: 'fake_seam',
        healthStatus: 'healthy',
        productionApproved: false,
        experimental: true,
        degraded: true,
        runtimeVersion: '24.8.0',
        packageVersion: '2026.06.01',
      }),
      summary: expect.objectContaining({
        status: 'experimental',
        healthStatus: 'healthy',
      }),
      diagnostics: [],
    })
    expect(JSON.stringify(result.summary)).not.toContain(root)
    expect(JSON.stringify(result.summary)).not.toContain(executablePath)
    expect(JSON.stringify(result.diagnostics)).not.toContain(root)
  })

  it('approves only the expected official Windows x64 DOCX-to-PDF runtime for production', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-runtime-prod-win-'))
    const executable = Buffer.from('fake official soffice executable')
    const executablePath = 'program/soffice.exe'
    const catalog = getDfcLibreOfficeFirstPartyRuntimeCatalogEntry()
    await mkdir(path.join(root, 'program'), { recursive: true })
    await writeFile(path.join(root, executablePath), executable)
    await writeManifest(root, {
      platform: DFC_LIBREOFFICE_WINDOWS_X64_PRODUCTION_APPROVAL.approvedPlatform,
      arch: DFC_LIBREOFFICE_WINDOWS_X64_PRODUCTION_APPROVAL.approvedArch,
      executablePath,
      libreOfficeVersion: catalog.acquisitionSource.runtimeVersion ?? '26.2.4',
      packageVersion: catalog.acquisitionSource.packageVersion ?? '0.1.0',
      artifactSha256: catalog.acquisitionSource.expectedSha256,
      executableSha256: createHash('sha256').update(executable).digest('hex'),
      executableSizeBytes: executable.byteLength,
      officialRelease: {
        sourceKind: 'official',
        packageRef: catalog.acquisitionSource.packageRef ?? 'official-catalog-package',
        releaseTag: 'starverse-runtime-libreoffice-v0.1.0-26.2.4-win32-x64',
        provenance: 'github_release_asset',
      },
    })

    const availability = checkDfcLibreOfficeRuntimeAvailabilitySync({
      managedRuntimeRootDir: root,
      platform: 'win32',
      arch: 'x64',
    })
    expect(availability.summary).toMatchObject({
      status: 'available',
      source: 'managed_manifest',
      trust: expect.objectContaining({
        productionApproved: true,
        productionTrustReadiness: 'ready',
        packageDecision: 'approved_windows_x64_docx_to_pdf_production_asset',
        trustStates: expect.arrayContaining(['owner_approved_hash_pinned', 'hash_pinned']),
        distributionStates: expect.arrayContaining([
          'windows_x64_production_approved',
          'manual_github_release_allowed',
          'verified_offline_import_allowed',
          'download_disabled_by_policy',
        ]),
      }),
    })

    const bridge = toDfcLibreOfficePluginLifecycleBridge(availability.summary)
    expect(bridge).toMatchObject({
      lifecycleStatus: 'installed',
      productionApproved: true,
      experimental: false,
      installed: true,
      enabled: true,
    })

    const handle = await resolveDfcLibreOfficePluginManagedRuntimeHandle({
      managedRuntimeRootDir: root,
      capabilityId: 'docx_to_pdf',
      platform: 'win32',
      arch: 'x64',
      allowExperimental: false,
      productionOnly: true,
    })
    expect(handle).toMatchObject({
      ok: true,
      handle: expect.objectContaining({
        productionApproved: true,
        experimental: false,
        degraded: false,
      }),
    })
    expect(JSON.stringify(availability.summary)).not.toContain(root)
  })

  it('backfills legacy official package-prep provenance for the approved installed Windows x64 runtime', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-runtime-prod-legacy-'))
    const executable = Buffer.from('fake official soffice executable')
    const executablePath = 'program/soffice.exe'
    const catalog = getDfcLibreOfficeFirstPartyRuntimeCatalogEntry()
    await mkdir(path.join(root, 'program'), { recursive: true })
    await writeFile(path.join(root, executablePath), executable)
    await writeManifest(root, {
      platform: DFC_LIBREOFFICE_WINDOWS_X64_PRODUCTION_APPROVAL.approvedPlatform,
      arch: DFC_LIBREOFFICE_WINDOWS_X64_PRODUCTION_APPROVAL.approvedArch,
      executablePath,
      libreOfficeVersion: catalog.acquisitionSource.runtimeVersion ?? '26.2.4',
      packageVersion: catalog.acquisitionSource.packageVersion ?? '0.1.0',
      artifactSha256: '120932ed0010000000000000000000000000000000000000000000000000000',
      executableSha256: createHash('sha256').update(executable).digest('hex'),
      executableSizeBytes: executable.byteLength,
      officialRelease: {
        sourceKind: 'official',
        packageRef: 'https://download.documentfoundation.org/libreoffice/stable/26.2.4/win/x86_64/LibreOffice_26.2.4_Win_x86-64.msi',
        releaseTag: 'starverse-runtime-libreoffice-v0.1.0-win32-x64',
        provenance: 'The Document Foundation official download infrastructure',
      },
    })

    const availability = checkDfcLibreOfficeRuntimeAvailabilitySync({
      managedRuntimeRootDir: root,
      platform: 'win32',
      arch: 'x64',
    })

    expect(availability.summary).toMatchObject({
      status: 'available',
      source: 'managed_manifest',
      trust: expect.objectContaining({
        productionApproved: true,
        lastVerificationResult: 'hash_pin_matched',
      }),
    })
    const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8')) as DfcOfficePdfRuntimeManifest
    expect(manifest.artifactSha256).toBe(catalog.acquisitionSource.expectedSha256)
    expect(manifest.officialRelease?.packageRef).toBe(catalog.acquisitionSource.packageRef)
    expect(manifest.officialRelease?.releaseTag).toBe('starverse-runtime-libreoffice-v0.1.0-26.2.4-win32-x64')
  })

  it('blocks approved-scope managed runtimes with precise package source diagnostics when the package identity is wrong', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-runtime-prod-mismatch-'))
    const executable = Buffer.from('fake official soffice executable')
    const executablePath = 'program/soffice.exe'
    const catalog = getDfcLibreOfficeFirstPartyRuntimeCatalogEntry()
    await mkdir(path.join(root, 'program'), { recursive: true })
    await writeFile(path.join(root, executablePath), executable)
    await writeManifest(root, {
      platform: DFC_LIBREOFFICE_WINDOWS_X64_PRODUCTION_APPROVAL.approvedPlatform,
      arch: DFC_LIBREOFFICE_WINDOWS_X64_PRODUCTION_APPROVAL.approvedArch,
      executablePath,
      libreOfficeVersion: catalog.acquisitionSource.runtimeVersion ?? '26.2.4',
      packageVersion: catalog.acquisitionSource.packageVersion ?? '0.1.0',
      artifactSha256: catalog.acquisitionSource.expectedSha256,
      executableSha256: createHash('sha256').update(executable).digest('hex'),
      executableSizeBytes: executable.byteLength,
      officialRelease: {
        sourceKind: 'official',
        packageRef: 'GuXinghai/starverse@wrong-release/wrong.svpkg',
        releaseTag: 'wrong-release',
        provenance: 'github_release_asset',
      },
    })

    const availability = checkDfcLibreOfficeRuntimeAvailabilitySync({
      managedRuntimeRootDir: root,
      platform: 'win32',
      arch: 'x64',
    })

    expect(availability.summary).toMatchObject({
      status: 'blocked',
      healthStatus: 'blocked',
      productCode: 'conversion_sandbox_denied',
      internalCode: 'office_pdf_runtime_package_source_mismatch',
      source: 'managed_manifest',
      trust: expect.objectContaining({
        diagnosticCode: 'office_pdf_runtime_package_source_mismatch',
        productionApproved: false,
      }),
    })
    const bridge = toDfcLibreOfficePluginLifecycleBridge(availability.summary)
    expect(bridge.productionApproved).toBe(false)
    expect(bridge.productCode).toBe('conversion_sandbox_denied')
    expect(bridge.internalCode).toBe('office_pdf_runtime_package_source_mismatch')
  })

  it('keeps non-Windows LibreOffice packages blocked as deferred and not production-approved', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-runtime-prod-deferred-'))
    const executable = Buffer.from('fake official soffice executable')
    const executablePath = 'program/soffice'
    const catalog = getDfcLibreOfficeFirstPartyRuntimeCatalogEntry()
    await mkdir(path.join(root, 'program'), { recursive: true })
    await writeFile(path.join(root, executablePath), executable)
    await writeManifest(root, {
      platform: 'darwin',
      arch: 'arm64',
      executablePath,
      libreOfficeVersion: catalog.acquisitionSource.runtimeVersion ?? '26.2.4',
      packageVersion: catalog.acquisitionSource.packageVersion ?? '0.1.0',
      artifactSha256: catalog.acquisitionSource.expectedSha256,
      executableSha256: createHash('sha256').update(executable).digest('hex'),
      executableSizeBytes: executable.byteLength,
      officialRelease: {
        sourceKind: 'official',
        packageRef: 'future-darwin-arm64-package',
        releaseTag: 'future-darwin-arm64',
        provenance: 'deferred-platform-fixture',
      },
    })

    const availability = checkDfcLibreOfficeRuntimeAvailabilitySync({
      managedRuntimeRootDir: root,
      platform: 'darwin',
      arch: 'arm64',
    })

    expect(availability.summary).toMatchObject({
      status: 'blocked',
      source: 'managed_manifest',
      internalCode: 'office_pdf_runtime_package_platform_mismatch',
      trust: expect.objectContaining({
        productionApproved: false,
        diagnosticCode: 'office_pdf_runtime_package_platform_mismatch',
      }),
    })
    const bridge = toDfcLibreOfficePluginLifecycleBridge(availability.summary)
    expect(bridge.productionApproved).toBe(false)
    expect(bridge.experimental).toBe(false)
    expect(bridge.internalCode).toBe('office_pdf_runtime_package_platform_mismatch')
  })

  it('blocks plugin-managed runtime handles for quarantine, trust blocks, and production-only fake seams', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-runtime-handle-blocked-'))
    const executable = Buffer.from('fake soffice executable')
    const executablePath = process.platform === 'win32' ? 'program/soffice.exe' : 'program/soffice'
    await mkdir(path.join(root, 'program'), { recursive: true })
    await writeFile(path.join(root, executablePath), executable)
    await writeManifest(root, {
      executablePath,
      executableSha256: createHash('sha256').update(executable).digest('hex'),
      executableSizeBytes: executable.byteLength,
    })

    const quarantined = await resolveDfcLibreOfficePluginManagedRuntimeHandle({
      managedRuntimeRootDir: root,
      lifecycleSummary: createDfcLibreOfficeQuarantinedAvailabilitySummary({
        message: `quarantined at ${root}`,
      }),
    })
    expect(quarantined).toMatchObject({
      ok: false,
      handle: null,
      summary: expect.objectContaining({
        status: 'blocked',
        healthStatus: 'blocked',
        productCode: 'conversion_sandbox_denied',
        internalCode: 'office_pdf_runtime_quarantined',
        source: 'quarantined_runtime',
      }),
    })
    expect(JSON.stringify(quarantined)).not.toContain(root)

    const trustBlocked = await resolveDfcLibreOfficePluginManagedRuntimeHandle({
      managedRuntimeRootDir: root,
      lifecycleSummary: createDfcLibreOfficeTrustBlockedAvailabilitySummary({
        message: `signature invalid at ${root}`,
        trustStates: ['signature_invalid'],
        distributionStates: ['distribution_mode_unapproved', 'download_disabled_by_policy'],
        diagnosticCode: 'signature_invalid',
      }),
    })
    expect(trustBlocked).toMatchObject({
      ok: false,
      handle: null,
      summary: expect.objectContaining({
        status: 'blocked',
        healthStatus: 'blocked',
        productCode: 'conversion_sandbox_denied',
        internalCode: 'office_pdf_runtime_trust_blocked',
        trust: expect.objectContaining({
          trustStates: ['signature_invalid'],
          distributionStates: ['distribution_mode_unapproved', 'download_disabled_by_policy'],
          signatureCatalogStatus: 'signature_invalid_or_catalog_untrusted',
          lastVerificationResult: 'blocked',
          diagnosticCode: 'signature_invalid',
        }),
      }),
    })
    expect(JSON.stringify(trustBlocked)).not.toContain(root)

    const productionUnsigned = await resolveDfcLibreOfficePluginManagedRuntimeHandle({
      managedRuntimeRootDir: root,
      productionOnly: true,
      lifecycleSummary: {
        ...checkDfcLibreOfficeRuntimeAvailabilitySync({ managedRuntimeRootDir: root }).summary,
        source: 'managed_manifest',
      },
    })
    expect(productionUnsigned).toMatchObject({
      ok: false,
      handle: null,
      summary: expect.objectContaining({
        status: 'blocked',
        healthStatus: 'blocked',
        internalCode: 'office_pdf_catalog_signature_missing',
        trust: expect.objectContaining({
          productionTrustReadiness: 'blocked_signature_missing',
          ownerGatedCandidateReadiness: 'owner_gated_hash_pinned_ready',
          diagnosticCode: 'office_pdf_catalog_signature_missing',
        }),
      }),
    })
    expect(JSON.stringify(productionUnsigned)).not.toContain(root)

    const productionOnly = await resolveDfcLibreOfficePluginManagedRuntimeHandle({
      managedRuntimeRootDir: root,
      productionOnly: true,
    })
    expect(productionOnly).toMatchObject({
      ok: false,
      handle: null,
      summary: expect.objectContaining({
        status: 'blocked',
        internalCode: 'office_pdf_catalog_signature_missing',
        trust: expect.objectContaining({
          productionTrustReadiness: 'blocked_signature_missing',
        }),
      }),
    })
    expect(JSON.stringify(productionOnly.summary)).not.toContain(root)
  })

  it('maps missing runtime into a missing Plugin Management lifecycle status without local paths', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-runtime-plugin-missing-'))

    const availability = checkDfcLibreOfficeRuntimeAvailabilitySync({ managedRuntimeRootDir: root })
    const bridge = toDfcLibreOfficePluginLifecycleBridge(availability.summary)

    expect(bridge).toMatchObject({
      pluginId: DFC_OFFICE_PDF_PLUGIN_ID,
      engineId: DFC_OFFICE_PDF_ENGINE_ID,
      runtimeId: DFC_OFFICE_PDF_RUNTIME_ID,
      lifecycleStatus: 'missing',
      healthStatus: 'missing',
      productCode: 'conversion_engine_missing',
      internalCode: 'office_pdf_runtime_missing',
      source: 'missing_manifest',
      productionApproved: false,
      installed: false,
      enabled: false,
      retryable: true,
      recoverable: true,
      runtime: null,
    })
    expect(JSON.stringify(bridge)).not.toContain(root)
  })

  it('defines a stable first-party Plugin Management catalog contract', () => {
    const entry = getDfcLibreOfficeFirstPartyRuntimeCatalogEntry()

    expect(entry).toMatchObject({
      pluginId: DFC_OFFICE_PDF_PLUGIN_ID,
      runtimeId: DFC_OFFICE_PDF_RUNTIME_ID,
      displayName: 'LibreOffice Office PDF',
      provider: DFC_OFFICE_PDF_PLUGIN_PROVIDER,
      runtimeKind: 'managed',
      productionApproved: true,
      productionApprovalScope: DFC_LIBREOFFICE_WINDOWS_X64_PRODUCTION_APPROVAL,
      experimental: false,
      artifactSourcePolicy: {
        officialCatalogCandidate: true,
        importedDevArtifactAllowed: true,
        packagedBinaryIncluded: false,
        systemPathFallbackAllowed: false,
      },
      acquisitionSource: {
        sourceKind: 'github_release_asset',
        downloadEnabled: false,
        packageRef: 'GuXinghai/starverse@starverse-runtime-libreoffice-v0.1.0-26.2.4-win32-x64/starverse-runtime-libreoffice-0.1.0-26.2.4-win32-x64.svpkg',
        sourceUrl: 'https://github.com/GuXinghai/starverse/releases/download/starverse-runtime-libreoffice-v0.1.0-26.2.4-win32-x64/starverse-runtime-libreoffice-0.1.0-26.2.4-win32-x64.svpkg',
        expectedSha256: 'ce012cf1215f958286be29462d1ae8c122bdc6a779ac84076388de9875487f6e',
        expectedSizeBytes: 518907010,
        packageVersion: '0.1.0',
        runtimeVersion: '26.2.4',
        platform: 'win32',
        arch: 'x64',
        productionApproved: true,
        ownerGated: false,
        experimental: false,
      },
      trustPolicy: {
        selectedModel: 'owner_gated_hash_pinned_signed_catalog_required_for_production',
        currentPackageDecision: 'approved_windows_x64_docx_to_pdf_production_asset',
        currentTrustStates: expect.arrayContaining([
          'owner_approved_hash_pinned',
          'hash_pinned',
          'signature_missing',
          'catalog_untrusted',
        ]),
        currentDistributionStates: expect.arrayContaining([
          'offline_import_allowed',
          'manual_github_release_allowed',
          'verified_offline_import_allowed',
          'windows_x64_production_approved',
          'download_disabled_by_policy',
          'bundled_runtime_not_approved',
          'install_repair_download_not_approved',
          'product_mirror_pending_approval',
          'system_libreoffice_disallowed',
        ]),
        unsignedPackagesProductionApproved: false,
        detachedSignatureRequiredForProduction: true,
        signedCatalogRequiredForProduction: true,
      },
      layoutContract: expect.objectContaining({
        layoutVersion: '1',
        packageRootRef: 'managed_runtime_package_root',
        manifestRelativePath: 'manifest.json',
        executablePathPolicy: expect.objectContaining({
          mustBeManifestRelative: true,
          absolutePathAllowed: false,
          parentTraversalAllowed: false,
        }),
        hashAndSizePolicy: {
          artifactSha256Required: true,
          executableSha256Required: true,
          executableSizeBytesRequired: true,
        },
        productionApproved: false,
      }),
      requirements: {
        manifestHashRequired: true,
        executableHashRequired: true,
        executableSizeRequired: true,
        provenanceRequired: true,
        licenseRequired: true,
        attributionRequired: true,
      },
    })
    expect(entry.capabilityIds).toEqual([
      DFC_OFFICE_PDF_PLUGIN_MANAGEMENT_CAPABILITY_ID,
      ...DFC_OFFICE_PDF_CAPABILITIES,
    ])
    expect(entry.supportedPlatforms).toEqual(['win32', 'darwin', 'linux'])
    expect(entry.supportedFormats).toEqual(['docx'])
    expect(entry.verificationOrder).toEqual([
      'package_size_preflight',
      'package_sha256_preflight',
      'signature_or_catalog_verification_if_enabled',
      'archive_extraction_to_staging',
      'manifest_identity_validation',
      'runtime_identity_validation',
      'package_runtime_version_validation',
      'platform_arch_validation',
      'executable_relative_path_validation',
      'executable_hash_size_validation',
      'provenance_license_security_policy_validation',
      'realpath_containment',
      'symlink_reparse_escape_rejection',
      'activation',
      'optional_owner_gated_health_check_smoke',
    ])
  })

  it('exposes the shared LibreOffice package layout verification contract', () => {
    const contract = getDfcLibreOfficeRuntimePackageLayoutContract()

    expect(contract).toMatchObject({
      layoutVersion: '1',
      packageRootRef: 'managed_runtime_package_root',
      manifestRelativePath: 'manifest.json',
      executablePathPolicy: {
        mustBeManifestRelative: true,
        absolutePathAllowed: false,
        parentTraversalAllowed: false,
        nulByteAllowed: false,
        symlinkEscapeAllowed: false,
      },
      hashAndSizePolicy: {
        artifactSha256Required: true,
        executableSha256Required: true,
        executableSizeBytesRequired: true,
      },
      sourcePolicy: {
        officialPackageAllowed: true,
        importedDevArtifactAllowed: true,
        fakeSeamAllowedForTests: true,
        systemPathFallbackAllowed: false,
      },
      productionApproved: false,
    })
    expect(contract.requiredCapabilities).toEqual([...DFC_OFFICE_PDF_CAPABILITIES])
    expect(contract.requiredManifestFields).toEqual(expect.arrayContaining([
      'pluginId',
      'runtimeId',
      'executablePath',
      'artifactSha256',
      'executableSha256',
      'executableSizeBytes',
      'provenance',
      'licenseId',
      'securityPolicy',
    ]))
    expect(contract.executablePathPolicy.platformRules.win32.executablePathDescription).toContain('.exe')
    expect(contract.executablePathPolicy.platformRules.linux.executablePathDescription).toContain('program/soffice')
  })
})

async function runtimeWithExecutableForPlatform(
  platform: NodeJS.Platform,
  executablePath: string
): Promise<Readonly<{ root: string }>> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-runtime-platform-policy-'))
  const executable = Buffer.from(`fake soffice executable for ${platform}`)
  await mkdir(path.dirname(path.join(root, executablePath)), { recursive: true })
  await writeFile(path.join(root, executablePath), executable)
  await writeManifest(root, {
    platform,
    executablePath,
    executableSha256: createHash('sha256').update(executable).digest('hex'),
    executableSizeBytes: executable.byteLength,
  })
  return { root }
}

async function writeManifest(
  root: string,
  overrides: Partial<DfcOfficePdfRuntimeManifest>
): Promise<void> {
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify({
    manifestSchemaVersion: '1',
    pluginId: DFC_OFFICE_PDF_PLUGIN_ID,
    packageId: DFC_OFFICE_PDF_RUNTIME_PACKAGE_ID,
    runtimePackageId: DFC_OFFICE_PDF_RUNTIME_PACKAGE_ID,
    engineId: DFC_OFFICE_PDF_ENGINE_ID,
    runtimeId: DFC_OFFICE_PDF_RUNTIME_ID,
    displayName: 'LibreOffice Office PDF',
    pluginVersion: '0.1.0',
    runtimeKind: DFC_OFFICE_PDF_RUNTIME_KIND,
    enabled: true,
    platform: process.platform,
    arch: process.arch,
    capabilities: [...DFC_OFFICE_PDF_CAPABILITIES],
    executablePath: process.platform === 'win32' ? 'program/soffice.exe' : 'program/soffice',
    libreOfficeVersion: '24.8.0',
    packageVersion: '2026.06.01',
    artifactSha256: 'a'.repeat(64),
    executableSha256: 'b'.repeat(64),
    executableSizeBytes: 123,
    provenance: 'starverse-test-fixture',
    licenseId: 'MPL-2.0',
    attribution: 'The Document Foundation LibreOffice',
    notices: ['LibreOffice test fixture attribution'],
    minimumStarverseContractVersion: '1',
    officialRelease: {
      sourceKind: 'test_fixture',
      packageRef: 'fixtures/libreoffice-test.zip',
      releaseTag: 'test-libreoffice-fixture',
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
}
