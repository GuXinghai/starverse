/**
 * Renderer-only presentation helpers for the Cloud Rules lifecycle panel.
 * Pure functions over the IPC read projection; they never decide what is applied.
 */

const I18N_PREFIX = 'settings.modelsCapabilities.cloud'

export type CloudRulesFreshnessState =
  | 'checking'
  | 'never_checked'
  | 'check_failed'
  | 'install_available'
  | 'update_available'
  | 'repair_available'
  | 'repair_check_needed'
  | 'pinned'
  | 'no_release'
  | 'not_installed'
  | 'up_to_date'

export type CloudRulesFreshnessInput = Readonly<{
  checking: boolean
  lastAttemptedAtMs?: number | null
  lastSuccessfulCheckAtMs?: number | null
  lastFailureCode?: string | null
  latestObservedContentRevision?: string | null
  hasCandidate: boolean
  appliedIntegrity?: 'missing' | 'valid' | 'invalid'
  appliedContentRevision?: string | null
  pinned: boolean
}>

/** lastFailureCode is cleared by every successful check, so its presence means the latest attempt failed. */
export function cloudRulesFreshnessState(input: CloudRulesFreshnessInput): CloudRulesFreshnessState {
  if (input.checking) return 'checking'
  if (input.lastFailureCode) return 'check_failed'
  if (input.hasCandidate) {
    if (input.appliedIntegrity === 'invalid') return 'repair_available'
    return input.appliedIntegrity === 'valid' ? 'update_available' : 'install_available'
  }
  if ((input.lastAttemptedAtMs ?? null) === null && (input.lastSuccessfulCheckAtMs ?? null) === null) {
    return 'never_checked'
  }
  if (input.appliedIntegrity === 'invalid') return 'repair_check_needed'
  if (input.pinned) return 'pinned'
  if (!input.latestObservedContentRevision) return 'no_release'
  if (input.appliedIntegrity !== 'valid') return 'not_installed'
  return input.latestObservedContentRevision === input.appliedContentRevision ? 'up_to_date' : 'not_installed'
}

export function cloudRulesFreshnessKey(state: CloudRulesFreshnessState): string {
  return `${I18N_PREFIX}.freshness.${state}`
}

export type CloudRulesCheckFailureKind =
  | 'network' | 'timeout' | 'aborted' | 'http' | 'redirect' | 'listing' | 'release_invalid'
  | 'version_drift' | 'persistence' | 'unknown'

export function cloudRulesCheckFailureKind(code: string | null | undefined): CloudRulesCheckFailureKind {
  switch (code) {
    case 'CLOUD_RULES_FETCH_FAILED': return 'network'
    case 'CLOUD_RULES_TIMEOUT': return 'timeout'
    case 'CLOUD_RULES_ABORTED': return 'aborted'
    case 'CLOUD_RULES_HTTP_INVALID': return 'http'
    case 'CLOUD_RULES_REDIRECT_SCHEME_INVALID':
    case 'CLOUD_RULES_REDIRECT_HOST_INVALID':
    case 'CLOUD_RULES_REDIRECT_USERINFO_INVALID':
    case 'CLOUD_RULES_REDIRECT_LOCATION_INVALID':
    case 'CLOUD_RULES_REDIRECT_LOOP': return 'redirect'
    case 'CLOUD_RULES_LISTING_INVALID':
    case 'CLOUD_RULES_LISTING_URL_INVALID':
    case 'CLOUD_RULES_LISTING_PAGINATION_LOOP': return 'listing'
    case 'CLOUD_RULES_RELEASE_INVALID':
    case 'CLOUD_RULES_ASSET_INVALID':
    case 'CLOUD_RULES_DOCUMENT_INVALID':
    case 'CLOUD_RULES_CONTENT_REVISION_INVALID':
    case 'CLOUD_RULES_PUBLICATION_FAILED': return 'release_invalid'
    case 'CLOUD_RULES_RELEASE_VERSION_DRIFT': return 'version_drift'
    case 'CLOUD_RULES_PERSISTENCE_FAILED': return 'persistence'
    default: return 'unknown'
  }
}

export function cloudRulesCheckFailureKey(code: string | null | undefined): string {
  return `${I18N_PREFIX}.checkFailure.${cloudRulesCheckFailureKind(code)}`
}

export type CloudRulesActionErrorKind =
  | 'stale' | 'candidate_not_found' | 'subject_set_stale' | 'lkg_corrupt' | 'invalid' | 'unavailable' | 'unknown'

/** Maps an IPC rejection (whose message embeds the main-process code) to a localized kind. */
export function cloudRulesActionErrorKind(cause: unknown): CloudRulesActionErrorKind {
  const message = cause instanceof Error ? cause.message : String(cause)
  if (message.includes('SUBJECT_SET_STALE')) return 'subject_set_stale'
  if (/CLOUD_RULES_[A-Z_]*STALE\b|CAPABILITY_RULES_IPC_STALE\b|DISTRIBUTION_STALE\b/u.test(message)) return 'stale'
  if (message.includes('CANDIDATE_NOT_FOUND') || message.includes('HISTORY_NOT_FOUND')) return 'candidate_not_found'
  if (message.includes('LKG_CORRUPT')) return 'lkg_corrupt'
  if (message.includes('CAPABILITY_RULES_UNAVAILABLE')) return 'unavailable'
  if (/CLOUD_RULES_[A-Z_]*INVALID\b|CAPABILITY_RULES_IPC_INVALID\b/u.test(message)) return 'invalid'
  return 'unknown'
}

/** Stale and not-found rejections mean the panel shows an outdated revision and must reload. */
export function cloudRulesActionErrorNeedsReload(kind: CloudRulesActionErrorKind): boolean {
  return kind === 'stale' || kind === 'candidate_not_found' || kind === 'subject_set_stale' || kind === 'lkg_corrupt'
}

export function cloudRulesActionErrorKey(kind: CloudRulesActionErrorKind): string {
  return `${I18N_PREFIX}.actionError.${kind}`
}

export function cloudRulesShortRevision(revision: string | null | undefined): string {
  if (!revision) return ''
  const hex = revision.startsWith('sha256:') ? revision.slice('sha256:'.length) : revision
  return hex.slice(0, 12)
}

type SelectorLike = Readonly<{ kind?: string; nativeModelIds?: readonly string[]; pattern?: string }> | null | undefined

export function cloudRuleSelectorSummary(selector: SelectorLike): string {
  if (!selector) return ''
  if (selector.kind === 'exact') return (selector.nativeModelIds ?? []).join(', ')
  if (selector.kind === 'regex') return `/${selector.pattern ?? ''}/`
  return ''
}

/** Short list-row hint: the first exact model id plus a count, or the regex pattern. */
export function cloudRuleSelectorHint(selector: SelectorLike): string {
  if (!selector) return ''
  if (selector.kind === 'exact') {
    const ids = selector.nativeModelIds ?? []
    if (ids.length === 0) return ''
    return ids.length === 1 ? ids[0]! : `${ids[0]} +${ids.length - 1}`
  }
  return cloudRuleSelectorSummary(selector)
}

/** A label equal to the assertion path adds nothing, so the stable Rule identity is shown instead. */
export function cloudRuleTitle(rule: Readonly<{ ruleId: string; label?: string | null; assertion?: Readonly<{ path?: string }> }>): string {
  const label = rule.label?.trim()
  return label && label !== rule.assertion?.path ? label : rule.ruleId
}

type DiffRule = Readonly<{
  ruleId: string
  label?: string | null
  description?: string | null
  priority?: number
  configured?: string
  providerAuthorityId?: string
  endpointProfileId?: string
  selector?: SelectorLike
  assertion?: Readonly<{ path?: string; value?: unknown }>
  evidence?: unknown
}>
type DiffPack = Readonly<{
  packId: string
  displayName?: string
  description?: string | null
  priority?: number
  mode?: string
  target?: string
  rules?: readonly DiffRule[]
}>
type DiffDocument = Readonly<{ releaseVersion?: string; packs?: readonly DiffPack[] }>

export type CloudRuleFieldChange = Readonly<{ field: CloudRuleDiffField; before: string; after: string }>
export type CloudRuleDiffField =
  | 'pack' | 'label' | 'description' | 'priority' | 'configured' | 'provider' | 'selector' | 'assertionPath'
  | 'assertionValue' | 'evidence'
export type CloudPackDiffField = 'displayName' | 'description' | 'priority' | 'mode' | 'target'

export type CloudRulesDocumentDiff = Readonly<{
  firstInstall: boolean
  currentReleaseVersion: string | null
  candidateReleaseVersion: string | null
  packs: Readonly<{
    added: readonly Readonly<{ packId: string; displayName: string; ruleCount: number }>[]
    removed: readonly Readonly<{ packId: string; displayName: string; ruleCount: number }>[]
    changed: readonly Readonly<{ packId: string; displayName: string; fields: readonly Readonly<{ field: CloudPackDiffField; before: string; after: string }>[] }>[]
  }>
  rules: Readonly<{
    added: readonly Readonly<{ ruleId: string; packId: string; title: string; path: string; selector: string; value: string }>[]
    removed: readonly Readonly<{ ruleId: string; packId: string; title: string; path: string; selector: string; value: string }>[]
    changed: readonly Readonly<{ ruleId: string; packId: string; title: string; changes: readonly CloudRuleFieldChange[] }>[]
  }>
  unchangedRuleCount: number
}>

function text(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  try { return JSON.stringify(value) } catch { return String(value) }
}

function parseDocument(value: unknown): DiffDocument | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') {
    try { return JSON.parse(value) as DiffDocument } catch { return null }
  }
  return typeof value === 'object' ? value as DiffDocument : null
}

function indexRules(document: DiffDocument | null): Map<string, Readonly<{ packId: string; rule: DiffRule }>> {
  const rules = new Map<string, Readonly<{ packId: string; rule: DiffRule }>>()
  for (const pack of document?.packs ?? []) {
    for (const rule of pack.rules ?? []) rules.set(rule.ruleId, { packId: pack.packId, rule })
  }
  return rules
}

function ruleSummary(packId: string, rule: DiffRule) {
  return Object.freeze({ ruleId: rule.ruleId, packId, title: cloudRuleTitle(rule), path: rule.assertion?.path ?? '',
    selector: cloudRuleSelectorSummary(rule.selector), value: text(rule.assertion?.value) })
}

/**
 * Semantic diff between the applied remote LKG document and the candidate document.
 * Rules are matched by stable ruleId across packs; packs by packId.
 */
export function diffCloudRulesDocuments(currentInput: unknown, candidateInput: unknown): CloudRulesDocumentDiff {
  const current = parseDocument(currentInput)
  const candidate = parseDocument(candidateInput)
  const currentPacks = new Map((current?.packs ?? []).map((pack) => [pack.packId, pack]))
  const candidatePacks = new Map((candidate?.packs ?? []).map((pack) => [pack.packId, pack]))
  const packSummary = (pack: DiffPack) => Object.freeze({ packId: pack.packId,
    displayName: pack.displayName ?? pack.packId, ruleCount: pack.rules?.length ?? 0 })

  const packFields: readonly CloudPackDiffField[] = ['displayName', 'description', 'priority', 'mode', 'target']
  const changedPacks = []
  for (const [packId, after] of candidatePacks) {
    const before = currentPacks.get(packId)
    if (!before) continue
    const fields = packFields.filter((field) => text(before[field]) !== text(after[field]))
      .map((field) => Object.freeze({ field, before: text(before[field]), after: text(after[field]) }))
    if (fields.length > 0) changedPacks.push(Object.freeze({ packId, displayName: after.displayName ?? packId, fields }))
  }

  const currentRules = indexRules(current)
  const candidateRules = indexRules(candidate)
  const addedRules = []
  const changedRules = []
  let unchangedRuleCount = 0
  for (const [ruleId, after] of candidateRules) {
    const before = currentRules.get(ruleId)
    if (!before) { addedRules.push(ruleSummary(after.packId, after.rule)); continue }
    const pairs: readonly [CloudRuleDiffField, string, string][] = [
      ['pack', before.packId, after.packId],
      ['label', text(before.rule.label), text(after.rule.label)],
      ['description', text(before.rule.description), text(after.rule.description)],
      ['priority', text(before.rule.priority), text(after.rule.priority)],
      ['configured', text(before.rule.configured), text(after.rule.configured)],
      ['provider', `${before.rule.providerAuthorityId ?? ''} / ${before.rule.endpointProfileId ?? ''}`,
        `${after.rule.providerAuthorityId ?? ''} / ${after.rule.endpointProfileId ?? ''}`],
      ['selector', cloudRuleSelectorSummary(before.rule.selector), cloudRuleSelectorSummary(after.rule.selector)],
      ['assertionPath', text(before.rule.assertion?.path), text(after.rule.assertion?.path)],
      ['assertionValue', text(before.rule.assertion?.value), text(after.rule.assertion?.value)],
      ['evidence', text(before.rule.evidence), text(after.rule.evidence)],
    ]
    const changes = pairs.filter(([, left, right]) => left !== right)
      .map(([field, left, right]) => Object.freeze({ field, before: left, after: right }))
    // Selector details beyond the summary (regex examples) still count as a selector change.
    if (!changes.some((change) => change.field === 'selector') &&
        text(before.rule.selector) !== text(after.rule.selector)) {
      changes.push(Object.freeze({ field: 'selector' as const, before: text(before.rule.selector), after: text(after.rule.selector) }))
    }
    if (changes.length === 0) unchangedRuleCount += 1
    else changedRules.push(Object.freeze({ ruleId, packId: after.packId, title: cloudRuleTitle(after.rule), changes }))
  }
  const removedRules = [...currentRules].filter(([ruleId]) => !candidateRules.has(ruleId))
    .map(([, entry]) => ruleSummary(entry.packId, entry.rule))

  return Object.freeze({
    firstInstall: current === null,
    currentReleaseVersion: current?.releaseVersion ?? null,
    candidateReleaseVersion: candidate?.releaseVersion ?? null,
    packs: Object.freeze({
      added: [...candidatePacks.values()].filter((pack) => !currentPacks.has(pack.packId)).map(packSummary),
      removed: [...currentPacks.values()].filter((pack) => !candidatePacks.has(pack.packId)).map(packSummary),
      changed: changedPacks,
    }),
    rules: Object.freeze({ added: addedRules, removed: removedRules, changed: changedRules }),
    unchangedRuleCount,
  })
}
