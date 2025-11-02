# 模型列表获取问题排查指南

## 🔍 已增强的调试日志

我已经在三个关键文件中添加了详细的调试日志，帮助你追踪问题：

### 1️⃣ 节点一：是否成功发送请求

**检查位置**: `src/services/geminiService.js` - `listAvailableModels` 函数

**日志输出**:
```
=== geminiService: 开始获取模型列表 ===
1. API Key 长度: XX
1. API Key 前10个字符: AIzaSyXXXX...
2. 正在初始化 GoogleGenerativeAI 客户端...
2. ✓ GoogleGenerativeAI 客户端初始化成功
3. 正在调用 listModels() API...
```

**可能的问题**:
- ❌ 如果卡在步骤2：API Key 可能无效
- ❌ 如果卡在步骤3：网络连接问题或 API 限制

---

### 2️⃣ 节点二：是否获取到 model list

**检查位置**: `src/services/geminiService.js` - `listAvailableModels` 函数

**日志输出**:
```
3. ✓ API 请求成功，返回的模型数量: X
3. 原始模型列表: [...]
4. 开始筛选支持 generateContent 的模型...
   - 检查模型: models/gemini-pro
     支持的方法: ['generateContent', 'countTokens']
     ✓ 该模型支持 generateContent，已添加
5. ✓ 筛选完成！
5. 最终聊天模型列表: ['models/gemini-pro', ...]
5. 聊天模型数量: X
=== geminiService: 模型列表获取完成 ===
```

**可能的问题**:
- ❌ 如果模型数量为 0：API 返回了空列表
- ❌ 如果没有模型支持 generateContent：筛选逻辑问题

---

### 3️⃣ 节点三：是否成功刷新列表

**检查位置**: 
- `src/components/ChatView.vue` - `onMounted` 钩子
- `src/stores/chatStore.js` - `setAvailableModels` 方法

**ChatView 日志输出**:
```
=== ChatView: onMounted 开始执行 ===
1. 开始加载 API Key...
1. ✓ API Key 加载完成
1. chatStore.apiKey 是否存在: true
2. ✓ API Key 存在，开始加载模型列表...
3. 调用 listAvailableModels...
3. ✓ listAvailableModels 返回结果: [...]
3. 返回的模型数量: X
4. 调用 chatStore.setAvailableModels...
4. ✓ setAvailableModels 调用完成
5. 验证 store 中的值:
   chatStore.availableModels: [...]
   chatStore.availableModels.length: X
✓✓✓ 模型列表加载成功！✓✓✓
=== ChatView: onMounted 执行完成 ===
```

**chatStore 日志输出**:
```
=== chatStore: setAvailableModels 被调用 ===
传入的参数类型: object
传入的参数: [...]
✓ 参数验证通过，开始更新 availableModels.value
更新前的值: []
更新后的值: [...]
更新后的长度: X
=== chatStore: 可用模型列表已更新完成 ===
```

**可能的问题**:
- ❌ 如果没有看到 ChatView 日志：组件没有挂载
- ❌ 如果 API Key 不存在：需要先配置 API Key
- ❌ 如果 setAvailableModels 没被调用：listAvailableModels 可能抛出错误
- ❌ 如果更新后长度仍为 0：数据没有正确传递

---

## 🧪 如何使用这些日志进行排查

### 步骤 1: 打开开发者工具

1. 运行应用：`npm run dev`
2. 打开浏览器开发者工具 (F12)
3. 切换到 Console 标签

### 步骤 2: 重新加载页面

刷新页面，观察控制台输出

### 步骤 3: 按节点检查

#### ✅ 节点一通过的标志
```
2. ✓ GoogleGenerativeAI 客户端初始化成功
3. 正在调用 listModels() API...
```

#### ✅ 节点二通过的标志
```
3. ✓ API 请求成功，返回的模型数量: > 0
5. 聊天模型数量: > 0
```

#### ✅ 节点三通过的标志
```
✓✓✓ 模型列表加载成功！✓✓✓
chatStore.availableModels.length: > 0
```

---

## 🐛 常见问题及解决方案

### 问题 1: API Key 无效
**症状**: 卡在步骤2或出现认证错误
**解决**: 
1. 检查 API Key 是否正确
2. 前往 https://makersuite.google.com/app/apikey 验证密钥
3. 在设置页面重新配置

### 问题 2: 网络连接问题
**症状**: 请求超时或网络错误
**解决**:
1. 检查网络连接
2. 检查防火墙设置
3. 确认可以访问 Google AI 服务

### 问题 3: 模型列表为空
**症状**: 返回空数组
**解决**:
1. 检查 API Key 权限
2. 查看原始模型列表输出
3. 检查筛选条件是否正确

### 问题 4: Store 未更新
**症状**: setAvailableModels 被调用但界面不更新
**解决**:
1. 检查 ModelSelector 组件是否正确渲染
2. 验证响应式数据绑定
3. 查看浏览器控制台是否有 Vue 警告

---

## 📋 检查清单

运行应用后，在控制台查找以下关键日志：

- [ ] `=== geminiService: 开始获取模型列表 ===`
- [ ] `2. ✓ GoogleGenerativeAI 客户端初始化成功`
- [ ] `3. ✓ API 请求成功，返回的模型数量: X`
- [ ] `5. 聊天模型数量: X` (X > 0)
- [ ] `=== ChatView: onMounted 开始执行 ===`
- [ ] `1. chatStore.apiKey 是否存在: true`
- [ ] `3. ✓ listAvailableModels 返回结果: [...]`
- [ ] `=== chatStore: setAvailableModels 被调用 ===`
- [ ] `更新后的长度: X` (X > 0)
- [ ] `✓✓✓ 模型列表加载成功！✓✓✓`

---

## 💡 下一步

1. **运行应用并查看控制台**
2. **截图或复制完整的日志输出**
3. **找出在哪个节点失败**
4. **根据上述解决方案进行修复**

如果所有日志都正常但 UI 仍未更新，可能是 ModelSelector 组件的问题，需要进一步检查组件渲染逻辑。
