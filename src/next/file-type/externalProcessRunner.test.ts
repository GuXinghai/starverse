import { PassThrough } from 'node:stream'
import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { runExternalProcess } from './externalProcessRunner'

const NODE = process.execPath

// eslint-disable-next-line max-lines-per-function
describe('externalProcessRunner', () => {
  it('runs command with shell:false policy by default', async () => {
    const result = await runExternalProcess({
      command: NODE,
      args: ['-e', 'process.stdout.write("ok")'],
    })

    expect(result.errorCode).toBeNull()
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('ok')
    expect(result.timedOut).toBe(false)
    expect(result.terminationAttempted).toBe(false)
    expect(result.terminated).toBe(true)
  })

  it('rejects shell:true requests', async () => {
    const result = await runExternalProcess({
      command: NODE,
      args: ['-e', 'process.stdout.write("should-not-run")'],
      shell: true,
    })

    expect(result.errorCode).toBe('policy_shell_not_allowed')
    expect(result.stdout).toBe('')
    expect(result.terminationAttempted).toBe(false)
  })

  it('marks timedOut on timeout and terminates process', async () => {
    const result = await runExternalProcess({
      command: NODE,
      args: ['-e', 'setTimeout(() => {}, 30000)'],
      timeoutMs: 50,
    })

    expect(result.timedOut).toBe(true)
    expect(['process_timeout', 'process_exit_unconfirmed', 'process_kill_failed']).toContain(
      result.errorCode
    )
    expect(result.terminationAttempted).toBe(true)
  })

  it('caps stdout and marks output_limit_exceeded', async () => {
    const result = await runExternalProcess({
      command: NODE,
      args: ['-e', 'process.stdout.write("x".repeat(8192))'],
      maxStdoutBytes: 64,
    })

    expect(result.outputLimited).toBe(true)
    expect(['output_limit_exceeded', 'process_exit_unconfirmed', 'process_kill_failed']).toContain(
      result.errorCode
    )
    expect(Buffer.byteLength(result.stdout, 'utf8')).toBeLessThanOrEqual(64)
    expect(result.terminationAttempted).toBe(true)
  })

  it('caps stderr and marks output_limit_exceeded', async () => {
    const result = await runExternalProcess({
      command: NODE,
      args: ['-e', 'process.stderr.write("e".repeat(8192))'],
      maxStderrBytes: 64,
    })

    expect(result.outputLimited).toBe(true)
    expect(['output_limit_exceeded', 'process_exit_unconfirmed', 'process_kill_failed']).toContain(
      result.errorCode
    )
    expect(Buffer.byteLength(result.stderr, 'utf8')).toBeLessThanOrEqual(64)
    expect(result.terminationAttempted).toBe(true)
  })

  it('returns process_exit_nonzero on non-zero exit', async () => {
    const result = await runExternalProcess({
      command: NODE,
      args: ['-e', 'process.exit(7)'],
    })

    expect(result.exitCode).toBe(7)
    expect(result.errorCode).toBe('process_exit_nonzero')
  })

  it('returns command_not_found for unknown command', async () => {
    const result = await runExternalProcess({
      command: '__starverse_missing_command__',
      args: [],
    })

    expect(result.errorCode).toBe('command_not_found')
  })

  it('redacts sensitive output fields and paths', async () => {
    const result = await runExternalProcess({
      command: NODE,
      args: [
        '-e',
        'process.stdout.write("contentToken=abc123 C:\\\\Users\\\\alice\\\\secret\\\\a.txt fullHash=abcdef0123456789")',
      ],
    })

    expect(result.stdout).not.toContain('abc123')
    expect(result.stdout).toContain('[redacted-token]')
    expect(result.stdout).toContain('[redacted-path]')
    expect(result.stdout).toContain('[redacted-hash]')
  })

  it('resolves after terminationGraceMs when timeout fires and close never arrives', async () => {
    const child = createMockChild({ pid: 4242 })
    const result = await runExternalProcess({
      command: NODE,
      args: ['-e', 'setTimeout(() => {}, 10000)'],
      timeoutMs: 20,
      terminationGraceMs: 20,
      spawnImpl: () => child as any,
      killProcessTreeImpl: async () => true,
    })
    expect(result.timedOut).toBe(true)
    expect(result.terminationAttempted).toBe(true)
    expect(result.terminated).toBe(false)
    expect(result.errorCode).toBe('process_exit_unconfirmed')
  })

  it('resolves after terminationGraceMs when output cap fires and close never arrives', async () => {
    const child = createMockChild({ pid: 4343 })
    const resultPromise = runExternalProcess({
      command: NODE,
      args: ['-e', 'noop'],
      maxStdoutBytes: 16,
      terminationGraceMs: 20,
      spawnImpl: () => child as any,
      killProcessTreeImpl: async () => true,
    })
    setTimeout(() => {
      child.stdout.write(Buffer.from('x'.repeat(1024)))
    }, 0)
    const result = await resultPromise
    expect(result.outputLimited).toBe(true)
    expect(result.terminationAttempted).toBe(true)
    expect(result.terminated).toBe(false)
    expect(result.errorCode).toBe('process_exit_unconfirmed')
    expect(Buffer.byteLength(result.stdout, 'utf8')).toBeLessThanOrEqual(16)
  })

  it('returns process_kill_failed when killProcessTree throws and process does not close', async () => {
    const child = createMockChild({ pid: 4444 })
    const result = await runExternalProcess({
      command: NODE,
      args: ['-e', 'setTimeout(() => {}, 10000)'],
      timeoutMs: 20,
      terminationGraceMs: 20,
      spawnImpl: () => child as any,
      killProcessTreeImpl: async () => {
        throw new Error('kill failed for C:\\Users\\alice\\temp\\proc')
      },
    })
    expect(result.timedOut).toBe(true)
    expect(result.terminationAttempted).toBe(true)
    expect(result.terminated).toBe(false)
    expect(result.errorCode).toBe('process_kill_failed')
    expect(result.stderr).not.toContain('C:\\Users\\alice\\temp')
  })
})

function createMockChild(input: { pid: number }) {
  const emitter = new EventEmitter() as EventEmitter & {
    pid: number
    stdout: PassThrough
    stderr: PassThrough
  }
  emitter.pid = input.pid
  emitter.stdout = new PassThrough()
  emitter.stderr = new PassThrough()
  return emitter
}
