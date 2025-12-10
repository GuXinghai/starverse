<script setup lang="ts">
/**
 * ProjectManager.vue - 项目管理组件
 * 
 * 功能:
 * 1. 显示项目列表（包括系统条目：全部对话、未分配）
 * 2. 支持项目创建、重命名、删除
 * 3. 支持项目选择和高亮显示
 * 4. 管理项目编辑/创建模式的 UI 状态
 * 
 * Props:
 * - projects: 用户创建的项目列表
 * - modelValue: 当前选中的项目 ID
 * - collapsed: 是否折叠（不显示项目列表）
 * 
 * Emits:
 * - update:modelValue: 更新选中的项目
 * - project-created: 创建新项目
 * - project-renamed: 重命名项目
 * - project-deleted: 删除项目
 * 
 * @author GitHub Copilot
 * @date 2025-11-29
 */
import { ref, computed, nextTick } from 'vue'

/**
 * 项目记录类型
 */
interface ProjectRecord {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  isSystem?: boolean
}

/**
 * Props 定义
 */
interface Props {
  /** 项目列表 (来自 projectStore.orderedProjects) */
  projects: ProjectRecord[]
  
  /** 当前选中的项目 ID ('all' | 'unassigned' | projectId) */
  modelValue: string
  
  /** 是否折叠项目管理器 */
  collapsed?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  collapsed: false
})

/**
 * Emits 定义
 */
const emit = defineEmits<{
  /** 更新选中的项目 */
  'update:modelValue': [projectId: string]
  
  /** 创建新项目 */
  'project-created': [name: string]
  
  /** 重命名项目 */
  'project-renamed': [projectId: string, newName: string]
  
  /** 删除项目 */
  'project-deleted': [projectId: string]
}>()

// ========================================
// 内部状态
// ========================================

/** 是否处于创建项目模式 */
const isCreatingProject = ref(false)

/** 新项目名称输入 */
const newProjectName = ref('')

/** 新项目输入框引用 */
const newProjectInputRef = ref<HTMLInputElement | null>(null)

/** 正在编辑的项目 ID */
const projectEditingId = ref<string | null>(null)

/** 编辑项目的新名称 */
const projectEditingName = ref('')

/** 待删除的项目 ID */
const projectDeletingId = ref<string | null>(null)

/** 待删除的项目名称 */
const projectDeletingName = ref('')

// ========================================
// Computed 属性
// ========================================

/**
 * 项目管理器显示条目 (包含系统条目)
 * 
 * 系统条目:
 * - 全部对话: 显示所有对话，无项目筛选
 * - 未分配: 显示未分配到任何项目的对话
 */
const projectManagerEntries = computed<ProjectRecord[]>(() => {
  const allEntry: ProjectRecord = {
    id: 'all',
    name: '全部对话',
    createdAt: 0,
    updatedAt: 0,
    isSystem: true
  }
  const unassignedEntry: ProjectRecord = {
    id: 'unassigned',
    name: '未分配',
    createdAt: 0,
    updatedAt: 0,
    isSystem: true
  }
  // 创建项目副本，避免直接修改 props
  return [allEntry, unassignedEntry, ...props.projects.map(p => ({ ...p }))]
})

/**
 * 判断项目是否被选中
 */
const isProjectSelected = (projectId: string): boolean => {
  return props.modelValue === projectId
}

// ========================================
// 方法
// ========================================

/**
 * 选择项目
 * 
 * @param projectId - 项目 ID ('all' | 'unassigned' | projectId)
 */
const selectProject = (projectId: string) => {
  emit('update:modelValue', projectId)
}

/**
 * 切换创建项目模式
 * 
 * 进入创建模式时自动聚焦输入框
 * 退出创建模式时清空输入内容
 */
const toggleProjectCreation = () => {
  if (isCreatingProject.value) {
    // 退出创建模式
    newProjectName.value = ''
    nextTick(() => {
      newProjectInputRef.value = null
    })
  }
  
  isCreatingProject.value = !isCreatingProject.value
  
  if (isCreatingProject.value) {
    // 进入创建模式，聚焦输入框
    nextTick(() => {
      newProjectInputRef.value?.focus()
    })
  }
}

/**
 * 处理创建项目
 * 
 * 验证名称非空后发送 emit 事件
 * 创建成功后清空输入和退出创建模式
 */
const handleCreateProject = () => {
  const name = newProjectName.value.trim()
  if (!name) {
    return
  }
  
  emit('project-created', name)
  
  // 清理状态
  newProjectName.value = ''
  isCreatingProject.value = false
  newProjectInputRef.value = null
}

/**
 * 开始编辑项目
 * 
 * 系统项目不可编辑
 * 
 * @param project - 要编辑的项目
 */
const startProjectEdit = (project: ProjectRecord) => {
  if (project.isSystem) {
    return
  }
  projectEditingId.value = project.id
  projectEditingName.value = project.name
}

/**
 * 确认编辑项目
 * 
 * 验证名称非空后发送 emit 事件
 * 
 * @param projectId - 项目 ID
 */
const confirmProjectEdit = (projectId: string) => {
  const name = projectEditingName.value.trim()
  if (!name) {
    return
  }
  
  emit('project-renamed', projectId, name)
  
  // 清理编辑状态
  projectEditingId.value = null
  projectEditingName.value = ''
}

/**
 * 取消编辑项目
 */
const cancelProjectEdit = () => {
  projectEditingId.value = null
  projectEditingName.value = ''
}

/**
 * 删除项目
 * 
 * 显示确认弹窗，让用户选择：
 * 1. 仅删除项目（对话保留，移至未分配）
 * 2. 取消操作
 * 
 * @param projectId - 项目 ID
 */
const deleteProject = (projectId: string) => {
  // 获取项目信息
  const project = props.projects.find(p => p.id === projectId)
  if (!project) return
  
  // 显示内部确认弹窗
  projectDeletingId.value = projectId
  projectDeletingName.value = project.name
}

/**
 * 确认删除项目
 */
const confirmDeleteProject = () => {
  if (projectDeletingId.value) {
    emit('project-deleted', projectDeletingId.value)
  }
  // 清理状态
  projectDeletingId.value = null
  projectDeletingName.value = ''
}

/**
 * 取消删除项目
 */
const cancelDeleteProject = () => {
  projectDeletingId.value = null
  projectDeletingName.value = ''
}
</script>

<template>
  <!-- 项目筛选器（展开状态） -->
  <div 
    v-if="!collapsed" 
    class="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-300"
  >
    <!-- 新增项目输入框 -->
    <div 
      v-if="isCreatingProject" 
      class="flex items-center gap-2 px-3 py-2 bg-blue-50 border-l-2 border-blue-400"
    >
      <input
        ref="newProjectInputRef"
        v-model="newProjectName"
        type="text"
        placeholder="输入项目名称..."
        class="flex-1 min-w-0 px-2 py-1 text-sm bg-white border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        @keyup.enter="handleCreateProject"
        @keyup.escape="toggleProjectCreation"
      >
      <div class="flex gap-2 flex-shrink-0">
        <button 
          @click="handleCreateProject" 
          class="p-1.5 text-green-600 hover:text-white hover:bg-green-600 rounded transition-colors flex-shrink-0"
          title="确认 (Enter)"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </button>
        <button 
          @click="toggleProjectCreation" 
          class="p-1.5 text-red-500 hover:text-white hover:bg-red-500 rounded transition-colors flex-shrink-0"
          title="取消 (Esc)"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

    <!-- 项目列表 -->
    <div
      v-for="project in projectManagerEntries"
      :key="project.id"
      class="flex items-center gap-2 px-3 py-2 cursor-pointer group transition-colors"
      :class="[
        isProjectSelected(project.id)
          ? 'bg-blue-50 text-blue-600 font-medium'
          : 'hover:bg-gray-50 text-gray-700'
      ]"
      @click="selectProject(project.id)"
    >
      <!-- 编辑模式 -->
      <div 
        v-if="projectEditingId === project.id" 
        class="flex-1 flex items-center gap-2 min-w-0" 
        @click.stop
      >
        <input
          v-model="projectEditingName"
          type="text"
          class="flex-1 min-w-0 px-2 py-1 text-sm bg-white border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          @keyup.enter="confirmProjectEdit(project.id)"
          @keyup.escape="cancelProjectEdit"
        >
        <div class="flex gap-2 flex-shrink-0">
          <button 
            @click="confirmProjectEdit(project.id)" 
            class="p-1.5 text-green-600 hover:text-white hover:bg-green-600 rounded transition-colors flex-shrink-0"
            title="确认 (Enter)"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </button>
          <button 
            @click="cancelProjectEdit" 
            class="p-1.5 text-red-500 hover:text-white hover:bg-red-500 rounded transition-colors flex-shrink-0"
            title="取消 (Esc)"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- 显示模式 -->
      <div v-else class="flex-1 flex items-center gap-2 min-w-0">
        <svg class="w-4 h-4 text-gray-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <span class="flex-1 text-sm truncate min-w-0">{{ project.name }}</span>
        
        <!-- 操作按钮（非系统项目） -->
        <div 
          v-if="!project.isSystem" 
          class="flex gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <button 
            @click.stop="startProjectEdit(project)" 
            class="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title="重命名项目"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <button 
            @click.stop="deleteProject(project.id)" 
            class="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
            title="删除项目"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- 新增项目按钮 -->
    <div 
      v-if="!isCreatingProject"
      class="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 text-gray-500"
      @click="toggleProjectCreation"
    >
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
      </svg>
      <span class="text-sm">新建项目</span>
    </div>
  </div>

  <!-- 删除确认弹窗 -->
  <Teleport to="body">
    <div 
      v-if="projectDeletingId" 
      class="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      @click.self="cancelDeleteProject"
    >
      <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
        <!-- 弹窗头部 -->
        <div class="px-6 py-4 border-b border-gray-200">
          <h3 class="text-lg font-semibold text-gray-900">删除项目</h3>
        </div>
        
        <!-- 弹窗内容 -->
        <div class="px-6 py-4">
          <p class="text-gray-700 mb-4">
            确定要删除项目 
            <span class="font-semibold text-gray-900">"{{ projectDeletingName }}"</span> 
            吗？
          </p>
          <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p class="text-sm text-yellow-800">
              <svg class="w-4 h-4 inline-block mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              项目将被删除，但其中的对话会保留并移至"未分配"分类。
            </p>
          </div>
        </div>
        
        <!-- 弹窗底部 -->
        <div class="px-6 py-4 bg-gray-50 flex justify-end gap-3">
          <button
            @click="cancelDeleteProject"
            class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            取消
          </button>
          <button
            @click="confirmDeleteProject"
            class="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
          >
            确认删除
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
