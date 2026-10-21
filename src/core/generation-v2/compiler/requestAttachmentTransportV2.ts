import { contains, type ResolvedCapabilityV2 } from '../capability/resolvedCapabilityV2'
import type { ModelCapabilitySemanticPathV2 } from '../capability/modelCapabilitySchemaV2'
import { projectGenerationIntentLayerV2 } from '../domain/generationIntentProjectionV2'
import { decodeResolvedGenerationIntentV2 } from '../domain/resolvedGenerationIntentV2'
import type { GenerationIntentLayerV2 } from '../domain/generationIntentV2'
import { recordRequestAdaptationV2 } from './requestAdaptationV2'
import { supportsGenerationAttachmentTransportV2 } from './generationAttachmentTransportPolicyV2'
import { generationRequestBodyMaxBytesForContractV1, GENERATION_PORTABLE_HISTORY_RESERVED_BYTES_V1 } from '../capacity/generationCapacityV1'
import type { RequestAttachmentMetadataV2 } from './compatibleGenerationIntentV2'
type JsonObject = Record<string, unknown>

/** Structural transport adapter invoked only by the applied attachment Rule. Originals remain in requestPlan. */
export function adaptRequestAttachmentTransportV2(operationId: string, requested: GenerationIntentLayerV2,
  capability: ResolvedCapabilityV2, attachmentMetadata?: ReadonlyMap<string, RequestAttachmentMetadataV2>): GenerationIntentLayerV2 {
  const result = structuredClone(projectGenerationIntentLayerV2(requested)) as JsonObject
  const binding = capability.executionContext.binding
  const protocol = binding.protocolContractId.value
  const fields = new Map(capability.modelFacts.fields.map(field => [field.path, field]))
  const coverage = new Set(capability.executionContext.encodingCoverage.semanticPaths)
  const allowed = (path: string, value: unknown) => {
    const field = fields.get(path as ModelCapabilitySemanticPathV2)
    return Boolean(field && coverage.has(path as ModelCapabilitySemanticPathV2) &&
      !['unsupported', 'conflict', 'missing'].includes(field.state) &&
      (field.state === 'unknown' || field.domain === undefined || contains(field.domain, value)))
  }
  if (protocol === 'openai-responses-v1') {
    result.attachments = (result.attachments as JsonObject[]).filter((attachment, index) => {
      if (!attachment.include || attachment.sendAs !== 'inline_text') return true
      recordRequestAdaptationV2(operationId, {path: `attachments[${index}]`, outcome: 'converted',
        reason: 'target_inline_text_fallback', source: attachment})
      return false
    })
  }
  const attachments = (result.attachments ?? []) as JsonObject[]
  let inlineWireBytes = 0
  result.attachments = attachments.filter((attachment, index) => {
    if (!attachment.include) return true
    const transportSupported = supportsGenerationAttachmentTransportV2({ protocolContractId: protocol,
      operation: binding.operation, attachmentKind: attachment.kind as 'managed_file' | 'url_reference',
      mediaKind: attachment.mediaKind as string | undefined })
    const metadata = attachmentMetadata?.get(attachment.assetRevisionId as string)
    if (metadata && transportSupported && !protocol.startsWith('openai-responses')) {
      const inlineTarget = protocol.startsWith('openrouter-chat') || protocol.startsWith('gemini-generate-content')
      const nextSendAs = inlineTarget && metadata.mime.startsWith('text/') ? 'inline_text'
        : inlineTarget && metadata.assetKind === 'image' && metadata.mime.startsWith('image/') && attachment.conversion === 'none' ? 'image_reference'
          : attachment.sendAs === 'converted_document' && attachment.conversion === 'plain_text' ? 'inline_text' : attachment.sendAs
      if (nextSendAs !== attachment.sendAs) {
        recordRequestAdaptationV2(operationId, { path: `attachments[${index}].sendAs`, outcome: 'converted', reason: 'target_inline_revision_encoding', source: attachment.sendAs })
        attachment.sendAs = nextSendAs
      }
    }
    const nativeShape = !metadata || (protocol.startsWith('openai-responses')
      ? attachment.sendAs !== 'image_reference' || metadata.assetKind === 'image' && ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(metadata.mime)
      : protocol.startsWith('anthropic-messages')
        ? attachment.sendAs === 'provider_file' || attachment.conversion === 'pdf' || attachment.sendAs === 'inline_text' && metadata.mime.startsWith('text/') || attachment.sendAs === 'image_reference' && metadata.assetKind === 'image' && ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(metadata.mime)
        : protocol.startsWith('openrouter-chat') || protocol.startsWith('gemini-generate-content')
          ? attachment.sendAs === 'inline_text' && metadata.mime.startsWith('text/') || attachment.sendAs === 'image_reference' && metadata.assetKind === 'image' && metadata.mime.startsWith('image/') || metadata.mime === 'application/pdf' || protocol.startsWith('gemini-generate-content') && /^(audio|video)\//u.test(metadata.mime) && metadata.sizeBytes <= 4 * 1024 * 1024
          : true)
    const inline = metadata && (protocol.startsWith('openrouter-chat') || protocol.startsWith('gemini-generate-content') || attachment.sendAs === 'image_reference' || attachment.sendAs === 'inline_text')
    const inlineLimit = protocol.startsWith('openai-responses') ? Math.floor((4 * 1024 * 1024 - 256) * 3 / 4)
      : protocol.startsWith('gemini-generate-content') ? 4 * 1024 * 1024 : 12 * 1024 * 1024
    const encodedBytes = inline ? Math.ceil(metadata!.sizeBytes / 3) * 4 + 256 : 0
    const fits = !inline || metadata!.utf8Valid !== false && metadata!.sizeBytes <= inlineLimit &&
      inlineWireBytes + encodedBytes <= generationRequestBodyMaxBytesForContractV1(protocol) - GENERATION_PORTABLE_HISTORY_RESERVED_BYTES_V1
    const canEncode = transportSupported && nativeShape && fits
      && Object.entries(attachment).every(([key, value]) => !attachment.include || allowed(`attachments[].${key}`, value))
    if (canEncode) { inlineWireBytes += encodedBytes; return true }
    recordRequestAdaptationV2(operationId, { path: `attachments[${index}]`, outcome: 'deferred',
      reason: 'target_attachment_encoding_unavailable', source: attachment })
    return false
  })
  return decodeResolvedGenerationIntentV2(result).value
}
