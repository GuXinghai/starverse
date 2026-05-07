# Phase 3 外部 runtime 与安全执行层规划

## 1. 当前阶段定位

当前阶段为 **Phase 3 planning**，不是 Phase 3 implementation。
Phase 1 MVP 主闭环（A~K）已实现；Phase 2 stabilization / gap review 已完成并冻结。
本文件只定义任务包、边界、验收与回滚策略，不新增生产功能。

## 2. Phase 3 目标

1. 定义 Magika 从 adapter/stub 到真实 runtime 的接入边界与降级策略。
2. 定义 external engine registry 从 scaffolding 到真实 health check 的最小闭环。
3. 定义外部进程安全执行层统一约束（参数化调用、超时、输出上限、日志脱敏、进程树终止）。
4. 明确 engine availability 如何影响 sendRouteMapping，而不污染 detector verdict。
5. 建立 Phase 3 的验收命令矩阵与失败降级测试计划。

## 3. Phase 3 非目标

1. 不在本阶段接入真实 Tika / LibreOffice / ffprobe / Pandoc 执行链路。
2. 不在本阶段实现插件安装/升级/回滚/卸载全生命周期。
3. 不在本阶段改造 UI 主流程或 sendPlanService 主逻辑。
4. 不在本阶段执行 destructive cleanup（含 legacy message_asset 彻底删除、数据库清空）。
5. 不在本阶段引入 provider_file_ref。

## 4. 与 Phase 1/2 的边界

1. Phase 1/2 已完成的 taxonomy、verdict persistence、detection core/service、sendRouteMapping、UI 摘要展示保持不变。
2. Phase 3 仅处理“真实 runtime 与安全执行层”的规划与后续实现入口，不重写既有闭环。
3. engine unavailable 不得阻断 Core Detector 结果产出；只能影响 candidate 的 requiresJob/blockedBy/warnings。
4. detection cache 仍只缓存 verdict，不缓存 SendPlanCandidate。

## 5. 当前代码与文档依据

### 5.1 文档依据

- `D:\Starverse\docs\file-pipeline\file-type-detection-implementation\00-project-freeze.md`
- `D:\Starverse\docs\file-pipeline\file-type-detection-implementation\06-agent-implementation-appendix.md`
- `D:\Starverse\docs\file-pipeline\file-type-detection-implementation\08-acceptance-command-matrix.md`
- `D:\Starverse\docs\file-pipeline\file-type-detection-implementation\09-risk-and-decision-register.md`
- `D:\Starverse\docs\file-pipeline\file-type-detection-implementation\10-phase1-mvp-closeout-report.md`
- `D:\Starverse\docs\file-pipeline\file-type-detection-implementation\11-phase2-stabilization-gap-review.md`
- `D:\Starverse\docs\file-pipeline\file-type-detection-implementation\starverse_file_type_detection_engineering_final.markdown`

### 5.2 代码现状（用于规划，不代表已完成真实执行链路）

- `D:\Starverse\src\next\file-type\magikaAdapter.ts`：当前为 adapter 接口 + 映射逻辑，默认 noop 可降级。
- `D:\Starverse\src\next\file-type\externalEngineTypes.ts`：定义 EngineId/Manifest/Health/Availability 数据模型。
- `D:\Starverse\src\next\file-type\externalEngineManifest.ts`：manifest 结构校验（静态解析）。
- `D:\Starverse\src\next\file-type\externalEngineRegistry.ts`：内建 stub engine 注册、健康状态/诊断记录、可用性聚合。
- `D:\Starverse\src\next\file-type\externalEngineHealth.ts`：mockable health check runner + timeout 包装。
- `D:\Starverse\src\next\file-type\externalEngineAvailability.ts`：capability/route availability 计算。
- `D:\Starverse\src\next\file-type\sendRouteMapping.ts`：消费 engineAvailability，影响 candidate 兼容性与 blockedBy。

## 6. 任务包拆分

Phase 3 任务包压缩为 3 个，固定为以下 3 包。

### P3-A：外部 runtime 安全底座

目标（合并原安全执行层与 health check 规划）：
- 参数数组调用。
- 默认 `shell:false`。
- Windows `.bat/.cmd` 默认禁止。
- timeout。
- stdout / stderr cap。
- kill process tree。
- sandbox copy 或受控输入流。
- 普通日志脱敏（绝对路径、contentToken、完整 hash、临时目录真实路径不入普通日志）。
- external engine registry / manifest / health / availability 的最小真实 health check 闭环。

交付：
- secure process runner contract 草案。
- engine health state machine + availability 更新策略草案。
- failure reason taxonomy 与诊断事件口径。

核心原则：先建立安全底座，再允许真实 runtime 逐步接入。

### P3-B：Magika runtime 接入与降级闭环

目标（合并原 Magika 接入与 availability 路线复核）：
- 真实 Magika runtime 或 runtime loader 边界。
- `magikaModelVersion` 写入 provenance。
- runtime 不可用时降级到 lightweight detector（不阻断 core detector）。
- engineAvailability 对 sendRouteMapping 的影响复核。
- Magika 不得成为 Core Detector 的硬依赖。

交付：
- runtime adapter / loader contract 草案。
- model loading policy（bundle / sidecar / lazy load）草案。
- route impact matrix（availability 仅影响 candidate，不污染 verdict）。

核心原则：Magika 接入必须同时处理 availability、降级和 send route 影响。

### P3-C：Phase 3 验收矩阵、失败降级与收口

目标：
- shell:false 扫描。
- `.bat/.cmd` 禁止测试。
- timeout 测试。
- stdout / stderr cap 测试。
- kill process tree 测试。
- engine unavailable 降级测试。
- 普通日志脱敏扫描。
- Magika unavailable 不阻断 Core Detector 测试。
- sendRouteMapping availability 回归。

交付：
- phase3 acceptance commands supplement。
- negative-path regression suite plan。
- rollout + rollback checklist。

核心原则：验收与收口单独成包，避免实现阶段自证完成。

## 7. 每个任务包的允许修改范围

> 本节用于后续实现阶段授权；当前 planning 轮不执行代码改动。

- **P3-A**：`src/next/file-type/externalEngineRegistry*`、`externalEngineManifest*`、`externalEngineHealth*`、`externalEngineAvailability*`、计划中的 secure runner 模块与相关测试。
- **P3-B**：`src/next/file-type/magikaAdapter*`、`src/next/file-type/sendRouteMapping*`、`src/next/file-type/types*`、相关测试。
- **P3-C**：`docs` 验收矩阵补充、测试文件与扫描脚本（若新增脚本需 Owner 审批）。

## 8. 每个任务包的禁止事项

通用禁止（P3-A~C 全部适用）：

1. 不改 `sendPlanService` 主逻辑。
2. 不重构 `appChatApp.logic.ts`。
3. 不接 UI 新行为。
4. 不引入 provider_file_ref。
5. 不新增依赖（除非单独审批）。
6. 不执行真实外部引擎下载/安装/自动发现即执行。
7. 不提交本地状态、临时目录、备份文件。

附加禁止：

- **P3-A**：禁止 `shell:true`；禁止字符串拼接命令执行；禁止 `.bat/.cmd` 默认入口；不把 health check 失败作为 detector 失败传播。
- **P3-B**：不把 Magika 输出直接扩展为内部新枚举，必须先过 taxonomyMap；禁止让 availability 写回 verdict。
- **P3-C**：禁止将未验证功能标记为“已完成真实执行链路”。

## 9. 每个任务包的验收命令

> 命令以仓库现有脚本为基线；具体实现轮可增补 scoped tests 路径。

### P3-A

- `git diff --check`
- `npx vitest --run src/next/file-type/externalEngineManifest.test.ts src/next/file-type/externalEngineRegistry.test.ts src/next/file-type/externalEngineHealth.test.ts`
- `rg -n "shell\\s*:\\s*true" src infra electron`
- `rg -n "child_process|exec\\(|spawn\\(|execFile\\(" src infra electron`
- `rg -n "engine_unavailable|engine_timeout|engine_failed|engine_health_checked" src/next/file-type`

### P3-B

- `git diff --check`
- `npx vitest --run src/next/file-type/magikaAdapter.test.ts src/next/file-type/sendRouteMapping.test.ts src/next/file-type/taxonomyMap.test.ts`
- `rg -n "magikaModelVersion" src/next/file-type infra`
- `rg -n "routeAvailability|engineAvailability|blockedBy|warnings" src/next/file-type/sendRouteMapping.ts`

### P3-C

- `npm run db:verify`
- `npm run build:worker`
- `npm run lint:changed`
- `npx vitest --run src/next/file-type/fileTypeFixtureMatrix.test.ts infra/files/fileTypeDetectionService.fixtures.test.ts infra/files/sendPlanService.test.ts`
- 日志与禁止项综合扫描：
  - `rg -n "contentToken" src infra electron | rg -n "log|warn|error"`
  - `rg -n "([A-Za-z]:\\\\|/Users/|/home/|/mnt/)" src infra electron`
  - `rg -n "provider_file_ref|providerFileRef" src infra electron`
  - `rg -n "message_asset|messageAsset" src infra electron`
  - `rg -n "shell\\s*:\\s*true" src infra electron`

## 10. 风险与回滚策略

1. **Magika runtime 兼容性风险**：版本漂移导致映射偏差。
   - 回滚：保留 noop adapter + 固定 taxonomyMapVersion，切回 stub。
2. **Health check 误判风险**：短时失败导致 route 全面降级。
   - 回滚：引入 failure cool-down 与最小重试，不立刻全局降级。
3. **外部进程执行面扩大风险**：安全约束不全导致命令注入或路径泄露。
   - 回滚：统一 runner 封装开关；异常时强制回退内置 detector。
4. **sendRouteMapping 污染风险**：availability 逻辑写入 verdict 或 cache。
   - 回滚：隔离 candidate-only state，禁止写回 verdict 持久层。
5. **测试不充分风险**：负路径缺失导致上线后降级不可控。
   - 回滚：Phase 3 implementation 前必须完成 P3-C 失败降级测试门槛。

## 11. 是否需要 Owner 确认

需要。以下点必须在进入 Phase 3 implementation 前确认：

1. Magika runtime 加载策略（bundle/sidecar/lazy）及模型版本管理。
2. external process runner 放置层级（`infra/files` vs `src/next/file-type` 邻接层）。
3. Windows `.bat/.cmd` 在 dev 模式是否允许“显式二次确认”例外。
4. health check 失败冷却时间与重试次数上限。
5. Phase 3 实施门槛：通过哪些负路径测试后才可进入更广泛外部引擎接入。

## 12. Phase 4 延期项

以下内容明确延期至 Phase 4 或更后：

1. Tika / LibreOffice / ffprobe / Pandoc 的完整执行链路。
2. 插件安装、升级、回滚、卸载完整生命周期。
3. Office / PDF / HTML / EPUB 深度转换闭环。
4. legacy message_asset destructive cleanup。
5. provider_file_ref。
6. 完整诊断面板。

## 13. 给下一轮实现 Agent 的任务包入口提示词草案

### P3-A 提示词草案

> 仅实现外部 runtime 安全底座：secure runner 约束（参数数组、shell:false、.bat/.cmd 默认禁止、timeout、stdout/stderr cap、kill process tree、sandbox copy/受控输入流）与 external engine health/availability 最小闭环。不得改 sendPlanService/UI，不得把 health 失败传播为 detector 失败。

### P3-B 提示词草案

> 仅实现 Magika runtime 接入与降级闭环：写入 `magikaModelVersion` provenance，runtime 不可用时降级到 lightweight detector，并复核 engineAvailability 对 sendRouteMapping 的 candidate 影响。不得污染 verdict/cached state，不得改 sendPlanService 主逻辑。

### P3-C 提示词草案

> 仅补 Phase 3 验收矩阵与失败降级测试（shell:false 扫描、.bat/.cmd 禁止、timeout/stdout/stderr cap/kill process tree、engine unavailable 降级、日志脱敏、sendRouteMapping availability 回归）。不新增业务功能，不引入新依赖，不接 UI/runtime 真执行。
