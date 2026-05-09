# 38. P4-D3 Security / Privacy / Follow-up Audit Package

**状态**: Completed
**日期**: 2026-05-10
**阶段**: P4-D3 (Phase 4 final acceptance — security/privacy/follow-up audit)
**父文档**: `35-p4d-final-acceptance-planning.md`

P4-D3 不代表 Phase 4 completed。不修代码，只做审计与分类。

---

## 1. 定位

对 Phase 4（P4-A/B/C）全量交付物执行安全与隐私审计，复核 trusted root / signing / runtime packaging / external process / IPC DTO / metadata allowlist / active content 各维度风险。将 P4-A/B/C follow-ups 按 closeout blocker / non-blocking / Phase 5 handoff / resolved 分类。明确待 Owner 裁决项。为 P4-D4 和 P4-D5 closeout 提供审计输入。

---

## 2. Security Audit Matrix

| # | 检查项 | 来源 | 当前状态 | P4-D3 验证方法 | P4-D3 结论 | 备注 |
|---|--------|------|---------|---------------|-----------|------|
| S-1 | trusted root Ed25519 签名验证 | P4-A | ✓ implemented | grep `ed25519`/`verify` in `officialPluginTrustedRoots.ts`, `pluginCatalog.ts` | **pass** | P4-A closed |
| S-2 | catalog → manifest → integrity 全链路 hash | P4-A+B | ✓ implemented | grep `sha256`/`integrity` in `pluginCatalog.ts`, `enginePluginLifecycleService.ts` | **pass** | P4-A+B closed |
| S-3 | shell:false 硬编码 | P3-A | ✓ frozen | grep `shell:\s*false` in `externalProcessRunner.ts` | **pass** | P3-A frozen |
| S-4 | 脚本解释器跳板阻断 | P3-A | ✓ frozen | grep `interpreter`/`bypassGuard` in `externalProcessPolicy.ts` | **pass** | P3-A frozen |
| S-5 | timeout + output cap + kill tree | P3-A | ✓ frozen | grep `timeout`/`maxOutput`/`kill` in `externalProcessRunner.ts` | **pass** | P3-A frozen |
| S-6 | 路径脱敏 (sanitizeForProcessResult) | P3-A | ⚠ partial | grep `sanitizeForProcessResult` + audit Unix path coverage | **gap noted** | Missing `/etc/`, `/opt/`, `/usr/`, `/bin/`, `/srv/` Unix prefixes across all 5 runners (§14.2 P1-1) |
| S-7 | contentToken / fullHash 脱敏 | P3-A+P4+A | ⚠ partial | FB-2/FB-3 scans: 0 leaks in logs; standalone hash redaction incomplete (§14.3 P1-2) | **gap noted** | Label-prefix-only hash regex; `sanitizeMessage` stronger |
| S-8 | IPC DTO 不含敏感字段 | P4-A+B | ✓ new IPC | `enginePluginLifecycleClient.test.ts:221,246` covers new plugin DTOs | **pass** | New plugin IPC verified |
| S-9 | UI 不暴露真实路径/hash/token | P4-A+B | ⚠ partial | New `EnginePluginSettingsPanel` DOM verified; legacy `messageAsset.*` IPC transmits raw paths (§14.1 P0-1) | **gap: P0-1** | Legacy msg asset IPC unchecked |
| S-10 | renderer 不直接访问文件路径 | 架构 | ✓ enforced | Architecture constraint (preload bridge) | **pass** | Electron IPC channel audit |
| S-11 | 无 private key 提交 | 全阶段 | ✓ verified | FB-10 scan (P4-D1 §5): 0 hits | **pass** | Only test keys in test files |
| S-12 | 无联网下载模型/runtime | 全阶段 | ✓ verified | FB-6 scan: 0 deps in package.json | **pass** | All pre-staged |
| S-13 | Sandbox copy 输入隔离 | P3-A+P4+C | ✓ design | Contract-level: temp copy isolation | **pass** | Verified in contracts |
| S-14 | Active content blocking (JS/macro/XSLT) | P4-C | **pending** | Design-only; needs real runtime for production verification | **deferred** | Phase 5 |
| S-15 | Conversion output 脱敏 (Tika metadata JSON filter) | P4-C | **pending** | Design-only; contract defines filter but no real execution | **deferred** | Phase 5 |
| S-16 | Macro scanning / Lua filter policy | P4-C | **pending** | Design-only; policy specs exist but no real Pandoc/LO validation | **deferred** | Phase 5 |
| S-17 | trusted root key rotation 支持 | P4-B | ✓ design | Multi keyId coexistence in design; env var injection path exists | **pass** | Phase 5 hardening |
| S-18 | `SV_ENGINE_PLUGIN_DEV_MODE=1` production risk | P4-A+B+C | **P0 risk** | If set in production, activates test trusted root + bypass all signature gates | **closeout blocker** | Production startup guard + deployment docs required |

---

## 3. Privacy Audit Matrix

| # | 检查项 | 风险等级 | 当前状态 | 结论 |
|---|--------|---------|---------|------|
| P-1 | 文件绝对路径是否泄露到日志 | P0 | sanitized (S-6/S-7) | **pass** |
| P-2 | contentToken 是否泄露到日志/DOM | P0 | sanitized (S-7/S-8/S-9) | **pass** |
| P-3 | fullHash 是否泄露到日志/DOM | P0 | sanitized (S-7/S-8/S-9) | **pass** |
| P-4 | 插件 manifest 敏感字段是否暴露 | P1 | DTO filtered (IPC/UI) | **pass** |
| P-5 | 转换结果中是否含原始文件路径 | P1 | contract defines path-free output | **pass** (contract), **deferred** (real runtime) |
| P-6 | 外部进程 stderr 是否泄露输入内容 | P1 | regex-based sanitize (S-6/S-7) | **pass** |
| P-7 | UI Settings 面板是否泄露 registry internals | P1 | test-verified (S-9) | **pass** |

**结论**: P-1/P-2/P-3 在新 plugin IPC (enginePluginLifecycleClient, EnginePluginSettingsPanel) 中通过自动化验证。但 legacy `messageAsset.*` IPC 通道仍将 raw path/fileUrl/hash 传输到 renderer（见 §14.1 P0-1），需要 P4-D3 审计登记。S-14~S-16（real runtime 依赖项）deferred 到 Phase 5。

---

## 4. Trusted Root / Signing / Production Key Audit

| # | 检查项 | 状态 | Risk | Owner Action Required | Phase 4 Closeout Blocker |
|---|--------|------|------|----------------------|--------------------------|
| TK-1 | Production Ed25519 密钥对生成 | ✗ pending | **P0** | Owner 离线生成密钥对 | **是** |
| TK-2 | Public key 通过 `SV_OFFICIAL_PLUGIN_TRUSTED_ROOTS` 注入 | ✗ pending | **P0** | 部署 env 配置 | **是** |
| TK-3 | Private key 安全存储不入 repo | ✓ verified | — | N/A | 否 |
| TK-4 | Test key 与 production key 隔离 | ✓ verified | — | N/A | 否 |
| TK-5 | Key rotation 机制 (多 keyId 共存) | ✓ design | P1 | Phase 5 hardening | 否 |
| TK-6 | Catalog 签名流程 (Owner offline sign) | ✗ pending | **P0** | Owner 建立离线签名 pipeline | **是** |
| TK-7 | Production catalog 文件生成 | ✗ pending | **P0** | Owner decision + 执行 | **是** |
| TK-8 | 测试签名密钥仅用于 CI/dev | ✓ verified | — | N/A | 否 |
| TK-9 | 测试签名密钥 fingerprint 登记 | ✓ verified | — | N/A | 否 |
| TK-10 | `SV_ENGINE_PLUGIN_DEV_MODE=1` production 风险 | ✗ pending | **P0** | Production startup guard + deployment docs | **是** |

### 4.1 SV_ENGINE_PLUGIN_DEV_MODE=1 Risk Detail

**风险**: 若 `SV_ENGINE_PLUGIN_DEV_MODE=1` 在生产环境被设置，以下安全门禁被绕过：
- Test trusted root 被激活（允许非生产签名的 plugin）
- Dev-only lifecycle paths 可能暴露

**缓解要求**:
1. Production deployment docs 明确标注此变量禁止设置。
2. Electron 打包脚本中显式 unset 该变量（或 assert 为 0）。
3. 生产启动时可打印 warning 日志（不影响运行，用于审计）。

---

## 5. Real Runtime Packaging Audit

| # | 检查项 | 当前状态 | Phase 5 Handoff |
|---|--------|---------|----------------|
| RP-1 | Magika model file pre-staged package | ✗ pending | Owner provides pre-built package |
| RP-2 | Magika runtime bundle (独立于主包) | ✗ pending | Electron 打包配置 |
| RP-3 | Tika JAR package | ✗ pending | Phase 5 |
| RP-4 | LibreOffice portable binary | ✗ pending | Phase 5 |
| RP-5 | ffprobe/ffmpeg binary | ✗ pending | Phase 5 |
| RP-6 | Pandoc binary | ✗ pending | Phase 5 |
| RP-7 | Catalog file 随 Electron resources 打包 | ✗ pending | Electron 打包脚本 |
| RP-8 | managed_root plugin 目录预置 | ✗ pending | Electron 打包脚本 |
| RP-9 | NOTICE / LICENSE / ATTRIBUTION | ✗ pending | Phase 5 |
| RP-10 | Integrity hash 随 catalog entry 分发 | ✗ pending | Phase 5 |

**安全边界说明**: 以上 RP-1~RP-10 均不涉及代码层面的安全缺陷。它们属于部署/分发层未完成交付物。真实 runtime 未提交保证：
- 无人可误用 real runtime 功能（因为真实 runtime 不存在）
- P4-C fake runner contracts 仅验证接口契约，不执行真实外部进程

---

## 6. External Process Audit

| # | 检查项 | 当前状态 | 备注 |
|---|--------|---------|------|
| EP-1 | `externalProcessPolicy` 静态策略（shell/interpreter/executable blocks） | ✓ P3-A frozen | 测试覆盖 12/12 |
| EP-2 | `externalProcessRunner` 执行边界（timeout/kill/output cap） | ✓ P3-A frozen | 测试覆盖 11/11 |
| EP-3 | path sanitize in process result | ⚠ partial | Unix path regex incomplete across all 5 runners (§14.2 P1-1) |
| EP-4 | contentToken / fullHash sanitize in process result | ⚠ partial | Standalone hash regex weaker than `sanitizeMessage` (§14.3 P1-2) |
| EP-5 | Sandbox copy isolation | ✓ design (P4-C) | contract defined |
| EP-6 | Real process execution (Tika/LO/ffprobe/Pandoc) | ✗ pending | No real runtime committed |
| EP-7 | `installRef` sanitization | ✗ missing | Not redacted by any sanitizer (§14.4 P1-4) |

**结论**: External process security boundary design is solid. Two sanitization gaps (Unix path prefixes, standalone hash regex) and `installRef` not redacted — documented as P1, non-blocking for closeout (affects Phase 5 production deployment hardening). Real execution validation deferred to Phase 5.

---

## 7. IPC / UI DTO Audit

| # | 检查项 | 验证 | 结论 |
|---|--------|------|------|
| IPC-1 | EnginePluginLifecycleClient DTO 不含 contentToken | `enginePluginLifecycleClient.test.ts:221` | **pass** |
| IPC-2 | EnginePluginLifecycleClient DTO 不含 fullHash | `enginePluginLifecycleClient.test.ts:246` | **pass** |
| IPC-3 | EnginePluginSettingsPanel DOM 不含 contentToken | `EnginePluginSettingsPanel.test.ts:138` | **pass** |
| IPC-4 | EnginePluginSettingsPanel DOM 不含 fullHash | `EnginePluginSettingsPanel.test.ts:139` | **pass** |
| IPC-5 | EnginePluginSettingsPanel DOM 不含 installRef | SM-13 / EUI-7 (not_run) | **deferred** |
| IPC-6 | EnginePluginSettingsPanel DOM 不含 manifestHash | SM-13 / EUI-7 (not_run) | **deferred** |
| IPC-7 | EnginePluginSettingsPanel DOM 不含 packageSha256 | SM-13 / EUI-7 (not_run) | **deferred** |
| IPC-8 | Legacy `messageAsset.*` DTO 不含 raw path/fileUrl/hash | **UNVERIFIED** — `messageAssetSchema` (`dbBridgeContracts.ts:315-339`) transmits `path`/`fileUrl`/`hash` to renderer without sanitization | **gap: P0-1** |

**结论**: 新 EnginePluginLifecycleClient DTO sanitization 已通过自动化测试。Legacy `messageAsset.*` IPC channels 未审计且泄露 raw 文件路径和 URL 到 renderer — 这是 P0 risk（§14.1）。EUI-7（Electron DOM 完整性审计）pending due to no Electron environment。

---

## 8. Metadata Allowlist Audit

Metadata allowlist 设计在 P4-C safety patch (`d505099`) 中实施：

| 检查项 | 状态 |
|--------|------|
| Tika metadata JSON 白名单过滤 | ✓ contract defined (P4-C2) |
| ffprobe metadata 白名单过滤 | ✓ contract defined (P4-C4) |
| Null semantics 正确处理 | ✓ safety patch `d505099` |
| Unknown fields 不上报 | ✓ contract defined |
| Production metadata 过滤执行 | ✗ pending (requires real runtime) |

**风险**: Metadata allowlist contract 已定义，但真实运行时是否严格执行仅设计层保证。Phase 5 必须用真实 Tika/ffprobe 执行验证 S-15。

---

## 9. Active Content / Macro / Lua Policy Audit

| # | 检查项 | 来源 | 设计层 | 生产层 |
|---|--------|------|--------|--------|
| AC-1 | HTML JavaScript blocking | P4-C §13 | ✓ policy defined | ✗ pending (needs real runtime) |
| AC-2 | Office macro disabled | P4-C §13 | ✓ policy defined | ✗ pending (needs real LO) |
| AC-3 | XSLT disabled in Tika | P4-C §13 | ✓ policy defined | ✗ pending (needs real Tika) |
| AC-4 | Pandoc Lua filter policy | P4-C §13 | ✓ policy defined | ✗ pending (needs real Pandoc) |
| AC-5 | active content blocking in conversion output | P4-C §13 | ✓ policy defined | ✗ pending |

**结论**: Active content blocking 在设计层完整定义，但无一能在 fake runner 阶段验证。真实 runtime 接入后（Phase 5）必须逐项验证。

---

## 10. Follow-up Classification

### 10.1 Closeout Blockers (需 Owner 裁决或 Phase 5 才能收口)

| ID | Follow-up | 类别 | Dependence |
|----|-----------|------|-----------|
| A-1 | Production trusted root key pair | Owner decision | Owner 离线生成密钥对 |
| A-2 | Production catalog file 预置路径 | Owner decision + Packaging | Electron 打包脚本 |
| A-3 | Production package 预置路径 | Owner decision + Packaging | Electron 打包脚本 |
| B-1 | Production signing workflow | Owner decision | Owner 确认 workflow |
| B-2 | Official catalog signing key | Owner decision | Owner 控制签名密钥 |
| B-3 | Real Magika model file | Owner decision + Packaging | Owner 提供预置包 |
| B-4 | Magika/tfjs 独立 bundle | Packaging | Electron 打包配置 |
| B-5 | Real catalog + Owner 离线签名 | Owner decision | Owner 签名 catalog |
| C-1 | Real Tika/LO/ffprobe/Pandoc runtime | Phase 5 handoff | Phase 5 实现 |
| C-2 | Real runtime packaging & 签名 | Phase 5 handoff | Phase 5 实现 |
| S-18 | SV_ENGINE_PLUGIN_DEV_MODE=1 risk | Deployment config | Deployment docs audit |
| TK-10 | DEV_MODE production guard | Deployment config | Electron 打包脚本 |

### 10.2 Non-Blocking — Phase 5 Handoff

| ID | Follow-up | Phase 5 Task |
|----|-----------|-------------|
| A-6 | Health check fixture 依赖真实插件 | 随 real runtime 接入解决 |
| B-7 | Real-runtime tests gated / CI skip | 保持 CI skip until Phase 5 |
| C-3 | `converted_pdf` route 进入 format route list | Phase 5 / UI-Job |
| C-4 | Real runtime execution 验证 | Phase 5 |
| C-5 | Macro scanning 生产验证 | Phase 5 |
| C-6 | Lua filter policy 生产验证 | Phase 5 |
| C-7 | Active content blocking 生产验证 | Phase 5 |
| C-10 | ffprobe selected_frames / audio extraction | Phase 5 |
| S-14 | Active content blocking 生产验证 | Phase 5 |
| S-15 | Conversion output 脱敏 生产验证 | Phase 5 |
| S-16 | Macro/Lua scanning 生产验证 | Phase 5 |

### 10.3 Non-Blocking — Known Baseline (不阻断，不要求修复)

| ID | Follow-up | 处置 |
|----|-----------|------|
| C-8 | 17 pre-existing TS errors | Phase 5 cleanup |
| C-9 | derivativeJobService test failure | Phase 5 fix |

### 10.4 Resolved

| ID | Follow-up | 说明 |
|----|-----------|------|
| A-5 | Settings UI `test_root` → `managed_root` | 已在 P4-B2 完成 |

### 10.5 Non-Blocking — Manual Smoke Pending

| ID | Follow-up | 处置 |
|----|-----------|------|
| A-4 | Electron 手工烟测 | P4-D2 registered, not_run |
| B-6 | Electron manual smoke | P4-D2 registered, not_run |
| A-7 | Lifecycle test coverage expansion | Phase 5 |

---

## 11. Closeout Blocker Summary

| # | Blocker | Type | Resolution Path |
|---|---------|------|----------------|
| BL-01 | Production trusted root key (TK-1) | Owner decision | Owner generates offline |
| BL-02 | Production signing workflow (TK-6) | Owner decision | Owner establishes pipeline |
| BL-03 | Production catalog file (TK-7) | Owner decision | Owner signs catalog |
| BL-04 | Real Magika model file (RP-1) | Owner decision + Packaging | Owner provides pre-built package |
| BL-05 | Real runtime packaging (RP-2~RP-6) | Phase 5 handoff | Phase 5 implementation |
| BL-06 | SV_ENGINE_PLUGIN_DEV_MODE=1 guard (TK-10/S-18) | **P0** code-level risk | Production startup guard + deployment docs |
| BL-07 | Legacy `messageAsset.*` IPC path/hash leak (P0-1) | **P0** pre-existing risk | Phase 5 sanitization fix |

**注意**: BL-01~BL-05 为部署/分发层未完成交付物，非 P4-A/B/C code commits 中的 P0 defects。BL-06 和 BL-07 为 P4-D3 审计中发现的 code-level 安全风险：BL-06 需要生产启动 guard，BL-07 为 legacy IPC 通道路径泄露。两者均为 Pre-Phase 4 存量问题，不阻断 Phase 4 code closeout，但必须在 Phase 5 或生产发布前修复。

---

## 14. P4-D3 Audit Discovered Risks（新增登记）

以下风险在 P4-D3 审计中首次发现并登记，均为 Pre-Phase 4 存量问题或设计层 gap：

### 14.1 P0-1: Legacy `messageAsset.*` IPC 泄露 raw path/fileUrl/hash 到 renderer

**发现**: 审计 legacy IPC channels 时发现 `messageAsset.*` 系列 IPC contracts 将真实文件路径和 URL 传输到 renderer 进程，未做脱敏。

| 文件 | 行 | 内容 |
|------|----|------|
| `infra/db/repo/messageAssetRepo.ts` | 22 | `AssetRow` 包含 `path: string`, `hash: string` |
| `infra/db/types.ts` | 236-248 | `MessageAssetRecord` 包含 `path`, `fileUrl`, `hash`, `bytes` |
| `src/next/ipc/contracts/dbBridgeContracts.ts` | 315-339 | `messageAssetSchema` Zod transform 原样传输 `path`, `fileUrl`, `assetUrl`, `hash` |
| `src/next/ipc/contracts/dbBridgeContracts.ts` | 996 | `messageAsset.persistFromDataUrls` 返回 raw `MessageAssetRecord` |
| `src/next/ipc/contracts/dbBridgeContracts.ts` | 1013 | `messageAsset.listByMessageIds` 返回 raw `MessageAssetRecord[]` |
| `electron/main.ts` | 461 | `messageAsset.getById` 在 Electron main process 中被调用 |

**影响**: 真实文件系统路径（`C:\Users\...`, `/home/...`）和 file:// URL 穿越 IPC boundary 到达 renderer。这直接与 S-9 claim 冲突 — 当前 S-9 验证仅覆盖新的 `EnginePluginSettingsPanel`，未覆盖 legacy `messageAsset.*` UI consumers。

**严重性**: P0 — release-blocking path/hash/token leak。

**归因**: Pre-Phase 4 存量。`messageAsset` legacy 通道早于 Phase 4 文件安全加固，尚未纳入本次 IPC DTO sanitization scope。

**处置**: 登记为 P4-D3 closeout blocker（BL-07）。修复在 Phase 5（修改 `messageAssetSchema` Zod transform 或 IPC bridge 层），不属于 P4-D scope。

---

### 14.2 P1-1: Unix 路径脱敏 incomplete — 5 个 runner 均缺失常见 Unix 前缀

**发现**: 所有 5 个 runner 的 `sanitizeForRunner` 仅脱敏 `/Users/`, `/home/`, `/mnt/`, `/var/`, `/tmp/` 前缀。

| 文件 | 行 |
|------|----|
| `src/next/file-type/libreOfficeRunner.ts` | 251-254 |
| `src/next/file-type/pandocRunner.ts` | 217-220 |
| `src/next/file-type/ffprobeRunner.ts` | 292-295 |
| `src/next/file-type/tikaRunner.ts` | 209-212 |
| `src/next/file-type/magikaClassifyRunner.ts` | 180-183 |

**缺失前缀**: `/etc/`, `/opt/`, `/usr/`, `/bin/`, `/srv/`, `/root/`, `/run/`, `/proc/`, `/sys/`, `/dev/`, `/lib/`

**影响**: Linux/macOS production 环境下，stderr 中包含上述路径的错误信息不会被脱敏。

**严重性**: P1 for Linux/macOS deployment。

**处置**: Phase 5 hardening（使用更通用的路径模式或补齐 prefix list）。

---

### 14.3 P1-2: Hash 脱敏不一致 — `sanitizeForProcessResult` 仅匹配 label-prefixed hash

**发现**: `externalProcessRunner.ts:307` 使用 `/(fullHash["'\s:=]+)([A-Za-z0-9+/=:_-]{12,})/gi` 仅脱敏带有 `fullHash` 标签前缀的 hash 值。

对比 `enginePluginLifecycleService.ts:477` 中 `sanitizeMessage` 使用 `/\b[a-f0-9]{64}\b/giu` 匹配独立 SHA-256 hex hash。

**影响**: 若进程输出不带 `fullHash` 前缀的 hash（如 `expected hash: abc123...`），hash 不会被脱敏。

**严重性**: P1。

**处置**: Phase 5 对齐两个 sanitizer 的 hash 匹配策略。

---

### 14.4 P1-3: `provider_file_ref` 在 `src/` 中仍有存量引用

**发现**: FB-1 scan 在 P4-D1 中已记录 `provider_file_ref` hits，但部分引用涉及 IPC schema validation 和 error logging：

| 文件 | 行 | 内容 |
|------|----|------|
| `src/next/ipc/contracts/dbBridgeContracts.ts` | 615-616 | Zod schema accepts `provider_file_ref` without guard |
| `src/next/openrouter/openRouterSendPlanSerializer.ts` | 427 | Error message leaks `assetId` |

**影响**: IPC schema 允许 `provider_file_ref` 通过 validation；OpenRouter serializer 报错暴露 `assetId`。

**严重性**: P1 — pre-existing, documented in P4-D1 §5 (FB-1)。

**处置**: Phase 5 添加 schema-level rejection of `provider_file_ref`；修复 OpenRouter error message 脱敏。

---

### 14.5 P1-4: `installRef` 未在任何 sanitizer 中脱敏

**发现**: `infra/files/enginePluginLifecycleService.ts` 中 `installRef` 是多处使用的路径组件，但所有 sanitizer（`sanitizeForProcessResult`, `sanitizeForRunner`, `sanitizeMessage`）均不脱敏此字段。

**影响**: 错误消息中包含 `installRef`（如 `plugin not found at managed_root/plugin_magika_001`）泄露安装目录结构。

**严重性**: P1。

**处置**: Phase 5 在所有 sanitizer 中添加 `installRef` 脱敏 pattern。

---

### 14.6 P0: `SV_ENGINE_PLUGIN_DEV_MODE=1` 分类修正为 P0

TK-10 和 S-18 的风险等级已从 P1 修正为 **P0**。原因：该 env var 在生产环境下静默激活 test trusted root，绕过所有 signature verification gates。当前无任何生产启动 guard。

**处置**: 登记为 closeout blocker BL-06。生产发布前必须实现：Electron packaging script 显式 unset 该变量，或生产启动时 assert 为 0，并在 deployment docs 中明确禁止设置。

---

## 15. Phase 5 Handoff Recommendations (updated)

1. **Real runtime acquisition**: 获取并审计 Tika JAR / LO portable / ffprobe binary / Pandoc binary 的供应链安全。
2. **Runtime integration testing**: 使用真实 runtime 验证 P4-C fake runner contracts。
3. **Active content verification**: 使用真实 runtime 验证 S-14/S-15/S-16。
4. **Electron packaging**: 实现 RP-1~RP-10 打包与分发。
5. **Production key management**: Owner 建立 offline signing pipeline。
6. **TS error cleanup**: 清理 17 pre-existing errors (P2)。
7. **derivativeJobService fix**: 修复 BL-2 (P2)。
8. **Manual smoke execution**: 在 Electron + real runtime 环境下执行 P4-D2 checklist。
9. **P0-1 fix**: Legacy `messageAsset.*` IPC path/hash redaction（`dbBridgeContracts.ts` Zod transform 或 IPC bridge 层）。
10. **P1-1 fix**: Unix path sanitization — 补齐所有 5 个 runner 的路径前缀。
11. **P1-2 fix**: 对齐 `sanitizeForProcessResult` 和 `sanitizeMessage` 的 hash 脱敏策略。
12. **P1-3 fix**: `provider_file_ref` IPC schema rejection + OpenRouter error message 脱敏。
13. **P1-4 fix**: `installRef` 脱敏 — 所有 sanitizer 添加对应 pattern。
14. **P0 BL-06 fix**: `SV_ENGINE_PLUGIN_DEV_MODE=1` 生产启动 guard。

---

## 16. P4-D4 Entry Criteria

| # | 条件 | 状态 |
|---|------|------|
| EC-1 | Security audit matrix 完成 | ✓ |
| EC-2 | Privacy audit matrix 完成 | ✓ |
| EC-3 | Trusted root / signing audit 完成 | ✓ |
| EC-4 | Runtime packaging audit 完成 | ✓ |
| EC-5 | External process audit 完成 | ✓ |
| EC-6 | IPC / UI DTO audit 完成 | ✓ |
| EC-7 | Metadata allowlist audit 完成 | ✓ |
| EC-8 | Active content / macro / Lua policy audit 完成 | ✓ |
| EC-9 | Follow-up reclassification 完成 | ✓ |
| EC-10 | Closeout blockers identified | ✓ |
| EC-11 | Phase 5 handoff items listed | ✓ |
| EC-12 | 无代码修改 | ✓ |
| EC-13 | 新发现的 P0/P1 风险已登记（BL-06 DEV_MODE, BL-07 legacy messageAsset IPC, P1-1~P1-4） | ✓ |
| EC-14 | P4-D2 committed | ✓ |

**结论**: P4-D3 完成，满足 P4-D4 entry criteria。

---

## 17. 禁止与约束

- 不修改生产代码
- 不代为 Owner 决策
- 不执行真实外部进程
- 不安装 real runtime
- 不写 Phase 4 completed

---

## 18. Commit

- **文件**: `38-p4d3-security-privacy-followup-audit.md` (new)
- **READNE**: 索引 + 状态更新
- **commit message**: `docs: add p4d3 security privacy follow-up audit`
