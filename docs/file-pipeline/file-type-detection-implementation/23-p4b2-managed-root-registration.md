# P4-B2：Managed Root / Official Pre-staged Package Registration Replacement

Status: **P4-B2 completed**

## 1. 目标

1. 完成 `test_root` 到 `managed_root` / official pre-staged root 的生产安全替换。
2. 确保 UI 不在生产路径硬编码 `test_root`。
3. `test_root` 只能在 test/dev 下使用。
4. `register Local Official Plugin` 使用 production-safe root kind。
5. 无需新增枚举——复用 `managed_root`。
6. registry 不存裸绝对路径（P4-A 已有的 `installRef` 校验已覆盖，无需改动）。
7. 不删除文件，不做真实安装器，不做 zip 解包。

## 2. installRootKind 生产安全强制

### 2.1 强制规则

| trustedRootSource | 允许的 installRootKind | 拒绝的 installRootKind |
|---|---|---|
| `official` | `managed_root`, `managed_cache` | `test_root` |
| `test` | `managed_root`, `managed_cache`, `test_root` | — |
| `null` / unconfigured | — | 所有（早期拒绝 `official_trusted_root_unconfigured`） |

### 2.2 实现

`enginePluginLifecycleService.ts` 新增私有方法 `isValidInstallRootKind()`:

```typescript
private isValidInstallRootKind(kind: string): boolean {
  if (kind !== 'managed_root' && kind !== 'test_root' && kind !== 'managed_cache') return false
  if (this.deps.trustedRootSource === 'official' && kind === 'test_root') return false
  return true
}
```

在 `registerLocalOfficialPlugin` 中，catalog 查找成功后、路径解析前插入校验：
- 不合法 → 返回 `install_root_kind_mismatch`
- 合法 → 继续正常注册流程

### 2.3 与 P4-B1 的联动

P4-B1 已将 UI 端 `installRootKind` 从硬编码 `test_root` 切换为 API 返回的 `recommendedInstallRootKind`。P4-B2 在服务端补强了 enforcement layer，确保即使 UI 传入非法值也会被拒绝。

链路：
```
UI: doRegister(row.recommendedInstallRootKind)
  → client: registerLocalOfficialPlugin({ installRootKind })
    → IPC → worker handler
      → service.registerLocalOfficialPlugin()
        → isValidInstallRootKind() ← enforcement layer (P4-B2)
```

## 3. 测试补强

### enginePluginLifecycleService.test.ts

新增 2 个测试：
- `rejects test_root when trusted root source is official` — 验证 production 模式拒绝 `test_root`
- `accepts test_root when trusted root source is test` — 验证 test 模式允许 `test_root`

修改 1 个测试：
- `registers local official plugin via catalog signature and hash verification` — 使用 `trustedRootSource: 'official'` + `installRootKind: 'managed_root'`

### enginePluginLifecycleClient.test.ts

修复 mock 数据：`listOfficialPlugins` 响应增加 `recommendedInstallRootKind` 字段（P4-B1 新增的必填字段）。

## 4. 修改文件清单

### 修改
1. `infra/files/enginePluginLifecycleService.ts` — 新增 `isValidInstallRootKind()`、新增 `install_root_kind_mismatch` failure reason、注册前置校验
2. `infra/files/enginePluginLifecycleService.test.ts` — 新增 2 个测试、修复 1 个测试
3. `src/next/files/enginePluginLifecycleClient.test.ts` — 修复 mock 数据

### 新增
4. `docs/file-pipeline/file-type-detection-implementation/23-p4b2-managed-root-registration.md`

## 5. 非变更项确认

- [x] `enginePluginRegistryRepo.ts` — 无需变更（`installRef` 校验已在 P4-A 覆盖）
- [x] `enginePluginLifecycleContracts.ts` — 无需变更（P4-B1 已更新 `recommendedInstallRootKind`）
- [x] `enginePluginLifecycleClient.ts` — 无需变更（仅透传参数）
- [x] `EnginePluginSettingsPanel.vue` — 无需变更（P4-B1 已更新）
- [x] 不新增枚举 — `managed_root` 复用现有枚举
- [x] 不修改 DB schema / migration
- [x] 不删除文件
- [x] 不做真实安装器

## 6. 下一步

P4-B3：Real classify runner contract + fake runtime tests（实现 Magika classify runner contract，使用 fake runtime 测试，不接真实 Magika）。
