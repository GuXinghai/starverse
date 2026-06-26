<script setup lang="ts">
import { computed } from 'vue'
import {
  reasoningArtifactPreviewText,
  type ReasoningArtifact,
  type ReasoningArtifactKind,
} from '@/next/provider/reasoningArtifact'

const props = defineProps<{
  artifacts: readonly ReasoningArtifact[]
}>()

const visibleArtifacts = computed(() => props.artifacts.slice(0, 20))

function kindLabel(kind: ReasoningArtifactKind): string {
  switch (kind) {
    case 'reasoning_text':
      return 'reasoning text'
    case 'reasoning_summary':
      return 'reasoning summary'
    case 'thinking_text':
      return 'thinking text'
    case 'thought_text':
      return 'thought text'
    case 'signature':
      return 'provider signature'
    case 'opaque_reasoning':
      return 'opaque reasoning'
    case 'provider_metadata':
      return 'provider metadata'
  }
}

function preview(artifact: ReasoningArtifact): string {
  return reasoningArtifactPreviewText(artifact)
}
</script>

<template>
  <details
    v-if="artifacts.length > 0"
    class="mt-2 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-600"
    data-testid="reasoning-artifact-diagnostics"
  >
    <summary class="cursor-pointer select-none font-medium text-gray-700">
      Reasoning details · {{ artifacts.length }}
    </summary>

    <div class="mt-2 space-y-2">
      <div
        v-for="artifact in visibleArtifacts"
        :key="artifact.id"
        class="rounded border border-gray-200 bg-white px-2 py-1"
        :data-testid="`reasoning-artifact-${artifact.sequence}`"
      >
        <div class="flex flex-wrap items-center gap-2 font-medium text-gray-700">
          <span>{{ artifact.providerKey }}</span>
          <span>{{ kindLabel(artifact.kind) }}</span>
          <span>#{{ artifact.sequence }}</span>
        </div>
        <div class="mt-1 whitespace-pre-wrap break-words text-gray-600">
          {{ preview(artifact) }}
        </div>
        <div
          v-if="artifact.warnings.length > 0"
          class="mt-1 text-amber-700"
        >
          {{ artifact.warnings.join(' ') }}
        </div>
      </div>

      <div
        v-if="artifacts.length > visibleArtifacts.length"
        class="text-gray-500"
      >
        {{ artifacts.length - visibleArtifacts.length }} more reasoning detail artifacts hidden in this diagnostic view.
      </div>
    </div>
  </details>
</template>
