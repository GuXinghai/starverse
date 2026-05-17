<script setup lang="ts">
import { computed, ref } from 'vue'
import { t, tf } from '@/shared/i18n'

export type ConversationListItem = Readonly<{
  id: string
  title: string
  updatedAt: number
}>

export type ProjectListItem = Readonly<{
  id: string
  name: string
  isSystem?: boolean
  convoCount?: number
}>

const props = defineProps<{
  items: readonly ConversationListItem[]
  activeId: string | null
  activeProjectId: string | null
  inboxId: string | null
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
  selectProject: [projectId: string | null]
  openSearch: []
  createProject: [name: string]
  renameProject: [projectId: string, name: string]
  deleteProject: [projectId: string]
  openProjectSettings: [projectId: string]
}>()

const selectionMode = ref(false)
const selectedIds = ref<Set<string>>(new Set())
const openConvoMenuId = ref<string | null>(null)

const renameDialog = ref<{ id: string; title: string } | null>(null)
const deleteDialog = ref<{ ids: string[] } | null>(null)
const moveDialog = ref<{ ids: string[]; projectId: string | null } | null>(null)

const projectPanelOpen = ref(true)
const projectCreateDialogOpen = ref(false)
const projectCreateName = ref('')
const projectRenameDialog = ref<{ id: string; name: string } | null>(null)
const projectDeleteDialog = ref<{ id: string; name: string } | null>(null)
const projectErrorMessage = ref<string | null>(null)

const selectedCount = computed(() => selectedIds.value.size)
const selectedIdsArray = computed(() => Array.from(selectedIds.value))

const inboxProject = computed(() => {
  if (!props.inboxId) return null
  return props.projects.find((p) => p.id === props.inboxId) ?? null
})

const userProjects = computed(() => {
  if (!props.inboxId) return props.projects
  return props.projects.filter((p) => p.id !== props.inboxId)
})

const showNoProjectOption = computed(() => !props.inboxId)

function isSystemProject(project: ProjectListItem): boolean {
  if (project.isSystem) return true
  return !!props.inboxId && project.id === props.inboxId
}

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

function toggleSelectAll() {
  if (selectedIds.value.size === props.items.length) {
    // 全部已选中，执行全不选
    selectedIds.value = new Set()
  } else {
    // 未全部选中，执行全选
    selectedIds.value = new Set(props.items.map(item => item.id))
  }
}

const isAllSelected = computed(() => {
  return props.items.length > 0 && selectedIds.value.size === props.items.length
})

const isSomeSelected = computed(() => {
  return selectedIds.value.size > 0 && selectedIds.value.size < props.items.length
})

function onRowClick(id: string) {
  if (props.disabled) return
  openConvoMenuId.value = null
  if (selectionMode.value) {
    toggleSelected(id)
    return
  }
  emit('select', id)
}

function toggleConvoMenu(id: string) {
  if (props.disabled) return
  openConvoMenuId.value = openConvoMenuId.value === id ? null : id
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
  moveDialog.value = { ids: cleaned, projectId: props.inboxId ?? null }
}

function confirmMove() {
  const dlg = moveDialog.value
  if (!dlg) return
  if (dlg.ids.length === 1) emit('moveToProject', dlg.ids[0], dlg.projectId)
  else emit('bulkMoveToProject', dlg.ids, dlg.projectId)
  moveDialog.value = null
  if (selectionMode.value) selectedIds.value = new Set()
}

function onSelectProject(projectId: string | null) {
  if (props.disabled) return
  emit('selectProject', projectId)
}

function openProjectCreate() {
  if (props.disabled) return
  projectCreateName.value = ''
  projectCreateDialogOpen.value = true
}

function confirmProjectCreate() {
  const name = projectCreateName.value.trim()
  if (!name) return
  
  // 直接创建项目，后端会处理同名逻辑（返回已存在项目并自动选中）
  emit('createProject', name)
  projectCreateDialogOpen.value = false
  projectCreateName.value = ''
}

function openProjectRename(project: ProjectListItem) {
  if (props.disabled) return
  if (isSystemProject(project)) {
    projectErrorMessage.value = t('navigation.project.systemProjectNoRename')
    setTimeout(() => {
      projectErrorMessage.value = null
    }, 3000)
    return
  }
  projectRenameDialog.value = { id: project.id, name: project.name }
}

function confirmProjectRename() {
  const dlg = projectRenameDialog.value
  if (!dlg) return
  const name = dlg.name.trim()
  if (!name) return
  emit('renameProject', dlg.id, name)
  projectRenameDialog.value = null
}

function openProjectDelete(project: ProjectListItem) {
  if (props.disabled) return
  if (isSystemProject(project)) {
    projectErrorMessage.value = t('navigation.project.systemProjectNoDelete')
    setTimeout(() => {
      projectErrorMessage.value = null
    }, 3000)
    return
  }
  projectDeleteDialog.value = { id: project.id, name: project.name }
}

function openProjectSettings(project: ProjectListItem) {
  if (props.disabled) return
  if (isSystemProject(project)) return
  emit('openProjectSettings', project.id)
}

function confirmProjectDelete() {
  const dlg = projectDeleteDialog.value
  if (!dlg) return
  emit('deleteProject', dlg.id)
  projectDeleteDialog.value = null
}

function cancelProjectDialog() {
  projectCreateDialogOpen.value = false
  projectRenameDialog.value = null
  projectDeleteDialog.value = null
  projectCreateName.value = ''
}
</script>

<template>
  <div class="flex h-full w-80 flex-col border-r border-gray-200 bg-white">
    <div class="border-b border-gray-200 px-3 py-3">
      <button
        type="button"
        class="flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-700 shadow-sm hover:bg-gray-50"
        :disabled="props.disabled"
        @click="emit('openSearch')"
      >
        <span class="text-base">🔍</span>
        <span class="font-semibold">{{ t('common.search') }}</span>
      </button>
    </div>

    <div class="border-b border-gray-200 px-3 py-2">
      <div class="flex items-center justify-between gap-2">
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-600">{{ t('navigation.project.title') }}</div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50"
            :disabled="props.disabled"
            :aria-expanded="projectPanelOpen"
            @click="projectPanelOpen = !projectPanelOpen"
          >
            {{ projectPanelOpen ? t('common.hide') : t('common.show') }}
          </button>
          <button
            type="button"
            class="rounded-md bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
            :disabled="props.disabled"
            :aria-label="t('navigation.project.newProject')"
            @click="openProjectCreate"
          >
            +
          </button>
        </div>
      </div>

      <div
        v-if="projectErrorMessage"
        class="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700"
      >
        {{ projectErrorMessage }}
      </div>
    </div>

    <div v-show="projectPanelOpen" class="border-b border-gray-200 px-3 py-2">
      <div class="space-y-1">
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors"
          :class="props.activeProjectId === null ? 'bg-blue-100 text-blue-900' : 'text-gray-700 hover:bg-gray-100'"
          :disabled="props.disabled"
          @click="onSelectProject(null)"
        >
          <span class="text-base">📋</span>
          <span class="min-w-0 flex-1 truncate">{{ t('navigation.empty.allConversations') }}</span>
        </button>

        <button
          v-if="inboxProject"
          type="button"
          class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors"
          :class="props.activeProjectId === inboxProject.id ? 'bg-blue-100 text-blue-900' : 'text-gray-700 hover:bg-gray-100'"
          :disabled="props.disabled"
          @click="onSelectProject(inboxProject.id)"
          @contextmenu.prevent
        >
          <span class="text-base">📥</span>
          <span class="min-w-0 flex-1 truncate">{{ inboxProject.name }}</span>
          <span v-if="inboxProject.convoCount !== undefined" class="text-[10px] text-gray-500">
            {{ inboxProject.convoCount }}
          </span>
        </button>

        <div v-if="userProjects.length > 0" class="my-2 border-t border-gray-200" />

        <div v-for="project in userProjects" :key="project.id" class="group relative">
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors"
            :class="props.activeProjectId === project.id ? 'bg-blue-100 text-blue-900' : 'text-gray-700 hover:bg-gray-100'"
            :disabled="props.disabled"
            @click="onSelectProject(project.id)"
          >
            <span class="text-base">📁</span>
            <span class="min-w-0 flex-1 truncate">{{ project.name }}</span>
            <span v-if="project.convoCount !== undefined" class="text-[10px] text-gray-500">
              {{ project.convoCount }}
            </span>
          </button>

          <div class="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-1 group-hover:flex">
            <button
              type="button"
              class="rounded bg-white p-1 text-xs text-gray-500 shadow-sm hover:bg-gray-100 hover:text-gray-700"
              :disabled="props.disabled"
              :data-testid="`project-settings-${project.id}`"
              @click.stop="openProjectSettings(project)"
              :aria-label="t('navigation.project.projectSettings')"
            >
              ⚙️
            </button>
            <button
              type="button"
              class="rounded bg-white p-1 text-xs text-gray-500 shadow-sm hover:bg-gray-100 hover:text-gray-700"
              :disabled="props.disabled"
              @click.stop="openProjectRename(project)"
              :aria-label="t('navigation.project.renameProject')"
            >
              ✏️
            </button>
            <button
              type="button"
              class="rounded bg-white p-1 text-xs text-red-500 shadow-sm hover:bg-red-50 hover:text-red-700"
              :disabled="props.disabled"
              @click.stop="openProjectDelete(project)"
              :aria-label="t('navigation.project.deleteProject')"
            >
              🗑️
            </button>
          </div>
        </div>

        <div v-if="userProjects.length === 0 && !inboxProject" class="px-2 py-3 text-xs text-gray-400">
          {{ t('navigation.empty.noProjects') }}
        </div>
      </div>
    </div>

    <div class="flex items-center justify-between gap-2 border-b border-gray-200 px-3 py-2">
      <div class="text-xs font-semibold uppercase tracking-wide text-gray-600">{{ t('navigation.conversation.title') }}</div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50"
          :disabled="props.disabled"
          @click="setSelectionMode(!selectionMode)"
        >
          {{ selectionMode ? t('common.done') : t('common.select') }}
        </button>
        <button
          type="button"
          class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50"
          :disabled="props.disabled"
          @click="emit('refresh')"
        >
          {{ t('common.refresh') }}
        </button>
        <button
          type="button"
          class="rounded-md bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white shadow-sm hover:bg-blue-700"
          :disabled="props.disabled"
          @click="emit('create')"
        >
          {{ t('common.new') }}
        </button>
      </div>
    </div>

    <div v-if="selectionMode" class="flex items-center justify-between gap-2 border-b border-gray-200 px-3 py-2 text-[11px] text-gray-700" data-testid="bulk-bar">
      <div class="flex min-w-0 items-center gap-2">
        <input
          type="checkbox"
          :checked="isAllSelected"
          :indeterminate.prop="isSomeSelected"
          :disabled="props.disabled || props.items.length === 0"
          @change="toggleSelectAll"
          :aria-label="t('navigation.actions.selectAll')"
          class="cursor-pointer"
        />
        <span class="truncate">{{ t('navigation.actions.selected') }} {{ selectedCount }}</span>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="rounded-md border border-gray-200 bg-white px-2 py-1 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          :disabled="props.disabled || selectedCount === 0"
          :aria-label="t('navigation.actions.bulkMove')"
          @click="openMove(selectedIdsArray)"
        >
          {{ t('common.move') }}
        </button>
        <button
          type="button"
          class="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-red-700 shadow-sm hover:bg-red-100 disabled:opacity-50"
          :disabled="props.disabled || selectedCount === 0"
          :aria-label="t('navigation.actions.bulkDelete')"
          @click="openDelete(selectedIdsArray)"
        >
          {{ t('common.delete') }}
        </button>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-auto p-2">
      <div v-if="props.items.length === 0" class="p-3 text-sm text-gray-500">
        {{ t('navigation.empty.noConversations') }}
      </div>

      <div v-else class="space-y-1">
        <div
          v-for="c in props.items"
          :key="c.id"
          class="flex items-stretch gap-2 rounded-lg border shadow-sm transition-colors"
          :class="c.id === props.activeId ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'"
          :data-testid="`convo-row-${c.id}`"
        >
          <div v-if="selectionMode" class="flex items-center pl-2">
            <input
              type="checkbox"
              :checked="selectedIds.has(c.id)"
              :disabled="props.disabled"
              @change="toggleSelected(c.id)"
              :aria-label="t('common.select')"
            />
          </div>

          <button
            type="button"
            class="min-w-0 flex-1 px-3 py-2 text-left hover:bg-gray-50"
            :disabled="props.disabled"
            @click="onRowClick(c.id)"
          >
            <div class="truncate text-sm font-medium" :class="c.id === props.activeId ? 'text-blue-700' : 'text-gray-900'">{{ c.title }}</div>
            <div class="mt-1 truncate text-[11px] text-gray-500">
              {{ formatTime(c.updatedAt) }}
            </div>
          </button>

          <div class="relative flex items-start pr-2 pt-2">
            <button
              type="button"
              class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              :disabled="props.disabled"
              :data-testid="`convo-menu-${c.id}`"
              :aria-label="t('navigation.actions.moreActions')"
              @click.stop="toggleConvoMenu(c.id)"
            >
              ...
            </button>
            <div
              v-if="openConvoMenuId === c.id"
              class="absolute right-2 top-11 z-10 min-w-[8rem] rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
            >
              <button
                type="button"
                class="flex w-full rounded-md px-3 py-2 text-left text-[11px] text-gray-700 hover:bg-gray-50"
                :disabled="props.disabled"
                @click.stop="openRename(c.id, c.title); openConvoMenuId = null"
              >
                {{ t('common.rename') }}
              </button>
              <button
                type="button"
                class="flex w-full rounded-md px-3 py-2 text-left text-[11px] text-gray-700 hover:bg-gray-50"
                :disabled="props.disabled"
                @click.stop="openMove([c.id]); openConvoMenuId = null"
              >
                {{ t('common.move') }}
              </button>
              <button
                type="button"
                class="flex w-full rounded-md px-3 py-2 text-left text-[11px] text-red-700 hover:bg-red-50"
                :disabled="props.disabled"
                @click.stop="openDelete([c.id]); openConvoMenuId = null"
              >
                {{ t('common.delete') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="renameDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" data-testid="rename-dialog">
      <div class="w-full max-w-sm rounded-lg bg-white p-4 shadow-lg">
        <div class="text-sm font-semibold text-gray-900">{{ t('navigation.conversation.renameConversation') }}</div>
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
            {{ t('common.cancel') }}
          </button>
          <button
            type="button"
            class="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            :disabled="props.disabled || renameDialog.title.trim().length === 0"
            @click="confirmRename"
          >
            {{ t('common.save') }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="deleteDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" data-testid="delete-dialog">
      <div class="w-full max-w-sm rounded-lg bg-white p-4 shadow-lg">
        <div class="text-sm font-semibold text-gray-900">{{ t('navigation.conversation.deleteConversation') }}{{ deleteDialog.ids.length > 1 ? 's' : '' }}?</div>
        <div class="mt-2 text-sm text-gray-600">
          {{ tf('navigation.conversation.deleteConversationConfirm', { count: deleteDialog.ids.length }) }}
        </div>
        <div class="mt-4 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            :disabled="props.disabled"
            @click="deleteDialog = null"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="button"
            class="rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
            :disabled="props.disabled"
            @click="confirmDelete"
          >
            {{ t('common.delete') }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="moveDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" data-testid="move-dialog">
      <div class="w-full max-w-sm rounded-lg bg-white p-4 shadow-lg">
        <div class="text-sm font-semibold text-gray-900">{{ t('navigation.conversation.moveToProject') }}</div>
        <div class="mt-2 text-sm text-gray-600">
          {{ tf('navigation.conversation.movePrompt', { count: moveDialog.ids.length }) }}
        </div>
        <select
          class="mt-3 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          :disabled="props.disabled"
          :value="moveDialog.projectId ?? ''"
          @change="moveDialog = { ...moveDialog, projectId: ($event.target as HTMLSelectElement).value || null }"
        >
          <option v-if="showNoProjectOption" value="">{{ t('navigation.conversation.noProject') }}</option>
          <option v-for="p in props.projects" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <div class="mt-4 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            :disabled="props.disabled"
            @click="moveDialog = null"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="button"
            class="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            :disabled="props.disabled"
            @click="confirmMove"
          >
            {{ t('common.move') }}
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="projectCreateDialogOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      @click.self="cancelProjectDialog"
    >
      <div class="w-72 rounded-lg bg-white p-4 shadow-xl">
        <div class="mb-3 text-sm font-medium text-gray-900">{{ t('navigation.project.newProject') }}</div>
        <input
          v-model="projectCreateName"
          type="text"
          class="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          :placeholder="t('navigation.project.projectName')"
          @keydown.enter="confirmProjectCreate"
          @keydown.escape="cancelProjectDialog"
        />
        <div v-if="projectErrorMessage" class="mb-3 text-sm text-red-600">
          {{ projectErrorMessage }}
        </div>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            @click="cancelProjectDialog"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="button"
            class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            @click="confirmProjectCreate"
          >
            {{ t('common.create') }}
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="projectRenameDialog"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      @click.self="cancelProjectDialog"
    >
      <div class="w-72 rounded-lg bg-white p-4 shadow-xl">
        <div class="mb-3 text-sm font-medium text-gray-900">{{ t('navigation.project.renameProject') }}</div>
        <input
          v-model="projectRenameDialog.name"
          type="text"
          class="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          :placeholder="t('navigation.project.projectName')"
          @keydown.enter="confirmProjectRename"
          @keydown.escape="cancelProjectDialog"
        />
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            @click="cancelProjectDialog"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="button"
            class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            @click="confirmProjectRename"
          >
            {{ t('common.save') }}
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="projectDeleteDialog"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      @click.self="cancelProjectDialog"
    >
      <div class="w-72 rounded-lg bg-white p-4 shadow-xl">
        <div class="mb-3 text-sm font-medium text-gray-900">{{ t('navigation.project.deleteProject') }}</div>
        <p class="mb-4 text-sm text-gray-600">
          {{ tf('navigation.project.deleteConfirm', { name: projectDeleteDialog.name }) }}
        </p>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            @click="cancelProjectDialog"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="button"
            class="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
            @click="confirmProjectDelete"
          >
            {{ t('common.delete') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
