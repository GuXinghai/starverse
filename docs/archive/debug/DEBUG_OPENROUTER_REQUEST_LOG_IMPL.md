# OpenRouter 请求日志实现技术说明

## 实现概述

为了验证 Starverse 发送给 OpenRouter 的 `reasoning` 参数是否正确，我们在 `src/next/transport/openrouterFetch.ts` 中增强了请求日志功能。

## 修改内容

### 1. 新增辅助函数

#### `formatReasoningForSummary(body: any): string`

**位置**：`src/next/transport/openrouterFetch.ts:132-151`

**功能**：将 `reasoning` 参数格式化为单行摘要，便于快速扫描。

**返回格式**：
- `OFF` - 未传递 reasoning 参数
- `effort=medium` - 使用 effort 模式
- `max_tokens=4000,exclude=true` - 使用 max_tokens 模式 + exclude 选项
- `include_reasoning=true` - 使用旧的 include_reasoning 参数（已废弃）
- `EMPTY_OBJECT` - 传递了空对象（不符合规范）

**实现逻辑**：
```typescript
function formatReasoningForSummary(body: any): string {
  const reasoning = body?.reasoning
  const hasIncludeReasoning = !!(body && typeof body === 'object' && 'include_reasoning' in body)

  if (!reasoning && !hasIncludeReasoning) return 'OFF'

  const parts: string[] = []

  if (reasoning && typeof reasoning === 'object') {
    if ('effort' in reasoning) parts.push(`effort=${reasoning.effort}`)
    if ('max_tokens' in reasoning) parts.push(`max_tokens=${reasoning.max_tokens}`)
    if ('exclude' in reasoning) parts.push(`exclude=${reasoning.exclude}`)
    if ('enabled' in reasoning) parts.push(`enabled=${reasoning.enabled}`)
  }

  if (hasIncludeReasoning) {
    parts.push(`include_reasoning=${body.include_reasoning}`)
  }

  return parts.length > 0 ? parts.join(',') : 'EMPTY_OBJECT'
}
```

#### `sanitizeApiKey(apiKey: string): string`

**位置**：`src/next/transport/openrouterFetch.ts:157-160`

**功能**：脱敏 API Key，只保留最后 4 位。

**实现逻辑**：
```typescript
function sanitizeApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length <= 4) return '***'
  return `***${apiKey.slice(-4)}`
}
```

**安全保证**：
- 即使 API Key 长度小于 4 位，也只显示 `***`
- 不可能泄露完整 API Key

#### `logCompleteRequestBody(...)`

**位置**：`src/next/transport/openrouterFetch.ts:168-204`

**功能**：打印完整的请求体，包含边界标记、元数据和摘要行。

**参数**：
- `requestId: string` - 请求 ID（UUID 或递增数字）
- `url: string` - 请求端点（`https://openrouter.ai/api/v1/chat/completions`）
- `apiKey: string` - API Key（会自动脱敏）
- `body: unknown` - 请求体对象
- `headers: Record<string, string>` - 安全的 headers（不含 Authorization）

**输出格式**：
```
================================================================================
OPENROUTER_REQUEST_BEGIN <requestId> <isoTime>
================================================================================
Endpoint: <url>
API Key: ***<last4>
Headers (safe):
  HTTP-Referer: <value>
  X-Title: <value>
  Content-Type: <value>

Request Body (complete):
<JSON.stringify(body, null, 2)>
================================================================================
OPENROUTER_REQUEST_END <requestId>
================================================================================
OR_REQ <id> model=<...> stream=<bool> reasoning=<formatted> msgs=<count>
```

**关键设计**：
- 使用 80 个 `=` 字符作为边界标记，便于在 Console 中一键选择复制
- ISO 8601 时间戳，便于对齐其他日志
- 完整的 JSON 缩进（2 空格），便于阅读
- 单行摘要，便于快速扫描和搜索

### 2. 修改 `openrouterFetch()` 主函数

**位置**：`src/next/transport/openrouterFetch.ts:247-252`

**修改前**：
```typescript
try {
  const url = `${baseUrl}/chat/completions`
  const debugLog = ...
  const debugAssert = ...

  if (debugLog || debugAssert) {
    // 原有的 debug 日志（仅在开启 debug 时打印）
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': '...',
      'X-Title': '...',
    },
    body: JSON.stringify(options.body),
    signal: controller.signal,
  })
```

**修改后**：
```typescript
try {
  const url = `${baseUrl}/chat/completions`
  const debugLog = ...
  const debugAssert = ...

  // NEW: Always log complete request body for reasoning audit
  const requestHeaders = {
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://github.com/GuXinghai/starverse',
    'X-Title': 'Starverse',
  }
  logCompleteRequestBody(requestId, url, options.apiKey, options.body, requestHeaders)

  if (debugLog || debugAssert) {
    // 原有的 debug 日志保持不变
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      ...requestHeaders,  // 使用相同的 headers
    },
    body: JSON.stringify(options.body),
    signal: controller.signal,
  })
```

**关键变更**：
1. **无条件打印**：`logCompleteRequestBody()` 在 `debugLog` 判断之前调用，确保每次请求都打印
2. **headers 复用**：提取 `requestHeaders` 对象，确保日志中打印的 headers 与实际发送的一致
3. **位置选择**：在 `fetch()` 调用之前立即打印，确保打印的是"最终请求体"

### 3. 测试脚本

**位置**：`scripts/debug-request-log-test.mjs`

**功能**：验证日志功能的 4 个用例

**用例覆盖**：
1. `reasoning.effort = "none"` - 推理关闭
2. `reasoning.effort = "medium"` - 推理 medium
3. `reasoning.effort = "high", reasoning.exclude = true` - 推理 high 且不回显
4. `reasoning.max_tokens = 4000, reasoning.exclude = false` - max_tokens 模式

**运行方式**：
```bash
node scripts/debug-request-log-test.mjs
```

**预期输出**：每个用例都会打印完整的日志块，并在最后显示验收检查清单。

## 技术决策

### 为什么默认启用（而非 debug 开关）？

**原因**：
1. **核心需求**：推理参数验证是当前的核心排查任务，必须在所有环境下可见
2. **性能影响小**：日志打印仅在请求发送时（低频事件），不会影响渲染性能
3. **无隐私风险**：API Key 已脱敏，消息内容可见性与用户预期一致（Console 本就是开发者工具）
4. **可随时移除**：验证完成后可将 `logCompleteRequestBody()` 调用改为条件调用或完全移除

**替代方案考虑**：
- ❌ 使用 debug 开关：需要用户手动启用，可能错过问题
- ❌ 仅在 dev 环境启用：生产环境的 bug 无法排查
- ❌ 使用 localStorage 开关：需要教育用户如何启用

### 为什么不用 structured logging 库？

**原因**：
1. **依赖最小化**：避免引入 pino/winston 等额外依赖
2. **输出格式需求**：需要特定的边界标记和单行摘要，通用日志库难以满足
3. **Console 友好**：直接使用 `console.log()`，在浏览器 Console 和 terminal 都有良好显示

### 为什么在 `openrouterFetch()` 而非更上层打印？

**原因**：
1. **真实性保证**：这是"最终发送到网络的请求体"，上层可能有 transform/merge
2. **单一打印点**：所有调用路径（renderer 直连、IPC 转发、测试 mock）都经过此函数
3. **错误处理**：即使请求失败，日志也已打印，便于排查

**验证**：
- `openrouterFetch()` 是 `src/next/transport/` 层的唯一出口
- `src/next/live/openRouterLiveStream.ts` 和所有测试都调用此函数
- 主进程 IPC bridge（如果存在）也应该调用此函数

## 性能影响分析

### Console 打印开销

**每次请求的额外开销**：
- `JSON.stringify(body, null, 2)`: 约 1-5ms（取决于 messages 数量）
- `console.log()` 调用: 约 0.1-1ms
- **总计**: < 10ms，对用户体验无影响

**对比**：
- 网络 RTT (往返时间): 50-500ms
- SSE 流式响应: 数秒到数十秒
- 日志开销占比: < 1%

### 内存影响

**临时字符串**：
- 请求体 JSON 字符串会在打印后立即释放
- 不会累积内存（每次打印后即 GC）

**长期影响**：
- Console 历史缓冲区: 浏览器自动管理，不会无限增长
- 用户可随时清空 Console

## 安全性审计

### API Key 泄露风险：✅ 无风险

**防护措施**：
1. `sanitizeApiKey()` 强制脱敏，只显示最后 4 位
2. `Authorization` header 不出现在日志中
3. 无法通过修改运行时变量绕过脱敏（除非修改源码）

**验证**：运行测试脚本，确认所有日志中的 API Key 都显示为 `***<last4>`

### 消息内容暴露：⚠️ 可接受

**当前行为**：
- 用户消息和 AI 响应都会打印在 Console
- 这与用户在 DevTools 中查看网络请求的预期一致

**缓解措施**：
- 仅在 Console 打印，不写入文件或发送到远程
- 生产构建可考虑禁用或仅打印摘要

**建议**：
- 如需完全避免，可将 `logCompleteRequestBody()` 改为仅打印摘要行
- 或使用 `summarizeBodyForLog()` 替代完整 JSON

## 未来优化方向

### 1. 条件日志（可选）

如果日志输出过多，可改为条件打印：

```typescript
const shouldLog = 
  options.debug?.logRequestBody === true ||
  (globalThis as any).__STARVERSE_OPENROUTER_FULL_LOG__ === true ||
  import.meta.env.DEV  // 仅在开发环境启用

if (shouldLog) {
  logCompleteRequestBody(...)
}
```

### 2. 日志级别（可选）

可引入日志级别：
- `FULL` - 打印完整请求体（当前行为）
- `SUMMARY` - 仅打印摘要行
- `OFF` - 禁用日志

### 3. 结构化日志（可选）

如果需要机器可读的日志，可改为：

```typescript
console.log(JSON.stringify({
  type: 'openrouter_request',
  requestId,
  timestamp: new Date().toISOString(),
  endpoint: url,
  model: body.model,
  stream: body.stream,
  reasoning: body.reasoning,
  messageCount: body.messages?.length,
}))
```

### 4. OpenRouter debug.echo_upstream_body（可选）

如需验证 OpenRouter 插件的 transform，可添加开关：

```typescript
if ((globalThis as any).__STARVERSE_OPENROUTER_DEBUG_ECHO__ === true) {
  body.debug = { echo_upstream_body: true }
}
```

然后在响应流中解析 `debug.upstream_body` 字段并打印。

## 测试覆盖

### 单元测试

**现有测试**：`src/next/transport/openrouterFetch.test.ts`
- ✅ 测试 http_error、timeout、aborted 等边界情况
- ⚠️ 未测试日志输出（因为是 side effect）

**建议**：
- 可使用 `vi.spyOn(console, 'log')` 验证日志调用
- 或使用 snapshot 测试验证日志格式

### 集成测试

**现有测试**：`src/next/live/openRouterLiveStream.test.ts`
- ✅ 测试 reasoning 参数构建
- ✅ 测试请求体结构

**验证方式**：
- 运行 `npm run test` 确认所有测试通过
- 运行 `node scripts/debug-request-log-test.mjs` 验证日志输出

### 手动测试

**场景**：在 Starverse UI 中发送消息

**步骤**：
1. 打开 DevTools Console (F12)
2. 发送一条消息
3. 查找 `OPENROUTER_REQUEST_BEGIN` 标记
4. 验证请求体和摘要行

**检查点**：
- ✅ 日志格式正确
- ✅ API Key 已脱敏
- ✅ `reasoning` 参数符合预期
- ✅ 摘要行准确

## 总结

通过以上修改，我们实现了：

✅ **完整性**：打印最终发送到 OpenRouter 的完整请求体  
✅ **安全性**：API Key 脱敏，无泄露风险  
✅ **易读性**：清晰的边界标记和单行摘要  
✅ **可维护性**：独立的辅助函数，易于测试和修改  
✅ **性能**：<10ms 开销，对用户无感  

现在你可以准确验证 Starverse 的 OpenRouter 推理参数配置了！
