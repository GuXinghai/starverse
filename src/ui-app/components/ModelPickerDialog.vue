<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { t, tf } from '@/shared/i18n'
import {
  CatalogQueryService,
  type CatalogQueryCursor,
  type CatalogQueryInput,
  type CatalogQueryItem,
  type CatalogQueryResult,
  type CatalogQueryModality,
  type CatalogQuerySortBy,
  type CatalogQuerySortOrder,
} from '@/next/modelCatalog/catalogQueryService'
import {
  getModelEndpointDetails,
  type GetModelEndpointDetailsInput,
  type ModelEndpointDetailsResult,
} from '@/next/modelCatalog/modelEndpointDetailService'
import {
  getModelCatalogModelDetail,
  type GetModelCatalogModelDetailInput,
  type ModelCatalogModelDetailResult,
} from '@/next/modelCatalog/modelDetailService'
import type { ModelCatalogItem } from '@/next/modelCatalog/modelCatalogTypes'
import { OPENROUTER_MODEL_CATEGORIES, type OpenRouterModelCategory } from '@/next/modelCatalog/openRouterCategoryCache'
import { useVirtualWindow } from '@/ui-kit/chat/useVirtualWindow'
import EndpointDetailPanel from './EndpointDetailPanel.vue'
import ModelDetailPanel from './ModelDetailPanel.vue'
import {
  DEFAULT_CATALOG_AUTO_SYNC_POLICY,
  DEFAULT_CATALOG_FRESHNESS_MS,
  DEFAULT_CATALOG_LIST_UPDATE_MODE,
  OPENROUTER_CATALOG_FRESHNESS_MS_KEY,
  OPENROUTER_CATALOG_LIST_UPDATE_MODE_KEY,
  OPENROUTER_CATALOG_PICKER_OPEN_SYNC_POLICY_KEY,
  isCatalogStatusStale,
  normalizeCatalogAutoSyncPolicy,
  normalizeCatalogFreshnessMs,
  normalizeCatalogListUpdateMode,
  type CatalogAutoSyncPolicy,
  type CatalogListUpdateMode,
} from '@/shared/modelCatalog/catalogSyncSettings'
import {
  DEFAULT_CHAT_PROVIDER_ID,
  DEFAULT_OPENROUTER_MODEL_ID,
  buildProviderModelKey,
  type ChatModelSelection,
} from '@/next/provider/modelSelection'
import type { RuntimeProviderKey } from '@/next/provider/runtimeSelection'
import type { ProviderModelPickerItem, ProviderModelPickerSource } from '../app/providerModelPickerViewModel'

type TriState = 'any' | 'yes' | 'no'
type DetailTab = 'model' | 'endpoints'
type PickerMode = 'all' | 'favorites' | 'recents'
type PickerModelItem = CatalogQueryItem & Readonly<{
  providerId: RuntimeProviderKey
  providerName: string
  itemKey: string
  capabilitySummary?: string
  statusLabel?: string
  sourceLabel?: string
  selectable: boolean
  detailSource: 'openrouter_catalog' | 'provider_source'
}>
type ShortcutItem = Readonly<{ modelKey: string; providerId: RuntimeProviderKey; modelId: string; name: string; available: boolean }>

type QueryFn = (input: CatalogQueryInput) => Promise<CatalogQueryResult>
type EndpointDetailFn = (input: GetModelEndpointDetailsInput) => Promise<ModelEndpointDetailsResult>
type ModelDetailFn = (input: GetModelCatalogModelDetailInput) => Promise<ModelCatalogModelDetailResult>

const props = withDefaults(
  defineProps<{
    open: boolean
    disabled?: boolean
    isRunning?: boolean
    selectedProviderId?: RuntimeProviderKey
    selectedModelId: string
    providerSources?: readonly ProviderModelPickerSource[]
    favoriteModelKeys?: readonly string[]
    recentModelKeys?: readonly string[]
    fallbackModels?: readonly ModelCatalogItem[]
    notice?: string | null
    debounceMs?: number
    queryFn?: QueryFn
    endpointDetailFn?: EndpointDetailFn
    modelDetailFn?: ModelDetailFn
    forceOutputImageOnly?: boolean
  }>(),
  {
    disabled: false,
    isRunning: false,
    favoriteModelKeys: () => [],
    recentModelKeys: () => [],
    providerSources: () => [],
    fallbackModels: () => [],
    notice: null,
    debounceMs: 250,
    queryFn: undefined,
    endpointDetailFn: undefined,
    modelDetailFn: undefined,
    forceOutputImageOnly: false,
    selectedProviderId: DEFAULT_CHAT_PROVIDER_ID,
  },
)

const emit = defineEmits<{
  close: []
  select: [selection: ChatModelSelection, displayName: string]
  toggleFavorite: [modelId: string]
  reorderFavorites: [orderedModelKeys: string[]]
}>()

const searchInputRef = ref<HTMLInputElement | null>(null)
const listScrollRef = ref<HTMLElement | null>(null)
const searchText = ref('')
const includeDescriptionInSearch = ref(false)
const selectedProviderFilter = ref<RuntimeProviderKey | 'all'>('all')
const selectedVendors = ref<string[]>([])
const selectedCategory = ref<OpenRouterModelCategory | 'all'>('all')
const contextLengthMin = ref('')
const contextLengthMax = ref('')
const maxOutputTokensMin = ref('')
const maxOutputTokensMax = ref('')
const selectedArchitectureModalities = ref<string[]>([])
const selectedInputModalities = ref<CatalogQueryModality[]>([])
const selectedOutputModalities = ref<CatalogQueryModality[]>([])
const selectedSupportedParameters = ref<string[]>([])
const tokenizerFiltersText = ref('')
const instructTypeFiltersText = ref('')
const hasPerRequestLimits = ref<TriState>('any')
const hasDefaultParameters = ref<TriState>('any')
const moderationFilter = ref<TriState>('any')
const expiringWithinEnabled = ref(false)
const expiringWithinDays = ref('7')
const sortBy = ref<CatalogQuerySortBy>('name')
const sortOrder = ref<CatalogQuerySortOrder>('asc')
const loading = ref(false)
const error = ref<string | null>(null)
const queryNotice = ref<string | null>(null)
const items = ref<CatalogQueryItem[]>([])
const nextCursor = ref<CatalogQueryCursor | null>(null)
const activeModelKey = ref('')
const modelDetail = ref<ModelCatalogModelDetailResult['item']>(null)
const modelDetailLoading = ref(false)
const modelDetailError = ref<string | null>(null)
const endpointDetails = ref<ModelEndpointDetailsResult | null>(null)
const endpointLoading = ref(false)
const activeDetailTab = ref<DetailTab>('model')
const activePickerMode = ref<PickerMode>('all')
const favoriteEditMode = ref(false)
const editableFavoriteModelKeys = ref<string[]>([])
const draggingFavoriteIndex = ref<number | null>(null)

type SyncStatus = 'not_synced' | 'syncing' | 'synced' | 'failed'
const syncStatus = ref<SyncStatus>('not_synced')
const syncModelCount = ref(0)
const syncLastSyncedAtMs = ref<number | null>(null)
const syncErrorCode = ref<string | null>(null)
const syncErrorMessage = ref<string | null>(null)
const syncIsStale = ref(true)
const latestCatalogRevision = ref<string | null>(null)
const appliedCatalogRevision = ref<string | null>(null)
const pendingCatalogUpdateAvailable = ref(false)
const pendingCatalogRevision = ref<string | null>(null)
const pickerOpenSyncPolicy = ref<CatalogAutoSyncPolicy>(DEFAULT_CATALOG_AUTO_SYNC_POLICY)
const catalogListUpdateMode = ref<CatalogListUpdateMode>(DEFAULT_CATALOG_LIST_UPDATE_MODE)
const catalogFreshnessMs = ref(DEFAULT_CATALOG_FRESHNESS_MS)
let lastAutoSyncAtMs = 0
let lastManualRefreshAtMs = 0
const AUTO_SYNC_COOLDOWN_MS = 10_000
const MANUAL_REFRESH_COOLDOWN_MS = 3_000
let unsubscribeModelCatalogSynced: (() => void) | null = null

const architectureModalityOptions = [
  'text->text',
  'text->image',
  'text+image->text',
  'text+image->image',
  'image->text',
  'text->audio',
  'audio->text',
] as const
const modalityOptions: ReadonlyArray<CatalogQueryModality> = ['text', 'image', 'audio', 'video', 'file']
const supportedParameterOptions = [
  'tools',
  'tool_choice',
  'reasoning',
  'include_reasoning',
  'structured_outputs',
  'response_format',
  'seed',
  'temperature',
  'top_p',
  'top_k',
  'max_tokens',
  'frequency_penalty',
  'presence_penalty',
  'logprobs',
] as const
const sortByOptions: ReadonlyArray<Readonly<{ key: CatalogQuerySortBy; label: string }>> = [
  { key: 'name', label: 'Name' },
  { key: 'created_at', label: 'Created Time' },
  { key: 'context_length', label: 'Context Length' },
  { key: 'max_output_tokens', label: 'Max Output Tokens' },
]
const sortOrderOptions: ReadonlyArray<Readonly<{ key: CatalogQuerySortOrder; label: string }>> = [
  { key: 'asc', label: 'Asc' },
  { key: 'desc', label: 'Desc' },
]
const categoryOptions = OPENROUTER_MODEL_CATEGORIES

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let querySeq = 0
let modelDetailSeq = 0
let endpointSeq = 0
let skipAutoQuery = false
let lastFocusBeforeOpen: HTMLElement | null = null

const openRouterPickerItems = computed(() => items.value.map((item) => toOpenRouterPickerItem(item)))
const providerPickerItems = computed(() => props.providerSources.flatMap((source) => source.items.map((item) => toProviderPickerItem(item))))
const pickerItems = computed(() => {
  const sourceItems = [...openRouterPickerItems.value, ...providerPickerItems.value]
  const providerFilter = selectedProviderFilter.value
  const text = searchText.value.trim().toLowerCase()
  return sourceItems.filter((item) => {
    if (providerFilter !== 'all' && item.providerId !== providerFilter) return false
    if (item.detailSource === 'openrouter_catalog') return true
    if (!text) return true
    const haystack = [
      item.displayName,
      item.modelId,
      item.providerName,
      item.vendor,
      includeDescriptionInSearch.value ? item.description : null,
    ].map((part) => String(part ?? '').toLowerCase()).join('\n')
    return haystack.includes(text)
  })
})

const itemKeys = computed(() => pickerItems.value.map((item) => item.itemKey))
const { range, topPaddingPx, bottomPaddingPx, measureElement, getOffsetForIndex, refresh } = useVirtualWindow({
  items: itemKeys,
  scrollEl: listScrollRef,
  estimatedHeight: 68,
  overscan: 10,
})

const visibleItems = computed(() => pickerItems.value.slice(range.value.start, range.value.end))

const vendorOptions = computed(() => {
  const vendorSet = new Set<string>()
  for (const item of pickerItems.value) {
    const vendor = String(item.vendor ?? '').trim()
    if (vendor) vendorSet.add(vendor)
  }
  for (const vendor of selectedVendors.value) {
    const normalized = String(vendor ?? '').trim()
    if (normalized) vendorSet.add(normalized)
  }
  return Array.from(vendorSet).sort((a, b) => a.localeCompare(b))
})

const activeIndex = computed(() => {
  const active = activeModelKey.value
  return pickerItems.value.findIndex((item) => item.itemKey === active)
})
const activeItem = computed(() => {
  const index = activeIndex.value
  return index >= 0 ? pickerItems.value[index] : null
})

const selectedProviderId = computed(() => props.selectedProviderId ?? DEFAULT_CHAT_PROVIDER_ID)
const selectedModelId = computed(() => normalizeModelId(props.selectedModelId))

const selectedModelLabel = computed(() => {
  const selected = selectedModelId.value
  const inResults = pickerItems.value.find((item) =>
    item.providerId === selectedProviderId.value && normalizeModelId(item.modelId) === selected
  )
  const label = inResults?.displayName ?? (selected || DEFAULT_OPENROUTER_MODEL_ID)
  return selectedProviderId.value === DEFAULT_CHAT_PROVIDER_ID
    ? label
    : `${providerNameForId(selectedProviderId.value)} · ${label}`
})

const effectiveNotice = computed(() => {
  const noticeParts = [queryNotice.value].map((value) => String(value ?? '').trim()).filter(Boolean)
  return noticeParts.length > 0 ? noticeParts.join(' ') : null
})

const canLoadMore = computed(() => selectedProviderFilter.value !== 'all' && selectedProviderFilter.value !== DEFAULT_CHAT_PROVIDER_ID
  ? false
  : !!nextCursor.value && !loading.value && !props.disabled)
const endpointItems = computed(() => endpointDetails.value?.items ?? [])
const endpointFetchedAtMs = computed(() => endpointDetails.value?.fetchedAtMs ?? null)
const endpointError = computed(() => endpointDetails.value?.error ?? null)
const favoriteModelKeySet = computed(() => new Set(props.favoriteModelKeys.map((value) => String(value ?? '').trim()).filter(Boolean)))
const normalizedFavoriteModelKeys = computed(() => normalizeFavoriteModelKeys(props.favoriteModelKeys))
const normalizedRecentModelKeys = computed(() => normalizeFavoriteModelKeys(props.recentModelKeys))
const favoriteShortcutItems = computed(() => buildShortcutItems(normalizedFavoriteModelKeys.value))
const recentShortcutItems = computed(() => buildShortcutItems(normalizedRecentModelKeys.value))
const activeShortcutItems = computed(() => {
  if (activePickerMode.value === 'favorites') return favoriteShortcutItems.value
  if (activePickerMode.value === 'recents') return recentShortcutItems.value
  return []
})
const activeDetailModelId = computed(() => {
  return activeDetailItem.value?.modelId ?? ''
})
const activeDetailItem = computed(() => {
  if (activeItem.value) return activeItem.value
  const selected = selectedModelId.value
  if (!selected) return null
  return pickerItems.value.find((item) =>
    item.providerId === selectedProviderId.value && normalizeModelId(item.modelId) === selected
  ) ?? null
})
const favoriteOrderDirty = computed(() => {
  const next = editableFavoriteModelKeys.value
  const base = normalizedFavoriteModelKeys.value
  if (next.length !== base.length) return true
  for (let index = 0; index < next.length; index += 1) {
    if (next[index] !== base[index]) return true
  }
  return false
})
const queryFilterSignature = computed(() =>
  JSON.stringify({
    searchText: searchText.value.trim(),
    includeDescriptionInSearch: includeDescriptionInSearch.value,
    selectedProviderFilter: selectedProviderFilter.value,
    selectedVendors: [...selectedVendors.value].sort(),
    selectedCategory: selectedCategory.value,
    contextLengthMin: contextLengthMin.value,
    contextLengthMax: contextLengthMax.value,
    maxOutputTokensMin: maxOutputTokensMin.value,
    maxOutputTokensMax: maxOutputTokensMax.value,
    selectedArchitectureModalities: [...selectedArchitectureModalities.value].sort(),
    selectedInputModalities: [...selectedInputModalities.value].sort(),
    selectedOutputModalities: [...selectedOutputModalities.value].sort(),
    selectedSupportedParameters: [...selectedSupportedParameters.value].sort(),
    tokenizerFiltersText: tokenizerFiltersText.value,
    instructTypeFiltersText: instructTypeFiltersText.value,
    hasPerRequestLimits: hasPerRequestLimits.value,
    hasDefaultParameters: hasDefaultParameters.value,
    moderationFilter: moderationFilter.value,
    expiringWithinEnabled: expiringWithinEnabled.value,
    expiringWithinDays: expiringWithinDays.value,
    sortBy: sortBy.value,
    sortOrder: sortOrder.value,
  })
)

const SYNC_FAILURE_REASON_MAP: Record<string, string> = {
  missing_api_key: 'errors.modelCatalog.syncFailMissingApiKey',
  invalid_api_key: 'errors.modelCatalog.syncFailInvalidApiKey',
  insufficient_credits: 'errors.modelCatalog.syncFailInsufficientCredits',
  forbidden: 'errors.modelCatalog.syncFailForbidden',
  rate_limited: 'errors.modelCatalog.syncFailRateLimited',
  timeout: 'errors.modelCatalog.syncFailTimeout',
  network_unreachable: 'errors.modelCatalog.syncFailNetworkUnreachable',
  service_unavailable: 'errors.modelCatalog.syncFailServiceUnavailable',
  bad_response: 'errors.modelCatalog.syncFailBadResponse',
  cache_corrupted: 'errors.modelCatalog.syncFailCacheCorrupted',
  db_unavailable: 'errors.modelCatalog.syncFailDbUnavailable',
  unknown_error: 'errors.modelCatalog.syncFailUnknownError',
}

const syncFailureReasonText = computed(() => {
  const code = syncErrorCode.value ?? 'unknown_error'
  const key = SYNC_FAILURE_REASON_MAP[code] ?? SYNC_FAILURE_REASON_MAP.unknown_error
  return t(key)
})

const providerOptions = computed(() => {
  const options = new Map<RuntimeProviderKey, { providerId: RuntimeProviderKey; providerName: string; statusLabel: string; loading: boolean; count: number }>()
  options.set(DEFAULT_CHAT_PROVIDER_ID, {
    providerId: DEFAULT_CHAT_PROVIDER_ID,
    providerName: 'OpenRouter',
    statusLabel: syncStatus.value === 'synced' ? `${items.value.length} shown` : syncStatus.value,
    loading: loading.value || syncStatus.value === 'syncing',
    count: items.value.length,
  })
  for (const source of props.providerSources) {
    options.set(source.providerId, {
      providerId: source.providerId,
      providerName: source.providerName,
      statusLabel: source.statusLabel,
      loading: source.loading,
      count: source.items.length,
    })
  }
  return Array.from(options.values())
})

function providerNameForId(providerId: RuntimeProviderKey): string {
  return providerOptions.value.find((option) => option.providerId === providerId)?.providerName ?? providerId
}

function pickerItemKey(providerId: RuntimeProviderKey, modelId: string): string {
  return buildProviderModelKey({ providerId, modelId })
}

function toOpenRouterPickerItem(item: CatalogQueryItem): PickerModelItem {
  return {
    ...item,
    providerId: DEFAULT_CHAT_PROVIDER_ID,
    providerName: 'OpenRouter',
    itemKey: pickerItemKey(DEFAULT_CHAT_PROVIDER_ID, item.modelId),
    capabilitySummary: openRouterCapabilitySummary(item),
    statusLabel: item.status ?? item.visibility ?? 'catalog',
    sourceLabel: 'OpenRouter catalog',
    selectable: true,
    detailSource: 'openrouter_catalog',
  }
}

function toProviderPickerItem(item: ProviderModelPickerItem): PickerModelItem {
  return {
    providerKey: item.providerId,
    providerId: item.providerId,
    providerName: item.providerName,
    modelId: item.modelId,
    modelKey: item.modelKey,
    canonicalSlug: item.modelId,
    displayName: item.displayName,
    description: item.description,
    vendor: item.vendor,
    contextLength: null,
    maxOutputTokens: null,
    createdAtSec: null,
    pricing: { prompt: null, completion: null, request: null, image: null },
    capabilities: {
      reasoning: item.capabilitySummary.includes('reasoning'),
      tools: item.capabilitySummary.includes('tools'),
      structuredOutputs: item.capabilitySummary.includes('structured output'),
      vision: item.inputModalities.includes('image'),
      longContext: item.capabilitySummary.includes('ctx '),
    },
    inputModalities: [...item.inputModalities],
    outputModalities: [...item.outputModalities],
    status: item.statusLabel,
    visibility: item.selectable ? 'visible' : 'disabled',
    itemKey: pickerItemKey(item.providerId, item.modelId),
    capabilitySummary: item.capabilitySummary,
    statusLabel: item.statusLabel,
    sourceLabel: item.sourceLabel,
    selectable: item.selectable,
    detailSource: 'provider_source',
  }
}

function openRouterCapabilitySummary(item: CatalogQueryItem): string {
  const labels: string[] = []
  if (Array.isArray(item.inputModalities) && item.inputModalities.length > 0) {
    labels.push(`in:${item.inputModalities.join('+')}`)
  }
  if (Array.isArray(item.outputModalities) && item.outputModalities.length > 0) {
    labels.push(`out:${item.outputModalities.join('+')}`)
  }
  if (item.capabilities.reasoning) labels.push('reasoning')
  if (item.capabilities.tools) labels.push('tools')
  if (item.capabilities.vision) labels.push('vision')
  if (item.capabilities.longContext) labels.push('long context')
  return labels.length > 0 ? labels.join(' · ') : 'catalog capability'
}

function formatSyncTime(ms: number | null): string {
  if (!ms || ms <= 0) return '—'
  try {
    const d = new Date(ms)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  } catch {
    return '—'
  }
}

function getElectronStore(): { get?: (key: string) => Promise<unknown> } | null {
  const store = (globalThis as any).electronStore as { get?: (key: string) => Promise<unknown> } | undefined
  return store && typeof store.get === 'function' ? store : null
}

async function loadCatalogSyncSettings() {
  const store = getElectronStore()
  if (!store?.get) {
    pickerOpenSyncPolicy.value = DEFAULT_CATALOG_AUTO_SYNC_POLICY
    catalogListUpdateMode.value = DEFAULT_CATALOG_LIST_UPDATE_MODE
    catalogFreshnessMs.value = DEFAULT_CATALOG_FRESHNESS_MS
    return
  }
  const [pickerPolicy, updateMode, freshness] = await Promise.all([
    store.get(OPENROUTER_CATALOG_PICKER_OPEN_SYNC_POLICY_KEY),
    store.get(OPENROUTER_CATALOG_LIST_UPDATE_MODE_KEY),
    store.get(OPENROUTER_CATALOG_FRESHNESS_MS_KEY),
  ])
  pickerOpenSyncPolicy.value = normalizeCatalogAutoSyncPolicy(pickerPolicy)
  catalogListUpdateMode.value = normalizeCatalogListUpdateMode(updateMode)
  catalogFreshnessMs.value = normalizeCatalogFreshnessMs(freshness)
}

function normalizeCatalogRevision(value: unknown, modelCount?: unknown, lastSyncAtMs?: unknown): string | null {
  const revision = String(value ?? '').trim()
  if (revision) return revision
  const count = Number(modelCount ?? 0)
  const syncedAt = Number(lastSyncAtMs ?? 0)
  if (!Number.isFinite(syncedAt) || syncedAt <= 0) return null
  return `${Number.isFinite(count) ? count : 0}:${syncedAt}`
}

function shouldSyncOnPickerOpen(): boolean {
  if (syncStatus.value === 'syncing') return false
  if (pickerOpenSyncPolicy.value === 'never') return false
  if (pickerOpenSyncPolicy.value === 'always') return true
  if (syncStatus.value === 'not_synced') return true
  if (syncStatus.value === 'synced') {
    return syncIsStale.value || isCatalogStatusStale({
      status: 'synced',
      lastSyncAtMs: syncLastSyncedAtMs.value,
      freshnessMs: catalogFreshnessMs.value,
    })
  }
  if (syncStatus.value === 'failed') {
    return syncErrorCode.value === 'cache_corrupted'
  }
  return false
}

function resolveQueryFn(): QueryFn {
  return props.queryFn ?? ((input) => CatalogQueryService.query(input))
}

function resolveEndpointDetailFn(): EndpointDetailFn {
  return props.endpointDetailFn ?? ((input) => getModelEndpointDetails(input))
}

function resolveModelDetailFn(): ModelDetailFn {
  return props.modelDetailFn ?? ((input) => getModelCatalogModelDetail(input))
}

function clearDebounceTimer() {
  if (!debounceTimer) return
  clearTimeout(debounceTimer)
  debounceTimer = null
}

function parseModelIdFromModelKey(modelKey: string): string {
  const normalized = String(modelKey ?? '').trim()
  const delimiter = '::'
  const delimiterIndex = normalized.indexOf(delimiter)
  if (delimiterIndex < 0 || delimiterIndex + delimiter.length >= normalized.length) return normalized
  return normalized.slice(delimiterIndex + delimiter.length).trim()
}

function parseProviderIdFromModelKey(modelKey: string): RuntimeProviderKey {
  const normalized = String(modelKey ?? '').trim()
  const delimiter = '::'
  const delimiterIndex = normalized.indexOf(delimiter)
  if (delimiterIndex <= 0) return DEFAULT_CHAT_PROVIDER_ID
  const providerId = normalized.slice(0, delimiterIndex).trim()
  return providerOptions.value.some((option) => option.providerId === providerId)
    ? providerId as RuntimeProviderKey
    : DEFAULT_CHAT_PROVIDER_ID
}

function normalizeModelId(value: unknown): string {
  return String(value ?? '').trim()
}

function isSelectedModel(modelId: string, providerId: RuntimeProviderKey = DEFAULT_CHAT_PROVIDER_ID): boolean {
  return providerId === selectedProviderId.value && normalizeModelId(modelId) === selectedModelId.value
}

function isSelectedItem(item: PickerModelItem): boolean {
  return isSelectedModel(item.modelId, item.providerId)
}

function normalizeFavoriteModelKeys(input: readonly string[]): string[] {
  const normalizedKeys: string[] = []
  const seen = new Set<string>()
  for (const value of input) {
    const normalized = String(value ?? '').trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    normalizedKeys.push(normalized)
  }
  return normalizedKeys
}

function resetFavoriteEditorState() {
  favoriteEditMode.value = false
  editableFavoriteModelKeys.value = normalizeFavoriteModelKeys(props.favoriteModelKeys)
  draggingFavoriteIndex.value = null
}

function resolveFavoriteName(modelKey: string): string {
  const modelId = parseModelIdFromModelKey(modelKey)
  const providerId = parseProviderIdFromModelKey(modelKey)
  const inResults = pickerItems.value.find((item) => item.providerId === providerId && item.modelId === modelId)
  if (inResults) return inResults.displayName
  return modelId || modelKey
}

function buildShortcutItems(modelKeys: readonly string[]): ShortcutItem[] {
  return modelKeys
    .map((modelKey) => {
      const providerId = parseProviderIdFromModelKey(modelKey)
      const modelId = normalizeModelId(parseModelIdFromModelKey(modelKey))
      if (!modelId) return null
      const available = pickerItems.value.some((item) => item.providerId === providerId && normalizeModelId(item.modelId) === modelId)
      return {
        modelKey,
        providerId,
        modelId,
        name: resolveFavoriteName(modelKey),
        available,
      }
    })
    .filter((item): item is ShortcutItem => item !== null)
}

function openFavoriteEditMode() {
  if (props.disabled || props.isRunning) return
  favoriteEditMode.value = true
  editableFavoriteModelKeys.value = normalizeFavoriteModelKeys(props.favoriteModelKeys)
  draggingFavoriteIndex.value = null
}

function cancelFavoriteEditMode() {
  favoriteEditMode.value = false
  editableFavoriteModelKeys.value = normalizeFavoriteModelKeys(props.favoriteModelKeys)
  draggingFavoriteIndex.value = null
}

function removeEditableFavorite(index: number) {
  if (props.disabled || props.isRunning) return
  if (!favoriteEditMode.value) return
  if (index < 0 || index >= editableFavoriteModelKeys.value.length) return
  const next = [...editableFavoriteModelKeys.value]
  next.splice(index, 1)
  editableFavoriteModelKeys.value = next
}

function saveFavoriteOrder() {
  if (props.disabled || props.isRunning) return
  if (!favoriteEditMode.value || !favoriteOrderDirty.value) {
    favoriteEditMode.value = false
    return
  }
  const nextOrder = normalizeFavoriteModelKeys(editableFavoriteModelKeys.value)
  emit('reorderFavorites', nextOrder)
  favoriteEditMode.value = false
  draggingFavoriteIndex.value = null
}

function onFavoriteDragStart(index: number, event: DragEvent) {
  if (!favoriteEditMode.value || props.disabled || props.isRunning) return
  draggingFavoriteIndex.value = index
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }
}

function onFavoriteDragOver(event: DragEvent) {
  if (!favoriteEditMode.value || props.disabled || props.isRunning) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
}

function onFavoriteDrop(targetIndex: number, event: DragEvent) {
  if (!favoriteEditMode.value || props.disabled || props.isRunning) return
  event.preventDefault()
  const from = draggingFavoriteIndex.value
  if (from === null || from === targetIndex) return
  if (from < 0 || from >= editableFavoriteModelKeys.value.length) return
  if (targetIndex < 0 || targetIndex >= editableFavoriteModelKeys.value.length) return
  const next = [...editableFavoriteModelKeys.value]
  const [moved] = next.splice(from, 1)
  next.splice(targetIndex, 0, moved)
  editableFavoriteModelKeys.value = next
  draggingFavoriteIndex.value = targetIndex
}

function onFavoriteDragEnd() {
  draggingFavoriteIndex.value = null
}

function scheduleRefresh(delayMs: number) {
  clearDebounceTimer()
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void fetchPage(false)
  }, Math.max(0, delayMs))
}

function parseNumberInput(value: string): number | undefined {
  const normalized = String(value ?? '').trim()
  if (!normalized) return undefined
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) return undefined
  return parsed
}

function parseCsvFilters(value: string): string[] | undefined {
  const normalized = String(value ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0)
  if (normalized.length === 0) return undefined
  return Array.from(new Set(normalized))
}

function toggleArrayValue<T extends string>(target: { value: T[] } | T[] | undefined, value: T) {
  const normalized = String(value ?? '').trim() as T
  if (!normalized) return
  const list = Array.isArray(target) ? target : target?.value
  if (!Array.isArray(list)) return
  const existingIndex = list.indexOf(normalized)
  if (existingIndex >= 0) {
    list.splice(existingIndex, 1)
    return
  }
  list.push(normalized)
}

function setOutputModalitiesFilter(next: readonly CatalogQueryModality[]) {
  selectedOutputModalities.value = Array.from(new Set(next.map((value) => String(value ?? '').trim() as CatalogQueryModality)))
    .filter((value): value is CatalogQueryModality => value === 'text' || value === 'image' || value === 'audio' || value === 'video' || value === 'file')
}

function toggleQuickImageOutputFilter() {
  if (props.disabled) return
  const hasOnlyImage =
    selectedOutputModalities.value.length === 1 &&
    selectedOutputModalities.value[0] === 'image'
  if (hasOnlyImage) {
    setOutputModalitiesFilter([])
    return
  }
  setOutputModalitiesFilter(['image'])
}

function hasImageGenerationSignal(item: CatalogQueryItem): boolean {
  if (selectedOutputModalities.value.includes('image')) return true
  const imagePrice = String(item.pricing.image ?? '').trim()
  return imagePrice.length > 0
}

function buildQueryInput(append: boolean): CatalogQueryInput {
  const vendors = selectedVendors.value.length > 0 ? [...selectedVendors.value] : undefined
  const contextMin = parseNumberInput(contextLengthMin.value)
  const contextMax = parseNumberInput(contextLengthMax.value)
  const maxOutputMin = parseNumberInput(maxOutputTokensMin.value)
  const maxOutputMax = parseNumberInput(maxOutputTokensMax.value)
  const contextLength = contextMin !== undefined || contextMax !== undefined ? { min: contextMin, max: contextMax } : undefined
  const maxOutputTokens = maxOutputMin !== undefined || maxOutputMax !== undefined
    ? { min: maxOutputMin, max: maxOutputMax }
    : undefined
  const expiringWindowDays = expiringWithinEnabled.value ? parseNumberInput(expiringWithinDays.value) : undefined
  const tokenizers = parseCsvFilters(tokenizerFiltersText.value)
  const instructTypes = parseCsvFilters(instructTypeFiltersText.value)
  const category = selectedCategory.value !== 'all' ? selectedCategory.value : undefined

  const filter = {
    ...(vendors ? { vendors } : {}),
    ...(category ? { category } : {}),
    ...(contextLength ? { contextLength } : {}),
    ...(maxOutputTokens ? { maxOutputTokens } : {}),
    ...(selectedArchitectureModalities.value.length > 0 ? { architectureModalities: [...selectedArchitectureModalities.value] } : {}),
    ...(selectedInputModalities.value.length > 0 ? { inputModalities: [...selectedInputModalities.value] } : {}),
    ...(selectedOutputModalities.value.length > 0 ? { outputModalities: [...selectedOutputModalities.value] } : {}),
    ...(selectedSupportedParameters.value.length > 0 ? { supportedParameters: [...selectedSupportedParameters.value] } : {}),
    ...(tokenizers ? { tokenizers } : {}),
    ...(instructTypes ? { instructTypes } : {}),
    ...(hasPerRequestLimits.value !== 'any' ? { hasPerRequestLimits: hasPerRequestLimits.value === 'yes' } : {}),
    ...(hasDefaultParameters.value !== 'any' ? { hasDefaultParameters: hasDefaultParameters.value === 'yes' } : {}),
    ...(moderationFilter.value !== 'any' ? { topProviderIsModerated: moderationFilter.value === 'yes' } : {}),
    ...(expiringWindowDays !== undefined ? { expiringWithinDays: Math.max(0, Math.floor(expiringWindowDays)) } : {}),
  }
  return {
    sourceProviderKey: DEFAULT_CHAT_PROVIDER_ID,
    searchText: searchText.value.trim() || undefined,
    includeDescriptionInSearch: includeDescriptionInSearch.value,
    ...(Object.keys(filter).length > 0 ? { filter } : {}),
    page: {
      limit: 60,
      cursor: append ? nextCursor.value : null,
    },
    sort: {
      by: sortBy.value,
      order: sortOrder.value,
    },
  }
}

function mergeItems(previous: readonly CatalogQueryItem[], incoming: readonly CatalogQueryItem[]): CatalogQueryItem[] {
  if (previous.length === 0) return [...incoming]
  const byId = new Map<string, CatalogQueryItem>()
  for (const item of previous) byId.set(item.modelId, item)
  for (const item of incoming) byId.set(item.modelId, item)
  return Array.from(byId.values())
}

function ensureActiveCandidate() {
  if (activePickerMode.value !== 'all') {
    const shortcutItems = activeShortcutItems.value
    const availableShortcutItems = shortcutItems.filter((item) => item.available)
    if (availableShortcutItems.length === 0) {
      activeModelKey.value = ''
      return
    }
    if (activeModelKey.value && availableShortcutItems.some((item) => item.modelKey === activeModelKey.value)) return
    const selected = selectedModelId.value
    const selectedKey = selected ? pickerItemKey(selectedProviderId.value, selected) : ''
    const selectedExists = selected && availableShortcutItems.some((item) =>
      item.providerId === selectedProviderId.value && normalizeModelId(item.modelId) === selected
    )
    activeModelKey.value = selectedExists ? selectedKey : availableShortcutItems[0].modelKey
    return
  }
  if (pickerItems.value.length === 0) {
    activeModelKey.value = ''
    return
  }
  if (activeModelKey.value && pickerItems.value.some((item) => item.itemKey === activeModelKey.value)) return
  const selected = selectedModelId.value
  const selectedKey = selected ? pickerItemKey(selectedProviderId.value, selected) : ''
  const selectedExists = selected && pickerItems.value.some((item) =>
    item.providerId === selectedProviderId.value && normalizeModelId(item.modelId) === selected
  )
  activeModelKey.value = selectedExists ? selectedKey : ''
}

function ensureActiveVisible(index: number) {
  const el = listScrollRef.value
  if (!el || index < 0 || index >= pickerItems.value.length) return
  const top = getOffsetForIndex(index)
  const bottom = getOffsetForIndex(index + 1)
  if (top < el.scrollTop) {
    el.scrollTop = top
    return
  }
  const viewBottom = el.scrollTop + el.clientHeight
  if (bottom > viewBottom) {
    el.scrollTop = Math.max(0, bottom - el.clientHeight)
  }
}

type PickerUiSnapshot = Readonly<{
  activeModelKey: string
  scrollTop: number
}>

function capturePickerUiSnapshot(): PickerUiSnapshot {
  return {
    activeModelKey: activeModelKey.value,
    scrollTop: listScrollRef.value?.scrollTop ?? 0,
  }
}

async function restorePickerUiSnapshot(snapshot: PickerUiSnapshot) {
  await nextTick()
  const active = String(snapshot.activeModelKey ?? '').trim()
  if (active && pickerItems.value.some((item) => item.itemKey === active)) {
    activeModelKey.value = active
  } else if (selectedModelId.value && pickerItems.value.some((item) =>
    item.providerId === selectedProviderId.value && normalizeModelId(item.modelId) === selectedModelId.value
  )) {
    activeModelKey.value = pickerItemKey(selectedProviderId.value, selectedModelId.value)
  } else {
    activeModelKey.value = ''
  }
  await nextTick()
  refresh()
  if (listScrollRef.value) {
    listScrollRef.value.scrollTop = Math.max(0, snapshot.scrollTop)
  }
}

async function fetchPage(append: boolean, options: Readonly<{ preserveUiState?: boolean }> = {}) {
  const cursor = nextCursor.value
  if (append && !cursor) return

  const uiSnapshot = options.preserveUiState ? capturePickerUiSnapshot() : null
  const currentSeq = ++querySeq
  loading.value = true
  error.value = null
  if (!append) {
    queryNotice.value = null
  }

  try {
    const result = await resolveQueryFn()(buildQueryInput(append))
    if (currentSeq !== querySeq) return

    const incoming = Array.isArray(result.items) ? result.items : []
    items.value = append ? mergeItems(items.value, incoming) : [...incoming]
    nextCursor.value = result.nextCursor ?? null
    queryNotice.value = result.notice ?? null
    if (!append) {
      const revision = normalizeCatalogRevision(result.catalogRevision, result.modelCount, result.lastSyncAtMs)
      appliedCatalogRevision.value = revision
      latestCatalogRevision.value = revision ?? latestCatalogRevision.value
      pendingCatalogUpdateAvailable.value = false
      pendingCatalogRevision.value = null
    }
    ensureActiveCandidate()
    await nextTick()
    refresh()
    if (uiSnapshot) {
      await restorePickerUiSnapshot(uiSnapshot)
    }
  } catch (err: any) {
    if (currentSeq !== querySeq) return
    if (!append) {
      items.value = []
      nextCursor.value = null
      activeModelKey.value = ''
    }
    error.value = err?.message ? String(err.message) : 'Failed to query model catalog.'
  } finally {
    if (currentSeq === querySeq) {
      loading.value = false
    }
  }
}

async function fetchEndpointDetails(forceRefresh: boolean) {
  const modelId = String(activeDetailModelId.value ?? '').trim()
  const detailItem = activeDetailItem.value
  if (!props.open || !modelId || detailItem?.providerId !== DEFAULT_CHAT_PROVIDER_ID) {
    endpointDetails.value = null
    endpointLoading.value = false
    return
  }

  const currentSeq = ++endpointSeq
  endpointLoading.value = true
  try {
    const result = await resolveEndpointDetailFn()({
      providerKey: DEFAULT_CHAT_PROVIDER_ID,
      modelId,
      forceRefresh,
    })
    if (currentSeq !== endpointSeq) return
    endpointDetails.value = result
  } catch (err: any) {
    if (currentSeq !== endpointSeq) return
    endpointDetails.value = {
      providerKey: DEFAULT_CHAT_PROVIDER_ID,
      modelId,
      fetchedAtMs: null,
      source: 'scoped_catalog',
      items: [],
      error: err?.message ? String(err.message) : 'Failed to load endpoint details.',
    }
  } finally {
    if (currentSeq === endpointSeq) {
      endpointLoading.value = false
    }
  }
}

async function fetchModelDetail() {
  const modelId = String(activeDetailModelId.value ?? '').trim()
  const detailItem = activeDetailItem.value
  if (!props.open || !modelId || detailItem?.providerId !== DEFAULT_CHAT_PROVIDER_ID) {
    modelDetail.value = null
    modelDetailError.value = null
    modelDetailLoading.value = false
    return
  }
  const currentSeq = ++modelDetailSeq
  modelDetailLoading.value = true
  modelDetailError.value = null
  try {
    const result = await resolveModelDetailFn()({
      providerKey: DEFAULT_CHAT_PROVIDER_ID,
      modelId,
    })
    if (currentSeq !== modelDetailSeq) return
    modelDetail.value = result.item
    modelDetailError.value = result.error ?? null
  } catch (err: any) {
    if (currentSeq !== modelDetailSeq) return
    modelDetail.value = null
    modelDetailError.value = err?.message ? String(err.message) : 'Failed to load model detail.'
  } finally {
    if (currentSeq === modelDetailSeq) {
      modelDetailLoading.value = false
    }
  }
}

function onRefreshEndpointDetails() {
  void fetchEndpointDetails(true)
}

function setActiveDetailTab(tab: DetailTab) {
  if (activeDetailTab.value === tab) return
  activeDetailTab.value = tab
}

function openDialogState() {
  lastFocusBeforeOpen = document.activeElement instanceof HTMLElement ? document.activeElement : null
  skipAutoQuery = true
  items.value = []
  nextCursor.value = null
  activeModelKey.value = selectedModelId.value ? pickerItemKey(selectedProviderId.value, selectedModelId.value) : ''
  modelDetail.value = null
  modelDetailLoading.value = false
  modelDetailError.value = null
  endpointDetails.value = null
  endpointLoading.value = false
  activeDetailTab.value = 'model'
  activePickerMode.value = 'all'
  selectedProviderFilter.value = 'all'
  queryNotice.value = null
  error.value = null
  pendingCatalogUpdateAvailable.value = false
  pendingCatalogRevision.value = null
  appliedCatalogRevision.value = null
  latestCatalogRevision.value = null
  resetFavoriteEditorState()
  skipAutoQuery = false
  querySeq += 1
  scheduleRefresh(0)
  void nextTick(() => {
    searchInputRef.value?.focus()
    refresh()
  })
  void triggerPickerOpenSync()
}

async function triggerPickerOpenSync() {
  const now = Date.now()
  if (now - lastAutoSyncAtMs < AUTO_SYNC_COOLDOWN_MS) return
  lastAutoSyncAtMs = now
  await loadCatalogSyncSettings()
  await fetchSyncStatus()
  if (syncStatus.value === 'syncing') return
  if (!shouldSyncOnPickerOpen()) return
  await runSync(false, 'model_picker_opened')
}

async function applyLatestCatalogList() {
  pendingCatalogUpdateAvailable.value = false
  pendingCatalogRevision.value = null
  await fetchPage(false, { preserveUiState: true })
}

async function handleSyncedCatalogRevision(nextRevision: string | null, syncAttempted: boolean) {
  if (!props.open || !syncAttempted || !nextRevision) return
  latestCatalogRevision.value = nextRevision
  if (nextRevision === appliedCatalogRevision.value) {
    pendingCatalogUpdateAvailable.value = false
    pendingCatalogRevision.value = null
    return
  }
  if (catalogListUpdateMode.value === 'automatic') {
    await applyLatestCatalogList()
    return
  }
  pendingCatalogUpdateAvailable.value = true
  pendingCatalogRevision.value = nextRevision
}

async function runSync(force: boolean, reason: 'model_picker_opened' | 'manual_refresh' = force ? 'manual_refresh' : 'model_picker_opened') {
  const electronAPI = (globalThis as any).electronAPI
  if (!electronAPI?.modelCatalogSyncNow) {
    syncStatus.value = 'failed'
    syncErrorCode.value = 'unknown_error'
    syncErrorMessage.value = 'renderer_bridge'
    return
  }

  syncStatus.value = 'syncing'
  syncErrorCode.value = null
  syncErrorMessage.value = null

  try {
    const result = await electronAPI.modelCatalogSyncNow({
      providerKey: DEFAULT_CHAT_PROVIDER_ID,
      force,
      reason,
    })

    if (!result) {
      syncStatus.value = 'failed'
      syncErrorCode.value = 'unknown_error'
      syncErrorMessage.value = 'null_result'
      return
    }

    const attempted = result.syncAttempted === true
    const succeeded = result.ok === true

    if (succeeded) {
      const revision = normalizeCatalogRevision(result.catalogRevision, result.modelCount, result.lastSyncAtMs)
      syncStatus.value = 'synced'
      syncModelCount.value = result.modelCount ?? 0
      syncLastSyncedAtMs.value = result.lastSyncAtMs ?? Date.now()
      syncErrorCode.value = null
      syncErrorMessage.value = null
      syncIsStale.value = false
      latestCatalogRevision.value = revision
      await handleSyncedCatalogRevision(revision, attempted)
    } else if (!attempted) {
      // Defensive: IPC returned ok=false with syncAttempted=false.
      // Under current contract this should not fire (cache-fresh returns ok=true).
      // Preserve existing synced state from fetchSyncStatus.
      syncStatus.value = 'synced'
      syncModelCount.value = result.modelCount ?? 0
      if (result.lastSyncAtMs) syncLastSyncedAtMs.value = result.lastSyncAtMs
      syncIsStale.value = false
      latestCatalogRevision.value = normalizeCatalogRevision(result.catalogRevision, result.modelCount, result.lastSyncAtMs)
    } else {
      syncStatus.value = 'failed'
      syncErrorCode.value = result.errorCode ?? 'unknown_error'
      syncErrorMessage.value = result.errorMessage ?? null
      syncIsStale.value = true
    }
  } catch (err) {
    syncStatus.value = 'failed'
    syncErrorCode.value = 'unknown_error'
    syncErrorMessage.value = err instanceof Error ? err.name : String(err)
    syncIsStale.value = true
  }
}

async function fetchSyncStatus() {
  const electronAPI = (globalThis as any).electronAPI
  if (!electronAPI?.modelCatalogGetSyncStatus) return

  try {
    const status = await electronAPI.modelCatalogGetSyncStatus({ providerKey: DEFAULT_CHAT_PROVIDER_ID })
    if (!status) return

    const state = String(status.syncState ?? 'idle')
    if (state === 'syncing') {
      syncStatus.value = 'syncing'
    } else if (state === 'ok') {
      syncStatus.value = 'synced'
      syncModelCount.value = Number(status.modelCount ?? 0)
      syncLastSyncedAtMs.value = Number(status.lastSyncAtMs ?? 0)
      syncIsStale.value = status.isStale === true || isCatalogStatusStale({
        status: 'synced',
        lastSyncAtMs: syncLastSyncedAtMs.value,
        freshnessMs: catalogFreshnessMs.value,
      })
      latestCatalogRevision.value = normalizeCatalogRevision(status.catalogRevision, status.modelCount, status.lastSyncAtMs)
    } else if (state === 'error') {
      syncStatus.value = 'failed'
      syncErrorCode.value = status.lastErrorCode ?? 'unknown_error'
      syncErrorMessage.value = status.lastErrorMessage ?? null
      syncIsStale.value = true
      latestCatalogRevision.value = normalizeCatalogRevision(status.catalogRevision, status.modelCount, status.lastSyncAtMs)
    } else {
      syncStatus.value = 'not_synced'
      syncIsStale.value = true
      latestCatalogRevision.value = normalizeCatalogRevision(status.catalogRevision, status.modelCount, status.lastSyncAtMs)
    }
  } catch {
    // keep current state
  }
}

function onManualRefresh() {
  const now = Date.now()
  if (now - lastManualRefreshAtMs < MANUAL_REFRESH_COOLDOWN_MS) return
  lastManualRefreshAtMs = now
  void loadCatalogSyncSettings().then(() => runSync(true, 'manual_refresh'))
}

function onApplyCatalogUpdate() {
  void applyLatestCatalogList()
}

async function onExternalCatalogSynced() {
  if (!props.open) return
  await loadCatalogSyncSettings()
  await fetchSyncStatus()
  await handleSyncedCatalogRevision(latestCatalogRevision.value, true)
}

function restoreFocusAfterClose() {
  if (!lastFocusBeforeOpen) return
  lastFocusBeforeOpen.focus()
  lastFocusBeforeOpen = null
}

function onClose() {
  if (props.disabled) return
  resetFavoriteEditorState()
  emit('close')
}

function onSelectItem(item: PickerModelItem | null | undefined) {
  if (props.disabled || props.isRunning) return
  if (!item?.selectable) return
  emit('select', { providerId: item.providerId, modelId: item.modelId }, item.displayName)
  emit('close')
}

function onSelectModel(modelId: string, providerId: RuntimeProviderKey = DEFAULT_CHAT_PROVIDER_ID) {
  const normalized = String(modelId ?? '').trim()
  if (!normalized) return
  onSelectItem(pickerItems.value.find((item) => item.providerId === providerId && item.modelId === normalized))
}

function onToggleFavorite(item: PickerModelItem) {
  if (props.disabled || props.isRunning) return
  if (item.providerId !== DEFAULT_CHAT_PROVIDER_ID) return
  const normalized = String(item.modelId ?? '').trim()
  if (!normalized) return
  emit('toggleFavorite', normalized)
}

function findPickerItem(providerId: RuntimeProviderKey, modelId: string): PickerModelItem | null {
  const normalized = normalizeModelId(modelId)
  return pickerItems.value.find((candidate) => candidate.providerId === providerId && candidate.modelId === normalized) ?? null
}

function onToggleShortcutFavorite(item: ShortcutItem) {
  const pickerItem = findPickerItem(item.providerId, item.modelId)
  if (pickerItem) onToggleFavorite(pickerItem)
}

function isFavoriteModel(modelId: string, providerId: RuntimeProviderKey = DEFAULT_CHAT_PROVIDER_ID): boolean {
  const normalized = String(modelId ?? '').trim()
  if (!normalized) return false
  return favoriteModelKeySet.value.has(buildProviderModelKey({ providerId, modelId: normalized }))
}

function onRowRef(item: PickerModelItem, el: Element | null) {
  measureElement(item.itemKey, el as HTMLElement | null)
}

function onMoveActive(delta: 1 | -1) {
  if (pickerItems.value.length === 0) return
  const current = activeIndex.value >= 0 ? activeIndex.value : 0
  const next = Math.max(0, Math.min(pickerItems.value.length - 1, current + delta))
  activeModelKey.value = pickerItems.value[next].itemKey
  ensureActiveVisible(next)
}

function onDialogKeydown(ev: KeyboardEvent) {
  if (!props.open) return
  if (ev.key === 'Escape') {
    ev.preventDefault()
    onClose()
    return
  }

  const target = ev.target as HTMLElement | null
  const isTypingElement =
    !!target &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)

  if ((ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && !isTypingElement) {
    ev.preventDefault()
    onMoveActive(ev.key === 'ArrowDown' ? 1 : -1)
    return
  }

  if (ev.key === 'Enter' && !isTypingElement) {
    const active = activePickerMode.value === 'all'
      ? activeItem.value
      : (() => {
          const shortcut = activeShortcutItems.value.find((item) => item.modelKey === activeModelKey.value)
          return shortcut
            ? pickerItems.value.find((item) => item.providerId === shortcut.providerId && item.modelId === shortcut.modelId)
            : null
        })()
    if (!active) return
    ev.preventDefault()
    onSelectItem(active)
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      if (props.forceOutputImageOnly === true) {
        setOutputModalitiesFilter(['image'])
      }
      openDialogState()
      return
    }
    clearDebounceTimer()
    querySeq += 1
    modelDetailSeq += 1
    endpointSeq += 1
    loading.value = false
    modelDetailLoading.value = false
    modelDetail.value = null
    modelDetailError.value = null
    endpointLoading.value = false
    endpointDetails.value = null
    restoreFocusAfterClose()
  },
  { immediate: true },
)

watch(
  () => [props.open, props.forceOutputImageOnly] as const,
  ([open, forceOutputImageOnly]) => {
    if (!open || forceOutputImageOnly !== true) return
    const hasOnlyImage =
      selectedOutputModalities.value.length === 1 &&
      selectedOutputModalities.value[0] === 'image'
    if (!hasOnlyImage) {
      setOutputModalitiesFilter(['image'])
    }
  },
  { flush: 'post' },
)

watch(
  queryFilterSignature,
  () => {
    if (!props.open || skipAutoQuery) return
    scheduleRefresh(props.debounceMs)
  },
  { flush: 'post' },
)

watch(
  () => [props.selectedProviderId, props.selectedModelId] as const,
  ([providerId, next]) => {
    if (!props.open) return
    const normalized = normalizeModelId(next)
    if (!normalized) return
    const selectedKey = pickerItemKey(providerId ?? DEFAULT_CHAT_PROVIDER_ID, normalized)
    if (pickerItems.value.some((item) => item.itemKey === selectedKey)) {
      activeModelKey.value = selectedKey
    }
  },
)

watch(
  () => props.favoriteModelKeys,
  () => {
    if (favoriteEditMode.value) return
    editableFavoriteModelKeys.value = normalizeFavoriteModelKeys(props.favoriteModelKeys)
    if (props.open && activePickerMode.value === 'favorites') ensureActiveCandidate()
  },
  { deep: true },
)

watch(
  () => props.recentModelKeys,
  () => {
    if (props.open && activePickerMode.value === 'recents') ensureActiveCandidate()
  },
  { deep: true },
)

watch(
  items,
  () => {
    ensureActiveCandidate()
  },
  { flush: 'post' },
)

watch(
  () => (props.open ? activeDetailItem.value?.itemKey ?? '' : ''),
  (itemKey, prevItemKey) => {
    const modelId = activeDetailModelId.value
    if (!props.open || !modelId) {
      modelDetail.value = null
      modelDetailLoading.value = false
      modelDetailError.value = null
      endpointDetails.value = null
      endpointLoading.value = false
      return
    }
    if (itemKey === prevItemKey) return
    void fetchModelDetail()
    endpointSeq += 1
    endpointLoading.value = false
    endpointDetails.value = null
    if (activeDetailTab.value === 'endpoints') {
      void fetchEndpointDetails(false)
    }
  },
  { flush: 'post' },
)

watch(
  () => activeDetailTab.value,
  (tab) => {
    if (!props.open || tab !== 'endpoints') return
    const modelId = String(activeDetailItem.value?.modelId ?? '').trim()
    if (!modelId) return
    if (endpointDetails.value?.modelId === modelId) return
    void fetchEndpointDetails(false)
  },
)

onMounted(() => {
  const electronAPI = (globalThis as any).electronAPI
  if (electronAPI && typeof electronAPI.onModelCatalogSynced === 'function') {
    unsubscribeModelCatalogSynced = electronAPI.onModelCatalogSynced(() => {
      void onExternalCatalogSynced()
    })
  }
})

onBeforeUnmount(() => {
  clearDebounceTimer()
  modelDetailSeq += 1
  endpointSeq += 1
  if (unsubscribeModelCatalogSynced) {
    unsubscribeModelCatalogSynced()
    unsubscribeModelCatalogSynced = null
  }
})
</script>

<template>
  <div
    v-if="props.open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    data-testid="model-picker-dialog"
    @click.self="onClose"
    @keydown="onDialogKeydown"
  >
    <div class="flex h-[85vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
      <div class="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
        <div class="text-sm font-semibold text-gray-900">Model Picker</div>
        <button
          type="button"
          class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          :disabled="props.disabled"
          data-testid="model-picker-close"
          @click="onClose"
        >
          Close
        </button>
      </div>

      <div class="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside class="min-h-0 space-y-3 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3">
          <details open class="rounded-md border border-gray-200 bg-white px-3 py-2">
            <summary class="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Identity & Search
            </summary>
            <div class="mt-2 space-y-3">
              <div>
                <label class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Search</label>
                <input
                  ref="searchInputRef"
                  v-model="searchText"
                  type="text"
                  class="mt-1 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="Search model name or id..."
                  :disabled="props.disabled"
                  data-testid="model-picker-search"
                />
                <label class="mt-2 flex items-center gap-2 text-[11px] text-gray-600">
                  <input
                    v-model="includeDescriptionInSearch"
                    type="checkbox"
                    class="h-3.5 w-3.5 rounded border-gray-300"
                    :disabled="props.disabled"
                    data-testid="model-picker-include-description"
                  />
                  <span>including description</span>
                </label>
              </div>
              <div>
                <label class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Provider</label>
                <select
                  v-model="selectedProviderFilter"
                  class="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
                  :disabled="props.disabled"
                  data-testid="model-picker-provider-filter"
                >
                  <option value="all">All providers</option>
                  <option v-for="provider in providerOptions" :key="provider.providerId" :value="provider.providerId">
                    {{ `${provider.providerName} (${provider.count})` }}
                  </option>
                </select>
                <div class="mt-2 space-y-1">
                  <div
                    v-for="provider in providerOptions"
                    :key="`provider-status-${provider.providerId}`"
                    class="flex items-center justify-between gap-2 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-[11px]"
                    :data-testid="`model-picker-provider-status-${provider.providerId}`"
                  >
                    <span class="truncate font-medium text-gray-700">{{ provider.providerName }}</span>
                    <span :class="provider.loading ? 'text-blue-600' : provider.count > 0 ? 'text-green-700' : 'text-gray-500'">
                      {{ provider.loading ? 'loading' : provider.statusLabel }}
                    </span>
                  </div>
                </div>
              </div>
              <div>
                <label class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Category</label>
                <select
                  v-model="selectedCategory"
                  class="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
                  :disabled="props.disabled"
                  data-testid="model-picker-category"
                >
                  <option value="all">All categories</option>
                  <option v-for="category in categoryOptions" :key="category" :value="category">{{ category }}</option>
                </select>
              </div>
              <div>
                <div class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Vendor Prefix</div>
                <div v-if="vendorOptions.length === 0" class="mt-1 text-[11px] text-gray-400">
                  Vendor options will appear after data loads.
                </div>
                <div v-else class="mt-1 max-h-28 space-y-1 overflow-auto">
                  <label
                    v-for="vendor in vendorOptions"
                    :key="vendor"
                    class="flex items-center gap-2 text-[11px] text-gray-700"
                  >
                    <input
                      type="checkbox"
                      class="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      :checked="selectedVendors.includes(vendor)"
                      :disabled="props.disabled"
                      :data-testid="`model-picker-vendor-${vendor}`"
                      @change="toggleArrayValue(selectedVendors, vendor)"
                    />
                    <span class="truncate">{{ vendor }}</span>
                  </label>
                </div>
              </div>
            </div>
          </details>

          <details class="rounded-md border border-gray-200 bg-white px-3 py-2">
            <summary class="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Capability Limits
            </summary>
            <div class="mt-2 space-y-3">
              <div>
                <div class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Context Length</div>
                <div class="mt-1 grid grid-cols-2 gap-2">
                  <input
                    v-model="contextLengthMin"
                    type="number"
                    min="0"
                    class="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
                    placeholder="min"
                    :disabled="props.disabled"
                    data-testid="model-picker-context-min"
                  />
                  <input
                    v-model="contextLengthMax"
                    type="number"
                    min="0"
                    class="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
                    placeholder="max"
                    :disabled="props.disabled"
                    data-testid="model-picker-context-max"
                  />
                </div>
              </div>
              <div>
                <div class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Max Completion Tokens</div>
                <div class="mt-1 grid grid-cols-2 gap-2">
                  <input
                    v-model="maxOutputTokensMin"
                    type="number"
                    min="0"
                    class="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
                    placeholder="min"
                    :disabled="props.disabled"
                    data-testid="model-picker-max-output-min"
                  />
                  <input
                    v-model="maxOutputTokensMax"
                    type="number"
                    min="0"
                    class="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
                    placeholder="max"
                    :disabled="props.disabled"
                    data-testid="model-picker-max-output-max"
                  />
                </div>
              </div>
            </div>
          </details>

          <details class="rounded-md border border-gray-200 bg-white px-3 py-2">
            <summary class="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Modalities
            </summary>
            <div class="mt-2 space-y-3">
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="rounded border px-2 py-1 text-[11px] shadow-sm disabled:opacity-50"
                  :class="
                    selectedOutputModalities.length === 1 && selectedOutputModalities[0] === 'image'
                      ? 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  "
                  :disabled="props.disabled"
                  data-testid="model-picker-quick-image-output"
                  @click="toggleQuickImageOutputFilter"
                >
                  {{ selectedOutputModalities.length === 1 && selectedOutputModalities[0] === 'image' ? 'Image output only: ON' : 'Image output only: OFF' }}
                </button>
                <div class="text-[11px] text-gray-500">One-click filter for output modality `image`.</div>
              </div>
              <div>
                <div class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Architecture</div>
                <div class="mt-1 flex flex-wrap gap-2">
                  <label
                    v-for="option in architectureModalityOptions"
                    :key="option"
                    class="inline-flex items-center gap-1 rounded border border-gray-200 px-1.5 py-0.5 text-[11px] text-gray-700"
                  >
                    <input
                      type="checkbox"
                      class="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      :checked="selectedArchitectureModalities.includes(option)"
                      :disabled="props.disabled"
                      :data-testid="`model-picker-arch-${option}`"
                      @change="toggleArrayValue(selectedArchitectureModalities, option)"
                    />
                    <span>{{ option }}</span>
                  </label>
                </div>
              </div>
              <div>
                <div class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Input Modalities</div>
                <div class="mt-1 flex flex-wrap gap-2">
                  <label
                    v-for="option in modalityOptions"
                    :key="`input-${option}`"
                    class="inline-flex items-center gap-1 rounded border border-gray-200 px-1.5 py-0.5 text-[11px] text-gray-700"
                  >
                    <input
                      type="checkbox"
                      class="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      :checked="selectedInputModalities.includes(option)"
                      :disabled="props.disabled"
                      :data-testid="`model-picker-input-modality-${option}`"
                      @change="toggleArrayValue(selectedInputModalities, option)"
                    />
                    <span>{{ option }}</span>
                  </label>
                </div>
              </div>
              <div>
                <div class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Output Modalities</div>
                <div class="mt-1 flex flex-wrap gap-2">
                  <label
                    v-for="option in modalityOptions"
                    :key="`output-${option}`"
                    class="inline-flex items-center gap-1 rounded border border-gray-200 px-1.5 py-0.5 text-[11px] text-gray-700"
                  >
                    <input
                      type="checkbox"
                      class="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      :checked="selectedOutputModalities.includes(option)"
                      :disabled="props.disabled"
                      :data-testid="`model-picker-output-modality-${option}`"
                      @change="toggleArrayValue(selectedOutputModalities, option)"
                    />
                    <span>{{ option }}</span>
                  </label>
                </div>
              </div>
            </div>
          </details>

          <details class="rounded-md border border-gray-200 bg-white px-3 py-2">
            <summary class="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Features
            </summary>
            <div class="mt-2 space-y-3">
              <div>
                <div class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Supported Parameters</div>
                <div class="mt-1 max-h-28 space-y-1 overflow-auto">
                  <label
                    v-for="option in supportedParameterOptions"
                    :key="option"
                    class="flex items-center gap-2 text-[11px] text-gray-700"
                  >
                    <input
                      type="checkbox"
                      class="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      :checked="selectedSupportedParameters.includes(option)"
                      :disabled="props.disabled"
                      :data-testid="`model-picker-supported-${option}`"
                      @change="toggleArrayValue(selectedSupportedParameters, option)"
                    />
                    <span class="truncate">{{ option }}</span>
                  </label>
                </div>
              </div>
              <div>
                <label class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Tokenizer (CSV)</label>
                <input
                  v-model="tokenizerFiltersText"
                  type="text"
                  class="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
                  placeholder="gpt, sentencepiece"
                  :disabled="props.disabled"
                  data-testid="model-picker-tokenizers"
                />
              </div>
              <div>
                <label class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Instruct Type (CSV)</label>
                <input
                  v-model="instructTypeFiltersText"
                  type="text"
                  class="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
                  placeholder="chatml, json_schema"
                  :disabled="props.disabled"
                  data-testid="model-picker-instruct-types"
                />
              </div>
              <div class="grid grid-cols-1 gap-2">
                <label class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Per Request Limits</label>
                <select
                  v-model="hasPerRequestLimits"
                  class="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
                  :disabled="props.disabled"
                  data-testid="model-picker-per-request-limits"
                >
                  <option value="any">Any</option>
                  <option value="yes">Has limits</option>
                  <option value="no">No limits</option>
                </select>
                <label class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Default Parameters</label>
                <select
                  v-model="hasDefaultParameters"
                  class="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
                  :disabled="props.disabled"
                  data-testid="model-picker-default-parameters"
                >
                  <option value="any">Any</option>
                  <option value="yes">Has defaults</option>
                  <option value="no">No defaults</option>
                </select>
              </div>
            </div>
          </details>

          <details class="rounded-md border border-gray-200 bg-white px-3 py-2">
            <summary class="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Compliance & Lifecycle
            </summary>
            <div class="mt-2 space-y-3">
              <div>
                <label class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Moderation</label>
                <select
                  v-model="moderationFilter"
                  class="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
                  :disabled="props.disabled"
                  data-testid="model-picker-is-moderated"
                >
                  <option value="any">Any</option>
                  <option value="yes">Moderated</option>
                  <option value="no">Unmoderated</option>
                </select>
              </div>
              <label class="flex items-center gap-2 text-[11px] text-gray-700">
                <input
                  v-model="expiringWithinEnabled"
                  type="checkbox"
                  class="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  :disabled="props.disabled"
                  data-testid="model-picker-expiring-toggle"
                />
                <span>Only models expiring within days</span>
              </label>
              <input
                v-model="expiringWithinDays"
                type="number"
                min="0"
                class="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 disabled:bg-gray-100"
                placeholder="7"
                :disabled="props.disabled || !expiringWithinEnabled"
                data-testid="model-picker-expiring-days"
              />
            </div>
          </details>

          <details class="rounded-md border border-gray-200 bg-white px-3 py-2">
            <summary class="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-gray-500">Sort</summary>
            <div class="mt-2 grid grid-cols-2 gap-2">
              <select
                v-model="sortBy"
                class="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
                :disabled="props.disabled"
                data-testid="model-picker-sort-by"
              >
                <option v-for="option in sortByOptions" :key="option.key" :value="option.key">{{ option.label }}</option>
              </select>
              <select
                v-model="sortOrder"
                class="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
                :disabled="props.disabled"
                data-testid="model-picker-sort-order"
              >
                <option v-for="option in sortOrderOptions" :key="option.key" :value="option.key">{{ option.label }}</option>
              </select>
            </div>
          </details>

          <div class="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
            <div class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Current</div>
            <div class="mt-1 break-all font-medium text-gray-900">{{ selectedModelLabel }}</div>
            <div v-if="effectiveNotice" class="mt-2 text-[11px] text-gray-500">{{ effectiveNotice }}</div>
            <div v-if="error" class="mt-2 text-[11px] text-red-600">{{ error }}</div>
          </div>

          <div class="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
            <div class="flex items-center justify-between gap-2">
              <div class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Favorites Order</div>
              <div class="flex items-center gap-2">
                <button
                  v-if="!favoriteEditMode"
                  type="button"
                  class="rounded border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  :disabled="props.disabled || props.isRunning || normalizedFavoriteModelKeys.length === 0"
                  data-testid="model-picker-favorites-edit"
                  @click="openFavoriteEditMode"
                >
                  Edit
                </button>
                <template v-else>
                  <button
                    type="button"
                    class="rounded border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    :disabled="props.disabled || props.isRunning"
                    data-testid="model-picker-favorites-cancel"
                    @click="cancelFavoriteEditMode"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    class="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                    :disabled="props.disabled || props.isRunning"
                    data-testid="model-picker-favorites-done"
                    @click="saveFavoriteOrder"
                  >
                    Done
                  </button>
                </template>
              </div>
            </div>
            <div v-if="normalizedFavoriteModelKeys.length === 0" class="mt-2 text-[11px] text-gray-400">
              No favorites yet.
            </div>
            <div v-else-if="!favoriteEditMode" class="mt-2 space-y-1">
              <div
                v-for="modelKey in normalizedFavoriteModelKeys"
                :key="`favorite-preview-${modelKey}`"
                class="truncate rounded border border-gray-200 px-2 py-1 text-[11px] text-gray-700"
              >
                {{ resolveFavoriteName(modelKey) }}
              </div>
            </div>
            <div v-else class="mt-2 space-y-2" data-testid="model-picker-favorites-editor">
              <div
                v-for="(modelKey, index) in editableFavoriteModelKeys"
                :key="`favorite-edit-${modelKey}`"
                class="relative flex items-center gap-2 rounded border border-gray-200 px-2 py-1"
                draggable="true"
                :data-testid="`model-picker-favorites-card-${index}`"
                @dragstart="onFavoriteDragStart(index, $event)"
                @dragover="onFavoriteDragOver($event)"
                @drop="onFavoriteDrop(index, $event)"
                @dragend="onFavoriteDragEnd"
              >
                <div
                  class="pointer-events-none absolute left-0 top-1/2 z-10 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-[10px] text-gray-400"
                  aria-hidden="true"
                >
                  ::
                </div>
                <div class="min-w-0 flex-1 whitespace-normal break-words text-[11px] leading-tight text-gray-800">
                  {{ resolveFavoriteName(modelKey) }}
                </div>
                <button
                  type="button"
                  class="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded border border-gray-200 bg-white text-sm leading-none text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                  :disabled="props.disabled || props.isRunning"
                  :data-testid="`model-picker-favorites-remove-${index}`"
                  @click="removeEditableFavorite(index)"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        </aside>

        <section class="min-h-0 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div class="grid h-full max-h-[60vh] grid-cols-1 gap-0 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div class="flex min-h-0 flex-col border-b border-gray-200 xl:border-b-0 xl:border-r xl:border-gray-200">
              <div
                ref="listScrollRef"
                class="h-[60vh] overflow-auto px-2 py-2 xl:h-auto xl:flex-1"
                data-testid="model-picker-list"
              >
                <template v-if="activePickerMode === 'all'">
                  <div v-if="loading && pickerItems.length === 0" class="px-2 py-4 text-sm text-gray-500">Loading models...</div>
                  <div v-else-if="!loading && pickerItems.length === 0" class="px-2 py-4 text-sm text-gray-500">
                    No models found for current search/filter.
                  </div>
                  <template v-else>
                    <div :style="{ height: `${topPaddingPx}px` }" />
                    <button
                      v-for="item in visibleItems"
                      :key="item.itemKey"
                      type="button"
                      class="mb-2 w-full rounded-lg border px-3 py-2 text-left shadow-sm transition"
                      :class="
                        isSelectedItem(item)
                          ? 'border-blue-300 bg-blue-50'
                          : 'border-gray-200 bg-white hover:bg-gray-50'
                      "
                      :data-testid="item.providerId === DEFAULT_CHAT_PROVIDER_ID ? `model-picker-item-${item.modelId}` : `model-picker-item-${item.providerId}-${item.modelId}`"
                      :disabled="props.disabled || props.isRunning || !item.selectable"
                      @mouseenter="activeModelKey = item.itemKey"
                      @focus="activeModelKey = item.itemKey"
                      @click="onSelectItem(item)"
                      :ref="(el) => onRowRef(item, el as Element | null)"
                    >
                      <div class="flex items-center justify-between gap-2">
                        <div class="min-w-0">
                          <div class="truncate text-sm font-semibold text-gray-900">{{ item.displayName }}</div>
                          <div class="truncate text-[11px] text-gray-500">{{ `${item.providerName} · ${item.modelId}` }}</div>
                        </div>
                        <div class="flex shrink-0 items-center gap-2">
                          <button
                            v-if="item.providerId === DEFAULT_CHAT_PROVIDER_ID"
                            type="button"
                            class="rounded border px-1.5 py-0.5 text-[11px] leading-none"
                            :class="
                              isFavoriteModel(item.modelId, item.providerId)
                                ? 'border-amber-300 bg-amber-50 text-amber-700'
                                : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-100'
                            "
                            :disabled="props.disabled || props.isRunning"
                            :data-testid="`model-picker-favorite-${item.modelId}`"
                            @click.stop="onToggleFavorite(item)"
                          >
                            {{ isFavoriteModel(item.modelId, item.providerId) ? '★' : '☆' }}
                          </button>
                          <div class="text-[11px] uppercase tracking-wide text-gray-500">
                            {{ item.providerName }}
                          </div>
                        </div>
                      </div>
                      <div v-if="item.description" class="mt-1 text-[11px] text-gray-600">
                        {{ item.description }}
                      </div>
                      <div class="mt-1 flex flex-wrap gap-1 text-[10px] text-gray-600">
                        <span class="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-blue-700">
                          {{ item.statusLabel }}
                        </span>
                        <span class="rounded border border-gray-200 px-1.5 py-0.5">
                          {{ item.sourceLabel }}
                        </span>
                        <span v-if="item.capabilitySummary" class="rounded border border-gray-200 px-1.5 py-0.5">
                          {{ item.capabilitySummary }}
                        </span>
                        <span v-if="hasImageGenerationSignal(item)" class="rounded border border-green-200 bg-green-50 px-1.5 py-0.5 text-green-700">
                          image_gen
                        </span>
                        <span v-if="item.capabilities.reasoning" class="rounded border border-gray-200 px-1.5 py-0.5">reasoning</span>
                        <span v-if="item.capabilities.tools" class="rounded border border-gray-200 px-1.5 py-0.5">tools</span>
                        <span v-if="item.capabilities.vision" class="rounded border border-gray-200 px-1.5 py-0.5">vision</span>
                        <span v-if="item.capabilities.longContext" class="rounded border border-gray-200 px-1.5 py-0.5">long_context</span>
                      </div>
                    </button>
                    <div :style="{ height: `${bottomPaddingPx}px` }" />
                  </template>
                </template>
                <template v-else>
                  <div v-if="activeShortcutItems.length === 0" class="px-2 py-4 text-sm text-gray-500">
                    {{ activePickerMode === 'favorites' ? 'No favorite models yet.' : 'No recent models in this session yet.' }}
                  </div>
                  <template v-else>
                    <button
                      v-for="item in activeShortcutItems"
                      :key="`${activePickerMode}-${item.modelKey}`"
                      type="button"
                      class="mb-2 w-full rounded-lg border px-3 py-2 text-left shadow-sm transition"
                      :class="
                        !item.available
                          ? 'border-gray-200 bg-gray-50 text-gray-400 opacity-70'
                          : isSelectedModel(item.modelId, item.providerId)
                          ? 'border-blue-300 bg-blue-50'
                          : 'border-gray-200 bg-white hover:bg-gray-50'
                      "
                      :data-testid="`model-picker-${activePickerMode}-item-${item.modelId}`"
                      :disabled="props.disabled || props.isRunning || !item.available"
                      @mouseenter="activeModelKey = item.modelKey"
                      @focus="activeModelKey = item.modelKey"
                      @click="onSelectModel(item.modelId, item.providerId)"
                    >
                      <div class="flex items-center justify-between gap-2">
                        <div class="min-w-0">
                          <div class="truncate text-sm font-semibold text-gray-900">{{ item.name }}</div>
                          <div class="truncate text-[11px] text-gray-500">{{ item.modelId }}</div>
                        </div>
                        <button
                          v-if="item.providerId === DEFAULT_CHAT_PROVIDER_ID"
                          type="button"
                          class="rounded border px-1.5 py-0.5 text-[11px] leading-none"
                          :class="
                              isFavoriteModel(item.modelId, item.providerId)
                                ? 'border-amber-300 bg-amber-50 text-amber-700'
                                : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-100'
                            "
                          :disabled="props.disabled || props.isRunning"
                          :data-testid="`model-picker-favorite-${item.modelId}`"
                          @click.stop="onToggleShortcutFavorite(item)"
                        >
                          {{ isFavoriteModel(item.modelId, item.providerId) ? '★' : '☆' }}
                        </button>
                      </div>
                    </button>
                  </template>
                </template>
              </div>

              <div class="flex items-center justify-between border-t border-gray-200 px-3 py-2 text-[11px] text-gray-500">
                <div>
                  {{ activePickerMode === 'all' ? `${pickerItems.length} result${pickerItems.length === 1 ? '' : 's'}` : `${activeShortcutItems.length} model${activeShortcutItems.length === 1 ? '' : 's'}` }}
                </div>
                <button
                  v-if="activePickerMode === 'all'"
                  type="button"
                  class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  :disabled="!canLoadMore"
                  data-testid="model-picker-load-more"
                  @click="fetchPage(true)"
                >
                  {{ loading ? 'Loading...' : 'Load more' }}
                </button>
              </div>
            </div>

            <div class="flex h-full max-h-[60vh] flex-col gap-2 overflow-auto p-2">
              <div class="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-1 text-[11px]">
                <button
                  type="button"
                  class="rounded px-2 py-1"
                  :class="
                    activeDetailTab === 'model'
                      ? 'bg-white font-semibold text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:bg-white/60'
                  "
                  data-testid="model-picker-detail-tab-model"
                  @click="setActiveDetailTab('model')"
                >
                  Model
                </button>
                <button
                  type="button"
                  class="rounded px-2 py-1"
                  :class="
                    activeDetailTab === 'endpoints'
                      ? 'bg-white font-semibold text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:bg-white/60'
                  "
                  data-testid="model-picker-detail-tab-endpoints"
                  @click="setActiveDetailTab('endpoints')"
                >
                  Endpoints
                </button>
              </div>

              <div
                v-if="activeDetailTab === 'model' && activeDetailItem && activeDetailItem.providerId !== DEFAULT_CHAT_PROVIDER_ID"
                class="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700"
                data-testid="model-picker-provider-detail"
              >
                <div class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Provider Model</div>
                <div class="mt-2 text-sm font-semibold text-gray-900">{{ activeDetailItem.displayName }}</div>
                <div class="mt-1 break-all text-[11px] text-gray-500">{{ `${activeDetailItem.providerName} · ${activeDetailItem.modelId}` }}</div>
                <div class="mt-3 grid gap-2">
                  <div class="rounded border border-gray-200 bg-white px-2 py-1">
                    <div class="text-[10px] uppercase tracking-wide text-gray-400">Status</div>
                    <div>{{ activeDetailItem.statusLabel }}</div>
                  </div>
                  <div class="rounded border border-gray-200 bg-white px-2 py-1">
                    <div class="text-[10px] uppercase tracking-wide text-gray-400">Capabilities</div>
                    <div>{{ activeDetailItem.capabilitySummary ?? 'capability unknown' }}</div>
                  </div>
                  <div class="rounded border border-gray-200 bg-white px-2 py-1">
                    <div class="text-[10px] uppercase tracking-wide text-gray-400">Source</div>
                    <div>{{ activeDetailItem.sourceLabel ?? 'provider source' }}</div>
                  </div>
                </div>
              </div>
              <ModelDetailPanel
                v-else-if="activeDetailTab === 'model'"
                :modelId="activeDetailModelId"
                :loading="modelDetailLoading"
                :detail="modelDetail"
                :error="modelDetailError"
                :disabled="props.disabled || !activeDetailModelId"
              />
              <EndpointDetailPanel
                v-else
                :modelId="activeDetailModelId"
                :loading="endpointLoading"
                :fetchedAtMs="endpointFetchedAtMs"
                :items="endpointItems"
                :error="endpointError"
                :disabled="props.disabled || !activeDetailModelId || activeDetailItem?.providerId !== DEFAULT_CHAT_PROVIDER_ID"
                @refresh="onRefreshEndpointDetails"
              />
            </div>
          </div>
        </section>
      </div>

      <div class="flex items-center justify-between border-t border-gray-200 px-4 py-2 text-[11px]">
        <div class="flex items-center gap-2">
          <template v-if="pendingCatalogUpdateAvailable">
            <span class="text-blue-700" data-testid="model-picker-update-available">
              {{ t('errors.modelCatalog.updateAvailable') }}
            </span>
            <button
              type="button"
              class="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              :disabled="props.disabled || loading"
              data-testid="model-picker-apply-update"
              @click="onApplyCatalogUpdate"
            >
              {{ t('errors.modelCatalog.applyUpdate') }}
            </button>
          </template>
          <span v-if="syncStatus === 'not_synced'" class="text-gray-400">
            {{ t('errors.modelCatalog.syncNotSynced') }}
          </span>
          <span v-else-if="syncStatus === 'syncing'" class="text-blue-600">
            {{ t('errors.modelCatalog.syncSyncing') }}
          </span>
          <span v-else-if="syncStatus === 'synced'" class="text-green-700">
            {{ tf('errors.modelCatalog.synced', { count: syncModelCount, time: formatSyncTime(syncLastSyncedAtMs) }) }}
          </span>
          <span v-else-if="syncStatus === 'failed'" class="text-red-600">
            {{ tf('errors.modelCatalog.syncFailedReason', { reason: syncFailureReasonText }) }}
          </span>
        </div>
        <button
          type="button"
          class="rounded border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          :disabled="syncStatus === 'syncing' || props.disabled"
          data-testid="model-picker-sync-refresh"
          @click="onManualRefresh"
        >
          {{ syncStatus === 'syncing' ? '…' : '↻' }}
        </button>
      </div>
    </div>
  </div>
</template>
