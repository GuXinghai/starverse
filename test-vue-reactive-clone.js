/**
 * 测试 Vue reactive 包装后的对象是否可以克隆
 */

import { reactive, toRaw } from 'vue'

console.log('🧪 测试 Vue reactive 对象的 structuredClone\n')

// 测试 1: 普通对象
const plainObject = {
  prompt_tokens: 100,
  completion_tokens: 50,
  nested: {
    cached_tokens: 20
  }
}

console.log('1️⃣ 普通对象:')
try {
  structuredClone(plainObject)
  console.log('   ✅ 可以克隆')
} catch (e) {
  console.log('   ❌ 克隆失败:', e.message)
}

// 测试 2: reactive 包装的对象
const reactiveObject = reactive({
  prompt_tokens: 100,
  completion_tokens: 50,
  nested: {
    cached_tokens: 20
  }
})

console.log('\n2️⃣ Reactive 对象:')
console.log('   构造函数:', reactiveObject.constructor.name)
console.log('   是 Proxy?', typeof reactiveObject === 'object' && reactiveObject.constructor.name === 'Object')

try {
  structuredClone(reactiveObject)
  console.log('   ✅ 可以克隆')
} catch (e) {
  console.log('   ❌ 克隆失败:', e.message)
}

// 测试 3: toRaw 去除 reactive 包装
const rawObject = toRaw(reactiveObject)

console.log('\n3️⃣ toRaw 后的对象:')
console.log('   与原对象相同?', rawObject === plainObject)

try {
  structuredClone(rawObject)
  console.log('   ✅ 可以克隆')
} catch (e) {
  console.log('   ❌ 克隆失败:', e.message)
}

// 测试 4: 嵌套 reactive 对象
const nestedReactive = {
  usage: reactive({
    prompt_tokens: 100,
    raw: {
      prompt_tokens: 100,
      nested: {
        deep: 'value'
      }
    }
  })
}

console.log('\n4️⃣ 嵌套 reactive 对象:')
try {
  structuredClone(nestedReactive)
  console.log('   ✅ 可以克隆')
} catch (e) {
  console.log('   ❌ 克隆失败:', e.message)
}

// 测试 5: 深度 toRaw
function deepToRaw(obj) {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj
  }
  
  const raw = toRaw(obj)
  
  if (Array.isArray(raw)) {
    return raw.map(item => deepToRaw(item))
  }
  
  const result = {}
  for (const key in raw) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      result[key] = deepToRaw(raw[key])
    }
  }
  return result
}

const deepCleaned = deepToRaw(nestedReactive)

console.log('\n5️⃣ 深度 toRaw 后的对象:')
try {
  structuredClone(deepCleaned)
  console.log('   ✅ 可以克隆')
} catch (e) {
  console.log('   ❌ 克隆失败:', e.message)
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('结论:')
console.log('  - 普通对象: 可以克隆')
console.log('  - Reactive 对象: 可能可以克隆（取决于实现）')
console.log('  - toRaw 对象: 可以克隆')
console.log('  - 嵌套 reactive: 需要深度 toRaw')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
