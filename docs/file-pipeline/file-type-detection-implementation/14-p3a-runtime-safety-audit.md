# P3-A 外部 runtime 安全底座实现后审计

## 1. 审计结论

**pass with follow-ups**

- P3-A 主体实现符合阶段边界，未越界到 P3-B/P3-C。
- 历史审计识别的 2 个 P0 已在本轮修复并通过回归验证。
- 当前剩余为 P1/P2 跟进项，不阻断进入 P3-B。

## 2. 审计范围

- 审计提交：`3a53389515f02d116f80e7b56f391ac10bf7b478`
- 审计对象：
  - `externalProcessPolicy`
  - `externalProcessRunner`
  - `externalEngineHealth / Registry / Availability`
  - 相关测试与扫描口径
- 审计命令范围：
  - `lint:changed`
  - external engine / runner / mapping 相关 vitest
  - grep 禁止项扫描

## 3. 已审计文件清单

- `D:/Starverse/src/next/file-type/externalProcessPolicy.ts`
- `D:/Starverse/src/next/file-type/externalProcessRunner.ts`
- `D:/Starverse/src/next/file-type/externalEngineTypes.ts`
- `D:/Starverse/src/next/file-type/externalEngineManifest.ts`
- `D:/Starverse/src/next/file-type/externalEngineRegistry.ts`
- `D:/Starverse/src/next/file-type/externalEngineAvailability.ts`
- `D:/Starverse/src/next/file-type/externalEngineHealth.ts`
- `D:/Starverse/src/next/file-type/externalProcessPolicy.test.ts`
- `D:/Starverse/src/next/file-type/externalProcessRunner.test.ts`
- `D:/Starverse/src/next/file-type/externalEngineManifest.test.ts`
- `D:/Starverse/src/next/file-type/externalEngineRegistry.test.ts`
- `D:/Starverse/src/next/file-type/externalEngineAvailability.test.ts`
- `D:/Starverse/src/next/file-type/externalEngineHealth.test.ts`
- `D:/Starverse/src/next/file-type/sendRouteMapping.test.ts`
- `D:/Starverse/electron/ipc/logSanitizer.ts`
- `D:/Starverse/docs/file-pipeline/file-type-detection-implementation/13-p3a-runtime-safety-task-package.md`

## 4. 架构边界复核

复核结论：**通过**

- 未越界到 P3-B（未接真实 Magika runtime）。
- 未接入 Tika / LibreOffice / ffprobe / Pandoc 真实执行链路。
- 未改 UI 主流程。
- 未改 sendPlanService 主逻辑。
- 未改 DB schema。
- 未引入 `provider_file_ref`。
- 未做 destructive cleanup。

## 5. externalProcessPolicy 审计

结论：**通过（P0 已修复）**

已满足：
- timeout 默认/上限与 Owner 决策一致：
  - health: `3000`
  - process: `10000`
  - hard max: `60000`
- stdout/stderr 默认与上限一致：
  - stdout default `1 MiB` / hard max `10 MiB`
  - stderr default `256 KiB` / hard max `1 MiB`
- `shell:true` 被显式拒绝。
- `.bat/.cmd` 大小写、quoted path、路径形式已有覆盖测试。
- 返回稳定 policy 错误码，未见裸 throw 透传到上层调用方。

P0 修复状态：
- 已新增解释器跳板阻断：
  - `cmd.exe` / `command.com`
  - `powershell.exe` / `pwsh.exe`
  - `wscript.exe` / `cscript.exe` / `mshta.exe`
- 已覆盖大小写、quoted path、完整路径与带空格路径样式。
- `cmd.exe /c *.bat|*.cmd` 间接执行场景已被策略拒绝（由入口解释器阻断实现）。

## 6. externalProcessRunner 审计

结论：**通过（P0 已修复）**

已满足：
- 使用参数数组调用 `spawn(command, args, ...)`，未发现 shell command string 拼接执行。
- 默认 `shell:false`。
- timeout / stdout cap / stderr cap 语义与结构化返回实现齐备。
- 非零退出、command not found、spawn error 都有结构化返回字段。
- kill process tree 采用 best-effort（Windows `taskkill /T /F`，非 Windows 先 group kill 再 pid kill）。
- kill 失败不会抛未处理异常。

P0 修复状态：
- runner 新增 `terminationGraceMs`（默认 1000ms，硬上限 10000ms）二次有界收口。
- timeout/output-limit 触发后：
  - 进入 termination attempt；
  - 执行 best-effort kill process tree；
  - grace 到期即使没有 close 事件也会 resolve，避免悬挂。
- 新增结构化字段：
  - `terminationAttempted`
  - `terminated`
- 新增稳定错误码：
  - `process_exit_unconfirmed`
  - `process_kill_failed`

## 7. health / registry / availability 审计

结论：**通过（补测已增强，仍有少量 P1 可选项）**

已满足：
- health check runner 注入边界清晰（`runner` 与 `processRunner` 双注入）。
- health check 默认不读取用户文件（仅使用 manifest healthcheck command/args/cwd）。
- health 失败只写 registry health 状态并影响 availability，不阻断基础识别链路。
- `command_not_found -> engine_unavailable`、`timeout -> engine_timeout`、`policy denied -> disabled_by_policy` 映射已落地。
- manifest 新增 `healthcheck` 字段保持向后兼容（可空）。

补测状态：
- `output_limit_exceeded -> failureReason` 已补测试。
- `policy denied -> disabled_by_policy` 映射路径已覆盖（保留可选增强用例）。

## 8. 日志脱敏审计

结论：**通过**

已满足：
- runner 返回的 `stdout/stderr` 经过脱敏（路径/contentToken/fullHash）。
- registry `failureDetails` 有二次脱敏。
- 新增代码未引入新的普通日志输出点（无新增 console/logger 泄露面）。

后续建议（P1）：
- 可补 `stderr` 多段拼接场景的脱敏专项断言，强化回归稳定性。

## 9. 测试覆盖审计

已覆盖：
- policy 默认值、上限 clamp、shell:true 拒绝、`.bat/.cmd` 基础覆盖。
- runner timeout/stdout cap/stderr cap/非零退出/command not found/脱敏。
- health runner 注入与 unavailable 降级。
- availability 与 sendRouteMapping 回归通过。

缺口（更新后）：
- P0 缺口已清零。
- 仍建议补更细粒度平台行为用例（P1/P2）。

## 10. 风险分级

### P0（进入 P3-B 前必须修复）

- 无（本轮已修复）

### P1（P3-B 前建议修复）

1. `timedOut` 与 `outputLimited` 并存时的语义优先级可补文档说明。
2. `policy denied -> disabled_by_policy` 可补更细粒度边界测试（可选）。
3. 脱敏规则可补 stderr 聚合场景专项测试。

### P2（可后续收口）

1. 增加跨平台 kill 行为说明文档，减少运维误解。

## 11. 是否允许进入 P3-B

**allowed**

## 12. 修复落地摘要（本轮）

1. **P0-1 policy anti-bypass 已落地**
   - 阻断解释器跳板入口（cmd/command.com/powershell/pwsh/wscript/cscript/mshta）。
   - 阻断 `.bat/.cmd` 直接入口。
   - 新增覆盖大小写、quoted path、路径变体与间接 `/c` 场景测试。

2. **P0-2 bounded completion guarantee 已落地**
   - timeout/output-limit 后进入 termination attempt。
   - kill 失败或 close 缺失时，通过 `terminationGraceMs` 保证有界 resolve。
   - 新增 `process_exit_unconfirmed` / `process_kill_failed` 与对应测试。

3. **回归补强**
   - health 映射中 `output_limit_exceeded` 专项测试已补。

## 13. 给下一轮 Agent 的提示词草案

> 进入 P3-B（Magika runtime 接入与降级闭环）implementation planning 或 implementation：
> 1) 保持 P3-A 安全底座约束（shell:false、解释器跳板阻断、有界终止、日志脱敏）；
> 2) 接入 Magika runtime loader/provenance（`magikaModelVersion`）并保证 unavailable 可降级；
> 3) 保持 engine availability 仅影响 candidate，不污染 verdict；
> 禁止接入 Tika/LibreOffice/ffprobe/Pandoc 真实链路，禁止改 UI 主流程与 sendPlanService 主逻辑，禁止改 DB schema。
