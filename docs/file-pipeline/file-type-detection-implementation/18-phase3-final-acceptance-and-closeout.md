# Phase 3 验收矩阵、失败降级与收口

## 1. 阶段结论

completed with follow-ups

## 2. Phase 3 范围回顾

- **P3-A 外部进程安全底座**：实现了 `externalProcessPolicy` 与 `externalProcessRunner`。涵盖了 `shell: false` 默认约束、`.bat/.cmd` 解释器跳板阻断、输出截断上限、进程超时控制、`terminationGraceMs` 的二次有界收口（SIGTERM fallback to SIGKILL），以及日志层敏感信息（如 contentToken、fullHash、绝对路径）的阻断。
- **P3-B1 Magika loader fallback / provenance / cache boundary**：实现了 `magikaRuntimeLoader` 与 `magikaAdapter` 的 fallback 边界。保障了 `detectBasic` 不默认调用 Magika、未知 label 不污染 `FileFormatId`，确立了 provenance（modelVersion 记录进 evidence）机制与 cache validation，以及 provider 不可用时不阻断 core 探测流的逻辑。
- **P3-B2 Magika managed engine plugin boundary**：实现了 `magikaManagedPlugin`。主包彻底解除与 `magika` 和 `@tensorflow/tfjs` 的 npm 耦合。强化了基于目录的插件机制，包含严格的 manifest schema、运行时/模型/配置文件的 `root` 路径边界防护（防止路径穿越逃逸）、以及基于文件 integrity hash 的校验拦截，并接入了 P3-A 的健康检查基准。

## 3. 非目标确认

明确 Phase 3 **未完成、且不应宣称完成**的内容：
- 真实 Magika 模型生产打包（真实模型文件尚未提交/分发）
- 完整插件安装/更新/卸载系统
- Tika / LibreOffice / ffprobe / Pandoc 等其他外部引擎的真实接入链路
- 深度转换闭环
- `provider_file_ref` 机制
- `legacy message_asset` 相关的 destructive cleanup
- 完整版外部运行时诊断面板

## 4. P3-A 验收矩阵

| 验收项 | 对应文件 | 测试文件 | 状态 | follow-up |
|---|---|---|---|---|
| `shell:false` 默认且阻断高危扩展名 | `externalProcessPolicy.ts` | `externalProcessPolicy.test.ts` | Pass | 无 |
| `.bat/.cmd` 间接与直接解释器跳板阻断 | `externalProcessPolicy.ts` | `externalProcessPolicy.test.ts` | Pass | 无 |
| Process timeout & output cap | `externalProcessRunner.ts` | `externalProcessRunner.test.ts` | Pass | 补充并存语义测试 |
| terminationGraceMs 二次有界收口 | `externalProcessRunner.ts` | `externalProcessRunner.test.ts` | Pass | best-effort kill process tree 测试 |
| process kill failed 降级拦截 | `externalProcessRunner.ts` | `externalProcessRunner.test.ts` | Pass | 无 |
| 敏感日志内容/绝对路径脱敏 | `externalProcessPolicy.ts` / Runner | grep scanning | Pass | 无 |

## 5. P3-B1 验收矩阵

| 验收项 | 对应文件 | 测试文件 | 状态 | follow-up |
|---|---|---|---|---|
| detectBasic bypass runtime | `fileTypeDetectionService.ts` | `fileTypeDetectionService.test.ts`| Pass | 无 |
| loader interface & mock fallback | `magikaRuntimeLoader.ts` | `magikaRuntimeLoader.test.ts` | Pass | 无 |
| unavailable fallback without block | `magikaAdapter.ts` | `magikaAdapter.test.ts` | Pass | 无 |
| provenance & modelVersion evidence | `magikaAdapter.ts` / merge | `magikaAdapter.test.ts` | Pass | 无 |
| Magika unknown label isolation | `evidenceMerge.ts` / Adapter | `magikaAdapter.test.ts` | Pass | 无 |

## 6. P3-B2 验收矩阵

| 验收项 | 对应文件 | 测试文件 | 状态 | follow-up |
|---|---|---|---|---|
| manifest schema 严格校验 | `externalEngineManifest.ts` | `externalEngineManifest.test.ts`| Pass | 无 |
| plugin directory path isolation | `magikaManagedPlugin.ts` | `magikaManagedPlugin.test.ts` | Pass | realpath/symlink 边界测试 |
| runtime/model/config integrity 校验 | `magikaManagedPlugin.ts` | `magikaManagedPlugin.test.ts` | Pass | integrity failure log 脱敏 |
| health check 接入 P3-A policy/runner | `externalEngineHealth.ts` | `externalEngineHealth.test.ts`| Pass | 无 |
| NPM package 解耦 (无 magika) | `package.json` | grep scanning | Pass | 准备 Phase 4 打包方案 |

## 7. 失败降级矩阵

| Failure Reason | User-Visible Effect | Block Core? | Impact SendRoute | Fallback? | Test Coverage |
|---|---|---|---|---|---|
| external process timeout | 无感，降级使用内建规则 | No | No | Yes (Core) | Yes |
| output limit exceeded | 无感，降级使用内建规则 | No | No | Yes (Core) | Yes |
| kill failed / unconfirmed exit | 进程层被抛弃，识别降级 | No | No | Yes (Core) | Yes |
| policy interpreter blocked | 返回 engine_not_found，降级 | No | No | Yes (Core) | Yes |
| Magika runtime unavailable | 走 mock fallback 或 bypass | No | No | Yes (Core) | Yes |
| Magika modelVersion changed | 忽略旧缓存，走 default path | No | No | Yes (re-detect) | Yes |
| plugin missing | Health: unavailable，降级 | No | No | Yes (Core) | Yes |
| manifest invalid | 初始化失败，引擎设为禁用 | No | No | Yes (Core) | Yes |
| runtime entry / model missing | load fail, unavailable | No | No | Yes (Core) | Yes |
| integrity missing / hash mismatch| 拦截执行，引擎设为禁用 | No | No | Yes (Core) | Yes |
| path outside root (逃逸) | 拦截执行，引擎设为禁用 | No | No | Yes (Core) | Yes |
| health check timeout/cap | 健康状态 false，不可用 | No | No | Yes (Core) | Yes |
| unknown Magika label | 提取失败，无证据被添加 | No | No | Yes (Core) | Yes |

## 8. 禁止项扫描矩阵

- **`shell:true`**：0 匹配。
- **contentToken / fullHash 泄漏**：0 匹配（grep 扫无 log）。
- **绝对路径 console log**：0 匹配。
- **package.json 中的 magika / @tensorflow/tfjs**：0 匹配（完全解耦）。
- **python/rust/tika/libreoffice/ffprobe/pandoc**：0 匹配（并未做真实接入，无违规实现）。
- **文档伪造术语扫描（如“主工程已完成”、“完整插件系统已完成”）**：0 匹配。

## 9. 当前 follow-ups

**P1**:
- 跨平台 symlink / junction / realpath 边界可补专项测试（增强 P3-B2 逃逸防护）。
- timedOut 与 outputLimited 并存语义文档可补充。

**P2**:
- `normalizeModelVersion` 冗余重复逻辑梳理。
- `runMagikaProbe` 方法可被 deprecate。
- 插件签名 / trusted root（延期到 Phase 4）。

## 10. 是否允许进入后续阶段

**allowed_to_enter_phase4_planning**

P3 已提供安全的执行沙箱、严格的插件解析边界、以及不会破坏核心主线功能的失败降级闭环，达到了作为插件化外部执行基底的要求，随时可承接外部模型的分发与集成规划。

## 11. README 状态更新建议

将 README 状态置为：
Phase 3 external runtime stabilization completed with follow-ups.
Real model runtime packaging and full plugin lifecycle deferred to Phase 4.

## 12. 下一步建议

**Phase 4 planning**
基于当前的独立插件机制和外部执行底座，规划真实模型分发方案、插件下载/更新管线（UI层）、信任根（签名）体系，以及正式上线第一个外部 Engine（Magika）。