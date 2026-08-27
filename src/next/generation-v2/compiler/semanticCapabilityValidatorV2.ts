import type { GenerationIntentLayerV2 } from '../domain/generationIntentV2'
import {
  resolvedCapabilityFromRuntimeSnapshotV2,
  validateSemanticIntentAgainstResolvedCapabilityV2,
} from '../capability/resolvedCapabilityV2'
import type { DecodedRuntimeCapabilitySnapshotV2 } from '../capability/runtimeCapabilitySnapshotV2'
import { assertExpectedCapabilityRevisionV2 } from '../capability/capabilityRevisionExpectationV2'

/**
 * Compiler-side defence-in-depth for the same resolved capability record that
 * was used by the command authority.  Protocol codecs still own wire shape;
 * this helper only prevents a compiler from widening semantic intent.
 */
export function validateGenerationExecutionCapabilityV2(
  capability: DecodedRuntimeCapabilitySnapshotV2,
  intent: GenerationIntentLayerV2,
): void {
  const resolved = resolvedCapabilityFromRuntimeSnapshotV2(capability)
  assertExpectedCapabilityRevisionV2(resolved.modelFacts.capabilityRevision)
  validateSemanticIntentAgainstResolvedCapabilityV2(resolved, intent)
}
