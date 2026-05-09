# 37. P4-D2 Manual Smoke Execution Package

**状态**: Completed (execution pending — requires Electron + real runtime environment)
**日期**: 2026-05-10
**阶段**: P4-D2 (Phase 4 final acceptance — manual smoke checklist)
**父文档**: `35-p4d-final-acceptance-planning.md`

P4-D2 不代表 Phase 4 completed。

---

## 1. 定位

将 P4-D planning (§12, §13) 中 43 项手工烟测整理为可执行包，定义每项的 ID、前置条件、操作步骤、预期结果、证据记录方式，并标记当前执行状态。P4-D2 本身不执行烟测（需 Electron + real runtime 环境），仅编制 checklist。

---

## 2. Grid Key

| 标记 | 含义 | 当前环境是否满足 |
|------|------|-----------------|
| [E] | 需 Electron 环境 | **否** |
| [R] | 需真实 runtime 已安装 | **否** |
| [P] | 需 production trusted root 配置 | **否** |
| [-] | 无特殊运行时要求 | 是（但仍需 Electron 启动） |

### 2.1 可用性状态标记

| 标记 | 含义 |
|------|------|
| pass | 已执行，通过 |
| fail | 已执行，失败 |
| blocked | 环境/工具/依赖缺失，无法执行 |
| not_run | 未排期执行，或需后续阶段执行 |
| N/A | 当前阶段不适用 |

---

## 3. Settings UI Manual Smoke (P4-A scope)

### 执行环境要求
- Starverse Electron app 启动
- EnginePluginSettingsPanel 可访问

| ID | 场景 | 需求 | 操作步骤 | 预期结果 | 证据 | 状态 |
|----|------|------|---------|---------|------|------|
| SM-1 | 无 trusted root 时 UI 显示不可用状态 | [-] | 1. 不配置 SV_OFFICIAL_PLUGIN_TRUSTED_ROOTS。2. 打开 Settings → Plugins 面板。3. 观察 UI。 | 显示 amber 提示条 "官方插件信任根未配置，官方插件列表暂不可用" | 截图 | **not_run** (no Electron) |
| SM-2 | 有 test trusted root 时 list official plugins | [-] | 1. 配置 test trusted root。2. 打开 Settings → Plugins。3. 检查插件列表。 | 插件列表正常显示，官方插件可见 | 截图 | **not_run** |
| SM-3 | Register local official plugin (test_root) | [-] | 1. 准备 test_root 中的 plugin package。2. 点击 Register。3. 检查 installState。 | installState → installed | 截图 + 日志 | **not_run** |
| SM-4 | Register local official plugin (managed_root) | [-] | 1. 准备 managed_root 中的 plugin package。2. 点击 Register。3. 检查 installState。 | installState → installed | 截图 + 日志 | **not_run** |
| SM-5 | test_root in official source → rejected | [-] | 1. 将 test_root path 设为 official source。2. 尝试 register。3. 观察错误。 | `install_root_kind_mismatch` 错误提示 | 截图 | **not_run** |
| SM-6 | Enable plugin | [-] | 1. Plugin 已 installed。2. 点击 Enable 按钮。3. 检查状态。 | enabled = true，按钮文字变为 Disable | 截图 | **not_run** |
| SM-7 | Disable plugin | [-] | 1. Plugin 已 enabled。2. 点击 Disable 按钮。3. 检查状态。 | enabled = false，按钮文字变为 Enable | 截图 | **not_run** |
| SM-8 | Uninstall plugin | [-] | 1. Plugin 已 installed。2. 点击 Uninstall。3. 确认。4. 检查状态。 | installState → uninstalled | 截图 + 日志 | **not_run** |
| SM-9 | Health check 正常 | [R] | 1. Real runtime 已安装。2. 点击 Health Check。3. 检查结果。 | healthStatus → healthy | 截图 | **not_run** (no real runtime) |
| SM-10 | Hash mismatch failure (篡改模型) | [R] | 1. 修改 managed_root 中 plugin 文件。2. 点击 Health Check。3. 检查结果。 | `hash_verification_failed`，脱敏错误信息 | 截图 + 日志 | **not_run** (no real runtime) |
| SM-11 | Signature mismatch (篡改 catalog) | [-] | 1. 修改 catalog 签名文件。2. 尝试 register。3. 检查结果。 | `catalog_signature_invalid` 错误 | 截图 + 日志 | **not_run** |
| SM-12 | Failed plugin enable 前需 health check | [-] | 1. Plugin health check 失败。2. 尝试 Enable。3. 观察结果。 | enablePlugin 拒绝，UI 显示错误 | 截图 | **not_run** |
| SM-13 | UI 不泄露敏感信息 | [-] | 1. 各种操作后。2. Inspect DOM / 检查渲染内容。 | 无 path/hash/token/contentToken/fullHash 明文 | DOM inspect + grep | **not_run** |

---

## 4. Magika Runtime / detectFull Manual Smoke (P4-B scope)

### 执行环境要求
- Electron app 启动
- 可选：Magika managed plugin 已安装 (R标记的项)

| ID | 场景 | 需求 | 操作步骤 | 预期结果 | 证据 | 状态 |
|----|------|------|---------|---------|------|------|
| SM-14 | Magika 未安装时 detectFull 不调用 Magika | [-] | 1. 不安装 Magika plugin。2. 上传任意文件。3. 触发 detectFull。4. 检查 evidence。 | detectFull 正常返回，无 Magika evidence | 日志 + API 响应 | **not_run** |
| SM-15 | Magika 安装 + healthy 后 detectFull 含 Magika evidence | [R] | 1. Install & enable Magika。2. 确保 health=healthy。3. 上传文件，触发 detectFull。4. 检查 evidence。 | evidence 含 Magika label/score/versionInfo | 日志 + API 响应 | **not_run** (no real runtime) |
| SM-16 | detectBasic 始终不含 Magika evidence | [R] | 1. Magika 已安装且 healthy。2. 触发 detectBasic。3. 检查 evidence。 | detectBasic 仅 magic/text/container，无 Magika | 日志 + API 响应 | **not_run** (no real runtime) |
| SM-17 | 伪装文件 Magika 正确识别 | [R] | 1. 上传伪装文件（扩展名与内容冲突，如 .pdf 实际为 .exe）。2. 触发 detectFull。3. 检查 Magika evidence。 | Magika evidence 反映真实内容类型 | 日志 + API 响应 | **not_run** (no real runtime) |
| SM-18 | Magika unknown label → confidence=low | [R] | 1. 上传 Magika 无法识别的文件（如高度混淆或损坏文件）。2. 触发 detectFull。3. 检查 evidence。 | detectedFormatId='unknown', confidence='low' | 日志 + API 响应 | **not_run** (no real runtime) |
| SM-19 | modelVersion 变化后 healthStatus=degraded | [R] | 1. Magika 已安装，记录当前 modelVersion。2. 修改 managed_root 中 model 文件。3. Health Check。4. 检查状态。 | stale reason `magika_model_version_changed` | 截图 + 日志 | **not_run** (no real runtime) |
| SM-20 | Magika disabled 后 detectFull fallback | [-] | 1. Magika 已 installed 但 disabled。2. 触发 detectFull。3. 检查 evidence。 | 无 Magika evidence，Core Detector 正常 | 日志 + API 响应 | **not_run** |
| SM-21 | Magika classify timeout | [R] | 1. Magika 已 healthy。2. 提交超大文件或模拟 timeout。3. 检查 evidence。 | evidence=null, runtime_error, Core 不阻断 | 日志 + API 响应 | **not_run** (no real runtime) |
| SM-22 | 输入超 10MB → input_too_large | [R] | 1. Magika 已 healthy。2. 上传 >10MB 文件。3. 检查 evidence。 | Magika classify 跳过，evidence=null | 日志 + API 响应 | **not_run** (no real runtime) |

---

## 5. External Conversion Contracts Manual Smoke (P4-C scope)

### 执行环境要求
- Electron app 启动

| ID | 场景 | 需求 | 操作步骤 | 预期结果 | 证据 | 状态 |
|----|------|------|---------|---------|------|------|
| SM-23 | 无任何引擎安装时上传 docx | [-] | 1. 不安装任何引擎。2. 上传 docx 文件。3. 检查 sendRouteMapping candidate。 | `extracted_text` route blocked（engine unavailable） | 日志 + API 响应 | **not_run** |
| SM-24 | 所有引擎 disabled → documentConversion blocked | [-] | 1. 安装但 disable 全部 external engines。2. 上传 docx。3. 检查候选 route。 | 对应 route grey out / 不出现 | 截图 + 日志 | **not_run** |
| SM-25 | Engine re-enabled 后 candidate 实时刷新 | [-] | 1. Re-enable engine。2. 再上传 docx。3. 检查 route candidate。 | route 恢复 available | 截图 + 日志 | **not_run** |
| SM-26 | Executable file 始终 blocked | [-] | 1. 所有引擎 available。2. 上传 .exe 文件。3. 检查 route。 | static policy blocks executable format | 日志 | **not_run** |
| SM-27 | 日志不泄露绝对路径/contentToken/fullHash | [-] | 1. 执行上述操作。2. 检查所有日志输出。 | grep 扫描无匹配 | grep 结果 | **not_run** |

---

## 6. Plugin Lifecycle Manual Smoke (Cross P4-A/B/C scope)

### 执行环境要求
- Electron app 启动
- [R] 项需 real runtime 已安装

| ID | 场景 | 需求 | 操作步骤 | 预期结果 | 证据 | 状态 |
|----|------|------|---------|---------|------|------|
| SM-28 | Starverse 启动（无插件） | [E] | 1. 清空插件 registry。2. 启动 Starverse。3. 检查启动日志。 | 正常启动，无错误 | 日志 | **not_run** (no Electron) |
| SM-29 | 安装多个引擎 (Magika + Tika + LO + ffprobe + Pandoc) | [R] | 1. 依次 register 5 个引擎 plugin。2. 检查 Settings plugin 列表。 | 独立列表显示，互不影响 | 截图 | **not_run** (no real runtime) |
| SM-30 | Enable → Disable → Enable 循环 | [R] | 1. 快速切换 Enable/Disable 3 次。2. 检查最终状态。 | 状态正确，无状态错乱或 race condition | 截图 + 日志 | **not_run** (no real runtime) |
| SM-31 | Uninstall → Re-register | [R] | 1. Uninstall plugin。2. 重新 register 同一 plugin。3. 检查 registry。 | registry 记录正确，无残留 | 日志 | **not_run** (no real runtime) |
| SM-32 | 不同引擎 independent health status | [R] | 1. 安装 2 个引擎。2. 损坏其中一个。3. 分别 health check。 | 一个 unhealthy 不影响另一个 | 截图 | **not_run** (no real runtime) |
| SM-33 | Health check command not found | [R] | 1. Plugin 指定不存在的 executable。2. 点击 Health Check。3. 检查结果。 | engine_unavailable，不崩溃 | 截图 + 日志 | **not_run** (no real runtime) |

---

## 7. Electron UI Manual Smoke (Cross P4-A/B/C scope)

### 执行环境要求
- **Complete Electron environment** (mandatory for ALL items)

| ID | 场景 | 需求 | 操作步骤 | 预期结果 | 证据 | 状态 |
|----|------|------|---------|---------|------|------|
| EUI-1 | 无 trusted root 时 Settings 显示 amber 警告条 | [E] | 1. 不配置 SV_OFFICIAL_PLUGIN_TRUSTED_ROOTS。2. 打开 Settings。 | "官方插件信任根未配置，官方插件列表暂不可用" amber 条 | 截图 | **not_run** (no Electron) |
| EUI-2 | 配置 official trusted root 后 Settings 列表正常 | [E, P] | 1. 配置 production trusted root。2. 打开 Settings。 | 插件列表正常显示 | 截图 | **not_run** (no Electron, no Prod key) |
| EUI-3 | Register with managed_root in Electron | [E, R] | 1. 准备 managed_root plugin。2. Register。3. 检查 UI。 | installState → installed，列表中显示 | 截图 + 日志 | **not_run** |
| EUI-4 | Enable / Disable / Uninstall 按钮操作 | [E, R] | 1. Register plugin。2. 依次操作 Enable/Disable/Uninstall 按钮。3. 观察 UI。 | 状态正确切换，无 UI 卡顿或渲染错误 | 截图 | **not_run** |
| EUI-5 | Health Check 按钮操作 | [E, R] | 1. Plugin 已 installed。2. 点击 Health Check 按钮。3. 观察 UI 更新。 | healthStatus 正确更新，loading 状态正确 | 截图 | **not_run** |
| EUI-6 | 篡改模型后 Health Check → hash_mismatch | [E, R] | 1. 修改 managed_root 插件文件。2. 点击 Health Check。3. 检查 UI。 | 显示脱敏错误信息，不泄露文件内容或路径 | 截图 + DOM | **not_run** |
| EUI-7 | EnginePluginSettingsPanel 不泄露敏感字段 | [E] | 1. 安装多个 plugin。2. Inspect DOM。3. grep 敏感字段。 | DOM 中无 installRef/manifestHash/packageSha256 明文 | DOM dump + grep | **not_run** |
| EUI-8 | 多次快速 Register → Unregister | [E, R] | 1. 快速连续操作 Register→Unregister 5 次。2. 检查最终状态和日志。 | 无 race condition 错误，registry 状态一致 | 日志 | **not_run** |
| EUI-9 | 窗口关闭后重启 → registry 记录持久化 | [E] | 1. Register 2 个 plugin。2. 关闭 Starverse。3. 重新启动。4. 检查 plugin 列表。 | 状态不丢失，installState/enabled 正确恢复 | 截图（对比） | **not_run** |
| EUI-10 | 开发模式下 trusted root source 切换 | [E] | 1. 配置 SV_ENGINE_PLUGIN_DEV_MODE=1。2. 切换 test_root→managed_root。3. 检查插件 source。 | test_root / managed_root 语义正确切换 | 截图 | **not_run** |

---

## 8. Summary

| 域 | 项目数 | pass | fail | blocked | not_run | N/A |
|----|--------|------|------|---------|---------|-----|
| Settings UI (SM-1~SM-13) | 13 | 0 | 0 | 0 | 13 | 0 |
| Magika (SM-14~SM-22) | 9 | 0 | 0 | 0 | 9 | 0 |
| External Conversion (SM-23~SM-27) | 5 | 0 | 0 | 0 | 5 | 0 |
| Plugin Lifecycle (SM-28~SM-33) | 6 | 0 | 0 | 0 | 6 | 0 |
| Electron UI (EUI-1~EUI-10) | 10 | 0 | 0 | 0 | 10 | 0 |
| **Total** | **43** | **0** | **0** | **0** | **43** | **0** |

### 8.1 not_run 原因

| 原因 | 影响项 | 计数 |
|------|--------|------|
| 无 Electron 运行环境 | 全部 43 项 | 43 |
| 无 real runtime 安装 (Magika/Tika/LO/ffprobe/Pandoc) | SM-9, SM-10, SM-15~SM-19, SM-21, SM-22, SM-29~SM-33, EUI-3~EUI-6, EUI-8 | 23 |
| 无 production trusted root 密钥 | EUI-2 | 1 |

### 8.2 Phase 4 Closeout Blockers from Smoke

以下烟测项如 fail 将构成 closeout blocker：

| 项 | 如果 fail 意味着 | 当前状态 |
|----|------------------|---------|
| EUI-1 | Settings UI 无法正确处理缺失 trusted root | not_run |
| EUI-3 | managed_root registration 在 Electron 不工作 | not_run |
| EUI-7 | UI 泄露敏感数据 | not_run |
| EUI-9 | registry 持久化失败 | not_run |
| SM-13 | UI 写入敏感信息到 DOM | not_run |

**结论**: 所有烟测项均 not_run，在无 Electron + real runtime 环境下无法执行。P4-D closeout 不依赖烟测全量通过（已在 P4-A/B/C 各自 closeout 中验证过自动化测试），但未执行的烟测构成 Phase 4 已知风险。

---

## 9. Evidence Collection Template

如将来执行手工烟测，请使用以下模板记录证据：

```
ID: SM-xx / EUI-xx
Date: YYYY-MM-DD
Tester: [name]
Environment: Starverse version [x.y.z], Electron [version], OS [windows/macos/linux]
Preconditions: [如实记录]
Actions: [步骤序列]
Expected: [预期]
Actual: [实际]
Evidence: [截图路径 / 日志摘录 / DOM dump]
Status: pass / fail / blocked
Notes: [额外观察]
```

---

## 10. P4-D3 Entry Criteria

| # | 条件 | 状态 |
|---|------|------|
| EC-1 | Manual smoke checklist 编制完成 | ✓ |
| EC-2 | 每项烟测含 ID、步骤、预期、证据要求 | ✓ |
| EC-3 | not_run 项有明确原因 | ✓ |
| EC-4 | closeout blocker 烟测已识别 | ✓ |
| EC-5 | evidence collection 模板已提供 | ✓ |
| EC-6 | 无真实烟测已执行（未宣称已完成） | ✓ |
| EC-7 | P4-D1 ledger 已提交 | ✓ |

**结论**: P4-D2 完成，满足 P4-D3 entry criteria。

---

## 11. 禁止与约束

- 不执行手工烟测（当前环境无法执行）
- 不写已执行烟测或烟测已通过
- 不安装 real runtime
- 不修改生产代码
- 不写 Phase 4 completed

---

## 12. Commit

- **文件**: `37-p4d2-manual-smoke-execution-package.md` (new)
- **READNE**: 索引 + 状态更新
- **commit message**: `docs: add p4d2 manual smoke execution package`
