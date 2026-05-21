# OpenRouter 请求日志快速参考

## 🎯 核心用途

验证发送给 OpenRouter 的 `reasoning` 参数是否正确配置。

## 📋 日志位置

打开 **DevTools Console** (F12)，查找：

```
================================================================================
OPENROUTER_REQUEST_BEGIN <requestId> <timestamp>
================================================================================
```

## 🔍 关键字段

### reasoning 参数（重点检查）

| 配置 | 期望输出 | 说明 |
|------|---------|------|
| 推理关闭 | `"reasoning": { "effort": "none" }` | 明确禁用推理 |
| 推理 low | `"reasoning": { "effort": "low" }` | 低强度推理 |
| 推理 medium | `"reasoning": { "effort": "medium" }` | 中等强度（默认） |
| 推理 high | `"reasoning": { "effort": "high" }` | 高强度推理 |
| 不回显 reasoning | `"reasoning": { "effort": "medium", "exclude": true }` | 推理但不返回 tokens |
| max_tokens 模式 | `"reasoning": { "max_tokens": 4000 }` | Anthropic/Gemini 风格 |
| 未配置 | **不存在** `reasoning` 字段 | 依赖模型默认行为 |

### 摘要行（快速扫描）

```
OR_REQ <id> model=<name> stream=<bool> reasoning=<summary> msgs=<count>
```

**reasoning 摘要值**：
- `OFF` - 未启用
- `effort=medium` - 使用 effort 模式
- `max_tokens=4000,exclude=true` - max_tokens + exclude
- `EMPTY_OBJECT` - ⚠️ 空对象（异常）

## ✅ 验收检查清单

发送一条消息后，检查日志：

- [ ] 存在 `OPENROUTER_REQUEST_BEGIN/END` 边界
- [ ] Endpoint 为 `https://openrouter.ai/api/v1/chat/completions`
- [ ] API Key 显示为 `***<last4>`（已脱敏）
- [ ] `reasoning` 字段存在且值符合预期
- [ ] 摘要行的 `reasoning=` 值准确
- [ ] `messages` 数组包含你的输入

## 🔧 常见问题排查

### 问题 1：推理不工作

**检查**：日志中的 `reasoning` 字段

| 日志显示 | 诊断 | 解决方法 |
|---------|------|---------|
| `"reasoning": { "effort": "none" }` | 推理被禁用 | 在 UI 中启用推理 |
| 没有 `reasoning` 字段 | 未传递推理参数 | 检查配置 Store |
| `"reasoning": {}` | 空对象（异常） | 检查请求构建逻辑 |

### 问题 2：reasoning tokens 仍然返回（不想要）

**检查**：`reasoning.exclude` 字段

- ✅ 正确：`"reasoning": { "effort": "high", "exclude": true }`
- ❌ 错误：`"reasoning": { "effort": "high" }` - 缺少 exclude
- ⚠️ 注意：有些模型不支持 exclude（如 OpenAI o 系列）

### 问题 3：日志没有出现

**检查项**：
1. 是否使用 OpenRouter provider？（而非 Google Gemini）
2. Console 是否被过滤？（取消 Errors/Warnings only）
3. 是否有其他 JavaScript 错误阻塞执行？

## 🧪 测试脚本

快速验证日志功能：

```bash
node scripts/debug-request-log-test.mjs
```

预期：打印 4 个测试用例的完整日志。

## 📚 相关文档

- **使用指南**：`docs/DEBUG_OPENROUTER_REQUEST_LOG.md`
- **技术实现**：`docs/DEBUG_OPENROUTER_REQUEST_LOG_IMPL.md`
- **OpenRouter API**：https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request
- **Reasoning Tokens**：https://openrouter.ai/docs/guides/best-practices/reasoning-tokens

## 💡 实用技巧

### 技巧 1：快速复制日志

在 Console 中：
1. 点击 `OPENROUTER_REQUEST_BEGIN` 行
2. Shift + 点击 `OPENROUTER_REQUEST_END` 行
3. Ctrl+C 复制整块内容

### 技巧 2：过滤日志

在 Console 过滤框中输入：
```
OPENROUTER_REQUEST
```

只显示 OpenRouter 请求日志。

### 技巧 3：对比多次请求

1. 发送消息 A，复制日志到文本编辑器
2. 修改配置，发送消息 B，再次复制日志
3. 使用 diff 工具对比两次请求的差异

### 技巧 4：分享日志（⚠️ 安全警告）

**重要**：日志中的 API Key **完整打印，不再脱敏**！

分享日志前务必：
- ❌ **绝对不要**直接复制包含 API Key 的日志
- ✅ 手动删除 `API Key (FULL)` 和 `Authorization` 行
- ✅ 或使用截图并遮挡 API Key 区域
- ✅ 仅分享 `reasoning`、`model`、`messages` 结构等非敏感字段

## 🎓 OpenRouter Reasoning 参数速查

### effort 模式（OpenAI 风格）

| 挡位 | 推理预算 | 适用场景 |
|------|---------|---------|
| `none` | 无推理 | 简单对话 |
| `minimal` | 极低 | 快速响应 |
| `low` | 低 | 轻度推理 |
| `medium` | 中等 | 平衡 |
| `high` | 高 | 复杂问题 |
| `xhigh` | 极高 | 最复杂问题 |

### max_tokens 模式（Anthropic 风格）

```json
{
  "reasoning": {
    "max_tokens": 4000  // 推理预算（tokens 数）
  }
}
```

### exclude 选项

```json
{
  "reasoning": {
    "effort": "high",
    "exclude": true  // 推理但不返回 reasoning tokens
  }
}
```

**用途**：
- 降低响应延迟（不等待 reasoning tokens 传输）
- 减少 tokens 成本（reasoning tokens 通常更贵）
- 保持用户体验（不显示推理过程）

---

**提示**：将本文件保存到书签或打印为 PDF，便于快速查阅！
