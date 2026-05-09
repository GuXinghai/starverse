import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  runExternalProcess,
  type ExternalProcessRunResult,
  type RunExternalProcessInput,
} from './externalProcessRunner'

const MAX_INPUT_BYTES = 50 * 1024 * 1024
const LO_TIMEOUT_MS_DEFAULT = 60000
const LO_MAX_OUTPUT_BYTES = 50 * 1024 * 1024

export const LO_CONVERSIONS = ['pdf', 'text', 'html', 'markdown'] as const
export type LibreOfficeConversion = (typeof LO_CONVERSIONS)[number]

export const LO_SOURCE_FORMATS = ['docx', 'odt', 'xlsx', 'pptx', 'rtf', 'doc'] as const
export type LibreOfficeSourceFormat = (typeof LO_SOURCE_FORMATS)[number]

export const LO_MACRO_POLICIES = ['deny', 'warn'] as const
export type LibreOfficeMacroPolicy = (typeof LO_MACRO_POLICIES)[number]

const MACRO_FORMATS: ReadonlySet<string> = new Set(['docx', 'doc', 'xlsx', 'pptx'])

export type LibreOfficeRunnerInput = Readonly<{
  inputBytes: Uint8Array
  command: string
  args: readonly string[]
  target: LibreOfficeConversion
  sourceFormat?: LibreOfficeSourceFormat
  macroPolicy: LibreOfficeMacroPolicy
  timeoutMs?: number
  maxOutputBytes?: number
  maxInputBytes?: number
}>

export type LibreOfficeRunnerSuccess = Readonly<{
  ok: true
  convertedBytes?: Uint8Array
  convertedText?: string
  outputMime?: string
  sourceFormat?: string
  warnings?: string[]
  macroBlocked?: boolean
  elapsedMs: number
}>

export type LibreOfficeRunnerFailure = Readonly<{
  ok: false
  errorCode: LibreOfficeRunnerErrorCode
  detail: string
  elapsedMs: number
}>

export type LibreOfficeRunnerErrorCode =
  | 'input_too_large'
  | 'unsupported_source_format'
  | 'unsupported_target_format'
  | 'macro_active_content_blocked'
  | 'timeout'
  | 'output_limit'
  | 'runtime_error'
  | 'invalid_output'
  | 'process_kill_failed'

export type LibreOfficeRunnerResult = LibreOfficeRunnerSuccess | LibreOfficeRunnerFailure

type ProcessRunnerFn = (input: RunExternalProcessInput) => Promise<ExternalProcessRunResult>

export async function runLibreOffice(
  input: LibreOfficeRunnerInput,
  deps: Readonly<{
    now?: () => number
    processRunner?: ProcessRunnerFn
    tempDirPrefix?: string
  }> = {}
): Promise<LibreOfficeRunnerResult> {
  const now = deps.now ?? Date.now
  const startedAt = now()
  const processRunner = deps.processRunner ?? runExternalProcess

  const maxInputBytes = input.maxInputBytes ?? MAX_INPUT_BYTES
  if (input.inputBytes.length > maxInputBytes) {
    return {
      ok: false,
      errorCode: 'input_too_large',
      detail: `libreoffice input size ${input.inputBytes.length} exceeds max ${maxInputBytes}`,
      elapsedMs: Math.max(0, now() - startedAt),
    }
  }

  if (!LO_CONVERSIONS.includes(input.target)) {
    return {
      ok: false,
      errorCode: 'unsupported_target_format',
      detail: `unsupported libreoffice target: ${input.target}`,
      elapsedMs: Math.max(0, now() - startedAt),
    }
  }

  if (input.sourceFormat && !LO_SOURCE_FORMATS.includes(input.sourceFormat)) {
    return {
      ok: false,
      errorCode: 'unsupported_source_format',
      detail: `unsupported libreoffice source format: ${input.sourceFormat}`,
      elapsedMs: Math.max(0, now() - startedAt),
    }
  }

  if (input.sourceFormat && MACRO_FORMATS.has(input.sourceFormat)) {
    if (input.macroPolicy === 'deny') {
      return {
        ok: false,
        errorCode: 'macro_active_content_blocked',
        detail: `macro-capable format ${input.sourceFormat} blocked by macroPolicy=deny`,
        elapsedMs: Math.max(0, now() - startedAt),
      }
    }
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), deps.tempDirPrefix ?? 'starverse-lo-'))
  const tempInputPath = path.join(tempDir, 'input.bin')
  try {
    await writeFile(tempInputPath, input.inputBytes)

    const timeoutMs = input.timeoutMs ?? LO_TIMEOUT_MS_DEFAULT
    const maxOutputBytes = input.maxOutputBytes ?? LO_MAX_OUTPUT_BYTES

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

    return parseLoOutput(
      result.stdout,
      input.target,
      input.sourceFormat,
      input.macroPolicy,
      elapsedMs
    )
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

function toProcessErrorResult(
  result: ExternalProcessRunResult,
  elapsedMs: number
): LibreOfficeRunnerResult | null {
  if (result.timedOut || result.errorCode === 'process_timeout') {
    return { ok: false, errorCode: 'timeout', detail: sanitizeForRunner('libreoffice timed out'), elapsedMs }
  }
  if (result.outputLimited || result.errorCode === 'output_limit_exceeded') {
    return { ok: false, errorCode: 'output_limit', detail: sanitizeForRunner('libreoffice output limit exceeded'), elapsedMs }
  }
  if (result.errorCode === 'process_kill_failed') {
    return { ok: false, errorCode: 'process_kill_failed', detail: sanitizeForRunner('libreoffice process termination failed'), elapsedMs }
  }
  if (result.errorCode === 'command_not_found' || result.errorCode === 'spawn_failed') {
    return { ok: false, errorCode: 'runtime_error', detail: sanitizeForRunner(`libreoffice command not executable: ${result.stderr}`), elapsedMs }
  }
  if (result.exitCode !== 0 || result.errorCode) {
    return { ok: false, errorCode: 'runtime_error', detail: sanitizeForRunner(`libreoffice process exited non-zero: ${result.stderr}`), elapsedMs }
  }
  return null
}

function parseLoOutput(
  stdout: string,
  _target: LibreOfficeConversion,
  sourceFormat: string | undefined,
  macroPolicy: LibreOfficeMacroPolicy,
  elapsedMs: number
): LibreOfficeRunnerResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return { ok: false, errorCode: 'invalid_output', detail: 'libreoffice output is not valid JSON', elapsedMs }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, errorCode: 'invalid_output', detail: 'libreoffice output is not a JSON object', elapsedMs }
  }

  const source = parsed as Record<string, unknown>

  const macroBlocked = source['macroBlocked'] === true
  if (macroBlocked && macroPolicy === 'deny') {
    return {
      ok: false,
      errorCode: 'macro_active_content_blocked',
      detail: 'libreoffice detected macros in input',
      elapsedMs,
    }
  }

  const outputMime = normalizeOptionalString(source, 'outputMime')
  const resolvedSourceFormat = normalizeOptionalString(source, 'sourceFormat') ?? sourceFormat

  const convertedBytesBase64 = typeof source['convertedBytesBase64'] === 'string' ? source['convertedBytesBase64'] : undefined
  const convertedText = normalizeOptionalString(source, 'convertedText')

  let convertedBytes: Uint8Array | undefined
  if (convertedBytesBase64) {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(convertedBytesBase64)) {
      return { ok: false, errorCode: 'invalid_output', detail: 'libreoffice convertedBytesBase64 is not valid base64', elapsedMs }
    }
    try {
      convertedBytes = new Uint8Array(Buffer.from(convertedBytesBase64, 'base64'))
    } catch {
      return { ok: false, errorCode: 'invalid_output', detail: 'libreoffice convertedBytesBase64 decode failed', elapsedMs }
    }
  }

  const warnings = parseWarnings(source['warnings'])

  const result: LibreOfficeRunnerSuccess = {
    ok: true,
    elapsedMs,
    ...(convertedBytes ? { convertedBytes } : {}),
    ...(convertedText ? { convertedText } : {}),
    ...(outputMime ? { outputMime } : {}),
    ...(resolvedSourceFormat ? { sourceFormat: resolvedSourceFormat } : {}),
    ...(warnings ? { warnings } : {}),
    ...(macroBlocked ? { macroBlocked } : {}),
  }

  return result
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
