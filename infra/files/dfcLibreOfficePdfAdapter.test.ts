import { mkdir, mkdtemp, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { RunExternalProcessInput } from '../../src/next/file-type/externalProcessRunner'
import {
  buildLibreOfficePdfArgs,
  runDfcLibreOfficeDocxToPdfAdapter,
  validateDfcLibreOfficePdfOutput,
} from './dfcLibreOfficePdfAdapter'
import {
  DFC_OFFICE_PDF_CAPABILITIES,
  DFC_OFFICE_PDF_ENGINE_ID,
  DFC_OFFICE_PDF_PLUGIN_ID,
  DFC_OFFICE_PDF_RUNTIME_ID,
  DFC_OFFICE_PDF_RUNTIME_KIND,
  DFC_OFFICE_PDF_RUNTIME_PACKAGE_ID,
  type DfcLibreOfficePluginManagedRuntimeHandle,
} from './dfcManagedLibreOfficeRuntime'

describe('DFC LibreOffice DOCX to PDF adapter skeleton', () => {
  it('plans a managed LibreOffice command and accepts fake success output under the controlled sandbox', async () => {
    const runtime = await fakeRuntime()
    const sandboxRootDir = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-pdf-sandbox-'))
    let processInput: RunExternalProcessInput | null = null

    const result = await runDfcLibreOfficeDocxToPdfAdapter({
      assetId: 'asset-docx-pdf-success',
      sourceExtension: 'docx',
      sourceBytes: Buffer.from('fake docx bytes'),
      sandboxRootDir,
      runtime,
      processRunner: async (input) => {
        processInput = input
        const outdir = String(input.args?.[(input.args ?? []).indexOf('--outdir') + 1] ?? '')
        await writeFile(path.join(outdir, 'asset-docx-pdf-success.pdf'), Buffer.from('%PDF-1.7\n%%EOF'))
        return okProcess()
      },
    })

    expect(result).toMatchObject({
      ok: true,
      status: 'succeeded',
      output: expect.objectContaining({
        mime: 'application/pdf',
        extension: 'pdf',
      }),
      diagnostics: [],
      cleanupStatus: 'not_requested',
    })
    expect(processInput).not.toBeNull()
    const recordedProcessInput = processInput as unknown as RunExternalProcessInput
    expect(recordedProcessInput).toMatchObject({
      command: runtime.executablePath,
      cwd: expect.stringContaining(`${path.sep}work`),
      mode: 'conversion',
      shell: false,
      allowBatchEntrypoint: false,
      env: {},
    })
    expect(recordedProcessInput.args).toEqual(expect.arrayContaining([
      '--headless',
      '--convert-to',
      'pdf',
      '--outdir',
      expect.stringContaining(`${path.sep}output`),
      expect.stringMatching(/^-env:UserInstallation=file:/),
      expect.stringContaining(`${path.sep}input${path.sep}asset-docx-pdf-success.docx`),
    ]))
    expect(JSON.stringify(result.diagnostics)).not.toContain(runtime.runtime.managedRuntimeRootDir)
    expect(JSON.stringify(result.diagnostics)).not.toContain(runtime.executablePath)
  })

  it('does not run without an injected fake process runner', async () => {
    const result = await runDfcLibreOfficeDocxToPdfAdapter({
      assetId: 'asset-docx-pdf-no-runner',
      sourceExtension: 'docx',
      sourceBytes: Buffer.from('fake docx bytes'),
      sandboxRootDir: await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-pdf-no-runner-')),
      runtime: await fakeRuntime(),
    })

    expect(result).toMatchObject({
      ok: false,
      status: 'blocked',
      output: null,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_process_runner_unavailable' })],
    })
  })

  it.each([
    ['doc'],
    ['rtf'],
    ['docm'],
  ])('rejects unsupported .%s input before planning process execution', async (sourceExtension) => {
    let called = false
    const result = await runDfcLibreOfficeDocxToPdfAdapter({
      assetId: `asset-office-pdf-unsupported-${sourceExtension}`,
      sourceExtension,
      sourceBytes: Buffer.from('unsupported office bytes'),
      sandboxRootDir: await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-pdf-unsupported-')),
      runtime: await fakeRuntime(),
      processRunner: async () => {
        called = true
        return okProcess()
      },
    })

    expect(called).toBe(false)
    expect(result).toMatchObject({
      ok: false,
      status: 'blocked',
      output: null,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_source_unsupported' })],
    })
  })

  it('fails closed for fake process failure and timeout with sanitized diagnostics', async () => {
    const runtime = await fakeRuntime()
    const failed = await runDfcLibreOfficeDocxToPdfAdapter({
      assetId: 'asset-docx-pdf-process-failed',
      sourceExtension: 'docx',
      sourceBytes: Buffer.from('fake docx bytes'),
      sandboxRootDir: await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-pdf-failed-')),
      runtime,
      processRunner: async () => ({
        ...okProcess(),
        exitCode: 1,
        errorCode: 'process_exit_nonzero',
        stderr: 'failed at C:\\Users\\alice\\private\\source.docx token=secret fullHash=abcdef0123456789',
      }),
    })
    const timedOut = await runDfcLibreOfficeDocxToPdfAdapter({
      assetId: 'asset-docx-pdf-process-timeout',
      sourceExtension: 'docx',
      sourceBytes: Buffer.from('fake docx bytes'),
      sandboxRootDir: await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-pdf-timeout-')),
      runtime,
      processRunner: async () => ({
        ...okProcess(),
        exitCode: null,
        timedOut: true,
        errorCode: 'process_timeout',
        stderr: '/tmp/private/source.docx',
      }),
    })

    expect(failed).toMatchObject({
      ok: false,
      status: 'failed',
      output: null,
      diagnostics: [expect.objectContaining({ code: 'process_exit_nonzero' })],
    })
    expect(timedOut).toMatchObject({
      ok: false,
      status: 'timed_out',
      output: null,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_process_timeout' })],
    })
    const serialized = JSON.stringify([failed, timedOut])
    expect(serialized).not.toContain('C:\\Users\\alice')
    expect(serialized).not.toContain('/tmp/private')
    expect(serialized).not.toContain('token=secret')
    expect(serialized).not.toContain('abcdef0123456789')
  })

  it('attempts sandbox cleanup after fake success and fake failure when requested', async () => {
    const runtime = await fakeRuntime()
    const successRoot = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-pdf-cleanup-success-'))
    const failureRoot = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-pdf-cleanup-failure-'))

    const success = await runDfcLibreOfficeDocxToPdfAdapter({
      assetId: 'asset-docx-pdf-cleanup-success',
      sourceExtension: 'docx',
      sourceBytes: Buffer.from('fake docx bytes'),
      sandboxRootDir: successRoot,
      runtime,
      cleanupSandbox: true,
      processRunner: async (input) => {
        const outdir = String(input.args?.[(input.args ?? []).indexOf('--outdir') + 1] ?? '')
        await writeFile(path.join(outdir, 'asset-docx-pdf-cleanup-success.pdf'), Buffer.from('%PDF-1.7\n%%EOF'))
        return okProcess()
      },
    })
    const failure = await runDfcLibreOfficeDocxToPdfAdapter({
      assetId: 'asset-docx-pdf-cleanup-failure',
      sourceExtension: 'docx',
      sourceBytes: Buffer.from('fake docx bytes'),
      sandboxRootDir: failureRoot,
      runtime,
      cleanupSandbox: true,
      processRunner: async () => ({
        ...okProcess(),
        exitCode: 1,
        errorCode: 'process_exit_nonzero',
        stderr: 'cleanup failed source C:\\Users\\private\\source.docx token=secret',
      }),
    })

    expect(success).toMatchObject({
      ok: true,
      status: 'succeeded',
      cleanupStatus: 'attempted',
    })
    expect(failure).toMatchObject({
      ok: false,
      status: 'failed',
      output: null,
      cleanupStatus: 'attempted',
    })
    expect(await pathExists(successRoot)).toBe(false)
    expect(await pathExists(failureRoot)).toBe(false)
    expect(JSON.stringify([success, failure])).not.toContain('C:\\Users\\private')
    expect(JSON.stringify([success, failure])).not.toContain('token=secret')
  })

  it('validates output path, exact PDF name, missing output, ambiguous output, and PDF header', async () => {
    const outputDir = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-pdf-output-'))
    const expected = path.join(outputDir, 'asset.pdf')

    const missing = await validateDfcLibreOfficePdfOutput({ sandboxOutputDir: outputDir, expectedOutputPath: expected })
    expect(missing).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_output_missing' })],
    })

    await writeFile(expected, Buffer.from('not a pdf'))
    const invalid = await validateDfcLibreOfficePdfOutput({ sandboxOutputDir: outputDir, expectedOutputPath: expected })
    expect(invalid).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_output_invalid' })],
    })

    await writeFile(expected, Buffer.from('%PDF-1.7\n%%EOF'))
    await writeFile(path.join(outputDir, 'other.pdf'), Buffer.from('%PDF-1.7\n%%EOF'))
    const ambiguous = await validateDfcLibreOfficePdfOutput({ sandboxOutputDir: outputDir, expectedOutputPath: expected })
    expect(ambiguous).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_output_ambiguous' })],
    })

    const escape = await validateDfcLibreOfficePdfOutput({
      sandboxOutputDir: outputDir,
      expectedOutputPath: path.resolve(outputDir, '..', 'escape.pdf'),
    })
    expect(escape).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_output_path_rejected' })],
    })
  })

  it('builds args without shell fragments and with an isolated profile descriptor', () => {
    const args = buildLibreOfficePdfArgs({
      inputPath: path.resolve('sandbox/input/asset.docx'),
      outputDir: path.resolve('sandbox/output'),
      profileDir: path.resolve('sandbox/work/libreoffice-profile'),
    })

    expect(args).not.toContain('&&')
    expect(args).not.toContain('|')
    expect(args).toContain('--headless')
    expect(args).toContain('--outdir')
    expect(args.some((arg) => arg.startsWith('-env:UserInstallation=file:'))).toBe(true)
  })
})

async function fakeRuntime(): Promise<DfcLibreOfficePluginManagedRuntimeHandle> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-runtime-adapter-'))
  const executablePath = path.join(root, 'program', process.platform === 'win32' ? 'soffice.exe' : 'soffice')
  await mkdir(path.dirname(executablePath), { recursive: true })
  await writeFile(executablePath, Buffer.from('fake managed soffice executable'))
  const runtime = {
    managedRuntimeRootDir: root,
    executablePath,
    pluginId: DFC_OFFICE_PDF_PLUGIN_ID,
    packageId: DFC_OFFICE_PDF_RUNTIME_PACKAGE_ID,
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
    officialRelease: {
      sourceKind: 'test_fixture',
      packageRef: 'fixtures/libreoffice-test.zip',
      releaseTag: 'test-libreoffice-fixture',
      provenance: 'starverse-test-fixture',
    },
  } as const
  return {
    pluginId: DFC_OFFICE_PDF_PLUGIN_ID,
    runtimeId: DFC_OFFICE_PDF_RUNTIME_ID,
    capabilityId: 'docx_to_pdf',
    executablePath,
    executableRelativePath: `program/${process.platform === 'win32' ? 'soffice.exe' : 'soffice'}`,
    platform: process.platform,
    arch: process.arch,
    runtimeVersion: '24.8.0',
    packageVersion: '2026.06.01',
    source: 'fake_seam',
    healthStatus: 'healthy',
    productionApproved: false,
    experimental: true,
    degraded: true,
    productCode: null,
    internalCode: null,
    diagnostics: [],
    runtime,
  }
}

function okProcess() {
  return {
    exitCode: 0,
    signal: null,
    stdout: '',
    stderr: '',
    timedOut: false,
    outputLimited: false,
    terminationAttempted: false,
    terminated: true,
    errorCode: null,
    elapsedMs: 10,
  } as const
}

async function pathExists(target: string): Promise<boolean> {
  return stat(target).then(() => true).catch(() => false)
}
