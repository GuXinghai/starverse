import path from 'node:path'

export type ElectronConversionStatus = 'success' | 'failed' | 'blocked' | 'timed_out' | 'unavailable'

export type ElectronConversionDiagnosticCode =
  | 'electron_conversion_service_unavailable'
  | 'electron_conversion_kind_unsupported'
  | 'electron_conversion_request_invalid'
  | 'electron_conversion_timeout'
  | 'electron_conversion_blocked'

export type ElectronConversionCleanupStatus = 'not_requested' | 'attempted' | 'failed'

export type ElectronConversionDiagnostic = Readonly<{
  code: ElectronConversionDiagnosticCode
  message: string
}>

export type ElectronConversionPathDescriptor = Readonly<{
  rootDir: string
  relativePath: string
}>

export type ElectronConversionRequest = Readonly<{
  requestId: string
  conversionKind: string
  source: ElectronConversionPathDescriptor & Readonly<{
    kind: 'sandbox_input'
    mime: string
  }>
  output: ElectronConversionPathDescriptor & Readonly<{
    kind: 'sandbox_output'
    mime: string
    extension: string
  }>
  timeoutMs: number
  policy: Readonly<{
    javascriptEnabled: false
    networkEnabled: false
    localFileAccessEnabled: false
  }>
}>

export type ElectronConversionPreparedRequest = ElectronConversionRequest & Readonly<{
  resolvedSourcePath: string
  resolvedOutputPath: string
}>

export type ElectronConversionOutputDescriptor = Readonly<{
  kind: 'controlled_output'
  outputPath: string
  mime: string
  extension: string
}>

export type ElectronConversionResponse = Readonly<{
  requestId: string
  conversionKind: string
  status: ElectronConversionStatus
  output: ElectronConversionOutputDescriptor | null
  diagnostics: readonly ElectronConversionDiagnostic[]
  cleanupStatus: ElectronConversionCleanupStatus
}>

export type ElectronConversionRendererSafeResponse = Readonly<{
  requestId: string
  conversionKind: string
  status: ElectronConversionStatus
  output: Readonly<{
    kind: 'controlled_output'
    mime: string
    extension: string
  }> | null
  diagnostics: readonly ElectronConversionDiagnostic[]
  cleanupStatus: ElectronConversionCleanupStatus
}>

export type ElectronConversionRequestPreparation =
  | Readonly<{ ok: true; request: ElectronConversionPreparedRequest }>
  | Readonly<{ ok: false; response: ElectronConversionResponse }>

const NUL_RE = /\0/u
const WINDOWS_DRIVE_RE = /^[A-Za-z]:[\\/]/u
const UNC_RE = /^\\\\/u
const WINDOWS_PATH_RE = /\b[A-Za-z]:\\[^\s"'`]+/g
const UNIX_PATH_RE = /(?:\/Users\/|\/home\/|\/mnt\/|\/var\/|\/tmp\/)[^\s"'`]+/g
const FILE_URL_RE = /\bfile:\/\/[^\s"'`)]+/gi
const TOKEN_ASSIGNMENT_RE = /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|content[_-]?token|token|secret|password)(\s*[:=]\s*)[^\s"',;}]+/gi
const FULL_HASH_RE = /\b(fullHash|sha256|hash)(\s*[:=]\s*)[A-Fa-f0-9]{16,}\b/g
const STORAGE_REF_RE = /\bstorage(?:Ref|Uri)(\s*[:=]\s*)[^\s"',;}]+/gi
const FILE_BODY_RE = /\bfile\s+body\s*:\s*[^\r\n"'`]+/gi
const URL_RE = /\bhttps?:\/\/[^\s"'`)]+/gi
const BASE64_RE = /\b[A-Za-z0-9+/]{80,}={0,2}\b/g

export function prepareElectronConversionRequest(input: unknown): ElectronConversionRequestPreparation {
  const raw = isRecord(input) ? input : null
  const requestId = sanitizeId(raw?.requestId, 'unknown-request')
  const conversionKind = sanitizeId(raw?.conversionKind, 'unknown-conversion')
  if (!raw) return invalidResponse(requestId, conversionKind, 'Electron conversion request is invalid.')

  const timeoutMs = normalizeTimeout(raw.timeoutMs)
  if (!timeoutMs) return invalidResponse(requestId, conversionKind, 'Electron conversion timeout is invalid.')

  const policy = normalizePolicy(raw.policy)
  if (!policy.ok) {
    return {
      ok: false,
      response: failClosedResponse({
        requestId,
        conversionKind,
        status: 'blocked',
        code: 'electron_conversion_blocked',
        message: 'Electron conversion policy is blocked.',
      }),
    }
  }

  const source = normalizePathDescriptor(raw.source, 'sandbox_input')
  const output = normalizeOutputDescriptor(raw.output)
  if (!source.ok || !output.ok) return invalidResponse(requestId, conversionKind, 'Electron conversion path descriptor is invalid.')

  const sourceMime = stringValue((raw.source as any)?.mime)
  const outputMime = stringValue((raw.output as any)?.mime)
  const outputExtension = normalizeExtension((raw.output as any)?.extension)
  if (!sourceMime || !outputMime || !outputExtension) {
    return invalidResponse(requestId, conversionKind, 'Electron conversion MIME or extension descriptor is invalid.')
  }

  return {
    ok: true,
    request: {
      requestId,
      conversionKind,
      source: {
        kind: 'sandbox_input',
        rootDir: source.rootDir,
        relativePath: source.relativePath,
        mime: sourceMime,
      },
      output: {
        kind: 'sandbox_output',
        rootDir: output.rootDir,
        relativePath: output.relativePath,
        mime: outputMime,
        extension: outputExtension,
      },
      timeoutMs,
      policy: {
        javascriptEnabled: false,
        networkEnabled: false,
        localFileAccessEnabled: false,
      },
      resolvedSourcePath: source.resolvedPath,
      resolvedOutputPath: output.resolvedPath,
    },
  }
}

export function failClosedElectronConversionResponse(input: Readonly<{
  requestId: string
  conversionKind: string
  status: Exclude<ElectronConversionStatus, 'success'>
  code: ElectronConversionDiagnosticCode
  message: string
  cleanupStatus?: ElectronConversionCleanupStatus
}>): ElectronConversionResponse {
  return failClosedResponse(input)
}

export function successElectronConversionResponse(input: Readonly<{
  request: ElectronConversionPreparedRequest
  outputPath: string
  cleanupStatus?: ElectronConversionCleanupStatus
}>): ElectronConversionResponse {
  return {
    requestId: input.request.requestId,
    conversionKind: input.request.conversionKind,
    status: 'success',
    output: {
      kind: 'controlled_output',
      outputPath: input.outputPath,
      mime: input.request.output.mime,
      extension: input.request.output.extension,
    },
    diagnostics: [],
    cleanupStatus: input.cleanupStatus ?? 'attempted',
  }
}

export function toRendererSafeElectronConversionResponse(response: ElectronConversionResponse): ElectronConversionRendererSafeResponse {
  return {
    requestId: sanitizeId(response.requestId, 'unknown-request'),
    conversionKind: sanitizeId(response.conversionKind, 'unknown-conversion'),
    status: response.status,
    output: response.output
      ? {
          kind: 'controlled_output',
          mime: response.output.mime,
          extension: response.output.extension,
        }
      : null,
    diagnostics: response.diagnostics.map((diagnostic) => sanitizeElectronConversionDiagnostic(diagnostic)),
    cleanupStatus: response.cleanupStatus,
  }
}

export function sanitizeElectronConversionDiagnostic(input: Readonly<{
  code: ElectronConversionDiagnosticCode
  message?: string | null
}>): ElectronConversionDiagnostic {
  return {
    code: input.code,
    message: sanitizeMessage(input.message ?? input.code),
  }
}

function invalidResponse(requestId: string, conversionKind: string, message: string): ElectronConversionRequestPreparation {
  return {
    ok: false,
    response: failClosedResponse({
      requestId,
      conversionKind,
      status: 'blocked',
      code: 'electron_conversion_request_invalid',
      message,
    }),
  }
}

function failClosedResponse(input: Readonly<{
  requestId: string
  conversionKind: string
  status: Exclude<ElectronConversionStatus, 'success'>
  code: ElectronConversionDiagnosticCode
  message: string
  cleanupStatus?: ElectronConversionCleanupStatus
}>): ElectronConversionResponse {
  return {
    requestId: sanitizeId(input.requestId, 'unknown-request'),
    conversionKind: sanitizeId(input.conversionKind, 'unknown-conversion'),
    status: input.status,
    output: null,
    diagnostics: [sanitizeElectronConversionDiagnostic({ code: input.code, message: input.message })],
    cleanupStatus: input.cleanupStatus ?? 'not_requested',
  }
}

function normalizePathDescriptor(value: unknown, expectedKind: string): Readonly<{
  ok: true
  rootDir: string
  relativePath: string
  resolvedPath: string
} | { ok: false }> {
  const raw = isRecord(value) ? value : null
  if (!raw || raw.kind !== expectedKind) return { ok: false }
  const rootDir = stringValue(raw.rootDir)
  const relativePath = stringValue(raw.relativePath)
  if (!rootDir || !relativePath) return { ok: false }
  if (NUL_RE.test(rootDir) || NUL_RE.test(relativePath)) return { ok: false }
  if (!path.isAbsolute(rootDir) || UNC_RE.test(rootDir)) return { ok: false }
  if (path.isAbsolute(relativePath) || UNC_RE.test(relativePath) || WINDOWS_DRIVE_RE.test(relativePath)) return { ok: false }
  const parts = relativePath.split(/[\\/]+/u)
  if (parts.some((part) => part === '..')) return { ok: false }
  const resolvedRoot = path.resolve(rootDir)
  const resolvedPath = path.resolve(resolvedRoot, relativePath)
  if (!isPathInside(resolvedRoot, resolvedPath)) return { ok: false }
  return { ok: true, rootDir: resolvedRoot, relativePath, resolvedPath }
}

function normalizeOutputDescriptor(value: unknown) {
  return normalizePathDescriptor(value, 'sandbox_output')
}

function normalizePolicy(value: unknown): Readonly<{ ok: true } | { ok: false }> {
  const raw = isRecord(value) ? value : {}
  if (raw.javascriptEnabled === true) return { ok: false }
  if (raw.networkEnabled === true) return { ok: false }
  if (raw.localFileAccessEnabled === true) return { ok: false }
  return { ok: true }
}

function normalizeTimeout(value: unknown): number | null {
  if (value == null) return 15_000
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const timeoutMs = Math.floor(value)
  return timeoutMs > 0 && timeoutMs <= 120_000 ? timeoutMs : null
}

function normalizeExtension(value: unknown): string | null {
  const normalized = stringValue(value)?.replace(/^\./u, '').toLowerCase()
  if (!normalized || !/^[a-z0-9]{1,12}$/u.test(normalized)) return null
  return normalized
}

function sanitizeId(value: unknown, fallback: string): string {
  const normalized = stringValue(value)?.replace(/[^A-Za-z0-9._:-]+/g, '_')
  return normalized || fallback
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isPathInside(root: string, candidate: string): boolean {
  const resolvedRoot = path.resolve(root)
  const resolvedCandidate = path.resolve(candidate)
  const rootForCompare = process.platform === 'win32' ? resolvedRoot.toLowerCase() : resolvedRoot
  const candidateForCompare = process.platform === 'win32' ? resolvedCandidate.toLowerCase() : resolvedCandidate
  return candidateForCompare === rootForCompare || candidateForCompare.startsWith(rootForCompare.endsWith(path.sep) ? rootForCompare : `${rootForCompare}${path.sep}`)
}

function sanitizeMessage(value: string): string {
  return String(value ?? '')
    .replace(FILE_URL_RE, '[redacted-file-url]')
    .replace(WINDOWS_PATH_RE, '[redacted-path]')
    .replace(UNIX_PATH_RE, '[redacted-path]')
    .replace(STORAGE_REF_RE, 'storageRef=[redacted-storage-ref]')
    .replace(TOKEN_ASSIGNMENT_RE, '$1$2[redacted-token]')
    .replace(FULL_HASH_RE, '$1$2[redacted-hash]')
    .replace(FILE_BODY_RE, 'file body: [redacted-file-body]')
    .replace(URL_RE, '[redacted-url]')
    .replace(BASE64_RE, '[redacted-data]')
}
