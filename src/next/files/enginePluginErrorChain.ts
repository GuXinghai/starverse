import type { DecodedPluginErrorChain } from '@/next/ipc/contracts/enginePluginLifecycleContracts'

export const UNKNOWN_PLUGIN_ERROR = 'Unknown Error'

export type PluginErrorChainDetailRow = Readonly<{
  label: string
  value: string
}>

const UNKNOWN_RUNTIME_REASONS = new Set([
  'unknown_runtime_error',
])

const UNKNOWN_HEALTH_OUTCOMES = new Set([
  'unknown_health_check_result',
])

const UNKNOWN_HEALTH_STAGES = new Set([
  'unknown_health_check_stage',
])

const UNKNOWN_ROOT_CAUSES = new Set([
  'UNKNOWN_ROOT_CAUSE',
])

const NON_PRIMARY_OPERATION_CODES = new Set([
  'health_check_failed',
  'unknown_operation_error',
])

const RUNTIME_REASON_CODES = new Set([
  'magika_runtime_missing_dependency',
  'magika_child_process_exit_nonzero',
  'magika_stdout_parse_failed',
  'magika_health_check_timeout',
  'magika_health_check_execution_failed',
  'unknown_runtime_error',
])

export function pluginPrimaryErrorDisplay(
  errorChain: DecodedPluginErrorChain | null | undefined,
  fallbackReason: string | null | undefined
): string {
  const runtimeReason = normalizeCode(errorChain?.runtimeLayer.reason)
  if (runtimeReason && !UNKNOWN_RUNTIME_REASONS.has(runtimeReason)) return runtimeReason

  const rootCause = normalizeCode(errorChain?.rootCauseLayer.sanitizedRootCause)
  if (rootCause && !UNKNOWN_ROOT_CAUSES.has(rootCause)) return rootCause

  const fallback = normalizeCode(fallbackReason)
  if (fallback && !UNKNOWN_RUNTIME_REASONS.has(fallback) && !NON_PRIMARY_OPERATION_CODES.has(fallback)) {
    return fallback
  }

  const healthOutcome = normalizeCode(errorChain?.healthLayer.outcome)
  if (healthOutcome && !UNKNOWN_HEALTH_OUTCOMES.has(healthOutcome)) return healthOutcome

  const operationCode = normalizeCode(errorChain?.operationLayer.code)
  if (operationCode && !NON_PRIMARY_OPERATION_CODES.has(operationCode)) return operationCode

  return UNKNOWN_PLUGIN_ERROR
}

export function pluginErrorChainDetailRows(
  errorChain: DecodedPluginErrorChain | null | undefined,
  fallbackReason: string | null | undefined
): readonly PluginErrorChainDetailRow[] {
  const fallback = normalizeCode(fallbackReason)
  const runtimeFallback = fallback && RUNTIME_REASON_CODES.has(fallback) ? fallback : null
  const operationFallback = fallback && NON_PRIMARY_OPERATION_CODES.has(fallback) ? fallback : null
  return [
    {
      label: 'Operation',
      value: displayCode(errorChain?.operationLayer.code ?? operationFallback, NON_PRIMARY_OPERATION_CODES.has(operationFallback ?? '') ? new Set() : undefined),
    },
    {
      label: 'Health result',
      value: displayCode(errorChain?.healthLayer.outcome, UNKNOWN_HEALTH_OUTCOMES),
    },
    {
      label: 'Health stage',
      value: displayCode(errorChain?.healthLayer.stage, UNKNOWN_HEALTH_STAGES),
    },
    {
      label: 'Runtime reason',
      value: displayCode(errorChain?.runtimeLayer.reason ?? runtimeFallback, UNKNOWN_RUNTIME_REASONS),
    },
    {
      label: 'Root cause',
      value: displayCode(errorChain?.rootCauseLayer.sanitizedRootCause, UNKNOWN_ROOT_CAUSES),
    },
  ]
}

export function pluginErrorChainDiagnosticLines(
  errorChain: DecodedPluginErrorChain | null | undefined,
  fallbackReason: string | null | undefined
): readonly string[] {
  return pluginErrorChainDetailRows(errorChain, fallbackReason)
    .map((row) => `${row.label}: ${row.value}`)
}

function normalizeCode(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  return /^[a-z0-9_:-]{1,128}$/iu.test(normalized) ? normalized : null
}

function displayCode(
  value: string | null | undefined,
  unknownValues: ReadonlySet<string> | undefined = undefined
): string {
  const normalized = normalizeCode(value)
  if (!normalized) return UNKNOWN_PLUGIN_ERROR
  if (unknownValues?.has(normalized)) return UNKNOWN_PLUGIN_ERROR
  return normalized
}
