# TODO 重构任务分解 - 总览与优先级

> **创建时间**: 2025-11-29  
> **项目**: ConversationList.vue 重构  
> **总预计时间**: 66 小时 (约 8.5 工作日)

---

## 📊 TODO 列表与状态

| ID | 任务 | 风险 | 时间 | 状态 | 详细计划 |
|----|------|------|------|------|----------|
| 1.1 | useFormatters | 🟢 低 | 1h | ✅ 完成 | - |
| 1.2 | useMenuPositioning | 🟢 低 | 1h | ✅ 完成 | - |
| 1.3 | useConversationSearch | 🟢 低 | 4h | 📋 已规划 | `TODO_1.3_USECONVERSATIONSEARCH_PLAN.md` |
| 2 | ProjectManager 子组件 | 🟡 中 | 6h | 📋 待规划 | `TODO_2_PROJECTMANAGER_PLAN.md` |
| 3 | 菜单系统 Composables | 🔴 高 | 12h | 📋 待规划 | `TODO_3_MENU_SYSTEM_PLAN.md` |
| 4 | ConversationListItems | 🟡 中 | 8h | 📋 待规划 | `TODO_4_CONVERSATIONLISTITEMS_PLAN.md` |
| 5 | projectFilter 同步 | 🔴 高 | 6h | 📋 待规划 | `TODO_5_PROJECTFILTER_SYNC_PLAN.md` |
| 6 | changeConversationProject | 🔴 高 | 6h | 📋 待规划 | `TODO_6_CROSS_DOMAIN_METHOD_PLAN.md` |
| 7 | ConversationSidebar 父组件 | 🔴 高 | 8h | 📋 待规划 | `TODO_7_CONVERSATIONSIDEBAR_PLAN.md` |
| 8 | 性能优化 | 🟡 中 | 6h | 📋 待规划 | `TODO_8_PERFORMANCE_PLAN.md` |
| 9 | 单元测试 | 🟢 低 | 8h | 📋 待规划 | `TODO_9_TESTING_PLAN.md` |
| 10 | 迁移与清理 | 🟢 低 | 2h | 📋 待规划 | `TODO_10_MIGRATION_PLAN.md` |

---

## 🎯 执行策略

### Phase 1: 基础设施层 (已完成 50%)
**目标**: 提取纯函数和工具 composables

- ✅ **TODO 1.1**: useFormatters (1h) - 完成
- ✅ **TODO 1.2**: useMenuPositioning (1h) - 完成
- 📋 **TODO 1.3**: useConversationSearch (4h) - **下一步执行**

**完成标准**: 所有工具函数独立，ConversationList.vue 减少 ~230 行

---

### Phase 2: 中等风险组件拆分 (预计 14h)
**目标**: 拆分业务逻辑相对独立的子组件

#### 执行顺序与理由

1. **TODO 2: ProjectManager** (6h, 🟡 中风险)
   - **优先原因**: 
     - 项目管理逻辑相对独立
     - 不涉及菜单系统复杂交互
     - 为 TODO 5 projectFilter 重构铺路
   - **依赖**: 无
   - **产出**: `src/components/sidebar/ProjectManager.vue`

2. **TODO 4: ConversationListItems** (8h, 🟡 中风险)
   - **优先原因**:
     - 对话列表渲染逻辑清晰
     - 编辑/删除状态可以内部管理
     - 为 TODO 7 父组件集成做准备
   - **依赖**: TODO 1.3 (需要搜索状态)
   - **产出**: `src/components/sidebar/ConversationListItems.vue`

**Phase 2 完成标准**: ConversationList.vue 减少 ~550 行，两个子组件独立可测试

---

### Phase 3: 高风险核心重构 (预计 32h)
**目标**: 处理复杂状态同步和跨域操作

#### 执行顺序与理由

1. **TODO 3: 菜单系统 Composables** (12h, 🔴 高风险)
   - **优先原因**:
     - 菜单系统是最复杂的跨域逻辑
     - 必须先解耦才能继续其他高风险项
     - 涉及定时器、ResizeObserver 清理
   - **依赖**: 无
   - **产出**: 
     - `src/composables/useContextMenu.ts`
     - `src/composables/useProjectAssignmentMenu.ts`
   - **关键挑战**: 主菜单和子菜单级联关闭

2. **TODO 5: projectFilter 双向同步** (6h, 🔴 高风险)
   - **优先原因**:
     - 必须在创建父组件前解决
     - 影响 ProjectManager 和 ConversationSidebar 的接口设计
   - **依赖**: TODO 2 (ProjectManager 必须先存在)
   - **产出**: 单向数据流设计
   - **关键挑战**: 移除 projectSyncReady 标志位，防止循环触发

3. **TODO 6: changeConversationProject 跨域方法** (6h, 🔴 高风险)
   - **优先原因**:
     - 依赖菜单系统重构完成
     - 需要 provide/inject 机制
   - **依赖**: TODO 3 (菜单系统必须先解耦)
   - **产出**: 跨域操作通过 callback 实现
   - **关键挑战**: 确保菜单关闭顺序和 DOM 清理

4. **TODO 7: ConversationSidebar 父组件** (8h, 🔴 高风险)
   - **优先原因**:
     - 集成所有子组件和 composables
     - 所有高风险逻辑的汇聚点
   - **依赖**: TODO 2, 3, 4, 5, 6 (所有前置任务必须完成)
   - **产出**: `src/components/sidebar/ConversationSidebar.vue`
   - **关键挑战**: 
     - 管理 projectFilter 同步
     - 提供菜单系统
     - 计算 filteredConversations
     - provide/inject 设计

**Phase 3 完成标准**: 
- ConversationList.vue 可以完全替换为 ConversationSidebar.vue
- 所有高风险逻辑有详细注释和安全保护
- 状态同步逻辑清晰可追踪

---

### Phase 4: 优化与质量保证 (预计 16h)
**目标**: 性能优化和完整测试覆盖

1. **TODO 8: 性能优化** (6h, 🟡 中风险)
   - **执行时机**: Phase 3 完成后
   - **理由**: 必须在新架构稳定后才能优化
   - **产出**:
     - WeakMap 缓存
     - debounce 实现
     - 虚拟滚动 (可选)
   - **性能目标**: 1000 条对话筛选 < 50ms

2. **TODO 9: 单元测试** (8h, 🟢 低风险)
   - **执行时机**: 每个 composable 和组件完成后立即编写
   - **理由**: 持续集成，避免最后集中测试
   - **覆盖率目标**: > 85%
   - **重点**:
     - useMenuPositioning: 边界条件
     - useConversationSearch: 搜索算法
     - 菜单系统: 级联关闭、定时器清理

3. **TODO 10: 迁移与清理** (2h, 🟢 低风险)
   - **执行时机**: 所有测试通过后
   - **理由**: 最后的安全检查和清理
   - **产出**:
     - ConversationList.legacy.vue (备份)
     - 更新所有引用
     - E2E 验收测试

**Phase 4 完成标准**:
- 性能指标达标
- 测试覆盖率 > 85%
- 无回归问题
- 文档更新完成

---

## 🔄 依赖关系图

```
Phase 1: 基础设施
  ├─ TODO 1.1 ✅
  ├─ TODO 1.2 ✅
  └─ TODO 1.3 (下一步)

Phase 2: 组件拆分
  ├─ TODO 2 (依赖: 无)
  │   └─ ProjectManager.vue
  └─ TODO 4 (依赖: TODO 1.3)
      └─ ConversationListItems.vue

Phase 3: 核心重构
  ├─ TODO 3 (依赖: 无)
  │   └─ useContextMenu, useProjectAssignmentMenu
  ├─ TODO 5 (依赖: TODO 2)
  │   └─ projectFilter 单向数据流
  ├─ TODO 6 (依赖: TODO 3)
  │   └─ changeConversationProject 重构
  └─ TODO 7 (依赖: TODO 2, 3, 4, 5, 6)
      └─ ConversationSidebar.vue

Phase 4: 质量保证
  ├─ TODO 8 (依赖: TODO 7)
  │   └─ 性能优化
  ├─ TODO 9 (依赖: 各自对应的 TODO)
  │   └─ 单元测试
  └─ TODO 10 (依赖: TODO 9)
      └─ 迁移与清理
```

---

## ⚠️ 关键风险点

### 风险 1: projectFilter 双向同步 (TODO 5)
- **影响**: 可能导致无限循环
- **缓解措施**:
  - 使用 flush: 'post'
  - 添加 100ms debounce
  - 详细的状态变化日志
  - 快速切换测试

### 风险 2: 菜单级联关闭 (TODO 3, 6)
- **影响**: Teleport DOM 残留，内存泄漏
- **缓解措施**:
  - 严格的关闭顺序
  - nextTick() 保护
  - ResizeObserver 清理
  - Chrome DevTools Memory Profiler 验证

### 风险 3: filteredConversations 性能 (TODO 8)
- **影响**: 大量对话时 UI 卡顿
- **缓解措施**:
  - performance.mark 监控
  - WeakMap 缓存
  - 虚拟滚动
  - 分批渲染

---

## 🎯 每日执行建议

### Week 1: 基础设施 + 组件拆分
- **Day 1**: TODO 1.3 (4h) - useConversationSearch
- **Day 2**: TODO 2 (6h) - ProjectManager
- **Day 3**: TODO 4 (8h) - ConversationListItems

### Week 2: 核心重构 (高风险周)
- **Day 4-5**: TODO 3 (12h) - 菜单系统 Composables
- **Day 6**: TODO 5 (6h) - projectFilter 同步
- **Day 7**: TODO 6 (6h) - changeConversationProject

### Week 3: 集成与优化
- **Day 8**: TODO 7 (8h) - ConversationSidebar 父组件
- **Day 9**: TODO 8 (6h) - 性能优化
- **Day 10**: TODO 9 + 10 (10h) - 测试与迁移

---

## 📝 提交规范

每个 TODO 完成后必须提交，commit message 格式：

```
refactor(TODO X.Y): <简短描述>

- <详细变更 1>
- <详细变更 2>
- Risk: <LOW|MEDIUM|HIGH> - <风险说明>
```

示例：
```
refactor(TODO 2): extract ProjectManager component

- Create src/components/sidebar/ProjectManager.vue
- Props: projects, projectFilter, activeProjectId
- Emits: update:projectFilter, project-created, project-renamed, project-deleted
- Remove project management logic from ConversationList.vue
- Risk: MEDIUM - handles projectFilter bidirectional binding
```

---

## 🚀 下一步行动

**立即执行**: TODO 1.3 - useConversationSearch

**准备工作**:
1. 阅读 `TODO_1.3_USECONVERSATIONSEARCH_PLAN.md`
2. 理解代码依赖关系
3. 按照 Step 1-8 严格执行
4. 每个 Step 完成后检查清单

**预期结果**:
- 4 小时内完成
- ConversationList.vue 减少 ~100 行
- useConversationSearch.ts 新增 ~150 行
- 所有搜索功能保持一致

---

**维护者**: GitHub Copilot + 高级前端重构专家  
**最后更新**: 2025-11-29
