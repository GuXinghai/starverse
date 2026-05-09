import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  runExternalProcess,
  type ExternalProcessRunResult,
  type RunExternalProcessInput,
} from './externalProcessRunner'

const MAX_INPUT_BYTES = 50 * 1024 * 1024
const PANDOC_TIMEOUT_MS_DEFAULT = 30000
const PANDOC_MAX_OUTPUT_BYTES = 10 * 1024 * 1024

export const PANDOC_TARGETS = ['markdown', 'plain', 'html'] as const
export type PandocTarget = (typeof PANDOC_TARGETS)[number]

export const PANDOC_SOURCE_FORMATS = ['markdown', 'html', 'docx', 'odt', 'rst', 'latex'] as const
export type PandocSourceFormat = (typeof PANDOC_SOURCE_FORMATS)[number]

export type PandocRunnerInput = Readonly<{
  inputBytes: Uint8Array
  command: string
  args: readonly string[]
  target: PandocTarget
  sourceFormat?: PandocSourceFormat
  timeoutMs?: number
  maxOutputBytes?: number
  maxInputBytes?: number
}>

export type PandocRunnerSuccess = Readonly<{
  ok: true
  convertedText: string
  outputFormat: string
  warnings?: string[]
  elapsedMs: number
}>

export type PandocRunnerFailure = Readonly<{
  ok: false
  errorCode: PandocRunnerErrorCode
  detail: string
  elapsedMs: number
}>

export type PandocRunnerErrorCode =
  | 'input_too_large'
  | 'output_too_large'
  | 'unsupported_source_format'
  | 'unsupported_target_format'
  | 'lua_filter_denied'
  | 'timeout'
  | 'output_limit'
  | 'runtime_error'
  | 'invalid_output'
  | 'process_kill_failed'

export type PandocRunnerResult = PandocRunnerSuccess | PandocRunnerFailure

type ProcessRunnerFn = (input: RunExternalProcessInput) => Promise<ExternalProcessRunResult>

export async function runPandoc(
  input: PandocRunnerInput,
  deps: Readonly<{
    now?: () => number
    processRunner?: ProcessRunnerFn
    tempDirPrefix?: string
  }> = {}
): Promise<PandocRunnerResult> {
  const now = deps.now ?? Date.now
  const startedAt = now()
  const processRunner = deps.processRunner ?? runExternalProcess

  const maxInputBytes = input.maxInputBytes ?? MAX_INPUT_BYTES
  if (input.inputBytes.length > maxInputBytes) {
    return {
      ok: false,
      errorCode: 'input_too_large',
      detail: `pandoc input size ${input.inputBytes.length} exceeds max ${maxInputBytes}`,
      elapsedMs: Math.max(0, now() - startedAt),
    }
  }

  if (!PANDOC_TARGETS.includes(input.target)) {
    return {
      ok: false,
      errorCode: 'unsupported_target_format',
      detail: `unsupported pandoc target: ${input.target}`,
      elapsedMs: Math.max(0, now() - startedAt),
    }
  }

  if (input.sourceFormat && !PANDOC_SOURCE_FORMATS.includes(input.sourceFormat)) {
    return {
      ok: false,
      errorCode: 'unsupported_source_format',
      detail: `unsupported pandoc source format: ${input.sourceFormat}`,
      elapsedMs: Math.max(0, now() - startedAt),
    }
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), deps.tempDirPrefix ?? 'starverse-pandoc-'))
  const tempInputPath = path.join(tempDir, 'input.bin')
  try {
    await writeFile(tempInputPath, input.inputBytes)

    const timeoutMs = input.timeoutMs ?? PANDOC_TIMEOUT_MS_DEFAULT
    const maxOutputBytes = input.maxOutputBytes ?? PANDOC_MAX_OUTPUT_BYTES

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

    return parsePandocOutput(result.stdout, input.target, elapsedMs)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

function toProcessErrorResult(
  result: ExternalProcessRunResult,
  elapsedMs: number
): PandocRunnerResult | null {
  if (result.timedOut || result.errorCode === 'process_timeout') {
    return { ok: false, errorCode: 'timeout', detail: sanitizeForRunner('pandoc timed out'), elapsedMs }
  }
  if (result.outputLimited || result.errorCode === 'output_limit_exceeded') {
    return { ok: false, errorCode: 'output_limit', detail: sanitizeForRunner('pandoc output limit exceeded'), elapsedMs }
  }
  if (result.errorCode === 'process_kill_failed') {
    return { ok: false, errorCode: 'process_kill_failed', detail: sanitizeForRunner('pandoc process termination failed'), elapsedMs }
  }
  if (result.errorCode === 'command_not_found' || result.errorCode === 'spawn_failed') {
    return { ok: false, errorCode: 'runtime_error', detail: sanitizeForRunner(`pandoc command not executable: ${result.stderr}`), elapsedMs }
  }
  if (result.exitCode !== 0 || result.errorCode) {
    return { ok: false, errorCode: 'runtime_error', detail: sanitizeForRunner(`pandoc process exited non-zero: ${result.stderr}`), elapsedMs }
  }
  return null
}

const TARGET_TO_FORMAT: Record<PandocTarget, string> = {
  markdown: 'gfm',
  plain: 'plain',
  html: 'html',
}

function parsePandocOutput(
  stdout: string,
  target: PandocTarget,
  elapsedMs: number
): PandocRunnerResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return { ok: false, errorCode: 'invalid_output', detail: 'pandoc output is not valid JSON', elapsedMs }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, errorCode: 'invalid_output', detail: 'pandoc output is not a JSON object', elapsedMs }
  }

  const source = parsed as Record<string, unknown>

  if (source['luaFilterDenied'] === true) {
    return {
      ok: false,
      errorCode: 'lua_filter_denied',
      detail: 'pandoc lua filter execution denied',
      elapsedMs,
    }
  }

  const convertedText = typeof source['convertedText'] === 'string' ? source['convertedText'] : null
  if (!convertedText || convertedText.trim().length === 0) {
    return { ok: false, errorCode: 'invalid_output', detail: 'pandoc output has no converted text', elapsedMs }
  }

  const outputFormat = TARGET_TO_FORMAT[target]

  const warnings = parseWarnings(source['warnings'])

  if (convertedText.length > PANDOC_MAX_OUTPUT_BYTES) {
    return {
      ok: false,
      errorCode: 'output_too_large',
      detail: `pandoc converted text ${convertedText.length} chars exceeds max`,
      elapsedMs,
    }
  }

  return {
    ok: true,
    convertedText,
    outputFormat,
    ...(warnings ? { warnings } : {}),
    elapsedMs,
  }
}

function parseWarnings(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out = raw.filter((v): v is string => typeof v === 'string' && v.length > 0)
  return out.length > 0 ? out : undefined
}

function sanitizeForRunner(detail: string): string {
  return detail
    .replace(/\b[A-Za-z]:\\[^\s"'`]+/g, '[redacted-path]')
    .replace(/(?:\/Users\/|\/home\/|\/mnt\/|\/var\/|\/tmp\/)[^\s"'`\\]+/g, '[redacted-path]')
}
