import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { DbWorkerRuntime } from '../runtime'
import type { RegisterHandler } from './types'
import type { SendPlan, SendPlanModelDescriptor, SendPlanProviderContext } from '../../../../src/shared/files/sendPlanTypes'
import type { SendMode } from '../../../../src/shared/files/fileTypes'
import { resolveManagedStoragePath } from '../../../../src/shared/files/localStorageResolver'
import type { DfcSendAssetRef } from '../../../../src/shared/files/documentFormatConversion'
import type { FileDerivativeRecord } from '../../types'
import {
  createProviderFileInputAssetReader,
  M1C_PDF_INLINE_LIMIT_BYTES,
  prepareProviderFileInput,
  prepareProviderFileUploadInput,
  type ProviderFileInputAssetReader,
  type ProviderFileInputKind,
  type ProviderFileInputProvider,
  type ProviderFileInputReadResult,
  type ProviderFileInputSendMode,
} from '../../../../src/next/multimodal/providerFileInputMapper'
import {
  PrepareProviderFileSendSchema,
  PrepareProviderImageSendSchema,
} from '../../validation'

type AttachmentPlan = SendPlan['attachmentPlans'][number]

type PreparedProviderFileDiagnostic = Readonly<{
  assetId: string
  attachmentId: string
  source: AttachmentPlan['source']
  selectedSendMode: SendMode
  mimeType: string
  sizeBytes: number
  kind: ProviderFileInputKind
}>

type ProviderInputSendTarget =
  | Readonly<{
      kind: 'raw_file'
      assetId: string
      readAsset: ProviderFileInputAssetReader
    }>
  | Readonly<{
      kind: 'derived_asset'
      assetId: string
      readAsset: ProviderFileInputAssetReader
    }>

type ProviderInputSendTargetResult =
  | Readonly<{ ok: true; target: ProviderInputSendTarget }>
  | Readonly<{ ok: false; code: 'asset_not_ready'; message: string }>

type PrepareDraftRuntimeOptions = Readonly<{
  allowedKinds: ReadonlySet<ProviderFileInputKind>
  imageOnly: boolean
}>

export function registerProviderFileInputHandlers(register: RegisterHandler, runtime: DbWorkerRuntime) {
  register('providerFileInput.prepareDraftImages', async (raw) => {
    const input = PrepareProviderImageSendSchema.parse(raw)
    return prepareDraftFileInputs(input, runtime, {
      allowedKinds: new Set<ProviderFileInputKind>(['image']),
      imageOnly: true,
    })
  })

  register('providerFileInput.prepareDraftFiles', async (raw) => {
    const input = PrepareProviderFileSendSchema.parse(raw)
    return prepareDraftFileInputs(input, runtime, {
      allowedKinds: new Set<ProviderFileInputKind>(['image', 'pdf']),
      imageOnly: false,
    })
  })

  register('providerFileCache.findReusable', (raw) => {
    const input = raw as any
    return runtime.providerFileUploadCacheRepo.findReusable(input, Number(input?.nowMs ?? Date.now()))
  })

  register('providerFileCache.reserve', (raw) => {
    return runtime.providerFileUploadCacheRepo.reserve(raw as any)
  })

  register('providerFileCache.markReady', (raw) => {
    return runtime.providerFileUploadCacheRepo.markReady(raw as any)
  })

  register('providerFileCache.markFailed', (raw) => {
    return runtime.providerFileUploadCacheRepo.markFailed(raw as any)
  })

  register('providerFileCache.invalidate', (raw) => {
    return runtime.providerFileUploadCacheRepo.invalidate(raw as any)
  })
}

async function prepareDraftFileInputs(
  input: Readonly<{
    provider: string
    conversationId: string
    draftText?: string
    historyMessageIds?: ReadonlyArray<string>
    model: SendPlanModelDescriptor
    providerContext: SendPlanProviderContext
  }>,
  runtime: DbWorkerRuntime,
  options: PrepareDraftRuntimeOptions
) {
  const collected = runtime.sendPlanService.collectCurrentSendInputs({
    conversationId: input.conversationId,
    draftText: input.draftText,
    historyScope: historyScopeFromIds(input.historyMessageIds),
    model: input.model,
    providerContext: input.providerContext,
  })
  const sendPlan = runtime.sendPlanService.buildSendPlan(collected)
  const hasDraftAttachmentPlans = sendPlan.attachmentPlans.some((plan) => plan.source === 'draft')

  const unsupportedImagePlan = sendPlan.attachmentPlans.find((plan) =>
    isUnsupportedM1bRuntimeImagePlan(plan) ||
    isUnsupportedM1bRuntimeImageMime(runtime.fileAssetRepo.getById(plan.assetId)?.mime ?? null)
  )
  if (unsupportedImagePlan) {
    return prepareFailure({
      code: 'unsupported_mime',
      message: 'This runtime slice only supports PNG and JPEG image attachments.',
      sendPlan,
      hasDraftAttachmentPlans,
    })
  }

  if (sendPlan.status === 'blocked' || sendPlan.requiresUserConfirmation) {
    return prepareFailure({
      code: 'asset_not_ready',
      message: resolveSendPlanBlockedMessage(sendPlan, options.imageOnly),
      sendPlan,
      hasDraftAttachmentPlans,
    })
  }

  const includedPlans = sendPlan.attachmentPlans.filter((plan) =>
    plan.eligibility === 'included' || plan.eligibility === 'warning'
  )
  const unsupportedPlan = includedPlans.find((plan) => !isAllowedPlan(plan, options.allowedKinds))
  if (unsupportedPlan) {
    return prepareFailure({
      code: 'unsupported_mime',
      message: options.imageOnly
        ? 'This runtime slice only supports image attachments.'
        : 'This runtime slice only supports PNG/JPEG image and PDF attachments.',
      sendPlan,
      hasDraftAttachmentPlans,
    })
  }

  if (hasDraftAttachmentPlans && includedPlans.length === 0) {
    return prepareFailure({
      code: 'unsupported_mime',
      message: options.imageOnly
        ? 'No sendable image attachment was found for this runtime.'
        : 'No sendable image or PDF attachment was found for this runtime.',
      sendPlan,
      hasDraftAttachmentPlans,
    })
  }

  const reader = createProviderFileInputAssetReader({
    fileAssetRepo: runtime.fileAssetRepo,
    fileAssetStoreRepo: runtime.fileAssetStoreRepo,
    storageRootDir: runtime.fileStorageRootDir,
  })
  const contentParts: unknown[] = []
  const included: PreparedProviderFileDiagnostic[] = []

  for (const plan of includedPlans) {
    const target = createProviderInputSendTarget(plan, runtime, reader)
    if (!target.ok) {
      return prepareFailure({
        code: target.code,
        message: sanitizeDiagnosticMessage(target.message),
        sendPlan,
        hasDraftAttachmentPlans,
      })
    }

    const sendMode = mapSendMode(plan.selectedSendMode)
    if (!sendMode) {
      return prepareFailure({
        code: 'asset_not_ready',
        message: options.imageOnly
          ? 'Image attachment has no runtime send mode.'
          : 'Attachment has no runtime send mode.',
        sendPlan,
        hasDraftAttachmentPlans,
      })
    }

    const provider = input.provider as ProviderFileInputProvider
    const prepare = shouldUseProviderUploadInput(provider, sendMode)
      ? prepareProviderFileUploadInput
      : prepareProviderFileInput
    const prepared = await prepare({
      provider: input.provider as ProviderFileInputProvider,
      assetId: target.target.assetId,
      sendMode,
      readAsset: target.target.readAsset,
      ...(isPdfAttachmentPlan(plan) ? { maxInlineBytes: M1C_PDF_INLINE_LIMIT_BYTES } : {}),
    })
    if (!prepared.ok) {
      return prepareFailure({
        code: prepared.code,
        message: sanitizeDiagnosticMessage(prepared.message),
        sendPlan,
        hasDraftAttachmentPlans,
      })
    }
    if (!options.allowedKinds.has(prepared.kind)) {
      return prepareFailure({
        code: 'unsupported_mime',
        message: options.imageOnly
          ? 'Only image attachments can be sent through this runtime slice.'
          : 'Only PNG/JPEG image and PDF attachments can be sent through this runtime slice.',
        sendPlan,
        hasDraftAttachmentPlans,
      })
    }
    if (prepared.kind === 'image' && !isM1bRuntimeImageMime(prepared.mimeType)) {
      return prepareFailure({
        code: 'unsupported_mime',
        message: 'This runtime slice only supports PNG and JPEG image attachments.',
        sendPlan,
        hasDraftAttachmentPlans,
      })
    }
    if (prepared.kind === 'pdf' && prepared.mimeType !== 'application/pdf') {
      return prepareFailure({
        code: 'unsupported_mime',
        message: 'This runtime slice only supports application/pdf PDF attachments.',
        sendPlan,
        hasDraftAttachmentPlans,
      })
    }

    contentParts.push(prepared.requestPart)
    included.push({
      assetId: prepared.assetId,
      attachmentId: plan.attachmentId,
      source: plan.source,
      selectedSendMode: sendMode,
      mimeType: prepared.mimeType,
      sizeBytes: prepared.sizeBytes,
      kind: prepared.kind,
    })
  }

  return {
    ok: true,
    provider: input.provider,
    sendPlan,
    contentParts,
    sentAssetIds: Array.from(new Set(sendPlan.includedAttachments.map((attachment) => attachment.assetId))),
    hasDraftAttachmentPlans,
    diagnostics: {
      sendPlanStatus: sendPlan.status,
      includedImageCount: included.filter((item) => item.kind === 'image').length,
      includedPdfCount: included.filter((item) => item.kind === 'pdf').length,
      includedFileCount: included.length,
      included,
      containsMultimodalParts: contentParts.length > 0,
    },
  }
}

function createProviderInputSendTarget(
  plan: AttachmentPlan,
  runtime: DbWorkerRuntime,
  rawAssetReader: ProviderFileInputAssetReader
): ProviderInputSendTargetResult {
  const refs = normalizeSendAssetRefs(plan.sendAssetRefs)
  const derivedRefs = refs.filter((ref) => ref.kind === 'derived_asset')
  if (derivedRefs.length > 1) {
    return {
      ok: false,
      code: 'asset_not_ready',
      message: `Attachment ${plan.assetId} has multiple DFC derived send assets and cannot be mapped unambiguously.`,
    }
  }
  if (derivedRefs.length === 1) {
    const derivedId = derivedRefs[0]?.assetId ?? ''
    return createDerivedProviderInputSendTarget({
      derivativeId: derivedId,
      sourceAssetId: plan.assetId,
      runtime,
    })
  }

  const rawRefs = refs.filter((ref) => ref.kind === 'raw_file')
  if (rawRefs.length > 1) {
    return {
      ok: false,
      code: 'asset_not_ready',
      message: `Attachment ${plan.assetId} has multiple raw send assets and cannot be mapped unambiguously.`,
    }
  }
  if (rawRefs.length === 1 && rawRefs[0]?.assetId !== plan.assetId) {
    return {
      ok: false,
      code: 'asset_not_ready',
      message: `Attachment ${plan.assetId} raw send asset does not match the attached asset.`,
    }
  }

  return {
    ok: true,
    target: {
      kind: 'raw_file',
      assetId: plan.assetId,
      readAsset: rawAssetReader,
    },
  }
}

function createDerivedProviderInputSendTarget(input: Readonly<{
  derivativeId: string
  sourceAssetId: string
  runtime: DbWorkerRuntime
}>): ProviderInputSendTargetResult {
  const derivative = input.runtime.fileDerivativeRepo.getById(input.derivativeId)
  if (!derivative) {
    return {
      ok: false,
      code: 'asset_not_ready',
      message: `Selected DFC derived asset ${input.derivativeId} was not found.`,
    }
  }
  if (derivative.parentAssetId !== input.sourceAssetId) {
    return {
      ok: false,
      code: 'asset_not_ready',
      message: `Selected DFC derived asset ${derivative.id} does not belong to attachment ${input.sourceAssetId}.`,
    }
  }
  if (derivative.status !== 'ready' || derivative.deletedAt != null) {
    return {
      ok: false,
      code: 'asset_not_ready',
      message: `Selected DFC derived asset ${derivative.id} is not ready for provider file input.`,
    }
  }

  return {
    ok: true,
    target: {
      kind: 'derived_asset',
      assetId: derivative.id,
      readAsset: (assetId) => readDerivedProviderInputAsset({
        assetId,
        derivative,
        storageRootDir: input.runtime.fileStorageRootDir,
      }),
    },
  }
}

async function readDerivedProviderInputAsset(input: Readonly<{
  assetId: string
  derivative: FileDerivativeRecord
  storageRootDir: string
}>): Promise<ProviderFileInputReadResult> {
  const { assetId, derivative } = input
  if (assetId !== derivative.id) {
    return {
      ok: false,
      code: 'asset_not_ready',
      message: `Selected DFC derived asset ${assetId} does not match the prepared send target.`,
    }
  }
  if (derivative.status !== 'ready' || derivative.deletedAt != null) {
    return {
      ok: false,
      code: 'asset_not_ready',
      message: `Selected DFC derived asset ${derivative.id} is not ready for provider file input.`,
    }
  }

  const resolved = resolveManagedStoragePath(input.storageRootDir, derivative.storageUri, {
    backend: 'local_fs',
    deletedAt: derivative.deletedAt,
  })
  if (resolved.kind !== 'ok') {
    return {
      ok: false,
      code: 'asset_not_ready',
      message: resolved.kind === 'missing'
        ? `Selected DFC derived asset ${derivative.id} has no managed local bytes.`
        : resolved.message,
    }
  }

  let bytes: Uint8Array
  try {
    bytes = await readFile(resolved.path)
  } catch {
    return {
      ok: false,
      code: 'asset_not_ready',
      message: `Selected DFC derived asset ${derivative.id} managed bytes could not be read.`,
    }
  }

  const mimeType = normalizeDerivedMime(derivative)
  const filename = derivedFilename(derivative, mimeType)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  return {
    ok: true,
    source: 'managed_bytes',
    asset: {
      id: derivative.id,
      filename,
      extension: extensionFromFilename(filename),
      mimeType,
      sizeBytes: bytes.byteLength,
      assetKind: mimeType === 'application/pdf' ? 'document' : 'text',
      sourceKind: 'derived',
      storageBackend: 'local_fs',
      ingestStatus: 'stored',
      deletedAt: null,
      sourceMetaJson: null,
    },
    revision: {
      id: `derived:${derivative.parentAssetId}:${derivative.id}:${derivative.updatedAt}`,
      assetId: derivative.id,
      blobId: `derived:${derivative.id}`,
      parentRevisionId: null,
      cause: 'converted',
      derivedFromAssetId: derivative.parentAssetId,
    },
    blob: {
      id: `derived:${derivative.id}`,
      sha256,
      mimeType,
      sizeBytes: bytes.byteLength,
    },
    bytes,
  }
}

function normalizeSendAssetRefs(refs: readonly DfcSendAssetRef[] | undefined): DfcSendAssetRef[] {
  return (refs ?? [])
    .map((ref) => ({
      kind: ref.kind,
      assetId: String(ref.assetId ?? '').trim(),
    }) as DfcSendAssetRef)
    .filter((ref) => ref.assetId.length > 0)
}

function normalizeDerivedMime(derivative: FileDerivativeRecord): string {
  const mime = String(derivative.mime ?? '').split(';', 1)[0]?.trim().toLowerCase()
  if (mime) return mime
  if (derivative.derivedKind === 'converted_pdf') return 'application/pdf'
  if (derivative.derivedKind === 'converted_markdown') return 'text/markdown'
  return 'text/plain'
}

function derivedFilename(derivative: FileDerivativeRecord, mimeType: string): string {
  const extension = mimeType === 'application/pdf'
    ? 'pdf'
    : mimeType === 'text/markdown'
      ? 'md'
      : 'txt'
  return `${sanitizeDerivedFilenameStem(derivative.id)}.${extension}`
}

function sanitizeDerivedFilenameStem(value: string): string {
  const normalized = String(value ?? '').trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return normalized || 'derived-asset'
}

function extensionFromFilename(filename: string): string | null {
  const match = /\.([A-Za-z0-9]+)$/.exec(filename)
  return match ? match[1]?.toLowerCase() ?? null : null
}

function prepareFailure(input: Readonly<{
  code: string
  message: string
  sendPlan: SendPlan
  hasDraftAttachmentPlans: boolean
}>) {
  return {
    ok: false,
    code: input.code,
    message: input.message,
    sendPlan: input.sendPlan,
    contentParts: [],
    sentAssetIds: [],
    hasDraftAttachmentPlans: input.hasDraftAttachmentPlans,
  }
}

function historyScopeFromIds(ids: ReadonlyArray<string> | undefined): { messageIds: string[] } | null {
  const normalized = Array.from(new Set((ids ?? []).map((id) => String(id ?? '').trim()).filter(Boolean)))
  return normalized.length > 0 ? { messageIds: normalized } : null
}

function mapSendMode(mode: SendMode | null): ProviderFileInputSendMode | null {
  if (mode === 'inline_base64') return 'inline_base64'
  if (mode === 'url_ref') return 'url_ref'
  return null
}

function shouldUseProviderUploadInput(provider: string, sendMode: ProviderFileInputSendMode): boolean {
  if (sendMode === 'url_ref') return false
  return provider === 'openai_responses' ||
    provider === 'anthropic_messages' ||
    provider === 'google_ai_studio'
}

function isAllowedPlan(plan: AttachmentPlan, allowedKinds: ReadonlySet<ProviderFileInputKind>): boolean {
  if (plan.aiPayloadKind === 'image') return allowedKinds.has('image')
  if (isPdfAttachmentPlan(plan)) return allowedKinds.has('pdf')
  return false
}

function isPdfAttachmentPlan(plan: AttachmentPlan): boolean {
  return plan.aiPayloadKind === 'pdf' ||
    (plan.semantic.targetKind === 'pdf_attachment' && plan.semantic.sendStrategy === 'file_attachment')
}

function isM1bRuntimeImageMime(mimeType: string): boolean {
  const normalized = String(mimeType ?? '').split(';', 1)[0]?.trim().toLowerCase()
  return normalized === 'image/png' || normalized === 'image/jpeg'
}

function isUnsupportedM1bRuntimeImageMime(mimeType: string | null): boolean {
  const normalized = String(mimeType ?? '').split(';', 1)[0]?.trim().toLowerCase()
  return !!normalized && normalized.startsWith('image/') && normalized !== 'image/png' && normalized !== 'image/jpeg'
}

function isUnsupportedM1bRuntimeImagePlan(plan: AttachmentPlan): boolean {
  if (plan.fileType?.kind !== 'image' && plan.aiPayloadKind !== 'image') return false
  const formatId = String(plan.fileType?.formatId ?? '').trim().toLowerCase()
  return !!formatId && formatId !== 'png' && formatId !== 'jpeg'
}

function resolveSendPlanBlockedMessage(sendPlan: SendPlan, imageOnly: boolean): string {
  const reason = sendPlan.blockingReasons
    .map((item) => item.message || item.code)
    .find((value) => String(value ?? '').trim().length > 0)
  if (reason) return sanitizeDiagnosticMessage(String(reason))
  if (sendPlan.requiresUserConfirmation) {
    return imageOnly
      ? 'Attachment send requires confirmation before runtime image mapping.'
      : 'Attachment send requires confirmation before runtime file mapping.'
  }
  return imageOnly
    ? 'Attachment is not ready for provider image input.'
    : 'Attachment is not ready for provider file input.'
}

function sanitizeDiagnosticMessage(raw: string): string {
  const redacted = String(raw ?? '')
    .replace(/[A-Za-z]:[\\/][^\s"''<>]+/g, '[local path]')
    .replace(/\/(?:Users|home|var|tmp|private|mnt|opt)\/[^ "''<>]+/g, '[local path]')
    .replace(/\s+/g, ' ')
    .trim()
  return redacted.length > 160 ? `${redacted.slice(0, 157)}...` : redacted
}
