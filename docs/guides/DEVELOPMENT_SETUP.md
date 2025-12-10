# 开发环境配置指南

> **目标读者**: 新入职开发人员、贡献者  
> **预计用时**: 15 分钟

---

## 📋 前置要求

### 必需软件

| 软件 | 版本要求 | 用途 |
|------|---------|------|
| **Node.js** | >= 18.0.0 | JavaScript 运行时 |
| **npm** | >= 9.0.0 | 包管理器 |
| **Git** | >= 2.30.0 | 版本控制 |
| **VS Code** | 最新版 | 推荐的 IDE（可选） |

### 推荐的 VS Code 插件

```
- Vue - Official (Vue Language Features)
- ESLint
- Prettier - Code formatter
- Tailwind CSS IntelliSense
- TypeScript Vue Plugin (Volar)
- SQLite Viewer
```

---

## 🚀 快速开始（5 分钟）

### 1. 克隆项目

```powershell
# HTTPS 方式
git clone https://github.com/GuXinghai/starverse.git
cd starverse

# 或使用 SSH（需配置 GitHub SSH Key）
git clone git@github.com:GuXinghai/starverse.git
cd starverse
```

### 2. 安装依赖

```powershell
npm install
```

**注意事项**:
- `better-sqlite3` 包含 native 模块，需要编译环境
- Windows 用户需要安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)
- 安装时间约 2-5 分钟（取决于网络速度）

### 3. 配置环境变量（可选）

```powershell
# 复制环境变量模板
Copy-Item .env.example .env.local

# 编辑 .env.local 填入你的 API Key（开发时非必需）
notepad .env.local
```

**开发阶段说明**:
- 应用启动后可在设置界面配置 API Key
- `.env.local` 中的 Key 仅用于快速测试
- `.env.local` 已在 `.gitignore` 中，不会提交到版本控制

### 4. 启动开发服务器

```powershell
# 方式 1: 使用 npm 脚本
npm run dev

# 方式 2: 使用 PowerShell 脚本（Windows）
.\start-dev.ps1

# 方式 3: 使用 Batch 脚本（Windows）
.\start-dev.bat
```

**首次启动**:
- Vite 开发服务器将在 `http://localhost:5173` 启动
- Electron 窗口自动打开
- 数据库文件自动创建在用户数据目录

**成功标志**:
```
✓ built in 1234ms.

  VITE v5.1.6  ready in 543 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help

[Electron] Electron app started
[Electron] Database initialized: C:\Users\YourName\AppData\Roaming\Starverse\data.db
```

---

## 📂 开发环境目录结构

### 用户数据目录

开发环境和生产环境使用相同的数据目录：

| 操作系统 | 路径 |
|---------|------|
| **Windows** | `%APPDATA%\Starverse\` |
| **macOS** | `~/Library/Application Support/Starverse/` |
| **Linux** | `~/.config/Starverse/` |

**目录内容**:
```
Starverse/
├── data.db              # SQLite 数据库文件
├── config.json          # 应用配置（API Key 等）
└── logs/                # 日志文件（计划中）
```

### 开发时生成的临时文件

```
项目根目录/
├── dist/                # Vite 构建输出（开发时实时更新）
├── dist-electron/       # Electron 主进程编译输出
├── out/                 # Electron 打包输出（仅构建时）
└── node_modules/        # 依赖包
```

---

## 🔧 常用开发命令

### 开发

```powershell
# 启动开发服务器（Vite + Electron）
npm run dev

# 仅启动 Vite 开发服务器（不启动 Electron）
npm run dev:vite

# 编译 TypeScript（类型检查）
npm run typecheck
```

### 测试

```powershell
# 运行单元测试
npm run test

# 运行测试并生成覆盖率报告
npm run test:coverage

# 监听模式运行测试（文件变化自动重新测试）
npm run test:watch
```

### 代码质量

```powershell
# ESLint 检查
npm run lint

# 自动修复 ESLint 错误
npm run lint:fix

# Prettier 格式化
npm run format
```

### Storybook（组件文档）

```powershell
# 启动 Storybook 开发服务器
npm run storybook

# 构建 Storybook 静态文件
npm run build-storybook
```

### 构建与打包

```powershell
# 构建应用（不打包）
npm run build

# 构建并打包为可分发的安装包
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
```

---

## 🐛 调试技巧

### 1. 渲染进程调试

**方法 1: 使用 Chrome DevTools**
- 应用启动后按 `F12` 打开开发者工具
- 或在菜单中选择 `View → Toggle Developer Tools`

**方法 2: VS Code 调试**
创建 `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Electron: Main",
      "type": "node",
      "request": "launch",
      "protocol": "inspector",
      "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/electron-vite",
      "runtimeArgs": ["--sourcemap"],
      "cwd": "${workspaceFolder}"
    }
  ]
}
```

### 2. 主进程调试

**输出日志**:
```typescript
// electron/main.ts
console.log('主进程日志')  // 输出到终端，不在 DevTools 中显示
```

**VS Code 断点调试**:
- 设置断点后按 `F5` 启动调试
- 调试控制台会显示主进程输出

### 3. Worker 线程调试

```typescript
// infra/db/worker.ts
parentPort?.postMessage({
  type: 'log',
  message: 'Worker 日志'
})
```

主进程接收日志:
```typescript
// electron/db/workerManager.ts
worker.on('message', (msg) => {
  if (msg.type === 'log') {
    console.log('[Worker]', msg.message)
  }
})
```

### 4. 数据库调试

**查看数据库内容**:
```powershell
# 使用 SQLite CLI
sqlite3 "%APPDATA%\Starverse\data.db"

# 或使用 VS Code 插件 "SQLite Viewer"
# 右键数据库文件 → Open with → SQLite Viewer
```

**常用 SQL 查询**:
```sql
-- 查看所有对话
SELECT * FROM conversations ORDER BY updated_at DESC LIMIT 10;

-- 查看某个对话的所有消息
SELECT * FROM messages WHERE conversation_id = 'conv-xxx' ORDER BY created_at;

-- 查看分支关系
SELECT id, parent_msg_id, branch_index FROM messages WHERE conversation_id = 'conv-xxx';

-- 全文搜索测试
SELECT * FROM messages_fts WHERE messages_fts MATCH 'your search query';
```

---

## 🔄 热重载与重启

### 渲染进程（自动热重载）

- **Vue 组件**: 修改后自动刷新，保留状态
- **CSS/Tailwind**: 修改后立即应用，无需刷新
- **Store/Composable**: 修改后自动刷新

### 主进程（需要重启）

- **electron/\*.ts**: 修改后需手动重启应用
- **快捷方式**: `Ctrl+C` 停止 → 重新运行 `npm run dev`

### Worker 线程（需要重启）

- **infra/db/\*.ts**: 修改后需重启应用

---

## 🌐 浏览器兼容性

Electron 内置 Chromium，无需考虑跨浏览器兼容性：

| 功能 | 支持情况 |
|------|---------|
| ES2022 语法 | ✅ 完全支持 |
| CSS Grid/Flexbox | ✅ 完全支持 |
| CSS Variables | ✅ 完全支持 |
| Web Workers | ✅ 支持（但使用 Node.js Worker Threads） |
| IndexedDB | ✅ 支持（但使用 SQLite 替代） |

---

## 🚨 常见问题

### Q1: `npm install` 失败，提示 `better-sqlite3` 编译错误

**原因**: 缺少 C++ 编译环境

**解决方案**:
```powershell
# Windows: 安装 Visual Studio Build Tools
# 下载地址: https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022
# 选择 "Desktop development with C++" 工作负载

# 或使用 npm 快速安装（管理员权限）
npm install -g windows-build-tools

# 重新安装依赖
npm install
```

### Q2: 应用启动后白屏，控制台报错

**可能原因**:
1. Vite 开发服务器未启动
2. 端口 5173 被占用
3. 环境变量配置错误

**排查步骤**:
```powershell
# 1. 检查 Vite 是否正常启动
netstat -ano | findstr "5173"

# 2. 杀死占用端口的进程
taskkill /PID <进程ID> /F

# 3. 检查环境变量
Get-Content .env.local

# 4. 清理缓存重新启动
Remove-Item -Recurse -Force dist, dist-electron, node_modules/.vite
npm run dev
```

### Q3: 数据库操作报错 "database is locked"

**原因**: 多个进程同时访问数据库

**解决方案**:
```powershell
# 1. 关闭所有应用实例
taskkill /IM starverse.exe /F

# 2. 删除数据库锁文件
Remove-Item "$env:APPDATA\Starverse\data.db-shm"
Remove-Item "$env:APPDATA\Starverse\data.db-wal"

# 3. 重新启动应用
npm run dev
```

### Q4: TypeScript 类型检查报错

**临时跳过类型检查**:
```powershell
# 仅构建，不检查类型
npm run build -- --skipLibCheck
```

**根本解决**:
- 修复代码中的类型错误
- 或在 `tsconfig.json` 中调整 `strictNullChecks` 等配置

---

## 📚 下一步

- 📖 阅读 [编码规范](coding-standards.md)
- 🏗️ 了解 [架构设计](../architecture/overview.md)
- 🧪 查看 [测试指南](testing.md)
- 🐛 参考 [故障排查手册](troubleshooting.md)

---

## 🆘 获取帮助

- **文档**: 查看 [docs/INDEX.md](../INDEX.md) 导航中心
- **Issue**: 提交到 [GitHub Issues](https://github.com/GuXinghai/starverse/issues)
- **讨论**: 加入 [GitHub Discussions](https://github.com/GuXinghai/starverse/discussions)

---

**维护者**: @GuXinghai  
**最后更新**: 2025年12月3日
