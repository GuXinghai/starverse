# 调试 usage.raw 对象内容

## 📋 调试目的

确定 `usage.raw` 字段究竟包含了什么导致 `structuredClone` 失败的对象。

## 🔧 已添加的调试代码

在 `src/components/ChatView.vue` 的 `normalizeUsagePayload` 函数开头添加了详细的调试日志：

```typescript
// 🔍 临时调试：记录 usage payload 的详细信息
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('🔍 [DEBUG] usage payload 详细信息:')
console.log('  类型:', typeof payload)
console.log('  构造函数:', payload?.constructor?.name)
console.log('  键列表:', Object.keys(payload || {}))

// 检查是否有函数
const functionProps: string[] = []
Object.entries(payload || {}).forEach(([key, value]) => {
  if (typeof value === 'function') {
    functionProps.push(key)
  }
})
console.log('  包含函数属性:', functionProps.length > 0 ? functionProps : '无')

// 检查原型链
const proto = Object.getPrototypeOf(payload || {})
const protoMethods = proto !== Object.prototype ? Object.getOwnPropertyNames(proto) : []
console.log('  原型方法:', protoMethods.length > 0 ? protoMethods : '标准 Object')

// 尝试序列化测试
try {
  const serialized = JSON.stringify(payload)
  console.log('  JSON 序列化: ✅ 成功 (', serialized.length, '字符)')
} catch (e: any) {
  console.log('  JSON 序列化: ❌ 失败 -', e?.message || String(e))
}

// 尝试克隆测试
try {
  structuredClone(payload)
  console.log('  structuredClone: ✅ 成功')
} catch (e: any) {
  console.log('  structuredClone: ❌ 失败 -', e?.message || String(e))
}

// 内容预览
console.log('  内容预览:', JSON.stringify(payload, null, 2).substring(0, 300))
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
```

## 📊 调试信息说明

调试日志会输出以下信息：

1. **类型检查**
   - `typeof payload` - 确认是否为对象
   - `constructor.name` - 对象的构造函数名称

2. **属性检查**
   - `Object.keys()` - 所有可枚举的键
   - 函数属性列表 - 如果包含函数，会列出函数名

3. **原型链检查**
   - 原型方法列表 - 检查是否有自定义原型方法

4. **序列化测试**
   - JSON 序列化测试 - 是否包含不可序列化的数据
   - structuredClone 测试 - 是否包含不可克隆的对象

5. **内容预览**
   - 前 300 字符的 JSON 内容预览

## 🧪 如何查看调试信息

### 方法 1：在应用中测试

1. 启动开发服务器（如果尚未启动）：
   ```bash
   npm run dev
   ```

2. 在浏览器中打开应用

3. 打开浏览器开发者工具的 Console 面板

4. 发送一条消息给 AI

5. 查看控制台中的调试输出，格式如下：
   ```
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🔍 [DEBUG] usage payload 详细信息:
     类型: object
     构造函数: Object
     键列表: ['prompt_tokens', 'completion_tokens', ...]
     包含函数属性: 无
     原型方法: 标准 Object
     JSON 序列化: ✅ 成功 ( 150 字符)
     structuredClone: ✅ 成功
     内容预览: { "prompt_tokens": 100, ... }
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ```

### 方法 2：检查错误日志

如果错误再次出现，查看错误堆栈：
```
❌ 保存对话失败: Error: An object could not be cloned.
```

错误发生前应该会先输出调试信息，可以看到：
- ✅ 如果 `structuredClone: ✅ 成功` - 说明原始 payload 是可克隆的
- ❌ 如果 `structuredClone: ❌ 失败` - 说明原始 payload 就有问题

## 🔍 预期发现

根据测试和代码分析，`payload` 可能包含：

### 场景 A：标准的 OpenRouter 响应（正常情况）
```json
{
  "prompt_tokens": 100,
  "completion_tokens": 50,
  "total_tokens": 150,
  "prompt_tokens_details": {
    "cached_tokens": 20
  },
  "completion_tokens_details": {
    "reasoning_tokens": 10
  }
}
```
- ✅ 没有函数
- ✅ 标准 Object 原型
- ✅ 可以 JSON 序列化
- ✅ 可以 structuredClone

### 场景 B：包含函数的响应对象（问题场景）
```javascript
{
  prompt_tokens: 100,
  completion_tokens: 50,
  toString: function() { return "usage" },  // ❌ 函数！
  toJSON: function() { return {...} }       // ❌ 函数！
}
```
- ❌ 包含函数属性
- ⚠️ 可能有自定义原型
- ✅ 可以 JSON 序列化（函数会被忽略）
- ❌ 不能 structuredClone（函数导致失败）

### 场景 C：代理对象或特殊对象
```javascript
new Proxy({ prompt_tokens: 100 }, {
  get: function() { ... }  // ❌ 代理陷阱
})
```
- ⚠️ Proxy 构造函数
- ❌ 包含代理处理器
- ⚠️ 取决于代理实现
- ❌ 可能不能 structuredClone

## 📝 下一步

1. **运行应用并发送消息** - 触发 usage 捕获
2. **查看控制台输出** - 分析 payload 的实际结构
3. **记录发现** - 确定是哪种场景
4. **实施修复** - 根据实际情况选择修复方案

## 🧹 清理调试代码

调试完成后，记得删除这些调试日志：

```bash
# 搜索并删除调试代码块（在 ChatView.vue 中）
# 查找标记：🔍 临时调试
```

或者保留但改为条件输出：
```typescript
if (import.meta.env.DEV) {
  console.log('🔍 [DEBUG] usage payload:', payload)
}
```

---

**状态**：🔍 调试代码已添加，等待实际运行测试
**位置**：`src/components/ChatView.vue` - `normalizeUsagePayload` 函数
