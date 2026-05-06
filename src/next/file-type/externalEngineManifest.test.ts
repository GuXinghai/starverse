import { describe, expect, it } from 'vitest'
import {
  parseManagedEnginePluginManifest,
  validateManagedEnginePluginManifest,
} from './externalEngineManifest'

describe('externalEngineManifest', () => {
  it('validates and normalizes a minimal manifest', () => {
    const result = validateManagedEnginePluginManifest({
      id: 'pandoc',
      displayName: 'Pandoc',
      version: '1.0.0',
      platform: 'any',
      kind: 'plugin',
      capabilities: ['document_conversion', 'text_extraction', 'document_conversion'],
      supportedFormatIds: ['docx', 'markdown'],
      supportedMimeTypes: ['Text/Markdown', 'application/pdf'],
      resourceLimits: { maxInputBytes: 1024, maxDurationMs: 5000 },
      sandbox: { enabled: true },
      network: { allowed: false },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.manifest.capabilities).toEqual(['document_conversion', 'text_extraction'])
    expect(result.manifest.supportedMimeTypes).toEqual(['text/markdown', 'application/pdf'])
  })

  it('applies secure defaults when optional fields are omitted', () => {
    const manifest = parseManagedEnginePluginManifest({
      id: 'demo',
      displayName: 'Demo',
      version: '0.1.0',
      platform: 'linux',
      kind: 'builtin',
      capabilities: ['text_extraction'],
    })

    expect(manifest.supportedFormatIds).toEqual([])
    expect(manifest.supportedMimeTypes).toEqual([])
    expect(manifest.resourceLimits).toEqual({ maxInputBytes: null, maxDurationMs: null })
    expect(manifest.sandbox.enabled).toBe(true)
    expect(manifest.network.allowed).toBe(false)
  })

  it('rejects unknown capabilities and format ids', () => {
    const result = validateManagedEnginePluginManifest({
      id: 'broken',
      displayName: 'Broken',
      version: '0.0.1',
      platform: 'any',
      kind: 'plugin',
      capabilities: ['document_conversion', 'unknown_capability'],
      supportedFormatIds: ['docx', 'fake_format'],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.join(' ')).toContain('unknown_capability')
    expect(result.errors.join(' ')).toContain('fake_format')
  })
})
