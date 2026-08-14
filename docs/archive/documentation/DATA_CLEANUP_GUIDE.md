# 数据清理工具使用指南

本目录包含用于完全清理 Starverse 聊天记录和项目数据的工具。

## ⚠️ 重要警告

**执行清理操作前，请确保：**
1. ✅ 已完全关闭 Starverse 应用
2. ✅ 已备份重要的聊天记录（如需保留）
3. ✅ 理解此操作不可逆

## 🛠️ 清理工具说明

### 方法 1：一键清理（推荐）

#### Windows 批处理脚本
```bash
# 双击运行
clear-all-data.bat
```

#### PowerShell 脚本
```powershell
# 右键 -> 使用 PowerShell 运行
.\clear-all-data.ps1
```

### 方法 2：使用 Node.js 脚本

#### 独立清理脚本（无需 Electron）
```bash
node scripts/clear-all-data-standalone.cjs
```

#### Electron 内清理脚本
```bash
node scripts/clear-all-data.js
```

## 📁 清理的数据

清理工具会删除以下内容：

### 1. SQLite 数据库文件
- `chat.db` - 主数据库文件
- `chat.db-wal` - 预写日志文件（Write-Ahead Log）
- `chat.db-shm` - 共享内存文件（Shared Memory）

### 2. electron-store 配置
- `conversations` - 旧版对话数据（如果存在）
- `openConversationIds` - 打开的标签页记录
- `activeTabId` - 当前活动标签
- `activeProjectId` - 当前活动项目
- `favoriteModelIds` - 收藏的模型列表

### 3. 保留的数据
以下数据**不会**被清理：
- ✅ API 密钥配置
- ✅ 模型选择偏好
- ✅ 提供商选择
- ✅ 其他应用设置

## 🗂️ 数据库文件位置

不同操作系统的数据库文件位置：

### Windows
```
%APPDATA%\Starverse\chat.db
C:\Users\<用户名>\AppData\Roaming\Starverse\
```

### macOS
```
~/Library/Application Support/Starverse/chat.db
```

### Linux
```
~/.config/Starverse/chat.db
```

## 🔍 清理验证

清理完成后，可以通过以下方式验证：

1. **检查数据库文件**
   - 导航到用户数据目录
   - 确认 `chat.db` 及相关文件已被删除

2. **启动应用验证**
   - 启动 Starverse 应用
   - 应该看到空白的对话列表
   - 应用会自动创建新的数据库

3. **查看控制台日志**
   清理脚本会输出详细的操作日志：
   ```
   ✅ 已删除: chat.db (主数据库)
   ✅ 已删除: chat.db-wal (预写日志)
   ✅ 已删除: chat.db-shm (共享内存)
   ✅ 已清除: conversations
   ✅ 已清除: openConversationIds
   ...
   ```

## 🛡️ 安全注意事项

### 防止数据损坏
1. **确保应用已关闭**
   - 数据库文件被锁定时无法删除
   - 可能导致数据不一致

2. **使用独立脚本**
   - 推荐使用 `clear-all-data-standalone.cjs`
   - 不依赖 Electron 运行时
   - 更可靠和安全

3. **定期清理的场景**
   - 遇到数据损坏问题
   - 开发测试需要清空数据
   - 应用行为异常需要重置

## 🚀 清理后的首次启动

清理数据后首次启动应用时：

1. **自动初始化**
   - 应用会自动创建新的 `chat.db`
   - 执行数据库 schema 初始化
   - 创建必要的表结构

2. **默认状态**
   - 创建一个新的空对话
   - 自动在标签页中打开
   - 所有项目列表为空

3. **预期日志输出**
   ```
   ✅ 从 SQLite 加载了 0 个项目
   ✅ 从 SQLite 加载了 0 个对话
   ✅ 创建了新对话
   ```

## 🔧 手动清理（高级）

如果自动脚本无法工作，可以手动清理：

### 步骤 1：关闭应用
确保 Starverse 完全关闭（检查任务管理器）

### 步骤 2：删除数据库文件
```bash
# Windows
del "%APPDATA%\Starverse\chat.db*"

# macOS/Linux
rm ~/Library/Application\ Support/Starverse/chat.db*
```

### 步骤 3：编辑配置文件
打开 `%APPDATA%\Starverse\config.json`，删除以下键：
```json
{
  // 删除这些键
  "conversations": [...],
  "openConversationIds": [...],
  "activeTabId": "...",
  "activeProjectId": "...",
  "favoriteModelIds": [...]
}
```

## ❓ 常见问题

### Q: 清理后 API 密钥还在吗？
A: 是的，API 密钥和提供商设置会保留。

### Q: 可以恢复删除的数据吗？
A: 不可以，数据被永久删除。请在清理前备份重要内容。

### Q: 清理后应用无法启动？
A: 尝试删除整个用户数据目录，让应用完全重新初始化。

### Q: 脚本报错"文件被占用"？
A: 确保应用已完全关闭。可以在任务管理器中结束所有 Starverse 进程。

### Q: 想只清理聊天记录，保留项目？
A: 需要手动修改脚本，只删除对话相关的数据表。

## 📞 获取帮助

如果遇到问题：
1. 检查控制台输出的错误信息
2. 查看应用日志
3. 在 GitHub Issues 中提问
4. 提供清理脚本的完整输出日志

---

**最后更新**: 2025-11-11
**版本**: 1.0.0
