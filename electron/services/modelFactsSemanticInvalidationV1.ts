import type { ModelFactsSemanticInvalidationV1 } from '../../src/core/generation-v2/model-facts/semanticInvalidationV1'
import { CAPABILITY_RULE_SOURCE_SCOPE_ID_V1 } from '../../src/core/generation-v2/model-facts/semanticInvalidationV1'

export type ModelFactsSemanticInvalidationNotifierV1 = (event: ModelFactsSemanticInvalidationV1) => void | Promise<void>

/** Delivery is best effort after commit and cannot change a successful mutation result. */
export function notifyModelFactsSemanticInvalidationV1(
  notify: ModelFactsSemanticInvalidationNotifierV1 | undefined,
  event: ModelFactsSemanticInvalidationV1,
): void {
  try {
    const delivery = notify?.(Object.freeze(event))
    if (delivery) void Promise.resolve(delivery).catch(() => undefined)
  } catch { /* The authoritative mutation has already committed. */ }
}

/** Bootstrap retains the existing application authority; only a committed non-null result emits a signal. */
export async function applyBootstrapCapabilityRulesWithInvalidationV1<T extends Readonly<{ canonicalSourceRevision: string }>>(input: Readonly<{
  applyBootstrapCandidate: () => Promise<T | null>
  notify?: ModelFactsSemanticInvalidationNotifierV1
}>): Promise<T | null> {
  const result = await input.applyBootstrapCandidate()
  if (result !== null) notifyModelFactsSemanticInvalidationV1(input.notify, {
    kind: 'capability_rules', sourceScopeId: CAPABILITY_RULE_SOURCE_SCOPE_ID_V1,
    canonicalSourceRevision: result.canonicalSourceRevision,
  })
  return result
}
