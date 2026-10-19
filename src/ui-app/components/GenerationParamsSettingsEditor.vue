<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  GENERATION_PARAM_SPECS,
  GENERATION_PARAM_SPEC_MAP,
  type GenerationParamSpec,
} from '@/next/generation-params/generationParamCatalog'
import {
  normalizeGenerationParamsLayer,
  normalizeGenerationParamSetting,
} from '@/next/generation-params/generationParamResolver'
import { normalizeGenerationParamValue } from '@/next/generation-params/generationParamValidation'
import { formatOpenAIResponsesAutoReasoningLabel } from '@/next/provider/openai-responses/openaiResponsesReasoningPolicy'
import type {
  GenerationParamCapability,
  GenerationParamKey,
  GenerationParamSetting,
  GenerationParamsLayer,
  ProviderGenerationParamProfile,
  ResolvedGenerationParams,
} from '@/next/generation-params/generationParamTypes'
import type { GenerationControlsProjectionV2 } from '@/core/generation-v2/capability/resolvedCapabilityV2'
import type { ModelCapabilitySemanticPathV2 as RuntimeCapabilitySemanticPathV2 } from '@/core/generation-v2/capability/modelCapabilitySchemaV2'
import { t, tf } from '@/shared/i18n'
import UiIcon from '@/ui-kit/icons/UiIcon.vue'
import { modelFactControlKey } from '@/shared/model-facts/modelFactPresentation'
import {
  modelFactControlReasonTextV1,
  modelFactControlReasonV1,
  type ModelFactControlExplanationsV1,
  type ModelFactControlReasonV1,
} from '../app/modelFactControlExplanations'
import ModelFactControlReason from './ModelFactControlReason.vue'

const props = withDefaults(defineProps<{
  modelValue: GenerationParamsLayer | null
  resolved?: ResolvedGenerationParams | null
  profile?: ProviderGenerationParamProfile | null
  modelId?: string | null
  disabled?: boolean
  compact?: boolean
  collapsible?: boolean
  defaultCollapsed?: boolean
  capabilityProjection?: GenerationControlsProjectionV2 | null
  controlExplanations?: ModelFactControlExplanationsV1 | null
}>(), {
  resolved: null,
  profile: null,
  modelId: null,
  disabled: false,
  compact: false,
  collapsible: true,
  defaultCollapsed: false,
  capabilityProjection: null,
  controlExplanations: null,
})

const emit = defineEmits<{
  'update:modelValue': [value: GenerationParamsLayer | null]
  inspectModelFactsPath: [path: string]
}>()

const capabilityPathByParam: Partial<Record<GenerationParamKey, RuntimeCapabilitySemanticPathV2>> = {
  temperature: 'generation.temperature',
  topP: 'generation.topP',
  topK: 'generation.topK',
  minP: 'generation.minP',
  topA: 'generation.topA',
  frequencyPenalty: 'generation.frequencyPenalty',
  presencePenalty: 'generation.presencePenalty',
  repetitionPenalty: 'generation.repetitionPenalty',
  seed: 'generation.seed',
  maxOutputTokens: 'generation.maxOutputTokens',
  reasoningEffort: 'reasoning.effort',
  reasoningSummary: 'reasoning.summary',
  thinkingEnabled: 'reasoning.mode',
  thinkingBudget: 'providerExtension.thinkingBudget',
  thinkingLevel: 'providerExtension.thinkingLevel',
  includeThoughts: 'providerExtension.includeThoughts',
  thoughtSummaryMode: 'reasoning.summary',
  stopSequences: 'generation.stop',
  googleSearch: 'web.types',
  imageSearch: 'web.types',
  verbosity: 'providerExtension.verbosity',
}

const normalizedLayer = computed<GenerationParamsLayer>(() => normalizeGenerationParamsLayer(props.modelValue) ?? {})
const capabilities = computed<Partial<Record<GenerationParamKey, GenerationParamCapability>>>(() =>
  props.capabilityProjection
    ? Object.fromEntries(GENERATION_PARAM_SPECS.map((spec) => [spec.key, capabilityFromProjection(spec.key)])) as Partial<Record<GenerationParamKey, GenerationParamCapability>>
    : {}
)
const inputTextByKey = ref<Record<GenerationParamKey, string>>(Object.fromEntries(
  GENERATION_PARAM_SPECS.map((spec) => [spec.key, '']),
) as Record<GenerationParamKey, string>)
const expanded = ref(!props.defaultCollapsed)
const showAdvanced = ref(false)

function capabilityFromProjection(key: GenerationParamKey): GenerationParamCapability {
  const spec = GENERATION_PARAM_SPEC_MAP[key]
  const path = capabilityPathByParam[key]
  const field = path ? props.capabilityProjection?.controls[path] : undefined
  const base = (supported: boolean, extra: Partial<GenerationParamCapability> = {}): GenerationParamCapability => ({
    supported,
    valueType: spec.valueType,
    ui: { visibleByDefault: supported && field?.visibility !== 'hidden', editable: supported && field?.visibility !== 'hidden' },
    ...extra,
  })
  if (!field || field.state === 'missing' || field.state === 'unsupported' || field.state === 'conflict') return base(false, {
    ui: { visibleByDefault: false, editable: false, warning: tf('chat.generationParams.unsupportedForModel', { param: spec.label }) },
  })
  if (field.state === 'unknown') {
    return base(true, spec.valueType === 'enum'
      ? { valueType: 'string', maxLength: 128 }
      : {})
  }
  const domain = field.domain
  if (key === 'thinkingEnabled' || key === 'includeThoughts') {
    const values = domain?.kind === 'enum' ? domain.values : []
    return base(values.includes('enabled') && values.includes('disabled'))
  }
  if (key === 'googleSearch' || key === 'imageSearch') {
    const token = key === 'googleSearch' ? 'web' : 'image'
    const values = domain?.kind === 'enum_list' ? domain.values : []
    return base(values.includes(token))
  }
  if (!domain) return base(true)
  if (domain.kind === 'enum') return base(true, {
    enumValues: domain.values.filter((value): value is string => typeof value === 'string'),
  })
  if (domain.kind === 'string') return base(true, {
    valueType: 'string',
    maxLength: domain.maxLength,
  })
  if (domain.kind === 'range') return base(true, {
    range: { min: domain.min, max: domain.max, integer: domain.integer },
  })
  if (domain.kind === 'string_list') return base(true)
  if (domain.kind === 'boolean') return base(true)
  return base(false, {
    ui: { visibleByDefault: false, editable: false, warning: tf('chat.generationParams.unsupportedForModel', { param: spec.label }) },
  })
}

const visibleSpecs = computed(() => GENERATION_PARAM_SPECS.filter((spec) => {
  const setting = normalizedLayer.value[spec.key]
  const capability = capabilities.value[spec.key]
  if (!props.capabilityProjection) return false
  if (setting && setting.mode !== 'inherit') return true
  return capability?.supported === true && (showAdvanced.value || capability.ui?.visibleByDefault !== false)
}))

/** Params hidden because of Model Facts; listed with their reason instead of vanishing. */
const unavailableSpecs = computed(() => {
  if (!props.capabilityProjection || !props.controlExplanations) return []
  return GENERATION_PARAM_SPECS.filter((spec) => {
    const setting = normalizedLayer.value[spec.key]
    if (setting && setting.mode !== 'inherit') return false
    return capabilities.value[spec.key]?.supported !== true
  })
})
const canInspectModelFacts = computed(() => props.controlExplanations?.subject != null)

function unavailableReason(spec: GenerationParamSpec): ModelFactControlReasonV1 | null {
  const path = capabilityPathByParam[spec.key]
  return modelFactControlReasonV1(props.controlExplanations, path ? [path] : [])
}

/** Unknown-state controls stay editable, but their allowed values must not look verified. */
function isUnverified(spec: GenerationParamSpec): boolean {
  const path = capabilityPathByParam[spec.key]
  return path !== undefined && props.capabilityProjection?.controls[path]?.state === 'unknown'
}

function unverifiedReason(spec: GenerationParamSpec): ModelFactControlReasonV1 | null {
  const path = capabilityPathByParam[spec.key]
  return props.controlExplanations?.status === 'ready' && path ? modelFactControlReasonV1(props.controlExplanations, path) : null
}

function unverifiedTitle(spec: GenerationParamSpec): string {
  const explanation = t(modelFactControlKey('notVerifiedExplanation'))
  const reason = modelFactControlReasonTextV1(unverifiedReason(spec))
  return reason ? `${explanation} ${reason}` : explanation
}

function inspectUnverified(spec: GenerationParamSpec) {
  const path = unverifiedReason(spec)?.path
  if (path && canInspectModelFacts.value) emit('inspectModelFactsPath', path)
}

const emptyStateReason = computed(() => props.capabilityProjection ? null : modelFactControlReasonV1(props.controlExplanations, []))

const customCount = computed(() => {
  let count = 0
  for (const key of GENERATION_PARAM_SPECS.map((row) => row.key)) {
    const mode = normalizeGenerationParamSetting(normalizedLayer.value[key])?.mode
    if (mode === 'custom' || mode === 'omit') count += 1
  }
  return count
})

const hasAdvancedSpecs = computed(() => unavailableSpecs.value.length > 0 || GENERATION_PARAM_SPECS.some((spec) => {
  const setting = normalizedLayer.value[spec.key]
  if (setting && setting.mode !== 'inherit') return false
  const capability = capabilities.value[spec.key]
  return props.capabilityProjection !== null
    && capability?.supported === true
    && capability.ui?.visibleByDefault === false
}))

function capabilityForSpec(spec: GenerationParamSpec): GenerationParamCapability {
  return capabilities.value[spec.key] ?? {
    supported: false,
    valueType: spec.valueType,
    ui: {
      visibleByDefault: false,
      editable: false,
      warning: tf('chat.generationParams.unsupportedForModel', { param: spec.label }),
    },
  }
}

function toValueText(value: unknown): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return ''
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)))
  }
  if (Array.isArray(value)) return value.join('\n')
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return typeof value === 'string' ? value : ''
}

function sourceLabel(source: string | undefined): string {
  if (source === 'conversation') return t('chat.generationParams.source.session')
  if (source === 'project') return t('chat.generationParams.source.project')
  if (source === 'global') return t('chat.generationParams.source.global')
  return t('chat.generationParams.source.inherit')
}

function modeLabel(mode: 'inherit' | 'custom' | 'omit'): string {
  return t(`chat.generationParams.mode.${mode}`)
}

function paramDescription(spec: GenerationParamSpec): string {
  return t(`chat.generationParams.description.${spec.key}`)
}

function settingForKey(key: GenerationParamKey): GenerationParamSetting | null {
  return normalizeGenerationParamSetting(normalizedLayer.value[key]) ?? null
}

function modeForKey(key: GenerationParamKey): 'inherit' | 'custom' | 'omit' {
  const setting = settingForKey(key)
  return setting?.mode === 'custom' || setting?.mode === 'omit' ? setting.mode : 'inherit'
}

function customValueForKey(key: GenerationParamKey): unknown {
  const setting = settingForKey(key)
  return setting?.mode === 'custom' ? setting.value : undefined
}

function parseInputValue(spec: GenerationParamSpec, raw: string): string | number | boolean | readonly string[] | null {
  const capability = capabilityForSpec(spec)
  const trimmed = raw.trim()
  if (capability.valueType === 'boolean') return trimmed === 'true'
  if (capability.valueType === 'enum') return normalizeGenerationParamValue(spec.key, trimmed, capability)
  if (capability.valueType === 'string') return normalizeGenerationParamValue(spec.key, trimmed, capability)
  if (capability.valueType === 'stringArray') {
    const values = raw
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean)
    return normalizeGenerationParamValue(spec.key, values, capability) as string[] | null
  }
  if (!trimmed) return null
  return normalizeGenerationParamValue(spec.key, Number(trimmed), capability)
}

function hasInputError(spec: GenerationParamSpec): boolean {
  if (modeForKey(spec.key) !== 'custom') return false
  const text = inputTextByKey.value[spec.key] ?? ''
  if (!text.trim()) return false
  return parseInputValue(spec, text) === null
}

function validationHint(spec: GenerationParamSpec): string {
  const capability = capabilityForSpec(spec)
  const range = capability.range
  if (capability.valueType === 'enum') return (capability.enumValues ?? []).join(', ')
  if (capability.valueType === 'string') return `string (max ${capability.maxLength ?? 0})`
  if (capability.valueType === 'boolean') return 'true / false'
  if (capability.valueType === 'stringArray') return 'one sequence per line or comma-separated'
  const minText = range?.min !== undefined ? String(range.min) : '-inf'
  const maxText = range?.max !== undefined ? String(range.max) : '+inf'
  return `${capability.valueType} ${minText}..${maxText}`
}

function inheritedValueHint(spec: GenerationParamSpec): string {
  const decision = props.resolved?.decisions[spec.key]
  if (decision?.state === 'sent' || decision?.state === 'deprecated') {
    return `${toValueText(decision.value)} [${sourceLabel(decision.source)}]`
  }
  if (decision?.state === 'providerAuto') return `${t('chat.generationParams.reasoning.auto')} [${sourceLabel(decision.source)}]`
  if (decision?.state === 'omitted') return `${t('chat.generationParams.state.omitted')} [${sourceLabel(decision.source)}]`
  if (decision?.state === 'unsupported' || decision?.state === 'rejected' || decision?.state === 'noEffect') {
    return decision.reason ?? decision.state
  }
  return t('chat.generationParams.state.notSent')
}

function emitLayer(nextLayer: GenerationParamsLayer | null) {
  emit('update:modelValue', normalizeGenerationParamsLayer(nextLayer))
}

function setSetting(key: GenerationParamKey, setting: GenerationParamSetting | null) {
  const base = { ...(normalizeGenerationParamsLayer(normalizedLayer.value) ?? {}) }
  if (!setting || setting.mode === 'inherit') delete base[key]
  else base[key] = setting
  emitLayer(Object.keys(base).length > 0 ? base : null)
}

function onModeChange(spec: GenerationParamSpec, nextModeRaw: string) {
  if (props.disabled) return
  if (nextModeRaw === 'inherit') {
    setSetting(spec.key, null)
    return
  }
  if (nextModeRaw === 'omit') {
    setSetting(spec.key, { mode: 'omit' })
    return
  }

  const current = customValueForKey(spec.key)
  const decision = props.resolved?.decisions[spec.key]
  const inherited = decision?.state === 'sent' || decision?.state === 'deprecated' ? decision.value : undefined
  const capability = capabilityForSpec(spec)
  const fallback = capability.valueType === 'boolean'
    ? false
    : capability.valueType === 'enum'
      ? (capability.enumValues?.[0] ?? '')
      : capability.valueType === 'string'
        ? ''
      : capability.valueType === 'stringArray'
        ? []
        : (capability.range?.min ?? 0)
  const nextValue = normalizeGenerationParamValue(spec.key, current ?? inherited ?? fallback, capability)
  if (nextValue === null) return
  inputTextByKey.value[spec.key] = toValueText(nextValue)
  setSetting(spec.key, { mode: 'custom', value: nextValue })
}

function onValueInput(spec: GenerationParamSpec, event: Event) {
  inputTextByKey.value[spec.key] = (event.target as HTMLInputElement | HTMLSelectElement).value
}

function onValueCommit(spec: GenerationParamSpec) {
  if (modeForKey(spec.key) !== 'custom') return
  const parsed = parseInputValue(spec, inputTextByKey.value[spec.key] ?? '')
  if (parsed === null) {
    const current = customValueForKey(spec.key)
    if (current !== undefined) inputTextByKey.value[spec.key] = toValueText(current)
    else setSetting(spec.key, null)
    return
  }
  inputTextByKey.value[spec.key] = toValueText(parsed)
  setSetting(spec.key, { mode: 'custom', value: parsed })
}

function resetAllToInherit() {
  if (props.disabled) return
  emitLayer(null)
}

function toggleExpanded() {
  if (!props.collapsible) return
  expanded.value = !expanded.value
}

function toggleAdvanced() {
  showAdvanced.value = !showAdvanced.value
}

function enumOptionLabel(spec: GenerationParamSpec, option: string): string {
  if (spec.key === 'reasoningEffort' && option === 'auto' && props.profile?.providerId === 'openai_responses') {
    return formatOpenAIResponsesAutoReasoningLabel(props.modelId, t('chat.generationParams.reasoning.auto'))
  }
  return option
}

watch(
  () => normalizedLayer.value,
  (layer) => {
    for (const spec of GENERATION_PARAM_SPECS) {
      const setting = normalizeGenerationParamSetting(layer[spec.key])
      inputTextByKey.value[spec.key] = setting?.mode === 'custom' ? toValueText(setting.value) : ''
    }
  },
  { immediate: true, deep: true },
)

watch(
  () => [props.profile?.profileId, props.modelId] as const,
  () => {
    showAdvanced.value = false
  },
)
</script>

<template>
  <div class="flex min-w-0 flex-col gap-2" data-testid="generation-params-editor">
    <div class="flex min-w-0 items-center justify-between gap-2">
      <button
        v-if="props.collapsible"
        type="button"
        class="sv-btn sv-btn-sm min-w-0 gap-1.5"
        data-testid="generation-params-toggle"
        @click="toggleExpanded"
      >
        <UiIcon :name="expanded ? 'chevronUp' : 'chevronDown'" :size="12" class="shrink-0" />
        <span class="shrink-0">{{ expanded ? t('chat.generationParams.hide') : t('chat.generationParams.show') }}</span>
        <span class="truncate">{{ t('chat.generationParams.title') }}</span>
        <span class="shrink-0 text-[color:var(--sv-text-3)]">({{ customCount }})</span>
      </button>
      <div v-else class="text-[13px] font-medium">{{ t('chat.generationParams.title') }}</div>
      <div class="flex shrink-0 items-center gap-2">
        <span v-if="!props.collapsible && customCount > 0" class="sv-meta">{{ tf('chat.generationParams.configuredCount', { count: customCount }) }}</span>
        <button
          v-if="hasAdvancedSpecs"
          type="button"
          class="sv-btn sv-btn-sm min-w-28"
          :disabled="props.disabled"
          data-testid="generation-params-advanced-toggle"
          @click="toggleAdvanced"
        >
          {{ showAdvanced ? t('chat.generationParams.hideAdvanced') : t('chat.generationParams.showAdvanced') }}
        </button>
        <button
          type="button"
          class="sv-btn sv-btn-sm"
          :disabled="props.disabled"
          data-testid="generation-params-reset"
          @click="resetAllToInherit"
        >
          {{ t('chat.generationParams.reset') }}
        </button>
      </div>
    </div>

    <div
      v-if="expanded || !props.collapsible"
      class="grid min-w-0 grid-cols-1 gap-y-0.5"
    >
      <div
        v-for="spec in visibleSpecs"
        :key="spec.key"
        class="grid min-w-0 items-center gap-x-3 gap-y-1 py-1.5"
        :class="props.compact ? 'grid-cols-[minmax(0,1fr)_88px]' : 'grid-cols-[minmax(110px,1fr)_96px_minmax(120px,1fr)]'"
      >
        <div class="min-w-0">
          <div class="truncate text-[13px]" :title="paramDescription(GENERATION_PARAM_SPEC_MAP[spec.key])">
            {{ spec.label }}
          </div>
          <button
            v-if="isUnverified(spec)"
            type="button"
            class="mt-0.5 block max-w-full truncate text-xs text-[color:var(--sv-text-3)] underline decoration-dotted underline-offset-2 disabled:cursor-default disabled:no-underline"
            :disabled="!canInspectModelFacts || !unverifiedReason(spec)?.path"
            :title="unverifiedTitle(spec)"
            :aria-label="`${t(modelFactControlKey('notVerified'))}: ${unverifiedTitle(spec)}`"
            :data-testid="`generation-param-unverified-${spec.key}`"
            @click="inspectUnverified(spec)"
          >
            {{ t(modelFactControlKey('notVerified')) }}
          </button>
        </div>

        <select
          class="sv-select sv-select-sm"
          :disabled="props.disabled"
          :value="modeForKey(spec.key)"
          :data-testid="`generation-param-mode-${spec.key}`"
          @change="onModeChange(spec, ($event.target as HTMLSelectElement).value)"
        >
          <option value="inherit">{{ modeLabel('inherit') }}</option>
          <option value="custom">{{ modeLabel('custom') }}</option>
          <option value="omit">{{ modeLabel('omit') }}</option>
        </select>

        <div class="min-w-0" :class="props.compact ? 'col-span-2' : ''">
          <select
            v-if="capabilityForSpec(spec).valueType === 'boolean' || capabilityForSpec(spec).valueType === 'enum'"
            class="sv-select sv-select-sm"
            :disabled="props.disabled || modeForKey(spec.key) !== 'custom'"
            :value="inputTextByKey[spec.key]"
            :title="validationHint(spec)"
            :data-testid="`generation-param-value-${spec.key}`"
            @change="onValueInput(spec, $event); onValueCommit(spec)"
          >
            <template v-if="capabilityForSpec(spec).valueType === 'boolean'">
              <option value="false">false</option>
              <option value="true">true</option>
            </template>
            <template v-else>
              <option
                v-for="option in capabilityForSpec(spec).enumValues ?? []"
                :key="option"
                :value="option"
              >
                {{ enumOptionLabel(spec, option) }}
              </option>
            </template>
          </select>
          <textarea
            v-else-if="capabilityForSpec(spec).valueType === 'stringArray'"
            class="sv-textarea min-h-[56px] text-xs"
            :class="hasInputError(spec) ? 'border-[color:var(--sv-danger)]' : ''"
            :disabled="props.disabled || modeForKey(spec.key) !== 'custom'"
            :value="inputTextByKey[spec.key]"
            :placeholder="modeForKey(spec.key) === 'inherit' ? inheritedValueHint(spec) : undefined"
            :title="hasInputError(spec) ? validationHint(spec) : inheritedValueHint(spec)"
            :aria-invalid="hasInputError(spec) ? 'true' : 'false'"
            :data-testid="`generation-param-value-${spec.key}`"
            @input="onValueInput(spec, $event)"
            @blur="onValueCommit(spec)"
          />
          <input
            v-else-if="capabilityForSpec(spec).valueType === 'string'"
            type="text"
            class="sv-input sv-input-sm"
            :disabled="props.disabled || modeForKey(spec.key) !== 'custom'"
            :value="inputTextByKey[spec.key]"
            :maxlength="capabilityForSpec(spec).maxLength"
            :placeholder="modeForKey(spec.key) === 'inherit' ? inheritedValueHint(spec) : undefined"
            :title="hasInputError(spec) ? validationHint(spec) : inheritedValueHint(spec)"
            :aria-invalid="hasInputError(spec) ? 'true' : 'false'"
            :data-testid="`generation-param-value-${spec.key}`"
            @input="onValueInput(spec, $event)"
            @blur="onValueCommit(spec)"
            @keydown.enter.prevent="onValueCommit(spec)"
          />
          <input
            v-else
            type="number"
            class="sv-input sv-input-sm"
            :class="hasInputError(spec) ? 'border-[color:var(--sv-danger)]' : ''"
            :disabled="props.disabled || modeForKey(spec.key) !== 'custom'"
            :value="inputTextByKey[spec.key]"
            :placeholder="modeForKey(spec.key) === 'inherit' ? inheritedValueHint(spec) : undefined"
            :step="capabilityForSpec(spec).valueType === 'integer' ? 1 : 'any'"
            :min="capabilityForSpec(spec).range?.min"
            :max="capabilityForSpec(spec).range?.max"
            :title="hasInputError(spec) ? validationHint(spec) : inheritedValueHint(spec)"
            :aria-invalid="hasInputError(spec) ? 'true' : 'false'"
            :data-testid="`generation-param-value-${spec.key}`"
            @input="onValueInput(spec, $event)"
            @blur="onValueCommit(spec)"
            @keydown.enter.prevent="onValueCommit(spec)"
          />
        </div>
      </div>

      <template v-if="showAdvanced">
        <div
          v-for="spec in unavailableSpecs"
          :key="`unavailable-${spec.key}`"
          class="min-w-0 py-1.5"
          :data-testid="`generation-param-unavailable-${spec.key}`"
        >
          <div class="truncate text-[13px] text-[color:var(--sv-text-3)]">{{ spec.label }}</div>
          <ModelFactControlReason
            v-if="unavailableReason(spec)"
            :reason="unavailableReason(spec)!"
            :can-inspect="canInspectModelFacts"
            :data-test-id="`generation-param-unavailable-reason-${spec.key}`"
            @inspect="emit('inspectModelFactsPath', $event)"
          />
        </div>
      </template>
      <div
        v-else-if="unavailableSpecs.length > 0"
        class="sv-meta"
        data-testid="generation-params-unavailable-summary"
      >
        {{ tf(modelFactControlKey('unavailableSummary'), { count: unavailableSpecs.length }) }}
      </div>

      <div v-if="visibleSpecs.length === 0" class="sv-meta py-2">
        <ModelFactControlReason
          v-if="emptyStateReason"
          :reason="emptyStateReason"
          data-test-id="generation-params-capability-status"
        />
        <template v-else>{{ t('chat.generationParams.empty') }}</template>
      </div>
    </div>
  </div>
</template>
