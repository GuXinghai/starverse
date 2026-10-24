<script setup lang="ts">
import WorkspaceIcon from './WorkspaceIcon.vue'
import { computed, nextTick, ref, watch } from 'vue'
import { t, tf } from '@/shared/i18n'
import type { ConversationListItem, ProjectListItem } from './ConversationList.types'
import type { ProjectNameMutationResult } from '@/shared/settings/projectDuplicatePolicy'

type ProjectNameCompletion = (result: ProjectNameMutationResult | null) => void
type ProjectNameSubmission = { projectId: string | null; name: string }

const props = defineProps<{
  items: readonly ConversationListItem[]
  activeId: string | null
  activeProjectId: string | null
  inboxId: string | null
  projects: readonly ProjectListItem[]
  disabled?: boolean
  mutationDisabled?: boolean
  hasMore?: boolean
  /** Ids whose own name/title matched the last search. */
  highlightedProjectIds?: readonly string[]
  highlightedConvoIds?: readonly string[]
}>()

const emit = defineEmits<{
  select: [convoId: string]
  create: []
  refresh: []
  loadMore: []
  rename: [convoId: string, title: string]
  delete: [convoId: string]
  moveToProject: [convoId: string, projectId: string | null]
  bulkDelete: [convoIds: string[]]
  bulkMoveToProject: [convoIds: string[], projectId: string | null]
  selectProject: [projectId: string | null]
  openSearch: []
  createProject: [name: string, confirmDuplicate: boolean, complete: ProjectNameCompletion]
  renameProject: [projectId: string, name: string, confirmDuplicate: boolean, complete: ProjectNameCompletion]
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
const projectNameError = ref<string | null>(null)
const projectNamePending = ref(false)
const projectDuplicateConfirmation = ref<ProjectNameSubmission | null>(null)
const projectDuplicateConfirmButton = ref<HTMLButtonElement | null>(null)
let projectNameOperation = 0

const mutationsDisabled = computed(() => props.disabled || props.mutationDisabled)

// R5-01 (P6a-01): a bulk action may only touch rows the user can see. The list can change under an open selection
// (project switch, refresh, a delete elsewhere), so every use goes through the rows that are visible now.
const visibleIds = computed(() => new Set(props.items.map((item) => item.id)))
const visibleSelectedIds = computed(() => Array.from(selectedIds.value).filter((id) => visibleIds.value.has(id)))
const selectedCount = computed(() => visibleSelectedIds.value.length)
const selectedIdsArray = visibleSelectedIds

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
  if (selectedCount.value === props.items.length) {
    // 全部已选中，执行全不选
    selectedIds.value = new Set()
  } else {
    // 未全部选中，执行全选
    selectedIds.value = new Set(props.items.map(item => item.id))
  }
}

const isAllSelected = computed(() => {
  return props.items.length > 0 && selectedCount.value === props.items.length
})

const isSomeSelected = computed(() => {
  return selectedCount.value > 0 && selectedCount.value < props.items.length
})

watch(() => props.items, () => {
  const kept = visibleSelectedIds.value
  if (kept.length !== selectedIds.value.size) selectedIds.value = new Set(kept)
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
  if (mutationsDisabled.value) return
  openConvoMenuId.value = openConvoMenuId.value === id ? null : id
}

function openRename(id: string, currentTitle: string) {
  if (mutationsDisabled.value) return
  renameDialog.value = { id, title: currentTitle }
}

function confirmRename() {
  if (mutationsDisabled.value) return
  const dlg = renameDialog.value
  if (!dlg) return
  const title = dlg.title.trim()
  if (!title) return
  emit('rename', dlg.id, title)
  renameDialog.value = null
}

function openDelete(ids: string[]) {
  if (mutationsDisabled.value) return
  const cleaned = ids.map((x) => String(x ?? '').trim()).filter(Boolean)
  if (cleaned.length === 0) return
  deleteDialog.value = { ids: cleaned }
}

function confirmDelete() {
  if (mutationsDisabled.value) return
  const dlg = deleteDialog.value
  if (!dlg) return
  // A dialog opened before the list changed must not act on rows that have since left it.
  const ids = dlg.ids.filter((id) => visibleIds.value.has(id))
  if (ids.length === 1) emit('delete', ids[0])
  else if (ids.length > 1) emit('bulkDelete', ids)
  deleteDialog.value = null
  if (selectionMode.value) selectedIds.value = new Set()
}

function openMove(ids: string[]) {
  if (mutationsDisabled.value) return
  const cleaned = ids.map((x) => String(x ?? '').trim()).filter(Boolean)
  if (cleaned.length === 0) return
  moveDialog.value = { ids: cleaned, projectId: props.inboxId ?? null }
}

function confirmMove() {
  if (mutationsDisabled.value) return
  const dlg = moveDialog.value
  if (!dlg) return
  const ids = dlg.ids.filter((id) => visibleIds.value.has(id))
  if (ids.length === 1) emit('moveToProject', ids[0], dlg.projectId)
  else if (ids.length > 1) emit('bulkMoveToProject', ids, dlg.projectId)
  moveDialog.value = null
  if (selectionMode.value) selectedIds.value = new Set()
}

function onSelectProject(projectId: string | null) {
  if (props.disabled) return
  emit('selectProject', projectId)
}

function openProjectCreate() {
  if (mutationsDisabled.value) return
  projectNameOperation += 1
  projectNameError.value = null
  projectCreateName.value = ''
  projectCreateDialogOpen.value = true
}

function confirmProjectCreate() {
  if (mutationsDisabled.value || !projectCreateDialogOpen.value) return
  const name = projectCreateName.value.trim()
  if (!name) return
  
  submitProjectName({ projectId: null, name })
}

function submitProjectName(submission: ProjectNameSubmission, confirmDuplicate = false) {
  if (mutationsDisabled.value || projectNamePending.value) return
  const operation = ++projectNameOperation
  projectNamePending.value = true
  projectDuplicateConfirmation.value = null
  const complete: ProjectNameCompletion = (result) => {
    if (operation !== projectNameOperation) return
    projectNamePending.value = false
    if (!result) return
    if (result.status === 'saved') {
      projectNameError.value = null
      cancelProjectDialog()
    } else if (result.policy === 'deny') {
      projectNameError.value = t('navigation.project.duplicateName')
    } else {
      projectNameError.value = null
      projectDuplicateConfirmation.value = submission
      void nextTick(() => projectDuplicateConfirmButton.value?.focus())
    }
  }
  if (submission.projectId === null) emit('createProject', submission.name, confirmDuplicate, complete)
  else emit('renameProject', submission.projectId, submission.name, confirmDuplicate, complete)
}

function confirmDuplicateProjectName() {
  const submission = projectDuplicateConfirmation.value
  if (submission) submitProjectName(submission, true)
}

function openProjectRename(project: ProjectListItem) {
  if (mutationsDisabled.value) return
  if (isSystemProject(project)) {
    projectErrorMessage.value = t('navigation.project.systemProjectNoRename')
    setTimeout(() => {
      projectErrorMessage.value = null
    }, 3000)
    return
  }
  projectNameOperation += 1
  projectNameError.value = null
  projectRenameDialog.value = { id: project.id, name: project.name }
}

function confirmProjectRename() {
  if (mutationsDisabled.value) return
  const dlg = projectRenameDialog.value
  if (!dlg) return
  const name = dlg.name.trim()
  if (!name) return
  submitProjectName({ projectId: dlg.id, name })
}

function openProjectDelete(project: ProjectListItem) {
  if (mutationsDisabled.value) return
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
  if (mutationsDisabled.value) return
  const dlg = projectDeleteDialog.value
  if (!dlg) return
  emit('deleteProject', dlg.id)
  projectDeleteDialog.value = null
}

function cancelProjectDialog() {
  if (projectNamePending.value) return
  projectNameOperation += 1
  projectNameError.value = null
  projectDuplicateConfirmation.value = null
  projectCreateDialogOpen.value = false
  projectRenameDialog.value = null
  projectDeleteDialog.value = null
  projectCreateName.value = ''
}
</script>

<template>
  <div class="flex h-full min-w-0 flex-col">
    <div class="flex-none px-2 pt-1">
      <button
        type="button"
        class="nav-row flex h-8 w-full items-center gap-2 px-2 text-left text-[13px] disabled:text-gray-400"
        :disabled="props.disabled"
        @click="emit('openSearch')"
      >
        <WorkspaceIcon name="search" :size="16" class="flex-none" />
        <span>{{ t('common.search') }}</span>
      </button>
    </div>

    <div class="flex flex-none items-center justify-between gap-2 px-4 pb-1 pt-3">
      <div class="sv-label">{{ t('navigation.project.title') }}</div>
      <div class="flex items-center gap-0.5">
        <button
          type="button"
          class="h-6 w-12 rounded-md text-center text-xs text-gray-500 hover:bg-black/5 hover:text-gray-900 disabled:text-gray-400 disabled:hover:bg-transparent"
          :disabled="props.disabled"
          data-testid="project-group-toggle"
          :aria-expanded="projectPanelOpen"
          @click="projectPanelOpen = !projectPanelOpen"
        >
          {{ projectPanelOpen ? t('common.hide') : t('common.show') }}
        </button>
        <button
          type="button"
          class="sv-icon-btn h-6 w-6"
          :disabled="mutationsDisabled"
          :aria-label="t('navigation.project.newProject')"
          :title="t('navigation.project.newProject')"
          @click="openProjectCreate"
        >
          <WorkspaceIcon name="plus" :size="15" />
        </button>
      </div>
    </div>

    <div
      v-if="projectErrorMessage"
      class="sv-notice sv-notice-danger mx-3 mb-1"
    >
      {{ projectErrorMessage }}
    </div>

    <div v-show="projectPanelOpen" class="max-h-[34vh] flex-none overflow-y-auto px-2">
      <div class="flex flex-col gap-0.5">
        <button
          type="button"
          class="nav-row flex h-8 w-full items-center gap-2 px-2 text-left text-[13px] disabled:text-gray-400"
          :aria-current="props.activeProjectId === null ? 'true' : undefined"
          :disabled="props.disabled"
          @click="onSelectProject(null)"
        >
          <WorkspaceIcon name="list" :size="16" class="flex-none" />
          <span class="min-w-0 flex-1 truncate">{{ t('navigation.empty.allConversations') }}</span>
        </button>

        <button
          v-if="inboxProject"
          type="button"
          class="nav-row flex h-8 w-full items-center gap-2 px-2 text-left text-[13px] disabled:text-gray-400"
          :aria-current="props.activeProjectId === inboxProject.id ? 'true' : undefined"
          :disabled="props.disabled"
          @click="onSelectProject(inboxProject.id)"
          @contextmenu.prevent
        >
          <WorkspaceIcon name="folder" :size="16" class="flex-none" />
          <span class="min-w-0 flex-1 truncate">{{ inboxProject.name }}</span>
          <span v-if="inboxProject.convoCount !== undefined" class="sv-meta tabular-nums">
            {{ inboxProject.convoCount }}
          </span>
        </button>

        <div v-if="userProjects.length > 0" class="sv-divider-t mx-2 my-1" />

        <div
          v-for="project in userProjects"
          :key="project.id"
          class="nav-row group relative"
          :class="{ 'is-current': props.activeProjectId === project.id }"
        >
          <button
            type="button"
            class="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] disabled:text-gray-400"
            :aria-current="props.activeProjectId === project.id ? 'true' : undefined"
            :disabled="props.disabled"
            @click="onSelectProject(project.id)"
          >
            <WorkspaceIcon name="folder" :size="16" class="flex-none" />
            <span class="min-w-0 flex-1 truncate">
              <mark v-if="props.highlightedProjectIds?.includes(project.id)" class="rounded-[3px] bg-black/10 text-inherit" :data-testid="`project-name-match-${project.id}`">{{ project.name }}</mark>
              <template v-else>{{ project.name }}</template>
            </span>
            <span v-if="project.convoCount !== undefined" class="sv-meta tabular-nums">
              {{ project.convoCount }}
            </span>
          </button>

          <div class="nav-actions absolute inset-y-0 right-0 flex items-center rounded-r-md pl-4 pr-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
            <button
              type="button"
              class="sv-icon-btn h-6 w-6"
              :disabled="props.disabled"
              :data-testid="`project-settings-${project.id}`"
              @click.stop="openProjectSettings(project)"
              :aria-label="t('navigation.project.projectSettings')"
              :title="t('navigation.project.projectSettings')"
            >
              <WorkspaceIcon name="sliders" :size="14" />
            </button>
            <button
              type="button"
              class="sv-icon-btn h-6 w-6"
              :disabled="mutationsDisabled"
              @click.stop="openProjectRename(project)"
              :aria-label="t('navigation.project.renameProject')"
              :title="t('navigation.project.renameProject')"
            >
              <WorkspaceIcon name="edit" :size="14" />
            </button>
            <button
              type="button"
              class="sv-icon-btn h-6 w-6 hover:text-red-700"
              :disabled="mutationsDisabled"
              @click.stop="openProjectDelete(project)"
              :aria-label="t('navigation.project.deleteProject')"
              :title="t('navigation.project.deleteProject')"
            >
              <WorkspaceIcon name="trash" :size="14" />
            </button>
          </div>
        </div>

        <div v-if="userProjects.length === 0 && !inboxProject" class="sv-meta px-2 py-3">
          {{ t('navigation.empty.noProjects') }}
        </div>
      </div>
    </div>

    <div class="flex flex-none items-center justify-between gap-2 px-4 pb-1 pt-3">
      <div class="sv-label">{{ t('navigation.conversation.title') }}</div>
      <div class="flex items-center gap-0.5">
        <button
          type="button"
          class="h-6 w-14 rounded-md text-center text-xs text-gray-500 hover:bg-black/5 hover:text-gray-900 disabled:text-gray-400 disabled:hover:bg-transparent"
          :disabled="props.disabled"
          data-testid="conversation-selection-toggle"
          @click="setSelectionMode(!selectionMode)"
        >
          {{ selectionMode ? t('common.done') : t('common.select') }}
        </button>
        <button
          type="button"
          class="sv-icon-btn h-6 w-6"
          :disabled="props.disabled"
          :aria-label="t('common.refresh')"
          :title="t('common.refresh')"
          @click="emit('refresh')"
        >
          <WorkspaceIcon name="refresh" :size="14" />
        </button>
        <button
          type="button"
          class="sv-icon-btn h-6 w-6"
          :disabled="props.disabled"
          :aria-label="t('common.new')"
          :title="t('common.new')"
          @click="emit('create')"
        >
          <WorkspaceIcon name="plus" :size="15" />
        </button>
      </div>
    </div>

    <div v-if="selectionMode" class="mx-2 mb-1 flex flex-none items-center justify-between gap-2 px-2 text-xs text-gray-600" data-testid="bulk-bar">
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
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="sv-btn sv-btn-sm sv-btn-ghost"
          :disabled="mutationsDisabled || selectedCount === 0"
          :aria-label="t('navigation.actions.bulkMove')"
          @click="openMove(selectedIdsArray)"
        >
          {{ t('common.move') }}
        </button>
        <button
          type="button"
          class="sv-btn sv-btn-sm sv-btn-ghost text-red-700 disabled:text-gray-400"
          :disabled="mutationsDisabled || selectedCount === 0"
          :aria-label="t('navigation.actions.bulkDelete')"
          @click="openDelete(selectedIdsArray)"
        >
          {{ t('common.delete') }}
        </button>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-auto px-2 pb-2">
      <div v-if="props.items.length === 0" class="sv-meta px-2 py-3 text-[13px]">
        {{ t('navigation.empty.noConversations') }}
      </div>

      <div v-else class="flex flex-col gap-0.5">
        <div
          v-for="c in props.items"
          :key="c.id"
          class="nav-row group relative flex items-stretch"
          :class="{ 'is-current': c.id === props.activeId }"
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
            class="min-w-0 flex-1 rounded-md px-2 py-1.5 text-left disabled:text-gray-400"
            :aria-current="c.id === props.activeId ? 'true' : undefined"
            :disabled="props.disabled"
            @click="onRowClick(c.id)"
          >
            <div class="truncate text-[13px] leading-5"><mark v-if="props.highlightedConvoIds?.includes(c.id)" class="rounded-[3px] bg-black/10 text-inherit" :data-testid="`convo-title-match-${c.id}`">{{ c.title }}</mark><template v-else>{{ c.title }}</template></div>
            <div class="sv-meta truncate leading-4">
              {{ formatTime(c.updatedAt) }}
            </div>
          </button>

          <div class="relative flex flex-none items-start pr-1 pt-1.5">
            <button
              type="button"
              class="sv-icon-btn opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
              :class="{ 'opacity-100': openConvoMenuId === c.id }"
              :disabled="mutationsDisabled"
              :data-testid="`convo-menu-${c.id}`"
              :aria-label="t('navigation.actions.moreActions')"
              :aria-expanded="openConvoMenuId === c.id"
              @click.stop="toggleConvoMenu(c.id)"
            >
              <WorkspaceIcon name="more" :size="16" />
            </button>
            <div
              v-if="openConvoMenuId === c.id"
              class="sv-popover absolute right-1 top-9 z-20 min-w-[8rem]"
            >
              <button
                type="button"
                class="sv-menu-item"
                :disabled="mutationsDisabled"
                @click.stop="openRename(c.id, c.title); openConvoMenuId = null"
              >
                {{ t('common.rename') }}
              </button>
              <button
                type="button"
                class="sv-menu-item"
                :disabled="mutationsDisabled"
                @click.stop="openMove([c.id]); openConvoMenuId = null"
              >
                {{ t('common.move') }}
              </button>
              <button
                type="button"
                class="sv-menu-item text-red-700 disabled:text-gray-400"
                :disabled="mutationsDisabled"
                @click.stop="openDelete([c.id]); openConvoMenuId = null"
              >
                {{ t('common.delete') }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <button
        v-if="props.hasMore"
        type="button"
        class="sv-btn sv-btn-sm sv-btn-ghost mt-1 w-full"
        :disabled="props.disabled"
        data-testid="conversation-load-more"
        @click="emit('loadMore')"
      >
        {{ t('chat.pagination.loadMore') }}
      </button>
    </div>

    <div v-if="renameDialog" class="sv-backdrop" data-testid="rename-dialog">
      <div class="sv-dialog w-full max-w-sm p-4">
        <div class="text-sm font-semibold">{{ t('navigation.conversation.renameConversation') }}</div>
        <input
          class="sv-input mt-3"
          :disabled="props.disabled"
          :value="renameDialog.title"
          @input="renameDialog = { ...renameDialog, title: ($event.target as HTMLInputElement).value }"
        />
        <div class="mt-4 flex justify-end gap-2">
          <button
            type="button"
            class="sv-btn"
            :disabled="props.disabled"
            @click="renameDialog = null"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="button"
            class="sv-btn sv-btn-primary"
            :disabled="mutationsDisabled || renameDialog.title.trim().length === 0"
            @click="confirmRename"
          >
            {{ t('common.save') }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="deleteDialog" class="sv-backdrop" data-testid="delete-dialog">
      <div class="sv-dialog w-full max-w-sm p-4">
        <div class="text-sm font-semibold">{{ t('navigation.conversation.deleteConversation') }}{{ deleteDialog.ids.length > 1 ? 's' : '' }}?</div>
        <div class="mt-2 text-sm text-gray-600">
          {{ tf('navigation.conversation.deleteConversationConfirm', { count: deleteDialog.ids.length }) }}
        </div>
        <div class="mt-4 flex justify-end gap-2">
          <button
            type="button"
            class="sv-btn"
            :disabled="props.disabled"
            @click="deleteDialog = null"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="button"
            class="sv-btn sv-btn-danger"
            :disabled="mutationsDisabled"
            @click="confirmDelete"
          >
            {{ t('common.delete') }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="moveDialog" class="sv-backdrop" data-testid="move-dialog">
      <div class="sv-dialog w-full max-w-sm p-4">
        <div class="text-sm font-semibold">{{ t('navigation.conversation.moveToProject') }}</div>
        <div class="mt-2 text-sm text-gray-600">
          {{ tf('navigation.conversation.movePrompt', { count: moveDialog.ids.length }) }}
        </div>
        <select
          class="sv-select mt-3"
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
            class="sv-btn"
            :disabled="props.disabled"
            @click="moveDialog = null"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="button"
            class="sv-btn sv-btn-primary"
            :disabled="mutationsDisabled"
            @click="confirmMove"
          >
            {{ t('common.move') }}
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="projectCreateDialogOpen"
      :inert="!!projectDuplicateConfirmation"
      class="sv-backdrop"
      @click.self="cancelProjectDialog"
    >
      <div class="sv-dialog w-72 p-4">
        <div class="mb-3 text-sm font-medium">{{ t('navigation.project.newProject') }}</div>
        <input
          v-model="projectCreateName"
          :disabled="projectNamePending || !!projectDuplicateConfirmation"
          type="text"
          class="sv-input mb-3"
          :placeholder="t('navigation.project.projectName')"
          @keydown.enter.prevent="!$event.isComposing && confirmProjectCreate()"
          @keydown.escape="cancelProjectDialog"
        />
        <div v-if="projectNameError" class="mb-3 text-sm text-[color:var(--sv-danger)]" data-testid="project-name-error">{{ projectNameError }}</div>
        <div v-if="projectErrorMessage" class="mb-3 text-sm text-[color:var(--sv-danger)]">
          {{ projectErrorMessage }}
        </div>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="sv-btn"
            @click="cancelProjectDialog"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="button" :disabled="mutationsDisabled || projectNamePending || !projectCreateName.trim() || !!projectDuplicateConfirmation"
            class="sv-btn sv-btn-primary"
            @click="confirmProjectCreate"
          >
            {{ t('common.create') }}
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="projectRenameDialog"
      :inert="!!projectDuplicateConfirmation"
      class="sv-backdrop"
      @click.self="cancelProjectDialog"
    >
      <div class="sv-dialog w-72 p-4">
        <div class="mb-3 text-sm font-medium">{{ t('navigation.project.renameProject') }}</div>
        <input
          v-model="projectRenameDialog.name"
          :disabled="projectNamePending || !!projectDuplicateConfirmation"
          type="text"
          class="sv-input mb-3"
          :placeholder="t('navigation.project.projectName')"
          @keydown.enter.prevent="!$event.isComposing && confirmProjectRename()"
          @keydown.escape="cancelProjectDialog"
        />
        <div v-if="projectNameError" class="mb-3 text-sm text-[color:var(--sv-danger)]" data-testid="project-name-error">{{ projectNameError }}</div>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="sv-btn"
            @click="cancelProjectDialog"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="button" :disabled="mutationsDisabled || projectNamePending || !projectRenameDialog.name.trim() || !!projectDuplicateConfirmation"
            class="sv-btn sv-btn-primary"
            @click="confirmProjectRename"
          >
            {{ t('common.save') }}
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="projectDeleteDialog"
      class="sv-backdrop"
      @click.self="cancelProjectDialog"
    >
      <div class="sv-dialog w-72 p-4">
        <div class="mb-3 text-sm font-medium">{{ t('navigation.project.deleteProject') }}</div>
        <p class="mb-4 text-sm text-gray-600">
          {{ tf('navigation.project.deleteConfirm', { name: projectDeleteDialog.name }) }}
        </p>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="sv-btn"
            @click="cancelProjectDialog"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="button" :disabled="mutationsDisabled"
            class="sv-btn sv-btn-danger"
            @click="confirmProjectDelete"
          >
            {{ t('common.delete') }}
          </button>
        </div>
      </div>
    </div>
    <div v-if="projectDuplicateConfirmation" class="sv-backdrop"
      @click.self="projectDuplicateConfirmation = null" @keydown.esc.stop="projectDuplicateConfirmation = null">
      <div role="dialog" aria-modal="true" aria-labelledby="project-duplicate-confirmation" class="sv-dialog w-72 p-4">
        <p id="project-duplicate-confirmation" class="mb-4 text-sm">{{ t('navigation.project.duplicateConfirm') }}</p>
        <div class="flex justify-end gap-2">
          <button type="button" class="sv-btn"
            @click="projectDuplicateConfirmation = null">{{ t('common.cancel') }}</button>
          <button ref="projectDuplicateConfirmButton" type="button" :disabled="mutationsDisabled || projectNamePending"
            class="sv-btn sv-btn-primary"
            @click="confirmDuplicateProjectName">{{ t('common.confirm') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Flat sidebar row: hover / current are background fills only, so rows never change size or weight. */
.nav-row { --row-bg: transparent; border-radius: var(--sv-radius-control); background: var(--row-bg); color: var(--sv-text); }
.nav-row:hover { --row-bg: color-mix(in srgb, var(--sv-sidebar), #000 5%); }
.nav-row.is-current, .nav-row[aria-current='true'] { --row-bg: color-mix(in srgb, var(--sv-sidebar), #000 8%); }
/* Hover actions overlay the row tail; the fade hides the truncated name underneath without moving it. */
.nav-actions { background: linear-gradient(to left, var(--row-bg) 75%, transparent); }
</style>
