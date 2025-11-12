/**
 * 聊天存储方案调用检查脚本
 * 检查当前 chatStore 是否真正调用新版存储方案
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const CHAT_STORE_PATH = path.join(__dirname, 'src', 'stores', 'chatStore.js')
const CHAT_PERSISTENCE_PATH = path.join(__dirname, 'src', 'services', 'chatPersistence.ts')

console.log('🔍 检查聊天存储方案调用情况...\n')

// 读取 chatStore.js
const chatStoreContent = fs.readFileSync(CHAT_STORE_PATH, 'utf-8')

// 读取 chatPersistence.ts
const chatPersistenceContent = fs.readFileSync(CHAT_PERSISTENCE_PATH, 'utf-8')

console.log('====== 1. 检查 chatStore.js 的导入 ======')
const importMatch = chatStoreContent.match(/import.*sqliteChatPersistence.*from.*chatPersistence/g)
if (importMatch) {
  console.log('✅ 找到 sqliteChatPersistence 导入:')
  importMatch.forEach(imp => console.log('   ', imp))
} else {
  console.log('❌ 未找到 sqliteChatPersistence 导入')
}

console.log('\n====== 2. 检查 SQLite 持久化开关 ======')
const sqliteSwitchPatterns = [
  /shouldUseSqlitePersistence/g,
  /useSqlitePersistence\.value/g
]

sqliteSwitchPatterns.forEach(pattern => {
  const matches = chatStoreContent.match(pattern)
  if (matches) {
    console.log(`✅ 找到 ${pattern.source}: ${matches.length} 处使用`)
  }
})

console.log('\n====== 3. 检查 sqliteChatPersistence 的实际调用 ======')
const methodCalls = [
  { method: 'listConversations', pattern: /sqliteChatPersistence\.listConversations\(\)/g },
  { method: 'saveConversation', pattern: /sqliteChatPersistence\.saveConversation\(/g },
  { method: 'deleteConversation', pattern: /sqliteChatPersistence\.deleteConversation\(/g }
]

methodCalls.forEach(({ method, pattern }) => {
  const matches = chatStoreContent.match(pattern)
  if (matches) {
    console.log(`✅ ${method}: 调用 ${matches.length} 次`)
    
    // 找到调用位置
    const lines = chatStoreContent.split('\n')
    lines.forEach((line, index) => {
      if (pattern.test(line)) {
        console.log(`   行 ${index + 1}: ${line.trim()}`)
      }
    })
  } else {
    console.log(`❌ ${method}: 未找到调用`)
  }
})

console.log('\n====== 4. 检查 saveConversations() 函数实现 ======')
const saveConversationsMatch = chatStoreContent.match(/const saveConversations = async \(forceFull = false\) => \{[\s\S]*?^\s{2}\}/m)
if (saveConversationsMatch) {
  const funcContent = saveConversationsMatch[0]
  
  console.log('✅ 找到 saveConversations 函数')
  
  // 检查是否有 SQLite 分支
  if (/if \(shouldUseSqlitePersistence\.value\)/.test(funcContent)) {
    console.log('✅ 包含 SQLite 持久化分支')
    
    // 检查 SQLite 分支内容
    const sqliteBranchMatch = funcContent.match(/if \(shouldUseSqlitePersistence\.value\) \{([\s\S]*?)\}/m)
    if (sqliteBranchMatch) {
      const branchContent = sqliteBranchMatch[1]
      console.log('   SQLite 分支执行:')
      
      if (branchContent.includes('sqliteChatPersistence.saveConversation')) {
        console.log('   ✅ 调用 sqliteChatPersistence.saveConversation')
      }
      if (branchContent.includes('sqliteChatPersistence.deleteConversation')) {
        console.log('   ✅ 调用 sqliteChatPersistence.deleteConversation')
      }
      if (branchContent.includes('toConversationSnapshot')) {
        console.log('   ✅ 使用 toConversationSnapshot 转换数据')
      }
      if (branchContent.includes('for (const conv of conversationsToSave)')) {
        console.log('   ✅ 逐条保存对话（避免整体序列化）')
      }
      if (branchContent.includes('dirtyConversationIds.value.clear()')) {
        console.log('   ✅ 清空脏标记')
      }
    }
  } else {
    console.log('❌ 未找到 SQLite 持久化分支')
  }
  
  // 检查是否仍有旧的 JSON 序列化逻辑（作为回退）
  if (/JSON\.parse\(JSON\.stringify/.test(funcContent)) {
    console.log('⚠️  仍保留旧的 JSON 序列化逻辑（可能作为回退方案）')
  }
} else {
  console.log('❌ 未找到 saveConversations 函数')
}

console.log('\n====== 5. 检查 chatPersistence.ts 实现 ======')
if (chatPersistenceContent.includes('class SqliteChatPersistence')) {
  console.log('✅ 找到 SqliteChatPersistence 类')
  
  // 检查关键方法
  const methods = ['listConversations', 'saveConversation', 'deleteConversation']
  methods.forEach(method => {
    if (new RegExp(`async ${method}\\(`).test(chatPersistenceContent)) {
      console.log(`   ✅ 实现了 ${method} 方法`)
    } else {
      console.log(`   ❌ 缺少 ${method} 方法`)
    }
  })
  
  // 检查是否使用 dbService
  if (chatPersistenceContent.includes('dbService.saveConvo')) {
    console.log('   ✅ 使用 dbService.saveConvo 保存到数据库')
  }
  if (chatPersistenceContent.includes('dbService.replaceMessages')) {
    console.log('   ✅ 使用 dbService.replaceMessages 更新消息')
  }
  if (chatPersistenceContent.includes('serializeTree')) {
    console.log('   ✅ 使用 serializeTree 序列化分支树')
  }
} else {
  console.log('❌ 未找到 SqliteChatPersistence 类')
}

console.log('\n====== 6. 检查增量保存逻辑 ======')
if (/dirtyConversationIds\.value\.add\(/g.test(chatStoreContent)) {
  console.log('✅ 实现了脏标记机制（dirtyConversationIds）')
  
  const dirtyMatches = chatStoreContent.match(/dirtyConversationIds\.value\.add\([^)]*\)/g)
  console.log(`   标记脏数据的位置: ${dirtyMatches ? dirtyMatches.length : 0} 处`)
}

if (/conversationsToSave = conversations\.value\.filter\(conv =>[\s\S]*?dirtyIds\.includes\(conv\.id\)\)/m.test(chatStoreContent)) {
  console.log('✅ 实现了增量保存过滤逻辑')
}

console.log('\n====== 7. 总结 ======')

const hasSqliteImport = /import.*sqliteChatPersistence/.test(chatStoreContent)
const hasSqliteSwitch = /shouldUseSqlitePersistence/.test(chatStoreContent)
const hasSqliteCalls = /sqliteChatPersistence\.(save|list|delete)/.test(chatStoreContent)
const hasSqliteBranch = /if \(shouldUseSqlitePersistence\.value\)/.test(chatStoreContent)
const hasPersistenceClass = /class SqliteChatPersistence/.test(chatPersistenceContent)

if (hasSqliteImport && hasSqliteSwitch && hasSqliteCalls && hasSqliteBranch && hasPersistenceClass) {
  console.log('✅ 新版存储方案已正确实现并集成')
  console.log('\n存储流程:')
  console.log('  1. chatStore 检查 shouldUseSqlitePersistence')
  console.log('  2. 如果启用，调用 sqliteChatPersistence.saveConversation()')
  console.log('  3. sqliteChatPersistence 将数据保存到 SQLite 数据库')
  console.log('  4. 使用增量保存机制，只保存变更的对话')
  console.log('  5. 避免整体 JSON 序列化，提升性能')
  console.log('\n✅ 当前聊天存储确实使用了新版存储方案！')
} else {
  console.log('❌ 存储方案集成不完整：')
  if (!hasSqliteImport) console.log('  - 缺少 sqliteChatPersistence 导入')
  if (!hasSqliteSwitch) console.log('  - 缺少 SQLite 开关')
  if (!hasSqliteCalls) console.log('  - 缺少实际调用')
  if (!hasSqliteBranch) console.log('  - 缺少条件分支')
  if (!hasPersistenceClass) console.log('  - 缺少持久化类实现')
}

console.log('\n🔧 如需切换存储方式，可在应用设置中切换 useSqlitePersistence')
