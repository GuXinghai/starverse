import path from 'node:path'

export const EXTERNAL_PROCESS_POLICY_MODES = ['health_check', 'process', 'conversion'] as const
export type ExternalProcessPolicyMode = (typeof EXTERNAL_PROCESS_POLICY_MODES)[number]

export const EXTERNAL_PROCESS_POLICY_ERROR_CODES = [
  'policy_invalid_command',
  'policy_shell_not_allowed',
  'policy_batch_entrypoint_blocked',
  'policy_script_interpreter_blocked',
] as const
export type ExternalProcessPolicyErrorCode = (typeof EXTERNAL_PROCESS_POLICY_ERROR_CODES)[number]

export const EXTERNAL_PROCESS_ERROR_CODES = [
  ...EXTERNAL_PROCESS_POLICY_ERROR_CODES,
  'command_not_found',
  'spawn_failed',
  'process_exit_nonzero',
  'process_timeout',
  'output_limit_exceeded',
  'process_kill_failed',
  'process_exit_unconfirmed',
] as const
export type ExternalProcessErrorCode = (typeof EXTERNAL_PROCESS_ERROR_CODES)[number]

export const EXTERNAL_PROCESS_POLICY_DEFAULTS = Object.freeze({
  healthCheckTimeoutMs: 3000,
  processTimeoutMs: 10000,
  conversionTimeoutMs: 60000,
  maxTimeoutMs: 60000,
  conversionMaxTimeoutMs: 300000,
  stdoutBytes: 1024 * 1024,
  stderrBytes: 256 * 1024,
  conversionStdoutBytes: 50 * 1024 * 1024,
  conversionStderrBytes: 1024 * 1024,
  maxStdoutBytes: 10 * 1024 * 1024,
  maxStderrBytes: 1024 * 1024,
  conversionMaxStdoutBytes: 100 * 1024 * 1024,
  conversionMaxStderrBytes: 5 * 1024 * 1024,
  terminationGraceMs: 1000,
  maxTerminationGraceMs: 10000,
  shell: false,
  allowBatchEntrypoint: false,
})

export type ExternalProcessPolicyInput = Readonly<{
  command: string
  mode?: ExternalProcessPolicyMode | null
  timeoutMs?: number | null
  maxStdoutBytes?: number | null
  maxStderrBytes?: number | null
  terminationGraceMs?: number | null
  shell?: boolean | null
  allowBatchEntrypoint?: boolean | null
}>

export type ResolvedExternalProcessPolicy = Readonly<{
  command: string
  mode: ExternalProcessPolicyMode
  timeoutMs: number
  maxStdoutBytes: number
  maxStderrBytes: number
  terminationGraceMs: number
  shell: false
  allowBatchEntrypoint: boolean
}>

export type ExternalProcessPolicyResult =
  | Readonly<{ ok: true; policy: ResolvedExternalProcessPolicy }>
  | Readonly<{
      ok: false
      errorCode: ExternalProcessPolicyErrorCode
      message: string
    }>

export function evaluateExternalProcessPolicy(
  input: ExternalProcessPolicyInput
): ExternalProcessPolicyResult {
  const command = normalizeCommand(input.command)
  if (!command) {
    return {
      ok: false,
      errorCode: 'policy_invalid_command',
      message: 'external process command is empty',
    }
  }

  if (input.shell === true) {
    return {
      ok: false,
      errorCode: 'policy_shell_not_allowed',
      message: `shell execution is not allowed for command ${safeCommandName(command)}`,
    }
  }

  const allowBatchEntrypoint =
    typeof input.allowBatchEntrypoint === 'boolean'
      ? input.allowBatchEntrypoint
      : EXTERNAL_PROCESS_POLICY_DEFAULTS.allowBatchEntrypoint

  if (!allowBatchEntrypoint && isBatchEntrypoint(command)) {
    return {
      ok: false,
      errorCode: 'policy_batch_entrypoint_blocked',
      message: `batch entrypoint is blocked for command ${safeCommandName(command)}`,
    }
  }

  if (isBlockedScriptInterpreter(command)) {
    return {
      ok: false,
      errorCode: 'policy_script_interpreter_blocked',
      message: `script interpreter entrypoint is blocked for command ${safeCommandName(command)}`,
    }
  }

  const mode = normalizeMode(input.mode)
  const isConversion = mode === 'conversion'
  const timeoutDefault = isConversion
    ? EXTERNAL_PROCESS_POLICY_DEFAULTS.conversionTimeoutMs
    : mode === 'health_check'
      ? EXTERNAL_PROCESS_POLICY_DEFAULTS.healthCheckTimeoutMs
      : EXTERNAL_PROCESS_POLICY_DEFAULTS.processTimeoutMs
  const timeoutHardMax = isConversion
    ? EXTERNAL_PROCESS_POLICY_DEFAULTS.conversionMaxTimeoutMs
    : EXTERNAL_PROCESS_POLICY_DEFAULTS.maxTimeoutMs
  const stdoutDefault = isConversion
    ? EXTERNAL_PROCESS_POLICY_DEFAULTS.conversionStdoutBytes
    : EXTERNAL_PROCESS_POLICY_DEFAULTS.stdoutBytes
  const stdoutHardMax = isConversion
    ? EXTERNAL_PROCESS_POLICY_DEFAULTS.conversionMaxStdoutBytes
    : EXTERNAL_PROCESS_POLICY_DEFAULTS.maxStdoutBytes
  const stderrDefault = isConversion
    ? EXTERNAL_PROCESS_POLICY_DEFAULTS.conversionStderrBytes
    : EXTERNAL_PROCESS_POLICY_DEFAULTS.stderrBytes
  const stderrHardMax = isConversion
    ? EXTERNAL_PROCESS_POLICY_DEFAULTS.conversionMaxStderrBytes
    : EXTERNAL_PROCESS_POLICY_DEFAULTS.maxStderrBytes

  return {
    ok: true,
    policy: {
      command,
      mode,
      timeoutMs: clampPositiveInteger(
        input.timeoutMs,
        timeoutDefault,
        timeoutHardMax
      ),
      maxStdoutBytes: clampPositiveInteger(
        input.maxStdoutBytes,
        stdoutDefault,
        stdoutHardMax
      ),
      maxStderrBytes: clampPositiveInteger(
        input.maxStderrBytes,
        stderrDefault,
        stderrHardMax
      ),
      terminationGraceMs: clampPositiveInteger(
        input.terminationGraceMs,
        EXTERNAL_PROCESS_POLICY_DEFAULTS.terminationGraceMs,
        EXTERNAL_PROCESS_POLICY_DEFAULTS.maxTerminationGraceMs
      ),
      shell: false,
      allowBatchEntrypoint,
    },
  }
}

export function isBatchEntrypoint(command: string): boolean {
  const normalized = normalizeCommand(command).toLowerCase()
  if (!normalized) return false
  const base = safeCommandName(normalized)
  return base.endsWith('.bat') || base.endsWith('.cmd')
}

const BLOCKED_SCRIPT_INTERPRETERS = new Set<string>([
  'cmd.exe',
  'command.com',
  'powershell.exe',
  'pwsh.exe',
  'wscript.exe',
  'cscript.exe',
  'mshta.exe',
])

export function isBlockedScriptInterpreter(command: string): boolean {
  const normalized = normalizeCommand(command)
  if (!normalized) return false
  const base = safeCommandName(normalized).toLowerCase()
  return BLOCKED_SCRIPT_INTERPRETERS.has(base)
}

function normalizeMode(mode: ExternalProcessPolicyMode | null | undefined): ExternalProcessPolicyMode {
  return mode === 'health_check' ? 'health_check' : mode === 'conversion' ? 'conversion' : 'process'
}

function clampPositiveInteger(
  value: number | null | undefined,
  fallback: number,
  max: number
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback
  }
  const floored = Math.floor(value)
  if (floored <= 0) return fallback
  return Math.min(floored, max)
}

function normalizeCommand(command: string): string {
  if (typeof command !== 'string') return ''
  const trimmed = command.trim()
  if (!trimmed) return ''
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

function safeCommandName(command: string): string {
  const normalized = command.replace(/[\\/]+$/, '')
  const base = path.basename(normalized)
  return base || '[command]'
}
