import {
  decodeGenerationIntentLayerV2,
  type AttachmentIntentV2,
} from '../../domain/generationIntentV2'
import { projectGenerationIntentLayerV2 } from '../../domain/generationIntentProjectionV2'

export class OpenAIResponsesCommandAttachmentsV2Error extends Error {
  constructor() { super('GENERATION_V2_OPENAI_COMMAND_ATTACHMENTS_INVALID') }
}

export function decodeOpenAIResponsesCommandAttachmentsV2(value: unknown): readonly AttachmentIntentV2[] {
  try {
    const layer = decodeGenerationIntentLayerV2({ schemaVersion: 2, attachments: value })
    if (layer.attachments === undefined) throw new Error('missing')
    return Object.freeze([...layer.attachments])
  } catch {
    throw new OpenAIResponsesCommandAttachmentsV2Error()
  }
}

export function projectOpenAIResponsesCommandAttachmentsV2(
  attachments: readonly AttachmentIntentV2[],
): unknown {
  return projectGenerationIntentLayerV2({ schemaVersion: 2, attachments }).attachments
}
