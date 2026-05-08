# P4-A：官方限定插件市场 closeout

Status: **P4-A completed**

## 1. 阶段定位

P4-A 是 Phase 4 的第一个任务包，目标是在 **官方限定插件市场** 范围内完成最小闭环：

- 官方 plugin catalog / signature / hash 校验（任务包 A）
- 插件 registry DB schema + repo（任务包 B）
- 插件 lifecycle service + IPC/client contract（任务包 C）
- 受控 trusted roots 注入 + 失败闭锁（D0）
- lifecycle service / client DTO 测试补强（D0）
- settings UI 最小闭环 + P4-A 收口（本文件）

## 2. 关键约束

- 不含真实 Magika classify 调用。
- 不接入 Tika / LibreOffice / ffprobe / Pandoc。
- 不开放第三方插件生态。
- 不支持用户自定义 marketplace URL / trusted root。
- 不暴露真实绝对路径、installRef、contentToken、fullHash、manifestHash、packageSha256 到 IPC/UI。
- 不修改 sendPlanService 主逻辑。
- 不重构 appChatApp.logic.ts。

## 3. 完成内容

### 3.1 任务包 A：catalog / signature / hash 模块

- `src/next/file-type/pluginCatalog.ts` — 官方 catalog 解析、校验、hash 验证。
- `src/next/file-type/pluginCatalogSignature.ts` — Ed25519 签名校验模块。
- catalog -> signature -> hash -> manifest -> managed plugin integrity -> registry 安全闭环。

### 3.2 任务包 B：插件 registry

- `infra/db/repo/enginePluginRegistryRepo.ts` — DB repo，支持 insert/upsert/list/enable/disable/markFailed/markUninstalled/updateHealth。
- `infra/db/migrations/ensureEnginePluginRegistrySchema.ts` — schema 迁移。
- installRef 验证：拒绝空字符串、NUL、UNC、Unix 绝对路径、Windows 绝对路径、URL scheme、traversal segments。

### 3.3 任务包 C：lifecycle service + IPC/client

- `infra/files/enginePluginLifecycleService.ts` — 全量 lifecycle service，含 registerLocalOfficialPlugin 安全闭环。
- `src/next/files/enginePluginLifecycleClient.ts` — 7 个 IPC method client。
- `src/next/ipc/contracts/enginePluginLifecycleContracts.ts` — Zod DTO schema，不暴露敏感字段。
- `infra/db/worker/handlers/enginePluginLifecycleHandlers.ts` — worker 路由注册。

### 3.4 D0：trusted roots 注入 + 失败闭锁

- `src/next/file-type/officialPluginTrustedRoots.ts` — 含：
  - `getActiveTrustedRoots(env)` — 读取 env 中的 trusted roots。
  - 生产环境无配置 -> `official_trusted_root_unconfigured` 拒绝态。
  - 测试环境（VITEST / NODE_ENV=test / SV_ENGINE_PLUGIN_DEV_MODE=1）自动注入 test trusted root。
  - 支持 `SV_OFFICIAL_PLUGIN_TRUSTED_ROOTS`（JSON env var）。
  - 支持 `SV_TEST_TRUSTED_ROOTS`（JSON env var）。
  - `createTestTrustedRoots()` / `createOfficialTrustedRoots()` 工厂函数。
- lifecycle service 在 `loadAndVerifyCatalog` 中检查空 trustedRoots 并返回 `official_trusted_root_unconfigured`。
- `infra/db/worker/runtime.ts` 注入 trusted roots 替代硬编码 `{}`。

### 3.5 D0：测试补强

#### lifecycle service 测试（`infra/files/enginePluginLifecycleService.test.ts`）

新增测试：
1. `official_trusted_root_unconfigured` 当 trusted roots 为空。
2. `registerLocalOfficialPlugin` 在空 trusted roots 时失败。
3. catalog 签名无效（错误密钥）。
4. manifest hash 不匹配。
5. package hash 不匹配。
6. failureReason 脱敏（不含真实路径/hash）。
7. failureReason 在错误消息中脱敏。

#### client/DTO 测试（`src/next/files/enginePluginLifecycleClient.test.ts`）

新增测试：
1. ok:false lifecycle result decode。
2. ok:false official list result decode。
3. Zod decode 失败抛出异常。
4. DTO 不含 installRef。
5. DTO 不含 manifestHash。
6. DTO 不含 packageSha256。
7. DTO 不含 contentToken。
8. DTO 不含 fullHash。
9. failureReason 不含真实路径。
10. failureReason 不含 64-char hash。

#### trusted roots 单元测试（`src/next/file-type/officialPluginTrustedRoots.test.ts`）

- 空配置返回 unconfigured。
- VITEST / NODE_ENV=test / DEV_MODE 自动获取 test roots。
- SV_OFFICIAL_PLUGIN_TRUSTED_ROOTS JSON 配置可用。
- SV_TEST_TRUSTED_ROOTS JSON 配置优先。
- test trusted root 能正常验签。
- test trusted root 在篡改 payload 上失败。
- parseTrustedRootsJson 拒绝无效输入。

### 3.6 D1/D2：Settings UI 最小闭环

- `src/ui-app/components/EnginePluginSettingsPanel.vue` — 新增独立组件。
- 集成到 SettingsPanel.vue 中（`<EnginePluginSettingsPanel />`）。
- 展示：
  - official catalog 插件列表（pluginId / pluginVersion / installState）。
  - installed 插件详情（displayName / engineId / version / modelVersion / healthStatus / 脱敏 failureReason）。
- 操作入口：
  - Register（未安装插件）。
  - Enable / Disable。
  - Uninstall。
  - Health Check。
- trusted root 未配置时显示 "官方插件信任根未配置，官方插件列表暂不可用"。
- 不显示真实路径、hash、contentToken、fullHash。

## 4. 手工烟测清单

| # | 场景 | 预期 |
|---|------|------|
| 1 | 无 trusted root 时 UI 显示明确不可用状态 | 显示 amber 提示条 |
| 2 | 有 test trusted root 时 list official plugins 成功 | 插件列表正常显示 |
| 3 | register local official plugin 成功 | installState 变为 installed |
| 4 | hash mismatch 失败 | 返回 hash_verification_failed |
| 5 | signature mismatch 失败 | 返回 catalog_signature_invalid |
| 6 | enable / disable / uninstall / health check 状态变化 | 状态按钮正确切换 |
| 7 | failed plugin enable 前需 health check | enablePlugin 拒绝 |
| 8 | UI 不显示真实路径/hash/token | 无敏感信息泄露 |

## 5. 禁止项扫描结果

| 扫描项 | 结果 |
|--------|------|
| provider_file_ref / providerFileRef | 未引入 |
| contentToken 泄露 | 已验证排除 |
| fullHash 泄露 | 已验证排除 |
| 日志含绝对路径 | 已有 sanitizeMessage |
| third-party / custom marketplace | 未引入 |
| magika / @tensorflow/tfjs 在 package.json | 已验证排除 |
| Phase 4 completed 措辞 | 已确认未写入 |

## 6. 修改文件清单

### 新增文件
1. `src/next/file-type/officialPluginTrustedRoots.ts`
2. `src/next/file-type/officialPluginTrustedRoots.test.ts`
3. `src/ui-app/components/EnginePluginSettingsPanel.vue`
4. `docs/file-pipeline/file-type-detection-implementation/20-p4a-official-plugin-marketplace-closeout.md`

### 修改文件
1. `infra/files/enginePluginLifecycleService.ts` — 添加 `official_trusted_root_unconfigured` 支持和检查
2. `infra/files/enginePluginLifecycleService.test.ts` — 测试补强
3. `infra/db/worker/runtime.ts` — 注入 trusted roots
4. `src/next/files/enginePluginLifecycleClient.test.ts` — 测试补强
5. `src/next/file-type/index.ts` — 导出新模块
6. `src/ui-app/components/SettingsPanel.vue` — 集成 EnginePluginSettingsPanel

## 7. 剩余风险

1. **production trusted root 尚未冻结**：当前只有 placeholder/test root。真实 production root 需在后续阶段配置。
2. **settings UI 仅在 Electron 环境下可用**：组件通过 `dbBridge` IPC 通信，需在完整 Electron 环境中手工烟测。
3. **catalog file 分发路径未定义**：runtime 依赖本地 catalog 文件，分发机制需后续实现。
4. **health check 依赖于真实插件文件存在**：测试环境使用 mock fixtures，真实执行需完整插件包。
5. **lifecycle service 测试覆盖率有限**：主要覆盖 Magika 场景，其他引擎类型需后续扩展。

## 8. 是否新增依赖

否。未新增 npm 依赖，未修改 package.json / lockfile。

## 9. 是否接触受限区域

- **sendPlanService**：否。
- **OpenRouter**：否。
- **derivative**：否。
- **appChatApp.logic.ts 全文**：否（仅通过 rg 搜索定位 SettingsModal/SettingsPanel 引用）。

## 10. 下一步（P4-B）

P4-B 进入 Magika managed plugin 真实包与 classify call 规划。本阶段不得接入真实 Magika classify / Tika / LibreOffice / ffprobe / Pandoc 执行链路。
