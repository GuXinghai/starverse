import type {
  CatalogModelKey,
  CatalogModelTag,
  CatalogModality,
  CatalogPricing,
} from './internalSchema'

const LONG_CONTEXT_THRESHOLD = 128_000
const CHEAP_BUCKET_CHEAP_MAX = 0.0000025
const CHEAP_BUCKET_STANDARD_MAX = 0.00002

type CheapBucket = 'cheap' | 'standard' | 'expensive' | 'unknown'

export type ModelTaggerInput = Readonly<{
  modelKey: CatalogModelKey
  inputModalities: ReadonlyArray<CatalogModality>
  supportedParameters: ReadonlyArray<string>
  contextLength?: number | null
  pricing?: CatalogPricing | null
  updatedAtMs: number
}>

function parseDecimal(value: string | null | undefined): number | null {
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (!raw) return null
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return parsed
}

function resolveCheapBucket(pricing: CatalogPricing | null | undefined): CheapBucket {
  const prompt = parseDecimal(pricing?.prompt ?? null)
  const completion = parseDecimal(pricing?.completion ?? null)

  if (prompt == null && completion == null) return 'unknown'
  const effective = Math.max(prompt ?? 0, completion ?? 0)
  if (effective <= CHEAP_BUCKET_CHEAP_MAX) return 'cheap'
  if (effective <= CHEAP_BUCKET_STANDARD_MAX) return 'standard'
  return 'expensive'
}

function hasParameter(parameters: ReadonlySet<string>, keys: ReadonlyArray<string>): boolean {
  for (const key of keys) {
    if (parameters.has(key)) return true
  }
  return false
}

function buildTag(
  modelKey: CatalogModelKey,
  key: string,
  label: string,
  type: CatalogModelTag['type'],
  updatedAtMs: number
): CatalogModelTag {
  return {
    modelKey,
    key,
    label,
    type,
    confidence: 1,
    source: 'derived',
    updatedAtMs,
  }
}

/**
 * Deterministic hard-tag derivation used by catalog sync.
 * Same input always yields the same tag set and order.
 */
export function deriveModelTags(input: ModelTaggerInput): CatalogModelTag[] {
  const parameterSet = new Set(input.supportedParameters.map((p) => String(p).trim().toLowerCase()).filter(Boolean))
  const hasVision = input.inputModalities.includes('image') || input.inputModalities.includes('video')
  const hasTools = hasParameter(parameterSet, ['tools', 'tool_choice'])
  const hasStructuredOutputs = hasParameter(parameterSet, ['response_format', 'json_schema', 'structured_outputs'])
  const hasReasoning = hasParameter(parameterSet, ['reasoning', 'include_reasoning'])
  const hasLongContext = typeof input.contextLength === 'number' && input.contextLength >= LONG_CONTEXT_THRESHOLD
  const cheapBucket = resolveCheapBucket(input.pricing)

  const tags: CatalogModelTag[] = []
  if (hasVision) tags.push(buildTag(input.modelKey, 'capability:vision', 'vision', 'capability', input.updatedAtMs))
  if (hasTools) tags.push(buildTag(input.modelKey, 'capability:tools', 'tools', 'capability', input.updatedAtMs))
  if (hasStructuredOutputs) {
    tags.push(buildTag(input.modelKey, 'capability:structured_outputs', 'structured_outputs', 'capability', input.updatedAtMs))
  }
  if (hasReasoning) tags.push(buildTag(input.modelKey, 'capability:reasoning', 'reasoning', 'capability', input.updatedAtMs))
  if (hasLongContext) {
    tags.push(buildTag(input.modelKey, 'capability:long_context', 'long_context', 'capability', input.updatedAtMs))
  }
  tags.push(
    buildTag(
      input.modelKey,
      `category:cheap_bucket:${cheapBucket}`,
      `cheap_bucket:${cheapBucket}`,
      'category',
      input.updatedAtMs
    )
  )

  tags.sort((a, b) => a.key.localeCompare(b.key))
  return tags
}

