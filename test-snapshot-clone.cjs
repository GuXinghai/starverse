/**
 * 测试 toConversationSnapshot 返回值克隆问题
 */

const { ref, toRaw } = require('vue')

console.log('========== 模拟 toConversationSnapshot ==========')

// 模拟 conversation 是响应式对象
const conversations = ref([
  {
    id: 'test-1',
    title: 'Test Conversation',
    reasoningPreference: {
      visibility: 'visible',
      effort: 'medium',
      maxTokens: null
    },
    tree: { branches: new Map(), rootBranchIds: [], currentPath: [] }
  }
])

const conversation = conversations.value[0]

// 模拟 normalizeReasoningPreference
function normalizeReasoningPreference(input) {
  const source = input && typeof input === 'object' ? input : {}
  return {
    visibility: source.visibility || 'visible',
    effort: source.effort || 'medium',
    maxTokens: source.maxTokens || null
  }
}

// 模拟 serializeTree
function serializeTree(tree) {
  return {
    branches: [],
    rootBranchIds: tree.rootBranchIds,
    currentPath: tree.currentPath
  }
}

// 模拟 toConversationSnapshot（当前实现）
function toConversationSnapshot(conversation) {
  const serializedTree = serializeTree(conversation.tree)
  return {
    id: conversation.id,
    title: conversation.title,
    projectId: conversation.projectId ?? null,
    tree: serializedTree,
    model: conversation.model || 'gemini-2.0-flash-exp',
    draft: conversation.draft || '',
    createdAt: conversation.createdAt || Date.now(),
    updatedAt: conversation.updatedAt || Date.now(),
    webSearchEnabled: conversation.webSearchEnabled ?? false,
    webSearchLevel: conversation.webSearchLevel || 'normal',
    reasoningPreference: normalizeReasoningPreference(conversation.reasoningPreference)
  }
}

console.log('1. 测试当前实现...')
const snapshot1 = toConversationSnapshot(conversation)
console.log('   snapshot 的 reasoningPreference 是 Proxy?', require('util').types.isProxy(snapshot1.reasoningPreference))

try {
  structuredClone(snapshot1)
  console.log('   ✓ 克隆成功')
} catch (e) {
  console.log('   ✗ 克隆失败:', e.message)
}

// 修改 reasoningPreference（模拟 setConversationReasoningPreference）
console.log('\n2. 修改 reasoningPreference 后...')
conversation.reasoningPreference = { visibility: 'hidden', effort: 'high', maxTokens: 1000 }
const snapshot2 = toConversationSnapshot(conversation)
console.log('   snapshot 的 reasoningPreference 是 Proxy?', require('util').types.isProxy(snapshot2.reasoningPreference))

try {
  structuredClone(snapshot2)
  console.log('   ✓ 克隆成功')
} catch (e) {
  console.log('   ✗ 克隆失败:', e.message)
}

// 使用 toRaw 的改进版本
console.log('\n========== 改进版本 1: 在 toConversationSnapshot 中使用 toRaw ==========')
function toConversationSnapshotFixed1(conversation) {
  const serializedTree = serializeTree(conversation.tree)
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
    reasoningPreference: normalizeReasoningPreference(toRaw(rawConv.reasoningPreference))
  }
}

const snapshot3 = toConversationSnapshotFixed1(conversation)
console.log('snapshot 的 reasoningPreference 是 Proxy?', require('util').types.isProxy(snapshot3.reasoningPreference))

try {
  structuredClone(snapshot3)
  console.log('✓ 克隆成功')
} catch (e) {
  console.log('✗ 克隆失败:', e.message)
}

// JSON 方式
console.log('\n========== 改进版本 2: 使用 JSON 序列化 ==========')
function toConversationSnapshotFixed2(conversation) {
  const serializedTree = serializeTree(conversation.tree)
  const rawConv = JSON.parse(JSON.stringify(toRaw(conversation)))
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
    reasoningPreference: normalizeReasoningPreference(rawConv.reasoningPreference)
  }
}

const snapshot4 = toConversationSnapshotFixed2(conversation)
console.log('snapshot 的 reasoningPreference 是 Proxy?', require('util').types.isProxy(snapshot4.reasoningPreference))

try {
  structuredClone(snapshot4)
  console.log('✓ 克隆成功')
} catch (e) {
  console.log('✗ 克隆失败:', e.message)
}
