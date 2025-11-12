// 测试 better-sqlite3 是否能正常加载
import Database from 'better-sqlite3'

console.log('测试 better-sqlite3 加载...\n')

try {
  console.log('✅ better-sqlite3 加载成功！')
  
  // 创建内存数据库测试
  const db = new Database(':memory:')
  console.log('✅ 成功创建内存数据库')
  
  // 测试简单查询
  db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)')
  db.prepare('INSERT INTO test (name) VALUES (?)').run('测试数据')
  const result = db.prepare('SELECT * FROM test').get()
  console.log('✅ 数据库操作正常:', result)
  
  db.close()
  console.log('✅ 数据库已关闭')
  
  console.log('\n🎉 所有测试通过！better-sqlite3 工作正常')
} catch (error) {
  console.error('❌ 错误:', error.message)
  console.error('\n完整错误信息:')
  console.error(error)
  process.exit(1)
}
