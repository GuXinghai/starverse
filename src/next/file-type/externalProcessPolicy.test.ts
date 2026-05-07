import { describe, expect, it } from 'vitest'
import {
  EXTERNAL_PROCESS_POLICY_DEFAULTS,
  evaluateExternalProcessPolicy,
  isBatchEntrypoint,
} from './externalProcessPolicy'

describe('externalProcessPolicy', () => {
  it('applies secure defaults for process mode', () => {
    const result = evaluateExternalProcessPolicy({
      command: 'node',
      mode: 'process',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.policy.shell).toBe(false)
    expect(result.policy.allowBatchEntrypoint).toBe(false)
    expect(result.policy.timeoutMs).toBe(
      EXTERNAL_PROCESS_POLICY_DEFAULTS.processTimeoutMs
    )
    expect(result.policy.maxStdoutBytes).toBe(
      EXTERNAL_PROCESS_POLICY_DEFAULTS.stdoutBytes
    )
    expect(result.policy.maxStderrBytes).toBe(
      EXTERNAL_PROCESS_POLICY_DEFAULTS.stderrBytes
    )
  })

  it('uses health timeout default for health_check mode', () => {
    const result = evaluateExternalProcessPolicy({
      command: 'node',
      mode: 'health_check',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.policy.timeoutMs).toBe(
      EXTERNAL_PROCESS_POLICY_DEFAULTS.healthCheckTimeoutMs
    )
  })

  it('clamps timeout and output limits to hard caps', () => {
    const result = evaluateExternalProcessPolicy({
      command: 'node',
      timeoutMs: EXTERNAL_PROCESS_POLICY_DEFAULTS.maxTimeoutMs + 5000,
      maxStdoutBytes: EXTERNAL_PROCESS_POLICY_DEFAULTS.maxStdoutBytes + 1024,
      maxStderrBytes: EXTERNAL_PROCESS_POLICY_DEFAULTS.maxStderrBytes + 1024,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.policy.timeoutMs).toBe(
      EXTERNAL_PROCESS_POLICY_DEFAULTS.maxTimeoutMs
    )
    expect(result.policy.maxStdoutBytes).toBe(
      EXTERNAL_PROCESS_POLICY_DEFAULTS.maxStdoutBytes
    )
    expect(result.policy.maxStderrBytes).toBe(
      EXTERNAL_PROCESS_POLICY_DEFAULTS.maxStderrBytes
    )
  })

  it('rejects shell:true explicitly', () => {
    const result = evaluateExternalProcessPolicy({
      command: 'node',
      shell: true,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errorCode).toBe('policy_shell_not_allowed')
  })

  it('rejects .bat and .cmd entrypoints by default', () => {
    const bat = evaluateExternalProcessPolicy({ command: 'C:\\tools\\run.bat' })
    const cmd = evaluateExternalProcessPolicy({ command: '/opt/tools/hello.cmd' })
    expect(bat.ok).toBe(false)
    expect(cmd.ok).toBe(false)
    if (!bat.ok) expect(bat.errorCode).toBe('policy_batch_entrypoint_blocked')
    if (!cmd.ok) expect(cmd.errorCode).toBe('policy_batch_entrypoint_blocked')
  })

  it('detects batch entrypoints case-insensitively', () => {
    expect(isBatchEntrypoint('RUN.CMD')).toBe(true)
    expect(isBatchEntrypoint('"C:\\run\\SCRIPT.BAT"')).toBe(true)
    expect(isBatchEntrypoint('/usr/bin/node')).toBe(false)
  })
})
