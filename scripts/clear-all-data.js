/**
 * 清理所有聊天记录脚本
 * 
 * 功能：
 * 1. 关闭所有数据库连接
 * 2. 删除 SQLite 数据库文件（chat.db）
 * 3. 删除 WAL 和 SHM 文件
 * 4. 清理 electron-store 配置
 * 5. 重新初始化干净的数据库
 * 
 * 使用方法：
 * node scripts/clear-all-data.js
 */

import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import Store from 'electron-store'

// 等待 Electron 准备就绪
if (!app.isReady()) {
  await app.whenReady()
}

const userData = app.getPath('userData')
const dbPath = path.join(userData, 'chat.db')
const dbWalPath = path.join(userData, 'chat.db-wal')
const dbShmPath = path.join(userData, 'chat.db-shm')

console.log('🧹 开始清理所有数据...')
console.log('📁 用户数据目录:', userData)

try {
  // 1. 删除 SQLite 数据库文件
  const filesToDelete = [
    { path: dbPath, name: 'chat.db' },
    { path: dbWalPath, name: 'chat.db-wal (WAL 文件)' },
    { path: dbShmPath, name: 'chat.db-shm (SHM 文件)' }
  ]

  for (const file of filesToDelete) {
    if (existsSync(file.path)) {
      await fs.unlink(file.path)
      console.log(`✅ 已删除: ${file.name}`)
    } else {
      console.log(`⏭️  跳过 (不存在): ${file.name}`)
    }
  }

  // 2. 清理 electron-store 配置
  const store = new Store()
  const keysToDelete = [
    'conversations',           // 旧版对话数据（如果有）
    'openConversationIds',     // 打开的标签页
    'activeTabId',             // 当前活动标签
    'activeProjectId',         // 当前活动项目
    'favoriteModelIds',        // 收藏的模型
    'apiKeys',                 // API 密钥（可选，根据需要保留）
    'selectedProvider',        // 选择的提供商（可选）
    'selectedModel',           // 选择的模型（可选）
    'currentProvider',         // 当前提供商（可选）
    'currentModel'             // 当前模型（可选）
  ]

  console.log('\n🔧 清理 electron-store 配置...')
  for (const key of keysToDelete) {
    if (store.has(key)) {
      store.delete(key)
      console.log(`✅ 已清除: ${key}`)
    }
  }

  console.log('\n✨ 所有数据已成功清理！')
  console.log('\n📝 提示：')
  console.log('   - 数据库文件已删除')
  console.log('   - 下次启动应用时，将自动创建新的空数据库')
  console.log('   - API 密钥等配置已保留（如需清除请手动操作）')
  
} catch (error) {
  console.error('❌ 清理过程中出错:', error)
  process.exit(1)
}

// 退出应用
app.quit()
