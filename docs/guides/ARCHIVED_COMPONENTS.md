# 已归档组件说明

## 概述

本文档记录了从项目中移除并归档到 `archived-components/` 目录的组件。

归档日期：**2025年11月9日**

## 归档策略

- **归档目录**：`/archived-components/`
- **版本控制**：该目录已添加到 `.gitignore`，不会被 Git 追踪
- **TypeScript 配置**：已在 `tsconfig.json` 的 `exclude` 中排除此目录
- **保留原因**：仅作为历史参考，方便未来需要时恢复

## 已归档的组件

### 1. HelloWorld.vue

**原因**：Vite 脚手架生成的示例组件，未在项目中使用

**功能**：
- 简单的计数器演示
- Vue 文档链接
- 热更新测试示例

**文件大小**：1,577 字节

**使用情况**：
- ❌ 未被任何组件引用
- ❌ 未在路由中使用
- ✅ 仅为项目初始化时的模板文件

---

### 2. ModelSelector.vue

**原因**：已被 `FavoriteModelSelector.vue` 替代，项目中无引用

**功能**：
- 带分类的 AI 模型选择下拉菜单
- 支持 Gemini 多版本分组（2.5、2.0、1.5、1.0）
- 支持 Gemma、图像生成、视频生成、音频处理分类
- 悬停延迟显示子菜单

**文件大小**：17,288 字节

**使用情况**：
- ❌ 未被任何组件导入
- ❌ 未在 ChatView.vue 中使用
- ✅ 已被更强大的 FavoriteModelSelector 替代

**技术特点**：
- TypeScript + Composition API
- 支持 conversationId prop
- 多级分类菜单结构
- 模型排序策略（latest > preview > flash > thinking）

**已知问题**：
- ⚠️ 第 161 行注释与代码行为不一致：
  ```typescript
  // 🔒 必须提供 conversationId，不允许依赖全局状态
  if (!props.conversationId) {
    console.error('❌ ModelSelector 必须提供 conversationId prop，不能依赖全局状态')
    return
  }
  ```
  但实际在 `get` 方法中允许回退到全局状态：`return chatStore.selectedModel`

---

### 3. StartupSplash.vue

**原因**：空文件，未实现任何功能

**功能**：无

**文件大小**：0 字节

**使用情况**：
- ❌ 文件为空
- ❌ 未被任何组件引用
- ✅ 可能是计划中的功能但未实现

---

## 统计信息

| 项目 | 数值 |
|------|------|
| 归档组件数量 | 3 个 |
| 释放空间 | ~19 KB |
| 剩余组件数量 | 12 个 |

## 当前活跃组件列表

截至归档日期，`src/components/` 中保留的 12 个活跃组件：

1. **AdvancedModelPickerModal.vue** - 高级模型选择器（1,404 行）
2. **AttachmentPreview.vue** - 图片附件预览
3. **ChatTabs.vue** - 聊天标签栏
4. **ChatView.vue** - 主聊天视图（3,022 行）
5. **ContentRenderer.vue** - Markdown/LaTeX 渲染器
6. **ConversationList.vue** - 对话列表（1,382 行）
7. **DeleteConfirmDialog.vue** - 删除确认对话框
8. **FavoriteModelSelector.vue** - 收藏模型选择器（982 行）
9. **MessageBranchController.vue** - 消息分支控制器
10. **QuickModelSearch.vue** - 快速模型搜索
11. **SettingsView.vue** - 设置页面
12. **TabbedChatView.vue** - 多标签聊天管理器

所有活跃组件均已通过引用检查和注释质量审查。

## 恢复指南

如需恢复任何归档组件：

```powershell
# 恢复单个组件
Copy-Item archived-components/HelloWorld.vue src/components/

# 恢复所有组件
Copy-Item archived-components/*.vue src/components/
```

⚠️ **注意**：恢复后需要：
1. 检查组件依赖是否完整
2. 更新相关引用和路由
3. 运行 `npm run dev` 验证编译通过

## 配置更改记录

### `.gitignore`
```gitignore
# Archived/deprecated components
archived-components/
```

### `tsconfig.json`
```json
{
  "exclude": [
    "node_modules",
    "dist", 
    "dist-electron",
    "release",
    "archived-components"  // 新增：排除归档组件目录
  ]
}
```

### 验证结果

- ✅ 开发服务器正常启动
- ✅ Vite 编译成功
- ✅ TypeScript 类型检查通过（`npx tsc --noEmit` 无错误）
- ✅ 无组件引用错误
- ✅ 归档目录已从 Git 和 TypeScript 中排除

## 相关文档

- [组件注释审查报告](./CHATVIEW_OPTIMIZATION_SUMMARY.md)
- [性能优化总结](./PERFORMANCE_OPTIMIZATION_COMPLETE.md)
- [最近修复汇总](./RECENT_FIXES_2025_11.md)

---

**维护者**：GitHub Copilot  
**最后更新**：2025年11月9日
