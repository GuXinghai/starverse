<script setup lang="ts">
import { computed } from 'vue'
import { t } from '@/shared/i18n'
import { modelFactControlKey } from '@/shared/model-facts/modelFactPresentation'
import type { ImageGenerationImageSize, ImageGenerationOutputMode, ImageGenerationUserConfig } from '@/next/openrouter/imageGenerationSettingsPersistence'

const props = defineProps<{
  modelValue: ImageGenerationUserConfig
  disabled?: boolean
  imageSizeOptions?: readonly ImageGenerationImageSize[]
  aspectRatioOptions?: readonly string[]
  outputModeOptions?: readonly ImageGenerationOutputMode[]
  showImageSizeControl?: boolean
  showAspectRatioControl?: boolean
  lockImageSizeControl?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ImageGenerationUserConfig]
}>()

const value = computed(() => props.modelValue)
const imageSizeOptions = computed(() => props.imageSizeOptions && props.imageSizeOptions.length > 0
  ? props.imageSizeOptions
  : ['1K', '2K', '4K'] as const)
const aspectRatioOptions = computed(() => props.aspectRatioOptions && props.aspectRatioOptions.length > 0
  ? props.aspectRatioOptions
  : ['16:9', '3:4', '1:1', '4:3'] as const)
const outputModeOptions = computed(() => props.outputModeOptions && props.outputModeOptions.length > 0
  ? props.outputModeOptions
  : ['auto', 'image_only', 'image_and_text'] as const)
const showImageSizeControl = computed(() => props.showImageSizeControl !== false)
// The fallback lists are not Model Facts domains, so they must not look verified.
const imageSizeUnverified = computed(() => !(props.imageSizeOptions && props.imageSizeOptions.length > 0))
const aspectRatioUnverified = computed(() => !(props.aspectRatioOptions && props.aspectRatioOptions.length > 0))
const outputModeUnverified = computed(() => !(props.outputModeOptions && props.outputModeOptions.length > 0))
const notVerifiedLabel = computed(() => t(modelFactControlKey('notVerified')))
const notVerifiedTitle = computed(() => t(modelFactControlKey('notVerifiedExplanation')))

function emitPatch(patch: Partial<ImageGenerationUserConfig>) {
  emit('update:modelValue', {
    ...value.value,
    ...patch,
  })
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div v-if="showImageSizeControl || props.showAspectRatioControl !== false" class="grid grid-cols-2 gap-3">
      <label v-if="showImageSizeControl" class="block">
        <span class="text-[13px] font-medium">{{ t('chat.console.imageSettings.resolution') }}</span>
        <span v-if="imageSizeUnverified" class="sv-meta ml-2" :title="notVerifiedTitle" data-testid="image-generation-unverified-size">{{ notVerifiedLabel }}</span>
        <select
          class="sv-select mt-1.5"
          :disabled="props.disabled || props.lockImageSizeControl"
          :value="value.imageSize"
          @change="emitPatch({ imageSize: ($event.target as HTMLSelectElement).value as any })"
        >
          <option value="">{{ t('chat.console.imageSettings.default') }}</option>
          <option v-for="size in imageSizeOptions" :key="size" :value="size">{{ size }}</option>
        </select>
      </label>

      <label v-if="props.showAspectRatioControl !== false" class="block">
        <span class="text-[13px] font-medium">{{ t('chat.console.imageSettings.aspect') }}</span>
        <span v-if="aspectRatioUnverified" class="sv-meta ml-2" :title="notVerifiedTitle" data-testid="image-generation-unverified-aspect">{{ notVerifiedLabel }}</span>
        <select
          class="sv-select mt-1.5"
          :disabled="props.disabled"
          :value="value.aspectRatio"
          @change="emitPatch({ aspectRatio: ($event.target as HTMLSelectElement).value })"
        >
          <option value="">{{ t('chat.console.imageSettings.default') }}</option>
          <option v-for="ratio in aspectRatioOptions" :key="ratio" :value="ratio">{{ ratio }}</option>
        </select>
      </label>
    </div>

    <label class="block">
      <span class="text-[13px] font-medium">{{ t('chat.console.imageSettings.output') }}</span>
      <span v-if="outputModeUnverified" class="sv-meta ml-2" :title="notVerifiedTitle" data-testid="image-generation-unverified-output-mode">{{ notVerifiedLabel }}</span>
      <select
        class="sv-select mt-1.5"
        :disabled="props.disabled"
        :value="value.outputMode"
        @change="emitPatch({ outputMode: ($event.target as HTMLSelectElement).value as any })"
      >
        <option v-for="mode in outputModeOptions" :key="mode" :value="mode">{{ mode === 'image_only' ? t('chat.console.imageSettings.imageOnly') : mode === 'image_and_text' ? t('chat.console.imageSettings.imageAndText') : t('chat.console.imageSettings.default') }}</option>
      </select>
    </label>
  </div>
</template>
