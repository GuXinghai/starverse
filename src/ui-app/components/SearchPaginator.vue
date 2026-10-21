<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { visiblePageWindow } from '@/next/search/searchPagination'
import { t, tf } from '@/shared/i18n'
import UiIcon from '@/ui-kit/icons/UiIcon.vue'

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

// Fill and inset ring keep the same page-button geometry in all navigation states.
const STATE_CLASS: Record<ReturnType<typeof stateOf>, string> = {
  plain: 'text-[color:var(--sv-text-2)] hover:bg-[var(--sv-hover)]',
  selected: 'text-[color:var(--sv-text)] ring-1 ring-inset ring-[color:var(--sv-text)]',
  current: 'bg-[var(--sv-selected)] text-[color:var(--sv-text)]',
  both: 'bg-[var(--sv-selected)] text-[color:var(--sv-text)] ring-1 ring-inset ring-[color:var(--sv-text)]',
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
    class="sv-divider-t flex h-11 shrink-0 items-center gap-1 bg-[var(--sv-surface)] px-3 focus-visible:-outline-offset-2"
    :aria-label="t('search.paginator.label')"
    :aria-busy="props.navigating"
    tabindex="0"
    data-testid="search-paginator"
    @keydown="onKeydown"
  >
    <button
      v-if="props.canReadapt"
      type="button"
      class="sv-icon-btn shrink-0"
      :aria-label="t('search.paginator.readapt')"
      :title="t('search.paginator.readaptTitle')"
      data-testid="search-readapt"
      @click="emit('readapt')"
    >
      <UiIcon name="refresh" :size="14" />
    </button>

    <button
      type="button"
      class="sv-icon-btn shrink-0"
      :aria-label="t('search.paginator.previous')"
      :disabled="props.selectedPage <= 1"
      data-testid="search-page-prev"
      @click="emit('arrow', -1)"
    >
      <UiIcon name="chevronLeft" :size="15" />
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
      class="sv-icon-btn shrink-0"
      :aria-label="t('search.paginator.next')"
      :disabled="props.selectedPage >= props.maxPage"
      data-testid="search-page-next"
      @click="emit('arrow', 1)"
    >
      <UiIcon name="chevronRight" :size="15" />
    </button>

    <!-- Fixed 28px box: the spinner appears inside it, so loading never changes the rail width. -->
    <span class="inline-flex size-7 shrink-0 items-center justify-center text-[color:var(--sv-text-3)]" :aria-hidden="!props.navigating" role="status">
      <UiIcon name="spinner" :size="14" :class="{ invisible: !props.navigating }" />
      <span class="sr-only">{{ t('search.paginator.navigating') }}</span>
    </span>
  </nav>
</template>

<style scoped>
/* Subtle fade at both rail ends; the arrows stay fixed outside the rail and fully hittable. */
.search-rail {
  -webkit-mask-image: linear-gradient(to right, transparent, #000 10px, #000 calc(100% - 10px), transparent);
  mask-image: linear-gradient(to right, transparent, #000 10px, #000 calc(100% - 10px), transparent);
}
</style>
