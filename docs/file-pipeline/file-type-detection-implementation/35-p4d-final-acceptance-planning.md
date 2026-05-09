# P4-D: Phase 4 Final Acceptance Planning

Status: **P4-D planning in progress — not implementation completed**

## 1. P4-D 阶段定位

P4-D 是 Phase 4 的第四个（最终）任务包，目标是：

1. 整理 Phase 4 全阶段状态（P4-A / P4-B / P4-C）。
2. 建立 Phase 4 final acceptance matrix。
3. 建立完整手工烟测矩阵、自动化回归矩阵、禁止项扫描矩阵。
4. 登记 P4-A / P4-B / P4-C 所有 follow-ups 并分类。
5. 明确阻断 Phase 4 closeout 的 follow-up 与可延期到 Phase 5 的 follow-up。
6. 明确 provider_file_ref / legacy message_asset / 真实 runtime packaging / Electron UI 烟测等后续阶段边界。
7. 建立 P4-D implementation 子任务包建议与 P4-D closeout 准入条件。
8. 明确 Phase 5 handoff 候选项。

**P4-D 当前仅为 planning。不执行手工烟测，不修 baseline issues，不改生产代码。**

P4-D 不代表 Phase 4 completed。

---

## 2. Phase 4 当前状态总览

| 子阶段 | 状态 | Closeout 文档 | 关键交付 |
|--------|------|--------------|---------|
| **P4-A** | completed | `20-p4a-official-plugin-marketplace-closeout.md` | 官方限定插件市场最小闭环、trusted roots 注入、lifecycle service/client 测试补强、settings UI（`EnginePluginSettingsPanel.vue`） |
| **P4-B** | completed with follow-ups | `26-p4b-magika-official-managed-plugin-closeout.md` | Magika official managed plugin package spec、managed root registration、classify runner contract (fake)、detectFull integration、gated real-runtime test scaffold |
| **P4-C** | completed with follow-ups; Gemini CLI external audit passed | `34-p4c-external-conversion-engines-closeout.md` | Tika/LibreOffice/ffprobe/Pandoc fake runner contracts + route mapping candidate integration |
| **P4-D** | planning in progress | 本文档 | final acceptance matrix、手工烟测矩阵、follow-up 分类、implementation 子任务包规划 |

**Phase 4 整体状态：P4-A / P4-B / P4-C 已完成（各含 follow-ups），P4-D planning 进行中，P4-D implementation 待启动。**

**Phase 4 NOT completed.**

---

## 3. P4-A Acceptance Summary

### 3.1 已完成交付

| 交付项 | 状态 |
|--------|------|
| official plugin catalog/signature/hash 模块 (`pluginCatalog.ts`, `pluginCatalogSignature.ts`) | completed |
| 插件 registry DB schema + repo (`enginePluginRegistryRepo.ts`) | completed |
| 插件 lifecycle service + IPC/client (`enginePluginLifecycleService.ts`) | completed |
| 受控 trusted roots 注入 + 失败闭锁 (`officialPluginTrustedRoots.ts`) | completed |
| lifecycle service / client DTO 测试补强 | completed |
| Settings UI 最小闭环 (`EnginePluginSettingsPanel.vue`) | completed |

### 3.2 验收矩阵

| 验收项 | 状态 |
|--------|------|
| catalog Ed25519 签名验证 | Pass |
| catalog entry hash 验证 (manifestSha256 + packageSha256) | Pass |
| registry insert/upsert/list/enable/disable/markFailed/markUninstalled/updateHealth | Pass |
| installRef 验证 (拒绝空/NUL/UNC/绝对路径/traversal) | Pass |
| IPC DTO 不含 installRef/manifestHash/packageSha256/contentToken/fullHash | Pass |
| trusted roots 空配置 → `official_trusted_root_unconfigured` | Pass |
| 测试环境自动注入 test trusted root | Pass |
| Settings UI 展示 pluginId/version/installState/healthStatus/脱敏 failureReason | Pass |
| Settings UI 不显示真实路径/hash/token | Pass |

### 3.3 禁止项扫描

| 扫描项 | 结果 |
|--------|------|
| provider_file_ref / providerFileRef | 未引入 |
| contentToken 泄露 | 已验证排除 |
| fullHash 泄露 | 已验证排除 |
| third-party / custom marketplace | 未引入 |
| magika / @tensorflow/tfjs in package.json | 已验证排除 |
| Phase 4 completed 措辞 | 未写入 |

---

## 4. P4-B Acceptance Summary

### 4.1 已完成交付

| 子包 | 交付 | Commit |
|------|------|--------|
| P4-B1 | Magika package specification + trusted root / catalog distribution hardening | `47e29e7` |
| P4-B2 | Managed root / official pre-staged package registration replacement | `ce39ca1` |
| P4-B3 | Magika classify runner contract + fake runtime tests | `1baace1` |
| P4-B4 | detectFull integration + gated real-runtime test scaffold | `a87ed3d` |
| P4-B5 | Closeout and manual smoke checklist | `a480eed` |

### 4.2 验收矩阵

| 验收项 | 状态 |
|--------|------|
| MagikaPackageLayoutSpec 定义 + validateMagikaPackageLayout() | Pass |
| managed_root / test_root 语义切换 (UI + 服务端) | Pass |
| classify runner (fake, 受控 spawn, 10MB 上限) | Pass |
| detectFull 接入 Magika runtime probe | Pass |
| detectBasic 始终不调用 Magika (代码+测试) | Pass |
| modelVersion 写入 versionInfo.magikaModelVersion | Pass |
| modelVersion 变化 → magika_model_version_changed stale | Pass |
| Magika evidence 评分不覆盖 strong magic / containerProbe | Pass |
| gated real-runtime test scaffold (CI skip) | Pass |
| 未新增 magika/@tensorflow/tfjs 到 Starverse 主包 | Pass |
| 未修改 package.json / package-lock.json | Pass |
| 未提交真实 Magika 模型文件 / runtime 包 / private key | Pass |

### 4.3 禁止项扫描

| 扫描项 | 结果 |
|--------|------|
| provider_file_ref 新增引入 | 未引入 |
| contentToken/fullHash in logs | 无匹配 |
| 真实绝对路径 in console | 无匹配 |
| third-party / custom marketplace / marketplaceUrl / trustedRootUrl | 未引入 |
| magika / @tensorflow/tfjs in package.json | 无匹配 |
| Phase 4 completed 措辞 | 未写入 |
| shell:true in 生产代码 | 仅在测试（显式拒绝） |

### 4.4 测试覆盖率

P4-B 累计 **150 tests** 跨 13 个测试文件。

---

## 5. P4-C Acceptance Summary

### 5.1 已完成交付

| 子包 | 交付 | Commit |
|------|------|--------|
| P4-C1 | conversion engine manifest/package spec extension | `c373574` |
| P4-C2 | Tika fake runner contract | `4ab30cd` + `d505099` |
| P4-C3 | LibreOffice conversion contract | `e3fc7c9` |
| P4-C4 | ffprobe metadata probe contract | `dfe7826` |
| P4-C5 | Pandoc document conversion contract | `57ec385` |
| P4-C6 | route mapping / conversion candidate integration | `d251846` |
| P4-C7 | Closeout | `c6cc4b0` |

### 5.2 验收矩阵

| 验收项 | 状态 |
|--------|------|
| Tika runner: detect / extract_text / metadata / combined (23 tests) | Pass |
| LibreOffice runner: pdf / text / html / markdown conversion (23 tests) | Pass |
| ffprobe runner: video/audio metadata probe (20 tests) | Pass |
| Pandoc runner: markdown / plain / html conversion (18 tests) | Pass |
| sendRouteMapping engine gate integration (11 new tests) | Pass |
| externalEngineAvailability test (3 tests) | Pass |
| externalProcessPolicy test (12 tests) | Pass |
| TS noEmit: 17 pre-existing, 0 new | Pass |
| lint:changed clean | Pass |
| db:verify 13/13 pass | Pass |
| 未提交真实 Tika JAR / LibreOffice binary / ffprobe binary / Pandoc binary | Pass |
| 未新增 package.json / package-lock.json 依赖 | Pass |
| 未修改 sendPlanService / derivativeJobService / appChatApp.logic.ts / OpenRouter | Pass |
| 未引入 provider_file_ref | Pass |

### 5.3 禁止项扫描

| 扫描项 | 结果 |
|--------|------|
| provider_file_ref in source (non-docs) | 0 hits |
| contentToken in new files | 0 hits |
| fullHash in new files | 0 hits |
| Phase 4 completed / improper claims in new docs | 0 hits |
| New deps in package.json | 0 hits |

---

## 6. P4-A Follow-ups

| # | Follow-up | 优先级 | 来源 |
|---|-----------|--------|------|
| A-1 | Production official trusted root 密钥对由 Owner 离线生成，公钥通过 `SV_OFFICIAL_PLUGIN_TRUSTED_ROOTS` 注入 | **closeout blocker** | P4-A closeout §7.1 |
| A-2 | Production catalog file 预置路径与分发机制（随 Electron 打包到 resources） | **closeout blocker** | P4-A closeout §7.3 |
| A-3 | Production package 预置路径（`managed_root/engine-plugins/`）于安装包构建脚本 | **closeout blocker** | P4-A closeout §7.3 |
| A-4 | Complete Electron 手工烟测（Settings UI / managed_root / 真实插件交互） | **closeout blocker** | P4-A closeout §7.2 |
| A-5 | Settings UI 的 `test_root` → `managed_root` 语义已在 P4-B2 完成 | **resolved** | P4-A follow-up #3 |
| A-6 | Health check fixture 依赖真实插件文件存在 | **P1** (non-blocking) | P4-A closeout §7.4 |
| A-7 | Lifecycle service 测试覆盖率有限，主要覆盖 Magika 场景，其他引擎类型需后续扩展 | **P2** (non-blocking) | P4-A closeout §7.5 |

---

## 7. P4-B Follow-ups

| # | Follow-up | 优先级 | 来源 |
|---|-----------|--------|------|
| B-1 | Production signing workflow must be confirmed by Owner | **closeout blocker** | P4-B closeout §8.1 |
| B-2 | Production trusted root / official catalog signing key remains Owner-controlled | **closeout blocker** | P4-B closeout §8.2 |
| B-3 | Real Magika model file not committed — 需 Owner 在 P4-D / 生产发布前提供预置包 | **closeout blocker** | P4-B closeout §8.1 |
| B-4 | magika / tfjs 未入主包依赖 — 真实 runtime 需在 Electron 打包时以独立 bundle 分发 | **closeout blocker** | P4-B closeout §8.2 |
| B-5 | Real catalog 未生成 — 当前使用测试签名密钥，生产 catalog 需 Owner 离线签名 | **closeout blocker** | P4-B closeout §8.6 |
| B-6 | Electron manual smoke test for Settings UI and managed_root not executed | **closeout blocker** | P4-B closeout §8.4 |
| B-7 | Real-runtime tests 默认 gated / CI skip — 仅在有人工干预的 dev 环境下执行 | **P1** (non-blocking) | P4-B closeout §8.3 |

---

## 8. P4-C Follow-ups

| # | Follow-up | 优先级 | 来源 |
|---|-----------|--------|------|
| C-1 | 真实 Tika / LibreOffice / ffprobe / Pandoc runtime 未提交 | **closeout blocker** | P4-C closeout §9.1 |
| C-2 | 真实 Tika / LibreOffice / ffprobe / Pandoc runtime packaging 与签名 | **closeout blocker** | P4-C closeout §9.1 |
| C-3 | `converted_pdf` route 已定义 gate 但未进入具体 format route list | **P1** (non-blocking) | P4-C2 safety patch (d505099) |
| C-4 | Real Tika / LibreOffice / ffprobe / Pandoc runtime execution 未验证 | **P1** (non-blocking) | P4-C follow-up |
| C-5 | Macro scanning in production context 未验证 | **P1** (non-blocking) | P4-C follow-up |
| C-6 | Lua filter policy in production context 未验证 | **P1** (non-blocking) | P4-C follow-up |
| C-7 | Active content blocking 需要真实 runtime / Electron 手工烟测验证 | **P1** (non-blocking) | P4-C follow-up |
| C-8 | 17 pre-existing TS errors（与 P4-C 无关） | **P2** (non-blocking) | Baseline |
| C-9 | derivativeJobService HTML targetKind pre-existing test failure（与 P4-C 无关） | **P2** (non-blocking) | Baseline |
| C-10 | ffprobe selected_frames / audio extraction 真实管线（仅 contract defined，未实现） | **P1** (non-blocking) | P4-C closeout §9.5 |

---

## 9. Blocking vs Non-Blocking Follow-up 分类

### 9.1 Phase 4 Closeout Blockers（必须完成或明确 Owner 裁决）

> 以下为 Phase 4 final closeout 阻断项。它们不代表当前 P4-A/B/C code commits 存在 P0 defects；它们是需要 Owner 决策或后续阶段配合才可收口的未完成交付物。

| ID | Follow-up | 当前处置 |
|----|-----------|---------|
| A-1 | Production trusted root 密钥对 + 公钥注入 | Owner 离线生成 → `SV_OFFICIAL_PLUGIN_TRUSTED_ROOTS` |
| A-2 | Production catalog 文件预置路径 | Electron 打包脚本（非本阶段） |
| A-3 | Production package 预置路径 | Electron 打包脚本（非本阶段） |
| B-1 | Production signing workflow Owner 确认 | Owner decision |
| B-2 | Official catalog signing key Owner-controlled | Owner decision |
| B-3 | Real Magika model file pre-staged 包 | Owner provides pre-built package |
| B-4 | Magika / tfjs 独立 bundle 分发 | Electron 打包配置（非本阶段） |
| B-5 | Real catalog 生成 + Owner 离线签名 | Owner decision |
| C-1 | 真实 Tika/LibreOffice/ffprobe/Pandoc runtime 未提交 | 延期到 Phase 5 |
| C-2 | Real runtime packaging 与签名 | 延期到 Phase 5 |

### 9.2 Non-Blocking (P1/P2 — 可延期到 Phase 5 或后续)

| ID | Follow-up | 建议处置 |
|----|-----------|---------|
| A-4 | Electron 手工烟测 | P4-D2 执行 |
| A-6 | Health check fixture 依赖真实插件 | 随真实 runtime 接入解决 |
| B-6 | Electron manual smoke test | P4-D2 执行 |
| B-7 | Real-runtime tests gated | 保持 CI skip 直到真实 runtime 接入 |
| C-3 | `converted_pdf` route 进入 format route list | Phase 5 / UI-Job follow-up |
| C-4 | Real runtime execution 验证 | Phase 5 |
| C-5 | Macro scanning 验证 | Phase 5 |
| C-6 | Lua filter policy 验证 | Phase 5 |
| C-7 | Active content blocking 验证 | Phase 5 |
| C-8 | 17 pre-existing TS errors | 非 P4 引入，不阻断 closeout |
| C-9 | derivativeJobService test failure | 非 P4 引入，不阻断 closeout |

### 9.3 分类结论

- **阻断 Phase 4 closeout 的项**：A-1~A-3、B-1~B-5（均属于 production trusted root / signing / real model / catalog 范畴）。这些项的裁决权在 Owner，P4-D planning 登记但不代为决定。
- **不阻断但需在 P4-D implementation 中处理的项**：A-4、B-6（手工烟测）→ P4-D2。
- **可延期到 Phase 5 的项**：C-1~C-7（真实 runtime execution / packaging / 验证）→ Phase 5 handoff。
- **Known baseline — 不阻断**：C-8、C-9。

---

## 10. Phase 4 Final Acceptance Matrix

### 10.1 核心能力完整性

| 能力 | P4-A | P4-B | P4-C | Phase 4 综合 |
|------|------|------|------|-------------|
| 官方插件 marketplace / catalog / signature | ✓ | — | — | ✓ |
| 插件 registry (DB schema + repo) | ✓ | — | — | ✓ |
| 插件 lifecycle (install/enable/disable/uninstall/health check) | ✓ | — | — | ✓ |
| Trusted roots 注入与失败闭锁 | ✓ | — | — | ✓ |
| Settings UI (EnginePluginSettingsPanel) | ✓ | — | — | ✓ |
| Magika managed plugin package spec | — | ✓ | — | ✓ |
| managed_root / test_root 语义切换 | — | ✓ | — | ✓ |
| Magika classify runner (fake) | — | ✓ | — | ✓ |
| detectFull Magika integration + modelVersion | — | ✓ | — | ✓ |
| Gated real-runtime test scaffold | — | ✓ | — | ✓ |
| Tika runner contract (fake) | — | — | ✓ | ✓ |
| LibreOffice runner contract (fake) | — | — | ✓ | ✓ |
| ffprobe runner contract (fake) | — | — | ✓ | ✓ |
| Pandoc runner contract (fake) | — | — | ✓ | ✓ |
| Route mapping / engine gate integration | — | — | ✓ | ✓ |
| 真实 Tika/LibreOffice/ffprobe/Pandoc runtime | — | — | ✗ | ✗ |
| Real Magika model file in repo | — | ✗ | — | ✗ |
| Production trusted root / signing | ✗ | ✗ | — | ✗ |
| 真实 catalog + Owner-signing | ✗ | ✗ | — | ✗ |
| provider_file_ref | ✗ | ✗ | ✗ | ✗ |
| legacy message_asset destructive cleanup | ✗ | ✗ | ✗ | ✗ |
| 第三方插件生态 | ✗ | ✗ | ✗ | ✗ |

### 10.2 安全/隐私完整性

| 检查项 | 状态 |
|--------|------|
| shell:false 硬编码 | ✓ (P3-A inherited) |
| 脚本解释器阻断 (.bat/.cmd) | ✓ (P3-A inherited) |
| 路径脱敏 (sanitizeForProcessResult) | ✓ (P3-A inherited) |
| contentToken/fullHash 脱敏 | ✓ |
| IPC DTO 不含 installRef/manifestHash/packageSha256/contentToken/fullHash | ✓ |
| UI 不显示真实绝对路径 | ✓ |
| renderer 不直接访问文件路径 | ✓ |
| 无 private key 提交 | ✓ |
| 无联网下载模型/runtime | ✓ |
| 无 custom marketplace URL / trustedRootUrl | ✓ |

### 10.3 测试完整性

> 以下测试数量为 P4-A/B/C 各自 scoped runs 累计上报值。P4-D1 必须执行最终全量验证矩阵以确认当前基线。

| 测试域 | 测试数 | 状态 |
|--------|--------|------|
| P4-A lifecycle + client + trusted roots | 73+ | Pass (P4-A scoped run) |
| P4-B Magika managed plugin + classify + detectFull | 150 | Pass (P4-B scoped run) |
| P4-C conversion runners (Tika/LO/ffprobe/Pandoc) + route mapping | 120 | Pass (P4-C scoped run) |
| External process safety (P3-A) | 12 | Pass (P3-A scoped run) |
| Engine availability | 3 | Pass (P4-C scoped run) |
| **Total (cumulative)** | **358+** | **P4-D1 re-verify required** |

### 10.4 TS / Lint / DB 基线

| 检查项 | 结果 |
|--------|------|
| npx tsc --noEmit | 17 pre-existing, 0 new |
| npm run lint:changed | clean |
| npm run db:verify | 13/13 pass |
| git diff --check | clean |

---

## 11. 自动化回归矩阵

以下测试套件应在每次 P4-D implementation 子任务完成后执行：

```bash
# Core file-type 回归
npx vitest --run src/next/file-type/tikaRunner.test.ts
npx vitest --run src/next/file-type/libreOfficeRunner.test.ts
npx vitest --run src/next/file-type/ffprobeRunner.test.ts
npx vitest --run src/next/file-type/pandocRunner.test.ts
npx vitest --run src/next/file-type/magikaClassifyRunner.test.ts
npx vitest --run src/next/file-type/magikaManagedPlugin.test.ts
npx vitest --run src/next/file-type/magikaRuntimeLoader.test.ts
npx vitest --run src/next/file-type/magikaAdapter.test.ts
npx vitest --run src/next/file-type/pluginCatalog.test.ts
npx vitest --run src/next/file-type/officialPluginTrustedRoots.test.ts
npx vitest --run src/next/file-type/externalProcessRunner.test.ts
npx vitest --run src/next/file-type/externalProcessPolicy.test.ts
npx vitest --run src/next/file-type/externalEngineAvailability.test.ts
npx vitest --run src/next/file-type/sendRouteMapping.test.ts
npx vitest --run src/next/file-type/fileTypeDetectionService.test.ts
npx vitest --run src/next/file-type/evidenceMerge.test.ts

# Plugin lifecycle 回归
npx vitest --run infra/files/enginePluginLifecycleService.test.ts
npx vitest --run infra/db/repo/enginePluginRegistryRepo.test.ts

# IPC / client 回归
npx vitest --run src/next/files/enginePluginLifecycleClient.test.ts

# UI 组件测试
npx vitest --run src/ui-app/components/EnginePluginSettingsPanel.test.ts

# 全量 (CI gate)
npx vitest --run --reporter verbose
```

---

## 12. 手工烟测矩阵

### 12.1 Grid Key

| 标记 | 含义 |
|------|------|
| [E] | 需 Electron 环境 |
| [R] | 需真实 runtime 已安装 |
| [P] | 需 production trusted root 配置 |
| [-] | 无特殊要求 |

### 12.2 Settings UI 手工烟测矩阵 (P4-A scope)

| # | 场景 | 需求 | 预期 |
|---|------|------|------|
| SM-1 | 无 trusted root 时 UI 显示明确不可用状态 | [-] | 显示 amber 提示条 "官方插件信任根未配置" |
| SM-2 | 有 test trusted root 时 list official plugins | [-] | 插件列表正常显示 |
| SM-3 | Register local official plugin (test_root) | [-] | installState → installed |
| SM-4 | Register local official plugin (managed_root) | [-] | installState → installed |
| SM-5 | test_root in official source → rejected | [-] | `install_root_kind_mismatch` |
| SM-6 | Enable plugin | [-] | enabled = true, 状态按钮正确切换 |
| SM-7 | Disable plugin | [-] | enabled = false, 状态按钮正确切换 |
| SM-8 | Uninstall plugin | [-] | installState → uninstalled |
| SM-9 | Health check 正常 | [R] | healthStatus → healthy |
| SM-10 | Hash mismatch failure (篡改模型) | [R] | `hash_verification_failed` |
| SM-11 | Signature mismatch (篡改 catalog) | [-] | `catalog_signature_invalid` |
| SM-12 | Failed plugin enable 前需 health check | [-] | enablePlugin 拒绝 |
| SM-13 | UI 不显示真实路径/hash/token/contentToken/fullHash | [-] | 无敏感信息泄露 |

### 12.3 Magika Runtime / detectFull 手工烟测矩阵 (P4-B scope)

| # | 场景 | 需求 | 预期 |
|---|------|------|------|
| SM-14 | Magika 未安装时 detectFull 不调用 Magika | [-] | detectFull 正常，无 Magika evidence |
| SM-15 | Magika 安装 + healthy 后 detectFull 含 Magika evidence | [R] | evidence 含 Magika label/score/versionInfo |
| SM-16 | detectBasic 始终不含 Magika evidence | [R] | detectBasic 仅 magic/text/container |
| SM-17 | 伪装文件（扩展名与内容冲突）Magika 正确识别 | [R] | Magika evidence 反映真实内容 |
| SM-18 | Magika unknown label → confidence=low | [R] | detectedFormatId='unknown', confidence='low' |
| SM-19 | modelVersion 变化后 healthStatus=degraded | [R] | stale reason `magika_model_version_changed` |
| SM-20 | Magika disabled 后 detectFull fallback | [-] | 无 Magika evidence，Core Detector 正常 |
| SM-21 | Magika classify timeout | [R] | evidence=null, runtime_error, Core 不阻断 |
| SM-22 | 输入超 10MB → input_too_large | [R] | Magika classify 跳过，evidence=null |

### 12.4 External Conversion Contracts 手工烟测矩阵 (P4-C scope)

| # | 场景 | 需求 | 预期 |
|---|------|------|------|
| SM-23 | 无任何引擎安装时上传 docx | [-] | `extracted_text` route blocked (engine unavailable) |
| SM-24 | 所有引擎 disabled → documentConversion blocked | [-] | 对应 route grey out |
| SM-25 | Engine re-enabled 后 candidate 实时刷新 | [-] | route 恢复 available |
| SM-26 | Executable file 始终 blocked (引擎全 available) | [-] | static policy blocks executable format |
| SM-27 | 日志不泄露绝对路径/contentToken/fullHash | [-] | grep 扫描无匹配 |

### 12.5 Plugin Lifecycle 手工烟测矩阵 (跨 P4-A/P4-B/P4-C)

| # | 场景 | 需求 | 预期 |
|---|------|------|------|
| SM-28 | Starverse 启动（无插件） | [E] | 正常启动，无错误 |
| SM-29 | 安装多个引擎 (Magika + Tika + LO + ffprobe + Pandoc) | [R] | 独立列表，互不影响 |
| SM-30 | Enable → Disable → Enable 循环 | [R] | 状态正确，无状态错乱 |
| SM-31 | Uninstall → Re-register | [R] | registry 记录正确 |
| SM-32 | 不同引擎 independent health status | [R] | 一个引擎 unhealthy 不影响其他 |
| SM-33 | Health check command not found | [R] | engine_unavailable, 不崩溃 |

---

## 13. Electron UI 手工烟测矩阵

以下烟测必须在完整 Electron 环境中执行（当前仅在自动化测试中验证）：

| # | 场景 | 需求 | 预期 |
|---|------|------|------|
| EUI-1 | 无 trusted root 配置时 Settings 显示 amber 警告条 | [E] | "官方插件信任根未配置，官方插件列表暂不可用" |
| EUI-2 | 配置 official trusted root 后 Settings 列表正常 | [E, P] | 插件列表正常显示 |
| EUI-3 | Register with managed_root in Electron | [E, R] | installState → installed |
| EUI-4 | Enable / Disable / Uninstall 按钮操作 | [E, R] | 状态正确切换，无 UI 卡顿 |
| EUI-5 | Health Check 按钮操作 | [E, R] | healthStatus 正确更新 |
| EUI-6 | 篡改模型后 Health Check → hash_mismatch | [E, R] | 显示脱敏错误信息 |
| EUI-7 | EnginePluginSettingsPanel 不泄露 installRef/manifestHash/packageSha256 | [E] | DOM 中无可疑字段 |
| EUI-8 | 多次快速 Register → Unregister | [E, R] | 无 race condition 错误 |
| EUI-9 | 窗口关闭后重启 → registry 记录持久化 | [E] | 状态不丢失 |
| EUI-10 | 开发模式下 trusted root source 切换 | [E] | test_root / managed_root 语义正确 |

---

## 14. 禁止项扫描矩阵

| # | 禁止项 | 扫描命令 | 当前结果 | P4-D 重验 |
|---|--------|---------|---------|----------|
| FB-1 | `provider_file_ref` in source | `rg -n "provider_file_ref\|providerFileRef" src/ infra/` | 0 hits | 需重验 |
| FB-2 | `contentToken` in logs/UI | `rg -n "contentToken" src/ infra/` (excl. sanitizer files) | 0 hits (sanitizer only) | 需重验 |
| FB-3 | `fullHash` in logs/UI | `rg -n "fullHash" src/ infra/` (excl. sanitizer files) | 0 hits | 需重验 |
| FB-4 | 绝对路径 in console | `rg -n "console\.(log\|warn\|error)" src/next/ infra/` → 人工 | 0 hits | 需重验 |
| FB-5 | `shell: true` in production | `rg -n "shell:\s*true" src/next/ infra/` | 仅测试（显式拒绝） | 需重验 |
| FB-6 | `magika` / `@tensorflow/tfjs` in package.json | `rg -n "magika\|@tensorflow/tfjs\|tika\|libreoffice\|ffprobe\|pandoc" package.json package-lock.json` | 0 hits | 需重验 |
| FB-7 | Phase 4 completed 措辞 | `rg -n "Phase 4 completed\|全项目完成\|完整插件系统已完成"` docs/ | 0 hits | 需重验 |
| FB-8 | Custom marketplace / marketplaceUrl | `rg -n "custom marketplace\|marketplaceUrl\|trustedRootUrl" docs/` | docs-only (as forbidden) | 需重验 |
| FB-9 | 真实 Tika/LibreOffice/ffprobe/Pandoc runtime completed | `rg -n "真实.*已完成" docs/file-type-detection-implementation/` | 0 hits | 需重验 |
| FB-10 | Private key in repo | `rg -n "PRIVATE KEY"` | 0 hits | 需重验 |

---

## 15. Security / Privacy Checklist

| # | 检查项 | 状态 | 备注 |
|---|--------|------|------|
| S-1 | trusted root Ed25519 签名验证 | ✓ | P4-A implemented |
| S-2 | catalog → manifest → integrity 全链路 hash | ✓ | P4-A+P4-B implemented |
| S-3 | shell:false 硬编码 | ✓ | P3-A frozen |
| S-4 | 脚本解释器跳板阻断 | ✓ | P3-A frozen |
| S-5 | timeout + output cap + kill tree | ✓ | P3-A frozen |
| S-6 | 路径脱敏 (sanitizeForProcessResult) | ✓ | P3-A frozen |
| S-7 | contentToken / fullHash 脱敏 | ✓ | P3-A+P4-A verified |
| S-8 | IPC DTO 不含敏感字段 | ✓ | P4-A+P4-B verified |
| S-9 | UI 不暴露真实路径/hash/token | ✓ | P4-A+P4-B verified |
| S-10 | renderer 不直接访问文件路径 | ✓ | 架构约束 |
| S-11 | 无 private key 提交 | ✓ | 逐次审计 |
| S-12 | 无联网下载模型/runtime | ✓ | 全部 pre-staged |
| S-13 | Sandbox copy 输入隔离 | ✓ | P3-A+P4-C 设计 |
| S-14 | Active content blocking (JS/macro/XSLT) | ✗ | 仅设计层 (P4-C §13)，生产验证需真实 runtime |
| S-15 | Conversion output 脱敏 (Tika metadata JSON filter) | ✗ | 仅设计层 (P4-C §15.3)，生产验证需真实 runtime |
| S-16 | Macro scanning / Lua filter policy | ✗ | 仅设计层 (P4-C §13)，生产验证需真实 runtime |
| S-17 | trusted root key rotation 支持 | ✓ | 设计层 (P4-B §6.2#4)，环境变量注入已支持 |
| S-18 | `SV_ENGINE_PLUGIN_DEV_MODE=1` 禁止在生产环境使用（会激活 test trusted root） | ✗ pending | 部署配置审计，需在 deployment docs 中明确禁止 |

---

## 16. Trusted Root / Signing / Production Key Checklist

| # | 检查项 | 状态 | Owner 决策 |
|---|--------|------|-----------|
| TK-1 | Production Ed25519 密钥对生成 | ✗ pending | Owner 离线生成 |
| TK-2 | Public key 通过 `SV_OFFICIAL_PLUGIN_TRUSTED_ROOTS` 注入 | ✗ pending | 部署配置 |
| TK-3 | Private key 安全存储不入 repo | ✓ (no key committed) | N/A |
| TK-4 | Test key 与 production key 隔离 | ✓ | 环境变量分离 |
| TK-5 | Key rotation 机制 (多 keyId 共存) | ✓ (设计层) | N/A |
| TK-6 | Catalog 签名流程 (Owner offline sign) | ✗ pending | Owner 建立签名 pipeline |
| TK-7 | Production catalog 文件生成 | ✗ pending | Owner decision |
| TK-8 | 测试签名密钥仅用于 CI/dev | ✓ | `VITEST`/`NODE_ENV=test`/`DEV_MODE` 门控 |
| TK-9 | 测试签名密钥 fingerprint 登记 | ✓ | `officialPluginTrustedRoots.ts` |
| TK-10 | `SV_ENGINE_PLUGIN_DEV_MODE=1` 禁止在生产环境中设置（否则会激活 test trusted root） | ✗ pending | 部署配置审计 + 文档 |

---

## 17. Real Runtime Packaging Checklist

| # | 检查项 | 状态 | 归属 |
|---|--------|------|------|
| RP-1 | Magika model file pre-staged package | ✗ pending | Phase 5 / Owner |
| RP-2 | Magika runtime bundle (独立于主包) | ✗ pending | Phase 5 / Electron 打包 |
| RP-3 | Tika JAR package (tika-app.jar) | ✗ pending | Phase 5 |
| RP-4 | LibreOffice binary/portable package | ✗ pending | Phase 5 |
| RP-5 | ffprobe/ffmpeg binary package | ✗ pending | Phase 5 |
| RP-6 | Pandoc binary package | ✗ pending | Phase 5 |
| RP-7 | Catalog file 随 Electron resources 打包 | ✗ pending | Phase 5 / Electron 打包脚本 |
| RP-8 | managed_root plugin 目录预置 | ✗ pending | Phase 5 / Electron 打包脚本 |
| RP-9 | 各引擎 NOTICE / LICENSE / ATTRIBUTION 完整 | ✗ pending | Phase 5 |
| RP-10 | 各引擎 integrity hash 随 catalog entry 分发 | ✗ pending | Phase 5 |

---

## 18. provider_file_ref 后续边界

### 18.1 当前状态

`provider_file_ref` 自 Step 0 冻结决策以来保持为 P1/P2 扩展项，**未进入 MVP（Phase 1-3）**，**未进入 Phase 4（P4-A/P4-B/P4-C）**。

### 18.2 当前引用位置

仅在 docs 中作为延期项登记：
- `04-step1-repo-survey-binding-map.md` — 原始绑定地图记录
- `05-owner-decisions-before-step2.md` — Owner 决策：「provider_file_ref 不进入 MVP」
- `09-risk-and-decision-register.md` — 风险登记
- `19-phase4-planning.md` — Phase 4 非目标
- 各 P4-A/P4-B/P4-C closeout 文档 — 禁止项扫描确认未引入

### 18.3 后续边界

| 维度 | 当前裁决 | 后续建议 |
|------|---------|---------|
| MVP 引入 | ✗ (frozen) | 保持 |
| Phase 4 引入 | ✗ (confirmed) | 保持 |
| Phase 5 引入 | 未决策 | Owner 在 Phase 5 planning 时决策 |
| 数据模型 | 类型存在但 serializer 拒绝 | 如需引入，需新建数据模型+生命周期 |
| 与 Magika/插件关系 | 无耦合 | 保持独立 |
| Phase 4 closeout 阻断 | 否 | — |

---

## 19. Legacy message_asset 后续边界

### 19.1 当前状态

Legacy `message_asset` 轨道退场自 Step 0（`05-owner-decisions-before-step2.md`）标记为后续阶段任务，**未进入 Phase 4 destructive cleanup**。

### 19.2 约束

| 约束 | 内容 |
|------|------|
| 不进入 P4-D implementation | P4-D 不执行 destructive cleanup |
| 不进入 P4-D closeout | closeout 不要求 message_asset 已清理 |
| Phase 5 或后续 | Owner 在合适时机决策 destructive cleanup 路径 |
| 历史兼容 | 退场前必须确保所有依赖方已迁移 |

---

## 20. converted_pdf Route Follow-up

### 20.1 当前状态

`converted_pdf` route 的 engine gate 已在 P4-C6 中通过 `sendRouteMapping.ts` 接入（连接 `documentConversion` engine flag）。但该 route 尚未进入具体 document format route list（即 `DOCUMENT_FORMATS` / 具体 format→route 映射）。

### 20.2 需要完成的工作

1. 将 `converted_pdf` route 纳入 `DOCUMENT_FORMATS` 集合中具体格式的 route 候选。
2. 确定哪些文件格式（docx/xlsx/pptx 等）应包含 `converted_pdf` 作为 route candidate。
3. UI 端显示 `converted_pdf` route 选项。
4. 关联 LibreOffice engine 的 `convert_to_pdf` 操作。

### 20.3 建议处置

- **P4-D**：不实现，仅登记。
- **Phase 5 / UI-Job follow-up**：随 LibreOffice real runtime 接入同步完成。

---

## 21. Known Baseline Issues

以下问题在 Phase 4 全阶段（P4-A/P4-B/P4-C）**均未引入**，属于存量问题：

| # | 问题 | 影响范围 | 来源阶段 | 处置 |
|---|------|---------|---------|------|
| BL-1 | 17 pre-existing TS errors (`npx tsc --noEmit`) | 全项目 | Pre-Phase 4 | 不阻断 P4-D closeout，建议在 Phase 5 清理 |
| BL-2 | `derivativeJobService.test.ts` HTML targetKind pre-existing failure | derivativeJobService | Pre-Phase 4 | 不阻断 P4-D closeout，建议在 Phase 5 修复 |

P4-D closeout 准入条件不要求修复这些存量问题。

---

## 22. P4-D Implementation 子任务包建议

### P4-D1: Baseline Verification and Known-Issue Ledger

**定位**：验证当前基线状态，建立已知问题台帐。

**范围**：
- 执行全量 `npx vitest --run` 记录 pass/fail。
- 执行 `npx tsc --noEmit` 记录 pre-existing errors。
- 执行 `npm run lint:changed` / `npm run db:verify`。
- 执行禁止项扫描矩阵 (FB-1~FB-10)。
- 核对 P4-A/P4-B/P4-C 文件和测试数与 closeout 文档一致。
- 输出 P4-D1 baseline ledger。

**允许**：文档输出、扫描命令执行、测试执行。
**禁止**：不修改生产代码，不修复存量问题。

---

### P4-D2: Manual Smoke Checklist Execution Package

**定位**：编制完整手工烟测执行包，不实际执行。

**范围**：
- 整理手工烟测矩阵 (§12) 为可执行 checklist。
- 为每项烟测编写执行步骤、前置条件、验收标准。
- 输出 P4-D2 manual smoke execution package 文档。

**允许**：文档输出。
**禁止**：不执行手工烟测（需 Electron + real runtime 环境）。

---

### P4-D3: Security/Privacy/Follow-up Audit Package

**定位**：执行 P0/P1 审计，验证所有 follow-up 状态。

**范围**：
- 审查 security/privacy checklist (§15) 各项当前验证状态。
- 审查 blocking follow-ups (§9.1) 的处置状态与 Owner 决策缺口。
- 审查 non-blocking follow-ups (§9.2) 是否可合理延期。
- 扫描 trusted root / signing / production key checklist (§16)。
- 扫描 real runtime packaging checklist (§17)。
- 执行禁止项重验矩阵。
- 输出 P4-D3 audit report。

**允许**：文档输出、grep 扫描。
**禁止**：不修改代码，不代为 Owner 决策。

---

### P4-D4: provider_file_ref / Legacy message_asset Follow-up Decision Package

**定位**：为 provider_file_ref 和 legacy message_asset 的后续阶段决策提供输入。

**范围**：
- 整理 provider_file_ref 在各阶段的引用、决策历史、延期理由。
- 整理 legacy message_asset 在各阶段的引用、决策历史、延期理由。
- 整理当前所有依赖 provider_file_ref 或 message_asset 的代码路径。
- 提出 Phase 5 引入或退场的决策门槛、前置条件、风险评估。
- 输出 P4-D4 decision package（不包含实现代码）。

**允许**：文档输出、代码只读定位 (flash-code-reader)。
**禁止**：不修改代码，不执行 destructive cleanup，不引入 provider_file_ref。

---

### P4-D5: Phase 4 Final Closeout Report

**定位**：Phase 4 最终收口。

**范围**：
- 汇总 P4-D1~P4-D4 输出。
- 输出 Phase 4 final closeout report（新增文档）。
- 更新 README.md 状态为「Phase 4 completed with follow-ups」（如果准入条件满足）。
- 明确 Phase 5 handoff 候选项。

**允许**：文档输出、README 更新。
**禁止**：不写 Phase 4 completed（除非所有 closeout blockers 已裁决）。

---

## 23. P4-D Closeout 准入条件

| # | 条件 | 类型 |
|---|------|------|
| G-1 | P4-D1 baseline verification 通过（测试全量、lint、DB 验证一致） | **门禁** |
| G-2 | P4-D2 manual smoke checklist 编制完成 | **门禁** |
| G-3 | P4-D3 security/audit 无新增安全缺陷 | **门禁** |
| G-4 | P4-D4 provider_file_ref / legacy message_asset 决策包完成 | **门禁** |
| G-5 | 禁止项扫描矩阵 (FB-1~FB-10) 无新增命中 | **门禁** |
| G-6 | 自动化回归矩阵 (§11) 全量通过 | **门禁** |
| G-7 | P4-A/P4-B/P4-C 所有 closeout blocker follow-ups 已裁决（Owner decision） | **软门禁** |
| G-8 | 真实 runtime packaging / signing 延期明确登记到 Phase 5 | **门禁** |
| G-9 | Phase 4 NOT completed 口径保持 | **门禁** |

**注意**：G-7 为软门禁 — 若 Owner 未裁决，closeout 文档必须明确列出未裁决项及延期处置，不得默认为已完成。G-1~G-9 中的 blocker 均为 Phase 4 closeout 准入项，不代表 P4-A/B/C code commits 存在 P0 defects。

---

## 24. P4-D 非目标与禁止项

### 24.1 P4-D Planning 非目标

1. 不实现真实 runtime packaging。
2. 不执行真实 Tika / LibreOffice / ffprobe / Pandoc。
3. 不新增 binary / jar / runtime 包。
4. 不新增 package.json / package-lock.json 依赖。
5. 不修改 sendPlanService 主逻辑。
6. 不改 OpenRouter。
7. 不改 provider_file_ref。
8. 不做 legacy message_asset destructive cleanup。
9. 不重构 appChatApp.logic.ts。
10. 不开放第三方插件生态。
11. 不支持 custom marketplace URL。
12. 不支持用户自定义 trusted root。
13. 不把 Phase 4 写成 completed。
14. 不写全项目完成。
15. 不写完整插件系统完成。
16. 不执行手工烟测（仅编制 checklist）。
17. 不修 baseline issues（BL-1, BL-2）。

### 24.2 P4-D Implementation 非目标（供 P4-D1~D5 参考）

1. 不实现真实 Magika / Tika / LibreOffice / ffprobe / Pandoc runtime。
2. 不提交真实模型文件。
3. 不提交 private key。
4. 不修改 package.json / lockfile。
5. 不改 sendPlanService。
6. 不改 OpenRouter。
7. 不重构 appChatApp.logic.ts。
8. 不引入 provider_file_ref。
9. 不做 destructive cleanup。
10. 不修存量 TS errors。
11. 不修 derivativeJobService 存量 test failure。
12. 不把 P4-D 写成 Phase 4 completed。

---

## 25. Phase 5 Handoff 候选项

以下项目明确不进入 Phase 4，作为 Phase 5 或后续阶段的候选项：

| # | 候选 | 当前状态 | 建议阶段 |
|---|------|---------|---------|
| H-1 | 真实 Magika model file 预置包 + 生产分发 | P4-B follow-up | Phase 5 |
| H-2 | 真实 Tika runtime (tika-app.jar) 接入 | P4-C follow-up | Phase 5 |
| H-3 | 真实 LibreOffice runtime 接入 + converted_pdf 完整闭环 | P4-C follow-up | Phase 5 |
| H-4 | 真实 ffprobe/ffmpeg runtime 接入 | P4-C follow-up | Phase 5 |
| H-5 | 真实 Pandoc runtime 接入 | P4-C follow-up | Phase 5 |
| H-6 | Production trusted root + catalog signing pipeline | P4-A follow-up | Phase 5 |
| H-7 | Electron 打包脚本 (managed_root pre-stage + catalog/resources) | P4-A follow-up | Phase 5 |
| H-8 | `converted_pdf` route 进入 document format routes + UI 展示 | P4-C follow-up | Phase 5 |
| H-9 | `converted_markdown` / `rendered_images` / `selected_frames` / `extracted_audio` derivedKind | P4-C §10.4 | Phase 5 |
| H-10 | `conversion` mode in externalProcessPolicy | P4-C §9.2 | Phase 5 |
| H-11 | provider_file_ref 设计 + 实现 | long-term deferred | Phase 5 or later |
| H-12 | legacy message_asset destructive cleanup | long-term deferred | Phase 5 or later |
| H-13 | 17 pre-existing TS errors cleanup | Baseline | Phase 5 |
| H-14 | derivativeJobService HTML targetKind test fix | Baseline | Phase 5 |
| H-15 | DROID / Siegfried | Phase 4 non-goal | Future |
| H-16 | OCR (Tesseract) | Phase 4 non-goal | Future |
| H-17 | 高级 polyglot 检测 | Phase 4 non-goal | Future |
| H-18 | 第三方插件生态 | Phase 4 non-goal | Future |

---

## 26. 文档索引

```
docs/file-pipeline/file-type-detection-implementation/
├── README.md                                          # 目录索引
├── 18-phase3-final-acceptance-and-closeout.md         # Phase 3 收口
├── 18-phase3-final-acceptance-and-closeout.md         # Phase 3 收口
├── 19-phase4-planning.md                              # Phase 4 规划 (母文档)
├── 20-p4a-official-plugin-marketplace-closeout.md     # P4-A 收口
├── 21-p4b-magika-official-managed-plugin-planning.md  # P4-B planning
├── 22-p4b1-magika-package-spec-and-distribution.md    # P4-B1
├── 23-p4b2-managed-root-registration.md               # P4-B2
├── 24-p4b3-magika-classify-runner-contract.md         # P4-B3
├── 25-p4b4-detectfull-gated-runtime.md                # P4-B4
├── 26-p4b-magika-official-managed-plugin-closeout.md  # P4-B closeout
├── 27-p4c-external-conversion-engines-planning.md     # P4-C planning
├── 28-p4c1-conversion-engine-spec-extension.md        # P4-C1
├── 29-p4c2-tika-fake-runner-contract.md               # P4-C2
├── 30-p4c3-libreoffice-conversion-contract.md         # P4-C3
├── 31-p4c4-ffprobe-metadata-contract.md               # P4-C4
├── 32-p4c5-pandoc-conversion-contract.md              # P4-C5
├── 33-p4c6-route-conversion-candidate-integration.md  # P4-C6
├── 34-p4c-external-conversion-engines-closeout.md     # P4-C closeout
└── 35-p4d-final-acceptance-planning.md                # 本文件 (P4-D planning)
```

---

## 27. P4-D Planning 确认签名

- [x] P4-D 阶段定位已明确
- [x] Phase 4 当前状态总览已完成
- [x] P4-A acceptance summary 已完成
- [x] P4-B acceptance summary 已完成
- [x] P4-C acceptance summary 已完成
- [x] P4-A follow-ups 已登记
- [x] P4-B follow-ups 已登记
- [x] P4-C follow-ups 已登记
- [x] Blocking vs non-blocking follow-up 分类已完成
- [x] Phase 4 final acceptance matrix 已完成
- [x] 自动化回归矩阵已完成
- [x] 手工烟测矩阵已完成
- [x] Electron UI 手工烟测矩阵已完成
- [x] Plugin lifecycle 手工烟测矩阵已完成
- [x] Magika runtime / detectFull 手工烟测矩阵已完成
- [x] External conversion contracts 手工烟测矩阵已完成
- [x] 禁止项扫描矩阵已完成
- [x] Security/privacy checklist 已完成
- [x] Trusted root / signing / production key checklist 已完成
- [x] Real runtime packaging checklist 已完成
- [x] provider_file_ref 后续边界已明确
- [x] legacy message_asset 后续边界已明确
- [x] converted_pdf route follow-up 已登记
- [x] Known baseline issues 已登记 (17 TS errors + derivativeJobService)
- [x] P4-D implementation 子任务包建议已完成 (P4-D1~P4-D5)
- [x] P4-D closeout 准入条件已完成
- [x] P4-D 非目标与禁止项已明确
- [x] Phase 5 handoff 候选项已完成
- [x] 文档索引已更新
- [x] P4-D 不代表 Phase 4 completed
