import { readFile } from 'node:fs/promises'
import type { FileAssetRecord } from '../../../infra/db/types'
import type { SendMode } from '../../shared/files/fileTypes'
import {
  resolveManagedStoragePath,
  type ManagedStorageResolution,
} from '../../shared/files/localStorageResolver'
import type { SendPlan, SendPlanAttachment } from '../../shared/files/sendPlanTypes'
import type {
  OpenRouterAdditionalPlugin,
  OpenRouterFileParserEngine,
} from './buildRequest'

export type OpenRouterTextContentPart = Readonly<{
  type: 'text'
  text: string
}>

export type OpenRouterImageContentPart = Readonly<{
  type: 'image_url'
  image_url: Readonly<{
    url: string
  }>
}>

export type OpenRouterPdfContentPart = Readonly<{
  type: 'file'
  file: Readonly<{
    filename: string
    file_data: string
  }>
}>

export type OpenRouterAudioContentPart = Readonly<{
  type: 'input_audio'
  input_audio: Readonly<{
    data: string
    format: string
  }>
}>

export type OpenRouterVideoContentPart = Readonly<{
  type: 'video_url'
  video_url: Readonly<{
    url: string
  }>
}>

export type OpenRouterContentPart =
  | OpenRouterTextContentPart
  | OpenRouterImageContentPart
  | OpenRouterPdfContentPart
  | OpenRouterAudioContentPart
  | OpenRouterVideoContentPart

export type OpenRouterAttachmentErrorCode =
  | 'send_plan_blocked'
  | 'attachment_not_included'
  | 'attachment_serialization_failed'
  | 'attachment_asset_missing'
  | 'attachment_local_file_missing'
  | 'attachment_local_file_read_failed'
  | 'attachment_base64_encode_failed'
  | 'attachment_url_missing'
  | 'attachment_url_not_allowed_by_plan'
  | 'attachment_send_mode_unsupported'
  | 'attachment_storage_uri_invalid'
  | 'attachment_local_path_outside_storage_root'
  | 'audio_url_not_supported'
  | 'video_url_provider_not_allowed'
  | 'pdf_file_parser_config_invalid'
  | 'openrouter_multimodal_request_failed'
  | 'openrouter_modality_rejected'

export type OpenRouterAttachmentErrorShape = Readonly<{
  code: OpenRouterAttachmentErrorCode
  message: string
  assetId: string | null
  attachmentId: string | null
  messageId: string | null
  selectedSendMode: SendMode | null
  aiPayloadKind: string | null
  cause?: unknown
}>

export class OpenRouterAttachmentSerializationError extends Error {
  readonly details: OpenRouterAttachmentErrorShape

  constructor(details: OpenRouterAttachmentErrorShape) {
    super(details.message)
    this.name = 'OpenRouterAttachmentSerializationError'
    this.details = details
  }
}

export type OpenRouterPdfFileParserConfig = Readonly<{
  enabled?: boolean
  engine?: OpenRouterFileParserEngine
}>

export type OpenRouterAttachmentDiagnostics = Readonly<{
  assetId: string
  attachmentId: string
  source: SendPlanAttachment['source']
  aiPayloadKind: SendPlanAttachment['aiPayloadKind']
  selectedSendMode: SendMode
  finalSendMode: SendMode
  fallbackApplied: boolean
  contentType: OpenRouterContentPart['type']
}>

export type OpenRouterExcludedAttachmentDiagnostic = Readonly<{
  assetId: string
  attachmentId: string
  source: SendPlanAttachment['source']
  exclusionReason: string
}>

export type OpenRouterSendPlanDiagnostics = Readonly<{
  sendPlanStatus: SendPlan['status']
  includedAttachmentCount: number
  excludedAttachmentCount: number
  includedAttachments: OpenRouterAttachmentDiagnostics[]
  excludedAttachments: OpenRouterExcludedAttachmentDiagnostic[]
  injectedPlugins: string[]
  attachmentErrors: OpenRouterAttachmentErrorShape[]
  containsMultimodalParts: boolean
}>

export type SerializeSendPlanForOpenRouterInput = Readonly<{
  sendPlan: SendPlan
  userText: string
  assetsById: Readonly<Record<string, FileAssetRecord | undefined>> | ReadonlyMap<string, FileAssetRecord>
  storageRootDir: string
  pdfFileParser?: OpenRouterPdfFileParserConfig | null
  providerContext?: Readonly<{
    allowVideoUrlRef?: boolean
  }>
  readFileBytes?: (filePath: string) => Promise<Uint8Array>
}>

export type SerializeSendPlanForOpenRouterResult = Readonly<{
  contentParts: OpenRouterContentPart[]
  additionalPlugins: OpenRouterAdditionalPlugin[]
  diagnostics: OpenRouterSendPlanDiagnostics
}>

type ResolvedPayloadSource = Readonly<
  | {
      kind: 'url'
      url: string
    }
  | {
      kind: 'bytes'
      bytes: Uint8Array
      mime: string
      filename: string
      extension: string | null
    }
>

type SerializeContext = Readonly<{
  storageRootDir: string
  assetsById: Readonly<Record<string, FileAssetRecord | undefined>> | ReadonlyMap<string, FileAssetRecord>
  providerContext: Readonly<{
    allowVideoUrlRef: boolean
  }>
  readFileBytes: (filePath: string) => Promise<Uint8Array>
}>

export async function serializeSendPlanForOpenRouter(
  input: SerializeSendPlanForOpenRouterInput
): Promise<SerializeSendPlanForOpenRouterResult> {
  if (input.sendPlan.status === 'blocked') {
    throw mapOpenRouterAttachmentError('send_plan_blocked', null, {
      message: 'Send plan is blocked and cannot be serialized for OpenRouter.',
    })
  }

  const context: SerializeContext = {
    storageRootDir: requireNonEmpty(input.storageRootDir, 'storageRootDir'),
    assetsById: input.assetsById,
    providerContext: {
      allowVideoUrlRef: input.providerContext?.allowVideoUrlRef !== false,
    },
    readFileBytes: input.readFileBytes ?? defaultReadFileBytes,
  }

  const contentParts: OpenRouterContentPart[] = []
  const diagnostics: OpenRouterAttachmentDiagnostics[] = []
  const excludedDiagnostics = input.sendPlan.excludedAttachments.map((attachment) => ({
    assetId: attachment.assetId,
    attachmentId: attachment.attachmentId,
    source: attachment.source,
    exclusionReason: attachment.exclusionReason,
  }))
  const attachmentErrors: OpenRouterAttachmentErrorShape[] = []

  const trimmedUserText = input.userText.trim()
  if (trimmedUserText.length > 0) {
    contentParts.push({
      type: 'text',
      text: trimmedUserText,
    })
  }

  const includedPlans = input.sendPlan.attachmentPlans.filter(
    (plan) => plan.eligibility === 'included' || plan.eligibility === 'warning'
  )

  for (const plan of includedPlans) {
    try {
      const serialized = await mapAttachmentPlanToOpenRouterPart(plan, context)
      contentParts.push(...serialized.parts)
      diagnostics.push(serialized.diagnostic)
    } catch (error) {
      const mapped = error instanceof OpenRouterAttachmentSerializationError
        ? error
        : mapOpenRouterAttachmentError('attachment_serialization_failed', plan, {
            message: `Attachment ${plan.assetId} could not be serialized for OpenRouter.`,
            cause: error,
          })
      attachmentErrors.push(mapped.details)
      throw mapped
    }
  }

  const additionalPlugins = resolvePdfFileParserPlugins(input.sendPlan, input.pdfFileParser)
  const containsMultimodalParts = contentParts.some((part) => part.type !== 'text')

  return {
    contentParts,
    additionalPlugins,
    diagnostics: {
      sendPlanStatus: input.sendPlan.status,
      includedAttachmentCount: diagnostics.length,
      excludedAttachmentCount: excludedDiagnostics.length,
      includedAttachments: diagnostics,
      excludedAttachments: excludedDiagnostics,
      injectedPlugins: additionalPlugins.map((plugin) => plugin.id),
      attachmentErrors,
      containsMultimodalParts,
    },
  }
}

export async function mapAttachmentPlanToOpenRouterPart(
  attachmentPlan: SendPlanAttachment,
  context: SerializeContext
): Promise<Readonly<{
  parts: OpenRouterContentPart[]
  diagnostic: OpenRouterAttachmentDiagnostics
}>> {
  if (attachmentPlan.eligibility !== 'included' && attachmentPlan.eligibility !== 'warning') {
    throw mapOpenRouterAttachmentError('attachment_not_included', attachmentPlan, {
      message: `Attachment ${attachmentPlan.assetId} is not included in the send plan.`,
    })
  }
  if (!attachmentPlan.selectedSendMode) {
    throw mapOpenRouterAttachmentError('attachment_send_mode_unsupported', attachmentPlan, {
      message: `Attachment ${attachmentPlan.assetId} has no selected send mode.`,
    })
  }

  const modesToTry = [attachmentPlan.selectedSendMode, ...attachmentPlan.fallbackSendModes]
  let lastError: unknown = null
  for (let index = 0; index < modesToTry.length; index += 1) {
    const sendMode = modesToTry[index]
    try {
      const parts = await buildPartForMode(attachmentPlan, sendMode, context)
      const contentType = parts[0]?.type ?? 'text'
      return {
        parts,
        diagnostic: {
          assetId: attachmentPlan.assetId,
          attachmentId: attachmentPlan.attachmentId,
          source: attachmentPlan.source,
          aiPayloadKind: attachmentPlan.aiPayloadKind,
          selectedSendMode: attachmentPlan.selectedSendMode,
          finalSendMode: sendMode,
          fallbackApplied: index > 0,
          contentType,
        },
      }
    } catch (error) {
      lastError = error
      if (index === 0) continue
    }
  }

  throw lastError instanceof Error
    ? lastError
    : mapOpenRouterAttachmentError('attachment_serialization_failed', attachmentPlan, {
        message: `Attachment ${attachmentPlan.assetId} could not be serialized for OpenRouter.`,
        cause: lastError,
      })
}

export async function buildImageContentPart(
  attachmentPlan: SendPlanAttachment,
  sendMode: SendMode,
  context: SerializeContext
): Promise<ReadonlyArray<OpenRouterImageContentPart>> {
  const source = await resolveAttachmentPayloadSource(attachmentPlan, sendMode, context)
  if (source.kind === 'url') {
    return [{ type: 'image_url', image_url: { url: source.url } }]
  }
  const dataUrl = dataUrlFromBytes(source.bytes, source.mime)
  return [{ type: 'image_url', image_url: { url: dataUrl } }]
}

export async function buildPdfContentPart(
  attachmentPlan: SendPlanAttachment,
  sendMode: SendMode,
  context: SerializeContext
): Promise<ReadonlyArray<OpenRouterPdfContentPart>> {
  const asset = getAssetOrThrow(attachmentPlan, context.assetsById)
  const source = await resolveAttachmentPayloadSource(attachmentPlan, sendMode, context)
  if (source.kind === 'url') {
    return [{
      type: 'file',
      file: {
        filename: sanitizePromptEnvelopeMetadataText(asset.filename),
        file_data: source.url,
      },
    }]
  }
  return [{
    type: 'file',
    file: {
      filename: sanitizePromptEnvelopeMetadataText(asset.filename),
      file_data: dataUrlFromBytes(source.bytes, source.mime),
    },
  }]
}

export async function buildAudioContentPart(
  attachmentPlan: SendPlanAttachment,
  sendMode: SendMode,
  context: SerializeContext
): Promise<ReadonlyArray<OpenRouterAudioContentPart>> {
  if (sendMode === 'url_ref') {
    throw mapOpenRouterAttachmentError('audio_url_not_supported', attachmentPlan, {
      message: `Attachment ${attachmentPlan.assetId} cannot be sent as audio URL on OpenRouter.`,
      selectedSendMode: sendMode,
    })
  }
  const source = await resolveAttachmentPayloadSource(attachmentPlan, sendMode, context)
  if (source.kind === 'url') {
    throw mapOpenRouterAttachmentError('audio_url_not_supported', attachmentPlan, {
      message: `Attachment ${attachmentPlan.assetId} cannot be sent as audio URL on OpenRouter.`,
      selectedSendMode: sendMode,
    })
  }
  return [{
    type: 'input_audio',
    input_audio: {
      data: encodeBase64(source.bytes),
      format: audioFormatFromAsset(getAssetOrThrow(attachmentPlan, context.assetsById)),
    },
  }]
}

export async function buildVideoContentPart(
  attachmentPlan: SendPlanAttachment,
  sendMode: SendMode,
  context: SerializeContext
): Promise<ReadonlyArray<OpenRouterVideoContentPart>> {
  if (sendMode === 'url_ref' && !context.providerContext.allowVideoUrlRef) {
    throw mapOpenRouterAttachmentError('video_url_provider_not_allowed', attachmentPlan, {
      message: `Attachment ${attachmentPlan.assetId} cannot use video URL mode in the current OpenRouter provider context.`,
      selectedSendMode: sendMode,
    })
  }

  const source = await resolveAttachmentPayloadSource(attachmentPlan, sendMode, context)
  if (source.kind === 'url') {
    return [{ type: 'video_url', video_url: { url: source.url } }]
  }
  return [{ type: 'video_url', video_url: { url: dataUrlFromBytes(source.bytes, source.mime) } }]
}

export async function buildTextAttachmentContentPart(
  attachmentPlan: SendPlanAttachment,
  sendMode: SendMode,
  context: SerializeContext
): Promise<ReadonlyArray<OpenRouterTextContentPart>> {
  const asset = getAssetOrThrow(attachmentPlan, context.assetsById)
  if (canUseConvertedTextPayload(attachmentPlan)) {
    const converted = await readConvertedTextPayload(asset, context)
    if (converted) {
      const safeFilename = sanitizePromptEnvelopeMetadataText(asset.filename)
      return [{
        type: 'text',
        text: `[Attached text file: ${safeFilename}]\n${converted}`,
      }]
    }
  }
  const source = await resolveAttachmentPayloadSource(attachmentPlan, sendMode, context)
  if (source.kind === 'url') {
    const safeFilename = sanitizePromptEnvelopeMetadataText(asset.filename)
    const safeUrl = sanitizePromptEnvelopeMetadataText(source.url)
    return [{
      type: 'text',
      text: `[Attached text file: ${safeFilename}]\nURL: ${safeUrl}`,
    }]
  }

  const safeFilename = sanitizePromptEnvelopeMetadataText(asset.filename)
  return [{
    type: 'text',
    text: `[Attached text file: ${safeFilename}]\n${decodeTextBytes(source.bytes)}`,
  }]
}

export async function resolveAttachmentPayloadSource(
  attachmentPlan: SendPlanAttachment,
  sendMode: SendMode,
  context: SerializeContext
): Promise<ResolvedPayloadSource> {
  if (sendMode !== attachmentPlan.selectedSendMode && !attachmentPlan.fallbackSendModes.includes(sendMode)) {
    throw mapOpenRouterAttachmentError('attachment_url_not_allowed_by_plan', attachmentPlan, {
      message: `Attachment ${attachmentPlan.assetId} does not allow send mode ${sendMode}.`,
      selectedSendMode: sendMode,
    })
  }
  if (sendMode === 'provider_file_ref') {
    throw mapOpenRouterAttachmentError('attachment_send_mode_unsupported', attachmentPlan, {
      message: `Attachment ${attachmentPlan.assetId} cannot use provider_file_ref on OpenRouter in phase 6.`,
      selectedSendMode: sendMode,
    })
  }

  const asset = getAssetOrThrow(attachmentPlan, context.assetsById)
  if (sendMode === 'url_ref') {
    const url = resolveUrlReference(asset)
    if (!url) {
      throw mapOpenRouterAttachmentError('attachment_url_missing', attachmentPlan, {
        message: `Attachment ${attachmentPlan.assetId} has no retained URL for send mode url_ref.`,
        selectedSendMode: sendMode,
      })
    }
    return { kind: 'url', url }
  }

  if (sendMode !== 'inline_base64') {
    throw mapOpenRouterAttachmentError('attachment_send_mode_unsupported', attachmentPlan, {
      message: `Attachment ${attachmentPlan.assetId} has unsupported send mode ${sendMode}.`,
      selectedSendMode: sendMode,
    })
  }

  const localPath = resolveLocalStoragePath(context.storageRootDir, asset)
  if (localPath.kind === 'missing') {
    const convertedPath = resolveConvertedTextStoragePath(context.storageRootDir, asset)
    if (canUseConvertedTextPayload(attachmentPlan) && convertedPath?.kind === 'ok') {
      const bytes = await context.readFileBytes(convertedPath.path)
      return {
        kind: 'bytes',
        bytes,
        mime: convertedPath.mime ?? 'text/plain',
        filename: asset.filename,
        extension: asset.extension,
      }
    }
    throw mapOpenRouterAttachmentError('attachment_local_file_missing', attachmentPlan, {
      message: `Attachment ${attachmentPlan.assetId} has no readable local file copy.`,
      selectedSendMode: sendMode,
    })
  }
  if (localPath.kind === 'invalid') {
    throw mapOpenRouterAttachmentError(localPath.code, attachmentPlan, {
      message: localPath.message,
      selectedSendMode: sendMode,
    })
  }

  let bytes: Uint8Array
  try {
    bytes = await context.readFileBytes(localPath.path)
  } catch (error) {
    const maybe = error as NodeJS.ErrnoException
    throw mapOpenRouterAttachmentError(
      maybe?.code === 'ENOENT' ? 'attachment_local_file_missing' : 'attachment_local_file_read_failed',
      attachmentPlan,
      {
        message:
          maybe?.code === 'ENOENT'
            ? `Attachment ${attachmentPlan.assetId} local file copy is missing.`
            : `Attachment ${attachmentPlan.assetId} local file copy could not be read.`,
        selectedSendMode: sendMode,
        cause: error,
      }
    )
  }

  return {
    kind: 'bytes',
    bytes,
    mime: normalizeMime(asset.mime) ?? mimeFromExtension(asset.extension) ?? 'application/octet-stream',
    filename: asset.filename,
    extension: asset.extension,
  }
}

function canUseConvertedTextPayload(attachmentPlan: SendPlanAttachment): boolean {
  return attachmentPlan.aiPayloadKind === 'text'
    && attachmentPlan.semantic.targetKind !== 'original_file'
}

async function readConvertedTextPayload(
  asset: FileAssetRecord,
  context: SerializeContext
): Promise<string | null> {
  const converted = resolveConvertedTextStoragePath(context.storageRootDir, asset)
  if (!converted || converted.kind !== 'ok') return null
  const bytes = await context.readFileBytes(converted.path)
  return decodeTextBytes(bytes)
}

function resolveConvertedTextStoragePath(
  storageRootDir: string,
  asset: FileAssetRecord
): (ManagedStorageResolution & Readonly<{ mime: string | null }>) | null {
  const meta = asset.sourceMetaJson && typeof asset.sourceMetaJson === 'object'
    ? asset.sourceMetaJson as Record<string, unknown>
    : null
  const lineage = meta?.lineage && typeof meta.lineage === 'object'
    ? meta.lineage as Record<string, unknown>
    : null
  const conversion = meta?.textConversion && typeof meta.textConversion === 'object'
    ? meta.textConversion as Record<string, unknown>
    : null
  const sendReady = lineage?.sendAssetReady === true
  const uri = typeof lineage?.sendTextStorageUri === 'string' && lineage.sendTextStorageUri.trim().length > 0
    ? lineage.sendTextStorageUri.trim()
    : typeof conversion?.storageUri === 'string' && conversion.storageUri.trim().length > 0
      ? conversion.storageUri.trim()
      : null
  if (!sendReady || !uri) return null
  const mime = typeof conversion?.mime === 'string' && conversion.mime.trim().length > 0
    ? conversion.mime.trim().toLowerCase()
    : null
  return {
    ...resolveManagedStoragePath(storageRootDir, uri, {
      backend: 'local_fs',
      deletedAt: null,
    }),
    mime,
  }
}

export function mapOpenRouterAttachmentError(
  code: OpenRouterAttachmentErrorCode,
  attachmentPlan: SendPlanAttachment | null,
  overrides: Readonly<{
    message: string
    selectedSendMode?: SendMode | null
    cause?: unknown
  }>
): OpenRouterAttachmentSerializationError {
  return new OpenRouterAttachmentSerializationError({
    code,
    message: overrides.message,
    assetId: attachmentPlan?.assetId ?? null,
    attachmentId: attachmentPlan?.attachmentId ?? null,
    messageId: attachmentPlan?.messageId ?? null,
    selectedSendMode: overrides.selectedSendMode ?? attachmentPlan?.selectedSendMode ?? null,
    aiPayloadKind: attachmentPlan?.aiPayloadKind ?? null,
    ...(overrides.cause !== undefined ? { cause: overrides.cause } : {}),
  })
}

async function buildPartForMode(
  attachmentPlan: SendPlanAttachment,
  sendMode: SendMode,
  context: SerializeContext
): Promise<OpenRouterContentPart[]> {
  switch (attachmentPlan.aiPayloadKind) {
    case 'image':
      return [...(await buildImageContentPart(attachmentPlan, sendMode, context))]
    case 'pdf':
      return [...(await buildPdfContentPart(attachmentPlan, sendMode, context))]
    case 'audio':
      return [...(await buildAudioContentPart(attachmentPlan, sendMode, context))]
    case 'video':
      return [...(await buildVideoContentPart(attachmentPlan, sendMode, context))]
    case 'text':
      return [...(await buildTextAttachmentContentPart(attachmentPlan, sendMode, context))]
    default:
      throw mapOpenRouterAttachmentError('openrouter_modality_rejected', attachmentPlan, {
        message: `Attachment ${attachmentPlan.assetId} uses unsupported payload kind ${attachmentPlan.aiPayloadKind}.`,
        selectedSendMode: sendMode,
      })
  }
}

function getAssetOrThrow(
  attachmentPlan: SendPlanAttachment,
  assetsById: Readonly<Record<string, FileAssetRecord | undefined>> | ReadonlyMap<string, FileAssetRecord>
): FileAssetRecord {
  const asset = readAssetById(assetsById, attachmentPlan.assetId)
  if (!asset) {
    throw mapOpenRouterAttachmentError('attachment_asset_missing', attachmentPlan, {
      message: `Attachment ${attachmentPlan.assetId} asset record is missing.`,
    })
  }
  return asset
}

function readAssetById(
  assetsById: Readonly<Record<string, FileAssetRecord | undefined>> | ReadonlyMap<string, FileAssetRecord>,
  assetId: string
): FileAssetRecord | undefined {
  if (assetsById instanceof Map) return assetsById.get(assetId)
  const record = assetsById as Readonly<Record<string, FileAssetRecord | undefined>>
  return record[assetId]
}

function resolveLocalStoragePath(storageRootDir: string, asset: FileAssetRecord): ManagedStorageResolution {
  return resolveManagedStoragePath(storageRootDir, asset.storageUri, {
    backend: asset.storageBackend,
    deletedAt: asset.deletedAt,
  })
}

function resolveUrlReference(asset: FileAssetRecord): string | null {
  const meta = asset.sourceMetaJson ?? null
  const candidateKeys = ['resolvedUrl', 'originalUrl']
  for (const key of candidateKeys) {
    const value = meta?.[key]
    if (typeof value === 'string' && isHttpUrl(value)) return value
  }
  if (asset.storageBackend === 'remote_url' && isHttpUrl(asset.storageUri)) {
    return asset.storageUri
  }
  return null
}

function dataUrlFromBytes(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${encodeBase64(bytes)}`
}

function encodeBase64(bytes: Uint8Array): string {
  try {
    return Buffer.from(bytes).toString('base64')
  } catch (error) {
    throw new OpenRouterAttachmentSerializationError({
      code: 'attachment_base64_encode_failed',
      message: 'Attachment bytes could not be base64 encoded.',
      assetId: null,
      attachmentId: null,
      messageId: null,
      selectedSendMode: null,
      aiPayloadKind: null,
      cause: error,
    })
  }
}

function decodeTextBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8').decode(bytes)
  } catch {
    return Buffer.from(bytes).toString('utf8')
  }
}

function audioFormatFromAsset(asset: FileAssetRecord): string {
  const extension = String(asset.extension ?? '').trim().toLowerCase()
  if (extension) return extension
  const mime = normalizeMime(asset.mime)
  if (mime?.startsWith('audio/')) return mime.slice('audio/'.length)
  return 'wav'
}

function normalizeMime(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').split(';', 1)[0]?.trim().toLowerCase()
  return normalized || null
}

function mimeFromExtension(extension: string | null): string | null {
  switch (String(extension ?? '').trim().toLowerCase()) {
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'pdf':
      return 'application/pdf'
    case 'txt':
      return 'text/plain'
    case 'md':
      return 'text/markdown'
    case 'mp3':
      return 'audio/mpeg'
    case 'wav':
      return 'audio/wav'
    case 'm4a':
      return 'audio/m4a'
    case 'flac':
      return 'audio/flac'
    case 'mp4':
      return 'video/mp4'
    case 'mov':
      return 'video/quicktime'
    case 'webm':
      return 'video/webm'
    default:
      return null
  }
}

function resolvePdfFileParserPlugins(
  sendPlan: SendPlan,
  config: OpenRouterPdfFileParserConfig | null | undefined
): OpenRouterAdditionalPlugin[] {
  const hasPdf = sendPlan.attachmentPlans.some(
    (plan) => (plan.eligibility === 'included' || plan.eligibility === 'warning') && plan.aiPayloadKind === 'pdf'
  )
  if (!hasPdf) return []
  if (config == null || config.enabled === false) return []
  if (config.engine && config.engine !== 'native' && config.engine !== 'cloudflare-ai' && config.engine !== 'mistral-ocr') {
    throw mapOpenRouterAttachmentError('pdf_file_parser_config_invalid', null, {
      message: `PDF file-parser engine ${String(config.engine)} is invalid.`,
    })
  }
  return [{
    id: 'file-parser',
    ...(config.engine ? { pdf: { engine: config.engine } } : {}),
  }]
}

function isHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function requireNonEmpty(value: string, field: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${field} is required`)
  return normalized
}

function sanitizePromptEnvelopeMetadataText(value: string | null | undefined): string {
  const normalized = String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return 'unknown'
  return normalized.length <= 512 ? normalized : `${normalized.slice(0, 512)}…`
}

async function defaultReadFileBytes(filePath: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(filePath))
}
