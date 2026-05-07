# P3-A 外部 runtime 安全底座实现后审计

## 1. 审计结论

**pass with follow-ups**

- P3-A 主体实现符合阶段边界，未越界到 P3-B/P3-C。
- 发现 **2 个 P0** 安全/可靠性缺口，进入 P3-B 前必须修复。

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

结论：**主体通过，存在 P0 绕过风险**

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

发现问题：
- **P0**：当前 `.bat/.cmd` 禁止仅检查 `command` basename，仍可通过 `command=cmd.exe` + `args=['/c','xxx.bat']`（或同类 shell host）绕过。

## 6. externalProcessRunner 审计

结论：**主体通过，存在 P0 可靠性缺口**

已满足：
- 使用参数数组调用 `spawn(command, args, ...)`，未发现 shell command string 拼接执行。
- 默认 `shell:false`。
- timeout / stdout cap / stderr cap 语义与结构化返回实现齐备。
- 非零退出、command not found、spawn error 都有结构化返回字段。
- kill process tree 采用 best-effort（Windows `taskkill /T /F`，非 Windows 先 group kill 再 pid kill）。
- kill 失败不会抛未处理异常。

发现问题：
- **P0**：timeout/output-limit 触发后，依赖子进程 `close/error` 事件收口；若 kill 失败且进程未退出，Promise 可能长时间悬挂，无法保证“timeout 一定触发终止并返回结果”。
- P1：`timedOut` 与 `outputLimited` 可同时为 true 的语义未在契约中明确优先级（可接受但建议写清）。

## 7. health / registry / availability 审计

结论：**通过（含少量 P1 一致性补测建议）**

已满足：
- health check runner 注入边界清晰（`runner` 与 `processRunner` 双注入）。
- health check 默认不读取用户文件（仅使用 manifest healthcheck command/args/cwd）。
- health 失败只写 registry health 状态并影响 availability，不阻断基础识别链路。
- `command_not_found -> engine_unavailable`、`timeout -> engine_timeout`、`policy denied -> disabled_by_policy` 映射已落地。
- manifest 新增 `healthcheck` 字段保持向后兼容（可空）。

建议补测（P1）：
- `output_limit_exceeded -> failureReason` 映射专门用例。
- `policy_batch_entrypoint_blocked` / `policy_shell_not_allowed` 到 `disabled_by_policy` 的专门用例。

## 8. 日志脱敏审计

结论：**通过（P1：建议补 grep 回归断言）**

已满足：
- runner 返回的 `stdout/stderr` 经过脱敏（路径/contentToken/fullHash）。
- registry `failureDetails` 有二次脱敏。
- 新增代码未引入新的普通日志输出点（无新增 console/logger 泄露面）。

建议：
- 增加 1 个专门测试覆盖 `stderr` 多段拼接场景下的脱敏一致性（P1）。

## 9. 测试覆盖审计

已覆盖：
- policy 默认值、上限 clamp、shell:true 拒绝、`.bat/.cmd` 基础覆盖。
- runner timeout/stdout cap/stderr cap/非零退出/command not found/脱敏。
- health runner 注入与 unavailable 降级。
- availability 与 sendRouteMapping 回归通过。

缺口：
- 未覆盖 `cmd.exe /c *.bat` 绕过场景（P0）。
- 未覆盖 “kill 失败后 runner 必须在有限时间内返回” 场景（P0）。
- 未覆盖 `output_limit_exceeded` 在 health 映射中的单测（P1）。

## 10. 风险分级

### P0（进入 P3-B 前必须修复）

1. `.bat/.cmd` 可通过 shell host 间接绕过（`cmd.exe /c` 等）。
2. timeout/output-limit 后若 kill 失败，runner 可能悬挂，无法保证有界返回。

### P1（P3-B 前建议修复）

1. `timedOut` 与 `outputLimited` 并存时的语义优先级未文档化。
2. health failure reason 的部分映射缺专项测试。
3. 脱敏规则建议增加 stderr 聚合场景测试。

### P2（可后续收口）

1. 增加跨平台 kill 行为说明文档，减少运维误解。

## 11. 是否允许进入 P3-B

**allowed after P0 fixes**

## 12. 如需修复，最小修复任务包（仅计划）

1. **P3-A audit fix-1（policy anti-bypass）**
   - 在 policy 层增加 shell-host 检测：
     - 拒绝 `cmd.exe /c *.bat|*.cmd`
     - 拒绝 `powershell -File *.ps1`（如 Owner 要求可扩展）
   - 新增对应测试（Windows/非 Windows 兼容断言）。

2. **P3-A audit fix-2（bounded completion guarantee）**
   - runner 在 timeout/output-limit 后增加二次收口保障：
     - kill 发起后设置短二次截止时间；
     - 到期仍未 close 时返回 `process_kill_failed`（脱敏 detail），避免 Promise 悬挂。
   - 增加 kill 失败模拟测试（mock killProcessTreeImpl 返回 false + close 不触发）。

3. **补充回归**
   - health 映射：`output_limit_exceeded` / `disabled_by_policy` 专项测试。

## 13. 给下一轮 Agent 的提示词草案

> 执行 P3-A audit fix（仅修 P0/P1，禁止新增功能）：
> 1) 修复 `.bat/.cmd` 间接绕过（例如 `cmd.exe /c`）并补测试；
> 2) 修复 runner 在 kill 失败场景下可能悬挂的问题，保证 timeout/output-limit 后有界返回，并补测试；
> 3) 补 health failure reason 映射测试（含 `output_limit_exceeded`、`disabled_by_policy`）；
> 不接入真实 Magika/Tika/LibreOffice/ffprobe/Pandoc，不改 UI、不改 sendPlanService 主逻辑、不改 DB schema。
