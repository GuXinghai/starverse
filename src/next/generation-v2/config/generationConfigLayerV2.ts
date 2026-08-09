import {
  decodeGenerationIntentLayerV2,
  type GenerationIntentLayerV2,
} from '../domain/generationIntentV2'
import { projectGenerationIntentLayerV2 } from '../domain/generationIntentProjectionV2'

export type GenerationConfigLayerV2 = Omit<GenerationIntentLayerV2, 'attachments'> &
  Readonly<{ attachments?: never }>

export class GenerationConfigLayerV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_CONFIG_ATTACHMENTS_NOT_SCOPE_CONFIG') {
    super(code)
    this.name = 'GenerationConfigLayerV2Error'
  }
}

export function decodeGenerationConfigLayerV2(value: unknown): GenerationConfigLayerV2 {
  const decoded = decodeGenerationIntentLayerV2(value)
  if (decoded.attachments !== undefined) {
    throw new GenerationConfigLayerV2Error('GENERATION_V2_CONFIG_ATTACHMENTS_NOT_SCOPE_CONFIG')
  }
  const { attachments: _attachments, ...configLayer } = decoded
  return Object.freeze(configLayer)
}

export function projectGenerationConfigLayerV2(value: GenerationConfigLayerV2): Readonly<Record<string, unknown>> {
  return projectGenerationIntentLayerV2(value)
}
