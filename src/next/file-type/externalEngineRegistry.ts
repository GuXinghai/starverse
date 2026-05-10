import { FILE_FORMAT_IDS, type FileFormatId } from './types'
import { parseManagedEnginePluginManifest } from './externalEngineManifest'
import { computeEngineAvailability } from './externalEngineAvailability'
import type {
  EngineAvailability,
  EngineDiagnosticEvent,
  EngineFailureReason,
  EngineHealthStatus,
  EngineId,
  ExternalEngineRecord,
  ManagedEnginePluginManifest,
} from './externalEngineTypes'
import type { TrustVerificationStatus } from './enginePluginTrustContracts'

export type MarkEngineHealthyInput = Readonly<{
  engineId: EngineId
  version?: string | null
}>

export type MarkEngineFailedInput = Readonly<{
  engineId: EngineId
  reason: EngineFailureReason
  detail?: string | null
  version?: string | null
}>

export type SetEngineVerificationStatusInput = Readonly<{
  engineId: EngineId
  verificationStatus: TrustVerificationStatus | null
}>

export type ExternalEngineRegistry = Readonly<{
  registerBuiltInEngineDefinitions: () => ExternalEngineRecord[]
  registerManifest: (manifest: ManagedEnginePluginManifest) => ExternalEngineRecord
  listKnownEngines: () => ExternalEngineRecord[]
  getEngineById: (engineId: EngineId) => ExternalEngineRecord | null
  getEngineAvailability: () => EngineAvailability
  markEngineHealthy: (input: MarkEngineHealthyInput) => ExternalEngineRecord
  markEngineFailed: (input: MarkEngineFailedInput) => ExternalEngineRecord
  disableEngine: (engineId: EngineId) => ExternalEngineRecord
  enableEngine: (engineId: EngineId) => ExternalEngineRecord
  setVerificationStatus: (input: SetEngineVerificationStatusInput) => ExternalEngineRecord
  clearDiagnostics: () => void
}>

const FILE_FORMAT_ID_SET = new Set<string>(FILE_FORMAT_IDS)
const WINDOWS_ABSOLUTE_PATH_RE = /\b[A-Za-z]:\\[^\s"'`]+/g
const UNIX_ABSOLUTE_PATH_RE = /(?:\/Users\/|\/home\/|\/mnt\/|\/var\/|\/tmp\/)[^\s"'`]+/g
const CONTENT_TOKEN_RE = /(contentToken["'\s:=]+)([^\s"',}]+)/gi
const FULL_HASH_RE = /(fullHash["'\s:=]+)([A-Za-z0-9+/=:_-]{12,})/gi

const BUILT_IN_MANIFESTS: readonly ManagedEnginePluginManifest[] = [
  parseManagedEnginePluginManifest({
    id: 'tika',
    displayName: 'Apache Tika (stub)',
    version: 'stub-1',
    platform: 'any',
    kind: 'builtin',
    capabilities: ['document_conversion', 'text_extraction'],
    supportedFormatIds: ['pdf', 'doc', 'docx', 'docm', 'odt', 'rtf', 'epub', 'ppt', 'pptx', 'pptm', 'odp'],
    supportedMimeTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ],
    resourceLimits: { maxInputBytes: null, maxDurationMs: 60000 },
    sandbox: { enabled: true },
    network: { allowed: false },
  }),
  parseManagedEnginePluginManifest({
    id: 'libreoffice',
    displayName: 'LibreOffice (stub)',
    version: 'stub-1',
    platform: 'any',
    kind: 'builtin',
    capabilities: ['document_conversion', 'spreadsheet_conversion', 'presentation_conversion', 'rendered_images'],
    supportedFormatIds: ['doc', 'docx', 'docm', 'xls', 'xlsx', 'xlsm', 'ppt', 'pptx', 'pptm', 'odt', 'ods', 'odp'],
    supportedMimeTypes: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ],
    resourceLimits: { maxInputBytes: null, maxDurationMs: 60000 },
    sandbox: { enabled: true },
    network: { allowed: false },
  }),
  parseManagedEnginePluginManifest({
    id: 'ffprobe',
    displayName: 'FFprobe (stub)',
    version: 'stub-1',
    platform: 'any',
    kind: 'builtin',
    capabilities: ['audio_extraction', 'frame_selection'],
    supportedFormatIds: ['mp3', 'wav', 'm4a', 'flac', 'ogg', 'mp4', 'mov', 'mkv', 'webm', 'avi'],
    supportedMimeTypes: [
      'audio/mpeg',
      'audio/wav',
      'video/mp4',
      'video/webm',
    ],
    resourceLimits: { maxInputBytes: null, maxDurationMs: 60000 },
    sandbox: { enabled: true },
    network: { allowed: false },
  }),
  parseManagedEnginePluginManifest({
    id: 'pandoc',
    displayName: 'Pandoc (stub)',
    version: 'stub-1',
    platform: 'any',
    kind: 'builtin',
    capabilities: ['document_conversion'],
    supportedFormatIds: ['markdown', 'html', 'docx', 'odt', 'epub'],
    supportedMimeTypes: [
      'text/markdown',
      'text/html',
      'application/epub+zip',
    ],
    resourceLimits: { maxInputBytes: null, maxDurationMs: 60000 },
    sandbox: { enabled: true },
    network: { allowed: false },
  }),
] as const

// eslint-disable-next-line max-lines-per-function
export function createExternalEngineRegistry(now: () => number = Date.now): ExternalEngineRegistry {
  const records = new Map<EngineId, ExternalEngineRecord>()
  const diagnostics: EngineDiagnosticEvent[] = []

  function registerBuiltInEngineDefinitions(): ExternalEngineRecord[] {
    const inserted: ExternalEngineRecord[] = []
    for (const manifest of BUILT_IN_MANIFESTS) {
      inserted.push(registerManifest(manifest))
    }
    return inserted
  }

  function registerManifest(manifest: ManagedEnginePluginManifest): ExternalEngineRecord {
    validateManifestFormats(manifest)
    const existing = records.get(manifest.id)
    const next: ExternalEngineRecord = {
      id: manifest.id,
      displayName: manifest.displayName,
      version: manifest.version,
      platform: manifest.platform,
      kind: manifest.kind,
      capabilities: [...manifest.capabilities],
      supportedFormatIds: [...manifest.supportedFormatIds],
      supportedMimeTypes: [...manifest.supportedMimeTypes],
      enabled: existing?.enabled ?? true,
      healthStatus: existing?.healthStatus ?? 'unknown',
      failureReason: existing?.failureReason ?? null,
      failureDetails: existing?.failureDetails ?? null,
      lastCheckedAt: existing?.lastCheckedAt ?? null,
      healthcheck: manifest.healthcheck ?? existing?.healthcheck ?? null,
    }
    records.set(manifest.id, next)
    return next
  }

  function listKnownEngines(): ExternalEngineRecord[] {
    return Array.from(records.values()).sort((a, b) => String(a.id).localeCompare(String(b.id)))
  }

  function getEngineById(engineId: EngineId): ExternalEngineRecord | null {
    return records.get(engineId) ?? null
  }

  function getEngineAvailability(): EngineAvailability {
    return computeEngineAvailability(listKnownEngines(), diagnostics)
  }

  function markEngineHealthy(input: MarkEngineHealthyInput): ExternalEngineRecord {
    const record = requireRecord(input.engineId)
    const next = patchRecord(record, {
      version: normalizeVersion(input.version, record.version),
      healthStatus: 'healthy',
      failureReason: null,
      failureDetails: null,
      lastCheckedAt: now(),
    })
    pushDiagnostic('engine_health_checked', next, null)
    return next
  }

  function markEngineFailed(input: MarkEngineFailedInput): ExternalEngineRecord {
    const record = requireRecord(input.engineId)
    const status = input.reason === 'engine_timeout' ? 'timeout' : 'failed'
    const next = patchRecord(record, {
      version: normalizeVersion(input.version, record.version),
      healthStatus: status,
      failureReason: input.reason,
      failureDetails: sanitizeEngineDetailForDiagnostics(input.detail ?? null),
      lastCheckedAt: now(),
    })
    const event =
      input.reason === 'engine_timeout'
        ? 'engine_timeout'
        : input.reason === 'engine_unavailable'
          ? 'engine_unavailable'
          : 'engine_failed'
    pushDiagnostic(event, next, next.failureDetails)
    return next
  }

  function disableEngine(engineId: EngineId): ExternalEngineRecord {
    const record = requireRecord(engineId)
    const next = patchRecord(record, {
      enabled: false,
      healthStatus: 'disabled',
      failureReason: 'disabled_by_policy',
      failureDetails: null,
      lastCheckedAt: now(),
    })
    pushDiagnostic('engine_failed', next, null)
    return next
  }

  function enableEngine(engineId: EngineId): ExternalEngineRecord {
    const record = requireRecord(engineId)
    const next = patchRecord(record, {
      enabled: true,
      healthStatus: record.healthStatus === 'disabled' ? 'unknown' : record.healthStatus,
      failureReason: record.healthStatus === 'disabled' ? null : record.failureReason,
      failureDetails: record.healthStatus === 'disabled' ? null : record.failureDetails,
    })
    return next
  }

  function clearDiagnostics(): void {
    diagnostics.length = 0
  }

  function setVerificationStatus(input: SetEngineVerificationStatusInput): ExternalEngineRecord {
    const record = requireRecord(input.engineId)
    const next = patchRecord(record, { verificationStatus: input.verificationStatus as TrustVerificationStatus | undefined })
    return next
  }

  function requireRecord(engineId: EngineId): ExternalEngineRecord {
    const record = records.get(engineId)
    if (!record) throw new Error(`unknown engine: ${engineId}`)
    return record
  }

  function patchRecord(record: ExternalEngineRecord, patch: Partial<ExternalEngineRecord>): ExternalEngineRecord {
    const next: ExternalEngineRecord = {
      ...record,
      ...patch,
    }
    records.set(next.id, next)
    return next
  }

  function pushDiagnostic(
    event: EngineDiagnosticEvent['event'],
    record: ExternalEngineRecord,
    detail: string | null
  ): void {
    diagnostics.push({
      event,
      engineId: record.id,
      version: record.version,
      healthStatus: record.healthStatus,
      failureReason: record.failureReason,
      detail,
      timestamp: now(),
    })
  }

  return {
    registerBuiltInEngineDefinitions,
    registerManifest,
    listKnownEngines,
    getEngineById,
    getEngineAvailability,
    markEngineHealthy,
    markEngineFailed,
    disableEngine,
    enableEngine,
    setVerificationStatus,
    clearDiagnostics,
  }
}

export function sanitizeEngineDetailForDiagnostics(value: string | null): string | null {
  if (!value) return null
  const compact = value.trim()
  if (!compact) return null
  return compact
    .replace(CONTENT_TOKEN_RE, '$1[redacted-token]')
    .replace(FULL_HASH_RE, '$1[redacted-hash]')
    .replace(WINDOWS_ABSOLUTE_PATH_RE, '[redacted-path]')
    .replace(UNIX_ABSOLUTE_PATH_RE, '[redacted-path]')
}

function normalizeVersion(input: string | null | undefined, fallback: string): string {
  const normalized = typeof input === 'string' ? input.trim() : ''
  return normalized.length > 0 ? normalized : fallback
}

function validateManifestFormats(manifest: ManagedEnginePluginManifest): void {
  for (const formatId of manifest.supportedFormatIds) {
    if (!FILE_FORMAT_ID_SET.has(formatId)) {
      throw new Error(`unsupported format id in manifest ${manifest.id}: ${formatId}`)
    }
  }
}
