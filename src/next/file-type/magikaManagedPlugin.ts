import { createHash } from 'node:crypto'
import { access, readFile, realpath as fsRealpath, stat as fsStat } from 'node:fs/promises'
import path from 'node:path'
import { runEngineHealthCheck } from './externalEngineHealth'
import { parseManagedEnginePluginManifest } from './externalEngineManifest'
import { createExternalEngineRegistry, sanitizeEngineDetailForDiagnostics } from './externalEngineRegistry'
import { runMagikaClassify, type MagikaClassifyRunnerResult } from './magikaClassifyRunner'
import { runExternalProcess } from './externalProcessRunner'
import { MagikaRuntimeClassificationError } from './magikaRuntimeLoader'
import type {
  EngineAvailability,
  EngineFailureReason,
  EngineHealthProbeResult,
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
  MagikaRuntimeUnavailableReason,
} from './magikaRuntimeLoader'

type ExistsFile = (filePath: string) => Promise<boolean>
type ReadBytes = (filePath: string) => Promise<Uint8Array>
type ResolveRealPath = (filePath: string) => Promise<string>
type StatPath = (filePath: string) => Promise<{ isFile(): boolean; isDirectory(): boolean }>

const WINDOWS_ABSOLUTE_PATH_RE = /\b[A-Za-z]:\\[^\s"'`]+/g
const UNIX_ABSOLUTE_PATH_RE = /(?:\/Users\/|\/home\/|\/mnt\/|\/var\/|\/tmp\/)[^\s"'`]+/g
const HEALTH_DETAIL_MAX_CHARS = 1000

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
  requiredRuntimePaths: readonly MagikaManagedRequiredRuntimePath[]
  dependencyRoots: readonly string[]
  minStarverseVersion: string | null
  platform: EnginePlatform
}>

export type MagikaManagedRequiredRuntimePath = Readonly<{
  path: string
  kind: 'file' | 'directory'
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
  healthCheckOutcome: MagikaManagedHealthCheckOutcome | null
  specificReason: MagikaManagedHealthSpecificReason | null
  sanitizedRootCause: string | null
  healthCheckStage: MagikaManagedHealthCheckStage | null
  record: ExternalEngineRecord
  availability: EngineAvailability
}>

export type MagikaManagedHealthCheckOutcome = 'unhealthy_result' | 'execution_failed'

export type MagikaManagedHealthSpecificReason =
  | 'magika_runtime_missing_dependency'
  | 'magika_child_process_exit_nonzero'
  | 'magika_stdout_parse_failed'
  | 'magika_health_check_timeout'
  | 'magika_health_check_execution_failed'
  | 'unknown_runtime_error'

export type MagikaManagedHealthCheckStage =
  | 'custom_healthcheck'
  | 'runtime_self_test'
  | 'classify_self_test'

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
  statPath?: StatPath
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
  const statPath = input.statPath ?? fsStat
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

    const requiredRuntimePaths = await validateRequiredRuntimePaths({
      pluginRootPath,
      pluginRootRealPath,
      requiredRuntimePaths: parsed.manifest.requiredRuntimePaths,
      dependencyRoots: parsed.manifest.dependencyRoots,
      statPath,
      resolveRealPath,
    })
    if (!requiredRuntimePaths.ok) {
      lastError = unavailable(requiredRuntimePaths.reason, requiredRuntimePaths.detail)
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
  const stage: MagikaManagedHealthCheckStage = input.healthRunner ? 'custom_healthcheck' : 'runtime_self_test'
  const baseRunner = input.healthRunner
    ? wrapGenericMagikaHealthRunner(input.healthRunner, stage)
    : createManagedMagikaRuntimeHealthRunner(input.descriptor)
  let healthDiagnostic: MagikaManagedHealthDiagnostic | null = null

  const checked = await runEngineHealthCheck({
    registry,
    engineId: 'magika',
    runner: async (record) => {
      try {
        const probe = await baseRunner(record)
        healthDiagnostic = extractHealthDiagnostic(probe)
        return probe
      } catch (error) {
        healthDiagnostic = {
          healthCheckOutcome: 'execution_failed',
          specificReason: 'magika_health_check_execution_failed',
          sanitizedRootCause: null,
          healthCheckStage: stage,
        }
        throw error
      }
    },
  })
  const availability = registry.getEngineAvailability()
  const healthy = checked.healthStatus === 'healthy'
  if (!healthy && !healthDiagnostic) {
    healthDiagnostic = inferHealthDiagnosticFromDetail(checked.failureReason, checked.failureDetails, stage)
  }

  return {
    healthy,
    reason: healthy ? null : checked.failureReason,
    detail: healthy ? null : formatMagikaHealthDiagnostic(healthDiagnostic, checked.failureDetails),
    healthCheckOutcome: healthy ? null : healthDiagnostic?.healthCheckOutcome ?? 'execution_failed',
    specificReason: healthy ? null : healthDiagnostic?.specificReason ?? 'unknown_runtime_error',
    sanitizedRootCause: healthy ? null : healthDiagnostic?.sanitizedRootCause ?? null,
    healthCheckStage: healthy ? null : healthDiagnostic?.healthCheckStage ?? stage,
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
  const modelDirPath = modelDirPathOf(descriptor)
  const configDirPath = configDirPathOf(descriptor)
  return async ({ probe }) => {
    const result = await runMagikaClassify({
      inputBytes: probe.bytes,
      runtimeEntryPath: descriptor.runtimeEntryPath,
      modelDirPath,
      configDirPath,
    })
    if (!result.ok) {
      const reason = mapRunnerFailureToRuntimeReason(result)
      throw new MagikaRuntimeClassificationError(reason, reason, result.detail)
    }
    return { label: result.label, score: result.score, modelVersion: result.modelVersion }
  }
}

function createManagedMagikaRuntimeHealthRunner(
  descriptor: MagikaManagedPluginDescriptor
): MagikaManagedHealthRunner {
  return async () => {
    const healthcheck = descriptor.manifest.healthcheck
    if (!healthcheck) return runDefaultMagikaRuntimeSelfTest(descriptor)

    const result = await runExternalProcess({
      command: healthcheck.command,
      args: healthcheck.args,
      cwd: healthcheck.cwd,
      mode: 'health_check',
      timeoutMs: 3000,
      maxStdoutBytes: 16 * 1024,
      maxStderrBytes: 16 * 1024,
    })
    if (result.timedOut || result.errorCode === 'process_timeout') {
      return {
        status: 'timeout',
        reason: 'engine_timeout',
        detail: sanitizeForDetails(result.stderr) ?? 'magika health check timed out',
        healthCheckOutcome: 'execution_failed',
        specificReason: 'magika_health_check_timeout',
        sanitizedRootCause: extractSanitizedRootCause(result.stderr),
        healthCheckStage: 'custom_healthcheck',
      }
    }
    if (result.exitCode === 0 && !result.errorCode && !result.outputLimited) return runDefaultMagikaRuntimeSelfTest(descriptor)
    const detail = formatHealthFailureDetail(result.stderr, result.exitCode, result.errorCode)
    const diagnostic = inferHealthDiagnosticFromDetail('engine_failed', detail, 'custom_healthcheck')
    return {
      status: 'failed',
      reason: diagnostic.specificReason === 'magika_health_check_execution_failed' ? 'engine_unavailable' : 'engine_failed',
      detail: sanitizeForDetails(detail) ?? 'magika health check failed',
      ...diagnostic,
    }
  }
}

type MagikaManagedHealthDiagnostic = Readonly<{
  healthCheckOutcome: MagikaManagedHealthCheckOutcome
  specificReason: MagikaManagedHealthSpecificReason
  sanitizedRootCause: string | null
  healthCheckStage: MagikaManagedHealthCheckStage
}>

type MagikaManagedHealthProbeResult = EngineHealthProbeResult & Partial<MagikaManagedHealthDiagnostic>

type MagikaManagedHealthRunner = (
  record: ExternalEngineRecord
) => Promise<MagikaManagedHealthProbeResult>

async function runDefaultMagikaRuntimeSelfTest(
  descriptor: MagikaManagedPluginDescriptor
): ReturnType<MagikaManagedHealthRunner> {
  const result = await runMagikaClassify({
    inputBytes: new Uint8Array([0x7b, 0x7d]),
    runtimeEntryPath: descriptor.runtimeEntryPath,
    modelDirPath: modelDirPathOf(descriptor),
    configDirPath: configDirPathOf(descriptor),
    timeoutMs: 3000,
    maxOutputBytes: 16 * 1024,
  })
  if (result.ok) {
    return { status: 'healthy', reason: null, detail: null }
  }
  if (result.errorCode === 'timeout') {
    return {
      status: 'timeout',
      reason: 'engine_timeout',
      detail: sanitizeForDetails(`magika runtime self-test failed: ${result.errorCode}: ${result.detail}`) ?? 'magika runtime self-test timed out',
      healthCheckOutcome: 'execution_failed',
      specificReason: 'magika_health_check_timeout',
      sanitizedRootCause: extractSanitizedRootCause(result.detail),
      healthCheckStage: 'classify_self_test',
    }
  }
  const diagnostic = healthDiagnosticFromRunnerFailure(result)
  return {
    status: 'failed',
    reason: result.errorCode === 'spawn_failed' || result.errorCode === 'missing_dependency'
      ? 'engine_unavailable'
      : 'engine_failed',
    detail: sanitizeForDetails(`magika runtime self-test failed: ${result.errorCode}: ${result.detail}`) ?? 'magika runtime self-test failed',
    ...diagnostic,
  }
}

function modelDirPathOf(descriptor: MagikaManagedPluginDescriptor): string {
  return path.dirname(descriptor.modelFilePaths[0] ?? path.join(descriptor.pluginDir, 'model'))
}

function configDirPathOf(descriptor: MagikaManagedPluginDescriptor): string {
  return path.dirname(descriptor.configFilePaths[0] ?? path.join(descriptor.pluginDir, 'model'))
}

function mapRunnerFailureToRuntimeReason(
  result: Extract<MagikaClassifyRunnerResult, { ok: false }>
): MagikaRuntimeUnavailableReason {
  switch (result.errorCode) {
    case 'input_too_large':
      return 'magika_input_too_large'
    case 'spawn_failed':
      return 'magika_spawn_failed'
    case 'timeout':
      return 'magika_timeout'
    case 'output_limit':
      return 'magika_output_limit'
    case 'process_kill_failed':
      return 'magika_process_kill_failed'
    case 'process_exited_non_zero':
      return 'magika_child_process_exit_nonzero'
    case 'stdout_parse_failed':
      return 'magika_stdout_parse_failed'
    case 'missing_dependency':
      return 'magika_runtime_missing_dependency'
    case 'unknown_runtime_error':
      return 'magika_unknown_runtime_error'
    default:
      return 'magika_unknown_runtime_error'
  }
}

function healthDiagnosticFromRunnerFailure(
  result: Extract<MagikaClassifyRunnerResult, { ok: false }>
): MagikaManagedHealthDiagnostic {
  const specificReason = mapRunnerFailureToHealthSpecificReason(result.errorCode)
  return {
    healthCheckOutcome: isRunnerExecutionFailure(result.errorCode) ? 'execution_failed' : 'unhealthy_result',
    specificReason,
    sanitizedRootCause: extractSanitizedRootCause(result.detail),
    healthCheckStage: 'classify_self_test',
  }
}

function mapRunnerFailureToHealthSpecificReason(
  errorCode: Extract<MagikaClassifyRunnerResult, { ok: false }>['errorCode']
): MagikaManagedHealthSpecificReason {
  switch (errorCode) {
    case 'missing_dependency':
      return 'magika_runtime_missing_dependency'
    case 'process_exited_non_zero':
      return 'magika_child_process_exit_nonzero'
    case 'stdout_parse_failed':
      return 'magika_stdout_parse_failed'
    case 'timeout':
      return 'magika_health_check_timeout'
    case 'spawn_failed':
      return 'magika_health_check_execution_failed'
    default:
      return 'unknown_runtime_error'
  }
}

function isRunnerExecutionFailure(
  errorCode: Extract<MagikaClassifyRunnerResult, { ok: false }>['errorCode']
): boolean {
  return errorCode === 'spawn_failed' ||
    errorCode === 'timeout' ||
    errorCode === 'output_limit' ||
    errorCode === 'process_kill_failed'
}

function wrapGenericMagikaHealthRunner(
  runner: EngineHealthRunner,
  stage: MagikaManagedHealthCheckStage
): MagikaManagedHealthRunner {
  return async (record) => {
    const result = await runner(record)
    if (result.status === 'healthy') return result
    return {
      ...result,
      ...inferHealthDiagnosticFromDetail(result.reason, result.detail, stage),
    }
  }
}

function extractHealthDiagnostic(
  probe: MagikaManagedHealthProbeResult
): MagikaManagedHealthDiagnostic | null {
  if (probe.status === 'healthy') return null
  if (probe.healthCheckOutcome && probe.specificReason && probe.healthCheckStage) {
    return {
      healthCheckOutcome: probe.healthCheckOutcome,
      specificReason: probe.specificReason,
      sanitizedRootCause: probe.sanitizedRootCause ?? null,
      healthCheckStage: probe.healthCheckStage,
    }
  }
  return inferHealthDiagnosticFromDetail(probe.reason, probe.detail, 'runtime_self_test')
}

function inferHealthDiagnosticFromDetail(
  reason: string | null | undefined,
  detail: string | null | undefined,
  stage: MagikaManagedHealthCheckStage
): MagikaManagedHealthDiagnostic {
  const source = `${reason ?? ''} ${detail ?? ''}`
  const specificReason = inferSpecificHealthReason(source)
  return {
    healthCheckOutcome: isHealthCheckExecutionSpecificReason(specificReason) ? 'execution_failed' : 'unhealthy_result',
    specificReason,
    sanitizedRootCause: extractSanitizedRootCause(source),
    healthCheckStage: stage,
  }
}

function inferSpecificHealthReason(source: string): MagikaManagedHealthSpecificReason {
  if (/ERR_MODULE_NOT_FOUND|Cannot find package ['"]?magika['"]?|missing_dependency/i.test(source)) {
    return 'magika_runtime_missing_dependency'
  }
  if (/process_exited_non_zero|exitCode=\d+|exited non-zero/i.test(source)) {
    return 'magika_child_process_exit_nonzero'
  }
  if (/stdout_parse_failed|not valid JSON|missing required label/i.test(source)) {
    return 'magika_stdout_parse_failed'
  }
  if (/process_timeout|engine_timeout|timed out|timeout/i.test(source)) {
    return 'magika_health_check_timeout'
  }
  if (/spawn_failed|command_not_found|not executable|ENOENT/i.test(source)) {
    return 'magika_health_check_execution_failed'
  }
  if (/engine_unavailable/i.test(source)) return 'magika_health_check_execution_failed'
  return 'unknown_runtime_error'
}

function isHealthCheckExecutionSpecificReason(reason: MagikaManagedHealthSpecificReason): boolean {
  return reason === 'magika_health_check_execution_failed' || reason === 'magika_health_check_timeout'
}

function extractSanitizedRootCause(value: string | null | undefined): string | null {
  if (!value) return null
  return /ERR_MODULE_NOT_FOUND|Cannot find package ['"]?magika['"]?/i.test(value)
    ? 'ERR_MODULE_NOT_FOUND'
    : null
}

function formatMagikaHealthDiagnostic(
  diagnostic: MagikaManagedHealthDiagnostic | null,
  detail: string | null
): string | null {
  if (!diagnostic) return sanitizeForDetails(detail)
  const outcome = diagnostic.healthCheckOutcome === 'unhealthy_result'
    ? 'health_result_unhealthy'
    : 'health_check_execution_failed'
  const parts = [
    `healthCheckOutcome=${diagnostic.healthCheckOutcome}`,
    outcome,
    `specificReason=${diagnostic.specificReason}`,
    `healthCheckStage=${diagnostic.healthCheckStage}`,
  ]
  if (diagnostic.sanitizedRootCause) parts.push(`sanitizedRootCause=${diagnostic.sanitizedRootCause}`)
  if (detail) parts.push(detail)
  return sanitizeForDetails(parts.join('; '))
}

function formatHealthFailureDetail(
  stderr: string,
  exitCode: number | null,
  errorCode: string | null
): string {
  const rootCause = /ERR_MODULE_NOT_FOUND/i.test(stderr)
    ? 'ERR_MODULE_NOT_FOUND'
    : /Cannot find package ['"]?magika['"]?/i.test(stderr)
      ? 'Cannot find package magika'
      : null
  const parts: string[] = []
  if (errorCode) parts.push(`errorCode=${errorCode}`)
  if (exitCode !== null) parts.push(`exitCode=${exitCode}`)
  if (rootCause) parts.push(`rootCause=${rootCause}`)
  if (!rootCause && stderr.trim()) parts.push(truncateDiagnostic(stderr))
  return parts.join('; ')
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
  const requiredRuntimePaths = parseRequiredRuntimePaths(source.requiredRuntimePaths)
  const dependencyRoots = parseDependencyRoots(source.dependencyRoots)
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
    requiredRuntimePaths,
    dependencyRoots,
    minStarverseVersion,
    platform,
  }
}

async function validateRequiredRuntimePaths(input: Readonly<{
  pluginRootPath: string
  pluginRootRealPath: string
  requiredRuntimePaths: readonly MagikaManagedRequiredRuntimePath[]
  dependencyRoots: readonly string[]
  statPath: StatPath
  resolveRealPath: ResolveRealPath
}>): Promise<Readonly<{ ok: true } | { ok: false; reason: EngineFailureReason; detail: string }>> {
  const entries: MagikaManagedRequiredRuntimePath[] = [
    ...input.requiredRuntimePaths,
    ...input.dependencyRoots.map((item) => ({ path: item, kind: 'directory' as const })),
  ]
  for (const entry of entries) {
    const validated = await validatePluginFilePath({
      pluginRootPath: input.pluginRootPath,
      pluginRootRealPath: input.pluginRootRealPath,
      rawPath: entry.path,
      field: 'requiredRuntimePaths',
      existsFile: async () => true,
      resolveRealPath: input.resolveRealPath,
    })
    if (!validated.ok) {
      return {
        ok: false,
        reason: validated.reason,
        detail: validated.detail,
      }
    }
    try {
      const actual = await input.statPath(validated.path.absolutePath)
      if (entry.kind === 'file' && !actual.isFile()) {
        return {
          ok: false,
          reason: 'runtime_entry_missing',
          detail: sanitizeForDetails(`required runtime file missing: ${validated.path.relativePath}`) ?? 'required runtime file missing',
        }
      }
      if (entry.kind === 'directory' && !actual.isDirectory()) {
        return {
          ok: false,
          reason: 'runtime_entry_missing',
          detail: sanitizeForDetails(`required runtime directory missing: ${validated.path.relativePath}`) ?? 'required runtime directory missing',
        }
      }
    } catch {
      return {
        ok: false,
        reason: 'runtime_entry_missing',
        detail: sanitizeForDetails(`required runtime path missing: ${validated.path.relativePath}`) ?? 'required runtime path missing',
      }
    }
    const resolvedRealPath = await safeRealpath(validated.path.absolutePath, input.resolveRealPath)
    if (resolvedRealPath) {
      const relativeReal = path.relative(input.pluginRootRealPath, resolvedRealPath)
      if (
        relativeReal === '' ||
        relativeReal === '.' ||
        relativeReal.startsWith('..') ||
        path.isAbsolute(relativeReal)
      ) {
        return {
          ok: false,
          reason: 'plugin_path_outside_root',
          detail: 'required runtime path resolves outside plugin root',
        }
      }
    }
  }
  return { ok: true }
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

function parseRequiredRuntimePaths(input: unknown): MagikaManagedRequiredRuntimePath[] {
  if (input === null || input === undefined) return []
  if (!Array.isArray(input)) throw new Error('requiredRuntimePaths must be an array')
  const out: MagikaManagedRequiredRuntimePath[] = []
  const seen = new Set<string>()
  input.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`requiredRuntimePaths[${index}] must be an object`)
    }
    const source = item as Record<string, unknown>
    const requiredPath = optionalNonEmptyString(source.path)
    const kind = source.kind === 'file' || source.kind === 'directory' ? source.kind : null
    if (!requiredPath) throw new Error(`requiredRuntimePaths[${index}].path is required`)
    if (!kind) throw new Error(`requiredRuntimePaths[${index}].kind must be file or directory`)
    const normalizedPath = normalizeRelativePluginPath(requiredPath)
    if (!normalizedPath) throw new Error(`requiredRuntimePaths[${index}].path is invalid`)
    if (seen.has(normalizedPath)) return
    seen.add(normalizedPath)
    out.push({ path: normalizedPath, kind })
  })
  return out
}

function parseDependencyRoots(input: unknown): string[] {
  if (input === null || input === undefined) return []
  if (!Array.isArray(input)) throw new Error('dependencyRoots must be an array')
  const out = new Set<string>()
  input.forEach((root, index) => {
    const value = optionalNonEmptyString(root)
    if (!value) throw new Error(`dependencyRoots[${index}] must be a non-empty string`)
    const normalized = normalizeRelativePluginPath(value)
    if (!normalized) throw new Error(`dependencyRoots[${index}] is invalid`)
    out.add(normalized)
  })
  return Array.from(out.values())
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
  return sanitizeEngineDetailForDiagnostics(truncateDiagnostic(normalized))
}

function truncateDiagnostic(value: string): string {
  return value.length > HEALTH_DETAIL_MAX_CHARS
    ? `${value.slice(0, HEALTH_DETAIL_MAX_CHARS)}...[truncated]`
    : value
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
