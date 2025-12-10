# 系统默认应用打开图片功能

## 功能概述

实现了点击聊天中的图片时，使用系统默认应用（而非浏览器）打开图片。

## 技术实现

### 1. Electron 主进程 (`electron/main.ts`)

添加了新的 IPC 处理器 `shell:open-image`，支持三种图片类型：

- **Data URI (Base64)**: 
  - 自动解析并保存到系统临时目录 (`%TEMP%/starverse-images/`)
  - 使用 `shell.openPath()` 打开临时文件
  - 支持格式: jpg, jpeg, png, webp, gif, bmp

- **HTTP(S) URL**: 
  - 使用 `shell.openExternal()` 在外部浏览器打开
  
- **本地文件路径**: 
  - 直接使用 `shell.openPath()` 打开

### 2. Preload 脚本 (`electron/preload.ts`)

暴露了 `electronAPI.openImage()` 方法到渲染进程：

```typescript
openImage: (imageUrl: string) => Promise<{
  success: boolean
  path?: string
  url?: string
  error?: string
}>
```

### 3. 类型定义

- `src/types/electron.d.ts`: 全局类型定义
- `src/utils/electronBridge.ts`: 桥接类型定义

### 4. UI 组件 (`src/components/ChatView.vue`)

修改了 `handleImageClick()` 函数：

- 优先使用 Electron API
- 失败时降级到浏览器打开 (`window.open`)
- 支持 Web 版本（无 Electron 环境）

## 用户体验

### 桌面应用（Electron）
1. 点击图片 → 自动用系统默认应用打开
2. Base64 图片会先保存到临时目录
3. HTTP 图片在外部浏览器打开
4. 失败时自动降级到浏览器新标签页

### Web 版本
- 保持原有行为：在新标签页打开图片

## 临时文件管理

- 位置: `%TEMP%/starverse-images/` (Windows) 或 `/tmp/starverse-images/` (Unix)
- 命名: `image-{timestamp}.{extension}`
- 自动创建目录（递归）
- 系统会定期清理临时目录

## 错误处理

- 所有操作都有完整的 try-catch 保护
- 详细的控制台日志（✓ 成功 / ❌ 错误）
- 降级机制确保功能始终可用

## 相关文件

- `electron/main.ts` - IPC 处理器实现
- `electron/preload.ts` - API 暴露
- `src/types/electron.d.ts` - 类型定义
- `src/utils/electronBridge.ts` - 桥接工具
- `src/components/ChatView.vue` - UI 实现

## 测试建议

1. 点击 Base64 格式的图片（AI 生成的图片）
2. 点击 HTTP URL 格式的图片
3. 验证系统默认应用正确打开
4. 验证失败时的降级行为
