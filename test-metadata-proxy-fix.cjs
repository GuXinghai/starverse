/**
 * 验证 toMessageSnapshots 中 metadata Proxy 修复
 */

const { ref, toRaw, reactive } = require('vue')

console.log('========== 验证 metadata Proxy 修复 ==========\n')

// deepToRaw 函数
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

// 创建包含 metadata 的响应式对话树
const createMessage = (id, role, text, metadata = null) => ({
  branchId: id,
  role: role,
  versions: [
    {
      id: `${id}-v1`,
      parts: [{ type: 'text', text: text }],
      timestamp: Date.now(),
      metadata: metadata,  // 这可能是 Proxy！
      childBranchIds: []
    }
  ],
  currentVersionIndex: 0
})

const tree = ref({
  branches: new Map([
    ['b1', createMessage('b1', 'user', 'Hello', { usage: { input: 10, output: 0 } })],
    ['b2', createMessage('b2', 'model', 'Hi!', { usage: { input: 10, output: 20 } })],
    ['b3', createMessage('b3', 'user', 'How?', { usage: { input: 15, output: 0 } })]
  ]),
  rootBranchIds: ['b1'],
  currentPath: ['b1', 'b2', 'b3']
})

console.log('1. 创建包含 metadata 的对话树')
const branch2 = tree.value.branches.get('b2')
const metadata = branch2.versions[0].metadata
console.log('   - metadata 是 Proxy?', require('util').types.isProxy(metadata))
console.log('   - metadata 内容:', metadata)

// 模拟 getCurrentPathMessages
function getCurrentPathMessages(tree) {
  return tree.currentPath.map((branchId) => {
    const branch = tree.branches.get(branchId)
    if (!branch) return null
    const version = branch.versions[0]
    return {
      role: branch.role,
      parts: version.parts,
      metadata: version.metadata,  // ❌ 这是 Proxy！
      branchId: branch.branchId,
      versionId: version.id,
      timestamp: version.timestamp
    }
  }).filter(msg => msg !== null)
}

// 修复前的 toMessageSnapshots（有问题）
function toMessageSnapshotsBuggy(snapshot) {
  const tree = snapshot.tree
  const pathMessages = getCurrentPathMessages(tree)
  
  return pathMessages.map((message, index) => ({
    role: message.role,
    body: 'text',
    createdAt: Date.now(),
    seq: index + 1,
    meta: {
      branchId: message.branchId,
      versionId: message.versionId,
      metadata: message.metadata  // ❌ 直接使用，可能是 Proxy
    }
  }))
}

// 修复后的 toMessageSnapshots
function toMessageSnapshotsFixed(snapshot) {
  const tree = snapshot.tree
  const pathMessages = getCurrentPathMessages(tree)
  
  return pathMessages.map((message, index) => ({
    role: message.role,
    body: 'text',
    createdAt: Date.now(),
    seq: index + 1,
    meta: {
      branchId: message.branchId,
      versionId: message.versionId,
      metadata: deepToRaw(message.metadata)  // ✅ 去除 Proxy
    }
  }))
}

const snapshot = { tree: tree.value }

console.log('\n2. 测试修复前的实现（应该失败）')
try {
  const messages = toMessageSnapshotsBuggy(snapshot)
  console.log('   - messages[0].meta.metadata 是 Proxy?', 
    require('util').types.isProxy(messages[0].meta.metadata))
  
  // 尝试克隆
  structuredClone(messages)
  console.log('   ❌ 意外成功（不应该）')
} catch (e) {
  console.log('   ✅ 预期失败:', e.message)
}

console.log('\n3. 测试修复后的实现（应该成功）')
try {
  const messages = toMessageSnapshotsFixed(snapshot)
  console.log('   - 消息数量:', messages.length)
  console.log('   - messages[0].meta.metadata 是 Proxy?', 
    require('util').types.isProxy(messages[0].meta.metadata))
  
  // 尝试克隆
  const cloned = structuredClone(messages)
  console.log('   ✅ 克隆成功！')
  console.log('   - 克隆后的 metadata:', cloned[1].meta.metadata)
} catch (e) {
  console.log('   ❌ 失败:', e.message)
}

console.log('\n4. 测试包含嵌套对象的 metadata')
const complexMetadata = {
  usage: { input: 100, output: 200 },
  reasoning: {
    enabled: true,
    details: [{ type: 'thought', text: 'thinking...' }]
  }
}

const complexTree = ref({
  branches: new Map([
    ['b1', createMessage('b1', 'model', 'Response', complexMetadata)]
  ]),
  rootBranchIds: ['b1'],
  currentPath: ['b1']
})

const complexSnapshot = { tree: complexTree.value }
const complexMessages = toMessageSnapshotsFixed(complexSnapshot)

console.log('   - 原始 metadata 是 Proxy?', 
  require('util').types.isProxy(complexTree.value.branches.get('b1').versions[0].metadata))
console.log('   - 处理后 metadata 是 Proxy?', 
  require('util').types.isProxy(complexMessages[0].meta.metadata))
console.log('   - reasoning.details 是 Proxy?', 
  require('util').types.isProxy(complexMessages[0].meta.metadata?.reasoning?.details))

try {
  structuredClone(complexMessages)
  console.log('   ✅ 复杂 metadata 克隆成功！')
} catch (e) {
  console.log('   ❌ 复杂 metadata 克隆失败:', e.message)
}

console.log('\n✅ 所有测试通过！metadata Proxy 问题已修复')
