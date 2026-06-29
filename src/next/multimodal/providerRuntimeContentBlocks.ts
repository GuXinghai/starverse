export type ProviderRuntimeContentBlock = Readonly<{
  type?: string
  [key: string]: unknown
}>

export type OpenAIResponsesRuntimeContentPart =
  | Readonly<{ type: 'input_text'; text: string }>
  | Readonly<{ type: 'input_image'; image_url: string }>
  | Readonly<{
      type: 'input_file'
      filename?: string
      file_id?: string
      file_data?: string
      file_url?: string
    }>

export type AnthropicRuntimeContentBlock =
  | Readonly<{ type: 'text'; text: string }>
  | Readonly<{
      type: 'image'
      source:
        | Readonly<{ type: 'base64'; media_type: string; data: string }>
        | Readonly<{ type: 'url'; url: string }>
        | Readonly<{ type: 'file'; file_id: string }>
    }>
  | Readonly<{
      type: 'document'
      source:
        | Readonly<{ type: 'base64'; media_type: string; data: string }>
        | Readonly<{ type: 'url'; url: string }>
        | Readonly<{ type: 'file'; file_id: string }>
      title?: string
    }>

export type GeminiRuntimePart =
  | Readonly<{ text: string }>
  | Readonly<{ inlineData: Readonly<{ mimeType: string; data: string }> }>
  | Readonly<{ fileData: Readonly<{ mimeType: string; fileUri: string }> }>

export type OpenAICompatibleChatContentPart =
  | Readonly<{ type: 'text'; text: string }>
  | Readonly<{ type: 'image_url'; image_url: Readonly<{ url: string }> }>

export type ProviderRuntimeImageProvider =
  | 'openai_responses'
  | 'anthropic_messages'
  | 'google_ai_studio'
  | 'openrouter'
  | 'deepseek'
  | 'generic_openai_compatible'
  | 'local_endpoint'
  | 'lm_studio'
  | 'ollama_local'

export type ProviderRuntimeUploadRequestBlock = Readonly<{
  type: 'starverse_provider_file_upload'
  provider: 'openai_responses' | 'anthropic_messages' | 'google_ai_studio'
  assetId: string
  revisionId: string
  blobSha256: string
  mimeType: string
  sizeBytes: number
  kind: 'image' | 'pdf'
  filename: string
  dataBase64: string
}>

const MAX_RUNTIME_CONTENT_BLOCKS = 16
const MAX_RUNTIME_TEXT_CHARS = 20000
const MAX_RUNTIME_FILENAME_CHARS = 120
const MAX_RUNTIME_PDF_INLINE_BYTES = 1024 * 1024
const IMAGE_DATA_URL_PREFIX = /^data:image\/(?:png|jpeg|jpg);base64,/i
const PDF_DATA_URL_PREFIX = /^data:application\/pdf;base64,/i

export function buildOpenAIResponsesUserContent(
  userText: string,
  blocks: ReadonlyArray<ProviderRuntimeContentBlock> | undefined
): string | OpenAIResponsesRuntimeContentPart[] {
  const fileParts = collectOpenAIResponsesFileParts(blocks)
  const textParts = collectRuntimeTextParts(userText, blocks)
  if (fileParts.length === 0) return textParts.join('\n')
  return [
    ...textParts.map((text) => ({ type: 'input_text' as const, text })),
    ...fileParts,
  ]
}

export function buildAnthropicUserContent(
  userText: string,
  blocks: ReadonlyArray<ProviderRuntimeContentBlock> | undefined
): string | AnthropicRuntimeContentBlock[] {
  const fileParts = collectAnthropicFileBlocks(blocks)
  const textParts = collectRuntimeTextParts(userText, blocks)
  if (fileParts.length === 0) return textParts.join('\n')
  return [
    ...textParts.map((text) => ({ type: 'text' as const, text })),
    ...fileParts,
  ]
}

export function buildGeminiUserParts(
  userText: string,
  blocks: ReadonlyArray<ProviderRuntimeContentBlock> | undefined
): GeminiRuntimePart[] {
  const fileParts = collectGeminiFileParts(blocks)
  const textParts = collectRuntimeTextParts(userText, blocks)
  return [
    ...textParts.map((text) => ({ text })),
    ...fileParts,
  ]
}

export function buildOpenAICompatibleUserContent(
  userText: string,
  blocks: ReadonlyArray<ProviderRuntimeContentBlock> | undefined
): string | OpenAICompatibleChatContentPart[] {
  const imageParts = collectOpenAICompatibleImageParts(blocks)
  const textParts = collectRuntimeTextParts(userText, blocks)
  if (imageParts.length === 0) return textParts.join('\n')
  return [
    ...textParts.map((text) => ({ type: 'text' as const, text })),
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
    isOpenAICompatibleImagePart(block)
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

export function sanitizeProviderRuntimeFileContentBlocks(
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

    const file = sanitizeFileBlock(provider, item)
    if (!file) {
      return { ok: false, message: 'Provider runtime file content block is invalid.' }
    }
    out.push(file)
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

function collectOpenAIResponsesFileParts(
  blocks: ReadonlyArray<ProviderRuntimeContentBlock> | undefined
): OpenAIResponsesRuntimeContentPart[] {
  const out: OpenAIResponsesRuntimeContentPart[] = []
  for (const block of blocks ?? []) {
    if (isOpenAIResponsesImagePart(block)) {
      out.push({ type: 'input_image', image_url: block.image_url })
    } else if (isOpenAIResponsesFilePart(block)) {
      out.push({
        type: 'input_file',
        ...(block.filename ? { filename: block.filename } : {}),
        ...(block.file_id ? { file_id: block.file_id } : {}),
        ...(block.file_data ? { file_data: block.file_data } : {}),
        ...(block.file_url ? { file_url: block.file_url } : {}),
      })
    }
  }
  return out
}

function collectAnthropicFileBlocks(
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
    } else if (isAnthropicFileImageBlock(block)) {
      out.push({
        type: 'image',
        source: {
          type: 'file',
          file_id: block.source.file_id,
        },
      })
    } else if (isAnthropicBase64DocumentBlock(block)) {
      out.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: block.source.media_type,
          data: block.source.data,
        },
        ...(block.title ? { title: block.title } : {}),
      })
    } else if (isAnthropicUrlDocumentBlock(block)) {
      out.push({
        type: 'document',
        source: {
          type: 'url',
          url: block.source.url,
        },
        ...(block.title ? { title: block.title } : {}),
      })
    } else if (isAnthropicFileDocumentBlock(block)) {
      out.push({
        type: 'document',
        source: {
          type: 'file',
          file_id: block.source.file_id,
        },
        ...(block.title ? { title: block.title } : {}),
      })
    }
  }
  return out
}

function collectGeminiFileParts(
  blocks: ReadonlyArray<ProviderRuntimeContentBlock> | undefined
): GeminiRuntimePart[] {
  const out: GeminiRuntimePart[] = []
  for (const block of blocks ?? []) {
    if (isGeminiInlineDataFilePart(block)) {
      out.push({
        inlineData: {
          mimeType: block.inlineData.mimeType,
          data: block.inlineData.data,
        },
      })
    } else if (isGeminiFileDataFilePart(block)) {
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

function collectOpenAICompatibleImageParts(
  blocks: ReadonlyArray<ProviderRuntimeContentBlock> | undefined
): OpenAICompatibleChatContentPart[] {
  const out: OpenAICompatibleChatContentPart[] = []
  for (const block of blocks ?? []) {
    if (isOpenAICompatibleImagePart(block)) {
      out.push({ type: 'image_url', image_url: { url: block.image_url.url } })
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
        : isAnthropicFileImageBlock(item)
          ? { type: 'image', source: { type: 'file', file_id: item.source.file_id } }
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
    case 'generic_openai_compatible':
    case 'local_endpoint':
    case 'lm_studio':
    case 'ollama_local':
      return isOpenAICompatibleImagePart(item)
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

function sanitizeFileBlock(provider: ProviderRuntimeImageProvider, item: unknown): ProviderRuntimeContentBlock | null {
  const image = sanitizeImageBlock(provider, item)
  if (image) return image

  switch (provider) {
    case 'openai_responses':
      if (isProviderRuntimeUploadRequestBlock(item) && item.provider === 'openai_responses') return item
      return isOpenAIResponsesFilePart(item)
        ? {
            type: 'input_file',
            ...(item.filename ? { filename: item.filename } : {}),
            ...(item.file_id ? { file_id: item.file_id } : {}),
            ...(item.file_data ? { file_data: item.file_data } : {}),
            ...(item.file_url ? { file_url: item.file_url } : {}),
          }
        : null
    case 'anthropic_messages':
      if (isProviderRuntimeUploadRequestBlock(item) && item.provider === 'anthropic_messages') return item
      if (isAnthropicBase64DocumentBlock(item)) {
        return {
          type: 'document',
          source: {
            type: 'base64',
            media_type: item.source.media_type,
            data: item.source.data,
          },
          ...(item.title ? { title: item.title } : {}),
        }
      }
      return isAnthropicUrlDocumentBlock(item)
        ? { type: 'document', source: { type: 'url', url: item.source.url }, ...(item.title ? { title: item.title } : {}) }
        : isAnthropicFileDocumentBlock(item)
          ? { type: 'document', source: { type: 'file', file_id: item.source.file_id }, ...(item.title ? { title: item.title } : {}) }
        : null
    case 'google_ai_studio':
      if (isProviderRuntimeUploadRequestBlock(item) && item.provider === 'google_ai_studio') return item
      if (isGeminiInlineDataFilePart(item)) {
        return { inlineData: { mimeType: item.inlineData.mimeType, data: item.inlineData.data } }
      }
      return isGeminiFileDataFilePart(item)
        ? { fileData: { mimeType: item.fileData.mimeType, fileUri: item.fileData.fileUri } }
        : null
    case 'openrouter':
      return isOpenRouterFilePart(item)
        ? { type: 'file', file: { filename: item.file.filename, file_data: item.file.file_data } }
        : null
    case 'generic_openai_compatible':
    case 'local_endpoint':
    case 'lm_studio':
    case 'ollama_local':
      return null
    case 'deepseek':
      if (isOpenAIResponsesFilePart(item)) {
        return {
          type: 'input_file',
          filename: item.filename,
          ...(item.file_data ? { file_data: item.file_data } : {}),
          ...(item.file_url ? { file_url: item.file_url } : {}),
        }
      }
      if (isAnthropicBase64DocumentBlock(item)) {
        return {
          type: 'document',
          source: { type: 'base64', media_type: item.source.media_type, data: item.source.data },
          ...(item.title ? { title: item.title } : {}),
        }
      }
      if (isAnthropicUrlDocumentBlock(item)) {
        return { type: 'document', source: { type: 'url', url: item.source.url }, ...(item.title ? { title: item.title } : {}) }
      }
      if (isGeminiInlineDataFilePart(item)) {
        return { inlineData: { mimeType: item.inlineData.mimeType, data: item.inlineData.data } }
      }
      if (isGeminiFileDataFilePart(item)) {
        return { fileData: { mimeType: item.fileData.mimeType, fileUri: item.fileData.fileUri } }
      }
      return isOpenRouterFilePart(item)
        ? { type: 'file', file: { filename: item.file.filename, file_data: item.file.file_data } }
        : null
  }
}

function isOpenAIResponsesImagePart(item: unknown): item is Readonly<{ type: 'input_image'; image_url: string }> {
  if (!item || typeof item !== 'object') return false
  const record = item as Record<string, unknown>
  return record.type === 'input_image' && isSafeImageReference(record.image_url)
}

function isOpenAIResponsesFilePart(item: unknown): item is Readonly<{
  type: 'input_file'
  filename?: string
  file_id?: string
  file_data?: string
  file_url?: string
}> {
  if (!item || typeof item !== 'object') return false
  const record = item as Record<string, unknown>
  if (record.type !== 'input_file') return false
  const filename = sanitizeFilename(record.filename)
  const fileData = record.file_data
  const fileUrl = record.file_url
  const fileId = record.file_id
  if (typeof fileId === 'string' && isSafeProviderFileId(fileId)) {
    return record.filename === undefined && fileData === undefined && fileUrl === undefined
  }
  if (!filename) return false
  if (typeof fileData === 'string' && isSafePdfDataUrl(fileData)) {
    ;(record as { filename: string }).filename = filename
    return fileUrl === undefined
  }
  if (typeof fileUrl === 'string' && isSafePdfUrl(fileUrl)) {
    ;(record as { filename: string }).filename = filename
    return fileData === undefined
  }
  return false
}

function isAnthropicImageBlock(item: unknown): item is Extract<AnthropicRuntimeContentBlock, { type: 'image' }> {
  return isAnthropicBase64ImageBlock(item) || isAnthropicUrlImageBlock(item) || isAnthropicFileImageBlock(item)
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

function isAnthropicFileImageBlock(item: unknown): item is Readonly<{
  type: 'image'
  source: Readonly<{ type: 'file'; file_id: string }>
}> {
  if (!item || typeof item !== 'object') return false
  const record = item as Record<string, unknown>
  const source = record.source as Record<string, unknown> | undefined
  return record.type === 'image' &&
    !!source &&
    source.type === 'file' &&
    isSafeProviderFileId(source.file_id)
}

function isAnthropicBase64DocumentBlock(item: unknown): item is Readonly<{
  type: 'document'
  source: Readonly<{ type: 'base64'; media_type: string; data: string }>
  title?: string
}> {
  if (!item || typeof item !== 'object') return false
  const record = item as Record<string, unknown>
  const source = record.source as Record<string, unknown> | undefined
  const title = sanitizeFilename(record.title)
  if (record.title !== undefined) {
    if (!title) return false
    ;(record as { title: string }).title = title
  }
  return record.type === 'document' &&
    !!source &&
    source.type === 'base64' &&
    normalizeMimeType(source.media_type) === 'application/pdf' &&
    isSafePdfBase64Data(source.data)
}

function isAnthropicUrlDocumentBlock(item: unknown): item is Readonly<{
  type: 'document'
  source: Readonly<{ type: 'url'; url: string }>
  title?: string
}> {
  if (!item || typeof item !== 'object') return false
  const record = item as Record<string, unknown>
  const source = record.source as Record<string, unknown> | undefined
  const title = sanitizeFilename(record.title)
  if (record.title !== undefined) {
    if (!title) return false
    ;(record as { title: string }).title = title
  }
  return record.type === 'document' &&
    !!source &&
    source.type === 'url' &&
    isSafePdfUrl(source.url)
}

function isAnthropicFileDocumentBlock(item: unknown): item is Readonly<{
  type: 'document'
  source: Readonly<{ type: 'file'; file_id: string }>
  title?: string
}> {
  if (!item || typeof item !== 'object') return false
  const record = item as Record<string, unknown>
  const source = record.source as Record<string, unknown> | undefined
  const title = sanitizeFilename(record.title)
  if (record.title !== undefined) {
    if (!title) return false
    ;(record as { title: string }).title = title
  }
  return record.type === 'document' &&
    !!source &&
    source.type === 'file' &&
    isSafeProviderFileId(source.file_id)
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

function isGeminiInlineDataFilePart(item: unknown): item is Readonly<{
  inlineData: Readonly<{ mimeType: string; data: string }>
}> {
  if (!item || typeof item !== 'object') return false
  const inlineData = (item as Record<string, unknown>).inlineData as Record<string, unknown> | undefined
  if (!inlineData) return false
  const mimeType = normalizeMimeType(inlineData.mimeType)
  if (mimeType === 'application/pdf') return isSafePdfBase64Data(inlineData.data)
  return isImageMimeType(inlineData.mimeType) && isNonEmptyString(inlineData.data)
}

function isGeminiFileDataImagePart(item: unknown): item is Readonly<{
  fileData: Readonly<{ mimeType: string; fileUri: string }>
}> {
  if (!item || typeof item !== 'object') return false
  const fileData = (item as Record<string, unknown>).fileData as Record<string, unknown> | undefined
  return !!fileData && isImageMimeType(fileData.mimeType) && isSafeHttpUrl(fileData.fileUri)
}

function isGeminiFileDataFilePart(item: unknown): item is Readonly<{
  fileData: Readonly<{ mimeType: string; fileUri: string }>
}> {
  if (!item || typeof item !== 'object') return false
  const fileData = (item as Record<string, unknown>).fileData as Record<string, unknown> | undefined
  if (!fileData) return false
  const mimeType = normalizeMimeType(fileData.mimeType)
  if (mimeType === 'application/pdf') return isSafePdfUrl(fileData.fileUri)
  return isImageMimeType(fileData.mimeType) && isSafeHttpUrl(fileData.fileUri)
}

function isOpenRouterImagePart(item: unknown): item is Readonly<{
  type: 'image_url'
  image_url: Readonly<{ url: string }>
}> {
  return isOpenAICompatibleImagePart(item)
}

function isOpenAICompatibleImagePart(item: unknown): item is Readonly<{
  type: 'image_url'
  image_url: Readonly<{ url: string }>
}> {
  if (!item || typeof item !== 'object') return false
  const record = item as Record<string, unknown>
  const imageUrl = record.image_url as Record<string, unknown> | undefined
  return record.type === 'image_url' && !!imageUrl && isSafeImageReference(imageUrl.url)
}

function isOpenRouterFilePart(item: unknown): item is Readonly<{
  type: 'file'
  file: Readonly<{ filename: string; file_data: string }>
}> {
  if (!item || typeof item !== 'object') return false
  const record = item as Record<string, unknown>
  const file = record.file as Record<string, unknown> | undefined
  if (record.type !== 'file' || !file) return false
  const filename = sanitizeFilename(file.filename)
  if (!filename) return false
  const fileData = file.file_data
  if (!isSafePdfReference(fileData)) return false
  ;(file as { filename: string }).filename = filename
  return true
}

export function isProviderRuntimeUploadRequestBlock(item: unknown): item is ProviderRuntimeUploadRequestBlock {
  if (!item || typeof item !== 'object') return false
  const record = item as Record<string, unknown>
  const provider = String(record.provider ?? '')
  const kind = String(record.kind ?? '')
  const mimeType = normalizeMimeType(record.mimeType)
  const sizeBytes = Number(record.sizeBytes)
  return record.type === 'starverse_provider_file_upload' &&
    (provider === 'openai_responses' || provider === 'anthropic_messages' || provider === 'google_ai_studio') &&
    isNonEmptyString(record.assetId) &&
    isNonEmptyString(record.revisionId) &&
    isSafeSha256(record.blobSha256) &&
    (kind === 'image' || kind === 'pdf') &&
    (kind === 'image' ? isImageMimeType(mimeType) : mimeType === 'application/pdf') &&
    Number.isSafeInteger(sizeBytes) &&
    sizeBytes >= 0 &&
    !!sanitizeFilename(record.filename) &&
    isNonEmptyString(record.dataBase64) &&
    isBase64PayloadWithinBytes(record.dataBase64.trim(), Math.max(sizeBytes, 1))
}

function isImageMimeType(value: unknown): value is string {
  if (typeof value !== 'string') return false
  return /^image\/(?:png|jpeg|jpg)$/i.test(value.trim())
}

function isSafeProviderFileId(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._:/-]{1,255}$/.test(value.trim()) &&
    !/[?&#\\]/.test(value)
}

function isSafeSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value.trim())
}

function isSafeImageReference(value: unknown): value is string {
  return isSafeHttpUrl(value) || isSafeImageDataUrl(value)
}

function isSafePdfReference(value: unknown): value is string {
  return isSafePdfDataUrl(value) || isSafePdfUrl(value)
}

function isSafeHttpUrl(value: unknown, options?: Readonly<{ rejectQueryHash?: boolean }>): value is string {
  if (typeof value !== 'string') return false
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
    if (parsed.username || parsed.password) return false
    if (options?.rejectQueryHash && (parsed.search || parsed.hash)) return false
    return true
  } catch {
    return false
  }
}

function isSafeImageDataUrl(value: unknown): value is string {
  return typeof value === 'string' && IMAGE_DATA_URL_PREFIX.test(value)
}

function isSafePdfDataUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!PDF_DATA_URL_PREFIX.test(trimmed)) return false
  return isBase64PayloadWithinBytes(trimmed.replace(PDF_DATA_URL_PREFIX, ''), MAX_RUNTIME_PDF_INLINE_BYTES)
}

function isSafePdfBase64Data(value: unknown): value is string {
  return typeof value === 'string' &&
    isBase64PayloadWithinBytes(value.trim(), MAX_RUNTIME_PDF_INLINE_BYTES)
}

function isSafePdfUrl(value: unknown): value is string {
  return isSafeHttpUrl(value, { rejectQueryHash: true })
}

function normalizeMimeType(value: unknown): string | null {
  const normalized = String(value ?? '').split(';', 1)[0]?.trim().toLowerCase()
  return normalized || null
}

function sanitizeFilename(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .split(/[\\/]/)
    .pop()
    ?.replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_RUNTIME_FILENAME_CHARS)
  return normalized || null
}

function isBase64PayloadWithinBytes(value: string, maxBytes: number): boolean {
  if (!value) return false
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return false
  if (value.length % 4 === 1) return false
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  const estimatedBytes = Math.floor((value.length * 3) / 4) - padding
  return estimatedBytes >= 0 && estimatedBytes <= maxBytes
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}
