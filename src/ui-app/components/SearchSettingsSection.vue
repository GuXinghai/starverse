<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  DEFAULT_SEARCH_PREFERENCES,
  SEARCH_SORT_ORDERS,
  getSearchPreferences,
  isPositiveInteger,
  setSearchPreferences,
  type SearchPreferences,
} from '@/next/search/searchPreferences'
import { t } from '@/shared/i18n'

/**
 * Persistent Search defaults. Each change is validated and saved immediately; the Search dialog reads these when
 * it opens and never writes them back, so its temporary sort/presentation changes cannot alter them.
 */
const props = defineProps<{ disabled?: boolean }>()

type Option = Readonly<{ value: string; labelKey: string }>
type SelectField = Readonly<{ id: string; labelKey: string; options: readonly Option[]; get: () => string; set: (draft: Draft, value: string) => void }>
type NumberField = Readonly<{ id: string; labelKey: string; hintKey?: string; get: () => number; set: (draft: Draft, value: number) => void }>
type Draft = {
  defaultSort: SearchPreferences['defaultSort']
  defaultPresentation: SearchPreferences['defaultPresentation']
  resultLimit: number
  scroll: { -readonly [K in keyof SearchPreferences['scroll']]: SearchPreferences['scroll'][K] }
  pagination: { -readonly [K in keyof SearchPreferences['pagination']]: SearchPreferences['pagination'][K] }
}

const prefs = ref<SearchPreferences>(DEFAULT_SEARCH_PREFERENCES)
const status = ref<'saved' | 'failed' | null>(null)
const invalidField = ref<string | null>(null)

let edited = false
onMounted(async () => {
  const stored = await getSearchPreferences()
  if (!edited) prefs.value = stored
})

function draftOf(): Draft {
  return { ...prefs.value, scroll: { ...prefs.value.scroll }, pagination: { ...prefs.value.pagination } }
}

async function commit(draft: Draft) {
  // Applied immediately so a quick second edit builds on this one; a failed save reloads what is really stored.
  edited = true
  prefs.value = draft as SearchPreferences
  const saved = await setSearchPreferences(draft as SearchPreferences)
  status.value = saved ? 'saved' : 'failed'
  if (!saved) prefs.value = await getSearchPreferences()
}

const loadingOptions: readonly Option[] = [
  { value: 'on-demand', labelKey: 'search.settings.loadingOnDemand' },
  { value: 'full', labelKey: 'search.settings.loadingFull' },
]
const interactionOptions: readonly Option[] = [
  { value: 'direct', labelKey: 'search.settings.direct' },
  { value: 'select-first', labelKey: 'search.settings.selectFirst' },
]
const sortKeys: Record<string, string> = {
  chronological: 'search.sort.chronological',
  'reverse-chronological': 'search.sort.reverseChronological',
  relevance: 'search.sort.relevance',
}

const generalSelects: readonly SelectField[] = [
  { id: 'defaultSort', labelKey: 'search.settings.defaultSort',
    options: SEARCH_SORT_ORDERS.map((value) => ({ value, labelKey: sortKeys[value] })),
    get: () => prefs.value.defaultSort, set: (d, v) => { d.defaultSort = v as Draft['defaultSort'] } },
  { id: 'defaultPresentation', labelKey: 'search.settings.defaultPresentation',
    options: [{ value: 'scroll', labelKey: 'search.presentation.scroll' }, { value: 'pagination', labelKey: 'search.presentation.pagination' }],
    get: () => prefs.value.defaultPresentation, set: (d, v) => { d.defaultPresentation = v as Draft['defaultPresentation'] } },
]
const generalNumbers: readonly NumberField[] = [
  { id: 'resultLimit', labelKey: 'search.settings.resultLimit', hintKey: 'search.settings.resultLimitHint',
    get: () => prefs.value.resultLimit, set: (d, v) => { d.resultLimit = v } },
]
const scrollSelects: readonly SelectField[] = [
  { id: 'scrollLoading', labelKey: 'search.settings.loading', options: loadingOptions,
    get: () => prefs.value.scroll.loading, set: (d, v) => { d.scroll.loading = v as Draft['scroll']['loading'] } },
]
const scrollNumbers: readonly NumberField[] = [
  { id: 'batchSize', labelKey: 'search.settings.batchSize', get: () => prefs.value.scroll.batchSize, set: (d, v) => { d.scroll.batchSize = v } },
  { id: 'prefetchBatches', labelKey: 'search.settings.prefetchBatches', get: () => prefs.value.scroll.prefetchBatches, set: (d, v) => { d.scroll.prefetchBatches = v } },
]
const paginationSelects: readonly SelectField[] = [
  { id: 'paginationLoading', labelKey: 'search.settings.loading', options: loadingOptions,
    get: () => prefs.value.pagination.loading, set: (d, v) => { d.pagination.loading = v as Draft['pagination']['loading'] } },
  { id: 'capacity', labelKey: 'search.settings.capacity',
    options: [
      { value: 'standard', labelKey: 'search.settings.capacityStandard' },
      { value: 'extended', labelKey: 'search.settings.capacityExtended' },
      { value: 'unlimited', labelKey: 'search.settings.capacityUnlimited' },
    ],
    get: () => prefs.value.pagination.capacity, set: (d, v) => { d.pagination.capacity = v as Draft['pagination']['capacity'] } },
  { id: 'pageSizing', labelKey: 'search.settings.pageSizing',
    options: [{ value: 'fixed', labelKey: 'search.settings.pageSizingFixed' }, { value: 'adaptive', labelKey: 'search.settings.pageSizingAdaptive' }],
    get: () => prefs.value.pagination.pageSizing, set: (d, v) => { d.pagination.pageSizing = v as Draft['pagination']['pageSizing'] } },
  { id: 'arrowClick', labelKey: 'search.settings.arrowClick', options: interactionOptions,
    get: () => prefs.value.pagination.arrowClick, set: (d, v) => { d.pagination.arrowClick = v as Draft['pagination']['arrowClick'] } },
  { id: 'pageClick', labelKey: 'search.settings.pageClick', options: interactionOptions,
    get: () => prefs.value.pagination.pageClick, set: (d, v) => { d.pagination.pageClick = v as Draft['pagination']['pageClick'] } },
  { id: 'keyboard', labelKey: 'search.settings.keyboard', options: interactionOptions,
    get: () => prefs.value.pagination.keyboard, set: (d, v) => { d.pagination.keyboard = v as Draft['pagination']['keyboard'] } },
]
const paginationNumbers: readonly NumberField[] = [
  { id: 'fixedPageSize', labelKey: 'search.settings.fixedPageSize', get: () => prefs.value.pagination.fixedPageSize, set: (d, v) => { d.pagination.fixedPageSize = v } },
  { id: 'prefetchPages', labelKey: 'search.settings.prefetchPages', get: () => prefs.value.pagination.prefetchPages, set: (d, v) => { d.pagination.prefetchPages = v } },
]

async function onSelect(field: SelectField, event: Event) {
  const draft = draftOf()
  field.set(draft, (event.target as HTMLSelectElement).value)
  invalidField.value = null
  await commit(draft)
}

async function onNumber(field: NumberField, event: Event) {
  const input = event.target as HTMLInputElement
  const value = Number(input.value)
  if (input.value.trim() === '' || !isPositiveInteger(value)) {
    // Zero and fractions are never meaningful values: reject and restore the stored one.
    invalidField.value = field.id
    input.value = String(field.get())
    return
  }
  const draft = draftOf()
  field.set(draft, value)
  invalidField.value = null
  await commit(draft)
}

const groups = [
  { id: 'general', titleKey: 'search.settings.defaults', selects: generalSelects, numbers: generalNumbers },
  { id: 'scroll', titleKey: 'search.settings.scrollGroup', selects: scrollSelects, numbers: scrollNumbers },
  { id: 'pagination', titleKey: 'search.settings.paginationGroup', selects: paginationSelects, numbers: paginationNumbers },
] as const
</script>

<template>
  <div id="settings-search-section" class="rounded-lg border border-gray-200 bg-white p-3" data-testid="settings-search-section">
    <div class="text-xs font-semibold uppercase tracking-wide text-gray-600">{{ t('search.settings.title') }}</div>
    <div class="mt-1 text-[11px] text-gray-500">{{ t('search.settings.description') }}</div>

    <fieldset v-for="group in groups" :key="group.id" class="mt-3 space-y-2" :disabled="props.disabled">
      <legend class="text-[11px] font-semibold text-gray-700">{{ t(group.titleKey) }}</legend>
      <label v-for="field in group.selects" :key="field.id" class="flex items-center justify-between gap-3 text-[11px] text-gray-700">
        <span>{{ t(field.labelKey) }}</span>
        <select
          class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px]"
          :value="field.get()"
          :data-testid="`settings-search-${field.id}`"
          @change="onSelect(field, $event)"
        >
          <option v-for="option in field.options" :key="option.value" :value="option.value">{{ t(option.labelKey) }}</option>
        </select>
      </label>
      <div v-for="field in group.numbers" :key="field.id">
        <label class="flex items-center justify-between gap-3 text-[11px] text-gray-700">
          <span>{{ t(field.labelKey) }}</span>
          <input
            type="number"
            min="1"
            step="1"
            class="w-28 rounded-md border border-gray-200 px-2 py-1 text-[11px]"
            :value="field.get()"
            :aria-invalid="invalidField === field.id"
            :data-testid="`settings-search-${field.id}`"
            @change="onNumber(field, $event)"
          />
        </label>
        <div v-if="field.hintKey" class="mt-0.5 text-[10px] text-gray-500">{{ t(field.hintKey) }}</div>
        <div v-if="invalidField === field.id" class="mt-0.5 text-[10px] text-red-600" role="alert">{{ t('search.settings.positiveInteger') }}</div>
      </div>
    </fieldset>

    <div v-if="status" class="mt-2 text-[11px] text-gray-500" role="status" data-testid="settings-search-status">
      {{ status === 'saved' ? t('search.settings.saved') : t('search.settings.saveFailed') }}
    </div>
  </div>
</template>
