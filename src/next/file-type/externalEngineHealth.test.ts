import { describe, expect, it } from 'vitest'
import { mapProcessRunToProbe, runEngineHealthCheck } from './externalEngineHealth'
import { createExternalEngineRegistry } from './externalEngineRegistry'

// eslint-disable-next-line max-lines-per-function
describe('externalEngineHealth', () => {
  it('marks an engine healthy via fake runner', async () => {
    const registry = createExternalEngineRegistry(() => 1234)
    registry.registerBuiltInEngineDefinitions()

    const updated = await runEngineHealthCheck({
      registry,
      engineId: 'tika',
      runner: async () => ({ status: 'healthy', reason: null, detail: null }),
    })

    expect(updated.healthStatus).toBe('healthy')
    expect(updated.failureReason).toBeNull()
    const diagnostics = registry.getEngineAvailability().diagnostics
    expect(diagnostics[0]?.event).toBe('engine_health_checked')
  })

  it('marks an engine failed and sanitizes failure details', async () => {
    const registry = createExternalEngineRegistry(() => 2345)
    registry.registerBuiltInEngineDefinitions()

    const updated = await runEngineHealthCheck({
      registry,
      engineId: 'pandoc',
      runner: async () => ({
        status: 'failed',
        reason: 'engine_failed',
        detail: 'runner error at /home/user/private/input.md',
      }),
    })

    expect(updated.healthStatus).toBe('failed')
    expect(updated.failureReason).toBe('engine_failed')
    expect(updated.failureDetails).toContain('[redacted-path]')
    expect(updated.failureDetails).not.toContain('/home/user/private')
  })

  it('marks timeout when fake runner exceeds timeout', async () => {
    const registry = createExternalEngineRegistry(() => 3456)
    registry.registerBuiltInEngineDefinitions()

    const updated = await runEngineHealthCheck({
      registry,
      engineId: 'ffprobe',
      timeoutMs: 5,
      runner: async () =>
        await new Promise((resolve) => {
          setTimeout(() => resolve({ status: 'healthy', reason: null, detail: null }), 20)
        }),
    })

    expect(updated.healthStatus).toBe('timeout')
    expect(updated.failureReason).toBe('engine_timeout')
  })

  it('supports injected processRunner for real healthcheck closure without user file access', async () => {
    const registry = createExternalEngineRegistry(() => 4567)
    registry.registerManifest({
      id: 'demo-health',
      displayName: 'Demo Health',
      version: '0.0.1',
      platform: 'any',
      kind: 'plugin',
      capabilities: ['text_extraction'],
      supportedFormatIds: ['plain_text'],
      supportedMimeTypes: ['text/plain'],
      supportedOutputRoutes: [],
      resourceLimits: { maxInputBytes: null, maxDurationMs: null },
      sandbox: { enabled: true },
      network: { allowed: false },
      healthcheck: { command: 'demo', args: ['--version'], cwd: null },
      metadataAllowlist: null,
    })

    const updated = await runEngineHealthCheck({
      registry,
      engineId: 'demo-health',
      processRunner: async (input) => {
        expect(input.command).toBe('demo')
        expect(input.args).toEqual(['--version'])
        expect(input.mode).toBe('health_check')
        return {
          exitCode: 0,
          signal: null,
          stdout: 'demo 0.0.1',
          stderr: '',
          timedOut: false,
          outputLimited: false,
          terminationAttempted: false,
          terminated: false,
          errorCode: null,
          elapsedMs: 12,
        }
      },
    })

    expect(updated.healthStatus).toBe('healthy')
    expect(updated.failureReason).toBeNull()
  })

  it('maps command_not_found to engine_unavailable while keeping availability output usable', async () => {
    const registry = createExternalEngineRegistry(() => 5678)
    registry.registerManifest({
      id: 'demo-missing',
      displayName: 'Demo Missing',
      version: '0.0.1',
      platform: 'any',
      kind: 'plugin',
      capabilities: ['document_conversion'],
      supportedFormatIds: ['docx'],
      supportedMimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      supportedOutputRoutes: [],
      resourceLimits: { maxInputBytes: null, maxDurationMs: null },
      sandbox: { enabled: true },
      network: { allowed: false },
      healthcheck: { command: 'missing', args: [], cwd: null },
      metadataAllowlist: null,
    })

    const updated = await runEngineHealthCheck({
      registry,
      engineId: 'demo-missing',
      processRunner: async () => ({
        exitCode: null,
        signal: null,
        stdout: '',
        stderr: 'spawn ENOENT',
        timedOut: false,
        outputLimited: false,
        terminationAttempted: false,
        terminated: false,
        errorCode: 'command_not_found',
        elapsedMs: 5,
      }),
    })

    expect(updated.healthStatus).toBe('failed')
    expect(updated.failureReason).toBe('engine_unavailable')
    const availability = registry.getEngineAvailability()
    expect(availability.engines.some((engine) => engine.id === 'demo-missing')).toBe(true)
    expect(availability.routeAvailability.documentConversion).toBe(false)
  })

  it('maps output_limit_exceeded to dedicated failure reason', async () => {
    const registry = createExternalEngineRegistry(() => 6789)
    registry.registerManifest({
      id: 'demo-output-limit',
      displayName: 'Demo Output Limit',
      version: '0.0.1',
      platform: 'any',
      kind: 'plugin',
      capabilities: ['text_extraction'],
      supportedFormatIds: ['plain_text'],
      supportedMimeTypes: ['text/plain'],
      supportedOutputRoutes: [],
      resourceLimits: { maxInputBytes: null, maxDurationMs: null },
      sandbox: { enabled: true },
      network: { allowed: false },
      healthcheck: { command: 'limit', args: [], cwd: null },
      metadataAllowlist: null,
    })

    const updated = await runEngineHealthCheck({
      registry,
      engineId: 'demo-output-limit',
      processRunner: async () => ({
        exitCode: null,
        signal: null,
        stdout: '',
        stderr: 'too much output',
        timedOut: false,
        outputLimited: true,
        terminationAttempted: false,
        terminated: false,
        errorCode: 'output_limit_exceeded',
        elapsedMs: 7,
      }),
    })

    expect(updated.healthStatus).toBe('failed')
    expect(updated.failureReason).toBe('output_limit_exceeded')
  })

  it('maps script interpreter policy block to disabled_by_policy', () => {
    const probe = mapProcessRunToProbe({
      exitCode: null,
      signal: null,
      stdout: '',
      stderr: 'blocked by policy',
      timedOut: false,
      outputLimited: false,
      terminationAttempted: false,
      terminated: false,
      errorCode: 'policy_script_interpreter_blocked',
      elapsedMs: 3,
    })
    expect(probe.status).toBe('failed')
    expect(probe.reason).toBe('disabled_by_policy')
  })

  it('blocks health check when verificationStatus is failed', async () => {
    const registry = createExternalEngineRegistry(() => 5678)
    registry.registerBuiltInEngineDefinitions()
    registry.setVerificationStatus({ engineId: 'pandoc', verificationStatus: 'failed' })

    const updated = await runEngineHealthCheck({
      registry,
      engineId: 'pandoc',
      runner: async () => ({ status: 'healthy', reason: null, detail: null }),
    })
    expect(updated.healthStatus).toBe('failed')
    expect(updated.failureReason).toBe('disabled_by_policy')
    expect(updated.failureDetails).toContain('failed')
  })

  it('blocks health check when verificationStatus is revoked', async () => {
    const registry = createExternalEngineRegistry(() => 9999)
    registry.registerBuiltInEngineDefinitions()
    registry.setVerificationStatus({ engineId: 'tika', verificationStatus: 'revoked' })

    const updated = await runEngineHealthCheck({
      registry,
      engineId: 'tika',
      runner: async () => ({ status: 'healthy', reason: null, detail: null }),
    })
    expect(updated.healthStatus).toBe('failed')
    expect(updated.failureReason).toBe('disabled_by_policy')
    expect(updated.failureDetails).toContain('revoked')
  })
})
