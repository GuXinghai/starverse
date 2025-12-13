# 项目主页作为标签页功能增强

**状态**: 📋 待实现（Phase 4 增强功能）  
**优先级**: 中  
**类型**: UI/UX 优化  
**创建时间**: 2025-11-25

## 功能概述

将项目主页从"互斥显示"改为"特殊标签页"，提升用户体验和工作流灵活性。

## 当前实现的问题

### 现有逻辑
```typescript
// TabbedChatView.vue
const showProjectHome = computed(() => {
  const projectId = projectStore.activeProjectId
  return !activeTabId.value && projectId && projectId !== 'unassigned'
})
```

### 存在的问题
1. **互斥显示**：项目主页和对话标签只能显示其中一个
2. **信息丢失**：打开对话后无法查看项目概览
3. **导航困难**：需要关闭所有标签才能回到项目主页
4. **工作流打断**：频繁切换打断用户操作

## 目标设计

### 核心概念
- 项目主页是一个**特殊的虚拟标签页**
- 与普通对话标签共存于标签栏中
- 可以像普通标签一样打开、关闭、切换

### 标签 ID 规范
```typescript
// 普通对话标签
conversationId: string  // 例如: "8b516122-ee36-4cfb-bb62-6fff5b509fca"

// 项目主页标签（特殊）
projectHomeId: `__project__:${projectId}`  // 例如: "__project__:ai-research-001"
```

## 技术实现方案

### 1. ConversationStore 增强

**新增 Action**:
```typescript
/**
 * 打开项目主页作为标签
 * @param projectId - 项目 ID
 */
const openProjectHomeTab = (projectId: string): void => {
  const tabId = `__project__:${projectId}`
  
  // 如果已经打开，直接激活
  if (openTabIds.value.includes(tabId)) {
    activeTabId.value = tabId
    return
  }
  
  // 添加到标签列表
  openTabIds.value.push(tabId)
  activeTabId.value = tabId
}

/**
 * 检查是否为项目主页标签
 * @param tabId - 标签 ID
 */
const isProjectHomeTab = (tabId: string): boolean => {
  return tabId.startsWith('__project__:')
}

/**
 * 从标签 ID 提取项目 ID
 * @param tabId - 标签 ID
 */
const extractProjectId = (tabId: string): string | null => {
  if (!isProjectHomeTab(tabId)) return null
  return tabId.replace('__project__:', '')
}
```

### 2. ConversationList 集成

**修改项目点击逻辑**:
```typescript
const selectProject = (projectId: string) => {
  projectFilter.value = projectId
  
  // 如果是具体项目（非 'all' 和 'unassigned'），打开项目主页标签
  if (projectId !== 'all' && projectId !== 'unassigned') {
    conversationStore.openProjectHomeTab(projectId)
  }
}
```

### 3. TabbedChatView 渲染逻辑

**修改模板结构**:
```vue
<template>
  <div class="flex flex-col flex-1 overflow-hidden h-full">
    <!-- 模型选择器栏保持不变 -->
    <div class="bg-white border-b border-gray-200 px-4 py-2">
      <!-- ... -->
    </div>

    <!-- 标签页内容区 -->
    <div class="relative flex-1 overflow-hidden h-full">
      <!-- 项目主页标签 -->
      <template v-for="tabId in openTabIds" :key="tabId">
        <ProjectHome
          v-if="conversationStore.isProjectHomeTab(tabId)"
          v-show="tabId === activeTabId"
          :project-id="conversationStore.extractProjectId(tabId)"
          class="absolute inset-0"
        />
      </template>

      <!-- 对话标签 -->
      <ChatView
        v-for="conversationId in regularConversationTabs"
        :key="conversationId"
        :ref="el => setChildRef(conversationId, el)"
        :conversation-id="conversationId"
        v-show="conversationId === activeTabId"
        class="absolute inset-0"
      />
    </div>
  </div>
</template>

<script setup>
// 分离普通对话标签和项目主页标签
const regularConversationTabs = computed(() => {
  return openTabIds.value.filter(id => !conversationStore.isProjectHomeTab(id))
})
</script>
```

### 4. ChatTabs 组件增强

**显示项目主页标签**:
```vue
<template>
  <div class="chat-tabs">
    <div
      v-for="tabId in tabsList"
      :key="tabId"
      :class="['tab', { active: tabId === activeTabId }]"
      @click="switchTab(tabId)"
    >
      <!-- 项目主页标签 -->
      <template v-if="isProjectHomeTab(tabId)">
        <FolderIcon class="w-4 h-4" />
        <span>{{ getProjectName(extractProjectId(tabId)) }}</span>
      </template>
      
      <!-- 普通对话标签 -->
      <template v-else>
        <ChatIcon class="w-4 h-4" />
        <span>{{ getConversationTitle(tabId) }}</span>
      </template>
      
      <button @click.stop="closeTab(tabId)" class="close-btn">×</button>
    </div>
  </div>
</template>
```

### 5. ProjectHome 组件适配

**接收 projectId prop**:
```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useProjectStore } from '../stores/project'

const props = defineProps<{
  projectId?: string  // 新增：从外部传入项目 ID
}>()

const projectStore = useProjectStore()

// 优先使用 prop，否则使用 store 的 activeProjectId
const currentProjectId = computed(() => {
  return props.projectId || projectStore.activeProjectId
})

const currentProject = computed(() => {
  return projectStore.getProjectById(currentProjectId.value)
})
</script>
```

## 实现步骤

### Phase 1: 基础架构 (1-2小时)
- [ ] 修改 ConversationStore，添加项目主页标签支持
- [ ] 实现标签 ID 识别和转换函数
- [ ] 更新类型定义

### Phase 2: 核心功能 (2-3小时)
- [ ] 修改 TabbedChatView 支持混合标签渲染
- [ ] 更新 ConversationList 的项目点击逻辑
- [ ] ProjectHome 组件适配 prop 传入

### Phase 3: UI 完善 (1-2小时)
- [ ] ChatTabs 显示项目主页标签
- [ ] 添加项目主页图标
- [ ] 标签标题显示优化

### Phase 4: 持久化 (1小时)
- [ ] 保存打开的项目主页标签状态
- [ ] 应用启动时恢复标签状态

### Phase 5: 测试和优化 (1-2小时)
- [ ] 功能测试
- [ ] 边界情况处理
- [ ] 性能优化

**预计总时间**: 6-10 小时

## 用户体验改进

### 优势
✅ **上下文保持**：打开对话后仍可查看项目信息  
✅ **灵活工作流**：项目主页和对话可并存  
✅ **减少操作**：不需要关闭标签查看项目  
✅ **符合直觉**：类似浏览器标签页的使用习惯  

### 使用场景
1. **项目概览**：随时查看项目统计和进度
2. **多任务切换**：在项目主页和多个对话间快速切换
3. **项目组织**：边查看项目信息边管理对话

## 技术风险和注意事项

### 风险
1. **标签管理复杂度**：虚拟标签和实体标签混合管理
2. **状态同步**：项目删除时需要关闭对应的主页标签
3. **性能影响**：ProjectHome 组件可能较重，多个实例需要优化

### 缓解措施
- 使用明确的命名规范区分标签类型
- 实现完善的错误处理和边界检查
- ProjectHome 组件实现懒加载和缓存

## 兼容性

### 向后兼容
- ✅ 不破坏现有对话标签功能
- ✅ 项目筛选逻辑保持不变
- ✅ 数据结构无变化

### 迁移策略
- 新功能为增量添加，无需数据迁移
- 旧代码路径保持可用
- 可通过特性开关控制启用

## 替代方案

### 方案 A: 侧边栏卡片
- 在侧边栏显示项目统计卡片
- 优点：实现简单，不占用主工作区
- 缺点：空间受限，信息展示不足

### 方案 B: 浮动面板
- 项目信息作为可拖动的浮动窗口
- 优点：灵活度高
- 缺点：UI 复杂，可能遮挡内容

### 方案 C: 底部栏
- 在底部显示项目信息栏
- 优点：不影响主工作区
- 缺点：垂直空间浪费，信息密度低

**选择标签页方案的原因**：
- 符合用户心智模型（类似浏览器）
- 与现有标签系统一致
- 灵活性和可扩展性最好

## 参考实现

类似功能的应用：
- **VS Code**: Welcome 页面作为特殊标签
- **Notion**: 侧边栏页面可作为标签打开
- **Figma**: 项目首页和文件并存

## 后续增强

完成基础实现后，可以考虑：
1. **标签分组**：项目主页标签和对话标签分组显示
2. **标签图标**：不同类型标签显示不同图标
3. **快捷操作**：项目主页标签右键菜单
4. **标签拖拽**：调整标签顺序

---

**文档版本**: 1.0  
**最后更新**: 2025-11-25  
**负责人**: AI Assistant  
**状态**: 待评审和实现
