/**
 * 验证修复后的 fromConversationSnapshot 功能
 * 
 * 模拟完整的保存和加载流程
 */

// ========== 模拟依赖 ==========

function reactive(obj) {
  return obj // 简化：不真正实现响应式
}

function createEmptyTree() {
  return {
    branches: reactive(new Map()),
    rootBranchIds: [],
    currentPath: [],
  }
}

function serializeTree(tree) {
  let branchesArray
  const branches = tree.branches
  
  if (branches instanceof Map) {
    branchesArray = Array.from(branches.entries())
  } else if (branches && typeof branches.entries === 'function') {
    branchesArray = Array.from(branches.entries())
  } else if (Array.isArray(branches)) {
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

function restoreTree(raw) {
  let branchesMap
  
  if (!raw?.branches) {
    return createEmptyTree()
  }
  
  if (raw.branches instanceof Map) {
    branchesMap = raw.branches
  } else if (Array.isArray(raw.branches)) {
    branchesMap = new Map(raw.branches)
  } else if (typeof raw.branches === 'object') {
    branchesMap = new Map(Object.entries(raw.branches))
  } else {
    console.warn('⚠️ restoreTree: 无法识别的 branches 格式', typeof raw.branches)
    return createEmptyTree()
  }
  
  return {
    branches: reactive(branchesMap),
    rootBranchIds: raw.rootBranchIds ?? [],
    currentPath: raw.currentPath ?? []
  }
}

// ========== 模拟保存和加载函数 ==========

function toConversationSnapshot(conversation) {
  const serializedTree = serializeTree(conversation.tree)
  return {
    id: conversation.id,
    title: conversation.title,
    tree: serializedTree,
    model: conversation.model,
    draft: conversation.draft || ''
  }
}

// 修复后的版本
function fromConversationSnapshot(snapshot) {
  return {
    id: snapshot.id,
    title: snapshot.title,
    tree: restoreTree(snapshot.tree),  // ✅ 直接使用 restoreTree
    model: snapshot.model,
    draft: snapshot.draft || ''
  }
}

// ========== 测试完整流程 ==========

console.log('🧪 测试完整的保存和加载流程\n')

// 1. 创建一个运行时的对话对象
const originalConversation = {
  id: 'conv-1',
  title: '测试对话',
  model: 'gemini-2.0-flash-exp',
  tree: {
    branches: new Map([
      ['branch-1', {
        branchId: 'branch-1',
        role: 'user',
        parentBranchId: null,
        parentVersionId: null,
        currentVersionIndex: 0,
        versions: [{
          id: 'v1',
          parts: [{ type: 'text', text: '你好，这是测试消息' }],
          timestamp: Date.now()
        }]
      }],
      ['branch-2', {
        branchId: 'branch-2',
        role: 'model',
        parentBranchId: 'branch-1',
        parentVersionId: 'v1',
        currentVersionIndex: 0,
        versions: [{
          id: 'v2',
          parts: [{ type: 'text', text: '你好！我收到了你的消息。' }],
          timestamp: Date.now()
        }]
      }]
    ]),
    rootBranchIds: ['branch-1'],
    currentPath: ['branch-1', 'branch-2']
  },
  draft: ''
}

console.log('1️⃣ 原始对话对象:')
console.log('   - ID:', originalConversation.id)
console.log('   - 标题:', originalConversation.title)
console.log('   - 分支数量:', originalConversation.tree.branches.size)
console.log('   - 当前路径长度:', originalConversation.tree.currentPath.length)
console.log('   - 消息分支:', Array.from(originalConversation.tree.branches.keys()))

// 2. 序列化（保存到数据库前）
const snapshot = toConversationSnapshot(originalConversation)
console.log('\n2️⃣ 序列化后的快照:')
console.log('   - ID:', snapshot.id)
console.log('   - 标题:', snapshot.title)
console.log('   - branches 类型:', Array.isArray(snapshot.tree.branches) ? 'Array' : 'Map')
console.log('   - branches 长度:', snapshot.tree.branches.length)
console.log('   - 当前路径长度:', snapshot.tree.currentPath.length)

// 3. 模拟从数据库读取（数据库返回的就是序列化格式）
const dbSnapshot = snapshot  // 数据库返回的数据

// 4. 反序列化（从数据库加载后）
const restoredConversation = fromConversationSnapshot(dbSnapshot)
console.log('\n3️⃣ 反序列化后的对话对象:')
console.log('   - ID:', restoredConversation.id)
console.log('   - 标题:', restoredConversation.title)
console.log('   - branches 类型:', restoredConversation.tree.branches instanceof Map ? 'Map' : 'Array')
console.log('   - 分支数量:', restoredConversation.tree.branches.size)
console.log('   - 当前路径长度:', restoredConversation.tree.currentPath.length)
console.log('   - 消息分支:', Array.from(restoredConversation.tree.branches.keys()))

// 5. 验证数据完整性
console.log('\n4️⃣ 数据完整性验证:')

const allBranchesRestored = 
  restoredConversation.tree.branches.has('branch-1') &&
  restoredConversation.tree.branches.has('branch-2')

const pathCorrect = 
  restoredConversation.tree.currentPath.length === 2 &&
  restoredConversation.tree.currentPath[0] === 'branch-1' &&
  restoredConversation.tree.currentPath[1] === 'branch-2'

const branch1 = restoredConversation.tree.branches.get('branch-1')
const branch2 = restoredConversation.tree.branches.get('branch-2')

const messagesRestored = 
  branch1 && 
  branch2 && 
  branch1.versions[0].parts[0].text === '你好，这是测试消息' &&
  branch2.versions[0].parts[0].text === '你好！我收到了你的消息。'

console.log('   ✓ 所有分支已恢复:', allBranchesRestored ? '✅' : '❌')
console.log('   ✓ 路径信息正确:', pathCorrect ? '✅' : '❌')
console.log('   ✓ 消息内容完整:', messagesRestored ? '✅' : '❌')

if (allBranchesRestored && pathCorrect && messagesRestored) {
  console.log('\n🎉 测试通过！修复后的代码可以正确恢复聊天内容。')
} else {
  console.log('\n❌ 测试失败！请检查修复代码。')
}

// 6. 额外验证：再次保存和加载
console.log('\n5️⃣ 测试二次保存和加载:')
const snapshot2 = toConversationSnapshot(restoredConversation)
const restoredConversation2 = fromConversationSnapshot(snapshot2)

const secondRoundCorrect = 
  restoredConversation2.tree.branches.size === 2 &&
  restoredConversation2.tree.branches.has('branch-1') &&
  restoredConversation2.tree.branches.has('branch-2')

console.log('   ✓ 二次加载正确:', secondRoundCorrect ? '✅' : '❌')

if (secondRoundCorrect) {
  console.log('\n✅ 完美！数据可以正确地进行多次保存和加载循环。')
}
