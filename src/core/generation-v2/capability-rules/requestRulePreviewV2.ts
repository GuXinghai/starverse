import type { GenerationCapabilityResolutionResultV2 } from '../capability/capabilityResolutionV2'
import type { GenerationIntentLayerV2 } from '../domain/generationIntentV2'
import { canonicalizeResolvedCapabilityV2, projectGenerationControlsProjectionV2 } from '../capability/resolvedCapabilityV2'
import { resolveRequestRulesV2 } from './requestRuleResolverV2'
import { projectRequestFactOverlayV2 } from './requestFactOverlayV2'
import { decodeBoundRequestRulesV2 } from './boundRequestRulesV2'

/** Presentation only. The backend independently resolves current authority again when submitting. */
export function previewRequestRuleControlsV2(result: GenerationCapabilityResolutionResultV2, requested: GenerationIntentLayerV2) {
  const preview = result.requestRulePreview
  if (!preview) return result.controlsProjection
  const wire = result.resolvedCapability
  const capability = canonicalizeResolvedCapabilityV2({ binding: wire.executionContext.binding,
    catalogAuthority: wire.executionContext.catalogAuthority as never, evidence: wire.modelFacts.evidence,
    fields: wire.modelFacts.fields, capabilityRevision: wire.modelFacts.capabilityRevision,
    modelFactsResolution: wire.modelFactsResolution, continuation: wire.executionContext.continuation })
  const resolution = resolveRequestRulesV2({ requested, capability, bundle: decodeBoundRequestRulesV2(preview.bundle), validationMode: 'preview',
    resolveFacts: claims => projectRequestFactOverlayV2({ base: preview.baseFacts, capability, sourcePriority: preview.sourcePriority, claims }) })
  return projectGenerationControlsProjectionV2({ ...capability, modelFacts: { ...capability.modelFacts,
    fields: resolution.capabilityFields, evidence: resolution.capabilityEvidence } })
}
