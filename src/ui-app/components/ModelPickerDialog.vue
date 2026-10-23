<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { t, tf } from '@/shared/i18n'
import {
  CatalogQueryService,
  type CatalogQueryInput,
  type CatalogQueryCursor,
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
import { OPENROUTER_MODEL_CATEGORIES, type OpenRouterModelCategory } from '@/next/modelCatalog/openRouterCategoryCache'
import { useVirtualWindow } from '@/ui-kit/chat/useVirtualWindow'
import UiIcon from '@/ui-kit/icons/UiIcon.vue'
import EndpointDetailPanel from './EndpointDetailPanel.vue'
import ModelDetailPanel from './ModelDetailPanel.vue'
import ProviderFailureDetailsV2 from './ProviderFailureDetailsV2.vue'
import {
  isCatalogStatusStale,
} from '@/shared/modelCatalog/catalogSyncSettings'
import {
  isProviderCatalogSourceKey,
  listProviderCatalogSourceDescriptors,
} from '@/shared/modelCatalog/providerCatalogRegistry'
import type { ProviderCatalogKnownProviderKey } from '@/shared/modelCatalog/providerCatalogContracts'
import {
  catalogProviderKeyForRuntimeProvider,
  runtimeProviderIdForCatalogProvider,
} from '@/shared/provider/catalogRuntimeProviderAuthority'
import { GLOBAL_CATALOG_POLICY_V2_STORE_KEY, providerCatalogPolicyV2StoreKey } from '@/shared/modelCatalog/catalogPolicyResolverV2'
import {
  resolveCatalogPolicyV2,
  type ResolvedCatalogPolicyV2,
} from '@/shared/modelCatalog/catalogPolicyV2'
import {
  OPENROUTER_PROVIDER_ID,
  DEFAULT_OPENROUTER_MODEL_ID,
  buildProviderModelKey,
} from '@/next/provider/modelSelection'
import {
  modelFactsSubjectForCatalogModelV1,
  modelFactsSubjectForCompatibleModelV1,
} from '@/core/generation-v2/model-facts/modelFactsSubjectIdentityV1'
import type { CanonicalModelSubjectV1 } from '@/core/generation-v2/model-facts/canonicalSourceFactsV1'
import { isRuntimeProviderId, type RuntimeProviderId } from '@/next/provider/runtimeProviderId'
import {
  createProviderModelRouteSelection,
  type ConversationRouteSelection,
} from '@/next/provider/conversationRouteSelection'
import type { ProviderModelPickerItem, ProviderModelPickerSource } from '../app/providerModelPickerViewModel'
import type { CompatibleRouteIntent, CompatibleRoutePickerSource } from '@/next/provider/openai-chat-compatible/ui'
import type { ProviderFailureV2 } from '@/shared/provider/providerFailureV2'
import {
  CatalogRuntimeStoreV2,
  catalogModelSelectionCommandV2ForApp,
  catalogRuntimeStoreV2ForApp,
  type CatalogModelSelectionCommandV2,
} from '@/next/modelCatalog/catalogRuntimeStoreV2'

type TriState = 'any' | 'yes' | 'no'
type DetailTab = 'model' | 'endpoints'
type PickerMode = 'all' | 'favorites' | 'recents'
type ProviderFilterOption = Readonly<{
  providerId: RuntimeProviderId
  providerName: string
  statusLabel: string
  loading: boolean
  count: number
}>
type SyncProviderOption = ProviderFilterOption & Readonly<{ catalogProviderKey: ProviderCatalogKnownProviderKey }>
type PickerModelItem = CatalogQueryItem & Readonly<{
  providerId: RuntimeProviderId
  providerName: string
  itemKey: string
  statusLabel?: string
  sourceLabel?: string
  selectable: boolean
  detailSource: 'openrouter_catalog' | 'provider_catalog' | 'provider_source'
}>
type ShortcutItem = Readonly<{ modelKey: string; providerId: RuntimeProviderId; modelId: string; name: string; available: boolean }>

type QueryFn = (input: CatalogQueryInput) => Promise<CatalogQueryResult>
type EndpointDetailFn = (input: GetModelEndpointDetailsInput) => Promise<ModelEndpointDetailsResult>
type ModelDetailFn = (input: GetModelCatalogModelDetailInput) => Promise<ModelCatalogModelDetailResult>

const props = withDefaults(
  defineProps<{
    open: boolean
    disabled?: boolean
    isRunning?: boolean
    routeSelection?: ConversationRouteSelection | null
    providerSources?: readonly ProviderModelPickerSource[]
    compatibleRouteSources?: readonly CompatibleRoutePickerSource[]
    favoriteModelKeys?: readonly string[]
    favoriteEditableModelKeys?: readonly string[] | null
    recentModelKeys?: readonly string[]
    notice?: string | null
    debounceMs?: number
    queryFn?: QueryFn
    endpointDetailFn?: EndpointDetailFn
    modelDetailFn?: ModelDetailFn
    selectionCommand?: CatalogModelSelectionCommandV2
  }>(),
  {
    disabled: false,
    isRunning: false,
    favoriteModelKeys: () => [],
    recentModelKeys: () => [],
    providerSources: () => [],
    compatibleRouteSources: () => [],
    notice: null,
    debounceMs: 250,
    queryFn: undefined,
    endpointDetailFn: undefined,
    modelDetailFn: undefined,
    selectionCommand: undefined,
    routeSelection: null,
  },
)

const emit = defineEmits<{
  close: []
  select: [selection: ConversationRouteSelection, displayName: string]
  inspectModelFacts: [subject: CanonicalModelSubjectV1]
  toggleFavorite: [providerId: RuntimeProviderId, modelId: string]
  reorderFavorites: [orderedModelKeys: string[]]
}>()

const searchInputRef = ref<HTMLInputElement | null>(null)
const listScrollRef = ref<HTMLElement | null>(null)
const searchText = ref('')
const includeDescriptionInSearch = ref(false)
const selectedProviderFilters = ref<RuntimeProviderId[]>([])
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
const selectionPending = ref(false)
const hydratingProviderKeys = ref<ReadonlySet<ProviderCatalogKnownProviderKey>>(new Set())
const error = ref<string | null>(null)
const queryNotice = ref<string | null>(null)
const stateReconciliationNotice = ref<string | null>(null)
const items = ref<CatalogQueryItem[]>([])
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
type ProviderSyncSnapshot = Readonly<{
  status: SyncStatus
  totalModelCount: number
  visibleModelCount: number | null
  hiddenModelCount: number | null
  lastSyncedAtMs: number | null
  errorCode: string | null
  errorMessage: string | null
  providerFailure: ProviderFailureV2 | null
  isStale: boolean
  freshnessMs: number | null
  catalogRevision: string | null
}>
type ProviderCatalogPolicySnapshot = ResolvedCatalogPolicyV2
const appIdentity = getCurrentInstance()?.appContext.app ?? null
const catalogRuntimeStore = appIdentity === null
  ? new CatalogRuntimeStoreV2<CatalogQueryItem>()
  : catalogRuntimeStoreV2ForApp<CatalogQueryItem>(appIdentity)
const catalogRuntimeStates = ref(catalogRuntimeStore.snapshot())
const unsubscribeCatalogRuntimeStore = catalogRuntimeStore.subscribe(() => {
  catalogRuntimeStates.value = catalogRuntimeStore.snapshot()
})
const providerSyncSnapshots = ref<Partial<Record<string, ProviderSyncSnapshot>>>({})
const OPENROUTER_CATALOG_PROVIDER_KEY = catalogProviderKeyForRuntimeProvider(OPENROUTER_PROVIDER_ID)
if (OPENROUTER_CATALOG_PROVIDER_KEY === null) throw new Error('OPENROUTER_CATALOG_PROVIDER_AUTHORITY_MISSING')
const selectedSyncProviderKey = ref<ProviderCatalogKnownProviderKey>(OPENROUTER_CATALOG_PROVIDER_KEY)
const lastAutoSyncAtMsByScope = new Map<string, number>()
const lastManualRefreshAtMsByScope = new Map<string, number>()
const AUTO_SYNC_COOLDOWN_MS = 10_000
const MANUAL_REFRESH_COOLDOWN_MS = 3_000
const FULL_LOAD_PAGE_LIMIT = 100
const FULL_LOAD_MAX_PAGES_PER_PROVIDER = 100

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
const effectiveSupportedParameterOptions = computed(() => Array.from(new Set<string>([
  ...supportedParameterOptions,
  ...selectedSupportedParameters.value,
])))
const categoryOptions = OPENROUTER_MODEL_CATEGORIES
const catalogSourceDescriptors = listProviderCatalogSourceDescriptors()
const catalogProviderNames = Object.freeze(Object.fromEntries(
  catalogSourceDescriptors.map((descriptor) => [descriptor.providerKey, descriptor.displayName]),
)) as Readonly<Record<ProviderCatalogKnownProviderKey, string>>

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let querySeq = 0
// R4-08 (P6a-07): a fetch owns only the providers it started last. A single-provider refresh used to bump one
// shared sequence and so discarded the results of a still-running all-provider fetch.
const providerFetchSeq = new Map<ProviderCatalogKnownProviderKey, number>()
let pendingFetches = 0
let modelDetailSeq = 0
let endpointSeq = 0
let skipAutoQuery = false
let lastFocusBeforeOpen: HTMLElement | null = null
let providerFiltersInitialized = false
let dialogWasOpen = false

const catalogProviderKeys = computed<ProviderCatalogKnownProviderKey[]>(() => {
  const keys = new Set<ProviderCatalogKnownProviderKey>([
    OPENROUTER_CATALOG_PROVIDER_KEY,
  ])
  for (const source of props.providerSources) {
    const providerKey = catalogProviderKeyForRuntimeProvider(source.providerId)
    if (providerKey !== null) keys.add(providerKey)
  }
  return [...keys]
})
const sortByOptions = computed<ReadonlyArray<Readonly<{ key: CatalogQuerySortBy; label: string }>>>(() => [
  { key: 'name', label: t('errors.modelCatalog.sortName') },
  { key: 'created_at', label: t('errors.modelCatalog.sortCreatedAt') },
  { key: 'context_length', label: t('errors.modelCatalog.sortContextLength') },
  { key: 'max_output_tokens', label: t('errors.modelCatalog.sortMaxOutputTokens') },
])
const sortOrderOptions = computed<ReadonlyArray<Readonly<{ key: CatalogQuerySortOrder; label: string }>>>(() => [
  { key: 'asc', label: t('errors.modelCatalog.sortAsc') },
  { key: 'desc', label: t('errors.modelCatalog.sortDesc') },
])
const catalogPickerItems = computed(() => items.value
  .map((item) => toCatalogPickerItem(item))
  .filter((item): item is PickerModelItem => item !== null))
const providerPickerItems = computed(() => props.providerSources.flatMap((source) => source.items.map((item) => toProviderPickerItem(item))))
const unfilteredPickerItems = computed(() => {
  const catalogProvidersWithItems = new Set(
    items.value.map((item) => {
      const providerKey = catalogProviderKeyFromItem(item)
      return providerKey === null ? null : runtimeProviderIdForCatalogProvider(providerKey)
    }),
  )
  return [
    ...catalogPickerItems.value,
    ...providerPickerItems.value.filter((item) => !catalogProvidersWithItems.has(item.providerId)),
  ]
})
const selectedProviderSet = computed(() => new Set(selectedProviderFilters.value))
const selectedCatalogProviderKeys = computed<ProviderCatalogKnownProviderKey[]>(() =>
  catalogProviderKeys.value.filter((providerKey) =>
    selectedProviderSet.value.has(runtimeProviderIdForCatalogProvider(providerKey)))
)
const pickerItems = computed(() => {
  const providerFilter = selectedProviderSet.value
  const text = searchText.value.trim().toLowerCase()
  return unfilteredPickerItems.value.filter((item) => {
    if (!providerFilter.has(item.providerId)) return false
    if (item.detailSource === 'openrouter_catalog' || item.detailSource === 'provider_catalog') return true
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
const shownCountByProvider = computed(() => {
  const counts = new Map<RuntimeProviderId, number>()
  for (const item of pickerItems.value) {
    counts.set(item.providerId, (counts.get(item.providerId) ?? 0) + 1)
  }
  return counts
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
const lastKnownModelLabels = new Map<string, string>()

const selectedProvider = computed(() => props.routeSelection?.kind === 'provider_model'
  ? props.routeSelection.providerId : null)
const selectedModelIdentity = computed(() => normalizeModelId(props.routeSelection?.kind === 'provider_model'
  ? props.routeSelection.modelId : props.routeSelection?.modelId))

const selectedModelLabel = computed(() => {
  const selected = selectedModelIdentity.value
  const route = props.routeSelection
  if (route?.kind === 'openai_chat_compatible') {
    const source = props.compatibleRouteSources.find((item) => item.providerInstanceId === route.providerInstanceId)
    const model = source?.models.find((item) => item.modelId === selected)
    return `${source?.providerName ?? route.providerInstanceId} · ${model?.displayName ?? selected}`
  }
  if (!selectedProvider.value) return t('chat.console.runtime.noProviderSelected')
  const inResults = unfilteredPickerItems.value.find((item) =>
    item.providerId === selectedProvider.value && normalizeModelId(item.modelId) === selected
  )
  const selectedKey = selectedProvider.value && selected
    ? pickerItemKey(selectedProvider.value, selected)
    : ''
  const label = inResults?.displayName
    ?? (selectedKey ? lastKnownModelLabels.get(selectedKey) : null)
    ?? (selected || DEFAULT_OPENROUTER_MODEL_ID)
  return selectedProvider.value === OPENROUTER_PROVIDER_ID
    ? label
    : `${providerNameForId(selectedProvider.value)} · ${label}`
})

const effectiveNotice = computed(() => {
  const noticeParts = [stateReconciliationNotice.value, queryNotice.value]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
  return noticeParts.length > 0 ? noticeParts.join(' ') : null
})

const endpointItems = computed(() => endpointDetails.value?.items ?? [])
const endpointFetchedAtMs = computed(() => endpointDetails.value?.fetchedAtMs ?? null)
const endpointError = computed(() => endpointDetails.value?.error ?? null)
const favoriteModelKeySet = computed(() => new Set(props.favoriteModelKeys.map((value) => String(value ?? '').trim()).filter(Boolean)))
const normalizedFavoriteModelKeys = computed(() => normalizeFavoriteModelKeys(props.favoriteModelKeys))
const normalizedEditableFavoriteModelKeys = computed(() => normalizeFavoriteModelKeys(
  props.favoriteEditableModelKeys ?? props.favoriteModelKeys,
))
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
  const selected = selectedModelIdentity.value
  if (!selected) return null
  return pickerItems.value.find((item) =>
    item.providerId === selectedProvider.value && normalizeModelId(item.modelId) === selected
  ) ?? null
})
const favoriteOrderDirty = computed(() => {
  const next = editableFavoriteModelKeys.value
  const base = normalizedEditableFavoriteModelKeys.value
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
    selectedVendors: [...selectedVendors.value].sort(),
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

const selectedSyncSnapshot = computed(() => getProviderSyncSnapshot(selectedSyncProviderKey.value))
const pendingCatalogUpdateIsEmpty = computed(() => getCatalogRuntimeState(
  selectedSyncProviderKey.value,
  categoryForProvider(selectedSyncProviderKey.value),
).pendingEmpty)
const pendingCatalogUpdateAvailable = computed(() =>
  Boolean(getCatalogRuntimeState(
    selectedSyncProviderKey.value,
    categoryForProvider(selectedSyncProviderKey.value),
  ).pendingSnapshotDigest)
)

const providerOptions = computed<ProviderFilterOption[]>(() => {
  const options = new Map<RuntimeProviderId, ProviderFilterOption>()
  for (const descriptor of catalogSourceDescriptors.filter((candidate) =>
    isProviderCatalogSourceKey(candidate.providerKey) &&
    catalogProviderKeys.value.includes(candidate.providerKey)
  )) {
    if (!isProviderCatalogSourceKey(descriptor.providerKey)) continue
    const providerKey = descriptor.providerKey
    const providerId = runtimeProviderIdForCatalogProvider(providerKey)
    const snapshot = getProviderSyncSnapshot(providerKey)
    const catalogItemCount = items.value.filter((item) => catalogProviderKeyFromItem(item) === providerKey).length
    const knownCount = snapshot?.visibleModelCount ?? snapshot?.totalModelCount ?? 0
    options.set(providerId, {
      providerId,
      providerName: descriptor.displayName,
      statusLabel: formatProviderOptionStatus({
        providerId,
        fallbackStatusLabel: snapshot?.status ?? 'not_synced',
        fallbackItemCount: catalogItemCount,
        sourceItemCount: 0,
      }),
      loading: hydratingProviderKeys.value.has(providerKey) || snapshot?.status === 'syncing',
      count: knownCount > 0 ? knownCount : catalogItemCount,
    })
  }
  for (const source of props.providerSources) {
    const catalogProviderKey = catalogProviderKeyForRuntimeProvider(source.providerId)
    const snapshot = catalogProviderKey !== null
      ? getProviderSyncSnapshot(catalogProviderKey)
      : null
    const catalogCount = snapshot?.status === 'synced'
      ? snapshot.visibleModelCount ?? snapshot.totalModelCount
      : 0
    const catalogItemCount = catalogProviderKey === null
      ? 0
      : items.value.filter((item) => catalogProviderKeyFromItem(item) === catalogProviderKey).length
    options.set(source.providerId, {
      providerId: source.providerId,
      providerName: source.providerName,
      statusLabel: formatProviderOptionStatus({
        providerId: source.providerId,
        fallbackStatusLabel: source.statusLabel,
        fallbackItemCount: catalogItemCount > 0 ? catalogItemCount : source.items.length,
        sourceItemCount: source.items.length,
      }),
      loading: source.loading || snapshot?.status === 'syncing',
      count: catalogCount > 0 ? catalogCount : source.items.length,
    })
  }
  return Array.from(options.values())
})
const syncProviderOptions = computed<SyncProviderOption[]>(() =>
  providerOptions.value.flatMap((provider) => {
    const catalogProviderKey = catalogProviderKeyForRuntimeProvider(provider.providerId)
    return catalogProviderKey === null ? [] : [{ ...provider, catalogProviderKey }]
  }),
)
const providerFilterIds = computed(() => providerOptions.value.map((provider) => provider.providerId))
const selectedProviderFilterCount = computed(() =>
  providerFilterIds.value.filter((providerId) => selectedProviderSet.value.has(providerId)).length
)
const allProviderFiltersSelected = computed(() =>
  providerFilterIds.value.length > 0 && selectedProviderFilterCount.value === providerFilterIds.value.length
)

function providerNameForId(providerId: RuntimeProviderId): string {
  const catalogProviderKey = catalogProviderKeyForRuntimeProvider(providerId)
  if (catalogProviderKey !== null) return catalogProviderNames[catalogProviderKey]
  return providerOptions.value.find((option) => option.providerId === providerId)?.providerName ?? providerId
}

function pickerItemKey(providerId: RuntimeProviderId, modelId: string): string {
  return buildProviderModelKey({ providerId, modelId })
}

function categoryForProvider(
  providerKey: ProviderCatalogKnownProviderKey,
): OpenRouterModelCategory | undefined {
  return providerKey === OPENROUTER_PROVIDER_ID && selectedCategory.value !== 'all'
    ? selectedCategory.value
    : undefined
}

function catalogRuntimeScopeKey(
  providerKey: ProviderCatalogKnownProviderKey,
  category: OpenRouterModelCategory | undefined = categoryForProvider(providerKey),
): string {
  return category ? `${providerKey}::${category}` : providerKey
}

function catalogProviderKeyFromItem(item: CatalogQueryItem): ProviderCatalogKnownProviderKey | null {
  const providerKey = String(item.providerKey ?? '').trim()
  return isProviderCatalogSourceKey(providerKey) ? providerKey : null
}

function toCatalogPickerItem(item: CatalogQueryItem): PickerModelItem | null {
  const providerKey = catalogProviderKeyFromItem(item)
  if (!providerKey) return null
  const providerId = runtimeProviderIdForCatalogProvider(providerKey)
  return {
    ...item,
    providerId,
    providerName: providerNameForId(providerId),
    itemKey: pickerItemKey(providerId, item.modelId),
    statusLabel: formatCatalogStatusLabel(item.status ?? item.visibility ?? 'catalog'),
    sourceLabel: providerId === OPENROUTER_PROVIDER_ID
      ? t('errors.modelCatalog.sourceOpenRouterCatalog')
      : t('errors.modelCatalog.sourceProviderCatalog'),
    selectable: true,
    detailSource: providerId === OPENROUTER_PROVIDER_ID ? 'openrouter_catalog' : 'provider_catalog',
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
    observation: item.observation ?? null,
    inputModalities: [...item.inputModalities],
    outputModalities: [...item.outputModalities],
    status: item.statusLabel,
    visibility: item.selectable ? 'visible' : 'disabled',
    itemKey: pickerItemKey(item.providerId, item.modelId),
    statusLabel: item.statusLabel,
    sourceLabel: item.sourceLabel,
    selectable: item.selectable,
    detailSource: 'provider_source',
  }
}

function formatCatalogStatusLabel(value: string | null | undefined): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) return t('errors.modelCatalog.catalog')
  if (normalized === 'catalog') return t('errors.modelCatalog.catalog')
  if (normalized === 'not_synced') return t('errors.modelCatalog.syncNotSynced')
  if (normalized === 'syncing') return t('errors.modelCatalog.syncing')
  if (normalized === 'synced') return t('errors.modelCatalog.catalog')
  if (normalized === 'failed') return t('errors.modelCatalog.syncFailed')
  return normalized
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

function unconfiguredPolicySnapshot(): ProviderCatalogPolicySnapshot {
  return Object.freeze({ source: 'unconfigured', policy: null })
}

function setProviderPolicySnapshot(
  providerKey: ProviderCatalogKnownProviderKey,
  snapshot: ProviderCatalogPolicySnapshot,
  category: OpenRouterModelCategory | undefined = categoryForProvider(providerKey),
) {
  catalogRuntimeStore.setPolicy({
    routeKey: catalogRuntimeScopeKey(providerKey, category),
    effectivePolicy: snapshot.policy,
    policySource: snapshot.source,
  })
  publishCatalogRuntimeStore()
}

function getProviderPolicySnapshot(
  providerKey: ProviderCatalogKnownProviderKey,
  category: OpenRouterModelCategory | undefined = categoryForProvider(providerKey),
): ProviderCatalogPolicySnapshot {
  const state = getCatalogRuntimeState(providerKey, category)
  return Object.freeze({ source: state.policySource, policy: state.effectivePolicy })
}

async function loadCatalogSyncSettings(
  providerKey: ProviderCatalogKnownProviderKey = selectedSyncProviderKey.value,
): Promise<ProviderCatalogPolicySnapshot> {
  const store = getElectronStore()
  if (!store?.get) {
    const snapshot = unconfiguredPolicySnapshot()
    setProviderPolicySnapshot(providerKey, snapshot)
    return snapshot
  }
  const [providerOverride, globalPolicy] = await Promise.all([
    store.get(providerCatalogPolicyV2StoreKey(providerKey)),
    store.get(GLOBAL_CATALOG_POLICY_V2_STORE_KEY),
  ])
  const resolved = resolveCatalogPolicyV2({ providerOverride, globalPolicy })
  if (!resolved.policy) {
    const snapshot = unconfiguredPolicySnapshot()
    setProviderPolicySnapshot(providerKey, snapshot)
    return snapshot
  }
  const snapshot: ProviderCatalogPolicySnapshot = resolved
  setProviderPolicySnapshot(providerKey, snapshot)
  return snapshot
}

function normalizeCatalogRevision(value: unknown, modelCount?: unknown, lastSyncAtMs?: unknown): string | null {
  const revision = String(value ?? '').trim()
  if (revision) return revision
  const count = Number(modelCount ?? 0)
  const syncedAt = Number(lastSyncAtMs ?? 0)
  if (!Number.isFinite(syncedAt) || syncedAt <= 0) return null
  return `${Number.isFinite(count) ? count : 0}:${syncedAt}`
}

function normalizeModelCount(value: unknown): number {
  const count = Number(value)
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0
}

function normalizeOptionalModelCount(value: unknown): number | null {
  if (value === undefined || value === null) return null
  const count = Number(value)
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : null
}

function createProviderSyncSnapshot(input: Readonly<{
  syncState?: unknown
  modelCount?: unknown
  visibleModelCount?: unknown
  hiddenModelCount?: unknown
  lastSyncAtMs?: unknown
  lastErrorCode?: unknown
  lastErrorMessage?: unknown
  providerFailure?: unknown
  catalogRevision?: unknown
  isStale?: unknown
  freshnessMs?: unknown
}>): ProviderSyncSnapshot {
  const state = String(input.syncState ?? 'idle')
  const status: SyncStatus = state === 'syncing'
    ? 'syncing'
    : state === 'ok'
      ? 'synced'
      : state === 'error'
        ? 'failed'
        : 'not_synced'
  const lastSyncedAtMs = Number(input.lastSyncAtMs ?? 0)
  const normalizedLastSyncedAtMs = Number.isFinite(lastSyncedAtMs) && lastSyncedAtMs > 0 ? lastSyncedAtMs : null
  const totalModelCount = normalizeModelCount(input.modelCount)
  return {
    status,
    totalModelCount,
    visibleModelCount: normalizeOptionalModelCount(input.visibleModelCount),
    hiddenModelCount: normalizeOptionalModelCount(input.hiddenModelCount),
    lastSyncedAtMs: normalizedLastSyncedAtMs,
    errorCode: input.lastErrorCode ? String(input.lastErrorCode) : null,
    errorMessage: input.lastErrorMessage ? String(input.lastErrorMessage) : null,
    providerFailure: input.providerFailure && typeof input.providerFailure === 'object'
      ? input.providerFailure as ProviderFailureV2 : null,
    freshnessMs: typeof input.freshnessMs === 'number' ? input.freshnessMs : null,
    isStale: input.isStale === true || isCatalogStatusStale({
      status: status === 'synced' ? 'synced' : 'not_synced',
      lastSyncAtMs: normalizedLastSyncedAtMs,
      freshnessMs: typeof input.freshnessMs === 'number' ? input.freshnessMs : undefined,
    }),
    catalogRevision: normalizeCatalogRevision(input.catalogRevision, totalModelCount, normalizedLastSyncedAtMs),
  }
}

function setProviderSyncSnapshot(
  providerKey: ProviderCatalogKnownProviderKey,
  snapshot: ProviderSyncSnapshot,
  category?: OpenRouterModelCategory,
) {
  const scopeKey = catalogRuntimeScopeKey(providerKey, category)
  providerSyncSnapshots.value = {
    ...providerSyncSnapshots.value,
    [scopeKey]: snapshot,
  }
}

function getCatalogRuntimeState(
  providerKey: ProviderCatalogKnownProviderKey,
  category?: OpenRouterModelCategory,
): ReturnType<typeof catalogRuntimeStore.read> {
  const key = catalogRuntimeScopeKey(providerKey, category)
  return catalogRuntimeStates.value[key] ?? catalogRuntimeStore.read(key)
}

function publishCatalogRuntimeStore() {
  catalogRuntimeStates.value = catalogRuntimeStore.snapshot()
}

function onProviderCredentialUpdated(event: Event) {
  const providerKey = (event as CustomEvent<{ providerKey?: unknown }>).detail?.providerKey
  if (!isProviderCatalogSourceKey(providerKey)) return
  const typedProviderKey = providerKey
  CatalogQueryService.invalidateProviderRuntimeCache(typedProviderKey)
  const affectedScopeKeys = Object.keys(catalogRuntimeStore.snapshot()).filter((key) =>
    key === typedProviderKey || key.startsWith(`${typedProviderKey}::`))
  if (affectedScopeKeys.length === 0) affectedScopeKeys.push(catalogRuntimeScopeKey(typedProviderKey))
  for (const scopeKey of affectedScopeKeys) {
    catalogRuntimeStore.clear(scopeKey)
    lastAutoSyncAtMsByScope.delete(scopeKey)
  }
  const nextSnapshots = { ...providerSyncSnapshots.value }
  for (const scopeKey of affectedScopeKeys) delete nextSnapshots[scopeKey]
  providerSyncSnapshots.value = nextSnapshots
  items.value = items.value.filter((item) => catalogProviderKeyFromItem(item) !== typedProviderKey)
  publishCatalogRuntimeStore()
  if (!props.open || !selectedProviderSet.value.has(runtimeProviderIdForCatalogProvider(typedProviderKey))) return
  void fetchPage({ preserveUiState: true, providerKeys: [typedProviderKey] })
}

function emptyProviderSyncSnapshot(): ProviderSyncSnapshot {
  return {
    status: 'not_synced',
    totalModelCount: 0,
    visibleModelCount: null,
    hiddenModelCount: null,
    lastSyncedAtMs: null,
    errorCode: null,
    errorMessage: null,
    providerFailure: null,
    isStale: true,
    freshnessMs: null,
    catalogRevision: null,
  }
}

function getProviderSyncSnapshot(
  providerKey: ProviderCatalogKnownProviderKey,
  category?: OpenRouterModelCategory,
): ProviderSyncSnapshot {
  return providerSyncSnapshots.value[catalogRuntimeScopeKey(providerKey, category)] ?? emptyProviderSyncSnapshot()
}

function formatProviderOptionStatus(input: Readonly<{
  providerId: RuntimeProviderId
  fallbackStatusLabel: string
  fallbackItemCount: number
  sourceItemCount: number
}>): string {
  const providerKey = catalogProviderKeyForRuntimeProvider(input.providerId)
  if (providerKey === null) return formatCatalogStatusLabel(input.fallbackStatusLabel)
  const snapshot = providerSyncSnapshots.value[catalogRuntimeScopeKey(providerKey)]
  if (!snapshot) return formatCatalogStatusLabel(input.fallbackStatusLabel)
  if (snapshot.status !== 'synced') return formatCatalogStatusLabel(snapshot.status)
  const totalCount = snapshot.visibleModelCount ?? snapshot.totalModelCount
  if (totalCount <= 0) return formatCatalogStatusLabel(input.fallbackStatusLabel)
  const shownCount = Math.min(
    shownCountByProvider.value.get(input.providerId) ?? input.sourceItemCount,
    totalCount,
  )
  return tf('errors.modelCatalog.shownCount', { shownCount, totalCount })
}

function modelCatalogSyncFailureReasonText(snapshot: ProviderSyncSnapshot): string {
  return snapshot.providerFailure?.providerError?.message
    ?? snapshot.providerFailure?.transportError?.message
    ?? snapshot.errorMessage
    ?? snapshot.errorCode
    ?? snapshot.providerFailure?.starverseDiagnosticCode
    ?? t('errors.modelCatalog.syncFailUnknownError')
}

function rendererCatalogFailure(
  providerKey: ProviderCatalogKnownProviderKey,
  code: unknown,
  message: unknown,
): ProviderFailureV2 {
  const diagnosticCode = String(code ?? 'MODEL_CATALOG_RENDERER_BRIDGE_FAILED')
  const rawMessage = String(message ?? diagnosticCode)
  return Object.freeze({
    origin: 'starverse_internal',
    phase: 'response_body',
    provider: Object.freeze({ namespace: 'catalog_source', id: providerKey }),
    contractId: 'model-catalog-renderer-v2',
    operationId: `catalog-renderer:${providerKey}`,
    requestSequence: 1,
    httpStatus: null,
    httpStatusText: null,
    providerError: Object.freeze({
      code: diagnosticCode,
      type: 'renderer_bridge',
      status: null,
      message: rawMessage,
      param: null,
      requestId: null,
      retryAfterMs: null,
      rawJson: Object.freeze({ code: diagnosticCode, message: rawMessage }),
      rawText: null,
    }),
    rawFrameExcerpt: null,
    transportError: null,
    starverseDiagnosticCode: diagnosticCode,
    redactions: Object.freeze([]),
    truncations: Object.freeze([]),
  })
}

function formatProviderSyncStatusText(snapshot: ProviderSyncSnapshot): string {
  const payload = {
    count: snapshot.totalModelCount,
    visibleCount: snapshot.visibleModelCount ?? 0,
    hiddenCount: snapshot.hiddenModelCount ?? 0,
    time: formatSyncTime(snapshot.lastSyncedAtMs),
  }
  if (snapshot.visibleModelCount !== null && snapshot.hiddenModelCount !== null) {
    return tf('errors.modelCatalog.syncedWithVisibleHidden', payload)
  }
  if (snapshot.visibleModelCount !== null && snapshot.visibleModelCount !== snapshot.totalModelCount) {
    return tf('errors.modelCatalog.syncedWithVisible', payload)
  }
  if (snapshot.hiddenModelCount !== null && snapshot.hiddenModelCount > 0) {
    return tf('errors.modelCatalog.syncedWithHidden', payload)
  }
  return tf('errors.modelCatalog.synced', payload)
}

function selectAllProviderFilters() {
  selectedProviderFilters.value = providerFilterIds.value
}

function clearProviderFilters() {
  selectedProviderFilters.value = []
}

function clearFiltersToRevealSelectedModel() {
  const providerId = selectedProvider.value
  skipAutoQuery = true
  searchText.value = ''
  if (providerId) {
    const next = new Set(selectedProviderFilters.value)
    next.add(providerId)
    selectedProviderFilters.value = providerFilterIds.value.filter((candidate) => next.has(candidate))
  }
  selectedVendors.value = []
  selectedCategory.value = 'all'
  contextLengthMin.value = ''
  contextLengthMax.value = ''
  maxOutputTokensMin.value = ''
  maxOutputTokensMax.value = ''
  selectedArchitectureModalities.value = []
  selectedInputModalities.value = []
  selectedOutputModalities.value = []
  selectedSupportedParameters.value = []
  tokenizerFiltersText.value = ''
  instructTypeFiltersText.value = ''
  hasPerRequestLimits.value = 'any'
  hasDefaultParameters.value = 'any'
  moderationFilter.value = 'any'
  expiringWithinEnabled.value = false
  expiringWithinDays.value = '7'
  activePickerMode.value = 'all'
  void nextTick(() => {
    skipAutoQuery = false
    void fetchPage({ preserveUiState: true }).then(() => {
      if (props.open) return triggerPickerOpenSync()
      return undefined
    })
  })
}

function toggleProviderFilter(providerId: RuntimeProviderId, checked: boolean) {
  const next = new Set(selectedProviderFilters.value)
  if (checked) {
    next.add(providerId)
  } else {
    next.delete(providerId)
  }
  selectedProviderFilters.value = providerFilterIds.value.filter((candidate) => next.has(candidate))
}

function ensureSelectedSyncProviderKey() {
  const keys = catalogProviderKeys.value
  if (keys.includes(selectedSyncProviderKey.value)) return
  selectedSyncProviderKey.value = keys[0] ?? OPENROUTER_CATALOG_PROVIDER_KEY
}

function shouldSyncOnPickerOpen(
  snapshot: ProviderSyncSnapshot,
  policy: ProviderCatalogPolicySnapshot,
): boolean {
  if (snapshot.status === 'syncing') return false
  if (!policy.policy || policy.policy.pickerOpenSyncPolicy === 'never') return false
  if (policy.policy.pickerOpenSyncPolicy === 'always') return true
  if (snapshot.status === 'not_synced') return true
  if (snapshot.status === 'synced' || snapshot.status === 'failed') return isCatalogStatusStale({
    status: snapshot.lastSyncedAtMs === null ? 'not_synced' : 'synced',
    lastSyncAtMs: snapshot.lastSyncedAtMs,
    freshnessMs: policy.policy.freshnessMs ?? undefined,
  })
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
  if (delimiterIndex <= 0 || delimiterIndex + delimiter.length >= normalized.length) return ''
  return normalized.slice(delimiterIndex + delimiter.length).trim()
}

function parseProviderIdFromModelKey(modelKey: string): RuntimeProviderId | null {
  const normalized = String(modelKey ?? '').trim()
  const delimiter = '::'
  const delimiterIndex = normalized.indexOf(delimiter)
  if (delimiterIndex <= 0) return null
  const providerId = normalized.slice(0, delimiterIndex).trim()
  return isRuntimeProviderId(providerId) && providerOptions.value.some((option) => option.providerId === providerId)
    ? providerId
    : null
}

function normalizeModelId(value: unknown): string {
  return String(value ?? '').trim()
}

function isSelectedModel(modelId: string, providerId: RuntimeProviderId): boolean {
  return providerId === selectedProvider.value && normalizeModelId(modelId) === selectedModelIdentity.value
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
  editableFavoriteModelKeys.value = normalizedEditableFavoriteModelKeys.value
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
      if (!providerId || !modelId) return null
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
  editableFavoriteModelKeys.value = normalizedEditableFavoriteModelKeys.value
  draggingFavoriteIndex.value = null
}

function cancelFavoriteEditMode() {
  favoriteEditMode.value = false
  editableFavoriteModelKeys.value = normalizedEditableFavoriteModelKeys.value
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
    void fetchPage()
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

function buildQueryInput(providerKey: ProviderCatalogKnownProviderKey, cursor: CatalogQueryCursor | null): CatalogQueryInput {
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
  const category = providerKey === OPENROUTER_PROVIDER_ID && selectedCategory.value !== 'all'
    ? selectedCategory.value
    : undefined

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
    sourceProviderKey: providerKey,
    searchText: searchText.value.trim() || undefined,
    includeDescriptionInSearch: includeDescriptionInSearch.value,
    ...(Object.keys(filter).length > 0 ? { filter } : {}),
    page: {
      limit: FULL_LOAD_PAGE_LIMIT,
      cursor,
    },
    sort: {
      by: sortBy.value,
      order: sortOrder.value,
    },
  }
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
    const selected = selectedModelIdentity.value
    const selectedKey = selectedProvider.value && selected ? pickerItemKey(selectedProvider.value, selected) : ''
    const selectedExists = selected && availableShortcutItems.some((item) =>
      item.providerId === selectedProvider.value && normalizeModelId(item.modelId) === selected
    )
    activeModelKey.value = selectedExists ? selectedKey : availableShortcutItems[0].modelKey
    return
  }
  if (pickerItems.value.length === 0) {
    activeModelKey.value = ''
    return
  }
  if (activeModelKey.value && pickerItems.value.some((item) => item.itemKey === activeModelKey.value)) return
  const selected = selectedModelIdentity.value
  const selectedKey = selectedProvider.value && selected ? pickerItemKey(selectedProvider.value, selected) : ''
  const selectedExists = selected && pickerItems.value.some((item) =>
    item.providerId === selectedProvider.value && normalizeModelId(item.modelId) === selected
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
  searchText: string
  includeDescriptionInSearch: boolean
  selectedProviderFilters: readonly RuntimeProviderId[]
  selectedVendors: readonly string[]
  selectedCategory: OpenRouterModelCategory | 'all'
  contextLengthMin: string
  contextLengthMax: string
  maxOutputTokensMin: string
  maxOutputTokensMax: string
  selectedArchitectureModalities: readonly string[]
  selectedInputModalities: readonly CatalogQueryModality[]
  selectedOutputModalities: readonly CatalogQueryModality[]
  selectedSupportedParameters: readonly string[]
  tokenizerFiltersText: string
  instructTypeFiltersText: string
  hasPerRequestLimits: TriState
  hasDefaultParameters: TriState
  moderationFilter: TriState
  expiringWithinEnabled: boolean
  expiringWithinDays: string
  sortBy: CatalogQuerySortBy
  sortOrder: CatalogQuerySortOrder
  activeDetailTab: DetailTab
  activePickerMode: PickerMode
  selectedSyncProviderKey: ProviderCatalogKnownProviderKey
  activeModelKey: string
  selectedModel: Readonly<{ providerId: RuntimeProviderId; modelId: string }> | null
  orderedModelKeys: readonly string[]
  listAnchor: Readonly<{ modelKey: string; offsetPx: number }> | null
  scrollTop: number
}>
const lastPickerUiSnapshot = ref<PickerUiSnapshot | null>(null)

function cloneStringArray(values: readonly string[]): string[] {
  return values.map((value) => String(value ?? '').trim()).filter(Boolean)
}

function capturePickerUiSnapshot(): PickerUiSnapshot {
  const scrollTop = listScrollRef.value?.scrollTop ?? 0
  const anchorIndex = Math.max(0, Math.min(range.value.start, pickerItems.value.length - 1))
  const anchorItem = pickerItems.value[anchorIndex] ?? null
  return {
    searchText: searchText.value,
    includeDescriptionInSearch: includeDescriptionInSearch.value,
    selectedProviderFilters: [...selectedProviderFilters.value],
    selectedVendors: [...selectedVendors.value],
    selectedCategory: selectedCategory.value,
    contextLengthMin: contextLengthMin.value,
    contextLengthMax: contextLengthMax.value,
    maxOutputTokensMin: maxOutputTokensMin.value,
    maxOutputTokensMax: maxOutputTokensMax.value,
    selectedArchitectureModalities: [...selectedArchitectureModalities.value],
    selectedInputModalities: [...selectedInputModalities.value],
    selectedOutputModalities: [...selectedOutputModalities.value],
    selectedSupportedParameters: [...selectedSupportedParameters.value],
    tokenizerFiltersText: tokenizerFiltersText.value,
    instructTypeFiltersText: instructTypeFiltersText.value,
    hasPerRequestLimits: hasPerRequestLimits.value,
    hasDefaultParameters: hasDefaultParameters.value,
    moderationFilter: moderationFilter.value,
    expiringWithinEnabled: expiringWithinEnabled.value,
    expiringWithinDays: expiringWithinDays.value,
    sortBy: sortBy.value,
    sortOrder: sortOrder.value,
    activeDetailTab: activeDetailTab.value,
    activePickerMode: activePickerMode.value,
    selectedSyncProviderKey: selectedSyncProviderKey.value,
    activeModelKey: activeModelKey.value,
    selectedModel: selectedProvider.value && selectedModelIdentity.value
      ? { providerId: selectedProvider.value, modelId: selectedModelIdentity.value }
      : null,
    orderedModelKeys: pickerItems.value.map((item) => item.itemKey),
    listAnchor: anchorItem
      ? { modelKey: anchorItem.itemKey, offsetPx: scrollTop - getOffsetForIndex(anchorIndex) }
      : null,
    scrollTop,
  }
}

function rememberPickerUiSnapshot() {
  lastPickerUiSnapshot.value = capturePickerUiSnapshot()
}

function restorePickerFiltersSnapshot(snapshot: PickerUiSnapshot) {
  searchText.value = String(snapshot.searchText ?? '')
  includeDescriptionInSearch.value = snapshot.includeDescriptionInSearch === true
  const providerIds = new Set(providerFilterIds.value)
  const retainedProviderFilters = [...snapshot.selectedProviderFilters].filter((providerId) => providerIds.has(providerId))
  const removedProviderFilterCount = snapshot.selectedProviderFilters.length - retainedProviderFilters.length
  selectedProviderFilters.value = retainedProviderFilters
  stateReconciliationNotice.value = removedProviderFilterCount > 0
    ? tf('errors.modelCatalog.providerFiltersRemoved', { count: removedProviderFilterCount })
    : null
  selectedVendors.value = cloneStringArray(snapshot.selectedVendors)
  selectedCategory.value =
    snapshot.selectedCategory === 'all' || categoryOptions.includes(snapshot.selectedCategory as OpenRouterModelCategory)
      ? snapshot.selectedCategory
      : 'all'
  contextLengthMin.value = String(snapshot.contextLengthMin ?? '')
  contextLengthMax.value = String(snapshot.contextLengthMax ?? '')
  maxOutputTokensMin.value = String(snapshot.maxOutputTokensMin ?? '')
  maxOutputTokensMax.value = String(snapshot.maxOutputTokensMax ?? '')
  selectedArchitectureModalities.value = cloneStringArray(snapshot.selectedArchitectureModalities)
  selectedInputModalities.value = [...snapshot.selectedInputModalities].filter((value) =>
    (modalityOptions as readonly string[]).includes(value),
  )
  selectedOutputModalities.value = [...snapshot.selectedOutputModalities].filter((value) =>
    (modalityOptions as readonly string[]).includes(value),
  )
  selectedSupportedParameters.value = cloneStringArray(snapshot.selectedSupportedParameters)
  tokenizerFiltersText.value = String(snapshot.tokenizerFiltersText ?? '')
  instructTypeFiltersText.value = String(snapshot.instructTypeFiltersText ?? '')
  hasPerRequestLimits.value = snapshot.hasPerRequestLimits === 'yes' || snapshot.hasPerRequestLimits === 'no' ? snapshot.hasPerRequestLimits : 'any'
  hasDefaultParameters.value = snapshot.hasDefaultParameters === 'yes' || snapshot.hasDefaultParameters === 'no' ? snapshot.hasDefaultParameters : 'any'
  moderationFilter.value = snapshot.moderationFilter === 'yes' || snapshot.moderationFilter === 'no' ? snapshot.moderationFilter : 'any'
  expiringWithinEnabled.value = snapshot.expiringWithinEnabled === true
  expiringWithinDays.value = String(snapshot.expiringWithinDays ?? '7')
  sortBy.value = sortByOptions.value.some((option) => option.key === snapshot.sortBy) ? snapshot.sortBy : 'name'
  sortOrder.value = snapshot.sortOrder === 'desc' ? 'desc' : 'asc'
  activeDetailTab.value = snapshot.activeDetailTab === 'endpoints' ? 'endpoints' : 'model'
  activePickerMode.value = snapshot.activePickerMode === 'favorites' || snapshot.activePickerMode === 'recents' ? snapshot.activePickerMode : 'all'
  if (catalogProviderKeys.value.includes(snapshot.selectedSyncProviderKey)) {
    selectedSyncProviderKey.value = snapshot.selectedSyncProviderKey
  }
}

async function restorePickerUiSnapshot(snapshot: PickerUiSnapshot) {
  await nextTick()
  const active = String(snapshot.activeModelKey ?? '').trim()
  if (active && pickerItems.value.some((item) => item.itemKey === active)) {
    activeModelKey.value = active
  } else if (selectedProvider.value && selectedModelIdentity.value && pickerItems.value.some((item) =>
    item.providerId === selectedProvider.value && normalizeModelId(item.modelId) === selectedModelIdentity.value
  )) {
    activeModelKey.value = pickerItemKey(selectedProvider.value, selectedModelIdentity.value)
  } else {
    activeModelKey.value = ''
  }
  await nextTick()
  refresh()
  if (listScrollRef.value) {
    const currentKeys = pickerItems.value.map((item) => item.itemKey)
    let anchorKey = snapshot.listAnchor?.modelKey ?? ''
    if (!anchorKey || !currentKeys.includes(anchorKey)) {
      const selectedKey = snapshot.selectedModel
        ? pickerItemKey(snapshot.selectedModel.providerId, snapshot.selectedModel.modelId)
        : ''
      if (selectedKey && currentKeys.includes(selectedKey)) {
        anchorKey = selectedKey
      } else {
        const oldAnchorIndex = snapshot.listAnchor
          ? snapshot.orderedModelKeys.indexOf(snapshot.listAnchor.modelKey)
          : -1
        anchorKey = oldAnchorIndex < 0
          ? ''
          : snapshot.orderedModelKeys
              .map((key, index) => ({ key, distance: Math.abs(index - oldAnchorIndex) }))
              .sort((left, right) => left.distance - right.distance)
              .find((candidate) => currentKeys.includes(candidate.key))?.key ?? ''
      }
    }
    const anchorIndex = anchorKey ? currentKeys.indexOf(anchorKey) : -1
    listScrollRef.value.scrollTop = anchorIndex >= 0
      ? Math.max(0, getOffsetForIndex(anchorIndex) + (snapshot.listAnchor?.offsetPx ?? 0))
      : Math.max(0, snapshot.scrollTop)
  }
}

function ensureProviderFiltersInitialized() {
  const ids = providerFilterIds.value
  if (!providerFiltersInitialized) {
    selectedProviderFilters.value = ids
    providerFiltersInitialized = true
    return
  }
  const validIds = new Set(ids)
  selectedProviderFilters.value = selectedProviderFilters.value.filter((providerId) => validIds.has(providerId))
}

async function fetchProviderCatalog(providerKey: ProviderCatalogKnownProviderKey): Promise<CatalogQueryResult> {
  const allItems: CatalogQueryItem[] = []
  let cursor: CatalogQueryCursor | null = null
  let firstResult: CatalogQueryResult | null = null
  let notice: string | null = null
  let snapshotDigest: string | undefined

  for (let pageIndex = 0; pageIndex < FULL_LOAD_MAX_PAGES_PER_PROVIDER; pageIndex += 1) {
    const result = await resolveQueryFn()({
      ...buildQueryInput(providerKey, cursor),
      ...(snapshotDigest ? { snapshotDigest } : {}),
    })
    if (!firstResult) firstResult = result
    if (!snapshotDigest && typeof result.catalogRevision === 'string' && /^[0-9a-f]{64}$/u.test(result.catalogRevision)) {
      snapshotDigest = result.catalogRevision
    }
    allItems.push(...(Array.isArray(result.items) ? result.items : []))
    if (result.notice) notice = notice ? `${notice} ${result.notice}` : result.notice
    cursor = result.nextCursor ?? null
    if (!cursor) {
      return {
        ...result,
        items: allItems,
        nextCursor: null,
        notice,
        authorityReadSucceeded: firstResult.authorityReadSucceeded ?? result.authorityReadSucceeded,
        catalogRevision: firstResult.catalogRevision ?? result.catalogRevision,
        scopeId: firstResult.scopeId ?? result.scopeId,
        pendingSnapshotDigest: firstResult.pendingSnapshotDigest ?? result.pendingSnapshotDigest,
        modelCount: firstResult.modelCount ?? result.modelCount,
        visibleModelCount: firstResult.visibleModelCount ?? result.visibleModelCount,
        hiddenModelCount: firstResult.hiddenModelCount ?? result.hiddenModelCount,
        lastSyncAtMs: firstResult.lastSyncAtMs ?? result.lastSyncAtMs,
      }
    }
  }

  const truncationNotice = tf('errors.modelCatalog.truncationNotice', {
    providerName: providerNameForId(providerKey),
    count: FULL_LOAD_MAX_PAGES_PER_PROVIDER * FULL_LOAD_PAGE_LIMIT,
  })
  return {
    ...(firstResult ?? { items: [], nextCursor: null }),
    items: allItems,
    nextCursor: null,
    notice: notice ? `${notice} ${truncationNotice}` : truncationNotice,
  }
}

async function fetchPage(options: Readonly<{
  preserveUiState?: boolean
  restoreUiState?: PickerUiSnapshot | null
  providerKeys?: readonly ProviderCatalogKnownProviderKey[]
}> = {}) {
  const uiSnapshot = options.restoreUiState ?? (options.preserveUiState ? capturePickerUiSnapshot() : null)
  const currentSeq = ++querySeq
  const providerKeys = options.providerKeys ? [...options.providerKeys] : selectedCatalogProviderKeys.value
  const owned = () => providerKeys.filter((providerKey) => providerFetchSeq.get(providerKey) === currentSeq)
  pendingFetches += 1
  loading.value = true
  providerKeys.forEach((providerKey) => providerFetchSeq.set(providerKey, currentSeq))
  hydratingProviderKeys.value = new Set([...hydratingProviderKeys.value, ...providerKeys])
  error.value = null
  queryNotice.value = null

  try {
    if (providerKeys.length === 0) {
      catalogHydratedOnce.value = true
      ensureActiveCandidate()
      await nextTick()
      refresh()
      return
    }

    const runtimeRequests = new Map(providerKeys.map((providerKey) => {
      const category = categoryForProvider(providerKey)
      const routeKey = catalogRuntimeScopeKey(providerKey, category)
      return [providerKey, Object.freeze({ routeKey, category, token: catalogRuntimeStore.beginQuery(routeKey) })]
    }))
    publishCatalogRuntimeStore()
    const results = await Promise.all(providerKeys.map((providerKey) => fetchProviderCatalog(providerKey)))
    // Providers that a newer fetch took over are that fetch's to publish; only the ones still owned are applied.
    const ownedKeys = new Set(owned())
    if (ownedKeys.size === 0) return

    queryNotice.value = results.filter((_, index) => ownedKeys.has(providerKeys[index]!))
      .map((result) => String(result.notice ?? '').trim()).filter(Boolean).join(' ') || null
    results.forEach((result, index) => {
      const providerKey = providerKeys[index]
      if (!providerKey || !ownedKeys.has(providerKey)) return
      const runtimeRequest = runtimeRequests.get(providerKey)
      if (!runtimeRequest) return
      const revision = normalizeCatalogRevision(result.catalogRevision, result.modelCount, result.lastSyncAtMs)
      const policy = getProviderPolicySnapshot(providerKey, runtimeRequest.category)
      const failure = result.status === 'failed'
        ? result.providerFailure ?? rendererCatalogFailure(providerKey, result.errorCode, result.errorMessage)
        : null
      if (result.authorityReadSucceeded !== false) {
        catalogRuntimeStore.acceptAuthority({
          token: runtimeRequest.token,
          authorityScopeId: result.scopeId ?? null,
          displayedSnapshotDigest: revision,
          pendingSnapshotDigest: result.pendingSnapshotDigest ?? null,
          pendingEmpty: result.pendingEmpty === true,
          items: result.items,
          stale: failure !== null || result.status === 'not_synced' || isCatalogStatusStale({
            status: revision ? 'synced' : 'not_synced',
            lastSyncAtMs: result.lastSyncAtMs,
            freshnessMs: policy.policy?.freshnessMs ?? undefined,
          }),
          failure,
        })
      } else {
        catalogRuntimeStore.acceptFailure({
          token: runtimeRequest.token,
          failure: failure ?? rendererCatalogFailure(providerKey, result.errorCode, result.errorMessage),
        })
      }
      const runtimeState = catalogRuntimeStore.read(runtimeRequest.routeKey)
      setProviderSyncSnapshot(providerKey, createProviderSyncSnapshot({
        syncState: runtimeState.syncState === 'failed'
          ? 'error'
          : result.status === 'syncing'
            ? 'syncing'
            : runtimeState.displayedSnapshotDigest
              ? 'ok'
              : 'idle',
        modelCount: result.modelCount ?? runtimeState.items.length,
        visibleModelCount: result.visibleModelCount,
        hiddenModelCount: result.hiddenModelCount,
        lastSyncAtMs: result.lastSyncAtMs,
        lastErrorCode: runtimeState.failure?.starverseDiagnosticCode ?? result.errorCode,
        lastErrorMessage: runtimeState.failure?.providerError?.message ?? runtimeState.failure?.transportError?.message ?? result.errorMessage,
        providerFailure: runtimeState.failure,
        catalogRevision: runtimeState.displayedSnapshotDigest,
        isStale: runtimeState.stale,
        freshnessMs: policy.policy?.freshnessMs,
      }), runtimeRequest.category)
    })
    publishCatalogRuntimeStore()
    const refreshedProviders = ownedKeys
    items.value = [
      ...items.value.filter((item) => {
        const providerKey = catalogProviderKeyFromItem(item)
        return providerKey === null || !refreshedProviders.has(providerKey)
      }),
      ...providerKeys.flatMap((providerKey) => {
        const runtimeRequest = ownedKeys.has(providerKey) ? runtimeRequests.get(providerKey) : undefined
        return runtimeRequest ? [...catalogRuntimeStore.read(runtimeRequest.routeKey).items] : []
      }),
    ]
    catalogHydratedOnce.value = true
    ensureActiveCandidate()
    await nextTick()
    refresh()
    if (uiSnapshot) {
      await restorePickerUiSnapshot(uiSnapshot)
    }
  } catch (err: any) {
    if (owned().length === 0 && providerKeys.length > 0) return
    error.value = err?.message ? String(err.message) : t('errors.modelCatalog.queryFailed')
  } finally {
    pendingFetches = Math.max(0, pendingFetches - 1)
    loading.value = pendingFetches > 0
    const finished = owned()
    if (finished.length > 0) {
      const remaining = new Set(hydratingProviderKeys.value)
      finished.forEach((providerKey) => { remaining.delete(providerKey); providerFetchSeq.delete(providerKey) })
      hydratingProviderKeys.value = remaining
    }
  }
}

async function fetchEndpointDetails(forceRefresh: boolean) {
  const modelId = String(activeDetailModelId.value ?? '').trim()
  const detailItem = activeDetailItem.value
  if (!props.open || !modelId || detailItem?.providerId !== OPENROUTER_PROVIDER_ID) {
    endpointDetails.value = null
    endpointLoading.value = false
    return
  }

  const currentSeq = ++endpointSeq
  endpointLoading.value = true
  try {
    const result = await resolveEndpointDetailFn()({
      providerKey: OPENROUTER_PROVIDER_ID,
      modelId,
      forceRefresh,
    })
    if (currentSeq !== endpointSeq) return
    endpointDetails.value = result
  } catch (err: any) {
    if (currentSeq !== endpointSeq) return
    endpointDetails.value = {
      providerKey: OPENROUTER_PROVIDER_ID,
      modelId,
      fetchedAtMs: null,
      source: 'scoped_catalog',
      items: [],
      error: err?.message ? String(err.message) : t('errors.modelCatalog.endpointDetailsLoadFailed'),
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
  if (!props.open || !modelId || detailItem?.providerId !== OPENROUTER_PROVIDER_ID) {
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
      providerKey: OPENROUTER_PROVIDER_ID,
      modelId,
    })
    if (currentSeq !== modelDetailSeq) return
    modelDetail.value = result.item
    modelDetailError.value = result.error ?? null
  } catch (err: any) {
    if (currentSeq !== modelDetailSeq) return
    modelDetail.value = null
    modelDetailError.value = err?.message ? String(err.message) : t('errors.modelCatalog.modelDetailLoadFailed')
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
  const restoreSnapshot = lastPickerUiSnapshot.value
  if (restoreSnapshot) {
    restorePickerFiltersSnapshot(restoreSnapshot)
  } else {
    stateReconciliationNotice.value = null
    ensureProviderFiltersInitialized()
  }
  activeModelKey.value = restoreSnapshot?.activeModelKey
    ?? (selectedProvider.value && selectedModelIdentity.value ? pickerItemKey(selectedProvider.value, selectedModelIdentity.value) : '')
  modelDetail.value = null
  modelDetailLoading.value = false
  modelDetailError.value = null
  endpointDetails.value = null
  endpointLoading.value = false
  queryNotice.value = null
  error.value = null
  resetFavoriteEditorState()
  skipAutoQuery = false
  querySeq += 1
  providerFetchSeq.clear()
  void hydrateCatalogThenSync(restoreSnapshot)
  void nextTick(() => {
    searchInputRef.value?.focus()
    refresh()
  })
}

async function hydrateCatalogThenSync(restoreSnapshot: PickerUiSnapshot | null) {
  await fetchPage({ restoreUiState: restoreSnapshot })
  if (!props.open) return
  await triggerPickerOpenSync()
}

async function triggerPickerOpenSync() {
  const providerKeys = [...selectedCatalogProviderKeys.value]
  if (providerKeys.length === 0) return
  const policies = new Map<ProviderCatalogKnownProviderKey, ProviderCatalogPolicySnapshot>()
  await Promise.all(providerKeys.map(async (providerKey) => {
    policies.set(providerKey, await loadCatalogSyncSettings(providerKey))
  }))
  await Promise.all(providerKeys.map((providerKey) => fetchProviderSyncStatus(providerKey)))
  await Promise.all(providerKeys.map(async (providerKey) => {
    const policy = policies.get(providerKey) ?? unconfiguredPolicySnapshot()
    const snapshot = getProviderSyncSnapshot(providerKey)
    if (!shouldSyncOnPickerOpen(snapshot, policy)) return
    const category = categoryForProvider(providerKey)
    const scopeKey = catalogRuntimeScopeKey(providerKey, category)
    const now = Date.now()
    const lastSyncAt = lastAutoSyncAtMsByScope.get(scopeKey) ?? 0
    if (now - lastSyncAt < AUTO_SYNC_COOLDOWN_MS) return
    lastAutoSyncAtMsByScope.set(scopeKey, now)
    await runSyncProvider(providerKey, false, 'model_picker_opened', policy, category)
  }))
}

async function applyLatestCatalogList() {
  const providerKey = selectedSyncProviderKey.value
  const category = categoryForProvider(providerKey)
  const scopeKey = catalogRuntimeScopeKey(providerKey, category)
  const pendingRevision = getCatalogRuntimeState(providerKey, category).pendingSnapshotDigest
  if (!pendingRevision) return
  const token = catalogRuntimeStore.beginMutation(scopeKey)
  publishCatalogRuntimeStore()
  let response: Record<string, unknown>
  try {
    response = await CatalogQueryService.applyPending({
      sourceProviderKey: providerKey,
      snapshotDigest: pendingRevision,
      ...(category ? { category } : {}),
    }) as Record<string, unknown>
  } catch (err) {
    // A rejected call must end the mutation; otherwise the route stays 'syncing' and the error is unhandled.
    response = { ok: false, code: 'MODEL_CATALOG_RENDERER_APPLY_FAILED', message: err instanceof Error ? err.message : String(err) }
  }
  if (!catalogRuntimeStore.isCurrent(token)) return
  if (response.ok !== true || response.status !== 'synced') {
    const previous = getProviderSyncSnapshot(providerKey, category)
    const providerFailure = response.providerFailure && typeof response.providerFailure === 'object'
      ? response.providerFailure as ProviderFailureV2
      : rendererCatalogFailure(providerKey, response.code ?? 'catalog_apply_failed', response.message)
    catalogRuntimeStore.acceptFailure({ token, failure: providerFailure })
    publishCatalogRuntimeStore()
    setProviderSyncSnapshot(providerKey, createProviderSyncSnapshot({
      syncState: 'error',
      modelCount: previous.totalModelCount,
      visibleModelCount: previous.visibleModelCount,
      hiddenModelCount: previous.hiddenModelCount,
      lastSyncAtMs: previous.lastSyncedAtMs,
      lastErrorCode: response.code ?? 'catalog_apply_failed',
      lastErrorMessage: response.message,
      providerFailure,
      catalogRevision: previous.catalogRevision,
      isStale: previous.isStale,
      freshnessMs: previous.freshnessMs,
    }), category)
    return
  }
  const current = catalogRuntimeStore.read(scopeKey)
  catalogRuntimeStore.acceptAuthority({
    token,
    authorityScopeId: typeof response.scopeId === 'string' ? response.scopeId : current.authorityScopeId,
    displayedSnapshotDigest: typeof response.responseDigest === 'string' ? response.responseDigest : pendingRevision,
    pendingSnapshotDigest: null,
    items: current.items,
    stale: false,
  })
  publishCatalogRuntimeStore()
  const policy = getProviderPolicySnapshot(providerKey, category)
  setProviderSyncSnapshot(providerKey, createProviderSyncSnapshot({
    syncState: 'ok',
    modelCount: response.modelCount,
    visibleModelCount: response.visibleModelCount,
    hiddenModelCount: response.hiddenModelCount,
    lastSyncAtMs: response.observedAtMs,
    catalogRevision: response.responseDigest,
    isStale: false,
    freshnessMs: policy.policy?.freshnessMs,
  }), category)
  await fetchPage({ preserveUiState: true, providerKeys: [providerKey] })
}

async function runSyncProvider(
  providerKey: ProviderCatalogKnownProviderKey,
  force: boolean,
  _reason: 'model_picker_opened' | 'manual_refresh' = force ? 'manual_refresh' : 'model_picker_opened',
  loadedPolicy?: ProviderCatalogPolicySnapshot,
  category: OpenRouterModelCategory | undefined = categoryForProvider(providerKey),
) {
  const policy = loadedPolicy ?? await loadCatalogSyncSettings(providerKey)
  const scopeKey = catalogRuntimeScopeKey(providerKey, category)
  const token = catalogRuntimeStore.beginMutation(scopeKey)
  publishCatalogRuntimeStore()
  setProviderSyncSnapshot(providerKey, {
    ...getProviderSyncSnapshot(providerKey, category),
    status: 'syncing',
    errorCode: null,
    errorMessage: null,
  }, category)

  try {
    const syncResponse = await CatalogQueryService.sync({ sourceProviderKey: providerKey,
      ...(category ? { category } : {}),
      retentionMs: policy.policy?.retentionMs ?? 'never',
      applyMode: policy.policy?.listApplyMode ?? 'manual',
    }) as Record<string, unknown>
    if (!catalogRuntimeStore.isCurrent(token)) return
    if (syncResponse.ok === true && (syncResponse.status === 'synced' || syncResponse.status === 'pending')) {
      const current = catalogRuntimeStore.read(scopeKey)
      const revision = normalizeCatalogRevision(syncResponse.responseDigest, syncResponse.modelCount, syncResponse.observedAtMs)
      const pendingRevision = typeof syncResponse.pendingSnapshotDigest === 'string'
        ? syncResponse.pendingSnapshotDigest
        : null
      catalogRuntimeStore.acceptAuthority({
        token,
        authorityScopeId: typeof syncResponse.scopeId === 'string' ? syncResponse.scopeId : current.authorityScopeId,
        displayedSnapshotDigest: revision,
        pendingSnapshotDigest: pendingRevision,
        pendingEmpty: syncResponse.pendingEmpty === true,
        items: current.items,
        stale: false,
      })
      publishCatalogRuntimeStore()
      const snapshot = createProviderSyncSnapshot({
        syncState: 'ok',
        modelCount: syncResponse.modelCount,
        visibleModelCount: syncResponse.visibleModelCount,
        hiddenModelCount: syncResponse.hiddenModelCount,
        lastSyncAtMs: syncResponse.observedAtMs,
        catalogRevision: syncResponse.responseDigest,
        isStale: false,
        freshnessMs: policy.policy?.freshnessMs,
      })
      setProviderSyncSnapshot(providerKey, snapshot, category)
      if (policy.policy?.listApplyMode === 'automatic' && props.open &&
          selectedProviderSet.value.has(runtimeProviderIdForCatalogProvider(providerKey))) {
        await fetchPage({ preserveUiState: true, providerKeys: [providerKey] })
      }
    } else {
      const active = syncResponse.active && typeof syncResponse.active === 'object'
        ? syncResponse.active as Record<string, unknown>
        : null
      const providerFailure = syncResponse.providerFailure && typeof syncResponse.providerFailure === 'object'
        ? syncResponse.providerFailure as ProviderFailureV2
        : active?.providerFailure && typeof active.providerFailure === 'object'
          ? active.providerFailure as ProviderFailureV2
          : rendererCatalogFailure(providerKey, syncResponse.code ?? active?.errorCode, syncResponse.message ?? active?.errorMessage)
      const previous = getProviderSyncSnapshot(providerKey, category)
      catalogRuntimeStore.acceptFailure({ token, failure: providerFailure })
      publishCatalogRuntimeStore()
      setProviderSyncSnapshot(providerKey, createProviderSyncSnapshot({
        syncState: 'error',
        modelCount: active?.modelCount ?? previous.totalModelCount,
        visibleModelCount: active?.visibleModelCount ?? previous.visibleModelCount,
        hiddenModelCount: active?.hiddenModelCount ?? previous.hiddenModelCount,
        lastSyncAtMs: active?.observedAtMs ?? previous.lastSyncedAtMs,
        lastErrorCode: syncResponse.code ?? active?.errorCode ?? previous.errorCode ?? 'unknown_error',
        lastErrorMessage: syncResponse.message ?? active?.errorMessage ?? previous.errorMessage,
        providerFailure,
        catalogRevision: active?.responseDigest ?? previous.catalogRevision,
        isStale: true,
        freshnessMs: policy.policy?.freshnessMs,
      }), category)
    }
  } catch (err) {
    if (!catalogRuntimeStore.isCurrent(token)) return
    const providerFailure = rendererCatalogFailure(providerKey, 'MODEL_CATALOG_RENDERER_SYNC_FAILED', err instanceof Error ? err.message : String(err))
    catalogRuntimeStore.acceptFailure({ token, failure: providerFailure })
    publishCatalogRuntimeStore()
    setProviderSyncSnapshot(providerKey, {
      ...getProviderSyncSnapshot(providerKey, category),
      status: 'failed',
      errorCode: providerFailure.starverseDiagnosticCode,
      errorMessage: providerFailure.providerError?.message ?? providerFailure.starverseDiagnosticCode,
      providerFailure,
      isStale: true,
    }, category)
  }
}

async function fetchProviderSyncStatus(
  providerKey: ProviderCatalogKnownProviderKey,
  category: OpenRouterModelCategory | undefined = categoryForProvider(providerKey),
) {
  const scopeKey = catalogRuntimeScopeKey(providerKey, category)
  const token = catalogRuntimeStore.beginQuery(scopeKey)
  publishCatalogRuntimeStore()
  try {
    const response = await CatalogQueryService.status({ sourceProviderKey: providerKey,
      ...(category ? { category } : {}) }) as Record<string, unknown>
    if (!catalogRuntimeStore.isCurrent(token)) return
    const policy = getProviderPolicySnapshot(providerKey, category)
    const pendingEmpty = response.pendingEmpty === true
    const pendingSnapshotDigest = typeof response.pendingSnapshotDigest === 'string'
      ? response.pendingSnapshotDigest
      : null
    if (response.ok !== true) {
      const providerFailure = response.providerFailure && typeof response.providerFailure === 'object'
        ? response.providerFailure as ProviderFailureV2
        : rendererCatalogFailure(providerKey, response.code, response.message)
      catalogRuntimeStore.acceptFailure({ token, failure: providerFailure })
      publishCatalogRuntimeStore()
      setProviderSyncSnapshot(providerKey, createProviderSyncSnapshot({ syncState: 'error',
        lastErrorCode: response.code ?? 'unknown_error',
        lastErrorMessage: response.message,
        providerFailure: response.providerFailure,
        isStale: true,
        freshnessMs: policy.policy?.freshnessMs,
      }), category)
      return
    }
    const current = catalogRuntimeStore.read(scopeKey)
    catalogRuntimeStore.acceptAuthority({
      token,
      authorityScopeId: typeof response.scopeId === 'string' ? response.scopeId : current.authorityScopeId,
      displayedSnapshotDigest: typeof response.responseDigest === 'string' ? response.responseDigest : null,
      pendingSnapshotDigest,
      pendingEmpty,
      items: current.items,
      stale: response.status !== 'synced' || isCatalogStatusStale({
        status: response.observedAtMs ? 'synced' : 'not_synced',
        lastSyncAtMs: response.observedAtMs,
        freshnessMs: policy.policy?.freshnessMs ?? undefined,
      }),
      failure: response.status === 'failed' && response.providerFailure && typeof response.providerFailure === 'object'
        ? response.providerFailure as ProviderFailureV2
        : null,
    })
    publishCatalogRuntimeStore()
    setProviderSyncSnapshot(providerKey, createProviderSyncSnapshot({
      syncState: response.status === 'synced' ? 'ok' : response.status === 'syncing' ? 'syncing'
        : response.status === 'failed' ? 'error' : 'idle',
      modelCount: response.modelCount, visibleModelCount: response.visibleModelCount,
      hiddenModelCount: response.hiddenModelCount, lastSyncAtMs: response.observedAtMs,
      lastErrorCode: response.errorCode,
      lastErrorMessage: response.errorMessage,
      providerFailure: response.providerFailure,
      catalogRevision: response.responseDigest,
      isStale: response.status !== 'synced' || isCatalogStatusStale({
        status: response.observedAtMs ? 'synced' : 'not_synced',
        lastSyncAtMs: response.observedAtMs,
        freshnessMs: policy.policy?.freshnessMs ?? undefined,
      }),
      freshnessMs: policy.policy?.freshnessMs,
    }), category)
  } catch (err) {
    if (!catalogRuntimeStore.isCurrent(token)) return
    const providerFailure = rendererCatalogFailure(providerKey, 'MODEL_CATALOG_RENDERER_STATUS_FAILED', err instanceof Error ? err.message : String(err))
    catalogRuntimeStore.acceptFailure({ token, failure: providerFailure })
    publishCatalogRuntimeStore()
    setProviderSyncSnapshot(providerKey, { ...getProviderSyncSnapshot(providerKey, category), status: 'failed',
      errorCode: providerFailure.starverseDiagnosticCode, errorMessage: providerFailure.providerError?.message ?? providerFailure.starverseDiagnosticCode,
      providerFailure, isStale: true }, category)
  }
}

function canRunManualRefresh(providerKey: ProviderCatalogKnownProviderKey): boolean {
  const scopeKey = catalogRuntimeScopeKey(providerKey)
  const now = Date.now()
  const lastRefreshAtMs = lastManualRefreshAtMsByScope.get(scopeKey) ?? 0
  if (now - lastRefreshAtMs < MANUAL_REFRESH_COOLDOWN_MS) return false
  lastManualRefreshAtMsByScope.set(scopeKey, now)
  return true
}

function onManualRefreshProvider(providerKey: ProviderCatalogKnownProviderKey = selectedSyncProviderKey.value) {
  if (!canRunManualRefresh(providerKey)) return
  void runSyncProvider(providerKey, true, 'manual_refresh')
}

function onProviderRowRefresh(providerId: RuntimeProviderId) {
  const providerKey = catalogProviderKeyForRuntimeProvider(providerId)
  if (providerKey === null) return
  onManualRefreshProvider(providerKey)
}

function onApplyCatalogUpdate() {
  void applyLatestCatalogList()
}

async function keepCurrentCatalogList() {
  const providerKey = selectedSyncProviderKey.value
  const category = categoryForProvider(providerKey)
  const scopeKey = catalogRuntimeScopeKey(providerKey, category)
  const pendingRevision = getCatalogRuntimeState(providerKey, category).pendingSnapshotDigest
  if (!pendingRevision) return
  const token = catalogRuntimeStore.beginMutation(scopeKey)
  publishCatalogRuntimeStore()
  let response: Record<string, unknown>
  try {
    response = await CatalogQueryService.discardPending({
      sourceProviderKey: providerKey,
      snapshotDigest: pendingRevision,
      ...(category ? { category } : {}),
    }) as Record<string, unknown>
  } catch (err) {
    response = { ok: false, code: 'MODEL_CATALOG_RENDERER_DISCARD_FAILED', message: err instanceof Error ? err.message : String(err) }
  }
  if (!catalogRuntimeStore.isCurrent(token)) return
  if (response.ok !== true) {
    const providerFailure = response.providerFailure && typeof response.providerFailure === 'object'
      ? response.providerFailure as ProviderFailureV2
      : rendererCatalogFailure(providerKey, response.code ?? 'catalog_discard_failed', response.message)
    catalogRuntimeStore.acceptFailure({ token, failure: providerFailure })
    publishCatalogRuntimeStore()
    return
  }
  const current = catalogRuntimeStore.read(scopeKey)
  catalogRuntimeStore.acceptAuthority({
    token,
    authorityScopeId: typeof response.scopeId === 'string' ? response.scopeId : current.authorityScopeId,
    displayedSnapshotDigest: current.displayedSnapshotDigest,
    pendingSnapshotDigest: null,
    items: current.items,
    stale: current.stale,
  })
  publishCatalogRuntimeStore()
}

function restoreFocusAfterClose() {
  if (!lastFocusBeforeOpen) return
  lastFocusBeforeOpen.focus()
  lastFocusBeforeOpen = null
}

function onClose() {
  if (props.disabled) return
  rememberPickerUiSnapshot()
  resetFavoriteEditorState()
  emit('close')
}

function onModelListScroll() {
  if (!props.open) return
  rememberPickerUiSnapshot()
}

async function commitSelection(
  selection: ConversationRouteSelection,
  displayName: string,
): Promise<void> {
  if (selectionPending.value) return
  const command = props.selectionCommand ?? (appIdentity === null ? undefined : catalogModelSelectionCommandV2ForApp(appIdentity))
  if (!command) {
    error.value = 'CATALOG_MODEL_SELECTION_COMMAND_UNAVAILABLE'
    return
  }
  selectionPending.value = true
  error.value = null
  try {
    await command(selection)
    emit('select', selection, displayName)
    emit('close')
  } catch (selectionFailure) {
    error.value = selectionFailure instanceof Error ? selectionFailure.message : String(selectionFailure)
  } finally {
    selectionPending.value = false
  }
}

function onSelectItem(item: PickerModelItem | null | undefined) {
  if (props.disabled || props.isRunning || selectionPending.value) return
  if (!item?.selectable) return
  rememberPickerUiSnapshot()
  void commitSelection(createProviderModelRouteSelection({ providerId: item.providerId, modelId: item.modelId }), item.displayName)
}

function onSelectCompatibleRoute(
  routeIntent: CompatibleRouteIntent,
  displayName: string,
) {
  if (props.disabled || props.isRunning || selectionPending.value) return
  void commitSelection(routeIntent, displayName)
}

function inspectCatalogModelFacts(providerId: RuntimeProviderId, modelId: string) {
  const subject = modelFactsSubjectForCatalogModelV1(providerId, modelId)
  if (subject) emit('inspectModelFacts', subject)
}

function inspectCompatibleModelFacts(routeIntent: CompatibleRouteIntent) {
  const subject = modelFactsSubjectForCompatibleModelV1(routeIntent.providerInstanceId, routeIntent.modelId)
  if (subject) emit('inspectModelFacts', subject)
}

function onSelectModel(modelId: string, providerId: RuntimeProviderId) {
  const normalized = String(modelId ?? '').trim()
  if (!normalized) return
  onSelectItem(pickerItems.value.find((item) => item.providerId === providerId && item.modelId === normalized))
}

function onToggleFavorite(item: PickerModelItem) {
  if (props.disabled || props.isRunning) return
  const normalized = String(item.modelId ?? '').trim()
  if (!normalized) return
  emit('toggleFavorite', item.providerId, normalized)
}

function findPickerItem(providerId: RuntimeProviderId, modelId: string): PickerModelItem | null {
  const normalized = normalizeModelId(modelId)
  return pickerItems.value.find((candidate) => candidate.providerId === providerId && candidate.modelId === normalized) ?? null
}

function onToggleShortcutFavorite(item: ShortcutItem) {
  const pickerItem = findPickerItem(item.providerId, item.modelId)
  if (pickerItem) onToggleFavorite(pickerItem)
}

function isFavoriteModel(modelId: string, providerId: RuntimeProviderId): boolean {
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
      dialogWasOpen = true
      openDialogState()
      return
    }
    if (dialogWasOpen) rememberPickerUiSnapshot()
    clearDebounceTimer()
    querySeq += 1
    providerFetchSeq.clear()
    hydratingProviderKeys.value = new Set()
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
  queryFilterSignature,
  () => {
    if (!props.open || skipAutoQuery) return
    scheduleRefresh(props.debounceMs)
  },
  { flush: 'post' },
)

watch(
  () => selectedProviderFilters.value.join('\n'),
  () => {
    if (!props.open || skipAutoQuery) return
    const selectedProviderKeys = selectedCatalogProviderKeys.value
    selectedProviderKeys.forEach((providerKey) => lastAutoSyncAtMsByScope.delete(catalogRuntimeScopeKey(providerKey)))
    void fetchPage({ preserveUiState: true }).then(() => {
      if (props.open) return triggerPickerOpenSync()
      return undefined
    })
  },
  { flush: 'post' },
)

watch(
  () => catalogProviderKeys.value.join('\n'),
  () => {
    ensureSelectedSyncProviderKey()
  },
  { immediate: true },
)

watch(
  selectedSyncProviderKey,
  (providerKey) => {
    if (!props.open) return
    lastAutoSyncAtMsByScope.delete(catalogRuntimeScopeKey(providerKey))
    void loadCatalogSyncSettings(providerKey).then(() => fetchProviderSyncStatus(providerKey))
  },
  { flush: 'post' },
)

watch(
  () => props.routeSelection,
  (nextRoute) => {
    if (!props.open) return
    if (nextRoute?.kind !== 'provider_model') return
    const providerId = nextRoute.providerId
    const normalized = normalizeModelId(nextRoute.modelId)
    if (!providerId || !normalized) return
    const selectedKey = pickerItemKey(providerId, normalized)
    if (pickerItems.value.some((item) => item.itemKey === selectedKey)) {
      activeModelKey.value = selectedKey
    }
  },
)

watch(
  () => normalizedEditableFavoriteModelKeys.value,
  () => {
    if (favoriteEditMode.value) return
    editableFavoriteModelKeys.value = normalizedEditableFavoriteModelKeys.value
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
  window.addEventListener('settings:providerCredentialUpdated', onProviderCredentialUpdated)
})

onBeforeUnmount(() => {
  unsubscribeCatalogRuntimeStore()
  window.removeEventListener('settings:providerCredentialUpdated', onProviderCredentialUpdated)
  clearDebounceTimer()
  modelDetailSeq += 1
  endpointSeq += 1
})
const selectedModelInCatalog = computed(() => {
  const providerId = selectedProvider.value
  const modelId = selectedModelIdentity.value
  if (!providerId || !modelId) return false
  return unfilteredPickerItems.value.some((item) =>
    item.providerId === providerId && normalizeModelId(item.modelId) === modelId
  )
})
const selectedModelVisible = computed(() => {
  const providerId = selectedProvider.value
  const modelId = selectedModelIdentity.value
  if (!providerId || !modelId) return false
  return pickerItems.value.some((item) =>
    item.providerId === providerId && normalizeModelId(item.modelId) === modelId
  )
})
const catalogHydratedOnce = ref(false)
const selectedModelUnlisted = computed(() =>
  catalogHydratedOnce.value && Boolean(selectedProvider.value && selectedModelIdentity.value) && !selectedModelInCatalog.value
)

watch(
  unfilteredPickerItems,
  (nextItems) => {
    for (const item of nextItems) {
      lastKnownModelLabels.set(item.itemKey, item.displayName)
    }
  },
  { immediate: true },
)

watch(
  selectedCategory,
  () => {
    if (!props.open || skipAutoQuery) return
    const providerKey = OPENROUTER_CATALOG_PROVIDER_KEY
    lastAutoSyncAtMsByScope.delete(catalogRuntimeScopeKey(providerKey))
    void fetchPage({ preserveUiState: true, providerKeys: [providerKey] }).then(() => {
      if (!props.open || !selectedProviderSet.value.has(runtimeProviderIdForCatalogProvider(providerKey))) return
      return triggerPickerOpenSync()
    })
  },
  { flush: 'post' },
)
const selectedModelFilteredOut = computed(() =>
  catalogHydratedOnce.value && selectedModelInCatalog.value && !selectedModelVisible.value
)
</script>

<template>
  <div
    v-if="props.open"
    class="sv-backdrop"
    data-testid="model-picker-dialog"
    @click.self="onClose"
    @keydown="onDialogKeydown"
  >
    <div class="sv-dialog mp-dialog flex h-[85vh] max-h-[880px] w-full max-w-6xl flex-col overflow-hidden"
      role="dialog" aria-modal="true" :aria-label="t('errors.modelCatalog.dialogTitle')">
      <div class="sv-divider-b flex h-14 shrink-0 items-center justify-between gap-3 px-5">
        <div class="sv-title">{{ t('errors.modelCatalog.dialogTitle') }}</div>
        <button
          type="button"
          class="sv-icon-btn"
          :title="t('common.close')"
          :disabled="props.disabled"
          data-testid="model-picker-close"
          @click="onClose"
        >
          <UiIcon name="close" :size="16" />
          <span class="sr-only">{{ t('common.close') }}</span>
        </button>
      </div>

      <div v-if="props.compatibleRouteSources.length" class="sv-divider-b max-h-32 shrink-0 overflow-auto px-5 py-3" data-testid="compatible-route-picker">
        <div class="sv-label">OpenAI Chat Completions-compatible</div>
        <div class="mt-2 flex flex-wrap gap-2">
          <template v-for="source in props.compatibleRouteSources" :key="source.providerInstanceId">
            <div v-for="model in source.models" :key="`${source.providerInstanceId}:${model.modelId}`" class="mp-route">
              <button type="button" class="min-w-0 flex-1 truncate text-left" :disabled="props.disabled || props.isRunning || selectionPending" :data-testid="`compatible-model-${source.providerInstanceId}-${model.modelId}`" @click="onSelectCompatibleRoute(model.routeIntent, model.displayName)">
                <span class="font-medium">{{ source.providerName }} · {{ model.displayName }}</span>
                <span class="ml-1 text-gray-500">{{ model.sourceLabel }}</span>
              </button>
              <button type="button" class="sv-btn sv-btn-sm sv-btn-ghost shrink-0" :disabled="props.disabled || props.isRunning" :data-testid="`compatible-model-inspect-${source.providerInstanceId}-${model.modelId}`" @click="inspectCompatibleModelFacts(model.routeIntent)">
                {{ t('settings.modelsCapabilities.inspectModelFacts') }}
              </button>
            </div>
          </template>
        </div>
      </div>

      <div class="mp-grid">
        <aside class="mp-filters">
          <details open class="mp-section">
            <summary class="mp-summary">
              <span class="mp-chev"><UiIcon name="chevronRight" :size="14" /></span>
              <span>{{ t('errors.modelCatalog.identitySearch') }}</span>
            </summary>
            <div class="mp-section-body">

              <div>
                <div class="flex items-center justify-between gap-2">
                  <div class="sv-label">{{ t('errors.modelCatalog.provider') }}</div>
                  <div class="flex items-center gap-1">
                    <button
                      type="button"
                      class="sv-btn sv-btn-ghost h-6 px-1.5 text-xs"
                      :aria-pressed="allProviderFiltersSelected"
                      :disabled="props.disabled"
                      data-testid="model-picker-provider-select-all"
                      @click="selectAllProviderFilters"
                    >
                      {{ t('errors.modelCatalog.selectAll') }}
                    </button>
                    <button
                      type="button"
                      class="sv-btn sv-btn-ghost h-6 px-1.5 text-xs"
                      :disabled="props.disabled"
                      data-testid="model-picker-provider-select-none"
                      @click="clearProviderFilters"
                    >
                      {{ t('errors.modelCatalog.selectNone') }}
                    </button>
                  </div>
                </div>
                <div class="mt-1 flex flex-col">
                  <div
                    v-for="provider in providerOptions"
                    :key="`provider-status-${provider.providerId}`"
                    class="mp-prov"
                    :data-testid="`model-picker-provider-status-${provider.providerId}`"
                  >
                    <label class="mp-opt min-w-0">
                      <input
                        type="checkbox"
                        class="mp-check"
                        :checked="selectedProviderSet.has(provider.providerId)"
                        :disabled="props.disabled"
                        :data-testid="`model-picker-provider-filter-${provider.providerId}`"
                        @change="toggleProviderFilter(provider.providerId, ($event.target as HTMLInputElement).checked)"
                      />
                      <span class="mp-prov-name" :title="provider.providerName">{{ provider.providerName }}</span>
                    </label>
                    <button
                      type="button"
                      class="sv-icon-btn"
                      :title="t('errors.modelCatalog.refresh')"
                      :disabled="props.disabled || provider.loading || catalogProviderKeyForRuntimeProvider(provider.providerId) === null"
                      :data-testid="`model-picker-provider-refresh-${provider.providerId}`"
                      @click="onProviderRowRefresh(provider.providerId)"
                    >
                      <UiIcon :name="provider.loading ? 'spinner' : 'refresh'" :size="14" />
                      <span class="sr-only">{{ t('errors.modelCatalog.refresh') }}</span>
                    </button>
                    <span class="mp-prov-status">
                      {{ provider.loading ? t('errors.modelCatalog.syncing') : provider.statusLabel }}
                    </span>
                  </div>
                </div>
              </div>
              <div>
                <label class="sv-label" for="model-picker-category">{{ t('errors.modelCatalog.category') }}</label>
                <select
                  id="model-picker-category"
                  v-model="selectedCategory"
                  class="sv-select sv-select-sm mt-1"
                  :disabled="props.disabled"
                  data-testid="model-picker-category"
                >
                  <option value="all">{{ t('errors.modelCatalog.allCategories') }}</option>
                  <option v-for="category in categoryOptions" :key="category" :value="category">{{ category }}</option>
                </select>
              </div>
              <div>
                <div class="sv-label">{{ t('errors.modelCatalog.vendorPrefix') }}</div>
                <div v-if="vendorOptions.length === 0" class="mt-1 text-xs text-gray-500">
                  {{ t('errors.modelCatalog.vendorOptionsPending') }}
                </div>
                <div v-else class="mt-1 flex max-h-32 flex-col overflow-auto">
                  <label
                    v-for="vendor in vendorOptions"
                    :key="vendor"
                    class="mp-opt"
                  >
                    <input
                      type="checkbox"
                      class="mp-check"
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

          <details class="mp-section">
            <summary class="mp-summary">
              <span class="mp-chev"><UiIcon name="chevronRight" :size="14" /></span>
              <span>{{ t('errors.modelCatalog.capabilityLimits') }}</span>
            </summary>
            <div class="mp-section-body">
              <div>
                <div class="sv-label">{{ t('errors.modelCatalog.contextLength') }}</div>
                <div class="mt-1 grid grid-cols-2 gap-2">
                  <input
                    v-model="contextLengthMin"
                    type="number"
                    min="0"
                    class="sv-input sv-input-sm"
                    :placeholder="t('errors.modelCatalog.minPlaceholder')"
                    :disabled="props.disabled"
                    data-testid="model-picker-context-min"
                  />
                  <input
                    v-model="contextLengthMax"
                    type="number"
                    min="0"
                    class="sv-input sv-input-sm"
                    :placeholder="t('errors.modelCatalog.maxPlaceholder')"
                    :disabled="props.disabled"
                    data-testid="model-picker-context-max"
                  />
                </div>
              </div>
              <div>
                <div class="sv-label">{{ t('errors.modelCatalog.maxCompletionTokens') }}</div>
                <div class="mt-1 grid grid-cols-2 gap-2">
                  <input
                    v-model="maxOutputTokensMin"
                    type="number"
                    min="0"
                    class="sv-input sv-input-sm"
                    :placeholder="t('errors.modelCatalog.minPlaceholder')"
                    :disabled="props.disabled"
                    data-testid="model-picker-max-output-min"
                  />
                  <input
                    v-model="maxOutputTokensMax"
                    type="number"
                    min="0"
                    class="sv-input sv-input-sm"
                    :placeholder="t('errors.modelCatalog.maxPlaceholder')"
                    :disabled="props.disabled"
                    data-testid="model-picker-max-output-max"
                  />
                </div>
              </div>
            </div>
          </details>

          <details class="mp-section">
            <summary class="mp-summary">
              <span class="mp-chev"><UiIcon name="chevronRight" :size="14" /></span>
              <span>{{ t('errors.modelCatalog.modalities') }}</span>
            </summary>
            <div class="mp-section-body">
              <div>
                <button
                  type="button"
                  class="sv-btn sv-btn-sm"
                  :aria-pressed="selectedOutputModalities.length === 1 && selectedOutputModalities[0] === 'image'"
                  :disabled="props.disabled"
                  data-testid="model-picker-quick-image-output"
                  @click="toggleQuickImageOutputFilter"
                >
                  {{ selectedOutputModalities.length === 1 && selectedOutputModalities[0] === 'image' ? t('errors.modelCatalog.imageOutputOnlyOn') : t('errors.modelCatalog.imageOutputOnlyOff') }}
                </button>
                <div class="mt-1 text-xs text-gray-500">{{ t('errors.modelCatalog.imageOutputOnlyHelp') }}</div>
              </div>
              <div>
                <div class="sv-label">{{ t('errors.modelCatalog.architecture') }}</div>
                <div class="mt-1 flex flex-wrap gap-x-3">
                  <label
                    v-for="option in architectureModalityOptions"
                    :key="option"
                    class="mp-opt"
                  >
                    <input
                      type="checkbox"
                      class="mp-check"
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
                <div class="sv-label">{{ t('errors.modelCatalog.inputModalities') }}</div>
                <div class="mt-1 flex flex-wrap gap-x-3">
                  <label
                    v-for="option in modalityOptions"
                    :key="`input-${option}`"
                    class="mp-opt"
                  >
                    <input
                      type="checkbox"
                      class="mp-check"
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
                <div class="sv-label">{{ t('errors.modelCatalog.outputModalities') }}</div>
                <div class="mt-1 flex flex-wrap gap-x-3">
                  <label
                    v-for="option in modalityOptions"
                    :key="`output-${option}`"
                    class="mp-opt"
                  >
                    <input
                      type="checkbox"
                      class="mp-check"
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

          <details class="mp-section">
            <summary class="mp-summary">
              <span class="mp-chev"><UiIcon name="chevronRight" :size="14" /></span>
              <span>{{ t('errors.modelCatalog.features') }}</span>
            </summary>
            <div class="mp-section-body">
              <div>
                <div class="sv-label">{{ t('errors.modelCatalog.supportedParameters') }}</div>
                <div class="mt-1 flex max-h-32 flex-col overflow-auto">
                  <label
                    v-for="option in effectiveSupportedParameterOptions"
                    :key="option"
                    class="mp-opt"
                  >
                    <input
                      type="checkbox"
                      class="mp-check"
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
                <label class="sv-label" for="model-picker-tokenizers">{{ t('errors.modelCatalog.tokenizerCsv') }}</label>
                <input
                  id="model-picker-tokenizers"
                  v-model="tokenizerFiltersText"
                  type="text"
                  class="sv-input sv-input-sm mt-1"
                  :placeholder="t('errors.modelCatalog.tokenizerPlaceholder')"
                  :disabled="props.disabled"
                  data-testid="model-picker-tokenizers"
                />
              </div>
              <div>
                <label class="sv-label" for="model-picker-instruct-types">{{ t('errors.modelCatalog.instructTypeCsv') }}</label>
                <input
                  id="model-picker-instruct-types"
                  v-model="instructTypeFiltersText"
                  type="text"
                  class="sv-input sv-input-sm mt-1"
                  :placeholder="t('errors.modelCatalog.instructTypePlaceholder')"
                  :disabled="props.disabled"
                  data-testid="model-picker-instruct-types"
                />
              </div>
              <div>
                <label class="sv-label" for="model-picker-per-request-limits">{{ t('errors.modelCatalog.perRequestLimits') }}</label>
                <select
                  id="model-picker-per-request-limits"
                  v-model="hasPerRequestLimits"
                  class="sv-select sv-select-sm mt-1"
                  :disabled="props.disabled"
                  data-testid="model-picker-per-request-limits"
                >
                  <option value="any">{{ t('errors.modelCatalog.any') }}</option>
                  <option value="yes">{{ t('errors.modelCatalog.hasLimits') }}</option>
                  <option value="no">{{ t('errors.modelCatalog.noLimits') }}</option>
                </select>
              </div>
              <div>
                <label class="sv-label" for="model-picker-default-parameters">{{ t('errors.modelCatalog.defaultParameters') }}</label>
                <select
                  id="model-picker-default-parameters"
                  v-model="hasDefaultParameters"
                  class="sv-select sv-select-sm mt-1"
                  :disabled="props.disabled"
                  data-testid="model-picker-default-parameters"
                >
                  <option value="any">{{ t('errors.modelCatalog.any') }}</option>
                  <option value="yes">{{ t('errors.modelCatalog.hasDefaults') }}</option>
                  <option value="no">{{ t('errors.modelCatalog.noDefaults') }}</option>
                </select>
              </div>
            </div>
          </details>

          <details class="mp-section">
            <summary class="mp-summary">
              <span class="mp-chev"><UiIcon name="chevronRight" :size="14" /></span>
              <span>{{ t('errors.modelCatalog.complianceLifecycle') }}</span>
            </summary>
            <div class="mp-section-body">
              <div>
                <label class="sv-label" for="model-picker-is-moderated">{{ t('errors.modelCatalog.moderation') }}</label>
                <select
                  id="model-picker-is-moderated"
                  v-model="moderationFilter"
                  class="sv-select sv-select-sm mt-1"
                  :disabled="props.disabled"
                  data-testid="model-picker-is-moderated"
                >
                  <option value="any">{{ t('errors.modelCatalog.any') }}</option>
                  <option value="yes">{{ t('errors.modelCatalog.moderated') }}</option>
                  <option value="no">{{ t('errors.modelCatalog.unmoderated') }}</option>
                </select>
              </div>
              <div>
                <label class="mp-opt">
                  <input
                    v-model="expiringWithinEnabled"
                    type="checkbox"
                    class="mp-check"
                    :disabled="props.disabled"
                    data-testid="model-picker-expiring-toggle"
                  />
                  <span>{{ t('errors.modelCatalog.expiringWithinDays') }}</span>
                </label>
                <input
                  v-model="expiringWithinDays"
                  type="number"
                  min="0"
                  class="sv-input sv-input-sm mt-1"
                  placeholder="7"
                  :disabled="props.disabled || !expiringWithinEnabled"
                  data-testid="model-picker-expiring-days"
                />
              </div>
            </div>
          </details>

          <details class="mp-section">
            <summary class="mp-summary">
              <span class="mp-chev"><UiIcon name="chevronRight" :size="14" /></span>
              <span>{{ t('errors.modelCatalog.sort') }}</span>
            </summary>
            <div class="mp-section-body">
              <div class="grid grid-cols-2 gap-2">
                <select
                  v-model="sortBy"
                  class="sv-select sv-select-sm"
                  :disabled="props.disabled"
                  data-testid="model-picker-sort-by"
                >
                  <option v-for="option in sortByOptions" :key="option.key" :value="option.key">{{ option.label }}</option>
                </select>
                <select
                  v-model="sortOrder"
                  class="sv-select sv-select-sm"
                  :disabled="props.disabled"
                  data-testid="model-picker-sort-order"
                >
                  <option v-for="option in sortOrderOptions" :key="option.key" :value="option.key">{{ option.label }}</option>
                </select>
              </div>
            </div>
          </details>

          <div class="mp-block">
            <div class="sv-label">{{ t('errors.modelCatalog.current') }}</div>
            <div class="mt-1 break-all text-[13px] font-medium text-gray-900">{{ selectedModelLabel }}</div>
            <div
              v-if="selectedModelUnlisted"
              class="sv-notice sv-notice-warning mt-2"
              data-testid="model-picker-selected-model-unlisted"
            >
              {{ t('errors.modelCatalog.selectedModelUnlisted') }}
            </div>
            <div
              v-else-if="selectedModelFilteredOut"
              class="sv-notice mt-2 flex-col"
              data-testid="model-picker-selected-model-filtered"
            >
              <span>{{ t('errors.modelCatalog.selectedModelFiltered') }}</span>
              <button
                type="button"
                class="sv-btn sv-btn-sm"
                data-testid="model-picker-clear-filters-for-selected"
                @click="clearFiltersToRevealSelectedModel"
              >
                {{ t('errors.modelCatalog.clearFiltersToReveal') }}
              </button>
            </div>
            <div v-if="effectiveNotice" class="mt-2 text-xs text-gray-500">{{ effectiveNotice }}</div>
            <div v-if="error" class="mp-danger mt-2 text-xs">{{ error }}</div>
          </div>

          <div class="mp-block">
            <div class="flex min-h-7 items-center justify-between gap-2">
              <div class="sv-label">{{ t('errors.modelCatalog.favoritesOrder') }}</div>
              <div class="flex items-center gap-1">
                <button
                  v-if="!favoriteEditMode"
                  type="button"
                  class="sv-btn sv-btn-sm sv-btn-ghost"
                  :disabled="props.disabled || props.isRunning || normalizedEditableFavoriteModelKeys.length === 0"
                  data-testid="model-picker-favorites-edit"
                  @click="openFavoriteEditMode"
                >
                  {{ t('errors.modelCatalog.edit') }}
                </button>
                <template v-else>
                  <button
                    type="button"
                    class="sv-btn sv-btn-sm sv-btn-ghost"
                    :disabled="props.disabled || props.isRunning"
                    data-testid="model-picker-favorites-cancel"
                    @click="cancelFavoriteEditMode"
                  >
                    {{ t('common.cancel') }}
                  </button>
                  <button
                    type="button"
                    class="sv-btn sv-btn-sm sv-btn-primary"
                    :disabled="props.disabled || props.isRunning"
                    data-testid="model-picker-favorites-done"
                    @click="saveFavoriteOrder"
                  >
                    {{ t('errors.modelCatalog.done') }}
                  </button>
                </template>
              </div>
            </div>
            <div v-if="normalizedFavoriteModelKeys.length === 0" class="mt-1 text-xs text-gray-500">
              {{ t('errors.modelCatalog.noFavoritesYet') }}
            </div>
            <div v-else-if="!favoriteEditMode" class="mt-1 flex flex-col">
              <div
                v-for="modelKey in normalizedFavoriteModelKeys"
                :key="`favorite-preview-${modelKey}`"
                class="truncate py-1 text-[13px] text-gray-700"
              >
                {{ resolveFavoriteName(modelKey) }}
              </div>
            </div>
            <div v-else class="mt-1 flex flex-col gap-1" data-testid="model-picker-favorites-editor">
              <div
                v-for="(modelKey, index) in editableFavoriteModelKeys"
                :key="`favorite-edit-${modelKey}`"
                class="mp-fav-card"
                draggable="true"
                :data-testid="`model-picker-favorites-card-${index}`"
                @dragstart="onFavoriteDragStart(index, $event)"
                @dragover="onFavoriteDragOver($event)"
                @drop="onFavoriteDrop(index, $event)"
                @dragend="onFavoriteDragEnd"
              >
                <span class="mp-grip" aria-hidden="true"><UiIcon name="grip" :size="14" /></span>
                <div class="min-w-0 flex-1 whitespace-normal break-words text-[13px] leading-tight text-gray-800">
                  {{ resolveFavoriteName(modelKey) }}
                </div>
                <button
                  type="button"
                  class="sv-icon-btn shrink-0"
                  :title="t('common.remove')"
                  :disabled="props.disabled || props.isRunning"
                  :data-testid="`model-picker-favorites-remove-${index}`"
                  @click="removeEditableFavorite(index)"
                >
                  <UiIcon name="close" :size="14" />
                  <span class="sr-only">{{ t('common.remove') }}</span>
                </button>
              </div>
            </div>
          </div>
        </aside>

        <section class="mp-results">
          <div class="shrink-0 px-4 pb-2 pt-4">
            <label class="sv-label" for="model-picker-search">{{ t('errors.modelCatalog.search') }}</label>
            <div class="relative mt-1">
              <span class="pointer-events-none absolute left-2.5 top-1/2 flex -translate-y-1/2 text-gray-500"><UiIcon name="search" :size="14" /></span>
              <input
                id="model-picker-search"
                ref="searchInputRef"
                v-model="searchText"
                type="text"
                class="sv-input pl-8"
                :placeholder="t('errors.modelCatalog.searchPlaceholder')"
                :disabled="props.disabled"
                data-testid="model-picker-search"
              />
            </div>
            <label class="mp-opt mt-2">
              <input
                v-model="includeDescriptionInSearch"
                type="checkbox"
                class="mp-check"
                :disabled="props.disabled"
                data-testid="model-picker-include-description"
              />
              <span>{{ t('errors.modelCatalog.includingDescription') }}</span>
            </label>
          </div>
          <div class="flex min-h-0 flex-1 flex-col">
            <div
              ref="listScrollRef"
              class="min-h-0 flex-1 overflow-auto px-2"
              data-testid="model-picker-list"
              @scroll="onModelListScroll"
            >
              <template v-if="activePickerMode === 'all'">
                <div v-if="loading && pickerItems.length === 0" class="px-3 py-6 text-sm text-gray-500">{{ t('errors.modelCatalog.loadingModels') }}</div>
                <div v-else-if="!loading && pickerItems.length === 0" class="px-3 py-6 text-sm text-gray-500">
                  {{ t('errors.modelCatalog.noModelsFound') }}
                </div>
                <template v-else>
                  <div :style="{ height: `${topPaddingPx}px` }" />
                  <button
                    v-for="item in visibleItems"
                    :key="item.itemKey"
                    type="button"
                    class="mp-row sv-row"
                    :class="{ 'is-selected': isSelectedItem(item), 'is-unavailable': !item.selectable }"
                    :aria-current="isSelectedItem(item) ? 'true' : undefined"
                    :data-testid="item.providerId === OPENROUTER_PROVIDER_ID ? `model-picker-item-${item.modelId}` : `model-picker-item-${item.providerId}-${item.modelId}`"
                    :disabled="props.disabled || props.isRunning || !item.selectable"
                    @mouseenter="activeModelKey = item.itemKey"
                    @focus="activeModelKey = item.itemKey"
                    @click="onSelectItem(item)"
                    :ref="(el) => onRowRef(item, el as Element | null)"
                  >
                    <span class="mp-row-body">
                      <span class="mp-row-name">{{ item.displayName }}</span>
                      <span class="mp-row-sub">{{ `${item.providerName} · ${item.modelId}` }}</span>
                      <span v-if="item.description" class="mp-row-desc">{{ item.description }}</span>
                      <span class="mp-row-meta">
                        <span>{{ item.statusLabel }}</span>
                        <span>{{ item.sourceLabel }}</span>
                      </span>
                    </span>
                    <span class="mp-row-aside">
                      <button
                        v-if="item.providerId === OPENROUTER_PROVIDER_ID"
                        type="button"
                        class="sv-icon-btn mp-star"
                        :aria-pressed="isFavoriteModel(item.modelId, item.providerId)"
                        :title="t('composer.modelPicker.favoriteModels')"
                        :disabled="props.disabled || props.isRunning"
                        :data-testid="`model-picker-favorite-${item.modelId}`"
                        @click.stop="onToggleFavorite(item)"
                      >
                        <UiIcon name="star" :filled="isFavoriteModel(item.modelId, item.providerId)" :size="14" />
                        <span class="sr-only">{{ t('composer.modelPicker.favoriteModels') }}</span>
                      </button>
                    </span>
                  </button>
                  <div :style="{ height: `${bottomPaddingPx}px` }" />
                </template>
              </template>
              <template v-else>
                <div v-if="activeShortcutItems.length === 0" class="px-3 py-6 text-sm text-gray-500">
                  {{ activePickerMode === 'favorites' ? t('errors.modelCatalog.noFavoriteModels') : t('errors.modelCatalog.noRecentModels') }}
                </div>
                <template v-else>
                  <button
                    v-for="item in activeShortcutItems"
                    :key="`${activePickerMode}-${item.modelKey}`"
                    type="button"
                    class="mp-row sv-row"
                    :class="{ 'is-selected': item.available && isSelectedModel(item.modelId, item.providerId), 'is-unavailable': !item.available }"
                    :aria-current="item.available && isSelectedModel(item.modelId, item.providerId) ? 'true' : undefined"
                    :data-testid="`model-picker-${activePickerMode}-item-${item.modelId}`"
                    :disabled="props.disabled || props.isRunning || !item.available"
                    @mouseenter="activeModelKey = item.modelKey"
                    @focus="activeModelKey = item.modelKey"
                    @click="onSelectModel(item.modelId, item.providerId)"
                  >
                    <span class="mp-row-body">
                      <span class="mp-row-name">{{ item.name }}</span>
                      <span class="mp-row-sub">{{ item.modelId }}</span>
                    </span>
                    <span class="mp-row-aside">
                      <button
                        v-if="item.providerId === OPENROUTER_PROVIDER_ID"
                        type="button"
                        class="sv-icon-btn mp-star"
                        :aria-pressed="isFavoriteModel(item.modelId, item.providerId)"
                        :title="t('composer.modelPicker.favoriteModels')"
                        :disabled="props.disabled || props.isRunning"
                        :data-testid="`model-picker-favorite-${item.modelId}`"
                        @click.stop="onToggleShortcutFavorite(item)"
                      >
                        <UiIcon name="star" :filled="isFavoriteModel(item.modelId, item.providerId)" :size="14" />
                        <span class="sr-only">{{ t('composer.modelPicker.favoriteModels') }}</span>
                      </button>
                    </span>
                  </button>
                </template>
              </template>
            </div>

            <div class="shrink-0 px-4 py-2 text-xs text-gray-500">
              {{ activePickerMode === 'all' ? tf('errors.modelCatalog.resultCount', { count: pickerItems.length }) : tf('errors.modelCatalog.modelCount', { count: activeShortcutItems.length }) }}
            </div>
          </div>
        </section>

        <section class="mp-detail">
          <div class="sv-segmented w-full">
            <button
              type="button"
              :aria-pressed="activeDetailTab === 'model'"
              data-testid="model-picker-detail-tab-model"
              @click="setActiveDetailTab('model')"
            >
              {{ t('errors.modelCatalog.detailTabModel') }}
            </button>
            <button
              type="button"
              :aria-pressed="activeDetailTab === 'endpoints'"
              data-testid="model-picker-detail-tab-endpoints"
              @click="setActiveDetailTab('endpoints')"
            >
              {{ t('errors.modelCatalog.detailTabEndpoints') }}
            </button>
          </div>

          <div
            v-if="activeDetailTab === 'model' && activeDetailItem && activeDetailItem.providerId !== OPENROUTER_PROVIDER_ID"
            class="text-xs text-gray-700"
            data-testid="model-picker-provider-detail"
          >
            <div class="sv-label">{{ t('errors.modelCatalog.providerModel') }}</div>
            <div class="mt-1 text-sm font-semibold text-gray-900">{{ activeDetailItem.displayName }}</div>
            <div class="mt-1 break-all text-xs text-gray-500">{{ `${activeDetailItem.providerName} · ${activeDetailItem.modelId}` }}</div>
            <dl class="mp-dl mt-3">
              <div>
                <dt>{{ t('errors.modelCatalog.status') }}</dt>
                <dd>{{ activeDetailItem.statusLabel }}</dd>
              </div>
              <div>
                <dt>{{ t('errors.modelCatalog.source') }}</dt>
                <dd>{{ activeDetailItem.sourceLabel ?? t('errors.modelCatalog.providerSource') }}</dd>
              </div>
            </dl>
            <button
              type="button"
              class="sv-btn sv-btn-sm mt-3"
              :disabled="props.disabled || !activeDetailItem"
              data-testid="model-picker-inspect-model-facts"
              @click="inspectCatalogModelFacts(activeDetailItem!.providerId, activeDetailItem!.modelId)"
            >
              {{ t('settings.modelsCapabilities.inspectModelFacts') }}
            </button>
          </div>
          <ModelDetailPanel
            v-else-if="activeDetailTab === 'model'"
            :modelId="activeDetailModelId"
            :loading="modelDetailLoading"
            :detail="modelDetail"
            :error="modelDetailError"
            :disabled="props.disabled || !activeDetailModelId"
          />
          <button
            v-if="activeDetailTab === 'model' && activeDetailItem?.providerId === OPENROUTER_PROVIDER_ID"
            type="button"
            class="sv-btn sv-btn-sm self-start"
            :disabled="props.disabled || !activeDetailItem"
            data-testid="model-picker-inspect-model-facts-openrouter"
            @click="inspectCatalogModelFacts(activeDetailItem!.providerId, activeDetailItem!.modelId)"
          >
            {{ t('settings.modelsCapabilities.inspectModelFacts') }}
          </button>
          <EndpointDetailPanel
            v-if="activeDetailTab === 'endpoints'"
            :modelId="activeDetailModelId"
            :loading="endpointLoading"
            :fetchedAtMs="endpointFetchedAtMs"
            :items="endpointItems"
            :error="endpointError"
            :disabled="props.disabled || !activeDetailModelId || activeDetailItem?.providerId !== OPENROUTER_PROVIDER_ID"
            @refresh="onRefreshEndpointDetails"
          />
        </section>
      </div>

      <div v-if="selectedSyncSnapshot.providerFailure" class="max-h-40 shrink-0 overflow-auto px-5 pb-3">
        <ProviderFailureDetailsV2
          :failure="selectedSyncSnapshot.providerFailure"
          test-id-prefix="model-picker-provider-failure"
        />
      </div>

      <div class="mp-footer flex h-[68px] shrink-0 items-center gap-4 border-t border-(--sv-line) px-5 text-xs">
        <div class="flex shrink-0 items-center gap-2">
          <label class="text-gray-500" for="model-picker-sync-provider">
            {{ t('errors.modelCatalog.provider') }}
          </label>
          <select
            id="model-picker-sync-provider"
            v-model="selectedSyncProviderKey"
            class="sv-select sv-select-sm w-40"
            :disabled="props.disabled || syncProviderOptions.length === 0"
            data-testid="model-picker-sync-provider"
          >
            <option
              v-for="provider in syncProviderOptions"
              :key="`sync-provider-${provider.catalogProviderKey}`"
              :value="provider.catalogProviderKey"
            >
              {{ provider.providerName }}
            </option>
          </select>
        </div>
        <div class="mp-status min-w-0 flex-1">
          <template v-if="pendingCatalogUpdateAvailable">
            <span v-if="pendingCatalogUpdateIsEmpty" class="mp-warn" data-testid="model-picker-empty-update">
              {{ t('errors.modelCatalog.emptyUpdate') }}
            </span>
            <span v-else class="text-gray-700" data-testid="model-picker-update-available">
              {{ t('errors.modelCatalog.updateAvailable') }}
            </span>
            <button
              v-if="pendingCatalogUpdateIsEmpty"
              type="button"
              class="sv-btn sv-btn-sm mx-1 align-middle"
              :disabled="props.disabled || loading"
              data-testid="model-picker-keep-current-catalog"
              @click="keepCurrentCatalogList"
            >
              {{ t('errors.modelCatalog.keepCurrentCatalog') }}
            </button>
            <button
              type="button"
              class="sv-btn sv-btn-sm mx-1 align-middle"
              :disabled="props.disabled || loading"
              data-testid="model-picker-apply-update"
              @click="onApplyCatalogUpdate"
            >
              {{ pendingCatalogUpdateIsEmpty ? t('errors.modelCatalog.acceptEmptyUpdate') : t('errors.modelCatalog.applyUpdate') }}
            </button>
          </template>
          <span v-if="selectedSyncSnapshot.status === 'not_synced'">
            {{ t('errors.modelCatalog.syncNotSynced') }}
          </span>
          <span v-else-if="selectedSyncSnapshot.status === 'syncing'">
            {{ t('errors.modelCatalog.syncSyncing') }}
          </span>
          <span v-else-if="selectedSyncSnapshot.status === 'synced'" class="text-gray-700">
            {{ formatProviderSyncStatusText(selectedSyncSnapshot) }}
          </span>
          <span v-else-if="selectedSyncSnapshot.status === 'failed'" class="mp-danger">
            {{ tf('errors.modelCatalog.syncFailedReason', { reason: modelCatalogSyncFailureReasonText(selectedSyncSnapshot) }) }}
          </span>
          <span
            v-if="selectedSyncSnapshot.status === 'failed' && selectedSyncSnapshot.totalModelCount > 0"
            class="mp-warn"
            data-testid="model-picker-using-last-known-good"
          >
            {{ t('errors.modelCatalog.usingLastKnownGood') }}
          </span>
          <span
            v-else-if="selectedSyncSnapshot.isStale && selectedSyncSnapshot.totalModelCount > 0"
            class="mp-warn"
            data-testid="model-picker-stale-snapshot"
          >
            {{ t('errors.modelCatalog.staleSnapshot') }}
          </span>
          <span data-testid="model-picker-sync-last-synced">
            {{ tf('errors.modelCatalog.lastSyncedAt', { time: formatSyncTime(selectedSyncSnapshot.lastSyncedAtMs) }) }}
          </span>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <button
            type="button"
            class="sv-btn w-24"
            :disabled="selectedSyncSnapshot.status === 'syncing' || props.disabled"
            data-testid="model-picker-sync-refresh"
            @click="onManualRefreshProvider()"
          >
            <UiIcon :name="selectedSyncSnapshot.status === 'syncing' ? 'spinner' : 'refresh'" :size="14" />
            {{ t('errors.modelCatalog.sync') }}
          </button>
          <button type="button" class="sv-btn sv-btn-primary w-32" data-testid="model-picker-use-model"
            :disabled="props.disabled || props.isRunning || selectionPending || !activeDetailItem?.selectable"
            @keydown.enter.stop
            @click="onSelectItem(activeDetailItem)">{{ t('errors.modelCatalog.useModel') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ---- layout: container-driven so the dialog adapts to its own width ---- */
.mp-dialog { container-type: inline-size; container-name: mp; }
.mp-grid {
  display: grid;
  flex: 1 1 0;
  min-height: 0;
  grid-template-columns: 224px minmax(0, 1fr) 320px;
}
.mp-grid > * { min-width: 0; min-height: 0; }
@container mp (max-width: 999px) {
  .mp-grid { grid-template-columns: 208px minmax(0, 1fr) 256px; }
}
@container mp (max-width: 719px) {
  .mp-grid { grid-template-columns: 208px minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) minmax(0, 40%); }
  .mp-detail { grid-column: 1 / -1; border-left: 0; border-top: 1px solid var(--sv-line); }
}

/* ---- left: filters ---- */
.mp-filters {
  overflow: auto;
  padding: 8px 8px 16px;
  border-right: 1px solid var(--sv-line);
}
.mp-section + .mp-section,
.mp-section + .mp-block,
.mp-block + .mp-block { border-top: 1px solid var(--sv-line); }
.mp-block { padding: 12px 8px; font-size: 12px; color: var(--sv-text-2); }
.mp-summary {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 36px;
  padding: 0 8px;
  border-radius: var(--sv-radius-control);
  list-style: none;
  font-size: 13px;
  font-weight: 500;
  color: var(--sv-text);
}
.mp-summary::-webkit-details-marker { display: none; }
.mp-summary:hover { background: var(--sv-hover); }
.mp-chev {
  display: inline-flex;
  width: 16px;
  height: 16px;
  flex: none;
  align-items: center;
  justify-content: center;
  color: var(--sv-text-3);
  transition: transform 120ms;
}
.mp-section[open] > .mp-summary .mp-chev { transform: rotate(90deg); }
.mp-section-body { display: flex; flex-direction: column; gap: 12px; padding: 4px 8px 14px; }

.mp-opt { display: flex; min-width: 0; align-items: center; gap: 8px; min-height: 28px; font-size: 13px; color: var(--sv-text); }
.mp-check {
  appearance: none;
  display: inline-grid;
  place-content: center;
  width: 16px;
  height: 16px;
  flex: none;
  margin: 0;
  border: 1px solid var(--sv-field-border);
  border-radius: 4px;
  background: var(--sv-surface);
}
.mp-check:checked {
  border-color: var(--sv-primary);
  background: var(--sv-primary) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m5 12.5 4.5 4.5L19 7'/%3E%3C/svg%3E") center / 12px 12px no-repeat;
}
.mp-check:disabled { border-color: var(--sv-line-strong); background-color: var(--sv-sunken); }
.mp-check:checked:disabled { background-color: var(--sv-text-disabled); border-color: var(--sv-text-disabled); }

/* provider rows: the name always gets its own full-width line; status wraps beneath it */
.mp-prov {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 28px;
  align-items: center;
  column-gap: 4px;
  padding: 2px 0 4px;
}
.mp-prov-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mp-prov-status {
  grid-column: 1 / -1;
  padding-left: 24px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--sv-text-3);
  overflow-wrap: anywhere;
}

.mp-fav-card {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 2px 2px 0;
  border-radius: var(--sv-radius-control);
  cursor: grab;
}
.mp-fav-card:hover { background: var(--sv-hover); }
.mp-grip { display: inline-flex; width: 20px; flex: none; justify-content: center; color: var(--sv-text-3); }

.mp-route {
  display: flex;
  max-width: 100%;
  min-width: 0;
  align-items: center;
  gap: 4px;
  height: 32px;
  padding: 0 4px 0 10px;
  border: 1px solid var(--sv-line-strong);
  border-radius: var(--sv-radius-control);
  font-size: 12px;
}

/* ---- middle: results ---- */
.mp-results { display: flex; flex-direction: column; overflow: hidden; }
.mp-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 28px;
  align-items: start;
  column-gap: 8px;
  width: 100%;
  padding: 10px 8px 10px 12px;
  text-align: left;
}
.mp-row.is-unavailable .mp-row-name { color: var(--sv-text-3); }
.mp-row-body { display: flex; min-width: 0; flex-direction: column; gap: 1px; }
.mp-row-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 500; line-height: 1.4; color: var(--sv-text); }
.mp-row-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; line-height: 1.4; color: var(--sv-text-3); }
.mp-row-desc {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  margin-top: 2px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--sv-text-2);
}
.mp-row-meta { margin-top: 2px; font-size: 12px; line-height: 1.4; color: var(--sv-text-3); }
.mp-row-meta > span:empty { display: none; }
.mp-row-meta > span + span:not(:empty)::before { content: '·'; margin: 0 6px; }
.mp-row-aside { display: flex; justify-content: center; }
.mp-star { color: var(--sv-text-3); }
.mp-star[aria-pressed='true'] { background: transparent; color: var(--sv-text); }
.mp-star[aria-pressed='true']:hover:not(:disabled) { background: var(--sv-hover); }

/* ---- right: detail ---- */
.mp-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: auto;
  padding: 16px;
  border-left: 1px solid var(--sv-line);
}
.mp-dl { margin: 0; }
.mp-dl > div {
  display: grid;
  grid-template-columns: minmax(4.5rem, 38%) minmax(0, 1fr);
  gap: 0 12px;
  padding: 6px 0;
  border-top: 1px solid var(--sv-line);
}
.mp-dl dt { color: var(--sv-text-3); overflow-wrap: anywhere; }
.mp-dl dd { margin: 0; color: var(--sv-text); overflow-wrap: anywhere; }

/* ---- footer: fixed height, fixed-size controls; status text flexes and clamps in its own region ---- */
.mp-status {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
  line-height: 16px;
  color: var(--sv-text-3);
  overflow-wrap: anywhere;
}
.mp-status > span:not(:first-child)::before { content: '·'; margin: 0 6px; color: var(--sv-text-disabled); }
.mp-danger { color: var(--sv-danger); }
.mp-warn { color: var(--sv-warning); }
</style>
