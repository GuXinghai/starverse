export type ModelCatalogLogScope = 'query' | 'detail' | 'endpoints'

export function buildModelKeyForLog(providerKey: string, modelId: string): string {
  return `${String(providerKey ?? '').trim()}::${String(modelId ?? '').trim()}`
}

export function logModelCatalogEvent(
  scope: ModelCatalogLogScope,
  event: string,
  payload: Record<string, unknown>
) {
  const envelope = {
    ts: Date.now(),
    event,
    ...payload,
  }
  try {
    console.log(`[modelCatalog:${scope}]`, JSON.stringify(envelope))
  } catch {
    // Non-serializable payloads should never break runtime paths.
    console.log(`[modelCatalog:${scope}]`, event)
  }
}

