import { describe, expect, it } from 'vitest'
import {
  EXTERNAL_PROCESS_POLICY_DEFAULTS,
  evaluateExternalProcessPolicy,
  isBlockedScriptInterpreter,
  isBatchEntrypoint,
} from './externalProcessPolicy'

// eslint-disable-next-line max-lines-per-function
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
    expect(result.policy.terminationGraceMs).toBe(
      EXTERNAL_PROCESS_POLICY_DEFAULTS.terminationGraceMs
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
      terminationGraceMs: EXTERNAL_PROCESS_POLICY_DEFAULTS.maxTerminationGraceMs + 999,
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
    expect(result.policy.terminationGraceMs).toBe(
      EXTERNAL_PROCESS_POLICY_DEFAULTS.maxTerminationGraceMs
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

  it('rejects blocked script interpreters including path/case/quoted variants', () => {
    const blockedCommands = [
      'cmd.exe',
      'COMMAND.COM',
      'PoWeRsHeLl.ExE',
      'pwsh.exe',
      'wscript.exe',
      'cscript.exe',
      'mshta.exe',
      'C:\\Windows\\System32\\cmd.exe',
      '"C:\\Program Files\\Windows NT\\cmd.exe"',
      '"C:\\Program Files\\PowerShell\\pwsh.exe"',
      '"C:\\Program Files\\Windows NT\\my folder\\cmd.exe"',
    ]

    for (const command of blockedCommands) {
      const result = evaluateExternalProcessPolicy({ command })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.errorCode).toBe('policy_script_interpreter_blocked')
      }
    }
  })

  it('rejects cmd.exe /c *.bat and *.cmd style indirect launch', () => {
    const cmdBat = evaluateExternalProcessPolicy({
      command: 'cmd.exe',
      // @ts-expect-error extra args are ignored by policy type but present in runner input shape
      args: ['/c', 'foo.bat'],
    })
    const cmdCmd = evaluateExternalProcessPolicy({
      command: '"C:\\Windows\\System32\\cmd.exe"',
      // @ts-expect-error extra args are ignored by policy type but present in runner input shape
      args: ['/c', 'foo.cmd'],
    })
    expect(cmdBat.ok).toBe(false)
    expect(cmdCmd.ok).toBe(false)
    if (!cmdBat.ok) expect(cmdBat.errorCode).toBe('policy_script_interpreter_blocked')
    if (!cmdCmd.ok) expect(cmdCmd.errorCode).toBe('policy_script_interpreter_blocked')
  })

  it('detects batch entrypoints case-insensitively', () => {
    expect(isBatchEntrypoint('RUN.CMD')).toBe(true)
    expect(isBatchEntrypoint('"C:\\run\\SCRIPT.BAT"')).toBe(true)
    expect(isBatchEntrypoint('/usr/bin/node')).toBe(false)
  })

  it('detects blocked script interpreter basenames case-insensitively', () => {
    expect(isBlockedScriptInterpreter('CMD.EXE')).toBe(true)
    expect(isBlockedScriptInterpreter('"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"')).toBe(true)
    expect(isBlockedScriptInterpreter('/usr/bin/node')).toBe(false)
  })
})
