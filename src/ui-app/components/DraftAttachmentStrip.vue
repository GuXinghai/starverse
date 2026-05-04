<script setup lang="ts">
import DraftAttachmentCard from './DraftAttachmentCard.vue'

type DraftAttachmentCardViewModel = Readonly<{
  draftAttachmentId: string
  assetId: string
  filename: string
  extension: string | null
  assetKind: string
  aiPayloadKind: string
  sourceKind: string
  displayStatus: 'parsing' | 'ready' | 'ready_with_warnings' | 'incompatible_with_current_model' | 'failed' | 'unsupported'
  borderTone: 'green' | 'yellow' | 'red' | 'neutral'
  isParsing: boolean
  warningReason: string | null
  blockingReason: string | null
  fileTypeInfo: Readonly<{
    formatId: string
    kind: string
    confidenceLevel: string
    recommendedRoute: string | null
    recommendedRouteLabelCode: string | null
    compatibility: 'compatible' | 'warning' | 'blocked' | 'unknown'
    blocked: boolean
    requiresJob: boolean
    engineUnavailable: boolean
    hasConflicts: boolean
    hasExtensionMimeConflict: boolean
    warningLabelCodes: string[]
    blockedLabelCodes: string[]
    blockedBy: string[]
  }> | null
  previewDataUrl: string | null
  canRemove: boolean
}>

const props = defineProps<{
  attachments: DraftAttachmentCardViewModel[]
}>()

const emit = defineEmits<{
  (e: 'remove', assetId: string): void
  (e: 'open-details', assetId: string): void
}>()
</script>

<template>
  <div
    v-if="props.attachments.length > 0"
    class="flex flex-wrap gap-2 px-4 pt-3"
    data-testid="draft-attachment-strip"
  >
    <DraftAttachmentCard
      v-for="attachment in props.attachments"
      :key="attachment.draftAttachmentId"
      :attachment="attachment"
      @remove="emit('remove', $event)"
      @open-details="emit('open-details', $event)"
    />
  </div>
</template>
