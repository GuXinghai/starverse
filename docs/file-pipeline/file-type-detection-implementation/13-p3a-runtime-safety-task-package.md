# P3-A 外部 runtime 安全底座实施前任务包

## 1. 阶段定位

本文件是 **P3-A implementation package**，不是 implementation completed。
本轮仅做代码级勘察与实施任务包收敛，不新增生产功能，不接入真实外部 runtime。

### 状态摘要（P3-A 实施后更新）

- P3-A 最小实现已落地：`externalProcessPolicy`、`externalProcessRunner`、health runner 注入闭环、availability 降级映射与测试。
- 仍未进入 P3-B/P3-C；未接入真实 Magika runtime，未接入真实 Tika/LibreOffice/ffprobe/Pandoc。

## 2. P3-A 目标

P3-A 仅建立“外部 runtime 安全底座”最小闭环，覆盖以下能力：

1. 外部命令必须使用参数数组调用（禁止字符串拼接命令）。
2. 默认 `shell:false`。
3. Windows `.bat` / `.cmd` 默认禁止直接作为普通入口执行。
4. 超时控制（timeout）与超时后终止策略。
5. `stdout` / `stderr` 输出上限（cap）与截断标记。
6. kill process tree（避免子进程残留）。
7. sandbox copy 或受控输入流边界（仅允许受控源路径/受控临时目录）。
8. 普通日志脱敏（绝对路径、contentToken、完整 hash、真实 temp 目录不入普通日志）。
9. external engine registry / manifest / health / availability 的最小真实 health check 闭环。

## 3. P3-A 非目标

1. 不接入真实 Magika runtime（属于 P3-B）。
2. 不接入 Tika / LibreOffice / ffprobe / Pandoc 真实执行链路。
3. 不做插件安装、升级、回滚、卸载完整生命周期。
4. 不做 Office / PDF / HTML / EPUB 深度转换闭环。
5. 不改 UI 主流程与 UI 附件组件业务判断。
6. 不改 sendPlanService 主逻辑（仅允许后续阶段做最小集成校正时再评估）。
7. 不引入 provider_file_ref。
8. 不做 legacy message_asset destructive cleanup。

## 4. 已勘察文件清单

### 4.1 Phase 文档与约束依据

- `D:/Starverse/docs/file-pipeline/file-type-detection-implementation/README.md`
- `D:/Starverse/docs/file-pipeline/file-type-detection-implementation/08-acceptance-command-matrix.md`
- `D:/Starverse/docs/file-pipeline/file-type-detection-implementation/09-risk-and-decision-register.md`
- `D:/Starverse/docs/file-pipeline/file-type-detection-implementation/10-phase1-mvp-closeout-report.md`
- `D:/Starverse/docs/file-pipeline/file-type-detection-implementation/11-phase2-stabilization-gap-review.md`
- `D:/Starverse/docs/file-pipeline/file-type-detection-implementation/12-phase3-external-runtime-planning.md`
- `D:/Starverse/docs/file-pipeline/file-type-detection-implementation/starverse_file_type_detection_engineering_final.markdown`

### 4.2 external engine scaffold / file-type 相关代码

- `D:/Starverse/src/next/file-type/externalEngineTypes.ts`
- `D:/Starverse/src/next/file-type/externalEngineManifest.ts`
- `D:/Starverse/src/next/file-type/externalEngineAvailability.ts`
- `D:/Starverse/src/next/file-type/externalEngineRegistry.ts`
- `D:/Starverse/src/next/file-type/externalEngineHealth.ts`
- `D:/Starverse/src/next/file-type/sendRouteMapping.ts`
- `D:/Starverse/src/next/file-type/magikaAdapter.ts`
- `D:/Starverse/src/next/file-type/index.ts`

### 4.3 相关测试

- `D:/Starverse/src/next/file-type/externalEngineManifest.test.ts`
- `D:/Starverse/src/next/file-type/externalEngineRegistry.test.ts`
- `D:/Starverse/src/next/file-type/externalEngineHealth.test.ts`
- `D:/Starverse/src/next/file-type/sendRouteMapping.test.ts`
- `D:/Starverse/infra/files/fileTypeDetectionService.test.ts`
- `D:/Starverse/infra/files/fileTypeDetectionService.fixtures.test.ts`
- `D:/Starverse/infra/files/sendPlanService.test.ts`

### 4.4 日志与脱敏 / 路径边界相关

- `D:/Starverse/electron/ipc/logSanitizer.ts`
- `D:/Starverse/electron/ipc/dbBridge.ts`
- `D:/Starverse/electron/ipc/imageIpc.ts`
- `D:/Starverse/src/shared/files/localStorageResolver.ts`

## 5. 当前 scaffold 与可复用能力

1. `externalEngineManifest` 已有最小 manifest 结构校验，可复用为健康检查配置输入。
2. `externalEngineRegistry` 已有引擎定义注册、状态记录与可用性聚合骨架。
3. `externalEngineHealth` 已有 mock/fake runner 与 timeout 包装思路，可扩展为真实 runner 注入点。
4. `externalEngineAvailability` 已能将健康状态投影为 capability 可用性，供 `sendRouteMapping` 消费。
5. `sendRouteMapping` 已有 availability 影响候选路线的基础逻辑（candidate 侧）。
6. `logSanitizer` 已有可复用脱敏能力（路径、参数摘要、错误摘要），可作为 P3-A 日志边界基础。
7. `localStorageResolver` 已体现受控存储路径边界，适合作为 sandbox copy 边界参考。

## 6. 当前缺口

### 6.1 process runner 缺口

- 尚无统一、可复用、受约束的 external process runner（参数数组 + shell:false + policy gate）。

### 6.2 timeout / output cap 缺口

- 目前 health scaffold 未形成统一 `stdout/stderr` 长度限制与截断策略规范。

### 6.3 kill process tree 缺口

- 尚未形成跨平台 kill process tree 最小实现与可测接口约束。

### 6.4 `.bat/.cmd` 禁止策略缺口

- 需要显式策略层拒绝 `.bat/.cmd`，并提供明确 failure reason（普通日志仍脱敏）。

### 6.5 sandbox copy / 受控输入流缺口

- 尚无专用于 external runtime 的受控输入准备层（仅做边界规划，不做深度文件管线改造）。

### 6.6 日志脱敏缺口

- engine health / runner 新增日志尚无统一脱敏契约，需明确不记录绝对路径、contentToken、完整 hash。

### 6.7 测试缺口

- 需要新增针对 shell:false、`.bat/.cmd` 禁止、timeout、输出 cap、kill tree、日志脱敏与 unavailable 降级的专项测试。

## 7. P3-A 建议最小实现范围

> 仅列计划，当前不改代码。

### 7.1 拟修改文件（最小）

- `D:/Starverse/src/next/file-type/externalEngineHealth.ts`
- `D:/Starverse/src/next/file-type/externalEngineRegistry.ts`
- `D:/Starverse/src/next/file-type/externalEngineAvailability.ts`
- `D:/Starverse/src/next/file-type/externalEngineTypes.ts`

### 7.2 拟新增文件（最小）

- `D:/Starverse/src/next/file-type/externalProcessRunner.ts`（统一安全执行入口）
- `D:/Starverse/src/next/file-type/externalProcessPolicy.ts`（`.bat/.cmd`/shell policy）
- `D:/Starverse/src/next/file-type/externalProcessRunner.test.ts`
- `D:/Starverse/src/next/file-type/externalProcessPolicy.test.ts`
- `D:/Starverse/src/next/file-type/externalEngineHealth.integration.test.ts`（fake runner + policy + timeout/output cap）

### 7.3 拟复用模块

- `D:/Starverse/electron/ipc/logSanitizer.ts`（脱敏策略复用）
- `D:/Starverse/src/shared/files/localStorageResolver.ts`（受控路径边界复用）

## 8. 禁止修改范围

1. 不重构 `D:/Starverse/src/ui-app/app/appChatApp.logic.ts`。
2. 不改 `D:/Starverse/infra/files/sendPlanService.ts` 主逻辑。
3. 不改 OpenRouter request serializer 主行为。
4. 不改 UI 附件组件业务判断。
5. 不改数据库 schema / migration（除非后续 Owner 明确确认）。
6. 不接入真实 Magika / Tika / LibreOffice / ffprobe / Pandoc。
7. 不引入 provider_file_ref。

## 9. 任务步骤

1. 新增或复用 safe external process runner：
   - 参数数组调用、默认 shell:false、命令白名单/黑名单策略。
2. 增加 engine health check 最小真实 runner 接口：
   - 支持 timeout、输出 cap、失败原因分类。
3. 接入 registry / availability 的失败降级：
   - health 失败只影响 availability/candidate，不阻断基础识别。
4. 增加日志脱敏与禁止项扫描：
   - 统一 runner/health/registry 日志摘要；禁止泄露路径/token/hash。
5. 增加测试与回归命令：
   - policy、runner、health、availability 以及 sendRouteMapping availability 回归。

## 10. 验收命令

```powershell
git diff --check
npm run lint:changed
npx vitest --run <P3-A 新增或相关测试路径>
rg -n "shell\s*:\s*true" src infra electron
rg -n "contentToken" src infra electron | rg -n "log|warn|error"
rg -n "console\.(log|warn|error).*([A-Za-z]:\\|/Users/|/home/|/mnt/)" src infra electron
rg -n "exec\(|execFile\(|spawn\(" src infra electron
```

补充口径：

- `rg` 无匹配时可能返回非零退出码；在禁止项扫描中，无匹配应视为通过。

## 11. 风险与回滚策略

1. 外部进程挂死风险：
   - 强制 timeout + kill process tree；失败写入 engine health 失败状态。
2. 输出过大风险：
   - stdout/stderr cap + truncation 标记，避免内存与日志污染。
3. Windows 进程树残留风险：
   - 引入平台感知的进程终止策略，并做最小行为测试。
4. `.bat/.cmd` 绕过风险：
   - policy 默认拒绝，必要时仅允许显式受控白名单（需 Owner 审批）。
5. 日志泄露风险：
   - 统一复用脱敏 helper；普通日志不出绝对路径/token/fullHash。
6. health check 误阻断基础识别风险：
   - health 失败只降级 availability，不中断 lightweight detector 与 verdict 生成。

## 12. 是否需要 Owner 确认

进入 P3-A implementation 前建议确认：

1. `.bat/.cmd` 是否允许 dev-only 显式开关例外（默认建议禁止）。
2. timeout 默认值与上限（建议区分 health check 与后续真实转换）。
3. stdout/stderr cap 默认值与截断策略。
4. kill process tree 的跨平台最低实现标准。
5. sandbox copy 与受控输入流优先级（先 copy 还是先 stream）。
6. P3-A 是否允许新增极小运行时配置项（若有需显式审批）。

## 13. 给 P3-A 实现 Agent 的下一条提示词草案

> 在 `D:/Starverse` 执行 P3-A 外部 runtime 安全底座 implementation。仅实现安全 external process runner 与 engine health check 最小真实闭环：参数数组调用、默认 shell:false、Windows `.bat/.cmd` 默认禁止、timeout、stdout/stderr cap、kill process tree、受控输入边界、日志脱敏。health 失败只能影响 engine availability 与 sendRouteMapping candidate，不能阻断 core detector。禁止改 sendPlanService 主逻辑、禁止改 UI 主流程、禁止接入真实 Magika/Tika/LibreOffice/ffprobe/Pandoc、禁止新增依赖。完成后提交最小测试与禁止项扫描结果。
