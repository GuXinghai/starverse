<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { t } from '@/shared/i18n'

type Rule = Readonly<{ ruleId: string; label: string | null; assertion: Readonly<{ path: string }> }>
type Pack = Readonly<{ packId: string; displayName: string; priority: number; rules: readonly Rule[] }>
type OwnershipSnapshot = Readonly<{ packs: readonly Readonly<{ definition: Pack }>[] }>
type CloudRead = Readonly<{
  distribution: Readonly<{
    latestObserved: Readonly<{ releaseVersion: string }> | null
    candidate: Readonly<{ candidateRecordRevision: string; releaseVersion: string }> | null
  }>
  application: Readonly<{
    appliedRecordRevision: number | null
    applied: Readonly<{ releaseVersion: string; document: Readonly<{ packs: readonly Pack[] }> }> | null
  }>
}>

const props = defineProps<{ ownership: 'cloud' | 'user' }>()
const loading = ref(false)
const error = ref<string | null>(null)
const cloud = ref<CloudRead | null>(null)
const user = ref<OwnershipSnapshot | null>(null)
const candidateDiff = ref<Readonly<{ current: string | null; candidate: string }> | null>(null)
const applying = ref(false)
const applyConfirming = ref(false)

function capabilityRules() {
  const value = window.generationV2?.capabilityRules
  if (!value) throw new Error('GENERATION_V2_CAPABILITY_RULES_UNAVAILABLE')
  return value
}

function packs(): readonly Pack[] {
  if (props.ownership === 'cloud') return cloud.value?.application.applied?.document.packs ?? []
  return user.value?.packs.map((pack) => pack.definition) ?? []
}

async function load() {
  loading.value = true
  error.value = null
  try {
    if (props.ownership === 'cloud') cloud.value = await capabilityRules().cloud.read() as CloudRead
    else user.value = (await capabilityRules().user.readCommitted() as Readonly<{ snapshot: OwnershipSnapshot | null }>).snapshot
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally { loading.value = false }
}

async function checkCloud() {
  if (props.ownership !== 'cloud') return
  loading.value = true
  error.value = null
  try {
    await capabilityRules().cloud.check()
    await load()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally { loading.value = false }
}

function candidateRequest() {
  const state = cloud.value
  if (!state?.distribution.candidate) throw new Error('GENERATION_V2_CLOUD_RULES_CANDIDATE_NOT_FOUND')
  return Object.freeze({ expectedCandidateRecordRevision: state.distribution.candidate.candidateRecordRevision,
    expectedAppliedRecordRevision: state.application.appliedRecordRevision })
}

async function viewChanges() {
  loading.value = true
  error.value = null
  try { candidateDiff.value = await capabilityRules().cloud.candidateDiff(candidateRequest()) as Readonly<{ current: string | null; candidate: string }> }
  catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
  finally { loading.value = false }
}

async function applyCandidate() {
  applying.value = true
  error.value = null
  try {
    await capabilityRules().cloud.apply(candidateRequest())
    candidateDiff.value = null
    applyConfirming.value = false
    await load()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
  finally { applying.value = false }
}

onMounted(() => { void load() })
</script>

<template>
  <section class="space-y-3" :data-testid="`capability-rules-${props.ownership}-overview`">
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
    <p v-if="error" class="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">{{ error }}</p>
    <p v-if="props.ownership === 'cloud' && cloud?.application.applied" class="text-xs text-gray-500">
      {{ t('settings.modelsCapabilities.appliedRelease') }}: {{ cloud.application.applied.releaseVersion }}
      <span v-if="cloud.distribution.candidate"> · {{ t('settings.modelsCapabilities.candidateAvailable') }}</span>
    </p>
    <div v-if="props.ownership === 'cloud' && cloud?.distribution.candidate" class="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
      <div>{{ t('settings.modelsCapabilities.candidateRelease') }}: {{ cloud.distribution.candidate.releaseVersion }}</div>
      <div class="mt-2 flex flex-wrap gap-2">
        <button type="button" class="rounded border border-amber-300 bg-white px-2 py-1 hover:bg-amber-100" :disabled="loading || applying" @click="viewChanges">{{ t('settings.modelsCapabilities.viewChanges') }}</button>
        <button type="button" class="rounded border border-amber-300 bg-white px-2 py-1 hover:bg-amber-100" :disabled="loading || applying" @click="applyConfirming = true">{{ t('settings.modelsCapabilities.applyUpdate') }}</button>
      </div>
      <pre v-if="candidateDiff" class="mt-2 max-h-48 overflow-auto rounded bg-white p-2 text-[10px] text-gray-700">{{ candidateDiff.candidate }}</pre>
      <div v-if="applyConfirming" class="mt-2 rounded border border-amber-300 bg-white p-2">
        <p>{{ t('settings.modelsCapabilities.applyConfirmation') }}</p>
        <div class="mt-2 flex gap-2">
          <button type="button" class="rounded bg-amber-600 px-2 py-1 text-white hover:bg-amber-700" :disabled="applying" @click="applyCandidate">{{ applying ? t('common.loading') : t('common.confirm') }}</button>
          <button type="button" class="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50" :disabled="applying" @click="applyConfirming = false">{{ t('common.cancel') }}</button>
        </div>
      </div>
    </div>
    <ul class="space-y-2">
      <li v-for="pack in packs()" :key="pack.packId" class="rounded border border-gray-200 bg-white p-3">
        <div class="flex items-center justify-between gap-2 text-xs">
          <span class="font-medium text-gray-900">{{ pack.displayName }}</span>
          <span class="text-gray-500">{{ t('settings.modelsCapabilities.priority') }}: {{ pack.priority }}</span>
        </div>
        <ul class="mt-2 space-y-1 text-[11px] text-gray-600">
          <li v-for="rule in pack.rules" :key="rule.ruleId">{{ rule.label ?? rule.ruleId }} · {{ rule.assertion.path }}</li>
        </ul>
      </li>
      <li v-if="!loading && packs().length === 0" class="rounded border border-dashed border-gray-200 px-3 py-4 text-xs text-gray-500">
        {{ t('settings.modelsCapabilities.noPacks') }}
      </li>
    </ul>
  </section>
</template>
