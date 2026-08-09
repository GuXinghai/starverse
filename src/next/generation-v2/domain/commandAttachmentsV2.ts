import {
  decodeGenerationIntentLayerV2,
  type AttachmentIntentV2,
} from './generationIntentV2'
import { projectGenerationIntentLayerV2 } from './generationIntentProjectionV2'

export class GenerationCommandAttachmentsV2Error extends Error {
  constructor() { super('GENERATION_V2_COMMAND_ATTACHMENTS_INVALID') }
}

/**
 * Decodes command-owned attachment facts without assigning them to a provider.
 * Provider contracts decide later whether and how each included attachment can
 * be compiled. This prevents a command from silently dropping an explicit
 * attachment merely because its transport is not yet selected.
 */
export function decodeGenerationCommandAttachmentsV2(value: unknown): readonly AttachmentIntentV2[] {
  try {
    const layer = decodeGenerationIntentLayerV2({ schemaVersion: 2, attachments: value })
    if (layer.attachments === undefined) throw new Error('missing')
    return Object.freeze([...layer.attachments])
  } catch {
    throw new GenerationCommandAttachmentsV2Error()
  }
}

export function projectGenerationCommandAttachmentsV2(
  attachments: readonly AttachmentIntentV2[],
): unknown {
  return projectGenerationIntentLayerV2({ schemaVersion: 2, attachments }).attachments
}
