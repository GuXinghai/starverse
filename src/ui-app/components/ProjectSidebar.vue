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
  <div class="flex h-full w-48 flex-col border-r border-gray-200 bg-gray-50">
    <!-- 标题栏 -->
    <div class="flex items-center justify-between border-b border-gray-200 px-3 py-2">
      <span class="text-xs font-semibold uppercase tracking-wide text-gray-600">{{ t('navigation.project.title') }}</span>
      <button
        type="button"
        class="rounded-md bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
        :disabled="props.disabled"
        @click="openCreate"
        :aria-label="t('navigation.project.newProject')"
      >
        +
      </button>
    </div>

    <!-- 错误提示 -->
    <div
      v-if="errorMessage"
      class="mx-2 mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700"
    >
      {{ errorMessage }}
    </div>

    <!-- 项目列表 -->
    <div class="min-h-0 flex-1 overflow-auto p-2">
      <!-- 全部对话（无筛选） -->
      <button
        type="button"
        class="mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors"
        :class="props.activeProjectId === null ? 'bg-blue-100 text-blue-900' : 'text-gray-700 hover:bg-gray-100'"
        :disabled="props.disabled"
        @click="onSelect(null)"
      >
        <span class="text-base">📋</span>
        <span class="min-w-0 flex-1 truncate">{{ t('navigation.empty.allConversations') }}</span>
      </button>

      <!-- Inbox（系统项目） -->
      <button
        v-if="inboxProject"
        type="button"
        class="mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors"
        :class="props.activeProjectId === inboxProject.id ? 'bg-blue-100 text-blue-900' : 'text-gray-700 hover:bg-gray-100'"
        :disabled="props.disabled"
        @click="onSelect(inboxProject.id)"
        @contextmenu.prevent
      >
        <span class="text-base">📥</span>
        <span class="min-w-0 flex-1 truncate">{{ inboxProject.name }}</span>
        <span v-if="inboxProject.convoCount !== undefined" class="text-[10px] text-gray-500">
          {{ inboxProject.convoCount }}
        </span>
      </button>

      <!-- 分隔线 -->
      <div v-if="userProjects.length > 0" class="my-2 border-t border-gray-200" />

      <!-- 用户项目列表 -->
      <div
        v-for="project in userProjects"
        :key="project.id"
        class="group relative mb-1"
      >
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors"
          :class="props.activeProjectId === project.id ? 'bg-blue-100 text-blue-900' : 'text-gray-700 hover:bg-gray-100'"
          :disabled="props.disabled"
          @click="onSelect(project.id)"
        >
          <span class="text-base">📁</span>
          <span class="min-w-0 flex-1 truncate">{{ project.name }}</span>
          <span v-if="project.convoCount !== undefined" class="text-[10px] text-gray-500">
            {{ project.convoCount }}
          </span>
        </button>

        <!-- 操作按钮（hover 显示） -->
        <div class="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-1 group-hover:flex">
          <button
            type="button"
            class="rounded bg-white p-1 text-xs text-gray-500 shadow-sm hover:bg-gray-100 hover:text-gray-700"
            :disabled="props.disabled"
            @click.stop="openRename(project)"
            :aria-label="t('navigation.project.renameProject')"
          >
            ✏️
          </button>
          <button
            type="button"
            class="rounded bg-white p-1 text-xs text-red-500 shadow-sm hover:bg-red-50 hover:text-red-700"
            :disabled="props.disabled"
            @click.stop="openDelete(project)"
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

    <!-- 创建对话框 -->
    <div
      v-if="showCreateDialog"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      @click.self="cancelDialog"
    >
      <div class="w-72 rounded-lg bg-white p-4 shadow-xl">
        <div class="mb-3 text-sm font-medium text-gray-900">{{ t('navigation.project.newProject') }}</div>
        <input
          v-model="createName"
          type="text"
          class="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          :placeholder="t('navigation.project.projectName')"
          @keydown.enter="confirmCreate"
          @keydown.escape="cancelDialog"
        />
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            @click="cancelDialog"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="button"
            class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
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
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      @click.self="cancelDialog"
    >
      <div class="w-72 rounded-lg bg-white p-4 shadow-xl">
        <div class="mb-3 text-sm font-medium text-gray-900">{{ t('navigation.project.renameProject') }}</div>
        <input
          v-model="renameDialog.name"
          type="text"
          class="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          :placeholder="t('navigation.project.projectName')"
          @keydown.enter="confirmRename"
          @keydown.escape="cancelDialog"
        />
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            @click="cancelDialog"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="button"
            class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
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
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      @click.self="cancelDialog"
    >
      <div class="w-72 rounded-lg bg-white p-4 shadow-xl">
        <div class="mb-3 text-sm font-medium text-gray-900">{{ t('navigation.project.deleteProject') }}</div>
        <p class="mb-4 text-sm text-gray-600">
          {{ tf('navigation.project.deleteConfirm', { name: deleteDialog.name }) }}
        </p>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            @click="cancelDialog"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="button"
            class="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
            @click="confirmDelete"
          >
            {{ t('common.delete') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
