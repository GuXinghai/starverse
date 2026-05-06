import { sanitizeEngineDetailForDiagnostics, type ExternalEngineRegistry } from './externalEngineRegistry'
import type {
  EngineHealthProbeResult,
  EngineHealthRunner,
  EngineId,
  ExternalEngineRecord,
} from './externalEngineTypes'

export type RunEngineHealthCheckInput = Readonly<{
  registry: ExternalEngineRegistry
  engineId: EngineId
  runner?: EngineHealthRunner
  timeoutMs?: number
}>

const DEFAULT_HEALTHCHECK_TIMEOUT_MS = 3000

export async function runEngineHealthCheck(input: RunEngineHealthCheckInput): Promise<ExternalEngineRecord> {
  const record = input.registry.getEngineById(input.engineId)
  if (!record) throw new Error(`unknown engine: ${input.engineId}`)
  if (!record.enabled) return record

  const timeoutMs = normalizeTimeoutMs(input.timeoutMs)
  const runner = input.runner ?? defaultHealthRunner
  try {
    const probe = await withTimeout(runner(record), timeoutMs)
    if (probe.status === 'healthy') {
      return input.registry.markEngineHealthy({ engineId: record.id, version: record.version })
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

function defaultHealthRunner(): EngineHealthProbeResult {
  return {
    status: 'failed',
    reason: 'engine_unavailable',
    detail: 'health runner not configured',
  }
}

function normalizeTimeoutMs(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_HEALTHCHECK_TIMEOUT_MS
  }
  return value
}

async function withTimeout<T>(promise: Promise<T> | T, timeoutMs: number): Promise<T> {
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

function inferFailureReason(status: EngineHealthProbeResult['status']): 'engine_failed' | 'engine_timeout' {
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
