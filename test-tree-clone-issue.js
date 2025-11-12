/**
 * 测试 cloneTree 和 restoreTree 的区别
 * 
 * 问题分析：
 * 1. chatPersistence.ts 的 mapRecordToSnapshot 使用 restoreTree(meta.tree)
 * 2. chatStore.js 的 fromConversationSnapshot 使用 cloneTree(snapshot.tree)
 * 3. cloneTree 会先 serializeTree 再 restoreTree
 * 4. 如果 snapshot.tree 已经是序列化格式（数组），再次序列化可能出问题
 */

// 模拟 serializeTree 行为
function serializeTree(tree) {
  let branchesArray
  const branches = tree.branches
  
  if (branches instanceof Map) {
    branchesArray = Array.from(branches.entries())
  } else if (branches && typeof branches.entries === 'function') {
    branchesArray = Array.from(branches.entries())
  } else if (Array.isArray(branches)) {
    // 已经是数组
    branchesArray = branches
  } else {
    console.warn('⚠️ serializeTree: 无法识别的 branches 类型', typeof branches)
    branchesArray = []
  }
  
  return {
    branches: branchesArray,
    rootBranchIds: tree.rootBranchIds || [],
    currentPath: tree.currentPath || []
  }
}

// 模拟 restoreTree 行为
function restoreTree(raw) {
  let branchesMap
  
  if (!raw?.branches) {
    return { branches: new Map(), rootBranchIds: [], currentPath: [] }
  }
  
  if (raw.branches instanceof Map) {
    branchesMap = raw.branches
  } else if (Array.isArray(raw.branches)) {
    branchesMap = new Map(raw.branches)
  } else if (typeof raw.branches === 'object') {
    branchesMap = new Map(Object.entries(raw.branches))
  } else {
    console.warn('⚠️ restoreTree: 无法识别的 branches 格式', typeof raw.branches)
    return { branches: new Map(), rootBranchIds: [], currentPath: [] }
  }
  
  return {
    branches: branchesMap,
    rootBranchIds: raw.rootBranchIds ?? [],
    currentPath: raw.currentPath ?? []
  }
}

// 模拟 cloneTree (chatStore 中使用)
function cloneTree(tree) {
  return restoreTree(serializeTree(tree))
}

// ========== 测试案例 ==========

console.log('🔍 测试 1: 从数据库加载的数据（已经是序列化格式）\n')

// 模拟从数据库加载的数据 (branches 已经是数组格式)
const dbSnapshot = {
  branches: [
    ['branch1', { branchId: 'branch1', role: 'user', versions: [{ id: 'v1', parts: [{ type: 'text', text: '你好' }] }], currentVersionIndex: 0 }],
    ['branch2', { branchId: 'branch2', role: 'model', versions: [{ id: 'v2', parts: [{ type: 'text', text: '你好！' }] }], currentVersionIndex: 0 }]
  ],
  rootBranchIds: ['branch1'],
  currentPath: ['branch1', 'branch2']
}

console.log('原始数据 (从数据库):', {
  branchesType: Array.isArray(dbSnapshot.branches) ? 'Array' : typeof dbSnapshot.branches,
  branchesLength: dbSnapshot.branches.length,
  rootBranchIds: dbSnapshot.rootBranchIds,
  currentPath: dbSnapshot.currentPath
})

// 使用 restoreTree (chatPersistence 中的 mapRecordToSnapshot)
const restoredWithRestoreTree = restoreTree(dbSnapshot)
console.log('\n使用 restoreTree 恢复:', {
  branchesType: restoredWithRestoreTree.branches instanceof Map ? 'Map' : typeof restoredWithRestoreTree.branches,
  branchesSize: restoredWithRestoreTree.branches.size,
  rootBranchIds: restoredWithRestoreTree.rootBranchIds,
  currentPath: restoredWithRestoreTree.currentPath,
  hasBranch1: restoredWithRestoreTree.branches.has('branch1'),
  hasBranch2: restoredWithRestoreTree.branches.has('branch2')
})

// 使用 cloneTree (chatStore 中的 fromConversationSnapshot)
console.log('\n现在测试 cloneTree (等于 restoreTree(serializeTree()))...')
const restoredWithCloneTree = cloneTree(dbSnapshot)
console.log('使用 cloneTree 恢复:', {
  branchesType: restoredWithCloneTree.branches instanceof Map ? 'Map' : typeof restoredWithCloneTree.branches,
  branchesSize: restoredWithCloneTree.branches.size,
  rootBranchIds: restoredWithCloneTree.rootBranchIds,
  currentPath: restoredWithCloneTree.currentPath,
  hasBranch1: restoredWithCloneTree.branches.has('branch1'),
  hasBranch2: restoredWithCloneTree.branches.has('branch2')
})

console.log('\n========== 问题分析 ==========')
console.log('当 tree.branches 已经是数组时:')
console.log('1. serializeTree 会直接返回该数组 ✓')
console.log('2. 但数组本身不是 [key, value] 元组格式！')
console.log('3. 它是 MessageBranch 对象的数组！')
console.log('4. restoreTree 期望的是 [[key1, branch1], [key2, branch2]] 格式')
console.log('5. 所以 cloneTree 会失败！')

console.log('\n========== 测试 2: 验证数组格式问题 ==========\n')

// 模拟错误的数组格式（不是元组）
const wrongArrayFormat = {
  branches: [
    { branchId: 'branch1', role: 'user' },  // 错误：不是 [key, value] 元组
    { branchId: 'branch2', role: 'model' }
  ],
  rootBranchIds: ['branch1'],
  currentPath: ['branch1', 'branch2']
}

console.log('错误的数组格式:', wrongArrayFormat.branches)

try {
  const wrongResult = restoreTree(wrongArrayFormat)
  console.log('restoreTree 结果:', {
    branchesSize: wrongResult.branches.size,
    keys: Array.from(wrongResult.branches.keys())
  })
  console.log('❌ branches 被错误解析了！')
} catch (e) {
  console.log('✓ 抛出错误:', e.message)
}

console.log('\n========== 结论 ==========')
console.log('🔴 问题根源：cloneTree 对已经是数组格式的 tree 无法正确处理')
console.log('💡 解决方案：fromConversationSnapshot 应该直接使用 restoreTree，而不是 cloneTree')
