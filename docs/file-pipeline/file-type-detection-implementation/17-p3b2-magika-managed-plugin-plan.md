# P3-B2 Magika Managed Engine Plugin 规划

## 1. 阶段定位

本文件用于记录 P3-B2 managed plugin 路线与最小闭环状态。
当前完成的是 manifest/discovery/integrity/health/availability/runtime-loader 边界，不是完整插件系统 completed。

## 2. 修正后的 P3-B2 结论

- 主包依赖集成：`assessment_only`
- managed plugin 路线：`proceed_to_plugin_integration_planning`
- 不把 Magika 绑定进 Starverse 主包
- 不提交真实模型文件
- 不修改 `package.json / lockfile`

## 3. Magika 插件目录结构

建议目录形态（示例）：

```text
engines/magika/
  manifest.json
  runtime/
    <plugin runtime package or bundled runtime payload>
  model/
    config.json
    <model files>
  bin/
    <optional wrapper entry>
  cache/
  README.md / ATTRIBUTION
```

部署位置建议（按发行形态）：

- `%LOCALAPPDATA%/Starverse/engines/magika/`
- `StarversePortable/engines/magika/`
- `D:/Starverse/.starverse-engines/magika/`（dev only）

## 4. Magika plugin manifest 草案

至少包含以下字段：

- `manifestSchemaVersion`
- `engineId`（固定 `magika`）
- `displayName`
- `pluginVersion`
- `runtimeKind`
- `runtimeEntry`
- `modelVersion`
- `modelFiles`
- `configFiles`
- `integrity`（sha256）
- `license`
- `attribution`
- `healthcheck`
- `capabilities`
- `supportedLabels` 或 `taxonomyMapVersionCompatibility`
- `minStarverseVersion`

说明：
- `installedAt / updatedAt` 建议由本地 registry 记录，不强制写入 manifest。

## 5. modelVersion 唯一来源

必须固定为以下来源之一：

- plugin manifest 明确字段；
- model metadata 明确字段。

禁止来源：

- npm package version
- label 推断
- 任何猜测值

并且：

- `modelVersion` 变化必须触发 `magika_model_version_changed` stale reason。

## 6. 主包与插件隔离边界

- Starverse 主包不直接依赖 `magika` / `@tensorflow/tfjs`。
- 主包只读取 manifest、调用 health check、计算 availability、触发受控 runner。
- 插件失败不影响 Core Detector。
- 插件不可用只影响 Magika evidence / availability。
- `detectBasic` 仍不默认跑真实 Magika。
- `detectFull` 可在插件可用时调用 Magika。

## 7. health check 设计

最小 health check 闭环至少覆盖：

- manifest 可读
- runtime entry 存在
- model/config 文件存在
- integrity/hash 可校验
- modelVersion 可读取
- 可执行轻量 self-test 或 metadata command
- health timeout / output cap 复用 P3-A 外部 runtime 安全底座
- health 失败映射到 `engine_unavailable / disabled_by_policy / engine_timeout / output_limit_exceeded`

## 8. 最小真实调用策略

后续实现建议分两段：

1. 第一阶段：manifest + health + availability
2. 第二阶段：real classify call

约束：

- classify call 必须走 P3-A `externalProcessRunner` 或受控 plugin runner。
- renderer 不直接读取用户文件路径。
- 用户文件输入优先 sandbox copy 或受控输入流。
- 输出 label 必须经 `taxonomyMap`。
- unknown label 必须降级。
- runtime failure 必须 fallback 到 lightweight detector。

## 9. 设置页安装 / 更新 / 卸载边界

- Phase 3 不做完整设置页安装/更新/卸载 UI。
- Phase 3 仅允许预留 registry 字段与“手动放置插件目录”路径。
- Phase 4 再做 settings UI、下载、升级、回滚、卸载、签名校验、进度显示。

## 10. P3-B2 本轮最小闭环状态

已完成（最小闭环）：

- manifest 解析与字段约束（含 `modelVersion`、`runtimeEntry`、`modelFiles`、`configFiles`、`integrity`）
- 插件目录发现（可注入目录，支持 dev/userData/portable 语义边界）
- runtime/model/config 文件存在性检查
- sha256 integrity 校验与结构化失败原因映射
- health check 与 availability 联动（失败不阻断 Core Detector）
- `magikaRuntimeLoader` managed plugin 边界接入（unavailable fallback 保持）
- `detectFull` 可消费 managed loader；`detectBasic` 不调用插件 runtime

未完成（仍延期）：

- 真实 Magika 模型打包与生产 classify 执行链路
- 插件安装/更新/卸载 UI 与下载器
- 签名与 trusted root

## 10.1 P3-B2 audit P0 修复状态

已完成两项 P0 修复（仅安全加固，无功能扩张）：

- P0-1：manifest 路径边界加固。`runtimeEntry` / `modelFiles` / `configFiles` 与 `integrity` key 统一走相对路径策略，拒绝 `..` 逃逸、绝对路径、Windows 盘符路径、UNC 路径、NUL 字符，并在可用时通过 realpath 边界复核。
- P0-2：核心文件 integrity 强制覆盖。`runtimeEntry`、全部 `modelFiles`、全部 `configFiles` 必须声明并通过 `sha256`；缺失返回 `integrity_missing`，不匹配返回 `hash_mismatch`。

状态结论：

- P3-B2 managed plugin 最小闭环在安全边界上已满足进入 P3-C 的门槛（`allowed`）。
- 该结论不代表完整插件生命周期已完成，也不代表真实模型打包与发布策略已完成。

## 11. 测试策略

至少包括：

- manifest parse test
- missing runtime entry test
- missing model file test
- modelVersion propagation test
- hash mismatch test
- health timeout test
- output cap test
- unavailable fallback test
- no global sendRouteMapping block test
- no main-package magika dependency test

## 12. 风险与回滚

主要风险：

- 插件包体积
- 下载源与完整性校验
- 模型版本漂移
- runtime 失败
- health check 误判
- 跨平台路径差异
- 插件删除/禁用后降级行为
- 设置页生命周期延期导致的手动安装风险

回滚原则：

- 插件可用性问题通过禁用插件回退，不影响主包 core detector；
- 不以主包回滚解决插件生命周期问题。

## 13. Phase 4 延期项

明确延期到 Phase 4 或更后：

- 插件设置页安装 / 更新 / 卸载
- 插件签名与 trusted root
- 下载源管理
- 回滚 UI
- 完整诊断面板
- Tika / LibreOffice / ffprobe / Pandoc 真实链路
- `provider_file_ref`
- destructive cleanup

## 14. 给下一轮 Agent 的提示词草案

请在 `D:/Starverse` 执行 P3-B2 post-implementation audit：
1) 复核 managed plugin manifest/discovery/integrity/health/availability 的边界是否满足 Phase 3 约束；
2) 复核 `detectFull` 在插件 unavailable 时 fallback 行为与 `detectBasic` 不调用插件 runtime 的契约；
3) 复核 sendRouteMapping 在 Magika unavailable 下不会全局 blocked；
4) 输出 P0/P1/P2 风险与最小修复任务包。
不得接入真实模型打包，不修改 `package.json/lockfile`，不得把 P3-B2 写成插件体系已全部收口。
