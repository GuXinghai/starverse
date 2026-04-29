<script setup lang="ts">
import MessageAttachmentCard from './MessageAttachmentCard.vue'
import type { MessageAttachmentVM } from './types'

const props = defineProps<{
  attachments: MessageAttachmentVM[]
}>()
</script>

<template>
  <div
    v-if="props.attachments.length > 0"
    class="flex flex-wrap gap-2"
    data-testid="history-attachment-list"
  >
    <MessageAttachmentCard
      v-for="attachment in props.attachments"
      :key="attachment.attachmentId"
      :attachment="attachment"
    />
  </div>
</template>
