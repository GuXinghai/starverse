import type { FileFormatId } from './types'

export const KNOWN_ENGINE_IDS = ['tika', 'libreoffice', 'ffprobe', 'pandoc', 'magika'] as const
export type KnownEngineId = (typeof KNOWN_ENGINE_IDS)[number]
export type EngineId = KnownEngineId | (string & {})

export const ENGINE_KINDS = ['builtin', 'plugin'] as const
export type EngineKind = (typeof ENGINE_KINDS)[number]

export const ENGINE_PLATFORMS = ['any', 'win32', 'darwin', 'linux'] as const
export type EnginePlatform = (typeof ENGINE_PLATFORMS)[number]

export const ENGINE_CAPABILITIES = [
  'document_conversion',
  'spreadsheet_conversion',
  'presentation_conversion',
  'rendered_images',
  'text_extraction',
  'audio_extraction',
  'frame_selection',
] as const
export type EngineCapability = (typeof ENGINE_CAPABILITIES)[number]

export const ENGINE_HEALTH_STATUSES = [
  'unknown',
  'healthy',
  'failed',
  'timeout',
  'disabled',
] as const
export type EngineHealthStatus = (typeof ENGINE_HEALTH_STATUSES)[number]

export const ENGINE_FAILURE_REASONS = [
  'engine_unavailable',
  'engine_timeout',
  'engine_failed',
  'output_limit_exceeded',
  'integrity_missing',
  'hash_mismatch',
  'plugin_path_outside_root',
  'runtime_entry_missing',
  'model_file_missing',
  'config_file_missing',
  'plugin_not_found',
  'manifest_invalid',
  'platform_unsupported',
  'disabled_by_policy',
] as const
export type EngineFailureReason = (typeof ENGINE_FAILURE_REASONS)[number]

export type EngineHealthCheckCommand = Readonly<{
  command: string
  args: readonly string[]
  cwd: string | null
}>

export type ManagedEnginePluginManifest = Readonly<{
  id: EngineId
  displayName: string
  version: string
  platform: EnginePlatform
  kind: EngineKind
  capabilities: readonly EngineCapability[]
  supportedFormatIds: readonly FileFormatId[]
  supportedMimeTypes: readonly string[]
  resourceLimits: Readonly<{
    maxInputBytes: number | null
    maxDurationMs: number | null
  }>
  sandbox: Readonly<{
    enabled: boolean
  }>
  network: Readonly<{
    allowed: boolean
  }>
  healthcheck: EngineHealthCheckCommand | null
}>

export type ExternalEngineRecord = Readonly<{
  id: EngineId
  displayName: string
  version: string
  platform: EnginePlatform
  kind: EngineKind
  capabilities: readonly EngineCapability[]
  supportedFormatIds: readonly FileFormatId[]
  supportedMimeTypes: readonly string[]
  enabled: boolean
  healthStatus: EngineHealthStatus
  failureReason: EngineFailureReason | null
  failureDetails: string | null
  lastCheckedAt: number | null
  healthcheck: EngineHealthCheckCommand | null
}>

export type EngineCapabilityAvailability = Readonly<Record<EngineCapability, boolean>>

export type EngineRouteAvailability = Readonly<{
  documentConversion: boolean
  spreadsheetConversion: boolean
  presentationConversion: boolean
  renderedImages: boolean
  textExtraction: boolean
  audioExtraction: boolean
  frameSelection: boolean
}>

export type EngineDiagnosticEvent = Readonly<{
  event:
    | 'engine_unavailable'
    | 'engine_timeout'
    | 'engine_failed'
    | 'engine_health_checked'
  engineId: EngineId
  version: string
  healthStatus: EngineHealthStatus
  failureReason: EngineFailureReason | null
  detail: string | null
  timestamp: number
}>

export type EngineAvailability = Readonly<{
  engines: readonly ExternalEngineRecord[]
  capabilityAvailability: EngineCapabilityAvailability
  routeAvailability: EngineRouteAvailability
  diagnostics: readonly EngineDiagnosticEvent[]
}>

export type EngineHealthProbeResult = Readonly<{
  status: Exclude<EngineHealthStatus, 'disabled' | 'unknown'>
  reason: EngineFailureReason | null
  detail: string | null
}>

export type EngineHealthRunner = (
  record: ExternalEngineRecord
) => Promise<EngineHealthProbeResult>
