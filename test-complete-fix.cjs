/**
 * 验证完整修复 - 测试发送消息场景
 */

const { ref, toRaw } = require('vue')
const util = require('util')

console.log('========== 完整修复验证 ==========\n')

// 深度去除 Proxy
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

// 模拟完整的 MessageBranch 结构（包含所有嵌套）
const createBranch = (id, role, text, parentBranchId = null) => ({
  branchId: id,
  role: role,
  parentBranchId: parentBranchId,
  parentVersionId: null,
  versions: [
    {
      versionId: `${id}-v1`,
      parts: [{ type: 'text', text: text }],
      timestamp: Date.now(),
      childBranchIds: [],
      metadata: { some: 'data' }
    }
  ],
  currentVersionIndex: 0
})

// 创建响应式对话树
const branches = new Map([
  ['branch-1', createBranch('branch-1', 'user', 'Hello')],
  ['branch-2', createBranch('branch-2', 'model', 'Hi there!', 'branch-1')],
  ['branch-3', createBranch('branch-3', 'user', 'How are you?', 'branch-2')]
])

const tree = ref({
  branches: branches,
  rootBranchIds: ['branch-1'],
  currentPath: ['branch-1', 'branch-2', 'branch-3']
})

console.log('1. 模拟发送消息后的状态')
console.log('   - branches.size:', tree.value.branches.size)
console.log('   - currentPath.length:', tree.value.currentPath.length)

// 模拟完整修复后的 serializeTree
function serializeTreeComplete(tree) {
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
  
  // 🔧 关键修复：深度去除每个 branch 的 Proxy
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

console.log('\n2. 序列化对话树')
const serialized = serializeTreeComplete(tree.value)

console.log('   - branches array length:', serialized.branches.length)
console.log('   - 检查第一个 branch:')
console.log('     - branchId:', serialized.branches[0][0])
console.log('     - branch is Proxy?', util.types.isProxy(serialized.branches[0][1]))
console.log('     - versions is Proxy?', util.types.isProxy(serialized.branches[0][1].versions))
console.log('     - parts is Proxy?', util.types.isProxy(serialized.branches[0][1].versions[0].parts))
console.log('     - metadata is Proxy?', util.types.isProxy(serialized.branches[0][1].versions[0].metadata))

console.log('\n3. 尝试通过 IPC 克隆（structuredClone）')
try {
  const cloned = structuredClone(serialized)
  console.log('   ✅ 克隆成功！')
  
  // 验证数据完整性
  console.log('\n4. 验证克隆后的数据完整性')
  console.log('   - branches count:', cloned.branches.length)
  console.log('   - rootBranchIds:', cloned.rootBranchIds)
  console.log('   - currentPath:', cloned.currentPath)
  console.log('   - 第一条消息:', cloned.branches[0][1].versions[0].parts[0].text)
  console.log('   - 第二条消息:', cloned.branches[1][1].versions[0].parts[0].text)
  console.log('   - 第三条消息:', cloned.branches[2][1].versions[0].parts[0].text)
  
  console.log('\n✅ 所有测试通过！发送消息功能应该正常工作')
} catch (e) {
  console.log('   ❌ 克隆失败:', e.message)
  console.log('\n修复不完整，需要进一步检查')
}

console.log('\n========== 性能测试 ==========\n')

// 创建大量分支测试性能
const largeBranches = new Map()
for (let i = 0; i < 100; i++) {
  largeBranches.set(`branch-${i}`, createBranch(`branch-${i}`, i % 2 === 0 ? 'user' : 'model', `Message ${i}`))
}

const largeTree = ref({
  branches: largeBranches,
  rootBranchIds: ['branch-0'],
  currentPath: Array.from({ length: 100 }, (_, i) => `branch-${i}`)
})

console.log('测试大型对话树 (100 个分支)')
console.time('序列化耗时')
const largeSerialized = serializeTreeComplete(largeTree.value)
console.timeEnd('序列化耗时')

console.time('克隆耗时')
try {
  structuredClone(largeSerialized)
  console.timeEnd('克隆耗时')
  console.log('✅ 大型数据集测试通过')
} catch (e) {
  console.timeEnd('克隆耗时')
  console.log('❌ 大型数据集测试失败:', e.message)
}
