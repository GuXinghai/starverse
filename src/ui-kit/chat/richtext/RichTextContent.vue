<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { StreamRenderer } from './streamRenderer'
import { renderFinal } from './finalRenderer'

const props = defineProps<{
  text: string
  streaming: boolean
}>()

const containerRef = ref<HTMLDivElement | null>(null)
let renderer: StreamRenderer | null = null
let finalized = false

onMounted(() => {
  if (containerRef.value) {
    renderer = new StreamRenderer(containerRef.value)
    if (props.text) {
      renderer.feed(props.text)
    }
  }
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

    // Run final-path render for guaranteed consistency
    try {
      const snapshot = await renderFinal(props.text)
      if (containerRef.value) {
        if (snapshot.sanitizerRemoved) {
          console.warn('[RichTextContent] Final render: sanitizer removed dangerous content')
          containerRef.value.textContent = ''
          const pre = document.createElement('pre')
          pre.className = 'rt-fallback-plaintext'
          pre.textContent = props.text
          containerRef.value.appendChild(pre)
        } else {
          containerRef.value.innerHTML = snapshot.html
        }
      }
    } catch (err) {
      console.error('[RichTextContent] Final render failed, keeping streamed output:', err)
    }
  }
})

onUnmounted(() => {
  renderer?.dispose()
  renderer = null
})
</script>

<template>
  <div ref="containerRef" class="rt-content rt-streaming" />
</template>
