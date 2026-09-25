# 消息发送卡住问题诊断指南

## 问题现象

用户点击发送按钮后：
- ✅ UI 创建了用户消息气泡
- ✅ UI 创建了 AI 回复占位气泡
- ❌ **但没有收到任何流式响应数据**
- ❌ **控制台日志在某个位置突然中断**

系统进入"伪发送"状态：前端认为消息已发出，但实际数据管道未通或被挂起。

---

## 🆕 自动恢复机制（v0.9.1+）

### 1. 超时自动重置（60秒）
如果发送请求 60 秒内没有响应，系统会自动：
- ⏱️ 触发超时保护机制
- 🧹 强制清理所有发送状态
- 💬 显示错误提示："发送超时（60秒无响应），已自动重置状态"
- ✅ 允许用户重新发送

### 2. 幽灵任务检测与清理
在每次发送前，系统会自动检测并清理"幽灵任务"（脏状态）：
- 🔍 检查是否存在遗留的 `pendingSend` 状态
- 🧹 如果检测到状态为 `'sent'` 但没有实际请求，强制清理
- 🚀 允许新任务正常执行

### 3. 上下文不匹配自动接管
如果 `finishPendingSend` 检测到上下文不匹配：
- 🔄 不再静默返回（旧行为）
- 🛠️ 强制接管：将当前任务设为全局状态
- ✅ 继续正常发送流程

---

## 日志追踪链路（完整路径）

已添加的诊断日志覆盖以下关键节点：

### 1. 用户触发发送 → 调度器
```
[useMessageSending] performSendMessage 调用
  ↓
[useMessageSending] 🔍 finishPendingSend 被调用
  ↓
[useMessageSending] 🚀 准备调用 sendMessageCore
```

### 2. 核心发送逻辑 → API 路由
```
[useMessageSending] 🎯 sendMessageCore 开始执行
  ↓
[useMessageSending] 🔍 进入 sendMessageCore try 块
  ↓
[useMessageSending] 📸 捕获历史快照
  ↓
[useMessageSending] 创建 AI 消息分支
  ↓
[useMessageSending] 🚀 发送 API 请求
  ↓
[useMessageSending] 📡 准备调用 aiChatService.streamChatResponse
```

### 3. 服务路由器 → Provider 选择
```
[aiChatService] 🎯 streamChatResponse 被调用
  ↓
[aiChatService] 🔍 获取 Provider 上下文
  ↓
[aiChatService] ✅ Provider 上下文获取成功
  ↓
[aiChatService] 🔧 构建 GenerationConfig
  ↓
[aiChatService] 🚀 准备调用 OpenRouterService.streamChatResponse
```

### 4. OpenRouter 服务 → 网络请求
```
[OpenRouterService] 🚀 使用新实现（Parser + Aggregator）
  ↓
[OpenRouterService] Request body built
  ↓
[OpenRouterService] 📡 准备发起 fetch 请求
  ↓
[OpenRouterService] ✅ fetch 返回响应  ← **关键节点！**
  ↓
[OpenRouterService] 开始读取流
```

### 5. 流式响应处理 → UI 更新
```
[useMessageSending] 🔄 已获取 stream 对象
  ↓
[useMessageSending] ⏳ 开始读取流（awaiting first chunk）
  ↓
[useMessageSending] 🎉 收到第一个 chunk
  ↓
[useMessageSending] 🔍 Received chunk
  ↓
[useMessageSending] ✅ Appending text token
```

---

## 故障定位策略

根据**日志中断点**判断问题类型：

### 情况 1：日志在 "准备发起 fetch 请求" 后中断
```
[OpenRouterService] 📡 准备发起 fetch 请求
[OpenRouterService] ✅ fetch 返回响应  ← **这条日志未出现**
```

**诊断**：网络请求卡在 Pending 状态

**可能原因**：
- 🔌 **VPN/代理未启动或失效**（最常见）
  - OpenRouter 需要代理才能访问
  - 代理配置错误导致连接超时
- 🌐 **DNS 解析失败**
  - 代理服务器无法解析 `openrouter.ai` 域名
- 🚧 **防火墙/网络隔离**
  - 企业防火墙拦截了 HTTPS 连接
- ⏱️ **服务端无响应**
  - OpenRouter API 服务端拥堵或宕机

**排查步骤**：
1. **检查 Network 面板**：
   - 打开 DevTools → Network → 找到 `openrouter.ai/api/v1/chat/completions` 请求
   - 查看状态：
     - `(pending)` → 网络层问题（代理/DNS/防火墙）
     - `200 OK` → 日志系统故障（不太可能）
     - `4xx/5xx` → API 错误（应该有错误日志）

2. **验证代理连接**：
   ```powershell
   # 测试代理是否工作
   curl -x http://127.0.0.1:7890 https://openrouter.ai
   
   # 或检查环境变量
   echo $env:HTTP_PROXY
   echo $env:HTTPS_PROXY
   ```

3. **检查 API Key 有效性**：
   - 确认 API Key 未过期
   - 确认账户余额充足

---

### 情况 2：日志在 "fetch 返回响应" 后显示错误
```
[OpenRouterService] ✅ fetch 返回响应 {status: 401, ok: false}
[OpenRouterService] ❌ API 错误响应
```

**诊断**：API 返回了错误响应

**常见错误码**：
- `401 Unauthorized` → API Key 无效或过期
- `402 Payment Required` → 账户余额不足
- `403 Forbidden` → IP 被封禁或访问限制
- `429 Too Many Requests` → 请求频率超限
- `500/502/503` → 服务端错误

**排查步骤**：
1. 查看 `errorText` 字段（日志中会显示前 500 字符）
2. 前往 OpenRouter 控制台检查账户状态
3. 验证 API Key：
   ```javascript
   // 在控制台执行
   useAppStore().openRouterApiKey
   ```

---

### 情况 3：日志在 "开始读取流" 后中断
```
[useMessageSending] ⏳ 开始读取流（awaiting first chunk）
[useMessageSending] 🎉 收到第一个 chunk  ← **这条日志未出现**
```

**诊断**：流对象创建成功，但读取第一个 chunk 时挂起

**可能原因**：
- 📡 **SSE 连接建立但无数据下发**
  - 服务端接受了请求但未开始生成
  - 可能是模型加载延迟（大模型冷启动）
- 🔒 **浏览器连接被挂起**
  - 达到浏览器并发连接限制（6 个/域名）
  - 之前的请求未正确关闭
- 🐛 **Response Stream 实现 Bug**
  - Electron fetch 实现与浏览器有细微差异
  - TextDecoder/Reader 状态异常

**排查步骤**：
1. **检查 Network 面板**：
   - 请求状态应为 `200 OK` 且 Type 为 `text/event-stream`
   - 查看 Response 标签，是否有 `data:` 开头的 SSE 数据
   - 如果看到数据但日志未更新 → 流解析问题

2. **检查浏览器连接池**：
   ```javascript
   // 控制台执行，查看是否有未关闭的请求
   performance.getEntriesByType('resource')
     .filter(r => r.name.includes('openrouter'))
     .forEach(r => console.log(r.name, r.duration))
   ```

3. **手动中止测试**：
   - 点击停止按钮（如果有）
   - 刷新页面
   - 再次发送，观察是否正常

---

### 情况 4：日志在 "收到第一个 chunk" 后出现大量警告
```
[useMessageSending] 🎉 收到第一个 chunk
[useMessageSending] 🔍 Received chunk: {type: 'unknown', ...}
[useMessageSending] ⚠️ Unhandled chunk type: unknown
```

**诊断**：流数据格式不符合预期

**可能原因**：
- 🔄 **Provider 返回格式变更**
  - OpenRouter API 更新了响应格式
  - 新增了未处理的 chunk 类型
- 🧩 **模型特定格式**
  - 某些模型（如 DeepSeek）使用特殊字段
  - 推理模型返回了非标准结构

**排查步骤**：
1. 查看警告日志中的完整 chunk 结构
2. 对比 OpenRouter API 文档
3. 如需兼容，在 `processStreamChunk` 中添加处理逻辑

---

## 快速检查清单

在控制台依次执行以下检查：

### ✅ 1. 验证 Store 状态
```javascript
const appStore = useAppStore()
console.log({
  provider: appStore.activeProvider,
  apiKey: appStore.openRouterApiKey ? '已设置' : '未设置',
  modelId: appStore.currentModelId
})
```

### ✅ 2. 验证网络连接
打开 DevTools → Network → 过滤 `openrouter` → 观察请求状态

### ✅ 3. 验证 AbortController
```javascript
const { abortController } = useMessageSending(/* ... */)
console.log('是否有挂起的请求:', !!abortController.value)
```

### ✅ 4. 手动清理状态
```javascript
// 如果发现状态卡死，执行清理
const store = useConversationStore()
store.setGenerationStatus(conversationId, false)
```

---

## 常见解决方案

### 方案 0：强制重置状态（最快）⭐
如果状态卡死，在浏览器控制台执行：
```javascript
// 方法 1：使用暴露的恢复方法
const chatView = document.querySelector('[data-chat-view]')?.__vueParentComponent?.ctx
chatView?.forceResetSendingState?.()

// 方法 2：刷新页面（简单粗暴）
location.reload()
```

**注意**：新版本（v0.9.1+）已内置 60 秒超时自动恢复，大多数情况下无需手动操作。

### 方案 1：重启代理（适用于网络问题）
```powershell
# 停止代理
# 启动代理（例如 Clash/V2Ray）
# 验证连接
curl -x http://127.0.0.1:7890 https://www.google.com
```

### 方案 2：清空应用缓存
```powershell
# Windows
cd {repo-root}
.\clear-all-data.ps1

# 重启应用
npm run dev
```

### 方案 3：切换模型测试
- 在 UI 中切换到其他模型（如 `gpt-4o`）
- 如果其他模型正常 → DeepSeek 特定问题
- 如果都不正常 → 基础设施问题（网络/API Key）

### 方案 4：降级到旧实现
```typescript
// 在 OpenRouterService.ts 中修改
const USE_NEW_IMPLEMENTATION = false  // 改为 false
```
然后重启应用，观察是否正常。

---

## 技术细节：为什么会"伪发送"？

### 设计逻辑
1. **乐观 UI 更新**（Optimistic Update）
   - 用户点击发送 → 立即显示消息（提升响应速度）
   - 同时在后台发起网络请求

2. **异步解耦**
   - UI 状态（Store）与网络请求（Promise）是独立的
   - UI 不等待网络结果就完成渲染

3. **状态同步点**
   - 仅在收到第一个 chunk 时才确认"发送成功"
   - 如果网络卡住，UI 状态无法回滚（设计权衡）

### 改进方向
- [ ] 添加"发送超时"检测（10 秒无响应 → 显示错误）
- [ ] 提供"撤销发送"按钮（网络请求前）
- [ ] 显示"等待响应中…"加载动画
- [ ] 记录失败原因到对话历史（便于用户重试）

---

## 相关文件

- **核心逻辑**：`src/composables/useMessageSending.ts`
- **路由器**：`src/services/aiChatService.js`
- **Provider**：`src/services/providers/OpenRouterService.ts`
- **Store**：`src/stores/branch.ts`, `src/stores/conversation.ts`
- **测试**：`tests/unit/services/gemini/streamChunkConverter.test.ts`

---

## 贡献者备注

如果您遇到了新的卡住场景，请：
1. 复制完整的控制台日志（从发送到卡住）
2. 记录 Network 面板的请求详情
3. 附上复现步骤
4. 提交到 GitHub Issues
