<script setup lang="ts">
/**
 * ProjectSidebar - 项目导航侧边栏
 * 
 * 职责：
 * 1. 展示项目列表（Inbox + 用户创建的项目）
 * 2. 项目切换（点击切换当前选中项目）
 * 3. 项目 CRUD（创建、重命名、删除）
 * 4. 显示每个项目下的对话数量
 * 
 * 设计决策：
 * - Inbox 始终在顶部，标记特殊图标
 * - 删除系统项目会显示错误提示
 * - 使用事件驱动，不直接操作数据库
 */

import { ref, computed } from 'vue'
import { t, tf } from '@/shared/i18n'
import UiIcon from '@/ui-kit/icons/UiIcon.vue'

export type ProjectItem = Readonly<{
  id: string
  name: string
  isSystem?: boolean
  convoCount?: number
}>

const props = defineProps<{
  projects: readonly ProjectItem[]
  activeProjectId: string | null
  inboxId: string | null
  disabled?: boolean
}>()

const emit = defineEmits<{
  select: [projectId: string | null]
  create: [name: string]
  rename: [projectId: string, name: string]
  delete: [projectId: string]
}>()

// ========== 状态 ==========

const showCreateDialog = ref(false)
const createName = ref('')
const renameDialog = ref<{ id: string; name: string } | null>(null)
const deleteDialog = ref<{ id: string; name: string } | null>(null)
const errorMessage = ref<string | null>(null)

// ========== 计算属性 ==========

/** Inbox 项目（始终第一个） */
const inboxProject = computed(() => {
  if (!props.inboxId) return null
  return props.projects.find(p => p.id === props.inboxId) ?? null
})

/** 用户项目（排除 Inbox） */
const userProjects = computed(() => {
  if (!props.inboxId) return props.projects
  return props.projects.filter(p => p.id !== props.inboxId)
})

// ========== 方法 ==========

function onSelect(projectId: string | null) {
  if (props.disabled) return
  emit('select', projectId)
}

function openCreate() {
  if (props.disabled) return
  createName.value = ''
  showCreateDialog.value = true
}

function confirmCreate() {
  const name = createName.value.trim()
  if (!name) return
  emit('create', name)
  showCreateDialog.value = false
  createName.value = ''
}

function openRename(project: ProjectItem) {
  if (props.disabled) return
  if (project.isSystem) {
    errorMessage.value = t('navigation.project.systemProjectNoRename')
    setTimeout(() => { errorMessage.value = null }, 3000)
    return
  }
  renameDialog.value = { id: project.id, name: project.name }
}

function confirmRename() {
  const dlg = renameDialog.value
  if (!dlg) return
  const name = dlg.name.trim()
  if (!name) return
  emit('rename', dlg.id, name)
  renameDialog.value = null
}

function openDelete(project: ProjectItem) {
  if (props.disabled) return
  if (project.isSystem) {
    errorMessage.value = t('navigation.project.systemProjectNoDelete')
    setTimeout(() => { errorMessage.value = null }, 3000)
    return
  }
  deleteDialog.value = { id: project.id, name: project.name }
}

function confirmDelete() {
  const dlg = deleteDialog.value
  if (!dlg) return
  emit('delete', dlg.id)
  deleteDialog.value = null
}

function cancelDialog() {
  showCreateDialog.value = false
  renameDialog.value = null
  deleteDialog.value = null
  createName.value = ''
}
</script>

<template>
  <div class="sv-divider-r flex h-full w-48 flex-col bg-[var(--sv-sidebar)]">
    <!-- 标题栏 -->
    <div class="flex items-center justify-between px-3 py-2">
      <span class="sv-label">{{ t('navigation.project.title') }}</span>
      <button
        type="button"
        class="sv-icon-btn"
        :disabled="props.disabled"
        @click="openCreate"
        :aria-label="t('navigation.project.newProject')"
      >
        <UiIcon name="plus" :size="15" />
      </button>
    </div>

    <!-- 错误提示 -->
    <div
      v-if="errorMessage"
      class="sv-notice sv-notice-danger mx-2 mb-1"
    >
      {{ errorMessage }}
    </div>

    <!-- 项目列表 -->
    <div class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto p-2">
      <!-- 全部对话（无筛选） -->
      <button
        type="button"
        class="nav-row flex h-8 w-full items-center gap-2 px-2 text-left text-[13px]"
        :aria-current="props.activeProjectId === null ? 'true' : undefined"
        :disabled="props.disabled"
        @click="onSelect(null)"
      >
        <UiIcon name="list" :size="16" class="flex-none" />
        <span class="min-w-0 flex-1 truncate">{{ t('navigation.empty.allConversations') }}</span>
      </button>

      <!-- Inbox（系统项目） -->
      <button
        v-if="inboxProject"
        type="button"
        class="nav-row flex h-8 w-full items-center gap-2 px-2 text-left text-[13px]"
        :aria-current="props.activeProjectId === inboxProject.id ? 'true' : undefined"
        :disabled="props.disabled"
        @click="onSelect(inboxProject.id)"
        @contextmenu.prevent
      >
        <UiIcon name="folder" :size="16" class="flex-none" />
        <span class="min-w-0 flex-1 truncate">{{ inboxProject.name }}</span>
        <span v-if="inboxProject.convoCount !== undefined" class="sv-meta">
          {{ inboxProject.convoCount }}
        </span>
      </button>

      <!-- 用户项目列表 -->
      <div
        v-for="project in userProjects"
        :key="project.id"
        class="nav-row group relative"
        :class="{ 'is-current': props.activeProjectId === project.id }"
      >
        <button
          type="button"
          class="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px]"
          :aria-current="props.activeProjectId === project.id ? 'true' : undefined"
          :disabled="props.disabled"
          @click="onSelect(project.id)"
        >
          <UiIcon name="folder" :size="16" class="flex-none" />
          <span class="min-w-0 flex-1 truncate">{{ project.name }}</span>
          <span v-if="project.convoCount !== undefined" class="sv-meta">
            {{ project.convoCount }}
          </span>
        </button>

        <!-- 操作按钮（hover 显示） -->
        <div class="nav-actions absolute inset-y-0 right-0 flex items-center rounded-r-md pl-4 pr-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            class="sv-icon-btn"
            :disabled="props.disabled"
            @click.stop="openRename(project)"
            :aria-label="t('navigation.project.renameProject')"
          >
            <UiIcon name="edit" :size="14" />
          </button>
          <button
            type="button"
            class="sv-icon-btn"
            :disabled="props.disabled"
            @click.stop="openDelete(project)"
            :aria-label="t('navigation.project.deleteProject')"
          >
            <UiIcon name="trash" :size="14" />
          </button>
        </div>
      </div>

      <div v-if="userProjects.length === 0 && !inboxProject" class="sv-meta px-2 py-3">
        {{ t('navigation.empty.noProjects') }}
      </div>
    </div>

    <!-- 创建对话框 -->
    <div
      v-if="showCreateDialog"
      class="sv-backdrop"
      @click.self="cancelDialog"
    >
      <div class="sv-dialog w-72 p-4">
        <div class="mb-3 text-sm font-medium">{{ t('navigation.project.newProject') }}</div>
        <input
          v-model="createName"
          type="text"
          class="sv-input mb-3"
          :placeholder="t('navigation.project.projectName')"
          @keydown.enter="confirmCreate"
          @keydown.escape="cancelDialog"
        />
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="sv-btn"
            @click="cancelDialog"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="button"
            class="sv-btn sv-btn-primary"
            @click="confirmCreate"
          >
            {{ t('common.create') }}
          </button>
        </div>
      </div>
    </div>

    <!-- 重命名对话框 -->
    <div
      v-if="renameDialog"
      class="sv-backdrop"
      @click.self="cancelDialog"
    >
      <div class="sv-dialog w-72 p-4">
        <div class="mb-3 text-sm font-medium">{{ t('navigation.project.renameProject') }}</div>
        <input
          v-model="renameDialog.name"
          type="text"
          class="sv-input mb-3"
          :placeholder="t('navigation.project.projectName')"
          @keydown.enter="confirmRename"
          @keydown.escape="cancelDialog"
        />
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="sv-btn"
            @click="cancelDialog"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="button"
            class="sv-btn sv-btn-primary"
            @click="confirmRename"
          >
            {{ t('common.save') }}
          </button>
        </div>
      </div>
    </div>

    <!-- 删除确认对话框 -->
    <div
      v-if="deleteDialog"
      class="sv-backdrop"
      @click.self="cancelDialog"
    >
      <div class="sv-dialog w-72 p-4">
        <div class="mb-3 text-sm font-medium">{{ t('navigation.project.deleteProject') }}</div>
        <p class="mb-4 text-sm text-gray-600">
          {{ tf('navigation.project.deleteConfirm', { name: deleteDialog.name }) }}
        </p>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="sv-btn"
            @click="cancelDialog"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="button"
            class="sv-btn sv-btn-danger"
            @click="confirmDelete"
          >
            {{ t('common.delete') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Flat sidebar row: hover/current by background fill only (no border/weight/size change). */
.nav-row { --row-bg: transparent; border-radius: var(--sv-radius-control); background: var(--row-bg); color: var(--sv-text); }
.nav-row:hover { --row-bg: color-mix(in srgb, var(--sv-sidebar), #000 5%); }
.nav-row.is-current, .nav-row[aria-current='true'] { --row-bg: color-mix(in srgb, var(--sv-sidebar), #000 8%); }
.nav-row:disabled { color: var(--sv-text-disabled); }
.nav-actions { background: linear-gradient(to left, var(--row-bg) 75%, transparent); }
</style>
