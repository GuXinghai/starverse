# Worker 构建问题报告

**日期**: 2025-11-29  
**问题**: Electron Worker 线程文件未被正确构建为独立文件  
**影响**: 应用启动时报错 `Cannot find module 'D:\Starverse\dist-electron\db\worker.cjs'`

---

## 问题描述

### 症状
每次启动 Electron 应用时都会报 JavaScript 错误：
```
Uncaught Exception:
Error: Cannot find module 'D:\Starverse\dist-electron\db\worker.cjs'
    at Module._resolveFilename (node:internal/modules/cjs/loader:1390:15)
    ...
```

### 根本原因
数据库 Worker 线程代码 (`electron/db/worker.ts`) 被 Vite/Rollup 打包进了 `main.js`，而不是作为独立的 `db/worker.cjs` 文件输出。

**期望的构建输出**:
```
dist-electron/
  ├── main.js          ✅ (存在)
  ├── preload.mjs      ✅ (存在)
  └── db/
      └── worker.cjs   ❌ (缺失)
```

**实际的构建输出**:
```
dist-electron/
  ├── main.js          (包含了 worker 代码)
  └── preload.mjs
```

---

## 技术背景

### 架构设计
应用使用 Node.js Worker Threads 进行数据库操作隔离：
- **主进程** (`electron/main.ts`): UI 和 IPC 处理
- **Worker 线程** (`electron/db/worker.ts`): SQLite 数据库操作
- **Worker 加载**: 主进程通过 `new Worker(workerScriptPath)` 启动 Worker

### 代码依赖关系
```typescript
// electron/main.ts
const DB_WORKER_SCRIPT = path.join(MAIN_DIST, 'db', 'worker.cjs')

// electron/db/workerManager.ts
this.worker = new Worker(options.workerScriptPath, { 
  workerData: config 
})

// electron/db/worker.ts (Worker 入口点)
import { DbWorkerRuntime, attachWorkerPort } from '../../infra/db/worker'
const runtime = new DbWorkerRuntime(workerData as WorkerInitConfig)
attachWorkerPort(runtime, parentPort)
```

---

## 已尝试的解决方案

### 方案 1: 多入口点配置 (当前配置)
**文件**: `electron.vite.config.ts`
```typescript
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          main: resolve('electron/main.ts'),
          worker: resolve('electron/db/worker.ts')
        },
        output: {
          format: 'cjs',
          entryFileNames: (chunkInfo) => {
            if (chunkInfo.name === 'worker') return 'db/worker.cjs'
            return '[name].js'
          }
        }
      }
    }
  }
})
```

**结果**: ❌ 失败 - Worker 代码被打包进 `main.js`，`db/worker.cjs` 未生成

### 方案 2: 添加 preserveEntrySignatures
```typescript
rollupOptions: {
  // ... input 配置
  preserveEntrySignatures: 'strict'
}
```
**结果**: ❌ 失败 - 同样的问题

### 方案 3: 使用 manualChunks
```typescript
output: {
  manualChunks: (id) => {
    if (id.includes('electron/db/worker.ts')) {
      return 'db/worker'
    }
  }
}
```
**结果**: ❌ 失败 - Worker 仍被打包进主文件

---

## 问题分析

### 可能的原因

#### 1. Vite/Rollup 依赖分析
Rollup 可能将 `worker.ts` 视为 `main.ts` 的依赖，而不是独立的入口点。即使配置了多个入口点，Rollup 默认会进行代码分割和 tree-shaking。

#### 2. electron-vite 特殊行为
`electron-vite` 可能对主进程构建有特殊处理逻辑，强制将所有依赖打包成单文件以优化性能。

#### 3. 扩展名冲突
配置输出 `.cjs`，但 Vite 默认可能输出 `.js`，导致命名规则冲突。

#### 4. Worker 动态加载问题
主进程代码中使用字符串路径加载 Worker：
```typescript
const DB_WORKER_SCRIPT = path.join(MAIN_DIST, 'db', 'worker.cjs')
```
这是运行时路径，Rollup 静态分析无法识别，可能导致 Worker 代码被包含到主包中。

---

## 推荐的修复方案

### 方案 A: 完全分离 Worker 构建 (推荐)
将 Worker 作为完全独立的构建任务：

1. **修改 `electron.vite.config.ts`**:
```typescript
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          main: resolve('electron/main.ts')
        },
        external: ['./db/worker.cjs']  // 告诉 Rollup 这是外部依赖
      }
    }
  }
})
```

2. **添加单独的 Worker 构建脚本**:
```json
// package.json
{
  "scripts": {
    "build:worker": "vite build --config worker.vite.config.ts",
    "build": "npm run build:worker && electron-vite build"
  }
}
```

3. **创建 `worker.vite.config.ts`**:
```typescript
import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    outDir: 'dist-electron/db',
    lib: {
      entry: resolve(__dirname, 'electron/db/worker.ts'),
      formats: ['cjs'],
      fileName: () => 'worker.cjs'
    },
    rollupOptions: {
      external: [
        'node:worker_threads',
        'node:crypto',
        'node:fs',
        'node:path',
        'better-sqlite3'
      ]
    }
  }
})
```

### 方案 B: 使用 electron-builder 复制文件
如果构建分离太复杂，可以在构建后复制文件：

```json
// package.json
{
  "scripts": {
    "postbuild": "node scripts/copy-worker.js"
  }
}
```

```javascript
// scripts/copy-worker.js
const fs = require('fs-extra')
const path = require('path')

const workerSource = path.join(__dirname, '../electron/db/worker.ts')
const workerDest = path.join(__dirname, '../dist-electron/db/worker.cjs')

// 将 worker.ts 编译并复制到目标位置
// ... 编译逻辑
```

### 方案 C: 修改架构 - 内联 Worker 代码
最简单但不优雅的方案 - 将 Worker 代码内联到主进程：

```typescript
// electron/main.ts
import { Worker } from 'node:worker_threads'

const workerCode = `
  const { DbWorkerRuntime, attachWorkerPort } = require('./infra/db/worker');
  const runtime = new DbWorkerRuntime(workerData);
  attachWorkerPort(runtime, parentPort);
`

this.worker = new Worker(workerCode, {
  eval: true,
  workerData: config
})
```

**优点**: 不需要单独文件  
**缺点**: 
- 失去 TypeScript 类型检查
- 调试困难
- 违反关注点分离原则

---

## 辅助调试信息

### 当前项目配置

**Vite 版本**: 5.4.21  
**electron-vite 版本**: 检查 `package.json`  
**Rollup 版本**: (Vite 内置)

### 相关文件路径
```
项目根目录/
├── electron/
│   ├── main.ts                    (主进程入口)
│   └── db/
│       ├── worker.ts              (Worker 入口 - 问题源)
│       └── workerManager.ts       (Worker 管理器)
├── infra/
│   └── db/
│       ├── worker.ts              (Worker 实现逻辑)
│       └── repo/                  (数据库仓库层)
└── electron.vite.config.ts        (构建配置)
```

### 构建日志
```
vite v5.4.21 building for development...
✓ 563 modules transformed.
dist-electron/main.js  625.37 kB │ gzip: 139.84 kB
built in 1649ms.
```
**注意**: 只输出了 `main.js` 和 `preload.mjs`，没有 `db/worker.cjs`

### 运行时错误堆栈
```
Error: Cannot find module 'D:\Starverse\dist-electron\db\worker.cjs'
    at Module._resolveFilename (node:internal/modules/cjs/loader:1390:15)
    at defaultResolveImpl (node:internal/modules/cjs/loader:1032:19)
    at resolveForCJSWithHooks (node:internal/modules/cjs/loader:1037:22)
    at Module._load (node:internal/modules/cjs/loader:1199:37)
    at c._load (node:electron/js2c/node_init:2:17993)
    at TracingChannel.traceSync (node:diagnostics_channel:328:14)
    at wrapModuleLoad (node:internal/modules/cjs/loader:244:24)
    at Module.executeUserEntryPoint [as runMain]
    at MessagePort.<anonymous> (node:internal/main/worker_thread:226:26)
    at [nodejs.internal.kHybridDispatch] (node:internal/event_target:845:20)
```

---

## 临时绕过方案

如果需要立即继续开发，可以暂时禁用 Worker 功能：

```typescript
// electron/main.ts
// 注释掉 Worker 初始化
// const dbWorker = new DbWorkerManager({ ... })
// await dbWorker.start(dbPath)

// 改为直接在主线程操作数据库 (仅用于调试)
import Database from 'better-sqlite3'
const db = new Database(dbPath)
// ... 直接操作
```

**警告**: 这会阻塞主线程，仅用于开发调试！

---

## 下一步行动

### 立即操作 (优先级 P0)
1. 确认 `electron-vite` 和相关依赖版本
2. 尝试**方案 A**（完全分离 Worker 构建）
3. 查阅 `electron-vite` 官方文档关于多入口点的说明

### 深入调查 (优先级 P1)
1. 检查 `electron-vite` GitHub Issues 是否有类似问题
2. 调试 Rollup 构建过程，查看为什么 Worker 入口被合并
3. 尝试降级/升级 `electron-vite` 版本

### 长期优化 (优先级 P2)
1. 考虑是否需要 Worker 线程（对于小型数据库可能不需要）
2. 评估使用 `MessageChannel` 而非 Worker Threads
3. 文档化最终的构建配置方案

---

## 相关资源

- [electron-vite 官方文档](https://electron-vite.org/)
- [Rollup 配置指南](https://rollupjs.org/configuration-options/)
- [Node.js Worker Threads](https://nodejs.org/api/worker_threads.html)
- [Vite 多页面应用配置](https://vitejs.dev/config/build-options.html#build-rollupoptions)

---

## 联系信息

**报告人**: GitHub Copilot (Claude Sonnet 4.5)  
**日期**: 2025-11-29  
**问题 ID**: WORKER-BUILD-001
