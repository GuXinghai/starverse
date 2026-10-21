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

// Neutral tag for every state; only genuine warnings (conflict / data gap) get warning-coloured text.
const BADGE_CLASS: Readonly<Record<ModelFactControlReasonV1['state'], string>> = {
  checking: 'text-gray-500',
  supported: 'text-gray-900',
  unsupported: 'text-gray-700',
  unknown: 'text-gray-500',
  conflict: 'mfr-warn',
  data_gap: 'mfr-warn',
  no_source_coverage: 'text-gray-500',
}
</script>

<template>
  <div
    class="flex min-w-0 flex-wrap items-center gap-1 text-xs text-gray-500"
    :data-testid="props.dataTestId"
    :data-state="props.reason.state"
  >
    <span class="sv-chip shrink-0 font-medium" :class="BADGE_CLASS[props.reason.state]">{{ props.reason.label }}</span>
    <span v-if="props.reason.text" class="min-w-0">{{ props.reason.text }}</span>
    <button
      v-if="props.canInspect && props.reason.path"
      type="button"
      class="sv-btn sv-btn-sm shrink-0"
      :data-testid="props.dataTestId ? `${props.dataTestId}-inspect` : undefined"
      :data-path="props.reason.path"
      @click="emit('inspect', props.reason.path)"
    >
      {{ t(modelFactControlKey('inspect')) }}
    </button>
  </div>
</template>

<style scoped>
.mfr-warn { color: var(--sv-warning); }
</style>
