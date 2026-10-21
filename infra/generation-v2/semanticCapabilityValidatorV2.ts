import type { GenerationIntentLayerV2 } from '../../src/core/generation-v2/domain/generationIntentV2'
import {
  resolvedCapabilityFromRuntimeSnapshotV2,
  validateSemanticIntentAgainstResolvedCapabilityV2,
} from '../../src/core/generation-v2/capability/resolvedCapabilityV2'
import type { DecodedRuntimeCapabilitySnapshotV2 } from '../../src/core/generation-v2/capability/runtimeCapabilitySnapshotV2'
import { assertExpectedCapabilityRevisionV2 } from './capabilityRevisionExpectationV2'
import { assertEffectiveRequestPlanV2, type EffectiveRequestPlanV2 } from '../../src/core/generation-v2/compiler/effectiveRequestPlanV2'
import { assertResolvedInvocationBindingV2 } from '../../src/core/generation-v2/compiler/resolvedInvocationV2'

/**
 * Compiler-side defence-in-depth for the same resolved capability record that
 * was used by the command authority.  Protocol codecs still own wire shape;
 * this helper only prevents a compiler from widening semantic intent.
 */
export function validateGenerationExecutionCapabilityV2(
  capability: DecodedRuntimeCapabilitySnapshotV2,
  intent: GenerationIntentLayerV2,
  plan?: EffectiveRequestPlanV2,
): void {
  const resolved = resolvedCapabilityFromRuntimeSnapshotV2(capability)
  assertExpectedCapabilityRevisionV2(resolved.modelFacts.capabilityRevision)
  if (plan?.schemaVersion === 2 && plan.resolution) {
    assertEffectiveRequestPlanV2(plan, intent, capability.binding, capability.revision.value, capability.encoderRevision)
    assertResolvedInvocationBindingV2(plan.resolution, { effective: intent, binding: capability.binding,
      capabilityRevision: capability.revision.value, encoderRevision: capability.encoderRevision,
      semanticFieldsDigest: capability.semanticFieldsDigest.value })
    // Model policy was resolved once before the snapshot commit. Frozen retries
    // verify its binding, never reinterpret today's Rules or the static catalog.
    return
  }
  validateSemanticIntentAgainstResolvedCapabilityV2(resolved, intent)
}
