# 参数面板测试指南

## 测试文件清单

### 单元测试（Unit Tests）

#### 1. `tests/unit/stores/conversation-parameters.spec.ts`
**范围**: ConversationStore 的参数管理方法

**测试覆盖**:
- `setSamplingParameters()`: 采样参数的设置、更新、持久化
- `setReasoningPreference()`: 推理偏好的设置、更新、持久化
- 参数与 `generationConfigManager` 的同步
- 多对话场景下的参数隔离
- 脏数据标记和时间戳更新

**运行命令**:
```bash
npm run test:unit -- conversation-parameters.spec.ts
```

**预期结果**: 所有 28 个测试通过 ✅

---

#### 2. `tests/unit/components/ConversationParameterPanel.spec.ts`
**范围**: 参数面板 Vue 组件的单元测试

**测试覆盖**:
- 面板的条件渲染（show 和 isAvailable）
- 参数值的初始化和同步
- 用户交互（滑块调整）→ 事件发送流程
- 模型能力检查和参数过滤
- 参数验证和范围检查
- 推理偏好集成
- 面板打开/关闭动画
- 边界情况处理

**运行命令**:
```bash
npm run test:unit -- ConversationParameterPanel.spec.ts
```

**预期结果**: 所有 18 个测试通过 ✅

---

#### 3. `tests/unit/services/generationConfigManager-conversation.spec.ts`
**范围**: GenerationConfigManager 对话级配置的单元测试

**测试覆盖**:
- 对话级配置的读写操作
- 4 层配置合并逻辑（Global < Model < Conversation < Request）
- 对话级采样参数和推理配置
- 多对话配置隔离
- 配置删除和重置
- 边界情况和错误处理

**运行命令**:
```bash
npm run test:unit -- generationConfigManager-conversation.spec.ts
```

**预期结果**: 所有 22 个测试通过 ✅

---

### 集成测试（Integration Tests）

#### 4. `tests/integration/conversation-parameters-integration.spec.ts`
**范围**: 参数面板的端到端集成测试

**测试覆盖**:
- 完整的参数设置流程：UI → Store → ConfigManager
- 参数多次调整场景
- 多对话参数隔离
- 推理偏好集成
- 参数与全局/模型配置的交互
- 参数持久化验证
- 错误处理和边界情况
- 并发操作安全性

**运行命令**:
```bash
npm run test:unit -- conversation-parameters-integration.spec.ts
```

**预期结果**: 所有 16 个测试通过 ✅

---

## 快速运行所有参数测试

```bash
# 运行所有参数相关的单元测试
npm run test:unit -- conversation-parameters conversation-parameters-integration ConversationParameterPanel generationConfigManager-conversation

# 或使用通配符
npm run test:unit -- "*parameters*"
```

## 完整测试流程检查清单

### 1. 前置准备
- [ ] 确保项目依赖已安装：`npm install`
- [ ] 验证 `vitest` 和 `@vue/test-utils` 已安装
- [ ] 确认 `tests/setup.ts` 配置完整

### 2. 运行单元测试
- [ ] 运行 Store 参数测试
  ```bash
  npm run test:unit -- conversation-parameters.spec.ts
  ```
  预期: 28 个测试通过，0 个失败

- [ ] 运行组件单元测试
  ```bash
  npm run test:unit -- ConversationParameterPanel.spec.ts
  ```
  预期: 18 个测试通过，0 个失败

- [ ] 运行配置管理器测试
  ```bash
  npm run test:unit -- generationConfigManager-conversation.spec.ts
  ```
  预期: 22 个测试通过，0 个失败

### 3. 运行集成测试
- [ ] 运行端到端集成测试
  ```bash
  npm run test:unit -- conversation-parameters-integration.spec.ts
  ```
  预期: 16 个测试通过，0 个失败

### 4. 查看覆盖率
```bash
npm run test:coverage -- tests/unit/stores/conversation-parameters.spec.ts
npm run test:coverage -- tests/unit/components/ConversationParameterPanel.spec.ts
npm run test:coverage -- tests/unit/services/generationConfigManager-conversation.spec.ts
```

## 测试场景说明

### 场景 1: 基础参数设置
```
用户流程:
1. 用户打开聊天窗口
2. 点击参数按钮展开面板
3. 调整温度滑块从 0.7 → 0.8
4. 调整 top-p 滑块从 0.9 → 0.95
5. 发送消息

验证点:
- ✅ 参数面板正确展开
- ✅ 滑块变化触发 update:samplingParameters 事件
- ✅ conversationStore.setSamplingParameters() 被调用
- ✅ generationConfigManager.setConversationConfig() 被调用
- ✅ 参数被正确保存到对话对象
```

### 场景 2: 多对话参数隔离
```
用户流程:
1. 创建对话 A，设置温度 0.7
2. 创建对话 B，设置温度 0.95
3. 切换回对话 A
4. 验证参数仍为 0.7

验证点:
- ✅ 对话 A 和 B 的参数独立存储
- ✅ generationConfigManager 中参数也隔离
- ✅ 切换对话时显示正确的参数
```

### 场景 3: 参数持久化
```
用户流程:
1. 创建对话，设置采样参数
2. 关闭应用
3. 重新启动应用
4. 打开相同对话，检查参数

验证点:
- ✅ conversationStore 标记为脏数据
- ✅ persistenceStore 触发自动保存
- ✅ 参数从 electron-store 正确加载
```

### 场景 4: 4 层配置合并
```
配置设置:
- Global: temperature = 0.5
- Model: temperature = 0.6
- Conversation: temperature = 0.8
- Request: temperature = 0.9 (仅用于该请求)

验证点:
- ✅ getEffectiveConfig({ conversationId }) 返回 0.8
- ✅ getEffectiveConfig({ conversationId, requestOverride }) 返回 0.9
- ✅ 未被覆盖的字段从较高优先级继承
```

## 常见错误排查

### 错误 1: "generationConfigManager 未定义"
**原因**: Mock 配置问题
**解决**:
```typescript
vi.mock('../../../src/services/providers/generationConfigManager', () => ({
  generationConfigManager: {
    setConversationConfig: vi.fn(),
    getEffectiveConfig: vi.fn()
  }
}))
```

### 错误 2: "Component not found"
**原因**: 导入路径错误
**解决**: 确认相对路径正确（通常是 `../../../`）

### 错误 3: "emit not called"
**原因**: Vue 测试工具配置问题
**解决**: 确保使用 `@vue/test-utils` 最新版本

## CI/CD 集成

### GitHub Actions 示例
```yaml
name: Test Parameters

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run test:unit -- "*parameters*"
      - run: npm run test:coverage -- "*parameters*"
```

## 性能基准

| 测试类型 | 文件数 | 测试数 | 预期耗时 |
|---------|------|------|---------|
| 单元测试 (Store) | 1 | 28 | ~200ms |
| 单元测试 (Component) | 1 | 18 | ~300ms |
| 单元测试 (ConfigManager) | 1 | 22 | ~250ms |
| 集成测试 | 1 | 16 | ~400ms |
| **总计** | **4** | **84** | **~1.15s** |

## 下一步

### Phase 1: 手动测试验证
1. 启动开发服务器：`npm run dev`
2. 打开浏览器，导航到应用
3. 执行 [场景 1-4](#测试场景说明) 的手动操作
4. 用浏览器 DevTools 检查 Network、Console

### Phase 2: E2E 测试（未来）
计划添加 Playwright 或 Cypress E2E 测试：
- 完整用户交互模拟
- 浏览器实际渲染验证
- 性能监控

### Phase 3: 性能测试（未来）
- 参数变化时的渲染性能
- 大量对话的内存使用
- 持久化操作的性能

## 参考资源

- [Vitest 文档](https://vitest.dev/)
- [Vue Test Utils 文档](https://test-utils.vuejs.org/)
- [项目测试配置](../vitest.config.ts)
- [Pinia 测试指南](https://pinia.vuejs.org/cookbook/testing.html)

## 反馈和改进

如遇到测试问题，请：
1. 检查错误信息中的行号
2. 查看 Mock 配置是否正确
3. 确认 props/emits 类型匹配
4. 参考 [常见错误排查](#常见错误排查) 部分
