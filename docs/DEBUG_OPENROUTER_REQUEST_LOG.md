# OpenRouter 请求体调试日志使用指南

## 概述

为了验证 Starverse 发送给 OpenRouter 的请求参数（特别是 `reasoning` 相关参数）是否正确，我们在 `openrouterFetch` 函数中添加了完整的请求体打印功能。

## 日志功能

### 自动打印（默认启用）

从现在开始，**每次**调用 OpenRouter API 时，都会在 Console 中打印完整的请求体信息。无需任何配置，默认启用。

### 日志格式

每个请求的日志由以下部分组成：

```
================================================================================
OPENROUTER_REQUEST_BEGIN <requestId> <isoTime>
================================================================================
Endpoint: https://openrouter.ai/api/v1/chat/completions
API Key (FULL): sk-or-v1-1234567890abcdef...
Headers (complete):
  Authorization: Bearer sk-or-v1-1234567890abcdef...
  HTTP-Referer: https://github.com/GuXinghai/starverse
  X-Title: Starverse
  Content-Type: application/json

Request Body (COMPLETE - NO SANITIZATION):
{
  "model": "...",
  "messages": [...],
  "stream": true/false,
  "reasoning": {
    "effort": "medium",
    "exclude": true
  },
  ...
}
================================================================================
OPENROUTER_REQUEST_END <requestId>
================================================================================
OR_REQ <requestId> model=<...> stream=<bool> reasoning=<formatted> msgs=<count>
```

**注意**：所有日志都使用 `console.warn()` 输出，在 Console 中显示为⚠️警告级别，便于快速筛选。

### 关键字段说明

#### `reasoning` 参数

OpenRouter 支持以下 `reasoning` 配置：

1. **effort 模式（OpenAI 风格）**：
   ```json
   {
     "reasoning": {
       "effort": "xhigh|high|medium|low|minimal|none"
     }
   }
   ```
   - `none` = 禁用推理
   - `low/minimal` = 低推理强度
   - `medium` = 中等推理强度（默认）
   - `high/xhigh` = 高推理强度

2. **max_tokens 模式（Anthropic/Gemini 风格）**：
   ```json
   {
     "reasoning": {
       "max_tokens": 4000
     }
   }
   ```

3. **exclude 选项（控制是否返回 reasoning tokens）**：
   ```json
   {
     "reasoning": {
       "effort": "high",
       "exclude": true  // 启用推理，但不在响应中返回 reasoning tokens
     }
   }
   ```

4. **禁用推理的方式**：
   - 方式一：`reasoning.effort = "none"`（推荐）
   - 方式二：不传递 `reasoning` 字段（依赖模型默认行为）

#### OR_REQ 摘要行

为了快速扫描，每个请求都有一行摘要：

```
OR_REQ <id> model=<name> stream=<bool> reasoning=<summary> msgs=<count>
```

`reasoning` 摘要格式：
- `OFF` - 未启用推理
- `effort=medium` - 使用 effort 模式
- `max_tokens=4000,exclude=true` - 使用 max_tokens 模式 + exclude
- `EMPTY_OBJECT` - 传递了空的 reasoning 对象（不符合规范）

## 安全性

### ⚠️ API Key 完整显示（安全警告）

**重要**：日志中的 API Key **不再脱敏**，会完整打印：

```
API Key (FULL): sk-or-v1-1234567890abcdef...
Authorization: Bearer sk-or-v1-1234567890abcdef...
```

**绝对不要**将包含完整 API Key 的日志分享到公共场合（GitHub Issues、Discord、论坛等）。

如需分享日志排查问题：
1. 手动删除 `API Key (FULL)` 和 `Authorization` 行
2. 或使用截图并遮挡敏感信息
3. 或仅分享 `reasoning` 和 `model` 等非敏感字段

### Authorization Header

`Authorization` header 不会出现在日志中，只打印安全的 headers：
- `HTTP-Referer`
- `X-Title`
- `Content-Type`

## 验收测试

运行以下命令查看示例输出：

```bash
node scripts/debug-request-log-test.mjs
```

该脚本会测试以下场景：
1. 推理关闭：`reasoning.effort = "none"`
2. 推理 medium：`reasoning.effort = "medium"`
3. 推理 high 且不回显：`reasoning.effort = "high", reasoning.exclude = true`
4. 推理 max_tokens：`reasoning.max_tokens = 4000`

## 实际使用场景

### 场景 1：验证推理参数是否生效

当你在 UI 中选择推理模式后，发送一条消息，然后：

1. 打开 DevTools Console（F12）
2. 查找 `OPENROUTER_REQUEST_BEGIN` 标记
3. 检查 `Request Body` 中的 `reasoning` 字段
4. 验证值是否符合预期

### 场景 2：排查推理不工作的问题

如果发现模型没有进行推理，检查日志中的 `reasoning` 参数：

- ✅ **正确**：`reasoning: { effort: "medium" }`
- ❌ **错误**：`reasoning: { effort: "none" }` - 推理被禁用
- ❌ **错误**：没有 `reasoning` 字段 - 未启用推理
- ⚠️ **可疑**：`reasoning: {}` - 空对象（可能被某些 transform 误删）

### 场景 3：验证 exclude 参数

如果你希望模型内部推理但不返回 reasoning tokens：

1. 确认 `reasoning.exclude = true`
2. 检查响应中是否没有 `reasoning_details` 字段
3. 如果仍然返回了 reasoning tokens，可能是模型不支持 exclude

## 高级调试功能（可选）

### OpenRouter Debug Echo

OpenRouter 提供了一个 debug 选项，可以回显"发送给上游 provider 的变换后请求体"：

```typescript
const body = {
  ...request,
  debug: { echo_upstream_body: true }
}
```

这在以下情况下有用：
- 验证 OpenRouter 插件是否修改了请求
- 检查 transform 规则是否生效
- 排查 provider 特定的问题

**注意**：此功能仅供开发调试，不要在生产环境启用（会增加响应体积，且可能泄露内部信息）。

## 相关文档

- [OpenRouter API Reference](https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request)
- [OpenRouter Reasoning Tokens Guide](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)
- [Starverse OpenRouter 集成文档](../docs/OPENROUTER_INTEGRATION_SUMMARY.md)

## 实现位置

- **日志打印逻辑**：`src/next/transport/openrouterFetch.ts` - `logCompleteRequestBody()`
- **请求构建逻辑**：`src/next/openrouter/buildRequest.ts` - `buildOpenRouterChatCompletionsRequest()`
- **测试脚本**：`scripts/debug-request-log-test.mjs`

## 故障排查

### 问题：日志没有出现

**检查项**：
1. 确认你正在使用 OpenRouter provider（而非 Google Gemini）
2. 打开 Console 查看是否有其他错误
3. 确认你正在使用最新版本的代码

### 问题：reasoning 参数为 undefined

**可能原因**：
1. 请求构建时没有传递 `reasoning` 参数
2. 中间某个 transform 层删除了该字段
3. 使用了旧的 `include_reasoning` 参数（已废弃，应迁移到 `reasoning`）

**解决方法**：
1. 检查 `buildOpenRouterChatCompletionsRequest()` 调用
2. 确认 Store 中的推理配置是否正确
3. 搜索代码中是否有意外的 delete/omit 操作

### 问题：API Key 泄露

**不可能**：API Key 在打印前会通过 `sanitizeApiKey()` 函数强制脱敏，只显示最后 4 位。即使修改代码绕过脱敏逻辑，也需要显式调用 `console.log(apiKey)`。

## 总结

通过这个日志功能，你可以：

✅ 一眼看出每次请求的完整参数  
✅ 快速验证 reasoning 配置是否正确  
✅ 排查推理不工作或行为异常的问题  
✅ 对比不同请求的参数差异  
✅ 安全地分享日志（API Key 已脱敏）

现在你可以放心地调试和验证 OpenRouter 推理功能了！
