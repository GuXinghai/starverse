<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { t } from '@/shared/i18n'
import type { GenerationV2WebSearchControls } from '../app/generationV2WebSearchProjection'
import { normalizeSearchSettingsLayer } from '@/next/openrouter/searchSettingsPersistence'
import type {
  ResolvedSearchSettings,
  SearchDepth,
  SearchEngine,
  SearchMode,
  SearchSettingsLayer,
} from '@/next/openrouter/searchSettingsResolver'

const props = withDefaults(defineProps<{
  modelValue: SearchSettingsLayer | null
  disabled?: boolean
  resolved?: ResolvedSearchSettings | null
  inheritanceHint?: string | null
  controls?: GenerationV2WebSearchControls
}>(), {
  disabled: false,
  resolved: null,
  inheritanceHint: null,
})

const emit = defineEmits<{
  'update:modelValue': [value: SearchSettingsLayer | null]
}>()

const normalizedLayer = computed<SearchSettingsLayer>(() => normalizeSearchSettingsLayer(props.modelValue,
  props.controls ? { preserveExplicitMaxResults: true } : {}) ?? {})
const maxResultsBounds = computed(() => props.controls?.maxResultsBounds ?? { min: 1, max: 10 })
const engineAvailable = computed(() => props.controls === undefined || props.controls.engines.length > 0)
const depthAvailable = computed(() => props.controls === undefined || !!props.controls.maxResultsBounds || props.controls.contexts.length > 0)
const customAvailable = computed(() => props.controls === undefined || !!props.controls.maxResultsBounds)
const searchUnavailable = computed(() => props.controls !== undefined && !props.controls.enabled)
const controlFeedback = computed(() => {
  if (!props.controls) return null
  if (props.controls.reason) return props.controls.reason
  if (props.resolved?.effectiveMode === false) return null
  const layer = props.modelValue
  if (layer?.searchEngine && layer.searchEngine !== 'default' && !props.controls.engines.includes(layer.searchEngine)) return 'errors.webSearch.unsupportedSetting'
  if (typeof layer?.maxResults === 'number') {
    if (!props.controls.maxResultsBounds) return 'errors.webSearch.unsupportedSetting'
    if (!Number.isSafeInteger(layer.maxResults) || layer.maxResults < maxResultsBounds.value.min || layer.maxResults > maxResultsBounds.value.max) return 'errors.webSearch.invalidMaxResults'
  }
  if (layer?.searchDepth && layer.searchDepth !== 'default' && !depthAvailable.value) return 'errors.webSearch.unsupportedSetting'
  return searchUnavailable.value ? 'errors.webSearch.capabilityUnavailable' : null
})
const modeValue = computed<SearchMode>(() => normalizedLayer.value.searchMode ?? 'default')
const depthValue = computed<SearchDepth>(() => normalizedLayer.value.searchDepth ?? 'default')
const engineValue = computed<SearchEngine>(() => normalizedLayer.value.searchEngine ?? 'default')
const depthPanelExpanded = ref(true)
const customInputText = ref('')
const lastExplicitMode = ref<'enable' | 'disable'>('enable')
const lastExplicitEngine = ref<'auto' | 'native' | 'exa'>('auto')
const lastValidCustomMaxResults = ref<number | null>(null)

const effectiveSummary = computed(() => {
  const resolved = props.resolved
  if (!resolved) return null
  const modeLabel = resolved.effectiveMode ? 'On' : 'Off'
  const engineLabel = resolved.effectiveEngine || 'auto'
  return [`Effective: ${modeLabel}`, ...(engineAvailable.value ? [`engine ${engineLabel}`] : []),
    ...(customAvailable.value ? [`max ${resolved.effectiveMaxResults}`] : []),
    ...(props.controls === undefined || props.controls.contexts.length > 0 ? [`context ${resolved.effectiveSearchContextSize}`] : [])].join(' | ')
})

const inheritedMode = computed<'enable' | 'disable'>(() => {
  if (!props.resolved) return lastExplicitMode.value
  return props.resolved.effectiveMode === true ? 'enable' : 'disable'
})
const inheritedEngine = computed<'auto' | 'native' | 'exa'>(() => {
  if (!props.resolved) return lastExplicitEngine.value
  const raw = props.resolved?.effectiveEngine
  return raw === 'native' || raw === 'exa' ? raw : 'auto'
})

const modeDisplayValue = computed<'enable' | 'disable'>(() => {
  if (modeValue.value === 'enable' || modeValue.value === 'disable') return modeValue.value
  return inheritedMode.value
})

const engineDisplayValue = computed<'auto' | 'native' | 'exa'>(() => {
  if (engineValue.value === 'auto' || engineValue.value === 'native' || engineValue.value === 'exa') return engineValue.value
  return inheritedEngine.value
})

const modeDefaultSelected = computed(() => modeValue.value === 'default')
const engineDefaultSelected = computed(() => engineValue.value === 'default')
const isCustomDepth = computed(() => depthValue.value === 'custom')
const isCustomInputValid = computed(() => parseValidCustomMaxResults(customInputText.value) !== null)
const modeIcon = computed(() => (modeDisplayValue.value === 'enable' ? '🌐' : '🚫'))
const engineIcon = computed(() => {
  if (engineDisplayValue.value === 'native') return '🧭'
  if (engineDisplayValue.value === 'exa') return '⚡'
  return '♻'
})

function clampMaxResults(value: number): number {
  if (!Number.isFinite(value)) return 5
  const rounded = Math.round(value)
  if (rounded < maxResultsBounds.value.min) return maxResultsBounds.value.min
  if (rounded > maxResultsBounds.value.max) return maxResultsBounds.value.max
  return rounded
}

function emitLayer(next: SearchSettingsLayer) {
  emit('update:modelValue', normalizeSearchSettingsLayer(next, props.controls ? { preserveExplicitMaxResults: true } : {}))
}

function parseValidCustomMaxResults(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (!/^-?\d+$/.test(trimmed)) return null
  const value = Number(trimmed)
  if (!Number.isInteger(value)) return null
  if (value < maxResultsBounds.value.min || value > maxResultsBounds.value.max) return null
  return value
}

function cycleEngine(current: 'auto' | 'native' | 'exa'): 'auto' | 'native' | 'exa' {
  if (props.controls) {
    const engines = props.controls.engines.filter((v): v is 'auto' | 'native' | 'exa' => v === 'auto' || v === 'native' || v === 'exa')
    return engines[(engines.indexOf(current) + 1) % engines.length] ?? current
  }
  if (current === 'auto') return 'native'
  if (current === 'native') return 'exa'
  return 'auto'
}

function onModeDefaultChange(event: Event) {
  if (props.disabled) return
  const checked = (event.target as HTMLInputElement).checked
  if (checked) {
    lastExplicitMode.value = modeDisplayValue.value
    emitLayer({
      ...normalizedLayer.value,
      searchMode: 'default',
    })
    return
  }
  emitLayer({
    ...normalizedLayer.value,
    searchMode: lastExplicitMode.value,
  })
}

function onEngineDefaultChange(event: Event) {
  if (props.disabled) return
  const checked = (event.target as HTMLInputElement).checked
  if (checked) {
    lastExplicitEngine.value = engineDisplayValue.value
    emitLayer({
      ...normalizedLayer.value,
      searchEngine: 'default',
    })
    return
  }
  emitLayer({
    ...normalizedLayer.value,
    searchEngine: lastExplicitEngine.value,
  })
}

function onModeValueClick() {
  if (props.disabled) return
  if (searchUnavailable.value && modeDisplayValue.value !== 'enable') return
  if (modeDefaultSelected.value) {
    const inherited = modeDisplayValue.value
    lastExplicitMode.value = inherited
    emitLayer({
      ...normalizedLayer.value,
      searchMode: inherited,
    })
    return
  }
  const next: 'enable' | 'disable' = modeDisplayValue.value === 'enable' ? 'disable' : 'enable'
  lastExplicitMode.value = next
  emitLayer({
    ...normalizedLayer.value,
    searchMode: next,
  })
}

function onEngineValueClick() {
  if (props.disabled) return
  if (engineDefaultSelected.value) {
    const inherited = engineDisplayValue.value
    lastExplicitEngine.value = inherited
    emitLayer({
      ...normalizedLayer.value,
      searchEngine: inherited,
    })
    return
  }
  const next = cycleEngine(engineDisplayValue.value)
  lastExplicitEngine.value = next
  emitLayer({
    ...normalizedLayer.value,
    searchEngine: next,
  })
}

function buttonClass(active: boolean): string {
  if (active) return 'border-blue-300 bg-blue-50 text-blue-700'
  return 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
}

function onDepthSelect(nextRaw: string) {
  if (props.disabled) return
  if (!depthAvailable.value || nextRaw === 'custom' && !customAvailable.value) return
  const next: SearchDepth =
    nextRaw === 'low' || nextRaw === 'medium' || nextRaw === 'high' || nextRaw === 'custom' || nextRaw === 'default'
      ? nextRaw
      : 'default'
  const previous = depthValue.value
  if (previous === 'custom' && next !== 'custom') {
    const valid = parseValidCustomMaxResults(customInputText.value)
    if (valid !== null) lastValidCustomMaxResults.value = valid
    customInputText.value = ''
  }

  if (next === 'custom') {
    const inheritedMaxResults = props.resolved?.effectiveMaxResults
    const valid =
      parseValidCustomMaxResults(customInputText.value)
      ?? lastValidCustomMaxResults.value
      ?? (typeof inheritedMaxResults === 'number' ? clampMaxResults(inheritedMaxResults) : null)
      ?? 5
    customInputText.value = String(valid)
    lastValidCustomMaxResults.value = valid
    emitLayer({
      ...normalizedLayer.value,
      searchDepth: 'custom',
      maxResults: valid,
    })
    return
  }

  emitLayer({
    ...normalizedLayer.value,
    searchDepth: next,
  })
}

function onCustomInput(event: Event) {
  if (props.disabled || !customAvailable.value) return
  customInputText.value = (event.target as HTMLInputElement).value
  const valid = parseValidCustomMaxResults(customInputText.value)
  if (valid === null) return
  lastValidCustomMaxResults.value = valid
  if (!isCustomDepth.value) return
  emitLayer({
    ...normalizedLayer.value,
    searchDepth: 'custom',
    maxResults: valid,
  })
}

function onCustomCommit() {
  if (props.disabled || !customAvailable.value) return
  if (props.controls && parseValidCustomMaxResults(customInputText.value) === null) return
  const trimmed = customInputText.value.trim()
  if (!trimmed) return
  if (!/^-?\d+$/.test(trimmed)) return
  const clamped = clampMaxResults(Number(trimmed))
  customInputText.value = String(clamped)
  lastValidCustomMaxResults.value = clamped
  if (!isCustomDepth.value) return
  emitLayer({
    ...normalizedLayer.value,
    searchDepth: 'custom',
    maxResults: clamped,
  })
}

function openDepthPanel() {
  if (lastValidCustomMaxResults.value !== null && customInputText.value.trim().length === 0) {
    customInputText.value = String(lastValidCustomMaxResults.value)
  }
  depthPanelExpanded.value = true
}

function closeDepthPanel() {
  if (isCustomDepth.value && !isCustomInputValid.value) return
  depthPanelExpanded.value = false
}

function onDepthPanelToggle() {
  if (props.disabled) return
  if (depthPanelExpanded.value) closeDepthPanel()
  else openDepthPanel()
}

watch(
  () => [modeValue.value, modeDisplayValue.value] as const,
  ([mode, display]) => {
    if (mode === 'enable' || mode === 'disable') {
      lastExplicitMode.value = mode
      return
    }
    if (display === 'enable' || display === 'disable') lastExplicitMode.value = display
  },
  { immediate: true }
)

watch(
  () => [engineValue.value, engineDisplayValue.value] as const,
  ([engine, display]) => {
    if (engine === 'auto' || engine === 'native' || engine === 'exa') {
      lastExplicitEngine.value = engine
      return
    }
    if (display === 'auto' || display === 'native' || display === 'exa') lastExplicitEngine.value = display
  },
  { immediate: true }
)

watch(
  () => [depthValue.value, normalizedLayer.value.maxResults] as const,
  ([depth, maxResults]) => {
    if (typeof maxResults === 'number' && Number.isFinite(maxResults)) {
      const clamped = props.controls ? maxResults : clampMaxResults(maxResults)
      lastValidCustomMaxResults.value = clamped
      if (depth === 'custom') customInputText.value = String(clamped)
      return
    }
    if (depth === 'custom' && customInputText.value.trim().length === 0 && lastValidCustomMaxResults.value !== null) {
      customInputText.value = String(lastValidCustomMaxResults.value)
      return
    }
    if (depth !== 'custom' && customInputText.value.trim().length === 0) {
      customInputText.value = ''
    }
  },
  { immediate: true }
)
</script>

<template>
  <div class="space-y-3">
    <div>
      <div class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Search mode</div>
      <div class="mt-1 flex flex-wrap items-center gap-2">
        <label class="inline-flex items-center gap-1 text-[11px] text-gray-700">
          <input
            type="checkbox"
            :disabled="props.disabled"
            :checked="modeDefaultSelected"
            data-testid="search-mode-default"
            @change="onModeDefaultChange"
          />
          Default
        </label>
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
          :class="buttonClass(modeDisplayValue === 'enable')"
          :disabled="props.disabled || (searchUnavailable && modeDisplayValue !== 'enable')"
          data-testid="search-mode-toggle"
          @click="onModeValueClick"
          :title="`search mode ${modeDisplayValue}`"
        >
          <span aria-hidden="true">{{ modeIcon }}</span>
          <span>{{ modeDisplayValue }}</span>
        </button>
      </div>
    </div>

    <div v-if="engineAvailable">
      <div class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Engine</div>
      <div class="mt-1 flex flex-wrap items-center gap-2">
        <label class="inline-flex items-center gap-1 text-[11px] text-gray-700">
          <input
            type="checkbox"
            :disabled="props.disabled"
            :checked="engineDefaultSelected"
            data-testid="search-engine-default"
            @change="onEngineDefaultChange"
          />
          Default
        </label>
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
          :class="buttonClass(engineDisplayValue !== 'exa')"
          :disabled="props.disabled"
          data-testid="search-engine-toggle"
          @click="onEngineValueClick"
          :title="`search engine ${engineDisplayValue}`"
        >
          <span aria-hidden="true">{{ engineIcon }}</span>
          {{ engineDisplayValue }}
        </button>
      </div>
    </div>

    <div v-if="depthAvailable">
      <div class="flex items-center justify-between gap-2">
        <div class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Depth presets</div>
        <button
          type="button"
          class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="props.disabled"
          data-testid="search-depth-panel-toggle"
          :aria-expanded="depthPanelExpanded ? 'true' : 'false'"
          @click="onDepthPanelToggle"
        >
          {{ depthPanelExpanded ? 'Collapse' : 'Expand' }}
        </button>
      </div>
      <div v-show="depthPanelExpanded" class="mt-2 space-y-2 rounded-md border border-gray-100 bg-gray-50/70 px-3 py-2">
        <label class="flex items-center gap-2 text-[11px] text-gray-700">
          <span class="font-semibold">Depth</span>
          <select
            class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm disabled:bg-gray-100"
            :disabled="props.disabled"
            :value="depthValue"
            data-testid="search-depth-select"
            @change="onDepthSelect(($event.target as HTMLSelectElement).value)"
          >
            <option value="default">default</option>
            <option v-if="customAvailable || props.controls?.contexts.includes('low')" value="low">low</option>
            <option v-if="customAvailable || props.controls?.contexts.includes('medium')" value="medium">medium</option>
            <option v-if="customAvailable || props.controls?.contexts.includes('high')" value="high">high</option>
            <option v-if="customAvailable" value="custom">custom</option>
          </select>
        </label>
        <div v-if="customAvailable" class="flex items-center gap-2">
          <div class="text-[11px] font-semibold text-gray-700">Custom max results ({{ maxResultsBounds.min }}-{{ maxResultsBounds.max }})</div>
          <input
            type="text"
            inputmode="numeric"
            class="w-28 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm disabled:cursor-not-allowed disabled:bg-gray-100"
            :disabled="props.disabled || !isCustomDepth"
            :value="customInputText"
            data-testid="search-max-results-input"
            @input="onCustomInput"
            @keydown.enter.prevent="onCustomCommit"
          />
        </div>
      </div>
    </div>

    <div v-if="controlFeedback" role="status" data-testid="search-control-feedback" class="text-[11px] text-amber-700">{{ t(controlFeedback) }}</div>
    <div v-if="props.controls && isCustomDepth && !isCustomInputValid" role="status" class="text-[11px] text-amber-700">{{ t('errors.webSearch.invalidMaxResults') }}</div>

    <div v-if="effectiveSummary" class="rounded-md border border-gray-100 bg-gray-50/60 px-3 py-2 text-[11px] text-gray-600">
      {{ effectiveSummary }}
    </div>
    <div v-if="props.inheritanceHint" class="text-[11px] text-gray-500">
      {{ props.inheritanceHint }}
    </div>
  </div>
</template>
