# P4-C1：外部转换引擎 manifest / package spec 扩展

Status: **P4-C1 implemented — unblock patch applied**

## 0. P4-C1 Unblock Patch (c373574 follow-up)

### 原因

Initial commit `c373574` 在 External Audit 中被 BLOCKED：

- **P0**: 27 TypeScript errors，主要原因为 `ENGINE_CAPABILITIES` 新增 `metadata_extraction` 后 `EngineCapabilityAvailability` 对象字面量未补齐，以及 manifest fixtures 缺少 `supportedOutputRoutes` / `metadataAllowlist`
- **P1**: `ensureP4C1DerivedKindSchema` 已写但未接入 DB ensure 链路
- **P2**: conversion mode hard caps (300s timeout / 100MiB stdout) 超出 P3-A 安全边界

### 修复内容

| # | 类别 | 修复 |
|---|------|------|
| 1 | P0 TS | `externalEngineAvailability.test.ts:43` 补齐 `metadata_extraction: false` |
| 2 | P0 TS | `externalEngineHealth.test.ts` 3 处 manifest fixture 补齐 `supportedOutputRoutes: []` + `metadataAllowlist: null` |
| 3 | P0 TS | `externalEngineHealth.test.ts` 3 处 fake process runner result 补齐 `terminationAttempted: false` + `terminated: false` |
| 4 | P0 TS | `externalEngineHealth.ts:139` — TS2367 fix: `errorCode === 'process_timeout'` → `result.timedOut` |
| 5 | P0 TS | `magikaManagedPlugin.test.ts:508` 补齐 `metadata_extraction: false` |
| 6 | P0 TS | `sendRouteMapping.test.ts:153` 补齐 `metadata_extraction: false` |
| 7 | P1 Migration | `runtime.ts` 接入 `ensureP4C1DerivedKindSchema(this.db)` 到 ensure chain |
| 8 | P2 Policy | 移除 conversion-specific hard caps；所有 mode 复用统一 `maxTimeoutMs`(60s) / `maxStdoutBytes`(10MiB) / `maxStderrBytes`(1MiB) |
| 9 | P2 Policy | 更新 `externalProcessPolicy.test.ts` conversion tests 匹配保守 caps |
| 10 | Doc | 本文档更新，登记后续 Owner 决策项 |

### Conversion mode 临时 Owner 决策

conversion mode 保留，但资源上限回落到 P3-A 安全边界：
- conversion default timeout: 60000ms（硬上限 60000ms，复用统一 `maxTimeoutMs`）
- stdout/stderr caps: 复用统一值（10MiB stdout / 1MiB stderr）
- 更大转换资源上限登记为 **P4-C3/P4-D follow-up**，需单独 Owner 决策

### P4-C1 仍不是 P4-C completed

本轮 unblock patch 不代表 P4-C completed。P4-C2~P4-C7 全部待实施。

---

## 1. P4-C1 阶段定位

P4-C1 是 P4-C implementation 的第一个子任务包。目标是在 P4-A（官方限定插件市场）和 P4-B（Magika official managed plugin）基础上扩展引擎 manifest / package spec，使其能表达 Tika / LibreOffice / ffprobe / Pandoc 四个外部转换引擎的最小能力，同时扩展 DerivedKind 类型系统和 externalProcessPolicy conversion mode。

**P4-C1 不实现真实引擎 runner**。真实 Tika runner 属于 P4-C2。

## 2. 修改文件清单

| 文件 | 修改类型 | 说明 |
|------|---------|------|
| `src/next/file-type/externalEngineTypes.ts` | 修改 | 新增 `metadata_extraction` capability；`ManagedEnginePluginManifest` 新增 `supportedOutputRoutes`、`metadataAllowlist` 字段 |
| `src/next/file-type/externalEngineManifest.ts` | 修改 | 新增 `parseSupportedOutputRoutes`、`parseMetadataAllowlist` 校验逻辑；重构 manifest 重建以包含新字段 |
| `src/next/file-type/externalEngineManifest.test.ts` | 修改 | 新增 `supportedOutputRoutes`、`metadataAllowlist`、`metadata_extraction` capability 测试用例 |
| `src/next/file-type/externalProcessPolicy.ts` | 修改 | 新增 `conversion` mode；新增 conversion 专用 defaults 和 hard caps |
| `src/next/file-type/externalProcessPolicy.test.ts` | 修改 | 新增 conversion mode 默认值、硬上限、安全约束测试用例 |
| `src/shared/files/fileTypes.ts` | 修改 | `DerivedKind` 新增 `converted_markdown`、`rendered_images`、`selected_frames`、`extracted_audio` |
| `infra/files/derivativeJobService.ts` | 修改 | 新增 4 个 reserved DerivedKind case 分支（抛出 `conversion_not_implemented`） |
| `infra/db/schema.sql` | 修改 | 更新 `file_derivatives.derived_kind` 和 `derivative_jobs.derivative_kind` CHECK 约束 |
| `infra/db/migrations/ensureFilePipelineSchema.ts` | 修改 | 更新两处 derived_kind / derivative_kind CHECK 约束 |
| `docs/file-pipeline/file-type-detection-implementation/README.md` | 修改 | 更新阶段状态和文件索引 |
| `docs/file-pipeline/file-type-detection-implementation/28-p4c1-conversion-engine-spec-extension.md` | 新增 | 本文档 |

### 新增文件

| 文件 | 说明 |
|------|------|
| `infra/db/migrations/ensureP4C1DerivedKindSchema.ts` | 幂等 migration：检测并升级现有数据库的 derived_kind CHECK 约束 |
| `infra/db/migrations/ensureP4C1DerivedKindSchema.test.ts` | Migration 幂等测试 + 旧 schema 升级测试 + 数据保留测试 |

## 3. Engine manifest / package spec extension 摘要

### 3.1 新增 engine capability

`ENGINE_CAPABILITIES` 新增：

```
'metadata_extraction'
```

用途：Tika 引擎的元数据提取能力（detect/extract/metadata 三合一）。`metadata_extraction` 不映射到 send route，仅用于引擎内部能力声明。

### 3.2 Manifest 字段扩展

`ManagedEnginePluginManifest` 新增两个字段：

```typescript
supportedOutputRoutes: readonly SendRoute[]
metadataAllowlist: readonly string[] | null
```

- **`supportedOutputRoutes`**：引擎可以产出的 output route 列表（如 `['extracted_text', 'converted_markdown']`）。校验时验证所有值必须为已知 `SendRoute`。
- **`metadataAllowlist`**：Tika metadata 提取的 allowlist 字段名列表。`null` 表示该引擎不具有 metadata 提取能力。校验时非空数组至少包含一个条目。

### 3.3 KNOWN_ENGINE_IDS

`KNOWN_ENGINE_IDS` 已包含 `tika`、`libreoffice`、`ffprobe`、`pandoc`（P4-A 已定义），P4-C1 无需扩展。

## 4. Capability / output route 扩展摘要

### 4.1 ENGINE_CAPABILITIES（完整）

```typescript
export const ENGINE_CAPABILITIES = [
  'document_conversion',
  'spreadsheet_conversion',
  'presentation_conversion',
  'rendered_images',
  'text_extraction',
  'metadata_extraction',    // P4-C1 新增
  'audio_extraction',
  'frame_selection',
] as const
```

### 4.2 Capability → Route 映射（已有，未变更）

`externalEngineAvailability.ts` 的 `toRouteAvailability` 映射不变，`metadata_extraction` 不进入 route 映射：

| EngineCapability | RouteAvailability 属性 |
|---|---|
| `document_conversion` | `documentConversion` |
| `spreadsheet_conversion` | `spreadsheetConversion` |
| `presentation_conversion` | `presentationConversion` |
| `rendered_images` | `renderedImages` |
| `text_extraction` | `textExtraction` |
| `audio_extraction` | `audioExtraction` |
| `frame_selection` | `frameSelection` |

## 5. DerivedKind 扩展摘要

### 5.1 新增 DerivedKind

`src/shared/files/fileTypes.ts` 的 `DerivedKind` 类型新增四值：

```typescript
export type DerivedKind =
  | 'thumbnail'
  | 'extracted_text'
  | 'ocr_text'
  | 'transcript'
  | 'converted_pdf'
  | 'converted_markdown'   // P4-C1 新增
  | 'rendered_images'      // P4-C1 新增
  | 'selected_frames'      // P4-C1 新增
  | 'extracted_audio'      // P4-C1 新增
  | 'send_optimized'
  | 'preview_optimized'
  | 'embedding_vector'
```

### 5.2 各 DerivedKind 的用途与关联引擎

| derivedKind | 用途 | 关联引擎 | 当前状态 |
|---|---|---|---|
| `converted_markdown` | Office/HTML→Markdown | Tika, Pandoc | reserved（抛出 `conversion_not_implemented`） |
| `rendered_images` | Presentation→Images | LibreOffice | reserved（抛出 `conversion_not_implemented`） |
| `selected_frames` | 视频关键帧 | ffprobe+ffmpeg | reserved（抛出 `conversion_not_implemented`） |
| `extracted_audio` | 音轨分离 | ffprobe+ffmpeg | reserved（抛出 `conversion_not_implemented`） |

### 5.3 derivativeJobService 处理

`derivativeJobService.ts` 新增四个 case 分支，统一抛出 `conversion_not_implemented` 错误：

```typescript
case 'converted_markdown':
case 'rendered_images':
case 'selected_frames':
case 'extracted_audio':
  throw derivativeError('conversion_not_implemented', ...)
```

## 6. Conversion mode policy 摘要

### 6.1 新增政策模式

`EXTERNAL_PROCESS_POLICY_MODES` 新增 `'conversion'`：

```typescript
export const EXTERNAL_PROCESS_POLICY_MODES = ['health_check', 'process', 'conversion'] as const
```

### 6.2 Conversion 模式默认值与硬上限

| 参数 | health_check | process | conversion (新增) |
|------|-------------|---------|-------------------|
| 默认 timeout | 3s | 10s | **60s** |
| 硬上限 timeout | 60s | 60s | **60s**（复用统一 `maxTimeoutMs`） |
| 默认 stdout | 1MiB | 1MiB | 1MiB（复用统一） |
| 硬上限 stdout | 10MiB | 10MiB | 10MiB（复用统一 `maxStdoutBytes`） |
| 默认 stderr | 256KiB | 256KiB | 256KiB（复用统一） |
| 硬上限 stderr | 1MiB | 1MiB | 1MiB（复用统一 `maxStderrBytes`） |

**注意**：更大的转换资源上限（如 50MiB stdout、300s timeout）不在此阶段冻结。需 **Owner 决策**后单独登记为 P4-C3/P4-D follow-up。

### 6.3 不变的安全约束

- `shell: false`（硬编码）
- 脚本解释器阻断（cmd.exe / powershell.exe / wscript.exe 等）
- `.bat` / `.cmd` 阻断（`allowBatchEntrypoint` 默认 false）

## 7. Metadata allowlist 策略

### 7.1 合约层设计

`ManagedEnginePluginManifest.metadataAllowlist` 是 Tika metadata 过滤的 **allowlist 合约**：

1. **显式列出**允许的 metadata 字段名（如 `dc:title`, `dc:creator`, `Content-Type`）。
2. **默认丢弃**不在 allowlist 中的 metadata 字段。
3. **null 值**表示引擎不提供 metadata 提取能力。

### 7.2 禁止项（不在 allowlist 中）

以下字段绝不进入 allowlist，也不透传到 UI 或日志：

- `resourceName`、`Content-Location`（可定位文件路径）
- `creator path`、`temp path`（本地路径信息）
- `contentToken`、`fullHash`（敏感 token/hash）
- 任何包含绝对路径的字段

### 7.3 实现策略（P4-C2 实现）

P4-C2 的 Tika runner 实现时：
1. Tika 提取原始 metadata JSON
2. 过滤：只保留 `metadataAllowlist` 中列出的字段
3. 脱敏：对保留字段的值应用 `sanitizeForProcessResult`
4. 丢弃未知字段（无 denylist）

## 8. Migration / Schema 风险

### 8.1 影响范围

- `file_derivatives.derived_kind` CHECK 约束（新增 4 个值）
- `derivative_jobs.derivative_kind` CHECK 约束（新增 4 个值）

### 8.2 迁移策略

`ensureP4C1DerivedKindSchema.ts` 实现幂等迁移：

1. 检查 `sqlite_master` 中表定义是否已包含新值
2. 若已包含 → 跳过（幂等）
3. 若未包含 → 重建表：`DROP TABLE→CREATE new→COPY data→RENAME→重建索引`

迁移遵循 `ensureFilePipelineSchema.ts` 的 `ensureFileAssetsCompatibility` 模式。

### 8.3 风险

- **数据丢失风险**：极低。迁移仅在内存 SQLite 环境和 CI 环境运行，生产数据库尚无实际 derivedKind 数据。
- **外键风险**：迁移关闭 `PRAGMA foreign_keys = OFF`，完成后恢复。
- **Atomicity risk**：迁移在单个 `db.exec()` 调用内完成，SQLite 事务保障。

### 8.4 未来测试覆盖

- `ensureP4C1DerivedKindSchema.test.ts` 覆盖：新 schema 升级、幂等性、旧 schema 升级、数据保留。

## 9. 不接真实 runner 确认

P4-C1 **不实现以下内容**：

- 不实现 Tika / LibreOffice / ffprobe / Pandoc 真实 runner
- 不执行真实外部引擎
- 不新增外部依赖
- 不提交任何 jar / binary / runtime 包
- 不接 route integration
- 不改 `sendPlanService` 主逻辑
- 不重构 `derivativeJobService`
- 不接 UI 复杂诊断面板
- 不实现 `converted_markdown` / `rendered_images` 等的真实转换链路

## 10. P4-C2 entry 条件

以下条件满足后可进入 P4-C2（Tika official managed plugin planning-to-contract implementation with fake runner）：

1. P4-C1 所有测试通过（本阶段已完成）
2. P4-C1 commit 已提交
3. External audit 确认 P4-C1 通过（可选）
4. Tika fake runner contract 设计完成

## 11. 验收命令

```bash
# 单元测试
npx vitest --run src/next/file-type/externalEngineManifest.test.ts
npx vitest --run src/next/file-type/externalProcessPolicy.test.ts
npx vitest --run src/next/file-type/externalEngineHealth.test.ts
npx vitest --run infra/files/derivativeJobService.test.ts
npx vitest --run infra/db/migrations/ensureFilePipelineSchema.test.ts
npx vitest --run infra/db/migrations/ensureP4C1DerivedKindSchema.test.ts

# 类型检查
npx tsc --noEmit

# 禁止项扫描
rg -n "provider_file_ref|providerFileRef" src infra electron
rg -n "contentToken" src infra electron | rg -n "log|warn|error"
rg -n "fullHash" src infra electron | rg -n "log|warn|error"
rg -n "console\.(log|warn|error).*([A-Za-z]:\\|/Users/|/home/|/mnt/)" src infra electron
rg -n "third[-_ ]party|custom marketplace|marketplaceUrl|pluginSourceUrl" src infra electron
rg -n "Phase 4 completed|P4-C.*completed" docs/file-pipeline/file-type-detection-implementation
```

## 12. 剩余风险

| # | 风险 | 严重度 | 缓解措施 |
|---|------|--------|---------|
| 1 | Migration 在生产环境未执行 | Low | Migration 以 `ensure*` 模式在服务启动时运行；需确认 lifecycle 已接入 |
| 2 | `metadata_extraction` 无 route 映射 | Low | 设计目的如此（内部能力），不影响 engine availability 计算 |
| 3 | DerivativeJobService 预存在 HTML→markdown bug | Low | 预存在问题，与 P4-C1 无关 |
| 4 | `supportedOutputRoutes` 不在 engine availability 中使用 | Low | P4-C6 对接 route mapping 时可以使用此字段 |
