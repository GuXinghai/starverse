<script setup lang="ts">
import { computed } from 'vue'
import type { ImageGenerationUserConfig } from '@/next/openrouter/imageGenerationSettingsPersistence'

const props = defineProps<{
  modelValue: ImageGenerationUserConfig
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ImageGenerationUserConfig]
}>()

const value = computed(() => props.modelValue)

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
      <label class="space-y-1 text-xs text-gray-600">
        <span class="font-medium text-gray-700">Resolution</span>
        <select
          class="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm"
          :disabled="props.disabled"
          :value="value.imageSize || '1K'"
          @change="emitPatch({ imageSize: ($event.target as HTMLSelectElement).value as any })"
        >
          <option value="1K">1K</option>
          <option value="2K">2K</option>
          <option value="4K">4K</option>
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
          <option value="16:9">16:9</option>
          <option value="3:4">3:4</option>
          <option value="1:1">1:1</option>
          <option value="4:3">4:3</option>
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
        <option value="auto">auto</option>
        <option value="image_only">image only</option>
        <option value="image_and_text">image + text</option>
      </select>
    </label>

    <label class="space-y-1 text-xs text-gray-600">
      <span class="font-medium text-gray-700">Advanced JSON</span>
      <textarea
        class="min-h-[84px] w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm"
        :disabled="props.disabled"
        :value="value.advancedJson"
        @input="emitPatch({ advancedJson: ($event.target as HTMLTextAreaElement).value })"
      />
    </label>
  </div>
</template>
