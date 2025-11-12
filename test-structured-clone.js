/**
 * 测试 structuredClone 对不同对象类型的支持
 * 
 * 这个脚本用于验证哪些对象类型会导致 "An object could not be cloned" 错误
 */

console.log('🧪 测试 structuredClone 的限制\n')

// ========== 测试用例 ==========

const testCases = [
  {
    name: '基本对象',
    value: { a: 1, b: 'test', c: true, d: null },
    shouldPass: true
  },
  {
    name: '嵌套对象',
    value: { a: { b: { c: { d: 'deep' } } } },
    shouldPass: true
  },
  {
    name: '数组',
    value: [1, 2, 3, { a: 'test' }],
    shouldPass: true
  },
  {
    name: 'Date 对象',
    value: { timestamp: new Date() },
    shouldPass: true
  },
  {
    name: 'Map 对象',
    value: new Map([['key', 'value']]),
    shouldPass: true
  },
  {
    name: 'Set 对象',
    value: new Set([1, 2, 3]),
    shouldPass: true
  },
  {
    name: '包含函数的对象',
    value: { 
      data: 'test',
      method: function() { return 'hello' }
    },
    shouldPass: false
  },
  {
    name: '包含 Symbol 的对象',
    value: { 
      data: 'test',
      [Symbol('key')]: 'value'
    },
    shouldPass: true  // Symbol 属性会被忽略，但对象本身可以克隆
  },
  {
    name: '循环引用',
    value: (() => {
      const obj = { a: 1 }
      obj.self = obj
      return obj
    })(),
    shouldPass: false
  },
  {
    name: 'Error 对象',
    value: new Error('Test error'),
    shouldPass: true  // Error 对象可以被克隆（但 stack 可能有问题）
  },
  {
    name: '包含 undefined 的对象',
    value: { a: 1, b: undefined, c: 3 },
    shouldPass: true
  },
  {
    name: 'RegExp 对象',
    value: /test/gi,
    shouldPass: true
  },
  {
    name: '类实例（带方法）',
    value: (() => {
      class TestClass {
        constructor() {
          this.data = 'test'
        }
        method() {
          return 'hello'
        }
      }
      return new TestClass()
    })(),
    shouldPass: false  // 方法会导致失败
  },
  {
    name: 'Promise 对象',
    value: Promise.resolve('test'),
    shouldPass: false
  },
  {
    name: 'WeakMap 对象',
    value: new WeakMap(),
    shouldPass: false
  },
  {
    name: 'WeakSet 对象',
    value: new WeakSet(),
    shouldPass: false
  }
]

// ========== 执行测试 ==========

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('测试结果：')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

let passCount = 0
let failCount = 0
let unexpectedCount = 0

for (const testCase of testCases) {
  try {
    structuredClone(testCase.value)
    
    if (testCase.shouldPass) {
      console.log(`✅ ${testCase.name} - 通过（预期）`)
      passCount++
    } else {
      console.log(`⚠️  ${testCase.name} - 通过（但预期失败）`)
      unexpectedCount++
    }
  } catch (error) {
    if (!testCase.shouldPass) {
      console.log(`✅ ${testCase.name} - 失败（预期）`)
      console.log(`   错误: ${error.message}`)
      passCount++
    } else {
      console.log(`❌ ${testCase.name} - 失败（但预期通过）`)
      console.log(`   错误: ${error.message}`)
      failCount++
    }
  }
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('统计：')
console.log(`  预期行为: ${passCount}/${testCases.length}`)
console.log(`  意外行为: ${unexpectedCount}`)
console.log(`  测试失败: ${failCount}`)
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

// ========== 模拟真实的 usage 对象 ==========

console.log('\n\n🔬 测试真实场景：usage 对象\n')

// 模拟可能从 AI API 返回的各种 usage 对象

const usageTestCases = [
  {
    name: 'OpenRouter 标准响应',
    payload: {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
      model: 'gpt-4',
      id: 'chatcmpl-123'
    }
  },
  {
    name: '包含嵌套对象的响应',
    payload: {
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        prompt_tokens_details: {
          cached_tokens: 20
        },
        completion_tokens_details: {
          reasoning_tokens: 10
        }
      }
    }
  },
  {
    name: '包含函数的响应（潜在问题）',
    payload: {
      prompt_tokens: 100,
      completion_tokens: 50,
      toString() {
        return 'usage object'
      },
      toJSON() {
        return { prompt_tokens: this.prompt_tokens }
      }
    }
  },
  {
    name: '包含 Error 对象的响应',
    payload: {
      error: new Error('API Error'),
      usage: {
        prompt_tokens: 100
      }
    }
  }
]

console.log('测试各种 usage 对象格式：\n')

for (const testCase of usageTestCases) {
  console.log(`📋 ${testCase.name}:`)
  
  try {
    structuredClone(testCase.payload)
    console.log('   ✅ 可以克隆')
  } catch (error) {
    console.log(`   ❌ 克隆失败: ${error.message}`)
  }
  
  try {
    JSON.stringify(testCase.payload)
    console.log('   ✅ 可以 JSON 序列化')
  } catch (error) {
    console.log(`   ❌ JSON 序列化失败: ${error.message}`)
  }
  
  console.log()
}

// ========== 解决方案测试 ==========

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('🔧 测试清理函数\n')

function sanitizeForClone(obj) {
  if (!obj || typeof obj !== 'object') {
    return obj
  }
  
  try {
    // 使用 JSON 序列化作为测试和清理手段
    return JSON.parse(JSON.stringify(obj))
  } catch {
    console.warn('⚠️ 对象包含不可序列化的数据')
    return {
      _note: 'Original object was not serializable',
      keys: Object.keys(obj)
    }
  }
}

console.log('测试清理函数：\n')

const dirtyUsage = {
  prompt_tokens: 100,
  completion_tokens: 50,
  // 添加一个不可序列化的属性
  calculateCost: function() { return this.total_tokens * 0.01 }
}

console.log('原始对象:', Object.keys(dirtyUsage))
console.log('原始对象可以克隆?', (() => {
  try {
    structuredClone(dirtyUsage)
    return '✅ 是'
  } catch {
    return '❌ 否'
  }
})())

const cleaned = sanitizeForClone(dirtyUsage)
console.log('\n清理后的对象:', Object.keys(cleaned))
console.log('清理后的对象可以克隆?', (() => {
  try {
    structuredClone(cleaned)
    return '✅ 是'
  } catch {
    return '❌ 否'
  }
})())

console.log('\n✅ 清理函数测试完成！')
