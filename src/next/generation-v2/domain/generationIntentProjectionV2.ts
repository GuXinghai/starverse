import {
  readImageAspectRatioV2,
  type GenerationIntentLayerV2,
} from './generationIntentV2'
import { readGenerationV2Digest, readGenerationV2Identity } from './identityV2'

type PlainObject = { [key: string]: unknown }

function compact(value: PlainObject): PlainObject {
  for (const key of Object.keys(value)) {
    if (value[key] === undefined) delete value[key]
  }
  return value
}

export function projectGenerationIntentLayerV2(intent: GenerationIntentLayerV2): Readonly<PlainObject> {
  const projection: PlainObject = { schemaVersion: 2 }
  if (intent.generation !== undefined) {
    projection.generation = compact({
      ...intent.generation,
      stop: intent.generation.stop ? [...intent.generation.stop] : undefined,
    })
  }
  if (intent.reasoning !== undefined) projection.reasoning = { ...intent.reasoning }
  if (intent.web !== undefined) {
    projection.web = intent.web.mode === 'disabled'
      ? { mode: 'disabled' }
      : compact({
          ...intent.web,
          types: [...intent.web.types],
          userLocation: intent.web.userLocation ? { ...intent.web.userLocation } : undefined,
          allowedDomains: intent.web.allowedDomains ? [...intent.web.allowedDomains] : undefined,
          excludedDomains: intent.web.excludedDomains ? [...intent.web.excludedDomains] : undefined,
        })
  }
  if (intent.image !== undefined) {
    projection.image = intent.image.mode === 'disabled' ? { mode: 'disabled' } : compact({
      ...intent.image,
      aspectRatio: intent.image.aspectRatio ? readImageAspectRatioV2(intent.image.aspectRatio) : undefined,
      size: intent.image.size ? { ...intent.image.size } : undefined,
    })
  }
  if (intent.tools !== undefined) {
    projection.tools = intent.tools.mode === 'disabled' ? { mode: 'disabled' } : {
      mode: 'enabled',
      allowedToolIds: intent.tools.allowedToolIds.map((item) => readGenerationV2Identity(item, 'tool_id')),
      toolChoice: intent.tools.toolChoice.mode === 'named'
        ? {
            mode: 'named',
            toolId: readGenerationV2Identity(intent.tools.toolChoice.toolId, 'tool_id'),
          }
        : { mode: intent.tools.toolChoice.mode },
      sideEffectConfirmation: 'required_each_retry',
    }
  }
  if (intent.attachments !== undefined) {
    projection.attachments = intent.attachments.map((attachment) => ({
      kind: attachment.kind,
      ...(attachment.kind === 'managed_file' ? {
        assetId: readGenerationV2Identity(attachment.assetId, 'asset_id'),
        assetRevisionId: readGenerationV2Identity(attachment.assetRevisionId, 'asset_revision_id'),
        assetSha256: readGenerationV2Digest(attachment.assetSha256, 'asset_sha256'),
      } : {
        referenceId: readGenerationV2Identity(attachment.referenceId, 'url_reference_id'),
        referenceRevision: readGenerationV2Identity(attachment.referenceRevision, 'url_reference_revision'),
        originalUrl: attachment.originalUrl,
        urlDigest: readGenerationV2Digest(attachment.urlDigest, 'url_digest'),
        mediaKind: attachment.mediaKind,
        ...(attachment.declaredMediaType === undefined ? {} : { declaredMediaType: attachment.declaredMediaType }),
        capturedAtMs: attachment.capturedAtMs,
        provenance: attachment.provenance,
      }),
      include: attachment.include,
      sendAs: attachment.sendAs,
      conversion: attachment.conversion,
    }))
  }
  if (intent.providerExtension !== undefined) {
    projection.providerExtension = { ...intent.providerExtension }
  }
  return projection
}
