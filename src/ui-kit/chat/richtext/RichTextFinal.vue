<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { renderFinal } from './finalRenderer'
import { subscribeHighlighterReady } from './shikiLoader'

const props = defineProps<{
  text: string
}>()

const finalHtml = ref('')
const sanitizerRemoved = ref(false)
const renderError = ref(false)
let highlightPending = false
let renderVersion = 0
let disposed = false
let unsubscribeHighlighter: (() => void) | null = null

async function renderSnapshot() {
  const text = props.text
  const version = ++renderVersion

  if (!text || text.trim().length === 0) {
    finalHtml.value = ''
    highlightPending = false
    return
  }

  try {
    const snapshot = await renderFinal(text)
    if (disposed || version !== renderVersion || text !== props.text) return
    finalHtml.value = snapshot.html
    sanitizerRemoved.value = snapshot.sanitizerRemoved
    renderError.value = false
    highlightPending = snapshot.highlightPending === true
  } catch (err) {
    if (disposed || version !== renderVersion || text !== props.text) return
    console.error('[RichTextFinal] RENDER_FAILED')
    renderError.value = true
    highlightPending = false
  }
}

watch(() => props.text, () => {
  void renderSnapshot()
}, { immediate: true })

onMounted(() => {
  unsubscribeHighlighter = subscribeHighlighterReady(() => {
    if (highlightPending) void renderSnapshot()
  })
})

onUnmounted(() => {
  disposed = true
  renderVersion += 1
  unsubscribeHighlighter?.()
  unsubscribeHighlighter = null
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
