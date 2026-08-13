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
import type { RuntimeProviderId } from '@/next/provider/runtimeProviderId'
import {
  createProviderModelRouteSelection,
  type ConversationRouteSelection,
} from '@/next/provider/conversationRouteSelection'
import type { ProviderModelPickerItem, ProviderModelPickerSource } from '../app/providerModelPickerViewModel'
import type { CompatibleConfigurationPickerSource, CompatibleConfigurationSelection } from '@/next/provider/openai-chat-compatible/ui'
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
type SyncProviderOption = ProviderFilterOption & Readonly<{ providerId: ProviderCatalogKnownProviderKey }>
type PickerModelItem = CatalogQueryItem & Readonly<{
  providerId: RuntimeProviderId
  providerName: string
  itemKey: string
  capabilitySummary?: string
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
    compatibleConfigurationSources?: readonly CompatibleConfigurationPickerSource[]
    favoriteModelKeys?: readonly string[]
    recentModelKeys?: readonly string[]
    notice?: string | null
    debounceMs?: number
    queryFn?: QueryFn
    endpointDetailFn?: EndpointDetailFn
    modelDetailFn?: ModelDetailFn
    selectionCommand?: CatalogModelSelectionCommandV2
    forceOutputImageOnly?: boolean
  }>(),
  {
    disabled: false,
    isRunning: false,
    favoriteModelKeys: () => [],
    recentModelKeys: () => [],
    providerSources: () => [],
    compatibleConfigurationSources: () => [],
    notice: null,
    debounceMs: 250,
    queryFn: undefined,
    endpointDetailFn: undefined,
    modelDetailFn: undefined,
    selectionCommand: undefined,
    forceOutputImageOnly: false,
    routeSelection: null,
  },
)

const emit = defineEmits<{
  close: []
  select: [selection: ConversationRouteSelection, displayName: string]
  toggleFavorite: [modelId: string]
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
const selectedSyncProviderKey = ref<ProviderCatalogKnownProviderKey>(OPENROUTER_PROVIDER_ID as ProviderCatalogKnownProviderKey)
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
let modelDetailSeq = 0
let endpointSeq = 0
let skipAutoQuery = false
let lastFocusBeforeOpen: HTMLElement | null = null
let providerFiltersInitialized = false
let dialogWasOpen = false

const catalogProviderKeys = computed<ProviderCatalogKnownProviderKey[]>(() => {
  const keys = new Set<ProviderCatalogKnownProviderKey>([
    OPENROUTER_PROVIDER_ID as ProviderCatalogKnownProviderKey,
  ])
  for (const source of props.providerSources) {
    if (isProviderCatalogSourceKey(source.providerId)) {
      keys.add(source.providerId as ProviderCatalogKnownProviderKey)
    }
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
    items.value.map((item) => catalogProviderIdFromItem(item)),
  )
  return [
    ...catalogPickerItems.value,
    ...providerPickerItems.value.filter((item) => !catalogProvidersWithItems.has(item.providerId)),
  ]
})
const selectedProviderSet = computed(() => new Set(selectedProviderFilters.value))
const selectedCatalogProviderKeys = computed<ProviderCatalogKnownProviderKey[]>(() =>
  catalogProviderKeys.value.filter((providerId) => selectedProviderSet.value.has(providerId))
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
  ? props.routeSelection.modelId : props.routeSelection?.selection.modelId))

const selectedModelLabel = computed(() => {
  const selected = selectedModelIdentity.value
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
    const providerId = descriptor.providerKey
    const snapshot = getProviderSyncSnapshot(providerId)
    const catalogItemCount = items.value.filter((item) => catalogProviderIdFromItem(item) === providerId).length
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
      loading: hydratingProviderKeys.value.has(providerId) || snapshot?.status === 'syncing',
      count: knownCount > 0 ? knownCount : catalogItemCount,
    })
  }
  for (const source of props.providerSources) {
    const snapshot = isProviderCatalogSourceKey(source.providerId)
      ? getProviderSyncSnapshot(source.providerId as ProviderCatalogKnownProviderKey)
      : null
    const catalogCount = snapshot?.status === 'synced'
      ? snapshot.visibleModelCount ?? snapshot.totalModelCount
      : 0
    const catalogItemCount = items.value.filter((item) => catalogProviderIdFromItem(item) === source.providerId).length
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
  providerOptions.value.filter((provider): provider is SyncProviderOption => isProviderCatalogSourceKey(provider.providerId)),
)
const providerFilterIds = computed(() => providerOptions.value.map((provider) => provider.providerId))
const selectedProviderFilterCount = computed(() =>
  providerFilterIds.value.filter((providerId) => selectedProviderSet.value.has(providerId)).length
)
const allProviderFiltersSelected = computed(() =>
  providerFilterIds.value.length > 0 && selectedProviderFilterCount.value === providerFilterIds.value.length
)

function providerNameForId(providerId: RuntimeProviderId): string {
  if (isProviderCatalogSourceKey(providerId)) return catalogProviderNames[providerId]
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

function catalogProviderIdFromItem(item: CatalogQueryItem): RuntimeProviderId | null {
  const providerKey = String(item.providerKey ?? '').trim()
  return isProviderCatalogSourceKey(providerKey) ? providerKey : null
}

function toCatalogPickerItem(item: CatalogQueryItem): PickerModelItem | null {
  const providerId = catalogProviderIdFromItem(item)
  if (!providerId) return null
  return {
    ...item,
    providerId,
    providerName: providerNameForId(providerId),
    itemKey: pickerItemKey(providerId, item.modelId),
    capabilitySummary: structuredCapabilitySummary(item),
    statusLabel: formatCatalogStatusLabel(item.status ?? item.visibility ?? 'catalog'),
    sourceLabel: providerId === OPENROUTER_PROVIDER_ID
      ? t('errors.modelCatalog.sourceOpenRouterCatalog')
      : t('errors.modelCatalog.sourceProviderCatalog'),
    selectable: true,
    detailSource: providerId === OPENROUTER_PROVIDER_ID ? 'openrouter_catalog' : 'provider_catalog',
  }
}

function toProviderPickerItem(item: ProviderModelPickerItem): PickerModelItem {
  const structured = item as ProviderModelPickerItem & Readonly<{
    capabilities?: Partial<CatalogQueryItem['capabilities']>
    capabilityResolution?: Readonly<Record<string, Readonly<{ modelSupport?: string; enabled?: boolean }>>>
  }>
  const resolvedCapability = (key: keyof CatalogQueryItem['capabilities']): boolean => {
    const direct = structured.capabilities?.[key]
    if (typeof direct === 'boolean') return direct
    const resolution = structured.capabilityResolution?.[key]
    return resolution?.modelSupport === 'supported' || resolution?.enabled === true
  }
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
      reasoning: resolvedCapability('reasoning'),
      tools: resolvedCapability('tools'),
      structuredOutputs: resolvedCapability('structuredOutputs'),
      vision: resolvedCapability('vision'),
      longContext: resolvedCapability('longContext'),
    },
    observation: structured.observation ?? null,
    capabilityResolution: structured.capabilityResolution ?? null,
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

function structuredCapabilitySummary(item: CatalogQueryItem): string {
  if (item.capabilityResolution) {
    return (['textChat', 'reasoning', 'tools', 'structuredOutputs', 'vision'] as const)
      .map((key) => {
        const fact = item.capabilityResolution?.[key]
        if (!fact) return null
        const wire = fact.wireImplementation === 'implemented' ? 'wire' : 'no wire'
        return `${key}: ${fact.modelSupport} · ${fact.resolutionSource} · ${wire}`
      })
      .filter((value): value is string => value !== null)
      .join(' | ')
  }
  const capabilityKnown = item.capabilityResolution !== null ||
    item.capabilities.reasoning || item.capabilities.tools ||
    item.capabilities.vision || item.capabilities.longContext
  const labels: string[] = []
  if (Array.isArray(item.inputModalities) && item.inputModalities.length > 0) {
    labels.push(`in:${item.inputModalities.join('+')}`)
  }
  if (Array.isArray(item.outputModalities) && item.outputModalities.length > 0) {
    labels.push(`out:${item.outputModalities.join('+')}`)
  }
  if (!capabilityKnown) {
    return labels.length > 0
      ? `${labels.join(' · ')} · ${t('errors.modelCatalog.capabilityUnknown')}`
      : t('errors.modelCatalog.capabilityUnknown')
  }
  if (item.capabilities.reasoning) labels.push(t('errors.modelCatalog.capabilityReasoning'))
  if (item.capabilities.tools) labels.push(t('errors.modelCatalog.capabilityTools'))
  if (item.capabilities.vision) labels.push(t('errors.modelCatalog.capabilityVision'))
  if (item.capabilities.longContext) labels.push(t('errors.modelCatalog.capabilityLongContext'))
  return labels.length > 0 ? labels.join(' · ') : t('errors.modelCatalog.capabilityUnknown')
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
  const typedProviderKey = providerKey as ProviderCatalogKnownProviderKey
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
  items.value = items.value.filter((item) => catalogProviderIdFromItem(item) !== typedProviderKey)
  publishCatalogRuntimeStore()
  if (!props.open || !selectedProviderSet.value.has(typedProviderKey)) return
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
  if (!isProviderCatalogSourceKey(input.providerId)) return formatCatalogStatusLabel(input.fallbackStatusLabel)
  const snapshot = providerSyncSnapshots.value[catalogRuntimeScopeKey(input.providerId as ProviderCatalogKnownProviderKey)]
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
    providerId: providerKey,
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
  selectedSyncProviderKey.value = keys[0] ?? (OPENROUTER_PROVIDER_ID as ProviderCatalogKnownProviderKey)
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
  return providerOptions.value.some((option) => option.providerId === providerId)
    ? providerId as RuntimeProviderId
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

function hasImageGenerationSignal(item: CatalogQueryItem): boolean {
  if (selectedOutputModalities.value.includes('image')) return true
  const imagePrice = String(item.pricing.image ?? '').trim()
  return imagePrice.length > 0
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
  loading.value = true
  hydratingProviderKeys.value = new Set(providerKeys)
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
    if (currentSeq !== querySeq) return

    queryNotice.value = results.map((result) => String(result.notice ?? '').trim()).filter(Boolean).join(' ') || null
    results.forEach((result, index) => {
      const providerKey = providerKeys[index]
      if (!providerKey) return
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
    const refreshedProviders = new Set(providerKeys)
    items.value = [
      ...items.value.filter((item) => {
        const providerKey = catalogProviderIdFromItem(item)
        return providerKey === null || !refreshedProviders.has(providerKey as ProviderCatalogKnownProviderKey)
      }),
      ...providerKeys.flatMap((providerKey) => {
        const runtimeRequest = runtimeRequests.get(providerKey)
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
    if (currentSeq !== querySeq) return
    error.value = err?.message ? String(err.message) : t('errors.modelCatalog.queryFailed')
  } finally {
    if (currentSeq === querySeq) {
      loading.value = false
      hydratingProviderKeys.value = new Set()
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
  if (props.forceOutputImageOnly === true) {
    setOutputModalitiesFilter(['image'])
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
  const response = await CatalogQueryService.applyPending({
    sourceProviderKey: providerKey,
    snapshotDigest: pendingRevision,
    ...(category ? { category } : {}),
  }) as Record<string, unknown>
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
      if (policy.policy?.listApplyMode === 'automatic' && props.open && selectedProviderSet.value.has(providerKey)) {
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
  if (!isProviderCatalogSourceKey(providerId)) return
  onManualRefreshProvider(providerId)
}

function onApplyCatalogUpdate() {
  void applyLatestCatalogList()
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

function onSelectCompatibleConfiguration(
  selection: CompatibleConfigurationSelection,
  displayName: string,
) {
  if (props.disabled || props.isRunning || selectionPending.value) return
  void commitSelection({ schemaVersion: 1, kind: 'openai_chat_compatible', selection }, displayName)
}

function onSelectModel(modelId: string, providerId: RuntimeProviderId) {
  const normalized = String(modelId ?? '').trim()
  if (!normalized) return
  onSelectItem(pickerItems.value.find((item) => item.providerId === providerId && item.modelId === normalized))
}

function onToggleFavorite(item: PickerModelItem) {
  if (props.disabled || props.isRunning) return
  if (item.providerId !== OPENROUTER_PROVIDER_ID) return
  const normalized = String(item.modelId ?? '').trim()
  if (!normalized) return
  emit('toggleFavorite', normalized)
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
    const providerKey = OPENROUTER_PROVIDER_ID as ProviderCatalogKnownProviderKey
    lastAutoSyncAtMsByScope.delete(catalogRuntimeScopeKey(providerKey))
    void fetchPage({ preserveUiState: true, providerKeys: [providerKey] }).then(() => {
      if (!props.open || !selectedProviderSet.value.has(providerKey)) return
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
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    data-testid="model-picker-dialog"
    @click.self="onClose"
    @keydown="onDialogKeydown"
  >
    <div class="flex h-[85vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
      <div class="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
        <div class="text-sm font-semibold text-gray-900">{{ t('errors.modelCatalog.dialogTitle') }}</div>
        <button
          type="button"
          class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          :disabled="props.disabled"
          data-testid="model-picker-close"
          @click="onClose"
        >
          {{ t('common.close') }}
        </button>
      </div>

      <div v-if="props.compatibleConfigurationSources.length" class="border-b border-gray-200 bg-blue-50 px-4 py-3" data-testid="compatible-configuration-picker">
        <div class="text-xs font-semibold text-blue-900">OpenAI Chat Completions-compatible · configuration only</div>
        <div class="mt-2 flex flex-wrap gap-2">
          <template v-for="source in props.compatibleConfigurationSources" :key="source.providerInstanceId">
            <button v-for="model in source.models" :key="`${source.providerInstanceId}:${model.modelId}`" type="button" class="rounded border border-blue-200 bg-white px-2 py-1 text-left text-xs" :disabled="props.disabled || props.isRunning || selectionPending" :data-testid="`compatible-model-${source.providerInstanceId}-${model.modelId}`" @click="onSelectCompatibleConfiguration(model.selection, model.displayName)">
              <span class="font-medium">{{ source.providerName }} · {{ model.displayName }}</span>
              <span class="ml-1 text-blue-700">{{ model.sourceLabel }}</span>
            </button>
          </template>
        </div>
      </div>

      <div class="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside class="min-h-0 space-y-3 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3">
          <details open class="rounded-md border border-gray-200 bg-white px-3 py-2">
            <summary class="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              {{ t('errors.modelCatalog.identitySearch') }}
            </summary>
            <div class="mt-2 space-y-3">
              <div>
                <label class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{{ t('errors.modelCatalog.search') }}</label>
                <input
                  ref="searchInputRef"
                  v-model="searchText"
                  type="text"
                  class="mt-1 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  :placeholder="t('errors.modelCatalog.searchPlaceholder')"
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
                  <span>{{ t('errors.modelCatalog.includingDescription') }}</span>
                </label>
              </div>
              <div>
                <div class="flex items-center justify-between gap-2">
                  <label class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{{ t('errors.modelCatalog.provider') }}</label>
                  <div class="flex items-center gap-1">
                    <button
                      type="button"
                      class="rounded border px-1.5 py-0.5 text-[10px] shadow-sm disabled:opacity-50"
                      :class="allProviderFiltersSelected ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'"
                      :disabled="props.disabled"
                      data-testid="model-picker-provider-select-all"
                      @click="selectAllProviderFilters"
                    >
                      {{ t('errors.modelCatalog.selectAll') }}
                    </button>
                    <button
                      type="button"
                      class="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] text-gray-600 shadow-sm hover:bg-gray-50 disabled:opacity-50"
                      :disabled="props.disabled"
                      data-testid="model-picker-provider-select-none"
                      @click="clearProviderFilters"
                    >
                      {{ t('errors.modelCatalog.selectNone') }}
                    </button>
                  </div>
                </div>
                <div class="mt-2 space-y-1">
                  <div
                    v-for="provider in providerOptions"
                    :key="`provider-status-${provider.providerId}`"
                    class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-[11px]"
                    :data-testid="`model-picker-provider-status-${provider.providerId}`"
                  >
                    <button
                      type="button"
                      class="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] text-gray-600 shadow-sm hover:bg-gray-50 disabled:opacity-50"
                      :disabled="props.disabled || provider.loading || !isProviderCatalogSourceKey(provider.providerId)"
                      :data-testid="`model-picker-provider-refresh-${provider.providerId}`"
                      @click="onProviderRowRefresh(provider.providerId)"
                    >
                      {{ provider.loading ? '…' : t('errors.modelCatalog.refresh') }}
                    </button>
                    <label class="flex min-w-0 items-center gap-2">
                      <input
                        type="checkbox"
                        class="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        :checked="selectedProviderSet.has(provider.providerId)"
                        :disabled="props.disabled"
                        :data-testid="`model-picker-provider-filter-${provider.providerId}`"
                        @change="toggleProviderFilter(provider.providerId, ($event.target as HTMLInputElement).checked)"
                      />
                      <span class="truncate font-medium text-gray-700">{{ provider.providerName }}</span>
                    </label>
                    <span :class="provider.loading ? 'text-blue-600' : provider.count > 0 ? 'text-green-700' : 'text-gray-500'">
                      {{ provider.loading ? t('errors.modelCatalog.syncing') : provider.statusLabel }}
                    </span>
                  </div>
                </div>
              </div>
              <div>
                <label class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{{ t('errors.modelCatalog.category') }}</label>
                <select
                  v-model="selectedCategory"
                  class="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
                  :disabled="props.disabled"
                  data-testid="model-picker-category"
                >
                  <option value="all">{{ t('errors.modelCatalog.allCategories') }}</option>
                  <option v-for="category in categoryOptions" :key="category" :value="category">{{ category }}</option>
                </select>
              </div>
              <div>
                <div class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{{ t('errors.modelCatalog.vendorPrefix') }}</div>
                <div v-if="vendorOptions.length === 0" class="mt-1 text-[11px] text-gray-400">
                  {{ t('errors.modelCatalog.vendorOptionsPending') }}
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
              {{ t('errors.modelCatalog.capabilityLimits') }}
            </summary>
            <div class="mt-2 space-y-3">
              <div>
                <div class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{{ t('errors.modelCatalog.contextLength') }}</div>
                <div class="mt-1 grid grid-cols-2 gap-2">
                  <input
                    v-model="contextLengthMin"
                    type="number"
                    min="0"
                    class="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
                    :placeholder="t('errors.modelCatalog.minPlaceholder')"
                    :disabled="props.disabled"
                    data-testid="model-picker-context-min"
                  />
                  <input
                    v-model="contextLengthMax"
                    type="number"
                    min="0"
                    class="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
                    :placeholder="t('errors.modelCatalog.maxPlaceholder')"
                    :disabled="props.disabled"
                    data-testid="model-picker-context-max"
                  />
                </div>
              </div>
              <div>
                <div class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{{ t('errors.modelCatalog.maxCompletionTokens') }}</div>
                <div class="mt-1 grid grid-cols-2 gap-2">
                  <input
                    v-model="maxOutputTokensMin"
                    type="number"
                    min="0"
                    class="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
                    :placeholder="t('errors.modelCatalog.minPlaceholder')"
                    :disabled="props.disabled"
                    data-testid="model-picker-max-output-min"
                  />
                  <input
                    v-model="maxOutputTokensMax"
                    type="number"
                    min="0"
                    class="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
                    :placeholder="t('errors.modelCatalog.maxPlaceholder')"
                    :disabled="props.disabled"
                    data-testid="model-picker-max-output-max"
                  />
                </div>
              </div>
            </div>
          </details>

          <details class="rounded-md border border-gray-200 bg-white px-3 py-2">
            <summary class="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              {{ t('errors.modelCatalog.modalities') }}
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
                  {{ selectedOutputModalities.length === 1 && selectedOutputModalities[0] === 'image' ? t('errors.modelCatalog.imageOutputOnlyOn') : t('errors.modelCatalog.imageOutputOnlyOff') }}
                </button>
                <div class="text-[11px] text-gray-500">{{ t('errors.modelCatalog.imageOutputOnlyHelp') }}</div>
              </div>
              <div>
                <div class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{{ t('errors.modelCatalog.architecture') }}</div>
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
                <div class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{{ t('errors.modelCatalog.inputModalities') }}</div>
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
                <div class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{{ t('errors.modelCatalog.outputModalities') }}</div>
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
              {{ t('errors.modelCatalog.features') }}
            </summary>
            <div class="mt-2 space-y-3">
              <div>
                <div class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{{ t('errors.modelCatalog.supportedParameters') }}</div>
                <div class="mt-1 max-h-28 space-y-1 overflow-auto">
                  <label
                    v-for="option in effectiveSupportedParameterOptions"
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
                <label class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{{ t('errors.modelCatalog.tokenizerCsv') }}</label>
                <input
                  v-model="tokenizerFiltersText"
                  type="text"
                  class="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
                  :placeholder="t('errors.modelCatalog.tokenizerPlaceholder')"
                  :disabled="props.disabled"
                  data-testid="model-picker-tokenizers"
                />
              </div>
              <div>
                <label class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{{ t('errors.modelCatalog.instructTypeCsv') }}</label>
                <input
                  v-model="instructTypeFiltersText"
                  type="text"
                  class="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
                  :placeholder="t('errors.modelCatalog.instructTypePlaceholder')"
                  :disabled="props.disabled"
                  data-testid="model-picker-instruct-types"
                />
              </div>
              <div class="grid grid-cols-1 gap-2">
                <label class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{{ t('errors.modelCatalog.perRequestLimits') }}</label>
                <select
                  v-model="hasPerRequestLimits"
                  class="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
                  :disabled="props.disabled"
                  data-testid="model-picker-per-request-limits"
                >
                  <option value="any">{{ t('errors.modelCatalog.any') }}</option>
                  <option value="yes">{{ t('errors.modelCatalog.hasLimits') }}</option>
                  <option value="no">{{ t('errors.modelCatalog.noLimits') }}</option>
                </select>
                <label class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{{ t('errors.modelCatalog.defaultParameters') }}</label>
                <select
                  v-model="hasDefaultParameters"
                  class="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
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

          <details class="rounded-md border border-gray-200 bg-white px-3 py-2">
            <summary class="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              {{ t('errors.modelCatalog.complianceLifecycle') }}
            </summary>
            <div class="mt-2 space-y-3">
              <div>
                <label class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{{ t('errors.modelCatalog.moderation') }}</label>
                <select
                  v-model="moderationFilter"
                  class="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
                  :disabled="props.disabled"
                  data-testid="model-picker-is-moderated"
                >
                  <option value="any">{{ t('errors.modelCatalog.any') }}</option>
                  <option value="yes">{{ t('errors.modelCatalog.moderated') }}</option>
                  <option value="no">{{ t('errors.modelCatalog.unmoderated') }}</option>
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
                <span>{{ t('errors.modelCatalog.expiringWithinDays') }}</span>
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
            <summary class="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-gray-500">{{ t('errors.modelCatalog.sort') }}</summary>
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
            <div class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{{ t('errors.modelCatalog.current') }}</div>
            <div class="mt-1 break-all font-medium text-gray-900">{{ selectedModelLabel }}</div>
            <div
              v-if="selectedModelUnlisted"
              class="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800"
              data-testid="model-picker-selected-model-unlisted"
            >
              {{ t('errors.modelCatalog.selectedModelUnlisted') }}
            </div>
            <div
              v-else-if="selectedModelFilteredOut"
              class="mt-2 flex items-center justify-between gap-2 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] text-blue-800"
              data-testid="model-picker-selected-model-filtered"
            >
              <span>{{ t('errors.modelCatalog.selectedModelFiltered') }}</span>
              <button
                type="button"
                class="rounded border border-blue-200 bg-white px-2 py-0.5 text-[11px] text-blue-700 hover:bg-blue-50"
                data-testid="model-picker-clear-filters-for-selected"
                @click="clearFiltersToRevealSelectedModel"
              >
                {{ t('errors.modelCatalog.clearFiltersToReveal') }}
              </button>
            </div>
            <div v-if="effectiveNotice" class="mt-2 text-[11px] text-gray-500">{{ effectiveNotice }}</div>
            <div v-if="error" class="mt-2 text-[11px] text-red-600">{{ error }}</div>
          </div>

          <div class="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
            <div class="flex items-center justify-between gap-2">
              <div class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{{ t('errors.modelCatalog.favoritesOrder') }}</div>
              <div class="flex items-center gap-2">
                <button
                  v-if="!favoriteEditMode"
                  type="button"
                  class="rounded border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  :disabled="props.disabled || props.isRunning || normalizedFavoriteModelKeys.length === 0"
                  data-testid="model-picker-favorites-edit"
                  @click="openFavoriteEditMode"
                >
                  {{ t('errors.modelCatalog.edit') }}
                </button>
                <template v-else>
                  <button
                    type="button"
                    class="rounded border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    :disabled="props.disabled || props.isRunning"
                    data-testid="model-picker-favorites-cancel"
                    @click="cancelFavoriteEditMode"
                  >
                    {{ t('common.cancel') }}
                  </button>
                  <button
                    type="button"
                    class="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                    :disabled="props.disabled || props.isRunning"
                    data-testid="model-picker-favorites-done"
                    @click="saveFavoriteOrder"
                  >
                    {{ t('errors.modelCatalog.done') }}
                  </button>
                </template>
              </div>
            </div>
            <div v-if="normalizedFavoriteModelKeys.length === 0" class="mt-2 text-[11px] text-gray-400">
              {{ t('errors.modelCatalog.noFavoritesYet') }}
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
                @scroll="onModelListScroll"
              >
                <template v-if="activePickerMode === 'all'">
                  <div v-if="loading && pickerItems.length === 0" class="px-2 py-4 text-sm text-gray-500">{{ t('errors.modelCatalog.loadingModels') }}</div>
                  <div v-else-if="!loading && pickerItems.length === 0" class="px-2 py-4 text-sm text-gray-500">
                    {{ t('errors.modelCatalog.noModelsFound') }}
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
                      :data-testid="item.providerId === OPENROUTER_PROVIDER_ID ? `model-picker-item-${item.modelId}` : `model-picker-item-${item.providerId}-${item.modelId}`"
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
                            v-if="item.providerId === OPENROUTER_PROVIDER_ID"
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
                          {{ t('errors.modelCatalog.capabilityImageGeneration') }}
                        </span>
                        <span v-if="item.capabilities.reasoning" class="rounded border border-gray-200 px-1.5 py-0.5">{{ t('errors.modelCatalog.capabilityReasoning') }}</span>
                        <span v-if="item.capabilities.tools" class="rounded border border-gray-200 px-1.5 py-0.5">{{ t('errors.modelCatalog.capabilityTools') }}</span>
                        <span v-if="item.capabilities.vision" class="rounded border border-gray-200 px-1.5 py-0.5">{{ t('errors.modelCatalog.capabilityVision') }}</span>
                        <span v-if="item.capabilities.longContext" class="rounded border border-gray-200 px-1.5 py-0.5">{{ t('errors.modelCatalog.capabilityLongContext') }}</span>
                      </div>
                    </button>
                    <div :style="{ height: `${bottomPaddingPx}px` }" />
                  </template>
                </template>
                <template v-else>
                  <div v-if="activeShortcutItems.length === 0" class="px-2 py-4 text-sm text-gray-500">
                    {{ activePickerMode === 'favorites' ? t('errors.modelCatalog.noFavoriteModels') : t('errors.modelCatalog.noRecentModels') }}
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
                          v-if="item.providerId === OPENROUTER_PROVIDER_ID"
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
                  {{ activePickerMode === 'all' ? tf('errors.modelCatalog.resultCount', { count: pickerItems.length }) : tf('errors.modelCatalog.modelCount', { count: activeShortcutItems.length }) }}
                </div>
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
                  {{ t('errors.modelCatalog.detailTabModel') }}
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
                  {{ t('errors.modelCatalog.detailTabEndpoints') }}
                </button>
              </div>

              <div
                v-if="activeDetailTab === 'model' && activeDetailItem && activeDetailItem.providerId !== OPENROUTER_PROVIDER_ID"
                class="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700"
                data-testid="model-picker-provider-detail"
              >
                <div class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{{ t('errors.modelCatalog.providerModel') }}</div>
                <div class="mt-2 text-sm font-semibold text-gray-900">{{ activeDetailItem.displayName }}</div>
                <div class="mt-1 break-all text-[11px] text-gray-500">{{ `${activeDetailItem.providerName} · ${activeDetailItem.modelId}` }}</div>
                <div class="mt-3 grid gap-2">
                  <div class="rounded border border-gray-200 bg-white px-2 py-1">
                    <div class="text-[10px] uppercase tracking-wide text-gray-400">{{ t('errors.modelCatalog.status') }}</div>
                    <div>{{ activeDetailItem.statusLabel }}</div>
                  </div>
                  <div class="rounded border border-gray-200 bg-white px-2 py-1">
                    <div class="text-[10px] uppercase tracking-wide text-gray-400">{{ t('errors.modelCatalog.capabilities') }}</div>
                    <div>{{ activeDetailItem.capabilitySummary ?? t('errors.modelCatalog.capabilityUnknown') }}</div>
                  </div>
                  <div class="rounded border border-gray-200 bg-white px-2 py-1">
                    <div class="text-[10px] uppercase tracking-wide text-gray-400">{{ t('errors.modelCatalog.source') }}</div>
                    <div>{{ activeDetailItem.sourceLabel ?? t('errors.modelCatalog.providerSource') }}</div>
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
                :disabled="props.disabled || !activeDetailModelId || activeDetailItem?.providerId !== OPENROUTER_PROVIDER_ID"
                @refresh="onRefreshEndpointDetails"
              />
            </div>
          </div>
        </section>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-4 py-2 text-[11px]">
        <div class="flex min-w-0 flex-wrap items-center gap-2">
          <label class="text-gray-500" for="model-picker-sync-provider">
            {{ t('errors.modelCatalog.provider') }}
          </label>
          <select
            id="model-picker-sync-provider"
            v-model="selectedSyncProviderKey"
            class="rounded border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-700 disabled:bg-gray-100"
            :disabled="props.disabled || syncProviderOptions.length === 0"
            data-testid="model-picker-sync-provider"
          >
            <option
              v-for="provider in syncProviderOptions"
              :key="`sync-provider-${provider.providerId}`"
              :value="provider.providerId"
            >
              {{ provider.providerName }}
            </option>
          </select>
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
          <span v-if="selectedSyncSnapshot.status === 'not_synced'" class="text-gray-400">
            {{ t('errors.modelCatalog.syncNotSynced') }}
          </span>
          <span v-else-if="selectedSyncSnapshot.status === 'syncing'" class="text-blue-600">
            {{ t('errors.modelCatalog.syncSyncing') }}
          </span>
          <span v-else-if="selectedSyncSnapshot.status === 'synced'" class="text-green-700">
            {{ formatProviderSyncStatusText(selectedSyncSnapshot) }}
          </span>
          <span v-else-if="selectedSyncSnapshot.status === 'failed'" class="text-red-600">
            {{ tf('errors.modelCatalog.syncFailedReason', { reason: modelCatalogSyncFailureReasonText(selectedSyncSnapshot) }) }}
          </span>
          <span
            v-if="selectedSyncSnapshot.status === 'failed' && selectedSyncSnapshot.totalModelCount > 0"
            class="text-amber-700"
            data-testid="model-picker-using-last-known-good"
          >
            {{ t('errors.modelCatalog.usingLastKnownGood') }}
          </span>
          <span
            v-else-if="selectedSyncSnapshot.isStale && selectedSyncSnapshot.totalModelCount > 0"
            class="text-amber-700"
            data-testid="model-picker-stale-snapshot"
          >
            {{ t('errors.modelCatalog.staleSnapshot') }}
          </span>
          <span class="text-gray-400" data-testid="model-picker-sync-last-synced">
            {{ tf('errors.modelCatalog.lastSyncedAt', { time: formatSyncTime(selectedSyncSnapshot.lastSyncedAtMs) }) }}
          </span>
        </div>
        <button
          type="button"
          class="rounded border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          :disabled="selectedSyncSnapshot.status === 'syncing' || props.disabled"
          data-testid="model-picker-sync-refresh"
          @click="onManualRefreshProvider()"
        >
          {{ selectedSyncSnapshot.status === 'syncing' ? '…' : t('errors.modelCatalog.sync') }}
        </button>
        <ProviderFailureDetailsV2
          v-if="selectedSyncSnapshot.providerFailure"
          class="basis-full"
          :failure="selectedSyncSnapshot.providerFailure"
          test-id-prefix="model-picker-provider-failure"
        />
      </div>
    </div>
  </div>
</template>
