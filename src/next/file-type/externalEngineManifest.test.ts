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
    expect(manifest.supportedOutputRoutes).toEqual([])
    expect(manifest.resourceLimits).toEqual({ maxInputBytes: null, maxDurationMs: null })
    expect(manifest.sandbox.enabled).toBe(true)
    expect(manifest.network.allowed).toBe(false)
    expect(manifest.metadataAllowlist).toBeNull()
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

  it('validates supportedOutputRoutes against known send routes', () => {
    const valid = validateManagedEnginePluginManifest({
      id: 'tika',
      displayName: 'Tika',
      version: '2.9.0',
      platform: 'any',
      kind: 'plugin',
      capabilities: ['text_extraction', 'metadata_extraction'],
      supportedOutputRoutes: ['extracted_text', 'converted_markdown'],
    })

    expect(valid.ok).toBe(true)
    if (!valid.ok) return
    expect(valid.manifest.supportedOutputRoutes).toEqual(['extracted_text', 'converted_markdown'])
  })

  it('rejects unknown output routes', () => {
    const result = validateManagedEnginePluginManifest({
      id: 'broken',
      displayName: 'Broken',
      version: '0.0.1',
      platform: 'any',
      kind: 'plugin',
      capabilities: ['text_extraction'],
      supportedOutputRoutes: ['unknown_route'],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.join(' ')).toContain('unknown_route')
  })

  it('validates metadataAllowlist with explicit field names', () => {
    const manifest = parseManagedEnginePluginManifest({
      id: 'tika',
      displayName: 'Tika',
      version: '2.9.0',
      platform: 'any',
      kind: 'plugin',
      capabilities: ['metadata_extraction', 'text_extraction'],
      metadataAllowlist: ['dc:title', 'dc:creator', 'Content-Type'],
    })

    expect(manifest.metadataAllowlist).toEqual(['dc:title', 'dc:creator', 'Content-Type'])
  })

  it('rejects metadataAllowlist with empty array', () => {
    const result = validateManagedEnginePluginManifest({
      id: 'tika',
      displayName: 'Tika',
      version: '2.9.0',
      platform: 'any',
      kind: 'plugin',
      capabilities: ['metadata_extraction'],
      metadataAllowlist: [],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.join(' ')).toContain('metadataAllowlist')
  })

  it('handles metadataAllowlist as null', () => {
    const manifest = parseManagedEnginePluginManifest({
      id: 'tika',
      displayName: 'Tika',
      version: '2.9.0',
      platform: 'any',
      kind: 'plugin',
      capabilities: ['text_extraction'],
      metadataAllowlist: null,
    })

    expect(manifest.metadataAllowlist).toBeNull()
  })

  it('validates metadata_extraction capability', () => {
    const manifest = parseManagedEnginePluginManifest({
      id: 'tika',
      displayName: 'Tika',
      version: '2.9.0',
      platform: 'any',
      kind: 'plugin',
      capabilities: ['metadata_extraction', 'text_extraction', 'document_conversion'],
    })

    expect(manifest.capabilities).toEqual([
      'metadata_extraction',
      'text_extraction',
      'document_conversion',
    ])
  })
})
