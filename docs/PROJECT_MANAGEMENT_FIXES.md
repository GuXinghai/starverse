# 项目管理系统问题修复文档

## 📅 修复日期
2025年1月8日

## 🔍 发现的问题及解决方案

### ✅ 问题 1: 项目名称重复检查缺失

**问题描述**  
允许创建同名项目，导致用户混淆，无法区分不同项目。

**影响范围**  
- `chatStore.js` - `createProject()`
- `chatStore.js` - `renameProject()`

**解决方案**  
```javascript
// 创建项目时检查重复
const isDuplicate = projects.value.some(p => p.name === trimmed)
if (isDuplicate) {
  console.warn('⚠️ createProject: 项目名称已存在', trimmed)
  return null
}

// 重命名时检查重复（排除自己）
const isDuplicate = projects.value.some(p => p.id !== projectId && p.name === trimmed)
if (isDuplicate) {
  console.warn('⚠️ renameProject: 项目名称已存在', trimmed)
  return false
}
```

**用户反馈**  
- `ConversationList.vue` - `handleCreateProject()` 和 `confirmProjectRename()` 添加 alert 提示

---

### ✅ 问题 2: 删除项目时未更新对话的 `updatedAt`

**问题描述**  
删除项目时，关联对话的 `projectId` 被清除，但 `updatedAt` 没有更新，导致对话列表排序不准确。

**影响范围**  
- `chatStore.js` - `deleteProject()`

**解决方案**  
```javascript
const now = Date.now()
for (const conversation of conversations.value) {
  if (conversation.projectId === projectId) {
    conversation.projectId = null
    conversation.updatedAt = now  // ✅ 更新时间戳
  }
}
```

---

### ✅ 问题 3: 删除项目后筛选器状态不当

**问题描述**  
删除当前激活的项目后，筛选器切换到 "unassigned"，用户看到空列表（如果没有未分配对话）。

**影响范围**  
- `chatStore.js` - `deleteProject()`
- `ConversationList.vue` - `confirmProjectDelete()`

**解决方案**  
```javascript
// chatStore.js
if (activeProjectId.value === projectId) {
  activeProjectId.value = null  // ✅ 切换到 "all"，而非 "unassigned"
}

// ConversationList.vue
if (success && projectFilter.value === projectId) {
  projectFilter.value = 'all'  // ✅ 切换到 "all"
}
```

---

### ✅ 问题 4: 项目列表排序不稳定

**问题描述**  
当多个项目的 `updatedAt` 相同时（如批量创建），排序结果不稳定，导致 UI 闪烁。

**影响范围**  
- `ConversationList.vue` - `orderedProjects` computed

**解决方案**  
```javascript
return [...(chatStore.projects as ProjectRecord[])].sort((a, b) => {
  const aTime = a.updatedAt || a.createdAt || 0
  const bTime = b.updatedAt || b.createdAt || 0
  // ✅ 时间相同时，按 ID 排序确保稳定性
  if (bTime === aTime) {
    return a.id.localeCompare(b.id)
  }
  return bTime - aTime
})
```

---

### ✅ 问题 5: 项目数据加载时缺少完整性验证

**问题描述**  
加载项目数据时，只检查了 `name` 字段，但 `id` 也可能缺失，导致后续操作失败。

**影响范围**  
- `chatStore.js` - `loadConversations()`

**解决方案**  
```javascript
.filter(project => {
  // ✅ 完整性验证：必须有 id 和 name
  if (!project || typeof project.id !== 'string' || typeof project.name !== 'string') {
    console.warn('⚠️ 跳过无效项目数据:', project)
    return false
  }
  return true
})
```

---

### ✅ 问题 6: 对话关联的项目被删除后数据不一致

**问题描述**  
加载时没有清理指向已删除项目的 `projectId`，导致对话显示"未知项目"。

**影响范围**  
- `chatStore.js` - `loadConversations()`

**解决方案**  
```javascript
// ✅ 构建有效项目 ID 集合
const validProjectIds = new Set(projects.value.map(p => p.id))

conversations.value = savedConversations.map(conv => {
  // ✅ 清理指向已删除项目的 projectId
  let projectId = conv.projectId ?? null
  if (projectId && !validProjectIds.has(projectId)) {
    console.warn('⚠️ 对话关联的项目已删除，清理 projectId:', conv.id, projectId)
    projectId = null
  }
  
  return {
    ...conv,
    projectId,  // 使用清理后的值
    // ...
  }
})
```

---

### ✅ 问题 7: 新建对话时项目分配逻辑混乱

**问题描述**  
在项目筛选视图中新建对话时，项目分配逻辑不清晰。

**影响范围**  
- `ConversationList.vue` - `createConversation()`

**解决方案**  
```javascript
const createConversation = () => {
  const newId = chatStore.createNewConversation()
  // ✅ 改进：根据当前筛选视图智能分配项目
  if (projectFilter.value !== 'all' && projectFilter.value !== 'unassigned') {
    // 在指定项目视图中创建时，自动分配到该项目
    const success = chatStore.assignConversationToProject(newId, projectFilter.value)
    if (!success) {
      console.warn('⚠️ 自动分配项目失败，项目可能已被删除')
      projectFilter.value = 'all'
    }
  }
  // 在 "未分配" 或 "全部" 视图中创建时，保持 projectId 为 null
  chatStore.openConversationInTab(newId)
}
```

---

## 📊 修复统计

| 文件 | 修改处数 | 新增代码行 |
|------|---------|-----------|
| `chatStore.js` | 5 处 | ~30 行 |
| `ConversationList.vue` | 5 处 | ~20 行 |
| **总计** | **10 处** | **~50 行** |

---

## 🧪 测试建议

### 1. 项目名称重复测试
- [ ] 创建同名项目时显示提示
- [ ] 重命名为已存在的名称时显示提示
- [ ] 重命名为自己的名称时成功（不提示）

### 2. 项目删除测试
- [ ] 删除项目后，关联对话的 `projectId` 被清除
- [ ] 删除项目后，关联对话的 `updatedAt` 被更新
- [ ] 删除当前激活项目后，筛选器切换到 "all"
- [ ] 刷新页面后，不再出现"未知项目"

### 3. 项目排序测试
- [ ] 批量创建多个项目时，列表顺序稳定
- [ ] 更新项目后，排序正确
- [ ] 刷新页面后，顺序保持一致

### 4. 数据完整性测试
- [ ] 手动破坏项目数据（删除 id 或 name），验证加载时正确过滤
- [ ] 手动设置对话的 `projectId` 为不存在的 ID，验证加载时自动清理

### 5. 新建对话测试
- [ ] 在 "全部" 视图中新建对话，`projectId` 为 null
- [ ] 在 "未分配" 视图中新建对话，`projectId` 为 null
- [ ] 在指定项目视图中新建对话，自动分配到该项目
- [ ] 在已删除的项目视图中新建对话，自动切换到 "all"

---

## 🔒 防止回归的最佳实践

### 1. 数据验证规范
```javascript
// ✅ 创建/更新时，始终验证必填字段
if (!trimmed) {
  console.warn('⚠️ 字段不能为空')
  return null
}

// ✅ 检查唯一性约束
const isDuplicate = collection.some(item => item.name === newName)
if (isDuplicate) {
  console.warn('⚠️ 名称已存在')
  return null
}
```

### 2. 级联更新规范
```javascript
// ✅ 删除实体时，同步更新关联数据
for (const related of relatedEntities) {
  if (related.foreignKey === deletedId) {
    related.foreignKey = null
    related.updatedAt = Date.now()  // 不要忘记更新时间戳
  }
}
```

### 3. 数据加载规范
```javascript
// ✅ 加载时验证数据完整性
const validItems = savedItems
  .filter(item => item && typeof item.id === 'string' && typeof item.name === 'string')
  .map(item => ({
    id: item.id,
    name: item.name.trim() || '未命名',
    // ...
  }))

// ✅ 清理无效的外键引用
const validIds = new Set(validItems.map(item => item.id))
relatedEntities.forEach(entity => {
  if (entity.foreignKey && !validIds.has(entity.foreignKey)) {
    entity.foreignKey = null
  }
})
```

### 4. 排序稳定性规范
```javascript
// ✅ 多字段排序，确保稳定性
.sort((a, b) => {
  // 主字段
  if (a.priority !== b.priority) {
    return b.priority - a.priority
  }
  // 次字段（时间戳）
  if (a.timestamp !== b.timestamp) {
    return b.timestamp - a.timestamp
  }
  // 第三字段（ID，确保稳定性）
  return a.id.localeCompare(b.id)
})
```

### 5. 用户反馈规范
```javascript
// ✅ 操作失败时给出明确提示
const success = performAction()
if (!success) {
  // 根据不同失败原因给出不同提示
  if (nameExists) {
    alert('名称已存在，请使用其他名称')
  } else if (entityNotFound) {
    alert('实体不存在，可能已被删除')
  }
}
```

---

## 📚 相关文档

- [项目管理系统架构](./PROJECT_MANAGEMENT_SYSTEM.md) *(待创建)*
- [数据持久化规范](./DATA_PERSISTENCE_GUIDE.md) *(待创建)*
- [chatStore API 文档](../src/stores/CHAT_STORE_GUIDE.md)

---

## 💡 经验总结

1. **唯一性约束很重要**: 用户界面的可用性很大程度上取决于数据的唯一性和一致性。

2. **级联更新不能忘**: 删除/修改实体时，必须同步更新所有关联数据，包括时间戳。

3. **数据验证要全面**: 加载数据时必须验证完整性，清理无效引用，防止脏数据。

4. **排序需要稳定**: 多条记录相同值时，使用额外字段（如 ID）确保排序稳定。

5. **用户反馈要及时**: 操作失败时给出明确提示，帮助用户理解问题并采取正确行动。

6. **测试要覆盖边界**: 单元测试应覆盖所有边界情况，如空值、重复值、不存在的引用等。
