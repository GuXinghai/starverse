import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  runExternalProcess,
  type ExternalProcessRunResult,
  type RunExternalProcessInput,
} from './externalProcessRunner'

const MAX_INPUT_BYTES = 10 * 1024 * 1024
const CLASSIFY_TIMEOUT_MS_DEFAULT = 30000
const CLASSIFY_MAX_OUTPUT_BYTES = 1024 * 1024
const RUNNER_DETAIL_MAX_CHARS = 1000

export type MagikaClassifyRunnerInput = Readonly<{
  inputBytes: Uint8Array
  runtimeEntryPath: string
  modelDirPath: string
  configDirPath: string
  timeoutMs?: number
  maxOutputBytes?: number
}>

export type MagikaClassifyRunnerSuccess = Readonly<{
  ok: true
  label: string
  score: number
  modelVersion: string
  elapsedMs: number
}>

export type MagikaClassifyRunnerFailure = Readonly<{
  ok: false
  errorCode: MagikaClassifyRunnerErrorCode
  detail: string
  elapsedMs: number
}>

export type MagikaClassifyRunnerErrorCode =
  | 'input_too_large'
  | 'spawn_failed'
  | 'timeout'
  | 'output_limit'
  | 'process_kill_failed'
  | 'process_exited_non_zero'
  | 'stdout_parse_failed'
  | 'missing_dependency'
  | 'unknown_runtime_error'

export type MagikaClassifyRunnerResult = MagikaClassifyRunnerSuccess | MagikaClassifyRunnerFailure

type ProcessRunnerFn = (input: RunExternalProcessInput) => Promise<ExternalProcessRunResult>

export async function runMagikaClassify(
  input: MagikaClassifyRunnerInput,
  deps: Readonly<{
    now?: () => number
    processRunner?: ProcessRunnerFn
    tempDirPrefix?: string
  }> = {}
): Promise<MagikaClassifyRunnerResult> {
  const now = deps.now ?? Date.now
  const startedAt = now()
  const processRunner = deps.processRunner ?? runExternalProcess

  if (input.inputBytes.length > MAX_INPUT_BYTES) {
    return {
      ok: false,
      errorCode: 'input_too_large',
      detail: `input size ${input.inputBytes.length} exceeds max ${MAX_INPUT_BYTES}`,
      elapsedMs: Math.max(0, now() - startedAt),
    }
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), deps.tempDirPrefix ?? 'starverse-magika-classify-'))
  const tempInputPath = path.join(tempDir, 'input.bin')
  try {
    await writeFile(tempInputPath, input.inputBytes)

    const timeoutMs = input.timeoutMs ?? CLASSIFY_TIMEOUT_MS_DEFAULT
    const maxOutputBytes = input.maxOutputBytes ?? CLASSIFY_MAX_OUTPUT_BYTES

    const result = await processRunner({
      command: 'node',
      args: [
        input.runtimeEntryPath,
        '--model-dir', input.modelDirPath,
        '--config-dir', input.configDirPath,
        '--input', tempInputPath,
        '--output-json',
      ],
      mode: 'process',
      timeoutMs,
      maxStdoutBytes: maxOutputBytes,
      maxStderrBytes: 16 * 1024,
    })

    const elapsedMs = Math.max(0, now() - startedAt)
    const processError = toProcessErrorResult(result, elapsedMs)
    if (processError) return processError

    return parseClassifyOutput(result.stdout, elapsedMs)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

function toProcessErrorResult(
  result: ExternalProcessRunResult,
  elapsedMs: number
): MagikaClassifyRunnerResult | null {
  if (result.timedOut || result.errorCode === 'process_timeout') {
    return { ok: false, errorCode: 'timeout', detail: sanitizeForRunner('classify timed out'), elapsedMs }
  }
  if (result.outputLimited || result.errorCode === 'output_limit_exceeded') {
    return { ok: false, errorCode: 'output_limit', detail: sanitizeForRunner('classify output limit exceeded'), elapsedMs }
  }
  if (result.errorCode === 'process_kill_failed') {
    return { ok: false, errorCode: 'process_kill_failed', detail: sanitizeForRunner('classify process termination failed'), elapsedMs }
  }
  if (result.errorCode === 'command_not_found' || result.errorCode === 'spawn_failed') {
    return { ok: false, errorCode: 'spawn_failed', detail: sanitizeForRunner(`runtime entry not executable: ${result.stderr}`), elapsedMs }
  }
  if (result.exitCode !== 0 || result.errorCode) {
    const detail = sanitizeForRunner(`classify process exited non-zero: ${result.stderr}`)
    return {
      ok: false,
      errorCode: isMissingDependencyDetail(result.stderr) ? 'missing_dependency' : 'process_exited_non_zero',
      detail,
      elapsedMs,
    }
  }
  return null
}

function parseClassifyOutput(
  stdout: string,
  elapsedMs: number
): MagikaClassifyRunnerResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return { ok: false, errorCode: 'stdout_parse_failed', detail: 'classify output is not valid JSON', elapsedMs }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, errorCode: 'stdout_parse_failed', detail: 'classify output is not a JSON object', elapsedMs }
  }

  const source = parsed as Record<string, unknown>
  const label = normalizeRequiredField(source, 'label')
  if (!label) {
    return { ok: false, errorCode: 'stdout_parse_failed', detail: 'classify output missing required label field', elapsedMs }
  }

  const scoreField = normalizeScoreField(source, 'score')
  if (!scoreField.ok) {
    return { ok: false, errorCode: 'stdout_parse_failed', detail: scoreField.detail, elapsedMs }
  }

  const modelVersion = normalizeOptionalField(source, 'modelVersion') ?? 'unknown'
  return { ok: true, label, score: scoreField.value, modelVersion, elapsedMs }
}

function normalizeRequiredField(source: Record<string, unknown>, field: string): string | null {
  const value = source[field]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function normalizeOptionalField(source: Record<string, unknown>, field: string): string | null {
  const value = source[field]
  return typeof value === 'string' ? value.trim() : null
}

function normalizeScoreField(
  source: Record<string, unknown>,
  field: string
): Readonly<{ ok: true; value: number } | { ok: false; detail: string }> {
  const value = source[field]
  if (typeof value !== 'number') {
    return { ok: false, detail: `classify output ${field} must be a number` }
  }
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    return { ok: false, detail: `classify output ${field} must be in [0, 1]` }
  }
  return { ok: true, value }
}

function sanitizeForRunner(detail: string): string {
  const sanitized = detail
    .replace(/(contentToken["'\s:=]+)([^\s"',}]+)/gi, '$1[redacted-token]')
    .replace(/(fullHash["'\s:=]+)([A-Za-z0-9+/=:_-]{12,})/gi, '$1[redacted-hash]')
    .replace(/\b[A-Za-z]:\\[^\s"'`]+/g, '[redacted-path]')
    .replace(/(?:\/Users\/|\/home\/|\/mnt\/|\/var\/|\/tmp\/)[^\s"'`\\]+/g, '[redacted-path]')
  return sanitized.length > RUNNER_DETAIL_MAX_CHARS
    ? `${sanitized.slice(0, RUNNER_DETAIL_MAX_CHARS)}...[truncated]`
    : sanitized
}

function isMissingDependencyDetail(detail: string): boolean {
  return /ERR_MODULE_NOT_FOUND|Cannot find package ['"]?magika['"]?/i.test(detail)
}
