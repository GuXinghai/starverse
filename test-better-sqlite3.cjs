// 测试 better-sqlite3 是否正常工作
const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

try {
  console.log('✓ better-sqlite3 模块加载成功');
  
  // 创建临时数据库
  const dbPath = path.join(os.tmpdir(), 'test-sqlite.db');
  console.log(`创建测试数据库: ${dbPath}`);
  
  const db = new Database(dbPath);
  console.log('✓ 数据库连接成功');
  
  // 创建测试表
  db.exec('CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY, name TEXT)');
  console.log('✓ 创建表成功');
  
  // 插入数据
  const insert = db.prepare('INSERT INTO test (name) VALUES (?)');
  insert.run('测试数据');
  console.log('✓ 插入数据成功');
  
  // 查询数据
  const row = db.prepare('SELECT * FROM test').get();
  console.log('✓ 查询数据成功:', row);
  
  db.close();
  console.log('✓ 数据库关闭成功');
  
  console.log('\n🎉 better-sqlite3 完全正常工作！');
  process.exit(0);
} catch (error) {
  console.error('❌ better-sqlite3 测试失败:', error);
  process.exit(1);
}
