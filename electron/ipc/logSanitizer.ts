import path from 'node:path'

type PayloadSizeBucket = 'empty' | '<1kb' | '1-10kb' | '10-100kb' | '100kb-1mb' | '>=1mb' | 'unknown'

export function redactSensitiveString(input: unknown): string {
  const raw = typeof input === 'string' ? input : String(input ?? '')
  return raw
    .replace(/data:[^,\s]+;base64,[A-Za-z0-9+/=]+/gi, 'data:[redacted]')
    .replace(/\b[A-Za-z0-9+/]{80,}={0,2}\b/g, '[redacted-base64]')
    .replace(/(contentToken["'\s:=]+)([^\s"',}]+)/gi, '$1[redacted-token]')
    .replace(/\b[A-Za-z]:\\[^\s'"`]+/g, '[redacted-path]')
    .replace(/\\\\[^\s'"`]+/g, '[redacted-path]')
    .replace(/\/Users\/[^\s'"`]+/g, '[redacted-path]')
    .replace(/\/home\/[^\s'"`]+/g, '[redacted-path]')
    .replace(/\/mnt\/[^\s'"`]+/g, '[redacted-path]')
}

export function basenameForLog(inputPath: unknown): string {
  const raw = String(inputPath ?? '').trim()
  if (!raw) return '[redacted-path]'
  try {
    if (raw.startsWith('file://')) {
      const u = new URL(raw)
      const pathname = decodeURIComponent(u.pathname)
      const name = path.basename(pathname)
      return name || '[redacted-path]'
    }
  } catch {
    // fall through
  }
  const normalized = raw.replace(/[\\/]+$/, '')
  const name = path.basename(normalized)
  return name && name !== '.' && name !== '/' ? name : '[redacted-path]'
}

export function summarizeIpcParamsForLog(params: unknown): Readonly<{
  paramsType: string
  paramsCount: number
  paramsKeys: string[]
  payloadSizeBucket: PayloadSizeBucket
}> {
  const paramsType = detectType(params)
  const paramsKeys = extractKeys(params)
  const paramsCount = Array.isArray(params)
    ? params.length
    : params && typeof params === 'object'
      ? paramsKeys.length
      : params === null || params === undefined
        ? 0
        : 1

  return {
    paramsType,
    paramsCount,
    paramsKeys: paramsKeys.slice(0, 20),
    payloadSizeBucket: sizeBucket(params),
  }
}

export function summarizeErrorForLog(error: unknown): Readonly<{
  name: string
  sanitizedMessage: string
  sanitizedStack: string | null
  code: string | null
  cause: string | null
}> {
  const e = error instanceof Error ? error : new Error(String(error ?? 'unknown error'))
  const sanitizedMessage = clip(redactSensitiveString(e.message), 400)
  const stack = typeof e.stack === 'string' ? redactSensitiveString(e.stack) : ''
  const stackLines = stack
    .split('\n')
    .slice(0, 6)
    .map((line) => clip(line.trim(), 220))
    .filter((line) => line.length > 0)
  const sanitizedStack = stackLines.length > 0 ? stackLines.join('\n') : null
  const code = extractPrimitive((e as any)?.code)
  const cause = summarizeCause((e as any)?.cause)

  return {
    name: String(e.name || 'Error'),
    sanitizedMessage,
    sanitizedStack,
    code,
    cause,
  }
}

function extractKeys(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  try {
    return Object.keys(value as Record<string, unknown>)
  } catch {
    return []
  }
}

function detectType(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function sizeBucket(value: unknown): PayloadSizeBucket {
  if (value === null || value === undefined) return 'empty'
  let size = 0
  try {
    const seen = new WeakSet<object>()
    const serialized = JSON.stringify(value, (_k, v) => {
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[circular]'
        seen.add(v)
      }
      if (typeof v === 'string' && v.length > 512) return `[string:${v.length}]`
      return v
    })
    size = Buffer.byteLength(serialized ?? '', 'utf8')
  } catch {
    return 'unknown'
  }
  if (size === 0) return 'empty'
  if (size < 1024) return '<1kb'
  if (size < 10 * 1024) return '1-10kb'
  if (size < 100 * 1024) return '10-100kb'
  if (size < 1024 * 1024) return '100kb-1mb'
  return '>=1mb'
}

function extractPrimitive(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return clip(redactSensitiveString(String(value)), 120)
  }
  return clip(redactSensitiveString(Object.prototype.toString.call(value)), 120)
}

function summarizeCause(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (value instanceof Error) {
    const causeSummary = summarizeErrorForLog(value)
    return `${causeSummary.name}: ${causeSummary.sanitizedMessage}`
  }
  return clip(redactSensitiveString(String(value)), 160)
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 3))}...`
}
