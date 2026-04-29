import type {
  AiPayloadKind,
  AssetKind,
  ProcessingStatus,
} from './fileTypes'

export type FileClassifyInput = Readonly<{
  filename?: string | null
  extension?: string | null
  mimeType?: string | null
}>

export type FileRule = Readonly<{
  assetKind: AssetKind
  aiPayloadKind: AiPayloadKind
  processingStatus: ProcessingStatus
  mvpNativeSupported: boolean
  futureConversionCandidate: boolean
  potentiallyPreviewable: boolean
}>

export type FileProfile = Readonly<{
  extension: string | null
  mimeType: string | null
  assetKind: AssetKind
  aiPayloadKind: AiPayloadKind
  processingStatus: ProcessingStatus
  mvpNativeSupported: boolean
  futureConversionCandidate: boolean
  potentiallyPreviewable: boolean
  hasConflictingSignals: boolean
}>

const BINARY_FALLBACK_RULE: FileRule = {
  assetKind: 'binary',
  aiPayloadKind: 'binary',
  processingStatus: 'unsupported',
  mvpNativeSupported: false,
  futureConversionCandidate: false,
  potentiallyPreviewable: false,
}

const CONFLICT_FALLBACK_RULE: FileRule = {
  assetKind: 'binary',
  aiPayloadKind: 'binary',
  processingStatus: 'local_only',
  mvpNativeSupported: false,
  futureConversionCandidate: false,
  potentiallyPreviewable: false,
}

export const FILE_EXTENSION_RULES = {
  png: nativeRule('image', 'image', true),
  jpg: nativeRule('image', 'image', true),
  jpeg: nativeRule('image', 'image', true),
  pdf: nativeRule('document', 'pdf', true),
  txt: nativeRule('text', 'text', true),
  md: nativeRule('text', 'text', true),
  html: convertibleRule('text', 'text', true),
  htm: convertibleRule('text', 'text', true),
  ps: convertibleRule('text', 'text', true),
  eps: convertibleRule('text', 'text', true),

  mp3: localOnlyRule('audio', 'audio', false),
  wav: localOnlyRule('audio', 'audio', false),
  m4a: localOnlyRule('audio', 'audio', false),
  flac: localOnlyRule('audio', 'audio', false),

  mp4: localOnlyRule('video', 'video', false),
  mov: localOnlyRule('video', 'video', false),
  webm: localOnlyRule('video', 'video', false),

  doc: convertibleRule('document', 'pdf', true),
  docx: convertibleRule('document', 'pdf', true),
  wps: convertibleRule('document', 'pdf', true),
  odt: convertibleRule('document', 'pdf', true),
  rtf: convertibleRule('document', 'pdf', true),
  xls: convertibleRule('document', 'pdf', true),
  xlsx: convertibleRule('document', 'pdf', true),
  csv: convertibleRule('text', 'text', true),
  ppt: convertibleRule('document', 'pdf', true),
  pptx: convertibleRule('document', 'pdf', true),

  zip: unsupportedRule('archive'),
  rar: unsupportedRule('archive'),
  '7z': unsupportedRule('archive'),
} as const satisfies Record<string, FileRule>

export const FILE_MIME_RULES = {
  'image/png': FILE_EXTENSION_RULES.png,
  'image/jpeg': FILE_EXTENSION_RULES.jpg,
  'application/pdf': FILE_EXTENSION_RULES.pdf,
  'text/plain': FILE_EXTENSION_RULES.txt,
  'text/markdown': FILE_EXTENSION_RULES.md,
  'text/x-markdown': FILE_EXTENSION_RULES.md,
  'text/html': FILE_EXTENSION_RULES.html,
  'application/postscript': FILE_EXTENSION_RULES.ps,
  'application/octet-stream': unsupportedRule('binary'),

  'audio/mpeg': FILE_EXTENSION_RULES.mp3,
  'audio/wav': FILE_EXTENSION_RULES.wav,
  'audio/x-wav': FILE_EXTENSION_RULES.wav,
  'audio/mp4': FILE_EXTENSION_RULES.m4a,
  'audio/flac': FILE_EXTENSION_RULES.flac,

  'video/mp4': FILE_EXTENSION_RULES.mp4,
  'video/quicktime': FILE_EXTENSION_RULES.mov,
  'video/webm': FILE_EXTENSION_RULES.webm,

  'application/msword': FILE_EXTENSION_RULES.doc,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': FILE_EXTENSION_RULES.docx,
  'application/vnd.ms-excel': FILE_EXTENSION_RULES.xls,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': FILE_EXTENSION_RULES.xlsx,
  'text/csv': FILE_EXTENSION_RULES.csv,
  'application/vnd.ms-powerpoint': FILE_EXTENSION_RULES.ppt,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': FILE_EXTENSION_RULES.pptx,
  'application/rtf': FILE_EXTENSION_RULES.rtf,

  'application/zip': FILE_EXTENSION_RULES.zip,
  'application/x-rar-compressed': FILE_EXTENSION_RULES.rar,
  'application/x-7z-compressed': FILE_EXTENSION_RULES['7z'],
} as const satisfies Record<string, FileRule>

export const MVP_NATIVE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'pdf', 'txt', 'md'])

/**
 * File rules are shared-domain policy. Do not move them into UI or provider adapters.
 * Upload success, asset kind, AI payload kind, and model capability are separate concerns.
 */
export function normalizeExtension(value: string | null | undefined): string | null {
  const raw = value?.trim()
  if (!raw) return null

  const withoutQuery = raw.split(/[?#]/, 1)[0] ?? ''
  const filename = withoutQuery.split(/[\\/]/).pop() ?? withoutQuery
  const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.') + 1) : filename
  const normalized = ext.trim().replace(/^\.+/, '').toLowerCase()

  return normalized || null
}

export function classifyAssetKind(input: FileClassifyInput): AssetKind {
  return resolveEffectiveRule(input).assetKind
}

export function classifyAiPayloadKind(input: FileClassifyInput): AiPayloadKind {
  return resolveEffectiveRule(input).aiPayloadKind
}

export function classifyProcessingStatus(input: FileClassifyInput): ProcessingStatus {
  return resolveEffectiveRule(input).processingStatus
}

export function isNativeSupportedForMvp(input: FileClassifyInput): boolean {
  return resolveEffectiveRule(input).mvpNativeSupported
}

export function isConvertibleCandidate(input: FileClassifyInput): boolean {
  return resolveEffectiveRule(input).futureConversionCandidate
}

export function isPotentiallyPreviewable(input: FileClassifyInput): boolean {
  return resolveEffectiveRule(input).potentiallyPreviewable
}

export function inferFileProfile(input: FileClassifyInput): FileProfile {
  const extension = normalizeInputExtension(input)
  const mimeType = normalizeMimeType(input.mimeType)
  const resolution = resolveRule(input)

  return {
    extension,
    mimeType,
    assetKind: resolution.effectiveRule.assetKind,
    aiPayloadKind: resolution.effectiveRule.aiPayloadKind,
    processingStatus: resolution.effectiveRule.processingStatus,
    mvpNativeSupported: resolution.effectiveRule.mvpNativeSupported,
    futureConversionCandidate: resolution.effectiveRule.futureConversionCandidate,
    potentiallyPreviewable: resolution.effectiveRule.potentiallyPreviewable,
    hasConflictingSignals: resolution.hasConflictingSignals,
  }
}

function nativeRule(assetKind: AssetKind, aiPayloadKind: AiPayloadKind, previewable: boolean): FileRule {
  return {
    assetKind,
    aiPayloadKind,
    processingStatus: 'native_supported',
    mvpNativeSupported: true,
    futureConversionCandidate: false,
    potentiallyPreviewable: previewable,
  }
}

function convertibleRule(assetKind: AssetKind, aiPayloadKind: AiPayloadKind, previewable: boolean): FileRule {
  return {
    assetKind,
    aiPayloadKind,
    processingStatus: 'convertible',
    mvpNativeSupported: false,
    futureConversionCandidate: true,
    potentiallyPreviewable: previewable,
  }
}

function localOnlyRule(assetKind: AssetKind, aiPayloadKind: AiPayloadKind, previewable: boolean): FileRule {
  return {
    assetKind,
    aiPayloadKind,
    processingStatus: 'local_only',
    mvpNativeSupported: false,
    futureConversionCandidate: false,
    potentiallyPreviewable: previewable,
  }
}

function unsupportedRule(assetKind: AssetKind): FileRule {
  return {
    assetKind,
    aiPayloadKind: 'binary',
    processingStatus: 'unsupported',
    mvpNativeSupported: false,
    futureConversionCandidate: false,
    potentiallyPreviewable: false,
  }
}

function normalizeInputExtension(input: FileClassifyInput): string | null {
  return normalizeExtension(input.extension) ?? normalizeExtension(input.filename)
}

function normalizeMimeType(value: string | null | undefined): string | null {
  const raw = value?.split(';', 1)[0]?.trim().toLowerCase()
  return raw || null
}

function ruleFromExtension(extension: string | null): FileRule | null {
  if (!extension) return null
  return FILE_EXTENSION_RULES[extension as keyof typeof FILE_EXTENSION_RULES] ?? null
}

function ruleFromMimeType(mimeType: string | null): FileRule | null {
  if (!mimeType) return null
  return FILE_MIME_RULES[mimeType as keyof typeof FILE_MIME_RULES] ?? null
}

function areRulesCompatible(left: FileRule, right: FileRule): boolean {
  return left.assetKind === right.assetKind && left.aiPayloadKind === right.aiPayloadKind
}

function resolveEffectiveRule(input: FileClassifyInput): FileRule {
  return resolveRule(input).effectiveRule
}

function resolveRule(input: FileClassifyInput): Readonly<{
  effectiveRule: FileRule
  hasConflictingSignals: boolean
}> {
  const extensionRule = ruleFromExtension(normalizeInputExtension(input))
  const mimeRule = ruleFromMimeType(normalizeMimeType(input.mimeType))

  if (extensionRule && mimeRule && !areRulesCompatible(extensionRule, mimeRule)) {
    return {
      effectiveRule: CONFLICT_FALLBACK_RULE,
      hasConflictingSignals: true,
    }
  }

  return {
    effectiveRule: mimeRule ?? extensionRule ?? BINARY_FALLBACK_RULE,
    hasConflictingSignals: false,
  }
}
