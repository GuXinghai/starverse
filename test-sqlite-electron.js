// Electron 环境下测试 better-sqlite3
const { app } = require('electron')
const Database = require('better-sqlite3')

app.whenReady().then(() => {
  console.log('\n=== Electron 环境测试 better-sqlite3 ===\n')
  console.log('Electron 版本:', process.versions.electron)
  console.log('Node 版本:', process.versions.node)
  console.log('Chrome 版本:', process.versions.chrome)
  console.log('NODE_MODULE_VERSION:', process.versions.modules)
  
  try {
    console.log('\n✅ better-sqlite3 加载成功！')
    
    // 创建内存数据库测试
    const db = new Database(':memory:')
    console.log('✅ 成功创建内存数据库')
    
    // 测试简单查询
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)')
    db.prepare('INSERT INTO test (name) VALUES (?)').run('Electron测试数据')
    const result = db.prepare('SELECT * FROM test').get()
    console.log('✅ 数据库操作正常:', result)
    
    db.close()
    console.log('✅ 数据库已关闭')
    
    console.log('\n🎉 Electron 环境测试通过！better-sqlite3 工作正常\n')
    app.quit()
  } catch (error) {
    console.error('\n❌ 错误:', error.message)
    console.error('\n完整错误信息:')
    console.error(error)
    app.exit(1)
  }
})
