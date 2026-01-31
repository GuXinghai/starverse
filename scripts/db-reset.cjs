/**
 * 数据库重置脚本 (dev-only)
 * 
 * 用法: npm run db:reset
 * 
 * 功能:
 * - 删除 SQLite 数据库文件 (*.db, *.db-wal, *.db-shm)
 * - 下次启动应用时会自动创建全新数据库
 * - 自动检测平台特定路径 (Windows/macOS/Linux)
 * - 带重试机制处理 Windows 文件锁
 */

const fs = require('fs')
const path = require('path')
const os = require('os')

/**
 * 获取 Electron app 数据路径
 * 使用 os.homedir() 确保跨平台可移植性
 */
function getDbPath() {
  const platform = process.platform
  const appName = 'Starverse'
  
  let appDataPath
  if (platform === 'win32') {
    appDataPath = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
  } else if (platform === 'darwin') {
    appDataPath = path.join(os.homedir(), 'Library', 'Application Support')
  } else {
    appDataPath = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
  }
  
  return path.join(appDataPath, appName, 'chat.db')
}

/**
 * 带重试的文件删除（处理 Windows 文件锁）
 * @param {string} file - 文件路径
 * @param {number} maxRetries - 最大重试次数
 * @param {number} baseDelay - 基础延迟(ms)
 * @returns {{ success: boolean, skipped?: boolean, error?: string }}
 */
function deleteWithRetry(file, maxRetries = 5, baseDelay = 100) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (!fs.existsSync(file)) {
        return { success: true, skipped: true }
      }
      fs.unlinkSync(file)
      return { success: true }
    } catch (err) {
      if (err.code === 'ENOENT') {
        return { success: true, skipped: true }
      }
      // Windows 文件锁 (EBUSY) 或权限问题 (EPERM)
      if (attempt < maxRetries && (err.code === 'EBUSY' || err.code === 'EPERM')) {
        const delay = baseDelay * attempt
        console.log(`   ⏳ Retry ${attempt}/${maxRetries} for ${path.basename(file)} (waiting ${delay}ms)...`)
        // 同步等待
        const start = Date.now()
        while (Date.now() - start < delay) { /* busy wait */ }
        continue
      }
      return { success: false, error: err.message }
    }
  }
  return { success: false, error: 'Max retries exceeded (file may be locked)' }
}

function main() {
  const dbPath = getDbPath()
  const filesToDelete = [
    dbPath,
    `${dbPath}-wal`,
    `${dbPath}-shm`,
  ]
  
  console.log('🔄 Resetting database...')
  console.log(`   Platform: ${process.platform}`)
  console.log(`   Database path: ${dbPath}`)
  console.log('')
  
  let deletedCount = 0
  let failedCount = 0
  
  for (const file of filesToDelete) {
    const result = deleteWithRetry(file)
    if (result.success) {
      if (!result.skipped) {
        console.log(`   ✅ Deleted: ${path.basename(file)}`)
        deletedCount++
      }
    } else {
      console.error(`   ❌ Failed to delete ${path.basename(file)}: ${result.error}`)
      failedCount++
    }
  }
  
  console.log('')
  if (failedCount > 0) {
    console.log(`⚠️  Warning: ${failedCount} file(s) could not be deleted.`)
    console.log('   Please close the application and try again.')
    process.exit(1)
  } else if (deletedCount === 0) {
    console.log('ℹ️  No database files found (already clean)')
  } else {
    console.log(`✅ Reset complete. Deleted ${deletedCount} file(s).`)
    console.log('   Next app launch will create a fresh database with Inbox.')
  }
}

main()
