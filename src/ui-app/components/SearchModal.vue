<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { rebuildGenerationV2SearchIndex, runGenerationV2SearchQuery } from '@/next/generation-v2/renderer/generationV2SearchClient'
import type { SearchHit, SearchQueryParams, SearchScope } from '@/next/search/searchTypes'
import type { SearchConvoOption, SearchProjectOption, SearchSelectionContext } from './SearchModal.types'
import { getSearchScopeDefault, setSearchScopeDefault } from '@/next/search/searchScopeDefaultClient'
import { DEFAULT_SEARCH_SCOPE, hasSearchScope } from '@/next/search/searchUiState'
import { t } from '@/shared/i18n'

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
}>()

const query = ref('')
const scope = ref<SearchScope>({ ...DEFAULT_SEARCH_SCOPE })
const defaultStatus = ref<'saved' | 'failed' | null>(null)
const scopeSelected = computed(() => hasSearchScope(scope.value))
let submittedContext: Omit<SearchSelectionContext, 'hits'> | null = null
const projectId = ref<string | null>(null)
const convoId = ref<string | null>(null)
const timeFrom = ref('')
const timeTo = ref('')
const mode = ref<'exact' | 'fuzzy'>('fuzzy')

const loading = ref(false)
const error = ref<string | null>(null)
const results = ref<SearchHit[]>([])
const hasSearched = ref(false)
const advancedOpen = ref(false)
let modalOperation = 0
const selecting = ref(false)

const projectOptions = computed(() => props.projects)
const convoOptions = computed(() => props.convos)

watch(
  () => props.open,
  (next) => {
    modalOperation += 1
    const operationAtOpen = modalOperation
    selecting.value = false
    loading.value = false
    if (!next) return
    error.value = null
    results.value = []
    hasSearched.value = false
    defaultStatus.value = null
    // Every open starts from the persisted default; checkbox edits are per-search overrides only.
    void getSearchScopeDefault().then((saved) => {
      if (operationAtOpen === modalOperation && props.open) scope.value = { ...saved }
    })
    if (projectId.value == null && props.activeProjectId !== undefined) {
      projectId.value = props.activeProjectId
    }
    if (convoId.value == null && props.activeConvoId !== undefined) {
      convoId.value = props.activeConvoId
    }
  }, { flush: 'sync' },
)

function toEpochSec(value: string): number | undefined {
  if (!value) return undefined
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) return undefined
  return Math.floor(ms / 1000)
}

async function runSearch() {
  if (props.disabled || !props.open || selecting.value) return
  const q = query.value.trim()
  if (!q || !hasSearchScope(scope.value)) return
  const operation = ++modalOperation
  error.value = null
  loading.value = true
  hasSearched.value = true

  const params: SearchQueryParams = {
    q,
    scope: { ...scope.value },
    projectId: projectId.value || null,
    convoId: convoId.value || null,
    timeFromSec: toEpochSec(timeFrom.value),
    timeToSec: toEpochSec(timeTo.value),
    limit: 50,
    offset: 0,
    mode: mode.value,
    order: 'relevance',
  }

  try {
    const next = await runGenerationV2SearchQuery(params)
    if (operation !== modalOperation || !props.open) return
    results.value = next
    submittedContext = { query: q, scope: { ...scope.value }, mode: mode.value }
  } catch (err: any) {
    if (operation !== modalOperation || !props.open) return
    error.value = err?.message ? String(err.message) : 'Search failed'
    results.value = []
  } finally {
    if (operation === modalOperation) loading.value = false
  }
}

async function onSaveDefaultScope() {
  if (!scopeSelected.value) return
  const saved = await setSearchScopeDefault({ ...scope.value })
  defaultStatus.value = saved ? 'saved' : 'failed'
}

async function onRebuildIndex() {
  if (loading.value || props.disabled || !props.open || selecting.value) return
  const operation = ++modalOperation
  loading.value = true
  error.value = null
  try {
    await rebuildGenerationV2SearchIndex()
  } catch (err: any) {
    if (operation !== modalOperation || !props.open) return
    error.value = err?.message ? String(err.message) : 'Rebuild failed'
  } finally {
    if (operation === modalOperation) loading.value = false
  }
}

async function onSelect(hit: SearchHit) {
  if (props.disabled || !props.open) return
  const operation = ++modalOperation
  selecting.value = true
  loading.value = false
  error.value = null
  try {
    const context = submittedContext ?? { query: query.value.trim(), scope: { ...scope.value }, mode: mode.value }
    const success = await props.selectHit(hit, { ...context, hits: results.value })
    if (operation !== modalOperation || !props.open) return
    if (success) emit('close')
    else error.value = t('sendPlan.targetMessageUnavailable')
  } catch {
    if (operation === modalOperation && props.open) error.value = t('sendPlan.targetMessageUnavailable')
  } finally {
    if (operation === modalOperation) selecting.value = false
  }
}

function renderTitle(hit: SearchHit): string {
  if (hit.entityType === 'project') {
    return projectOptions.value.find((p) => p.id === hit.entityId)?.name ?? 'Project'
  }
  if (hit.entityType === 'convo') {
    return convoOptions.value.find((c) => c.id === hit.entityId)?.title ?? 'Conversation'
  }
  const convoTitle = convoOptions.value.find((c) => c.id === hit.convoId)?.title ?? 'Conversation'
  return `Message in ${convoTitle}`
}

const typeLabel = (hit: SearchHit) => {
  if (hit.entityType === 'project') return 'Project'
  if (hit.entityType === 'convo') return 'Conversation'
  return 'Message'
}

function formatTime(sec: number): string {
  if (!sec) return ''
  try {
    return new Date(sec * 1000).toLocaleString()
  } catch {
    return ''
  }
}

const H_START = '\u0001'
const H_END = '\u0002'

type SnippetPart = { text: string; highlight: boolean }

function splitSnippet(value: string): SnippetPart[] {
  if (!value) return []
  const parts: SnippetPart[] = []
  let cursor = 0

  while (cursor < value.length) {
    const start = value.indexOf(H_START, cursor)
    if (start === -1) {
      parts.push({ text: value.slice(cursor), highlight: false })
      break
    }

    if (start > cursor) {
      parts.push({ text: value.slice(cursor, start), highlight: false })
    }

    const end = value.indexOf(H_END, start + 1)
    if (end === -1) {
      parts.push({ text: value.slice(start + 1), highlight: true })
      break
    }

    parts.push({ text: value.slice(start + 1, end), highlight: true })
    cursor = end + 1
  }

  return parts.filter((p) => p.text.length > 0)
}
</script>

<template>
  <div v-if="props.open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="emit('close')">
    <div class="w-full max-w-3xl rounded-xl bg-white shadow-xl">
      <div class="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div class="text-sm font-semibold text-gray-900">Search</div>
        <button
          type="button"
          class="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
          @click="emit('close')"
        >
          Close
        </button>
      </div>

      <form class="space-y-4 p-4" @submit.prevent="runSearch">
        <div>
          <label class="text-xs font-semibold uppercase tracking-wide text-gray-500">Query</label>
          <input
            v-model="query"
            type="text"
            class="mt-2 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="Search..."
            :disabled="props.disabled"
            @keydown.enter.prevent="runSearch"
          />
        </div>

        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="search-scope">
          <label class="flex items-center gap-2 text-sm text-gray-700">
            <input v-model="scope.projectName" type="checkbox" class="h-4 w-4" data-testid="search-scope-project" :disabled="props.disabled" />
            Project name
          </label>
          <label class="flex items-center gap-2 text-sm text-gray-700">
            <input v-model="scope.convoName" type="checkbox" class="h-4 w-4" data-testid="search-scope-convo" :disabled="props.disabled" />
            Conversation title
          </label>
          <label class="flex items-center gap-2 text-sm text-gray-700">
            <input v-model="scope.userMessages" type="checkbox" class="h-4 w-4" data-testid="search-scope-user" :disabled="props.disabled" />
            User messages
          </label>
          <label class="flex items-center gap-2 text-sm text-gray-700">
            <input v-model="scope.assistantMessages" type="checkbox" class="h-4 w-4" data-testid="search-scope-assistant" :disabled="props.disabled" />
            Assistant messages
          </label>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
            @click="advancedOpen = !advancedOpen"
          >
            {{ advancedOpen ? 'Hide filters' : 'Show filters' }}
          </button>

          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            data-testid="search-scope-save-default"
            :disabled="props.disabled || !scopeSelected"
            @click="onSaveDefaultScope"
          >
            Save scope as default
          </button>
          <span v-if="defaultStatus" class="text-xs text-gray-500" data-testid="search-scope-default-status">
            {{ defaultStatus === 'saved' ? 'Default saved' : 'Could not save default' }}
          </span>

          <div class="ml-auto flex items-center gap-2">
            <select
              v-model="mode"
              class="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600"
              :disabled="props.disabled"
            >
              <option value="fuzzy">Fuzzy</option>
              <option value="exact">Exact</option>
            </select>
            <button
              type="submit"
              class="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              :disabled="props.disabled || selecting || query.trim().length === 0 || !scopeSelected"
            >
              Search
            </button>
          </div>
        </div>

        <div v-if="advancedOpen" class="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:grid-cols-2">
          <div>
            <label class="text-xs font-semibold uppercase tracking-wide text-gray-500">Project</label>
            <select
              v-model="projectId"
              class="mt-2 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
              :disabled="props.disabled"
            >
              <option value="">All</option>
              <option v-for="p in projectOptions" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </div>
          <div>
            <label class="text-xs font-semibold uppercase tracking-wide text-gray-500">Conversation</label>
            <select
              v-model="convoId"
              class="mt-2 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
              :disabled="props.disabled"
            >
              <option value="">All</option>
              <option v-for="c in convoOptions" :key="c.id" :value="c.id">{{ c.title }}</option>
            </select>
          </div>
          <div>
            <label class="text-xs font-semibold uppercase tracking-wide text-gray-500">From (local time)</label>
            <input
              v-model="timeFrom"
              type="datetime-local"
              step="1"
              class="mt-2 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
              :disabled="props.disabled"
            />
          </div>
          <div>
            <label class="text-xs font-semibold uppercase tracking-wide text-gray-500">To (local time)</label>
            <input
              v-model="timeTo"
              type="datetime-local"
              step="1"
              class="mt-2 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
              :disabled="props.disabled"
            />
          </div>
          <div class="sm:col-span-2 flex items-center justify-end gap-2">
            <button
              type="button"
              class="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
              :disabled="props.disabled || selecting"
              @click="onRebuildIndex"
            >
              Rebuild index
            </button>
          </div>
        </div>
      </form>

      <div class="border-t border-gray-200 px-4 py-3">
        <div v-if="selecting" class="text-sm text-gray-500" data-testid="search-target-loading">{{ t('errors.search.openingResult') }}</div>
        <div v-if="error && !loading" class="text-sm text-red-600" data-testid="search-target-error">{{ error }}</div>
        <div v-if="loading" class="text-sm text-gray-500">Searching...</div>
        <div v-else-if="hasSearched && results.length === 0" class="text-sm text-gray-500">No results.</div>

        <div v-else class="space-y-3">
          <button
            v-for="hit in results"
            :key="`${hit.entityType}:${hit.entityId}`"
            type="button"
            :disabled="props.disabled"
            :data-testid="`search-hit-${hit.entityId}`"
            class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-left shadow-sm hover:bg-gray-50"
            @click="onSelect(hit)"
          >
            <div class="flex items-center justify-between gap-2">
              <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">{{ typeLabel(hit) }}</div>
              <div class="text-[11px] text-gray-400">{{ formatTime(hit.createdAtSec) }}</div>
            </div>
            <div class="mt-1 text-sm font-semibold text-gray-900">{{ renderTitle(hit) }}</div>
            <div v-if="hit.snippet" class="mt-1 text-sm text-gray-600">
              <template v-for="(part, idx) in splitSnippet(hit.snippet)" :key="idx">
                <mark v-if="part.highlight" class="rounded bg-yellow-200 px-0.5">{{ part.text }}</mark>
                <span v-else>{{ part.text }}</span>
              </template>
            </div>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
