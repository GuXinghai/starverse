<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { t } from '@/shared/i18n'

type ExactSubject = Readonly<{
  providerAuthorityId: string
  endpointProfileId: string
  nativeModelId: string
}>
type SubjectRecord = Readonly<{ subject: ExactSubject; proofs: readonly unknown[] }>
type FieldOutcome = Readonly<{
  observationId?: string
  path: string
  disposition: string
  currentObservation?: Readonly<{ kind: string; assertion?: Readonly<{ value: unknown; provenance?: unknown }>; provenance?: unknown }>
  effectiveAssertion?: Readonly<{ value: unknown; provenance?: unknown }>
}>
type InspectorSourceRow = Readonly<{
  state: Readonly<{ sourceKind: string; sourceScopeId: string; currentSourceRevision: string | null; staleReason: string | null }>
  subjectFact: Readonly<{
    payload: Readonly<{ recordOutcome: string; outcomes: readonly FieldOutcome[]; unmappedSourceFields?: readonly unknown[] }>
    ref?: Readonly<{ canonicalSubjectFactRevision: string; subjectFactPayloadDigest: string }>
  }> | null
}>
type InspectorSnapshot = Readonly<{ subjectSetRevision: string; subject: ExactSubject; sources: readonly InspectorSourceRow[] }>
type SelectedField = Readonly<{ source: InspectorSourceRow; outcome: FieldOutcome }>
type View = 'overview' | 'fields' | 'evidence'

const query = ref('')
const loading = ref(false)
const evidenceLoading = ref(false)
const error = ref<string | null>(null)
const records = ref<readonly SubjectRecord[]>([])
const nextCursor = ref<string | null>(null)
const subjectSetRevision = ref<string | null>(null)
const selected = ref<ExactSubject | null>(null)
const snapshot = ref<InspectorSnapshot | null>(null)
const view = ref<View>('overview')
const selectedField = ref<SelectedField | null>(null)
const rawPayload = ref<unknown>(null)

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

function subjectKey(subject: ExactSubject): string {
  return `${subject.providerAuthorityId}\u0000${subject.endpointProfileId}\u0000${subject.nativeModelId}`
}

async function search(append = false) {
  loading.value = true
  error.value = null
  try {
    const result = await bridge().searchSubjects({ query: query.value, limit: 100,
      ...(append ? { cursor: nextCursor.value } : {}) }) as Readonly<{
        subjectSetRevision: string; records: readonly SubjectRecord[]; nextCursor: string | null
      }>
    if (!append) records.value = result.records
    else records.value = Object.freeze([...records.value, ...result.records])
    subjectSetRevision.value = result.subjectSetRevision
    nextCursor.value = result.nextCursor
    if (selected.value && !records.value.some((record) => subjectKey(record.subject) === subjectKey(selected.value!))) {
      selected.value = null
      snapshot.value = null
      selectedField.value = null
    }
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
  finally { loading.value = false }
}

async function inspect(subject: ExactSubject) {
  loading.value = true
  error.value = null
  selected.value = subject
  selectedField.value = null
  rawPayload.value = null
  try {
    snapshot.value = await bridge().readInspector({ subject, expectedSubjectSetRevision: subjectSetRevision.value }) as InspectorSnapshot
    view.value = 'overview'
  } catch (cause) {
    snapshot.value = null
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally { loading.value = false }
}

function sourceOutcome(source: InspectorSourceRow, path: string): FieldOutcome | null {
  return source.subjectFact?.payload.outcomes.find((outcome) => outcome.path === path) ?? null
}

function fields(): readonly Readonly<{ source: InspectorSourceRow; outcome: FieldOutcome }>[] {
  const rows: Array<{ source: InspectorSourceRow; outcome: FieldOutcome }> = []
  for (const source of snapshot.value?.sources ?? []) {
    for (const outcome of source.subjectFact?.payload.outcomes ?? []) rows.push({ source, outcome })
  }
  return rows
}

function valueFor(outcome: FieldOutcome): unknown {
  if (outcome.currentObservation?.kind === 'present_valid') return outcome.currentObservation.assertion?.value
  return outcome.effectiveAssertion?.value
}

function valueText(outcome: FieldOutcome | null): string {
  if (!outcome) return t('settings.modelsCapabilities.sourceAbsent')
  const value = valueFor(outcome)
  if (value === undefined) return outcome.disposition
  try { return JSON.stringify(value) } catch { return String(value) }
}

function differs(path: string): boolean {
  const values = (snapshot.value?.sources ?? []).map((source) => sourceOutcome(source, path))
    .filter((outcome): outcome is FieldOutcome => outcome !== null)
    .map(valueFor).filter((value) => value !== undefined)
  return new Set(values.map((value) => {
    try { return JSON.stringify(value) } catch { return String(value) }
  })).size > 1
}

function evidenceRefs(outcome: FieldOutcome): readonly Readonly<{ rawPayloadRef?: unknown; sourceFieldPath?: string }>[] {
  const current = outcome.currentObservation
  const provenance = current?.kind === 'present_valid' ? current.assertion?.provenance : current?.provenance
  const refs = (provenance as { sourceFieldRefs?: unknown[] } | undefined)?.sourceFieldRefs
  return Array.isArray(refs) ? refs as readonly Readonly<{ rawPayloadRef?: unknown; sourceFieldPath?: string }>[] : []
}

async function inspectField(source: InspectorSourceRow, outcome: FieldOutcome) {
  if (!snapshot.value || !selected.value) return
  evidenceLoading.value = true
  error.value = null
  selectedField.value = { source, outcome }
  rawPayload.value = null
  try {
    const result = await bridge().readEvidenceSlice({ subject: selected.value,
      expectedSubjectSetRevision: snapshot.value.subjectSetRevision, sourceKind: source.state.sourceKind,
      sourceScopeId: source.state.sourceScopeId, path: outcome.path })
    const resolvedOutcome = result as FieldOutcome | null
    selectedField.value = { source,
      outcome: resolvedOutcome && (evidenceRefs(resolvedOutcome).length > 0 || evidenceRefs(outcome).length === 0)
        ? resolvedOutcome : outcome }
    view.value = 'evidence'
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
  finally { evidenceLoading.value = false }
}

async function readRawPayload() {
  const field = selectedField.value
  if (!field) { error.value = t('settings.modelsCapabilities.selectField'); return }
  const refValue = evidenceRefs(field.outcome).find((entry) => entry.rawPayloadRef !== undefined)?.rawPayloadRef
  if (!refValue) { error.value = t('settings.modelsCapabilities.rawUnavailable'); return }
  evidenceLoading.value = true
  error.value = null
  try { rawPayload.value = await bridge().readSanitizedRawPayload({ rawPayloadRef: refValue }) }
  catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
  finally { evidenceLoading.value = false }
}

onMounted(() => { void search() })
</script>

<template>
  <section class="space-y-3" data-testid="model-facts-inspector-panel">
    <header>
      <h3 class="text-sm font-semibold text-gray-900">{{ t('settings.modelsCapabilities.inspectorTitle') }}</h3>
      <p class="mt-1 text-xs text-gray-500">{{ t('settings.modelsCapabilities.inspectorDescription') }}</p>
    </header>

    <form class="flex gap-2" @submit.prevent="search()">
      <input v-model="query" class="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm" type="search"
        :aria-label="t('settings.modelsCapabilities.subjectSearch')" :placeholder="t('settings.modelsCapabilities.subjectSearch')" />
      <button type="submit" class="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50" :disabled="loading">{{ t('common.search') }}</button>
    </form>
    <p v-if="error" class="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">{{ error }}</p>

    <div class="grid gap-3 lg:grid-cols-[minmax(14rem,0.8fr)_minmax(20rem,1.2fr)]">
      <div>
        <ul class="max-h-72 overflow-auto rounded border border-gray-200 bg-white" :aria-label="t('settings.modelsCapabilities.authoritativeSubjects')">
          <li v-for="record in records" :key="title(record.subject)" class="border-b border-gray-100 last:border-b-0">
            <button type="button" class="w-full px-3 py-2 text-left text-xs hover:bg-gray-50"
              :class="selected && subjectKey(selected) === subjectKey(record.subject) ? 'bg-blue-50 text-blue-900' : 'text-gray-700'" @click="inspect(record.subject)">
              <span class="block truncate font-medium">{{ record.subject.nativeModelId }}</span>
              <span class="block truncate text-[10px] text-gray-500">{{ record.subject.providerAuthorityId }} · {{ record.subject.endpointProfileId }}</span>
            </button>
          </li>
          <li v-if="!loading && records.length === 0" class="px-3 py-2 text-xs text-gray-500">{{ t('settings.modelsCapabilities.noAuthoritativeSubjects') }}</li>
        </ul>
        <button v-if="nextCursor" type="button" class="mt-2 w-full rounded border border-gray-300 px-2 py-1 text-xs" :disabled="loading" @click="search(true)">{{ t('settings.modelsCapabilities.loadMore') }}</button>
        <p v-if="subjectSetRevision" class="mt-1 break-all text-[10px] text-gray-400">{{ subjectSetRevision }}</p>
      </div>

      <div class="rounded border border-gray-200 bg-white p-3">
        <p v-if="!snapshot" class="text-xs text-gray-500">{{ t('settings.modelsCapabilities.selectSubject') }}</p>
        <template v-else>
          <p class="break-all text-xs font-medium text-gray-900">{{ title(snapshot.subject) }}</p>
          <p class="mt-1 break-all text-[10px] text-gray-500">{{ snapshot.subjectSetRevision }}</p>
          <nav class="mt-3 flex gap-1 border-b border-gray-200 pb-2" role="tablist">
            <button v-for="tab in (['overview', 'fields', 'evidence'] as const)" :key="tab" type="button" role="tab" class="rounded px-2 py-1 text-[11px]" :class="view === tab ? 'bg-blue-50 text-blue-800' : 'text-gray-600'" :aria-selected="view === tab" @click="view = tab">{{ t(`settings.modelsCapabilities.inspector.${tab}`) }}</button>
          </nav>

          <div v-if="view === 'overview'" class="mt-3 space-y-2">
            <div v-for="source in snapshot.sources" :key="`${source.state.sourceKind}:${source.state.sourceScopeId}`" class="rounded border border-gray-100 p-2 text-xs text-gray-700">
              <div class="font-medium">{{ source.state.sourceKind }} · {{ source.state.sourceScopeId }}</div>
              <div class="mt-1 text-[11px] text-gray-500">{{ source.subjectFact ? t('settings.modelsCapabilities.subjectFactPresent') : t('settings.modelsCapabilities.sourceAbsent') }}<span v-if="source.state.staleReason"> · {{ source.state.staleReason }}</span></div>
              <div v-if="source.subjectFact" class="mt-1 text-[10px] text-gray-400">{{ source.subjectFact.payload.recordOutcome }} · {{ source.subjectFact.payload.outcomes.length }} {{ t('settings.modelsCapabilities.fields') }}</div>
            </div>
          </div>

          <div v-else-if="view === 'fields'" class="mt-3 space-y-2">
            <div v-for="row in fields()" :key="`${row.source.state.sourceKind}:${row.source.state.sourceScopeId}:${row.outcome.path}`" class="rounded border border-gray-100 p-2 text-[11px]">
              <button type="button" class="w-full text-left" @click="inspectField(row.source, row.outcome)">
                <span class="font-medium text-gray-800">{{ row.outcome.path }}</span>
                <span v-if="differs(row.outcome.path)" class="ml-2 rounded bg-amber-100 px-1 text-amber-800">{{ t('settings.modelsCapabilities.valuesDiffer') }}</span>
                <span class="block text-gray-500">{{ row.source.state.sourceKind }} · {{ valueText(row.outcome) }} · {{ row.outcome.disposition }}</span>
              </button>
            </div>
            <p v-if="fields().length === 0" class="text-xs text-gray-500">{{ t('settings.modelsCapabilities.noFields') }}</p>
          </div>

          <div v-else class="mt-3 space-y-2">
            <p v-if="!selectedField" class="text-xs text-gray-500">{{ t('settings.modelsCapabilities.selectField') }}</p>
            <template v-else>
              <div class="text-xs font-medium text-gray-800">{{ selectedField.outcome.path }}</div>
              <pre class="max-h-56 overflow-auto rounded bg-gray-50 p-2 text-[10px] text-gray-700">{{ JSON.stringify(selectedField.outcome, null, 2) }}</pre>
              <div class="text-[10px] text-gray-500">{{ selectedField.source.state.sourceKind }} · {{ selectedField.source.state.sourceScopeId }}</div>
              <button type="button" class="rounded border border-gray-300 px-2 py-1 text-xs" :disabled="evidenceLoading" @click="readRawPayload">{{ t('settings.modelsCapabilities.viewRawPayload') }}</button>
              <pre v-if="rawPayload !== null" class="max-h-72 overflow-auto rounded bg-gray-900 p-2 text-[10px] text-gray-100">{{ JSON.stringify(rawPayload, null, 2) }}</pre>
            </template>
          </div>
        </template>
      </div>
    </div>
  </section>
</template>
