import { describe, expect, it } from 'vitest'
import { runEngineHealthCheck } from './externalEngineHealth'
import { createExternalEngineRegistry } from './externalEngineRegistry'

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
})
