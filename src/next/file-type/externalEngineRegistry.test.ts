import { describe, expect, it } from 'vitest'
import { createExternalEngineRegistry } from './externalEngineRegistry'

describe('externalEngineRegistry', () => {
  it('registers built-in engine definitions and lists known engines', () => {
    const registry = createExternalEngineRegistry(() => 1000)
    const inserted = registry.registerBuiltInEngineDefinitions()
    const listed = registry.listKnownEngines()

    expect(inserted).toHaveLength(4)
    expect(listed.map((item) => item.id)).toEqual(['ffprobe', 'libreoffice', 'pandoc', 'tika'])
  })

  it('computes route availability from healthy enabled engines', () => {
    const registry = createExternalEngineRegistry(() => 1000)
    registry.registerBuiltInEngineDefinitions()

    const before = registry.getEngineAvailability()
    expect(before.routeAvailability.documentConversion).toBe(false)
    expect(before.routeAvailability.textExtraction).toBe(false)

    registry.markEngineHealthy({ engineId: 'tika' })
    const after = registry.getEngineAvailability()
    expect(after.routeAvailability.documentConversion).toBe(true)
    expect(after.routeAvailability.textExtraction).toBe(true)

    registry.disableEngine('tika')
    const disabled = registry.getEngineAvailability()
    expect(disabled.routeAvailability.documentConversion).toBe(false)
    expect(disabled.routeAvailability.textExtraction).toBe(false)
  })

  it('captures diagnostics and sanitizes sensitive path-like failure details', () => {
    const registry = createExternalEngineRegistry(() => 1000)
    registry.registerBuiltInEngineDefinitions()
    registry.markEngineFailed({
      engineId: 'pandoc',
      reason: 'engine_failed',
      detail: 'cannot open C:\\Users\\alice\\secrets\\file.docx',
    })

    const availability = registry.getEngineAvailability()
    expect(availability.diagnostics).toHaveLength(1)
    const event = availability.diagnostics[0]
    expect(event?.event).toBe('engine_failed')
    expect(event?.detail).not.toContain('C:\\Users\\alice\\secrets')
    expect(event?.detail).toContain('[redacted-path]')
  })
})
