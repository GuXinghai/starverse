<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { t } from '@/shared/i18n'

type PriorityMap = Readonly<{ provider_native: number; models_dev: number; capability_rule: number }>
type PriorityResponse = Readonly<{ config: Readonly<{ priorities: PriorityMap; sourcePriorityConfigRevision: string }> }>

const loading = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)
const status = ref<string | null>(null)
const revision = ref('')
const priorities = ref<PriorityMap>({ provider_native: 3, models_dev: 2, capability_rule: 1 })

function bridge() {
  const value = window.generationV2?.modelFacts?.sourcePriority
  if (!value || typeof value.get !== 'function' || typeof value.update !== 'function') {
    throw new Error('GENERATION_V2_SOURCE_PRIORITY_CONFIG_UNAVAILABLE')
  }
  return value
}

function numeric(value: number): number {
  return Number.isSafeInteger(value) ? value : 0
}

async function load() {
  loading.value = true
  error.value = null
  try {
    const result = await bridge().get({}) as PriorityResponse
    priorities.value = { ...result.config.priorities }
    revision.value = result.config.sourcePriorityConfigRevision
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
  finally { loading.value = false }
}

async function save() {
  saving.value = true
  error.value = null
  status.value = null
  try {
    const result = await bridge().update({ expectedConfigRevision: revision.value, priorities: { ...priorities.value } }) as PriorityResponse
    priorities.value = { ...result.config.priorities }
    revision.value = result.config.sourcePriorityConfigRevision
    status.value = t('settings.modelsCapabilities.prioritySaved')
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
  finally { saving.value = false }
}

onMounted(load)
</script>

<template>
  <section class="space-y-3 rounded border border-gray-200 bg-white p-3" data-testid="model-facts-source-priority-settings">
    <header>
      <h3 class="text-sm font-semibold text-gray-900">{{ t('settings.modelsCapabilities.priorityTitle') }}</h3>
      <p class="mt-1 text-xs text-gray-500">{{ t('settings.modelsCapabilities.priorityDescription') }}</p>
    </header>
    <p v-if="error" class="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">{{ error }}</p>
    <p v-if="status" class="rounded border border-green-200 bg-green-50 px-2 py-1 text-xs text-green-800">{{ status }}</p>
    <form class="grid gap-2 sm:grid-cols-3" @submit.prevent="save">
      <label class="text-xs text-gray-700">{{ t('settings.modelsCapabilities.providerNativePriority') }}
        <input v-model.number="priorities.provider_native" type="number" step="1" class="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" :disabled="loading || saving" @change="priorities = { ...priorities, provider_native: numeric(priorities.provider_native) }" />
      </label>
      <label class="text-xs text-gray-700">{{ t('settings.modelsCapabilities.modelsDevPriority') }}
        <input v-model.number="priorities.models_dev" type="number" step="1" class="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" :disabled="loading || saving" @change="priorities = { ...priorities, models_dev: numeric(priorities.models_dev) }" />
      </label>
      <label class="text-xs text-gray-700">{{ t('settings.modelsCapabilities.capabilityRulesPriority') }}
        <input v-model.number="priorities.capability_rule" type="number" step="1" class="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" :disabled="loading || saving" @change="priorities = { ...priorities, capability_rule: numeric(priorities.capability_rule) }" />
      </label>
      <div class="sm:col-span-3 flex items-center justify-between gap-2">
        <span class="break-all text-[10px] text-gray-400">{{ revision }}</span>
        <div class="flex gap-2">
          <button type="button" class="rounded border border-gray-300 px-3 py-1.5 text-xs" :disabled="loading || saving" @click="load">{{ t('common.reload') }}</button>
          <button type="submit" class="rounded bg-blue-600 px-3 py-1.5 text-xs text-white disabled:opacity-50" :disabled="loading || saving || !revision">{{ t('settings.modelsCapabilities.savePriority') }}</button>
        </div>
      </div>
    </form>
  </section>
</template>
