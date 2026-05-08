# P4-B：Magika Official Managed Plugin 真实包与 classify call 规划

Status: **P4-B planning only — not implementation completed**

## 1. P4-B 阶段定位

P4-B 是 Phase 4 的第二个任务包，目标是在 P4-A（官方限定插件市场最小闭环）基础上，完成 Magika official managed plugin 的真实包分发策略、trusted root / catalog / 完整性关系、classify call contract、降级矩阵与实施拆包规划。

P4-B 是 **planning 阶段**。P4-B 不实现真实 classify call，不提交真实模型文件，不新增 `magika` / `@tensorflow/tfjs` 到 Starverse 主包。

P4-B 完成后输出 P4-B1~P4-B5 的实施拆包建议，进入 P4-B implementation 阶段。

## 2. P4-A 输入条件

P4-B 以以下 P4-A 已完成边界作为输入：

- **官方 plugin catalog / signature / hash 模块**（`pluginCatalog.ts`, `pluginCatalogSignature.ts`）：
  - catalog schema 版本 `1`，source `official`
  - Ed25519 签名校验（`verifyOfficialPluginCatalogSignature`）
  - catalog entry 包含 `packageSha256`, `manifestSha256`
  - entry hash 验证（`verifyCatalogEntryHashes`）

- **插件 registry DB schema + repo**（`enginePluginRegistryRepo.ts`, `ensureEnginePluginRegistrySchema.ts`）：
  - `EnginePluginInstallRootKind` 枚举：`managed_root`, `managed_cache`, `test_root`
  - installState 生命周期：installed / enabled / disabled / failed / uninstalled
  - healthStatus：unknown / healthy / degraded / unhealthy

- **插件 lifecycle service + IPC/client**（`enginePluginLifecycleService.ts`, `enginePluginLifecycleClient.ts`）：
  - `registerLocalOfficialPlugin`：验证 catalog 签名、hash，校验 manifest，discover + integrity，upsert registry
  - `enablePlugin` / `disablePlugin` / `uninstallPlugin` / `runHealthCheck`
  - IPC 合约 DTO 不含 installRef / manifestHash / packageSha256 / contentToken / fullHash

- **Trusted roots 注入 + 失败闭锁**（`officialPluginTrustedRoots.ts`）：
  - `getActiveTrustedRoots(env)`：生产无配置 → `official_trusted_root_unconfigured`
  - 测试环境（VITEST / NODE_ENV=test / DEV_MODE）自动注入 test trusted root
  - 支持 `SV_OFFICIAL_PLUGIN_TRUSTED_ROOTS` 和 `SV_TEST_TRUSTED_ROOTS` 环境变量

- **Settings UI 最小闭环**（`EnginePluginSettingsPanel.vue`）：
  - 官方 catalog 插件列表、installed 插件信息、Register/Enable/Disable/Uninstall/Health Check
  - 当前 register 使用 `installRootKind: 'test_root'`（P4-A follow-up 项）

## 3. P4-A follow-ups 如何进入 P4-B

P4-A 收口时登记了 5 项 entry follow-ups，必须在 P4-B planning 中明确处理方案：

| # | P4-A follow-up | P4-B 处理方式 |
|---|----------------|--------------|
| 1 | Production official trusted root 尚未冻结 | P4-B 规划中明确 production trusted root 落地策略（见第 6 节） |
| 2 | Catalog / package 分发路径尚未定义 | P4-B 规划中明确 catalog/package distribution 策略（见第 7 节） |
| 3 | Settings UI 当前 register 使用 `test_root` 语义 | P4-B 规划明确 `test_root` → `managed_root` / `official pre-staged root` 切换方案（见第 8 节） |
| 4 | 完整 Electron 手工烟测仍需在后续真实 runtime / 包分发接入时执行 | P4-B 规划烟测延期到 P4-B5 closeout / P4-C 阶段 |
| 5 | P4-A 完成不代表 Phase 4 completed | P4-B 规划文档确认此口径 |

## 4. Magika Official Package Layout

基于 `17-p3b2-magika-managed-plugin-plan.md` 的草案与 `magikaManagedPlugin.ts` 的 manifest 解析要求，冻结以下包结构：

```text
engines/magika/
├── manifest.json            # 插件 manifest（必需，schema 由 parseMagikaManagedPluginManifest 定义）
├── runtime/                 # 插件 runtime package
│   ├── index.js             # runtime entry（由 manifest.runtimeEntry 指向）
│   └── ...                  # runtime 依赖（magika / @tensorflow/tfjs 等）
├── model/                   # 模型与配置文件
│   ├── config.json          # Magika model config
│   └── model.weights        # 模型权重文件（若有）
├── package/                 # 分发包（catalog 引用的 package artifact）
│   ├── manifest.json        # manifest 副本（catalog.manifestPath 指向）
│   └── engines-magika.tar   # 完整插件包（catalog.packagePath 指向）
├── NOTICE                   # 第三方 NOTICE 文件
├── LICENSE                  # 许可证文件
├── ATTRIBUTION              # 归属声明（可选，manifest.attribution 字段）
└── README.md                # 说明文档
```

### 4.1 manifest.json 必填字段

由 `parseMagikaManagedPluginManifest`（`magikaManagedPlugin.ts:420`）定义：

| 字段 | 类型 | 说明 |
|------|------|------|
| `manifestSchemaVersion` | string | schema 版本 |
| `engineId` | `"magika"` | 固定值 |
| `displayName` | string | 显示名称 |
| `pluginVersion` | string | 插件版本（semver 风格） |
| `runtimeKind` | `"local_loader"` | 真实包应使用 `local_loader`；后续可扩展 `"real"` |
| `runtimeEntry` | string | 相对路径指向 runtime entry |
| `modelVersion` | string | 模型版本（唯一来源之一） |
| `modelFiles` | string[] | 至少 1 个模型文件相对路径 |
| `configFiles` | string[] | 至少 1 个配置文件相对路径 |
| `integrity` | Record<string, string> | 每个核心文件（runtimeEntry + modelFiles + configFiles）的 sha256 |
| `license` | string | SPDX 标识符（如 `"Apache-2.0"`） |
| `attribution` | string | 归属声明文本 |
| `platform` | `"any"` / `"win32"` / `"darwin"` / `"linux"` | 平台限定 |
| `capabilities` | string[] | 默认 `["text_extraction"]` |
| `supportedLabels` | string[] | 支持的 Magika label 列表 |
| `minStarverseVersion` | string \| null | 最低 Starverse 版本要求 |

## 5. Manifest / Catalog / Trusted Root / Package Hash / Integrity 关系

### 5.1 完整安全链路

```text
Trusted Root (Ed25519 公钥)
  +-- 签名验证 --> catalog （catalog.signature 由 trusted root 私钥签名）
  |     +-- catalog entry.manifestSha256 --> manifest 文件 hash
  |     +-- catalog entry.packageSha256  --> package 文件 hash
  |
  +-- catalog [已验证]
  |     +-- manifest [已验证 hash]
  |           +-- manifest.integrity 包含:
  |                 +-- runtimeEntry --> sha256 校验
  |                 +-- modelFiles[] --> sha256 校验
  |                 +-- configFiles[] --> sha256 校验
  |
  +-- 最终: runtime/model/config 文件完整性已验证
```

### 5.2 各 hash 的职责

| Hash | 来源 | 验证时机 | 验证对象 | 验证失败效果 |
|------|------|---------|---------|-------------|
| catalog 签名 | 签名系统 | `loadAndVerifyCatalog` | catalog 整体 | `catalog_signature_invalid` |
| `manifestSha256` | catalog entry | `registerLocalOfficialPlugin` | manifest 文件内容 | `hash_verification_failed` |
| `packageSha256` | catalog entry | `registerLocalOfficialPlugin` | package 文件内容 | `hash_verification_failed` |
| `integrity[runtimeEntry]` | manifest | `discoverMagikaManagedPlugin` | runtime entry 文件内容 | `hash_mismatch` |
| `integrity[modelFiles[]]` | manifest | `discoverMagikaManagedPlugin` | 模型文件内容 | `hash_mismatch` |
| `integrity[configFiles[]]` | manifest | `discoverMagikaManagedPlugin` | 配置文件内容 | `hash_mismatch` |

### 5.3 验证顺序（registerLocalOfficialPlugin）

```text
1. catalog 签名验证（Ed25519, trusted root）
2. catalog entry 查找（pluginId + pluginVersion）
3. manifest file sha256 <-- catalog.manifestSha256
4. package file sha256   <-- catalog.packageSha256
5. manifest 内容解析（engineId, pluginVersion 与 catalog entry 对比）
6. manifest integrity 验证（runtimeEntry + modelFiles + configFiles）
7. registry upsert
```

## 6. Production Trusted Root 策略

### 6.1 当前状态

- 硬编码 test public key（`officialPluginTrustedRoots.ts:7-9`）
- 生产环境无配置时返回 `official_trusted_root_unconfigured`
- `getActiveTrustedRoots()` 支持 `SV_OFFICIAL_PLUGIN_TRUSTED_ROOTS` 环境变量注入

### 6.2 冻结策略

1. **Production trusted root 密钥对**：
   - 由 Owner 离线生成 Ed25519 密钥对
   - 私钥：安全存储，仅用于官方 catalog 签名
   - 公钥：通过 `SV_OFFICIAL_PLUGIN_TRUSTED_ROOTS` JSON 环境变量注入到 Electron 主进程 / DB worker runtime

2. **Production trusted root 配置方式**（当前已支持）：
   ```json
   // SV_OFFICIAL_PLUGIN_TRUSTED_ROOTS
   {
     "starverse-official-root-001": {
       "keyId": "starverse-official-root-001",
       "algorithm": "ed25519",
       "publicKeyPem": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
     }
   }
   ```

3. **Test trusted root 仅用于测试与开发**：
   - `VITEST=true` / `NODE_ENV=test` / `SV_ENGINE_PLUGIN_DEV_MODE=1` 自动注入
   - 生产环境不得包含 test root

4. **Root key rotation**：
   - 支持多 keyId 共存（当前 map 结构已支持）
   - catalog 通过 `signature.keyId` 字段选择使用的 trusted root
   - 旧 keyId 过期后可从 `SV_OFFICIAL_PLUGIN_TRUSTED_ROOTS` 移除

5. **P4-B implementation 阶段配置**：
   - P4-B1 子任务包触发生成 production trusted root 占位配置
   - 在 CI/CD 部署 pipeline 文档中记录配置注入方式
   - 不得将 production private key 提交到源码仓库

## 7. Catalog / Package Distribution 策略

### 7.1 当前限制

- catalog 文件通过本地文件路径加载（`loadOfficialPluginCatalogFromFile`）
- package/manifest 通过本地文件路径读取
- 无下载源 / marketplace URL 支持（**P4-B 非目标：不支持自定义 marketplace URL**）

### 7.2 冻结策略

1. **官方 catalog + package 为 pre-staged 分发**：
   - catalog 文件：随 Starverse 发行版打包（或首次启动时从受控渠道获取）
   - package 文件：预置在应用安装目录的 `engines/` 或用户数据目录的 `engine-plugins/managed_root/` 下

2. **分发路径**（由 `resolveInstallPluginDir` 实现，`runtime.ts:235-238`）：
   ```
   {fileStorageRootDir}/engine-plugins/{installRootKind}/{safeRef}/
   ```
   - `managed_root/`：官方预置插件（随安装包分发）
   - `managed_cache/`：受控下载缓存（后续阶段使用）
   - `test_root/`：开发/测试用（当前 UI 使用，P4-B 需切换）

3. **不支持的方式**（明确禁止）：
   - 不支持 `marketplaceUrl` / `pluginSourceUrl` / 自定义 marketplace URL
   - 不支持联网自动下载模型
   - 不支持用户自定义 trusted root

4. **catalog 文件预置**：
   - 随 Electron 应用打包到 resources 目录
   - DB worker runtime 通过 `defaultCatalogPath` 注入

## 8. managed_root / pre-staged root / test_root 语义切换方案

### 8.1 当前问题

`EnginePluginSettingsPanel.vue:91` 中 `registerLocalOfficialPlugin` 调用使用 `installRootKind: 'test_root'`：

```typescript
// 当前 UI 代码（需要替换）
const result = await registerLocalOfficialPlugin({
  pluginId,
  pluginVersion,
  installRootKind: 'test_root',   // <-- 必须切换
  installRef: `plugin_${pluginId}_${pluginVersion.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
  enabled: false,
})
```

### 8.2 切换方案

| 场景 | 当前语义 | 目标语义 | 切换时机 |
|------|---------|---------|---------|
| 开发/测试 | `test_root` | `test_root`（保留，仅用于手动测试） | 保留不变 |
| 生产 pre-staged | 未实现 | `managed_root` | P4-B2 子任务包 |
| 官方预置包注册 | 未实现 | `managed_root` + pre-staged path | P4-B2 子任务包 |

### 8.3 切换细节

1. **settings UI**（`EnginePluginSettingsPanel.vue`）：
   - 当 `getActiveTrustedRoots()` 返回 `source: 'test'`：Register 使用 `test_root`
   - 当 `getActiveTrustedRoots()` 返回 `source: 'official'`：Register 使用 `managed_root`
   - 可通过 IPC 传递 `trustedRootSource` 到 UI 侧
   - 或 UI 侧新增 `installRootKind` 参数可选，默认 `managed_root`

2. **DB worker runtime**：
   - `resolveInstallPluginDir` 已正确处理不同 installRootKind（`runtime.ts:235-238`）
   - `managed_root` --> `{storageRoot}/engine-plugins/managed_root/{safeRef}/`
   - catalog 文件路径中的 `manifestPath` / `packagePath` 为相对路径

3. **Pre-staged 包放置**：
   - 安装包构建时将官方插件包释放到 `engine-plugins/managed_root/` 目录
   - 首次启动时 `loadAndVerifyCatalog` + `registerLocalOfficialPlugin` 自动注册

### 8.4 向后兼容

- 现有 test fixture 继续使用 `test_root`
- 迁移期间 `test_root` 路径不变，新 `managed_root` 路径新增
- 不破坏已有 registry 记录（installRootKind 为 DB 字段，查询时按需过滤）

## 9. Real Classify Call Contract

### 9.1 接口定义

当前 `MagikaRuntime` interface（`magikaRuntimeLoader.ts:22-28`）：

```typescript
interface MagikaRuntime {
  kind: MagikaRuntimeKind
  modelVersion: string | null
  classify(input: MagikaRuntimeDetectionInput): Promise<MagikaRuntimeClassifyOutput | null>
}
```

真实 classify call 扩展为：

```typescript
// input: 受控输入（sandbox copy 或 memory bytes）
type MagikaRuntimeDetectionInput = {
  bytes: Uint8Array           // 文件内容（最大 10MB）
  filename?: string | null    // 原始文件名（仅用于 hint，不用于路径）
  mime?: string | null        // 已有 MIME hint
}

// output: 结构化结果
type MagikaRuntimeClassifyOutput = {
  label: string               // Magika 原始 label
  score: number               // 置信度 [0, 1]
}
```

### 9.2 受控 runner 要求

classify call 必须满足以下约束：

1. **通过 P3-A externalProcessRunner 执行**：runtime entry 作为子进程 spawn，带 policy/timeout/output cap
2. **或使用受控 plugin runner**：managed plugin 内部封装，同样遵守 timeout/output cap/kill tree
3. **renderer 不直接访问用户文件路径**
4. **用户文件输入优先走 sandbox copy 或受控 memory 字节流**（即 `bytes: Uint8Array`）

### 9.3 不可接受的用法（明确禁止）

- [x] renderer 直接 `import` magika
- [x] renderer 直接读取用户文件路径传给子进程
- [x] 使用 `shell: true`
- [x] 路径拼接后直接传给 magika CLI
- [x] 跳过 timeout/output cap 直接 spawn

### 9.4 classify runner 签名（P4-B implementation 阶段）

```typescript
// P4-B3 子任务包实现
type MagikaClassifyRunnerInput = {
  inputBytes: Uint8Array
  runtimeEntryPath: string
  modelDirPath: string
  configDirPath: string
  timeoutMs?: number
  maxOutputBytes?: number
}

type MagikaClassifyRunnerOutput = {
  label: string
  score: number
  modelVersion: string
  elapsedMs: number
} | {
  errorCode: 'timeout' | 'output_limit' | 'runtime_error' | 'process_kill_failed'
  detail: string
}
```

## 10. detectFull 接入边界

1. **detectFull 在 managed plugin available + healthy 时调用真实 classify**
2. 调用链路：
   ```
   detectFull --> magikaAdapter.runMagikaRuntimeProbe
     --> magikaRuntimeLoader.load()
       --> createManagedPluginMagikaRuntimeLoader
         --> discoverMagikaManagedPlugin
         --> runManagedMagikaPluginHealthCheck
         --> classify(input, descriptor)
   ```
3. 当前 `createManagedPluginMagikaRuntimeLoader`（`magikaManagedPlugin.ts:247`）已预留 `classify` 回调注入点：
   ```typescript
   classify?: (input: { probe; descriptor }) => Promise<MagikaRuntimeClassifyOutput | null>
   ```
4. **P4-B implementation 阶段**：将真实 classify runner 传入该回调
5. classify output --> `mapMagikaOutputToEvidence` --> taxonomyMap 映射 --> FileTypeEvidence
6. 失败时 evidence 为 null --> 调用方 fallback 到 lightweight detector

## 11. detectBasic 禁止接入边界

1. **detectBasic 始终不调用 Magika runtime**——无论 managed plugin 是否可用
2. detectBasic 仅使用：magic bytes / text detection / container format detection
3. 代码层面：`magikaAdapter.ts:18` 的 `createNoopMagikaAdapter()` 用于 detectBasic 路径
4. 此边界在 P3-B 已冻结，P4-B 保持不变
5. 禁止将 `runMagikaRuntimeProbe` 或任何 classify 调用注入 detectBasic 逻辑

## 12. Sandbox Copy / Controlled Input 边界

### 12.1 输入安全要求

1. **用户文件内容**：以 `Uint8Array`（memory bytes）传入 classify，不传文件路径
2. **最大输入尺寸**：建议 10MB（可在 `externalProcessPolicy` 的 `maxInputBytes` 配置）
3. **超过限制**：跳过 Magika classify，直接返回 `null`（equivalent to runtime unavailable）

### 12.2 输入来源

| 来源 | 是否允许 | 原因 |
|------|---------|------|
| `FileAsset.bytes` (Uint8Array) | 推荐 | 已有 sandbox 存储的文件副本 |
| `readFile` 到 memory | 允许 | 受控读取后传 bytes |
| 直接传用户文件路径 | 禁止 | 路径泄露风险 |
| renderer 传路径 | 禁止 | 违反 renderer-security 边界 |

### 12.3 未来扩展（P4-C / P4-D）

- 如需大文件支持，实现 sandbox copy to temp dir --> 传 temp path 给 subprocess
- P4-B 保持简单：仅 memory bytes

## 13. taxonomyMap / Unknown Label 降级边界

### 13.1 当前映射

`taxonomyMap.ts` 的 `MAGIKA_LABEL_TO_FORMAT_ID` 映射已知 Magika label 到内部 formatId。

### 13.2 降级规则

```typescript
// magikaAdapter.ts:113-133
const mapped = MAGIKA_LABEL_TO_FORMAT_ID[label]
const detectedFormatId = mapped ?? 'unknown'
const confidence = mapped ? scoreToConfidence(score) : 'low'
```

| 条件 | 结果 |
|------|------|
| label 在 taxonomyMap 中 | `detectedFormatId = 映射值`, `confidence = high/medium/low(取决于score)`, `reasonCodes = []` |
| label 不在 taxonomyMap 中 | `detectedFormatId = 'unknown'`, `confidence = 'low'`, `reasonCodes = ['reason.low_confidence']` |
| runtime 失败 | evidence = null, 调用方 fallback 到 lightweight detector |

### 13.3 约束

1. **不因 unknown label 扩展内部枚举**——保持 formatId 闭集
2. **不支持自定义 label 映射**（P4-B 非目标：不开放第三方插件生态）
3. **unknown label 始终降级为 low confidence**，不提高置信度

## 14. modelVersion 来源与 Stale/Invalidation

### 14.1 modelVersion 唯一来源

`magikaManagedPlugin.ts:39,453` 强制要求 manifest 包含 `modelVersion` 字段。

来源优先级（已由 `17-p3b2-magika-managed-plugin-plan.md` 冻结）：
1. **plugin manifest.modelVersion**（首选）
2. **model metadata 明确字段**（备选，需在 manifest 或模型文件中声明）

禁止来源：
- [x] npm package version
- [x] label 推断
- [x] 任何猜测值

### 14.2 modelVersion Changed --> Stale / Invalidation

1. **检测时机**：每次 `discoverMagikaManagedPlugin` 读取 manifest 时重新获取 `modelVersion`
2. **变化判定**：当前 modelVersion != registry 中上次记录的 modelVersion
3. **反应**：
   - 设置 `magika_model_version_changed` stale reason
   - 设置 registry 的 healthStatus 为 `degraded`（标记为需重新 health check）
   - 不自动阻断 `detectFull`——允许继续使用旧模型（降级精度）
4. **恢复**：
   - 用户手动 Health Check 后更新 modelVersion
   - 或插件更新/重装后更新
5. **P4-B implementation 未覆盖**：自动 invalidation 逻辑可在 P4-B implementation 中实现

## 15. Health Check 与 Availability

### 15.1 Health Check 流程

```
runHealthCheck (lifecycle service)
  --> discoverMagikaManagedPlugin (re-check manifest + integrity)
  --> runManagedMagikaPluginHealthCheck
    --> registry.getEngineById
    --> createDefaultHealthRunner (externalProcessRunner)
      --> spawn healthcheck.command（带 timeout / output cap）
      --> mapProcessRunToProbe
    --> markEngineHealthy / markEngineFailed
```

### 15.2 Health Check 覆盖项

由 `17-p3b2-magika-managed-plugin-plan.md` 冻结：

1. manifest 可读
2. runtime entry 存在
3. model/config 文件存在
4. integrity/hash 可校验（通过 `discoverMagikaManagedPlugin` 自动验证）
5. modelVersion 可读取
6. 可执行轻量 self-test 或 metadata command（通过 `healthcheck.command`）
7. health timeout / output cap 复用 P3-A 外部 runtime 安全底座

### 15.3 Availability 决定

```
可用 = (manifest 有效) AND (文件完整性通过) AND (health check 通过)
     AND (not 被 disable) AND (not 被 uninstall)
```

## 16. Failure Fallback Matrix

| 失败场景 | detectFull 行为 | detectBasic 行为 | EngineAvailability | Registry 状态 |
|---------|----------------|-----------------|-------------------|--------------|
| plugin 未安装 | evidence=null, Magika evidence 为空 | 无影响 | magika_unavailable | N/A |
| manifest 缺失/无效 | evidence=null, reason=manifest_invalid | 无影响 | magika_unavailable | failed |
| runtime entry 缺失 | evidence=null, reason=runtime_entry_missing | 无影响 | magika_unavailable | failed |
| 模型文件缺失 | evidence=null, reason=model_file_missing | 无影响 | magika_unavailable | failed |
| 配置文件缺失 | evidence=null, reason=config_file_missing | 无影响 | magika_unavailable | failed |
| integrity/runtime hash mismatch | evidence=null, reason=hash_mismatch | 无影响 | magika_unavailable | failed |
| integrity/model hash mismatch | evidence=null, reason=hash_mismatch | 无影响 | magika_unavailable | failed |
| integrity/config hash mismatch | evidence=null, reason=hash_mismatch | 无影响 | magika_unavailable | failed |
| manifest 路径越界 | evidence=null, reason=plugin_path_outside_root | 无影响 | magika_unavailable | failed |
| health check timeout | evidence=null, reason=engine_timeout | 无影响 | magika_timeout | failed |
| health check output limit | evidence=null, reason=output_limit_exceeded | 无影响 | magika_output_limit | failed |
| health check command not found | evidence=null, reason=engine_unavailable | 无影响 | magika_unavailable | failed |
| classify timeout | evidence=null, reason=runtime_error | 无影响 | magika_unavailable | failed（下次 health check 恢复）|
| classify process error | evidence=null, reason=runtime_error | 无影响 | magika_unavailable | failed（下次 health check 恢复）|
| classify output parse error | evidence=null, reason=runtime_error | 无影响 | magika_unavailable | failed（下次 health check 恢复）|
| catalog 签名无效 | register 失败, catalog_signature_invalid | 无影响 | N/A | N/A |
| catalog manifest hash mismatch | register 失败, hash_verification_failed | 无影响 | N/A | N/A |
| catalog package hash mismatch | register 失败, hash_verification_failed | 无影响 | N/A | N/A |
| manifest engineId mismatch | register 失败, manifest_engine_mismatch | 无影响 | N/A | N/A |
| manifest pluginVersion mismatch | register 失败, manifest_version_mismatch | 无影响 | N/A | N/A |
| trusted root unconfigured | register/list 失败 | 无影响 | N/A | N/A |
| 用户禁用插件 | evidence=null (plugin disabled) | 无影响 | magika_disabled | disabled |
| 插件已卸载 | evidence=null (plugin uninstalled) | 无影响 | magika_unavailable | uninstalled |

**核心原则**：所有 Magika 失败场景不阻断 Core Detector，不改变 `sendRouteMapping` 行为。

## 17. Gated Real-Runtime Tests

### 17.1 设计原则

- 现有测试继续使用 mock runtime / fake metadata
- 真实 runtime 测试必须 gated（gating flag + 环境变量）
- 默认 CI 跳过
- 无本地模型时 skip with explicit reason，不得 fail
- 禁止将联网下载模型作为测试前置

### 17.2 Gating 方式

```typescript
// gating flag
const REAL_MAGIKA_TESTS_ENABLED = process.env.STARVERSE_ENABLE_REAL_MAGIKA_TESTS === '1'
const REAL_MAGIKA_PLUGIN_DIR = process.env.STARVERSE_REAL_MAGIKA_PLUGIN_DIR

const describeRealMagika = REAL_MAGIKA_TESTS_ENABLED ? describe : describe.skip
```

### 17.3 测试场景（P4-B4 子任务包实现）

1. `real manifest parse test`（不需要真实 runtime）
2. `real catalog load + verify signature`（使用 real catalog fixture）
3. `real catalog entry hash match`（pre-staged package vs catalog entry hash）
4. `real health check with fake runtime`（fake runtime entry + real health runner）
5. `real health check timeout`（验证 externalProcessRunner timeout 行为）

### 17.4 Optional Real Magika Runtime Test（P4-B4）

- 需要本地安装真实 Magika 插件包
- 测试 classify 调用链路（但不验证 label 准确性）
- 测试 sandbox copy / controlled input path
- 测试 taxonomyMap 映射
- 测试 unknown label 降级

## 18. P4-B Implementation 子任务包建议

### P4-B1：Official Magika Package Specification + Trusted Root / Catalog Distribution Hardening

**范围**：
- 定义 `engines/magika/` 官方包结构（manifest、runtime、model、NOTICE、LICENSE、README）
- 定义 catalog 文件生成流程与签名方式
- 冻结 production trusted root 配置（`SV_OFFICIAL_PLUGIN_TRUSTED_ROOTS`）
- 创建 catalog 和 package 预置目录规范文档
- 创建包 build/pack 脚本（仅占位，不含真实模型）

**允许修改**：
- `docs/file-pipeline/file-type-detection-implementation/*` 文档
- `src/next/file-type/officialPluginTrustedRoots.ts`（如需完善配置文档）

**禁止**：
- 不提交真实模型文件
- 不新增 npm 依赖

### P4-B2：Managed Root / Pre-staged Package Registration Replacement for test_root

**范围**：
- 修改 `EnginePluginSettingsPanel.vue` 的 Register 逻辑：
  - 根据 `getActiveTrustedRoots()` 的 source 决定 `installRootKind`
  - 官方模式使用 `managed_root`
  - 测试模式使用 `test_root`（保留）
- 完成 DB worker runtime 的 `resolveInstallPluginDir` 中 `managed_root` 路径注入
- 确保 catalog `defaultCatalogPath` 在 production 环境下指向正确路径
- 测试补强：测试 trusted root source-aware register

**允许修改**：
- `src/ui-app/components/EnginePluginSettingsPanel.vue`
- `infra/db/worker/runtime.ts`
- `infra/files/enginePluginLifecycleService.ts`
- `src/next/file-type/index.ts`（如需导出新类型）

**禁止**：
- 不修改 EnginePluginSettingsPanel.vue 的 UI 布局——仅改 installRootKind 逻辑
- 不改 sendPlanService

### P4-B3：Real Classify Runner Contract + Gated Tests Using Fake Runtime

**范围**：
- 新增 `magikaClassifyRunner.ts`（或类似命名）：
  - 定义 `MagikaClassifyRunnerInput` / `MagikaClassifyRunnerOutput`
  - 实现受控 spawn：通过 `externalProcessRunner` 调用 runtime entry
  - 支持 sandbox copy / memory bytes 输入
  - timeout / output cap 复用 P3-A 安全底座
- 在 `magikaManagedPlugin.ts` 中连接 classify 回调
- 新增 `runtimeKind: 'local_loader'`（真实包适用）
- gated 测试（fake runtime entry）

**允许修改**：
- `src/next/file-type/magikaClassifyRunner.ts`（新增）
- `src/next/file-type/magikaManagedPlugin.ts`
- `src/next/file-type/magikaRuntimeLoader.ts`（如需扩展 runtimeKind 枚举）
- `src/next/file-type/externalEngineTypes.ts`（如需扩展类型）

**禁止**：
- 不提交真实 magika / tfjs 代码
- 不修改 `package.json` / `package-lock.json`
- 不做真实 classify 集成

### P4-B4：Optional Real Magika Local Runtime Gated Test（默认 CI 跳过）

**范围**：
- gated 测试文件 `magikaClassifyRunner.real.test.ts`
- 需要 `STARVERSE_ENABLE_REAL_MAGIKA_TESTS=1` + 本地安装真实包
- 测试：
  - classify runner spawn 正确
  - output parse 正确
  - taxonomyMap 映射覆盖
  - unknown label 降级
  - timeout behavior
  - output cap behavior
  - error handling (bad input, missing model)

**允许修改**：
- `src/next/file-type/magikaClassifyRunner.real.test.ts`（新增）

**禁止**：
- 不将 real test 纳入 CI 默认执行
- 不提交真实模型 fixture

### P4-B5：P4-B Closeout and Manual Smoke Checklist

**范围**：
- 输出 P4-B 收口报告文档
- 检查以下禁止项：
  - `magika` / `@tensorflow/tfjs` 在 package.json 中未添加
  - `provider_file_ref` 未引入
  - 敏感字段未泄露到 IPC/UI
  - Phase 4 completed 措辞未写入
  - custom marketplace / marketplaceUrl 未引入
  - custom trusted root / trustedRootUrl 未引入
- 手工烟测清单（基于真实包预置后执行）：
  1. managed_root 下预置 real Magika 包后 list installed 成功
  2. Register with managed_root 成功
  3. Health check 正常
  4. Enable / Disable 状态切换
  5. Uninstall 后状态正确
  6. 篡改模型文件后 health check 返回 hash_mismatch
  7. 篡改 catalog 后签名验证失败
  8. UI 不显示真实路径/hash/token
  9. 无 trusted root 配置时 UI 显示不可用

**允许修改**：
- `docs/file-pipeline/file-type-detection-implementation/22-p4b-closeout.md`（新增）
- `docs/file-pipeline/file-type-detection-implementation/README.md`

**禁止**：
- P4-B closeout 不代表 Phase 4 completed

## 19. 验收命令矩阵

```bash
# Working tree 检查
git status --short
git diff --name-status
git diff --stat
git diff --check

# 禁止项扫描
rg -n "provider_file_ref|providerFileRef" src/ docs/
rg -n "contentToken" src/ui-app/components/EnginePluginSettingsPanel.vue
rg -n "fullHash" src/ui-app/components/EnginePluginSettingsPanel.vue
rg -n "Phase 4 completed|全项目完成|完整插件系统已完成" docs/file-pipeline/file-type-detection-implementation
rg -n "custom marketplace|marketplaceUrl|pluginSourceUrl|custom trusted root|trustedRootUrl" docs/file-pipeline/file-type-detection-implementation
rg -n "magika|@tensorflow/tfjs" package.json package-lock.json

# 分类 runner 扫描（P4-B3 实现后）
rg -n "import magika|require\('magika'|require\(\"magika\"|from 'magika'|from \"magika\"" src/ infra/

# 路径安全扫描
rg -n "shell:\s*true" src/next/file-type/ infra/files/
rg -n "stdin.*filePath\|filePath.*stdin" src/next/file-type/ infra/files/

# 测试通过（P4-B 实现后）
npx vitest run src/next/file-type/ infra/files/ --reporter verbose 2>&1 | tail -40

# 覆盖率（可选）
npx vitest run src/next/file-type/ infra/files/ --coverage --reporter verbose 2>&1 | tail -20
```

## 20. 明确非目标与禁止项

### 20.1 P4-B 非目标

1. 不实现真实 classify call
2. 不提交真实模型文件
3. 不新增 `magika` / `@tensorflow/tfjs` 到 Starverse 主包
4. 不修改 `package.json` / `package-lock.json`
5. 不接 Tika / LibreOffice / ffprobe / Pandoc
6. 不做深度转换闭环
7. 不引入 `provider_file_ref`
8. 不做 legacy message_asset destructive cleanup
9. 不改 sendPlanService 主逻辑
10. 不重构 `appChatApp.logic.ts`
11. 不开放第三方插件生态
12. 不支持自定义 marketplace URL
13. 不支持用户自定义 trusted root
14. 不把 P4-B planning 写成 implementation completed
15. 不把 Phase 4 写成 completed

### 20.2 禁止事项

| 禁止项 | 原因 |
|--------|------|
| `shell: true` | 安全风险（P3-A 已冻结） |
| renderer 直接访问文件路径 | renderer-security 边界 |
| 将真实模型文件提交到仓库 | 体积与供应链风险 |
| 修改 package.json/lockfile | 避免主包依赖扩展 |
| 引入 marketplaceUrl | 防止第三方市场扩展 |
| 引入 trustedRootUrl | 防止用户自定义 trust root |
| 暴露 installRef/manifestHash/packageSha256 到 UI | 隐私与安全（P4-A 已脱敏，保持） |
| 将 Phase 4 标记为 completed | 阶段口径纪律 |

## 21. P4-C / P4-D 延期项边界

### 21.1 P4-C（外部转换引擎优先级与深度转换闭环规划）

- Tika / LibreOffice / ffprobe / Pandoc 的不早于 P4-B implementation 完成后启动
- 深度转换闭环（converted_markdown / converted_pdf / rendered_images / extracted_text）不进入 P4-B
- P4-C 不合并到 P4-B 实施

### 21.2 P4-D（最终验收、手工烟测与 legacy/provider 后续规划）

- 完整手工烟测延期到 P4-D / 真实 runtime 接入后
- `legacy message_asset` destructive cleanup 不进入 P4-B
- `provider_file_ref` 继续延期
- 企业策略与集中化配置治理不进入 P4-B

### 21.3 不属于 Phase 4 的延期项

- 非官方插件市场（第三方插件生态）
- 用户自定义 trusted root
- DROID / Siegfried
- 高级 polyglot 检测
- 全量插件市场

## 22. P4-B Planning 文档索引

```
docs/file-pipeline/file-type-detection-implementation/
+-- README.md                          # 目录索引（已更新）
+-- 19-phase4-planning.md              # Phase 4 规划（母文档）
+-- 20-p4a-official-plugin-marketplace-closeout.md  # P4-A 收口
+-- 21-p4b-magika-official-managed-plugin-planning.md  # 本文件（P4-B planning）
+-- (后续: 22-p4b-closeout.md, 23-p4c-planning.md, ...)
```

## 23. P4-B Planning 确认签名

- [x] 规划已完成，等待 P4-B implementation
- [x] P4-A follow-ups 登记处理方案
- [x] Magika package / model / trusted root / catalog 策略已定义
- [x] classify call contract 与 runner 签名已设计
- [x] detectFull / detectBasic 边界已确认
- [x] failure fallback matrix 已完成
- [x] gated test 策略已设计
- [x] 实施拆包建议（P4-B1~P4-B5）已完成
- [x] 非目标与禁止项已明确
- [x] P4-C / P4-D 延期边界已标记
- [x] 文档索引已更新
