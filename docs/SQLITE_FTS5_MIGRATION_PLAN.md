# Electron + Vue 聊天存储（SQLite + FTS5）重构实施方案

> 目标：将当前依赖 `electron-store`/JSON 的会话持久化迁移到 SQLite + FTS5 + WAL，提升可靠性、扩展性与搜索体验，同时保持现有 UI/Pinia API 的兼容性。

## 1. 现状评估与痛点

- `src/stores/chatStore.js` 通过 `electronBridge.ts` 调用 `electron-store` 保存整棵分支树，序列化为大 JSON；随着消息量增长（>1e4）出现写入阻塞、文件冲突与回调 jank。
- Electron 主进程 (`electron/main.ts`) 仅暴露简单 IPC + `electron-store`，没有明确的权限/数据库层，导致 renderer 具备写磁盘能力、难以审计。
- 现有 docs (`WEB_WORKER_IMPLEMENTATION.md`, `CHUNKED_SAVE_IMPLEMENTATION.md`) 讨论了前端分支树与保存去抖，但没有面向大型数据集的数据库策略，也缺全文搜索方案。
- 痛点：加载需一次性反序列化全部对话、缺乏增量备份、没有 FTS/标签投影、迁移/回滚困难。

## 2. 目标与范围

| 维度 | 目标 |
| --- | --- |
| 持久化 | 单机 SQLite 数据库（`%APPDATA%/Starverse/chat.db`），WAL 模式，支撑 10⁵–10⁶ 消息。 |
| 数据模型 | 会话/消息/项目/标签/附件/归档表 + `message_fts`；消息正文存 FTS contentless 表。 |
| API | Renderer 仅通过 IPC -> Main -> DB Worker；写操作强制事务并合并 FTS。 |
| 能力 | 全文搜索、标签/项目筛选、归档/恢复、备份/恢复、慢查询日志。 |
| 安全 | 外键 & 约束、可选 SQLCipher/Keychain 密钥管理、回滚开关（`meta.json.useSqlite`）。 |

## 3. 总体架构

```
Renderer (Vue + Pinia)
  └─ src/services/db/index.ts  // Promise API + 类型
Main (Electron)
  └─ main/ipc/dbBridge.ts  // IPC handler/参数校验
     └─ infra/db/worker.ts (worker_threads)
          └─ better-sqlite3 + schema.sql
```

- Renderer 不直接访问文件系统，所有存储请求走 `ipcRenderer.invoke('db/*')`。
- Main 进程保持最小逻辑，仅白名单方法、鉴权、错误归一化。
- DB Worker 单线程、`better-sqlite3` 同步 API，负责 PRAGMA 设置、语句预编译、事务封装。

## 4. 数据库模式（`infra/db/schema.sql`）

```sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;
PRAGMA mmap_size=268435456;
PRAGMA cache_size=-20000;
PRAGMA temp_store=MEMORY;

CREATE TABLE IF NOT EXISTS project (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  meta TEXT
);

CREATE TABLE IF NOT EXISTS convo (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES project(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  meta TEXT
);

CREATE TABLE IF NOT EXISTS tag (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS convo_tag (
  convo_id TEXT NOT NULL REFERENCES convo(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  PRIMARY KEY (convo_id, tag_id)
);

CREATE TABLE IF NOT EXISTS message (
  id TEXT PRIMARY KEY,
  convo_id TEXT NOT NULL REFERENCES convo(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  meta TEXT,
  UNIQUE (convo_id, seq)
);

CREATE TABLE IF NOT EXISTS message_body (
  message_id TEXT PRIMARY KEY REFERENCES message(id) ON DELETE CASCADE,
  body TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attachment (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  path TEXT,
  hash TEXT,
  meta TEXT
);

CREATE TABLE IF NOT EXISTS archive_convo (
  id TEXT PRIMARY KEY,
  snapshot_at INTEGER NOT NULL,
  payload BLOB
);

CREATE VIRTUAL TABLE IF NOT EXISTS message_fts USING fts5(
  message_id UNINDEXED,
  convo_id UNINDEXED,
  body,
  tokenize='unicode61',
  content=''
);

CREATE TRIGGER IF NOT EXISTS trg_message_del AFTER DELETE ON message BEGIN
  INSERT INTO message_fts(message_fts, rowid, message_id, convo_id, body)
  VALUES('delete', (SELECT rowid FROM message_fts WHERE message_id = old.id), old.id, old.convo_id, '');
END;

CREATE INDEX IF NOT EXISTS idx_convo_project ON convo(project_id);
CREATE INDEX IF NOT EXISTS idx_convo_updated ON convo(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_convo_seq ON message(convo_id, seq);
CREATE INDEX IF NOT EXISTS idx_tag_name ON tag(name);
```

> 应用层需在同一事务中：插入 `message` → `message_fts`；触发器仅保证删除一致性。

## 5. DB Worker 设计（`infra/db/worker.ts`）

1. 启动逻辑
   - 解析 `app.getPath('userData')/chat.db`（在 renderer 通过 IPC 请求）。
   - 初始化 `better-sqlite3`，执行 PRAGMA + `schema.sql`。
   - 预编译常用语句（`insertConvo`, `insertMessage`, `insertFts`, `listMessages`, …）。
2. 事务工具
   - `const txn = db.transaction((fn) => fn(ctx))`；`ctx` 包含预编译语句和 `now()`。
   - 写 API（append/patch/delete）必须通过事务函数执行并在出现异常时回滚。
3. 导出方法
   - `appendMessage`, `patchMessage`, `listMessages`, `searchFulltext`, `listConvos`, …
   - `migration.applyBatch`, `archive.snapshotConvo`, `maintenance.optimizeFts`, `backup.snapshot`.
4. 调试
   - `db.profile((sql, ms) => ms > 50 && log('slow', sql, ms))` 写入 `logs/sqlite-slow.log`。

## 6. Repository 层（`infra/db/repo/*.ts`）

| 模块 | 职责 | 关键方法 |
| --- | --- | --- |
| `convoRepo.ts` | 会话生命周期 | `create`, `updateMeta`, `list`, `delete`, `assignTags`, `touch` |
| `messageRepo.ts` | 消息写入/读取 | `append`, `patch`, `delete`, `list`, `nextSeq`, `insertAttachment` |
| `searchRepo.ts` | FTS 查询 & DSL | `searchFulltext`, `buildQuery`, `highlightSnippet`, `optimize` |

- Repo 只返回原始数据对象，由 `worker.ts` 组合 higher-level API。
- 元数据字段统一 `JSON.stringify(meta ?? {})`；读取时 `JSON.parse`。

## 7. IPC 层与 Renderer API

1. **Main (`main/ipc/dbBridge.ts`)**
   - 使用 `ipcMain.handle('db:method', handler)`，在 handler 中调用 `runInWorker(method, payload)`。
   - 参数校验：使用 `zod`/`superstruct` 校验 payload，防止 renderer 注入非法 SQL。
   - 错误归一化：向 renderer 返回 `{ ok: false, code, message }`。
2. **Renderer (`src/services/db/index.ts` + `src/services/searchDsl.ts`)**
   - `electron/preload.ts` 暴露 `window.dbBridge.invoke(method, params)`，渲染进程通过 `src/utils/electronBridge.ts` 安全解析。
   - `dbService`（`src/services/db/`）定义 `ConvoRecord`/`MessageRecord`/`SearchResult` 等类型与 Promise API，所有持久化改走 `dbService.*`。
   - `searchDsl.ts` + `searchService.ts` 解析 DSL（tag/project/after/before/limit）并调用 `dbService.searchFulltext`，同时提供查询提示与错误。
   - `SettingsView.vue` 提供 “SQLite 持久化” 开关（调用 `chatStore.setUseSqlitePersistence`），ConversationList.vue 内容搜索复用 `runFulltextSearch` 结果高亮对话。
3. **Pinia 适配**
   - `useChatStore` 初始化时：`await dbService.convo.list(...)` → hydrate tree。
   - 保存逻辑替换为 `dbService.message.append` / `dbService.convo.update`。

## 8. 迁移策略

1. **只读挂载旧存储**
   - 利用现有 `electron-store` 数据（`electron-store` 默认 JSON 文件）只读加载。
   - 新建 `infra/migrations/fromElectronStore.ts`：按会话批量导入。
2. **迁移步骤**
   1. 创建数据库文件 + 执行 `schema.sql`。
   2. 以 100–500 条消息为一批：插入 `convo` → `message` → `message_fts`。
   3. 记录迁移日志（成功/失败 id、耗时、行数）写入 `logs/migration-*.jsonl`。
3. **校验**
   - 每导入 N 个会话，计算 `hash(concat(message.body))` 对比 JSON 源。
   - 迁移完执行 `PRAGMA quick_check` + `SELECT COUNT(*)` 对齐。
4. **灰度切换**
   - `meta.json` 增加 `useSqlite` 开关；Pinia store 读取该值决定从 SQLite 还是旧存储读取。
   - 灰度期间对未迁移会话 fallback 至旧逻辑（只读），提示用户“正在迁移”。
5. **回滚**
   - 关闭 `useSqlite` 即可回退；迁移脚本保持幂等，可重复执行。

## 9. 备份 / 恢复 / 归档

- 备份：实现 `backup.createSnapshot(destPath)`，内部调用 `better-sqlite3`.backup API 或 `VACUUM INTO`.
- 恢复：提供 CLI/IPC `backup.restoreSnapshot(sourcePath)`，恢复前切只读并备份当前库。
- 归档：`archive.snapshotConvo` 将会话序列化为 gzip JSON 写入 `archive_convo.payload`，并从热表删除；`archive.restoreConvo` 反向写回。
- WAL 管理：后台任务每日 `PRAGMA wal_checkpoint(TRUNCATE)`；空闲时 `message_fts` `INSERT INTO message_fts(message_fts) VALUES('optimize')`。

## 10. 安全与密钥

- SQLite 加密方案：
  1. **默认**：文件系统权限 + OS 用户隔离。
  2. **可选**：SQLCipher 版本 `better-sqlite3`，密钥存 Windows DPAPI/macOS Keychain（通过 `electron-store` 保存密钥 id）。
  3. 重要 meta 字段（例如附件路径哈希）可二次加密。
- 登录失败/密钥解密失败时，将数据库只读挂载，提示用户输入密钥。

## 11. 监控与诊断

- `infra/db/metrics.ts`
  - 记录事务耗时、队列长度，暴露给 renderer（调试面板）。
- `EXPLAIN QUERY PLAN` 工具
  - 在 `docs/WEB_WORKER_IMPLEMENTATION.md` 补充“调试查询性能”节，指导如何通过 IPC 调用 `diagnose.explain(sql)`.
- 慢查询日志 (>50ms) & checkpoint/optimize 时间统计。

## 12. 自动化测试策略

| 层级 | 工具 | 覆盖点 |
| --- | --- | --- |
| 单元 | Vitest | Repo 层 CRUD/FTS DSL/迁移脚本（通过 `better-sqlite3` 内存库）。 |
| 集成 | Playwright + Electron | Renderer 触发 IPC 追加消息、全文搜索、高亮显示。 |
| E2E | Spectron/Playwright Component | 多窗口/崩溃恢复：模拟 kill worker 后自动重建。 |
| 迁移 | Node CLI | 使用真实旧 JSON 作为输入，校验统计、哈希、回滚。 |

测试重点：事务原子性、FTS 结果与 snippet、高并发 append（模拟流式 token）、WAL crash 恢复（kill worker 后重启 quick_check）。

## 13. 实施里程碑

| 里程碑 | 交付 | 估时 |
| --- | --- | --- |
| **M1 (3–5 天)** | `schema.sql`、DB Worker 雏形、基础 CRUD（convo/message）+ append 事务样例、Pinia 写路径切换开关。 |
| **M2 (≈3 天)** | 搜索 DSL + FTS 查询 + snippet，高亮 UI，`message_fts` optimize 任务。 |
| **M3 (2–3 天)** | 迁移脚本、备份/恢复、归档 API、迁移日志/校验。 |
| **M4 (≈2 天)** | 慢查询面板、诊断工具、文档更新（README、CHUNKED_SAVE、WEB_WORKER）、回滚/只读守卫。 |

每个里程碑结束需要：单元/集成测试绿灯、PR 文档更新、手动验证 checklist。

## 14. 下一步行动清单

1. 创建 `infra/db/` 目录（schema.sql + worker.ts + repo/ + migrations/），引入 `better-sqlite3`、`zod` 依赖。
2. 在 Electron 主进程实现 `main/ipc/dbBridge.ts` & `worker-manager.ts`，并在 `electron/main.ts` 中注册。
3. 新增 `src/services/db/index.ts`、`src/services/searchDsl.ts`、`src/services/chatPersistence.ts`，在 `useChatStore` 中通过 `useSqlitePersistence` 开关接入 SQLite。
4. 编写迁移 CLI（`scripts/migrate-electron-store.ts`），并在 README 增加“启用 SQLite 存储”章节。
5. 配置 CI：运行 `npm run test:db`（内存 SQLite）+ `npm run test:renderer`.

完成以上步骤后，即可按照灰度策略开启 SQLite 存储并逐步迁移用户数据。
