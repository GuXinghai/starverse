import { randomUUID } from 'node:crypto'

export type OpenRouterModelObject = Record<string, any>

export type CatalogSyncWriterInput = Readonly<{
  snapshotId: string
  routerSource: string
  models: Array<
    Readonly<{
      modelId: string
      routerSource: string
      vendor: string
      name: string
      description?: string | null
      contextLength?: number | null
      supportedParametersJson?: string | null
      rawJson?: string | null
    }>
  >
}>

export type CatalogSyncWriter = Readonly<{
  syncSnapshot: (input: CatalogSyncWriterInput) => Promise<void> | void
}>

export type CatalogSyncJobResult =
  | Readonly<{ ok: true; snapshotId: string; modelCount: number }>
  | Readonly<{ ok: false; skipped: true; reason: 'missing_api_key' }>

function normalizeBaseUrl(baseUrl?: string | null): string {
  const raw = (baseUrl || 'https://openrouter.ai/api/v1').trim()
  return raw.replace(/\/+$/, '')
}

function generateSnapshotId(): string {
  return `snap_${Date.now()}_${randomUUID()}`
}

function extractVendorFromId(id: string): string {
  const slash = id.indexOf('/')
  return slash > 0 ? id.slice(0, slash) : 'unknown'
}

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((x) => String(x)).filter((x) => x.length > 0)
}

export function normalizeOpenRouterModelToCatalogRow(
  raw: OpenRouterModelObject
): CatalogSyncWriterInput['models'][number] | null {
  const modelId = typeof raw?.id === 'string' ? raw.id.trim() : ''
  if (!modelId) return null

  const name =
    typeof raw?.name === 'string' && raw.name.trim().length > 0 ? raw.name.trim() : modelId
  const description = typeof raw?.description === 'string' ? raw.description : null
  const contextLength = typeof raw?.context_length === 'number' ? raw.context_length : -1
  const supportedParameters = safeStringArray(raw?.supported_parameters)

  return {
    modelId,
    routerSource: 'openrouter',
    vendor: extractVendorFromId(modelId),
    name,
    description,
    contextLength,
    supportedParametersJson: JSON.stringify(supportedParameters),
    rawJson: JSON.stringify(raw),
  }
}

/**
 * CatalogSyncJob (phase 3):
 * - Fetches OpenRouter GET /api/v1/models
 * - Writes into SQLite model_catalog via a single-writer syncSnapshot call
 * - The DB layer is responsible for single-transaction atomicity (upsert + hide-missing).
 */
export async function syncOpenRouterModelCatalog(options: Readonly<{
  writer: CatalogSyncWriter
  apiKey: string
  baseUrl?: string | null
  fetchImpl?: typeof fetch
  snapshotId?: string
}>): Promise<CatalogSyncJobResult> {
  const apiKey = options.apiKey?.trim() || ''
  if (!apiKey) {
    return { ok: false, skipped: true, reason: 'missing_api_key' }
  }

  const baseUrl = normalizeBaseUrl(options.baseUrl)
  const url = `${baseUrl}/models`
  const fetchImpl = options.fetchImpl ?? fetch

  const response = await fetchImpl(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://github.com/GuXinghai/starverse',
      'X-Title': 'Starverse',
    },
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`OpenRouter /models error ${response.status}: ${text.slice(0, 200)}`)
  }

  const json = (await response.json().catch(async () => {
    const text = await response.text().catch(() => '')
    throw new Error(`OpenRouter /models invalid JSON: ${text.slice(0, 200)}`)
  })) as any

  const data = Array.isArray(json?.data) ? (json.data as OpenRouterModelObject[]) : null
  if (!data) {
    throw new Error('OpenRouter /models response missing data[]')
  }

  const rows = data
    .map(normalizeOpenRouterModelToCatalogRow)
    .filter((x): x is NonNullable<typeof x> => !!x)

  const snapshotId = options.snapshotId || generateSnapshotId()

  await options.writer.syncSnapshot({
    snapshotId,
    routerSource: 'openrouter',
    models: rows,
  })

  return { ok: true, snapshotId, modelCount: rows.length }
}

