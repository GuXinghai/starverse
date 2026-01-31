import { computed, onBeforeUnmount, onMounted, ref, unref, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'

type MaybeRef<T> = T | Ref<T> | ComputedRef<T>

type VirtualWindowRange = Readonly<{ start: number; end: number }>

type VirtualWindowDiagnostics = Readonly<{
  renderedCount: number
  heightMapSize: number
  avgMeasuredHeight: number
}>

type VirtualWindowOptions = Readonly<{
  items: MaybeRef<readonly string[]>
  scrollEl: Ref<HTMLElement | null>
  estimatedHeight?: number
  overscan?: number
  getKey?: (index: number) => string
}>

const CHUNK_SIZE = 64

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function useVirtualWindow(options: VirtualWindowOptions) {
  const estimatedHeight = ref(Math.max(16, options.estimatedHeight ?? 48))
  const overscan = ref(Math.max(0, options.overscan ?? 12))

  const itemsRef = computed(() => unref(options.items) ?? [])
  const getKey = (index: number) => options.getKey?.(index) ?? itemsRef.value[index]

  const measuredHeights = new Map<string, number>()
  const keyToIndex = new Map<string, number>()
  const chunkSums = ref<number[]>([])
  const avgMeasuredHeight = ref(estimatedHeight.value)
  const totalMeasuredHeight = ref(0)
  const measuredCount = ref(0)

  const range = ref<VirtualWindowRange>({ start: 0, end: 0 })
  const topPaddingPx = ref(0)
  const bottomPaddingPx = ref(0)

  let pendingMeasures = new Map<string, number>()
  let measureRaf = 0

  function normalizeMeasuredHeight(height: number): number {
    if (!Number.isFinite(height) || height <= 0) return estimatedHeight.value
    return Math.max(1, height)
  }

  function resetMeasuredStats(keys: readonly string[]) {
    totalMeasuredHeight.value = 0
    measuredCount.value = 0
    for (const key of measuredHeights.keys()) {
      if (!keyToIndex.has(key)) {
        measuredHeights.delete(key)
      }
    }
    for (const key of keys) {
      const height = measuredHeights.get(key)
      if (typeof height === 'number') {
        totalMeasuredHeight.value += height
        measuredCount.value += 1
      }
    }
    avgMeasuredHeight.value = measuredCount.value > 0 ? totalMeasuredHeight.value / measuredCount.value : estimatedHeight.value
  }

  function rebuildIndex() {
    const items = itemsRef.value
    keyToIndex.clear()
    for (let i = 0; i < items.length; i += 1) {
      const key = getKey(i)
      if (key) keyToIndex.set(key, i)
    }

    const chunkCount = Math.ceil(items.length / CHUNK_SIZE)
    const nextChunkSums = new Array(chunkCount).fill(0)
    for (let i = 0; i < items.length; i += 1) {
      const key = getKey(i)
      const height = measuredHeights.get(key) ?? estimatedHeight.value
      const chunkIndex = Math.floor(i / CHUNK_SIZE)
      nextChunkSums[chunkIndex] += height
    }
    chunkSums.value = nextChunkSums
    resetMeasuredStats(items)
    updateRange()
  }

  function ensureChunkIndex(index: number): number {
    return Math.floor(index / CHUNK_SIZE)
  }

  function getHeightForIndex(index: number): number {
    const key = getKey(index)
    return measuredHeights.get(key) ?? estimatedHeight.value
  }

  function getTotalHeight(): number {
    return chunkSums.value.reduce((acc, value) => acc + value, 0)
  }

  function getOffsetForIndex(index: number): number {
    const items = itemsRef.value
    if (items.length === 0) return 0
    const safeIndex = clamp(index, 0, items.length)
    const chunkIndex = ensureChunkIndex(safeIndex)
    let offset = 0
    for (let i = 0; i < chunkIndex; i += 1) offset += chunkSums.value[i] ?? 0

    const start = chunkIndex * CHUNK_SIZE
    const end = safeIndex
    for (let i = start; i < end; i += 1) {
      offset += getHeightForIndex(i)
    }
    return offset
  }

  function getIndexForOffset(offset: number): number {
    const items = itemsRef.value
    if (items.length === 0) return 0
    let acc = 0
    let chunkIndex = 0
    const chunks = chunkSums.value
    while (chunkIndex < chunks.length && acc + (chunks[chunkIndex] ?? 0) < offset) {
      acc += chunks[chunkIndex] ?? 0
      chunkIndex += 1
    }
    let index = chunkIndex * CHUNK_SIZE
    const end = Math.min(items.length, index + CHUNK_SIZE)
    while (index < end) {
      const height = getHeightForIndex(index)
      if (acc + height >= offset) return index
      acc += height
      index += 1
    }
    return Math.min(items.length - 1, index)
  }

  function updateRange() {
    const items = itemsRef.value
    const el = options.scrollEl.value
    if (!el || items.length === 0) {
      range.value = { start: 0, end: 0 }
      topPaddingPx.value = 0
      bottomPaddingPx.value = 0
      return
    }

    const scrollTop = Math.max(0, el.scrollTop)
    const viewportHeight = Math.max(0, el.clientHeight)
    const startIndex = clamp(getIndexForOffset(scrollTop), 0, items.length - 1)
    const endOffset = scrollTop + viewportHeight

    let endIndex = startIndex
    let offset = getOffsetForIndex(startIndex)
    while (endIndex < items.length && offset < endOffset) {
      offset += getHeightForIndex(endIndex)
      endIndex += 1
    }

    const start = clamp(startIndex - overscan.value, 0, items.length)
    const end = clamp(endIndex + overscan.value, 0, items.length)

    range.value = { start, end }
    const total = getTotalHeight()
    const top = getOffsetForIndex(start)
    const bottom = Math.max(0, total - getOffsetForIndex(end))
    topPaddingPx.value = top
    bottomPaddingPx.value = bottom
  }

  function flushMeasures() {
    measureRaf = 0
    const updates = pendingMeasures
    pendingMeasures = new Map()
    if (updates.size === 0) return

    for (const [key, nextHeight] of updates) {
      const index = keyToIndex.get(key)
      if (index === undefined) continue
      const chunkIndex = ensureChunkIndex(index)
      const prevHeight = measuredHeights.get(key) ?? estimatedHeight.value
      const normalized = normalizeMeasuredHeight(nextHeight)
      if (prevHeight === normalized) continue
      measuredHeights.set(key, normalized)

      const diff = normalized - prevHeight
      chunkSums.value[chunkIndex] = (chunkSums.value[chunkIndex] ?? 0) + diff
      if (!Number.isFinite(chunkSums.value[chunkIndex] ?? 0)) {
        chunkSums.value[chunkIndex] = 0
      }

      if (measuredHeights.has(key)) {
        totalMeasuredHeight.value += diff
        if (prevHeight === estimatedHeight.value) measuredCount.value += 1
      }
    }

    avgMeasuredHeight.value = measuredCount.value > 0 ? totalMeasuredHeight.value / measuredCount.value : estimatedHeight.value
    updateRange()
  }

  function scheduleMeasure(key: string, height: number) {
    pendingMeasures.set(key, height)
    if (measureRaf) return
    measureRaf = requestAnimationFrame(flushMeasures)
  }

  function measureElement(key: string, el: HTMLElement | null) {
    if (!el) return
    scheduleMeasure(key, el.offsetHeight || el.getBoundingClientRect().height || estimatedHeight.value)
  }

  function getIndexForKey(key: string): number | null {
    const index = keyToIndex.get(key)
    return index === undefined ? null : index
  }

  function getOffsetForKey(key: string): number | null {
    const index = getIndexForKey(key)
    if (index === null) return null
    return getOffsetForIndex(index)
  }

  let lastSignature: string[] = []
  watch(itemsRef, (next) => {
    const nextSignature = next.map((item, index) => options.getKey?.(index) ?? item)
    const changed =
      nextSignature.length !== lastSignature.length ||
      nextSignature.some((value, index) => value !== lastSignature[index])
    if (changed) {
      lastSignature = nextSignature
      rebuildIndex()
    }
  }, { immediate: true })

  watch(
    () => options.scrollEl.value,
    (el, prev) => {
      if (prev) prev.removeEventListener('scroll', updateRange)
      if (el) {
        el.addEventListener('scroll', updateRange, { passive: true })
        updateRange()
      }
    },
    { immediate: true },
  )

  let resizeObserver: ResizeObserver | null = null

  onMounted(() => {
    if (typeof ResizeObserver === 'undefined') return
    resizeObserver = new ResizeObserver(() => updateRange())
    const el = options.scrollEl.value
    if (el) resizeObserver.observe(el)
  })

  onBeforeUnmount(() => {
    const el = options.scrollEl.value
    if (el) el.removeEventListener('scroll', updateRange)
    if (resizeObserver) resizeObserver.disconnect()
    if (measureRaf) cancelAnimationFrame(measureRaf)
  })

  const diagnostics = computed<VirtualWindowDiagnostics>(() => ({
    renderedCount: Math.max(0, range.value.end - range.value.start),
    heightMapSize: measuredHeights.size,
    avgMeasuredHeight: avgMeasuredHeight.value,
  }))

  return {
    range,
    topPaddingPx,
    bottomPaddingPx,
    diagnostics,
    measureElement,
    getOffsetForIndex,
    getOffsetForKey,
    getIndexForKey,
    refresh: updateRange,
  }
}

export type { VirtualWindowRange, VirtualWindowDiagnostics }
