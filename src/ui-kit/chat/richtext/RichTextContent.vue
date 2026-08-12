<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { StreamRenderer } from './streamRenderer'
import { renderFinal } from './finalRenderer'
import { subscribeHighlighterReady } from './shikiLoader'

const props = defineProps<{
  text: string
  streaming: boolean
}>()

const containerRef = ref<HTMLDivElement | null>(null)
let renderer: StreamRenderer | null = null
let finalized = false
let finalHighlightPending = false
let finalRenderVersion = 0
let disposed = false
let unsubscribeHighlighter: (() => void) | null = null

async function applyFinalRender(text: string) {
  const version = ++finalRenderVersion

  try {
    const snapshot = await renderFinal(text)
    if (disposed || version !== finalRenderVersion || !containerRef.value) return

    if (snapshot.sanitizerRemoved) {
      finalHighlightPending = false
      console.warn('[RichTextContent] Final render: sanitizer removed dangerous content')
      containerRef.value.textContent = ''
      const pre = document.createElement('pre')
      pre.className = 'rt-fallback-plaintext'
      pre.textContent = text
      containerRef.value.appendChild(pre)
      return
    }

    containerRef.value.innerHTML = snapshot.html
    finalHighlightPending = snapshot.highlightPending === true
  } catch {
    finalHighlightPending = false
    console.error('[RichTextContent] FINAL_RENDER_FAILED_KEEPING_STREAMED_OUTPUT')
  }
}

onMounted(() => {
  if (containerRef.value) {
    renderer = new StreamRenderer(containerRef.value)
    if (props.text) {
      renderer.feed(props.text)
    }
  }
  unsubscribeHighlighter = subscribeHighlighterReady(() => {
    if (finalized && finalHighlightPending) void applyFinalRender(props.text)
  })
})

// Watch text changes — feed deltas to the imperative renderer
watch(() => props.text, (newText) => {
  if (finalized || !renderer) return
  renderer.feed(newText)
})

// Watch streaming flag — finalize when streaming completes
watch(() => props.streaming, async (isStreaming) => {
  if (!isStreaming && !finalized && containerRef.value) {
    finalized = true
    renderer?.finalize()
    void applyFinalRender(props.text)
  }
})

onUnmounted(() => {
  disposed = true
  finalRenderVersion += 1
  unsubscribeHighlighter?.()
  unsubscribeHighlighter = null
  renderer?.dispose()
  renderer = null
})
</script>

<template>
  <div ref="containerRef" class="rt-content rt-streaming" />
</template>
