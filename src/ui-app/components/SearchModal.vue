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
import UiIcon from '@/ui-kit/icons/UiIcon.vue'
import SearchPaginator from '@/ui-app/components/SearchPaginator.vue'
import SearchResultList from '@/ui-app/components/SearchResultList.vue'
import type { SearchConvoOption, SearchProjectOption, SearchSelectionContext } from './SearchModal.types'

// TODO(search-a11y): focus trap and focus restoration are deliberately deferred (see
// docs/analysis/search-result-navigation-20261008/REPORT.md). This dialog has role/aria-modal/labelling,
// initial focus and Escape-to-close only.

const props = defineProps<{
  open: boolean
  variant?: 'modal' | 'sidebar'
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
const panel = ref<HTMLElement | null>(null)
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
const scopePanelOpen = ref(false)
const selectedHitKey = ref<string | null>(null)
let modalOperation = 0
let openGeneration = 0

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
    const operationAtOpen = ++openGeneration
    selecting.value = false
    scopePanelOpen.value = false
    selectedHitKey.value = null
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
      if (operationAtOpen === openGeneration && props.open) scope.value = { ...saved }
    })
    // Project/conversation filters apply only when the user picks them in this open; the active (possibly hidden
    // New Chat) conversation is never an implicit filter and no choice persists across opens.
    projectId.value = ''
    convoId.value = ''
    void nextTick(() => queryInput.value?.focus())
  }, { flush: 'sync' },
)

watch(query, (value) => {
  if (!props.open || value.trim()) return
  modalOperation += 1
  const active = browser.value
  if (active) {
    // Clearing results keeps this open's temporary sort/presentation without persisting them.
    preferences = Promise.resolve({ ...active.preferences, defaultSort: active.order, defaultPresentation: active.presentation })
  }
  disposeBrowser()
  submittedContext = null
  hasSearched.value = false
  error.value = null
  notice.value = null
  defaultStatus.value = null
  busy.value = false
}, { flush: 'sync' })

function onWindowKeydown(event: KeyboardEvent) {
  // The sidebar can coexist with the model dialog and the right-hand conversation.
  // Only consume Escape from its own controls; another surface owns its own dismissal.
  if (event.defaultPrevented) return
  if (props.variant === 'sidebar' && (!(event.target instanceof Node) || !panel.value?.contains(event.target))) return
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

async function ensureBrowser(operation: number): Promise<SearchBrowser | null> {
  if (browser.value) return browser.value
  const prefs = await preferences
  if (!props.open || operation !== modalOperation) return null
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
  const next = await ensureBrowser(operation)
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
  const operation = modalOperation
  const saved = await setSearchScopeDefault({ ...scope.value })
  if (props.open && operation === modalOperation) defaultStatus.value = saved ? 'saved' : 'failed'
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
    if (success) {
      selectedHitKey.value = `${hit.entityType}:${hit.entityId}`
      if (props.variant !== 'sidebar') emit('close')
    }
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
  <div v-if="props.open"
    :class="props.variant === 'sidebar' ? 'h-full min-h-0' : 'sv-backdrop'"
    @click.self="props.variant !== 'sidebar' && emit('close')">
    <div
      ref="panel"
      class="flex w-full flex-col overflow-hidden"
      :class="props.variant === 'sidebar' ? 'h-full' : 'sv-dialog h-[min(90vh,50rem)] max-w-3xl'"
      :role="props.variant === 'sidebar' ? 'search' : 'dialog'"
      :aria-modal="props.variant === 'sidebar' ? undefined : true"
      :aria-labelledby="titleId"
      tabindex="-1"
      data-testid="search-dialog"
    >
      <div
        class="flex shrink-0 items-center justify-between"
        :class="props.variant === 'sidebar' ? 'pb-2 pl-4 pr-3 pt-1' : 'sv-divider-b px-4 py-3'"
      >
        <h2 :id="titleId" class="sv-title">{{ t('search.title') }}</h2>
        <button
          type="button"
          class="shrink-0"
          :class="props.variant === 'sidebar' ? 'sv-icon-btn' : 'sv-btn sv-btn-sm sv-btn-ghost'"
          :aria-label="t('search.close')"
          data-testid="search-close"
          @click="emit('close')"
        >
          <UiIcon v-if="props.variant === 'sidebar'" name="close" :size="15" />
          <span v-else>{{ t('search.close') }}</span>
        </button>
      </div>

      <!-- The whole form is the bounded region: expanded scope/filters scroll here while the field stays pinned
           and the results below keep their space. -->
      <form
        class="flex max-h-[40vh] shrink-0 flex-col gap-3 overflow-y-auto px-4 pb-3 [scrollbar-gutter:stable] [&>*]:shrink-0"
        @submit.prevent="runSearch"
      >
        <div
          class="sticky top-0 z-10 flex flex-col gap-2 pb-1"
          :class="props.variant === 'sidebar' ? 'bg-[var(--sv-sidebar)] pt-1' : 'bg-[var(--sv-surface)] pt-4'"
        >
          <label for="search-query" :class="props.variant === 'sidebar' ? 'sr-only' : 'sv-label'">{{ t('search.queryLabel') }}</label>
          <div
            class="flex h-9 items-center gap-2 rounded-md border border-[color:var(--sv-field-border)] bg-[var(--sv-surface)] pl-2.5 pr-1 text-[color:var(--sv-text-3)] focus-within:border-[color:var(--sv-focus)] focus-within:shadow-[0_0_0_1px_var(--sv-focus)] has-[:disabled]:bg-[var(--sv-sunken)]"
          >
            <UiIcon name="search" :size="15" class="shrink-0" />
            <input id="search-query" ref="queryInput" v-model="query" type="text"
              class="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] text-[color:var(--sv-text)] outline-none"
              :placeholder="t('search.queryPlaceholder')" :disabled="props.disabled || selecting" @keydown.enter.prevent="runSearch" />
            <button type="button" class="sv-icon-btn shrink-0" :class="{ invisible: !query }" :disabled="props.disabled || selecting || !query"
              :aria-label="t('search.clear')" data-testid="search-clear" @click="query = ''"><UiIcon name="close" :size="14" /></button>
          </div>
          <div class="-ml-2.5 flex items-center gap-1">
            <button v-if="props.variant === 'sidebar'" type="button" class="sv-btn sv-btn-sm sv-btn-ghost"
              :aria-expanded="scopePanelOpen" data-testid="search-scope-toggle" @click="scopePanelOpen = !scopePanelOpen">
              {{ t('search.scope.label') }}<span class="inline-flex size-3.5 items-center justify-center transition-transform" :class="{ 'rotate-180': scopePanelOpen }"><UiIcon name="chevronDown" :size="14" /></span>
            </button>
            <button type="button" class="sv-btn sv-btn-sm sv-btn-ghost" :class="props.variant === 'sidebar' ? '' : 'min-w-[7.5rem]'"
              :aria-expanded="advancedOpen" data-testid="search-filters-toggle"
              @click="advancedOpen = !advancedOpen">
              {{ props.variant === 'sidebar' ? t('search.filters.toggle') : advancedOpen ? t('search.filters.hide') : t('search.filters.show') }}<span class="inline-flex size-3.5 items-center justify-center transition-transform" :class="{ 'rotate-180': advancedOpen }"><UiIcon name="chevronDown" :size="14" /></span>
            </button>
            <button type="submit" class="sv-btn sv-btn-sm sv-btn-primary ml-auto" data-testid="search-submit"
              :disabled="props.disabled || selecting || query.trim().length === 0 || !scopeSelected">{{ t('search.submit') }}</button>
          </div>
        </div>

        <div v-show="props.variant !== 'sidebar' || scopePanelOpen" class="flex flex-col gap-3">
          <div
            class="grid gap-x-3 gap-y-1"
            :class="props.variant === 'sidebar' ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-4'"
            role="group" :aria-label="t('search.scope.label')" data-testid="search-scope"
          >
            <label class="flex min-w-0 items-center gap-2 py-0.5 text-[13px] leading-5 text-[color:var(--sv-text)]">
              <input v-model="scope.projectName" type="checkbox" class="size-4 shrink-0" data-testid="search-scope-project" :disabled="props.disabled" />
              {{ t('search.scope.project') }}
            </label>
            <label class="flex min-w-0 items-center gap-2 py-0.5 text-[13px] leading-5 text-[color:var(--sv-text)]">
              <input v-model="scope.convoName" type="checkbox" class="size-4 shrink-0" data-testid="search-scope-convo" :disabled="props.disabled" />
              {{ t('search.scope.convo') }}
            </label>
            <label class="flex min-w-0 items-center gap-2 py-0.5 text-[13px] leading-5 text-[color:var(--sv-text)]">
              <input v-model="scope.userMessages" type="checkbox" class="size-4 shrink-0" data-testid="search-scope-user" :disabled="props.disabled" />
              {{ t('search.scope.user') }}
            </label>
            <label class="flex min-w-0 items-center gap-2 py-0.5 text-[13px] leading-5 text-[color:var(--sv-text)]">
              <input v-model="scope.assistantMessages" type="checkbox" class="size-4 shrink-0" data-testid="search-scope-assistant" :disabled="props.disabled" />
              {{ t('search.scope.assistant') }}
            </label>
          </div>
          <div v-if="!scopeSelected" class="text-xs text-[color:var(--sv-warning)]" role="status">{{ t('search.scope.none') }}</div>

          <div class="-ml-2.5 flex min-w-0 items-center justify-between gap-2">
            <button type="button" class="sv-btn sv-btn-sm sv-btn-ghost min-w-0" data-testid="search-scope-save-default"
              :disabled="props.disabled || !scopeSelected" @click="onSaveDefaultScope">{{ t('search.scopeDefault.save') }}</button>
            <select v-model="mode" class="sv-select sv-select-sm w-auto shrink-0" :aria-label="t('search.mode.label')" :disabled="props.disabled">
              <option value="fuzzy">{{ t('search.mode.fuzzy') }}</option><option value="exact">{{ t('search.mode.exact') }}</option>
            </select>
          </div>
          <span v-if="defaultStatus" class="sv-meta" role="status" data-testid="search-scope-default-status">
            {{ defaultStatus === 'saved' ? t('search.scopeDefault.saved') : t('search.scopeDefault.failed') }}
          </span>
        </div>

        <div v-if="advancedOpen" class="grid grid-cols-1 gap-3" :class="{ 'sm:grid-cols-2': props.variant !== 'sidebar' }">
          <div class="flex min-w-0 flex-col gap-1">
            <label for="search-filter-project" class="sv-label">{{ t('search.filters.project') }}</label>
            <select
              id="search-filter-project"
              v-model="projectId"
              class="sv-select w-full min-w-0"
              :disabled="props.disabled"
            >
              <option value="">{{ t('search.filters.all') }}</option>
              <option v-for="p in props.projects" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </div>
          <div class="flex min-w-0 flex-col gap-1">
            <label for="search-filter-convo" class="sv-label">{{ t('search.filters.convo') }}</label>
            <select
              id="search-filter-convo"
              v-model="convoId"
              class="sv-select w-full min-w-0"
              :disabled="props.disabled"
            >
              <option value="">{{ t('search.filters.all') }}</option>
              <option v-for="c in props.convos" :key="c.id" :value="c.id">{{ c.title }}</option>
            </select>
          </div>
          <div class="flex min-w-0 flex-col gap-1">
            <label for="search-filter-from" class="sv-label">{{ t('search.filters.from') }}</label>
            <input
              id="search-filter-from"
              v-model="timeFrom"
              type="datetime-local"
              step="1"
              class="sv-input w-full min-w-0"
              :disabled="props.disabled"
            />
          </div>
          <div class="flex min-w-0 flex-col gap-1">
            <label for="search-filter-to" class="sv-label">{{ t('search.filters.to') }}</label>
            <input
              id="search-filter-to"
              v-model="timeTo"
              type="datetime-local"
              step="1"
              class="sv-input w-full min-w-0"
              :disabled="props.disabled"
            />
          </div>
          <div class="-ml-2.5 flex items-center" :class="{ 'sm:col-span-2': props.variant !== 'sidebar' }">
            <button
              type="button"
              class="sv-btn sv-btn-sm sv-btn-ghost"
              :disabled="props.disabled || selecting || busy"
              @click="onRebuildIndex"
            >
              {{ t('search.filters.rebuildIndex') }}
            </button>
          </div>
        </div>
      </form>

      <div class="sv-divider-t relative flex min-h-0 flex-1 flex-col" @keydown="onResultsKeydown">
        <div
          v-if="selecting"
          class="sv-meta absolute inset-x-0 top-0 z-10 px-4 py-1.5"
          :class="props.variant === 'sidebar' ? 'bg-[var(--sv-sidebar)]' : 'bg-[var(--sv-surface)]'"
          role="status" data-testid="search-target-loading"
        >{{ t('search.status.openingResult') }}</div>
        <div v-if="showFatal" class="shrink-0 px-4 pt-2 text-[13px] text-[color:var(--sv-danger)]" role="alert" data-testid="search-target-error">{{ error }}</div>
        <div v-if="busy" class="sv-meta shrink-0 px-4 pt-2" role="status">{{ t('search.status.rebuilding') }}</div>
        <div v-else-if="notice" class="sv-meta shrink-0 px-4 pt-2" role="status">{{ notice }}</div>

        <div v-if="!hasSearched" class="px-4 py-3 text-[13px] leading-5 text-[color:var(--sv-text-3)]" data-testid="search-initial-hint">{{ t('search.hint') }}</div>

        <template v-else>
          <div
            class="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2"
            data-testid="search-result-toolbar"
          >
            <span class="sv-meta min-h-[18px]" :class="{ 'basis-full': props.variant === 'sidebar' }" role="status" data-testid="search-count">{{ countLabel }}</span>
            <div class="flex items-center gap-2" :class="props.variant === 'sidebar' ? 'w-full justify-between' : 'ml-auto'">
              <label class="sv-meta flex items-center gap-1.5">
                <span :class="{ 'sr-only': props.variant === 'sidebar' }">{{ t('search.sort.label') }}</span>
                <select
                  class="sv-select sv-select-sm w-auto min-w-0"
                  :value="view.order"
                  :disabled="selecting"
                  data-testid="search-sort"
                  @change="onSortChange"
                >
                  <option v-for="value in SEARCH_SORT_ORDERS" :key="value" :value="value">{{ t(sortLabel[value]) }}</option>
                </select>
              </label>
              <div class="sv-segmented shrink-0" role="group" :aria-label="t('search.presentation.label')">
                <button
                  type="button"
                  :aria-pressed="view.presentation === 'scroll'"
                  :disabled="selecting"
                  data-testid="search-presentation-scroll"
                  @click="setPresentation('scroll')"
                >
                  {{ t('search.presentation.scroll') }}
                </button>
                <button
                  type="button"
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
            class="sv-notice mx-4 mb-2 shrink-0"
            role="status"
            data-testid="search-limit-banner"
          >
            <span>{{ t('search.limit.message') }}<button
              type="button"
              class="font-medium underline"
              :aria-label="t('search.limit.linkLabel')"
              data-testid="search-limit-settings-link"
              @click="emit('openSettings')"
            >{{ t('search.limit.link') }}</button></span>
          </div>
          <div
            v-if="capacityBlocked"
            class="sv-notice mx-4 mb-2 shrink-0"
            role="status"
            data-testid="search-capacity-banner"
          >
            <span>{{ tf('search.capacity.message', { pages: view.nav?.maxPage ?? 0 }) }}<button
              type="button"
              class="font-medium underline"
              data-testid="search-capacity-settings-link"
              @click="emit('openSettings')"
            >{{ t('search.capacity.link') }}</button></span>
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
                :selected-key="selectedHitKey"
                @activate="onSelect"
                @first-visible="onFirstVisible"
                @last-visible="onLastVisible"
              >
                <template #footer>
                  <div v-if="initialLoading || (view.nav?.navigating && view.loaded === 0)" class="px-4 py-3 text-[13px] text-[color:var(--sv-text-3)]" role="status">{{ t('search.status.searching') }}</div>
                  <div v-else-if="initialFailure" class="px-4 py-3 text-[13px] text-[color:var(--sv-danger)]" role="alert" data-testid="search-query-error">
                    {{ t('search.errors.searchFailed') }}
                    <button type="button" class="ml-2 underline" @click="runSearch">{{ t('search.errors.retry') }}</button>
                  </div>
                  <div v-else-if="noResults" class="px-4 py-3 text-[13px] text-[color:var(--sv-text-3)]">{{ t('search.status.noResults') }}</div>
                  <template v-else-if="view.presentation === 'scroll'">
                    <div v-if="view.scrollError" class="px-4 py-3 text-[13px] text-[color:var(--sv-danger)]" role="alert" data-testid="search-load-error">
                      {{ t('search.errors.loadMoreFailed') }}
                      <button type="button" class="ml-2 underline" @click="retryScroll">{{ t('search.errors.retry') }}</button>
                    </div>
                    <div v-else-if="view.status === 'more'" class="sv-meta px-4 py-3" role="status" data-testid="search-loading-more">{{ t('search.status.loadingMore') }}</div>
                    <div v-else-if="view.status === 'end' && view.loaded > 0" class="sv-meta px-4 py-3 text-center" data-testid="search-end-of-results">{{ t('search.status.endOfResults') }}</div>
                  </template>
                </template>
              </SearchResultList>
            </div>
          </div>

          <div v-if="view.presentation === 'pagination' && view.nav?.error" class="shrink-0 px-4 py-1 text-xs text-[color:var(--sv-danger)]" role="alert" data-testid="search-page-error">
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
