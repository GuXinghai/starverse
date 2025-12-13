# 聊天多线程调用性能优化指南

## 线程与调用链梳理
- 渲染进程：`src/stores/chatStore.js` 的 `saveConversations`/`debouncedSaveConversations` 驱动持久化，序列化树与消息后通过 `sqliteChatPersistence.saveConversation` 发送到主进程。
- 预加载层：`electron/preload.ts` 暴露 `window.dbBridge.invoke`，所有聊天持久化调用走 `ipcRenderer.invoke('db:invoke', { method, params })`。
- 主进程：`electron/ipc/dbBridge.ts` 白名单校验后转给 `DbWorkerManager.call`。
- Worker 线程：`infra/db/worker.ts` 同步使用 BetterSqlite3 串行执行 SQL（`convo.save` + `message.replace` 等），所有 IPC 请求在此线程排队。

## 现状发现（与聊天相关的跨线程热点）
- **高频全量写入**：`src/stores/chatStore.js:591-642` 对每个脏对话调用 `sqliteChatPersistence.saveConversation`；`src/services/chatPersistence.ts:501-547` 先 `convo.save` 后 `message.replace`，每次流式生成都会携带完整分支树和当前路径的全部消息做全量替换，导致跨线程 structuredClone 和 Worker 端全表重写。
- **渲染线程负担重的日志/序列化**：`src/services/db/index.ts:32-82` 在每次 `message.replace` 前遍历并 `JSON.stringify` 全部消息输出日志，长上下文流式时会阻塞渲染线程；`chatPersistence` 的调试日志在开启时同样逐条序列化。
- **Worker 队列缺乏背压与超时**：`electron/db/workerManager.ts` 仅把请求放入 `pending`，无超时、无并发上限；`stop()` 清空 `pending` 不 reject，Worker 崩溃或卡死时请求会无限挂起且不会自动重启。
- **FTS 替换代价高**：`infra/db/repo/messageRepo.ts:27-83` 的 `replaceForConvo` 先 `DELETE FROM message` 再全量插入，并触发 FTS 删除/重建；流式保存时重复重建索引，耗时随对话长度线性增长。
- **性能观测缺口**：`infra/db/logger.ts` 仅设置阈值，未传入日志目录，慢查询不会落盘，难以定位 Worker 侧瓶颈。

## 已实装的关键修复
- DB Worker 调用超时与挂起保护：`DbWorkerManager.call` 默认 20s 超时，退出/停止时会 `reject` 所有挂起请求，避免渲染侧永久等待。
- 崩溃自愈：Worker 异常退出会带退避（500ms 起，最多 5 次）自动重启，防止单次崩溃导致数据库不可用。
- 慢查询日志落盘：启动 Worker 时传入 `userData/logs` 目录，`configureLogging` 可输出 `sqlite-slow.log` 便于定位瓶颈。
- 持久化去重：`chatPersistence.saveConversation` 基于消息摘要跳过未变化的 `message.replace`/清空操作，减少无效跨线程传输与 FTS 重写。
- 差量追加：当仅最后一条消息正文追加新文本且结构未变时，走 `message.appendDelta` 仅追加新增字符，不再整条替换。

## 优先级优化建议
1) **先行减压**
- 给 `dbService.invoke`/`chatPersistence` 的详尽日志加开关（如 `VITE_DEBUG_DB`），默认关闭 JSON 序列化打印，避免渲染线程在长消息上自阻塞。
- 增加 Worker 侧并发/排队长度上限（或拒绝新请求），防止无限排队拖垮渲染侧。

2) **流式场景减小跨线程负载**
- 让流式写入走增量路径：在渲染层保留 token 缓冲，仅在消息结束时调用 `message.append`/`message.patchLast`（需要新增接口），避免每 500-3000ms 全量 `message.replace`。
- 合并 RPC：增加 `convo.saveWithMessages`（单个 payload 包含 meta + 需写入的消息），Worker 内部单事务完成，减少两次 structuredClone 和两条消息队列排队。
- 优化 FTS 重建：在替换逻辑中直接 `DELETE FROM message_fts WHERE convo_id=?` 后批量插入，避免逐行触发触发器；或仅对新增消息写 FTS，历史部分不重复写。

3) **其他降低噪声的调整**
- 为项目数据增加脏标记，只在变更时调用 `project.save`，减少与聊天无关的跨线程调用。
- 暴露 `pending` 长度/最近慢查询到 DevTools 面板或日志，便于快速判断瓶颈在 IPC 还是 SQL。

## 监控与验证建议
- 启用慢查询日志后，在长对话生成时检查 `sqlite-slow.log`，确认是否存在单条 SQL >75ms 的热点。
- 在渲染侧记录每次 `saveConversations` 的耗时和 payload 大小，观察增量方案是否显著降低跨线程传输体积。
- 压测流式对话（长上下文 + 图片）并观察 `pending` 队列长度是否稳定，不再出现挂起或吞吐下滑。

## 新的优化思路（结合当前实现）
- **appendDelta 回退**：若 `message.appendDelta` 因找不到 seq 抛错，渲染层应自动回退一次 `message.replace`，避免流式保存中断。
- **单事务 RPC**：设计 `convo.saveWithMessages`，在 Worker 内一次事务写入 convo/meta 和消息（含 FTS），保证 digest 与消息一致，并减半 IPC 往返。
- **队列背压与指标**：在主进程暴露 `pending` 长度、最近重启时间、平均调用耗时，达到阈值时拒绝新请求或提示“后台繁忙”，防止 UI 继续堆压。
- **FTS 批量写**：全量替换时使用批量 `INSERT` 重建 `message_fts`，缩短锁持有时间；追加模式仅更新末条 FTS，保持差量写的优势。
- **流式节流**：为流式场景增加“最短 replace 间隔”（如 1-2s），在持续 appendDelta 期间推迟 replace，进一步降低跨线程吞吐。

## TODO 计划表
| 项目 | 动作 | 预期收益 | 优先级 | 状态 |
| --- | --- | --- | --- | --- |
| 渲染层日志减噪 | 为 `dbService.invoke`/`serializeTree` 等重度日志加 `VITE_DEBUG_DB`/`VITE_DEBUG_TREE` 开关，默认关闭 JSON 遍历 | 降低长对话流式时的主线程阻塞 | P0 | 已完成（默认静默） |
| Worker appendDelta 重复注册 | 保留单一 `message.appendDelta` handler，避免后续维护分叉 | 减少验证分叉风险，保持行为确定 | P0 | 已完成 |
| FTS 全量重建优化 | 在 Worker 内对 `message_fts` 做单次删除+批量插入，缩短锁持有时间 | 大幅降低长对话 replace 时的 CPU/锁耗时 | P1 | 已完成（单次清理+批量重建） |
| IPC 合并 | 新增 `convo.saveWithMessages` 单事务 RPC，减少一次 clone/排队 | 减半跨线程往返与序列化开销 | P1 | 已完成 |
| 背压与指标 | 暴露 `pending` 队列长度/最大等待时长，超过阈值时拒绝或延迟写入 | 防止无限排队拖垮 UI，快速定位瓶颈 | P1 | 已完成（队列上限+stats 接口） |
| 项目脏标记 | 为项目保存引入 dirty 标记，只在修改时写 DB | 减少与聊天无关的 DB 调用 | P2 | 已完成 |
