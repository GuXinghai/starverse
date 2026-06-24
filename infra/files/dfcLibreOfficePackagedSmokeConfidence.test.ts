import { createHash } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { RunExternalProcessInput } from '../../src/next/file-type/externalProcessRunner'
import { runExternalProcess } from '../../src/next/file-type/externalProcessRunner'
import { createDfcConversionSandboxPlan } from './dfcConversionSandbox'
import {
  runDfcLibreOfficeDocxToPdfAdapter,
  type DfcLibreOfficePdfAdapterResult,
} from './dfcLibreOfficePdfAdapter'
import { importDfcLibreOfficeRuntimePackageArchive } from './dfcLibreOfficeRuntimePackageArchive'
import {
  DFC_OFFICE_PDF_CAPABILITIES,
  DFC_OFFICE_PDF_PLUGIN_ID,
  DFC_OFFICE_PDF_RUNTIME_ID,
  DFC_OFFICE_PDF_RUNTIME_PACKAGE_ID,
  getDfcLibreOfficeFirstPartyRuntimeCatalogEntry,
  resolveDfcLibreOfficePluginManagedRuntimeHandle,
  type DfcOfficePdfRuntimeManifest,
} from './dfcManagedLibreOfficeRuntime'

type M35PathKey = 'runtimeRoot' | 'sandboxRoot' | 'inputPath' | 'outputDir' | 'profileDir'
type M35PathClass = 'controlled_short' | 'deep_runtime'
type M35PdfValidation = 'valid_pdf' | 'failed' | 'not_reached'
type M35CleanupStatus = DfcLibreOfficePdfAdapterResult['cleanupStatus'] | 'not_started'
type M35DeepExecutableStat = 'found' | 'missing'
type M35DeepRuntimeGateContainment = 'passed' | 'failed' | 'not_reached'
type M35SpawnSourceClassification = 'managed_descriptor' | 'path_lookup_detected' | 'not_reached'
type M35DeepFinalClassification =
  | 'starverse_path_resolution_bug'
  | 'runtime_gate_rejection'
  | 'downstream_process_long_path_failure'
  | 'inconclusive'

type M35PathLengths = Readonly<Record<M35PathKey, number>>

type M35PathCapResult =
  | Readonly<{ ok: true; pathLengths: M35PathLengths; diagnosticCode: null; exceeded: readonly M35PathKey[] }>
  | Readonly<{ ok: false; pathLengths: M35PathLengths; diagnosticCode: 'office_pdf_path_policy_exceeded'; exceeded: readonly M35PathKey[] }>

type M35PackagedSmokeEvidence = Readonly<{
  caseId: string
  pathClass: M35PathClass
  pathLengths: M35PathLengths
  validationStage: string
  passed: boolean
  diagnosticCode: string | null
  cleanupStatus: M35CleanupStatus
  pdfValidation: M35PdfValidation
  packageIdentity: 'validated' | 'not_reached'
  runtimeIdentity: 'validated' | 'not_reached'
  executableIdentity: 'validated' | 'not_reached'
  workerSemantics: 'verified_by_packaged_command' | 'not_reached'
}>

type M35DeepClassificationEvidence = Readonly<{
  caseId: string
  pathClass: 'deep_runtime'
  pathLength: number
  validationStage: 'deep_path_classification'
  passed: boolean
  diagnosticCode: string | null
  cleanupStatus: M35CleanupStatus
  pdfValidation: 'not_reached'
  deepExecutableStat: M35DeepExecutableStat
  deepRuntimeGateRealpathContainment: M35DeepRuntimeGateContainment
  spawnSourceClassification: M35SpawnSourceClassification
  finalClassification: M35DeepFinalClassification
}>

const M35_PATH_CAPS = {
  runtimeRoot: 120,
  sandboxRoot: 80,
  inputPath: 130,
  outputDir: 90,
  profileDir: 110,
} satisfies M35PathLengths

const M35_PACKAGED_SMOKE_FLAG = 'STARVERSE_DFC_LIBREOFFICE_PACKAGED_SMOKE'
const M35_PACKAGED_SVPKG_ENV = 'STARVERSE_DFC_LIBREOFFICE_PACKAGED_SVPKG'
const M35_PACKAGED_APP_ROOT_ENV = 'STARVERSE_DFC_LIBREOFFICE_PACKAGED_APP_ROOT'

const runRealPackagedSmoke = process.env[M35_PACKAGED_SMOKE_FLAG] === '1' ? it : it.skip

describe('DFC LibreOffice M35 packaged smoke confidence harness', () => {
  it('defines the controlled short-path caps selected by M34', () => {
    expect(M35_PATH_CAPS).toEqual({
      runtimeRoot: 120,
      sandboxRoot: 80,
      inputPath: 130,
      outputDir: 90,
      profileDir: 110,
    })
  })

  it('fails closed before launch when any M35 path cap is exceeded and evidence remains sanitized', () => {
    let launchAttempted = false
    const capResult = evaluateM35PathCaps({
      runtimeRoot: 'C:\\Users\\owner\\private\\very\\deep\\runtime\\root',
      sandboxRoot: 'C:\\Users\\owner\\private\\sandbox',
      inputPath: `C:\\Users\\owner\\${'deep\\'.repeat(35)}fixture.docx`,
      outputDir: 'C:\\Users\\owner\\private\\sandbox\\output',
      profileDir: 'C:\\Users\\owner\\private\\sandbox\\work\\libreoffice-profile',
    })
    if (capResult.ok) launchAttempted = true

    const evidence = buildPackagedSmokeEvidence({
      caseId: 'unit-cap-exceeded',
      pathClass: 'controlled_short',
      pathCap: capResult,
      validationStage: 'path_cap_assertion',
      passed: false,
      cleanupStatus: 'not_started',
      pdfValidation: 'not_reached',
      packageIdentity: 'not_reached',
      runtimeIdentity: 'not_reached',
      executableIdentity: 'not_reached',
      workerSemantics: 'not_reached',
    })
    const serialized = JSON.stringify(evidence)

    expect(capResult.ok).toBe(false)
    expect(capResult.diagnosticCode).toBe('office_pdf_path_policy_exceeded')
    expect(capResult.exceeded).toContain('inputPath')
    expect(launchAttempted).toBe(false)
    expect(serialized).not.toContain('C:\\Users\\owner')
    expect(serialized).not.toContain('fixture.docx')
    expect(serialized).not.toContain('soffice')
  })

  it('classifies deep-path cause from the lightweight Starverse-owned diagnostic slice', () => {
    expect(classifyDeepRuntimeFailure({
      executableStat: 'found',
      runtimeGateContainment: 'passed',
      spawnSourceClassification: 'managed_descriptor',
    })).toBe('downstream_process_long_path_failure')
    expect(classifyDeepRuntimeFailure({
      executableStat: 'missing',
      runtimeGateContainment: 'not_reached',
      spawnSourceClassification: 'not_reached',
    })).toBe('starverse_path_resolution_bug')
    expect(classifyDeepRuntimeFailure({
      executableStat: 'found',
      runtimeGateContainment: 'failed',
      spawnSourceClassification: 'not_reached',
    })).toBe('runtime_gate_rejection')
    expect(classifyDeepRuntimeFailure({
      executableStat: 'found',
      runtimeGateContainment: 'passed',
      spawnSourceClassification: 'path_lookup_detected',
    })).toBe('starverse_path_resolution_bug')
  })

  it('keeps the catalog scoped to Windows x64 DOCX-to-PDF with automatic download disabled', () => {
    const catalog = getDfcLibreOfficeFirstPartyRuntimeCatalogEntry()

    expect(catalog.productionApproved).toBe(true)
    expect(catalog.experimental).toBe(false)
    expect(catalog.productionApprovalScope).toMatchObject({
      approvedPlatform: 'win32',
      approvedArch: 'x64',
      approvedInput: 'docx',
      approvedOutput: 'pdf_attachment',
      automaticDownloadEnabled: false,
      postinstallDownloadEnabled: false,
      conversionTimeDownloadEnabled: false,
    })
    expect(catalog.supportedFormats).toEqual(['docx'])
    expect(catalog.artifactSourcePolicy.systemPathFallbackAllowed).toBe(false)
    expect(catalog.artifactSourcePolicy.packagedBinaryIncluded).toBe(false)
    expect(catalog.acquisitionSource.downloadEnabled).toBe(false)
    expect(catalog.acquisitionSource.productionApproved).toBe(true)
    expect(catalog.acquisitionSource.ownerGated).toBe(false)
  })

  it('fails closed for missing, disabled, and executable-mismatch packaged runtime roots', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'm35lo-fail-'))
    const missing = await resolveDfcLibreOfficePluginManagedRuntimeHandle({
      managedRuntimeRootDir: path.join(root, 'missing-runtime'),
    })
    expect(missing).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_runtime_missing' })],
    })

    const disabledRoot = path.join(root, 'disabled')
    await writeMinimalRuntimeFixture(disabledRoot, { enabled: false })
    const disabled = await resolveDfcLibreOfficePluginManagedRuntimeHandle({
      managedRuntimeRootDir: disabledRoot,
    })
    expect(disabled).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_runtime_disabled' })],
    })

    const mismatchRoot = path.join(root, 'mismatch')
    await writeMinimalRuntimeFixture(mismatchRoot)
    await writeFile(path.join(mismatchRoot, process.platform === 'win32' ? 'program/soffice.exe' : 'program/soffice'), 'corrupt executable bytes')
    const mismatch = await resolveDfcLibreOfficePluginManagedRuntimeHandle({
      managedRuntimeRootDir: mismatchRoot,
    })
    expect(mismatch).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_runtime_manifest_invalid' })],
    })
    await rm(root, { recursive: true, force: true })
  })

  runRealPackagedSmoke('imports the current svpkg into a controlled short managed root and converts DOCX to PDF', async () => {
    const packagePath = String(process.env[M35_PACKAGED_SVPKG_ENV] ?? '').trim()
    expect(packagePath).toBeTruthy()
    const packageBytes = await readFile(packagePath)
    const catalog = getDfcLibreOfficeFirstPartyRuntimeCatalogEntry()
    const appRoot = resolvePackagedSmokeAppRoot()
    const extractionRoot = await mkdtemp(path.join(os.tmpdir(), 'm35lo-extract-'))
    const imported = await importDfcLibreOfficeRuntimePackageArchive({
      packageBytes,
      extractionRootDir: extractionRoot,
      appManagedRootDir: appRoot,
      repoRootDir: process.cwd(),
      expectedPackageSha256: catalog.acquisitionSource.expectedSha256,
      expectedPackageSizeBytes: catalog.acquisitionSource.expectedSizeBytes,
      platform: 'win32',
      arch: 'x64',
    })

    expect(imported.ok).toBe(true)
    if (!imported.ok || !imported.install.ok) throw new Error('M35 packaged LibreOffice import failed.')
    expect(imported.verification).toMatchObject({
      packageId: DFC_OFFICE_PDF_RUNTIME_PACKAGE_ID,
      pluginId: DFC_OFFICE_PDF_PLUGIN_ID,
      runtimeId: DFC_OFFICE_PDF_RUNTIME_ID,
      packageVersion: catalog.acquisitionSource.packageVersion,
      runtimeVersion: catalog.acquisitionSource.runtimeVersion,
      platform: 'win32',
      arch: 'x64',
      productionApproved: false,
      ownerGated: true,
      experimental: true,
      source: 'downloaded_candidate',
    })
    expect(imported.install.pluginManagement).toMatchObject({
      productionApproved: false,
      verification: expect.objectContaining({
        manifestValidated: true,
        artifactHashVerified: true,
        executableHashVerified: true,
        packageMetadataVerified: true,
        securityPolicyVerified: true,
      }),
    })

    const runtimeRoot = imported.install.activeRuntimeRootDir
    const runtime = await resolveDfcLibreOfficePluginManagedRuntimeHandle({
      managedRuntimeRootDir: runtimeRoot,
      capabilityId: 'docx_to_pdf',
      allowExperimental: true,
      productionOnly: false,
    })
    expect(runtime.ok).toBe(true)
    if (!runtime.ok) throw new Error('M35 packaged runtime handle unavailable.')
    const manifest = await readRuntimeManifest(runtimeRoot)
    await expectRuntimeIdentity(manifest, runtime.handle.executableRelativePath, runtimeRoot)
    expect(runtime.handle).toMatchObject({
      pluginId: DFC_OFFICE_PDF_PLUGIN_ID,
      runtimeId: DFC_OFFICE_PDF_RUNTIME_ID,
      capabilityId: 'docx_to_pdf',
      platform: 'win32',
      arch: 'x64',
      runtimeVersion: catalog.acquisitionSource.runtimeVersion,
      packageVersion: catalog.acquisitionSource.packageVersion,
      source: 'managed_manifest',
      productionApproved: true,
    })
    expect(runtime.handle.executableRelativePath).toBe(manifest.executablePath.replace(/\\/gu, '/'))
    expect(path.isAbsolute(runtime.handle.executablePath)).toBe(true)

    const sandboxRoot = await mkdtemp(path.join(os.tmpdir(), 'm35box-'))
    const planned = createPlannedPathCap({
      runtimeRoot,
      sandboxRoot,
      assetId: 'm35docx',
    })
    expect(planned.pathCap.ok).toBe(true)
    if (!planned.pathCap.ok) throw new Error(planned.pathCap.diagnosticCode)

    let processInput: RunExternalProcessInput | null = null
    const result = await runDfcLibreOfficeDocxToPdfAdapter({
      assetId: 'm35docx',
      sourceBytes: createMinimalDocxBuffer(),
      sourceExtension: 'docx',
      sandboxRootDir: sandboxRoot,
      runtime: runtime.handle,
      processRunner: async (input) => {
        processInput = input
        const cap = evaluateM35PathCaps({
          runtimeRoot,
          sandboxRoot,
          inputPath: planned.inputPath,
          outputDir: planned.outputDir,
          profileDir: planned.profileDir,
        })
        expect(cap.ok).toBe(true)
        expect(input.command).toBe(runtime.handle.executablePath)
        expect(input.shell).toBe(false)
        expect(input.allowBatchEntrypoint).toBe(false)
        expect(input.env).toEqual({})
        return runExternalProcess(input)
      },
      timeoutMs: 300_000,
      cleanupSandbox: true,
    })

    const evidence = buildPackagedSmokeEvidence({
      caseId: 'm35-packaged-short-runtime-short-sandbox',
      pathClass: 'controlled_short',
      pathCap: planned.pathCap,
      validationStage: result.ok ? 'adapter_conversion' : 'adapter_conversion_failed',
      passed: result.ok,
      cleanupStatus: result.cleanupStatus,
      pdfValidation: result.ok ? 'valid_pdf' : 'failed',
      packageIdentity: 'validated',
      runtimeIdentity: 'validated',
      executableIdentity: 'validated',
      workerSemantics: 'verified_by_packaged_command',
    })
    const deepEvidence = await classifyDeepRuntimeSlice({
      sourceRuntimeRoot: runtimeRoot,
      executableRelativePath: runtime.handle.executableRelativePath,
    })

    console.info(JSON.stringify({
      type: 'dfc-libreoffice-m35-packaged-smoke-evidence',
      cases: [evidence],
      deepPathClassification: deepEvidence,
    }, null, 2))

    expect(result).toMatchObject({
      ok: true,
      status: 'succeeded',
      output: expect.objectContaining({
        mime: 'application/pdf',
        extension: 'pdf',
      }),
      cleanupStatus: 'attempted',
    })
    if (!result.ok) throw new Error('M35 packaged LibreOffice DOCX-to-PDF smoke failed.')
    expect(result.output.outputPath.startsWith(planned.outputDir)).toBe(true)
    expect(result.output.bytes).toBeGreaterThan(0)
    expect(processInput).not.toBeNull()
    expect(deepEvidence).toMatchObject({
      deepExecutableStat: 'found',
      deepRuntimeGateRealpathContainment: 'passed',
      spawnSourceClassification: 'managed_descriptor',
      finalClassification: 'downstream_process_long_path_failure',
    })
    expect(await pathExists(sandboxRoot)).toBe(false)

    const serialized = JSON.stringify({ evidence, deepEvidence })
    expect(serialized).not.toContain(packagePath)
    expect(serialized).not.toContain(appRoot)
    expect(serialized).not.toContain(runtimeRoot)
    expect(serialized).not.toContain(sandboxRoot)
    expect(serialized).not.toContain(runtime.handle.executablePath)
    expect(serialized).not.toContain('m35docx.docx')
    expect(serialized).not.toContain('%PDF-')
    expect(JSON.stringify(result.diagnostics)).not.toContain(packagePath)
    expect(JSON.stringify(result.diagnostics)).not.toContain(runtimeRoot)
    expect(JSON.stringify(result.diagnostics)).not.toContain(runtime.handle.executablePath)
  }, 15 * 60 * 1000)
})

function evaluateM35PathCaps(input: Readonly<Record<M35PathKey, string>>): M35PathCapResult {
  const pathLengths: M35PathLengths = {
    runtimeRoot: input.runtimeRoot.length,
    sandboxRoot: input.sandboxRoot.length,
    inputPath: input.inputPath.length,
    outputDir: input.outputDir.length,
    profileDir: input.profileDir.length,
  }
  const exceeded = (Object.keys(M35_PATH_CAPS) as M35PathKey[]).filter((key) => pathLengths[key] > M35_PATH_CAPS[key])
  if (exceeded.length > 0) {
    return {
      ok: false,
      pathLengths,
      diagnosticCode: 'office_pdf_path_policy_exceeded',
      exceeded,
    }
  }
  return {
    ok: true,
    pathLengths,
    diagnosticCode: null,
    exceeded,
  }
}

function buildPackagedSmokeEvidence(input: Readonly<{
  caseId: string
  pathClass: M35PathClass
  pathCap: M35PathCapResult
  validationStage: string
  passed: boolean
  cleanupStatus: M35CleanupStatus
  pdfValidation: M35PdfValidation
  packageIdentity: M35PackagedSmokeEvidence['packageIdentity']
  runtimeIdentity: M35PackagedSmokeEvidence['runtimeIdentity']
  executableIdentity: M35PackagedSmokeEvidence['executableIdentity']
  workerSemantics: M35PackagedSmokeEvidence['workerSemantics']
}>): M35PackagedSmokeEvidence {
  return {
    caseId: input.caseId,
    pathClass: input.pathClass,
    pathLengths: input.pathCap.pathLengths,
    validationStage: input.validationStage,
    passed: input.passed,
    diagnosticCode: input.pathCap.diagnosticCode,
    cleanupStatus: input.cleanupStatus,
    pdfValidation: input.pdfValidation,
    packageIdentity: input.packageIdentity,
    runtimeIdentity: input.runtimeIdentity,
    executableIdentity: input.executableIdentity,
    workerSemantics: input.workerSemantics,
  }
}

function createPlannedPathCap(input: Readonly<{
  runtimeRoot: string
  sandboxRoot: string
  assetId: string
}>): Readonly<{
  inputPath: string
  outputDir: string
  profileDir: string
  pathCap: M35PathCapResult
}> {
  const plan = createDfcConversionSandboxPlan({
    engineId: 'libreoffice',
    inputAssetId: input.assetId,
    targetKind: 'pdf_attachment',
    sandboxRootDir: input.sandboxRoot,
    sourceExtension: 'docx',
    expectedOutput: {
      extension: 'pdf',
      mime: 'application/pdf',
    },
    timeoutMs: 300_000,
  })
  if (!plan.ok) throw new Error(plan.diagnostics[0]?.code ?? 'dfc_sandbox_plan_blocked')
  const profileDir = path.join(plan.request.workingDir, 'libreoffice-profile')
  return {
    inputPath: plan.request.sandboxInputPath,
    outputDir: plan.request.sandboxOutputDir,
    profileDir,
    pathCap: evaluateM35PathCaps({
      runtimeRoot: input.runtimeRoot,
      sandboxRoot: plan.request.sandboxRootDir,
      inputPath: plan.request.sandboxInputPath,
      outputDir: plan.request.sandboxOutputDir,
      profileDir,
    }),
  }
}

async function classifyDeepRuntimeSlice(input: Readonly<{
  sourceRuntimeRoot: string
  executableRelativePath: string
}>): Promise<M35DeepClassificationEvidence> {
  const base = await mkdtemp(path.join(os.tmpdir(), 'm35deep-'))
  let deepRoot = path.join(base, 'runtime')
  let index = 1
  while (deepRoot.length <= M35_PATH_CAPS.runtimeRoot + 50) {
    deepRoot = path.join(
      base,
      ...Array.from({ length: index }, (_, offset) => `segment-${String(offset + 1).padStart(3, '0')}-deep-runtime-classification`),
      'libreoffice-office-pdf'
    )
    index += 1
  }
  const executableRelativePath = input.executableRelativePath.replace(/\\/gu, '/')
  const executablePath = path.join(deepRoot, ...executableRelativePath.split('/'))
  await mkdir(path.dirname(executablePath), { recursive: true })
  await copyFile(path.join(input.sourceRuntimeRoot, 'manifest.json'), path.join(deepRoot, 'manifest.json'))
  await copyFile(path.join(input.sourceRuntimeRoot, ...executableRelativePath.split('/')), executablePath)

  let cleanupStatus: M35CleanupStatus = 'not_started'
  try {
    const executableStat: M35DeepExecutableStat = await stat(executablePath).then((value) => value.isFile() ? 'found' : 'missing').catch(() => 'missing')
    let runtimeGateContainment: M35DeepRuntimeGateContainment = 'not_reached'
    let spawnSourceClassification: M35SpawnSourceClassification = 'not_reached'
    let diagnosticCode: string | null = null
    if (executableStat === 'found') {
      const runtime = await resolveDfcLibreOfficePluginManagedRuntimeHandle({
        managedRuntimeRootDir: deepRoot,
        capabilityId: 'docx_to_pdf',
        allowExperimental: true,
        productionOnly: false,
      })
      if (runtime.ok) {
        const realRoot = await realpath(deepRoot).catch(() => null)
        const realExecutable = await realpath(runtime.handle.executablePath).catch(() => null)
        runtimeGateContainment = realRoot && realExecutable && isPathInside(realRoot, realExecutable) ? 'passed' : 'failed'
        spawnSourceClassification = path.isAbsolute(runtime.handle.executablePath)
          && path.resolve(runtime.handle.executablePath) === path.resolve(executablePath)
          ? 'managed_descriptor'
          : 'path_lookup_detected'
      } else {
        runtimeGateContainment = 'failed'
        diagnosticCode = runtime.diagnostics[0]?.code ?? 'office_pdf_runtime_path_rejected'
      }
    } else {
      diagnosticCode = 'office_pdf_runtime_executable_missing'
    }
    const finalClassification = classifyDeepRuntimeFailure({
      executableStat,
      runtimeGateContainment,
      spawnSourceClassification,
    })
    cleanupStatus = await rm(base, { recursive: true, force: true }).then(() => 'attempted' as const).catch(() => 'failed' as const)
    return {
      caseId: 'm35-deep-runtime-classification',
      pathClass: 'deep_runtime',
      pathLength: deepRoot.length,
      validationStage: 'deep_path_classification',
      passed: finalClassification === 'downstream_process_long_path_failure',
      diagnosticCode,
      cleanupStatus,
      pdfValidation: 'not_reached',
      deepExecutableStat: executableStat,
      deepRuntimeGateRealpathContainment: runtimeGateContainment,
      spawnSourceClassification,
      finalClassification,
    }
  } finally {
    if (cleanupStatus === 'not_started') {
      await rm(base, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}

function classifyDeepRuntimeFailure(input: Readonly<{
  executableStat: M35DeepExecutableStat
  runtimeGateContainment: M35DeepRuntimeGateContainment
  spawnSourceClassification: M35SpawnSourceClassification
}>): M35DeepFinalClassification {
  if (input.executableStat === 'missing') return 'starverse_path_resolution_bug'
  if (input.runtimeGateContainment === 'failed') return 'runtime_gate_rejection'
  if (input.spawnSourceClassification === 'path_lookup_detected') return 'starverse_path_resolution_bug'
  if (
    input.executableStat === 'found' &&
    input.runtimeGateContainment === 'passed' &&
    input.spawnSourceClassification === 'managed_descriptor'
  ) {
    return 'downstream_process_long_path_failure'
  }
  return 'inconclusive'
}

async function readRuntimeManifest(runtimeRoot: string): Promise<DfcOfficePdfRuntimeManifest> {
  return JSON.parse(await readFile(path.join(runtimeRoot, 'manifest.json'), 'utf8')) as DfcOfficePdfRuntimeManifest
}

async function expectRuntimeIdentity(
  manifest: DfcOfficePdfRuntimeManifest,
  executableRelativePath: string,
  runtimeRoot: string
): Promise<void> {
  expect(manifest.pluginId).toBe(DFC_OFFICE_PDF_PLUGIN_ID)
  expect(manifest.packageId).toBe(DFC_OFFICE_PDF_RUNTIME_PACKAGE_ID)
  expect(manifest.runtimePackageId).toBe(DFC_OFFICE_PDF_RUNTIME_PACKAGE_ID)
  expect(manifest.runtimeId).toBe(DFC_OFFICE_PDF_RUNTIME_ID)
  expect(manifest.platform).toBe('win32')
  expect(manifest.arch).toBe('x64')
  expect(manifest.capabilities).toEqual(expect.arrayContaining([...DFC_OFFICE_PDF_CAPABILITIES]))
  expect(executableRelativePath).toBe(manifest.executablePath.replace(/\\/gu, '/'))
  expect(manifest.executableSha256).toMatch(/^[a-f0-9]{64}$/u)
  expect(typeof manifest.executableSizeBytes).toBe('number')
  const executableBytes = await readFile(path.join(runtimeRoot, ...executableRelativePath.split('/')))
  expect(createHash('sha256').update(executableBytes).digest('hex')).toBe(manifest.executableSha256)
  expect(executableBytes.byteLength).toBe(manifest.executableSizeBytes)
}

function resolvePackagedSmokeAppRoot(): string {
  const explicit = String(process.env[M35_PACKAGED_APP_ROOT_ENV] ?? '').trim()
  return explicit ? path.resolve(explicit) : path.join(os.tmpdir(), 'm35lo-app')
}

async function writeMinimalRuntimeFixture(root: string, overrides: Partial<DfcOfficePdfRuntimeManifest> = {}): Promise<void> {
  const executablePath = process.platform === 'win32' ? 'program/soffice.exe' : 'program/soffice'
  const executable = Buffer.from('fake soffice executable')
  await mkdir(path.join(root, 'program'), { recursive: true })
  await copyFixtureExecutable(path.join(root, ...executablePath.split('/')), executable)
  await copyFixtureManifest(root, executablePath, executable, overrides)
}

async function copyFixtureExecutable(executablePath: string, executable: Buffer): Promise<void> {
  await mkdir(path.dirname(executablePath), { recursive: true })
  await writeFile(executablePath, executable)
}

async function copyFixtureManifest(
  root: string,
  executablePath: string,
  executable: Buffer,
  overrides: Partial<DfcOfficePdfRuntimeManifest>
): Promise<void> {
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify({
    manifestSchemaVersion: '1',
    pluginId: DFC_OFFICE_PDF_PLUGIN_ID,
    packageId: DFC_OFFICE_PDF_RUNTIME_PACKAGE_ID,
    runtimePackageId: DFC_OFFICE_PDF_RUNTIME_PACKAGE_ID,
    engineId: 'libreoffice',
    runtimeId: DFC_OFFICE_PDF_RUNTIME_ID,
    displayName: 'LibreOffice Office PDF',
    pluginVersion: '0.1.0',
    runtimeKind: 'managed_external_process',
    enabled: true,
    platform: process.platform,
    arch: process.arch,
    capabilities: [...DFC_OFFICE_PDF_CAPABILITIES],
    executablePath,
    libreOfficeVersion: '24.8.0',
    packageVersion: '2026.06.01',
    artifactSha256: 'a'.repeat(64),
    executableSha256: createHash('sha256').update(executable).digest('hex'),
    executableSizeBytes: executable.byteLength,
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

function createMinimalDocxBuffer(): Buffer {
  return createZipBuffer([
    {
      name: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
    },
    {
      name: '_rels/.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
    },
    {
      name: 'word/document.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Starverse M35 packaged smoke</w:t></w:r></w:p>
    <w:p><w:r><w:t>Managed package DOCX to PDF conversion.</w:t></w:r></w:p>
    <w:sectPr/>
  </w:body>
</w:document>`,
    },
  ])
}

function createZipBuffer(files: readonly { name: string; content: string | Buffer }[]): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8')
    const content = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, 'utf8')
    const crc = crc32(content)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(content.length, 18)
    local.writeUInt32LE(content.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    localParts.push(local, name, content)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(content.length, 20)
    central.writeUInt32LE(content.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(offset, 42)
    centralParts.push(central, name)
    offset += local.length + name.length + content.length
  }
  const centralDirectory = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralDirectory.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)
  return Buffer.concat([...localParts, centralDirectory, end])
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  return value >>> 0
})

function isPathInside(root: string, candidate: string): boolean {
  const resolvedRoot = path.resolve(root)
  const resolvedCandidate = path.resolve(candidate)
  const rootForCompare = process.platform === 'win32' ? resolvedRoot.toLowerCase() : resolvedRoot
  const candidateForCompare = process.platform === 'win32' ? resolvedCandidate.toLowerCase() : resolvedCandidate
  return candidateForCompare === rootForCompare || candidateForCompare.startsWith(rootForCompare.endsWith(path.sep) ? rootForCompare : `${rootForCompare}${path.sep}`)
}

async function pathExists(target: string): Promise<boolean> {
  return stat(target).then(() => true).catch(() => false)
}
