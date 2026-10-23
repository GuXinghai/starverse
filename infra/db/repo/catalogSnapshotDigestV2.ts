import { createHash } from 'node:crypto'
import { stableSerializeProviderRequestBoundedV2 } from '../../../src/shared/serialization/canonicalJsonV2'

// R4-08 (P3a-02): these keys record when a catalog was fetched, not what it contains. Provider sources stamp
// them from their own clock into every item, including the nested observation and raw envelope, so a digest
// over the stored items changed on every refresh even when the provider returned exactly the same models.
const FETCH_TIME_KEYS: ReadonlySet<string> = new Set([
  'firstSeenAtMs',
  'lastSeenAtMs',
  'syncedAtMs',
  'fetchedAtMs',
  'updatedAtMs',
  'observedAtMs',
])

const MAX_CONTENT_BYTES = 32 * 1024 * 1024

function withoutFetchTimes(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutFetchTimes)
  if (value === null || typeof value !== 'object') return value
  const result: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!FETCH_TIME_KEYS.has(key)) result[key] = withoutFetchTimes(entry)
  }
  return result
}

export function catalogItemsContentKeyV2(items: readonly unknown[]): string {
  return stableSerializeProviderRequestBoundedV2(withoutFetchTimes(items), MAX_CONTENT_BYTES)
}

/** Digest of what the provider reported; unchanged content keeps its digest across refreshes. */
export function catalogItemsContentDigestV2(items: readonly unknown[]): string {
  return createHash('sha256').update(catalogItemsContentKeyV2(items), 'utf8').digest('hex')
}
