<script setup lang="ts">
import { computed } from 'vue'
import type { ImageGenerationImageSize, ImageGenerationOutputMode, ImageGenerationUserConfig } from '@/next/openrouter/imageGenerationSettingsPersistence'

const props = defineProps<{
  modelValue: ImageGenerationUserConfig
  disabled?: boolean
  imageSizeOptions?: readonly ImageGenerationImageSize[]
  aspectRatioOptions?: readonly string[]
  outputModeOptions?: readonly ImageGenerationOutputMode[]
  showImageSizeControl?: boolean
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

function emitPatch(patch: Partial<ImageGenerationUserConfig>) {
  emit('update:modelValue', {
    ...value.value,
    ...patch,
  })
}
</script>

<template>
  <div class="space-y-3">
    <div class="grid grid-cols-2 gap-3">
      <label v-if="showImageSizeControl" class="space-y-1 text-xs text-gray-600">
        <span class="font-medium text-gray-700">Resolution</span>
        <select
          class="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm"
          :disabled="props.disabled || props.lockImageSizeControl"
          :value="value.imageSize || '1K'"
          @change="emitPatch({ imageSize: ($event.target as HTMLSelectElement).value as any })"
        >
          <option v-for="size in imageSizeOptions" :key="size" :value="size">{{ size }}</option>
        </select>
      </label>

      <label class="space-y-1 text-xs text-gray-600">
        <span class="font-medium text-gray-700">Aspect</span>
        <select
          class="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm"
          :disabled="props.disabled"
          :value="value.aspectRatio || '1:1'"
          @change="emitPatch({ aspectRatio: ($event.target as HTMLSelectElement).value })"
        >
          <option v-for="ratio in aspectRatioOptions" :key="ratio" :value="ratio">{{ ratio }}</option>
        </select>
      </label>
    </div>

    <label class="space-y-1 text-xs text-gray-600">
      <span class="font-medium text-gray-700">Output mode</span>
      <select
        class="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm"
        :disabled="props.disabled"
        :value="value.outputMode"
        @change="emitPatch({ outputMode: ($event.target as HTMLSelectElement).value as any })"
      >
        <option v-for="mode in outputModeOptions" :key="mode" :value="mode">{{ mode === 'image_only' ? 'image only' : mode === 'image_and_text' ? 'image + text' : mode }}</option>
      </select>
    </label>
  </div>
</template>
