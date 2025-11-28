/**
 * 验证修复是否有效
 * 测试 serializeTree 和 toConversationSnapshot 返回的对象能否被 structuredClone
 */

const { ref, toRaw } = require('vue')
const util = require('util')

console.log('========== 测试修复后的 serializeTree ==========\n')

// 模拟 serializeTree 修复后的实现
function serializeTreeFixed(tree) {
  const branches = []
  return {
    branches: branches,
    rootBranchIds: toRaw(tree.rootBranchIds) || [],
    currentPath: toRaw(tree.currentPath) || []
  }
}

// 创建响应式 tree
const tree = ref({
  branches: new Map(),
  rootBranchIds: ['branch-1', 'branch-2'],
  currentPath: ['branch-1', 'version-1']
})

console.log('1. 原始 tree.rootBranchIds 是 Proxy?', util.types.isProxy(tree.value.rootBranchIds))
console.log('2. 原始 tree.currentPath 是 Proxy?', util.types.isProxy(tree.value.currentPath))

const serialized = serializeTreeFixed(tree.value)
console.log('3. 序列化后 rootBranchIds 是 Proxy?', util.types.isProxy(serialized.rootBranchIds))
console.log('4. 序列化后 currentPath 是 Proxy?', util.types.isProxy(serialized.currentPath))

try {
  structuredClone(serialized)
  console.log('✅ serializeTree 修复成功！可以克隆\n')
} catch (e) {
  console.log('❌ serializeTree 修复失败:', e.message, '\n')
}

console.log('========== 测试修复后的 toConversationSnapshot ==========\n')

// 模拟 deepToRaw
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

// 模拟 normalizeReasoningPreference
function normalizeReasoningPreference(input) {
  const source = input && typeof input === 'object' ? input : {}
  return {
    visibility: source.visibility || 'visible',
    effort: source.effort || 'medium',
    maxTokens: source.maxTokens || null
  }
}

// 创建响应式对话对象
const conversation = ref({
  id: 'test-1',
  title: 'Test Conversation',
  reasoningPreference: {
    visibility: 'visible',
    effort: 'medium',
    maxTokens: null
  },
  tree: {
    branches: new Map(),
    rootBranchIds: ['branch-1'],
    currentPath: ['branch-1', 'version-1']
  },
  model: 'gemini-2.0-flash-exp',
  draft: '',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  webSearchEnabled: false,
  webSearchLevel: 'normal'
})

// 模拟用户修改 reasoningPreference（触发问题的操作）
conversation.value.reasoningPreference = { visibility: 'hidden', effort: 'high', maxTokens: 1000 }

console.log('1. 修改后 reasoningPreference 是 Proxy?', util.types.isProxy(conversation.value.reasoningPreference))

// 模拟修复后的 toConversationSnapshot
function toConversationSnapshotFixed(conversation) {
  const serializedTree = serializeTreeFixed(conversation.tree)
  const rawConv = toRaw(conversation)
  
  return {
    id: rawConv.id,
    title: rawConv.title,
    projectId: rawConv.projectId ?? null,
    tree: serializedTree,
    model: rawConv.model || 'gemini-2.0-flash-exp',
    draft: rawConv.draft || '',
    createdAt: rawConv.createdAt || Date.now(),
    updatedAt: rawConv.updatedAt || Date.now(),
    webSearchEnabled: rawConv.webSearchEnabled ?? false,
    webSearchLevel: rawConv.webSearchLevel || 'normal',
    reasoningPreference: deepToRaw(normalizeReasoningPreference(rawConv.reasoningPreference))
  }
}

const snapshot = toConversationSnapshotFixed(conversation.value)

console.log('2. snapshot.reasoningPreference 是 Proxy?', util.types.isProxy(snapshot.reasoningPreference))
console.log('3. snapshot.tree.rootBranchIds 是 Proxy?', util.types.isProxy(snapshot.tree.rootBranchIds))
console.log('4. snapshot.tree.currentPath 是 Proxy?', util.types.isProxy(snapshot.tree.currentPath))

try {
  const cloned = structuredClone(snapshot)
  console.log('✅ toConversationSnapshot 修复成功！可以克隆')
  console.log('5. 克隆后的对象:', JSON.stringify(cloned, null, 2))
} catch (e) {
  console.log('❌ toConversationSnapshot 修复失败:', e.message)
}

console.log('\n========== 综合测试：模拟完整流程 ==========\n')

// 模拟完整的切换思考开关流程
const conversations = ref([
  {
    id: 'conv-1',
    title: 'Test Chat',
    reasoningPreference: { visibility: 'visible', effort: 'medium', maxTokens: null },
    tree: {
      branches: new Map(),
      rootBranchIds: ['branch-1'],
      currentPath: ['branch-1', 'version-1']
    },
    model: 'gemini-2.0-flash-exp',
    draft: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    webSearchEnabled: false,
    webSearchLevel: 'normal'
  }
])

console.log('1. 初始状态 - 开始切换思考开关...')

// 模拟 setConversationReasoningPreference
const conv = conversations.value[0]
const normalized = { visibility: 'off', effort: 'medium', maxTokens: null }
conv.reasoningPreference = normalized

console.log('2. 修改后 reasoningPreference:', conv.reasoningPreference)
console.log('3. reasoningPreference 是 Proxy?', util.types.isProxy(conv.reasoningPreference))

// 模拟 saveConversations -> toConversationSnapshot
const snapshotToSave = toConversationSnapshotFixed(conv)

console.log('4. 准备保存快照...')

try {
  // 模拟 IPC 调用（会使用 structuredClone）
  const clonedForIPC = structuredClone(snapshotToSave)
  console.log('✅ 完整流程测试成功！可以安全通过 IPC 传递')
  console.log('5. IPC 传递的数据:', JSON.stringify(clonedForIPC, null, 2))
} catch (e) {
  console.log('❌ 完整流程测试失败:', e.message)
}
