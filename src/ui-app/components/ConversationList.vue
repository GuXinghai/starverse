<script setup lang="ts">
import { computed, ref } from 'vue'

export type ConversationListItem = Readonly<{
  id: string
  title: string
  updatedAt: number
}>

export type ProjectListItem = Readonly<{
  id: string
  name: string
}>

const props = defineProps<{
  items: readonly ConversationListItem[]
  activeId: string | null
  projects: readonly ProjectListItem[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  select: [convoId: string]
  create: []
  refresh: []
  rename: [convoId: string, title: string]
  delete: [convoId: string]
  moveToProject: [convoId: string, projectId: string | null]
  bulkDelete: [convoIds: string[]]
  bulkMoveToProject: [convoIds: string[], projectId: string | null]
}>()

const selectionMode = ref(false)
const selectedIds = ref<Set<string>>(new Set())

const renameDialog = ref<{ id: string; title: string } | null>(null)
const deleteDialog = ref<{ ids: string[] } | null>(null)
const moveDialog = ref<{ ids: string[]; projectId: string | null } | null>(null)

const selectedCount = computed(() => selectedIds.value.size)
const selectedIdsArray = computed(() => Array.from(selectedIds.value))

function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return ''
  try {
    return new Date(ms).toLocaleString()
  } catch {
    return String(ms)
  }
}

function setSelectionMode(next: boolean) {
  selectionMode.value = next
  selectedIds.value = new Set()
}

function toggleSelected(id: string) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

function onRowClick(id: string) {
  if (props.disabled) return
  if (selectionMode.value) {
    toggleSelected(id)
    return
  }
  emit('select', id)
}

function openRename(id: string, currentTitle: string) {
  if (props.disabled) return
  renameDialog.value = { id, title: currentTitle }
}

function confirmRename() {
  const dlg = renameDialog.value
  if (!dlg) return
  const title = dlg.title.trim()
  if (!title) return
  emit('rename', dlg.id, title)
  renameDialog.value = null
}

function openDelete(ids: string[]) {
  if (props.disabled) return
  const cleaned = ids.map((x) => String(x ?? '').trim()).filter(Boolean)
  if (cleaned.length === 0) return
  deleteDialog.value = { ids: cleaned }
}

function confirmDelete() {
  const dlg = deleteDialog.value
  if (!dlg) return
  if (dlg.ids.length === 1) emit('delete', dlg.ids[0])
  else emit('bulkDelete', dlg.ids)
  deleteDialog.value = null
  if (selectionMode.value) selectedIds.value = new Set()
}

function openMove(ids: string[]) {
  if (props.disabled) return
  const cleaned = ids.map((x) => String(x ?? '').trim()).filter(Boolean)
  if (cleaned.length === 0) return
  moveDialog.value = { ids: cleaned, projectId: null }
}

function confirmMove() {
  const dlg = moveDialog.value
  if (!dlg) return
  if (dlg.ids.length === 1) emit('moveToProject', dlg.ids[0], dlg.projectId)
  else emit('bulkMoveToProject', dlg.ids, dlg.projectId)
  moveDialog.value = null
  if (selectionMode.value) selectedIds.value = new Set()
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
          @click="setSelectionMode(!selectionMode)"
        >
          {{ selectionMode ? 'Done' : 'Select' }}
        </button>
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

    <div v-if="selectionMode" class="flex items-center justify-between gap-2 border-b border-gray-200 px-3 py-2 text-[11px] text-gray-700" data-testid="bulk-bar">
      <div class="min-w-0 truncate">Selected: {{ selectedCount }}</div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="rounded-md border border-gray-200 bg-white px-2 py-1 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          :disabled="props.disabled || selectedCount === 0"
          aria-label="Bulk move"
          @click="openMove(selectedIdsArray)"
        >
          Move
        </button>
        <button
          type="button"
          class="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-red-700 shadow-sm hover:bg-red-100 disabled:opacity-50"
          :disabled="props.disabled || selectedCount === 0"
          aria-label="Bulk delete"
          @click="openDelete(selectedIdsArray)"
        >
          Delete
        </button>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-auto p-2">
      <div v-if="props.items.length === 0" class="p-3 text-sm text-gray-500">
        No conversations yet.
      </div>

      <div v-else class="space-y-1">
        <div
          v-for="c in props.items"
          :key="c.id"
          class="flex items-stretch gap-2 rounded-lg border bg-white shadow-sm"
          :class="c.id === props.activeId ? 'border-blue-200 bg-blue-50' : 'border-gray-200'"
          :data-testid="`convo-row-${c.id}`"
        >
          <div v-if="selectionMode" class="flex items-center pl-2">
            <input
              type="checkbox"
              :checked="selectedIds.has(c.id)"
              :disabled="props.disabled"
              @change="toggleSelected(c.id)"
              aria-label="Select conversation"
            />
          </div>

          <button
            type="button"
            class="min-w-0 flex-1 px-3 py-2 text-left hover:bg-gray-50"
            :disabled="props.disabled"
            @click="onRowClick(c.id)"
          >
            <div class="truncate text-sm font-medium text-gray-900">{{ c.title }}</div>
            <div class="mt-1 truncate text-[11px] text-gray-500">
              {{ formatTime(c.updatedAt) }}
            </div>
          </button>

          <div class="flex items-center gap-1 pr-2">
            <button
              type="button"
              class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              :disabled="props.disabled"
              aria-label="Rename"
              @click="openRename(c.id, c.title)"
            >
              Rename
            </button>
            <button
              type="button"
              class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              :disabled="props.disabled"
              aria-label="Move"
              @click="openMove([c.id])"
            >
              Move
            </button>
            <button
              type="button"
              class="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700 hover:bg-red-100 disabled:opacity-50"
              :disabled="props.disabled"
              aria-label="Delete"
              @click="openDelete([c.id])"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="renameDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" data-testid="rename-dialog">
      <div class="w-full max-w-sm rounded-lg bg-white p-4 shadow-lg">
        <div class="text-sm font-semibold text-gray-900">Rename conversation</div>
        <input
          class="mt-3 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          :disabled="props.disabled"
          :value="renameDialog.title"
          @input="renameDialog = { ...renameDialog, title: ($event.target as HTMLInputElement).value }"
        />
        <div class="mt-4 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            :disabled="props.disabled"
            @click="renameDialog = null"
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            :disabled="props.disabled || renameDialog.title.trim().length === 0"
            @click="confirmRename"
          >
            Save
          </button>
        </div>
      </div>
    </div>

    <div v-if="deleteDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" data-testid="delete-dialog">
      <div class="w-full max-w-sm rounded-lg bg-white p-4 shadow-lg">
        <div class="text-sm font-semibold text-gray-900">Delete conversation{{ deleteDialog.ids.length > 1 ? 's' : '' }}?</div>
        <div class="mt-2 text-sm text-gray-600">
          This will permanently delete {{ deleteDialog.ids.length }} conversation{{ deleteDialog.ids.length > 1 ? 's' : '' }}.
        </div>
        <div class="mt-4 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            :disabled="props.disabled"
            @click="deleteDialog = null"
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
            :disabled="props.disabled"
            @click="confirmDelete"
          >
            Delete
          </button>
        </div>
      </div>
    </div>

    <div v-if="moveDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" data-testid="move-dialog">
      <div class="w-full max-w-sm rounded-lg bg-white p-4 shadow-lg">
        <div class="text-sm font-semibold text-gray-900">Move to project</div>
        <div class="mt-2 text-sm text-gray-600">
          Move {{ moveDialog.ids.length }} conversation{{ moveDialog.ids.length > 1 ? 's' : '' }} to:
        </div>
        <select
          class="mt-3 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          :disabled="props.disabled"
          :value="moveDialog.projectId ?? ''"
          @change="moveDialog = { ...moveDialog, projectId: ($event.target as HTMLSelectElement).value || null }"
        >
          <option value="">No project</option>
          <option v-for="p in props.projects" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <div class="mt-4 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            :disabled="props.disabled"
            @click="moveDialog = null"
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            :disabled="props.disabled"
            @click="confirmMove"
          >
            Move
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
