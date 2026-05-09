import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  runExternalProcess,
  type ExternalProcessRunResult,
  type RunExternalProcessInput,
} from './externalProcessRunner'

const MAX_INPUT_BYTES = 10 * 1024 * 1024
const TIKA_TIMEOUT_MS_DEFAULT = 60000
const TIKA_MAX_OUTPUT_BYTES = 10 * 1024 * 1024

export const TIKA_MODES = ['detect', 'extract_text', 'metadata', 'combined'] as const
export type TikaMode = (typeof TIKA_MODES)[number]

export type TikaRunnerInput = Readonly<{
  inputBytes: Uint8Array
  command: string
  args: readonly string[]
  mode: TikaMode
  metadataAllowlist: readonly string[] | null
  timeoutMs?: number
  maxOutputBytes?: number
  maxInputBytes?: number
}>

export type TikaRunnerSuccess = Readonly<{
  ok: true
  detectedFormatId?: string
  detectedMime?: string
  extractedText?: string
  metadata?: Record<string, string>
  warnings?: string[]
  elapsedMs: number
}>

export type TikaRunnerFailure = Readonly<{
  ok: false
  errorCode: TikaRunnerErrorCode
  detail: string
  elapsedMs: number
}>

export type TikaRunnerErrorCode =
  | 'input_too_large'
  | 'timeout'
  | 'output_limit'
  | 'runtime_error'
  | 'invalid_output'
  | 'process_kill_failed'

export type TikaRunnerResult = TikaRunnerSuccess | TikaRunnerFailure

type ProcessRunnerFn = (input: RunExternalProcessInput) => Promise<ExternalProcessRunResult>

export async function runTika(
  input: TikaRunnerInput,
  deps: Readonly<{
    now?: () => number
    processRunner?: ProcessRunnerFn
    tempDirPrefix?: string
  }> = {}
): Promise<TikaRunnerResult> {
  const now = deps.now ?? Date.now
  const startedAt = now()
  const processRunner = deps.processRunner ?? runExternalProcess

  const maxInputBytes = input.maxInputBytes ?? MAX_INPUT_BYTES
  if (input.inputBytes.length > maxInputBytes) {
    return {
      ok: false,
      errorCode: 'input_too_large',
      detail: `input size ${input.inputBytes.length} exceeds max ${maxInputBytes}`,
      elapsedMs: Math.max(0, now() - startedAt),
    }
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), deps.tempDirPrefix ?? 'starverse-tika-'))
  const tempInputPath = path.join(tempDir, 'input.bin')
  try {
    await writeFile(tempInputPath, input.inputBytes)

    const timeoutMs = input.timeoutMs ?? TIKA_TIMEOUT_MS_DEFAULT
    const maxOutputBytes = input.maxOutputBytes ?? TIKA_MAX_OUTPUT_BYTES

    const result = await processRunner({
      command: input.command,
      args: [...input.args, tempInputPath],
      mode: 'conversion',
      timeoutMs,
      maxStdoutBytes: maxOutputBytes,
      maxStderrBytes: 16 * 1024,
    })

    const elapsedMs = Math.max(0, now() - startedAt)
    const processError = toProcessErrorResult(result, elapsedMs)
    if (processError) return processError

    return parseTikaOutput(result.stdout, input.mode, input.metadataAllowlist, elapsedMs)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

function toProcessErrorResult(
  result: ExternalProcessRunResult,
  elapsedMs: number
): TikaRunnerResult | null {
  if (result.timedOut || result.errorCode === 'process_timeout') {
    return { ok: false, errorCode: 'timeout', detail: sanitizeForRunner('tika timed out'), elapsedMs }
  }
  if (result.outputLimited || result.errorCode === 'output_limit_exceeded') {
    return { ok: false, errorCode: 'output_limit', detail: sanitizeForRunner('tika output limit exceeded'), elapsedMs }
  }
  if (result.errorCode === 'process_kill_failed') {
    return { ok: false, errorCode: 'process_kill_failed', detail: sanitizeForRunner('tika process termination failed'), elapsedMs }
  }
  if (result.errorCode === 'command_not_found' || result.errorCode === 'spawn_failed') {
    return { ok: false, errorCode: 'runtime_error', detail: sanitizeForRunner(`tika command not executable: ${result.stderr}`), elapsedMs }
  }
  if (result.exitCode !== 0 || result.errorCode) {
    return { ok: false, errorCode: 'runtime_error', detail: sanitizeForRunner(`tika process exited non-zero: ${result.stderr}`), elapsedMs }
  }
  return null
}

function parseTikaOutput(
  stdout: string,
  _mode: TikaMode,
  metadataAllowlist: readonly string[] | null,
  elapsedMs: number
): TikaRunnerResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return { ok: false, errorCode: 'invalid_output', detail: 'tika output is not valid JSON', elapsedMs }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, errorCode: 'invalid_output', detail: 'tika output is not a JSON object', elapsedMs }
  }

  const source = parsed as Record<string, unknown>

  const detectedFormatId = normalizeOptionalString(source, 'detectedFormatId')
  const detectedMime = normalizeOptionalString(source, 'detectedMime')
  const extractedText = normalizeOptionalString(source, 'extractedText')

  const rawMetadata = source['metadata']
  const metadata = parseMetadata(rawMetadata, metadataAllowlist)

  const warnings = parseWarnings(source['warnings'])

  const result: TikaRunnerSuccess = {
    ok: true,
    elapsedMs,
    ...(detectedFormatId ? { detectedFormatId } : {}),
    ...(detectedMime ? { detectedMime } : {}),
    ...(extractedText ? { extractedText } : {}),
    ...(metadata ? { metadata } : {}),
    ...(warnings ? { warnings } : {}),
  }

  return result
}

function parseMetadata(
  raw: unknown,
  allowlist: readonly string[] | null
): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const source = raw as Record<string, unknown>
  const allowlistSet = allowlist ? new Set(allowlist) : null

  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== 'string') continue
    if (allowlistSet && !allowlistSet.has(key)) continue
    out[key] = value
  }

  return Object.keys(out).length > 0 ? out : undefined
}

function parseWarnings(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out = raw.filter((v): v is string => typeof v === 'string' && v.length > 0)
  return out.length > 0 ? out : undefined
}

function normalizeOptionalString(source: Record<string, unknown>, field: string): string | null {
  const value = source[field]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function sanitizeForRunner(detail: string): string {
  return detail
    .replace(/\b[A-Za-z]:\\[^\s"'`]+/g, '[redacted-path]')
    .replace(/(?:\/Users\/|\/home\/|\/mnt\/|\/var\/|\/tmp\/)[^\s"'`\\]+/g, '[redacted-path]')
}
