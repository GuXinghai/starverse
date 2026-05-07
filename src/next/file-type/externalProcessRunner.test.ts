import { describe, expect, it } from 'vitest'
import { runExternalProcess } from './externalProcessRunner'

const NODE = process.execPath

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
  })

  it('rejects shell:true requests', async () => {
    const result = await runExternalProcess({
      command: NODE,
      args: ['-e', 'process.stdout.write("should-not-run")'],
      shell: true,
    })

    expect(result.errorCode).toBe('policy_shell_not_allowed')
    expect(result.stdout).toBe('')
  })

  it('marks timedOut on timeout and terminates process', async () => {
    const result = await runExternalProcess({
      command: NODE,
      args: ['-e', 'setTimeout(() => {}, 30000)'],
      timeoutMs: 50,
    })

    expect(result.timedOut).toBe(true)
    expect(result.errorCode).toBe('process_timeout')
  })

  it('caps stdout and marks output_limit_exceeded', async () => {
    const result = await runExternalProcess({
      command: NODE,
      args: ['-e', 'process.stdout.write("x".repeat(8192))'],
      maxStdoutBytes: 64,
    })

    expect(result.outputLimited).toBe(true)
    expect(result.errorCode).toBe('output_limit_exceeded')
    expect(Buffer.byteLength(result.stdout, 'utf8')).toBeLessThanOrEqual(64)
  })

  it('caps stderr and marks output_limit_exceeded', async () => {
    const result = await runExternalProcess({
      command: NODE,
      args: ['-e', 'process.stderr.write("e".repeat(8192))'],
      maxStderrBytes: 64,
    })

    expect(result.outputLimited).toBe(true)
    expect(result.errorCode).toBe('output_limit_exceeded')
    expect(Buffer.byteLength(result.stderr, 'utf8')).toBeLessThanOrEqual(64)
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
})
