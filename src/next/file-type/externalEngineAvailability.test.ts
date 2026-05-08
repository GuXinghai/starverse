import { describe, expect, it } from 'vitest'
import {
  buildCapabilityAvailability,
  computeEngineAvailability,
  toRouteAvailability,
} from './externalEngineAvailability'
import type { ExternalEngineRecord } from './externalEngineTypes'

function engine(overrides: Partial<ExternalEngineRecord>): ExternalEngineRecord {
  return {
    id: overrides.id ?? 'engine',
    displayName: overrides.displayName ?? 'Engine',
    version: overrides.version ?? '0.0.1',
    platform: overrides.platform ?? 'any',
    kind: overrides.kind ?? 'builtin',
    capabilities: overrides.capabilities ?? ['document_conversion'],
    supportedFormatIds: overrides.supportedFormatIds ?? [],
    supportedMimeTypes: overrides.supportedMimeTypes ?? [],
    enabled: overrides.enabled ?? true,
    healthStatus: overrides.healthStatus ?? 'unknown',
    failureReason: overrides.failureReason ?? null,
    failureDetails: overrides.failureDetails ?? null,
    lastCheckedAt: overrides.lastCheckedAt ?? null,
    healthcheck: overrides.healthcheck ?? null,
  }
}

describe('externalEngineAvailability', () => {
  it('requires enabled+healthy engines for capability availability', () => {
    const engines: ExternalEngineRecord[] = [
      engine({ id: 'a', capabilities: ['document_conversion'], healthStatus: 'healthy' }),
      engine({ id: 'b', capabilities: ['spreadsheet_conversion'], enabled: false, healthStatus: 'healthy' }),
      engine({ id: 'c', capabilities: ['presentation_conversion'], enabled: true, healthStatus: 'failed' }),
    ]

    const capabilities = buildCapabilityAvailability(engines)
    expect(capabilities.document_conversion).toBe(true)
    expect(capabilities.spreadsheet_conversion).toBe(false)
    expect(capabilities.presentation_conversion).toBe(false)
  })

  it('maps capability availability to route availability', () => {
    const routeAvailability = toRouteAvailability({
      document_conversion: true,
      spreadsheet_conversion: false,
      presentation_conversion: true,
      rendered_images: true,
      text_extraction: false,
      metadata_extraction: false,
      audio_extraction: true,
      frame_selection: false,
    })
    expect(routeAvailability.documentConversion).toBe(true)
    expect(routeAvailability.spreadsheetConversion).toBe(false)
    expect(routeAvailability.renderedImages).toBe(true)
    expect(routeAvailability.audioExtraction).toBe(true)
  })

  it('returns diagnostics unchanged while computing availability snapshot', () => {
    const diagnostics = [
      {
        event: 'engine_unavailable',
        engineId: 'demo',
        version: '0.0.1',
        healthStatus: 'failed',
        failureReason: 'engine_unavailable',
        detail: 'runner unavailable',
        timestamp: 1000,
      },
    ] as const

    const snapshot = computeEngineAvailability(
      [engine({ id: 'demo', healthStatus: 'failed', capabilities: ['document_conversion'] })],
      diagnostics
    )
    expect(snapshot.diagnostics).toEqual(diagnostics)
    expect(snapshot.routeAvailability.documentConversion).toBe(false)
  })
})
