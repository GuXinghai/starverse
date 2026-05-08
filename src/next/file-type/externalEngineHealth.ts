import {
  runExternalProcess,
  type ExternalProcessRunResult,
  type RunExternalProcessInput,
} from './externalProcessRunner'
import {
  sanitizeEngineDetailForDiagnostics,
  type ExternalEngineRegistry,
} from './externalEngineRegistry'
import type {
  EngineFailureReason,
  EngineHealthProbeResult,
  EngineHealthRunner,
  EngineId,
  ExternalEngineRecord,
} from './externalEngineTypes'

type ExternalProcessRunner = (
  input: RunExternalProcessInput
) => Promise<ExternalProcessRunResult>

export type RunEngineHealthCheckInput = Readonly<{
  registry: ExternalEngineRegistry
  engineId: EngineId
  runner?: EngineHealthRunner
  processRunner?: ExternalProcessRunner
  timeoutMs?: number
}>

const DEFAULT_HEALTHCHECK_TIMEOUT_MS = 3000

export async function runEngineHealthCheck(
  input: RunEngineHealthCheckInput
): Promise<ExternalEngineRecord> {
  const record = input.registry.getEngineById(input.engineId)
  if (!record) throw new Error(`unknown engine: ${input.engineId}`)
  if (!record.enabled) return record

  const timeoutMs = normalizeTimeoutMs(input.timeoutMs)
  const healthRunner =
    input.runner ??
    createDefaultHealthRunner({
      timeoutMs,
      processRunner: input.processRunner ?? runExternalProcess,
    })

  try {
    const probe = await withTimeout(healthRunner(record), timeoutMs)
    if (probe.status === 'healthy') {
      return input.registry.markEngineHealthy({
        engineId: record.id,
        version: record.version,
      })
    }
    return input.registry.markEngineFailed({
      engineId: record.id,
      reason: probe.reason ?? inferFailureReason(probe.status),
      detail: probe.detail,
      version: record.version,
    })
  } catch (error) {
    return input.registry.markEngineFailed({
      engineId: record.id,
      reason: isTimeoutError(error) ? 'engine_timeout' : 'engine_failed',
      detail: summarizeError(error),
      version: record.version,
    })
  }
}

export function createDefaultHealthRunner(options: {
  timeoutMs: number
  processRunner: ExternalProcessRunner
}): EngineHealthRunner {
  return async (record) => {
    const healthcheck = record.healthcheck
    if (!healthcheck) {
      return {
        status: 'failed',
        reason: 'engine_unavailable',
        detail: 'healthcheck command not configured',
      }
    }

    const result = await options.processRunner({
      command: healthcheck.command,
      args: healthcheck.args,
      cwd: healthcheck.cwd,
      mode: 'health_check',
      timeoutMs: options.timeoutMs,
    })
    return mapProcessRunToProbe(result)
  }
}

export function mapProcessRunToProbe(result: ExternalProcessRunResult): EngineHealthProbeResult {
  if (result.timedOut || result.errorCode === 'process_timeout') {
    return {
      status: 'timeout',
      reason: 'engine_timeout',
      detail: summarizeResultDetail(result),
    }
  }

  if (result.outputLimited || result.errorCode === 'output_limit_exceeded') {
    return {
      status: 'failed',
      reason: 'output_limit_exceeded',
      detail: summarizeResultDetail(result),
    }
  }

  if (result.errorCode === 'command_not_found') {
    return {
      status: 'failed',
      reason: 'engine_unavailable',
      detail: summarizeResultDetail(result),
    }
  }

  if (
    result.errorCode === 'policy_batch_entrypoint_blocked' ||
    result.errorCode === 'policy_shell_not_allowed' ||
    result.errorCode === 'policy_script_interpreter_blocked'
  ) {
    return {
      status: 'failed',
      reason: 'disabled_by_policy',
      detail: summarizeResultDetail(result),
    }
  }

  if (result.exitCode === 0 && !result.errorCode) {
    return { status: 'healthy', reason: null, detail: null }
  }

  return {
    status: 'failed',
    reason: result.timedOut ? 'engine_timeout' : 'engine_failed',
    detail: summarizeResultDetail(result),
  }
}

function summarizeResultDetail(result: ExternalProcessRunResult): string {
  const parts: string[] = []
  if (result.errorCode) parts.push(`errorCode=${result.errorCode}`)
  if (result.exitCode !== null) parts.push(`exitCode=${result.exitCode}`)
  if (result.signal) parts.push(`signal=${result.signal}`)
  if (result.stderr) parts.push(result.stderr)
  const detail = parts.join('; ')
  return sanitizeEngineDetailForDiagnostics(detail) ?? 'engine check failed'
}

function normalizeTimeoutMs(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_HEALTHCHECK_TIMEOUT_MS
  }
  return value
}

async function withTimeout<T>(
  promise: Promise<T> | T,
  timeoutMs: number
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`engine health check timed out after ${timeoutMs}ms`))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timer != null) clearTimeout(timer)
  }
}

function inferFailureReason(
  status: EngineHealthProbeResult['status']
): EngineFailureReason {
  return status === 'timeout' ? 'engine_timeout' : 'engine_failed'
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return /timed out/i.test(error.message)
}

function summarizeError(error: unknown): string {
  if (error instanceof Error) {
    return sanitizeEngineDetailForDiagnostics(`${error.name}: ${error.message}`) ?? 'engine check failed'
  }
  return 'engine check failed'
}
