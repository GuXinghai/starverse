import { describe, expect, it } from 'vitest'
import {
  cloudRuleSelectorHint,
  cloudRuleTitle,
  cloudRulesActionErrorKind,
  cloudRulesActionErrorNeedsReload,
  cloudRulesCheckFailureKind,
  cloudRulesFreshnessState,
  cloudRulesShortRevision,
  diffCloudRulesDocuments,
} from './cloudRulesPresentation'
import { modelFactRuleClaimIdentity } from './modelFactPresentation'

const base = { checking: false, lastAttemptedAtMs: 1, lastSuccessfulCheckAtMs: 1, lastFailureCode: null,
  latestObservedContentRevision: 'sha256:a', hasCandidate: false, appliedIntegrity: 'valid' as const,
  appliedContentRevision: 'sha256:a', pinned: false }

describe('cloudRulesFreshnessState', () => {
  it('distinguishes a failed check from up to date', () => {
    expect(cloudRulesFreshnessState(base)).toBe('up_to_date')
    expect(cloudRulesFreshnessState({ ...base, lastFailureCode: 'CLOUD_RULES_TIMEOUT' })).toBe('check_failed')
  })

  it('covers checking, first run, candidates, repair, pin and no release', () => {
    expect(cloudRulesFreshnessState({ ...base, checking: true })).toBe('checking')
    expect(cloudRulesFreshnessState({ ...base, lastAttemptedAtMs: null, lastSuccessfulCheckAtMs: null,
      appliedIntegrity: 'missing' })).toBe('never_checked')
    expect(cloudRulesFreshnessState({ ...base, hasCandidate: true })).toBe('update_available')
    expect(cloudRulesFreshnessState({ ...base, hasCandidate: true, appliedIntegrity: 'missing' })).toBe('install_available')
    expect(cloudRulesFreshnessState({ ...base, hasCandidate: true, appliedIntegrity: 'invalid' })).toBe('repair_available')
    expect(cloudRulesFreshnessState({ ...base, appliedIntegrity: 'invalid' })).toBe('repair_check_needed')
    expect(cloudRulesFreshnessState({ ...base, pinned: true, latestObservedContentRevision: 'sha256:b' })).toBe('pinned')
    expect(cloudRulesFreshnessState({ ...base, latestObservedContentRevision: null })).toBe('no_release')
    expect(cloudRulesFreshnessState({ ...base, appliedIntegrity: 'missing', appliedContentRevision: null })).toBe('not_installed')
  })
})

describe('Cloud Rules error mapping', () => {
  it('maps every refresh failure family to a readable kind', () => {
    expect(cloudRulesCheckFailureKind('CLOUD_RULES_FETCH_FAILED')).toBe('network')
    expect(cloudRulesCheckFailureKind('CLOUD_RULES_HTTP_INVALID')).toBe('http')
    expect(cloudRulesCheckFailureKind('CLOUD_RULES_REDIRECT_LOOP')).toBe('redirect')
    expect(cloudRulesCheckFailureKind('CLOUD_RULES_DOCUMENT_INVALID')).toBe('release_invalid')
    expect(cloudRulesCheckFailureKind('CLOUD_RULES_RELEASE_VERSION_DRIFT')).toBe('version_drift')
    expect(cloudRulesCheckFailureKind('SOMETHING_NEW')).toBe('unknown')
  })

  it('reloads on stale and not-found action rejections only', () => {
    const remote = (code: string) => new Error(`Error invoking remote method 'x': Error: ${code}`)
    expect(cloudRulesActionErrorKind(remote('GENERATION_V2_CLOUD_RULES_APPLICATION_STALE'))).toBe('stale')
    expect(cloudRulesActionErrorKind(remote('GENERATION_V2_CLOUD_CAPABILITY_RULES_IPC_STALE'))).toBe('stale')
    expect(cloudRulesActionErrorKind(remote('GENERATION_V2_CLOUD_RULES_APPLICATION_SUBJECT_SET_STALE'))).toBe('subject_set_stale')
    expect(cloudRulesActionErrorKind(remote('GENERATION_V2_CLOUD_RULES_APPLICATION_CANDIDATE_NOT_FOUND'))).toBe('candidate_not_found')
    expect(cloudRulesActionErrorKind(remote('GENERATION_V2_CLOUD_CAPABILITY_RULES_IPC_INVALID'))).toBe('invalid')
    expect(cloudRulesActionErrorNeedsReload('stale')).toBe(true)
    expect(cloudRulesActionErrorNeedsReload('invalid')).toBe(false)
  })
})

describe('Cloud Rule list readability', () => {
  it('uses the Rule identity when the label repeats the assertion path', () => {
    expect(cloudRuleTitle({ ruleId: 'r1', label: 'reasoning.support', assertion: { path: 'reasoning.support' } })).toBe('r1')
    expect(cloudRuleTitle({ ruleId: 'r1', label: 'Thinking', assertion: { path: 'reasoning.support' } })).toBe('Thinking')
    expect(cloudRuleSelectorHint({ kind: 'exact', nativeModelIds: ['a', 'b', 'c'] })).toBe('a +2')
    expect(cloudRuleSelectorHint({ kind: 'regex', pattern: '^a' })).toBe('/^a/')
    expect(cloudRulesShortRevision('sha256:' + '0123456789abcdef'.repeat(4))).toBe('0123456789ab')
  })
})

describe('diffCloudRulesDocuments', () => {
  const rule = (ruleId: string, extra: Record<string, unknown> = {}) => ({ ruleId, label: null, description: null,
    priority: 0, configured: 'default', providerAuthorityId: 'p', endpointProfileId: 'e',
    selector: { kind: 'exact', nativeModelIds: ['m1'] },
    assertion: { path: 'reasoning.support', value: { kind: 'support', value: 'supported' } }, evidence: null, ...extra })
  const pack = (packId: string, rules: unknown[], extra: Record<string, unknown> = {}) => ({ packId, displayName: packId,
    description: null, priority: 0, mode: 'no_control', target: 'enabled', rules, ...extra })

  it('treats a first install as all-added', () => {
    const diff = diffCloudRulesDocuments(null, JSON.stringify({ releaseVersion: '1.0.0', packs: [pack('a', [rule('r1'), rule('r2')])] }))
    expect(diff.firstInstall).toBe(true)
    expect(diff.packs.added).toHaveLength(1)
    expect(diff.rules.added.map((entry) => entry.ruleId)).toEqual(['r1', 'r2'])
  })

  it('reports pack and rule additions, removals and meaningful field changes', () => {
    const current = { releaseVersion: '1.0.0', packs: [pack('a', [rule('keep'), rule('change'), rule('regex',
      { selector: { kind: 'regex', pattern: '^m', positiveExamples: ['m1'], negativeExamples: [] } })]), pack('gone', [rule('dropped')])] }
    const candidate = { releaseVersion: '1.1.0', packs: [pack('a', [rule('keep'),
      rule('change', { configured: 'off', assertion: { path: 'reasoning.support', value: { kind: 'support', value: 'unsupported' } },
        selector: { kind: 'exact', nativeModelIds: ['m1', 'm2'] } }),
      rule('regex', { selector: { kind: 'regex', pattern: '^m', positiveExamples: ['m1', 'm9'], negativeExamples: [] } }),
      rule('new')], { priority: 2 }), pack('fresh', [])] }
    const diff = diffCloudRulesDocuments(JSON.stringify(current), JSON.stringify(candidate))
    expect(diff.firstInstall).toBe(false)
    expect(diff.packs.added.map((entry) => entry.packId)).toEqual(['fresh'])
    expect(diff.packs.removed.map((entry) => entry.packId)).toEqual(['gone'])
    expect(diff.packs.changed).toEqual([{ packId: 'a', displayName: 'a', fields: [{ field: 'priority', before: '0', after: '2' }] }])
    expect(diff.rules.added.map((entry) => entry.ruleId)).toEqual(['new'])
    expect(diff.rules.removed.map((entry) => entry.ruleId)).toEqual(['dropped'])
    expect(diff.unchangedRuleCount).toBe(1)
    const changed = Object.fromEntries(diff.rules.changed.map((entry) => [entry.ruleId, entry.changes.map((change) => change.field)]))
    expect(changed).toEqual({ change: ['configured', 'selector', 'assertionValue'], regex: ['selector'] })
  })
})

describe('modelFactRuleClaimIdentity', () => {
  it('names the originating Rule of a capability_rule claim', () => {
    expect(modelFactRuleClaimIdentity({ sourceKind: 'capability_rule', sourceAssertion: { provenance: {
      ruleClaim: { ownerKind: 'user', packId: 'pack.a', ruleId: 'rule.a' } } } })).toEqual({
      ownerKey: 'settings.modelsCapabilities.facts.detail.ruleOwner.user', packId: 'pack.a', ruleId: 'rule.a' })
    expect(modelFactRuleClaimIdentity({ sourceKind: 'models_dev', sourceAssertion: { provenance: {} } })).toBeNull()
  })
})
