# Model Catalog 代码地图（阶段 1：Catalog 内核）

更新日期：2026-02-16
范围：Starverse（当前供应商 OpenRouter）

## 1. 执行计划与落点路径（先计划后实现）

1. DB 初始化与生命周期侦察
- 落点路径：`electron/main.ts` -> `electron/db/workerManager.ts` -> `electron/db/worker.ts` -> `infra/db/worker.ts` -> `infra/db/worker/handlers/*` -> `infra/db/repo/*`
- 目标：确认真实 DB 启动、IPC 桥接、连接关闭、Worker 崩溃/重启路径。

2. Schema/迁移/重建能力侦察
- 落点路径：`infra/db/schema.sql` + `infra/db/migrations/*.ts` + `infra/db/worker.ts` + `electron/db/workerManager.ts`
- 目标：确认当前是“基线 schema + 启动时 ensure/ALTER”模式，验证是否可接入破坏性重建流程。

3. OpenRouter 请求封装与调用位侦察
- 落点路径：
  - Catalog 拉取：`src/shared/modelCatalog/catalogSyncJob.ts`
  - 对话流式（渲染进程）：`src/next/live/openRouterLiveStream.ts` + `src/next/transport/openrouterFetch.ts`
  - 对话流式（主进程代理）：`electron/ipc/openRouterStreamBridge.ts`
- 目标：确认 headers、鉴权、错误处理、timeout、是否已有重试策略。

4. Catalog 最小侵入式插入点归档
- 落点路径：`infra/db/repo/modelCatalogRepo.ts`、`infra/db/repo/reasoningModelIndexRepo.ts`、`infra/db/worker/handlers/usagePrefsSettingsHandlers.ts`、`electron/main.ts`
- 目标：给出可直接实施的写入点与调用点清单。

## 2. 关键代码地图（真实调用链）

### 2.1 DB 初始化入口与连接生命周期

- 主入口：`electron/main.ts:710`
  - `app.whenReady()` 后执行 `ensureDbReady()` (`electron/main.ts:482`)
  - `ensureDbReady()` 内部：
    - 先 `require('better-sqlite3')` 做 ABI 预检 (`electron/main.ts:487`)
    - 再 `dbWorkerManager.start(dbPath)` (`electron/main.ts:502`)
- Worker 管理：`electron/db/workerManager.ts`
  - `start(dbPath)` 创建 Node Worker，传入 `workerData={dbPath,schemaPath,logSlowQueryMs,logDirectory}` (`electron/db/workerManager.ts:139`)
  - `call(method, params)` 通过 UUID + pending map 做请求-响应匹配 (`electron/db/workerManager.ts:341`)
  - `stop()` 终止 worker，并 reject 所有 pending (`electron/db/workerManager.ts:215`)
  - 崩溃自动重启（指数退避）`scheduleRestart()` (`electron/db/workerManager.ts:513`)
- Worker 线程入口：`electron/db/worker.ts`
  - 构造 `new DbWorkerRuntime(workerData)` (`electron/db/worker.ts:48`)
  - `attachWorkerPort(runtime, parentPort)` 建立消息处理 (`electron/db/worker.ts:55`)
  - 注册 close/exit hook 触发 `runtime.shutdown()` (`electron/db/worker.ts:27`)
- SQLite 真实打开位置：`infra/db/worker.ts:109`
  - `new BetterSqlite3(config.dbPath)`
  - 启动顺序：`applyPragmas` -> `db.exec(schema.sql)` -> 多个 `ensure*Schema`/`ensure*Index` -> repo/handler 注册。

### 2.2 主进程与渲染进程 DB 桥接

- IPC 桥：`electron/ipc/dbBridge.ts:144`
  - 统一入口 `ipcMain.handle('db:invoke', ...)`
  - 白名单来源：`DB_RENDERER_METHOD_SET`（`infra/db/dbMethodsRegistry.ts`）
  - 特殊方法：`db.reset` 直接走 `manager.reset()`（不经过 worker 白名单） (`electron/ipc/dbBridge.ts:154`)
  - `health.stats` 由 manager 本地返回队列/在线状态 (`electron/ipc/dbBridge.ts:163`)
- 预加载暴露：`electron/preload.ts:70`
  - `window.dbBridge.invoke(method, params)` 转发到 `db:invoke`
  - `window.dbBridge.onEvent(callback)` 订阅 worker 事件。
- 渲染侧调用：`src/next/*Client.ts`（如 `src/next/modelCatalog/modelCatalogClient.ts:27`）。

### 2.3 Schema 创建与迁移痕迹

- 基线 schema：`infra/db/schema.sql`
  - 全部 `CREATE TABLE IF NOT EXISTS`，可重复执行。
  - 已包含 `model_catalog`、`reasoning_model_index`、`settings_kv` 等表。
- 运行时 ensure/补列：`infra/db/worker.ts`
  - `ensureUsageLogSchema` / `ensureReasoningSchema` / `ensureModelCatalogSchema` / `ensureReasoningModelIndexSchema` 等通过 `PRAGMA table_info + ALTER TABLE` 补齐。
- 迁移模块：`infra/db/migrations/ensureBranchingSchema.ts`、`infra/db/migrations/ensureSearchSchema.ts`
  - 启动时事务内“存在即跳过，不存在则创建/回填”。

结论：当前是“无独立迁移版本表，启动时幂等 ensure”模式，适合接入开发环境破坏性重建。

### 2.4 破坏性重建能力（允许删库重建）

- 实现：`DbWorkerManager.reset()` (`electron/db/workerManager.ts:247`)
  - 环境门禁：`NODE_ENV !== 'production'` 且 `app.isPackaged === false`
  - 步骤：`stop()` -> 删除 `chat.db`/`chat.db-wal`/`chat.db-shm` -> `start(dbPath)`
- 触发入口：`db:invoke` 的 `method='db.reset'` (`electron/ipc/dbBridge.ts:154`)

## 3. OpenRouter 调用位置与请求封装

### 3.1 Catalog 同步（`/api/v1/models`）

- 调用入口：`electron/main.ts:510` 的 `startCatalogSyncInBackground()`
  - 从 `electron-store` 读取 `openRouterApiKey/openRouterBaseUrl` (`electron/main.ts:512`)
  - 调用 `syncOpenRouterModelCatalog` (`electron/main.ts:516`)
- HTTP 封装：`src/shared/modelCatalog/catalogSyncJob.ts`
  - `GET {baseUrl}/models`（即 `GET /api/v1/models`）(`src/shared/modelCatalog/catalogSyncJob.ts:95`)
  - Header：`Authorization` + `HTTP-Referer` + `X-Title` (`src/shared/modelCatalog/catalogSyncJob.ts:98`)
  - 响应解析：要求 `json.data` 数组；映射 `id/name/description/context_length/supported_parameters`。
- DB 写入：
  - `modelCatalog.syncSnapshot` -> `ModelCatalogRepo.syncSnapshot()` 事务内 upsert + hide missing (`infra/db/repo/modelCatalogRepo.ts:100`)
  - 成功后触发 `reasoningIndex.syncFromCatalog` (`electron/main.ts:525`)。

与官方文档对齐：
- `/api/v1/models` 返回 `data[]`，含 `supported_parameters` 字段 [R1]
- `supported_parameters` 是跨 provider 的并集，不保证单一 provider 全支持 [R1]
- 官方明确 `GET /api/v1/models/user` 会按用户 provider preferences、privacy settings、guardrails 过滤，且在 EU 域名下叠加 EU in-region 过滤；因此目录默认主源应为 `/api/v1/models/user`，`/api/v1/models` 用于兜底/对照 [R2]

### 3.2 Chat/Stream 调用（/chat/completions）

- 渲染进程直连路径（默认）：
  - `streamOpenRouterChatAsEvents()` -> `openrouterFetch()` (`src/next/live/openRouterLiveStream.ts:422`)
  - `openrouterFetch` 发 `POST {baseUrl}/chat/completions` (`src/next/transport/openrouterFetch.ts:245`)
- 主进程代理路径（`netExp.streamInMainProcess=true`）：
  - 渲染进程 `ipc.invoke('openrouter:stream-chat', ...)` (`src/next/live/openRouterLiveStream.ts:239`)
  - 主进程 `registerOpenRouterStreamBridge()` 处理，使用 `electron.net.request` 发请求 (`electron/ipc/openRouterStreamBridge.ts:330`)

与官方文档对齐：
- 聊天接口为 `POST /api/v1/chat/completions` [R3]
- `HTTP-Referer` 和 `X-Title` 是可选 attribution header [R4][R5]
- `provider.require_parameters` 可用于限制只路由到完整支持参数的 provider [R6]

### 3.3 鉴权、错误处理、重试策略

- 鉴权：两条路径都使用 `Authorization: Bearer <apiKey>`。
- 超时/取消：
  - 渲染路径：`AbortController + timeoutMs`，超时转 `type='timeout'` (`src/next/transport/openrouterFetch.ts:240`)
  - 主进程代理：同样 `AbortController + timeoutMs` (`electron/ipc/openRouterStreamBridge.ts:304`)
- 错误处理：
  - 渲染路径：非 2xx 抛结构化 `http_error`；网络/中止/超时分型 (`src/next/transport/openrouterFetch.ts:315`)
  - 主进程代理：将 http/transport/aborted 映射为 wire error 事件 (`electron/ipc/openRouterStreamBridge.ts:213`)
- 重试策略（代码事实）：
  - 当前客户端未实现应用层自动重试/backoff。
  - OpenRouter 平台侧默认会做 provider fallback（服务端路由行为，不等于客户端重试）[R6]。

## 4. Catalog 模块最小侵入式插入点（建议）

1. Catalog 数据标准化（新增字段/规则）
- 首选插点：`src/shared/modelCatalog/catalogSyncJob.ts`
- 原因：这是从 OpenRouter JSON 到内部 Catalog row 的唯一映射层，改这里不会侵入 UI/DB bridge。

2. Catalog 持久化事务规则（快照写入语义）
- 首选插点：`infra/db/repo/modelCatalogRepo.ts`
- 原因：已具备单事务 `upsert + hide missing`，最适合扩展 snapshot 语义。

3. 推理模型索引派生规则
- 首选插点：`infra/db/repo/reasoningModelIndexRepo.ts`
- 原因：当前从 `model_catalog.supported_parameters_json` 派生 reasoning 集合，新增规则可集中在此。

4. 启动同步调度与通知
- 首选插点：`electron/main.ts` 的 `startCatalogSyncInBackground()`
- 原因：已连接配置读取、sync job、DB writer、renderer 通知 `db:modelCatalogSynced`。

5. 渲染消费层
- 首选插点：`src/next/modelCatalog/modelCatalogClient.ts` + `src/next/modelIndex/reasoningModelIndexClient.ts` + `src/ui-app/AppChatApp.vue` 的 `refreshModelLists()`
- 原因：不会污染 streaming 与 DB 内核逻辑。

## 5. 写入点与调用点清单（验收必覆盖）

### DB init
- `electron/main.ts:482` `ensureDbReady()`
- `electron/db/workerManager.ts:133` `start(dbPath)`
- `electron/db/worker.ts:48` `new DbWorkerRuntime(workerData)`
- `infra/db/worker.ts:109` `new BetterSqlite3(config.dbPath)`

### HTTP client
- `src/shared/modelCatalog/catalogSyncJob.ts:95` `GET /api/v1/models`
- `src/next/transport/openrouterFetch.ts:303` `POST /chat/completions`（renderer）
- `electron/ipc/openRouterStreamBridge.ts:330` `net.request` `POST /chat/completions`（main）

### 配置读取
- `electron/main.ts:512` `store.get('openRouterApiKey'/'openRouterBaseUrl')`
- `src/ui-app/AppChatApp.vue:1429` `getOpenRouterApiKey()`
- `src/ui-app/AppChatApp.vue:1438` `getOpenRouterBaseUrl()`
- `src/next/netExp/netExpClient.ts:75` `getNetExpSettings()`（决定是否主进程流式）

### 日志系统
- `infra/db/logger.ts` 慢查询日志（落盘 `sqlite-slow.log`）
- `infra/db/worker.ts:142` `db.profile(...) -> logSlowQuery`
- `src/next/transport/openrouterFetch.ts:185` 请求日志（当前为完整请求体）
- `electron/ipc/openRouterStreamBridge.ts:311` 主进程流式请求日志（脱敏/截断）

## 6. 可复现验证步骤（最小 smoke test）

1. 启动应用（Electron）
- `npm run electron:dev`

2. 验证 DB worker 就绪
- 在渲染 DevTools 执行：
- `await window.dbBridge.invoke('health.stats')`
- 预期：返回 `{ pending, isOnline, workerThreadId, ... }`

3. 验证 Catalog 已落库
- 在渲染 DevTools 执行：
- `await window.dbBridge.invoke('modelCatalog.list', { routerSource: 'openrouter' })`
- 预期：返回数组；若空且 key 有效，等待后台同步事件后重试。

4. 验证 reasoning index 派生
- 在渲染 DevTools 执行：
- `await window.dbBridge.invoke('reasoningIndex.list')`
- 预期：返回 `visible/hidden` 状态项。

5. 验证破坏性重建（开发环境）
- 在渲染 DevTools 执行：
- `await window.dbBridge.invoke('db.reset')`
- 预期：DB 文件重建成功；再次执行步骤 2/3 可正常返回。

## 7. 关键边界条件与失败降级路径

- 无 API Key：
  - `startCatalogSyncInBackground()` 直接 return（非致命），UI 可继续运行。
- Catalog 拉取失败：
  - 主进程捕获并 `console.warn`，不会阻断应用启动。
- `dbBridge` 不可用（非 Electron 场景）：
  - `listModelCatalog/listReasoningModelIndex` 返回空数组，UI 显示“目录不可用”。
- `reasoningIndex.syncFromCatalog` 在无 snapshot 时：
  - 返回 `{ snapshotId: null }`，不修改现有索引。
- Worker 崩溃：
  - `DbWorkerManager` 有自动重启；挂起请求会 reject。

## 8. 不确定项与待审核（按优先级）

P0
- `openrouterFetch` 当前会打印完整请求体和完整 API Key 到控制台 (`src/next/transport/openrouterFetch.ts:189,196`)。
- 这是实现现状，不影响 Catalog 内核功能，但存在明显凭据泄露风险。
- 建议：改为默认脱敏 + 显式 debug 开关。

P1
- `db.reset` 虽在 registry 标记 `renderer:false`，但 `dbBridge` 对其做了特判并允许调用（开发环境门禁在 manager）。
- 建议：若后续要收敛权限，需明确“仅开发工具可调”策略。

P2
- 代码中读取 `x-openrouter-generation-id`、`x-openrouter-provider` 等响应头用于 telemetry；未在本次检索到的官方文档中找到稳定承诺。
- 建议：将其视为 best-effort 字段，不能作为强一致业务主键。

## 9. 参考资料（官方）

- [R1] Models list: https://openrouter.ai/docs/api/api-reference/models/get-models
- [R2] Models user: https://openrouter.ai/docs/api/api-reference/models/list-models-user
- [R3] Chat completions API: https://openrouter.ai/docs/api-reference/chat-completion
- [R4] API reference overview: https://openrouter.ai/docs/api/reference/overview
- [R5] App attribution (`HTTP-Referer`, `X-Title`): https://openrouter.ai/docs/app-attribution
- [R6] Provider routing (`provider.require_parameters`): https://openrouter.ai/docs/guides/routing/provider-selection
