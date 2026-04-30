# Starverse 故障排查指南

## better-sqlite3 编译错误

这是原生模块编译问题，因 Node.js / Electron ABI 不匹配导致。

### Windows

```bash
# 确保安装了 Visual Studio Build Tools
npm install --global windows-build-tools

# 重新编译
npm run rebuild
```

### macOS / Linux

```bash
# macOS
xcode-select --install

# Ubuntu / Debian
sudo apt-get install build-essential

# 重新编译
npm run rebuild
```

如果仍有问题，删除 `node_modules` 重新安装：

```bash
rm -rf node_modules package-lock.json
npm install
```

### CI 注意事项

CI 环境应使用 `.nvmrc` 一致的 Node 版本，运行 `npm run rebuild:node` 确保 `better-sqlite3` 成功编译。

## 数据存储路径

所有数据存储在本地计算机：

- **Windows**: `C:\Users\<用户名>\AppData\Roaming\starverse\`
- **macOS**: `~/Library/Application Support/starverse/`
- **Linux**: `~/.config/starverse/`

包含 SQLite 数据库文件（`chat.db`）和配置文件（electron-store），完全离线可用。

## 数据清理

详见 [数据清理指南](DATA_CLEANUP_GUIDE.md) — 包含一键清理脚本、手动删除方法和注意事项。

## 对话导出

- ✅ 复制消息内容：右键点击消息
- ✅ 备份数据库：复制 `chat.db` 文件
- 🚧 即将支持 Markdown / JSON / PDF 导出

## 应用存储空间

- 应用本体：~200MB
- 数据库：空 ~100KB，100 对话 ~10MB，1000 对话 ~100MB
- 缓存可通过清理脚本清除
- SQLite 相比 JSON 文件节省约 40% 空间
