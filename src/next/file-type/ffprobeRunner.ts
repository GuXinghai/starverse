import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  runExternalProcess,
  type ExternalProcessRunResult,
  type RunExternalProcessInput,
} from './externalProcessRunner'

const MAX_INPUT_BYTES = 500 * 1024 * 1024
const FFPROBE_TIMEOUT_MS_DEFAULT = 30000
const FFPROBE_MAX_OUTPUT_BYTES = 1 * 1024 * 1024

export type FFProbeCodecType = 'video' | 'audio' | 'subtitle' | 'data' | 'attachment' | 'unknown'

export type FFProbeStreamEntry = Readonly<{
  index: number
  codecName: string
  codecType: FFProbeCodecType
  width?: number
  height?: number
  frameRate?: string
  sampleRate?: number
  channels?: number
  duration?: string
  bitRate?: string
  tags?: Record<string, string>
}>

export type FFProbeFormatEntry = Readonly<{
  formatName: string
  duration?: string
  /** total file size in bytes (from probe, not real path size) */
  size?: string
  bitRate?: string
  tags?: Record<string, string>
}>

export type FFProbeRunnerInput = Readonly<{
  inputBytes: Uint8Array
  command: string
  args: readonly string[]
  metadataAllowlist?: readonly string[] | null
  timeoutMs?: number
  maxOutputBytes?: number
  maxInputBytes?: number
}>

export type FFProbeRunnerSuccess = Readonly<{
  ok: true
  format?: FFProbeFormatEntry
  streams: readonly FFProbeStreamEntry[]
  warnings?: string[]
  elapsedMs: number
}>

export type FFProbeRunnerFailure = Readonly<{
  ok: false
  errorCode: FFProbeRunnerErrorCode
  detail: string
  elapsedMs: number
}>

export type FFProbeRunnerErrorCode =
  | 'input_too_large'
  | 'timeout'
  | 'output_limit'
  | 'runtime_error'
  | 'invalid_output'
  | 'process_kill_failed'

export type FFProbeRunnerResult = FFProbeRunnerSuccess | FFProbeRunnerFailure

type ProcessRunnerFn = (input: RunExternalProcessInput) => Promise<ExternalProcessRunResult>

export async function runFFProbe(
  input: FFProbeRunnerInput,
  deps: Readonly<{
    now?: () => number
    processRunner?: ProcessRunnerFn
    tempDirPrefix?: string
  }> = {}
): Promise<FFProbeRunnerResult> {
  const now = deps.now ?? Date.now
  const startedAt = now()
  const processRunner = deps.processRunner ?? runExternalProcess

  const maxInputBytes = input.maxInputBytes ?? MAX_INPUT_BYTES
  if (input.inputBytes.length > maxInputBytes) {
    return {
      ok: false,
      errorCode: 'input_too_large',
      detail: `ffprobe input size ${input.inputBytes.length} exceeds max ${maxInputBytes}`,
      elapsedMs: Math.max(0, now() - startedAt),
    }
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), deps.tempDirPrefix ?? 'starverse-ffprobe-'))
  const tempInputPath = path.join(tempDir, 'input.bin')
  try {
    await writeFile(tempInputPath, input.inputBytes)

    const timeoutMs = input.timeoutMs ?? FFPROBE_TIMEOUT_MS_DEFAULT
    const maxOutputBytes = input.maxOutputBytes ?? FFPROBE_MAX_OUTPUT_BYTES

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

    return parseFFProbeOutput(result.stdout, input.metadataAllowlist ?? null, elapsedMs)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

function toProcessErrorResult(
  result: ExternalProcessRunResult,
  elapsedMs: number
): FFProbeRunnerResult | null {
  if (result.timedOut || result.errorCode === 'process_timeout') {
    return { ok: false, errorCode: 'timeout', detail: sanitizeForRunner('ffprobe timed out'), elapsedMs }
  }
  if (result.outputLimited || result.errorCode === 'output_limit_exceeded') {
    return { ok: false, errorCode: 'output_limit', detail: sanitizeForRunner('ffprobe output limit exceeded'), elapsedMs }
  }
  if (result.errorCode === 'process_kill_failed') {
    return { ok: false, errorCode: 'process_kill_failed', detail: sanitizeForRunner('ffprobe process termination failed'), elapsedMs }
  }
  if (result.errorCode === 'command_not_found' || result.errorCode === 'spawn_failed') {
    return { ok: false, errorCode: 'runtime_error', detail: sanitizeForRunner(`ffprobe command not executable: ${result.stderr}`), elapsedMs }
  }
  if (result.exitCode !== 0 || result.errorCode) {
    return { ok: false, errorCode: 'runtime_error', detail: sanitizeForRunner(`ffprobe process exited non-zero: ${result.stderr}`), elapsedMs }
  }
  return null
}

const VALID_CODEC_TYPES: ReadonlySet<string> = new Set(['video', 'audio', 'subtitle', 'data', 'attachment', 'unknown'])

function parseFFProbeOutput(
  stdout: string,
  metadataAllowlist: readonly string[] | null,
  elapsedMs: number
): FFProbeRunnerResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return { ok: false, errorCode: 'invalid_output', detail: 'ffprobe output is not valid JSON', elapsedMs }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, errorCode: 'invalid_output', detail: 'ffprobe output is not a JSON object', elapsedMs }
  }

  const source = parsed as Record<string, unknown>

  const format = parseFormatEntry(source['format'], metadataAllowlist)
  const streams = parseStreams(source['streams'], metadataAllowlist)
  const warnings = parseWarnings(source['warnings'])

  return {
    ok: true,
    elapsedMs,
    ...(format ? { format } : {}),
    streams,
    ...(warnings ? { warnings } : {}),
  }
}

function parseFormatEntry(
  raw: unknown,
  metadataAllowlist: readonly string[] | null
): FFProbeFormatEntry | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const f = raw as Record<string, unknown>

  const formatName = typeof f['format_name'] === 'string' ? f['format_name'].trim() : null
  if (!formatName) return undefined

  const duration = typeof f['duration'] === 'string' ? f['duration'].trim() : null
  const size = typeof f['size'] === 'string' ? f['size'].trim() : null
  const bitRate = typeof f['bit_rate'] === 'string' ? f['bit_rate'].trim() : null
  const tags = parseTags(f['tags'], metadataAllowlist)

  return {
    formatName,
    ...(duration && isValidDuration(duration) ? { duration } : {}),
    ...(size && /^\d+$/.test(size) ? { size } : {}),
    ...(bitRate && /^\d+$/.test(bitRate) ? { bitRate } : {}),
    ...(tags ? { tags } : {}),
  }
}

function parseStreams(
  raw: unknown,
  metadataAllowlist: readonly string[] | null
): readonly FFProbeStreamEntry[] {
  if (!Array.isArray(raw)) return []
  const out: FFProbeStreamEntry[] = []
  for (const item of raw) {
    const entry = parseStreamEntry(item, metadataAllowlist)
    if (entry) out.push(entry)
  }
  return out
}

// eslint-disable-next-line complexity
function parseStreamEntry(
  raw: unknown,
  metadataAllowlist: readonly string[] | null
): FFProbeStreamEntry | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const s = raw as Record<string, unknown>

  if (typeof s['index'] !== 'number') return undefined
  const codecName = typeof s['codec_name'] === 'string' ? s['codec_name'].trim() : null
  if (!codecName) return undefined
  const codecType = typeof s['codec_type'] === 'string' && VALID_CODEC_TYPES.has(s['codec_type'])
    ? s['codec_type'] as FFProbeCodecType
    : 'unknown'

  const width = typeof s['width'] === 'number' && s['width'] > 0 ? s['width'] : undefined
  const height = typeof s['height'] === 'number' && s['height'] > 0 ? s['height'] : undefined
  const frameRate = typeof s['r_frame_rate'] === 'string' && /^\d+\/\d+$/.test(s['r_frame_rate']) ? s['r_frame_rate'].trim() : undefined
  const sampleRate = typeof s['sample_rate'] === 'string' && /^\d+$/.test(s['sample_rate']) ? Number(s['sample_rate']) : undefined
  const channels = typeof s['channels'] === 'number' && s['channels'] > 0 ? s['channels'] : undefined
  const duration = typeof s['duration'] === 'string' && isValidDuration(s['duration']) ? s['duration'].trim() : undefined
  const bitRate = typeof s['bit_rate'] === 'string' && /^\d+$/.test(s['bit_rate']) ? s['bit_rate'].trim() : undefined
  const tags = parseTags(s['tags'], metadataAllowlist)

  return {
    index: s['index'],
    codecName,
    codecType,
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(frameRate ? { frameRate } : {}),
    ...(sampleRate !== undefined ? { sampleRate } : {}),
    ...(channels !== undefined ? { channels } : {}),
    ...(duration ? { duration } : {}),
    ...(bitRate ? { bitRate } : {}),
    ...(tags ? { tags } : {}),
  }
}

function parseTags(
  raw: unknown,
  allowlist: readonly string[] | null
): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  if (!allowlist || allowlist.length === 0) return undefined
  const source = raw as Record<string, unknown>
  const allowlistSet = new Set(allowlist)

  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== 'string') continue
    if (!allowlistSet.has(key)) continue
    out[key] = sanitizeTagValue(value)
  }

  return Object.keys(out).length > 0 ? out : undefined
}

function isValidDuration(value: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(value) || value === 'N/A'
}

function parseWarnings(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out = raw.filter((v): v is string => typeof v === 'string' && v.length > 0)
  return out.length > 0 ? out : undefined
}

function sanitizeTagValue(value: string): string {
  return value
    .replace(/\b[A-Za-z]:\\[^\s"'`]+/g, '[redacted-path]')
    .replace(/(?:\/Users\/|\/home\/|\/mnt\/|\/var\/|\/tmp\/)[^\s"'`\\]+/g, '[redacted-path]')
    .replace(/\b[0-9a-fA-F]{64,}\b/g, '[redacted-hash]')
}

function sanitizeForRunner(detail: string): string {
  return detail
    .replace(/\b[A-Za-z]:\\[^\s"'`]+/g, '[redacted-path]')
    .replace(/(?:\/Users\/|\/home\/|\/mnt\/|\/var\/|\/tmp\/)[^\s"'`\\]+/g, '[redacted-path]')
}
