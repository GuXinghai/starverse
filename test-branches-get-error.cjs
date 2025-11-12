/**
 * 分析 tree.branches.get is not a function 错误
 */

const { ref, toRaw } = require('vue')

console.log('========== 问题分析 ==========\n')

// 模拟 serializeTree 修复后的实现
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

function serializeTree(tree) {
  const branches = tree.branches
  let branchesArray
  
  if (branches instanceof Map) {
    branchesArray = Array.from(branches.entries())
  } else {
    branchesArray = []
  }
  
  // 使用 deepToRaw 处理每个 branch
  const cleanBranchesArray = branchesArray.map(([branchId, branch]) => [
    branchId,
    deepToRaw(branch)
  ])
  
  return {
    branches: cleanBranchesArray,  // ❌ 这是数组，不是 Map！
    rootBranchIds: toRaw(tree.rootBranchIds) || [],
    currentPath: toRaw(tree.currentPath) || []
  }
}

// 创建响应式树
const tree = ref({
  branches: new Map([
    ['b1', { branchId: 'b1', role: 'user', versions: [] }],
    ['b2', { branchId: 'b2', role: 'model', versions: [] }]
  ]),
  rootBranchIds: ['b1'],
  currentPath: ['b1', 'b2']
})

console.log('1. 原始 tree.branches 类型:', tree.value.branches instanceof Map ? 'Map' : typeof tree.value.branches)
console.log('2. 原始 tree.branches.get 存在?', typeof tree.value.branches.get === 'function')

// 序列化
const serialized = serializeTree(tree.value)

console.log('\n3. 序列化后 serialized.branches 类型:', Array.isArray(serialized.branches) ? 'Array' : typeof serialized.branches)
console.log('4. serialized.branches.get 存在?', typeof serialized.branches?.get === 'function')

// 模拟 toMessageSnapshots 的逻辑
console.log('\n问题场景：toMessageSnapshots 中的逻辑')
console.log('snapshot.tree 是数组?', Array.isArray(serialized))
console.log('snapshot.tree.branches 是数组?', Array.isArray(serialized.branches))

// 模拟 restoreTree
function restoreTree(raw) {
  let branchesMap
  
  if (raw.branches instanceof Map) {
    branchesMap = raw.branches
  } else if (Array.isArray(raw.branches)) {
    branchesMap = new Map(raw.branches)
  } else {
    branchesMap = new Map()
  }
  
  return {
    branches: branchesMap,
    rootBranchIds: raw.rootBranchIds ?? [],
    currentPath: raw.currentPath ?? []
  }
}

// 检查 restoreTree 的逻辑
console.log('\n5. 测试 restoreTree:')
const restored = restoreTree(serialized)
console.log('   restored.branches 类型:', restored.branches instanceof Map ? 'Map' : typeof restored.branches)
console.log('   restored.branches.get 存在?', typeof restored.branches.get === 'function')
console.log('   restored.branches.size:', restored.branches.size)

// 测试 getCurrentPathMessages
console.log('\n6. 测试 getCurrentPathMessages:')
try {
  const messages = restored.currentPath.map((branchId) => {
    const branch = restored.branches.get(branchId)
    return branch ? { role: branch.role } : null
  })
  console.log('   ✅ getCurrentPathMessages 可以工作')
  console.log('   messages:', messages)
} catch (e) {
  console.log('   ❌ getCurrentPathMessages 失败:', e.message)
}

// 问题场景：如果 snapshot.tree 不是数组
console.log('\n========== 问题根源分析 ==========\n')
console.log('问题：toMessageSnapshots 中的判断逻辑')
console.log('代码：const tree = Array.isArray(snapshot.tree) ? restoreTree(snapshot.tree) : snapshot.tree')
console.log('')
console.log('当 snapshot.tree 是序列化对象时：')
console.log('  Array.isArray(snapshot.tree) =', Array.isArray(serialized))
console.log('  结果：直接使用 snapshot.tree，而不是 restoreTree()')
console.log('')
console.log('❌ 问题：snapshot.tree.branches 是数组，不是 Map')
console.log('   所以 tree.branches.get() 会报错！')

console.log('\n========== 解决方案 ==========\n')
console.log('方案 1: 检查 snapshot.tree.branches 是否是数组')
console.log('const tree = Array.isArray(snapshot.tree.branches)')
console.log('  ? restoreTree(snapshot.tree)')
console.log('  : snapshot.tree')
console.log('')
console.log('方案 2: 检查 tree.branches 是否有 get 方法')
console.log('if (!(tree.branches instanceof Map)) {')
console.log('  tree = restoreTree(tree)')
console.log('}')
