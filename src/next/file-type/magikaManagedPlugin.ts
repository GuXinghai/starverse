import { createHash } from 'node:crypto'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { runEngineHealthCheck } from './externalEngineHealth'
import { parseManagedEnginePluginManifest } from './externalEngineManifest'
import { createExternalEngineRegistry, sanitizeEngineDetailForDiagnostics } from './externalEngineRegistry'
import type {
  EngineAvailability,
  EngineFailureReason,
  EngineHealthRunner,
  EnginePlatform,
  ExternalEngineRecord,
  ManagedEnginePluginManifest,
} from './externalEngineTypes'
import type {
  MagikaRuntimeClassifyOutput,
  MagikaRuntimeDetectionInput,
  MagikaRuntimeKind,
  MagikaRuntimeLoadResult,
  MagikaRuntimeLoader,
} from './magikaRuntimeLoader'

type ExistsFile = (filePath: string) => Promise<boolean>
type ReadBytes = (filePath: string) => Promise<Uint8Array>

const WINDOWS_ABSOLUTE_PATH_RE = /\b[A-Za-z]:\\[^\s"'`]+/g
const UNIX_ABSOLUTE_PATH_RE = /(?:\/Users\/|\/home\/|\/mnt\/|\/var\/|\/tmp\/)[^\s"'`]+/g

export type MagikaManagedPluginIntegrity = Readonly<Record<string, string>>

export type MagikaManagedPluginManifest = Readonly<{
  manifestSchemaVersion: string
  engineId: 'magika'
  displayName: string
  pluginVersion: string
  runtimeKind: MagikaRuntimeKind
  runtimeEntry: string
  modelVersion: string
  modelFiles: readonly string[]
  configFiles: readonly string[]
  integrity: MagikaManagedPluginIntegrity
  license: string
  attribution: string
  healthcheck: ManagedEnginePluginManifest['healthcheck']
  capabilities: ManagedEnginePluginManifest['capabilities']
  supportedFormatIds: ManagedEnginePluginManifest['supportedFormatIds']
  supportedMimeTypes: ManagedEnginePluginManifest['supportedMimeTypes']
  taxonomyMapVersionCompatibility: string | null
  supportedLabels: readonly string[]
  minStarverseVersion: string | null
  platform: EnginePlatform
}>

export type MagikaManagedPluginDescriptor = Readonly<{
  pluginDir: string
  manifestPath: string
  runtimeEntryPath: string
  modelFilePaths: readonly string[]
  configFilePaths: readonly string[]
  manifest: MagikaManagedPluginManifest
}>

export type MagikaManagedPluginDiscoveryResult =
  | Readonly<{
      available: true
      descriptor: MagikaManagedPluginDescriptor
    }>
  | Readonly<{
      available: false
      reason: EngineFailureReason
      detail: string | null
    }>

export type MagikaManagedPluginHealthResult = Readonly<{
  healthy: boolean
  reason: EngineFailureReason | null
  detail: string | null
  record: ExternalEngineRecord
  availability: EngineAvailability
}>

export type MagikaManagedPluginAvailabilityResult = Readonly<{
  available: boolean
  reason: EngineFailureReason | null
  detail: string | null
  availability: EngineAvailability
  record: ExternalEngineRecord
  descriptor: MagikaManagedPluginDescriptor | null
}>

export type DiscoverMagikaManagedPluginInput = Readonly<{
  pluginDirs: readonly string[]
  existsFile?: ExistsFile
  readBytes?: ReadBytes
}>

export type BuildMagikaManagedRuntimeLoaderInput = Readonly<{
  pluginDirs: readonly string[]
  classify?: (
    input: Readonly<{
      probe: MagikaRuntimeDetectionInput
      descriptor: MagikaManagedPluginDescriptor
    }>
  ) => Promise<MagikaRuntimeClassifyOutput | null> | MagikaRuntimeClassifyOutput | null
  healthRunner?: EngineHealthRunner
}>

export type EvaluateMagikaManagedPluginAvailabilityInput = Readonly<{
  pluginDirs: readonly string[]
  healthRunner?: EngineHealthRunner
}>

export async function discoverMagikaManagedPlugin(
  input: DiscoverMagikaManagedPluginInput
): Promise<MagikaManagedPluginDiscoveryResult> {
  const existsFile = input.existsFile ?? fileExists
  const readBytes = input.readBytes ?? readFileAsBytes
  const dirs = normalizePluginDirs(input.pluginDirs)
  if (dirs.length === 0) {
    return unavailable('plugin_not_found', 'magika plugin directory is not configured')
  }

  let lastError: MagikaManagedPluginDiscoveryResult | null = null
  for (const pluginDir of dirs) {
    const manifestPath = path.join(pluginDir, 'manifest.json')
    if (!(await existsFile(manifestPath))) continue

    const parsed = await readManifest(manifestPath, readBytes)
    if (!parsed.ok) {
      lastError = unavailable('manifest_invalid', parsed.error)
      continue
    }

    if (parsed.manifest.engineId !== 'magika') {
      lastError = unavailable('manifest_invalid', 'engineId must be magika')
      continue
    }

    const runtimeEntryPath = path.resolve(pluginDir, parsed.manifest.runtimeEntry)
    if (!(await existsFile(runtimeEntryPath))) {
      lastError = unavailable('runtime_entry_missing', `runtime entry missing: ${runtimeEntryPath}`)
      continue
    }

    const modelFilePaths = parsed.manifest.modelFiles.map((value) => path.resolve(pluginDir, value))
    const configFilePaths = parsed.manifest.configFiles.map((value) => path.resolve(pluginDir, value))

    if (!(await allFilesExist(modelFilePaths, existsFile))) {
      lastError = unavailable('model_file_missing', 'one or more model files are missing')
      continue
    }
    if (!(await allFilesExist(configFilePaths, existsFile))) {
      lastError = unavailable('config_file_missing', 'one or more config files are missing')
      continue
    }

    const integrity = await verifyManifestIntegrity({
      manifest: parsed.manifest,
      pluginDir,
      readBytes,
    })
    if (!integrity.ok) {
      lastError = unavailable('hash_mismatch', integrity.detail)
      continue
    }

    return {
      available: true,
      descriptor: {
        pluginDir,
        manifestPath,
        runtimeEntryPath,
        modelFilePaths,
        configFilePaths,
        manifest: parsed.manifest,
      },
    }
  }

  return lastError ?? unavailable('plugin_not_found', 'magika plugin manifest not found')
}

export function createManagedPluginMagikaRuntimeLoader(
  input: BuildMagikaManagedRuntimeLoaderInput
): MagikaRuntimeLoader {
  return {
    load: async (): Promise<MagikaRuntimeLoadResult> => {
      const discovery = await discoverMagikaManagedPlugin({
        pluginDirs: input.pluginDirs,
      })
      if (!discovery.available) {
        return {
          available: false,
          runtimeKind: 'unavailable',
          modelVersion: null,
          reason: 'runtime_unavailable',
          detail: discovery.detail,
        }
      }

      const health = await runManagedMagikaPluginHealthCheck({
        descriptor: discovery.descriptor,
        healthRunner: input.healthRunner,
      })
      if (!health.healthy) {
        return {
          available: false,
          runtimeKind: 'local_loader',
          modelVersion: discovery.descriptor.manifest.modelVersion,
          reason: 'runtime_unavailable',
          detail: health.detail,
        }
      }

      return {
        available: true,
        runtime: {
          kind: discovery.descriptor.manifest.runtimeKind,
          modelVersion: discovery.descriptor.manifest.modelVersion,
          classify: async (probe) => {
            if (!input.classify) return null
            return await input.classify({
              probe,
              descriptor: discovery.descriptor,
            })
          },
        },
      }
    },
  }
}

export async function evaluateMagikaManagedPluginAvailability(
  input: EvaluateMagikaManagedPluginAvailabilityInput
): Promise<MagikaManagedPluginAvailabilityResult> {
  const registry = createExternalEngineRegistry()
  registry.registerBuiltInEngineDefinitions()
  const discovery = await discoverMagikaManagedPlugin({ pluginDirs: input.pluginDirs })

  if (!discovery.available) {
    const record = registry.registerManifest(
      parseManagedEnginePluginManifest({
        id: 'magika',
        displayName: 'Magika (managed plugin)',
        version: 'unavailable',
        kind: 'plugin',
        platform: 'any',
        capabilities: ['text_extraction'],
        supportedFormatIds: [],
        supportedMimeTypes: [],
        sandbox: { enabled: true },
        network: { allowed: false },
      })
    )
    const failed = registry.markEngineFailed({
      engineId: record.id,
      reason: discovery.reason,
      detail: discovery.detail,
      version: record.version,
    })
    return {
      available: false,
      reason: failed.failureReason,
      detail: failed.failureDetails,
      availability: registry.getEngineAvailability(),
      record: failed,
      descriptor: null,
    }
  }

  const health = await runManagedMagikaPluginHealthCheck({
    descriptor: discovery.descriptor,
    healthRunner: input.healthRunner,
  })
  return {
    available: health.healthy,
    reason: health.reason,
    detail: health.detail,
    availability: health.availability,
    record: health.record,
    descriptor: discovery.descriptor,
  }
}

export async function runManagedMagikaPluginHealthCheck(input: Readonly<{
  descriptor: MagikaManagedPluginDescriptor
  healthRunner?: EngineHealthRunner
}>): Promise<MagikaManagedPluginHealthResult> {
  const registry = createExternalEngineRegistry()
  registry.registerBuiltInEngineDefinitions()
  registry.registerManifest(toManagedEnginePluginManifest(input.descriptor))

  const checked =
    input.descriptor.manifest.healthcheck == null
      ? registry.markEngineHealthy({
          engineId: 'magika',
          version: input.descriptor.manifest.pluginVersion,
        })
      : await runEngineHealthCheck({
          registry,
          engineId: 'magika',
          runner: input.healthRunner,
        })
  const availability = registry.getEngineAvailability()
  const healthy = checked.healthStatus === 'healthy'

  return {
    healthy,
    reason: healthy ? null : checked.failureReason,
    detail: checked.failureDetails,
    record: checked,
    availability,
  }
}

export function toManagedEnginePluginManifest(
  descriptor: MagikaManagedPluginDescriptor
): ManagedEnginePluginManifest {
  const manifest = descriptor.manifest
  return parseManagedEnginePluginManifest({
    id: manifest.engineId,
    displayName: manifest.displayName,
    version: manifest.pluginVersion,
    kind: 'plugin',
    platform: manifest.platform,
    capabilities: manifest.capabilities,
    supportedFormatIds: manifest.supportedFormatIds,
    supportedMimeTypes: manifest.supportedMimeTypes,
    resourceLimits: { maxInputBytes: null, maxDurationMs: null },
    sandbox: { enabled: true },
    network: { allowed: false },
    healthcheck: manifest.healthcheck,
  })
}

type ReadManifestSuccess = Readonly<{ ok: true; manifest: MagikaManagedPluginManifest }>
type ReadManifestFailure = Readonly<{ ok: false; error: string }>
type ReadManifestResult = ReadManifestSuccess | ReadManifestFailure

async function readManifest(manifestPath: string, readBytes: ReadBytes): Promise<ReadManifestResult> {
  try {
    const bytes = await readBytes(manifestPath)
    const text = Buffer.from(bytes).toString('utf8')
    const source = JSON.parse(text)
    const manifest = parseMagikaManagedPluginManifest(source)
    return { ok: true, manifest }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      error: sanitizeForDetails(`manifest parse failed: ${detail}`) ?? 'manifest parse failed',
    }
  }
}

export function parseMagikaManagedPluginManifest(input: unknown): MagikaManagedPluginManifest {
  const source = asObject(input)
  if (!source) throw new Error('manifest must be an object')

  const manifestSchemaVersion = requireNonEmptyString(source.manifestSchemaVersion, 'manifestSchemaVersion')
  const engineId = requireNonEmptyString(source.engineId, 'engineId')
  if (engineId !== 'magika') throw new Error('engineId must be magika')
  const displayName = requireNonEmptyString(source.displayName, 'displayName')
  const pluginVersion = requireNonEmptyString(source.pluginVersion, 'pluginVersion')
  const runtimeKind = parseRuntimeKind(source.runtimeKind)
  const runtimeEntry = requireNonEmptyString(source.runtimeEntry, 'runtimeEntry')
  const modelVersion = requireNonEmptyString(source.modelVersion, 'modelVersion')
  const modelFiles = parseNonEmptyStringArray(source.modelFiles, 'modelFiles', 1)
  const configFiles = parseNonEmptyStringArray(source.configFiles, 'configFiles', 1)
  const integrity = parseIntegrity(source.integrity)
  const license = requireNonEmptyString(source.license, 'license')
  const attribution = requireNonEmptyString(source.attribution, 'attribution')
  const platform = parsePlatform(source.platform)
  const capabilities = parseCapabilities(source.capabilities)
  const supportedFormatIds = parseStringArray(source.supportedFormatIds)
  const supportedMimeTypes = parseStringArray(source.supportedMimeTypes)
  const supportedLabels = parseStringArray(source.supportedLabels)
  const taxonomyMapVersionCompatibility = optionalNonEmptyString(source.taxonomyMapVersionCompatibility)
  const minStarverseVersion = optionalNonEmptyString(source.minStarverseVersion)
  const healthcheck = parseHealthcheck(source.healthcheck)

  return {
    manifestSchemaVersion,
    engineId: 'magika',
    displayName,
    pluginVersion,
    runtimeKind,
    runtimeEntry,
    modelVersion,
    modelFiles,
    configFiles,
    integrity,
    license,
    attribution,
    healthcheck,
    capabilities,
    supportedFormatIds: supportedFormatIds as ManagedEnginePluginManifest['supportedFormatIds'],
    supportedMimeTypes,
    taxonomyMapVersionCompatibility,
    supportedLabels,
    minStarverseVersion,
    platform,
  }
}

async function verifyManifestIntegrity(input: Readonly<{
  manifest: MagikaManagedPluginManifest
  pluginDir: string
  readBytes: ReadBytes
}>): Promise<Readonly<{ ok: true } | { ok: false; detail: string }>> {
  const entries = Object.entries(input.manifest.integrity)
  for (const [relativePath, expectedHash] of entries) {
    const normalizedExpected = normalizeSha(expectedHash)
    if (!normalizedExpected) continue
    const absolutePath = path.resolve(input.pluginDir, relativePath)
    try {
      const bytes = await input.readBytes(absolutePath)
      const actualHash = createHash('sha256').update(Buffer.from(bytes)).digest('hex')
      if (actualHash.toLowerCase() !== normalizedExpected) {
        return {
          ok: false,
          detail: sanitizeForDetails(`integrity mismatch for ${relativePath}`) ?? 'integrity mismatch',
        }
      }
    } catch {
      return {
        ok: false,
        detail: sanitizeForDetails(`integrity file missing for ${relativePath}`) ?? 'integrity file missing',
      }
    }
  }
  return { ok: true }
}

async function allFilesExist(filePaths: readonly string[], existsFile: ExistsFile): Promise<boolean> {
  for (const filePath of filePaths) {
    if (!(await existsFile(filePath))) return false
  }
  return true
}

function normalizePluginDirs(input: readonly string[]): string[] {
  const out = new Set<string>()
  for (const candidate of input) {
    if (typeof candidate !== 'string') continue
    const trimmed = candidate.trim()
    if (!trimmed) continue
    out.add(path.resolve(trimmed))
  }
  return Array.from(out.values())
}

function parseRuntimeKind(input: unknown): MagikaRuntimeKind {
  const value = requireNonEmptyString(input, 'runtimeKind')
  if (value !== 'mock' && value !== 'unavailable' && value !== 'local_loader' && value !== 'adapter_only') {
    throw new Error('runtimeKind must be one of mock/unavailable/local_loader/adapter_only')
  }
  return value
}

function parsePlatform(input: unknown): EnginePlatform {
  const value = optionalNonEmptyString(input) ?? 'any'
  if (value !== 'any' && value !== 'win32' && value !== 'darwin' && value !== 'linux') {
    throw new Error('platform must be one of any/win32/darwin/linux')
  }
  return value
}

function parseCapabilities(input: unknown): ManagedEnginePluginManifest['capabilities'] {
  const values = parseStringArray(input)
  if (values.length === 0) {
    return ['text_extraction']
  }
  const allowed = new Set([
    'document_conversion',
    'spreadsheet_conversion',
    'presentation_conversion',
    'rendered_images',
    'text_extraction',
    'audio_extraction',
    'frame_selection',
  ])
  const out = new Set<ManagedEnginePluginManifest['capabilities'][number]>()
  for (const value of values) {
    if (allowed.has(value)) {
      out.add(value as ManagedEnginePluginManifest['capabilities'][number])
    }
  }
  if (out.size === 0) return ['text_extraction']
  return Array.from(out.values())
}

function parseHealthcheck(input: unknown): ManagedEnginePluginManifest['healthcheck'] {
  if (!input || typeof input !== 'object') return null
  const source = input as Record<string, unknown>
  const command = optionalNonEmptyString(source.command)
  if (!command) return null
  const args = parseStringArray(source.args)
  const cwd = optionalNonEmptyString(source.cwd) ?? null
  return {
    command,
    args,
    cwd,
  }
}

function parseIntegrity(input: unknown): MagikaManagedPluginIntegrity {
  if (!input || typeof input !== 'object') return {}
  const source = input as Record<string, unknown>
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(source)) {
    const relativePath = key.trim()
    const hash = normalizeSha(value)
    if (!relativePath || !hash) continue
    out[relativePath] = hash
  }
  return out
}

function normalizeSha(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return /^[a-f0-9]{64}$/u.test(normalized) ? normalized : null
}

function parseNonEmptyStringArray(input: unknown, field: string, minLength: number): string[] {
  const values = parseStringArray(input)
  if (values.length < minLength) {
    throw new Error(`${field} must contain at least ${minLength} item(s)`)
  }
  return values
}

function parseStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const out = new Set<string>()
  for (const value of input) {
    const normalized = optionalNonEmptyString(value)
    if (!normalized) continue
    out.add(normalized)
  }
  return Array.from(out.values())
}

function optionalNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function requireNonEmptyString(value: unknown, field: string): string {
  const normalized = optionalNonEmptyString(value)
  if (!normalized) throw new Error(`${field} is required`)
  return normalized
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function unavailable(reason: EngineFailureReason, detail: string | null): MagikaManagedPluginDiscoveryResult {
  return {
    available: false,
    reason,
    detail: sanitizeForDetails(detail),
  }
}

function sanitizeForDetails(value: string | null): string | null {
  if (!value) return null
  const normalized = value
    .replace(WINDOWS_ABSOLUTE_PATH_RE, '[redacted-path]')
    .replace(UNIX_ABSOLUTE_PATH_RE, '[redacted-path]')
  return sanitizeEngineDetailForDiagnostics(normalized)
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function readFileAsBytes(filePath: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(filePath))
}
