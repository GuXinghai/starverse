<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { t, tf } from '@/shared/i18n'
import { evaluateCapabilityRuleActivationV1, planCapabilityRuleRewriteV1 } from '@/core/generation-v2/capability-rules/capabilityRuleCoreV1'
import { modelFactValueText } from '@/shared/model-facts/modelFactPresentation'
import {
  cloudRuleSelectorHint,
  cloudRuleSelectorSummary,
  cloudRuleTitle,
  cloudRulesActionErrorKey,
  cloudRulesActionErrorKind,
  cloudRulesActionErrorNeedsReload,
  cloudRulesCheckFailureKey,
  cloudRulesFreshnessKey,
  cloudRulesFreshnessState,
  cloudRulesShortRevision,
  diffCloudRulesDocuments,
  type CloudRulesActionErrorKind,
  type CloudRulesDocumentDiff,
} from '@/shared/model-facts/cloudRulesPresentation'
import UiIcon from '@/ui-kit/icons/UiIcon.vue'
import CapabilityRulesUserPanel from './CapabilityRulesUserPanel.vue'

type Selector = Readonly<{ kind: 'exact'; nativeModelIds: readonly string[] } |
  { kind: 'regex'; pattern: string; positiveExamples?: readonly string[]; negativeExamples?: readonly string[] }>
type Evidence = Readonly<{
  evidenceSourceRef?: string
  evidenceKind?: string
  evidenceNote?: string
  identityEvidenceKind?: string
  identityEvidenceSourceRef?: string
  provenanceUrl?: string | null
  verifiedAt?: string
  derivation?: Readonly<{ derivationId?: string }> | null
}>
type Rule = Readonly<{
  ruleId: string
  label: string | null
  description?: string | null
  configured: 'default' | 'on' | 'off'
  providerAuthorityId?: string
  endpointProfileId?: string
  selector?: Selector
  assertion?: Readonly<{ path: string; value?: unknown }>
  category?: string
  effect?: Readonly<{ kind: string; path?: string; value?: unknown; code?: string; operationId?: string;
    mappings?: readonly Readonly<{ from: string; to: string }>[] }>
  evidence?: Evidence | null
}>
type Pack = Readonly<{ packId: string; displayName: string; priority: number; mode: 'override' | 'default_only' | 'no_control'; target: 'enabled' | 'disabled'; rules: readonly Rule[] }>
type OwnershipSnapshot = Readonly<{ packs: readonly Readonly<{ definition: Pack }>[] }>
type ReleaseMetadata = Readonly<{ publishedAt?: string }>
type CloudRead = Readonly<{
  distribution: Readonly<{
    lastAttemptedAtMs?: number | null
    lastSuccessfulCheckAtMs?: number | null
    lastFailureCode?: string | null
    latestObserved: Readonly<{ releaseVersion: string; contentRevision?: string }> | null
    candidate: Readonly<{ candidateRecordRevision: string; releaseVersion: string; releaseMetadata?: ReleaseMetadata }> | null
  }>
  application: Readonly<{
    appliedRecordRevision: number | null
    appliedIntegrity: 'missing' | 'valid' | 'invalid'
    overrides: Readonly<{ revision: number; overrides: readonly CloudOverride[] }>
    applied: Readonly<{ releaseVersion: string; contentRevision?: string; appliedAtMs?: number; document: Readonly<{ packs: readonly Pack[] }> }> | null
    policy: Readonly<{ policyRevision: number; historyLimit: number; pin: Readonly<{ releaseVersion: string; contentRevision: string }> | null }>
  }>
  active: Readonly<{ activeSnapshot: Readonly<{ projected: Readonly<{ definition: Readonly<{ packs: readonly Pack[] }> }> }> | null }>
  history: readonly Readonly<{ appliedRecordRevision: number; releaseVersion: string; contentRevision: string }>[]
}>
type CloudOverride = Readonly<{ kind: 'pack'; packId: string; mode?: Pack['mode']; target?: Pack['target'] }> |
  Readonly<{ kind: 'rule'; ruleId: string; configured: Rule['configured'] }>
type CheckResult = Readonly<{ ok: true } | { ok: false; code: string }> | null | undefined

const DIFF_LIST_LIMIT = 50
const props = withDefaults(defineProps<{ ownership: 'cloud' | 'user'; active?: boolean }>(), { active: true })
const loading = ref(false)
const checking = ref(false)
const lastCheckFailureCode = ref<string | null>(null)
const error = ref<CloudRulesActionErrorKind | null>(null)
const errorDetail = ref<string | null>(null)
const cloud = ref<CloudRead | null>(null)
const user = ref<OwnershipSnapshot | null>(null)
const candidateDiff = ref<CloudRulesDocumentDiff | null>(null)
const rawCandidate = ref<string | null>(null)
const showRawCandidate = ref(false)
const applying = ref(false)
const applyConfirming = ref(false)
const changingActivation = ref<string | null>(null)
const rollbackConfirming = ref<number | null>(null)
const rollbackPin = ref(false)
const rollingBack = ref(false)
const selectedPackId = ref<string | null>(null)
const selectedRuleId = ref<string | null>(null)

function capabilityRules() {
  const value = window.generationV2?.capabilityRules
  if (!value) throw new Error('GENERATION_V2_CAPABILITY_RULES_UNAVAILABLE')
  return value
}

function packs(): readonly Pack[] {
  if (props.ownership === 'cloud') {
    if (cloud.value?.application.appliedIntegrity !== 'valid') return []
    return cloud.value.active.activeSnapshot?.projected.definition.packs ?? []
  }
  return user.value?.packs.map((pack) => pack.definition) ?? []
}

function selectedPack(): Pack | null {
  const packId = selectedPackId.value
  return packId ? packs().find((pack) => pack.packId === packId) ?? null : null
}

function selectedRule(): Rule | null {
  const pack = selectedPack()
  const ruleId = selectedRuleId.value
  return pack && ruleId ? pack.rules.find((rule) => rule.ruleId === ruleId) ?? null : null
}

function showPack(packId: string) {
  selectedPackId.value = packId
  selectedRuleId.value = null
}

function showRule(ruleId: string) {
  selectedRuleId.value = ruleId
}

function backToPacks() {
  selectedPackId.value = null
  selectedRuleId.value = null
}

function backToRules() {
  selectedRuleId.value = null
}

function clearError() {
  error.value = null
  errorDetail.value = null
}

/** Shows a localized error; stale/not-found rejections reload so the panel never keeps outdated revisions. */
async function reportError(cause: unknown) {
  const kind = cloudRulesActionErrorKind(cause)
  if (cloudRulesActionErrorNeedsReload(kind) && props.ownership === 'cloud') {
    candidateDiff.value = null
    rawCandidate.value = null
    applyConfirming.value = false
    rollbackConfirming.value = null
    await load()
  }
  error.value = kind
  errorDetail.value = cause instanceof Error ? cause.message : String(cause)
}

async function load() {
  loading.value = true
  clearError()
  try {
    if (props.ownership === 'cloud') cloud.value = await capabilityRules().cloud.read() as CloudRead
    else user.value = (await capabilityRules().user.readCommitted() as Readonly<{ snapshot: OwnershipSnapshot | null }>).snapshot
  } catch (cause) {
    error.value = cloudRulesActionErrorKind(cause)
    errorDetail.value = cause instanceof Error ? cause.message : String(cause)
  } finally { loading.value = false }
}

async function runCheck() {
  checking.value = true
  try {
    const result = await capabilityRules().cloud.check() as CheckResult
    lastCheckFailureCode.value = result && result.ok === false ? result.code : null
  } finally { checking.value = false }
  await load()
}

async function checkCloud() {
  if (props.ownership !== 'cloud') return
  clearError()
  candidateDiff.value = null
  rawCandidate.value = null
  try { await runCheck() } catch (cause) { await reportError(cause) }
}

function candidateRequest() {
  const state = cloud.value
  if (!state?.distribution.candidate) throw new Error('GENERATION_V2_CLOUD_RULES_CANDIDATE_NOT_FOUND')
  return Object.freeze({ expectedCandidateRecordRevision: state.distribution.candidate.candidateRecordRevision,
    expectedAppliedRecordRevision: state.application.appliedRecordRevision })
}

async function viewChanges() {
  loading.value = true
  clearError()
  try {
    const result = await capabilityRules().cloud.candidateDiff(candidateRequest()) as Readonly<{ current: string | null; candidate: string }>
    candidateDiff.value = diffCloudRulesDocuments(result.current, result.candidate)
    rawCandidate.value = result.candidate
    showRawCandidate.value = false
  } catch (cause) { await reportError(cause) }
  finally { loading.value = false }
}

async function applyCandidate() {
  applying.value = true
  clearError()
  try {
    await capabilityRules().cloud.apply(candidateRequest())
    candidateDiff.value = null
    rawCandidate.value = null
    applyConfirming.value = false
    await load()
  } catch (cause) { await reportError(cause) }
  finally { applying.value = false }
}

function activationText(pack: Pack, rule: Rule): string {
  const activation = evaluateCapabilityRuleActivationV1({ mode: pack.mode, target: pack.target,
    configured: rule.configured, defaultPolicy: 'enabled' })
  return activation.enabled ? t('common.enabled') : t('common.disabled')
}

function activationSourceText(pack: Pack, rule: Rule): string {
  const activation = evaluateCapabilityRuleActivationV1({ mode: pack.mode, target: pack.target,
    configured: rule.configured, defaultPolicy: 'enabled' })
  return t(`settings.modelsCapabilities.activationSource.${activation.source}`)
}

function packModeText(mode: Pack['mode']): string {
  return t(`settings.modelsCapabilities.packMode.${mode}`)
}

function packTargetText(target: Pack['target']): string {
  return t(`settings.modelsCapabilities.packTarget.${target}`)
}

function configuredText(configured: Rule['configured']): string {
  return t(`settings.modelsCapabilities.cloud.configuredValue.${configured}`)
}

function ruleEffectPath(rule: Rule): string {
  return rule.assertion?.path ?? rule.effect?.path ?? rule.category ?? ''
}

function ruleEffectText(rule: Rule): string {
  if (rule.assertion) return modelFactValueText(rule.assertion.value) ?? ''
  const effect = rule.effect
  if (!effect) return ''
  if (effect.kind === 'fact_assertion' || effect.kind === 'fact_default') {
    return modelFactValueText(effect.value) ?? ''
  }
  if (effect.kind === 'enum_mapping') return JSON.stringify(effect.mappings ?? [])
  if (effect.kind === 'validation') return effect.code ?? effect.kind
  return effect.operationId ?? effect.kind
}

function exactModelIds(rule: Rule): readonly string[] {
  return rule.selector?.kind === 'exact' ? rule.selector.nativeModelIds : []
}

function regexExamples(rule: Rule, kind: 'positive' | 'negative'): readonly string[] {
  if (rule.selector?.kind !== 'regex') return []
  return (kind === 'positive' ? rule.selector.positiveExamples : rule.selector.negativeExamples) ?? []
}

function rewriteCount(pack: Pack): number {
  return planCapabilityRuleRewriteV1({ mode: pack.mode, target: pack.target, rules: pack.rules }).changedRules.length
}

function cloudRuleOverride(ruleId: string): CloudOverride | undefined {
  return cloud.value?.application.overrides.overrides.find((override) =>
    override.kind === 'rule' && override.ruleId === ruleId)
}

/** The configured value published by the remote release, before local overrides are overlaid. */
function remoteBaseline(rule: Rule): Rule['configured'] {
  for (const pack of cloud.value?.application.applied?.document.packs ?? []) {
    const remote = pack.rules.find((candidate) => candidate.ruleId === rule.ruleId)
    if (remote) return remote.configured
  }
  return rule.configured
}

function localOverrideText(ruleId: string): string {
  const override = cloudRuleOverride(ruleId)
  return override?.kind === 'rule' ? configuredText(override.configured) : t('settings.modelsCapabilities.cloud.noLocalOverride')
}

function cloudRuleSelection(ruleId: string, baseline: Rule['configured']): string {
  const override = cloudRuleOverride(ruleId)
  return override?.kind === 'rule' ? override.configured : `remote:${baseline}`
}

async function setCloudRuleSelection(ruleId: string, selection: string) {
  const state = cloud.value
  if (!state || state.application.appliedIntegrity !== 'valid' || state.application.appliedRecordRevision === null) return
  const retained = state.application.overrides.overrides.filter((override) =>
    override.kind !== 'rule' || override.ruleId !== ruleId)
  const configured = selection === 'on' || selection === 'off' || selection === 'default' ? selection : null
  if (configured !== null) retained.push({ kind: 'rule', ruleId, configured })
  changingActivation.value = ruleId
  clearError()
  try {
    await capabilityRules().cloud.replaceActivationOverrides({
      expectedAppliedRecordRevision: state.application.appliedRecordRevision,
      expectedOverrideRevision: state.application.overrides.revision,
      overrides: retained,
    })
    await load()
  } catch (cause) { await reportError(cause) }
  finally { changingActivation.value = null }
}

async function rollbackCloud() {
  const state = cloud.value
  const targetRevision = rollbackConfirming.value
  if (!state || targetRevision === null || state.application.appliedRecordRevision === null) return
  rollingBack.value = true
  clearError()
  try {
    await capabilityRules().cloud.rollback({ expectedAppliedRecordRevision: state.application.appliedRecordRevision,
      expectedHistoryTargetRecordRevision: targetRevision, pinTarget: rollbackPin.value })
    rollbackConfirming.value = null
    rollbackPin.value = false
    await load()
  } catch (cause) { await reportError(cause) }
  finally { rollingBack.value = false }
}

async function setCloudHistoryLimit(value: string) {
  const state = cloud.value
  const historyLimit = Number(value)
  if (!state?.application.policy || !Number.isSafeInteger(historyLimit) || historyLimit < 0 || historyLimit > 20) return
  loading.value = true
  clearError()
  try {
    await capabilityRules().cloud.setHistoryLimit({ expectedPolicyRevision: state.application.policy.policyRevision, historyLimit })
    await load()
  } catch (cause) { await reportError(cause) }
  finally { loading.value = false }
}

async function resumeCloudUpdates() {
  const state = cloud.value
  if (!state?.application.policy) return
  loading.value = true
  clearError()
  try {
    await capabilityRules().cloud.resumeUpdates({ expectedPolicyRevision: state.application.policy.policyRevision })
    // Resuming re-runs the check at once so a newer release becomes a candidate without waiting for the cadence.
    await runCheck()
  } catch (cause) { await reportError(cause) }
  finally { loading.value = false }
}

function failureCode(): string | null {
  return cloud.value?.distribution.lastFailureCode ?? lastCheckFailureCode.value
}

function freshness() {
  const state = cloud.value
  return cloudRulesFreshnessState({
    checking: checking.value,
    lastAttemptedAtMs: state?.distribution.lastAttemptedAtMs,
    lastSuccessfulCheckAtMs: state?.distribution.lastSuccessfulCheckAtMs,
    lastFailureCode: failureCode(),
    latestObservedContentRevision: state?.distribution.latestObserved?.contentRevision ?? null,
    hasCandidate: Boolean(state?.distribution.candidate),
    appliedIntegrity: state?.application.appliedIntegrity,
    appliedContentRevision: state?.application.applied?.contentRevision ?? null,
    pinned: Boolean(state?.application.policy?.pin),
  })
}

function timeText(ms: number | null | undefined): string {
  return typeof ms === 'number' ? new Date(ms).toLocaleString() : t('settings.modelsCapabilities.cloud.never')
}

function applyButtonKey(): string {
  const integrity = cloud.value?.application.appliedIntegrity
  if (integrity === 'invalid') return 'settings.modelsCapabilities.cloud.repairInstall'
  return integrity === 'valid' ? 'settings.modelsCapabilities.applyUpdate' : 'settings.modelsCapabilities.cloud.install'
}

function applyConfirmationKey(): string {
  const integrity = cloud.value?.application.appliedIntegrity
  if (integrity === 'invalid') return 'settings.modelsCapabilities.cloud.repairConfirmation'
  return integrity === 'valid' ? 'settings.modelsCapabilities.applyConfirmation' : 'settings.modelsCapabilities.cloud.installConfirmation'
}

function integrityRecoveryKey(): string {
  if (cloud.value?.distribution.candidate) return 'settings.modelsCapabilities.cloud.integrityRecoverCandidate'
  if (cloud.value?.history?.length) return 'settings.modelsCapabilities.cloud.integrityRecoverHistory'
  return 'settings.modelsCapabilities.cloud.integrityRecoverCheck'
}

function emptyCloudKey(): string {
  const state = freshness()
  if (state === 'checking' || state === 'never_checked') return 'settings.modelsCapabilities.cloud.emptyChecking'
  if (state === 'check_failed') return 'settings.modelsCapabilities.cloud.emptyCheckFailed'
  if (state === 'install_available') return 'settings.modelsCapabilities.cloud.emptyInstallReady'
  if (state === 'no_release') return 'settings.modelsCapabilities.cloud.emptyNoRelease'
  return 'settings.modelsCapabilities.noPacks'
}

function diffFieldText(field: string): string {
  return t(`settings.modelsCapabilities.cloud.diffField.${field}`)
}

function clip(value: string): string {
  return value.length > 200 ? `${value.slice(0, 200)}…` : value
}

function remaining(count: number): number {
  return Math.max(0, count - DIFF_LIST_LIMIT)
}

onMounted(() => { if (props.ownership === 'cloud' && props.active) void load() })
// The panel stays mounted behind v-show; reload on activation so startup bootstrap/scheduled checks show up.
watch(() => props.active, (active, previous) => {
  if (active && !previous && props.ownership === 'cloud' && !loading.value && !applying.value) void load()
})
</script>

<template>
  <section class="flex min-w-0 flex-col gap-4" :data-testid="`capability-rules-${props.ownership}-overview`">
    <CapabilityRulesUserPanel v-if="props.ownership === 'user'" />
    <template v-else>
    <header class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div class="min-w-0 flex-1">
        <h3 class="text-sm font-semibold text-gray-900">
          {{ props.ownership === 'cloud' ? t('settings.modelsCapabilities.cloudTitle') : t('settings.modelsCapabilities.userTitle') }}
        </h3>
        <p class="sv-meta mt-1">
          {{ props.ownership === 'cloud' ? t('settings.modelsCapabilities.cloudDescription') : t('settings.modelsCapabilities.userDescription') }}
        </p>
      </div>
      <div class="flex shrink-0 gap-2">
        <button type="button" class="sv-btn sv-btn-sm" :disabled="loading" @click="load">{{ t('common.refresh') }}</button>
        <button v-if="props.ownership === 'cloud'" type="button" class="sv-btn sv-btn-sm" :disabled="loading" @click="checkCloud">{{ t('settings.modelsCapabilities.checkUpdates') }}</button>
      </div>
    </header>
    <div v-if="error" class="sv-notice sv-notice-danger" role="alert" data-testid="cloud-rules-error">
      <UiIcon name="alert" :size="14" class="mt-0.5 shrink-0" />
      <div class="min-w-0 flex-1">
        <p>{{ t(cloudRulesActionErrorKey(error)) }}</p>
        <details v-if="errorDetail" class="mt-1"><summary class="cursor-pointer">{{ t('settings.modelsCapabilities.cloud.diagnostics') }}</summary><span class="break-all font-mono">{{ errorDetail }}</span></details>
      </div>
    </div>
    <div v-if="props.ownership === 'cloud' && cloud?.application.appliedIntegrity === 'invalid'" class="sv-notice sv-notice-danger" role="alert" data-testid="cloud-rules-integrity-invalid">
      <UiIcon name="alert" :size="14" class="mt-0.5 shrink-0" />
      <div class="min-w-0 flex-1">
        <p class="font-medium">{{ t('settings.modelsCapabilities.cloud.integrityInvalidTitle') }}</p>
        <p class="mt-1">{{ t('settings.modelsCapabilities.cloud.integrityInvalidBody') }} {{ t(integrityRecoveryKey()) }}</p>
      </div>
    </div>
    <div v-if="props.ownership === 'cloud' && cloud" class="flex flex-col gap-1 text-xs text-gray-700" data-testid="cloud-rules-freshness">
      <p :data-state="freshness()" class="flex items-center gap-1.5 text-[13px] font-medium" :class="freshness() === 'check_failed' ? 'text-[var(--sv-danger)]' : 'text-gray-900'">
        <UiIcon v-if="freshness() === 'check_failed'" name="alert" :size="14" class="shrink-0" />
        <UiIcon v-else-if="freshness() === 'up_to_date'" name="check" :size="14" class="shrink-0" />
        <span class="min-w-0">{{ t(cloudRulesFreshnessKey(freshness())) }}</span>
      </p>
      <p v-if="freshness() === 'check_failed'" class="text-[var(--sv-danger)]" data-testid="cloud-rules-check-failure">
        {{ t(cloudRulesCheckFailureKey(failureCode())) }}
        <span class="ml-1">{{ t('settings.modelsCapabilities.cloud.diagnosticCode') }}: <span class="break-all font-mono">{{ failureCode() }}</span></span>
      </p>
      <p class="sv-meta flex flex-wrap gap-x-3 gap-y-0.5">
        <span v-if="cloud.application.applied">{{ t('settings.modelsCapabilities.appliedRelease') }}: {{ cloud.application.applied.releaseVersion }}<span v-if="cloud.application.applied.contentRevision" class="font-mono" :title="cloud.application.applied.contentRevision"> ({{ cloudRulesShortRevision(cloud.application.applied.contentRevision) }})</span><span v-if="typeof cloud.application.applied.appliedAtMs === 'number'"> · {{ t('settings.modelsCapabilities.cloud.appliedAt') }} {{ timeText(cloud.application.applied.appliedAtMs) }}</span></span>
        <span>{{ t('settings.modelsCapabilities.cloud.lastSuccessfulCheck') }}: {{ timeText(cloud.distribution.lastSuccessfulCheckAtMs) }}</span>
        <span>{{ t('settings.modelsCapabilities.cloud.latestRelease') }}: {{ cloud.distribution.latestObserved?.releaseVersion ?? t('settings.modelsCapabilities.cloud.noneObserved') }}</span>
        <span v-if="cloud.distribution.candidate">{{ t('settings.modelsCapabilities.candidateAvailable') }}: {{ cloud.distribution.candidate.releaseVersion }}</span>
      </p>
    </div>
    <div v-if="props.ownership === 'cloud' && cloud?.application.policy" class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-700">
      <span>{{ t('settings.modelsCapabilities.historyLimit') }}</span>
      <select :value="cloud.application.policy.historyLimit" class="sv-select sv-select-sm w-16" :disabled="loading" @change="setCloudHistoryLimit(($event.target as HTMLSelectElement).value)">
        <option v-for="limit in 21" :key="limit - 1" :value="limit - 1">{{ limit - 1 }}</option>
      </select>
      <span v-if="cloud.application.policy.pin" class="sv-meta"> · {{ t('settings.modelsCapabilities.updatesPinned') }}: {{ cloud.application.policy.pin.releaseVersion }}<span v-if="cloud.distribution.latestObserved && cloud.distribution.latestObserved.releaseVersion !== cloud.application.policy.pin.releaseVersion"> · {{ tf('settings.modelsCapabilities.cloud.latestWhilePinned', { version: cloud.distribution.latestObserved.releaseVersion }) }}</span></span>
      <button v-if="cloud.application.policy.pin" type="button" class="sv-btn sv-btn-sm" :disabled="loading" @click="resumeCloudUpdates">{{ t('settings.modelsCapabilities.resumeUpdates') }}</button>
    </div>
    <div v-if="props.ownership === 'cloud' && cloud?.distribution.candidate" class="sv-divider-t flex flex-col gap-3 pt-4 text-xs text-gray-700">
      <div class="flex flex-col gap-0.5">
        <div class="text-[13px] font-medium text-gray-900">{{ t('settings.modelsCapabilities.candidateRelease') }}: {{ cloud.distribution.candidate.releaseVersion }}</div>
        <div v-if="cloud.distribution.candidate.releaseMetadata?.publishedAt" class="sv-meta">{{ t('settings.modelsCapabilities.cloud.publishedAt') }}: {{ new Date(cloud.distribution.candidate.releaseMetadata.publishedAt).toLocaleString() }}</div>
      </div>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="sv-btn sv-btn-sm" :disabled="loading || applying" @click="viewChanges">{{ t('settings.modelsCapabilities.viewChanges') }}</button>
        <button type="button" class="sv-btn sv-btn-sm sv-btn-primary" :disabled="loading || applying" @click="applyConfirming = true">{{ t(applyButtonKey()) }}</button>
      </div>
      <section v-if="candidateDiff" class="flex flex-col gap-3 border-l border-[var(--sv-line-strong)] pl-3 text-xs text-gray-700" data-testid="cloud-candidate-diff">
        <p v-if="candidateDiff.firstInstall">{{ t('settings.modelsCapabilities.cloud.diffFirstInstall') }}</p>
        <p v-else>{{ tf('settings.modelsCapabilities.cloud.diffBetween', { current: candidateDiff.currentReleaseVersion ?? '', candidate: candidateDiff.candidateReleaseVersion ?? '' }) }}</p>
        <p class="sv-meta" data-testid="cloud-candidate-diff-summary">{{ tf('settings.modelsCapabilities.cloud.diffSummary', {
          packsAdded: candidateDiff.packs.added.length, packsRemoved: candidateDiff.packs.removed.length, packsChanged: candidateDiff.packs.changed.length,
          rulesAdded: candidateDiff.rules.added.length, rulesRemoved: candidateDiff.rules.removed.length, rulesChanged: candidateDiff.rules.changed.length,
          rulesUnchanged: candidateDiff.unchangedRuleCount }) }}</p>
        <p v-if="candidateDiff.packs.added.length + candidateDiff.packs.removed.length + candidateDiff.packs.changed.length + candidateDiff.rules.added.length + candidateDiff.rules.removed.length + candidateDiff.rules.changed.length === 0">{{ t('settings.modelsCapabilities.cloud.diffNoChanges') }}</p>
        <div v-if="candidateDiff.packs.added.length || candidateDiff.packs.removed.length || candidateDiff.packs.changed.length" data-testid="cloud-candidate-diff-packs">
          <div class="sv-label mb-1">{{ t('settings.modelsCapabilities.packs') }}</div>
          <ul class="flex flex-col gap-0.5">
            <li v-for="pack in candidateDiff.packs.added" :key="`added-${pack.packId}`">+ {{ pack.displayName }} ({{ pack.ruleCount }} {{ t('settings.modelsCapabilities.rules') }})</li>
            <li v-for="pack in candidateDiff.packs.removed" :key="`removed-${pack.packId}`">− {{ pack.displayName }} ({{ pack.ruleCount }} {{ t('settings.modelsCapabilities.rules') }})</li>
            <li v-for="pack in candidateDiff.packs.changed" :key="`changed-${pack.packId}`">~ {{ pack.displayName }}: <span v-for="change in pack.fields" :key="change.field">{{ diffFieldText(change.field) }} {{ change.before }} → {{ change.after }}; </span></li>
          </ul>
        </div>
        <div v-if="candidateDiff.rules.changed.length" data-testid="cloud-candidate-diff-rules-changed">
          <div class="sv-label mb-1">{{ t('settings.modelsCapabilities.cloud.diffRulesChanged') }}</div>
          <ul class="flex flex-col gap-1.5">
            <li v-for="rule in candidateDiff.rules.changed.slice(0, DIFF_LIST_LIMIT)" :key="rule.ruleId" class="break-all">
              <span class="font-medium">{{ rule.title }}</span>
              <ul class="ml-3">
                <li v-for="change in rule.changes" :key="change.field">{{ diffFieldText(change.field) }}: <span class="font-mono">{{ clip(change.before) || '∅' }}</span> → <span class="font-mono">{{ clip(change.after) || '∅' }}</span></li>
              </ul>
            </li>
            <li v-if="remaining(candidateDiff.rules.changed.length)" class="sv-meta">{{ tf('settings.modelsCapabilities.cloud.diffMore', { count: remaining(candidateDiff.rules.changed.length) }) }}</li>
          </ul>
        </div>
        <div v-for="group in ([{ id: 'added', sign: '+', rules: candidateDiff.rules.added }, { id: 'removed', sign: '−', rules: candidateDiff.rules.removed }] as const)" v-show="group.rules.length" :key="group.id" :data-testid="`cloud-candidate-diff-rules-${group.id}`">
          <div class="sv-label mb-1">{{ t(`settings.modelsCapabilities.cloud.diffRules.${group.id}`) }}</div>
          <ul class="flex flex-col gap-0.5">
            <li v-for="rule in group.rules.slice(0, DIFF_LIST_LIMIT)" :key="rule.ruleId" class="break-all">{{ group.sign }} <span class="font-medium">{{ rule.title }}</span> · {{ rule.path }} · {{ rule.selector }} · <span class="font-mono">{{ clip(rule.value) }}</span></li>
            <li v-if="remaining(group.rules.length)" class="sv-meta">{{ tf('settings.modelsCapabilities.cloud.diffMore', { count: remaining(group.rules.length) }) }}</li>
          </ul>
        </div>
        <div v-if="rawCandidate" class="flex">
          <button type="button" class="sv-btn sv-btn-sm sv-btn-ghost" :aria-expanded="showRawCandidate" @click="showRawCandidate = !showRawCandidate">{{ t('settings.modelsCapabilities.cloud.rawJson') }}</button>
        </div>
        <pre v-if="showRawCandidate && rawCandidate" class="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-[var(--sv-sunken)] p-2 text-xs text-gray-700" data-testid="cloud-candidate-raw">{{ rawCandidate.length > 20000 ? `${rawCandidate.slice(0, 20000)}…` : rawCandidate }}</pre>
      </section>
      <div v-if="applyConfirming" class="sv-notice sv-notice-warning flex-wrap items-center">
        <UiIcon name="alert" :size="14" class="shrink-0" />
        <p class="min-w-0 flex-1">{{ t(applyConfirmationKey()) }}</p>
        <div class="flex gap-2">
          <button type="button" class="sv-btn sv-btn-sm sv-btn-primary min-w-16" :disabled="applying" @click="applyCandidate">{{ applying ? t('common.loading') : t('common.confirm') }}</button>
          <button type="button" class="sv-btn sv-btn-sm" :disabled="applying" @click="applyConfirming = false">{{ t('common.cancel') }}</button>
        </div>
      </div>
    </div>
    <div v-if="props.ownership === 'cloud' && cloud?.history?.length" class="sv-divider-t pt-4">
      <h4 class="sv-label">{{ t('settings.modelsCapabilities.appliedHistory') }}</h4>
      <ul class="mt-2 text-xs text-gray-600">
        <li v-for="entry in cloud.history" :key="entry.appliedRecordRevision" class="sv-divider-t flex min-h-9 flex-wrap items-center justify-between gap-2 py-1 first:border-t-0">
          <span class="min-w-0 break-all">{{ entry.releaseVersion }} · <span class="font-mono" :title="entry.contentRevision">{{ cloudRulesShortRevision(entry.contentRevision) }}</span></span>
          <span v-if="rollbackConfirming === entry.appliedRecordRevision" class="flex flex-wrap items-center gap-2">
            <label class="flex items-center gap-1.5"><input v-model="rollbackPin" type="checkbox" />{{ t('settings.modelsCapabilities.pinAfterRollback') }}</label>
            <button type="button" class="sv-btn sv-btn-sm sv-btn-primary" :disabled="rollingBack" @click="rollbackCloud">{{ t('common.confirm') }}</button>
            <button type="button" class="sv-btn sv-btn-sm" :disabled="rollingBack" @click="rollbackConfirming = null">{{ t('common.cancel') }}</button>
          </span>
          <button v-else type="button" class="sv-btn sv-btn-sm" :disabled="loading || rollingBack" @click="rollbackConfirming = entry.appliedRecordRevision">{{ t('settings.modelsCapabilities.rollback') }}</button>
        </li>
      </ul>
    </div>
    <nav v-if="selectedPack()" class="sv-divider-t flex flex-wrap items-center gap-1 pt-4 text-xs text-gray-500" aria-label="Rule navigation">
      <button type="button" class="rounded px-1 text-gray-700 hover:bg-[var(--sv-hover)] hover:text-gray-900" @click="backToPacks">{{ t('settings.modelsCapabilities.packs') }}</button>
      <UiIcon name="chevronRight" :size="12" />
      <button v-if="selectedRule()" type="button" class="rounded px-1 text-gray-700 hover:bg-[var(--sv-hover)] hover:text-gray-900" @click="backToRules">{{ selectedPack()?.displayName }}</button>
      <template v-if="selectedRule()"><UiIcon name="chevronRight" :size="12" /><span class="px-1 text-gray-900">{{ cloudRuleTitle(selectedRule()!) }}</span></template>
      <span v-else class="px-1 text-gray-900">{{ selectedPack()?.displayName }}</span>
    </nav>

    <div v-if="!selectedPack()">
      <ul class="flex flex-col">
        <li v-for="pack in packs()" :key="pack.packId" class="sv-divider-t first:border-t-0">
          <button type="button" class="sv-row flex w-full items-center gap-3 px-2 py-2.5 text-left" @click="showPack(pack.packId)">
            <span class="min-w-0 flex-1">
              <span class="flex items-center justify-between gap-2 text-[13px]">
                <span class="min-w-0 break-words font-medium text-gray-900">{{ pack.displayName }}</span>
                <span class="sv-meta shrink-0">{{ t('settings.modelsCapabilities.priority') }}: {{ pack.priority }}</span>
              </span>
              <span class="sv-meta mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                <span>{{ packModeText(pack.mode) }}</span><span>{{ packTargetText(pack.target) }}</span><span>{{ pack.rules.length }} {{ t('settings.modelsCapabilities.rules') }}</span>
              </span>
            </span>
            <UiIcon name="chevronRight" :size="14" class="shrink-0 text-gray-400" />
          </button>
        </li>
        <li v-if="!loading && packs().length === 0 && cloud?.application.appliedIntegrity !== 'invalid'" class="sv-meta py-4" data-testid="cloud-rules-empty">
          {{ t(cloud?.application.appliedIntegrity === 'valid' ? 'settings.modelsCapabilities.noPacks' : emptyCloudKey()) }}
        </li>
      </ul>
    </div>

    <template v-else-if="!selectedRule()">
      <section class="flex flex-col gap-1">
        <div class="flex items-center justify-between gap-2 text-[13px]">
          <span class="min-w-0 break-words font-medium text-gray-900">{{ selectedPack()!.displayName }}</span>
          <span class="sv-meta shrink-0">{{ t('settings.modelsCapabilities.priority') }}: {{ selectedPack()!.priority }}</span>
        </div>
        <div class="sv-meta flex flex-wrap gap-x-3 gap-y-0.5">
          <span>{{ t('settings.modelsCapabilities.packModeLabel') }}: {{ packModeText(selectedPack()!.mode) }}</span>
          <span>{{ t('settings.modelsCapabilities.packTargetLabel') }}: {{ packTargetText(selectedPack()!.target) }}</span>
          <span>{{ t('settings.modelsCapabilities.rewriteCount') }}: {{ rewriteCount(selectedPack()!) }}</span>
        </div>
      </section>
      <ul class="flex flex-col">
        <li v-for="rule in selectedPack()!.rules" :key="rule.ruleId" class="sv-divider-t first:border-t-0">
          <button type="button" class="sv-row flex w-full items-center gap-3 px-2 py-2.5 text-left text-xs text-gray-500" @click="showRule(rule.ruleId)">
            <span class="min-w-0 flex-1 break-words"><span class="text-[13px] font-medium text-gray-900">{{ cloudRuleTitle(rule) }}</span> · {{ ruleEffectPath(rule) }}<span v-if="cloudRuleSelectorHint(rule.selector)"> · <span class="break-all font-mono">{{ cloudRuleSelectorHint(rule.selector) }}</span></span> · {{ t('settings.modelsCapabilities.configured') }}: {{ configuredText(rule.configured) }}
              <span v-if="cloudRuleOverride(rule.ruleId)" class="sv-chip ml-1">{{ t('settings.modelsCapabilities.cloud.overriddenBadge') }}</span></span>
            <UiIcon name="chevronRight" :size="14" class="shrink-0 text-gray-400" />
          </button>
        </li>
        <li v-if="selectedPack()!.rules.length === 0" class="sv-meta py-4">{{ t('settings.modelsCapabilities.noRules') }}</li>
      </ul>
    </template>

    <section v-else class="flex flex-col gap-3" data-testid="cloud-rule-detail">
      <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 class="min-w-0 break-words text-sm font-semibold text-gray-900">{{ cloudRuleTitle(selectedRule()!) }}</h4>
        <span class="sv-meta break-all font-mono">{{ selectedRule()!.ruleId }}</span>
      </div>
      <p v-if="selectedRule()!.description" class="text-xs text-gray-600">{{ selectedRule()!.description }}</p>
      <dl class="grid gap-1.5 text-xs text-gray-700">
        <div><dt class="inline text-gray-500">{{ t('settings.modelsCapabilities.cloud.providerProfile') }}: </dt><dd class="inline break-all font-mono">{{ selectedRule()!.providerAuthorityId ?? '' }} / {{ selectedRule()!.endpointProfileId ?? '' }}</dd></div>
        <div v-if="selectedRule()!.selector"><dt class="inline text-gray-500">{{ t('settings.modelsCapabilities.selector') }}: </dt>
          <dd class="inline">{{ t(`settings.modelsCapabilities.cloud.selectorKind.${selectedRule()!.selector!.kind}`) }}</dd>
          <ul v-if="selectedRule()!.selector!.kind === 'exact'" class="ml-3 list-disc break-all font-mono" data-testid="cloud-rule-model-ids">
            <li v-for="modelId in exactModelIds(selectedRule()!)" :key="modelId">{{ modelId }}</li>
          </ul>
          <div v-else class="ml-3" data-testid="cloud-rule-regex">
            <div class="break-all font-mono">{{ cloudRuleSelectorSummary(selectedRule()!.selector) }}</div>
            <div v-if="regexExamples(selectedRule()!, 'positive').length">{{ t('settings.modelsCapabilities.cloud.regexMatches') }}: <span class="break-all font-mono">{{ regexExamples(selectedRule()!, 'positive').join(', ') }}</span></div>
            <div v-if="regexExamples(selectedRule()!, 'negative').length">{{ t('settings.modelsCapabilities.cloud.regexExcludes') }}: <span class="break-all font-mono">{{ regexExamples(selectedRule()!, 'negative').join(', ') }}</span></div>
          </div>
        </div>
        <div><dt class="inline text-gray-500">{{ t('settings.modelsCapabilities.assertionPath') }}: </dt><dd class="inline break-all font-mono">{{ ruleEffectPath(selectedRule()!) }}</dd></div>
        <div><dt class="inline text-gray-500">{{ selectedRule()!.assertion ? t('settings.modelsCapabilities.cloud.assertedValue') : t('settings.modelsCapabilities.cloud.effect') }}: </dt><dd class="inline break-all font-mono" data-testid="cloud-rule-asserted-value">{{ ruleEffectText(selectedRule()!) }}</dd></div>
        <div data-testid="cloud-rule-baseline"><dt class="inline text-gray-500">{{ t('settings.modelsCapabilities.cloud.remoteBaseline') }}: </dt><dd class="inline">{{ configuredText(remoteBaseline(selectedRule()!)) }}</dd>
          · <dt class="inline text-gray-500">{{ t('settings.modelsCapabilities.cloud.localOverride') }}: </dt><dd class="inline">{{ localOverrideText(selectedRule()!.ruleId) }}</dd></div>
        <div><dt class="inline text-gray-500">{{ t('settings.modelsCapabilities.cloud.effectiveActivation') }}: </dt><dd class="inline">{{ activationText(selectedPack()!, selectedRule()!) }} ({{ activationSourceText(selectedPack()!, selectedRule()!) }})</dd></div>
        <div v-if="selectedRule()!.evidence" data-testid="cloud-rule-evidence"><dt class="text-gray-500">{{ t('settings.modelsCapabilities.cloud.evidence') }}</dt>
          <dd class="ml-3 flex flex-col gap-0.5">
            <div v-if="selectedRule()!.evidence!.evidenceKind">{{ t('settings.modelsCapabilities.cloud.evidenceKind') }}: {{ selectedRule()!.evidence!.evidenceKind }}<span v-if="selectedRule()!.evidence!.evidenceSourceRef" class="break-all font-mono"> · {{ selectedRule()!.evidence!.evidenceSourceRef }}</span></div>
            <div v-if="selectedRule()!.evidence!.identityEvidenceKind">{{ t('settings.modelsCapabilities.cloud.identityEvidence') }}: {{ selectedRule()!.evidence!.identityEvidenceKind }}<span v-if="selectedRule()!.evidence!.identityEvidenceSourceRef" class="break-all font-mono"> · {{ selectedRule()!.evidence!.identityEvidenceSourceRef }}</span></div>
            <div v-if="selectedRule()!.evidence!.evidenceNote" class="text-gray-600">{{ selectedRule()!.evidence!.evidenceNote }}</div>
            <div v-if="selectedRule()!.evidence!.provenanceUrl" class="break-all font-mono">{{ selectedRule()!.evidence!.provenanceUrl }}</div>
            <div v-if="selectedRule()!.evidence!.verifiedAt">{{ t('settings.modelsCapabilities.cloud.verifiedAt') }}: {{ selectedRule()!.evidence!.verifiedAt }}</div>
            <div v-if="selectedRule()!.evidence!.derivation?.derivationId">{{ t('settings.modelsCapabilities.cloud.derivation') }}: <span class="break-all font-mono">{{ selectedRule()!.evidence!.derivation!.derivationId }}</span></div>
          </dd>
        </div>
      </dl>
      <label class="sv-divider-t flex flex-wrap items-center gap-2 pt-3 text-xs text-gray-700">{{ t('settings.modelsCapabilities.cloud.localActivation') }}
        <select class="sv-select sv-select-sm max-w-full" :value="cloudRuleSelection(selectedRule()!.ruleId, remoteBaseline(selectedRule()!))" :disabled="changingActivation === selectedRule()!.ruleId" @change="setCloudRuleSelection(selectedRule()!.ruleId, ($event.target as HTMLSelectElement).value)">
          <option :value="`remote:${remoteBaseline(selectedRule()!)}`">{{ t('settings.modelsCapabilities.followRemoteBaseline') }} ({{ configuredText(remoteBaseline(selectedRule()!)) }})</option>
          <option value="default">{{ t('settings.modelsCapabilities.activationDefault') }}</option>
          <option value="on">{{ t('common.on') }}</option>
          <option value="off">{{ t('common.off') }}</option>
        </select>
      </label>
    </section>
    </template>
  </section>
</template>
