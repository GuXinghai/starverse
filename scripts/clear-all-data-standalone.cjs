/**
 * 独立的数据清理脚本（不依赖 Electron 运行时）
 * 
 * 功能：
 * 1. 直接删除 SQLite 数据库文件
 * 2. 删除 WAL 和 SHM 文件
 * 3. 清理 electron-store 配置文件
 * 
 * 使用方法：
 * node scripts/clear-all-data-standalone.cjs
 * 
 * 注意：请确保应用未在运行！
 */

const fs = require('fs')
const path = require('path')
const os = require('os')

// 获取 userData 目录路径
function getUserDataPath() {
  const appName = 'Starverse' // 你的应用名称
  
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), appName)
  } else if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', appName)
  } else {
    return path.join(os.homedir(), '.config', appName)
  }
}

const userData = getUserDataPath()
const dbPath = path.join(userData, 'chat.db')
const dbWalPath = path.join(userData, 'chat.db-wal')
const dbShmPath = path.join(userData, 'chat.db-shm')
const configPath = path.join(userData, 'config.json')

console.log('🧹 开始清理所有数据...')
console.log('📁 用户数据目录:', userData)
console.log('⚠️  请确保应用已完全关闭！\n')

try {
  // 1. 删除 SQLite 数据库文件
  const filesToDelete = [
    { path: dbPath, name: 'chat.db (主数据库)' },
    { path: dbWalPath, name: 'chat.db-wal (预写日志)' },
    { path: dbShmPath, name: 'chat.db-shm (共享内存)' }
  ]

  let deletedCount = 0
  for (const file of filesToDelete) {
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path)
      console.log(`✅ 已删除: ${file.name}`)
      deletedCount++
    } else {
      console.log(`⏭️  跳过 (不存在): ${file.name}`)
    }
  }

  // 2. 清理 electron-store 配置
  if (fs.existsSync(configPath)) {
    console.log('\n🔧 处理 electron-store 配置...')
    
    try {
      const configData = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      const originalSize = Object.keys(configData).length
      
      // 删除对话相关的键
      const keysToDelete = [
        'conversations',
        'openConversationIds',
        'activeTabId',
        'activeProjectId',
        'favoriteModelIds'
      ]
      
      let deletedKeys = 0
      for (const key of keysToDelete) {
        if (key in configData) {
          delete configData[key]
          deletedKeys++
          console.log(`✅ 已清除: ${key}`)
        }
      }
      
      // 写回配置文件
      if (deletedKeys > 0) {
        fs.writeFileSync(configPath, JSON.stringify(configData, null, 2))
        console.log(`✅ 已更新配置文件 (删除了 ${deletedKeys} 个键)`)
      } else {
        console.log('⏭️  配置文件中没有需要清理的键')
      }
      
    } catch (error) {
      console.error('⚠️  处理配置文件时出错:', error.message)
      console.log('   您可以手动删除配置文件:', configPath)
    }
  } else {
    console.log('\n⏭️  配置文件不存在，跳过')
  }

  console.log('\n✨ 清理完成！')
  console.log(`📊 统计: 删除了 ${deletedCount} 个数据库文件`)
  console.log('\n📝 提示：')
  console.log('   ✓ 所有聊天记录已被清除')
  console.log('   ✓ 项目数据已被清除')
  console.log('   ✓ 下次启动应用时将创建全新的数据库')
  console.log('   ✓ API 密钥等设置已保留')
  console.log('\n⚠️  如需彻底清理所有数据，请手动删除整个目录：')
  console.log(`   ${userData}`)
  
} catch (error) {
  console.error('❌ 清理过程中出错:', error)
  process.exit(1)
}
