<script setup lang="ts">
import { t } from '@/shared/i18n'
import { modelFactControlKey } from '@/shared/model-facts/modelFactPresentation'
import type { ModelFactControlReasonV1 } from '../app/modelFactControlExplanations'

const props = withDefaults(defineProps<{
  reason: ModelFactControlReasonV1
  canInspect?: boolean
  dataTestId?: string
}>(), {
  canInspect: false,
  dataTestId: undefined,
})

const emit = defineEmits<{
  inspect: [path: string]
}>()

const BADGE_CLASS: Readonly<Record<ModelFactControlReasonV1['state'], string>> = {
  checking: 'bg-gray-100 text-gray-600',
  supported: 'bg-green-100 text-green-800',
  unsupported: 'bg-gray-200 text-gray-800',
  unknown: 'bg-gray-100 text-gray-600',
  conflict: 'bg-amber-100 text-amber-800',
  data_gap: 'bg-orange-100 text-orange-800',
  no_source_coverage: 'bg-gray-100 text-gray-600',
}
</script>

<template>
  <div
    class="flex min-w-0 flex-wrap items-center gap-1 text-[11px] text-gray-500"
    :data-testid="props.dataTestId"
    :data-state="props.reason.state"
  >
    <span class="shrink-0 rounded px-1.5 py-0.5 font-medium" :class="BADGE_CLASS[props.reason.state]">{{ props.reason.label }}</span>
    <span v-if="props.reason.text" class="min-w-0">{{ props.reason.text }}</span>
    <button
      v-if="props.canInspect && props.reason.path"
      type="button"
      class="shrink-0 rounded border border-gray-300 bg-white px-1.5 py-0.5 text-gray-700 hover:bg-gray-50"
      :data-testid="props.dataTestId ? `${props.dataTestId}-inspect` : undefined"
      :data-path="props.reason.path"
      @click="emit('inspect', props.reason.path)"
    >
      {{ t(modelFactControlKey('inspect')) }}
    </button>
  </div>
</template>
