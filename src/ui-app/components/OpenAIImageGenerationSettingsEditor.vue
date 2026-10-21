<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { t } from '@/shared/i18n'
import type { ImageGenerationUserConfig, OpenAIImageGenerationUserSettings } from '@/next/openrouter/imageGenerationSettingsPersistence'
import { OPENAI_IMAGE_TOOL_MODELS_V1, getOpenAIImageToolOptionsV1, isOpenAIImageToolSizeV1 } from '@/core/generation-v2/providers/openai-responses/imageToolOptionsV1'

const props = defineProps<{
  modelValue: ImageGenerationUserConfig
  disabled?: boolean
  maskOptions?: readonly Readonly<{ assetId: string; assetRevisionId: string; assetSha256: string; label: string }>[]
}>()
const emit = defineEmits<{ 'update:modelValue': [value: ImageGenerationUserConfig] }>()
const value = computed(() => props.modelValue.openAI ?? {})
const options = computed(() => getOpenAIImageToolOptionsV1(value.value.toolModel))
const customSize = ref(false)
const width = ref('1536')
const height = ref('864')
watch(() => value.value.size, size => {
  customSize.value = Boolean(size && !options.value.sizes.includes(size))
  if (customSize.value && size) [width.value, height.value] = size.split('x')
}, { immediate: true })
const sizeSelection = computed(() => customSize.value ? 'custom' : value.value.size ?? '')
const customSizeValid = computed(() => isOpenAIImageToolSizeV1(`${width.value}x${height.value}`, value.value.toolModel))
const compressionEnabled = computed(() => value.value.format === 'jpeg' || value.value.format === 'webp')
const transparentJpeg = computed(() => value.value.format === 'jpeg' && value.value.background === 'transparent')
const maskSelection = computed(() => value.value.maskAsset ? `${value.value.maskAsset.assetId}:${value.value.maskAsset.assetRevisionId}` : '')
const hasSelectedMaskOption = computed(() => props.maskOptions?.some(item => `${item.assetId}:${item.assetRevisionId}` === maskSelection.value))
const label = (key: string) => t(`chat.console.imageSettings.${key}` as Parameters<typeof t>[0])
const choiceLabel = (item: string) => ['auto', 'required', 'transparent', 'opaque', 'generate', 'edit', 'low', 'medium', 'high', 'xhigh', 'max'].includes(item) ? label(item) : ['png', 'jpeg', 'webp'].includes(item) ? item.toUpperCase() : item

function patch(changes: Partial<OpenAIImageGenerationUserSettings>) {
  const next = { ...value.value, ...changes }
  for (const key of Object.keys(next) as (keyof typeof next)[]) if (next[key] === undefined) delete next[key]
  emit('update:modelValue', { ...props.modelValue, openAI: next })
}
function select(key: keyof OpenAIImageGenerationUserSettings, event: Event) {
  const selected = (event.target as HTMLSelectElement).value
  if (key === 'toolModel') {
    const nextOptions = getOpenAIImageToolOptionsV1(selected || undefined)
    const changes: { -readonly [Key in keyof OpenAIImageGenerationUserSettings]?: OpenAIImageGenerationUserSettings[Key] } = { toolModel: selected || undefined }
    if (value.value.size && !isOpenAIImageToolSizeV1(value.value.size, selected || undefined)) changes.size = undefined
    if (value.value.quality && !nextOptions.qualities.includes(value.value.quality)) changes.quality = undefined
    if (value.value.inputFidelity && !(nextOptions.inputFidelities as readonly string[]).includes(value.value.inputFidelity)) changes.inputFidelity = undefined
    const nextSize = 'size' in changes ? changes.size : value.value.size
    customSize.value = Boolean(nextSize && !nextOptions.sizes.includes(nextSize))
    patch(changes)
    return
  }
  patch({ [key]: selected || undefined, ...(key === 'action' && selected !== 'edit' ? { maskAsset: undefined } : {}) })
}
function selectSize(event: Event) {
  const selected = (event.target as HTMLSelectElement).value
  customSize.value = selected === 'custom'
  if (customSize.value) commitCustomSize()
  else patch({ size: selected || undefined })
}
function commitCustomSize() {
  patch({ size: `${width.value}x${height.value}` })
}
function number(key: 'outputCompression' | 'partialImages', event: Event) {
  const raw = (event.target as HTMLInputElement).value
  const parsed = Number(raw)
  if (raw === '') patch({ [key]: undefined })
  else if (Number.isInteger(parsed) && parsed >= 0 && parsed <= (key === 'partialImages' ? 3 : 100)) patch({ [key]: parsed })
}
function selectMask(event: Event) {
  const selected = (event.target as HTMLSelectElement).value
  const mask = props.maskOptions?.find(item => `${item.assetId}:${item.assetRevisionId}` === selected)
  patch({ maskAsset: mask ? { assetId: mask.assetId, assetRevisionId: mask.assetRevisionId, assetSha256: mask.assetSha256 } : undefined })
}
</script>

<template>
  <fieldset :disabled="disabled" class="flex min-w-0 flex-col gap-3" data-testid="openai-image-settings">
    <label class="block text-[13px] font-medium">
      {{ label('toolModel') }}
      <select class="sv-select mt-1.5" :value="value.toolModel ?? ''" data-testid="openai-image-tool-model" @change="select('toolModel', $event)">
        <option value="">{{ label('default') }}</option>
        <option v-for="model in OPENAI_IMAGE_TOOL_MODELS_V1" :key="model.value" :value="model.value">{{ model.label }}</option>
      </select>
    </label>
    <p class="sv-meta">{{ label('toolModelHint') }}</p>
    <label class="block text-[13px] font-medium">
      {{ label('toolChoice') }}
      <select class="sv-select mt-1.5" :value="value.toolChoice ?? ''" data-testid="openai-image-tool-choice" @change="select('toolChoice', $event)">
        <option value="">{{ label('default') }}</option>
        <option value="auto">{{ label('auto') }}</option>
        <option value="required">{{ label('required') }}</option>
      </select>
    </label>
    <div class="grid min-w-0 grid-cols-2 gap-3">
      <label class="block min-w-0 text-[13px] font-medium">
        {{ label('size') }}
        <select class="sv-select mt-1.5" :value="sizeSelection" data-testid="openai-image-size" @change="selectSize">
          <option value="">{{ label('default') }}</option>
          <option v-for="size in options.sizes" :key="size" :value="size">{{ choiceLabel(size) }}</option>
          <option v-if="options.customSize" value="custom">{{ label('custom') }}</option>
        </select>
      </label>
      <label class="block min-w-0 text-[13px] font-medium">
        {{ label('quality') }}
        <select class="sv-select mt-1.5" :value="value.quality ?? ''" data-testid="openai-image-quality" @change="select('quality', $event)">
          <option value="">{{ label('default') }}</option>
          <option v-for="quality in options.qualities" :key="quality" :value="quality">{{ choiceLabel(quality) }}</option>
        </select>
      </label>
      <template v-if="customSize">
        <label class="block min-w-0 text-[13px] font-medium">{{ label('width') }}<input v-model="width" type="number" min="16" max="3840" step="16" class="sv-input mt-1.5" data-testid="openai-image-width" @change="commitCustomSize" /></label>
        <label class="block min-w-0 text-[13px] font-medium">{{ label('height') }}<input v-model="height" type="number" min="16" max="3840" step="16" class="sv-input mt-1.5" data-testid="openai-image-height" @change="commitCustomSize" /></label>
        <p v-if="!customSizeValid" role="alert" class="col-span-2 sv-meta text-red-700">{{ label('invalidSize') }}</p>
      </template>
      <label v-for="field in (['format', 'background'] as const)" :key="field" class="block min-w-0 text-[13px] font-medium">
        {{ label(field) }}
        <select class="sv-select mt-1.5" :value="value[field] ?? ''" :data-testid="`openai-image-${field}`" @change="select(field, $event)">
          <option value="">{{ label('default') }}</option>
          <option v-for="item in (field === 'format' ? options.formats : options.backgrounds)" :key="item" :value="item">{{ choiceLabel(item) }}</option>
        </select>
      </label>
    </div>
    <div v-if="transparentJpeg" role="alert" class="sv-notice sv-notice-danger" data-testid="openai-image-format-error">
      {{ label('transparentJpeg') }}
      <button type="button" class="sv-btn sv-btn-sm mt-2" data-testid="openai-image-use-png" @click="patch({ format: 'png' })">{{ label('usePng') }}</button>
    </div>
    <details class="sv-divider-t pt-3" data-testid="openai-image-advanced">
      <summary class="cursor-pointer text-[13px] font-medium">{{ label('advanced') }}</summary>
      <div class="mt-3 flex flex-col gap-3">
        <label class="block text-[13px] font-medium">{{ label('action') }}
          <select class="sv-select mt-1.5" :value="value.action ?? ''" data-testid="openai-image-action" @change="select('action', $event)">
            <option value="">{{ label('default') }}</option><option v-for="item in options.actions" :key="item" :value="item">{{ choiceLabel(item) }}</option>
          </select>
        </label>
        <p class="sv-meta">{{ label('referencesHint') }}</p>
        <label class="block text-[13px] font-medium">{{ label('mask') }}
          <select class="sv-select mt-1.5" :disabled="value.action !== 'edit'" :value="maskSelection" data-testid="openai-image-mask" @change="selectMask">
            <option value="">{{ label('default') }}</option>
            <option v-if="maskSelection && !hasSelectedMaskOption" :value="maskSelection">{{ label('savedMask') }}</option>
            <option v-for="mask in maskOptions ?? []" :key="`${mask.assetId}:${mask.assetRevisionId}`" :value="`${mask.assetId}:${mask.assetRevisionId}`">{{ mask.label }}</option>
          </select>
        </label>
        <p class="sv-meta">{{ label('maskHint') }}</p>
        <label class="block text-[13px] font-medium">{{ label('compression') }}
          <input type="number" min="0" max="100" step="1" class="sv-input mt-1.5" :value="value.outputCompression ?? ''" :placeholder="label('default')" :disabled="!compressionEnabled" data-testid="openai-image-compression" @change="number('outputCompression', $event)" />
        </label>
        <p class="sv-meta">{{ label('compressionHint') }}</p>
        <label class="block text-[13px] font-medium">{{ label('partialImages') }}
          <select class="sv-select mt-1.5" :value="value.partialImages ?? ''" data-testid="openai-image-partial" @change="number('partialImages', $event)">
            <option value="">{{ label('default') }}</option><option v-for="item in options.partialImages" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>
        <label v-if="options.inputFidelities.length" class="block text-[13px] font-medium">{{ label('fidelity') }}
          <select class="sv-select mt-1.5" :value="value.inputFidelity ?? ''" data-testid="openai-image-fidelity" @change="select('inputFidelity', $event)">
            <option value="">{{ label('default') }}</option><option v-for="item in options.inputFidelities" :key="item" :value="item">{{ choiceLabel(item) }}</option>
          </select>
        </label>
        <label class="block text-[13px] font-medium">{{ label('moderation') }}
          <select class="sv-select mt-1.5" :value="value.moderation ?? ''" data-testid="openai-image-moderation" @change="select('moderation', $event)">
            <option value="">{{ label('default') }}</option><option v-for="item in options.moderations" :key="item" :value="item">{{ choiceLabel(item) }}</option>
          </select>
        </label>
        <p class="sv-meta">{{ label('defaultHint') }}</p>
      </div>
    </details>
  </fieldset>
</template>
