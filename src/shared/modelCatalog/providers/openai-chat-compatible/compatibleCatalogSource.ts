import {
  compatibleModelIdSchema,
  type CompatibleModelMetadata,
} from '../../../provider/openai-chat-compatible'

export type CompatibleCatalogSourceDiagnostics = Readonly<{
  totalRows: number
  acceptedRows: number
  malformedRows: number
  duplicateRows: number
}>

export type CompatibleCatalogSourceResult = Readonly<{
  models: readonly Readonly<{ modelId: string; metadata: CompatibleModelMetadata }>[]
  diagnostics: CompatibleCatalogSourceDiagnostics
}>

export class CompatibleCatalogSourceError extends Error {
  readonly code: 'compatible_catalog_json_malformed' | 'compatible_catalog_envelope_invalid' | 'compatible_catalog_models_overflow' | 'compatible_catalog_all_rows_invalid'

  constructor(code: CompatibleCatalogSourceError['code']) {
    super(code)
    this.name = 'CompatibleCatalogSourceError'
    this.code = code
  }
}

const MAX_REMOTE_MODEL_ROWS = 10_000

export function parseCompatibleModelsResponse(bytes: Uint8Array): CompatibleCatalogSourceResult {
  let decoded: string
  let payload: unknown
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    payload = JSON.parse(decoded)
  } catch {
    throw new CompatibleCatalogSourceError('compatible_catalog_json_malformed')
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !Array.isArray((payload as { data?: unknown }).data)) {
    throw new CompatibleCatalogSourceError('compatible_catalog_envelope_invalid')
  }
  const rows = (payload as { data: unknown[] }).data
  if (rows.length > MAX_REMOTE_MODEL_ROWS) {
    throw new CompatibleCatalogSourceError('compatible_catalog_models_overflow')
  }
  const seen = new Set<string>()
  const models: Array<Readonly<{ modelId: string; metadata: CompatibleModelMetadata }>> = []
  let malformedRows = 0
  let duplicateRows = 0
  for (const row of rows) {
    const id = row && typeof row === 'object' && !Array.isArray(row) ? (row as { id?: unknown }).id : undefined
    const result = compatibleModelIdSchema.safeParse(id)
    if (!result.success) {
      malformedRows += 1
      continue
    }
    if (seen.has(result.data)) {
      duplicateRows += 1
      continue
    }
    seen.add(result.data)
    models.push(Object.freeze({ modelId: result.data, metadata: unknownRemoteMetadata() }))
  }
  if (rows.length > 0 && models.length === 0) {
    throw new CompatibleCatalogSourceError('compatible_catalog_all_rows_invalid')
  }
  return Object.freeze({
    models: Object.freeze(models),
    diagnostics: Object.freeze({
      totalRows: rows.length,
      acceptedRows: models.length,
      malformedRows,
      duplicateRows,
    }),
  })
}

function unknownRemoteMetadata(): CompatibleModelMetadata {
  return Object.freeze({
    schemaVersion: 1,
    displayName: null,
    contextLength: null,
    maxOutputTokens: null,
    capabilities: Object.freeze({ text: null, vision: null, tools: null, structuredOutputs: null, reasoning: null }),
    pricing: Object.freeze({ prompt: null, completion: null, request: null, image: null }),
    fieldProvenance: Object.freeze({}),
  })
}
