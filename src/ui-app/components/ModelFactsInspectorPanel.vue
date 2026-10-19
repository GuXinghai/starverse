<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { t } from '@/shared/i18n'
import UiIcon from '@/ui-kit/icons/UiIcon.vue'
import { decodeModelFactsSemanticInvalidationV1 } from '@/core/generation-v2/model-facts/semanticInvalidationV1'
import {
  modelFactAssertionKindKey, modelFactCompletenessKey, modelFactDiagnosticKindKey, modelFactMatchesFilter,
  modelFactPresentationState, modelFactPresentationTone, modelFactSelectionReasonKey, modelFactSourceKindKey,
  modelFactRuleClaimIdentity, modelFactStateExplanationKey, modelFactStateKey, modelFactValueText,
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
  initialPath?: string | null
}>(), {
  initialSubject: null,
  initialPath: null,
})
const emit = defineEmits<{ (event: 'open-source-priority'): void }>()

const query = ref('')
const searchLoading = ref(false)
const inspectionLoading = ref(false)
const loading = computed(() => searchLoading.value || inspectionLoading.value)
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
let mounted = true
let inspectionAttempt = 0
let searchAttempt = 0
let evidenceAttempt = 0
let rawAttempt = 0
let unsubscribeInvalidation: (() => void) | null = null
const FILTERS: readonly ModelFactFilter[] = ['all', 'conflict', 'unknown', 'diagnostics']
const TONE_CLASS: Readonly<Record<ModelFactPresentationTone, string>> = {
  positive: 'text-gray-900',
  negative: 'text-gray-700',
  neutral: 'text-gray-600',
  warning: 'text-[var(--sv-warning)]',
  attention: 'text-[var(--sv-warning)]',
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
  const attempt = ++searchAttempt
  const inspection = inspectionAttempt
  const capturedQuery = query.value
  const current = () => mounted && searchAttempt === attempt && inspectionAttempt === inspection && query.value === capturedQuery
  searchLoading.value = true
  error.value = null
  try {
    const result = await bridge().searchSubjects({ query: capturedQuery, limit: 100,
      ...(append ? { cursor: nextCursor.value } : {}) }) as Readonly<{
        subjectSetRevision: string; records: readonly SubjectRecord[]; nextCursor: string | null
      }>
    if (!current()) return
    if (!append) records.value = result.records
    else records.value = Object.freeze([...records.value, ...result.records])
    subjectSetRevision.value = result.subjectSetRevision
    nextCursor.value = result.nextCursor
  } catch { if (current()) error.value = t('common.error') }
  finally { if (mounted && searchAttempt === attempt) searchLoading.value = false }
}

async function inspect(subject: ExactSubject, refresh = false) {
  const attempt = ++inspectionAttempt
  ++evidenceAttempt
  ++rawAttempt
  const retainedField = refresh && selectedField.value ? {
    path: selectedField.value.outcome.path, sourceKind: selectedField.value.source.state.sourceKind,
    sourceScopeId: selectedField.value.source.state.sourceScopeId,
  } : null
  const current = () => mounted && inspectionAttempt === attempt && selected.value !== null &&
    subjectKey(selected.value) === subjectKey(subject)
  inspectionLoading.value = true
  evidenceLoading.value = false
  error.value = null
  selected.value = subject
  snapshot.value = null
  selectedField.value = null
  rawPayload.value = null
  if (!refresh) {
    detailPath.value = null
    filter.value = 'all'
    view.value = 'overview'
  }
  try {
    const result = await bridge().readInspector({ subject,
      ...(!refresh && subjectSetRevision.value ? { expectedSubjectSetRevision: subjectSetRevision.value } : {}),
    }) as InspectorSnapshot
    if (!current()) return
    snapshot.value = result
    subjectSetRevision.value = result.subjectSetRevision
    if (detailPath.value && !resolvedFieldFor(detailPath.value)) detailPath.value = null
    if (retainedField) {
      const source = result.sources.find((row) => row.state.sourceKind === retainedField.sourceKind &&
        row.state.sourceScopeId === retainedField.sourceScopeId)
      const outcome = source ? sourceOutcome(source, retainedField.path) : null
      if (source && outcome) selectedField.value = { source, outcome }
      else if (view.value === 'evidence') view.value = 'overview'
    }
  } catch {
    if (!current()) return
    snapshot.value = null
    error.value = t('common.error')
  } finally { if (current()) inspectionLoading.value = false }
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
  const capturedSnapshot = snapshot.value
  const subject = selected.value
  const inspection = inspectionAttempt
  const attempt = ++evidenceAttempt
  ++rawAttempt
  const current = () => mounted && inspectionAttempt === inspection && evidenceAttempt === attempt &&
    snapshot.value === capturedSnapshot && selected.value !== null && subjectKey(selected.value) === subjectKey(subject)
  evidenceLoading.value = true
  error.value = null
  selectedField.value = { source, outcome }
  rawPayload.value = null
  try {
    const result = await bridge().readEvidenceSlice({ subject,
      expectedSubjectSetRevision: capturedSnapshot.subjectSetRevision, sourceKind: source.state.sourceKind,
      sourceScopeId: source.state.sourceScopeId, path: outcome.path })
    const resolvedOutcome = result as FieldOutcome | null
    if (!current()) return
    selectedField.value = { source,
      outcome: resolvedOutcome && (evidenceRefs(resolvedOutcome).length > 0 || evidenceRefs(outcome).length === 0)
        ? resolvedOutcome : outcome }
    view.value = 'evidence'
  } catch { if (current()) error.value = t('common.error') }
  finally { if (current()) evidenceLoading.value = false }
}

async function readRawPayload() {
  const field = selectedField.value
  if (!field) { error.value = t('settings.modelsCapabilities.selectField'); return }
  const refValue = evidenceRefs(field.outcome).find((entry) => entry.rawPayloadRef !== undefined)?.rawPayloadRef
  if (!refValue) { error.value = t('settings.modelsCapabilities.rawUnavailable'); return }
  const capturedSnapshot = snapshot.value
  const inspection = inspectionAttempt
  const evidence = evidenceAttempt
  const attempt = ++rawAttempt
  const current = () => mounted && inspectionAttempt === inspection && evidenceAttempt === evidence &&
    rawAttempt === attempt && snapshot.value === capturedSnapshot && selectedField.value === field
  evidenceLoading.value = true
  error.value = null
  try {
    const result = await bridge().readSanitizedRawPayload({ rawPayloadRef: refValue })
    if (current()) rawPayload.value = result
  } catch { if (current()) error.value = t('common.error') }
  finally { if (current()) evidenceLoading.value = false }
}

/** Opens the "why" panel for an exact resolved path only; an absent path leaves the overview as is. */
function openInitialPath() {
  if (props.initialPath && resolvedFieldFor(props.initialPath)) detailPath.value = props.initialPath
}

onMounted(async () => {
  const initialAttempt = inspectionAttempt
  unsubscribeInvalidation = window.generationV2?.onModelFactsSemanticInvalidated?.((value) => {
    try { decodeModelFactsSemanticInvalidationV1(value) } catch { return }
    if (!mounted) return
    const subject = selected.value ?? props.initialSubject
    if (subject) void inspect(subject, true)
    else {
      ++inspectionAttempt
      ++evidenceAttempt
      ++rawAttempt
      snapshot.value = null
      selectedField.value = null
      rawPayload.value = null
    }
    void search()
  }) ?? null
  await search()
  if (mounted && inspectionAttempt === initialAttempt && props.initialSubject) {
    await inspect(props.initialSubject)
    openInitialPath()
  }
})

watch(() => [props.initialSubject, props.initialPath] as const, async ([subject], previous) => {
  if (!subject) {
    if (!previous[0]) return
    ++inspectionAttempt
    ++evidenceAttempt
    ++rawAttempt
    selected.value = null
    snapshot.value = null
    selectedField.value = null
    rawPayload.value = null
    inspectionLoading.value = false
    evidenceLoading.value = false
    return
  }
  if (!previous[0] || subjectKey(previous[0]) !== subjectKey(subject)) await inspect(subject)
  openInitialPath()
})

onUnmounted(() => {
  mounted = false
  ++inspectionAttempt
  ++searchAttempt
  ++evidenceAttempt
  ++rawAttempt
  unsubscribeInvalidation?.()
})
</script>

<template>
  <section class="flex min-w-0 flex-col gap-4" data-testid="model-facts-inspector-panel">
    <header>
      <h3 class="text-sm font-semibold text-gray-900">{{ t('settings.modelsCapabilities.inspectorTitle') }}</h3>
      <p class="sv-meta mt-1">{{ t('settings.modelsCapabilities.inspectorDescription') }}</p>
    </header>

    <form class="flex gap-2" @submit.prevent="search()">
      <input v-model="query" class="sv-input min-w-0 flex-1" type="search"
        :aria-label="t('settings.modelsCapabilities.subjectSearch')" :placeholder="t('settings.modelsCapabilities.subjectSearch')" />
      <button type="submit" class="sv-btn min-w-20" :disabled="loading">{{ t('common.search') }}</button>
    </form>
    <p v-if="error" class="sv-notice sv-notice-danger"><UiIcon name="alert" :size="14" class="mt-0.5 shrink-0" /><span class="min-w-0 break-all">{{ error }}</span></p>

    <div class="grid min-w-0 gap-4 lg:grid-cols-[minmax(14rem,0.8fr)_minmax(20rem,1.2fr)]">
      <div class="min-w-0">
        <ul class="flex max-h-72 flex-col gap-0.5 overflow-auto" :aria-label="t('settings.modelsCapabilities.authoritativeSubjects')">
          <li v-for="record in records" :key="title(record.subject)">
            <button type="button" class="sv-row block w-full px-3 py-2 text-left text-xs"
              :class="selected && subjectKey(selected) === subjectKey(record.subject) ? 'is-selected text-gray-900' : 'text-gray-700'" @click="inspect(record.subject)">
              <span class="block truncate text-[13px] font-medium">{{ record.subject.nativeModelId }}</span>
              <span class="sv-meta block truncate">{{ record.subject.providerAuthorityId }} · {{ record.subject.endpointProfileId }}</span>
            </button>
          </li>
          <li v-if="!loading && records.length === 0" class="sv-meta px-3 py-2">{{ t('settings.modelsCapabilities.noAuthoritativeSubjects') }}</li>
        </ul>
        <button v-if="nextCursor" type="button" class="sv-btn sv-btn-sm mt-2 w-full" :disabled="loading" @click="search(true)">{{ t('settings.modelsCapabilities.loadMore') }}</button>
        <p v-if="subjectSetRevision" class="sv-meta mt-1 break-all">{{ subjectSetRevision }}</p>
      </div>

      <div class="min-w-0 lg:border-l lg:border-[var(--sv-line)] lg:pl-4">
        <p v-if="!snapshot" class="sv-meta">{{ t('settings.modelsCapabilities.selectSubject') }}</p>
        <template v-else>
          <p class="break-all text-[13px] font-medium text-gray-900">{{ title(snapshot.subject) }}</p>
          <p class="sv-meta mt-1 break-all">{{ snapshot.subjectSetRevision }}</p>
          <nav class="sv-segmented mt-3" role="tablist">
            <button v-for="tab in (['overview', 'fields', 'evidence'] as const)" :key="tab" type="button" role="tab" :aria-selected="view === tab" @click="view = tab">{{ t(`settings.modelsCapabilities.inspector.${tab}`) }}</button>
          </nav>

          <div v-if="view === 'overview'" class="mt-4 flex flex-col gap-4">
            <div class="text-xs text-gray-800">
              <div class="sv-label">{{ t('settings.modelsCapabilities.resolvedTitle') }}</div>
              <template v-if="snapshot.resolved">
                <div class="mt-1 break-all">{{ t('settings.modelsCapabilities.capabilityRevision') }}: {{ snapshot.resolved.resolvedFacts.capabilityRevision }}</div>
                <div class="break-all">{{ t('settings.modelsCapabilities.resolvedSnapshotRevision') }}: {{ snapshot.resolved.resolvedSnapshotRevision }}</div>
                <div class="mt-1">{{ snapshot.resolved.resolvedFacts.fields.length }} {{ t('settings.modelsCapabilities.fields') }}</div>
                <div v-if="snapshot.resolved.sourcePriorityConfigRevision ?? snapshot.resolved.resolvedFacts.input?.sourcePriorityConfigRevision" class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1"><span class="min-w-0 break-all">{{ t('settings.modelsCapabilities.facts.detail.sourcePriorityConfig') }}: {{ snapshot.resolved.sourcePriorityConfigRevision ?? snapshot.resolved.resolvedFacts.input?.sourcePriorityConfigRevision }}</span>
                  <button type="button" class="sv-btn sv-btn-sm" @click="emit('open-source-priority')">{{ t('settings.modelsCapabilities.sourcePriority.edit') }}</button></div>
                <div class="mt-3 flex flex-wrap gap-1" role="group" :aria-label="t('settings.modelsCapabilities.facts.filter.label')">
                  <button v-for="option in FILTERS" :key="option" type="button" class="sv-btn sv-btn-sm sv-btn-ghost"
                    :aria-pressed="filter === option" @click="filter = option">{{ t(`settings.modelsCapabilities.facts.filter.${option}`) }}</button>
                </div>
                <div class="mt-2 max-h-64 overflow-auto">
                  <div v-for="field in filteredResolvedFields()" :key="field.path" class="sv-divider-t flex flex-col gap-0.5 py-2 first:border-t-0" :data-testid="`resolved-field-${field.path}`">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="min-w-0 break-all font-medium text-gray-900">{{ field.path }}</span>
                      <span class="sv-chip" :class="TONE_CLASS[modelFactPresentationTone(stateOf(field))]" :data-state="stateOf(field)">{{ t(modelFactStateKey(stateOf(field))) }}</span>
                      <button type="button" class="sv-btn sv-btn-sm sv-btn-ghost ml-auto" :aria-label="`${t('settings.modelsCapabilities.facts.detail.inspect')} ${field.path}`" @click="detailPath = field.path">{{ t('settings.modelsCapabilities.facts.detail.inspect') }}</button>
                    </div>
                    <div class="break-words text-gray-600">{{ valueOrNone(field.selectedValue) }} · {{ t(modelFactSelectionReasonKey(field.selectionReason)) }}</div>
                    <div class="sv-meta">{{ field.supportingProvenance.length }} {{ t('settings.modelsCapabilities.supportingClaims') }} · {{ field.opposingProvenance.length }} {{ t('settings.modelsCapabilities.opposingClaims') }} · {{ field.overriddenProvenance.length }} {{ t('settings.modelsCapabilities.overriddenClaims') }} · {{ field.diagnostics.length }} {{ t('settings.modelsCapabilities.diagnostics') }}</div>
                  </div>
                  <p v-if="filteredResolvedFields().length === 0" class="sv-meta py-2">{{ t('settings.modelsCapabilities.facts.detail.noFieldsMatch') }}</p>
                </div>
                <section v-if="detailField()" class="mt-3 flex flex-col gap-2 border-l border-[var(--sv-line-strong)] pl-3 text-xs text-gray-800" data-testid="resolved-field-detail" role="region" :aria-label="`${t('settings.modelsCapabilities.facts.detail.title')} ${detailField()!.path}`">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="min-w-0 break-all font-medium">{{ detailField()!.path }}</span>
                    <span class="sv-chip" :class="TONE_CLASS[modelFactPresentationTone(stateOf(detailField()!))]">{{ t(modelFactStateKey(stateOf(detailField()!))) }}</span>
                    <button type="button" class="sv-btn sv-btn-sm sv-btn-ghost ml-auto" @click="detailPath = null">{{ t('settings.modelsCapabilities.facts.detail.close') }}</button>
                  </div>
                  <p class="text-gray-600">{{ t(modelFactStateExplanationKey(stateOf(detailField()!))) }}</p>
                  <dl class="flex flex-col gap-0.5">
                    <div><dt class="inline text-gray-500">{{ t('settings.modelsCapabilities.facts.detail.selectedValue') }}: </dt><dd class="inline break-all">{{ valueOrNone(detailField()!.selectedValue) }}</dd></div>
                    <div><dt class="inline text-gray-500">{{ t('settings.modelsCapabilities.facts.detail.selectionReason') }}: </dt><dd class="inline">{{ t(modelFactSelectionReasonKey(detailField()!.selectionReason)) }}</dd>
                      <button v-if="detailField()!.selectionReason === 'equal_priority_conflict'" type="button" class="sv-btn sv-btn-sm ml-2" data-testid="detail-edit-source-priority" @click="emit('open-source-priority')">{{ t('settings.modelsCapabilities.sourcePriority.edit') }}</button></div>
                    <div><dt class="inline text-gray-500">{{ t('settings.modelsCapabilities.facts.detail.completeness') }}: </dt><dd class="inline">{{ t(modelFactCompletenessKey(detailField()!.completenessDisposition)) }}</dd></div>
                  </dl>
                  <template v-for="group in ([
                    { id: 'supporting', claims: detailField()!.supportingProvenance },
                    { id: 'opposing', claims: detailField()!.opposingProvenance },
                    { id: 'overridden', claims: detailField()!.overriddenProvenance },
                  ] as const)" :key="group.id">
                    <div :data-testid="`detail-${group.id}`">
                      <div class="sv-label">{{ t(`settings.modelsCapabilities.facts.detail.${group.id}`) }}</div>
                      <p v-if="group.claims.length === 0" class="sv-meta">{{ t('settings.modelsCapabilities.facts.detail.noClaims') }}</p>
                      <ul v-else class="flex flex-col gap-0.5">
                        <li v-for="(claim, index) in group.claims" :key="index" class="break-all">
                          {{ t(modelFactSourceKindKey(claim.sourceKind)) }} · {{ t('settings.modelsCapabilities.facts.detail.priority') }} {{ claim.sourcePriority }} · {{ t(modelFactAssertionKindKey(claim.sourceAssertion?.provenance?.assertionKind)) }} · {{ t('settings.modelsCapabilities.facts.detail.claimValue') }} {{ valueOrNone(claim.sourceAssertion?.value) }}<span v-if="modelFactRuleClaimIdentity(claim)" data-testid="detail-rule-claim"> · {{ t(modelFactRuleClaimIdentity(claim)!.ownerKey) }} {{ modelFactRuleClaimIdentity(claim)!.packId }} / {{ modelFactRuleClaimIdentity(claim)!.ruleId }}</span>
                        </li>
                      </ul>
                    </div>
                  </template>
                  <div v-if="detailField()!.candidates?.length" data-testid="detail-candidates">
                    <div class="sv-label">{{ t('settings.modelsCapabilities.facts.detail.candidates') }}</div>
                    <ul class="flex flex-col gap-0.5">
                      <li v-for="(candidate, index) in detailField()!.candidates" :key="index" class="break-all">
                        {{ t('settings.modelsCapabilities.facts.detail.tiedCandidate') }} {{ index + 1 }}: {{ valueOrNone(candidate.value) }}
                        <span v-for="(claim, claimIndex) in candidate.provenance ?? []" :key="claimIndex"> · {{ t(modelFactSourceKindKey(claim.sourceKind)) }} ({{ t('settings.modelsCapabilities.facts.detail.priority') }} {{ claim.sourcePriority }})</span>
                      </li>
                    </ul>
                  </div>
                  <div data-testid="detail-diagnostics">
                    <div class="sv-label">{{ t('settings.modelsCapabilities.facts.detail.diagnostics') }}</div>
                    <p v-if="detailField()!.diagnostics.length === 0" class="sv-meta">{{ t('settings.modelsCapabilities.facts.detail.noClaims') }}</p>
                    <ul v-else class="flex flex-col gap-0.5">
                      <li v-for="(diagnostic, index) in detailField()!.diagnostics" :key="index" class="break-all">
                        {{ t(modelFactSourceKindKey(diagnostic.sourceKind)) }} · {{ t(modelFactDiagnosticKindKey(diagnostic.kind)) }}<span v-if="diagnostic.errorCode"> · {{ t('settings.modelsCapabilities.facts.detail.diagnosticCode') }} {{ diagnostic.errorCode }}</span>
                      </li>
                    </ul>
                  </div>
                  <div v-if="(snapshot.sources ?? []).some((row) => sourceOutcome(row, detailField()!.path) !== null)" class="flex">
                    <button type="button" class="sv-btn sv-btn-sm" @click="openEvidenceFor(detailField()!.path)">{{ t('settings.modelsCapabilities.facts.detail.openEvidence') }}</button>
                  </div>
                </section>
              </template>
              <div v-else class="sv-meta mt-1">{{ t('settings.modelsCapabilities.resolvedAbsent') }}</div>
            </div>
            <div class="flex flex-col">
              <div v-for="source in snapshot.sources" :key="`${source.state.sourceKind}:${source.state.sourceScopeId}`" class="sv-divider-t py-2 text-xs text-gray-700 first:border-t-0">
                <div class="break-all font-medium text-gray-900">{{ t(modelFactSourceKindKey(source.state.sourceKind)) }} · {{ source.state.sourceScopeId }}</div>
                <div class="sv-meta mt-0.5">{{ source.subjectFact ? t('settings.modelsCapabilities.subjectFactPresent') : t('settings.modelsCapabilities.sourceAbsent') }}<span v-if="source.state.staleReason"> · {{ t('settings.modelsCapabilities.facts.detail.sourceStale') }}: {{ source.state.staleReason }}</span></div>
                <div v-if="source.subjectFact" class="sv-meta">{{ source.subjectFact.payload.recordOutcome }} · {{ source.subjectFact.payload.outcomes.length }} {{ t('settings.modelsCapabilities.fields') }}</div>
              </div>
            </div>
          </div>

          <div v-else-if="view === 'fields'" class="mt-4 flex flex-col">
            <div v-for="row in fields()" :key="`${row.source.state.sourceKind}:${row.source.state.sourceScopeId}:${row.outcome.path}`" class="sv-divider-t text-xs first:border-t-0">
              <button type="button" class="sv-row block w-full px-2 py-2 text-left" @click="inspectField(row.source, row.outcome)">
                <span class="break-all font-medium text-gray-900">{{ row.outcome.path }}</span>
                <span v-if="resolvedFieldFor(row.outcome.path) && stateOf(resolvedFieldFor(row.outcome.path)!) === 'conflict'" class="sv-chip ml-2 text-[var(--sv-warning)]">{{ t('settings.modelsCapabilities.facts.state.conflict') }}</span>
                <span class="sv-meta block break-words">{{ row.source.state.sourceKind }} · {{ valueText(row.outcome) }} · {{ row.outcome.disposition }}</span>
              </button>
            </div>
            <p v-if="fields().length === 0" class="sv-meta">{{ t('settings.modelsCapabilities.noFields') }}</p>
          </div>

          <div v-else class="mt-4 flex flex-col gap-2">
            <p v-if="!selectedField" class="sv-meta">{{ t('settings.modelsCapabilities.selectField') }}</p>
            <template v-else>
              <div class="break-all text-[13px] font-medium text-gray-900">{{ selectedField.outcome.path }}</div>
              <pre class="max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-md bg-[var(--sv-sunken)] p-2 text-xs text-gray-700">{{ JSON.stringify(selectedField.outcome, null, 2) }}</pre>
              <div class="sv-meta break-all">{{ selectedField.source.state.sourceKind }} · {{ selectedField.source.state.sourceScopeId }}</div>
              <div class="flex"><button type="button" class="sv-btn sv-btn-sm" :disabled="evidenceLoading" @click="readRawPayload">{{ t('settings.modelsCapabilities.viewRawPayload') }}</button></div>
              <pre v-if="rawPayload !== null" class="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-md bg-[var(--sv-sunken)] p-2 text-xs text-gray-700">{{ JSON.stringify(rawPayload, null, 2) }}</pre>
            </template>
          </div>
        </template>
      </div>
    </div>
  </section>
</template>
