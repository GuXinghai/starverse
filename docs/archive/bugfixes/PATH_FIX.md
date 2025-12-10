# PATH 环境变量修复指南

## 问题描述

系统的 PATH 环境变量存在格式错误，导致 Node.js 和 npm 命令无法正常使用。

**错误的 PATH 片段：**
```
C:\nvm4w\nodejsc:\Users\m1389\.vscode\extensions\...
```

**正确的格式应该是：**
```
C:\nvm4w\nodejs;c:\Users\m1389\.vscode\extensions\...
```

## 已执行的临时修复

在当前 PowerShell 会话中，已通过以下命令临时修复：
```powershell
$env:PATH = $env:PATH -replace 'C:\\nvm4w\\nodejsc:', 'C:\nvm4w\nodejs;c:'
```

## 永久修复方法

### 方法 1: 通过系统设置（推荐）

1. 按 `Win + R`，输入 `sysdm.cpl`，按回车
2. 点击 "高级" 选项卡
3. 点击 "环境变量" 按钮
4. 在 "用户变量" 或 "系统变量" 中找到 `Path` 变量
5. 双击编辑
6. 找到包含 `C:\nvm4w\nodejsc:` 的条目
7. 将其拆分为两个独立的条目：
   - `C:\nvm4w\nodejs`
   - `c:\Users\m1389\.vscode\extensions\ms-python.debugpy-2025.14.1-win32-x64\bundled\scripts\noConfigScripts`
8. 点击 "确定" 保存所有更改
9. **重启终端或 VS Code** 使更改生效

### 方法 2: 通过 PowerShell（管理员）

以管理员权限运行 PowerShell，执行：

```powershell
# 获取当前系统 PATH
$currentPath = [Environment]::GetEnvironmentVariable("Path", "Machine")

# 修复格式错误
$fixedPath = $currentPath -replace 'C:\\nvm4w\\nodejsc:', 'C:\nvm4w\nodejs;c:'

# 更新系统 PATH
[Environment]::SetEnvironmentVariable("Path", $fixedPath, "Machine")

Write-Host "PATH 已永久修复，请重启终端或 VS Code"
```

### 方法 3: 通过注册表（高级用户）

1. 按 `Win + R`，输入 `regedit`
2. 导航到：
   - 系统变量：`HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\Session Manager\Environment`
   - 用户变量：`HKEY_CURRENT_USER\Environment`
3. 找到 `Path` 项，双击编辑
4. 修复格式错误（确保路径之间用分号 `;` 分隔）
5. 重启系统或重新登录

## 验证修复

修复后，在新的终端窗口中运行：

```powershell
# 检查 Node.js 版本
node --version

# 检查 npm 版本
npm --version

# 查看修复后的 PATH
$env:PATH -split ';' | Select-String -Pattern 'node'
```

预期输出：
```
v20.11.1
10.2.4
C:\nvm4w\nodejs
```

## 后续步骤

PATH 修复后，项目依赖已通过 `npm install` 安装完成。

可以运行以下命令启动开发服务器：
```bash
npm run dev
```

或使用 VS Code 任务：`启动开发服务器`

## 注意事项

- **nvm4w 用户**：如果使用 nvm4w (Node Version Manager for Windows)，确保 `C:\nvm4w\nodejs` 始终在 PATH 中
- 切换 Node 版本后，nvm4w 会自动更新这个符号链接指向
- 如果再次出现类似问题，检查是否有软件在修改 PATH 时未正确添加分号分隔符

## 相关文件

- `package.json` - 项目依赖定义
- `electron\main.ts` - Electron 主进程（已使用正确的路径处理）
- `electron\preload.ts` - 预加载脚本

## 技术细节

PATH 环境变量是一个由分号分隔的目录列表，Windows 会在这些目录中查找可执行文件。当分号丢失时，两个路径会连接在一起，导致系统无法正确识别任何一个路径。

修复日期：2025年11月10日
