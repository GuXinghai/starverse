# 多线程管理调研（数据库 Worker）

## 架构总览
- 主进程 `electron/main.ts`: 负责窗口/IPC，启动 `DbWorkerManager` 并在退出时终止 Worker。
- Worker 线程脚本 `electron/db/worker.ts` → 构建为 `dist-electron/db/worker.cjs`（`scripts/build-db-worker.cjs`）。
- Worker 运行时 `infra/db/worker.ts`: 创建 BetterSqlite3 连接、注册所有 DB handlers，并通过 MessagePort 处理请求。
- IPC 桥接 `electron/ipc/dbBridge.ts`（主进程）+ `electron/preload.ts`（暴露 `window.dbBridge`）。渲染层通过 `src/services/db` 调用。
- 数据库路径 `app.getPath('userData')/chat.db`，Schema 来自 `infra/db/schema.sql`，慢查询阈值 75ms（未指定日志目录）。

## 线程生命周期与调度
- 初始化：`ensureDbReady` 在 app ready 后调用 `DbWorkerManager.start(dbPath)`，并在此后注册 IPC handlers、创建窗口。
- `start(dbPath)`：
  - 使用 `startPromise` 去重并存储 `dbPath`。
  - 创建 Worker 时传入 `{ dbPath, schemaPath, logSlowQueryMs }`；监听：
    - `online` → resolve 启动。
    - `error` → reject + `rejectAll`，并清空 `worker/startPromise`。
    - `message` → `handleMessage`，用 `pending` Map 匹配响应。
    - `exit` → 非 0 退出时 `rejectAll`，然后清空 state（不会自动重启）。
- 调用：`call(method, params)` 生成 UUID、写入 `pending`，`postMessage` 给 Worker，响应通过 `handleMessage` resolve/reject 为 `DbWorkerError`。
- 停止：`stop()` 直接 `worker.terminate()`，清空 `pending` 而不 reject；目前仅在 `before-quit` 使用。

## 通信链路
1. 渲染层 `src/services/db` 调用 `dbBridge.invoke`。
2. 预加载层将调用转为 `ipcRenderer.invoke('db:invoke', { method, params })`。
3. 主进程 `electron/ipc/dbBridge.ts` 校验 payload + 白名单后调用 `DbWorkerManager.call`。
4. Worker 内 `DbWorkerRuntime.handleMessage` 路由到 handlers 并返回响应；BetterSqlite3 同步执行保证单线程串行。

## Worker 执行模型
- 初始化：设置 PRAGMA（WAL、synchronous=NORMAL、foreign_keys=ON、mmap/cache 优化）、`busy_timeout=5000`，加载 schema。
- 性能：如果 `profile` 可用则记录慢查询（但未设置日志目录时不会落盘，仅阈值存在）。
- Handler 范围（均在 Worker 线程串行执行）：
  - `health.ping`
  - `project.*`（create/save/list/delete/findById/findByName/countConversations）
  - `convo.*`（create/save/list/delete/deleteMany/archive/archiveMany/restore/listArchived）
  - `message.*`（append/list/replace）
  - `search.fulltext`
  - `maintenance.optimize`

## 发现的问题/风险
- IPC 白名单缺失：`electron/ipc/dbBridge.ts` 只放行基础 `convo.*`，缺少 `convo.deleteMany/archive/archiveMany/restore/listArchived` 等；渲染层 `src/services/db` 已暴露这些方法，会收到 `ERR_NOT_FOUND`。
- 崩溃恢复：`exit` 仅 `rejectAll` 并清空 state，主进程未自动重启 Worker；一旦崩溃需手动重新调用 `start`/重启应用。
- 停止行为：`stop()` 清空 `pending` 不 reject，若未来用于热重启，外部 Promise 将悬挂；当前仅在退出时还算安全。
- 无请求级超时/健康探测：若 Worker 卡死但不退出，`pending` 将永久等待；需依赖外部的 `health.ping` 手动检测。
- 慢查询日志未落盘：设置了阈值 75ms，但未提供 `configureLogging` 的 `directory`，`logSlowQuery` 默认跳过写盘，调优时缺少 trace。

## 建议
- 将 `allowedMethods` 与 Worker handlers/`src/services/db` 对齐，补充遗漏的 `convo.deleteMany/archive/archiveMany/restore/listArchived` 等，避免 IPC 层阻塞。
- 在 `exit` 监听中添加自动重启（带退避和上限），或在崩溃时通知渲染层提示重启/只读模式。
- 调整 `stop()`：在清空前对 `pending` 执行 `rejectAll(new Error('DB worker stopped'))`，或明确限制仅在进程退出时调用。
- 为 `call` 引入超时/重试策略，定期 `health.ping` 监测并在超时后重建 Worker。
- 若需分析性能，传入日志目录（如 `app.getPath('userData')/logs`）启用慢查询文件日志，确保 profile 结果可追踪。
