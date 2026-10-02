<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { t, tf } from '@/shared/i18n'
import { evaluateCapabilityRuleActivationV1, planCapabilityRuleRewriteV1 } from '@/next/generation-v2/capability-rules/capabilityRuleCoreV1'
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
  assertion: Readonly<{ path: string; value?: unknown }>
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
  <section class="space-y-3" :data-testid="`capability-rules-${props.ownership}-overview`">
    <CapabilityRulesUserPanel v-if="props.ownership === 'user'" />
    <template v-else>
    <header class="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 class="text-sm font-semibold text-gray-900">
          {{ props.ownership === 'cloud' ? t('settings.modelsCapabilities.cloudTitle') : t('settings.modelsCapabilities.userTitle') }}
        </h3>
        <p class="mt-1 text-xs text-gray-500">
          {{ props.ownership === 'cloud' ? t('settings.modelsCapabilities.cloudDescription') : t('settings.modelsCapabilities.userDescription') }}
        </p>
      </div>
      <div class="flex gap-2">
        <button type="button" class="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50" :disabled="loading" @click="load">{{ t('common.refresh') }}</button>
        <button v-if="props.ownership === 'cloud'" type="button" class="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50" :disabled="loading" @click="checkCloud">{{ t('settings.modelsCapabilities.checkUpdates') }}</button>
      </div>
    </header>
    <div v-if="error" class="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800" role="alert" data-testid="cloud-rules-error">
      <p>{{ t(cloudRulesActionErrorKey(error)) }}</p>
      <details v-if="errorDetail" class="mt-1 text-[10px] text-red-700"><summary>{{ t('settings.modelsCapabilities.cloud.diagnostics') }}</summary><span class="break-all font-mono">{{ errorDetail }}</span></details>
    </div>
    <div v-if="props.ownership === 'cloud' && cloud?.application.appliedIntegrity === 'invalid'" class="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-900" role="alert" data-testid="cloud-rules-integrity-invalid">
      <p class="font-semibold">{{ t('settings.modelsCapabilities.cloud.integrityInvalidTitle') }}</p>
      <p class="mt-1">{{ t('settings.modelsCapabilities.cloud.integrityInvalidBody') }} {{ t(integrityRecoveryKey()) }}</p>
    </div>
    <div v-if="props.ownership === 'cloud' && cloud" class="space-y-1 rounded border border-gray-200 bg-white p-2 text-xs text-gray-700" data-testid="cloud-rules-freshness">
      <p :data-state="freshness()" class="font-medium" :class="freshness() === 'check_failed' ? 'text-red-800' : freshness() === 'up_to_date' ? 'text-green-800' : 'text-gray-900'">{{ t(cloudRulesFreshnessKey(freshness())) }}</p>
      <p v-if="freshness() === 'check_failed'" class="text-red-800" data-testid="cloud-rules-check-failure">
        {{ t(cloudRulesCheckFailureKey(failureCode())) }}
        <span class="ml-1 text-[10px] text-red-600">{{ t('settings.modelsCapabilities.cloud.diagnosticCode') }}: <span class="font-mono">{{ failureCode() }}</span></span>
      </p>
      <p class="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
        <span v-if="cloud.application.applied">{{ t('settings.modelsCapabilities.appliedRelease') }}: {{ cloud.application.applied.releaseVersion }}<span v-if="cloud.application.applied.contentRevision" class="font-mono" :title="cloud.application.applied.contentRevision"> ({{ cloudRulesShortRevision(cloud.application.applied.contentRevision) }})</span><span v-if="typeof cloud.application.applied.appliedAtMs === 'number'"> · {{ t('settings.modelsCapabilities.cloud.appliedAt') }} {{ timeText(cloud.application.applied.appliedAtMs) }}</span></span>
        <span>{{ t('settings.modelsCapabilities.cloud.lastSuccessfulCheck') }}: {{ timeText(cloud.distribution.lastSuccessfulCheckAtMs) }}</span>
        <span>{{ t('settings.modelsCapabilities.cloud.latestRelease') }}: {{ cloud.distribution.latestObserved?.releaseVersion ?? t('settings.modelsCapabilities.cloud.noneObserved') }}</span>
        <span v-if="cloud.distribution.candidate">{{ t('settings.modelsCapabilities.candidateAvailable') }}: {{ cloud.distribution.candidate.releaseVersion }}</span>
      </p>
    </div>
    <div v-if="props.ownership === 'cloud' && cloud?.application.policy" class="rounded border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700">
      <div class="flex flex-wrap items-center gap-2">
        <span>{{ t('settings.modelsCapabilities.historyLimit') }}</span>
        <select :value="cloud.application.policy.historyLimit" class="rounded border border-gray-300 bg-white px-1 py-0.5" :disabled="loading" @change="setCloudHistoryLimit(($event.target as HTMLSelectElement).value)">
          <option v-for="limit in 21" :key="limit - 1" :value="limit - 1">{{ limit - 1 }}</option>
        </select>
        <span v-if="cloud.application.policy.pin"> · {{ t('settings.modelsCapabilities.updatesPinned') }}: {{ cloud.application.policy.pin.releaseVersion }}<span v-if="cloud.distribution.latestObserved && cloud.distribution.latestObserved.releaseVersion !== cloud.application.policy.pin.releaseVersion"> · {{ tf('settings.modelsCapabilities.cloud.latestWhilePinned', { version: cloud.distribution.latestObserved.releaseVersion }) }}</span></span>
        <button v-if="cloud.application.policy.pin" type="button" class="rounded border border-gray-300 bg-white px-2 py-0.5" :disabled="loading" @click="resumeCloudUpdates">{{ t('settings.modelsCapabilities.resumeUpdates') }}</button>
      </div>
    </div>
    <div v-if="props.ownership === 'cloud' && cloud?.distribution.candidate" class="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
      <div>{{ t('settings.modelsCapabilities.candidateRelease') }}: {{ cloud.distribution.candidate.releaseVersion }}</div>
      <div v-if="cloud.distribution.candidate.releaseMetadata?.publishedAt" class="text-[11px] text-amber-800">{{ t('settings.modelsCapabilities.cloud.publishedAt') }}: {{ new Date(cloud.distribution.candidate.releaseMetadata.publishedAt).toLocaleString() }}</div>
      <div class="mt-2 flex flex-wrap gap-2">
        <button type="button" class="rounded border border-amber-300 bg-white px-2 py-1 hover:bg-amber-100" :disabled="loading || applying" @click="viewChanges">{{ t('settings.modelsCapabilities.viewChanges') }}</button>
        <button type="button" class="rounded border border-amber-300 bg-white px-2 py-1 hover:bg-amber-100" :disabled="loading || applying" @click="applyConfirming = true">{{ t(applyButtonKey()) }}</button>
      </div>
      <section v-if="candidateDiff" class="mt-2 space-y-2 rounded bg-white p-2 text-[11px] text-gray-700" data-testid="cloud-candidate-diff">
        <p v-if="candidateDiff.firstInstall">{{ t('settings.modelsCapabilities.cloud.diffFirstInstall') }}</p>
        <p v-else>{{ tf('settings.modelsCapabilities.cloud.diffBetween', { current: candidateDiff.currentReleaseVersion ?? '', candidate: candidateDiff.candidateReleaseVersion ?? '' }) }}</p>
        <p data-testid="cloud-candidate-diff-summary">{{ tf('settings.modelsCapabilities.cloud.diffSummary', {
          packsAdded: candidateDiff.packs.added.length, packsRemoved: candidateDiff.packs.removed.length, packsChanged: candidateDiff.packs.changed.length,
          rulesAdded: candidateDiff.rules.added.length, rulesRemoved: candidateDiff.rules.removed.length, rulesChanged: candidateDiff.rules.changed.length,
          rulesUnchanged: candidateDiff.unchangedRuleCount }) }}</p>
        <p v-if="candidateDiff.packs.added.length + candidateDiff.packs.removed.length + candidateDiff.packs.changed.length + candidateDiff.rules.added.length + candidateDiff.rules.removed.length + candidateDiff.rules.changed.length === 0">{{ t('settings.modelsCapabilities.cloud.diffNoChanges') }}</p>
        <div v-if="candidateDiff.packs.added.length || candidateDiff.packs.removed.length || candidateDiff.packs.changed.length" data-testid="cloud-candidate-diff-packs">
          <div class="font-medium">{{ t('settings.modelsCapabilities.packs') }}</div>
          <ul class="space-y-0.5">
            <li v-for="pack in candidateDiff.packs.added" :key="`added-${pack.packId}`">+ {{ pack.displayName }} ({{ pack.ruleCount }} {{ t('settings.modelsCapabilities.rules') }})</li>
            <li v-for="pack in candidateDiff.packs.removed" :key="`removed-${pack.packId}`">− {{ pack.displayName }} ({{ pack.ruleCount }} {{ t('settings.modelsCapabilities.rules') }})</li>
            <li v-for="pack in candidateDiff.packs.changed" :key="`changed-${pack.packId}`">~ {{ pack.displayName }}: <span v-for="change in pack.fields" :key="change.field">{{ diffFieldText(change.field) }} {{ change.before }} → {{ change.after }}; </span></li>
          </ul>
        </div>
        <div v-if="candidateDiff.rules.changed.length" data-testid="cloud-candidate-diff-rules-changed">
          <div class="font-medium">{{ t('settings.modelsCapabilities.cloud.diffRulesChanged') }}</div>
          <ul class="space-y-1">
            <li v-for="rule in candidateDiff.rules.changed.slice(0, DIFF_LIST_LIMIT)" :key="rule.ruleId" class="break-all">
              <span class="font-medium">{{ rule.title }}</span>
              <ul class="ml-3">
                <li v-for="change in rule.changes" :key="change.field">{{ diffFieldText(change.field) }}: <span class="font-mono">{{ clip(change.before) || '∅' }}</span> → <span class="font-mono">{{ clip(change.after) || '∅' }}</span></li>
              </ul>
            </li>
            <li v-if="remaining(candidateDiff.rules.changed.length)" class="text-gray-500">{{ tf('settings.modelsCapabilities.cloud.diffMore', { count: remaining(candidateDiff.rules.changed.length) }) }}</li>
          </ul>
        </div>
        <div v-for="group in ([{ id: 'added', sign: '+', rules: candidateDiff.rules.added }, { id: 'removed', sign: '−', rules: candidateDiff.rules.removed }] as const)" v-show="group.rules.length" :key="group.id" :data-testid="`cloud-candidate-diff-rules-${group.id}`">
          <div class="font-medium">{{ t(`settings.modelsCapabilities.cloud.diffRules.${group.id}`) }}</div>
          <ul class="space-y-0.5">
            <li v-for="rule in group.rules.slice(0, DIFF_LIST_LIMIT)" :key="rule.ruleId" class="break-all">{{ group.sign }} <span class="font-medium">{{ rule.title }}</span> · {{ rule.path }} · {{ rule.selector }} · <span class="font-mono">{{ clip(rule.value) }}</span></li>
            <li v-if="remaining(group.rules.length)" class="text-gray-500">{{ tf('settings.modelsCapabilities.cloud.diffMore', { count: remaining(group.rules.length) }) }}</li>
          </ul>
        </div>
        <button v-if="rawCandidate" type="button" class="rounded border border-gray-300 px-1.5 py-0.5 text-[10px]" @click="showRawCandidate = !showRawCandidate">{{ t('settings.modelsCapabilities.cloud.rawJson') }}</button>
        <pre v-if="showRawCandidate && rawCandidate" class="max-h-48 overflow-auto rounded bg-gray-50 p-2 text-[10px] text-gray-700" data-testid="cloud-candidate-raw">{{ rawCandidate.length > 20000 ? `${rawCandidate.slice(0, 20000)}…` : rawCandidate }}</pre>
      </section>
      <div v-if="applyConfirming" class="mt-2 rounded border border-amber-300 bg-white p-2">
        <p>{{ t(applyConfirmationKey()) }}</p>
        <div class="mt-2 flex gap-2">
          <button type="button" class="rounded bg-amber-600 px-2 py-1 text-white hover:bg-amber-700" :disabled="applying" @click="applyCandidate">{{ applying ? t('common.loading') : t('common.confirm') }}</button>
          <button type="button" class="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50" :disabled="applying" @click="applyConfirming = false">{{ t('common.cancel') }}</button>
        </div>
      </div>
    </div>
    <div v-if="props.ownership === 'cloud' && cloud?.history?.length" class="rounded border border-gray-200 bg-white p-3">
      <h4 class="text-xs font-semibold text-gray-800">{{ t('settings.modelsCapabilities.appliedHistory') }}</h4>
      <ul class="mt-2 space-y-1 text-[11px] text-gray-600">
        <li v-for="entry in cloud.history" :key="entry.appliedRecordRevision" class="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-1">
          <span>{{ entry.releaseVersion }} · <span class="font-mono" :title="entry.contentRevision">{{ cloudRulesShortRevision(entry.contentRevision) }}</span></span>
          <span v-if="rollbackConfirming === entry.appliedRecordRevision" class="flex flex-wrap items-center gap-1">
            <label class="flex items-center gap-1"><input v-model="rollbackPin" type="checkbox" />{{ t('settings.modelsCapabilities.pinAfterRollback') }}</label>
            <button type="button" class="rounded bg-amber-600 px-1.5 py-0.5 text-white" :disabled="rollingBack" @click="rollbackCloud">{{ t('common.confirm') }}</button>
            <button type="button" class="rounded border border-gray-300 px-1.5 py-0.5" :disabled="rollingBack" @click="rollbackConfirming = null">{{ t('common.cancel') }}</button>
          </span>
          <button v-else type="button" class="rounded border border-gray-300 px-1.5 py-0.5" :disabled="loading || rollingBack" @click="rollbackConfirming = entry.appliedRecordRevision">{{ t('settings.modelsCapabilities.rollback') }}</button>
        </li>
      </ul>
    </div>
    <nav v-if="selectedPack()" class="flex items-center gap-1 text-xs text-gray-500" aria-label="Rule navigation">
      <button type="button" class="text-blue-700 hover:underline" @click="backToPacks">{{ t('settings.modelsCapabilities.packs') }}</button>
      <span aria-hidden="true">/</span>
      <button v-if="selectedRule()" type="button" class="text-blue-700 hover:underline" @click="backToRules">{{ selectedPack()?.displayName }}</button>
      <template v-if="selectedRule()"><span aria-hidden="true">/</span><span>{{ cloudRuleTitle(selectedRule()!) }}</span></template>
      <span v-else>{{ selectedPack()?.displayName }}</span>
    </nav>

    <div v-if="!selectedPack()">
      <ul class="space-y-2">
        <li v-for="pack in packs()" :key="pack.packId">
          <button type="button" class="w-full rounded border border-gray-200 bg-white p-3 text-left hover:bg-gray-50" @click="showPack(pack.packId)">
            <div class="flex items-center justify-between gap-2 text-xs">
              <span class="font-medium text-gray-900">{{ pack.displayName }}</span>
              <span class="text-gray-500">{{ t('settings.modelsCapabilities.priority') }}: {{ pack.priority }}</span>
            </div>
            <div class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-500">
              <span>{{ packModeText(pack.mode) }}</span><span>{{ packTargetText(pack.target) }}</span><span>{{ pack.rules.length }} {{ t('settings.modelsCapabilities.rules') }}</span>
            </div>
          </button>
        </li>
        <li v-if="!loading && packs().length === 0 && cloud?.application.appliedIntegrity !== 'invalid'" class="rounded border border-dashed border-gray-200 px-3 py-4 text-xs text-gray-500" data-testid="cloud-rules-empty">
          {{ t(cloud?.application.appliedIntegrity === 'valid' ? 'settings.modelsCapabilities.noPacks' : emptyCloudKey()) }}
        </li>
      </ul>
    </div>

    <template v-else-if="!selectedRule()">
      <section class="rounded border border-gray-200 bg-white p-3">
        <div class="flex items-center justify-between gap-2 text-xs">
          <span class="font-medium text-gray-900">{{ selectedPack()!.displayName }}</span>
          <span class="text-gray-500">{{ t('settings.modelsCapabilities.priority') }}: {{ selectedPack()!.priority }}</span>
        </div>
        <div class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-500">
          <span>{{ t('settings.modelsCapabilities.packModeLabel') }}: {{ packModeText(selectedPack()!.mode) }}</span>
          <span>{{ t('settings.modelsCapabilities.packTargetLabel') }}: {{ packTargetText(selectedPack()!.target) }}</span>
          <span>{{ t('settings.modelsCapabilities.rewriteCount') }}: {{ rewriteCount(selectedPack()!) }}</span>
        </div>
      </section>
      <ul class="space-y-2">
        <li v-for="rule in selectedPack()!.rules" :key="rule.ruleId">
          <button type="button" class="w-full rounded border border-gray-200 bg-white p-3 text-left text-[11px] text-gray-700 hover:bg-gray-50" @click="showRule(rule.ruleId)">
            <span class="font-medium text-gray-900">{{ cloudRuleTitle(rule) }}</span> · {{ rule.assertion.path }}<span v-if="cloudRuleSelectorHint(rule.selector)"> · <span class="font-mono">{{ cloudRuleSelectorHint(rule.selector) }}</span></span> · {{ t('settings.modelsCapabilities.configured') }}: {{ configuredText(rule.configured) }}
            <span v-if="cloudRuleOverride(rule.ruleId)" class="ml-1 rounded bg-blue-50 px-1 text-[10px] text-blue-800">{{ t('settings.modelsCapabilities.cloud.overriddenBadge') }}</span>
          </button>
        </li>
        <li v-if="selectedPack()!.rules.length === 0" class="rounded border border-dashed border-gray-200 px-3 py-4 text-xs text-gray-500">{{ t('settings.modelsCapabilities.noRules') }}</li>
      </ul>
    </template>

    <section v-else class="rounded border border-gray-200 bg-white p-3" data-testid="cloud-rule-detail">
      <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
        <h4 class="font-semibold text-gray-900">{{ cloudRuleTitle(selectedRule()!) }}</h4>
        <span class="font-mono text-[10px] text-gray-500">{{ selectedRule()!.ruleId }}</span>
      </div>
      <p v-if="selectedRule()!.description" class="mt-1 text-[11px] text-gray-600">{{ selectedRule()!.description }}</p>
      <dl class="mt-3 grid gap-1 text-[11px] text-gray-700">
        <div><dt class="inline text-gray-500">{{ t('settings.modelsCapabilities.cloud.providerProfile') }}: </dt><dd class="inline font-mono">{{ selectedRule()!.providerAuthorityId ?? '' }} / {{ selectedRule()!.endpointProfileId ?? '' }}</dd></div>
        <div v-if="selectedRule()!.selector"><dt class="inline text-gray-500">{{ t('settings.modelsCapabilities.selector') }}: </dt>
          <dd class="inline">{{ t(`settings.modelsCapabilities.cloud.selectorKind.${selectedRule()!.selector!.kind}`) }}</dd>
          <ul v-if="selectedRule()!.selector!.kind === 'exact'" class="ml-3 list-disc font-mono" data-testid="cloud-rule-model-ids">
            <li v-for="modelId in exactModelIds(selectedRule()!)" :key="modelId">{{ modelId }}</li>
          </ul>
          <div v-else class="ml-3" data-testid="cloud-rule-regex">
            <div class="font-mono">{{ cloudRuleSelectorSummary(selectedRule()!.selector) }}</div>
            <div v-if="regexExamples(selectedRule()!, 'positive').length">{{ t('settings.modelsCapabilities.cloud.regexMatches') }}: <span class="font-mono">{{ regexExamples(selectedRule()!, 'positive').join(', ') }}</span></div>
            <div v-if="regexExamples(selectedRule()!, 'negative').length">{{ t('settings.modelsCapabilities.cloud.regexExcludes') }}: <span class="font-mono">{{ regexExamples(selectedRule()!, 'negative').join(', ') }}</span></div>
          </div>
        </div>
        <div><dt class="inline text-gray-500">{{ t('settings.modelsCapabilities.assertionPath') }}: </dt><dd class="inline font-mono">{{ selectedRule()!.assertion.path }}</dd></div>
        <div><dt class="inline text-gray-500">{{ t('settings.modelsCapabilities.cloud.assertedValue') }}: </dt><dd class="inline break-all font-mono" data-testid="cloud-rule-asserted-value">{{ modelFactValueText(selectedRule()!.assertion.value) ?? '' }}</dd></div>
        <div data-testid="cloud-rule-baseline"><dt class="inline text-gray-500">{{ t('settings.modelsCapabilities.cloud.remoteBaseline') }}: </dt><dd class="inline">{{ configuredText(remoteBaseline(selectedRule()!)) }}</dd>
          · <dt class="inline text-gray-500">{{ t('settings.modelsCapabilities.cloud.localOverride') }}: </dt><dd class="inline">{{ localOverrideText(selectedRule()!.ruleId) }}</dd></div>
        <div><dt class="inline text-gray-500">{{ t('settings.modelsCapabilities.cloud.effectiveActivation') }}: </dt><dd class="inline">{{ activationText(selectedPack()!, selectedRule()!) }} ({{ activationSourceText(selectedPack()!, selectedRule()!) }})</dd></div>
        <div v-if="selectedRule()!.evidence" data-testid="cloud-rule-evidence"><dt class="text-gray-500">{{ t('settings.modelsCapabilities.cloud.evidence') }}</dt>
          <dd class="ml-3 space-y-0.5">
            <div v-if="selectedRule()!.evidence!.evidenceKind">{{ t('settings.modelsCapabilities.cloud.evidenceKind') }}: {{ selectedRule()!.evidence!.evidenceKind }}<span v-if="selectedRule()!.evidence!.evidenceSourceRef" class="font-mono"> · {{ selectedRule()!.evidence!.evidenceSourceRef }}</span></div>
            <div v-if="selectedRule()!.evidence!.identityEvidenceKind">{{ t('settings.modelsCapabilities.cloud.identityEvidence') }}: {{ selectedRule()!.evidence!.identityEvidenceKind }}<span v-if="selectedRule()!.evidence!.identityEvidenceSourceRef" class="font-mono"> · {{ selectedRule()!.evidence!.identityEvidenceSourceRef }}</span></div>
            <div v-if="selectedRule()!.evidence!.evidenceNote" class="text-gray-600">{{ selectedRule()!.evidence!.evidenceNote }}</div>
            <div v-if="selectedRule()!.evidence!.provenanceUrl" class="break-all font-mono">{{ selectedRule()!.evidence!.provenanceUrl }}</div>
            <div v-if="selectedRule()!.evidence!.verifiedAt">{{ t('settings.modelsCapabilities.cloud.verifiedAt') }}: {{ selectedRule()!.evidence!.verifiedAt }}</div>
            <div v-if="selectedRule()!.evidence!.derivation?.derivationId">{{ t('settings.modelsCapabilities.cloud.derivation') }}: <span class="font-mono">{{ selectedRule()!.evidence!.derivation!.derivationId }}</span></div>
          </dd>
        </div>
      </dl>
      <label class="mt-3 block text-[11px] text-gray-700">{{ t('settings.modelsCapabilities.cloud.localActivation') }}
        <select class="ml-1 rounded border border-gray-300 bg-white px-1 py-0.5" :value="cloudRuleSelection(selectedRule()!.ruleId, remoteBaseline(selectedRule()!))" :disabled="changingActivation === selectedRule()!.ruleId" @change="setCloudRuleSelection(selectedRule()!.ruleId, ($event.target as HTMLSelectElement).value)">
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
