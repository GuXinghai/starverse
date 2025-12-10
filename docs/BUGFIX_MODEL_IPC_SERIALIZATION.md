# Model Data IPC Serialization 修复

## 问题描述

```
❌ 保存可用模型列表失败: Error: An object could not be cloned.
    at query (modelDataClient.ts:16:25)
    at Module.saveModels (modelDataClient.ts:39:9)
    at Proxy.saveAvailableModels (model.ts:207:29)
    at bootstrapChatData (main.ts:115:22)
```

**根本原因**: IPC 跨进程传输时尝试序列化不可克隆的对象（函数、循环引用、Symbol 等）

## 问题定位

### 1. 类型不匹配

`aiChatService.listAvailableModels()` 返回 `string[]`（模型 ID），但代码直接传给 `modelStore.setAvailableModels()` 期望的 `ModelData[]`。

**位置**:
- `src/main.ts:112` - 后台加载模型列表
- `src/components/SettingsView.vue:86, 160` - 手动刷新模型列表

### 2. 白名单缺失

`model.getAll` 等方法未添加到 IPC 白名单，导致权限错误：

```
DbWorkerError: Method not allowed: model.getAll
```

**位置**: `electron/ipc/dbBridge.ts` 的 `allowedMethods` 数组

## 修复方案

### 修复 1: 类型转换 (src/main.ts)

```typescript
// ❌ 错误（直接使用 string[]）
const models = await aiChatService.listAvailableModels(appStore)
modelStore.setAvailableModels(models)

// ✅ 正确（转换为 ModelData[]）
const modelIds = await aiChatService.listAvailableModels(appStore)

const models = modelIds.map(id => ({
  id,
  name: id,
  description: undefined,
  contextWindow: undefined,
  maxOutputTokens: undefined,
  pricing: undefined,
  supportsVision: undefined,
  supportsImageOutput: undefined,
  supportsReasoning: undefined
}))

modelStore.setAvailableModels(models)
```

**关键点**:
- 只创建包含原始类型的简单对象（string, number, undefined）
- 避免包含 `_raw`, `architecture`, `modality` 等可能来自 API 的复杂对象
- 所有字段均可被 `JSON.stringify()` 和 `structuredClone()` 安全处理

### 修复 2: 白名单更新 (electron/ipc/dbBridge.ts)

```typescript
const allowedMethods: DbMethod[] = [
  // ... 其他方法
  
  // Model Data Management
  'model.saveMany',
  'model.replaceByProvider',
  'model.getAll',          // ✅ 新增
  'model.getByProvider',   // ✅ 新增
  'model.getById',         // ✅ 新增
  'model.clear',           // ✅ 新增
  
  // ...
]
```

### 修复 3: SettingsView.vue (两处)

**位置 1** (Line 86):
```typescript
const modelIds = await aiChatService.listAvailableModels(store)

const models = modelIds.map(id => ({
  id,
  name: id
}))

modelStore.setAvailableModels(models)
```

**位置 2** (Line 160 - 类似逻辑)

## 序列化规则

### ✅ 可序列化的类型
- `string`, `number`, `boolean`, `null`, `undefined`
- 纯对象 `{}`
- 数组 `[]`
- `Date` 对象（转为 ISO 字符串）

### ❌ 不可序列化的类型
- 函数 `() => {}`
- Symbol
- 循环引用对象
- DOM 节点
- 特殊对象（WeakMap, WeakSet, Proxy）
- 包含上述类型的嵌套结构

## 测试验证

创建了 `tests/unit/services/modelDataClient.test.ts` (7 个测试用例):

1. ✅ 模型 ID 到 ModelData 转换
2. ✅ undefined 字段处理（IPC 兼容）
3. ✅ 拒绝包含函数的对象
4. ✅ 拒绝循环引用对象
5. ✅ SaveModelDataInput 格式验证
6. ✅ pricing 对象序列化
7. ✅ 空 meta 对象处理

**测试结果**: 全部通过 (7/7)

## 架构改进建议

### 短期（已实施）
- ✅ 在数据入口处转换为简单对象
- ✅ 补充 IPC 白名单
- ✅ 添加序列化测试

### 长期（待讨论）
1. **引入 Zod 验证**: 在 IPC 边界强制验证数据格式
2. **自动清理**: 使用 `ipcSanitizer` 自动移除不可序列化字段
3. **类型守卫**: 为 `ModelData` 添加运行时类型检查
4. **错误日志**: 记录序列化失败的详细堆栈

## 相关文件

**修复文件**:
- `src/main.ts` (Line 112-130)
- `src/components/SettingsView.vue` (Line 86, 160)
- `electron/ipc/dbBridge.ts` (Line 99-104)

**测试文件**:
- `tests/unit/services/modelDataClient.test.ts` (新建)

**相关类型**:
- `src/types/store.ts` - ModelData 接口定义
- `infra/db/types.ts` - SaveModelDataInput 类型
- `src/types/providers.ts` - IAIProvider 接口

## 验证步骤

```bash
# 1. 运行单元测试
npm run test -- tests/unit/services/modelDataClient.test.ts

# 2. 检查 TypeScript 编译
npx tsc --noEmit

# 3. 启动应用测试
npm run dev

# 4. 验证模型列表加载
# - 打开设置页面
# - 配置 API Key
# - 观察控制台输出："✅ 可用模型列表已保存到数据库: N 个模型"
```

## 后续监控

- 监控 `saveAvailableModels()` 调用是否成功
- 检查数据库 `model_data` 表是否正确填充
- 验证跨 IPC 的数据传输延迟（应 <10ms）

---

**修复日期**: 2025年12月8日  
**版本**: v0.10 (Task 9 后期修复)  
**影响范围**: 模型数据持久化、IPC 通信安全
