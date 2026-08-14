import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({ fork: vi.fn() }))
vi.mock('electron', () => ({ utilityProcess: { fork: electron.fork } }))

import { createMagikaUtilityProcessRunner } from './magikaUtilityProcessRunner'

function child(kill = vi.fn(() => true)) {
  const value = new EventEmitter() as EventEmitter & {
    stdout: PassThrough
    stderr: PassThrough
    kill: typeof kill
  }
  value.stdout = new PassThrough()
  value.stderr = new PassThrough()
  value.kill = kill
  return value
}

describe('createMagikaUtilityProcessRunner', () => {
  it('forks only the absolute JavaScript module and sanitizes child output', async () => {
    const utility = child()
    electron.fork.mockReturnValueOnce(utility)
    const runner = createMagikaUtilityProcessRunner()
    const modulePath = path.resolve('fixture-runtime.mjs')
    const pending = runner({ command: process.execPath, args: [modulePath, '--output-json'], timeoutMs: 100 })
    utility.stderr.write('C:\\Users\\alice\\secret.txt contentToken=abc123')
    utility.emit('message', { kind: 'starverse-magika-result-v1', json: '{"ok":true}' })
    utility.emit('exit', 0)
    const result = await pending
    expect(electron.fork).toHaveBeenCalledWith(modulePath, ['--output-json'], expect.objectContaining({
      stdio: ['ignore', 'pipe', 'pipe'], allowLoadingUnsignedLibraries: false,
    }))
    expect(result).toMatchObject({ exitCode: 0, errorCode: null, stdout: '{"ok":true}' })
    expect(result.stderr).toContain('[redacted-path]')
    expect(result.stderr).toContain('[redacted-token]')
  })

  it('terminates and resolves when a timed-out utility process never exits', async () => {
    const utility = child()
    electron.fork.mockReturnValueOnce(utility)
    const result = await createMagikaUtilityProcessRunner()({
      command: process.execPath, args: [path.resolve('fixture-runtime.mjs')],
      timeoutMs: 10, terminationGraceMs: 10,
    })
    expect(utility.kill).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ timedOut: true, terminationAttempted: true, errorCode: 'process_exit_unconfirmed' })
  })

  it('rejects a renderer-like executable override before spawning', async () => {
    const result = await createMagikaUtilityProcessRunner()({
      command: 'node', args: [path.resolve('fixture-runtime.mjs')],
    })
    expect(result.errorCode).toBe('policy_invalid_command')
    expect(electron.fork).not.toHaveBeenCalled()
  })

  it('does not accept a result message as success until the utility exits', async () => {
    const utility = child(vi.fn(() => false))
    electron.fork.mockReturnValueOnce(utility)
    const pending = createMagikaUtilityProcessRunner()({
      command: process.execPath, args: [path.resolve('fixture-runtime.mjs')],
      timeoutMs: 15, terminationGraceMs: 10,
    })
    utility.emit('message', { kind: 'starverse-magika-result-v1', json: '{"ok":true}' })
    const result = await pending
    expect(result.errorCode).toBe('process_kill_failed')
    expect(result.timedOut).toBe(true)
  })
})
