/**
 * 验证 toMessageSnapshots 修复
 */

const { ref, toRaw, reactive } = require('vue')

console.log('========== 验证 toMessageSnapshots 修复 ==========\n')

// 模拟完整的序列化/反序列化流程
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
    branches: reactive(branchesMap),
    rootBranchIds: raw.rootBranchIds ?? [],
    currentPath: raw.currentPath ?? []
  }
}

function getCurrentPathMessages(tree) {
  return tree.currentPath.map((branchId) => {
    const branch = tree.branches.get(branchId)
    if (!branch) return null
    return {
      role: branch.role,
      branchId: branch.branchId
    }
  })
}

// 修复前的逻辑（有问题）
function toMessageSnapshotsBuggy(snapshot) {
  const tree = Array.isArray(snapshot.tree) 
    ? restoreTree(snapshot.tree) 
    : snapshot.tree
  
  return getCurrentPathMessages(tree).filter(Boolean)
}

// 修复后的逻辑
function toMessageSnapshotsFixed(snapshot) {
  let tree
  
  if (snapshot.tree.branches instanceof Map) {
    tree = snapshot.tree
  } else if (Array.isArray(snapshot.tree.branches)) {
    tree = restoreTree(snapshot.tree)
  } else {
    tree = restoreTree(snapshot.tree)
  }
  
  return getCurrentPathMessages(tree).filter(Boolean)
}

// 创建测试数据
const originalTree = ref({
  branches: new Map([
    ['b1', { branchId: 'b1', role: 'user' }],
    ['b2', { branchId: 'b2', role: 'model' }],
    ['b3', { branchId: 'b3', role: 'user' }]
  ]),
  rootBranchIds: ['b1'],
  currentPath: ['b1', 'b2', 'b3']
})

console.log('1. 创建原始对话树')
console.log('   - branches.size:', originalTree.value.branches.size)
console.log('   - currentPath:', originalTree.value.currentPath)

// 序列化
const serializedTree = serializeTree(originalTree.value)
console.log('\n2. 序列化对话树')
console.log('   - serializedTree.branches 是数组?', Array.isArray(serializedTree.branches))
console.log('   - serializedTree.branches.length:', serializedTree.branches.length)

// 创建 snapshot
const snapshot = {
  tree: serializedTree,
  updatedAt: Date.now()
}

console.log('\n3. 测试修复前的逻辑（应该失败）')
try {
  const messages = toMessageSnapshotsBuggy(snapshot)
  console.log('   ❌ 意外成功（不应该）')
} catch (e) {
  console.log('   ✅ 预期失败:', e.message)
}

console.log('\n4. 测试修复后的逻辑（应该成功）')
try {
  const messages = toMessageSnapshotsFixed(snapshot)
  console.log('   ✅ 成功！')
  console.log('   - 消息数量:', messages.length)
  console.log('   - 消息:', messages)
} catch (e) {
  console.log('   ❌ 失败:', e.message)
}

// 测试运行时格式（直接传入 Map 格式的 tree）
console.log('\n5. 测试运行时格式（branches 是 Map）')
const runtimeSnapshot = {
  tree: originalTree.value,
  updatedAt: Date.now()
}

try {
  const messages = toMessageSnapshotsFixed(runtimeSnapshot)
  console.log('   ✅ 成功！')
  console.log('   - 消息数量:', messages.length)
  console.log('   - 消息:', messages)
} catch (e) {
  console.log('   ❌ 失败:', e.message)
}

console.log('\n6. 综合测试：完整的保存/加载流程')
console.log('   步骤 1: 序列化树')
const serialized = serializeTree(originalTree.value)
console.log('   - ✅ 序列化完成')

console.log('   步骤 2: 通过 IPC 传递（structuredClone）')
try {
  const cloned = structuredClone(serialized)
  console.log('   - ✅ IPC 传递成功')
  
  console.log('   步骤 3: 恢复树并提取消息')
  const snapshotForSave = { tree: cloned, updatedAt: Date.now() }
  const messages = toMessageSnapshotsFixed(snapshotForSave)
  console.log('   - ✅ 提取消息成功')
  console.log('   - 消息:', messages)
  
  console.log('\n✅ 所有测试通过！修复成功')
} catch (e) {
  console.log('   - ❌ 失败:', e.message)
}
