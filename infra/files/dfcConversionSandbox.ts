import path from 'node:path'
import {
  evaluateExternalProcessPolicy,
  type ExternalProcessPolicyInput,
  type ResolvedExternalProcessPolicy,
} from '../../src/next/file-type/externalProcessPolicy'
import type { DfcDerivedTargetKind } from '../../src/shared/files/documentFormatConversion'

export type DfcSandboxCleanupStatus = 'not_requested' | 'attempted' | 'failed'

export type DfcSandboxDiagnostic = Readonly<{
  code: string
  message: string
}>

export type DfcSandboxOutputSpec = Readonly<{
  extension: string
  mime: string
}>

export type DfcSandboxPlanInput = Readonly<{
  engineId: string
  inputAssetId: string
  targetKind: DfcDerivedTargetKind
  sandboxRootDir: string
  sourceExtension?: string | null
  expectedOutput: DfcSandboxOutputSpec
  timeoutMs?: number | null
  terminationGraceMs?: number | null
}>

export type DfcSandboxEngineAdapterRequest = Readonly<{
  engineId: string
  inputAssetId: string
  targetKind: DfcDerivedTargetKind
  expectedOutputExtension: string
  expectedOutputMime: string
  sandboxRootDir: string
  sandboxInputPath: string
  sandboxOutputDir: string
  sandboxOutputPath: string
  workingDir: string
  processPolicy: ResolvedExternalProcessPolicy
}>

export type DfcSandboxPlan =
  | Readonly<{
      ok: true
      request: DfcSandboxEngineAdapterRequest
      diagnostics: readonly DfcSandboxDiagnostic[]
    }>
  | Readonly<{
      ok: false
      status: 'blocked'
      diagnostics: readonly DfcSandboxDiagnostic[]
      derivedAsset: null
    }>

export type DfcSandboxEngineResult = Readonly<{
  status: 'succeeded' | 'failed' | 'timeout'
  outputPath?: string | null
  errorCode?: string | null
  message?: string | null
  stdout?: string | null
  stderr?: string | null
  command?: string | null
  env?: Record<string, string | null | undefined> | null
}>

export type DfcSandboxDerivedAssetCandidate = Readonly<{
  inputAssetId: string
  targetKind: DfcDerivedTargetKind
  mime: string
  outputPath: string
}>

export type DfcSandboxRunOutcome = Readonly<{
  ok: boolean
  status: 'ready' | 'failed' | 'blocked'
  engineId: string
  inputAssetId: string
  targetKind: DfcDerivedTargetKind
  derivedAsset: DfcSandboxDerivedAssetCandidate | null
  diagnostics: readonly DfcSandboxDiagnostic[]
  cleanupStatus: DfcSandboxCleanupStatus
}>

export type DfcSandboxRendererSummary = Readonly<{
  status: DfcSandboxRunOutcome['status']
  engineId: string
  inputAssetId: string
  targetKind: DfcDerivedTargetKind
  diagnostics: readonly DfcSandboxDiagnostic[]
  cleanupStatus: DfcSandboxCleanupStatus
}>

type Cleanup = () => Promise<void> | void

const DEFAULT_ENGINE_COMMAND = 'dfc-conversion-engine'
const SAFE_ID_RE = /[^A-Za-z0-9._-]+/g
const WINDOWS_DRIVE_RE = /^[A-Za-z]:[\\/]/u
const UNC_RE = /^\\\\/u
const NUL_RE = /\0/u
const WINDOWS_PATH_RE = /\b[A-Za-z]:\\[^\s"'`]+/g
const UNIX_PATH_RE = /(?:\/Users\/|\/home\/|\/mnt\/|\/var\/|\/tmp\/)[^\s"'`]+/g
const FILE_URL_RE = /\bfile:\/\/[^\s"'`)]+/gi
const URL_RE = /\bhttps?:\/\/[^\s"'`)]+/gi
const TOKEN_ASSIGNMENT_RE = /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|content[_-]?token|token|secret|password)(\s*[:=]\s*)[^\s"',;}]+/gi
const FULL_HASH_RE = /\b(fullHash|sha256|hash)(\s*[:=]\s*)[A-Fa-f0-9]{16,}\b/g
const STORAGE_REF_RE = /\bstorage(?:Ref|Uri)(\s*[:=]\s*)[^\s"',;}]+/gi
const FILE_BODY_RE = /\bfile\s+body\s*:\s*[^\r\n"'`]+/gi
const JWT_RE = /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g
const BASE64_RE = /\b[A-Za-z0-9+/]{80,}={0,2}\b/g

export function createDfcConversionSandboxPlan(input: DfcSandboxPlanInput): DfcSandboxPlan {
  const root = normalizeAbsoluteDir(input.sandboxRootDir)
  if (!root) {
    return blocked('dfc_sandbox_root_invalid', 'DFC conversion sandbox root is invalid.')
  }

  const engineId = safeSegment(input.engineId, 'engine')
  const assetId = safeSegment(input.inputAssetId, 'asset')
  const inputExt = normalizeExtension(input.sourceExtension, 'bin')
  const outputExt = normalizeExtension(input.expectedOutput.extension, '')
  const outputMime = String(input.expectedOutput.mime ?? '').trim()
  if (!outputExt || !outputMime) {
    return blocked('dfc_sandbox_output_spec_invalid', 'DFC conversion sandbox output spec is invalid.')
  }

  const inputDir = path.join(root, 'input')
  const outputDir = path.join(root, 'output')
  const workingDir = path.join(root, 'work')
  const inputPath = path.join(inputDir, `${assetId}.${inputExt}`)
  const output = resolveDfcSandboxOutputPath(outputDir, `${assetId}.${outputExt}`)
  if (!output.ok) return blocked(output.code, output.message)

  const policy = mapDfcSandboxProcessPolicy({
    command: DEFAULT_ENGINE_COMMAND,
    timeoutMs: input.timeoutMs,
    terminationGraceMs: input.terminationGraceMs,
  })
  if (!policy.ok) {
    return blocked(policy.diagnostics[0]?.code ?? 'dfc_sandbox_policy_blocked', policy.diagnostics[0]?.message ?? 'DFC conversion sandbox process policy was blocked.')
  }

  return {
    ok: true,
    diagnostics: [],
    request: {
      engineId,
      inputAssetId: input.inputAssetId,
      targetKind: input.targetKind,
      expectedOutputExtension: outputExt,
      expectedOutputMime: outputMime,
      sandboxRootDir: root,
      sandboxInputPath: inputPath,
      sandboxOutputDir: outputDir,
      sandboxOutputPath: output.path,
      workingDir,
      processPolicy: policy.policy,
    },
  }
}

export function resolveDfcSandboxOutputPath(
  sandboxOutputDir: string,
  outputName: string
): Readonly<{ ok: true; path: string } | { ok: false; code: string; message: string }> {
  const outputDir = normalizeAbsoluteDir(sandboxOutputDir)
  const name = String(outputName ?? '').trim()
  if (!outputDir || !name) return rejectedOutput('dfc_sandbox_output_path_invalid')
  if (NUL_RE.test(name)) return rejectedOutput('dfc_sandbox_output_path_nul')
  if (UNC_RE.test(name)) return rejectedOutput('dfc_sandbox_output_path_unc')
  if (WINDOWS_DRIVE_RE.test(name)) return rejectedOutput('dfc_sandbox_output_path_drive_escape')
  if (path.isAbsolute(name)) return rejectedOutput('dfc_sandbox_output_path_absolute')

  const parts = name.split(/[\\/]+/u)
  if (parts.some((part) => part === '..')) return rejectedOutput('dfc_sandbox_output_path_traversal')

  const resolved = path.resolve(outputDir, name)
  if (!isPathInside(outputDir, resolved)) return rejectedOutput('dfc_sandbox_output_path_escape')
  return { ok: true, path: resolved }
}

export function mapDfcSandboxProcessPolicy(
  input: Omit<ExternalProcessPolicyInput, 'mode' | 'shell' | 'allowBatchEntrypoint'>
): Readonly<{ ok: true; policy: ResolvedExternalProcessPolicy } | { ok: false; diagnostics: readonly DfcSandboxDiagnostic[] }> {
  const result = evaluateExternalProcessPolicy({
    ...input,
    mode: 'conversion',
    shell: false,
    allowBatchEntrypoint: false,
  })
  if (result.ok) return { ok: true, policy: result.policy }
  return {
    ok: false,
    diagnostics: [diagnostic(result.errorCode, result.message)],
  }
}

export async function completeDfcSandboxRun(input: Readonly<{
  plan: DfcSandboxEngineAdapterRequest
  engineResult: DfcSandboxEngineResult
  cleanup?: Cleanup | null
}>): Promise<DfcSandboxRunOutcome> {
  const cleanupStatus = await attemptCleanup(input.cleanup)
  const engineResult = input.engineResult
  const diagnostics = diagnosticsFromEngineResult(engineResult)

  if (engineResult.status !== 'succeeded') {
    return failClosed(input.plan, engineResult.status === 'timeout' ? 'blocked' : 'failed', diagnostics, cleanupStatus)
  }

  const outputPath = String(engineResult.outputPath ?? '').trim()
  if (!outputPath || !isPathInside(input.plan.sandboxOutputDir, outputPath)) {
    return failClosed(input.plan, 'blocked', [
      ...diagnostics,
      diagnostic('dfc_sandbox_output_path_escape', 'DFC conversion engine output escaped the sandbox output directory.'),
    ], cleanupStatus)
  }

  return {
    ok: true,
    status: 'ready',
    engineId: input.plan.engineId,
    inputAssetId: input.plan.inputAssetId,
    targetKind: input.plan.targetKind,
    derivedAsset: {
      inputAssetId: input.plan.inputAssetId,
      targetKind: input.plan.targetKind,
      mime: input.plan.expectedOutputMime,
      outputPath,
    },
    diagnostics,
    cleanupStatus,
  }
}

export function sanitizeDfcSandboxDiagnostic(input: Readonly<{
  code: string
  message?: string | null
  stdout?: string | null
  stderr?: string | null
  command?: string | null
  env?: Record<string, string | null | undefined> | null
}>): DfcSandboxDiagnostic {
  const segments = [
    input.message,
    input.stdout ? `stdout: ${input.stdout}` : null,
    input.stderr ? `stderr: ${input.stderr}` : null,
    input.command ? 'command: [redacted-command]' : null,
    input.env ? 'env: [redacted-env]' : null,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  return diagnostic(input.code, segments.length > 0 ? segments.join(' ') : input.code)
}

export function toDfcSandboxRendererSummary(outcome: DfcSandboxRunOutcome): DfcSandboxRendererSummary {
  return {
    status: outcome.status,
    engineId: outcome.engineId,
    inputAssetId: outcome.inputAssetId,
    targetKind: outcome.targetKind,
    diagnostics: outcome.diagnostics,
    cleanupStatus: outcome.cleanupStatus,
  }
}

function diagnosticsFromEngineResult(result: DfcSandboxEngineResult): readonly DfcSandboxDiagnostic[] {
  const code = result.errorCode ?? (
    result.status === 'timeout'
      ? 'dfc_sandbox_engine_timeout'
      : result.status === 'failed'
        ? 'dfc_sandbox_engine_failed'
        : 'dfc_sandbox_engine_completed'
  )
  if (result.status === 'succeeded' && !result.message && !result.stdout && !result.stderr && !result.command && !result.env) {
    return []
  }
  return [sanitizeDfcSandboxDiagnostic({
    code,
    message: result.message,
    stdout: result.stdout,
    stderr: result.stderr,
    command: result.command,
    env: result.env,
  })]
}

function failClosed(
  plan: DfcSandboxEngineAdapterRequest,
  status: 'failed' | 'blocked',
  diagnostics: readonly DfcSandboxDiagnostic[],
  cleanupStatus: DfcSandboxCleanupStatus
): DfcSandboxRunOutcome {
  return {
    ok: false,
    status,
    engineId: plan.engineId,
    inputAssetId: plan.inputAssetId,
    targetKind: plan.targetKind,
    derivedAsset: null,
    diagnostics,
    cleanupStatus,
  }
}

async function attemptCleanup(cleanup: Cleanup | null | undefined): Promise<DfcSandboxCleanupStatus> {
  if (!cleanup) return 'not_requested'
  try {
    await cleanup()
    return 'attempted'
  } catch {
    return 'failed'
  }
}

function blocked(code: string, message: string): DfcSandboxPlan {
  return {
    ok: false,
    status: 'blocked',
    derivedAsset: null,
    diagnostics: [diagnostic(code, message)],
  }
}

function diagnostic(code: string, message: string): DfcSandboxDiagnostic {
  return {
    code,
    message: sanitizeDfcSandboxText(message),
  }
}

function rejectedOutput(code: string) {
  return {
    ok: false as const,
    code,
    message: 'DFC conversion sandbox output path is outside the controlled output directory.',
  }
}

function normalizeAbsoluteDir(value: string): string | null {
  const normalized = String(value ?? '').trim()
  if (!normalized || NUL_RE.test(normalized)) return null
  return path.resolve(normalized)
}

function safeSegment(value: string, fallback: string): string {
  const normalized = String(value ?? '').trim().replace(SAFE_ID_RE, '-').replace(/^-+|-+$/g, '')
  return normalized || fallback
}

function normalizeExtension(value: string | null | undefined, fallback: string): string {
  const normalized = String(value ?? '').trim().replace(/^\.+/u, '').replace(SAFE_ID_RE, '').toLowerCase()
  return normalized || fallback
}

function isPathInside(root: string, candidate: string): boolean {
  const resolvedRoot = path.resolve(root)
  const resolvedCandidate = path.resolve(candidate)
  const rootForCompare = process.platform === 'win32' ? resolvedRoot.toLowerCase() : resolvedRoot
  const candidateForCompare = process.platform === 'win32' ? resolvedCandidate.toLowerCase() : resolvedCandidate
  return candidateForCompare === rootForCompare || candidateForCompare.startsWith(rootForCompare.endsWith(path.sep) ? rootForCompare : `${rootForCompare}${path.sep}`)
}

function sanitizeDfcSandboxText(value: string): string {
  return String(value ?? '')
    .replace(TOKEN_ASSIGNMENT_RE, '$1$2[redacted-secret]')
    .replace(FULL_HASH_RE, '$1$2[redacted-hash]')
    .replace(STORAGE_REF_RE, '[redacted-storage-ref]')
    .replace(FILE_BODY_RE, '[redacted-file-body]')
    .replace(JWT_RE, '[redacted-token]')
    .replace(BASE64_RE, '[redacted-base64]')
    .replace(FILE_URL_RE, '[redacted-url]')
    .replace(URL_RE, '[redacted-url]')
    .replace(WINDOWS_PATH_RE, '[redacted-path]')
    .replace(UNC_RE, '[redacted-path]')
    .replace(UNIX_PATH_RE, '[redacted-path]')
}
