import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DFC_OFFICE_PDF_CAPABILITIES,
  DFC_OFFICE_PDF_ENGINE_ID,
  DFC_OFFICE_PDF_RUNTIME_ID,
  DFC_OFFICE_PDF_RUNTIME_PACKAGE_ID,
  checkDfcLibreOfficeRuntimeAvailability,
} from './dfcManagedLibreOfficeRuntime'

describe('dfc managed LibreOffice runtime gate', () => {
  it('reports a symbolic missing diagnostic when the managed runtime manifest is absent', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-runtime-missing-'))

    const result = await checkDfcLibreOfficeRuntimeAvailability({ managedRuntimeRootDir: root })

    expect(result).toMatchObject({
      ok: false,
      runtime: null,
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
      runtime: expect.objectContaining({
        packageId: DFC_OFFICE_PDF_RUNTIME_PACKAGE_ID,
        engineId: DFC_OFFICE_PDF_ENGINE_ID,
        runtimeId: DFC_OFFICE_PDF_RUNTIME_ID,
        platform: process.platform,
        arch: process.arch,
        capabilities: [...DFC_OFFICE_PDF_CAPABILITIES],
        libreOfficeVersion: '24.8.0',
        packageVersion: '2026.06.01',
        minimumStarverseContractVersion: '1',
        provenance: 'starverse-test-fixture',
        licenseId: 'MPL-2.0',
      }),
      diagnostics: [],
    })
    expect(JSON.stringify(result)).not.toContain(root)
    expect(JSON.stringify(result)).not.toContain('program/soffice')
    expect(JSON.stringify(result)).not.toContain('fake soffice executable')
  })

  it('reports missing executable separately from metadata and path failures', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-runtime-exe-missing-'))
    await writeManifest(root, {
      executablePath: 'program/missing-soffice',
      executableSha256: 'b'.repeat(64),
      executableSizeBytes: 123,
    })

    const result = await checkDfcLibreOfficeRuntimeAvailability({ managedRuntimeRootDir: root })

    expect(result).toMatchObject({
      ok: false,
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
      diagnostics: [expect.objectContaining({ code: 'office_pdf_runtime_manifest_invalid' })],
    })
    expect(JSON.stringify(invalid)).not.toContain('not-a-full-hash')
    expect(JSON.stringify(invalid)).not.toContain('LICENSE BODY SECRET')

    await writeManifest(root, { platform: 'unsupported-platform' })
    const unsupported = await checkDfcLibreOfficeRuntimeAvailability({ managedRuntimeRootDir: root })
    expect(unsupported).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_runtime_platform_unsupported' })],
    })
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
        isolatedProfileRequired: true,
      },
    })

    const result = await checkDfcLibreOfficeRuntimeAvailability({ managedRuntimeRootDir: root })

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_runtime_metadata_incomplete' })],
    })
    expect(JSON.stringify(result)).not.toContain(root)
    expect(JSON.stringify(result)).not.toContain('fake soffice executable')
  })
})

async function writeManifest(
  root: string,
  overrides: Partial<Record<string, string | number | null | string[] | Record<string, boolean>>>
): Promise<void> {
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify({
    packageId: DFC_OFFICE_PDF_RUNTIME_PACKAGE_ID,
    engineId: DFC_OFFICE_PDF_ENGINE_ID,
    runtimeId: DFC_OFFICE_PDF_RUNTIME_ID,
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
    notices: ['LibreOffice test fixture attribution'],
    minimumStarverseContractVersion: '1',
    securityPolicy: {
      macrosDisabled: true,
      networkDisabled: true,
      externalLinksDisabled: true,
      isolatedProfileRequired: true,
    },
    ...overrides,
  }))
}
