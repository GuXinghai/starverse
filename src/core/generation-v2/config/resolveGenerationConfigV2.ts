import type { GenerationIntentLayerV2 } from '../domain/generationIntentV2'
import { projectGenerationIntentLayerV2 } from '../domain/generationIntentProjectionV2'
import {
  decodeResolvedGenerationIntentV2,
  type ResolvedGenerationIntentV2,
} from '../domain/resolvedGenerationIntentV2'
import type { GenerationConfigLayerV2 } from './generationConfigLayerV2'
import { selectTargetThinkingV2, type ThinkingTargetV2 } from './targetThinkingPreferencesV2'

export const DEFAULT_RESOLVED_GENERATION_INTENT_V2: ResolvedGenerationIntentV2 =
  decodeResolvedGenerationIntentV2({
    schemaVersion: 2,
    generation: {},
    reasoning: { mode: 'disabled' },
    web: { mode: 'disabled' },
    image: { mode: 'disabled' },
    tools: { mode: 'disabled' },
    attachments: [],
    providerExtension: { kind: 'none' },
  }).value

export function mergeGenerationConfigLayersV2(
  layers: readonly GenerationConfigLayerV2[],
  target?: ThinkingTargetV2,
): ResolvedGenerationIntentV2 {
  let current: GenerationIntentLayerV2 = DEFAULT_RESOLVED_GENERATION_INTENT_V2
  let requestedParameters: Record<string, unknown> | undefined
  for (const source of layers) {
    const layer = selectTargetThinkingV2(source, target) as GenerationConfigLayerV2
    if (layer.requestedParameters !== undefined) {
      requestedParameters = { ...requestedParameters, ...layer.requestedParameters }
    }
    current = Object.freeze({
      schemaVersion: 2,
      generation: layer.generation ?? current.generation,
      reasoning: layer.reasoning ?? current.reasoning,
      web: layer.web ?? current.web,
      image: layer.image ?? current.image,
      tools: layer.tools ?? current.tools,
      attachments: [],
      providerExtension: layer.providerExtension ?? current.providerExtension,
      requestedParameters,
    })
  }
  return decodeResolvedGenerationIntentV2(projectGenerationIntentLayerV2(current)).value
}
