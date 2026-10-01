<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { t } from '@/shared/i18n'
import {
  modelFactAssertionKindKey, modelFactCompletenessKey, modelFactDiagnosticKindKey, modelFactMatchesFilter,
  modelFactPresentationState, modelFactPresentationTone, modelFactSelectionReasonKey, modelFactSourceKindKey,
  modelFactStateExplanationKey, modelFactStateKey, modelFactValueText,
  type ModelFactFilter, type ModelFactPresentationTone, type PresentableResolvedField,
} from '@/shared/model-facts/modelFactPresentation'

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
type ResolvedSnapshot = Readonly<{
  resolvedSnapshotRevision: string
  sourcePriorityConfigRevision?: string
  sourceScopeSelection: Readonly<{ providerNative: string; modelsDev: string; capabilityRules: string }>
  resolvedFacts: Readonly<{
    capabilityRevision: string
    input?: Readonly<{ sourcePriorityConfigRevision?: string }>
    fields: readonly PresentableResolvedField[]
  }>
}>
type InspectorSnapshot = Readonly<{
  subjectSetRevision: string
  subject: ExactSubject
  sources: readonly InspectorSourceRow[]
  resolved: ResolvedSnapshot | null
}>
type SelectedField = Readonly<{ source: InspectorSourceRow; outcome: FieldOutcome }>
type View = 'overview' | 'fields' | 'evidence'

const props = withDefaults(defineProps<{
  initialSubject?: ExactSubject | null
}>(), {
  initialSubject: null,
})

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
const filter = ref<ModelFactFilter>('all')
const detailPath = ref<string | null>(null)
const FILTERS: readonly ModelFactFilter[] = ['all', 'conflict', 'unknown', 'diagnostics']
const TONE_CLASS: Readonly<Record<ModelFactPresentationTone, string>> = {
  positive: 'bg-green-100 text-green-800',
  negative: 'bg-gray-200 text-gray-800',
  neutral: 'bg-gray-100 text-gray-600',
  warning: 'bg-amber-100 text-amber-800',
  attention: 'bg-orange-100 text-orange-800',
}

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
  detailPath.value = null
  filter.value = 'all'
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

function resolvedFields() {
  return snapshot.value?.resolved?.resolvedFacts.fields ?? []
}

function coverageFor(path: string) {
  return { coveredBySource: (snapshot.value?.sources ?? []).some((source) => sourceOutcome(source, path) !== null) }
}

function stateOf(field: PresentableResolvedField) {
  return modelFactPresentationState(field, coverageFor(field.path))
}

function filteredResolvedFields() {
  return resolvedFields().filter((field) => modelFactMatchesFilter(filter.value, field, coverageFor(field.path)))
}

function detailField(): PresentableResolvedField | null {
  return resolvedFields().find((field) => field.path === detailPath.value) ?? null
}

function resolvedFieldFor(path: string): PresentableResolvedField | null {
  return resolvedFields().find((field) => field.path === path) ?? null
}

function valueOrNone(value: unknown): string {
  return modelFactValueText(value) ?? t('settings.modelsCapabilities.facts.detail.noSelectedValue')
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

function openEvidenceFor(path: string) {
  const source = (snapshot.value?.sources ?? []).find((row) => sourceOutcome(row, path) !== null)
  const outcome = source ? sourceOutcome(source, path) : null
  if (source && outcome) void inspectField(source, outcome)
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

onMounted(async () => {
  await search()
  if (props.initialSubject) await inspect(props.initialSubject)
})
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
            <div class="rounded border border-blue-100 bg-blue-50 p-2 text-xs text-blue-950">
              <div class="font-medium">{{ t('settings.modelsCapabilities.resolvedTitle') }}</div>
              <template v-if="snapshot.resolved">
                <div class="mt-1 break-all text-[10px]">{{ t('settings.modelsCapabilities.capabilityRevision') }}: {{ snapshot.resolved.resolvedFacts.capabilityRevision }}</div>
                <div class="break-all text-[10px]">{{ t('settings.modelsCapabilities.resolvedSnapshotRevision') }}: {{ snapshot.resolved.resolvedSnapshotRevision }}</div>
                <div class="mt-1 text-[11px]">{{ snapshot.resolved.resolvedFacts.fields.length }} {{ t('settings.modelsCapabilities.fields') }}</div>
                <div v-if="snapshot.resolved.sourcePriorityConfigRevision ?? snapshot.resolved.resolvedFacts.input?.sourcePriorityConfigRevision" class="break-all text-[10px]">{{ t('settings.modelsCapabilities.facts.detail.sourcePriorityConfig') }}: {{ snapshot.resolved.sourcePriorityConfigRevision ?? snapshot.resolved.resolvedFacts.input?.sourcePriorityConfigRevision }}</div>
                <div class="mt-2 flex flex-wrap gap-1" role="group" :aria-label="t('settings.modelsCapabilities.facts.filter.label')">
                  <button v-for="option in FILTERS" :key="option" type="button" class="rounded border px-2 py-0.5 text-[10px]"
                    :class="filter === option ? 'border-blue-400 bg-white text-blue-900' : 'border-blue-100 text-blue-800'"
                    :aria-pressed="filter === option" @click="filter = option">{{ t(`settings.modelsCapabilities.facts.filter.${option}`) }}</button>
                </div>
                <div class="mt-2 max-h-64 space-y-1 overflow-auto">
                  <div v-for="field in filteredResolvedFields()" :key="field.path" class="rounded border border-blue-100 bg-white p-2 text-[10px]" :data-testid="`resolved-field-${field.path}`">
                    <div class="flex items-center gap-2">
                      <span class="font-medium text-gray-800">{{ field.path }}</span>
                      <span class="rounded px-1" :class="TONE_CLASS[modelFactPresentationTone(stateOf(field))]" :data-state="stateOf(field)">{{ t(modelFactStateKey(stateOf(field))) }}</span>
                      <button type="button" class="ml-auto rounded border border-gray-300 px-1.5 py-0.5 text-gray-700" :aria-label="`${t('settings.modelsCapabilities.facts.detail.inspect')} ${field.path}`" @click="detailPath = field.path">{{ t('settings.modelsCapabilities.facts.detail.inspect') }}</button>
                    </div>
                    <div class="text-gray-500">{{ valueOrNone(field.selectedValue) }} · {{ t(modelFactSelectionReasonKey(field.selectionReason)) }}</div>
                    <div class="text-gray-400">{{ field.supportingProvenance.length }} {{ t('settings.modelsCapabilities.supportingClaims') }} · {{ field.opposingProvenance.length }} {{ t('settings.modelsCapabilities.opposingClaims') }} · {{ field.overriddenProvenance.length }} {{ t('settings.modelsCapabilities.overriddenClaims') }} · {{ field.diagnostics.length }} {{ t('settings.modelsCapabilities.diagnostics') }}</div>
                  </div>
                  <p v-if="filteredResolvedFields().length === 0" class="text-gray-500">{{ t('settings.modelsCapabilities.facts.detail.noFieldsMatch') }}</p>
                </div>
                <section v-if="detailField()" class="mt-2 space-y-2 rounded border border-blue-200 bg-white p-2 text-[11px] text-gray-800" data-testid="resolved-field-detail" role="region" :aria-label="`${t('settings.modelsCapabilities.facts.detail.title')} ${detailField()!.path}`">
                  <div class="flex items-center gap-2">
                    <span class="font-medium">{{ detailField()!.path }}</span>
                    <span class="rounded px-1" :class="TONE_CLASS[modelFactPresentationTone(stateOf(detailField()!))]">{{ t(modelFactStateKey(stateOf(detailField()!))) }}</span>
                    <button type="button" class="ml-auto rounded border border-gray-300 px-1.5 py-0.5" @click="detailPath = null">{{ t('settings.modelsCapabilities.facts.detail.close') }}</button>
                  </div>
                  <p class="text-gray-600">{{ t(modelFactStateExplanationKey(stateOf(detailField()!))) }}</p>
                  <dl class="space-y-0.5">
                    <div><dt class="inline text-gray-500">{{ t('settings.modelsCapabilities.facts.detail.selectedValue') }}: </dt><dd class="inline break-all">{{ valueOrNone(detailField()!.selectedValue) }}</dd></div>
                    <div><dt class="inline text-gray-500">{{ t('settings.modelsCapabilities.facts.detail.selectionReason') }}: </dt><dd class="inline">{{ t(modelFactSelectionReasonKey(detailField()!.selectionReason)) }}</dd></div>
                    <div><dt class="inline text-gray-500">{{ t('settings.modelsCapabilities.facts.detail.completeness') }}: </dt><dd class="inline">{{ t(modelFactCompletenessKey(detailField()!.completenessDisposition)) }}</dd></div>
                  </dl>
                  <template v-for="group in ([
                    { id: 'supporting', claims: detailField()!.supportingProvenance },
                    { id: 'opposing', claims: detailField()!.opposingProvenance },
                    { id: 'overridden', claims: detailField()!.overriddenProvenance },
                  ] as const)" :key="group.id">
                    <div :data-testid="`detail-${group.id}`">
                      <div class="font-medium">{{ t(`settings.modelsCapabilities.facts.detail.${group.id}`) }}</div>
                      <p v-if="group.claims.length === 0" class="text-gray-400">{{ t('settings.modelsCapabilities.facts.detail.noClaims') }}</p>
                      <ul v-else class="space-y-0.5">
                        <li v-for="(claim, index) in group.claims" :key="index" class="break-all">
                          {{ t(modelFactSourceKindKey(claim.sourceKind)) }} · {{ t('settings.modelsCapabilities.facts.detail.priority') }} {{ claim.sourcePriority }} · {{ t(modelFactAssertionKindKey(claim.sourceAssertion?.provenance?.assertionKind)) }} · {{ t('settings.modelsCapabilities.facts.detail.claimValue') }} {{ valueOrNone(claim.sourceAssertion?.value) }}
                        </li>
                      </ul>
                    </div>
                  </template>
                  <div v-if="detailField()!.candidates?.length" data-testid="detail-candidates">
                    <div class="font-medium">{{ t('settings.modelsCapabilities.facts.detail.candidates') }}</div>
                    <ul class="space-y-0.5">
                      <li v-for="(candidate, index) in detailField()!.candidates" :key="index" class="break-all">
                        {{ t('settings.modelsCapabilities.facts.detail.tiedCandidate') }} {{ index + 1 }}: {{ valueOrNone(candidate.value) }}
                        <span v-for="(claim, claimIndex) in candidate.provenance ?? []" :key="claimIndex"> · {{ t(modelFactSourceKindKey(claim.sourceKind)) }} ({{ t('settings.modelsCapabilities.facts.detail.priority') }} {{ claim.sourcePriority }})</span>
                      </li>
                    </ul>
                  </div>
                  <div data-testid="detail-diagnostics">
                    <div class="font-medium">{{ t('settings.modelsCapabilities.facts.detail.diagnostics') }}</div>
                    <p v-if="detailField()!.diagnostics.length === 0" class="text-gray-400">{{ t('settings.modelsCapabilities.facts.detail.noClaims') }}</p>
                    <ul v-else class="space-y-0.5">
                      <li v-for="(diagnostic, index) in detailField()!.diagnostics" :key="index" class="break-all">
                        {{ t(modelFactSourceKindKey(diagnostic.sourceKind)) }} · {{ t(modelFactDiagnosticKindKey(diagnostic.kind)) }}<span v-if="diagnostic.errorCode"> · {{ t('settings.modelsCapabilities.facts.detail.diagnosticCode') }} {{ diagnostic.errorCode }}</span>
                      </li>
                    </ul>
                  </div>
                  <button v-if="(snapshot.sources ?? []).some((row) => sourceOutcome(row, detailField()!.path) !== null)" type="button" class="rounded border border-gray-300 px-2 py-1" @click="openEvidenceFor(detailField()!.path)">{{ t('settings.modelsCapabilities.facts.detail.openEvidence') }}</button>
                </section>
              </template>
              <div v-else class="mt-1 text-[11px] text-blue-800">{{ t('settings.modelsCapabilities.resolvedAbsent') }}</div>
            </div>
            <div v-for="source in snapshot.sources" :key="`${source.state.sourceKind}:${source.state.sourceScopeId}`" class="rounded border border-gray-100 p-2 text-xs text-gray-700">
              <div class="font-medium">{{ t(modelFactSourceKindKey(source.state.sourceKind)) }} · {{ source.state.sourceScopeId }}</div>
              <div class="mt-1 text-[11px] text-gray-500">{{ source.subjectFact ? t('settings.modelsCapabilities.subjectFactPresent') : t('settings.modelsCapabilities.sourceAbsent') }}<span v-if="source.state.staleReason"> · {{ t('settings.modelsCapabilities.facts.detail.sourceStale') }}: {{ source.state.staleReason }}</span></div>
              <div v-if="source.subjectFact" class="mt-1 text-[10px] text-gray-400">{{ source.subjectFact.payload.recordOutcome }} · {{ source.subjectFact.payload.outcomes.length }} {{ t('settings.modelsCapabilities.fields') }}</div>
            </div>
          </div>

          <div v-else-if="view === 'fields'" class="mt-3 space-y-2">
            <div v-for="row in fields()" :key="`${row.source.state.sourceKind}:${row.source.state.sourceScopeId}:${row.outcome.path}`" class="rounded border border-gray-100 p-2 text-[11px]">
              <button type="button" class="w-full text-left" @click="inspectField(row.source, row.outcome)">
                <span class="font-medium text-gray-800">{{ row.outcome.path }}</span>
                <span v-if="resolvedFieldFor(row.outcome.path) && stateOf(resolvedFieldFor(row.outcome.path)!) === 'conflict'" class="ml-2 rounded bg-amber-100 px-1 text-amber-800">{{ t('settings.modelsCapabilities.facts.state.conflict') }}</span>
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
