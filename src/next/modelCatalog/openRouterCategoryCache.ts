const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1'
const DEFAULT_CATEGORY_CACHE_TTL_MS = 60 * 60 * 1000

export const OPENROUTER_MODEL_CATEGORIES = [
  'programming',
  'roleplay',
  'marketing',
  'marketing/seo',
  'technology',
  'science',
  'translation',
  'legal',
  'finance',
  'health',
  'trivia',
  'academia',
] as const

export type OpenRouterModelCategory = (typeof OPENROUTER_MODEL_CATEGORIES)[number]

type CacheEntry = Readonly<{
  fetchedAtMs: number
  expiresAtMs: number
  modelIds: readonly string[]
}>

type CategoryFetchInput = Readonly<{
  category: OpenRouterModelCategory
  baseUrl?: string | null
  apiKey?: string | null
  fetchImpl?: typeof fetch
  nowMs?: number
  ttlMs?: number
}>

export type CategoryMembershipResolveInput = Readonly<{
  category: OpenRouterModelCategory
  baseUrl?: string | null
  apiKey?: string | null
  fetchImpl?: typeof fetch
  nowMs?: number
  ttlMs?: number
}>

export type CategoryMembershipResolveResult = Readonly<{
  modelIds: readonly string[]
  cacheHit: boolean
  usedStaleCache: boolean
  unresolved: boolean
}>

const categoryCache = new Map<string, CacheEntry>()

function normalizeBaseUrl(baseUrl?: string | null): string {
  const raw = String(baseUrl ?? '').trim()
  const resolved = raw.length > 0 ? raw : OPENROUTER_DEFAULT_BASE_URL
  return resolved.replace(/\/+$/, '')
}

function cacheKey(baseUrl: string, category: OpenRouterModelCategory): string {
  return `openrouter|${baseUrl}|category|${category}`
}

function dedupeStringArray(input: readonly string[]): string[] {
  return Array.from(
    new Set(
      input
        .map((value) => String(value ?? '').trim())
        .filter((value) => value.length > 0)
    )
  )
}

function parseErrorMessage(bodyText: string, status: number, statusText: string): string {
  try {
    const parsed = JSON.parse(bodyText) as { error?: { message?: unknown } }
    const message = parsed?.error?.message
    if (typeof message === 'string' && message.trim().length > 0) return message.trim()
  } catch {
    // ignore json parse failure and fallback to http text
  }
  const fallback = `OpenRouter category request failed: HTTP ${status} ${statusText}`.trim()
  return bodyText.trim().length > 0 ? `${fallback} ${bodyText.slice(0, 200)}` : fallback
}

async function fetchCategoryModelIds(input: CategoryFetchInput): Promise<readonly string[]> {
  const fetchImpl = input.fetchImpl ?? fetch
  const baseUrl = normalizeBaseUrl(input.baseUrl)
  const url = `${baseUrl}/models?category=${encodeURIComponent(input.category)}`
  const headers: Record<string, string> = {}
  const apiKey = String(input.apiKey ?? '').trim()
  if (apiKey.length > 0) {
    headers.Authorization = `Bearer ${apiKey}`
  }
  const response = await fetchImpl(url, {
    method: 'GET',
    headers,
  })
  const bodyText = await response.text()
  if (!response.ok) {
    throw new Error(parseErrorMessage(bodyText, response.status, response.statusText))
  }
  const payload = bodyText.trim().length > 0 ? JSON.parse(bodyText) : {}
  const data = Array.isArray((payload as any)?.data) ? (payload as any).data : []
  return dedupeStringArray(
    data
      .map((item: any) => String(item?.id ?? ''))
      .filter((id: string) => id.length > 0)
  )
}

export async function resolveOpenRouterCategoryMembership(
  input: CategoryMembershipResolveInput
): Promise<CategoryMembershipResolveResult> {
  const baseUrl = normalizeBaseUrl(input.baseUrl)
  const nowMs = Number.isFinite(input.nowMs) ? Number(input.nowMs) : Date.now()
  const ttlMs = Math.max(1, Number.isFinite(input.ttlMs) ? Number(input.ttlMs) : DEFAULT_CATEGORY_CACHE_TTL_MS)
  const category = input.category
  const key = cacheKey(baseUrl, category)
  const cached = categoryCache.get(key) ?? null
  const hasFreshCache = cached != null && cached.expiresAtMs > nowMs
  if (hasFreshCache) {
    return {
      modelIds: cached.modelIds,
      cacheHit: true,
      usedStaleCache: false,
      unresolved: false,
    }
  }

  try {
    const modelIds = await fetchCategoryModelIds({
      category,
      baseUrl,
      apiKey: input.apiKey,
      fetchImpl: input.fetchImpl,
    })
    const nextEntry: CacheEntry = {
      fetchedAtMs: nowMs,
      expiresAtMs: nowMs + ttlMs,
      modelIds,
    }
    categoryCache.set(key, nextEntry)
    return {
      modelIds,
      cacheHit: false,
      usedStaleCache: false,
      unresolved: false,
    }
  } catch {
    if (cached != null) {
      return {
        modelIds: cached.modelIds,
        cacheHit: false,
        usedStaleCache: true,
        unresolved: false,
      }
    }
    return {
      modelIds: [],
      cacheHit: false,
      usedStaleCache: false,
      unresolved: true,
    }
  }
}

export function __resetOpenRouterCategoryCacheForTests() {
  categoryCache.clear()
}
