import { decodeResolvedGenerationIntentV2 } from '../domain/resolvedGenerationIntentV2'
import { projectGenerationIntentLayerV2 } from '../domain/generationIntentProjectionV2'
import { projectDecodedProviderBindingRecordV2 } from '../domain/providerBindingV2'
import type { GenerationIntentLayerV2 } from '../domain/generationIntentV2'
import type { ResolvedCapabilityV2 } from '../capability/resolvedCapabilityV2'
import { sha256Hex } from '../../../shared/crypto/sha256Hex'
import { stableSerializeProviderRequestBoundedV2 } from './stableSerialize'
import type { RequestAdaptationV2 } from './requestAdaptationV2'
import { decodeResolvedInvocationV2, assertResolvedInvocationBindingV2, type ResolvedInvocationV2 } from './resolvedInvocationV2'

export const EFFECTIVE_REQUEST_PLAN_POLICY_V2 = 'target-request-contract-20261017-v1'
export const EFFECTIVE_REQUEST_PLAN_MAX_BYTES_V2 = 1024 * 1024
type Decision = Readonly<{ path: string; outcome: RequestAdaptationV2['outcome']; reason: string; sourceDigest?: string }>

/** The snapshot supplies effective intent; the plan retains its original and the exact resolving authority. */
export type EffectiveRequestPlanV2 = Readonly<{
  schemaVersion: 1 | 2
  policyRevision: string
  requestedIntent: Readonly<Record<string, unknown>>
  effectiveIntentDigest: string
  targetFingerprint: string
  capabilityRevision: string
  encoderRevision: string
  resolution?: ResolvedInvocationV2
  decisions: readonly Decision[]
  planHash: string
}>

function canonical(value: unknown): string {
  return stableSerializeProviderRequestBoundedV2(value, EFFECTIVE_REQUEST_PLAN_MAX_BYTES_V2)
}
export function requestIntentDigestV2(value: GenerationIntentLayerV2): string {
  return sha256Hex(canonical(projectGenerationIntentLayerV2(value)))
}
function freezeJson<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeJson(child)
    Object.freeze(value)
  }
  return value
}

export function createEffectiveRequestPlanV2(input: Readonly<{
  requested: GenerationIntentLayerV2
  effective: GenerationIntentLayerV2
  capability: ResolvedCapabilityV2
  decisions: readonly RequestAdaptationV2[]
  resolution?: ResolvedInvocationV2
}>): EffectiveRequestPlanV2 {
  const payload = {
    schemaVersion: input.resolution ? 2 as const : 1 as const,
    policyRevision: input.resolution ? input.resolution.resolverRevision : EFFECTIVE_REQUEST_PLAN_POLICY_V2,
    ...(input.resolution ? { resolution: input.resolution } : {}),
    requestedIntent: projectGenerationIntentLayerV2(decodeResolvedGenerationIntentV2(projectGenerationIntentLayerV2(input.requested)).value),
    effectiveIntentDigest: requestIntentDigestV2(input.effective),
    targetFingerprint: sha256Hex(canonical(projectDecodedProviderBindingRecordV2(input.capability.executionContext.binding))),
    capabilityRevision: input.capability.modelFacts.capabilityRevision,
    encoderRevision: input.capability.executionContext.encodingCoverage.encoderRevision,
    decisions: input.decisions.filter(decision => decision.path !== 'requestedIntent').map(decision => ({
      path: decision.path, outcome: decision.outcome, reason: decision.reason,
      ...(decision.source === undefined ? {} : { sourceDigest: sha256Hex(canonical(decision.source)) }),
    })),
  }
  return decodeEffectiveRequestPlanV2({ ...payload, planHash: sha256Hex(canonical(payload)) })
}

export function decodeEffectiveRequestPlanV2(value: unknown): EffectiveRequestPlanV2 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('GENERATION_V2_REQUEST_PLAN_INVALID')
  const input = JSON.parse(canonical(value)) as Record<string, unknown>
  const keys = ['schemaVersion', 'policyRevision', 'requestedIntent', 'effectiveIntentDigest', 'targetFingerprint',
    'capabilityRevision', 'encoderRevision', 'decisions', 'planHash']
  if (input.schemaVersion === 2) keys.push('resolution')
  const digest = (entry: unknown) => typeof entry === 'string' && /^[0-9a-f]{64}$/u.test(entry)
  if (Object.keys(input).sort().join('\0') !== keys.sort().join('\0') || ![1, 2].includes(input.schemaVersion as number) ||
      typeof input.policyRevision !== 'string' || !input.policyRevision ||
      typeof input.capabilityRevision !== 'string' || !input.capabilityRevision ||
      typeof input.encoderRevision !== 'string' || !input.encoderRevision ||
      !digest(input.effectiveIntentDigest) || !digest(input.targetFingerprint) || !digest(input.planHash) ||
      !Array.isArray(input.decisions)) throw new Error('GENERATION_V2_REQUEST_PLAN_INVALID')
  for (const decision of input.decisions as Record<string, unknown>[]) {
    if (!decision || typeof decision !== 'object' || Array.isArray(decision) ||
        Object.keys(decision).some(key => !['path', 'outcome', 'reason', 'sourceDigest'].includes(key)) ||
        typeof decision.path !== 'string' || !decision.path || typeof decision.reason !== 'string' || !decision.reason ||
        !['converted', 'deferred', 'preserved'].includes(decision.outcome as string) ||
        decision.sourceDigest !== undefined && !digest(decision.sourceDigest)) throw new Error('GENERATION_V2_REQUEST_PLAN_INVALID')
  }
  const requested = decodeResolvedGenerationIntentV2(input.requestedIntent)
  if (input.schemaVersion === 2) {
    const resolution = decodeResolvedInvocationV2(input.resolution)
    if (resolution.requestedIntentDigest !== requestIntentDigestV2(requested.value) ||
        resolution.effectiveIntentDigest !== input.effectiveIntentDigest || resolution.targetFingerprint !== input.targetFingerprint ||
        resolution.baseCapabilityRevision !== input.capabilityRevision || resolution.encoderRevision !== input.encoderRevision ||
        resolution.resolverRevision !== input.policyRevision) throw new Error('GENERATION_V2_REQUEST_PLAN_BINDING_MISMATCH')
  }
  if (canonical(projectGenerationIntentLayerV2(requested.value)) !== canonical(input.requestedIntent)) {
    throw new Error('GENERATION_V2_REQUEST_PLAN_INVALID')
  }
  const { planHash, ...payload } = input
  if (sha256Hex(canonical(payload)) !== planHash) throw new Error('GENERATION_V2_REQUEST_PLAN_HASH_MISMATCH')
  return freezeJson(input) as unknown as EffectiveRequestPlanV2
}

export function assertEffectiveRequestPlanV2(plan: EffectiveRequestPlanV2, effective: GenerationIntentLayerV2,
  binding: Parameters<typeof projectDecodedProviderBindingRecordV2>[0], capabilityRevision: string, encoderRevision?: string): void {
  if (plan.effectiveIntentDigest !== requestIntentDigestV2(effective) || plan.capabilityRevision !== capabilityRevision ||
      plan.targetFingerprint !== sha256Hex(canonical(projectDecodedProviderBindingRecordV2(binding))) ||
      encoderRevision !== undefined && plan.encoderRevision !== encoderRevision) {
    throw new Error('GENERATION_V2_REQUEST_PLAN_BINDING_MISMATCH')
  }
  if (plan.resolution) assertResolvedInvocationBindingV2(plan.resolution, { requested: decodeResolvedGenerationIntentV2(plan.requestedIntent).value,
    effective, binding, capabilityRevision, encoderRevision: encoderRevision ?? plan.encoderRevision })
}
