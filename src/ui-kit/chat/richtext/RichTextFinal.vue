<script setup lang="ts">
import { ref, computed, watchEffect } from 'vue'
import { renderFinal } from './finalRenderer'

const props = defineProps<{
  text: string
}>()

const finalHtml = ref('')
const sanitizerRemoved = ref(false)
const renderError = ref(false)

// Render once when text is provided (history/completed messages)
watchEffect(async () => {
  if (!props.text || props.text.trim().length === 0) {
    finalHtml.value = ''
    return
  }

  try {
    const snapshot = await renderFinal(props.text)
    finalHtml.value = snapshot.html
    sanitizerRemoved.value = snapshot.sanitizerRemoved
    renderError.value = false
  } catch (err) {
    console.error('[RichTextFinal] Render failed:', err)
    renderError.value = true
  }
})

const showFallback = computed(() => sanitizerRemoved.value || renderError.value)
</script>

<template>
  <div v-if="showFallback" class="rt-content">
    <div v-if="sanitizerRemoved" class="rt-security-warning">
      ⚠ Content was sanitized for security
    </div>
    <pre class="rt-fallback-plaintext">{{ props.text }}</pre>
  </div>
  <div v-else class="rt-content rt-final" v-html="finalHtml" />
</template>
