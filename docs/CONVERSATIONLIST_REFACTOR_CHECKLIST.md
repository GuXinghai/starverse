# ConversationList.vue 重构检查清单

> **生成时间**: 2025-11-29  
> **组件规模**: 1930+ 行  
> **预计工期**: 38 小时 (约 1 周)  
> **风险等级**: 🔴 高 - 涉及关键业务逻辑和复杂状态同步

---

## 📋 重构前准备

- [ ] **备份当前代码**: 创建 Git 分支 `refactor/conversation-list-split`
- [ ] **运行现有测试**: 确认所有测试通过 (`npm run test`)
- [ ] **E2E 测试录制**: 录制关键用户操作流程作为回归测试基准
- [ ] **性能基准测试**: 记录 `filteredConversations` 计算时间和内存使用
- [ ] **依赖检查**: 确认 `@vueuse/core`、`@floating-ui/vue` 等库已安装

---

## ✅ TODO 1: 创建基础设施 Composables (低风险)

**预计时间**: 4 小时  
**风险等级**: 🟢 低

### 步骤清单

#### 1.1 创建 `composables/useFormatters.ts`
- [ ] 创建文件 `src/composables/useFormatters.ts`
- [ ] 迁移函数: `getStatusLabel()`, `getStatusBadgeClass()`, `getStatusBadgeClassActive()`
- [ ] 添加函数: `formatModelName()` (从 ConversationList.vue 第 370 行)
- [ ] 添加 TypeScript 类型定义
- [ ] 编写单元测试 `tests/unit/composables/useFormatters.spec.ts`
  - [ ] 测试所有状态类型的标签返回
  - [ ] 测试所有状态类型的样式类返回
  - [ ] 测试模型名称格式化边界条件

#### 1.2 创建 `composables/useMenuPositioning.ts`
- [ ] 创建文件 `src/composables/useMenuPositioning.ts`
- [ ] 迁移 `computeMenuPosition()` 函数 (377-435 行)
- [ ] 迁移 `Placement` 类型定义
- [ ] 添加 JSDoc 文档注释
- [ ] 考虑使用 `@floating-ui/vue` 替代手动实现
- [ ] 编写单元测试 `tests/unit/composables/useMenuPositioning.spec.ts`
  - [ ] 测试边界碰撞检测 (靠近窗口边缘)
  - [ ] 测试所有 8 个方向的位置计算
  - [ ] 测试 transform-origin 计算正确性

#### 1.3 创建 `composables/useConversationSearch.ts`
- [ ] 创建文件 `src/composables/useConversationSearch.ts`
- [ ] 迁移搜索状态变量 (195-213 行):
  - `searchQuery`, `searchInTitle`, `searchInContent`
  - `contentSearchHits`, `contentSearchLoading`, `contentSearchMessage`
- [ ] 迁移 `conversationMatchesContent()` 函数 (827-863 行)
- [ ] 迁移 `buildSearchScopes()` 函数 (865-873 行)
- [ ] 迁移全文搜索 watch 逻辑 (883-931 行)
- [ ] 优化: 添加 300ms debounce (使用 `watchDebounced`)
- [ ] 优化: 使用 `AbortController` 替代 `contentSearchRequestId`
- [ ] 编写单元测试 `tests/unit/composables/useConversationSearch.spec.ts`
  - [ ] 测试搜索词过滤逻辑
  - [ ] 测试全文搜索竞态条件处理
  - [ ] 测试 debounce 行为

#### 1.4 在 ConversationList.vue 中集成
- [ ] 导入新创建的 composables
- [ ] 替换原有函数调用
- [ ] 删除已迁移的代码
- [ ] 运行测试确认无回归

---

## ✅ TODO 2: 创建 ProjectManager 子组件 (中风险)

**预计时间**: 6 小时  
**风险等级**: 🟡 中

### 步骤清单

#### 2.1 创建组件文件
- [ ] 创建 `src/components/sidebar/ProjectManager.vue`
- [ ] 定义 Props 接口:
  ```typescript
  interface Props {
    projects: ProjectRecord[]
    projectFilter: string
    activeProjectId: string | null
    conversationCountByProject: Record<string, number>
  }
  ```
- [ ] 定义 Emits 接口:
  ```typescript
  interface Emits {
    'update:projectFilter': [value: string]
    'project-created': [project: ProjectRecord]
    'project-renamed': [projectId: string, newName: string]
    'project-deleted': [projectId: string]
  }
  ```

#### 2.2 迁移模板代码
- [ ] 从 ConversationList.vue 1022-1094 行提取项目管理 UI
- [ ] 包含: 新建项目按钮、项目列表、编辑/删除 UI
- [ ] 确认所有 v-model 和事件绑定正确

#### 2.3 迁移脚本逻辑
- [ ] 迁移项目管理状态 (223-228 行):
  - `isCreatingProject`, `newProjectName`
  - `projectEditingId`, `projectEditingName`, `projectDeletingId`
- [ ] 迁移方法 (933-1047 行):
  - `handleCreateProject()`, `toggleProjectCreation()`
  - `startProjectEdit()`, `confirmProjectRename()`, `cancelProjectEdit()`
  - `requestProjectDelete()`, `confirmProjectDelete()`, `cancelProjectDelete()`
  - `selectProject()`, `isProjectSelected()`
- [ ] 迁移计算属性:
  - `orderedProjects`, `projectManagerEntries`

#### 2.4 重构为单向数据流
- [ ] 移除直接调用 `projectStore.createProject()` 等方法
- [ ] 改为通过 `emit` 通知父组件
- [ ] 父组件负责调用 store 方法
- [ ] 确认 `projectFilter` 通过 `v-model` 双向绑定

#### 2.5 测试
- [ ] 编写组件测试 `tests/unit/components/ProjectManager.spec.ts`
  - [ ] 测试项目创建流程
  - [ ] 测试项目重命名和删除
  - [ ] 测试项目选择和 emit 事件
- [ ] 在 Storybook 中创建 Story
- [ ] 手动测试所有交互功能

---

## 🔴 TODO 3: 创建菜单系统 Composables (高风险 ⚠️)

**预计时间**: 12 小时  
**风险等级**: 🔴 高

### 步骤清单

#### 3.1 设计菜单状态机
- [ ] 定义菜单状态枚举:
  ```typescript
  enum MenuState {
    Closed = 'closed',
    MainMenuOpen = 'main-open',
    SubMenuOpen = 'sub-open'
  }
  ```
- [ ] 设计状态转换规则和事件

#### 3.2 创建 `composables/useContextMenu.ts`
- [ ] 创建文件 `src/composables/useContextMenu.ts`
- [ ] 迁移主菜单状态 (258-273 行):
  - `hoverMenuId`, `contextMenuRef`, `activeAnchorEl`
  - `lastKnownAnchorRect`, `transformOrigin`, `contextMenuCoords`
- [ ] 迁移主菜单方法:
  - `openContextMenu()`, `closeContextMenu()`
  - `scheduleOpenMenu()`, `scheduleCloseMenu()`, `cancelPendingMenuClose()`
  - `updateContextMenuPosition()`, `setContextMenuRef()`
- [ ] 迁移定时器和 ResizeObserver 管理
- [ ] 实现 `onScopeDispose` 清理逻辑

#### 3.3 创建 `composables/useProjectAssignmentMenu.ts`
- [ ] 创建文件 `src/composables/useProjectAssignmentMenu.ts`
- [ ] 迁移子菜单状态 (244-249 行):
  - `hoverProjectMenuId`, `projectMenuRef`, `projectMenuAnchorEl`
  - `projectMenuTransformOrigin`, `projectMenuCoords`
- [ ] 迁移子菜单方法:
  - `openProjectMenu()`, `closeProjectMenu()`
  - `cancelPendingProjectMenuClose()`, `setProjectMenuRef()`
  - `updateProjectMenuPosition()`

#### 3.4 实现级联关闭逻辑
- [ ] **关键**: 严格执行关闭顺序:
  1. `hoverProjectMenuId.value = null` (关闭子菜单)
  2. `await nextTick()` (等待 Teleport 卸载)
  3. `projectMenuAnchorEl.value = null` (清理子菜单锚点)
  4. `hoverMenuId.value = null` (关闭主菜单)
  5. `activeAnchorEl.value = null` (清理主菜单锚点)
- [ ] 添加日志记录关闭步骤，便于调试
- [ ] 处理边界情况 (如快速打开/关闭)

#### 3.5 测试
- [ ] 编写单元测试 `tests/unit/composables/useContextMenu.spec.ts`
  - [ ] 测试菜单打开/关闭
  - [ ] 测试定时器延迟和取消
  - [ ] 测试全局点击检测
  - [ ] 测试 ResizeObserver 清理
- [ ] 编写集成测试:
  - [ ] 测试主菜单和子菜单级联关闭
  - [ ] 快速打开/关闭菜单 20 次，检查内存泄漏
  - [ ] 打开子菜单后点击外部，验证两个菜单都关闭
- [ ] Chrome DevTools Memory Profiler 检查内存泄漏

---

## ✅ TODO 4: 创建 ConversationListItems 子组件 (中风险)

**预计时间**: 8 小时  
**风险等级**: 🟡 中

### 步骤清单

#### 4.1 创建组件文件
- [ ] 创建 `src/components/sidebar/ConversationListItems.vue`
- [ ] 定义 Props 接口:
  ```typescript
  interface Props {
    filteredConversations: ConversationRecord[]
    currentConversationId: string | null
    projectFilter: string
    isGenerating: (conv: ConversationRecord) => boolean
  }
  ```
- [ ] 定义 Emits 接口:
  ```typescript
  interface Emits {
    'conversation-selected': [conversationId: string]
    'conversation-renamed': [conversationId: string, newTitle: string]
    'conversation-deleted': [conversationId: string]
    'open-context-menu': [conversationId: string, anchorEl: HTMLElement]
  }
  ```

#### 4.2 迁移模板代码
- [ ] 从 ConversationList.vue 1099-1583 行提取对话列表渲染逻辑
- [ ] 包含: 正常显示模式、编辑模式、删除确认模式
- [ ] 确认状态徽章、生成状态指示器正确显示

#### 4.3 迁移脚本逻辑
- [ ] 迁移编辑/删除状态 (184-189 行):
  - `editingId`, `editingTitle`, `deletingId`
- [ ] 迁移方法:
  - `startEdit()`, `saveEdit()`, `cancelEdit()`
  - `startDelete()`, `confirmDelete()`, `cancelDelete()`
  - `handleRename()`, `handleDelete()`
- [ ] 使用 inject 获取 `projectStore` (用于 `getProjectLabel`)
- [ ] 使用 inject 获取菜单回调 (`openContextMenu`)

#### 4.4 测试
- [ ] 编写组件测试 `tests/unit/components/ConversationListItems.spec.ts`
  - [ ] 测试对话点击选择
  - [ ] 测试编辑模式切换和保存
  - [ ] 测试删除确认流程
  - [ ] 测试空状态显示
- [ ] Storybook Story 展示不同状态

---

## 🔴 TODO 5: 重构 projectFilter 双向同步逻辑 (高风险 ⚠️)

**预计时间**: 6 小时  
**风险等级**: 🔴 高

### 步骤清单

#### 5.1 分析现有逻辑
- [ ] 梳理 `projectFilter` 与 `projectStore.activeProjectId` 的同步路径
- [ ] 识别所有触发同步的位置
- [ ] 确认 `projectSyncReady` 标志位的使用场景

#### 5.2 设计新的单向数据流
- [ ] 确定数据源: `projectStore.activeProjectId` 为 Source of Truth
- [ ] 设计数据流:
  ```
  projectStore.activeProjectId (Store)
    ↓ watch (父组件)
  projectFilter (父组件 ref)
    ↓ props
  ProjectManager :projectFilter (子组件只读)
    ↓ emit('update:projectFilter')
  父组件调用 projectStore.setActiveProject()
  ```

#### 5.3 实现新逻辑
- [ ] 在 ConversationSidebar 父组件中:
  - [ ] 创建 `projectFilter` ref
  - [ ] watch `projectStore.activeProjectId`，更新 `projectFilter`
  - [ ] 监听 ProjectManager 的 `update:projectFilter` 事件
  - [ ] 在事件处理中调用 `projectStore.setActiveProject()`
- [ ] 移除 `projectSyncReady` 全局标志位
- [ ] 使用 `flush: 'post'` 选项避免同步触发
- [ ] 添加 100ms debounce 保护

#### 5.4 测试
- [ ] 编写集成测试:
  - [ ] 快速点击切换项目 10 次，验证状态一致
  - [ ] 刷新浏览器，验证项目筛选器恢复
  - [ ] 删除当前选中项目，验证自动切换到 'all'
  - [ ] 在项目列表和下拉框中同时切换，验证同步
- [ ] 使用 Vue DevTools 监控状态变化

---

## 🔴 TODO 6: 重构 changeConversationProject 跨域方法 (高风险 ⚠️)

**预计时间**: 6 小时  
**风险等级**: 🔴 高

### 步骤清单

#### 6.1 分析跨域依赖
- [ ] 列出 `changeConversationProject` 访问的所有 store
- [ ] 列出方法调用的所有菜单操作
- [ ] 识别状态更新的依赖顺序

#### 6.2 设计回调机制
- [ ] 在 ConversationSidebar 父组件中实现 `assignProject` 方法
- [ ] 使用 `provide` 注入回调:
  ```typescript
  provide('assignProjectCallback', async (convId: string, projId: string | null) => {
    // 实现逻辑
  })
  ```
- [ ] 子菜单组件通过 `inject` 获取回调

#### 6.3 实现严格的更新顺序
- [ ] Step 1: `hoverProjectMenuId.value = null`
- [ ] Step 2: `await nextTick()`
- [ ] Step 3: `projectStore.assignConversationToProject(convId, projId)`
- [ ] Step 4: `await nextTick()`
- [ ] Step 5: `closeContextMenu()`
- [ ] 添加 try-catch 错误处理
- [ ] 添加 Loading 状态指示

#### 6.4 测试
- [ ] 编写集成测试:
  - [ ] 分配项目后验证菜单正确关闭
  - [ ] 验证对话卡片上的项目标签立即更新
  - [ ] 验证项目计数实时更新
  - [ ] 测试分配失败场景 (如项目被删除)
  - [ ] 验证无 Teleport DOM 残留

---

## 🔴 TODO 7: 创建 ConversationSidebar 父组件 (高风险 ⚠️)

**预计时间**: 8 小时  
**风险等级**: 🔴 高

### 步骤清单

#### 7.1 创建组件文件
- [ ] 创建 `src/components/sidebar/ConversationSidebar.vue`
- [ ] 定义组件结构:
  ```vue
  <template>
    <div class="conversation-sidebar">
      <ConversationSearchBar />
      <ProjectManager />
      <ConversationListItems />
    </div>
  </template>
  ```

#### 7.2 集成子组件
- [ ] 导入所有子组件
- [ ] 传递必要的 props
- [ ] 监听子组件 emits
- [ ] 实现事件处理逻辑

#### 7.3 管理跨域状态
- [ ] 实现 TODO 5 的 projectFilter 同步逻辑
- [ ] 实现 TODO 6 的 assignProject 回调
- [ ] 计算 `filteredConversations` 并传递给 ConversationListItems
- [ ] 通过 provide 共享 stores:
  ```typescript
  provide('conversationStore', conversationStore)
  provide('projectStore', projectStore)
  provide('modelStore', modelStore)
  ```

#### 7.4 集成菜单系统
- [ ] 调用 `useContextMenu()` composable
- [ ] 调用 `useProjectAssignmentMenu()` composable
- [ ] 通过 provide 共享菜单方法:
  ```typescript
  provide('openContextMenu', openContextMenu)
  provide('assignProjectCallback', assignProject)
  ```

#### 7.5 添加性能监控
- [ ] 在 `filteredConversations` computed 中添加:
  ```typescript
  performance.mark('filter-start')
  // ... 计算逻辑
  performance.mark('filter-end')
  performance.measure('filter-conversations', 'filter-start', 'filter-end')
  ```

#### 7.6 文档和类型
- [ ] 添加 JSDoc 注释说明职责
- [ ] 为所有 props/emits 添加 TypeScript 类型
- [ ] 添加示例代码和使用说明

#### 7.7 测试
- [ ] 编写集成测试 `tests/unit/components/ConversationSidebar.spec.ts`
  - [ ] 测试子组件渲染
  - [ ] 测试 provide/inject 机制
  - [ ] 测试事件冒泡和处理
- [ ] 编写 E2E 测试覆盖关键流程:
  - [ ] 创建对话 → 分配项目 → 切换筛选 → 搜索 → 删除
  - [ ] 创建项目 → 分配对话 → 重命名项目 → 删除项目

---

## ✅ TODO 8: 优化 filteredConversations 性能 (中风险)

**预计时间**: 6 小时  
**风险等级**: 🟡 中

### 步骤清单

#### 8.1 性能基准测试
- [ ] 创建测试用例: 生成 100/1000/5000 条对话
- [ ] 测量当前 `filteredConversations` 计算时间
- [ ] 使用 Chrome DevTools Performance 分析瓶颈

#### 8.2 实现优化策略
- [ ] 使用 WeakMap 缓存 `conversationMatchesContent` 结果:
  ```typescript
  const searchCache = new WeakMap<ConversationRecord, Map<string, boolean>>()
  ```
- [ ] 项目筛选使用 Set 替代多次 `!==` 比较
- [ ] 提前判断 branches 类型，避免每次检测
- [ ] 搜索匹配早期返回，减少不必要的树遍历

#### 8.3 考虑虚拟滚动
- [ ] 评估 `vue-virtual-scroller` 或 `@tanstack/vue-virtual`
- [ ] 如果对话数 > 500，引入虚拟滚动
- [ ] 调整 UI 以支持动态高度的虚拟列表

#### 8.4 添加分页或懒加载
- [ ] 实现 "显示更多" 按钮 (每次加载 100 条)
- [ ] 或实现无限滚动

#### 8.5 测试
- [ ] 验证优化后性能提升:
  - 100 条对话: < 10ms
  - 1000 条对话: < 50ms
  - 5000 条对话: < 200ms (with virtual scroll)
- [ ] 确认缓存正确性 (搜索词变化时缓存失效)

---

## ✅ TODO 9: 编写单元测试 (必需)

**预计时间**: 8 小时  
**风险等级**: 🟢 低

### 步骤清单

#### 9.1 Composables 测试
- [ ] `useFormatters.spec.ts` (已在 TODO 1 完成)
- [ ] `useMenuPositioning.spec.ts` (已在 TODO 1 完成)
- [ ] `useConversationSearch.spec.ts` (已在 TODO 1 完成)
- [ ] `useContextMenu.spec.ts` (已在 TODO 3 完成)
- [ ] `useProjectAssignmentMenu.spec.ts` (已在 TODO 3 完成)

#### 9.2 组件测试
- [ ] `ProjectManager.spec.ts` (已在 TODO 2 完成)
- [ ] `ConversationListItems.spec.ts` (已在 TODO 4 完成)
- [ ] `ConversationSidebar.spec.ts` (已在 TODO 7 完成)

#### 9.3 集成测试
- [ ] 菜单级联关闭测试:
  - [ ] 打开主菜单 → 打开子菜单 → 点击外部 → 验证两者都关闭
  - [ ] 快速打开/关闭菜单 → 验证定时器正确清理
- [ ] projectFilter 同步测试:
  - [ ] 在 store 中设置 activeProjectId → 验证 UI 更新
  - [ ] 在 UI 中选择项目 → 验证 store 更新
  - [ ] 快速切换项目 → 验证无状态错乱

#### 9.4 覆盖率检查
- [ ] 运行 `npm run test:coverage`
- [ ] 确认总体覆盖率 > 85%
- [ ] 重点区域 (菜单系统、状态同步) > 90%

---

## ✅ TODO 10: 迁移原组件并清理 (最终步骤)

**预计时间**: 2 小时  
**风险等级**: 🟢 低

### 步骤清单

#### 10.1 备份原组件
- [ ] 重命名 `ConversationList.vue` → `ConversationList.legacy.vue`
- [ ] 添加注释说明这是旧版本，仅用于紧急回滚
- [ ] Git commit: "chore: backup original ConversationList as .legacy"

#### 10.2 迁移新组件
- [ ] 重命名 `ConversationSidebar.vue` → `ConversationList.vue`
- [ ] 确保文件路径保持为 `src/components/ConversationList.vue`

#### 10.3 更新引用
- [ ] 在 `TabbedChatView.vue` 中更新 import (如果需要)
- [ ] 在其他引用处更新 import
- [ ] 全局搜索 `ConversationList` 确认无遗漏

#### 10.4 运行完整测试
- [ ] 单元测试: `npm run test`
- [ ] E2E 测试: 手动测试关键流程
- [ ] 性能测试: 验证优化效果
- [ ] 浏览器兼容性测试

#### 10.5 验收测试
- [ ] 对话创建、编辑、删除
- [ ] 项目创建、分配、重命名、删除
- [ ] 搜索功能 (标题搜索、全文搜索)
- [ ] 菜单交互 (主菜单、子菜单)
- [ ] 项目筛选和切换
- [ ] 刷新浏览器后状态恢复

#### 10.6 清理
- [ ] 2 周后 (如无问题) 删除 `ConversationList.legacy.vue`
- [ ] 删除旧的测试文件 (如有)
- [ ] 更新相关文档

---

## 🚨 回滚策略

如果重构过程中出现严重问题，按以下步骤回滚:

### 快速回滚 (5 分钟内)
1. 重命名 `ConversationList.vue` → `ConversationList.new.vue`
2. 重命名 `ConversationList.legacy.vue` → `ConversationList.vue`
3. 重启开发服务器
4. 验证功能正常

### 分支回滚
1. `git stash` 保存当前修改
2. `git checkout main` 切换到主分支
3. `git branch -D refactor/conversation-list-split` 删除重构分支
4. 从备份分支重新开始

---

## 📈 性能目标

| 指标 | 当前值 | 目标值 | 测量方法 |
|------|--------|--------|---------|
| `filteredConversations` 计算 (100 条) | 待测量 | < 10ms | performance.measure |
| `filteredConversations` 计算 (1000 条) | 待测量 | < 50ms | performance.measure |
| 菜单打开延迟 | 待测量 | < 16ms | Chrome DevTools |
| 内存使用 (1000 条对话) | 待测量 | < 50MB | Chrome Memory Profiler |
| 单元测试覆盖率 | 0% | > 85% | Vitest coverage |

---

## 📚 参考文档

- **分析报告**: AI 生成的《ConversationList.vue 深度分析报告》
- **架构审查**: `docs/ARCHITECTURE_REVIEW.md`
- **重构进度**: `REFACTOR_PROGRESS.md`
- **子菜单修复**: `docs/SUBMENU_TELEPORT_FIX.md`
- **Vue 组合式 API**: https://cn.vuejs.org/guide/reusability/composables.html
- **@floating-ui/vue**: https://floating-ui.com/docs/vue

---

## ✅ 重构完成标志

- [ ] 所有 10 个 TODO 已完成
- [ ] 单元测试覆盖率 > 85%
- [ ] E2E 测试通过
- [ ] 性能指标达标
- [ ] 代码审查通过
- [ ] 在 staging 环境运行 1 周无问题
- [ ] 删除 `.legacy` 文件
- [ ] 更新 `REFACTOR_PROGRESS.md`

---

**最后更新**: 2025-11-29  
**维护者**: GitHub Copilot + 高级前端重构专家
