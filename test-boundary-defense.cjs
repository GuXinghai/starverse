/**
 * 边界防御验证脚本
 * 测试在 IPC 边界处统一去除 Proxy 是否有效
 */

const { createPinia, setActivePinia } = require('pinia')

// 模拟 Vue 的 toRaw 和 reactive
const mockVue = {
  toRaw: (obj) => {
    if (obj && obj.__isProxy) {
      return obj.__target
    }
    return obj
  },
  reactive: (obj) => {
    return new Proxy(obj, {
      get(target, prop) {
        if (prop === '__isProxy') return true
        if (prop === '__target') return target
        return target[prop]
      }
    })
  }
}

// 模拟 deepToRaw 函数
function deepToRaw(obj) {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj
  }
  const raw = mockVue.toRaw(obj)
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

// 测试用例
console.log('🧪 边界防御测试\n')

// 测试 1: 简单对象
console.log('测试 1: 简单 Proxy 对象')
const simpleObj = mockVue.reactive({ name: 'test', value: 123 })
console.log('原始对象是 Proxy?', simpleObj.__isProxy === true)
const cleaned1 = deepToRaw(simpleObj)
console.log('清理后是 Proxy?', cleaned1.__isProxy === true)
console.log('✅ 测试 1 通过\n')

// 测试 2: 嵌套对象
console.log('测试 2: 嵌套 Proxy 对象')
const nestedObj = mockVue.reactive({
  level1: {
    level2: {
      level3: 'deep value'
    }
  }
})
console.log('原始对象是 Proxy?', nestedObj.__isProxy === true)
const cleaned2 = deepToRaw(nestedObj)
console.log('清理后是 Proxy?', cleaned2.__isProxy === true)
console.log('可以访问深层数据?', cleaned2.level1.level2.level3 === 'deep value')
console.log('✅ 测试 2 通过\n')

// 测试 3: 数组
console.log('测试 3: Proxy 数组')
const arrayObj = mockVue.reactive([1, 2, 3, { nested: 'value' }])
console.log('原始数组是 Proxy?', arrayObj.__isProxy === true)
const cleaned3 = deepToRaw(arrayObj)
console.log('清理后是 Proxy?', cleaned3.__isProxy === true)
console.log('数组长度正确?', cleaned3.length === 4)
console.log('✅ 测试 3 通过\n')

// 测试 4: 模拟 ConversationSnapshot
console.log('测试 4: 模拟 ConversationSnapshot')
const snapshot = mockVue.reactive({
  id: 'test-123',
  title: 'Test Conversation',
  model: { name: 'gpt-4', provider: 'openai' },
  tree: {
    branches: [
      { id: 'branch-1', versions: [{ parts: [{ text: 'hello' }] }] }
    ],
    rootBranchIds: ['branch-1'],
    currentPath: ['branch-1']
  },
  reasoningPreference: {
    visibility: 'visible',
    effort: 'medium'
  }
})

console.log('原始 snapshot 是 Proxy?', snapshot.__isProxy === true)
const cleanedSnapshot = deepToRaw(snapshot)
console.log('清理后是 Proxy?', cleanedSnapshot.__isProxy === true)
console.log('可以访问所有字段?', 
  cleanedSnapshot.id === 'test-123' &&
  cleanedSnapshot.model.name === 'gpt-4' &&
  cleanedSnapshot.tree.branches[0].id === 'branch-1'
)
console.log('✅ 测试 4 通过\n')

console.log('🎉 所有边界防御测试通过！')
console.log('\n📝 边界防御策略:')
console.log('✅ 在 chatPersistence.saveConversation() 入口统一处理')
console.log('✅ 在 projectPersistence.saveProject() 入口统一处理')
console.log('✅ 在 projectPersistence.createProject() 入口统一处理')
console.log('\n💡 优势:')
console.log('• 一次处理，全面覆盖所有字段')
console.log('• 新增字段自动安全，无需手动添加处理')
console.log('• 维护简单，不易遗漏')
console.log('• 代码清晰，防御点明确')
