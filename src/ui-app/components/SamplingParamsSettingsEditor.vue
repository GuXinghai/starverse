<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  OPENROUTER_SAMPLING_PARAM_SPECS,
  OPENROUTER_SAMPLING_PARAM_SPEC_MAP,
  type OpenRouterSamplingParamName,
} from '@/next/openrouter/samplingParamsCatalog'
import {
  normalizeSamplingParamNumericValue,
  normalizeSamplingParamsLayer,
  type ResolvedSamplingParams,
  type SamplingParamSource,
  type SamplingParamsLayer,
} from '@/next/openrouter/samplingParamsResolver'

const props = withDefaults(defineProps<{
  modelValue: SamplingParamsLayer | null
  resolved?: ResolvedSamplingParams | null
  disabled?: boolean
  compact?: boolean
  collapsible?: boolean
  defaultCollapsed?: boolean
}>(), {
  resolved: null,
  disabled: false,
  compact: false,
  collapsible: true,
  defaultCollapsed: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: SamplingParamsLayer | null]
}>()

const normalizedLayer = computed<SamplingParamsLayer>(() => normalizeSamplingParamsLayer(props.modelValue) ?? {})
const inputTextByKey = ref<Record<OpenRouterSamplingParamName, string>>({
  temperature: '',
  top_p: '',
  top_k: '',
  min_p: '',
  top_a: '',
  frequency_penalty: '',
  presence_penalty: '',
  repetition_penalty: '',
  seed: '',
  max_tokens: '',
})
const expanded = ref(!props.defaultCollapsed)

const customCount = computed(() => {
  let count = 0
  for (const key of OPENROUTER_SAMPLING_PARAM_SPECS.map((row) => row.key)) {
    if (normalizedLayer.value[key]?.mode === 'custom') count += 1
  }
  return count
})

function toNumberText(value: number): string {
  if (!Number.isFinite(value)) return ''
  if (Number.isInteger(value)) return String(value)
  return String(Number(value.toFixed(6)))
}

function sourceLabel(source: SamplingParamSource): string {
  if (source === 'convo') return 'session'
  if (source === 'project') return 'project'
  if (source === 'global') return 'global'
  return 'default'
}

function modeForKey(key: OpenRouterSamplingParamName): 'default' | 'custom' {
  return normalizedLayer.value[key]?.mode === 'custom' ? 'custom' : 'default'
}

function customValueForKey(key: OpenRouterSamplingParamName): number | null {
  const override = normalizedLayer.value[key]
  if (!override || override.mode !== 'custom') return null
  return override.value
}

function parseInputValue(key: OpenRouterSamplingParamName, raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return normalizeSamplingParamNumericValue(key, parsed)
}

function hasInputError(key: OpenRouterSamplingParamName): boolean {
  if (modeForKey(key) !== 'custom') return false
  const text = inputTextByKey.value[key] ?? ''
  if (!text.trim()) return false
  return parseInputValue(key, text) === null
}

function validationHint(key: OpenRouterSamplingParamName): string {
  const spec = OPENROUTER_SAMPLING_PARAM_SPEC_MAP[key]
  const minText = spec.min !== undefined ? String(spec.min) : '-inf'
  const maxText = spec.max !== undefined ? String(spec.max) : '+inf'
  return `${spec.type} ${minText}..${maxText}`
}

function inheritedValueHint(key: OpenRouterSamplingParamName): string {
  const resolved = props.resolved?.resolvedByKey[key]
  if (resolved?.mode === 'custom' && typeof resolved.value === 'number') {
    return `${toNumberText(resolved.value)} [${sourceLabel(resolved.source)}]`
  }
  const specDefault = OPENROUTER_SAMPLING_PARAM_SPEC_MAP[key].defaultValue
  if (specDefault !== undefined) return `${toNumberText(specDefault)} [default]`
  return '[default]'
}

function emitLayer(nextLayer: SamplingParamsLayer | null) {
  emit('update:modelValue', normalizeSamplingParamsLayer(nextLayer))
}

function setCustomValue(key: OpenRouterSamplingParamName, value: number) {
  const base = { ...(normalizeSamplingParamsLayer(normalizedLayer.value) ?? {}) }
  base[key] = { mode: 'custom', value }
  emitLayer(base)
}

function setDefaultValue(key: OpenRouterSamplingParamName) {
  const base = { ...(normalizeSamplingParamsLayer(normalizedLayer.value) ?? {}) }
  delete base[key]
  emitLayer(Object.keys(base).length > 0 ? base : null)
}

function onModeChange(key: OpenRouterSamplingParamName, nextModeRaw: string) {
  if (props.disabled) return
  if (nextModeRaw === 'default') {
    setDefaultValue(key)
    return
  }

  const parsedInput = parseInputValue(key, inputTextByKey.value[key] ?? '')
  const inherited = props.resolved?.resolvedByKey[key]
  const inheritedCustom = inherited?.mode === 'custom' && typeof inherited.value === 'number' ? inherited.value : null
  const spec = OPENROUTER_SAMPLING_PARAM_SPEC_MAP[key]
  const fallback = spec.defaultValue ?? spec.min ?? 0
  const nextValue = parsedInput ?? inheritedCustom ?? fallback
  const normalized = normalizeSamplingParamNumericValue(key, nextValue)
  if (normalized === null) return
  inputTextByKey.value[key] = toNumberText(normalized)
  setCustomValue(key, normalized)
}

function onValueInput(key: OpenRouterSamplingParamName, event: Event) {
  const nextText = (event.target as HTMLInputElement).value
  inputTextByKey.value[key] = nextText
}

function onValueCommit(key: OpenRouterSamplingParamName) {
  if (modeForKey(key) !== 'custom') return
  const parsed = parseInputValue(key, inputTextByKey.value[key] ?? '')
  if (parsed === null) {
    const current = customValueForKey(key)
    if (current !== null) inputTextByKey.value[key] = toNumberText(current)
    else setDefaultValue(key)
    return
  }
  inputTextByKey.value[key] = toNumberText(parsed)
  setCustomValue(key, parsed)
}

function resetAllToDefault() {
  if (props.disabled) return
  emitLayer(null)
}

function toggleExpanded() {
  if (!props.collapsible) return
  expanded.value = !expanded.value
}

watch(
  () => normalizedLayer.value,
  (layer) => {
    for (const spec of OPENROUTER_SAMPLING_PARAM_SPECS) {
      const override = layer[spec.key]
      inputTextByKey.value[spec.key] = override?.mode === 'custom' ? toNumberText(override.value) : ''
    }
  },
  { immediate: true, deep: true }
)
</script>

<template>
  <div class="min-w-0 space-y-1.5" data-testid="sampling-params-editor">
    <div class="flex min-w-0 items-center justify-between gap-2">
      <button
        v-if="props.collapsible"
        type="button"
        class="inline-flex min-w-0 items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-600 shadow-sm hover:bg-gray-50"
        data-testid="sampling-params-toggle"
        @click="toggleExpanded"
      >
        <span class="shrink-0">{{ expanded ? 'Hide' : 'Show' }}</span>
        <span>Parameters</span>
        <span class="shrink-0 text-[10px] text-gray-500">({{ customCount }})</span>
      </button>
      <div v-else class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Parameters</div>
      <div class="flex shrink-0 items-center gap-2">
        <span v-if="!props.collapsible && customCount > 0" class="text-[10px] text-gray-500">{{ customCount }} custom</span>
        <button
          type="button"
          class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          :disabled="props.disabled"
          data-testid="sampling-params-reset"
          @click="resetAllToDefault"
        >
          Reset
        </button>
      </div>
    </div>

    <div
      v-if="expanded || !props.collapsible"
      class="grid min-w-0 gap-1.5"
      :class="props.compact ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-2'"
    >
      <div
        v-for="spec in OPENROUTER_SAMPLING_PARAM_SPECS"
        :key="spec.key"
        class="grid min-w-0 items-center gap-2 rounded-md border border-gray-100 bg-gray-50/70 px-2 py-1.5"
        :class="props.compact ? 'grid-cols-[minmax(0,1fr)_82px]' : 'grid-cols-[140px_86px_minmax(120px,1fr)]'"
      >
        <div class="min-w-0">
          <div class="truncate text-[11px] font-semibold text-gray-700" :title="spec.label">{{ spec.label }}</div>
        </div>

        <select
          class="min-w-0 w-full rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm disabled:bg-gray-100"
          :disabled="props.disabled"
          :value="modeForKey(spec.key)"
          :data-testid="`sampling-mode-${spec.key}`"
          @change="onModeChange(spec.key, ($event.target as HTMLSelectElement).value)"
        >
          <option value="default">default</option>
          <option value="custom">custom</option>
        </select>

        <div class="min-w-0" :class="props.compact ? 'col-span-2' : ''">
          <input
            type="number"
            class="min-w-0 w-full rounded border bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm disabled:bg-gray-100"
            :class="hasInputError(spec.key) ? 'border-red-300' : 'border-gray-200'"
            :disabled="props.disabled || modeForKey(spec.key) === 'default'"
            :value="inputTextByKey[spec.key]"
            :placeholder="modeForKey(spec.key) === 'default' ? inheritedValueHint(spec.key) : undefined"
            :step="spec.step"
            :min="spec.min"
            :max="spec.max"
            :title="hasInputError(spec.key) ? validationHint(spec.key) : undefined"
            :aria-invalid="hasInputError(spec.key) ? 'true' : 'false'"
            :data-testid="`sampling-value-${spec.key}`"
            @input="onValueInput(spec.key, $event)"
            @blur="onValueCommit(spec.key)"
            @keydown.enter.prevent="onValueCommit(spec.key)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
