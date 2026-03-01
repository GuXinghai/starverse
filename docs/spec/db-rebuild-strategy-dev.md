# DB Rebuild Strategy（Development）

更新日期：2026-02-16  
适用范围：开发态 SQLite 初始化（`chat.db`）

## 1. 目标

在开发环境启用“破坏性重建”策略，替代迁移兼容链路，确保：
- schema 变更后可稳定落到最新结构；
- 保留开关以便关闭重建并进行回归对照；
- 重建逻辑在应用启动早期执行，避免运行期冲突。

## 2. 触发机制

重建仅在 `isDev=true`（`NODE_ENV=development` 或未打包）时生效。

## 2.1 schema mismatch 触发（可开关）
- 基线版本：`infra/db/schemaVersion.ts` 的 `DB_SCHEMA_VERSION`
- DB 实际版本：`PRAGMA user_version`
- 触发条件：
  - `dbExp.rebuildOnSchemaMismatch = true` 或环境变量 `SV_DB_REBUILD_ON_SCHEMA_MISMATCH=true/1`
  - 且 `user_version !== DB_SCHEMA_VERSION`（或 schema 探测失败）
- 默认值：
  - `dbExp.rebuildOnSchemaMismatch = true`（开发态默认开启）
  - 未设置该字段时按 `true` 处理
  - 可通过配置或环境变量显式关闭

## 2.2 force rebuild 触发（可开关）
- 配置开关：`dbExp.forceRebuildOnNextLaunch = true`
- 环境变量：`SV_DB_FORCE_REBUILD=true/1`
- 行为：无条件删除 `chat.db` / `chat.db-wal` / `chat.db-shm` / `chat.db-journal` 后重建
- 一次性语义：
  - 若由配置项触发，重建完成后自动回写 `dbExp.forceRebuildOnNextLaunch=false`
  - 环境变量触发不回写配置

## 2.3 优先级
1. `SV_DB_FORCE_REBUILD`
2. `SV_DB_REBUILD_ON_SCHEMA_MISMATCH`
3. `dbExp.forceRebuildOnNextLaunch`
4. `dbExp.rebuildOnSchemaMismatch`

## 3. 启动时序

执行位置：`electron/main.ts` 的 `ensureDbReady()` 内，且在 `dbWorkerManager.start(dbPath)` 之前。

流程：
1. 预检 `better-sqlite3` 可加载（ABI fail-fast）。
2. 读取 dev rebuild 策略（env + store）。
3. 按策略探测 `PRAGMA user_version`。
4. 若触发重建，删除 DB 文件族（带重试）。
5. 启动 DB Worker，执行 schema 初始化。
6. Worker 初始化完成后，若 `stampSchemaVersion=true` 则写入 `PRAGMA user_version = DB_SCHEMA_VERSION`。

硬约束（防止版本标记掩盖不一致）：
- `user_version` 不允许在“既有库普通启动路径”无条件覆写。
- 仅在以下场景写入版本标记：
  - 本次启动实际执行了删库重建；
  - 或启动前确认数据库文件不存在（首次建库）。

## 4. 实现改造点清单

- `infra/db/schemaVersion.ts`  
  作用：定义单一事实源 `DB_SCHEMA_VERSION`。

- `infra/db/worker.ts`  
  作用：仅在 `stampSchemaVersion=true` 时写入 `PRAGMA user_version`（条件写入）。

- `electron/config/configSchema.ts`  
  作用：新增白名单配置项：
  - `dbExp`
  - `dbExp.forceRebuildOnNextLaunch`
  - `dbExp.rebuildOnSchemaMismatch`

- `electron/main.ts`  
  作用：
  - 新增 `dbExp` 默认配置；
  - 新增启动前策略解析、schema 探测、删库重建函数；
  - 在 `ensureDbReady` 启动 worker 前执行重建判定；
  - 仅“新库/本次重建”向 worker 传递 `stampSchemaVersion=true`。

## 4.1 Schema 变更落地约束（2.4 起）

- 当 `infra/db/schema.sql` 出现结构性变更（新增列/索引/触发器）时，必须同步递增 `infra/db/schemaVersion.ts` 的 `DB_SCHEMA_VERSION`。
- 本阶段采用开发态删库重建，不要求迁移兼容；版本递增是触发新 DDL 生效的唯一开关。
- 当前版本以 `infra/db/schemaVersion.ts` 为准（每次结构性 DDL 变更均需递增）。

## 5. 验收标准映射

- “开启重建后启动必定落在最新 schema”  
  由 `force` 或 `mismatch` 触发删库 + worker 初始化写 `user_version` 保证。

- “关闭重建后可正常使用现有数据与表”  
  当 `force=false` 且 `rebuildOnSchemaMismatch=false` 时，跳过删库，按现有 DB 启动。

## 6. 最小 smoke test（可复现）

假设开发环境启动命令为 `npm run electron:dev`。

1. 关闭所有 Starverse 进程。
2. 强制重建路径：
   - 运行：`set SV_DB_FORCE_REBUILD=1 && npm run electron:dev`（PowerShell 可用 `$env:SV_DB_FORCE_REBUILD='1'; npm run electron:dev`）
   - 预期：启动日志出现 `[db-rebuild] Development rebuild completed`。
3. mismatch 路径：
   - 配置 `dbExp.rebuildOnSchemaMismatch=true` 或环境变量 `SV_DB_REBUILD_ON_SCHEMA_MISMATCH=1`
   - 人工制造版本偏差（例如将 `PRAGMA user_version` 改为非 `DB_SCHEMA_VERSION`）
   - 重启后应触发重建并落到最新 schema。
4. 关闭重建路径：
   - 确保 `SV_DB_FORCE_REBUILD` 未设置且 `dbExp.*` 两项为 `false`
   - 启动后不应出现重建日志，可直接读取历史数据。

## 7. 边界条件与失败降级

- 删除文件遇到 Windows 文件锁：重试 5 次（指数递增等待）。
- `chat.db` 不存在：视为首次启动，不触发删除，直接初始化。
- schema 探测失败：当 mismatch 开关开启时按“需重建”处理，优先保证可启动。
- 非开发环境：策略短路，不执行任何破坏性重建。
- 删除覆盖文件：`chat.db`、`chat.db-wal`、`chat.db-shm`、`chat.db-journal`。
