# P4-B1：Magika Package Specification + Trusted Root / Catalog Distribution Hardening

Status: **P4-B1 completed**

## 1. 目标

1. 固化 official Magika package specification 到代码级边界。
2. 明确 package layout validation 的代码级边界。
3. 补强 catalog/package distribution 的 local official package 语义。
4. 将 P4-A settings UI 中 `test_root` 语义替换为 production-safe 的 `recommendedInstallRootKind`（由 trusted root source 驱动）。
5. 确认 `runtimeKind` 无需扩展——现有 `local_loader` / `managed_plugin` / `mock` / `unavailable` / `adapter_only` 已足够。
6. 不接真实 classify call。
7. 不提交真实模型文件。

## 2. Package Layout Specification

### 2.1 `MagikaPackageLayoutSpec`（`magikaManagedPlugin.ts`）

```typescript
export type MagikaPackageLayoutSpec = Readonly<{
  rootDirName: string        // 'engines/magika'
  requiredFiles: readonly string[]  // ['manifest.json']
  requiredDirs: readonly string[]   // ['runtime', 'model']
  optionalFiles: readonly string[]  // ['NOTICE', 'LICENSE', 'ATTRIBUTION', 'README.md']
}>
```

### 2.2 `validateMagikaPackageLayout()`

验证插件根目录是否存在必须文件和目录：

- `manifest.json` 必须存在
- `runtime/` 目录必须存在
- `model/` 目录必须存在
- `NOTICE`、`LICENSE`、`ATTRIBUTION`、`README.md` 可选（不强制）

验证失败返回结构化错误（`valid: false, reason, detail`）。

### 2.3 runtimeKind 确认

当前 `MagikaRuntimeKind` 枚举（`magikaRuntimeLoader.ts:1`）：

- `mock` — 用于测试/MVP 占位
- `unavailable` — runtime 不可用
- `local_loader` — 官方预置包 runtime（生产路径）
- `adapter_only` — 仅 adapter 层工作

**结论：无需扩展**。`local_loader` 已能完整表达官方预置 Magika 包的 runtime 语义。

## 3. Recommended Install Root Kind

### 3.1 驱动逻辑

```text
getActiveTrustedRoots() source:
  'official'  →  recommendedInstallRootKind = 'managed_root'
  'test'      →  recommendedInstallRootKind = 'test_root'
  unconfigured →  N/A（UI 显示未配置警告，不展示 Register 按钮）
```

### 3.2 修改链路

1. `enginePluginLifecycleService.ts` — 新增 `trustedRootSource` dep，新增 `getRecommendedInstallRootKind()` 私有方法。
2. `OfficialPluginDto` — 新增 `recommendedInstallRootKind` 字段。
3. IPC contracts（`enginePluginLifecycleContracts.ts`）— `officialPluginSchema` 新增 `recommendedInstallRootKind`。
4. `infra/db/worker/runtime.ts` — 将 `activeTrustedRoots.source` 注入 lifecycle service。
5. `EnginePluginSettingsPanel.vue` — `doRegister` 使用 `recommendedInstallRootKind` 替代硬编码 `test_root`。
6. `OfficialRow` 类型新增 `recommendedInstallRootKind` 字段。

## 4. 测试补强

### magikaManagedPlugin.test.ts

新增 4 个测试：
- `validates package layout with required files and dirs`
- `rejects package layout when manifest is missing`
- `rejects package layout when runtime dir is missing`
- `rejects package layout when model dir is missing`

### enginePluginLifecycleService.test.ts

新增 2 个测试：
- `includes recommendedInstallRootKind in listOfficialPlugins response`
- `returns managed_root when trusted root source is official`

### EnginePluginSettingsPanel.test.ts

新增 1 个测试：
- `passes recommendedInstallRootKind from response to register request`

更新 mock 数据以包含 `recommendedInstallRootKind`。

## 5. 非目标确认

- [x] 不接真实 classify call
- [x] 不提交真实模型文件
- [x] 不新增 magika / tfjs 依赖
- [x] 不修改 package.json / package-lock.json
- [x] 不新增 runtimeKind 枚举值
- [x] 不破坏已有 DB schema / repo
- [x] 不修改 sendPlanService
- [x] test_root 仅在测试/开发环境使用，生产环境使用 managed_root

## 6. 修改文件清单

### 修改
1. `src/next/file-type/magikaManagedPlugin.ts` — 新增 `MagikaPackageLayoutSpec`、`validateMagikaPackageLayout()`
2. `src/next/file-type/magikaManagedPlugin.test.ts` — 新增 package layout 验证测试
3. `infra/files/enginePluginLifecycleService.ts` — 新增 `trustedRootSource` dep、`recommendedInstallRootKind` 字段
4. `infra/files/enginePluginLifecycleService.test.ts` — 新增 recommended root kind 测试
5. `src/next/ipc/contracts/enginePluginLifecycleContracts.ts` — 新增 `recommendedInstallRootKind` 字段
6. `infra/db/worker/runtime.ts` — 注入 `trustedRootSource`
7. `src/ui-app/components/EnginePluginSettingsPanel.vue` — 使用 `recommendedInstallRootKind`
8. `src/ui-app/components/EnginePluginSettingsPanel.test.ts` — 新增 installRootKind 传递测试

### 新增
9. `docs/file-pipeline/file-type-detection-implementation/22-p4b1-magika-package-spec-and-distribution.md`

## 7. 下一步

P4-B2：Managed root / official pre-staged package registration replacement（深化 registry 侧 managed_root 语义、补全注册路径测试、确认 DB 层 installRootKind 校验一致性）。
