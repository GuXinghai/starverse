export type ProviderRuntimeContentBlock = Readonly<{
  type?: string
  [key: string]: unknown
}>

export type OpenAIResponsesRuntimeContentPart =
  | Readonly<{ type: 'input_text'; text: string }>
  | Readonly<{ type: 'input_image'; image_url: string }>

export type AnthropicRuntimeContentBlock =
  | Readonly<{ type: 'text'; text: string }>
  | Readonly<{
      type: 'image'
      source:
        | Readonly<{ type: 'base64'; media_type: string; data: string }>
        | Readonly<{ type: 'url'; url: string }>
    }>

export type GeminiRuntimePart =
  | Readonly<{ text: string }>
  | Readonly<{ inlineData: Readonly<{ mimeType: string; data: string }> }>
  | Readonly<{ fileData: Readonly<{ mimeType: string; fileUri: string }> }>

export type ProviderRuntimeImageProvider =
  | 'openai_responses'
  | 'anthropic_messages'
  | 'google_ai_studio'
  | 'openrouter'
  | 'deepseek'

const MAX_RUNTIME_CONTENT_BLOCKS = 16
const MAX_RUNTIME_TEXT_CHARS = 20000
const IMAGE_DATA_URL_PREFIX = /^data:image\/(?:png|jpeg|jpg);base64,/i

export function buildOpenAIResponsesUserContent(
  userText: string,
  blocks: ReadonlyArray<ProviderRuntimeContentBlock> | undefined
): string | OpenAIResponsesRuntimeContentPart[] {
  const imageParts = collectOpenAIResponsesImageParts(blocks)
  const textParts = collectRuntimeTextParts(userText, blocks)
  if (imageParts.length === 0) return textParts.join('\n')
  return [
    ...textParts.map((text) => ({ type: 'input_text' as const, text })),
    ...imageParts,
  ]
}

export function buildAnthropicUserContent(
  userText: string,
  blocks: ReadonlyArray<ProviderRuntimeContentBlock> | undefined
): string | AnthropicRuntimeContentBlock[] {
  const imageParts = collectAnthropicImageBlocks(blocks)
  const textParts = collectRuntimeTextParts(userText, blocks)
  if (imageParts.length === 0) return textParts.join('\n')
  return [
    ...textParts.map((text) => ({ type: 'text' as const, text })),
    ...imageParts,
  ]
}

export function buildGeminiUserParts(
  userText: string,
  blocks: ReadonlyArray<ProviderRuntimeContentBlock> | undefined
): GeminiRuntimePart[] {
  const imageParts = collectGeminiImageParts(blocks)
  const textParts = collectRuntimeTextParts(userText, blocks)
  return [
    ...textParts.map((text) => ({ text })),
    ...imageParts,
  ]
}

export function hasProviderRuntimeImageBlock(
  blocks: ReadonlyArray<ProviderRuntimeContentBlock> | undefined
): boolean {
  if (!blocks) return false
  return blocks.some((block) =>
    isOpenAIResponsesImagePart(block) ||
    isAnthropicImageBlock(block) ||
    isGeminiImagePart(block) ||
    isOpenRouterImagePart(block)
  )
}

export function hasProviderRuntimeNonTextBlock(
  blocks: ReadonlyArray<ProviderRuntimeContentBlock> | undefined
): boolean {
  if (!blocks) return false
  return blocks.some((block) => {
    if (!block || typeof block !== 'object') return false
    const record = block as Record<string, unknown>
    const type = record.type
    if (type === 'text') return false
    return !(type === undefined && typeof record.text === 'string')
  })
}

export function sanitizeProviderRuntimeImageContentBlocks(
  provider: ProviderRuntimeImageProvider,
  raw: unknown
): Readonly<{ ok: true; blocks: ProviderRuntimeContentBlock[] } | { ok: false; message: string }> {
  if (raw === undefined || raw === null) return { ok: true, blocks: [] }
  if (!Array.isArray(raw)) {
    return { ok: false, message: 'Provider runtime content blocks must be an array.' }
  }

  const out: ProviderRuntimeContentBlock[] = []
  for (const item of raw.slice(0, MAX_RUNTIME_CONTENT_BLOCKS)) {
    const text = sanitizeTextBlock(item)
    if (text) {
      out.push(text)
      continue
    }

    const image = sanitizeImageBlock(provider, item)
    if (!image) {
      return { ok: false, message: 'Provider runtime image content block is invalid.' }
    }
    out.push(image)
  }

  return { ok: true, blocks: out }
}

function collectRuntimeTextParts(
  userText: string,
  blocks: ReadonlyArray<ProviderRuntimeContentBlock> | undefined
): string[] {
  const fromBlocks = (blocks ?? [])
    .map((block) => {
      if (!block || typeof block !== 'object') return ''
      const text = (block as Record<string, unknown>).text
      if (typeof text !== 'string') return ''
      const type = (block as Record<string, unknown>).type
      if (type !== undefined && type !== 'text') return ''
      return text.trim()
    })
    .filter((text) => text.length > 0)

  if (fromBlocks.length > 0) return fromBlocks
  const fallback = String(userText ?? '').trim()
  return fallback ? [fallback] : []
}

function collectOpenAIResponsesImageParts(
  blocks: ReadonlyArray<ProviderRuntimeContentBlock> | undefined
): OpenAIResponsesRuntimeContentPart[] {
  const out: OpenAIResponsesRuntimeContentPart[] = []
  for (const block of blocks ?? []) {
    if (isOpenAIResponsesImagePart(block)) {
      out.push({ type: 'input_image', image_url: block.image_url })
    }
  }
  return out
}

function collectAnthropicImageBlocks(
  blocks: ReadonlyArray<ProviderRuntimeContentBlock> | undefined
): AnthropicRuntimeContentBlock[] {
  const out: AnthropicRuntimeContentBlock[] = []
  for (const block of blocks ?? []) {
    if (isAnthropicBase64ImageBlock(block)) {
      out.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: block.source.media_type,
          data: block.source.data,
        },
      })
    } else if (isAnthropicUrlImageBlock(block)) {
      out.push({
        type: 'image',
        source: {
          type: 'url',
          url: block.source.url,
        },
      })
    }
  }
  return out
}

function collectGeminiImageParts(
  blocks: ReadonlyArray<ProviderRuntimeContentBlock> | undefined
): GeminiRuntimePart[] {
  const out: GeminiRuntimePart[] = []
  for (const block of blocks ?? []) {
    if (isGeminiInlineDataImagePart(block)) {
      out.push({
        inlineData: {
          mimeType: block.inlineData.mimeType,
          data: block.inlineData.data,
        },
      })
    } else if (isGeminiFileDataImagePart(block)) {
      out.push({
        fileData: {
          mimeType: block.fileData.mimeType,
          fileUri: block.fileData.fileUri,
        },
      })
    }
  }
  return out
}

function sanitizeTextBlock(item: unknown): ProviderRuntimeContentBlock | null {
  if (!item || typeof item !== 'object') return null
  const record = item as Record<string, unknown>
  const type = record.type
  const text = record.text
  if (type !== 'text' && type !== undefined) return null
  if (typeof text !== 'string') return null
  const trimmed = text.trim()
  if (!trimmed) return null
  return { type: 'text', text: trimmed.slice(0, MAX_RUNTIME_TEXT_CHARS) }
}

function sanitizeImageBlock(provider: ProviderRuntimeImageProvider, item: unknown): ProviderRuntimeContentBlock | null {
  switch (provider) {
    case 'openai_responses':
      return isOpenAIResponsesImagePart(item) ? { type: 'input_image', image_url: item.image_url } : null
    case 'anthropic_messages':
      if (isAnthropicBase64ImageBlock(item)) {
        return {
          type: 'image',
          source: {
            type: 'base64',
            media_type: item.source.media_type,
            data: item.source.data,
          },
        }
      }
      return isAnthropicUrlImageBlock(item)
        ? { type: 'image', source: { type: 'url', url: item.source.url } }
        : null
    case 'google_ai_studio':
      if (isGeminiInlineDataImagePart(item)) {
        return { inlineData: { mimeType: item.inlineData.mimeType, data: item.inlineData.data } }
      }
      return isGeminiFileDataImagePart(item)
        ? { fileData: { mimeType: item.fileData.mimeType, fileUri: item.fileData.fileUri } }
        : null
    case 'openrouter':
      return isOpenRouterImagePart(item)
        ? { type: 'image_url', image_url: { url: item.image_url.url } }
        : null
    case 'deepseek':
      if (isOpenAIResponsesImagePart(item)) return { type: 'input_image', image_url: item.image_url }
      if (isAnthropicBase64ImageBlock(item)) {
        return {
          type: 'image',
          source: { type: 'base64', media_type: item.source.media_type, data: item.source.data },
        }
      }
      if (isAnthropicUrlImageBlock(item)) return { type: 'image', source: { type: 'url', url: item.source.url } }
      if (isGeminiInlineDataImagePart(item)) {
        return { inlineData: { mimeType: item.inlineData.mimeType, data: item.inlineData.data } }
      }
      if (isGeminiFileDataImagePart(item)) {
        return { fileData: { mimeType: item.fileData.mimeType, fileUri: item.fileData.fileUri } }
      }
      return isOpenRouterImagePart(item) ? { type: 'image_url', image_url: { url: item.image_url.url } } : null
  }
}

function isOpenAIResponsesImagePart(item: unknown): item is Readonly<{ type: 'input_image'; image_url: string }> {
  if (!item || typeof item !== 'object') return false
  const record = item as Record<string, unknown>
  return record.type === 'input_image' && isSafeImageReference(record.image_url)
}

function isAnthropicImageBlock(item: unknown): item is Extract<AnthropicRuntimeContentBlock, { type: 'image' }> {
  return isAnthropicBase64ImageBlock(item) || isAnthropicUrlImageBlock(item)
}

function isAnthropicBase64ImageBlock(item: unknown): item is Readonly<{
  type: 'image'
  source: Readonly<{ type: 'base64'; media_type: string; data: string }>
}> {
  if (!item || typeof item !== 'object') return false
  const record = item as Record<string, unknown>
  const source = record.source as Record<string, unknown> | undefined
  return record.type === 'image' &&
    !!source &&
    source.type === 'base64' &&
    isImageMimeType(source.media_type) &&
    isNonEmptyString(source.data)
}

function isAnthropicUrlImageBlock(item: unknown): item is Readonly<{
  type: 'image'
  source: Readonly<{ type: 'url'; url: string }>
}> {
  if (!item || typeof item !== 'object') return false
  const record = item as Record<string, unknown>
  const source = record.source as Record<string, unknown> | undefined
  return record.type === 'image' &&
    !!source &&
    source.type === 'url' &&
    isSafeImageReference(source.url)
}

function isGeminiImagePart(item: unknown): item is Extract<GeminiRuntimePart, { inlineData: unknown } | { fileData: unknown }> {
  return isGeminiInlineDataImagePart(item) || isGeminiFileDataImagePart(item)
}

function isGeminiInlineDataImagePart(item: unknown): item is Readonly<{
  inlineData: Readonly<{ mimeType: string; data: string }>
}> {
  if (!item || typeof item !== 'object') return false
  const inlineData = (item as Record<string, unknown>).inlineData as Record<string, unknown> | undefined
  return !!inlineData && isImageMimeType(inlineData.mimeType) && isNonEmptyString(inlineData.data)
}

function isGeminiFileDataImagePart(item: unknown): item is Readonly<{
  fileData: Readonly<{ mimeType: string; fileUri: string }>
}> {
  if (!item || typeof item !== 'object') return false
  const fileData = (item as Record<string, unknown>).fileData as Record<string, unknown> | undefined
  return !!fileData && isImageMimeType(fileData.mimeType) && isSafeHttpUrl(fileData.fileUri)
}

function isOpenRouterImagePart(item: unknown): item is Readonly<{
  type: 'image_url'
  image_url: Readonly<{ url: string }>
}> {
  if (!item || typeof item !== 'object') return false
  const record = item as Record<string, unknown>
  const imageUrl = record.image_url as Record<string, unknown> | undefined
  return record.type === 'image_url' && !!imageUrl && isSafeImageReference(imageUrl.url)
}

function isImageMimeType(value: unknown): value is string {
  if (typeof value !== 'string') return false
  return /^image\/(?:png|jpeg|jpg)$/i.test(value.trim())
}

function isSafeImageReference(value: unknown): value is string {
  return isSafeHttpUrl(value) || isSafeImageDataUrl(value)
}

function isSafeHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
    return !parsed.username && !parsed.password
  } catch {
    return false
  }
}

function isSafeImageDataUrl(value: unknown): value is string {
  return typeof value === 'string' && IMAGE_DATA_URL_PREFIX.test(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}
