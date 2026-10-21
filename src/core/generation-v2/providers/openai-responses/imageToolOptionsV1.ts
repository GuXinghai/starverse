/** Reviewed hosted image-tool domains. The selected model never replaces the Responses chat model. */
export const OPENAI_IMAGE_TOOL_MODELS_V1 = Object.freeze([
  { value: 'gpt-image-2.5-flare', label: 'GPT Image 2.5 Flare' },
  { value: 'gpt-image-2.5-sunburst', label: 'GPT Image 2.5 Sunburst' },
  { value: 'gpt-image-2', label: 'GPT Image 2' },
  { value: 'gpt-image-1.5', label: 'GPT Image 1.5' },
  { value: 'gpt-image-1', label: 'GPT Image 1' },
  { value: 'gpt-image-1-mini', label: 'GPT Image 1 Mini' },
] as const)

export type OpenAIImageToolModelV1 = typeof OPENAI_IMAGE_TOOL_MODELS_V1[number]['value']
export function isOpenAIImageToolModelV1(value: unknown): value is OpenAIImageToolModelV1 {
  return OPENAI_IMAGE_TOOL_MODELS_V1.some((model) => model.value === value)
}

export function getOpenAIImageToolOptionsV1(model?: string) {
  const modern = model === 'gpt-image-2' || model?.startsWith('gpt-image-2.5-') === true
  return Object.freeze({
    model, customSize: modern,
    sizes: Object.freeze(['auto', '1024x1024', '1024x1536', '1536x1024']),
    qualities: Object.freeze(['auto', 'low', 'medium', 'high', ...(model?.startsWith('gpt-image-2.5-') ? ['xhigh', 'max'] : [])]),
    inputFidelities: Object.freeze(modern ? [] : model === 'gpt-image-1-mini' ? ['low'] as const : ['low', 'high'] as const),
    formats: Object.freeze(['png', 'jpeg', 'webp'] as const),
    backgrounds: Object.freeze(['auto', 'transparent', 'opaque'] as const),
    actions: Object.freeze(['auto', 'generate', 'edit'] as const),
    moderations: Object.freeze(['auto', 'low'] as const),
    partialImages: Object.freeze([0, 1, 2, 3] as const),
  })
}

export function isOpenAIImageToolSizeV1(size: unknown, model?: string): boolean {
  if (typeof size !== 'string') return false
  const options = getOpenAIImageToolOptionsV1(model)
  if (options.sizes.includes(size)) return true
  if (!options.customSize || !/^[1-9]\d{0,3}x[1-9]\d{0,3}$/u.test(size)) return false
  const [width, height] = size.split('x').map(Number)
  return width % 16 === 0 && height % 16 === 0 && Math.max(width, height) <= 3840 &&
    Math.max(width, height) <= Math.min(width, height) * 3 &&
    width * height >= 655360 && width * height <= 8294400
}
