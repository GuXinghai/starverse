import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'node:child_process'
import {
  evaluateExternalProcessPolicy,
  type ExternalProcessErrorCode,
  type ExternalProcessPolicyInput,
} from './externalProcessPolicy'

const WINDOWS_PATH_RE = /\b[A-Za-z]:\\[^\s"'`]+/g
const UNIX_PATH_RE = /(?:\/Users\/|\/home\/|\/mnt\/|\/var\/|\/tmp\/)[^\s"'`]+/g

type SpawnImpl = (
  command: string,
  args: readonly string[],
  options: SpawnOptionsWithoutStdio
) => ChildProcessWithoutNullStreams

type KillProcessTreeImpl = (pid: number | undefined, platform: NodeJS.Platform) => Promise<boolean>

export type RunExternalProcessInput = Readonly<
  ExternalProcessPolicyInput & {
    args?: readonly string[] | null
    cwd?: string | null
    env?: NodeJS.ProcessEnv | null
    now?: () => number
    platform?: NodeJS.Platform
    spawnImpl?: SpawnImpl
    killProcessTreeImpl?: KillProcessTreeImpl
  }
>

export type ExternalProcessRunResult = Readonly<{
  exitCode: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  timedOut: boolean
  outputLimited: boolean
  errorCode: ExternalProcessErrorCode | null
  elapsedMs: number
}>

// eslint-disable-next-line max-lines-per-function
export async function runExternalProcess(input: RunExternalProcessInput): Promise<ExternalProcessRunResult> {
  const now = input.now ?? Date.now
  const startedAt = now()
  const policyResult = evaluateExternalProcessPolicy(input)
  if (!policyResult.ok) {
    return {
      exitCode: null,
      signal: null,
      stdout: '',
      stderr: sanitizeForProcessResult(policyResult.message),
      timedOut: false,
      outputLimited: false,
      errorCode: policyResult.errorCode,
      elapsedMs: Math.max(0, now() - startedAt),
    }
  }

  const policy = policyResult.policy
  const args = (input.args ?? []).map((value) => String(value))
  const spawnImpl = input.spawnImpl ?? spawn
  const platform = input.platform ?? process.platform
  const killProcessTreeImpl = input.killProcessTreeImpl ?? killProcessTreeBestEffort

  let stdoutBytes = 0
  let stderrBytes = 0
  const stdoutChunks: Buffer[] = []
  const stderrChunks: Buffer[] = []
  let timedOut = false
  let outputLimited = false
  let errorCode: ExternalProcessErrorCode | null = null
  let resolved = false
  let killTriggered = false
  let killFailed = false
  let spawnErrorDetail: string | null = null

  let child: ChildProcessWithoutNullStreams
  try {
    child = spawnImpl(policy.command, args, {
      cwd: input.cwd ?? undefined,
      env: input.env ?? undefined,
      shell: false,
      windowsHide: true,
      detached: platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    return {
      exitCode: null,
      signal: null,
      stdout: '',
      stderr: sanitizeForProcessResult(summarizeSpawnError(error)),
      timedOut: false,
      outputLimited: false,
      errorCode: classifySpawnError(error),
      elapsedMs: Math.max(0, now() - startedAt),
    }
  }

  const timeoutHandle = setTimeout(() => {
    timedOut = true
    if (!errorCode) errorCode = 'process_timeout'
    void requestKill()
  }, policy.timeoutMs)

  const finalize = (exitCode: number | null, signal: NodeJS.Signals | null) => {
    if (resolved) return
    resolved = true
    clearTimeout(timeoutHandle)

    const stdout = sanitizeForProcessResult(Buffer.concat(stdoutChunks).toString('utf8'))
    let stderr = sanitizeForProcessResult(Buffer.concat(stderrChunks).toString('utf8'))
    if (spawnErrorDetail) {
      stderr = stderr.length > 0 ? `${stderr}\n${spawnErrorDetail}` : spawnErrorDetail
    }
    if (killFailed) {
      stderr = stderr.length > 0 ? `${stderr}\nprocess tree termination failed` : 'process tree termination failed'
      if (!errorCode) errorCode = 'process_kill_failed'
    }

    if (!errorCode && exitCode !== null && exitCode !== 0) {
      errorCode = 'process_exit_nonzero'
    }

    return {
      exitCode,
      signal,
      stdout,
      stderr,
      timedOut,
      outputLimited,
      errorCode,
      elapsedMs: Math.max(0, now() - startedAt),
    } satisfies ExternalProcessRunResult
  }

  async function requestKill(): Promise<void> {
    if (killTriggered) return
    killTriggered = true
    const ok = await killProcessTreeImpl(child.pid, platform)
    if (!ok) {
      killFailed = true
    }
  }

  function appendChunk(
    chunks: Buffer[],
    currentBytes: number,
    maxBytes: number,
    data: Buffer | string,
    onLimit: () => void
  ): number {
    const chunk = Buffer.isBuffer(data) ? data : Buffer.from(String(data))
    if (chunk.length === 0) return currentBytes
    if (currentBytes >= maxBytes) {
      onLimit()
      return currentBytes
    }
    const remaining = maxBytes - currentBytes
    if (chunk.length <= remaining) {
      chunks.push(chunk)
      return currentBytes + chunk.length
    }
    chunks.push(chunk.subarray(0, remaining))
    onLimit()
    return maxBytes
  }

  return await new Promise<ExternalProcessRunResult>((resolve) => {
    child.stdout.on('data', (data) => {
      stdoutBytes = appendChunk(
        stdoutChunks,
        stdoutBytes,
        policy.maxStdoutBytes,
        data,
        () => {
          outputLimited = true
          if (!errorCode) errorCode = 'output_limit_exceeded'
          void requestKill()
        }
      )
    })
    child.stderr.on('data', (data) => {
      stderrBytes = appendChunk(
        stderrChunks,
        stderrBytes,
        policy.maxStderrBytes,
        data,
        () => {
          outputLimited = true
          if (!errorCode) errorCode = 'output_limit_exceeded'
          void requestKill()
        }
      )
    })

    child.once('error', (error) => {
      if (!errorCode) errorCode = classifySpawnError(error)
      spawnErrorDetail = sanitizeForProcessResult(summarizeSpawnError(error))
      const result = finalize(null, null)
      if (result) resolve(result)
    })

    child.once('close', (code, signal) => {
      const result = finalize(code, signal)
      if (result) resolve(result)
    })
  })
}

export async function killProcessTreeBestEffort(
  pid: number | undefined,
  platform: NodeJS.Platform = process.platform
): Promise<boolean> {
  if (!pid || !Number.isFinite(pid) || pid <= 0) return false

  if (platform === 'win32') {
    return await new Promise<boolean>((resolve) => {
      const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        shell: false,
        windowsHide: true,
        stdio: 'ignore',
      })
      killer.once('error', () => resolve(false))
      killer.once('close', (code) => resolve(code === 0))
    })
  }

  try {
    process.kill(-pid, 'SIGKILL')
    return true
  } catch {
    // fall through
  }
  try {
    process.kill(pid, 'SIGKILL')
    return true
  } catch {
    return false
  }
}

function classifySpawnError(error: unknown): ExternalProcessErrorCode {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string'
  ) {
    return (error as { code: string }).code.toUpperCase() === 'ENOENT'
      ? 'command_not_found'
      : 'spawn_failed'
  }
  return 'spawn_failed'
}

function summarizeSpawnError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return `spawn error: ${String(error ?? 'unknown')}`
}

function sanitizeForProcessResult(input: string): string {
  return input
    .replace(/(contentToken["'\s:=]+)([^\s"',}]+)/gi, '$1[redacted-token]')
    .replace(/(fullHash["'\s:=]+)([A-Za-z0-9+/=:_-]{12,})/gi, '$1[redacted-hash]')
    .replace(WINDOWS_PATH_RE, '[redacted-path]')
    .replace(UNIX_PATH_RE, '[redacted-path]')
}
