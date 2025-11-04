# 最近问题修复汇总（2025年11月）

本文档记录了近期对 Starverse 应用的三个重要问题修复。

---

## 修复 1: 编辑无回复提问时的边界处理

### 问题描述
当用户编辑一个尚无任何模型回复的提问分支时，即使内容未发生变化，也应该触发一次新的 AI 回复生成。此前的逻辑会提前退出编辑，导致用户无法为空白提问生成回复。

### 解决方案
**修改文件**: `src/components/ChatView.vue`

- 在 `handleSaveEdit` 函数中新增逻辑：
  - 检测当前分支的子分支中是否存在有效的模型回复（非空内容）
  - 如果内容未变且该用户提问无有效回复，清理占位符分支并调整 `currentPath` 到当前编辑的用户分支
  - 仍然触发 `performSendMessage()` 生成新的模型回复

**核心改动**:
```javascript
const shouldTriggerReplyOnly = !hasActualChanges && isUserBranch && !hasMeaningfulReply

if (shouldTriggerReplyOnly) {
  // 清理空的占位回复并回归当前路径到用户分支
  for (const emptyBranchId of emptyChildBranchIds) {
    chatStore.deleteMessageBranch(targetConversationId, emptyBranchId, true)
  }
  
  if (conversation.tree) {
    const normalizedPath = getPathToBranch(conversation.tree, branchId)
    if (normalizedPath.length > 0) {
      conversation.tree.currentPath = normalizedPath
    }
  }
}
```

### 影响范围
- 用户编辑提问后保存（即使未改动），如果该提问下无回复，将自动生成新的 AI 回复

---

## 修复 2: 删除提问分支时路径错乱

### 问题描述
删除某个用户提问分支时，其同层级的其他提问下的所有回复会意外消失，界面显示混乱。根本原因是删除操作后 `currentPath` 未能正确重建，导致路径指向了已删除的节点。

### 解决方案
**修改文件**: `src/stores/branchTreeHelpers.ts`

- 在 `deleteBranch` 函数中：
  - 删除前先通过 `findNextFocusBranchId` 定位下一个可用的兄弟分支（或其他根节点）
  - 删除后调用 `normalizeCurrentPath` 重建有效路径
  
- 新增 `findNextFocusBranchId` 函数：
  - 优先选择后续兄弟分支 → 前面的兄弟分支 → 其他根分支
  
- 新增 `normalizeCurrentPath` 函数：
  - 优先使用传入的 `preferredBranchId` 构建路径
  - 回退到基于当前路径的验证与修复
  - 自动沿着有效的父子关系链延伸路径

**核心改动**:
```typescript
export function deleteBranch(
  tree: ConversationTree,
  branchId: string,
  deleteAllVersions: boolean
): boolean {
  const branch = tree.branches.get(branchId)
  if (!branch) return false

  if (deleteAllVersions || branch.versions.length === 1) {
    const nextFocusBranchId = findNextFocusBranchId(tree, branch)
    deleteBranchRecursively(tree, branchId)
    normalizeCurrentPath(tree, nextFocusBranchId)
  } else {
    // ... 删除单个版本的逻辑
    normalizeCurrentPath(tree, branch.branchId)
  }
  
  return true
}
```

### 影响范围
- 删除用户提问或模型回复时，界面会智能切换到相邻的有效分支，避免路径断裂

---

## 修复 3: 多模态模型重新生成时图片不显示

### 问题描述
使用支持图像生成的多模态模型（如 GPT-4o、Gemini 2.0 Flash）时：
- 第一次提问能正常接收并显示生成的图片
- 编辑提示词后重新提问，仅收到文本回复，图片无法显示
- 实际 API 确实返回了图片数据，但前端解析失败

根本原因：OpenRouter 和不同模型返回的图片格式不统一（`delta.images`、`delta.image`、`content.image_url`、`b64_json`、`inline_data` 等多种格式），原有解析逻辑过于简单。

### 解决方案
**修改文件**: `src/services/providers/OpenRouterService.js`

- 新增 `normalizeImagePayload` 辅助函数：
  - 统一处理多种图片格式（URL、base64、data URI、inline_data、b64_json 等）
  - 自动将裸 base64 字符串转换为标准 data URI
  - 支持嵌套对象和数组结构的图片数据
  
- 扩展流式解析逻辑：
  - 解析 `delta.images`（数组）和 `delta.image`（单个对象）
  - 解析 `delta.content` 数组中的图片块（`image_url`、`output_image`、`inline_data` 等）
  - 解析 `message.content` 和 `attachments` 中的图片
  - 使用 `emittedImages` Set 去重，避免重复输出
  
- 识别 `output_text` 类型的文本块，避免误判为图片

**核心改动**:
```javascript
const normalizeImagePayload = (payload, defaultMime = 'image/png') => {
  // 处理字符串: data URI、URL、裸 base64
  // 处理数组: 递归查找第一个有效图片
  // 处理对象: url、image_url、b64_json、inline_data 等多种字段
  // ...
}

// 解析 delta.images
for (const imageObj of delta.images) {
  const normalized = normalizeImagePayload(imageObj)
  if (normalized && !emittedImages.has(normalized)) {
    emittedImages.add(normalized)
    yield { type: 'image', content: normalized }
  }
}

// 解析 delta.image
const normalizedSingleImage = normalizeImagePayload(delta.image)
if (normalizedSingleImage && !emittedImages.has(normalizedSingleImage)) {
  emittedImages.add(normalizedSingleImage)
  yield { type: 'image', content: normalizedSingleImage }
}

// 解析 content blocks、message.content、attachments...
```

### 影响范围
- 所有通过 OpenRouter 使用的多模态模型（GPT-4o、Claude 3、Gemini 2.0 等）
- 图片生成、图片识别等场景
- 支持首次提问和重新生成两种流程

---

## 测试建议

1. **测试修复 1**:
   - 创建新对话，发送一条提问
   - 删除 AI 回复（如果有）
   - 编辑提问但不修改内容，直接保存
   - 确认会自动生成新的 AI 回复

2. **测试修复 2**:
   - 创建对话树，至少有 2 个并列的用户提问分支
   - 删除其中一个提问分支（包括所有版本）
   - 确认另一个提问分支的回复仍然正常显示

3. **测试修复 3**:
   - 使用支持图像生成的模型（如 `google/gemini-2.0-flash-exp`）
   - 发送提示词："生成一张猫的图片"
   - 确认图片正常显示
   - 编辑提示词为："生成一张狗的图片"
   - 确认新生成的图片也能正常显示

---

## 相关文件

- `src/components/ChatView.vue` - 主聊天界面逻辑
- `src/stores/branchTreeHelpers.ts` - 分支树操作辅助函数
- `src/services/providers/OpenRouterService.js` - OpenRouter API 集成

## 提交记录

- 分支: `experiment/new-api`
- 日期: 2025年11月4日

---

## 已知限制

- 如果模型返回 `asset_pointer` 类型的图片引用，当前版本无法处理（需要额外的下载逻辑）
- 极大的 base64 图片（>16MB 单条数据）会触发安全保护机制并中止请求
