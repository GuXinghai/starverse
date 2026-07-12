import { describe, expect, it } from 'vitest'
import { CompatibleCatalogSourceError, parseCompatibleModelsResponse } from './compatibleCatalogSource'

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))

describe('compatibleCatalogSource', () => {
  it('accepts a standard list while keeping unavailable metadata unknown', () => {
    const result = parseCompatibleModelsResponse(encode({
      object: 'list',
      data: [{ id: 'model-b', owned_by: 'vendor' }, { id: 'model-a', created: 123 }],
    }))
    expect(result.models.map((model) => model.modelId)).toEqual(['model-b', 'model-a'])
    expect(result.models[0]?.metadata).toEqual({
      schemaVersion: 1,
      displayName: null,
      contextLength: null,
      maxOutputTokens: null,
      capabilities: { text: null, vision: null, tools: null, structuredOutputs: null, reasoning: null },
      pricing: { prompt: null, completion: null, request: null, image: null },
      fieldProvenance: {},
    })
  })

  it('keeps the first valid duplicate and reports bounded counts without raw rows', () => {
    const result = parseCompatibleModelsResponse(encode({ data: [
      { id: 'same' }, { id: '' }, null, { id: 'same' }, { id: 'other' },
    ] }))
    expect(result.models.map((model) => model.modelId)).toEqual(['same', 'other'])
    expect(result.diagnostics).toEqual({ totalRows: 5, acceptedRows: 2, malformedRows: 2, duplicateRows: 1 })
    expect(JSON.stringify(result.diagnostics)).not.toContain('same')
  })

  it('distinguishes empty success from malformed JSON and invalid envelopes', () => {
    expect(parseCompatibleModelsResponse(encode({ data: [] }))).toMatchObject({
      models: [], diagnostics: { totalRows: 0, acceptedRows: 0, malformedRows: 0, duplicateRows: 0 },
    })
    expect(() => parseCompatibleModelsResponse(new TextEncoder().encode('{')))
      .toThrowError(expect.objectContaining<Partial<CompatibleCatalogSourceError>>({ code: 'compatible_catalog_json_malformed' }))
    expect(() => parseCompatibleModelsResponse(encode({ models: [] })))
      .toThrowError(expect.objectContaining<Partial<CompatibleCatalogSourceError>>({ code: 'compatible_catalog_envelope_invalid' }))
  })

  it('rejects a non-empty response when every row is malformed instead of reporting empty success', () => {
    expect(() => parseCompatibleModelsResponse(encode({ data: [null, {}, { id: '' }] })))
      .toThrowError(expect.objectContaining<Partial<CompatibleCatalogSourceError>>({ code: 'compatible_catalog_all_rows_invalid' }))
  })

  it('rejects an excessive row count before per-row parsing', () => {
    expect(() => parseCompatibleModelsResponse(encode({ data: Array.from({ length: 10_001 }, () => null) })))
      .toThrowError(expect.objectContaining<Partial<CompatibleCatalogSourceError>>({ code: 'compatible_catalog_models_overflow' }))
  })
})
