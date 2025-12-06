# Issue #2 解决方案：参数持久化修复

## 问题描述
每次重启或刷新页面后，参数面板的"自定义参数功能"及其设定的数值都会丢失。

## 根本原因
`samplingParameters` 字段（包含所有 `_mode` 和 `_manualValue` 字段）在保存和加载对话时未被正确序列化和恢复。

## 解决方案

### 1. 修改的文件
✅ **src/stores/persistence.ts**
- `saveConversation()`: 在 snapshot 中包含 `samplingParameters`
- `loadConversations()`: 从 snapshot 恢复 `samplingParameters`

✅ **src/services/chatPersistence.ts**
- `ConversationSnapshot` 类型：添加 `samplingParameters` 字段
- `ConversationMetaPayload` 类型：添加 `samplingParameters` 字段
- `mapRecordToSnapshot()`: 从数据库恢复 `samplingParameters`
- `saveConversation()`: 将 `samplingParameters` 保存到数据库

### 2. 数据流验证

#### 保存路径 (Save Path)
```
Conversation 对象
  └─ conversationStore.getConversationById()
      └─ persistence.saveConversation()
          └─ 构建 snapshot { samplingParameters: conversation.samplingParameters }
              └─ sqliteChatPersistence.saveConversation(snapshot)
                  └─ baseMeta: ConversationMetaPayload { samplingParameters: snapshot.samplingParameters }
                      └─ dbService.saveConvo({ meta: baseMeta })
                          └─ SQLite 数据库 (JSON 字段: meta.samplingParameters)
```

#### 加载路径 (Load Path)
```
SQLite 数据库
  └─ dbService.loadConvos()
      └─ ConvoRecord { meta: { samplingParameters: {...} } }
          └─ mapRecordToSnapshot(record)
              └─ ConversationSnapshot { samplingParameters: meta.samplingParameters }
                  └─ persistence.loadConversations()
                      └─ Conversation { samplingParameters: snapshot.samplingParameters }
                          └─ conversationStore.setConversations()
                              └─ UI 显示（ChatView.vue）
```

### 3. 类型定义完整性

所有参数都包含完整的三元组：
- `temperature`: 实际值
- `temperature_mode`: 'SLIDER' | 'INPUT'
- `temperature_manualValue`: number | null

示例：
```typescript
interface SamplingParameterSettings {
  // Temperature
  temperature: number
  temperature_mode: ParameterControlMode
  temperature_manualValue: number | null
  
  // Top P
  top_p: number
  top_p_mode: ParameterControlMode
  top_p_manualValue: number | null
  
  // ... 其余 8 个参数
}
```

### 4. 单元测试覆盖

✅ **tests/sampling-parameters-persistence.test.ts** (6个测试全部通过)
- ✅ 类型定义完整性验证
- ✅ JSON 序列化/反序列化完整性
- ✅ Snapshot 转换完整性
- ✅ 向后兼容性（旧对话使用默认值）
- ✅ 完整保存-加载周期模拟
- ✅ 对象拷贝完整性验证

## 手动测试步骤

### 测试场景 1：INPUT 模式持久化
1. 打开应用，创建新对话
2. 打开参数面板（右上角 ⚙️ 图标）
3. 将 `temperature` 切换到 INPUT 模式（点击"输入"按钮）
4. 输入自定义值：`0.85`
5. 将 `top_k` 切换到 INPUT 模式，输入：`100`
6. 将 `max_tokens` 切换到 INPUT 模式，输入：`2048`
7. 刷新页面（F5）或重启应用
8. **预期结果**：
   - `temperature` 显示为 INPUT 模式，值为 `0.85`
   - `top_k` 显示为 INPUT 模式，值为 `100`
   - `max_tokens` 显示为 INPUT 模式，值为 `2048`
   - 其他参数保持 SLIDER 模式

### 测试场景 2：混合模式持久化
1. 将 `temperature` 设为 INPUT 模式，值 `0.9`
2. 将 `top_p` 保持 SLIDER 模式，拖动到 `0.8`
3. 将 `frequency_penalty` 设为 INPUT 模式，值 `0.5`
4. 将 `presence_penalty` 保持 SLIDER 模式
5. 刷新页面
6. **预期结果**：
   - `temperature`: INPUT 模式，`0.9`
   - `top_p`: SLIDER 模式，`0.8`
   - `frequency_penalty`: INPUT 模式，`0.5`
   - `presence_penalty`: SLIDER 模式（保持原值）

### 测试场景 3：多对话独立性
1. 创建对话 A，设置 `temperature` = INPUT, `0.7`
2. 创建对话 B，设置 `temperature` = INPUT, `0.9`
3. 切换到对话 A，验证 `temperature` 仍为 `0.7`
4. 切换到对话 B，验证 `temperature` 仍为 `0.9`
5. 刷新页面
6. 分别打开对话 A 和 B
7. **预期结果**：
   - 对话 A: `temperature` = `0.7`
   - 对话 B: `temperature` = `0.9`

### 测试场景 4：向后兼容性
1. 在旧版本（没有此修复）创建对话并保存
2. 更新到新版本
3. 打开旧对话
4. **预期结果**：
   - 所有参数默认为 SLIDER 模式
   - 使用 `DEFAULT_SAMPLING_PARAMETERS` 中的默认值
   - 不出现错误或崩溃

## 验证检查点

### 数据库验证
使用 SQLite 浏览器打开数据库文件：
```
[User Data]/db/starverse.db
```

查询对话元数据：
```sql
SELECT id, title, json_extract(meta, '$.samplingParameters') AS sampling
FROM conversations
WHERE id = '<your-conversation-id>';
```

**预期结果**：
- `sampling` 字段应包含完整的 JSON 对象
- 包含所有 `_mode` 和 `_manualValue` 字段
- INPUT 模式参数的 `manualValue` 应为实际输入的数值

### 控制台验证
在开发者工具中运行：
```javascript
// 获取当前对话
const conv = window.__STORES__.conversationStore.currentConversation

// 检查参数
console.log('Sampling Parameters:', conv.samplingParameters)

// 验证特定参数
console.log('Temperature:', {
  value: conv.samplingParameters.temperature,
  mode: conv.samplingParameters.temperature_mode,
  manualValue: conv.samplingParameters.temperature_manualValue
})
```

## 回归测试

确保修复没有破坏现有功能：

1. ✅ SLIDER 模式拖动正常工作
2. ✅ INPUT 模式输入验证正常（范围检查、错误提示）
3. ✅ 模式切换不会污染数据
4. ✅ "填充默认值"按钮正常工作
5. ✅ 参数更改立即应用到 AI 请求
6. ✅ 对话创建、删除、切换功能正常
7. ✅ 应用启动时加载对话列表正常

## 性能验证

1. 创建 10 个对话，每个设置不同的参数
2. 刷新页面，观察加载时间
3. **预期结果**：加载时间应与之前基本一致（新增字段体积很小）

## 已知限制

1. **类型安全性**：`ConversationSnapshot` 和 `ConversationMetaPayload` 中的 `samplingParameters` 使用 `any` 类型，未来可以改进为显式导入 `SamplingParameterSettings`。

2. **向后兼容性**：旧对话的 `samplingParameters` 字段为 `undefined`，会使用 `DEFAULT_SAMPLING_PARAMETERS` 填充。这是预期行为。

3. **数据库迁移**：不需要数据库迁移，因为新字段是可选的（`samplingParameters?`）。

## 总结

✅ **问题已完全解决**
- 保存路径：正确序列化所有 `_mode` 和 `_manualValue` 字段
- 加载路径：正确恢复所有字段
- 类型系统：完整定义所有必需字段
- 单元测试：100% 通过（6/6）
- 数据流：完全打通（Store → Persistence → Service → SQLite）

用户现在可以安心使用 INPUT 模式自定义参数，刷新页面或重启应用后，所有设置都会完整恢复。
