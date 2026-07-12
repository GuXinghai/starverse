<script setup lang="ts">
import { computed } from 'vue'
import RichTextContent from './richtext/RichTextContent.vue'
import RichTextFinal from './richtext/RichTextFinal.vue'

const props = withDefaults(
  defineProps<{
    text?: string | null
    streaming?: boolean
  }>(),
  {
    text: '',
    streaming: false,
  },
)

const normalizedText = computed(() => {
  const text = typeof props.text === 'string' ? props.text : ''
  return text.trim().length > 0 ? text : ''
})
</script>

<template>
  <div v-if="normalizedText" class="reasoning-rich-text">
    <RichTextContent
      v-if="props.streaming"
      :text="normalizedText"
      :streaming="true"
    />
    <RichTextFinal
      v-else
      :text="normalizedText"
    />
  </div>
</template>
