# 🧹 快速清理指南

**快速清理所有聊天记录的三步指南**

## ⚠️ 开始前

1. **完全关闭 Starverse 应用**
   - 点击窗口的关闭按钮
   - 确保任务管理器中没有 Starverse 进程

2. **备份重要数据**（可选）
   - 如果有重要聊天记录，请先手动复制保存
   - 数据库文件位置：`%APPDATA%\Starverse\chat.db`

## 🚀 三步清理

### 第一步：选择清理方式

#### 方式 A：双击批处理脚本（最简单）
```
📁 找到文件：clear-all-data.bat
👆 双击运行
⌨️ 按任意键确认
```

#### 方式 B：使用 Node.js
```bash
node scripts/clear-all-data-standalone.cjs
```

### 第二步：等待清理完成

看到以下输出表示成功：
```
✅ 已删除: chat.db (主数据库)
✅ 已删除: chat.db-wal (预写日志)
✅ 已删除: chat.db-shm (共享内存)
✅ 已清除: conversations
✅ 已清除: openConversationIds
...
✨ 清理完成！
```

### 第三步：重新启动应用

```bash
npm run electron:dev
```

应用会自动：
- 创建新的数据库
- 初始化表结构
- 创建一个空白对话

## ✅ 验证清理成功

启动后应该看到：
- ✅ 对话列表为空
- ✅ 项目列表为空
- ✅ 只有一个新的空白对话
- ✅ API 密钥设置保留

## 🆘 遇到问题？

### 问题：提示"文件被占用"
**解决方案**：
1. 打开任务管理器 (Ctrl + Shift + Esc)
2. 找到所有 Starverse 进程
3. 结束所有进程
4. 重新运行清理脚本

### 问题：清理后应用无法启动
**解决方案**：
1. 删除整个用户数据目录
   ```
   %APPDATA%\Starverse
   ```
2. 重新启动应用

### 问题：API 密钥丢失
**解决方案**：
1. 重新在设置页面输入 API 密钥
2. 选择提供商（Gemini 或 OpenRouter）
3. 保存设置

## 📍 数据位置

- **Windows**: `%APPDATA%\Starverse\`
- **macOS**: `~/Library/Application Support/Starverse/`
- **Linux**: `~/.config/Starverse/`

## 🔗 相关文档

- [完整清理指南](DATA_CLEANUP_GUIDE.md) - 详细说明和高级选项
- [README](../README.md) - 项目主文档

---

**最后更新**: 2025-11-11
