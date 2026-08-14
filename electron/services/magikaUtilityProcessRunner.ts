import path from 'node:path'
import { utilityProcess } from 'electron'
import {
  evaluateExternalProcessPolicy,
  type ExternalProcessRunResult,
  type MagikaProcessRunner,
} from '../../infra/files/fileTypeRuntimeBoundary'
import { redactSensitiveString } from '../ipc/logSanitizer'

const SAFE_ENV_KEYS = Object.freeze([
  'HOME', 'USERPROFILE', 'TMP', 'TEMP', 'TMPDIR', 'SYSTEMROOT', 'WINDIR',
  'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'NODE_ENV',
] as const)
function safeEnvironment(source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const output: Record<string, string> = {}
  for (const key of SAFE_ENV_KEYS) {
    const value = source[key]
    if (typeof value === 'string' && value.length > 0) output[key] = value
  }
  return output
}

function sanitize(value: string): string {
  return redactSensitiveString(value)
}

function rejected(errorCode: ExternalProcessRunResult['errorCode'], stderr: string): ExternalProcessRunResult {
  return Object.freeze({
    exitCode: null, signal: null, stdout: '', stderr: sanitize(stderr), timedOut: false,
    outputLimited: false, terminationAttempted: false, terminated: false, errorCode,
    elapsedMs: 0,
  })
}

/** Electron-main-only executor for the signed Magika JavaScript runtime. */
export function createMagikaUtilityProcessRunner(): MagikaProcessRunner {
  return async (input): Promise<ExternalProcessRunResult> => {
    const now = input.now ?? Date.now
    const startedAt = now()
    const policyResult = evaluateExternalProcessPolicy(input)
    if (!policyResult.ok) return { ...rejected(policyResult.errorCode, policyResult.message), elapsedMs: Math.max(0, now() - startedAt) }
    if (path.resolve(input.command) !== path.resolve(process.execPath)) {
      return { ...rejected('policy_invalid_command', 'Magika utility process command is not the application runtime.'), elapsedMs: Math.max(0, now() - startedAt) }
    }
    const args = [...(input.args ?? [])].map(String)
    const modulePath = args.shift()
    if (!modulePath || !path.isAbsolute(modulePath) || !/\.(?:mjs|cjs|js)$/iu.test(modulePath)) {
      return { ...rejected('policy_invalid_command', 'Magika utility process module path is invalid.'), elapsedMs: Math.max(0, now() - startedAt) }
    }

    const policy = policyResult.policy
    let child: Electron.UtilityProcess
    try {
      child = utilityProcess.fork(modulePath, args, {
        cwd: input.cwd ?? path.dirname(modulePath),
        env: safeEnvironment(input.env ?? process.env),
        stdio: ['ignore', 'pipe', 'pipe'],
        serviceName: 'Starverse Magika Classifier',
        allowLoadingUnsignedLibraries: false,
      })
    } catch {
      return { ...rejected('spawn_failed', 'Magika utility process could not be created.'), elapsedMs: Math.max(0, now() - startedAt) }
    }

    let stdoutBytes = 0
    let stderrBytes = 0
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let timedOut = false
    let outputLimited = false
    let terminationAttempted = false
    let terminated = false
    let errorCode: ExternalProcessRunResult['errorCode'] = null
    let killTimer: ReturnType<typeof setTimeout> | null = null
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null
    let resultMessageReceived = false
    let settled = false
    let resolveResult: (result: ExternalProcessRunResult) => void = () => {}

    const finalize = (exitCode: number | null): void => {
      if (settled) return
      settled = true
      if (timeoutTimer) clearTimeout(timeoutTimer)
      if (killTimer) clearTimeout(killTimer)
      resolveResult(Object.freeze({
        exitCode, signal: null,
        stdout: sanitize(Buffer.concat(stdout).toString('utf8')),
        stderr: sanitize(Buffer.concat(stderr).toString('utf8')),
        timedOut, outputLimited, terminationAttempted, terminated, errorCode,
        elapsedMs: Math.max(0, now() - startedAt),
      }))
    }

    const append = (target: Buffer[], data: unknown, current: number, maximum: number): number => {
      const chunk = Buffer.isBuffer(data) ? data : Buffer.from(String(data))
      const remaining = Math.max(0, maximum - current)
      if (remaining > 0) target.push(chunk.subarray(0, remaining))
      if (chunk.byteLength > remaining) {
        outputLimited = true
        errorCode ??= 'output_limit_exceeded'
        requestKill()
      }
      return Math.min(maximum, current + chunk.byteLength)
    }
    const requestKill = () => {
      if (terminationAttempted) return
      terminationAttempted = true
      if (!child.kill()) errorCode = 'process_kill_failed'
      killTimer = setTimeout(() => {
        errorCode = errorCode === 'process_kill_failed' ? errorCode : 'process_exit_unconfirmed'
        finalize(null)
      }, policy.terminationGraceMs)
    }

    return await new Promise<ExternalProcessRunResult>((resolve) => {
      resolveResult = resolve
      timeoutTimer = setTimeout(() => {
        timedOut = true
        errorCode ??= 'process_timeout'
        requestKill()
      }, policy.timeoutMs)
      child.stdout?.on('data', (data) => { stdoutBytes = append(stdout, data, stdoutBytes, policy.maxStdoutBytes) })
      child.stderr?.on('data', (data) => { stderrBytes = append(stderr, data, stderrBytes, policy.maxStderrBytes) })
      child.on('message', (message: unknown) => {
        if (!message || typeof message !== 'object') return
        const value = message as Record<string, unknown>
        if (value.kind !== 'starverse-magika-result-v1' || typeof value.json !== 'string') return
        if (resultMessageReceived) return
        resultMessageReceived = true
        stdoutBytes = append(stdout, value.json, stdoutBytes, policy.maxStdoutBytes)
      })
      child.once('error', () => {
        errorCode ??= 'spawn_failed'
        finalize(null)
      })
      child.once('exit', (code) => {
        terminated = true
        if (!errorCode && code === 0 && !resultMessageReceived && stdoutBytes === 0) errorCode = 'process_exit_nonzero'
        if (!errorCode && code !== 0) errorCode = 'process_exit_nonzero'
        finalize(code)
      })
    })
  }
}
