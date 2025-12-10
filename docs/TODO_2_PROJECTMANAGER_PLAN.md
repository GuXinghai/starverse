# TODO 2: 提取 ProjectManager 子组件 - 详细实施计划

> **风险等级**: 🟡 中风险  
> **预计时间**: 6 小时  
> **依赖**: 无（可立即开始）  
> **创建时间**: 2025-11-29

---

## 📋 任务概述

### 目标
从 `ConversationList.vue` (1813 行) 中提取项目管理功能，创建独立的 `ProjectManager.vue` 子组件。

### 当前代码分布
- **模板代码**: 1022-1094 行 (73 行)
- **脚本逻辑**: 
  - 状态变量: 106-111 行 (6 行)
  - computed: 738-756 行 (19 行)
  - watch: 895-917 行 (23 行) ⚠️ **双向同步逻辑 - 高风险**
  - 方法: 988-1021 行 (34 行)

### 预期成果
- ✅ 新增 `src/components/sidebar/ProjectManager.vue` (~180 行)
- ✅ ConversationList.vue 减少 ~155 行
- ✅ 单向数据流，清晰的 props/emits 接口
- ✅ 单元测试覆盖率 > 85%

---

## 🔍 代码分析

### 需要迁移的状态变量 (106-111 行)

```typescript
// 项目管理相关
const projectFilter = ref<string>('all')
const isCreatingProject = ref(false)
const newProjectName = ref('')
const newProjectInputRef = ref<HTMLElement | null>(null)
const projectEditingId = ref<string | null>(null)
const projectEditingName = ref('')
```

**迁移策略**:
- ✅ `projectFilter` → **不迁移**，改为 props 接收，通过 emit 更新
- ✅ `isCreatingProject`, `newProjectName`, `newProjectInputRef` → 迁移到子组件内部
- ✅ `projectEditingId`, `projectEditingName` → 迁移到子组件内部

---

### 需要迁移的 Computed (738-756 行)

```typescript
const orderedProjects = computed<ProjectRecord[]>(() => {
  return projectStore.orderedProjects as ProjectRecord[]
})

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
  return [allEntry, unassignedEntry, ...orderedProjects.value]
})
```

**迁移策略**:
- ✅ `orderedProjects` → 保留在父组件，通过 props 传递
- ✅ `projectManagerEntries` → 迁移到子组件内部 computed
- ✅ 子组件接收 `projects` prop，内部添加系统条目

---

### ⚠️ 高风险区域: 双向同步逻辑 (895-917 行)

```typescript
let projectSyncReady = false

watch(
  () => projectStore.activeProjectId,
  (next) => {
    projectSyncReady = true
    const target = next ?? 'all'
    if (projectFilter.value !== target) {
      projectFilter.value = target
    }
  },
  { immediate: true }
)

watch(projectFilter, (next) => {
  if (!projectSyncReady) {
    return
  }
  if (next === 'all') {
    projectStore.setActiveProject(null)
    return
  }
  projectStore.setActiveProject(next)
})
```

**⚠️ 风险分析**:
1. 使用全局标志位 `projectSyncReady` 防止循环触发
2. 两个 watch 互相依赖，容易出现状态不一致
3. projectStore.activeProjectId 和 projectFilter 存在双向耦合

**重构策略** (⚠️ 暂不在此 TODO 中完成，留待 TODO 5):
- 父组件（ConversationList）保留此逻辑
- 子组件（ProjectManager）通过 props 接收 `modelValue` (projectFilter)
- 子组件通过 `emit('update:modelValue', value)` 通知父组件
- 父组件在 watch 中调用 `projectStore.setActiveProject()`

**本 TODO 的处理方式**:
```typescript
// 父组件 (ConversationList.vue)
<ProjectManager
  :projects="orderedProjects"
  v-model="projectFilter"
  @project-created="handleProjectCreated"
  @project-renamed="handleProjectRenamed"
  @project-deleted="handleProjectDeleted"
/>

// watch 逻辑保持不变，暂不重构
```

---

### 需要迁移的方法 (988-1021 行)

```typescript
const handleCreateProject = async () => {
  const createdId = await projectStore.createProject(newProjectName.value)
  if (createdId) {
    projectFilter.value = createdId
    newProjectName.value = ''
    isCreatingProject.value = false
    newProjectInputRef.value = null
  }
}

const isProjectSelected = (projectId: string) => projectFilter.value === projectId

const selectProject = (projectId: string) => {
  projectFilter.value = projectId
}

const toggleProjectCreation = () => {
  if (isCreatingProject.value) {
    newProjectName.value = ''
    nextTick(() => {
      newProjectInputRef.value = null
    })
  }
  isCreatingProject.value = !isCreatingProject.value
  if (isCreatingProject.value) {
    nextTick(() => {
      newProjectInputRef.value?.focus()
    })
  }
}

const startProjectEdit = (project: ProjectRecord) => {
  if (project.isSystem) {
    return
  }
  projectEditingId.value = project.id
  projectEditingName.value = project.name
}

const cancelProjectEdit = () => {
  projectEditingId.value = null
  projectEditingName.value = ''
}
```

**迁移策略**:
- ✅ `handleCreateProject` → 改为 emit('project-created', name)
- ✅ `isProjectSelected` → 改为 computed: `(id) => props.modelValue === id`
- ✅ `selectProject` → 改为 emit('update:modelValue', id)
- ✅ `toggleProjectCreation`, `startProjectEdit`, `cancelProjectEdit` → 完整迁移
- ⚠️ 注意: 项目重命名和删除的方法需要查找补充

---

### 需要迁移的模板 (1022-1094 行)

```vue
<!-- 项目筛选器 (展开状态) -->
<div v-if="!isProjectsCollapsed" class="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">
  <!-- 新增项目输入框 -->
  <div v-if="isCreatingProject" class="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700">
    <input
      :ref="(el) => newProjectInputRef = el as HTMLElement | null"
      v-model="newProjectName"
      type="text"
      placeholder="输入项目名称"
      class="flex-1 px-2 py-1 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
      @keyup.enter="handleCreateProject"
      @keyup.escape="toggleProjectCreation"
    >
    <button @click="handleCreateProject" class="text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300">
      <CheckIcon class="w-4 h-4" />
    </button>
    <button @click="toggleProjectCreation" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
      <XMarkIcon class="w-4 h-4" />
    </button>
  </div>

  <!-- 项目列表 -->
  <div
    v-for="project in projectManagerEntries"
    :key="project.id"
    class="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 group"
    :class="{ 'bg-blue-50 dark:bg-blue-900/20': isProjectSelected(project.id) }"
    @click="selectProject(project.id)"
  >
    <!-- 编辑模式 -->
    <div v-if="projectEditingId === project.id" class="flex-1 flex items-center gap-2" @click.stop>
      <input
        v-model="projectEditingName"
        type="text"
        class="flex-1 px-2 py-1 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        @keyup.enter="confirmProjectEdit(project.id)"
        @keyup.escape="cancelProjectEdit"
      >
      <button @click="confirmProjectEdit(project.id)" class="text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300">
        <CheckIcon class="w-4 h-4" />
      </button>
      <button @click="cancelProjectEdit" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
        <XMarkIcon class="w-4 h-4" />
      </button>
    </div>

    <!-- 显示模式 -->
    <div v-else class="flex-1 flex items-center gap-2">
      <FolderIcon class="w-4 h-4 text-gray-400 flex-shrink-0" />
      <span class="flex-1 text-sm truncate">{{ project.name }}</span>
      
      <!-- 操作按钮 (非系统项目) -->
      <div v-if="!project.isSystem" class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button @click.stop="startProjectEdit(project)" class="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400">
          <PencilIcon class="w-4 h-4" />
        </button>
        <button @click.stop="deleteProject(project.id)" class="text-gray-400 hover:text-red-600 dark:hover:text-red-400">
          <TrashIcon class="w-4 h-4" />
        </button>
      </div>
    </div>
  </div>
</div>
```

**迁移要点**:
- ✅ 完整迁移模板结构
- ✅ 保留 Tailwind 样式类
- ✅ 使用 v-model 绑定 props.modelValue
- ✅ 使用 heroicons 图标 (FolderIcon, PencilIcon, TrashIcon, CheckIcon, XMarkIcon)

---

## 📐 组件设计

### Props 定义

```typescript
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
```

### Emits 定义

```typescript
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
```

### 内部状态

```typescript
// 创建项目
const isCreatingProject = ref(false)
const newProjectName = ref('')
const newProjectInputRef = ref<HTMLInputElement | null>(null)

// 编辑项目
const projectEditingId = ref<string | null>(null)
const projectEditingName = ref('')
```

### Computed

```typescript
/** 项目管理器显示条目 (包含系统条目 '全部对话' 和 '未分配') */
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
  return [allEntry, unassignedEntry, ...props.projects]
})

/** 判断项目是否被选中 */
const isProjectSelected = (projectId: string) => props.modelValue === projectId
```

### 方法

```typescript
/** 选择项目 */
const selectProject = (projectId: string) => {
  emit('update:modelValue', projectId)
}

/** 切换创建项目模式 */
const toggleProjectCreation = () => {
  if (isCreatingProject.value) {
    newProjectName.value = ''
    nextTick(() => {
      newProjectInputRef.value = null
    })
  }
  isCreatingProject.value = !isCreatingProject.value
  if (isCreatingProject.value) {
    nextTick(() => {
      newProjectInputRef.value?.focus()
    })
  }
}

/** 处理创建项目 */
const handleCreateProject = () => {
  const name = newProjectName.value.trim()
  if (!name) {
    return
  }
  emit('project-created', name)
  newProjectName.value = ''
  isCreatingProject.value = false
  newProjectInputRef.value = null
}

/** 开始编辑项目 */
const startProjectEdit = (project: ProjectRecord) => {
  if (project.isSystem) {
    return
  }
  projectEditingId.value = project.id
  projectEditingName.value = project.name
}

/** 确认编辑项目 */
const confirmProjectEdit = (projectId: string) => {
  const name = projectEditingName.value.trim()
  if (!name) {
    return
  }
  emit('project-renamed', projectId, name)
  projectEditingId.value = null
  projectEditingName.value = ''
}

/** 取消编辑项目 */
const cancelProjectEdit = () => {
  projectEditingId.value = null
  projectEditingName.value = ''
}

/** 删除项目 */
const deleteProject = (projectId: string) => {
  emit('project-deleted', projectId)
}
```

---

## 📝 实施步骤

### Step 1: 创建组件文件结构 (30 分钟)

**操作**:
```bash
# 创建目录
mkdir -p src/components/sidebar

# 创建组件文件
touch src/components/sidebar/ProjectManager.vue
```

**文件内容**:
```vue
<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { FolderIcon, PencilIcon, TrashIcon, CheckIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import type { ProjectRecord } from '@/types/store'

// Props & Emits 定义 (按照上述设计)
// 内部状态定义
// Computed 和方法实现
</script>

<template>
  <!-- 模板实现 -->
</template>
```

**验证**:
- [ ] 文件创建成功
- [ ] TypeScript 类型导入正确
- [ ] 组件可编译通过

---

### Step 2: 实现组件逻辑 (60 分钟)

**操作**:
1. 复制 Props/Emits 定义
2. 复制内部状态变量
3. 实现 computed 属性
4. 实现所有方法

**代码位置参考**:
- Props: 新增设计
- 状态: ConversationList.vue 106-111 行
- Computed: ConversationList.vue 738-756 行
- 方法: ConversationList.vue 988-1021 行

**验证**:
- [ ] 所有方法都通过 emit 通知父组件
- [ ] 没有直接操作 projectStore
- [ ] TypeScript 类型检查通过

---

### Step 3: 实现模板结构 (45 分钟)

**操作**:
1. 复制 ConversationList.vue 1022-1094 行模板
2. 替换 `projectFilter` → `props.modelValue`
3. 替换方法调用为本地方法
4. 调整样式 (移除不必要的包裹层)

**关键修改**:
```vue
<!-- 旧代码 -->
<div v-if="!isProjectsCollapsed" class="...">

<!-- 新代码 -->
<div v-if="!props.collapsed" class="...">
```

```vue
<!-- 旧代码 -->
@click="selectProject(project.id)"

<!-- 新代码 (不变，因为方法已迁移) -->
@click="selectProject(project.id)"
```

**验证**:
- [ ] 所有 v-if/v-for 正确
- [ ] 事件处理器绑定正确
- [ ] 样式类完整保留

---

### Step 4: 父组件集成 (60 分钟)

**操作**:
在 `ConversationList.vue` 中集成 `ProjectManager` 组件。

**代码修改**:

1. **导入组件**:
```typescript
// ConversationList.vue <script setup> 顶部
import ProjectManager from './sidebar/ProjectManager.vue'
```

2. **添加事件处理器** (在 script 中新增):
```typescript
// 处理项目创建
const handleProjectCreated = async (name: string) => {
  const createdId = await projectStore.createProject(name)
  if (createdId) {
    projectFilter.value = createdId
  }
}

// 处理项目重命名
const handleProjectRenamed = async (projectId: string, newName: string) => {
  await projectStore.renameProject(projectId, newName)
}

// 处理项目删除
const handleProjectDeleted = async (projectId: string) => {
  await projectStore.deleteProject(projectId)
  // 如果删除的是当前选中的项目，切换到 'all'
  if (projectFilter.value === projectId) {
    projectFilter.value = 'all'
  }
}
```

3. **替换模板** (1022-1094 行):
```vue
<!-- 旧代码: 1022-1094 行完整的项目管理器模板 -->

<!-- 新代码: 简洁的组件调用 -->
<ProjectManager
  v-if="!isProjectsCollapsed"
  :projects="orderedProjects"
  v-model="projectFilter"
  :collapsed="isProjectsCollapsed"
  @project-created="handleProjectCreated"
  @project-renamed="handleProjectRenamed"
  @project-deleted="handleProjectDeleted"
/>
```

**验证**:
- [ ] 组件正确渲染
- [ ] 点击项目可切换筛选器
- [ ] 创建/重命名/删除功能正常

---

### Step 5: 清理旧代码 (30 分钟)

**操作**:
1. 移除已迁移的状态变量 (106-111 行的部分变量)
2. 移除已迁移的 computed (738-756 行)
3. 移除已迁移的方法 (988-1021 行)
4. **保留** watch 逻辑 (895-917 行) - 留待 TODO 5 重构

**⚠️ 保留的代码**:
```typescript
// ⚠️ 保留 - TODO 5 将重构此部分
const projectFilter = ref<string>('all')

let projectSyncReady = false
watch(
  () => projectStore.activeProjectId,
  (next) => {
    projectSyncReady = true
    const target = next ?? 'all'
    if (projectFilter.value !== target) {
      projectFilter.value = target
    }
  },
  { immediate: true }
)

watch(projectFilter, (next) => {
  if (!projectSyncReady) {
    return
  }
  if (next === 'all') {
    projectStore.setActiveProject(null)
    return
  }
  projectStore.setActiveProject(next)
})
```

**验证**:
- [ ] 移除的代码不再被引用
- [ ] TypeScript 编译无警告
- [ ] 应用功能正常

---

### Step 6: 单元测试 (90 分钟)

**测试文件**: `tests/unit/components/sidebar/ProjectManager.spec.ts`

**测试用例**:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-library/vue'
import ProjectManager from '@/components/sidebar/ProjectManager.vue'
import type { ProjectRecord } from '@/types/store'

describe('ProjectManager', () => {
  const mockProjects: ProjectRecord[] = [
    { id: 'p1', name: 'Project 1', createdAt: 1000, updatedAt: 1000, isSystem: false },
    { id: 'p2', name: 'Project 2', createdAt: 2000, updatedAt: 2000, isSystem: false }
  ]

  describe('显示项目列表', () => {
    it('应该显示系统条目和用户项目', () => {
      const wrapper = mount(ProjectManager, {
        props: { projects: mockProjects, modelValue: 'all' }
      })
      
      // 验证系统条目
      expect(wrapper.text()).toContain('全部对话')
      expect(wrapper.text()).toContain('未分配')
      
      // 验证用户项目
      expect(wrapper.text()).toContain('Project 1')
      expect(wrapper.text()).toContain('Project 2')
    })

    it('应该高亮显示选中的项目', () => {
      const wrapper = mount(ProjectManager, {
        props: { projects: mockProjects, modelValue: 'p1' }
      })
      
      // 验证高亮样式
      const selectedItem = wrapper.find('[class*="bg-blue-50"]')
      expect(selectedItem.text()).toContain('Project 1')
    })
  })

  describe('选择项目', () => {
    it('点击项目应该触发 update:modelValue 事件', async () => {
      const wrapper = mount(ProjectManager, {
        props: { projects: mockProjects, modelValue: 'all' }
      })
      
      const project1 = wrapper.findAll('.cursor-pointer')[2] // 第3个 (跳过系统条目)
      await project1.trigger('click')
      
      expect(wrapper.emitted('update:modelValue')).toEqual([['p1']])
    })
  })

  describe('创建项目', () => {
    it('应该显示创建输入框', async () => {
      const wrapper = mount(ProjectManager, {
        props: { projects: mockProjects, modelValue: 'all' }
      })
      
      // 触发创建模式 (需要在组件中暴露方法或通过按钮触发)
      // 这里假设有一个 toggleProjectCreation 方法
      await wrapper.vm.toggleProjectCreation()
      await wrapper.vm.$nextTick()
      
      expect(wrapper.find('input[placeholder="输入项目名称"]').exists()).toBe(true)
    })

    it('输入名称并按 Enter 应该触发 project-created 事件', async () => {
      const wrapper = mount(ProjectManager, {
        props: { projects: mockProjects, modelValue: 'all' }
      })
      
      await wrapper.vm.toggleProjectCreation()
      await wrapper.vm.$nextTick()
      
      const input = wrapper.find('input[placeholder="输入项目名称"]')
      await input.setValue('New Project')
      await input.trigger('keyup.enter')
      
      expect(wrapper.emitted('project-created')).toEqual([['New Project']])
    })

    it('空名称不应该触发 project-created 事件', async () => {
      const wrapper = mount(ProjectManager, {
        props: { projects: mockProjects, modelValue: 'all' }
      })
      
      await wrapper.vm.toggleProjectCreation()
      const input = wrapper.find('input[placeholder="输入项目名称"]')
      await input.setValue('   ')
      await input.trigger('keyup.enter')
      
      expect(wrapper.emitted('project-created')).toBeUndefined()
    })
  })

  describe('编辑项目', () => {
    it('点击编辑按钮应该进入编辑模式', async () => {
      const wrapper = mount(ProjectManager, {
        props: { projects: mockProjects, modelValue: 'all' }
      })
      
      const editButton = wrapper.find('[data-testid="edit-p1"]') // 需要添加 data-testid
      await editButton.trigger('click')
      await wrapper.vm.$nextTick()
      
      expect(wrapper.find('input[type="text"]').element.value).toBe('Project 1')
    })

    it('确认编辑应该触发 project-renamed 事件', async () => {
      const wrapper = mount(ProjectManager, {
        props: { projects: mockProjects, modelValue: 'all' }
      })
      
      await wrapper.vm.startProjectEdit(mockProjects[0])
      await wrapper.vm.$nextTick()
      
      const input = wrapper.find('input[type="text"]')
      await input.setValue('Updated Project')
      
      const confirmButton = wrapper.find('[data-testid="confirm-edit"]')
      await confirmButton.trigger('click')
      
      expect(wrapper.emitted('project-renamed')).toEqual([['p1', 'Updated Project']])
    })

    it('系统项目不应该显示编辑按钮', () => {
      const wrapper = mount(ProjectManager, {
        props: { projects: mockProjects, modelValue: 'all' }
      })
      
      // '全部对话' 和 '未分配' 不应该有编辑按钮
      const systemItems = wrapper.findAll('.cursor-pointer').slice(0, 2)
      systemItems.forEach(item => {
        expect(item.find('[data-testid^="edit-"]').exists()).toBe(false)
      })
    })
  })

  describe('删除项目', () => {
    it('点击删除按钮应该触发 project-deleted 事件', async () => {
      const wrapper = mount(ProjectManager, {
        props: { projects: mockProjects, modelValue: 'all' }
      })
      
      const deleteButton = wrapper.find('[data-testid="delete-p1"]')
      await deleteButton.trigger('click')
      
      expect(wrapper.emitted('project-deleted')).toEqual([['p1']])
    })
  })

  describe('collapsed 状态', () => {
    it('collapsed=true 时不应该渲染项目列表', () => {
      const wrapper = mount(ProjectManager, {
        props: { projects: mockProjects, modelValue: 'all', collapsed: true }
      })
      
      expect(wrapper.find('.overflow-y-auto').exists()).toBe(false)
    })
  })
})
```

**验证**:
- [ ] 所有测试用例通过
- [ ] 覆盖率 > 85%
- [ ] 边界条件测试完整

---

### Step 7: 手动测试 (30 分钟)

**测试清单**:

- [ ] **显示测试**
  - [ ] 项目列表正确显示 (系统条目 + 用户项目)
  - [ ] 选中项目高亮显示
  - [ ] hover 时显示编辑/删除按钮
  - [ ] 系统项目不显示编辑/删除按钮

- [ ] **创建项目**
  - [ ] 点击创建按钮显示输入框
  - [ ] 输入框自动获取焦点
  - [ ] 输入名称按 Enter 创建成功
  - [ ] 创建后自动切换到新项目
  - [ ] 按 Escape 取消创建

- [ ] **编辑项目**
  - [ ] 点击编辑按钮进入编辑模式
  - [ ] 输入框预填充项目名称
  - [ ] 按 Enter 确认编辑
  - [ ] 按 Escape 取消编辑
  - [ ] 空名称不允许提交

- [ ] **删除项目**
  - [ ] 点击删除按钮触发删除
  - [ ] 删除当前选中项目后切换到 'all'

- [ ] **筛选功能**
  - [ ] 切换项目后对话列表正确筛选
  - [ ] '全部对话' 显示所有对话
  - [ ] '未分配' 仅显示未分配项目的对话

- [ ] **边界条件**
  - [ ] 无项目时正确显示
  - [ ] 项目数量很多时滚动正常
  - [ ] 快速切换项目无卡顿

---

### Step 8: Git 提交 (10 分钟)

**操作**:
```bash
git add src/components/sidebar/ProjectManager.vue
git add src/components/ConversationList.vue
git add tests/unit/components/sidebar/ProjectManager.spec.ts
git commit -m "refactor(TODO 2): extract ProjectManager component

- Create src/components/sidebar/ProjectManager.vue
- Props: projects, modelValue (projectFilter), collapsed
- Emits: update:modelValue, project-created, project-renamed, project-deleted
- Move project management logic (106-111, 738-756, 988-1021 lines)
- Integrate ProjectManager into ConversationList.vue
- Add unit tests with >85% coverage
- Reduce ConversationList.vue by ~155 lines

Risk: MEDIUM - handles projectFilter bidirectional binding via v-model
Note: projectFilter sync logic (895-917) kept in parent, will refactor in TODO 5"
```

**验证**:
- [ ] Commit message 符合规范
- [ ] 所有测试通过
- [ ] TypeScript 编译无错误

---

## ⚠️ 风险管理

### 风险 1: projectFilter 双向同步
- **影响**: 可能导致状态不一致
- **缓解**: 本 TODO 中暂不重构 watch 逻辑，仅通过 v-model 传递
- **后续**: TODO 5 将完全重构此逻辑

### 风险 2: projectStore 直接调用
- **影响**: 组件耦合度高
- **缓解**: 所有 store 操作通过 emit 通知父组件处理
- **验证**: 子组件中不应出现 `projectStore` 导入

### 风险 3: 模板复制遗漏
- **影响**: 功能缺失或样式错误
- **缓解**: 逐行对比原模板，确保完整性
- **验证**: 手动测试所有交互功能

---

## 📊 成功标准

- ✅ ProjectManager.vue 创建成功，~180 行
- ✅ ConversationList.vue 减少 ~155 行
- ✅ 所有项目管理功能正常 (创建/编辑/删除/选择)
- ✅ 单元测试覆盖率 > 85%
- ✅ TypeScript 编译无错误
- ✅ 手动测试清单全部通过
- ✅ 与原功能 100% 一致

---

## 📚 参考资料

- 原代码位置: `ConversationList.vue`
  - 状态: 106-111 行
  - Computed: 738-756 行
  - Watch: 895-917 行
  - 方法: 988-1021 行
  - 模板: 1022-1094 行

- 相关类型:
  - `ProjectRecord` (`types/store.ts`)
  - `ProjectStore` (`stores/projectStore.ts`)

- 相关文档:
  - `REFACTOR_TODO_OVERVIEW.md` - 总体规划
  - `CONVERSATIONLIST_REFACTOR_CHECKLIST.md` - 重构清单

---

**维护者**: GitHub Copilot + 高级前端重构专家  
**最后更新**: 2025-11-29
