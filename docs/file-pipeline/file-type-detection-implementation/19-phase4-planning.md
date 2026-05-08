# Phase 4 规划：插件生命周期、真实 runtime 与深度转换

## 1. 阶段定位

Phase 4 当前仅为 planning，不是 implementation completed。
本文件用于把 Phase 3 收口后的能力转化为可执行任务包，控制实现范围、验收口径与风险边界。

## 2. Phase 3 输入条件

Phase 4 以以下已完成边界作为输入：

- P3-A 外部 runtime 安全底座（policy/runner、timeout、output cap、kill tree、日志脱敏边界）。
- P3-B Magika loader 与 managed plugin boundary（含 P0 审计修复）。
- P3-C 验收矩阵、失败降级与收口（阶段内闭环完成，不代表全项目完成）。

## 3. Phase 4 目标

1. 明确 Magika managed plugin 的真实包分发、模型版本管理与完整性策略。
2. 规划插件生命周期（install/enable/disable/update/rollback/uninstall）最小可落地顺序。
3. 规划设置页中的插件管理与状态展示边界（不泄露路径，不误导安全结论）。
4. 规划真实 classify call 的受控执行边界与 fallback 策略。
5. 规划 Tika/LibreOffice/ffprobe/Pandoc 的优先级与最小能力接入顺序。
6. 规划深度转换闭环与 send route 边界。
7. 规划 legacy/provider 的后续阶段隔离与 Owner 确认门槛。
8. 将手工烟测纳入 Phase 4 验收主清单。

## 4. Phase 4 非目标

1. 不一次性完成全部外部引擎与全部转换链路。
2. 不将插件生命周期 UI 与所有转换实现合并为单次大提交。
3. 不把 `provider_file_ref` 混入 Magika 插件实现。
4. 不跳过手工烟测。
5. 不把 Phase 4 planning 写成 implementation completed。

## 5. Phase 4 任务包设计

### P4-A：插件生命周期与设置页规划

- 目标：
  - 设计插件 install/enable/disable/update/rollback/uninstall 状态机与数据边界。
  - 定义设置页信息架构：插件列表、版本、健康状态、失败原因、可执行操作。
  - 定义隐私边界：UI 不显示真实绝对路径、contentToken、fullHash。
- 非目标：
  - 不实现完整下载器与完整设置页交互。
  - 不实现 trusted root 全链路。

### P4-B：Magika managed plugin 真实包与 classify call 规划

- 目标：
  - 设计 `engines/magika` 真实包结构、模型来源、license/attribution、hash/integrity。
  - 明确 `modelVersion` 唯一来源（manifest/model metadata）及 stale 规则。
  - 规划 classify call 触发条件、受控 runner、taxonomyMap 映射与 unknown label 降级。
  - 保持 `detectBasic` 不默认调用真实 Magika，`detectFull` 在 available 时可调用。
- 非目标：
  - 不直接提交真实大模型文件。
  - 不宣称真实生产打包链路已完成。

### P4-C：外部转换引擎优先级与深度转换闭环规划

- 目标：
  - 给出 Tika/LibreOffice/ffprobe/Pandoc 的引入优先级、最小能力与验收门槛。
  - 明确 Office/PDF/HTML/EPUB 深度转换的阶段切片。
  - 定义 `converted_markdown` / `converted_pdf` / `rendered_images` / `extracted_text` 路线边界。
  - 固化不执行 JS/宏/活动内容策略。
- 非目标：
  - 不在单阶段一次性接全转换链路。

### P4-D：最终验收、手工烟测与 legacy/provider 后续规划

- 目标：
  - 汇总自动化 + 手工烟测矩阵。
  - 明确 `legacy message_asset` destructive cleanup 是否进入后续实现及 Owner 门槛。
  - 明确 `provider_file_ref` 继续延期还是进入后续设计，不与 Magika 插件混做。
- 非目标：
  - 不在本阶段执行 destructive cleanup。
  - 不在本阶段推进 provider 真实实现。

## 6. 每个任务包的目标、非目标、允许修改范围、禁止事项

### P4-A
- 允许：
  - `docs/file-pipeline/file-type-detection-implementation/*` 规划文档；
  - 插件生命周期 schema 草案（文档层）。
- 禁止：
  - 直接落地设置页完整实现；
  - 修改 `sendPlanService` 主逻辑。

### P4-B
- 允许：
  - managed plugin manifest/runtime/model 分发策略文档；
  - 分类调用 contract 与 fallback 策略文档。
- 禁止：
  - 直接提交真实大模型文件；
  - 将 `magika` / `@tensorflow/tfjs` 绑定到主包依赖。

### P4-C
- 允许：
  - 外部转换引擎分阶段接入计划；
  - 转换路线与验收定义。
- 禁止：
  - 一次性启动全部引擎实现；
  - 引入不受控外部命令执行路径。

### P4-D
- 允许：
  - 手工烟测清单、回归门槛、风险登记；
  - legacy/provider 的后续阶段化计划。
- 禁止：
  - 直接执行 destructive cleanup；
  - 把延期项包装为“已完成”。

## 7. 验收矩阵草案

### 自动化测试
- file-type 核心回归（taxonomy、detector、merge、service、route mapping）
- plugin manifest/health/availability 回归
- external process safety policy/runner 回归

### 禁止项扫描
- `shell:true`
- `provider_file_ref`
- 绝对路径/`contentToken`/`fullHash` 日志泄露
- 非授权外部执行入口

### 日志脱敏
- 运行日志与错误日志扫描：路径、token、hash 不落普通日志

### 插件生命周期回归
- install/enable/disable/update/rollback/uninstall 状态转换断言（可从文档驱动到测试）

### 失败降级
- plugin unavailable 不阻断 Core Detector
- health fail / timeout / output cap 的 availability 行为一致

### 模型切换
- modelVersion 变化触发 stale/invalidation 边界验证

### 手工烟测
- 见第 8 节；Phase 4 若进入 UI/真实 runtime 必测。

## 8. 手工烟测清单

1. Starverse 启动（无插件情况下）。
2. 插件未安装路径下上传常见文件（txt/png/pdf/docx）行为。
3. 手动安装 Magika 插件后的健康检查通过路径。
4. 插件健康检查失败路径（缺模型、hash mismatch、timeout）。
5. txt/png/pdf/docx 上传与识别展示路径。
6. 伪装文件（扩展名与内容冲突）路径。
7. 模型切换路径（只影响 candidate/gate，不污染 verdict）。
8. 历史附件展示路径（不触发错误状态写回）。
9. 日志审查：无绝对路径、无 `contentToken`、无 `fullHash` 泄露。

## 9. Phase 4 风险登记

### P0
- 插件下载源与供应链篡改风险。
- 模型文件 hash/signature 校验缺失风险。
- 外部进程挂死导致资源泄漏风险。
- 路径/隐私信息泄露风险。

### P1
- 设置页误操作导致插件状态错乱。
- 转换结果质量不稳定导致路线误导。
- health check 误判导致可用性抖动。

### P2
- legacy destructive cleanup 时历史兼容风险。
- 多插件市场与企业策略并存复杂度。

## 10. Phase 5 或后续延期项

- `provider_file_ref`
- 企业策略与集中化配置治理
- 完整诊断面板
- DROID / Siegfried
- 高级 polyglot 检测
- 全量插件市场

## 11. 给下一轮 Agent 的提示词草案

> 在 `D:/Starverse` 执行 P4-A（插件生命周期与设置页规划）的实现前任务包梳理。只做代码勘察与任务分解，不写生产代码。输出 install/enable/disable/update/rollback/uninstall 状态机、设置页最小信息架构、可观测字段、隐私边界、验收命令与回滚策略。不得改 `sendPlanService` 主逻辑，不得接入 provider，不得执行 destructive cleanup。
