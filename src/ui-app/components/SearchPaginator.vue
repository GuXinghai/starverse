<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { visiblePageWindow } from '@/next/search/searchPagination'
import { t, tf } from '@/shared/i18n'

/**
 * Presentational page rail. It owns no navigation state: it renders `currentPage` (results on screen) and
 * `selectedPage` (navigator position) and reports input. The owner routes every event to the one navigation
 * authority, so a click and the Enter key cannot diverge.
 */
const props = defineProps<{
  currentPage: number
  selectedPage: number
  maxPage: number
  navigating: boolean
  canReadapt: boolean
}>()

const emit = defineEmits<{
  arrow: [delta: -1 | 1]
  key: [delta: -1 | 1]
  page: [page: number]
  enter: []
  readapt: []
}>()

const rail = ref<HTMLElement | null>(null)
const root = ref<HTMLElement | null>(null)
const railWidth = ref(240)
let observer: ResizeObserver | null = null

onMounted(async () => {
  await nextTick()
  const el = rail.value
  if (!el) return
  railWidth.value = el.clientWidth || railWidth.value
  if (typeof ResizeObserver !== 'undefined') {
    // Only the label window depends on width; no result is loaded or remapped by a resize.
    observer = new ResizeObserver(() => { railWidth.value = el.clientWidth || railWidth.value })
    observer.observe(el)
  }
})
onBeforeUnmount(() => observer?.disconnect())

const pages = computed(() => {
  const { first, last } = visiblePageWindow({ selected: props.selectedPage, total: props.maxPage, available: railWidth.value })
  return Array.from({ length: last - first + 1 }, (_, index) => first + index)
})

function stateOf(page: number): 'both' | 'current' | 'selected' | 'plain' {
  const isCurrent = page === props.currentPage
  const isSelected = page === props.selectedPage
  return isCurrent && isSelected ? 'both' : isCurrent ? 'current' : isSelected ? 'selected' : 'plain'
}

function labelOf(page: number): string {
  const state = stateOf(page)
  if (state === 'both') return tf('search.paginator.currentSelected', { page })
  if (state === 'current') return tf('search.paginator.current', { page })
  if (state === 'selected') return tf('search.paginator.selected', { page })
  return tf('search.paginator.page', { page })
}

// The glyph keeps its layout space in the current-page square but is painted transparent.
const STATE_CLASS: Record<ReturnType<typeof stateOf>, string> = {
  plain: 'text-gray-600 hover:bg-gray-100',
  selected: 'text-gray-900 ring-1 ring-inset ring-blue-500',
  current: 'bg-blue-600 text-transparent',
  both: 'bg-blue-600 text-transparent ring-2 ring-inset ring-blue-300',
}

function focusRoot() {
  root.value?.focus()
}
defineExpose({ focus: focusRoot })

function onKeydown(event: KeyboardEvent) {
  // Only keys this component acts on are consumed, so Escape still reaches the dialog and the results area.
  if (event.key === 'Enter' && event.target === event.currentTarget) {
    event.preventDefault()
    emit('enter')
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    event.stopPropagation()
    emit('key', event.key === 'ArrowLeft' ? -1 : 1)
  }
}
</script>

<template>
  <nav
    ref="root"
    class="flex shrink-0 items-center gap-2 border-t border-gray-200 bg-white px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
    :aria-label="t('search.paginator.label')"
    :aria-busy="props.navigating"
    tabindex="0"
    data-testid="search-paginator"
    @keydown="onKeydown"
  >
    <button
      v-if="props.canReadapt"
      type="button"
      class="shrink-0 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
      :title="t('search.paginator.readaptTitle')"
      data-testid="search-readapt"
      @click="emit('readapt')"
    >
      {{ t('search.paginator.readapt') }}
    </button>

    <div class="flex min-w-0 flex-1 items-center justify-center gap-1">
      <button
        type="button"
        class="grid h-7 w-7 shrink-0 place-items-center rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-40"
        :aria-label="t('search.paginator.previous')"
        :disabled="props.selectedPage <= 1"
        data-testid="search-page-prev"
        @click="emit('arrow', -1)"
      >
        &lsaquo;
      </button>

      <div
        ref="rail"
        class="search-rail flex min-w-0 flex-1 items-center justify-center gap-1 overflow-hidden"
        data-testid="search-page-rail"
      >
        <button
          v-for="page in pages"
          :key="page"
          type="button"
          class="h-7 min-w-7 shrink-0 rounded-md px-1.5 text-center text-xs font-medium tabular-nums"
          :class="STATE_CLASS[stateOf(page)]"
          :aria-label="labelOf(page)"
          :aria-current="page === props.currentPage ? 'page' : undefined"
          :data-state="stateOf(page)"
          :data-testid="`search-page-${page}`"
          @click="emit('page', page)"
        >
          {{ page }}
        </button>
      </div>

      <button
        type="button"
        class="grid h-7 w-7 shrink-0 place-items-center rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-40"
        :aria-label="t('search.paginator.next')"
        :disabled="props.selectedPage >= props.maxPage"
        data-testid="search-page-next"
        @click="emit('arrow', 1)"
      >
        &rsaquo;
      </button>
    </div>

    <span v-if="props.navigating" class="shrink-0 text-xs text-gray-500" role="status">{{ t('search.paginator.navigating') }}</span>
  </nav>
</template>

<style scoped>
/* Subtle fade at both rail ends, like frosted glass; the arrows stay fixed outside the rail and fully hittable. */
.search-rail {
  -webkit-mask-image: linear-gradient(to right, transparent, #000 10px, #000 calc(100% - 10px), transparent);
  mask-image: linear-gradient(to right, transparent, #000 10px, #000 calc(100% - 10px), transparent);
}
</style>
