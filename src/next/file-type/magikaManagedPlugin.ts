import { createHash } from 'node:crypto'
import { access, readFile, realpath as fsRealpath } from 'node:fs/promises'
import path from 'node:path'
import { runEngineHealthCheck } from './externalEngineHealth'
import { parseManagedEnginePluginManifest } from './externalEngineManifest'
import { createExternalEngineRegistry, sanitizeEngineDetailForDiagnostics } from './externalEngineRegistry'
import { runMagikaClassify, type MagikaClassifyRunnerResult } from './magikaClassifyRunner'
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
type ResolveRealPath = (filePath: string) => Promise<string>

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

export type MagikaPackageLayoutSpec = Readonly<{
  rootDirName: string
  requiredFiles: readonly string[]
  requiredDirs: readonly string[]
  optionalFiles: readonly string[]
}>

export const MAGIKA_PACKAGE_LAYOUT: MagikaPackageLayoutSpec = {
  rootDirName: 'engines/magika',
  requiredFiles: ['manifest.json'],
  requiredDirs: ['runtime', 'model'],
  optionalFiles: ['NOTICE', 'LICENSE', 'ATTRIBUTION', 'README.md'],
}

export type MagikaPackageLayoutValidation =
  | Readonly<{ valid: true }>
  | Readonly<{ valid: false; reason: EngineFailureReason; detail: string }>

export async function validateMagikaPackageLayout(input: Readonly<{
  pluginRootPath: string
  existsFile?: ExistsFile
  existsDir?: (dirPath: string) => Promise<boolean>
}>): Promise<MagikaPackageLayoutValidation> {
  const existsFile = input.existsFile ?? fileExists
  const existsDir = input.existsDir ?? dirExists
  const pluginRootPath = path.resolve(input.pluginRootPath)

  for (const requiredFile of MAGIKA_PACKAGE_LAYOUT.requiredFiles) {
    const filePath = path.join(pluginRootPath, requiredFile)
    if (!(await existsFile(filePath))) {
      return {
        valid: false,
        reason: 'plugin_not_found',
        detail: `required file missing: ${requiredFile}`,
      }
    }
  }

  for (const requiredDir of MAGIKA_PACKAGE_LAYOUT.requiredDirs) {
    const dirPath = path.join(pluginRootPath, requiredDir)
    if (!(await existsDir(dirPath))) {
      return {
        valid: false,
        reason: 'plugin_not_found',
        detail: `required directory missing: ${requiredDir}`,
      }
    }
  }

  return { valid: true }
}

export type DiscoverMagikaManagedPluginInput = Readonly<{
  pluginDirs: readonly string[]
  existsFile?: ExistsFile
  readBytes?: ReadBytes
  resolveRealPath?: ResolveRealPath
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

type ValidatedPluginFilePath = Readonly<{
  relativePath: string
  absolutePath: string
}>

type ValidatePluginFilePathResult =
  | Readonly<{
      ok: true
      path: ValidatedPluginFilePath
    }>
  | Readonly<{
      ok: false
      reason: EngineFailureReason
      detail: string
    }>

// eslint-disable-next-line max-lines-per-function
export async function discoverMagikaManagedPlugin(
  input: DiscoverMagikaManagedPluginInput
): Promise<MagikaManagedPluginDiscoveryResult> {
  const existsFile = input.existsFile ?? fileExists
  const readBytes = input.readBytes ?? readFileAsBytes
  const resolveRealPath = input.resolveRealPath ?? fsRealpath
  const dirs = normalizePluginDirs(input.pluginDirs)
  if (dirs.length === 0) {
    return unavailable('plugin_not_found', 'magika plugin directory is not configured')
  }

  let lastError: MagikaManagedPluginDiscoveryResult | null = null
  for (const pluginDir of dirs) {
    const pluginRootPath = path.resolve(pluginDir)
    const pluginRootRealPath = await resolvePluginRootRealPath(pluginRootPath, resolveRealPath)
    const manifestPath = path.join(pluginRootPath, 'manifest.json')
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

    const runtimeEntry = await validatePluginFilePath({
      pluginRootPath,
      pluginRootRealPath,
      rawPath: parsed.manifest.runtimeEntry,
      field: 'runtimeEntry',
      existsFile,
      resolveRealPath,
    })
    if (!runtimeEntry.ok) {
      lastError = unavailable(runtimeEntry.reason, runtimeEntry.detail)
      continue
    }

    if (!(await existsFile(runtimeEntry.path.absolutePath))) {
      lastError = unavailable('runtime_entry_missing', 'runtime entry file is missing')
      continue
    }

    const modelFiles = await validatePluginFileList({
      pluginRootPath,
      pluginRootRealPath,
      rawPaths: parsed.manifest.modelFiles,
      field: 'modelFiles',
      existsFile,
      resolveRealPath,
    })
    if (!modelFiles.ok) {
      lastError = unavailable(modelFiles.reason, modelFiles.detail)
      continue
    }
    const missingModel = await firstMissingFile(modelFiles.paths, existsFile)
    if (missingModel) {
      lastError = unavailable('model_file_missing', `model file missing: ${missingModel.relativePath}`)
      continue
    }

    const configFiles = await validatePluginFileList({
      pluginRootPath,
      pluginRootRealPath,
      rawPaths: parsed.manifest.configFiles,
      field: 'configFiles',
      existsFile,
      resolveRealPath,
    })
    if (!configFiles.ok) {
      lastError = unavailable(configFiles.reason, configFiles.detail)
      continue
    }
    const missingConfig = await firstMissingFile(configFiles.paths, existsFile)
    if (missingConfig) {
      lastError = unavailable('config_file_missing', `config file missing: ${missingConfig.relativePath}`)
      continue
    }

    const integrity = await verifyManifestIntegrity({
      manifest: parsed.manifest,
      pluginRootPath,
      pluginRootRealPath,
      runtimeEntry: runtimeEntry.path,
      modelFiles: modelFiles.paths,
      configFiles: configFiles.paths,
      existsFile,
      readBytes,
      resolveRealPath,
    })
    if (!integrity.ok) {
      lastError = unavailable(integrity.reason, integrity.detail)
      continue
    }

    return {
      available: true,
      descriptor: {
        pluginDir: pluginRootPath,
        manifestPath,
        runtimeEntryPath: runtimeEntry.path.absolutePath,
        modelFilePaths: modelFiles.paths.map((item) => item.absolutePath),
        configFilePaths: configFiles.paths.map((item) => item.absolutePath),
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
  registry.setVerificationStatus({ engineId: 'magika', verificationStatus: 'verified' })

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

export function createMagikaClassifyCallback(
  descriptor: MagikaManagedPluginDescriptor
): (
  input: Readonly<{
    probe: MagikaRuntimeDetectionInput
    descriptor: MagikaManagedPluginDescriptor
  }>
) => Promise<MagikaRuntimeClassifyOutput | null> {
  const modelDirPath = path.dirname(descriptor.modelFilePaths[0] ?? path.join(descriptor.pluginDir, 'model'))
  const configDirPath = path.dirname(descriptor.configFilePaths[0] ?? path.join(descriptor.pluginDir, 'model'))
  return async ({ probe }) => {
    const result = await runMagikaClassify({
      inputBytes: probe.bytes,
      runtimeEntryPath: descriptor.runtimeEntryPath,
      modelDirPath,
      configDirPath,
    })
    if (!result.ok) return null
    return { label: result.label, score: result.score }
  }
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
  pluginRootPath: string
  pluginRootRealPath: string
  runtimeEntry: ValidatedPluginFilePath
  modelFiles: readonly ValidatedPluginFilePath[]
  configFiles: readonly ValidatedPluginFilePath[]
  existsFile: ExistsFile
  readBytes: ReadBytes
  resolveRealPath: ResolveRealPath
}>): Promise<
  Readonly<{ ok: true } | { ok: false; reason: EngineFailureReason; detail: string }>
> {
  const entries = new Map<string, string>()
  for (const [rawRelativePath, expectedHash] of Object.entries(input.manifest.integrity)) {
    const validated = await validatePluginFilePath({
      pluginRootPath: input.pluginRootPath,
      pluginRootRealPath: input.pluginRootRealPath,
      rawPath: rawRelativePath,
      field: `integrity.${rawRelativePath}`,
      existsFile: input.existsFile,
      resolveRealPath: input.resolveRealPath,
    })
    if (!validated.ok) {
      return {
        ok: false,
        reason: validated.reason,
        detail: validated.detail,
      }
    }
    entries.set(validated.path.relativePath, expectedHash)
  }

  const required = new Set<string>([
    input.runtimeEntry.relativePath,
    ...input.modelFiles.map((item) => item.relativePath),
    ...input.configFiles.map((item) => item.relativePath),
  ])
  for (const requiredPath of required) {
    if (!entries.has(requiredPath)) {
      return {
        ok: false,
        reason: 'integrity_missing',
        detail: sanitizeForDetails(`integrity missing for ${requiredPath}`) ?? 'integrity missing',
      }
    }
  }

  for (const requiredPath of required) {
    const expectedHash = entries.get(requiredPath) ?? ''
    const normalizedExpected = normalizeSha(expectedHash)
    if (!normalizedExpected) {
      return {
        ok: false,
        reason: 'manifest_invalid',
        detail: sanitizeForDetails(`invalid integrity hash for ${requiredPath}`) ?? 'invalid integrity hash',
      }
    }
    const absolutePath = path.resolve(input.pluginRootPath, requiredPath)
    try {
      const bytes = await input.readBytes(absolutePath)
      const actualHash = createHash('sha256').update(Buffer.from(bytes)).digest('hex')
      if (actualHash.toLowerCase() !== normalizedExpected) {
        return {
          ok: false,
          reason: 'hash_mismatch',
          detail: sanitizeForDetails(`integrity mismatch for ${requiredPath}`) ?? 'integrity mismatch',
        }
      }
    } catch {
      return {
        ok: false,
        reason: 'hash_mismatch',
        detail: sanitizeForDetails(`integrity file missing for ${requiredPath}`) ?? 'integrity file missing',
      }
    }
  }
  return { ok: true }
}

async function validatePluginFileList(input: Readonly<{
  pluginRootPath: string
  pluginRootRealPath: string
  rawPaths: readonly string[]
  field: string
  existsFile: ExistsFile
  resolveRealPath: ResolveRealPath
}>): Promise<
  Readonly<{ ok: true; paths: readonly ValidatedPluginFilePath[] } | { ok: false; reason: EngineFailureReason; detail: string }>
> {
  const out: ValidatedPluginFilePath[] = []
  for (let index = 0; index < input.rawPaths.length; index += 1) {
    const validated = await validatePluginFilePath({
      pluginRootPath: input.pluginRootPath,
      pluginRootRealPath: input.pluginRootRealPath,
      rawPath: input.rawPaths[index] ?? '',
      field: `${input.field}[${index}]`,
      existsFile: input.existsFile,
      resolveRealPath: input.resolveRealPath,
    })
    if (!validated.ok) {
      return validated
    }
    out.push(validated.path)
  }
  return { ok: true, paths: out }
}

async function firstMissingFile(
  filePaths: readonly ValidatedPluginFilePath[],
  existsFile: ExistsFile
): Promise<ValidatedPluginFilePath | null> {
  for (const item of filePaths) {
    if (!(await existsFile(item.absolutePath))) {
      return item
    }
  }
  return null
}

async function validatePluginFilePath(input: Readonly<{
  pluginRootPath: string
  pluginRootRealPath: string
  rawPath: string
  field: string
  existsFile: ExistsFile
  resolveRealPath: ResolveRealPath
}>): Promise<ValidatePluginFilePathResult> {
  const cleaned = normalizeManifestPathLiteral(input.rawPath)
  if (!cleaned) {
    return invalidPath('manifest_invalid', `${input.field} is empty`)
  }
  if (cleaned.includes('\u0000')) {
    return invalidPath('manifest_invalid', `${input.field} contains NUL byte`)
  }
  if (isAbsoluteLikePath(cleaned)) {
    return invalidPath('manifest_invalid', `${input.field} must be a relative plugin path`)
  }

  const normalizedRelativePath = normalizeRelativePluginPath(cleaned)
  if (!normalizedRelativePath || normalizedRelativePath === '.' || normalizedRelativePath.startsWith('..')) {
    return invalidPath('plugin_path_outside_root', `${input.field} escapes plugin root`)
  }

  const absolutePath = path.resolve(input.pluginRootPath, normalizedRelativePath)
  const relative = path.relative(input.pluginRootPath, absolutePath)
  if (!relative || relative === '' || relative === '.') {
    return invalidPath('manifest_invalid', `${input.field} must point to a file path`)
  }
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return invalidPath('plugin_path_outside_root', `${input.field} escapes plugin root`)
  }

  if (await input.existsFile(absolutePath)) {
    const resolvedRealPath = await safeRealpath(absolutePath, input.resolveRealPath)
    if (resolvedRealPath) {
      const relativeReal = path.relative(input.pluginRootRealPath, resolvedRealPath)
      if (
        relativeReal === '' ||
        relativeReal === '.' ||
        relativeReal.startsWith('..') ||
        path.isAbsolute(relativeReal)
      ) {
        return invalidPath('plugin_path_outside_root', `${input.field} resolves outside plugin root`)
      }
    }
  }

  return {
    ok: true,
    path: {
      relativePath: normalizedRelativePath,
      absolutePath,
    },
  }
}

async function resolvePluginRootRealPath(
  pluginRootPath: string,
  resolveRealPath: ResolveRealPath
): Promise<string> {
  const real = await safeRealpath(pluginRootPath, resolveRealPath)
  return real ?? pluginRootPath
}

async function safeRealpath(
  targetPath: string,
  resolveRealPath: ResolveRealPath
): Promise<string | null> {
  try {
    return await resolveRealPath(targetPath)
  } catch {
    return null
  }
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

function normalizeManifestPathLiteral(value: string): string {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return ''
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

function normalizeRelativePluginPath(value: string): string {
  const canonical = value.replace(/\\/g, '/').replace(/\/+/g, '/')
  const normalized = path.posix.normalize(canonical)
  return normalized.replace(/^\.\/+/, '')
}

function isAbsoluteLikePath(value: string): boolean {
  if (!value) return false
  if (path.isAbsolute(value)) return true
  if (/^[A-Za-z]:[\\/]/.test(value)) return true
  if (/^\\\\[^\\]/.test(value)) return true
  return false
}

function invalidPath(
  reason: EngineFailureReason,
  detail: string
): Readonly<{ ok: false; reason: EngineFailureReason; detail: string }> {
  return {
    ok: false,
    reason,
    detail: sanitizeForDetails(detail) ?? 'invalid plugin path',
  }
}

function parseRuntimeKind(input: unknown): MagikaRuntimeKind {
  const value = requireNonEmptyString(input, 'runtimeKind')
  if (value !== 'mock' && value !== 'unavailable' && value !== 'local_loader' && value !== 'adapter_only' && value !== 'pure_js') {
    throw new Error('runtimeKind must be one of mock/unavailable/local_loader/adapter_only/pure_js')
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

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const { stat: statAsync } = await import('node:fs/promises')
    const entry = await statAsync(dirPath)
    return entry.isDirectory()
  } catch {
    return false
  }
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
