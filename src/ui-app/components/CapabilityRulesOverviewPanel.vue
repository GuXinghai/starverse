<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { t } from '@/shared/i18n'

type Rule = Readonly<{ ruleId: string; label: string | null; assertion: Readonly<{ path: string }> }>
type Pack = Readonly<{ packId: string; displayName: string; priority: number; rules: readonly Rule[] }>
type OwnershipSnapshot = Readonly<{ packs: readonly Readonly<{ definition: Pack }>[] }>
type CloudRead = Readonly<{
  distribution: Readonly<{ latestObserved: Readonly<{ releaseVersion: string }> | null; candidate: unknown | null }>
  application: Readonly<{ applied: Readonly<{ releaseVersion: string; document: Readonly<{ packs: readonly Pack[] }> }> | null }>
}>

const props = defineProps<{ ownership: 'cloud' | 'user' }>()
const loading = ref(false)
const error = ref<string | null>(null)
const cloud = ref<CloudRead | null>(null)
const user = ref<OwnershipSnapshot | null>(null)

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
