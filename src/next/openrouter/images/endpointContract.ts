export const OPENROUTER_IMAGE_OPERATION = 'image-generation' as const

export type OpenRouterImageParameterRule =
  | Readonly<{ type: 'enum'; values: readonly (string | number)[] }>
  | Readonly<{ type: 'range'; min: number; max: number }>

export type OpenRouterImageEndpointDescriptor = Readonly<{
  providerName: string
  providerSlug: string
  providerTag: string
  supportedParameters: Readonly<Record<string, OpenRouterImageParameterRule>>
  allowedPassthroughParameters: readonly string[]
  supportsStreaming: boolean
  /** Complete provider descriptor retained for diagnostics, never forwarded. */
  raw: Readonly<Record<string, unknown>>
}>

export type OpenRouterImageDescriptorSet = Readonly<{
  credentialScope: string
  modelId: string
  revision: string
  fetchedAtMs: number
  hardExpiresAtMs: number
  descriptors: readonly OpenRouterImageEndpointDescriptor[]
}>

export type OpenRouterImageRequestParameters = Readonly<{
  n?: number
  resolution?: string
  aspect_ratio?: string
  size?: string
  quality?: 'auto' | 'low' | 'medium' | 'high'
  output_format?: 'png' | 'jpeg' | 'webp' | 'svg'
  background?: string
  output_compression?: number
  seed?: number
}>

export type OpenRouterImageIntent = Readonly<{
  parameters: OpenRouterImageRequestParameters
  stream: boolean
  providerOptions?: Readonly<Record<string, unknown>>
}>

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`)
  return value as Record<string, unknown>
}

function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${path} must be a non-empty string`)
  return value.trim()
}

function stringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`)
  const result = value.map((entry, index) => nonEmptyString(entry, `${path}[${index}]`))
  if (new Set(result).size !== result.length) throw new Error(`${path} contains duplicate values`)
  return result
}

function parameterRule(value: unknown, path: string): OpenRouterImageParameterRule {
  const raw = object(value, path)
  if (raw.type === 'enum') {
    if (!Array.isArray(raw.values) || raw.values.length === 0) throw new Error(`${path}.values must be a non-empty array`)
    const values = raw.values.map((entry, index) => {
      if (typeof entry !== 'string' && typeof entry !== 'number') throw new Error(`${path}.values[${index}] must be string or number`)
      return entry
    })
    return { type: 'enum', values }
  }
  if (raw.type === 'range') {
    if (typeof raw.min !== 'number' || !Number.isFinite(raw.min)) throw new Error(`${path}.min must be finite`)
    if (typeof raw.max !== 'number' || !Number.isFinite(raw.max) || raw.max < raw.min) throw new Error(`${path}.max must be finite and >= min`)
    return { type: 'range', min: raw.min, max: raw.max }
  }
  throw new Error(`${path}.type is unsupported`)
}

export function decodeOpenRouterImageEndpointDescriptor(value: unknown): OpenRouterImageEndpointDescriptor {
  const raw = object(value, 'descriptor')
  const retainedRaw = Object.freeze(JSON.parse(JSON.stringify(raw)) as Record<string, unknown>)
  if (typeof raw.supports_streaming !== 'boolean') {
    throw new Error('descriptor.supports_streaming must be boolean')
  }
  const supported = object(raw.supported_parameters, 'descriptor.supported_parameters')
  const supportedParameters = Object.fromEntries(
    Object.entries(supported).map(([key, rule]) => [key, parameterRule(rule, `descriptor.supported_parameters.${key}`)]),
  )
  return Object.freeze({
    providerName: nonEmptyString(raw.provider_name, 'descriptor.provider_name'),
    providerSlug: nonEmptyString(raw.provider_slug, 'descriptor.provider_slug'),
    providerTag: nonEmptyString(raw.provider_tag, 'descriptor.provider_tag'),
    supportedParameters: Object.freeze(supportedParameters),
    allowedPassthroughParameters: Object.freeze(stringArray(raw.allowed_passthrough_parameters, 'descriptor.allowed_passthrough_parameters')),
    supportsStreaming: raw.supports_streaming,
    raw: retainedRaw,
  })
}

export function decodeOpenRouterImageEndpointResponse(value: unknown): readonly OpenRouterImageEndpointDescriptor[] {
  const raw = object(value, 'response')
  const data = Array.isArray(raw.endpoints)
    ? raw.endpoints
    : Array.isArray(raw.data)
    ? raw.data
    : object(raw.data, 'response.data').endpoints
  if (!Array.isArray(data) || data.length === 0) throw new Error('response.data endpoints must be a non-empty array')
  const descriptors = data.map(decodeOpenRouterImageEndpointDescriptor)
  const tags = new Set<string>()
  for (const descriptor of descriptors) {
    if (tags.has(descriptor.providerTag)) throw new Error(`duplicate provider_tag: ${descriptor.providerTag}`)
    tags.add(descriptor.providerTag)
  }
  return Object.freeze(descriptors)
}

export function descriptorSupportsIntent(
  descriptor: OpenRouterImageEndpointDescriptor,
  intent: OpenRouterImageIntent,
): boolean {
  if (intent.stream && !descriptor.supportsStreaming) return false
  for (const [key, value] of Object.entries(intent.parameters)) {
    const rule = descriptor.supportedParameters[key]
    if (!rule) return false
    if (rule.type === 'enum' && !rule.values.some((allowed) => allowed === value)) return false
    if (rule.type === 'range') {
      const measured = Array.isArray(value) ? value.length : value
      if (typeof measured !== 'number' || measured < rule.min || measured > rule.max) return false
    }
  }
  const options = intent.providerOptions ?? {}
  if (Object.keys(options).some((key) => !descriptor.allowedPassthroughParameters.includes(key))) return false
  return true
}

export function compareProviderTagCodePoints(left: string, right: string): number {
  const a = Array.from(left)
  const b = Array.from(right)
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = (a[index].codePointAt(0) ?? 0) - (b[index].codePointAt(0) ?? 0)
    if (difference !== 0) return difference
  }
  return a.length - b.length
}

export function projectOpenRouterImageCandidates(
  descriptors: readonly OpenRouterImageEndpointDescriptor[],
  boundProviderTag: string | null,
): readonly OpenRouterImageEndpointDescriptor[] {
  return [...descriptors].sort((left, right) => {
    if (left.providerTag === boundProviderTag) return -1
    if (right.providerTag === boundProviderTag) return 1
    return compareProviderTagCodePoints(left.providerTag, right.providerTag)
  })
}
