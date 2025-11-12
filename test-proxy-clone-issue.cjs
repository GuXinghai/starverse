/**
 * 测试 Vue 3 响应式 Proxy 克隆问题
 * 
 * 问题：当直接赋值一个新对象到响应式对象的属性时，
 * Vue 会自动将新对象包装成 Proxy，导致无法通过 structuredClone 克隆
 */

const { ref } = require('vue')
const util = require('util')

console.log('========== 测试场景 1: 直接赋值（会出错）==========')
const data1 = ref({
  id: 'test-1',
  reasoningPreference: {
    visibility: 'visible',
    effort: 'medium',
    maxTokens: null
  }
})

const conv1 = data1.value
console.log('1. 原始对象是 Proxy?', util.types.isProxy(conv1))
console.log('2. reasoningPreference 是 Proxy?', util.types.isProxy(conv1.reasoningPreference))

// 模拟 setConversationReasoningPreference 的操作
const normalized = {
  visibility: 'visible',
  effort: 'high',
  maxTokens: null
}
conv1.reasoningPreference = normalized

console.log('3. 赋值后 reasoningPreference 是 Proxy?', util.types.isProxy(conv1.reasoningPreference))

try {
  structuredClone(conv1)
  console.log('✓ 克隆成功')
} catch (e) {
  console.log('✗ 克隆失败:', e.message)
}

console.log('\n========== 测试场景 2: 使用 toRaw 解包（推荐方案）==========')
const { toRaw } = require('vue')

const data2 = ref({
  id: 'test-2',
  reasoningPreference: {
    visibility: 'visible',
    effort: 'medium',
    maxTokens: null
  }
})

const conv2 = data2.value
const normalized2 = {
  visibility: 'visible',
  effort: 'high',
  maxTokens: null
}
conv2.reasoningPreference = normalized2

console.log('1. reasoningPreference 是 Proxy?', util.types.isProxy(conv2.reasoningPreference))

// 在克隆前使用 toRaw 去除 Proxy
const rawConv = toRaw(conv2)
console.log('2. toRaw 后的对象是 Proxy?', util.types.isProxy(rawConv))
console.log('3. toRaw 后的 reasoningPreference 是 Proxy?', util.types.isProxy(rawConv.reasoningPreference))

try {
  structuredClone(rawConv)
  console.log('✓ 克隆成功')
} catch (e) {
  console.log('✗ 克隆失败:', e.message)
}

console.log('\n========== 测试场景 3: JSON 序列化/反序列化（替代方案）==========')
const data3 = ref({
  id: 'test-3',
  reasoningPreference: {
    visibility: 'visible',
    effort: 'medium',
    maxTokens: null
  }
})

const conv3 = data3.value
conv3.reasoningPreference = { visibility: 'visible', effort: 'high', maxTokens: null }

try {
  const cloned = JSON.parse(JSON.stringify(conv3))
  console.log('✓ JSON 序列化成功')
  console.log('克隆后的对象:', cloned)
} catch (e) {
  console.log('✗ JSON 序列化失败:', e.message)
}

console.log('\n========== 测试场景 4: 递归 toRaw（深度解包）==========')

function deepToRaw(obj) {
  const raw = toRaw(obj)
  if (raw && typeof raw === 'object') {
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
  return raw
}

const data4 = ref({
  id: 'test-4',
  reasoningPreference: {
    visibility: 'visible',
    effort: 'medium',
    maxTokens: null
  },
  nested: {
    deep: {
      value: 42
    }
  }
})

const conv4 = data4.value
conv4.reasoningPreference = { visibility: 'visible', effort: 'high', maxTokens: null }

const deepRaw = deepToRaw(conv4)
console.log('1. deepToRaw 后是 Proxy?', util.types.isProxy(deepRaw))
console.log('2. deepToRaw 后 reasoningPreference 是 Proxy?', util.types.isProxy(deepRaw.reasoningPreference))
console.log('3. deepToRaw 后 nested 是 Proxy?', util.types.isProxy(deepRaw.nested))

try {
  structuredClone(deepRaw)
  console.log('✓ 克隆成功')
} catch (e) {
  console.log('✗ 克隆失败:', e.message)
}
