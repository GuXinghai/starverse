import type { DbWorkerRuntime } from '../runtime'
import type { RegisterHandler } from './types'
import type { SendPlan } from '../../../../src/shared/files/sendPlanTypes'
import type { SendMode } from '../../../../src/shared/files/fileTypes'
import {
  createProviderFileInputAssetReader,
  prepareProviderFileInput,
  type ProviderFileInputProvider,
  type ProviderFileInputSendMode,
} from '../../../../src/next/multimodal/providerFileInputMapper'
import { PrepareProviderImageSendSchema } from '../../validation'

type PreparedProviderImageDiagnostic = Readonly<{
  assetId: string
  attachmentId: string
  source: SendPlan['attachmentPlans'][number]['source']
  selectedSendMode: SendMode
  mimeType: string
  sizeBytes: number
}>

export function registerProviderFileInputHandlers(register: RegisterHandler, runtime: DbWorkerRuntime) {
  register('providerFileInput.prepareDraftImages', async (raw) => {
    const input = PrepareProviderImageSendSchema.parse(raw)
    const collected = runtime.sendPlanService.collectCurrentSendInputs({
      conversationId: input.conversationId,
      draftText: input.draftText,
      historyScope: historyScopeFromIds(input.historyMessageIds),
      model: input.model,
      providerContext: input.providerContext,
    })
    const sendPlan = runtime.sendPlanService.buildSendPlan(collected)
    const hasDraftAttachmentPlans = sendPlan.attachmentPlans.some((plan) => plan.source === 'draft')

    const unsupportedM1bImagePlan = sendPlan.attachmentPlans.find((plan) =>
      isUnsupportedM1bRuntimeImagePlan(plan) ||
      isUnsupportedM1bRuntimeImageMime(runtime.fileAssetRepo.getById(plan.assetId)?.mime ?? null)
    )
    if (unsupportedM1bImagePlan) {
      return {
        ok: false,
        code: 'unsupported_mime',
        message: 'This runtime slice only supports PNG and JPEG image attachments.',
        sendPlan,
        contentParts: [],
        sentAssetIds: [],
        hasDraftAttachmentPlans,
      }
    }

    if (sendPlan.status === 'blocked' || sendPlan.requiresUserConfirmation) {
      return {
        ok: false,
        code: 'asset_not_ready',
        message: resolveSendPlanBlockedMessage(sendPlan),
        sendPlan,
        contentParts: [],
        sentAssetIds: [],
        hasDraftAttachmentPlans,
      }
    }

    const includedPlans = sendPlan.attachmentPlans.filter((plan) =>
      plan.eligibility === 'included' || plan.eligibility === 'warning'
    )
    const unsupportedPlan = includedPlans.find((plan) => plan.aiPayloadKind !== 'image')
    if (unsupportedPlan) {
      return {
        ok: false,
        code: 'unsupported_mime',
        message: 'This runtime slice only supports image attachments.',
        sendPlan,
        contentParts: [],
        sentAssetIds: [],
        hasDraftAttachmentPlans,
      }
    }

    if (hasDraftAttachmentPlans && includedPlans.length === 0) {
      return {
        ok: false,
        code: 'unsupported_mime',
        message: 'No sendable image attachment was found for this runtime.',
        sendPlan,
        contentParts: [],
        sentAssetIds: [],
        hasDraftAttachmentPlans,
      }
    }

    const reader = createProviderFileInputAssetReader({
      fileAssetRepo: runtime.fileAssetRepo,
      fileAssetStoreRepo: runtime.fileAssetStoreRepo,
      storageRootDir: runtime.fileStorageRootDir,
    })
    const contentParts: unknown[] = []
    const included: PreparedProviderImageDiagnostic[] = []

    for (const plan of includedPlans) {
      const sendMode = mapSendMode(plan.selectedSendMode)
      if (!sendMode) {
        return {
          ok: false,
          code: 'asset_not_ready',
          message: 'Image attachment has no runtime send mode.',
          sendPlan,
          contentParts: [],
          sentAssetIds: [],
          hasDraftAttachmentPlans,
        }
      }

      const prepared = await prepareProviderFileInput({
        provider: input.provider as ProviderFileInputProvider,
        assetId: plan.assetId,
        sendMode,
        readAsset: reader,
      })
      if (!prepared.ok) {
        return {
          ok: false,
          code: prepared.code,
          message: sanitizeDiagnosticMessage(prepared.message),
          sendPlan,
          contentParts: [],
          sentAssetIds: [],
          hasDraftAttachmentPlans,
        }
      }
      if (prepared.kind !== 'image') {
        return {
          ok: false,
          code: 'unsupported_mime',
          message: 'Only image attachments can be sent through this runtime slice.',
          sendPlan,
          contentParts: [],
          sentAssetIds: [],
          hasDraftAttachmentPlans,
        }
      }
      if (!isM1bRuntimeImageMime(prepared.mimeType)) {
        return {
          ok: false,
          code: 'unsupported_mime',
          message: 'This runtime slice only supports PNG and JPEG image attachments.',
          sendPlan,
          contentParts: [],
          sentAssetIds: [],
          hasDraftAttachmentPlans,
        }
      }

      contentParts.push(prepared.requestPart)
      included.push({
        assetId: plan.assetId,
        attachmentId: plan.attachmentId,
        source: plan.source,
        selectedSendMode: sendMode,
        mimeType: prepared.mimeType,
        sizeBytes: prepared.sizeBytes,
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
        includedImageCount: included.length,
        included,
        containsMultimodalParts: contentParts.length > 0,
      },
    }
  })
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

function isM1bRuntimeImageMime(mimeType: string): boolean {
  const normalized = String(mimeType ?? '').split(';', 1)[0]?.trim().toLowerCase()
  return normalized === 'image/png' || normalized === 'image/jpeg'
}

function isUnsupportedM1bRuntimeImageMime(mimeType: string | null): boolean {
  const normalized = String(mimeType ?? '').split(';', 1)[0]?.trim().toLowerCase()
  return !!normalized && normalized.startsWith('image/') && normalized !== 'image/png' && normalized !== 'image/jpeg'
}

function isUnsupportedM1bRuntimeImagePlan(plan: SendPlan['attachmentPlans'][number]): boolean {
  if (plan.fileType?.kind !== 'image' && plan.aiPayloadKind !== 'image') return false
  const formatId = String(plan.fileType?.formatId ?? '').trim().toLowerCase()
  return !!formatId && formatId !== 'png' && formatId !== 'jpeg'
}

function resolveSendPlanBlockedMessage(sendPlan: SendPlan): string {
  const reason = sendPlan.blockingReasons
    .map((item) => item.message || item.code)
    .find((value) => String(value ?? '').trim().length > 0)
  if (reason) return sanitizeDiagnosticMessage(String(reason))
  if (sendPlan.requiresUserConfirmation) return 'Attachment send requires confirmation before runtime image mapping.'
  return 'Attachment is not ready for provider image input.'
}

function sanitizeDiagnosticMessage(raw: string): string {
  const redacted = String(raw ?? '')
    .replace(/[A-Za-z]:[\\/][^\s"''<>]+/g, '[local path]')
    .replace(/\/(?:Users|home|var|tmp|private|mnt|opt)\/[^ "''<>]+/g, '[local path]')
    .replace(/\s+/g, ' ')
    .trim()
  return redacted.length > 160 ? `${redacted.slice(0, 157)}...` : redacted
}
