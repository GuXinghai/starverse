<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  CHAT_RIGHT_RAIL_DEFAULT_WIDTH_PX,
  CHAT_RIGHT_RAIL_MIN_WIDTH_PX,
  CHAT_WORKSPACE_MIN_WINDOW_WIDTH_PX,
  CHAT_WORKSPACE_SIDEBAR_DEFAULT_WIDTH_PX,
  CHAT_WORKSPACE_SIDEBAR_MIN_WIDTH_PX,
  resolveChatWorkspaceRightRailMode,
  type ChatWorkspaceRightRailMode,
} from '@/shared/ui/chatWorkspaceLayout'

const props = withDefaults(
  defineProps<{
    rightRailOpen?: boolean
  }>(),
  {
    rightRailOpen: true,
  },
)

const emit = defineEmits<{
  (e: 'closeRightRail'): void
}>()

const shellEl = ref<HTMLElement | null>(null)
const sidebarEl = ref<HTMLElement | null>(null)
const shellWidthPx = ref(CHAT_WORKSPACE_MIN_WINDOW_WIDTH_PX)
const sidebarWidthPx = ref(CHAT_WORKSPACE_SIDEBAR_DEFAULT_WIDTH_PX)
const rightRailMode = ref<ChatWorkspaceRightRailMode>(props.rightRailOpen ? 'docked' : 'closed')

const shellStyle = computed(() => ({
  minWidth: `${CHAT_WORKSPACE_MIN_WINDOW_WIDTH_PX}px`,
}))

const sidebarStyle = computed(() => ({
  width: `${CHAT_WORKSPACE_SIDEBAR_DEFAULT_WIDTH_PX}px`,
  minWidth: `${CHAT_WORKSPACE_SIDEBAR_MIN_WIDTH_PX}px`,
  maxWidth: `${CHAT_WORKSPACE_SIDEBAR_DEFAULT_WIDTH_PX}px`,
  flexBasis: `${CHAT_WORKSPACE_SIDEBAR_DEFAULT_WIDTH_PX}px`,
}))

const floatingRailStyle = computed(() => ({
  width: `${CHAT_RIGHT_RAIL_DEFAULT_WIDTH_PX}px`,
  minWidth: `${CHAT_RIGHT_RAIL_MIN_WIDTH_PX}px`,
  maxWidth: `${CHAT_RIGHT_RAIL_DEFAULT_WIDTH_PX}px`,
}))

const availableContentWidthPx = computed(() => Math.max(0, shellWidthPx.value - sidebarWidthPx.value))
const isRightRailDocked = computed(() => rightRailMode.value === 'docked')
const isRightRailFloating = computed(() => rightRailMode.value === 'floating')

function syncRightRailMode() {
  rightRailMode.value = resolveChatWorkspaceRightRailMode({
    isOpen: props.rightRailOpen,
    availableWidthPx: availableContentWidthPx.value,
    previousMode: rightRailMode.value,
  })
}

function updateMeasurements() {
  shellWidthPx.value = shellEl.value?.getBoundingClientRect().width ?? CHAT_WORKSPACE_MIN_WINDOW_WIDTH_PX
  sidebarWidthPx.value = sidebarEl.value?.getBoundingClientRect().width ?? CHAT_WORKSPACE_SIDEBAR_DEFAULT_WIDTH_PX
  syncRightRailMode()
}

let resizeObserver: ResizeObserver | null = null
let removeWindowResizeListener: (() => void) | null = null

watch(
  () => props.rightRailOpen,
  () => {
    syncRightRailMode()
  },
)

watch(availableContentWidthPx, () => {
  syncRightRailMode()
})

onMounted(() => {
  updateMeasurements()
  const handleWindowResize = () => updateMeasurements()
  window.addEventListener('resize', handleWindowResize)
  removeWindowResizeListener = () => {
    window.removeEventListener('resize', handleWindowResize)
  }
  if (typeof ResizeObserver === 'undefined') return
  resizeObserver = new ResizeObserver(() => {
    updateMeasurements()
  })
  if (shellEl.value) resizeObserver.observe(shellEl.value)
  if (sidebarEl.value) resizeObserver.observe(sidebarEl.value)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  removeWindowResizeListener?.()
  removeWindowResizeListener = null
})
</script>

<template>
  <div
    ref="shellEl"
    class="relative flex h-full min-h-0 w-full overflow-hidden bg-gray-50"
    :style="shellStyle"
    :data-right-rail-mode="rightRailMode"
  >
    <aside
      ref="sidebarEl"
      class="h-full shrink-0 border-r border-gray-200 bg-white"
      :style="sidebarStyle"
    >
      <slot name="sidebar" />
    </aside>

    <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div v-if="$slots.topbar" class="border-b border-gray-200 bg-white">
        <slot name="topbar" />
      </div>

      <div class="min-h-0 flex-1 overflow-hidden">
        <slot name="transcript" />
      </div>

      <div v-if="$slots.composer" class="border-t border-gray-200 bg-white">
        <slot name="composer" />
      </div>
    </div>

    <div
      v-if="isRightRailDocked"
      class="relative border-l border-gray-200 bg-white"
      :style="floatingRailStyle"
    >
      <slot name="right-rail" :rightRailMode="rightRailMode" />
    </div>

    <div
      v-else-if="isRightRailFloating"
      class="fixed inset-0 z-40 flex items-center justify-center p-6"
    >
      <div
        class="absolute inset-0 bg-black/20"
        data-testid="right-rail-floating-backdrop"
        @click="emit('closeRightRail')"
      />
      <div
        class="relative max-h-[min(80vh,56rem)] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
        :style="floatingRailStyle"
      >
        <slot name="right-rail" :rightRailMode="rightRailMode" />
      </div>
    </div>
  </div>
</template>
