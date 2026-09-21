<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { t } from '@/shared/i18n'

type ExactSubject = Readonly<{
  providerAuthorityId: string
  endpointProfileId: string
  nativeModelId: string
}>
type SubjectRecord = Readonly<{ subject: ExactSubject; proofs: readonly unknown[] }>
type InspectorSourceRow = Readonly<{
  state: Readonly<{ sourceKind: string; sourceScopeId: string; currentSourceRevision: string | null; staleReason: string | null }>
  subjectFact: Readonly<{ payload: Readonly<{ outcomes: readonly Readonly<{ path: string; disposition: string }>[] }> }> | null
}>
type InspectorSnapshot = Readonly<{ subjectSetRevision: string; subject: ExactSubject; sources: readonly InspectorSourceRow[] }>

const query = ref('')
const loading = ref(false)
const error = ref<string | null>(null)
const records = ref<readonly SubjectRecord[]>([])
const selected = ref<ExactSubject | null>(null)
const snapshot = ref<InspectorSnapshot | null>(null)

function bridge() {
  const value = window.generationV2?.modelFactsInspector
  if (!value || typeof value.searchSubjects !== 'function' || typeof value.readInspector !== 'function') {
    throw new Error('GENERATION_V2_MODEL_FACTS_INSPECTOR_UNAVAILABLE')
  }
  return value
}

function title(subject: ExactSubject): string {
  return `${subject.providerAuthorityId} / ${subject.endpointProfileId} / ${subject.nativeModelId}`
}

async function search() {
  loading.value = true
  error.value = null
  try {
    const result = await bridge().searchSubjects({ query: query.value, limit: 100 }) as Readonly<{
      records: readonly SubjectRecord[]
    }>
    records.value = result.records
    if (selected.value && !records.value.some((record) => title(record.subject) === title(selected.value!))) {
      selected.value = null
      snapshot.value = null
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally { loading.value = false }
}

async function inspect(subject: ExactSubject) {
  loading.value = true
  error.value = null
  selected.value = subject
  try {
    snapshot.value = await bridge().readInspector({ subject }) as InspectorSnapshot
  } catch (cause) {
    snapshot.value = null
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally { loading.value = false }
}

onMounted(() => { void search() })
</script>

<template>
  <section class="space-y-3" data-testid="model-facts-inspector-panel">
    <header>
      <h3 class="text-sm font-semibold text-gray-900">{{ t('settings.modelsCapabilities.inspectorTitle') }}</h3>
      <p class="mt-1 text-xs text-gray-500">{{ t('settings.modelsCapabilities.inspectorDescription') }}</p>
    </header>

    <form class="flex gap-2" @submit.prevent="search">
      <input v-model="query" class="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm" type="search"
        :aria-label="t('settings.modelsCapabilities.subjectSearch')" :placeholder="t('settings.modelsCapabilities.subjectSearch')" />
      <button type="submit" class="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50" :disabled="loading">
        {{ t('common.search') }}
      </button>
    </form>
    <p v-if="error" class="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">{{ error }}</p>

    <div class="grid gap-3 lg:grid-cols-[minmax(14rem,0.8fr)_minmax(20rem,1.2fr)]">
      <ul class="max-h-72 overflow-auto rounded border border-gray-200 bg-white" :aria-label="t('settings.modelsCapabilities.authoritativeSubjects')">
        <li v-for="record in records" :key="title(record.subject)" class="border-b border-gray-100 last:border-b-0">
          <button type="button" class="w-full px-3 py-2 text-left text-xs hover:bg-gray-50"
            :class="selected && title(selected) === title(record.subject) ? 'bg-blue-50 text-blue-900' : 'text-gray-700'"
            @click="inspect(record.subject)">
            <span class="block truncate font-medium">{{ record.subject.nativeModelId }}</span>
            <span class="block truncate text-[10px] text-gray-500">{{ record.subject.providerAuthorityId }} · {{ record.subject.endpointProfileId }}</span>
          </button>
        </li>
        <li v-if="!loading && records.length === 0" class="px-3 py-2 text-xs text-gray-500">{{ t('settings.modelsCapabilities.noAuthoritativeSubjects') }}</li>
      </ul>

      <div class="rounded border border-gray-200 bg-white p-3">
        <p v-if="!snapshot" class="text-xs text-gray-500">{{ t('settings.modelsCapabilities.selectSubject') }}</p>
        <template v-else>
          <p class="break-all text-xs font-medium text-gray-900">{{ title(snapshot.subject) }}</p>
          <p class="mt-1 break-all text-[10px] text-gray-500">{{ snapshot.subjectSetRevision }}</p>
          <ul class="mt-3 space-y-2">
            <li v-for="source in snapshot.sources" :key="`${source.state.sourceKind}:${source.state.sourceScopeId}`"
              class="rounded border border-gray-100 p-2 text-xs text-gray-700">
              <div class="font-medium">{{ source.state.sourceKind }} · {{ source.state.sourceScopeId }}</div>
              <div class="mt-1 text-[11px] text-gray-500">
                {{ source.subjectFact ? t('settings.modelsCapabilities.subjectFactPresent') : t('settings.modelsCapabilities.sourceAbsent') }}
                <span v-if="source.state.staleReason"> · {{ source.state.staleReason }}</span>
              </div>
              <ul v-if="source.subjectFact" class="mt-2 space-y-1 text-[11px]">
                <li v-for="outcome in source.subjectFact.payload.outcomes" :key="outcome.path">
                  {{ outcome.path }} · {{ outcome.disposition }}
                </li>
              </ul>
            </li>
          </ul>
        </template>
      </div>
    </div>
  </section>
</template>
