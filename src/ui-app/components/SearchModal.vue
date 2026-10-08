<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { rebuildGenerationV2SearchIndex, runGenerationV2SearchQuery } from '@/next/generation-v2/renderer/generationV2SearchClient'
import { SearchBrowser } from '@/next/search/searchBrowser'
import type { SearchBrowserQuery } from '@/next/search/searchBrowser'
import { pageStartIndex } from '@/next/search/searchPagination'
import { getSearchPreferences } from '@/next/search/searchPreferences'
import type { SearchPreferences, SearchPresentation } from '@/next/search/searchPreferences'
import { SEARCH_SORT_ORDERS } from '@/next/search/searchPreferences'
import { getSearchScopeDefault, setSearchScopeDefault } from '@/next/search/searchScopeDefaultClient'
import type { SearchHit, SearchOrder, SearchScope } from '@/next/search/searchTypes'
import { DEFAULT_SEARCH_SCOPE, hasSearchScope } from '@/next/search/searchUiState'
import { t, tf } from '@/shared/i18n'
import SearchPaginator from '@/ui-app/components/SearchPaginator.vue'
import SearchResultList from '@/ui-app/components/SearchResultList.vue'
import type { SearchConvoOption, SearchProjectOption, SearchSelectionContext } from './SearchModal.types'

// TODO(search-a11y): focus trap and focus restoration are deliberately deferred (see
// docs/analysis/search-result-navigation-20261008/REPORT.md). This dialog has role/aria-modal/labelling,
// initial focus and Escape-to-close only.

const props = defineProps<{
  open: boolean
  projects: readonly SearchProjectOption[]
  convos: readonly SearchConvoOption[]
  activeProjectId: string | null
  activeConvoId: string | null
  disabled?: boolean
  selectHit: (hit: SearchHit, context: SearchSelectionContext) => Promise<boolean>
}>()

const emit = defineEmits<{
  close: []
  openSettings: []
}>()

const query = ref('')
const scope = ref<SearchScope>({ ...DEFAULT_SEARCH_SCOPE })
const defaultStatus = ref<'saved' | 'failed' | null>(null)
const scopeSelected = computed(() => hasSearchScope(scope.value))
let submittedContext: Omit<SearchSelectionContext, 'hits'> | null = null
const projectId = ref<string>('')
const convoId = ref<string>('')
const timeFrom = ref('')
const timeTo = ref('')
const mode = ref<'exact' | 'fuzzy'>('fuzzy')

const hasSearched = ref(false)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)
const busy = ref(false)
const advancedOpen = ref(false)
const selecting = ref(false)
let modalOperation = 0

const titleId = 'search-dialog-title'
const queryInput = ref<HTMLInputElement | null>(null)
const list = ref<InstanceType<typeof SearchResultList> | null>(null)
const paginator = ref<InstanceType<typeof SearchPaginator> | null>(null)

// The browser owns everything temporary about one open Search: sort, presentation, anchor and the shared result
// session. It is a plain object, so `tick` re-evaluates the derived values below whenever it reports a change.
const browser = shallowRef<SearchBrowser | null>(null)
const tick = ref(0)
let preferences: Promise<SearchPreferences> = Promise.resolve(null as unknown as SearchPreferences)
let unsubscribe: (() => void) | null = null

function disposeBrowser() {
  unsubscribe?.()
  unsubscribe = null
  browser.value?.dispose()
  browser.value = null
}

const projectNames = computed(() => new Map(props.projects.map((project) => [project.id, project.name])))
const convoTitles = computed(() => new Map(props.convos.map((convo) => [convo.id, convo.title])))

watch(
  () => props.open,
  (next) => {
    modalOperation += 1
    const operationAtOpen = modalOperation
    selecting.value = false
    busy.value = false
    disposeBrowser()
    if (!next) return
    error.value = null
    notice.value = null
    hasSearched.value = false
    defaultStatus.value = null
    // Every open starts from the persisted defaults; sort, presentation and scope edits are per-open overrides.
    preferences = getSearchPreferences()
    void getSearchScopeDefault().then((saved) => {
      if (operationAtOpen === modalOperation && props.open) scope.value = { ...saved }
    })
    // Project/conversation filters apply only when the user picks them in this open; the active (possibly hidden
    // New Chat) conversation is never an implicit filter and no choice persists across opens.
    projectId.value = ''
    convoId.value = ''
    void nextTick(() => queryInput.value?.focus())
  }, { flush: 'sync' },
)

function onWindowKeydown(event: KeyboardEvent) {
  // Escape also cancels an IME composition; that must not close the dialog.
  if (props.open && event.key === 'Escape' && !event.isComposing) {
    event.preventDefault()
    emit('close')
  }
}
onMounted(() => window.addEventListener('keydown', onWindowKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown)
  disposeBrowser()
})

function toEpochSec(value: string): number | undefined {
  if (!value) return undefined
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) return undefined
  return Math.floor(ms / 1000)
}

async function ensureBrowser(): Promise<SearchBrowser | null> {
  if (browser.value) return browser.value
  const prefs = await preferences
  if (!props.open) return null
  if (browser.value) return browser.value
  const created = new SearchBrowser(runGenerationV2SearchQuery, prefs)
  unsubscribe = created.subscribe(() => { tick.value += 1 })
  browser.value = created
  return created
}

async function runSearch() {
  if (props.disabled || !props.open || selecting.value) return
  const q = query.value.trim()
  if (!q || !hasSearchScope(scope.value)) return
  const operation = ++modalOperation
  error.value = null
  notice.value = null
  const next = await ensureBrowser()
  if (!next || operation !== modalOperation || !props.open) return
  const searchQuery: SearchBrowserQuery = {
    q,
    scope: { ...scope.value },
    projectId: projectId.value || null,
    convoId: convoId.value || null,
    timeFromSec: toEpochSec(timeFrom.value),
    timeToSec: toEpochSec(timeTo.value),
    mode: mode.value,
  }
  submittedContext = { query: q, scope: { ...scope.value }, mode: mode.value }
  hasSearched.value = true
  next.search(searchQuery)
}

async function onSaveDefaultScope() {
  if (!scopeSelected.value) return
  const saved = await setSearchScopeDefault({ ...scope.value })
  defaultStatus.value = saved ? 'saved' : 'failed'
}

async function onRebuildIndex() {
  if (busy.value || props.disabled || !props.open || selecting.value) return
  const operation = ++modalOperation
  busy.value = true
  error.value = null
  notice.value = null
  try {
    await rebuildGenerationV2SearchIndex()
    if (operation === modalOperation && props.open) {
      notice.value = t('search.status.indexRebuilt')
      // Rows were re-indexed under the loaded results, so later windows would no longer line up with them.
      browser.value?.refresh()
    }
  } catch {
    if (operation === modalOperation && props.open) error.value = t('search.errors.rebuildFailed')
  } finally {
    if (operation === modalOperation) busy.value = false
  }
}

async function onSelect(hit: SearchHit) {
  const active = browser.value
  if (props.disabled || !props.open || !active) return
  const operation = ++modalOperation
  selecting.value = true
  error.value = null
  try {
    const context = submittedContext ?? { query: query.value.trim(), scope: { ...scope.value }, mode: mode.value }
    const success = await props.selectHit(hit, { ...context, hits: active.session.hits.slice() })
    if (operation !== modalOperation || !props.open) return
    if (success) emit('close')
    else error.value = t('search.errors.openFailed')
  } catch {
    if (operation === modalOperation && props.open) error.value = t('search.errors.openFailed')
  } finally {
    if (operation === modalOperation) selecting.value = false
  }
}

// ── Derived result view ─────────────────────────────────────────────────────────────────────────

const EMPTY_HITS: readonly SearchHit[] = []

// One fresh snapshot per change notification: Vue re-renders on a new object, whereas the long-lived browser,
// session and navigator objects would hide their in-place changes.
const view = computed(() => {
  void tick.value
  const active = browser.value
  const results = active?.session ?? null
  const nav = active?.navigator ?? null
  return {
    presentation: (active?.presentation ?? 'scroll') as SearchPresentation,
    order: (active?.order ?? 'chronological') as SearchOrder,
    hits: results?.hits ?? EMPTY_HITS,
    loaded: results?.loaded ?? 0,
    status: results?.status ?? 'more',
    started: results?.started ?? false,
    loading: results?.loading ?? false,
    sessionError: results?.error ?? null,
    scrollError: active?.scrollError ?? null,
    awaitingAdaptation: active?.awaitingAdaptation ?? false,
    revision: active?.positionRevision ?? 0,
    anchor: active?.anchorIndex ?? 0,
    adaptive: active?.preferences.pagination.pageSizing === 'adaptive',
    nav: nav ? {
      currentPage: nav.currentPage,
      selectedPage: nav.selectedPage,
      maxPage: nav.maxPage,
      pageSize: nav.pageSize,
      navigating: nav.navigating,
      error: nav.error,
      capacityBlocked: nav.capacityBlocked,
    } : null,
  }
})

const initialLoading = computed(() => hasSearched.value && !view.value.started && view.value.loading)
const initialFailure = computed(() => hasSearched.value && !view.value.started && !view.value.loading && !!view.value.sessionError)
const noResults = computed(() => hasSearched.value && view.value.started && view.value.loaded === 0 && view.value.status === 'end')
const limitReached = computed(() => view.value.status === 'limit')
const capacityBlocked = computed(() => {
  const nav = view.value.nav
  return !!nav && nav.capacityBlocked && nav.currentPage >= nav.maxPage
})

const range = computed(() => {
  const { presentation, nav, awaitingAdaptation, loaded } = view.value
  if (presentation === 'scroll' || !nav) return { start: 0, end: loaded }
  if (awaitingAdaptation) return { start: 0, end: 0 }
  const start = pageStartIndex(nav.currentPage, nav.pageSize)
  return { start, end: Math.min(start + nav.pageSize, loaded) }
})

const countLabel = computed(() => {
  const { loaded, status } = view.value
  if (loaded === 0) return ''
  return status === 'more' ? tf('search.status.countMore', { count: loaded }) : tf('search.status.count', { count: loaded })
})

const listKey = computed(() => `${view.value.revision}:${view.value.presentation}`)

const sortLabel: Record<SearchOrder, string> = {
  chronological: 'search.sort.chronological',
  'reverse-chronological': 'search.sort.reverseChronological',
  relevance: 'search.sort.relevance',
}

function onSortChange(event: Event) {
  browser.value?.setOrder((event.target as HTMLSelectElement).value as SearchOrder)
}

function setPresentation(next: SearchPresentation) {
  browser.value?.setPresentation(next)
}

function onFirstVisible(index: number, epoch: number) {
  // A list that has been (or is about to be) replaced for a new position must not overwrite the anchor.
  if (epoch === browser.value?.positionRevision) browser.value.setAnchor(index)
}
function onLastVisible(index: number) { browser.value?.scrollDemand(index) }

function adaptNow() {
  const rows = list.value?.fittingRows() ?? 0
  if (rows >= 1) void browser.value?.adaptLayout(rows)
}

// Adaptive sizing needs the real viewport: measure as soon as a pagination layout with a result list exists.
// Re-checking on every position revision covers the list being re-mounted after the paginator is created.
watch(() => [view.value.awaitingAdaptation, view.value.revision], () => {
  if (view.value.awaitingAdaptation) void nextTick(() => { if (view.value.awaitingAdaptation) adaptNow() })
}, { flush: 'post' })

function retryScroll() { browser.value?.retryScroll(range.value.end - 1) }

function onResultsKeydown(event: KeyboardEvent) {
  if (view.value.presentation !== 'pagination') return
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  const tag = (event.target as HTMLElement | null)?.tagName
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
  event.preventDefault()
  browser.value?.key(event.key === 'ArrowLeft' ? -1 : 1)
  // Enter must act on the paginator selection, not on whichever result row was last focused.
  paginator.value?.focus()
}

const showFatal = computed(() => !!error.value && !initialLoading.value)
</script>

<template>
  <div v-if="props.open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="emit('close')">
    <div
      class="flex h-[min(90vh,50rem)] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      tabindex="-1"
      data-testid="search-dialog"
    >
      <div class="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
        <h2 :id="titleId" class="text-sm font-semibold text-gray-900">{{ t('search.title') }}</h2>
        <button
          type="button"
          class="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
          @click="emit('close')"
        >
          {{ t('search.close') }}
        </button>
      </div>

      <form class="shrink-0 space-y-3 p-4" @submit.prevent="runSearch">
        <div>
          <label for="search-query" class="text-xs font-semibold uppercase tracking-wide text-gray-500">{{ t('search.queryLabel') }}</label>
          <input
            id="search-query"
            ref="queryInput"
            v-model="query"
            type="text"
            class="mt-2 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            :placeholder="t('search.queryPlaceholder')"
            :disabled="props.disabled"
            @keydown.enter.prevent="runSearch"
          />
        </div>

        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4" role="group" :aria-label="t('search.scope.label')" data-testid="search-scope">
          <label class="flex items-center gap-2 text-sm text-gray-700">
            <input v-model="scope.projectName" type="checkbox" class="h-4 w-4" data-testid="search-scope-project" :disabled="props.disabled" />
            {{ t('search.scope.project') }}
          </label>
          <label class="flex items-center gap-2 text-sm text-gray-700">
            <input v-model="scope.convoName" type="checkbox" class="h-4 w-4" data-testid="search-scope-convo" :disabled="props.disabled" />
            {{ t('search.scope.convo') }}
          </label>
          <label class="flex items-center gap-2 text-sm text-gray-700">
            <input v-model="scope.userMessages" type="checkbox" class="h-4 w-4" data-testid="search-scope-user" :disabled="props.disabled" />
            {{ t('search.scope.user') }}
          </label>
          <label class="flex items-center gap-2 text-sm text-gray-700">
            <input v-model="scope.assistantMessages" type="checkbox" class="h-4 w-4" data-testid="search-scope-assistant" :disabled="props.disabled" />
            {{ t('search.scope.assistant') }}
          </label>
        </div>
        <div v-if="!scopeSelected" class="text-xs text-amber-700" role="status">{{ t('search.scope.none') }}</div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
            :aria-expanded="advancedOpen"
            @click="advancedOpen = !advancedOpen"
          >
            {{ advancedOpen ? t('search.filters.hide') : t('search.filters.show') }}
          </button>

          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            data-testid="search-scope-save-default"
            :disabled="props.disabled || !scopeSelected"
            @click="onSaveDefaultScope"
          >
            {{ t('search.scopeDefault.save') }}
          </button>
          <span v-if="defaultStatus" class="text-xs text-gray-500" role="status" data-testid="search-scope-default-status">
            {{ defaultStatus === 'saved' ? t('search.scopeDefault.saved') : t('search.scopeDefault.failed') }}
          </span>

          <div class="ml-auto flex items-center gap-2">
            <select
              v-model="mode"
              class="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600"
              :aria-label="t('search.mode.label')"
              :disabled="props.disabled"
            >
              <option value="fuzzy">{{ t('search.mode.fuzzy') }}</option>
              <option value="exact">{{ t('search.mode.exact') }}</option>
            </select>
            <button
              type="submit"
              class="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              :disabled="props.disabled || selecting || query.trim().length === 0 || !scopeSelected"
            >
              {{ t('search.submit') }}
            </button>
          </div>
        </div>

        <div v-if="advancedOpen" class="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:grid-cols-2">
          <div>
            <label for="search-filter-project" class="text-xs font-semibold uppercase tracking-wide text-gray-500">{{ t('search.filters.project') }}</label>
            <select
              id="search-filter-project"
              v-model="projectId"
              class="mt-2 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
              :disabled="props.disabled"
            >
              <option value="">{{ t('search.filters.all') }}</option>
              <option v-for="p in props.projects" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </div>
          <div>
            <label for="search-filter-convo" class="text-xs font-semibold uppercase tracking-wide text-gray-500">{{ t('search.filters.convo') }}</label>
            <select
              id="search-filter-convo"
              v-model="convoId"
              class="mt-2 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
              :disabled="props.disabled"
            >
              <option value="">{{ t('search.filters.all') }}</option>
              <option v-for="c in props.convos" :key="c.id" :value="c.id">{{ c.title }}</option>
            </select>
          </div>
          <div>
            <label for="search-filter-from" class="text-xs font-semibold uppercase tracking-wide text-gray-500">{{ t('search.filters.from') }}</label>
            <input
              id="search-filter-from"
              v-model="timeFrom"
              type="datetime-local"
              step="1"
              class="mt-2 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
              :disabled="props.disabled"
            />
          </div>
          <div>
            <label for="search-filter-to" class="text-xs font-semibold uppercase tracking-wide text-gray-500">{{ t('search.filters.to') }}</label>
            <input
              id="search-filter-to"
              v-model="timeTo"
              type="datetime-local"
              step="1"
              class="mt-2 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
              :disabled="props.disabled"
            />
          </div>
          <div class="flex items-center justify-end gap-2 sm:col-span-2">
            <button
              type="button"
              class="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
              :disabled="props.disabled || selecting || busy"
              @click="onRebuildIndex"
            >
              {{ t('search.filters.rebuildIndex') }}
            </button>
          </div>
        </div>
      </form>

      <div class="flex min-h-0 flex-1 flex-col border-t border-gray-200" @keydown="onResultsKeydown">
        <div v-if="selecting" class="shrink-0 px-4 pt-2 text-sm text-gray-500" role="status" data-testid="search-target-loading">{{ t('search.status.openingResult') }}</div>
        <div v-if="showFatal" class="shrink-0 px-4 pt-2 text-sm text-red-600" role="alert" data-testid="search-target-error">{{ error }}</div>
        <div v-if="busy" class="shrink-0 px-4 pt-2 text-sm text-gray-500" role="status">{{ t('search.status.rebuilding') }}</div>
        <div v-else-if="notice" class="shrink-0 px-4 pt-2 text-sm text-gray-500" role="status">{{ notice }}</div>

        <div v-if="!hasSearched" class="px-4 py-3 text-sm text-gray-500" data-testid="search-initial-hint">{{ t('search.hint') }}</div>

        <template v-else>
          <div class="flex shrink-0 flex-wrap items-center gap-2 px-4 py-2" data-testid="search-result-toolbar">
            <span class="text-xs text-gray-500" role="status" data-testid="search-count">{{ countLabel }}</span>
            <div class="ml-auto flex items-center gap-2">
              <label class="flex items-center gap-1 text-xs text-gray-500">
                {{ t('search.sort.label') }}
                <select
                  class="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
                  :value="view.order"
                  :disabled="selecting"
                  data-testid="search-sort"
                  @change="onSortChange"
                >
                  <option v-for="value in SEARCH_SORT_ORDERS" :key="value" :value="value">{{ t(sortLabel[value]) }}</option>
                </select>
              </label>
              <div class="inline-flex overflow-hidden rounded-md border border-gray-200" role="group" :aria-label="t('search.presentation.label')">
                <button
                  type="button"
                  class="px-2 py-1 text-xs"
                  :class="view.presentation === 'scroll' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'"
                  :aria-pressed="view.presentation === 'scroll'"
                  :disabled="selecting"
                  data-testid="search-presentation-scroll"
                  @click="setPresentation('scroll')"
                >
                  {{ t('search.presentation.scroll') }}
                </button>
                <button
                  type="button"
                  class="px-2 py-1 text-xs"
                  :class="view.presentation === 'pagination' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'"
                  :aria-pressed="view.presentation === 'pagination'"
                  :disabled="selecting"
                  data-testid="search-presentation-pagination"
                  @click="setPresentation('pagination')"
                >
                  {{ t('search.presentation.pagination') }}
                </button>
              </div>
            </div>
          </div>

          <div
            v-if="limitReached"
            class="mx-4 mb-2 shrink-0 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
            role="status"
            data-testid="search-limit-banner"
          >
            {{ t('search.limit.message') }}<button
              type="button"
              class="font-semibold underline"
              :aria-label="t('search.limit.linkLabel')"
              data-testid="search-limit-settings-link"
              @click="emit('openSettings')"
            >{{ t('search.limit.link') }}</button>
          </div>
          <div
            v-if="capacityBlocked"
            class="mx-4 mb-2 shrink-0 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
            role="status"
            data-testid="search-capacity-banner"
          >
            {{ tf('search.capacity.message', { pages: view.nav?.maxPage ?? 0 }) }}<button
              type="button"
              class="font-semibold underline"
              data-testid="search-capacity-settings-link"
              @click="emit('openSettings')"
            >{{ t('search.capacity.link') }}</button>
          </div>

          <div class="relative min-h-0 flex-1">
            <div class="absolute inset-0">
              <SearchResultList
                :key="listKey"
                ref="list"
                :hits="view.hits"
                :revision="view.loaded"
                :start="range.start"
                :end="range.end"
                :initial-index="view.anchor"
                :epoch="view.revision"
                :disabled="props.disabled || selecting"
                :project-names="projectNames"
                :convo-titles="convoTitles"
                @activate="onSelect"
                @first-visible="onFirstVisible"
                @last-visible="onLastVisible"
              >
                <template #footer>
                  <div v-if="initialLoading || (view.nav?.navigating && view.loaded === 0)" class="px-4 py-3 text-sm text-gray-500" role="status">{{ t('search.status.searching') }}</div>
                  <div v-else-if="initialFailure" class="px-4 py-3 text-sm text-red-600" role="alert" data-testid="search-query-error">
                    {{ t('search.errors.searchFailed') }}
                    <button type="button" class="ml-2 underline" @click="runSearch">{{ t('search.errors.retry') }}</button>
                  </div>
                  <div v-else-if="noResults" class="px-4 py-3 text-sm text-gray-500">{{ t('search.status.noResults') }}</div>
                  <template v-else-if="view.presentation === 'scroll'">
                    <div v-if="view.scrollError" class="px-4 py-3 text-sm text-red-600" role="alert" data-testid="search-load-error">
                      {{ t('search.errors.loadMoreFailed') }}
                      <button type="button" class="ml-2 underline" @click="retryScroll">{{ t('search.errors.retry') }}</button>
                    </div>
                    <div v-else-if="view.status === 'more'" class="px-4 py-3 text-xs text-gray-400" role="status" data-testid="search-loading-more">{{ t('search.status.loadingMore') }}</div>
                    <div v-else-if="view.status === 'end' && view.loaded > 0" class="px-4 py-3 text-center text-xs text-gray-400" data-testid="search-end-of-results">{{ t('search.status.endOfResults') }}</div>
                  </template>
                </template>
              </SearchResultList>
            </div>
          </div>

          <div v-if="view.presentation === 'pagination' && view.nav?.error" class="shrink-0 px-4 py-1 text-xs text-red-600" role="alert" data-testid="search-page-error">
            {{ tf('search.errors.pageFailed', { page: view.nav.selectedPage }) }}
            <button type="button" class="ml-2 underline" data-testid="search-page-retry" @click="browser?.retryNavigation()">{{ t('search.errors.retry') }}</button>
          </div>
          <SearchPaginator
            v-if="view.presentation === 'pagination' && view.nav"
            ref="paginator"
            :current-page="view.nav.currentPage"
            :selected-page="view.nav.selectedPage"
            :max-page="view.nav.maxPage"
            :navigating="view.nav.navigating"
            :can-readapt="view.adaptive"
            @arrow="browser?.arrow($event)"
            @key="browser?.key($event)"
            @page="browser?.clickPage($event)"
            @enter="browser?.activateSelection()"
            @readapt="adaptNow"
          />
        </template>
      </div>
    </div>
  </div>
</template>
