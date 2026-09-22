import {
  authorizeResolvedCapabilityV2,
  composeRuntimeSnapshotFromResolvedCapabilityV2,
  type ResolvedCapabilityV2,
} from '../../src/next/generation-v2/capability/resolvedCapabilityV2'
import {
  canonicalizeModelFactsV2,
  projectCanonicalModelIdentityV2,
} from '../../src/next/generation-v2/capability/canonicalModelFactsV2'
import { assertExpectedCapabilityRevisionV2 } from '../../src/next/generation-v2/capability/capabilityRevisionExpectationV2'
import type {
  DecodedRuntimeCapabilitySnapshotV2,
  PersistedRuntimeToolCapabilityV2,
} from '../../src/next/generation-v2/capability/runtimeCapabilitySnapshotV2'
import type { DecodedProviderBindingRecordV2 } from '../../src/next/generation-v2/domain/providerBindingV2'
import {
  readGenerationV2AuthorityTransactionDatabaseV2,
  type GenerationV2AuthorityTransactionContextV2,
} from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { resolveGoal3ModelFactsForBindingV1 } from './goal3ModelFactsCapabilityV1'

/**
 * Re-resolves only for a new current-send snapshot. Retry/replay callers keep
 * using their originating persisted snapshot and never enter this helper.
 */
export function createGoal3RuntimeSnapshotV1(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  capability: ResolvedCapabilityV2
  binding: DecodedProviderBindingRecordV2
  credentialRevision: number
  resolvedAt: string
  tools: readonly PersistedRuntimeToolCapabilityV2[]
}>): DecodedRuntimeCapabilitySnapshotV2 {
  const db = readGenerationV2AuthorityTransactionDatabaseV2(input.context)
  const binding = input.binding
  const goal3 = resolveGoal3ModelFactsForBindingV1({
    db, binding, credentialRevision: input.credentialRevision, inActiveTransaction: true,
  })
  const runtimeIdentity = projectCanonicalModelIdentityV2(binding)
  if (runtimeIdentity.endpointProfileId !== goal3.subject.endpointProfileId ||
      runtimeIdentity.nativeModelId !== goal3.subject.nativeModelId) {
    throw new Error('GENERATION_V2_GOAL3_SNAPSHOT_BINDING_SUBJECT_MISMATCH')
  }
  assertExpectedCapabilityRevisionV2(goal3.modelFacts.capabilityRevision)

  // Tool and continuation evidence are execution-layer evidence. Retain it so
  // the existing runtime codec can validate those frozen records, while every
  // semantic field below comes only from Goal 3.
  const goal3EvidenceIds = new Set(goal3.modelFacts.evidence.map((item) => item.evidenceId))
  const combinedFacts = canonicalizeModelFactsV2({
    identity: projectCanonicalModelIdentityV2(binding),
    evidence: [
      ...goal3.modelFacts.evidence.map((item) => ({ evidenceId: item.evidenceId, kind: item.kind,
        effect: item.effect, sourceRef: item.sourceRef, verifiedAt: item.verifiedAt, contentDigest: item.contentDigest.value })),
        ...input.capability.modelFacts.evidence
        .filter((item) => !goal3EvidenceIds.has(item.evidenceId))
        .map((item) => ({ evidenceId: item.evidenceId, kind: item.kind, effect: item.effect,
          sourceRef: item.sourceRef, verifiedAt: item.verifiedAt, contentDigest: item.contentDigest.value })),
    ],
    fields: goal3.modelFacts.fields,
    capabilityRevision: goal3.modelFacts.capabilityRevision,
  })
  const capability = authorizeResolvedCapabilityV2({
    modelFacts: combinedFacts,
    modelFactsResolution: goal3.snapshot,
    binding,
    ...(input.capability.executionContext.catalogAuthority === undefined ? {} : {
      catalogAuthority: input.capability.executionContext.catalogAuthority,
    }),
    continuation: input.capability.executionContext.continuation,
  })
  return composeRuntimeSnapshotFromResolvedCapabilityV2({
    capability, resolvedAt: input.resolvedAt, tools: input.tools,
  })
}
