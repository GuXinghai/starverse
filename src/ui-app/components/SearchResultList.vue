<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { SearchHit } from '@/next/search/searchTypes'
import { SEARCH_RESULT_ROW_HEIGHT } from '@/next/search/searchLayout'
import { t, tf } from '@/shared/i18n'

/**
 * Windowed list over a contiguous range of the shared ordered result set. Both Scroll and Pagination render
 * through it: Scroll passes the whole loaded prefix, Pagination passes one page. Every row has the same fixed
 * height, so the visible slice is pure arithmetic and the DOM stays bounded for any result count.
 */
const props = defineProps<{
  /** The shared ordered result array (prefix of the result set). */
  hits: readonly SearchHit[]
  /** Bumped by the owner whenever `hits` grew; the array itself is mutated in place. */
  revision: number
  /** First and one-past-last global result index rendered by this list. */
  start: number
  end: number
  /** Global index to place at the top when the list mounts. */
  initialIndex: number
  /** Position revision this list was mounted for; echoed with first-visible reports so stale ones can be ignored. */
  epoch: number
  disabled?: boolean
  projectNames: ReadonlyMap<string, string>
  convoTitles: ReadonlyMap<string, string>
}>()

const emit = defineEmits<{
  activate: [hit: SearchHit]
  firstVisible: [index: number, epoch: number]
  lastVisible: [index: number]
}>()

const OVERSCAN = 6
const FALLBACK_VIEWPORT_HEIGHT = 600

const viewport = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const viewportHeight = ref(FALLBACK_VIEWPORT_HEIGHT)
let frame = 0
let observer: ResizeObserver | null = null
let lastFirst = -1
let lastLast = -1
// Scroll position applied by the mount-time restore. While the viewport still sits there the list reports no
// first-visible change: the browser clamps scrollTop (short page, end of range), which must not move the anchor.
let restoredTop: number | null = null

const count = computed(() => Math.max(0, props.end - props.start))
const totalHeight = computed(() => count.value * SEARCH_RESULT_ROW_HEIGHT)

const slice = computed(() => {
  const first = Math.max(0, Math.floor(scrollTop.value / SEARCH_RESULT_ROW_HEIGHT) - OVERSCAN)
  const last = Math.min(count.value, Math.ceil((scrollTop.value + viewportHeight.value) / SEARCH_RESULT_ROW_HEIGHT) + OVERSCAN)
  return { first, last }
})

const rows = computed(() => {
  void props.revision
  const out: Array<{ hit: SearchHit; top: number }> = []
  for (let local = slice.value.first; local < slice.value.last; local += 1) {
    const hit = props.hits[props.start + local]
    if (hit) out.push({ hit, top: local * SEARCH_RESULT_ROW_HEIGHT })
  }
  return out
})

function measure() {
  frame = 0
  const el = viewport.value
  if (!el) return
  scrollTop.value = el.scrollTop
  viewportHeight.value = el.clientHeight || FALLBACK_VIEWPORT_HEIGHT
  report()
}

function report() {
  if (restoredTop !== null && scrollTop.value === restoredTop) {
    // Still where the restore put us: only the bottom edge (scroll demand) is news.
  } else {
    restoredTop = null
    const first = props.start + Math.floor(scrollTop.value / SEARCH_RESULT_ROW_HEIGHT)
    if (first !== lastFirst) { lastFirst = first; emit('firstVisible', first, props.epoch) }
  }
  const last = props.start + Math.max(0, Math.ceil((scrollTop.value + viewportHeight.value) / SEARCH_RESULT_ROW_HEIGHT) - 1)
  if (last !== lastLast) { lastLast = last; emit('lastVisible', last) }
}

function schedule() {
  if (frame) return
  frame = requestAnimationFrame(measure)
}

onMounted(async () => {
  const el = viewport.value
  if (!el) return
  await nextTick()
  el.scrollTop = Math.max(0, props.initialIndex - props.start) * SEARCH_RESULT_ROW_HEIGHT
  restoredTop = el.scrollTop
  measure()
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(schedule)
    observer.observe(el)
  }
})

onBeforeUnmount(() => {
  if (frame) cancelAnimationFrame(frame)
  observer?.disconnect()
})

// More results arriving below the viewport must re-run demand: the viewport may now be near a new end.
watch(() => [props.end, props.revision], () => { void nextTick(report) })

/** Rows that fit completely, used by Adaptive page sizing. A partial trailing row is deliberately not counted. */
function fittingRows(): number {
  const el = viewport.value
  // A viewport that is not laid out (height 0) has nothing to measure; a real but tiny one still holds one row.
  return el && el.clientHeight > 0 ? Math.max(1, Math.floor(el.clientHeight / SEARCH_RESULT_ROW_HEIGHT)) : 0
}

defineExpose({ fittingRows })

function titleOf(hit: SearchHit): string {
  if (hit.entityType === 'project') return props.projectNames.get(hit.entityId) ?? t('search.fallback.project')
  if (hit.entityType === 'convo') return props.convoTitles.get(hit.entityId) ?? t('search.fallback.convo')
  const title = (hit.convoId ? props.convoTitles.get(hit.convoId) : undefined) ?? t('search.fallback.convo')
  return tf('search.messageIn', { title })
}

function typeLabel(hit: SearchHit): string {
  return t(`search.type.${hit.entityType}`)
}

function formatTime(sec: number): string {
  if (!sec) return ''
  try { return new Date(sec * 1000).toLocaleString() } catch { return '' }
}

const H_START = '\u0001'
const H_END = '\u0002'

type SnippetPart = { text: string; highlight: boolean }

/** Splits a snippet on the highlight control characters; rendered as text, never as HTML. */
function splitSnippet(value: string): SnippetPart[] {
  if (!value) return []
  const parts: SnippetPart[] = []
  let cursor = 0
  while (cursor < value.length) {
    const start = value.indexOf(H_START, cursor)
    if (start === -1) {
      parts.push({ text: value.slice(cursor), highlight: false })
      break
    }
    if (start > cursor) parts.push({ text: value.slice(cursor, start), highlight: false })
    const end = value.indexOf(H_END, start + 1)
    if (end === -1) {
      parts.push({ text: value.slice(start + 1), highlight: true })
      break
    }
    parts.push({ text: value.slice(start + 1, end), highlight: true })
    cursor = end + 1
  }
  return parts.filter((part) => part.text.length > 0)
}
</script>

<template>
  <div
    ref="viewport"
    class="h-full overflow-y-auto"
    data-testid="search-result-viewport"
    @scroll.passive="schedule"
  >
    <div class="relative" :style="{ height: `${totalHeight}px` }" data-testid="search-result-rows">
      <button
        v-for="row in rows"
        :key="`${row.hit.entityType}:${row.hit.entityId}`"
        type="button"
        :disabled="props.disabled"
        :data-testid="`search-hit-${row.hit.entityId}`"
        class="absolute left-0 right-0 box-border flex flex-col justify-center overflow-hidden border-b border-gray-100 bg-white px-3 text-left hover:bg-gray-50 disabled:opacity-60"
        :style="{ top: `${row.top}px`, height: `${SEARCH_RESULT_ROW_HEIGHT}px` }"
        @click="emit('activate', row.hit)"
      >
        <span class="flex items-center justify-between gap-2">
          <span class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{{ typeLabel(row.hit) }}</span>
          <span class="shrink-0 text-[11px] text-gray-400">{{ formatTime(row.hit.createdAtSec) }}</span>
        </span>
        <span class="truncate text-sm font-semibold text-gray-900">{{ titleOf(row.hit) }}</span>
        <span v-if="row.hit.snippet" class="truncate text-sm text-gray-600">
          <template v-for="(part, idx) in splitSnippet(row.hit.snippet)" :key="idx">
            <mark v-if="part.highlight" class="rounded bg-yellow-200 px-0.5">{{ part.text }}</mark>
            <span v-else>{{ part.text }}</span>
          </template>
        </span>
      </button>
    </div>
    <slot name="footer" />
  </div>
</template>
