import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ExternalProcessRunResult, RunExternalProcessInput } from '../../src/next/file-type/externalProcessRunner'
import {
  completeDfcSandboxRun,
  createDfcConversionSandboxPlan,
  mapDfcSandboxProcessPolicy,
  sanitizeDfcSandboxDiagnostic,
  type DfcSandboxCleanupStatus,
  type DfcSandboxDiagnostic,
} from './dfcConversionSandbox'
import {
  DFC_OFFICE_PDF_ENGINE_ID,
  type DfcLibreOfficePluginManagedRuntimeHandle,
} from './dfcManagedLibreOfficeRuntime'

export const DFC_LIBREOFFICE_PDF_ADAPTER_ID = 'libreoffice-docx-pdf-adapter'
export const DFC_LIBREOFFICE_PDF_CONVERTER_NAME = 'starverse-libreoffice-docx-pdf'
export const DFC_LIBREOFFICE_PDF_CONVERTER_VERSION = 'skeleton-1'
export const DFC_LIBREOFFICE_PDF_PATH_POLICY_EXCEEDED = 'office_pdf_path_policy_exceeded'
export const DFC_LIBREOFFICE_WINDOWS_X64_PATH_CAPS = Object.freeze({
  runtimeRoot: 120,
  sandboxRoot: 80,
  inputPath: 130,
  outputDir: 90,
  profileDir: 110,
})

export type DfcLibreOfficePdfProcessRunner = (input: RunExternalProcessInput) => Promise<ExternalProcessRunResult>
export type DfcLibreOfficePdfPathPolicyKey = keyof typeof DFC_LIBREOFFICE_WINDOWS_X64_PATH_CAPS
export type DfcLibreOfficePdfPathLengths = Readonly<Record<DfcLibreOfficePdfPathPolicyKey, number>>
export type DfcLibreOfficePdfPathPolicyResult =
  | Readonly<{ ok: true; active: boolean; pathLengths: DfcLibreOfficePdfPathLengths; exceeded: readonly DfcLibreOfficePdfPathPolicyKey[]; diagnosticCode: null }>
  | Readonly<{ ok: false; active: true; pathLengths: DfcLibreOfficePdfPathLengths; exceeded: readonly DfcLibreOfficePdfPathPolicyKey[]; diagnosticCode: typeof DFC_LIBREOFFICE_PDF_PATH_POLICY_EXCEEDED }>

export type DfcLibreOfficePdfAdapterInput = Readonly<{
  assetId: string
  sourceBytes: Uint8Array
  sourceExtension: string
  sandboxRootDir: string
  runtime: DfcLibreOfficePluginManagedRuntimeHandle
  timeoutMs?: number | null
  processRunner?: DfcLibreOfficePdfProcessRunner | null
  cleanupSandbox?: boolean | null
}>

export type DfcLibreOfficePdfOutputDescriptor = Readonly<{
  outputPath: string
  mime: 'application/pdf'
  extension: 'pdf'
  bytes: number
}>

export type DfcLibreOfficePdfAdapterResult =
  | Readonly<{
      ok: true
      status: 'succeeded'
      output: DfcLibreOfficePdfOutputDescriptor
      diagnostics: readonly DfcSandboxDiagnostic[]
      cleanupStatus: DfcSandboxCleanupStatus
    }>
  | Readonly<{
      ok: false
      status: 'failed' | 'blocked' | 'timed_out'
      output: null
      diagnostics: readonly DfcSandboxDiagnostic[]
      cleanupStatus: DfcSandboxCleanupStatus
    }>

export type DfcLibreOfficePdfOutputValidation =
  | Readonly<{ ok: true; output: DfcLibreOfficePdfOutputDescriptor; diagnostics: readonly DfcSandboxDiagnostic[] }>
  | Readonly<{ ok: false; diagnostics: readonly DfcSandboxDiagnostic[] }>

export async function runDfcLibreOfficeDocxToPdfAdapter(
  input: DfcLibreOfficePdfAdapterInput
): Promise<DfcLibreOfficePdfAdapterResult> {
  if (normalizeExtension(input.sourceExtension) !== 'docx') {
    return failClosed('blocked', 'office_pdf_source_unsupported', 'Office PDF adapter skeleton only accepts DOCX input.', 'not_requested')
  }
  if (!input.processRunner) {
    return failClosed('blocked', 'office_pdf_process_runner_unavailable', 'Office PDF adapter skeleton requires an injected process runner.', 'not_requested')
  }

  const timeoutMs = normalizeTimeoutMs(input.timeoutMs)
  const plan = createDfcConversionSandboxPlan({
    engineId: DFC_OFFICE_PDF_ENGINE_ID,
    inputAssetId: input.assetId,
    targetKind: 'pdf_attachment',
    sandboxRootDir: input.sandboxRootDir,
    sourceExtension: 'docx',
    expectedOutput: {
      extension: 'pdf',
      mime: 'application/pdf',
    },
    timeoutMs,
  })
  if (!plan.ok) {
    return failClosed('blocked', plan.diagnostics[0]?.code ?? 'office_pdf_sandbox_plan_blocked', plan.diagnostics[0]?.message ?? 'Office PDF sandbox plan was blocked.', 'not_requested')
  }

  const processPolicy = mapDfcSandboxProcessPolicy({
    command: input.runtime.executablePath,
    timeoutMs,
  })
  if (!processPolicy.ok) {
    return failClosed('blocked', processPolicy.diagnostics[0]?.code ?? 'office_pdf_process_policy_blocked', processPolicy.diagnostics[0]?.message ?? 'Office PDF process policy was blocked.', 'not_requested')
  }

  const profileDir = path.join(plan.request.workingDir, 'libreoffice-profile')
  const pathPolicy = evaluateDfcLibreOfficePdfPathPolicy({
    runtimeRoot: input.runtime.runtime.managedRuntimeRootDir,
    sandboxRoot: plan.request.sandboxRootDir,
    inputPath: plan.request.sandboxInputPath,
    outputDir: plan.request.sandboxOutputDir,
    profileDir,
    platform: input.runtime.platform,
    arch: input.runtime.arch,
    runtimeSource: input.runtime.source,
  })
  if (!pathPolicy.ok) {
    return failClosed('blocked', pathPolicy.diagnosticCode, 'Office PDF conversion is blocked by the controlled short-path policy.', 'not_requested')
  }

  await mkdir(path.dirname(plan.request.sandboxInputPath), { recursive: true })
  await mkdir(plan.request.sandboxOutputDir, { recursive: true })
  await mkdir(plan.request.workingDir, { recursive: true })
  await mkdir(profileDir, { recursive: true })
  await writeFile(plan.request.sandboxInputPath, Buffer.from(input.sourceBytes))

  const processInput: RunExternalProcessInput = {
    command: processPolicy.policy.command,
    args: buildLibreOfficePdfArgs({
      inputPath: plan.request.sandboxInputPath,
      outputDir: plan.request.sandboxOutputDir,
      profileDir,
    }),
    cwd: plan.request.workingDir,
    env: {} as NodeJS.ProcessEnv,
    mode: 'conversion',
    timeoutMs: processPolicy.policy.timeoutMs,
    maxStdoutBytes: processPolicy.policy.maxStdoutBytes,
    maxStderrBytes: processPolicy.policy.maxStderrBytes,
    terminationGraceMs: processPolicy.policy.terminationGraceMs,
    shell: false,
    allowBatchEntrypoint: false,
  }

  const processResult = await input.processRunner(processInput)
  const processFailure = processFailureDiagnostic(processResult)
  if (processFailure) {
    const cleanupStatus = await cleanupIfRequested(input.cleanupSandbox, plan.request.sandboxRootDir)
    return {
      ok: false,
      status: processFailure.status,
      output: null,
      diagnostics: [processFailure.diagnostic],
      cleanupStatus,
    }
  }

  const validation = await validateDfcLibreOfficePdfOutput({
    sandboxOutputDir: plan.request.sandboxOutputDir,
    expectedOutputPath: plan.request.sandboxOutputPath,
  })
  if (!validation.ok) {
    const cleanupStatus = await cleanupIfRequested(input.cleanupSandbox, plan.request.sandboxRootDir)
    return {
      ok: false,
      status: 'blocked',
      output: null,
      diagnostics: validation.diagnostics,
      cleanupStatus,
    }
  }

  const outcome = await completeDfcSandboxRun({
    plan: plan.request,
    engineResult: {
      status: 'succeeded',
      outputPath: validation.output.outputPath,
    },
    cleanup: input.cleanupSandbox === true
      ? () => rm(plan.request.sandboxRootDir, { recursive: true, force: true })
      : null,
  })
  if (!outcome.ok || !outcome.derivedAsset) {
    return {
      ok: false,
      status: outcome.status === 'blocked' ? 'blocked' : 'failed',
      output: null,
      diagnostics: outcome.diagnostics,
      cleanupStatus: outcome.cleanupStatus,
    }
  }

  return {
    ok: true,
    status: 'succeeded',
    output: validation.output,
    diagnostics: validation.diagnostics,
    cleanupStatus: outcome.cleanupStatus,
  }
}

export function buildLibreOfficePdfArgs(input: Readonly<{
  inputPath: string
  outputDir: string
  profileDir: string
}>): readonly string[] {
  return [
    '--headless',
    '--invisible',
    '--nologo',
    '--nodefault',
    '--nofirststartwizard',
    '--nolockcheck',
    '--norestore',
    '--convert-to',
    'pdf',
    '--outdir',
    input.outputDir,
    `-env:UserInstallation=${pathToFileURL(input.profileDir).href}`,
    input.inputPath,
  ]
}

export function evaluateDfcLibreOfficePdfPathPolicy(input: Readonly<{
  runtimeRoot: string
  sandboxRoot: string
  inputPath: string
  outputDir: string
  profileDir: string
  platform?: string | null
  arch?: string | null
  runtimeSource?: string | null
}>): DfcLibreOfficePdfPathPolicyResult {
  const pathLengths: DfcLibreOfficePdfPathLengths = {
    runtimeRoot: String(input.runtimeRoot ?? '').length,
    sandboxRoot: String(input.sandboxRoot ?? '').length,
    inputPath: String(input.inputPath ?? '').length,
    outputDir: String(input.outputDir ?? '').length,
    profileDir: String(input.profileDir ?? '').length,
  }
  const active = input.platform === 'win32'
    && (input.arch === 'x64' || input.arch === null || input.arch === undefined)
    && input.runtimeSource !== 'fake_seam'
  if (!active) {
    return { ok: true, active: false, pathLengths, exceeded: [], diagnosticCode: null }
  }
  const exceeded = (Object.keys(DFC_LIBREOFFICE_WINDOWS_X64_PATH_CAPS) as DfcLibreOfficePdfPathPolicyKey[])
    .filter((key) => pathLengths[key] > DFC_LIBREOFFICE_WINDOWS_X64_PATH_CAPS[key])
  if (exceeded.length === 0) {
    return { ok: true, active: true, pathLengths, exceeded, diagnosticCode: null }
  }
  return { ok: false, active: true, pathLengths, exceeded, diagnosticCode: DFC_LIBREOFFICE_PDF_PATH_POLICY_EXCEEDED }
}

export async function validateDfcLibreOfficePdfOutput(input: Readonly<{
  sandboxOutputDir: string
  expectedOutputPath: string
}>): Promise<DfcLibreOfficePdfOutputValidation> {
  const outputDir = path.resolve(input.sandboxOutputDir)
  const expected = path.resolve(input.expectedOutputPath)
  if (!isPathInside(outputDir, expected)) {
    return invalidOutput('office_pdf_output_path_rejected', 'Office PDF output path escaped the controlled output directory.')
  }

  const entries = await readdir(outputDir).catch(() => [])
  const pdfEntries = entries.filter((entry) => entry.toLowerCase().endsWith('.pdf'))
  if (pdfEntries.length !== 1 || path.resolve(outputDir, pdfEntries[0] ?? '') !== expected) {
    return invalidOutput(pdfEntries.length === 0 ? 'office_pdf_output_missing' : 'office_pdf_output_ambiguous', 'Office PDF output is missing or ambiguous.')
  }

  const outputStat = await stat(expected).catch(() => null)
  if (!outputStat?.isFile()) {
    return invalidOutput('office_pdf_output_missing', 'Office PDF output is missing.')
  }
  const bytes = await readFile(expected).catch(() => null)
  if (!bytes || bytes.byteLength === 0 || bytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
    return invalidOutput('office_pdf_output_invalid', 'Office PDF output is not a valid PDF.')
  }
  return {
    ok: true,
    output: {
      outputPath: expected,
      mime: 'application/pdf',
      extension: 'pdf',
      bytes: bytes.byteLength,
    },
    diagnostics: [],
  }
}

function buildDiagnostic(code: string, message: string, detail?: Partial<Pick<RunExternalProcessInput, 'command' | 'env'>> & { stdout?: string; stderr?: string }): DfcSandboxDiagnostic {
  return sanitizeDfcSandboxDiagnostic({
    code,
    message,
    stdout: detail?.stdout,
    stderr: detail?.stderr,
    command: detail?.command,
    env: detail?.env,
  })
}

function processFailureDiagnostic(result: ExternalProcessRunResult): Readonly<{ status: 'failed' | 'timed_out'; diagnostic: DfcSandboxDiagnostic } | null> {
  if (result.timedOut || result.errorCode === 'process_timeout') {
    return {
      status: 'timed_out',
      diagnostic: buildDiagnostic('office_pdf_process_timeout', 'Office PDF conversion process timed out.', result),
    }
  }
  if (result.exitCode !== 0 || result.errorCode) {
    return {
      status: 'failed',
      diagnostic: buildDiagnostic(result.errorCode ?? 'office_pdf_process_failed', 'Office PDF conversion process failed.', result),
    }
  }
  return null
}

async function cleanupIfRequested(cleanupSandbox: boolean | null | undefined, sandboxRootDir: string): Promise<DfcSandboxCleanupStatus> {
  if (cleanupSandbox !== true) return 'not_requested'
  try {
    await rm(sandboxRootDir, { recursive: true, force: true })
    return 'attempted'
  } catch {
    return 'failed'
  }
}

function failClosed(status: 'failed' | 'blocked' | 'timed_out', code: string, message: string, cleanupStatus: DfcSandboxCleanupStatus): DfcLibreOfficePdfAdapterResult {
  return {
    ok: false,
    status,
    output: null,
    diagnostics: [buildDiagnostic(code, message)],
    cleanupStatus,
  }
}

function invalidOutput(code: string, message: string): DfcLibreOfficePdfOutputValidation {
  return {
    ok: false,
    diagnostics: [buildDiagnostic(code, message)],
  }
}

function normalizeExtension(value: string): string {
  return String(value ?? '').trim().replace(/^\.+/u, '').toLowerCase()
}

function normalizeTimeoutMs(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 60_000
}

function isPathInside(root: string, candidate: string): boolean {
  const resolvedRoot = path.resolve(root)
  const resolvedCandidate = path.resolve(candidate)
  const rootForCompare = process.platform === 'win32' ? resolvedRoot.toLowerCase() : resolvedRoot
  const candidateForCompare = process.platform === 'win32' ? resolvedCandidate.toLowerCase() : resolvedCandidate
  return candidateForCompare === rootForCompare || candidateForCompare.startsWith(rootForCompare.endsWith(path.sep) ? rootForCompare : `${rootForCompare}${path.sep}`)
}
