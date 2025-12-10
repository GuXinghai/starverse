# ADR-005: 为什么采用多提供商架构模式

**状态**: 已接受  
**日期**: 2024-09-15  
**决策者**: @GuXinghai

## 背景

Starverse最初只支持Google Gemini，但用户需要使用其他AI提供商（OpenRouter、Claude、GPT-4等）。需要设计可扩展的AI集成架构。

## 决策

采用 **策略模式 (Strategy Pattern)** 实现多提供商架构：
- 统一的`IAIProvider`接口
- 各提供商独立实现
- `aiChatService`作为路由器

## 理由

### 架构设计

```typescript
// 统一接口
interface IAIProvider {
  sendMessage(params): AsyncIterableIterator<string>
  listModels(): Promise<Model[]>
}

// 具体实现
class GeminiProvider implements IAIProvider { ... }
class OpenRouterProvider implements IAIProvider { ... }

// 服务路由器
const aiChatService = {
  sendMessage(params) {
    const provider = getProvider(activeProvider)
    return provider.sendMessage(params)
  }
}
```

### 为什么选择策略模式？

**优点**:
- ✅ 运行时切换提供商（无需重启）
- ✅ 新增提供商不影响现有代码
- ✅ 每个提供商独立测试
- ✅ 接口统一，调用层代码简洁

**替代方案**:
- ❌ 工厂模式: 创建对象时决定类型，不适合运行时切换
- ❌ if-else分支: 新增提供商需修改多处代码，违反开闭原则
- ❌ 继承: 多个提供商共同继承基类，灵活性差

## 后果

### 积极影响

✅ **易于扩展**: 新增OpenRouter仅用2小时  
✅ **用户自由**: 可随时切换提供商，无需重启  
✅ **降低风险**: 一个提供商故障不影响其他  
✅ **代码清晰**: 每个提供商职责单一，易于维护

### 实际效果

**当前支持的提供商**:
- Google Gemini (gemini-2.0-flash-exp, gemini-1.5-pro等)
- OpenRouter (gpt-4, claude-3.5-sonnet, deepseek等200+模型)

**扩展性验证**:
- 新增OpenRouter提供商仅修改3个文件
- 测试覆盖率100%（模拟提供商响应）

### 消极影响

❌ **接口约束**: 提供商特有功能难以暴露（如Gemini的SafetySettings）  
❌ **流式响应差异**: 各提供商SSE格式不同，需要适配层

**缓解措施**:
- 使用`providerSpecificConfig`字段传递特有配置
- 统一的流式响应解析器（`parseSSEStream`）

## 参考资料

- [策略模式详解](https://refactoring.guru/design-patterns/strategy)
- [OpenRouter集成文档](../architecture/OPENROUTER_INTEGRATION_SUMMARY.md)
- [AI服务实现](../../src/services/aiChatService.js)

---

**相关决策**:
- [ADR-001: 为什么选择 Electron](001-why-electron.md)
- [ADR-002: 为什么选择 Vue 3](002-why-vue3.md)
