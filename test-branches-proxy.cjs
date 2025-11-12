/**
 * 测试 serializeTree 中 branches 数组的 Proxy 问题
 */

const { ref, toRaw } = require('vue')
const util = require('util')

console.log('========== 问题复现：Map entries 中的值是 Proxy ==========\n')

// 模拟 MessageBranch 结构
const branch1 = {
  branchId: 'branch-1',
  role: 'user',
  parentBranchId: null,
  parentVersionId: null,
  versions: [
    {
      versionId: 'v1',
      parts: [{ type: 'text', text: 'Hello' }],
      timestamp: Date.now(),
      childBranchIds: []
    }
  ],
  currentVersionIndex: 0
}

const branch2 = {
  branchId: 'branch-2',
  role: 'model',
  parentBranchId: 'branch-1',
  parentVersionId: 'v1',
  versions: [
    {
      versionId: 'v2',
      parts: [{ type: 'text', text: 'Hi there!' }],
      timestamp: Date.now(),
      childBranchIds: []
    }
  ],
  currentVersionIndex: 0
}

// 创建响应式 Map
const branches = new Map([
  ['branch-1', branch1],
  ['branch-2', branch2]
])

const tree = ref({
  branches: branches,
  rootBranchIds: ['branch-1'],
  currentPath: ['branch-1', 'branch-2']
})

console.log('1. tree.branches is Map?', tree.value.branches instanceof Map)
console.log('2. tree.branches is Proxy?', util.types.isProxy(tree.value.branches))

// 模拟当前的 serializeTree（有问题的版本）
function serializeTreeBuggy(tree) {
  const branches = tree.branches
  let branchesArray
  
  if (branches instanceof Map) {
    branchesArray = Array.from(branches.entries())
  } else if (branches && typeof branches.entries === 'function') {
    branchesArray = Array.from(branches.entries())
  } else if (Array.isArray(branches)) {
    branchesArray = branches
  } else {
    branchesArray = []
  }
  
  return {
    branches: branchesArray,  // ❌ 数组中的 branch 对象仍是 Proxy
    rootBranchIds: toRaw(tree.rootBranchIds) || [],
    currentPath: toRaw(tree.currentPath) || []
  }
}

const serialized = serializeTreeBuggy(tree.value)

console.log('\n检查序列化结果：')
console.log('3. serialized.branches is Array?', Array.isArray(serialized.branches))
console.log('4. serialized.branches[0] is Array (tuple)?', Array.isArray(serialized.branches[0]))
console.log('5. serialized.branches[0][0] (branchId)?', serialized.branches[0][0])
console.log('6. serialized.branches[0][1] (branch) is Proxy?', util.types.isProxy(serialized.branches[0][1]))
console.log('7. serialized.branches[0][1].versions is Proxy?', util.types.isProxy(serialized.branches[0][1].versions))

console.log('\n尝试克隆：')
try {
  structuredClone(serialized)
  console.log('✓ 克隆成功')
} catch (e) {
  console.log('✗ 克隆失败:', e.message)
}

console.log('\n========== 解决方案：深度去除 Proxy ==========\n')

// 递归去除 Proxy
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

function serializeTreeFixed(tree) {
  const branches = tree.branches
  let branchesArray
  
  if (branches instanceof Map) {
    branchesArray = Array.from(branches.entries())
  } else if (branches && typeof branches.entries === 'function') {
    branchesArray = Array.from(branches.entries())
  } else if (Array.isArray(branches)) {
    branchesArray = branches
  } else {
    branchesArray = []
  }
  
  // 🔧 关键修复：对整个 branchesArray 应用 deepToRaw
  // 这会递归处理每个 [branchId, branch] 元组中的 branch 对象
  const cleanBranchesArray = branchesArray.map(([branchId, branch]) => [
    branchId,
    deepToRaw(branch)
  ])
  
  return {
    branches: cleanBranchesArray,
    rootBranchIds: toRaw(tree.rootBranchIds) || [],
    currentPath: toRaw(tree.currentPath) || []
  }
}

const serializedFixed = serializeTreeFixed(tree.value)

console.log('检查修复后的序列化结果：')
console.log('1. serialized.branches[0][1] is Proxy?', util.types.isProxy(serializedFixed.branches[0][1]))
console.log('2. serialized.branches[0][1].versions is Proxy?', util.types.isProxy(serializedFixed.branches[0][1].versions))

console.log('\n尝试克隆：')
try {
  const cloned = structuredClone(serializedFixed)
  console.log('✅ 克隆成功！')
  console.log('3. 克隆后的数据:', JSON.stringify(cloned, null, 2).substring(0, 500) + '...')
} catch (e) {
  console.log('✗ 克隆失败:', e.message)
}
