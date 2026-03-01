<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ReasoningEffort } from '@/next/state/types'
import type { ModelCatalogItem } from '@/next/modelCatalog/modelCatalogTypes'
import type { CatalogQueryInput, CatalogQueryResult } from '@/next/modelCatalog/catalogQueryService'
import { normalizeSearchSettingsLayer } from '@/next/openrouter/searchSettingsPersistence'
import {
  normalizeSamplingParamsLayer,
  type ResolvedSamplingParams,
  type SamplingParamsLayer,
} from '@/next/openrouter/samplingParamsResolver'
import type {
  ResolvedSearchSettings,
  SearchDepth,
  SearchEngine,
  SearchMode,
  SearchSettingsLayer,
} from '@/next/openrouter/searchSettingsResolver'
import {
  ModelPrefsService,
  type ModelPrefsFavorite,
  type ModelPrefsRecent,
  type ModelPrefsScopeInput,
  type ModelPrefsScopeType,
} from '@/next/modelPrefs/modelPrefsService'
import { updateScrollbarMetricsFromElement } from '@/ui-app/infra/ui/scrollbarMetrics'
import ModelPickerDialog from './ModelPickerDialog.vue'
import SamplingParamsSettingsEditor from './SamplingParamsSettingsEditor.vue'

type ImageGenerationOutputMode = 'auto' | 'image_only' | 'image_and_text'
type ImageGenerationCapabilityClass = 'text_and_image' | 'image_only'
type ImageGenerationAspectRatioOption =
  | 'default'
  | '1:1'
  | '2:3'
  | '3:2'
  | '3:4'
  | '4:3'
  | '4:5'
  | '5:4'
  | '9:16'
  | '16:9'
  | '21:9'
type ImageGenerationSizeOption = 'default' | '1K' | '2K' | '4K'

type ImageGenerationComposerState = Readonly<{
  enabled: boolean
  outputMode: ImageGenerationOutputMode
  aspectRatio: string
  imageSize: string
  advancedJson: string
}>

const IMAGE_GENERATION_ASPECT_RATIO_OPTIONS: ReadonlyArray<ImageGenerationAspectRatioOption> = [
  'default',
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '21:9',
]
const IMAGE_GENERATION_SIZE_OPTIONS: ReadonlyArray<ImageGenerationSizeOption> = ['default', '1K', '2K', '4K']

const props = defineProps<{
  draft: string
  disabled: boolean
  isRunning: boolean
  model: string
  modelCatalog: readonly ModelCatalogItem[]
  showHiddenModelsInPickers: boolean
  modelCatalogNotice?: string | null
  modelPickerQueryFn?: (input: CatalogQueryInput) => Promise<CatalogQueryResult>
  modelPrefsScope?: ModelPrefsScopeInput
  requestedReasoningExclude: boolean
  requestedReasoningEffort: 'auto' | ReasoningEffort
  samplingParamsLayer?: SamplingParamsLayer | null
  samplingParamsResolved?: ResolvedSamplingParams | null
  samplingParamsSaving?: boolean
  webSearchLayer?: SearchSettingsLayer | null
  webSearchResolved?: ResolvedSearchSettings | null
  webSearchSaving?: boolean
  imageGeneration?: ImageGenerationComposerState | null
  imageGenerationVisible?: boolean
  imageGenerationFollowDefault?: boolean
  imageGenerationSupported?: boolean
  imageGenerationCapabilityClass?: ImageGenerationCapabilityClass | null
  imageGenerationSupportHint?: string | null
  imageGenerationAdvancedError?: string | null
}>()

const emit = defineEmits<{
  'update:draft': [value: string]
  'update:model': [value: string]
  'update:requestedReasoningExclude': [value: boolean]
  'update:requestedReasoningEffort': [value: 'auto' | ReasoningEffort]
  'update:samplingParamsLayer': [value: SamplingParamsLayer | null]
  'update:webSearchLayer': [value: SearchSettingsLayer | null]
  'update:imageGeneration': [value: ImageGenerationComposerState]
  'update:imageGenerationFollowDefault': [value: boolean]
  openWebSearchSettings: []
  toggleShowHiddenModelsInPickers: []
  send: []
  abort: []
}>()

const canSend = computed(() => !props.disabled && !props.isRunning && props.draft.trim().length > 0)
const isDev = (import.meta as any).env?.DEV === true
const modelPickerOpen = ref(false)
const pickedDisplayNameByModelId = ref<Record<string, string>>({})
const favoriteModels = ref<ModelPrefsFavorite[]>([])
const recentModels = ref<ModelPrefsRecent[]>([])
const MAX_INLINE_RECENTS = 6
const favoriteStripEditMode = ref(false)
const editableFavoriteModelKeys = ref<string[]>([])
const draggingFavoriteStripIndex = ref<number | null>(null)
const favoritesHasOverflowX = ref(false)
const composerRootRef = ref<HTMLElement | null>(null)
const controlsRowRef = ref<HTMLElement | null>(null)
const favoriteScrollShellRef = ref<HTMLElement | null>(null)
const favoriteScrollReadRef = ref<HTMLElement | null>(null)
const favoriteScrollEditRef = ref<HTMLElement | null>(null)
const favoriteReserveSpacerRef = ref<HTMLElement | null>(null)
const reasoningControlsRef = ref<HTMLElement | null>(null)
let unsubscribeModelPrefs: (() => void) | null = null
let favoriteStripResizeObserver: ResizeObserver | null = null
let favoriteRefreshSeq = 0
let recentsRefreshSeq = 0
const modelPrefsScope = computed<Readonly<{ scopeType: ModelPrefsScopeType; scopeId: string }>>(() =>
  normalizeModelPrefsScope(props.modelPrefsScope),
)
const modelPrefsScopeKey = computed(() => `${modelPrefsScope.value.scopeType}|${modelPrefsScope.value.scopeId}`)
const currentModelDisplayName = computed(() => {
  const fallback = props.model.trim()
  return fallback.length > 0 ? resolveModelDisplayName(fallback) : 'openrouter/auto'
})
const favoriteModelKeys = computed(() => favoriteModels.value.map((item) => item.modelKey))
const favoriteModelKeySet = computed(() => new Set(favoriteModelKeys.value))
const currentModelFavoriteEnabled = computed(() => {
  const normalized = String(props.model ?? '').trim()
  return normalized.length > 0 && normalized !== 'openrouter/auto'
})
const currentModelIsFavorite = computed(() => favoriteModelKeySet.value.has(toFavoriteModelKey(props.model)))
const favoriteDisplayItems = computed(() =>
  favoriteModels.value.map((item) => ({
    modelId: item.modelId,
    modelKey: item.modelKey,
    name: resolveModelDisplayName(item.modelId),
  }))
)
const editableFavoriteDisplayItems = computed(() =>
  editableFavoriteModelKeys.value.map((modelKey) => {
    const modelId = parseModelIdFromModelKey(modelKey)
    return {
      modelKey,
      modelId,
      name: resolveModelDisplayName(modelId),
    }
  }),
)
const favoriteStripOrderDirty = computed(() => {
  const base = favoriteModelKeys.value
  const next = editableFavoriteModelKeys.value
  if (base.length !== next.length) return true
  for (let index = 0; index < base.length; index += 1) {
    if (base[index] !== next[index]) return true
  }
  return false
})
const favoriteScrollContainerStyle = computed(() => ({
  scrollbarGutter: 'stable',
  marginBottom: favoritesHasOverflowX.value ? 'calc(-1 * var(--sv-scrollbar-h, 0px))' : '0px',
}))
const recentDisplayItems = computed(() =>
  recentModels.value
    .filter((item) => !favoriteModelKeySet.value.has(item.modelKey))
    .map((item) => ({
      modelId: item.modelId,
      modelKey: item.modelKey,
      name: resolveModelDisplayName(item.modelId),
      lastUsedAtMs: item.lastUsedAtMs,
      useCount: item.useCount,
    }))
)
const inlineRecentDisplayItems = computed(() => recentDisplayItems.value.slice(0, MAX_INLINE_RECENTS))
const hiddenRecentCount = computed(() => Math.max(0, recentDisplayItems.value.length - inlineRecentDisplayItems.value.length))
const composerSamplingParamsLayer = computed<SamplingParamsLayer | null>({
  get: () => normalizeSamplingParamsLayer(props.samplingParamsLayer),
  set: (value) => emit('update:samplingParamsLayer', normalizeSamplingParamsLayer(value)),
})
const samplingParamsControlsDisabled = computed(() => props.disabled || props.isRunning || props.samplingParamsSaving === true)
const normalizedWebSearchLayer = computed<SearchSettingsLayer>(() => normalizeSearchSettingsLayer(props.webSearchLayer) ?? {})
const webSearchModeValue = computed<SearchMode>(() => normalizedWebSearchLayer.value.searchMode ?? 'default')
const webSearchEngineValue = computed<SearchEngine>(() => normalizedWebSearchLayer.value.searchEngine ?? 'default')
const webSearchDepthValue = computed<SearchDepth>(() => normalizedWebSearchLayer.value.searchDepth ?? 'default')
const webSearchModeDefault = computed(() => webSearchModeValue.value === 'default')
const webSearchEngineDefault = computed(() => webSearchEngineValue.value === 'default')
const webSearchModeDisplay = computed<'enable' | 'disable'>(() => {
  if (webSearchModeValue.value === 'enable' || webSearchModeValue.value === 'disable') return webSearchModeValue.value
  return props.webSearchResolved?.effectiveMode === true ? 'enable' : 'disable'
})
const webSearchEngineDisplay = computed<'auto' | 'native' | 'exa'>(() => {
  if (webSearchEngineValue.value === 'auto' || webSearchEngineValue.value === 'native' || webSearchEngineValue.value === 'exa') {
    return webSearchEngineValue.value
  }
  const effective = props.webSearchResolved?.effectiveEngine
  return effective === 'native' || effective === 'exa' ? effective : 'auto'
})
const lastExplicitWebSearchMode = ref<'enable' | 'disable'>('enable')
const lastExplicitWebSearchEngine = ref<'auto' | 'native' | 'exa'>('auto')
const lastCustomWebSearchMaxResults = ref<number | null>(null)
const webSearchControlsDisabled = computed(() => props.disabled || props.isRunning || props.webSearchSaving === true)
const webSearchCustomSelectValue = computed<number>(() => {
  const layerMax = normalizedWebSearchLayer.value.maxResults
  if (typeof layerMax === 'number' && Number.isFinite(layerMax)) return clampWebSearchMaxResults(layerMax)
  if (typeof lastCustomWebSearchMaxResults.value === 'number' && Number.isFinite(lastCustomWebSearchMaxResults.value)) {
    return clampWebSearchMaxResults(lastCustomWebSearchMaxResults.value)
  }
  const resolvedMax = props.webSearchResolved?.effectiveMaxResults
  if (typeof resolvedMax === 'number' && Number.isFinite(resolvedMax)) return clampWebSearchMaxResults(resolvedMax)
  return 5
})
const modelPickerImageOnly = ref(false)

const normalizedImageGeneration = computed<ImageGenerationComposerState>(() => {
  const raw = props.imageGeneration
  const enabled = raw?.enabled === true
  const outputMode: ImageGenerationOutputMode =
    raw?.outputMode === 'image_only' || raw?.outputMode === 'image_and_text' || raw?.outputMode === 'auto'
      ? raw.outputMode
      : 'auto'
  const aspectRatio = String(raw?.aspectRatio ?? '').trim()
  const rawImageSize = String(raw?.imageSize ?? '').trim()
  const imageSize =
    rawImageSize === '1K' || rawImageSize === '2K' || rawImageSize === '4K'
      ? rawImageSize
      : ''
  const advancedJson = typeof raw?.advancedJson === 'string' ? raw.advancedJson : ''
  return {
    enabled,
    outputMode,
    aspectRatio,
    imageSize,
    advancedJson,
  }
})

const imageGenerationControlsDisabled = computed(() => props.disabled || props.isRunning)
const imageGenerationVisible = computed(() => props.imageGenerationVisible !== false)
const imageGenerationFollowDefault = computed(() => props.imageGenerationFollowDefault === true)
const imageGenerationSupported = computed(() => props.imageGenerationSupported !== false)
const imageGenerationToggleDisabled = computed(
  () => imageGenerationControlsDisabled.value || (!imageGenerationSupported.value && !normalizedImageGeneration.value.enabled)
)
const imageGenerationCapabilityLabel = computed(() => {
  if (props.imageGenerationCapabilityClass === 'text_and_image') return 'text+image'
  if (props.imageGenerationCapabilityClass === 'image_only') return 'image-only'
  return 'unsupported'
})
const imageGenerationOutputModeOptions = computed(
  (): ReadonlyArray<Readonly<{ value: ImageGenerationOutputMode; label: string; disabled?: boolean }>> => {
    const capability = props.imageGenerationCapabilityClass
    return [
      { value: 'auto', label: 'auto' },
      { value: 'image_only', label: 'image only' },
      {
        value: 'image_and_text',
        label: 'image + text',
        ...(capability === 'image_only' ? { disabled: true } : {}),
      },
    ]
  }
)
const imageGenerationAspectRatioValue = computed(() =>
  normalizedImageGeneration.value.aspectRatio.length > 0 ? normalizedImageGeneration.value.aspectRatio : 'default'
)
const imageGenerationSizeValue = computed(() =>
  normalizedImageGeneration.value.imageSize.length > 0 ? normalizedImageGeneration.value.imageSize : 'default'
)
const imageGenerationDraftState = ref<ImageGenerationComposerState>(normalizedImageGeneration.value)

function emitImageGenerationPatch(patch: Partial<ImageGenerationComposerState>) {
  const next = {
    ...imageGenerationDraftState.value,
    ...patch,
  }
  imageGenerationDraftState.value = next
  emit('update:imageGeneration', next)
}

function ensureImageGenerationCustomMode() {
  if (!imageGenerationFollowDefault.value) return
  emit('update:imageGenerationFollowDefault', false)
}

function toFavoriteModelKey(modelId: string): string {
  const normalized = String(modelId ?? '').trim()
  return normalized.length > 0 ? `openrouter::${normalized}` : ''
}

function parseModelIdFromModelKey(modelKey: string): string {
  const normalized = String(modelKey ?? '').trim()
  const delimiter = '::'
  const delimiterIndex = normalized.indexOf(delimiter)
  if (delimiterIndex < 0 || delimiterIndex + delimiter.length >= normalized.length) return normalized
  return normalized.slice(delimiterIndex + delimiter.length).trim()
}

function normalizeFavoriteModelKeys(input: readonly string[]): string[] {
  const normalized: string[] = []
  const seen = new Set<string>()
  for (const value of input) {
    const key = String(value ?? '').trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    normalized.push(key)
  }
  return normalized
}

function normalizeModelPrefsScope(input?: ModelPrefsScopeInput): Readonly<{ scopeType: ModelPrefsScopeType; scopeId: string }> {
  const scopeType = input?.scopeType
  const rawScopeId = String(input?.scopeId ?? '').trim()
  if (scopeType === 'project' || scopeType === 'conversation') {
    if (!rawScopeId) return { scopeType: 'global', scopeId: '' }
    return { scopeType, scopeId: rawScopeId }
  }
  return { scopeType: 'global', scopeId: '' }
}

function emitWebSearchLayer(next: SearchSettingsLayer | null) {
  emit('update:webSearchLayer', normalizeSearchSettingsLayer(next))
}

function clampWebSearchMaxResults(value: number): number {
  if (!Number.isFinite(value)) return 5
  const rounded = Math.round(value)
  if (rounded < 1) return 1
  if (rounded > 10) return 10
  return rounded
}

function cycleWebSearchEngine(current: 'auto' | 'native' | 'exa'): 'auto' | 'native' | 'exa' {
  if (current === 'auto') return 'native'
  if (current === 'native') return 'exa'
  return 'auto'
}

function onWebSearchModeDefaultChange(event: Event) {
  if (webSearchControlsDisabled.value) return
  const checked = (event.target as HTMLInputElement).checked
  if (checked) {
    lastExplicitWebSearchMode.value = webSearchModeDisplay.value
    emitWebSearchLayer({
      ...normalizedWebSearchLayer.value,
      searchMode: 'default',
    })
    return
  }
  emitWebSearchLayer({
    ...normalizedWebSearchLayer.value,
    searchMode: lastExplicitWebSearchMode.value,
  })
}

function onWebSearchModeToggle() {
  if (webSearchControlsDisabled.value) return
  if (webSearchModeDefault.value) {
    const inherited = webSearchModeDisplay.value
    lastExplicitWebSearchMode.value = inherited
    emitWebSearchLayer({
      ...normalizedWebSearchLayer.value,
      searchMode: inherited,
    })
    return
  }
  const next: 'enable' | 'disable' = webSearchModeDisplay.value === 'enable' ? 'disable' : 'enable'
  lastExplicitWebSearchMode.value = next
  emitWebSearchLayer({
    ...normalizedWebSearchLayer.value,
    searchMode: next,
  })
}

function onWebSearchEngineDefaultChange(event: Event) {
  if (webSearchControlsDisabled.value) return
  const checked = (event.target as HTMLInputElement).checked
  if (checked) {
    lastExplicitWebSearchEngine.value = webSearchEngineDisplay.value
    emitWebSearchLayer({
      ...normalizedWebSearchLayer.value,
      searchEngine: 'default',
    })
    return
  }
  emitWebSearchLayer({
    ...normalizedWebSearchLayer.value,
    searchEngine: lastExplicitWebSearchEngine.value,
  })
}

function onWebSearchEngineToggle() {
  if (webSearchControlsDisabled.value) return
  if (webSearchEngineDefault.value) {
    const inherited = webSearchEngineDisplay.value
    lastExplicitWebSearchEngine.value = inherited
    emitWebSearchLayer({
      ...normalizedWebSearchLayer.value,
      searchEngine: inherited,
    })
    return
  }
  const next = cycleWebSearchEngine(webSearchEngineDisplay.value)
  lastExplicitWebSearchEngine.value = next
  emitWebSearchLayer({
    ...normalizedWebSearchLayer.value,
    searchEngine: next,
  })
}

function onWebSearchDepthChange(event: Event) {
  if (webSearchControlsDisabled.value) return
  const raw = (event.target as HTMLSelectElement).value
  const next: SearchDepth =
    raw === 'low' || raw === 'medium' || raw === 'high' || raw === 'custom' || raw === 'default' ? raw : 'default'
  const previous = webSearchDepthValue.value
  if (previous === 'custom' && next !== 'custom') {
    lastCustomWebSearchMaxResults.value = webSearchCustomSelectValue.value
  }

  if (next === 'custom') {
    const valid = webSearchCustomSelectValue.value
    lastCustomWebSearchMaxResults.value = valid
    emitWebSearchLayer({
      ...normalizedWebSearchLayer.value,
      searchDepth: 'custom',
      maxResults: valid,
    })
    return
  }

  emitWebSearchLayer({
    ...normalizedWebSearchLayer.value,
    searchDepth: next,
  })
}

function onWebSearchCustomSelect(event: Event) {
  if (webSearchControlsDisabled.value) return
  const raw = Number((event.target as HTMLSelectElement).value)
  const valid = clampWebSearchMaxResults(raw)
  lastCustomWebSearchMaxResults.value = valid
  if (webSearchDepthValue.value !== 'custom') return
  emitWebSearchLayer({
    ...normalizedWebSearchLayer.value,
    searchDepth: 'custom',
    maxResults: valid,
  })
}

function openWebSearchSettings() {
  if (webSearchControlsDisabled.value) return
  emit('openWebSearchSettings')
}

function onImageGenerationToggle(event: Event) {
  if (imageGenerationToggleDisabled.value) return
  ensureImageGenerationCustomMode()
  emitImageGenerationPatch({
    enabled: (event.target as HTMLInputElement).checked,
  })
}

function onImageGenerationFollowDefaultChange(event: Event) {
  if (imageGenerationControlsDisabled.value) return
  emit('update:imageGenerationFollowDefault', (event.target as HTMLInputElement).checked)
}

function onImageGenerationOutputModeChange(event: Event) {
  if (imageGenerationControlsDisabled.value) return
  ensureImageGenerationCustomMode()
  const raw = (event.target as HTMLSelectElement).value
  const next: ImageGenerationOutputMode =
    raw === 'image_only' || raw === 'image_and_text' || raw === 'auto' ? raw : 'auto'
  emitImageGenerationPatch({ outputMode: next })
}

function onImageGenerationAspectRatioChange(event: Event) {
  if (imageGenerationControlsDisabled.value) return
  ensureImageGenerationCustomMode()
  const rawValue = String((event.target as HTMLSelectElement).value ?? '').trim()
  const raw: ImageGenerationAspectRatioOption =
    IMAGE_GENERATION_ASPECT_RATIO_OPTIONS.includes(rawValue as ImageGenerationAspectRatioOption)
      ? (rawValue as ImageGenerationAspectRatioOption)
      : 'default'
  emitImageGenerationPatch({ aspectRatio: raw === 'default' ? '' : raw })
}

function onImageGenerationSizeChange(event: Event) {
  if (imageGenerationControlsDisabled.value) return
  ensureImageGenerationCustomMode()
  const rawValue = String((event.target as HTMLSelectElement).value ?? '').trim()
  const raw: ImageGenerationSizeOption = IMAGE_GENERATION_SIZE_OPTIONS.includes(rawValue as ImageGenerationSizeOption)
    ? (rawValue as ImageGenerationSizeOption)
    : 'default'
  emitImageGenerationPatch({ imageSize: raw === 'default' ? '' : raw })
}

function onImageGenerationAdvancedJsonInput(event: Event) {
  if (imageGenerationControlsDisabled.value) return
  ensureImageGenerationCustomMode()
  emitImageGenerationPatch({
    advancedJson: (event.target as HTMLInputElement).value,
  })
}

function onToggleModelPickerImageOnlyFilter() {
  if (props.disabled || props.isRunning) return
  modelPickerImageOnly.value = !modelPickerImageOnly.value
}

function resolveModelDisplayName(modelId: string): string {
  const normalized = String(modelId ?? '').trim()
  if (!normalized) return 'unknown'
  const pickedDisplayName = pickedDisplayNameByModelId.value[normalized]
  if (pickedDisplayName) return pickedDisplayName
  const inCatalog = props.modelCatalog.find((item) => item.modelId === normalized)
  if (inCatalog) return inCatalog.name
  return normalized
}

async function refreshFavoriteModels(forceRefresh: boolean) {
  const currentSeq = ++favoriteRefreshSeq
  const options = forceRefresh ? { forceRefresh: true } : undefined
  const items = await ModelPrefsService.listFavorites(modelPrefsScope.value, options)
  if (currentSeq !== favoriteRefreshSeq) return
  favoriteModels.value = items
}

async function refreshRecentModels(forceRefresh: boolean) {
  const currentSeq = ++recentsRefreshSeq
  const options = forceRefresh ? { forceRefresh: true, limit: 30 } : { limit: 30 }
  const items = await ModelPrefsService.listRecents(modelPrefsScope.value, options)
  if (currentSeq !== recentsRefreshSeq) return
  recentModels.value = items
}

async function toggleFavoriteByModelId(modelId: string) {
  const normalized = String(modelId ?? '').trim()
  if (!normalized || normalized === 'openrouter/auto') return
  if (props.disabled || props.isRunning) return
  const result = await ModelPrefsService.toggleFavorite({
    modelId: normalized,
    modelKey: toFavoriteModelKey(normalized),
    providerKey: 'openrouter',
  }, modelPrefsScope.value)
  if (!result.ok) {
    await refreshFavoriteModels(true)
  }
}

function openModelPicker() {
  if (props.disabled) return
  modelPickerOpen.value = true
}

function closeModelPicker() {
  modelPickerOpen.value = false
}

function onSelectModelFromPicker(modelId: string, displayName: string) {
  const normalizedDisplayName = String(displayName ?? '').trim()
  if (normalizedDisplayName) {
    pickedDisplayNameByModelId.value = {
      ...pickedDisplayNameByModelId.value,
      [modelId]: normalizedDisplayName,
    }
  }
  emit('update:model', modelId)
  closeModelPicker()
}

function onToggleCurrentModelFavorite() {
  void toggleFavoriteByModelId(props.model)
}

function onToggleModelPickerFavorite(modelId: string) {
  void toggleFavoriteByModelId(modelId)
}

async function onReorderFavorites(orderedModelKeys: readonly string[]) {
  if (props.disabled || props.isRunning) return
  const beforeKeys = favoriteModels.value.map((item) => item.modelKey)
  const normalized = orderedModelKeys
    .map((value) => String(value ?? '').trim())
    .filter((value, index, array) => value.length > 0 && array.indexOf(value) === index)
  const keepSet = new Set(normalized)
  const removedKeys = beforeKeys.filter((key) => !keepSet.has(key))
  if (removedKeys.length > 0) {
    await Promise.all(
      removedKeys.map((modelKey) => ModelPrefsService.removeFavorite({ modelKey }, modelPrefsScope.value)),
    )
  }
  if (normalized.length === 0) {
    favoriteModels.value = []
    return
  }
  const reordered = await ModelPrefsService.reorderFavorites(normalized, modelPrefsScope.value)
  favoriteModels.value = reordered
}

function openFavoriteStripEditMode() {
  if (props.disabled || props.isRunning) return
  favoriteStripEditMode.value = true
  editableFavoriteModelKeys.value = normalizeFavoriteModelKeys(favoriteModelKeys.value)
  draggingFavoriteStripIndex.value = null
}

function cancelFavoriteStripEditMode() {
  favoriteStripEditMode.value = false
  editableFavoriteModelKeys.value = normalizeFavoriteModelKeys(favoriteModelKeys.value)
  draggingFavoriteStripIndex.value = null
}

async function saveFavoriteStripEditMode() {
  if (props.disabled || props.isRunning) return
  if (!favoriteStripEditMode.value) return
  const next = normalizeFavoriteModelKeys(editableFavoriteModelKeys.value)
  await onReorderFavorites(next)
  favoriteStripEditMode.value = false
  draggingFavoriteStripIndex.value = null
}

function removeFavoriteFromStrip(index: number) {
  if (!favoriteStripEditMode.value || props.disabled || props.isRunning) return
  if (index < 0 || index >= editableFavoriteModelKeys.value.length) return
  const next = [...editableFavoriteModelKeys.value]
  next.splice(index, 1)
  editableFavoriteModelKeys.value = next
}

function onFavoriteStripDragStart(index: number, event: DragEvent) {
  if (!favoriteStripEditMode.value || props.disabled || props.isRunning) return
  draggingFavoriteStripIndex.value = index
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }
}

function onFavoriteStripDragOver(event: DragEvent) {
  if (!favoriteStripEditMode.value || props.disabled || props.isRunning) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
}

function onFavoriteStripDrop(targetIndex: number, event: DragEvent) {
  if (!favoriteStripEditMode.value || props.disabled || props.isRunning) return
  event.preventDefault()
  const from = draggingFavoriteStripIndex.value
  if (from === null || from === targetIndex) return
  if (from < 0 || from >= editableFavoriteModelKeys.value.length) return
  if (targetIndex < 0 || targetIndex >= editableFavoriteModelKeys.value.length) return
  const next = [...editableFavoriteModelKeys.value]
  const [moved] = next.splice(from, 1)
  next.splice(targetIndex, 0, moved)
  editableFavoriteModelKeys.value = next
  draggingFavoriteStripIndex.value = targetIndex
}

function onFavoriteStripDragEnd() {
  draggingFavoriteStripIndex.value = null
}

function getActiveFavoriteScrollElement(): HTMLElement | null {
  return favoriteStripEditMode.value ? favoriteScrollEditRef.value : favoriteScrollReadRef.value
}

function updateFavoritesOverflowState(target?: HTMLElement | null) {
  const el = target ?? getActiveFavoriteScrollElement()
  if (!el) {
    favoritesHasOverflowX.value = false
    return
  }
  favoritesHasOverflowX.value = el.scrollWidth > el.clientWidth + 1
}

function logFavoriteScrollDiagnostics(stage: string, target?: HTMLElement | null) {
  if (!isDev || typeof document === 'undefined') return
  const root = document.documentElement
  const el = target ?? getActiveFavoriteScrollElement()
  const shell = favoriteScrollShellRef.value
  const spacer = favoriteReserveSpacerRef.value
  const row = controlsRowRef.value
  const lower = reasoningControlsRef.value
  const cssScrollbarH = getComputedStyle(root).getPropertyValue('--sv-scrollbar-h').trim()
  const rowRect = row?.getBoundingClientRect()
  const shellRect = shell?.getBoundingClientRect()
  const lowerRect = lower?.getBoundingClientRect()
  if (!el) {
    const shellStyle = shell ? getComputedStyle(shell) : null
    const spacerStyle = spacer ? getComputedStyle(spacer) : null
    console.info('[favorites-scrollbar] diagnostics', {
      stage,
      cssScrollbarH,
      hasElement: false,
      hasShell: Boolean(shell),
      hasSpacer: Boolean(spacer),
      rowRectTop: rowRect ? Number(rowRect.top.toFixed(2)) : null,
      rowRectHeight: rowRect ? Number(rowRect.height.toFixed(2)) : null,
      shellRectTop: shellRect ? Number(shellRect.top.toFixed(2)) : null,
      shellRectHeight: shellRect ? Number(shellRect.height.toFixed(2)) : null,
      lowerRectTop: lowerRect ? Number(lowerRect.top.toFixed(2)) : null,
      lowerRectHeight: lowerRect ? Number(lowerRect.height.toFixed(2)) : null,
      shellPaddingBottom: shellStyle?.paddingBottom ?? null,
      spacerHeight: spacerStyle?.height ?? null,
    })
    return
  }
  const elStyle = getComputedStyle(el)
  const shellStyle = shell ? getComputedStyle(shell) : null
  const spacerStyle = spacer ? getComputedStyle(spacer) : null
  console.info('[favorites-scrollbar] diagnostics', {
    stage,
    cssScrollbarH,
    favoritesHasOverflowX: favoritesHasOverflowX.value,
    hasOverflowX: el.scrollWidth > el.clientWidth,
    offsetMinusClientHeight: el.offsetHeight - el.clientHeight,
    rectHeight: el.getBoundingClientRect().height,
    offsetHeight: el.offsetHeight,
    clientHeight: el.clientHeight,
    scrollHeight: el.scrollHeight,
    elementPaddingBottom: elStyle.paddingBottom,
    elementMarginBottom: elStyle.marginBottom,
    rowRectTop: rowRect ? Number(rowRect.top.toFixed(2)) : null,
    rowRectHeight: rowRect ? Number(rowRect.height.toFixed(2)) : null,
    shellRectTop: shellRect ? Number(shellRect.top.toFixed(2)) : null,
    shellRectHeight: shellRect ? Number(shellRect.height.toFixed(2)) : null,
    lowerRectTop: lowerRect ? Number(lowerRect.top.toFixed(2)) : null,
    lowerRectHeight: lowerRect ? Number(lowerRect.height.toFixed(2)) : null,
    shellPaddingBottom: shellStyle?.paddingBottom ?? null,
    spacerHeight: spacerStyle?.height ?? null,
  })
  logComposerControlLayout(stage)
}

function logComposerControlLayout(stage: string) {
  if (!isDev) return
  const root = composerRootRef.value
  if (!root) return
  const selector = '[data-testid], button, textarea, select, input'
  const seen = new Set<HTMLElement>()
  const controls: HTMLElement[] = []
  for (const element of root.querySelectorAll<HTMLElement>(selector)) {
    if (seen.has(element)) continue
    seen.add(element)
    controls.push(element)
  }
  const snapshots = controls
    .map((element, index) => {
      const rect = element.getBoundingClientRect()
      const dataTestId = element.getAttribute('data-testid') ?? null
      const labelText = (element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 36)
      const name = dataTestId
        ?? (element.id ? `#${element.id}` : `${element.tagName.toLowerCase()}-${index}${labelText ? `:${labelText}` : ''}`)
      return {
        name,
        tag: element.tagName.toLowerCase(),
        top: Number(rect.top.toFixed(2)),
        left: Number(rect.left.toFixed(2)),
        width: Number(rect.width.toFixed(2)),
        height: Number(rect.height.toFixed(2)),
      }
    })
    .sort((a, b) => (a.top === b.top ? a.left - b.left : a.top - b.top))
  console.info('[composer-layout] controls', {
    stage,
    count: snapshots.length,
    controls: snapshots,
  })
}

function backfillScrollbarHeightFromActiveElement(stage: string) {
  const el = getActiveFavoriteScrollElement()
  updateFavoritesOverflowState(el)
  if (!el) {
    logFavoriteScrollDiagnostics(`${stage}:no-element`, null)
    return
  }
  if (el.scrollWidth > el.clientWidth) {
    updateScrollbarMetricsFromElement(el)
  }
  logFavoriteScrollDiagnostics(stage, el)
}

function reconnectFavoriteStripResizeObserver() {
  if (favoriteStripResizeObserver) {
    favoriteStripResizeObserver.disconnect()
    favoriteStripResizeObserver = null
  }
  if (typeof ResizeObserver === 'undefined') return
  const el = getActiveFavoriteScrollElement()
  if (!el) return
  favoriteStripResizeObserver = new ResizeObserver(() => {
    const current = getActiveFavoriteScrollElement()
    if (!current) return
    updateFavoritesOverflowState(current)
    if (current.scrollWidth > current.clientWidth) {
      updateScrollbarMetricsFromElement(current)
    }
    logFavoriteScrollDiagnostics('resize-observer', current)
  })
  favoriteStripResizeObserver.observe(el)
}

onMounted(() => {
  void refreshFavoriteModels(false)
  void refreshRecentModels(false)
  unsubscribeModelPrefs = ModelPrefsService.subscribe((event) => {
    const scope = modelPrefsScope.value
    if (event.scopeType !== scope.scopeType || event.scopeId !== scope.scopeId) return
    if (event.reason === 'refresh') return
    if (event.kind === 'favorites') {
      void refreshFavoriteModels(true)
      return
    }
    if (event.kind === 'recents') {
      void refreshRecentModels(true)
    }
  })
  void nextTick(() => {
    reconnectFavoriteStripResizeObserver()
    backfillScrollbarHeightFromActiveElement('mounted')
  })
})

onBeforeUnmount(() => {
  favoriteRefreshSeq += 1
  recentsRefreshSeq += 1
  if (favoriteStripResizeObserver) {
    favoriteStripResizeObserver.disconnect()
    favoriteStripResizeObserver = null
  }
  if (unsubscribeModelPrefs) {
    unsubscribeModelPrefs()
    unsubscribeModelPrefs = null
  }
})

watch(
  modelPrefsScopeKey,
  () => {
    void refreshFavoriteModels(true)
    void refreshRecentModels(true)
  },
  { flush: 'post' },
)

watch(
  favoriteModelKeys,
  (next) => {
    if (favoriteStripEditMode.value) return
    editableFavoriteModelKeys.value = normalizeFavoriteModelKeys(next)
    void nextTick(() => {
      reconnectFavoriteStripResizeObserver()
      backfillScrollbarHeightFromActiveElement('favorite-keys-updated')
    })
  },
  { immediate: true },
)

watch(
  favoriteStripEditMode,
  async (nextMode, prevMode) => {
    const beforeEl = prevMode ? favoriteScrollEditRef.value : favoriteScrollReadRef.value
    updateFavoritesOverflowState(beforeEl)
    logFavoriteScrollDiagnostics(`edit-toggle:${prevMode ? 'edit' : 'view'}->${nextMode ? 'edit' : 'view'}:before`, beforeEl)
    await nextTick()
    reconnectFavoriteStripResizeObserver()
    backfillScrollbarHeightFromActiveElement(`edit-toggle:${prevMode ? 'edit' : 'view'}->${nextMode ? 'edit' : 'view'}:after`)
  },
  { flush: 'pre' },
)

watch(
  normalizedImageGeneration,
  (next) => {
    imageGenerationDraftState.value = next
  },
  { immediate: true, deep: true },
)

watch(
  () => [webSearchModeValue.value, webSearchModeDisplay.value] as const,
  ([mode, display]) => {
    if (mode === 'enable' || mode === 'disable') {
      lastExplicitWebSearchMode.value = mode
      return
    }
    lastExplicitWebSearchMode.value = display
  },
  { immediate: true },
)

watch(
  () => [webSearchEngineValue.value, webSearchEngineDisplay.value] as const,
  ([engine, display]) => {
    if (engine === 'auto' || engine === 'native' || engine === 'exa') {
      lastExplicitWebSearchEngine.value = engine
      return
    }
    lastExplicitWebSearchEngine.value = display
  },
  { immediate: true },
)

watch(
  () => normalizedWebSearchLayer.value.maxResults,
  (maxResults) => {
    if (typeof maxResults !== 'number' || !Number.isFinite(maxResults)) return
    lastCustomWebSearchMaxResults.value = clampWebSearchMaxResults(maxResults)
  },
  { immediate: true },
)

</script>

<template>
  <div class="flex flex-col gap-3 px-4 py-3" ref="composerRootRef">
    <div class="flex items-end gap-3">
    <textarea
      class="min-h-[44px] flex-1 resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
      :disabled="props.disabled || props.isRunning"
      :value="props.draft"
      placeholder="Type a message..."
      rows="2"
      @input="emit('update:draft', ($event.target as HTMLTextAreaElement).value)"
      @keydown.enter.exact.prevent="canSend ? emit('send') : null"
    />

      <button
        v-if="props.isRunning"
        type="button"
        class="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
        :disabled="props.disabled"
        @click="emit('abort')"
      >
        Abort
      </button>

      <button
        v-else
        type="button"
        class="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
        :disabled="!canSend"
        @click="emit('send')"
      >
        Send
      </button>
    </div>

    <div class="flex min-h-[38px] flex-wrap items-center gap-3 text-xs text-gray-600">
      <div class="w-full" data-testid="composer-sampling-params-row">
        <SamplingParamsSettingsEditor
          v-model="composerSamplingParamsLayer"
          :resolved="props.samplingParamsResolved ?? null"
          :disabled="samplingParamsControlsDisabled"
          :compact="true"
          :defaultCollapsed="true"
        />
      </div>
    </div>

    <div class="flex min-h-[38px] flex-wrap items-center gap-3 text-xs text-gray-600">
      <div class="flex shrink-0 items-center gap-2" ref="reasoningControlsRef" data-testid="reasoning-controls">
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Reasoning</div>
        <select
          class="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs shadow-sm"
          :value="props.requestedReasoningEffort"
          :disabled="props.disabled || props.isRunning"
          @change="emit('update:requestedReasoningEffort', ($event.target as HTMLSelectElement).value as any)"
        >
          <option value="auto">auto</option>
          <option value="none">none</option>
          <option value="minimal">minimal</option>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
          <option value="xhigh">xhigh</option>
        </select>
        <label class="flex items-center gap-2">
          <input
            type="checkbox"
            class="h-4 w-4 rounded border-gray-300"
            :checked="props.requestedReasoningExclude"
            :disabled="props.disabled || props.isRunning || props.requestedReasoningEffort === 'auto' || props.requestedReasoningEffort === 'none'"
            @change="emit('update:requestedReasoningExclude', ($event.target as HTMLInputElement).checked)"
          />
          exclude
        </label>
      </div>

      <div v-if="props.requestedReasoningEffort !== 'auto' && props.requestedReasoningEffort !== 'none'" class="text-[11px] text-gray-500">
        Tip: medium is the recommended default when enabling reasoning.
      </div>

      <div v-if="props.modelCatalogNotice" class="text-[11px] text-gray-500">
        {{ props.modelCatalogNotice }}
      </div>
    </div>

    <div
      v-if="imageGenerationVisible"
      class="flex min-h-[38px] flex-wrap items-center gap-3 text-xs text-gray-600"
      data-testid="composer-image-generation-row"
    >
      <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Image Gen</div>
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          class="h-4 w-4 rounded border-gray-300"
          :checked="imageGenerationFollowDefault"
          :disabled="imageGenerationControlsDisabled"
          data-testid="composer-image-follow-default"
          @change="onImageGenerationFollowDefaultChange"
        />
        default
      </label>
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          class="h-4 w-4 rounded border-gray-300"
          :checked="normalizedImageGeneration.enabled"
          :disabled="imageGenerationToggleDisabled"
          data-testid="composer-image-enable"
          @change="onImageGenerationToggle"
        />
        enabled
      </label>
      <select
        class="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs shadow-sm disabled:bg-gray-100"
        :value="normalizedImageGeneration.outputMode"
        :disabled="imageGenerationControlsDisabled || !normalizedImageGeneration.enabled || !imageGenerationSupported"
        data-testid="composer-image-output-mode"
        @change="onImageGenerationOutputModeChange"
      >
        <option
          v-for="option in imageGenerationOutputModeOptions"
          :key="option.value"
          :value="option.value"
          :disabled="option.disabled === true"
        >
          {{ option.label }}
        </option>
      </select>
      <select
        class="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs shadow-sm disabled:bg-gray-100"
        :value="imageGenerationAspectRatioValue"
        :disabled="imageGenerationControlsDisabled || !normalizedImageGeneration.enabled || !imageGenerationSupported"
        data-testid="composer-image-aspect-ratio"
        @change="onImageGenerationAspectRatioChange"
      >
        <option v-for="option in IMAGE_GENERATION_ASPECT_RATIO_OPTIONS" :key="option" :value="option">
          {{ option }}
        </option>
      </select>
      <select
        class="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs shadow-sm disabled:bg-gray-100"
        :value="imageGenerationSizeValue"
        :disabled="imageGenerationControlsDisabled || !normalizedImageGeneration.enabled || !imageGenerationSupported"
        data-testid="composer-image-size"
        @change="onImageGenerationSizeChange"
      >
        <option v-for="option in IMAGE_GENERATION_SIZE_OPTIONS" :key="option" :value="option">
          {{ option }}
        </option>
      </select>
      <input
        class="w-[280px] max-w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs shadow-sm disabled:bg-gray-100"
        type="text"
        :value="normalizedImageGeneration.advancedJson"
        :disabled="imageGenerationControlsDisabled || !normalizedImageGeneration.enabled || !imageGenerationSupported"
        data-testid="composer-image-advanced-json"
        placeholder='advanced JSON, e.g. {"seed":42}'
        @input="onImageGenerationAdvancedJsonInput"
      />
      <span
        class="rounded border px-2 py-0.5 text-[11px]"
        :class="imageGenerationSupported ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'"
        data-testid="composer-image-capability-badge"
      >
        {{ imageGenerationCapabilityLabel }}
      </span>
      <div
        class="text-[11px] text-gray-500"
        :class="imageGenerationSupported ? 'text-gray-500' : 'text-red-600'"
        data-testid="composer-image-support-hint"
      >
        {{ props.imageGenerationSupportHint || (imageGenerationSupported ? 'Image generation available.' : 'Current model does not support image output.') }}
      </div>
      <div v-if="props.imageGenerationAdvancedError" class="text-[11px] text-red-600" data-testid="composer-image-advanced-error">
        {{ props.imageGenerationAdvancedError }}
      </div>
    </div>

    <div class="flex min-h-[38px] flex-wrap items-center gap-3 text-xs text-gray-600" data-testid="composer-web-search-row">
      <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Web Search</div>

      <div class="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1">
        <label class="inline-flex items-center gap-1 text-[11px] text-gray-700">
          <input
            type="checkbox"
            :disabled="webSearchControlsDisabled"
            :checked="webSearchModeDefault"
            data-testid="composer-web-mode-default"
            @change="onWebSearchModeDefaultChange"
          />
          D
        </label>
        <button
          type="button"
          class="rounded border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          :disabled="webSearchControlsDisabled"
          data-testid="composer-web-mode-toggle"
          @click="onWebSearchModeToggle"
        >
          {{ webSearchModeDisplay === 'enable' ? '🌐' : '🚫' }} {{ webSearchModeDisplay }}
        </button>
      </div>

      <div class="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1">
        <label class="inline-flex items-center gap-1 text-[11px] text-gray-700">
          <input
            type="checkbox"
            :disabled="webSearchControlsDisabled"
            :checked="webSearchEngineDefault"
            data-testid="composer-web-engine-default"
            @change="onWebSearchEngineDefaultChange"
          />
          D
        </label>
        <button
          type="button"
          class="rounded border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          :disabled="webSearchControlsDisabled"
          data-testid="composer-web-engine-toggle"
          @click="onWebSearchEngineToggle"
        >
          {{ webSearchEngineDisplay === 'native' ? '🧭' : webSearchEngineDisplay === 'exa' ? '⚡' : '♻' }} {{ webSearchEngineDisplay }}
        </button>
      </div>

      <div class="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1">
        <select
          class="rounded border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-700 shadow-sm disabled:bg-gray-100"
          :disabled="webSearchControlsDisabled"
          :value="webSearchDepthValue"
          data-testid="composer-web-depth-select"
          @change="onWebSearchDepthChange"
        >
          <option value="default">default</option>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
          <option value="custom">custom</option>
        </select>
        <select
          v-if="webSearchDepthValue === 'custom'"
          class="w-16 rounded border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-700 shadow-sm disabled:bg-gray-100"
          :disabled="webSearchControlsDisabled"
          :value="String(webSearchCustomSelectValue)"
          data-testid="composer-web-max-results"
          @change="onWebSearchCustomSelect"
        >
          <option value="10">10</option>
          <option value="9">9</option>
          <option value="8">8</option>
          <option value="7">7</option>
          <option value="6">6</option>
          <option value="5">5</option>
          <option value="4">4</option>
          <option value="3">3</option>
          <option value="2">2</option>
          <option value="1">1</option>
        </select>
      </div>

      <button
        type="button"
        class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
        :disabled="webSearchControlsDisabled"
        data-testid="composer-web-open-settings"
        @click="openWebSearchSettings"
      >
        Configure
      </button>
      <div v-if="props.webSearchSaving" class="text-[11px] text-gray-500">Saving...</div>
    </div>

    <div class="flex min-w-0 items-center gap-3 overflow-x-auto overflow-y-hidden text-xs text-gray-600" data-testid="composer-model-row">
      <div class="flex shrink-0 items-center gap-2">
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Model</div>
        <button
          type="button"
          class="max-w-[360px] truncate rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          :disabled="props.disabled"
          data-testid="current-model-pill"
          @click="openModelPicker"
        >
          {{ currentModelDisplayName }}
        </button>
        <button
          type="button"
          class="rounded-md border px-2 py-1 text-[11px] leading-none shadow-sm disabled:opacity-50"
          :class="
            currentModelIsFavorite
              ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
          "
          :disabled="props.disabled || props.isRunning || !currentModelFavoriteEnabled"
          data-testid="current-model-favorite-toggle"
          @click="onToggleCurrentModelFavorite"
        >
          {{ currentModelIsFavorite ? '★' : '☆' }}
        </button>
        <button
          v-if="isDev"
          type="button"
          class="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-600 shadow-sm"
          :disabled="props.disabled || props.isRunning"
          @click="emit('toggleShowHiddenModelsInPickers')"
        >
          {{ props.showHiddenModelsInPickers ? 'hide hidden' : 'show hidden' }}
        </button>
        <button
          type="button"
          class="rounded-lg border px-2 py-1 text-[11px] shadow-sm disabled:opacity-50"
          :class="
            modelPickerImageOnly
              ? 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100'
              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
          "
          :disabled="props.disabled || props.isRunning"
          data-testid="composer-model-image-filter-toggle"
          @click="onToggleModelPickerImageOnlyFilter"
        >
          {{ modelPickerImageOnly ? 'image filter: on' : 'image filter: off' }}
        </button>
      </div>
    </div>

    <div
      class="flex min-w-0 flex-nowrap items-start gap-3 overflow-x-auto overflow-y-hidden text-xs text-gray-600"
      ref="controlsRowRef"
      data-testid="composer-controls-row"
    >
      <div class="min-w-0 shrink-0" data-testid="favorites-strip">
        <div class="flex items-center gap-1.5">
          <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Favorites</div>
          <div class="flex items-center gap-1.5">
            <button
              v-if="!favoriteStripEditMode"
              type="button"
              class="rounded border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              :disabled="props.disabled || props.isRunning || favoriteDisplayItems.length === 0"
              data-testid="favorites-edit"
              @click="openFavoriteStripEditMode"
            >
              Edit
            </button>
            <template v-else>
              <button
                type="button"
                class="rounded border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                :disabled="props.disabled || props.isRunning"
                data-testid="favorites-cancel"
                @click="cancelFavoriteStripEditMode"
              >
                Cancel
              </button>
              <button
                type="button"
                class="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                :disabled="props.disabled || props.isRunning || !favoriteStripOrderDirty"
                data-testid="favorites-done"
                @click="saveFavoriteStripEditMode"
              >
                Done
              </button>
            </template>
          </div>
        </div>
        <div v-if="favoriteDisplayItems.length === 0" class="text-[11px] text-gray-400">
          (none)
        </div>
        <div
          v-else
          class="max-w-full"
          ref="favoriteScrollShellRef"
        >
          <div
            v-if="!favoriteStripEditMode"
            class="flex items-center gap-1 overflow-x-auto"
            ref="favoriteScrollReadRef"
            :style="favoriteScrollContainerStyle"
          >
            <button
              v-for="m in favoriteDisplayItems"
              :key="`fav-${m.modelId}`"
              type="button"
              class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
              :disabled="props.disabled || props.isRunning"
              :data-testid="`favorite-model-${m.modelId}`"
              @click="emit('update:model', m.modelId)"
            >
              {{ m.name }}
            </button>
          </div>
          <div
            v-else
            class="flex items-center gap-1 overflow-x-auto"
            ref="favoriteScrollEditRef"
            :style="favoriteScrollContainerStyle"
          >
            <div
              v-for="(m, index) in editableFavoriteDisplayItems"
              :key="`favorite-strip-edit-${m.modelKey}`"
              class="relative flex min-w-[128px] items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm"
              draggable="true"
              :data-testid="`favorite-edit-card-${index}`"
              @dragstart="onFavoriteStripDragStart(index, $event)"
              @dragover="onFavoriteStripDragOver($event)"
              @drop="onFavoriteStripDrop(index, $event)"
              @dragend="onFavoriteStripDragEnd"
            >
              <div
                class="pointer-events-none absolute left-0 top-1/2 z-10 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-[10px] text-gray-400"
                aria-hidden="true"
              >
                ::
              </div>
              <div class="min-w-0 flex-1 whitespace-normal break-words leading-tight">{{ m.name }}</div>
              <button
                type="button"
                class="absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded border border-gray-200 bg-white text-sm leading-none text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                :disabled="props.disabled || props.isRunning"
                :data-testid="`favorite-edit-remove-${index}`"
                @click="removeFavoriteFromStrip(index)"
              >
                ×
              </button>
            </div>
          </div>
          <div
            ref="favoriteReserveSpacerRef"
            class="pointer-events-none border-t border-amber-500/60 bg-amber-300/35"
            aria-hidden="true"
            style="height: var(--sv-scrollbar-h, 0px);"
            data-testid="favorites-scrollbar-reserve-spacer"
          />
          <div class="h-1" aria-hidden="true" />
        </div>
      </div>

      <div class="flex shrink-0 items-center gap-2" data-testid="recents-strip">
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Recents</div>
        <div v-if="inlineRecentDisplayItems.length === 0" class="text-[11px] text-gray-400">
          (none)
        </div>
        <div v-else class="flex max-w-full items-center gap-1 overflow-x-auto pb-1">
          <button
            v-for="m in inlineRecentDisplayItems"
            :key="`recent-${m.modelKey}`"
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            :disabled="props.disabled || props.isRunning"
            :data-testid="`recent-model-${m.modelId}`"
            @click="emit('update:model', m.modelId)"
          >
            {{ m.name }}
          </button>
          <button
            v-if="hiddenRecentCount > 0"
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-600 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            :disabled="props.disabled"
            data-testid="recents-open-picker"
            @click="openModelPicker"
          >
            +{{ hiddenRecentCount }} more
          </button>
        </div>
      </div>

    </div>
  </div>

  <ModelPickerDialog
    :open="modelPickerOpen"
    :disabled="props.disabled || props.isRunning"
    :isRunning="props.isRunning"
    :selectedModelId="props.model"
    :favoriteModelKeys="favoriteModelKeys"
    :fallbackModels="props.modelCatalog"
    :notice="props.modelCatalogNotice"
    :queryFn="props.modelPickerQueryFn"
    :forceOutputImageOnly="modelPickerImageOnly"
    @close="closeModelPicker"
    @select="onSelectModelFromPicker"
    @toggle-favorite="onToggleModelPickerFavorite"
    @reorder-favorites="onReorderFavorites"
  />
</template>
