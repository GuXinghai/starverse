<script setup lang="ts">
export type ConversationListItem = Readonly<{
  id: string
  title: string
  updatedAt: number
}>

const props = defineProps<{
  items: readonly ConversationListItem[]
  activeId: string | null
  disabled?: boolean
}>()

const emit = defineEmits<{
  select: [convoId: string]
  create: []
  refresh: []
}>()

function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return ''
  try {
    return new Date(ms).toLocaleString()
  } catch {
    return String(ms)
  }
}
</script>

<template>
  <div class="flex h-full w-80 flex-col border-r border-gray-200 bg-white">
    <div class="flex items-center justify-between gap-2 border-b border-gray-200 px-3 py-2">
      <div class="text-xs font-semibold uppercase tracking-wide text-gray-600">Conversations</div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50"
          :disabled="props.disabled"
          @click="emit('refresh')"
        >
          Refresh
        </button>
        <button
          type="button"
          class="rounded-md bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white shadow-sm hover:bg-blue-700"
          :disabled="props.disabled"
          @click="emit('create')"
        >
          New
        </button>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-auto p-2">
      <div v-if="props.items.length === 0" class="p-3 text-sm text-gray-500">
        No conversations yet.
      </div>

      <div v-else class="space-y-1">
        <button
          v-for="c in props.items"
          :key="c.id"
          type="button"
          class="w-full rounded-lg border px-3 py-2 text-left shadow-sm"
          :class="
            c.id === props.activeId
              ? 'border-blue-200 bg-blue-50'
              : 'border-gray-200 bg-white hover:bg-gray-50'
          "
          :disabled="props.disabled"
          @click="emit('select', c.id)"
        >
          <div class="truncate text-sm font-medium text-gray-900">{{ c.title }}</div>
          <div class="mt-1 truncate text-[11px] text-gray-500">
            {{ formatTime(c.updatedAt) }}
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

