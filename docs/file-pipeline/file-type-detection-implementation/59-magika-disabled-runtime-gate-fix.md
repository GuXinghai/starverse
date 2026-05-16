# Magika disabled runtime gate P1 修复记录

日期：2026-05-17

基线 HEAD：`de38098`

## 1. 原问题

`58-magika-state-file-detection-flow-audit.md` 记录的 P1 阻断项是：Magika 已安装但禁用时，`detectFull` 仍可能通过 `DbWorkerRuntime.buildMagikaRuntimeLoader()` discover 真实 runtime，并进入 `runMagikaClassify()` 启动 child process。

根因在 `infra/db/worker/runtime.ts`：旧逻辑只排除 `installState='uninstalled'`，没有检查 `enabled=true`，也没有要求 `installState='installed'`。同时它无条件追加 `engine-plugins/managed_root/magika` fallback，导致 disabled、failed、update_available 或卸载残留目录可能绕过 registry 状态。

## 2. 修复点

修复集中在 runtime candidate selection：

- 新增 `collectActiveMagikaRuntimePluginDirs()` 作为可测试的纯函数。
- 候选目录只来自 active registry 记录：`engineId === 'magika' && enabled === true && installState === 'installed'`。
- 新增 `createRegistryGatedMagikaRuntimeLoader()`，在每次 `load()` 时读取包含 tombstone 的 registry 记录，再调用该 gate 生成 `pluginDirs`。
- `buildMagikaRuntimeLoader()` 不再在 worker 构造期固定 candidate roots，而是注入每次 load 动态读取 registry 的 gated loader。
- `managed_root/magika` 不再是无条件 fallback；只有当 active registry 记录本身解析到 `managed_root/magika` 时才会被使用。
- full-mode cache compatibility 增加 availability 边界：当 runtime 变为 unavailable 时，不复用已有 Magika evidence 的 cached verdict，而是重新运行 fallback detection。

这意味着用户禁用 Magika 后，即使 worker 未重启、磁盘上仍有完整 managed plugin package，下一次 `detectFull` 也不会进入 loader discovery，更不会 spawn child process。

## 3. 状态行为

| 状态 | 修复后 runtime candidate | Magika 调用 | child process | detectFull 行为 | cache 行为 |
| --- | --- | --- | --- | --- | --- |
| `enabled=false, installState=installed` | 无 | 不调用 | 不启动 | core probes fallback，输出可用 verdict | `magikaModelVersion=null`，不会 sticky 阻止后续 enabled 重检 |
| `installState=failed` | 无 | 不调用 | 不启动 | core probes fallback | 不写入 Magika evidence |
| `installState=uninstalled` | 无 | 不调用 | 不启动 | core probes fallback | 不受残留物理目录影响 |
| `installState=update_available` | 无 | 不调用 | 不启动 | core probes fallback | 不把更新态当 active runtime |
| no plugin / no registry record | 无 | 不调用 | 不启动 | core probes fallback | 后续 active install 后可按版本/evidence 规则重检 |
| `enabled=true, installState=installed` | registry 解析出的安装目录 | 可调用 | 仅在 discovery/health 通过且 classify 需要时启动 | Magika evidence 与 magic/text/container 合并 | 使用 runtime modelVersion 参与 cache compatibility |

## 4. managed_root fallback 策略

本次修复删除 worker runtime 的无条件 `managed_root/magika` fallback。

开发或 smoke 测试仍可通过显式注入 `createManagedPluginMagikaRuntimeLoader({ pluginDirs: [...] })` 或 real-test 环境变量指定 Magika 插件目录；这些路径不经过 persisted registry gate，因此不会覆盖用户的 disabled 状态。生产 worker 只信任 registry active 记录。

## 5. 测试结果

新增/更新覆盖：

- `infra/db/worker.magikaRuntimeLoader.test.ts`
  - no record 不产生候选。
  - `enabled=true && installState=installed` 产生候选。
  - `managed_root` 只有作为 active registry root 时才可用。
  - `enabled=false` 不 fallback 到 managed_root。
  - `failed / uninstalled / update_available` 不产生候选。
  - `installRef` 仍按既有规则 sanitize。
  - live worker 场景下 registry 从 enabled 切到 disabled 后，下一次 loader `load()` 会重新读取 registry 并返回 unavailable。
- `infra/files/fileTypeDetectionService.test.ts`
  - 当 registry gate 移除全部 plugin root 时，`detectFull` 仍返回 fallback verdict。
  - 不产生 Magika evidence。
  - `magikaModelVersion` 为 `null`。
  - loader classify callback 不会被调用。
  - 已缓存 Magika evidence 后 runtime 变为 unavailable 时，不从 cache 复用旧 verdict，而是写入新的 no-Magika fallback verdict。

已运行：

```powershell
npx vitest --run infra/db/worker.magikaRuntimeLoader.test.ts infra/files/fileTypeDetectionService.test.ts
```

结果：2 个 test files 通过，28 个 tests 通过。

## 6. 剩余 follow-ups

### P0 blocker

0 个。

### P1 下一个大主题前应修

0 个已知剩余 P1。原 P1 disabled runtime gate 已修复，仍需通过 scoped tests、lint 和 risk review 后合入。

### P2 hardening

- worker 初始化普通日志仍会输出本地绝对路径；建议后续改为 debug-only 或 sanitized。
- send plan 在无 verdict 时仍有 legacy semantic fallback；建议后续明确发送前是否必须具备至少 basic verdict。
- disabled/unavailable diagnostic 未直接进入 FileTypeVerdict provenance；建议保持 detection cache 不被 availability 污染的前提下补独立诊断事件。

### P3 polish

- 文档中 `src/next/file-type/fileTypeDetectionService.ts` 的历史路径别名可在后续统一为真实路径 `infra/files/fileTypeDetectionService.ts`。

## 7. 结论

本修复消除了 Magika disabled/failed/uninstalled/update_available 状态绕过 registry 并 discover runtime 的路径。`detectFull` 在非 active Magika 状态下回到 magic/text/container/extension/MIME/evidence merge/static policy fallback；在 active installed enabled 状态下仍通过 registry 安装目录进入 managed runtime loader。
