/**
 * 临时调试补丁：在 ChatView.vue 中添加日志
 * 
 * 使用方法：
 * 1. 将这段代码插入到 ChatView.vue 的 normalizeUsagePayload 函数中
 * 2. 发送一条消息触发 AI 响应
 * 3. 查看控制台日志
 * 4. 记录 usage.raw 的实际内容
 */

// 在 ChatView.vue 的 normalizeUsagePayload 函数中，raw: payload 之前添加：

console.log('🔍 [DEBUG] usage payload 详细信息:')
console.log('  类型:', typeof payload)
console.log('  是否为对象:', payload && typeof payload === 'object')
console.log('  构造函数:', payload?.constructor?.name)
console.log('  键列表:', Object.keys(payload || {}))
console.log('  所有属性（包括不可枚举）:', Object.getOwnPropertyNames(payload || {}))

// 检查是否有函数
const hasFunctions = Object.entries(payload || {}).some(([key, value]) => typeof value === 'function')
console.log('  包含函数:', hasFunctions)

if (hasFunctions) {
  console.log('  函数属性:')
  Object.entries(payload || {}).forEach(([key, value]) => {
    if (typeof value === 'function') {
      console.log(`    - ${key}: ${value.toString().substring(0, 50)}...`)
    }
  })
}

// 检查原型链上的方法
console.log('  原型方法:', Object.getOwnPropertyNames(Object.getPrototypeOf(payload || {})))

// 尝试序列化
try {
  const serialized = JSON.stringify(payload)
  console.log('  JSON 序列化: ✅ 成功')
  console.log('  序列化后大小:', serialized.length, '字符')
} catch (e) {
  console.log('  JSON 序列化: ❌ 失败 -', e.message)
}

// 尝试克隆
try {
  structuredClone(payload)
  console.log('  structuredClone: ✅ 成功')
} catch (e) {
  console.log('  structuredClone: ❌ 失败 -', e.message)
}

// 实际内容预览
console.log('  内容预览:', JSON.stringify(payload, null, 2).substring(0, 500))

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
