export type ImageGenerationOutputMode = 'auto' | 'image_only' | 'image_and_text'
export type ImageGenerationImageSize = '1K' | '2K' | '4K'

export type ImageGenerationUserConfig = Readonly<{
  enabled: boolean
  outputMode: ImageGenerationOutputMode
  aspectRatio: string
  imageSize: ImageGenerationImageSize | ''
  advancedJson: string
}>

export type ConvoImageGenerationMode = 'default' | 'custom'
export type ProjectImageGenerationDefaultMode = 'follow_parent' | 'custom'

export const CONVO_IMAGE_GENERATION_MODE_META_KEY = 'imageGenerationMode'
export const CONVO_IMAGE_GENERATION_CUSTOM_META_KEY = 'imageGenerationCustom'
export const PROJECT_IMAGE_GENERATION_DEFAULT_MODE_META_KEY = 'imageGenerationDefaultMode'
export const PROJECT_IMAGE_GENERATION_DEFAULT_CUSTOM_META_KEY = 'imageGenerationDefaultCustom'

export const DEFAULT_IMAGE_GENERATION_USER_CONFIG: ImageGenerationUserConfig = {
  enabled: false,
  outputMode: 'auto',
  aspectRatio: '',
  imageSize: '',
  advancedJson: '',
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export function normalizeImageGenerationUserConfig(value: unknown): ImageGenerationUserConfig {
  const raw = asRecord(value)
  if (!raw) return DEFAULT_IMAGE_GENERATION_USER_CONFIG
  const outputMode: ImageGenerationOutputMode =
    raw.outputMode === 'image_only' || raw.outputMode === 'image_and_text' || raw.outputMode === 'auto'
      ? raw.outputMode
      : 'auto'
  const normalizedImageSizeRaw = String(raw.imageSize ?? '').trim()
  const imageSize: ImageGenerationImageSize | '' =
    normalizedImageSizeRaw === '1K' || normalizedImageSizeRaw === '2K' || normalizedImageSizeRaw === '4K'
      ? normalizedImageSizeRaw
      : ''
  return {
    enabled: raw.enabled === true,
    outputMode,
    aspectRatio: String(raw.aspectRatio ?? '').trim(),
    imageSize,
    advancedJson: typeof raw.advancedJson === 'string' ? raw.advancedJson : '',
  }
}

export function extractConvoImageGenerationMode(meta: unknown): ConvoImageGenerationMode {
  const root = asRecord(meta)
  if (!root) return 'default'
  return root[CONVO_IMAGE_GENERATION_MODE_META_KEY] === 'custom' ? 'custom' : 'default'
}

export function extractConvoImageGenerationCustom(meta: unknown): ImageGenerationUserConfig | null {
  const root = asRecord(meta)
  if (!root) return null
  const raw = root[CONVO_IMAGE_GENERATION_CUSTOM_META_KEY]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  return normalizeImageGenerationUserConfig(raw)
}

export function mergeConvoImageGenerationMeta(
  meta: unknown,
  input: Readonly<{ mode: ConvoImageGenerationMode; custom: ImageGenerationUserConfig | null }>
): Record<string, unknown> | null {
  const root = asRecord(meta)
  const next: Record<string, unknown> = root ? { ...root } : {}
  if (input.mode === 'default') {
    delete next[CONVO_IMAGE_GENERATION_MODE_META_KEY]
    delete next[CONVO_IMAGE_GENERATION_CUSTOM_META_KEY]
  } else {
    next[CONVO_IMAGE_GENERATION_MODE_META_KEY] = 'custom'
    next[CONVO_IMAGE_GENERATION_CUSTOM_META_KEY] = normalizeImageGenerationUserConfig(input.custom)
  }
  return Object.keys(next).length > 0 ? next : null
}

export function extractProjectImageGenerationDefaultMode(meta: unknown): ProjectImageGenerationDefaultMode {
  const root = asRecord(meta)
  if (!root) return 'follow_parent'
  return root[PROJECT_IMAGE_GENERATION_DEFAULT_MODE_META_KEY] === 'custom' ? 'custom' : 'follow_parent'
}

export function extractProjectImageGenerationDefaultCustom(meta: unknown): ImageGenerationUserConfig | null {
  const root = asRecord(meta)
  if (!root) return null
  const raw = root[PROJECT_IMAGE_GENERATION_DEFAULT_CUSTOM_META_KEY]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  return normalizeImageGenerationUserConfig(raw)
}

export function mergeProjectImageGenerationDefaultMeta(
  meta: unknown,
  input: Readonly<{ mode: ProjectImageGenerationDefaultMode; custom: ImageGenerationUserConfig | null }>
): Record<string, unknown> | null {
  const root = asRecord(meta)
  const next: Record<string, unknown> = root ? { ...root } : {}
  if (input.mode === 'follow_parent') {
    delete next[PROJECT_IMAGE_GENERATION_DEFAULT_MODE_META_KEY]
    delete next[PROJECT_IMAGE_GENERATION_DEFAULT_CUSTOM_META_KEY]
  } else {
    next[PROJECT_IMAGE_GENERATION_DEFAULT_MODE_META_KEY] = 'custom'
    next[PROJECT_IMAGE_GENERATION_DEFAULT_CUSTOM_META_KEY] = normalizeImageGenerationUserConfig(input.custom)
  }
  return Object.keys(next).length > 0 ? next : null
}

export function resolveEffectiveImageGenerationConfig(input: Readonly<{
  convoMeta?: unknown
  projectMeta?: unknown
  globalDefault?: unknown
}>): Readonly<{
  mode: ConvoImageGenerationMode
  effective: ImageGenerationUserConfig
  source: 'convo_custom' | 'project_default' | 'global_default'
}> {
  const mode = extractConvoImageGenerationMode(input.convoMeta)
  const globalDefault = normalizeImageGenerationUserConfig(input.globalDefault)
  if (mode === 'custom') {
    const custom = extractConvoImageGenerationCustom(input.convoMeta)
    return {
      mode,
      effective: custom ?? globalDefault,
      source: 'convo_custom',
    }
  }

  const projectMode = extractProjectImageGenerationDefaultMode(input.projectMeta)
  if (projectMode === 'custom') {
    const projectDefault = extractProjectImageGenerationDefaultCustom(input.projectMeta)
    if (projectDefault) {
      return {
        mode,
        effective: projectDefault,
        source: 'project_default',
      }
    }
  }

  return {
    mode,
    effective: globalDefault,
    source: 'global_default',
  }
}
