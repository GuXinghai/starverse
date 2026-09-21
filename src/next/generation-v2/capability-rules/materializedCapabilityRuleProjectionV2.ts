import {
  canonicalizeModelFactsV2,
  canonicalizeModelCapabilityFieldV2,
  projectCanonicalModelFactsDraftV2,
} from '../capability/canonicalModelFactsV2'
import {
  authorizeResolvedCapabilityV2,
  type ResolvedCapabilityV2,
} from '../capability/resolvedCapabilityV2'
import {
  type ModelCapabilityDomainV2,
  type ModelCapabilityEvidenceEffectV2,
  type ModelCapabilityFieldStateV2,
  type ModelCapabilityScalarV2,
  type ModelCapabilitySemanticPathV2,
  type PersistedModelCapabilityFieldV2,
} from '../capability/modelCapabilitySchemaV2'
import {
  canonicalSourceFactDigestV1,
  type CanonicalFactAssertionV1,
  type CanonicalFactValueV1,
  type CanonicalSubjectFactPayloadV1,
  type CanonicalSubjectFactRefV1,
} from '../model-facts/canonicalSourceFactsV1'

export type MaterializedCapabilityRuleWinnerV2 = Readonly<CanonicalFactAssertionV1 & {
  claimRevision: string
  subjectFactRevision: string
  selectorKind: 'exact' | 'regex'
  effectiveRulePriority: number
  contentDigest: string
}>

export type CapabilityRuleEvidenceV2 = Readonly<{
  evidenceId: string
  kind: 'capability_rule'
  effect: ModelCapabilityEvidenceEffectV2
  sourceRef: string
  verifiedAt: null
  contentDigest: string
}>

type CapabilityRuleFieldOverlayV2 = Readonly<{
  path: ModelCapabilitySemanticPathV2
  state?: ModelCapabilityFieldStateV2
  domain?: ModelCapabilityDomainV2
  defaultValue?: ModelCapabilityScalarV2
  upperBound?: number
  requiredEnumValues?: readonly string[]
  imageSearchSupport?: 'supported' | 'unsupported'
  evidenceIds: readonly string[]
}>

type CapabilityRuleConsumerIdentityV2 = Readonly<{
  providerId: string
  endpointProfileId: string
  nativeModelId: string
}>

export type CapabilityRuleProjectionV2 = Readonly<{
  schemaVersion: 1
  identity: Readonly<{
    providerId: string
    endpointProfileId: string
    nativeModelId: string
  }>
  ruleSetRevision: string
  rules: readonly MaterializedCapabilityRuleWinnerV2[]
  claims: readonly MaterializedCapabilityRuleWinnerV2[]
  evidence: readonly CapabilityRuleEvidenceV2[]
  fields: readonly PersistedModelCapabilityFieldV2[]
  overlays: readonly CapabilityRuleFieldOverlayV2[]
}>

export class MaterializedCapabilityRuleProjectionV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_CAPABILITY_RULE_PROJECTION_INVALID'
    | 'GENERATION_V2_CAPABILITY_RULE_PROJECTION_CONFLICT') {
    super(code)
    this.name = 'MaterializedCapabilityRuleProjectionV2Error'
  }
}

const projections = new WeakSet<object>()

function invalid(): never {
  throw new MaterializedCapabilityRuleProjectionV2Error(
    'GENERATION_V2_CAPABILITY_RULE_PROJECTION_INVALID',
  )
}

function conflict(): never {
  throw new MaterializedCapabilityRuleProjectionV2Error(
    'GENERATION_V2_CAPABILITY_RULE_PROJECTION_CONFLICT',
  )
}

function hash(value: unknown): string {
  return canonicalSourceFactDigestV1(value)
}

function compare(left: string, right: string): number {
  return left.localeCompare(right, 'en')
}

function subjectFactRevision(payload: CanonicalSubjectFactPayloadV1): string {
  return `canonical-subject-fact-v1:${hash({
    canonicalSourceRevision: payload.sourceRevision.canonicalSourceRevision,
    subject: payload.subject,
    subjectFactPayloadDigest: payload.subjectFactPayloadDigest,
  })}`
}

function factInput(input: Readonly<{
  fact?: CanonicalSubjectFactPayloadV1
  subjectFact?: CanonicalSubjectFactPayloadV1
  payload?: CanonicalSubjectFactPayloadV1
  ref?: CanonicalSubjectFactRefV1
  canonicalSubjectFactRevision?: string
  identity?: CapabilityRuleConsumerIdentityV2
}> | CanonicalSubjectFactPayloadV1 | Readonly<{
  payload: CanonicalSubjectFactPayloadV1
  ref: CanonicalSubjectFactRefV1
  identity?: CapabilityRuleConsumerIdentityV2
}>): Readonly<{ payload: CanonicalSubjectFactPayloadV1; revision: string; identity: CapabilityRuleConsumerIdentityV2 }> {
  const candidate = input as Readonly<Record<string, unknown>>
  const payload = 'subject' in candidate
    ? input as CanonicalSubjectFactPayloadV1
    : candidate.payload !== undefined
      ? candidate.payload as CanonicalSubjectFactPayloadV1
      : candidate.fact !== undefined
        ? candidate.fact as CanonicalSubjectFactPayloadV1
        : candidate.subjectFact as CanonicalSubjectFactPayloadV1
  if (!payload || payload.sourceRevision?.sourceKind !== 'capability_rule' ||
      !payload.subjectFactPayloadDigest) return invalid()
  const derivedRevision = subjectFactRevision(payload)
  const ref = candidate.ref as CanonicalSubjectFactRefV1 | undefined
  const suppliedRevision = ref?.canonicalSubjectFactRevision ??
    candidate.canonicalSubjectFactRevision as string | undefined
  if (suppliedRevision !== undefined && suppliedRevision !== derivedRevision) return invalid()
  if (ref && (ref.subjectFactPayloadDigest !== payload.subjectFactPayloadDigest ||
      ref.sourceRevision.canonicalSourceRevision !== payload.sourceRevision.canonicalSourceRevision)) {
    return invalid()
  }
  const suppliedIdentity = candidate.identity as CapabilityRuleConsumerIdentityV2 | undefined
  const identity = suppliedIdentity ?? Object.freeze({ providerId: payload.subject.providerAuthorityId,
    endpointProfileId: payload.subject.endpointProfileId, nativeModelId: payload.subject.nativeModelId })
  if (![identity.providerId, identity.endpointProfileId, identity.nativeModelId].every((value) =>
    typeof value === 'string' && value.length > 0 && value.length <= 1024) ||
      identity.endpointProfileId !== payload.subject.endpointProfileId ||
      identity.nativeModelId !== payload.subject.nativeModelId) return invalid()
  return Object.freeze({ payload, revision: suppliedRevision ?? derivedRevision,
    identity: Object.freeze({ ...identity }) })
}

function claimFor(assertion: CanonicalFactAssertionV1): NonNullable<CanonicalFactAssertionV1['provenance']['ruleClaim']> {
  if (assertion.provenance.sourceKind !== 'capability_rule' || !assertion.provenance.ruleClaim) return invalid()
  return assertion.provenance.ruleClaim
}

function assertionValueDigest(assertion: CanonicalFactAssertionV1): string {
  return hash({ path: assertion.path, value: assertion.value })
}

function winnerKey(winner: MaterializedCapabilityRuleWinnerV2): string {
  return `${winner.path}\0${winner.contentDigest}\0${winner.provenance.claimId}`
}

function evidenceFor(
  winner: MaterializedCapabilityRuleWinnerV2,
  targetPath: ModelCapabilitySemanticPathV2,
  targetEffect: ModelCapabilityEvidenceEffectV2,
): CapabilityRuleEvidenceV2 {
  const evidenceDigest = hash({
    subjectFactRevision: winner.subjectFactRevision,
    canonicalSourceRevision: winner.provenance.canonicalSourceRevision,
    claimId: winner.provenance.claimId,
    sourceClaimIdentity: winner.provenance.sourceClaimIdentity,
    claimRevision: winner.claimRevision,
    path: winner.path,
    value: winner.value,
    targetPath,
    targetEffect,
  })
  return Object.freeze({
    evidenceId: `capability-rule-evidence-v2:${evidenceDigest}`,
    kind: 'capability_rule',
    effect: targetEffect,
    sourceRef: `capability-rule-claim-v2:${winner.subjectFactRevision}:${hash({
      canonicalSourceRevision: winner.provenance.canonicalSourceRevision,
      claimId: winner.provenance.claimId,
      sourceClaimIdentity: winner.provenance.sourceClaimIdentity,
      claimRevision: winner.claimRevision,
      targetPath,
      targetEffect,
    })}`,
    verifiedAt: null,
    contentDigest: winner.contentDigest,
  })
}

function supportState(value: CanonicalFactValueV1): 'supported' | 'unsupported' | null {
  return value.kind === 'support' ? value.value : null
}

function completeNativeValues(value: CanonicalFactValueV1): readonly string[] | null {
  if (value.kind !== 'native_string_set' || value.completeness !== 'complete' || value.values.length === 0) {
    return null
  }
  return value.values
}

function completeAspectRatios(value: CanonicalFactValueV1): readonly string[] | null {
  if (value.kind !== 'aspect_ratio_set' || value.completeness !== 'complete' || value.values.length === 0) {
    return null
  }
  return value.values.map((ratio) => `${ratio.width}:${ratio.height}`)
}

function scalarFitsDomain(value: ModelCapabilityScalarV2, domain: ModelCapabilityDomainV2): boolean {
  if (domain.kind === 'enum') return domain.values.includes(value)
  if (domain.kind === 'range') return typeof value === 'number' && value >= domain.min && value <= domain.max &&
    (!domain.integer || Number.isSafeInteger(value)) && !domain.excludedValues?.includes(value)
  if (domain.kind === 'boolean') return typeof value === 'boolean'
  if (domain.kind === 'identity') return typeof value === 'string'
  if (domain.kind === 'string') return typeof value === 'string' && value.length <= domain.maxLength
  return false
}

function addState(overlay: { state?: ModelCapabilityFieldStateV2 }, state: ModelCapabilityFieldStateV2): void {
  if (overlay.state !== undefined && overlay.state !== state) return conflict()
  overlay.state = state
}

function addDomain(overlay: { domain?: ModelCapabilityDomainV2 }, domain: ModelCapabilityDomainV2): void {
  if (overlay.domain !== undefined && hash(overlay.domain) !== hash(domain)) return conflict()
  overlay.domain = domain
}

function addDefault(overlay: { defaultValue?: ModelCapabilityScalarV2 }, value: ModelCapabilityScalarV2): void {
  if (overlay.defaultValue !== undefined &&
      hash(overlay.defaultValue) !== hash(value)) return conflict()
  overlay.defaultValue = value
}

function addEvidence(overlay: { evidenceIds: string[] }, evidenceId: string): void {
  if (!overlay.evidenceIds.includes(evidenceId)) overlay.evidenceIds.push(evidenceId)
}

function addContribution(
  overlays: Map<ModelCapabilitySemanticPathV2, {
    path: ModelCapabilitySemanticPathV2
    state?: ModelCapabilityFieldStateV2
    domain?: ModelCapabilityDomainV2
    defaultValue?: ModelCapabilityScalarV2
    upperBound?: number
    requiredEnumValues?: string[]
    imageSearchSupport?: 'supported' | 'unsupported'
    evidenceIds: string[]
  }>,
  path: ModelCapabilitySemanticPathV2,
  winner: MaterializedCapabilityRuleWinnerV2,
  evidenceById: Map<string, CapabilityRuleEvidenceV2>,
  contribution: (overlay: {
    path: ModelCapabilitySemanticPathV2
    state?: ModelCapabilityFieldStateV2
    domain?: ModelCapabilityDomainV2
    defaultValue?: ModelCapabilityScalarV2
    upperBound?: number
    requiredEnumValues?: string[]
    imageSearchSupport?: 'supported' | 'unsupported'
    evidenceIds: string[]
  }) => void,
): void {
  const overlay = overlays.get(path) ?? { path, evidenceIds: [] }
  contribution(overlay)
  const targetEffect: ModelCapabilityEvidenceEffectV2 = overlay.state === 'unsupported'
    ? 'rejects'
    : overlay.state === 'unknown'
      ? 'unknown'
      : overlay.state === 'requires_confirmation'
        ? 'requires_confirmation'
        : 'supports'
  const evidence = evidenceFor(winner, path, targetEffect)
  evidenceById.set(evidence.evidenceId, evidence)
  addEvidence(overlay, evidence.evidenceId)
  overlays.set(path, overlay)
}

function mapWinner(
  winner: MaterializedCapabilityRuleWinnerV2,
  overlays: Map<ModelCapabilitySemanticPathV2, {
    path: ModelCapabilitySemanticPathV2
    state?: ModelCapabilityFieldStateV2
    domain?: ModelCapabilityDomainV2
    defaultValue?: ModelCapabilityScalarV2
    upperBound?: number
    requiredEnumValues?: string[]
    imageSearchSupport?: 'supported' | 'unsupported'
    evidenceIds: string[]
  }>,
  evidenceById: Map<string, CapabilityRuleEvidenceV2>,
): void {
  const value = winner.value
  const state = supportState(value)
  const addRequiredEnumValue = (overlay: { requiredEnumValues?: string[] }, requiredValue: string) => {
    overlay.requiredEnumValues ??= []
    if (!overlay.requiredEnumValues.includes(requiredValue)) overlay.requiredEnumValues.push(requiredValue)
  }
  switch (winner.path) {
    case 'reasoning.support':
      if (!state) return invalid()
      addContribution(overlays, 'reasoning.mode', winner, evidenceById,
        (overlay) => {
          addState(overlay, state)
          if (state === 'supported') addRequiredEnumValue(overlay, 'enabled')
        })
      return
    case 'reasoning.effort.nativeValues':
    case 'generation.effort.nativeValues': {
      const values = completeNativeValues(value)
      if (!values) return invalid()
      addContribution(overlays, 'reasoning.effort', winner, evidenceById, (overlay) => {
        addState(overlay, 'supported')
        addDomain(overlay, { kind: 'enum', values })
      })
      return
    }
    case 'reasoning.effort.providerDefault':
    case 'generation.effort.providerDefault':
      if (value.kind !== 'native_string') return invalid()
      addContribution(overlays, 'reasoning.effort', winner, evidenceById, (overlay) => {
        addDefault(overlay, value.value)
      })
      return
    case 'image.generation.support':
      if (!state) return invalid()
      addContribution(overlays, 'image.mode', winner, evidenceById,
        (overlay) => {
          addState(overlay, state)
          if (state === 'supported') addRequiredEnumValue(overlay, 'generate')
        })
      return
    case 'image.generation.aspectRatios': {
      const values = completeAspectRatios(value)
      if (!values) return invalid()
      addContribution(overlays, 'image.aspectRatio', winner, evidenceById, (overlay) => {
        addState(overlay, 'supported')
        addDomain(overlay, { kind: 'enum', values })
      })
      return
    }
    case 'image.generation.resolutionPresets.nativeValues': {
      const values = completeNativeValues(value)
      if (!values) return invalid()
      addContribution(overlays, 'image.resolution', winner, evidenceById, (overlay) => {
        addState(overlay, 'supported')
        addDomain(overlay, { kind: 'enum', values })
      })
      return
    }
    case 'image.generation.resolutionPreset.providerDefault':
      if (value.kind !== 'native_string') return invalid()
      addContribution(overlays, 'image.resolution', winner, evidenceById, (overlay) => {
        addDefault(overlay, value.value)
      })
      return
    case 'search.web.support':
      if (!state) return invalid()
      addContribution(overlays, 'web.mode', winner, evidenceById,
        (overlay) => {
          addState(overlay, state)
          if (state === 'supported') addRequiredEnumValue(overlay, 'provider_search')
        })
      return
    case 'search.image.support':
      if (!state) return invalid()
      addContribution(overlays, 'web.types', winner, evidenceById, (overlay) => {
        if (overlay.imageSearchSupport !== undefined && overlay.imageSearchSupport !== state) return conflict()
        overlay.imageSearchSupport = state
        if (state === 'supported') addState(overlay, 'supported')
      })
      return
    case 'tools.calling.support':
      if (!state) return invalid()
      addContribution(overlays, 'tools.mode', winner, evidenceById,
        (overlay) => {
          addState(overlay, state)
          if (state === 'supported') addRequiredEnumValue(overlay, 'enabled')
        })
      return
    case 'limits.output.maxTokens':
      if (value.kind !== 'integer' || value.value < 1) return invalid()
      addContribution(overlays, 'generation.maxOutputTokens', winner, evidenceById, (overlay) => {
        if (overlay.upperBound !== undefined && overlay.upperBound !== value.value) return conflict()
        overlay.upperBound = value.value
        addState(overlay, 'supported')
      })
      return
    case 'sampling.temperature.support':
      if (!state) return invalid()
      addContribution(overlays, 'generation.temperature', winner, evidenceById,
        (overlay) => addState(overlay, state))
      return
    case 'sampling.temperature.providerDefault':
      if (value.kind !== 'decimal') return invalid()
      addContribution(overlays, 'generation.temperature', winner, evidenceById, (overlay) => {
        addDefault(overlay, value.value)
      })
      return
    case 'sampling.temperature.modelMaximum':
      if (value.kind !== 'decimal') return invalid()
      addContribution(overlays, 'generation.temperature', winner, evidenceById, (overlay) => {
        if (overlay.upperBound !== undefined && overlay.upperBound !== value.value) return conflict()
        overlay.upperBound = value.value
      })
      return
    case 'sampling.topK.support':
      if (!state) return invalid()
      addContribution(overlays, 'generation.topK', winner, evidenceById,
        (overlay) => addState(overlay, state))
      return
    case 'sampling.topK.providerDefault':
      if (value.kind !== 'integer') return invalid()
      addContribution(overlays, 'generation.topK', winner, evidenceById, (overlay) => {
        addDefault(overlay, value.value)
      })
      return
    case 'sampling.topP.providerDefault':
      if (value.kind !== 'decimal') return invalid()
      addContribution(overlays, 'generation.topP', winner, evidenceById, (overlay) => {
        addDefault(overlay, value.value)
      })
      return
    default:
      return invalid()
  }
}

function standaloneField(overlay: CapabilityRuleFieldOverlayV2): PersistedModelCapabilityFieldV2 | null {
  const candidate = {
    path: overlay.path,
    state: overlay.state ?? 'supported',
    ...(overlay.domain === undefined ? {} : { domain: overlay.domain }),
    ...(overlay.defaultValue === undefined || overlay.domain === undefined ||
      !scalarFitsDomain(overlay.defaultValue, overlay.domain) ? {} : { defaultValue: overlay.defaultValue }),
    constraints: [],
    evidenceIds: [...overlay.evidenceIds].sort(compare),
  }
  try {
    return canonicalizeModelCapabilityFieldV2(candidate)
  } catch {
    // A support-only Rule claim is a valid patch over a provider/API-contract field even when it
    // cannot form a standalone Generation Intent field without the base domain. The runtime uses
    // overlays below; this legacy summary remains sparse instead of inventing a domain.
    return null
  }
}

function resolveFact(
  normalized: Readonly<{ payload: CanonicalSubjectFactPayloadV1; revision: string;
    identity: CapabilityRuleConsumerIdentityV2 }>,
): CapabilityRuleProjectionV2 {
  const { payload, revision, identity } = normalized
  const candidates: MaterializedCapabilityRuleWinnerV2[] = []
  for (const outcome of payload.outcomes) {
    if (outcome.currentObservation.kind !== 'present_valid') continue
    const assertion = outcome.currentObservation.assertion
    const claim = claimFor(assertion)
    candidates.push(Object.freeze({ ...assertion,
      claimRevision: claim.ruleRevision, subjectFactRevision: revision,
      selectorKind: claim.selectorKind, effectiveRulePriority: claim.effectiveRulePriority,
      contentDigest: hash({ subjectFactRevision: revision, assertion }) }))
  }

  const winners: MaterializedCapabilityRuleWinnerV2[] = []
  const paths = [...new Set(candidates.map((candidate) => candidate.path))].sort(compare)
  for (const path of paths) {
    const matching = candidates.filter((candidate) => candidate.path === path)
    const exact = matching.some((candidate) => candidate.selectorKind === 'exact')
    const specific = matching.filter((candidate) => candidate.selectorKind === (exact ? 'exact' : 'regex'))
    const priority = Math.max(...specific.map((candidate) => candidate.effectiveRulePriority))
    const top = specific.filter((candidate) => candidate.effectiveRulePriority === priority)
    if (new Set(top.map(assertionValueDigest)).size !== 1) return conflict()
    winners.push(...top.sort((left, right) => compare(winnerKey(left), winnerKey(right))))
  }

  const evidenceById = new Map<string, CapabilityRuleEvidenceV2>()
  const overlayMap = new Map<ModelCapabilitySemanticPathV2, {
    path: ModelCapabilitySemanticPathV2
    state?: ModelCapabilityFieldStateV2
    domain?: ModelCapabilityDomainV2
    defaultValue?: ModelCapabilityScalarV2
    upperBound?: number
    requiredEnumValues?: string[]
    imageSearchSupport?: 'supported' | 'unsupported'
    evidenceIds: string[]
  }>()
  for (const winner of winners) mapWinner(winner, overlayMap, evidenceById)
  const evidence = [...evidenceById.values()].sort((left, right) => compare(left.evidenceId, right.evidenceId))
  const overlays = [...overlayMap.values()].map((overlay) => Object.freeze({
    ...overlay,
    evidenceIds: Object.freeze([...overlay.evidenceIds].sort(compare)),
  })).sort((left, right) => compare(left.path, right.path))
  const fields = overlays.flatMap((overlay) => {
    const field = standaloneField(overlay)
    return field === null ? [] : [field]
  })
  const ruleSetRevision = `capability-rule-set-v2:${hash({
    canonicalSourceRevision: payload.sourceRevision.canonicalSourceRevision,
    subjectFactRevision: revision, identity,
    winners: winners.map((winner) => winner.contentDigest),
  })}`
  const projection = Object.freeze({ schemaVersion: 1 as const, identity, ruleSetRevision,
    rules: Object.freeze(winners), claims: Object.freeze(winners), evidence: Object.freeze(evidence),
    fields: Object.freeze(fields), overlays: Object.freeze(overlays) })
  projections.add(projection)
  return projection
}

export function projectMaterializedCapabilityRuleProjectionV2(
  input: Readonly<{
    fact?: CanonicalSubjectFactPayloadV1
    subjectFact?: CanonicalSubjectFactPayloadV1
    payload?: CanonicalSubjectFactPayloadV1
    ref?: CanonicalSubjectFactRefV1
    canonicalSubjectFactRevision?: string
    identity?: CapabilityRuleConsumerIdentityV2
  }> | CanonicalSubjectFactPayloadV1 | Readonly<{
    payload: CanonicalSubjectFactPayloadV1
    ref: CanonicalSubjectFactRefV1
    identity?: CapabilityRuleConsumerIdentityV2
  }>,
): CapabilityRuleProjectionV2 {
  return resolveFact(factInput(input))
}

export const projectMaterializedCapabilityRuleFactV2 = projectMaterializedCapabilityRuleProjectionV2
export const projectCapabilityRuleClaimsV2 = projectMaterializedCapabilityRuleProjectionV2

export function assertCapabilityRuleProjectionIdentityV2(
  projection: CapabilityRuleProjectionV2,
  identity: Readonly<{ providerId: string; endpointProfileId: string; nativeModelId: string }>,
): void {
  if (!projection || typeof projection !== 'object' || !projections.has(projection) ||
      projection.identity.providerId !== identity.providerId ||
      projection.identity.endpointProfileId !== identity.endpointProfileId ||
      projection.identity.nativeModelId !== identity.nativeModelId) return invalid()
}

function applyOverlay(
  base: PersistedModelCapabilityFieldV2,
  overlay: CapabilityRuleFieldOverlayV2,
): PersistedModelCapabilityFieldV2 {
  let domain = overlay.domain ?? base.domain
  if (overlay.upperBound !== undefined) {
    if (domain?.kind !== 'range') return invalid()
    const max = Math.min(domain.max, overlay.upperBound)
    if (domain.min > max) return invalid()
    domain = Object.freeze({ ...domain, max })
  }
  if (overlay.requiredEnumValues && overlay.requiredEnumValues.length > 0) {
    if (domain === undefined) {
      domain = Object.freeze({ kind: 'enum' as const,
        values: Object.freeze([...overlay.requiredEnumValues].sort(compare)) })
    } else if (domain.kind === 'enum') {
      if (!domain.values.every((value) => typeof value === 'string')) return invalid()
      domain = Object.freeze({ ...domain,
        values: Object.freeze([...new Set([...domain.values as readonly string[],
          ...overlay.requiredEnumValues])].sort(compare)) })
    } else return invalid()
  }
  if (overlay.imageSearchSupport !== undefined) {
    if (domain === undefined && overlay.imageSearchSupport === 'supported') {
      domain = Object.freeze({ kind: 'enum_list' as const, values: Object.freeze(['image']), maxItems: 2 })
    } else if (domain?.kind === 'enum_list') {
      if (!domain.values.every((value) => typeof value === 'string')) return invalid()
      const values = overlay.imageSearchSupport === 'supported'
        ? [...new Set([...domain.values as readonly string[], 'image'])].sort(compare)
        : domain.values.filter((value: ModelCapabilityScalarV2) => value !== 'image')
      if (values.length === 0) return invalid()
      domain = Object.freeze({ ...domain, values: Object.freeze(values) })
    } else return invalid()
  }
  const state = overlay.state ?? base.state
  if (overlay.state === undefined && state !== 'supported') return invalid()
  const defaultValue = overlay.defaultValue ?? base.defaultValue
  const terminalState = state === 'unsupported' || state === 'unknown' || state === 'missing'
  if (!terminalState && defaultValue !== undefined &&
      (domain === undefined || !scalarFitsDomain(defaultValue, domain))) return invalid()
  const validDefault = !terminalState && defaultValue !== undefined ? { defaultValue } : {}
  const evidenceIds = overlay.state === undefined
    ? [...new Set([...base.evidenceIds, ...overlay.evidenceIds])].sort(compare)
    : [...overlay.evidenceIds].sort(compare)
  const candidate = {
    path: base.path,
    state,
    ...(terminalState ? {} :
      domain === undefined ? {} : { domain }),
    ...(terminalState ? {} : validDefault),
    constraints: terminalState
      ? [] : base.constraints,
    evidenceIds,
  }
  try {
    return canonicalizeModelCapabilityFieldV2(candidate)
  } catch {
    return invalid()
  }
}

export function applyCapabilityRuleProjectionV2(input: Readonly<{
  baseEvidence: readonly Readonly<Record<string, unknown>>[]
  baseFields: readonly PersistedModelCapabilityFieldV2[]
  projection: CapabilityRuleProjectionV2
}>): Readonly<{
  evidence: readonly Readonly<Record<string, unknown>>[]
  fields: readonly PersistedModelCapabilityFieldV2[]
}> {
  assertCapabilityRuleProjectionIdentityV2(input.projection, input.projection.identity)
  const overlays = new Map(input.projection.overlays.map((overlay) => [overlay.path, overlay]))
  return Object.freeze({
    evidence: Object.freeze([...input.baseEvidence, ...input.projection.evidence]),
    fields: Object.freeze(input.baseFields.map((field) => {
      const overlay = overlays.get(field.path)
      return overlay === undefined ? field : applyOverlay(field, overlay)
    })),
  })
}

/**
 * Applies the temporary Rules-only consumer projection to an already authorized capability,
 * then re-authorizes the exact same execution context. This does not merge sources or reinterpret
 * the frozen Rule claims; it only lets provider paths that already produce ResolvedCapabilityV2
 * consume the same materialized exact-subject authority.
 */
export function applyCapabilityRuleProjectionToResolvedCapabilityV2(input: Readonly<{
  capability: ResolvedCapabilityV2
  projection: CapabilityRuleProjectionV2
}>): ResolvedCapabilityV2 {
  const binding = input.capability.executionContext.binding
  assertCapabilityRuleProjectionIdentityV2(input.projection, {
    providerId: binding.providerId.value,
    endpointProfileId: binding.endpointProfileId.value,
    nativeModelId: binding.modelId.value,
  })
  const base = projectCanonicalModelFactsDraftV2(input.capability.modelFacts)
  const merged = applyCapabilityRuleProjectionV2({
    baseEvidence: base.evidence,
    baseFields: base.fields,
    projection: input.projection,
  })
  const modelFacts = canonicalizeModelFactsV2({ identity: base.identity,
    evidence: merged.evidence, fields: merged.fields })
  return authorizeResolvedCapabilityV2({
    modelFacts,
    binding,
    ...(input.capability.executionContext.catalogAuthority
      ? { catalogAuthority: input.capability.executionContext.catalogAuthority }
      : {}),
    continuation: input.capability.executionContext.continuation,
  })
}
