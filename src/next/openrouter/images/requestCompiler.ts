import type { OpenRouterImageEndpointBinding } from './bindingResolver'
import type { OpenRouterImageRequestParameters } from './endpointContract'

export type OpenRouterImagesRequest = Readonly<{
  model: string
  prompt: string
  provider: Readonly<{
    only: readonly [string]
    allow_fallbacks: false
    options?: Readonly<Record<string, Readonly<Record<string, unknown>>>>
  }>
} & Record<string, unknown>>

const OPENROUTER_IMAGES_PARAMETER_KEYS = new Set([
  'n',
  'resolution',
  'aspect_ratio',
  'size',
  'quality',
  'output_format',
  'background',
  'output_compression',
  'seed',
])

export function compileOpenRouterImagesRequest(input: Readonly<{
  modelId: string
  prompt: string
  parameters: OpenRouterImageRequestParameters
  stream: boolean
  binding: OpenRouterImageEndpointBinding
}>): OpenRouterImagesRequest {
  if (!input.modelId.trim()) throw new Error('modelId must be non-empty')
  if (!input.prompt.trim()) throw new Error('prompt must be non-empty')
  if (input.binding.modelId !== input.modelId) throw new Error('binding modelId mismatch')
  const unknownKey = Object.keys(input.parameters).find((key) => !OPENROUTER_IMAGES_PARAMETER_KEYS.has(key))
  if (unknownKey) throw new Error(`unsupported OpenRouter Images parameter: ${unknownKey}`)
  for (const key of ['n', 'output_compression', 'seed'] as const) {
    const value = input.parameters[key]
    if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
      throw new Error(`${key} must be a non-negative integer`)
    }
  }
  if (input.parameters.n !== undefined && input.parameters.n < 1) throw new Error('n must be at least 1')
  if (input.parameters.output_compression !== undefined && input.parameters.output_compression > 100) {
    throw new Error('output_compression must be <= 100')
  }
  const providerOptions = input.binding.providerOptions
  return Object.freeze({
    model: input.modelId,
    prompt: input.prompt,
    ...input.parameters,
    ...(input.stream ? { stream: true } : {}),
    provider: Object.freeze({
      only: Object.freeze([input.binding.providerTag]) as readonly [string],
      allow_fallbacks: false as const,
      ...(Object.keys(providerOptions).length > 0
        ? { options: Object.freeze({ [input.binding.providerSlug]: providerOptions }) }
        : {}),
    }),
  })
}
