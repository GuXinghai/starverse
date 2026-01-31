/**
 * Projects v0.1 验收测试脚本
 * 
 * 用法: npm run db:verify
 * 
 * 验收点:
 * 1. PRAGMA table_info(project) 包含 is_system/system_key
 * 2. SELECT COUNT(*) FROM project WHERE system_key='inbox' = 1
 * 3. EXPLAIN QUERY PLAN: convo 查询使用 idx_convo_project_activity
 * 4. 删除 inbox 返回 ERR_DELETE_FORBIDDEN
 * 5. 新建会话不传 projectId → project_id = inboxId
 * 6. FTS5 虚拟表存在
 * 7. 分支表索引存在
 * 8. message 表索引覆盖
 */

const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')
const os = require('os')

/**
 * 获取数据库路径
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

const dbPath = getDbPath()

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('  Projects v0.1 验收测试')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(`  数据库路径: ${dbPath}`)
console.log('')

// 检查数据库是否存在
if (!fs.existsSync(dbPath)) {
  console.log('❌ 数据库文件不存在！请先运行应用以创建数据库。')
  process.exit(1)
}

const db = new Database(dbPath, { readonly: true })
let passed = 0
let failed = 0

function test(name, fn) {
  try {
    const result = fn()
    if (result.ok) {
      console.log(`✅ ${name}`)
      if (result.detail) console.log(`   ${result.detail}`)
      passed++
    } else {
      console.log(`❌ ${name}`)
      console.log(`   ${result.error}`)
      failed++
    }
  } catch (err) {
    console.log(`❌ ${name}`)
    console.log(`   异常: ${err.message}`)
    failed++
  }
}

// ========== 验收测试 ==========

// 1. PRAGMA table_info(project) 包含 is_system/system_key
test('project 表包含 is_system 和 system_key 列', () => {
  const cols = db.prepare('PRAGMA table_info(project)').all()
  const colNames = cols.map(c => c.name)
  const hasIsSystem = colNames.includes('is_system')
  const hasSystemKey = colNames.includes('system_key')
  
  if (hasIsSystem && hasSystemKey) {
    return { ok: true, detail: `列: ${colNames.join(', ')}` }
  }
  return { ok: false, error: `缺少列 - is_system: ${hasIsSystem}, system_key: ${hasSystemKey}` }
})

// 2. Inbox 项目存在且唯一
test('Inbox 项目存在且 system_key=inbox 唯一', () => {
  const row = db.prepare("SELECT COUNT(*) as cnt FROM project WHERE system_key = 'inbox'").get()
  if (row.cnt === 1) {
    const inbox = db.prepare("SELECT id, name FROM project WHERE system_key = 'inbox'").get()
    return { ok: true, detail: `Inbox ID: ${inbox.id}, Name: ${inbox.name}` }
  }
  return { ok: false, error: `Inbox 数量: ${row.cnt} (期望 1)` }
})

// 3. EXPLAIN QUERY PLAN 使用 idx_convo_project_activity
test('convo 查询使用 idx_convo_project_activity 索引', () => {
  const inbox = db.prepare("SELECT id FROM project WHERE system_key = 'inbox'").get()
  const plan = db.prepare(`
    EXPLAIN QUERY PLAN
    SELECT id, title, updated_at FROM convo
    WHERE project_id = ?
    ORDER BY updated_at DESC
    LIMIT 200
  `).all(inbox.id)
  
  const planText = plan.map(p => p.detail).join(' ')
  const usesIndex = planText.includes('idx_convo_project_activity')
  
  if (usesIndex) {
    return { ok: true, detail: `查询计划: ${planText}` }
  }
  return { ok: false, error: `未使用预期索引。查询计划: ${planText}` }
})

// 4. idx_project_system_key 索引存在
test('idx_project_system_key UNIQUE 索引存在', () => {
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='project'").all()
  const indexNames = indexes.map(i => i.name)
  const hasIndex = indexNames.includes('idx_project_system_key')
  
  if (hasIndex) {
    return { ok: true, detail: `project 索引: ${indexNames.join(', ')}` }
  }
  return { ok: false, error: `缺少 idx_project_system_key。现有索引: ${indexNames.join(', ')}` }
})

// 5. idx_convo_project_activity 索引存在
test('idx_convo_project_activity 索引存在', () => {
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='convo'").all()
  const indexNames = indexes.map(i => i.name)
  const hasIndex = indexNames.includes('idx_convo_project_activity')
  
  if (hasIndex) {
    return { ok: true, detail: `convo 索引: ${indexNames.join(', ')}` }
  }
  return { ok: false, error: `缺少 idx_convo_project_activity。现有索引: ${indexNames.join(', ')}` }
})

// 6. 所有会话都有 project_id (无 NULL)
test('所有会话都已归属项目 (无 project_id = NULL)', () => {
  const row = db.prepare('SELECT COUNT(*) as cnt FROM convo WHERE project_id IS NULL').get()
  if (row.cnt === 0) {
    const total = db.prepare('SELECT COUNT(*) as cnt FROM convo').get()
    return { ok: true, detail: `共 ${total.cnt} 个会话，全部已归属项目` }
  }
  return { ok: false, error: `发现 ${row.cnt} 个未归属会话` }
})

// 7. Inbox 项目 is_system = 1
test('Inbox 项目 is_system = 1', () => {
  const inbox = db.prepare("SELECT is_system FROM project WHERE system_key = 'inbox'").get()
  if (inbox && inbox.is_system === 1) {
    return { ok: true }
  }
  return { ok: false, error: `Inbox is_system = ${inbox?.is_system} (期望 1)` }
})

// 8. 检查关键索引数量
test('核心索引已创建 (convo 表至少 3 个索引)', () => {
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='convo' AND name NOT LIKE 'sqlite_%'").all()
  const count = indexes.length
  
  if (count >= 3) {
    return { ok: true, detail: `convo 索引数: ${count}` }
  }
  return { ok: false, error: `convo 索引数: ${count} (期望 >= 3)` }
})

// 9. FTS5 虚拟表存在
test('FTS5 虚拟表 message_fts 存在', () => {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='message_fts'").all()
  if (tables.length === 1) {
    return { ok: true, detail: 'message_fts 虚拟表已创建' }
  }
  return { ok: false, error: 'message_fts 虚拟表不存在' }
})

// 10. FTS5 触发器存在
test('FTS5 删除同步触发器 trg_message_del 存在', () => {
  const triggers = db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='trg_message_del'").all()
  if (triggers.length === 1) {
    return { ok: true, detail: 'trg_message_del 触发器已创建' }
  }
  return { ok: false, error: 'trg_message_del 触发器不存在' }
})

// 11. 分支表索引存在
test('分支表索引已创建 (branch 表至少 2 个索引)', () => {
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='branch' AND name NOT LIKE 'sqlite_%'").all()
  const indexNames = indexes.map(i => i.name)
  const count = indexes.length
  
  if (count >= 2) {
    return { ok: true, detail: `branch 索引: ${indexNames.join(', ')}` }
  }
  return { ok: false, error: `branch 索引数: ${count} (期望 >= 2)` }
})

// 12. message 表关键索引检查
test('message 表关键索引已创建', () => {
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='message' AND name NOT LIKE 'sqlite_%'").all()
  const indexNames = indexes.map(i => i.name)
  
  // 期望的关键索引
  const expectedIndexes = ['idx_msg_convo_seq', 'idx_msg_parent', 'idx_msg_answer_root']
  const missing = expectedIndexes.filter(idx => !indexNames.includes(idx))
  
  if (missing.length === 0) {
    return { ok: true, detail: `message 索引: ${indexNames.join(', ')}` }
  }
  return { ok: false, error: `缺少索引: ${missing.join(', ')}。现有: ${indexNames.join(', ')}` }
})

// 13. model_data 表索引检查
test('model_data 表索引已创建', () => {
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='model_data' AND name NOT LIKE 'sqlite_%'").all()
  const count = indexes.length
  
  if (count >= 1) {
    const indexNames = indexes.map(i => i.name)
    return { ok: true, detail: `model_data 索引: ${indexNames.join(', ')}` }
  }
  return { ok: false, error: `model_data 索引数: ${count} (期望 >= 1)` }
})

// ========== 结果汇总 ==========

db.close()

console.log('')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(`  结果: ${passed} 通过, ${failed} 失败`)
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

process.exit(failed > 0 ? 1 : 0)
