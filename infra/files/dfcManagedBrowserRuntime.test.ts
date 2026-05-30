import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DFC_HTML_PDF_RUNTIME_CAPABILITY,
  DFC_HTML_PDF_RUNTIME_ID,
  DFC_HTML_PDF_RUNTIME_PACKAGE_ID,
  checkDfcHtmlPdfRuntimeAvailability,
} from './dfcManagedBrowserRuntime'

describe('dfc managed browser runtime gate', () => {
  it('reports a symbolic missing diagnostic when the managed runtime manifest is absent', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-runtime-missing-'))

    const result = await checkDfcHtmlPdfRuntimeAvailability({ managedRuntimeRootDir: root })

    expect(result).toMatchObject({
      ok: false,
      runtime: null,
      diagnostics: [expect.objectContaining({ code: 'html_pdf_runtime_missing' })],
    })
    expect(JSON.stringify(result)).not.toContain(root)
  })

  it('accepts a manifest only when the executable stays under the managed root and matches metadata', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-runtime-ok-'))
    const executable = Buffer.from('fake chromium executable')
    await mkdir(path.join(root, 'bin'), { recursive: true })
    await writeFile(path.join(root, 'bin', 'chromium'), executable)
    await writeManifest(root, {
      executablePath: 'bin/chromium',
      sha256: createHash('sha256').update(executable).digest('hex'),
      sizeBytes: executable.byteLength,
    })

    const result = await checkDfcHtmlPdfRuntimeAvailability({ managedRuntimeRootDir: root })

    expect(result).toMatchObject({
      ok: true,
      runtime: expect.objectContaining({
        packageId: DFC_HTML_PDF_RUNTIME_PACKAGE_ID,
        runtimeId: DFC_HTML_PDF_RUNTIME_ID,
        platform: process.platform,
        arch: process.arch,
        capabilities: [DFC_HTML_PDF_RUNTIME_CAPABILITY],
        playwrightVersion: '1.57.0',
        browserRevision: '1200',
      }),
      diagnostics: [],
    })
    expect(JSON.stringify(result)).not.toContain(root)
    expect(JSON.stringify(result)).not.toContain('bin/chromium')
  })

  it('reports missing executable separately from metadata and path failures', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-runtime-exe-missing-'))
    await writeManifest(root, {
      executablePath: 'bin/missing-chromium',
      sha256: 'a'.repeat(64),
      sizeBytes: 123,
    })

    const result = await checkDfcHtmlPdfRuntimeAvailability({ managedRuntimeRootDir: root })

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'html_pdf_runtime_executable_missing' })],
    })
    expect(JSON.stringify(result)).not.toContain('bin/missing-chromium')
    expect(JSON.stringify(result)).not.toContain(root)
  })

  it.each([
    ['traversal', '../outside/chromium'],
    ['unc', '\\\\server\\share\\chromium.exe'],
    ['nul', 'bin/chromium\u0000.exe'],
    ['drive', 'C:\\Users\\private\\chromium.exe'],
  ])('rejects %s executable paths without leaking the raw path', async (_name, executablePath) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-runtime-reject-'))
    await writeManifest(root, { executablePath })

    const result = await checkDfcHtmlPdfRuntimeAvailability({ managedRuntimeRootDir: root })

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'html_pdf_runtime_path_rejected' })],
    })
    expect(JSON.stringify(result)).not.toContain(executablePath)
    expect(JSON.stringify(result)).not.toContain(root)
  })

  it('rejects invalid manifest shape and unsupported platform without path or hash leakage', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-runtime-invalid-'))
    await writeFile(path.join(root, 'manifest.json'), JSON.stringify({
      runtimeId: DFC_HTML_PDF_RUNTIME_ID,
      platform: process.platform,
      executablePath: 'bin/chromium',
      playwrightVersion: '1.57.0',
      browserRevision: '1200',
      sha256: 'not-a-full-hash',
    }))

    const invalid = await checkDfcHtmlPdfRuntimeAvailability({ managedRuntimeRootDir: root })
    expect(invalid).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'html_pdf_runtime_manifest_invalid' })],
    })
    expect(JSON.stringify(invalid)).not.toContain('not-a-full-hash')

    await writeManifest(root, { platform: 'unsupported-platform' })
    const unsupported = await checkDfcHtmlPdfRuntimeAvailability({ managedRuntimeRootDir: root })
    expect(unsupported).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'html_pdf_runtime_platform_unsupported' })],
    })
  })

  it('rejects otherwise valid fixture packages when hash, size, provenance, or license metadata is incomplete', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-runtime-metadata-'))
    await mkdir(path.join(root, 'bin'), { recursive: true })
    await writeFile(path.join(root, 'bin', 'chromium'), Buffer.from('fake chromium executable'))
    await writeManifest(root, {
      executablePath: 'bin/chromium',
      sha256: null,
      sizeBytes: null,
      provenance: null,
    })

    const result = await checkDfcHtmlPdfRuntimeAvailability({ managedRuntimeRootDir: root })

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'html_pdf_runtime_metadata_incomplete' })],
    })
    expect(JSON.stringify(result)).not.toContain(root)
    expect(JSON.stringify(result)).not.toContain('fake chromium executable')
  })
})

async function writeManifest(
  root: string,
  overrides: Partial<Record<string, string | number | null>>
): Promise<void> {
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify({
    packageId: DFC_HTML_PDF_RUNTIME_PACKAGE_ID,
    runtimeId: DFC_HTML_PDF_RUNTIME_ID,
    platform: process.platform,
    arch: process.arch,
    capabilities: [DFC_HTML_PDF_RUNTIME_CAPABILITY],
    executablePath: 'bin/chromium',
    playwrightVersion: '1.57.0',
    browserRevision: '1200',
    provenance: 'starverse-test-fixture',
    license: 'test-only',
    ...overrides,
  }))
}
