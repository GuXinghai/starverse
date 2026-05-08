# P4-B4：detectFull Integration + Gated Real-Runtime Test Scaffold

Status: **P4-B4 completed**

## 1. 目标

1. 将 Magika classify runner contract 接入 `detectFull` 可用路径。
2. `detectBasic` 始终不调用真实 Magika（已有代码保证，新增测试验证）。
3. Runtime unavailable / health failed / classify failed → fallback 到 lightweight detector。
4. Magika evidence 不覆盖 strong magic / successful containerProbe / executable strong magic（evidence scoring 已保证）。
5. `modelVersion` 写入 provenance。
6. `modelVersion` changed → stale / invalidation（已有代码保证，新增测试验证）。
7. 增加 gated real-runtime test scaffold：
   - 默认 CI skip
   - 需显式环境变量 `STARVERSE_ENABLE_REAL_MAGIKA_TESTS=1`
   - 无本地模型时 skip with explicit reason
   - 禁止联网下载模型

## 2. detectFull 集成（已有边界确认）

### 2.1 调用链路

```
detectFull → detectWithMode('full', ...)
  → loadMagikaRuntimeState()
  → assembleVerdict()
    → if (mode === 'full' && magikaRuntimeState)
      → runMagikaRuntimeProbe(loader, input)
        → loader.load()
        → runtime.classify(probe)  ← classify callback (P4-B3)
        → mapMagikaOutputToEvidence(raw, { modelVersion, runtimeKind })
```

### 2.2 detectBasic 不调用 Magika

```typescript
// fileTypeDetectionService.ts:169
const magikaRuntimeState = mode === 'full' ? await this.loadMagikaRuntimeState() : null
// fileTypeDetectionService.ts:283
if (input.mode === 'full' && input.magikaRuntimeState) { /* Magika probe */ }
```

`detectBasic` 永远不会加载 Magika runtime state，因此不会执行 classify 调用。

已有测试 `does not invoke magika plugin loader during detectBasic` 验证了 `loadCalls === 0`。

### 2.3 Magika Evidence 计分

evidenceMerge 中 Magika 的 base score 为 700，低于：
- `container_probe` (1000)
- `magic` (900)

加上 confidence 加成后，Magika 在正常场景下不会覆盖 strong magic 或 containerProbe。此计分策略已在 Phase 3 冻结，P4-B 保持不变。

### 2.4 modelVersion 写入与 Stale

```typescript
// fileTypeDetectionService.ts:206-214
const resolvedVersionInfo: FileTypeVerdictVersionInfo = {
  ...this.versionInfo,
  magikaModelVersion:
    assembled.magikaModelVersion ??
    magikaRuntimeState?.modelVersion ??
    (magikaRuntimeState ? null : this.versionInfo.magikaModelVersion),
}
```

`modelVersion` 写入 `versionInfo.magikaModelVersion`。`modelVersion` 变化时通过 `resolveModelVersionStaleReason` 返回 `'magika_model_version_changed'`，触发 stale 标记。

已有测试 `invalidates full-mode cache when magika model version changes` 验证了此行为。

## 3. Gated Real-Runtime Test Scaffold

### 3.1 文件

`src/next/file-type/magikaClassifyRunner.real.test.ts`

### 3.2 Gating 机制

```typescript
const MAGIKA_TESTS_ENABLED = process.env.STARVERSE_ENABLE_REAL_MAGIKA_TESTS === '1'
const MAGIKA_PLUGIN_DIR = process.env.STARVERSE_REAL_MAGIKA_PLUGIN_DIR ?? ''
const describeRealMagika = MAGIKA_TESTS_ENABLED ? describe : describe.skip
```

- `STARVERSE_ENABLE_REAL_MAGIKA_TESTS` 未设置或不为 `'1'` → 整个 describe block 被 `describe.skip`
- `STARVERSE_REAL_MAGIKA_PLUGIN_DIR` 未设置 → 每个测试内部跳过并 warn
- 默认 CI 不执行，不 fail

### 3.3 测试场景

| # | 测试 | 说明 |
|---|------|------|
| 1 | real manifest parse | 从真实预置包解析 manifest |
| 2 | real runtime entry executable | 检查 runtime entry 文件可读 |
| 3 | classify runner with real runtime | 真实 runtime 分类调用（60s timeout） |
| 4 | classify runner empty input | 空输入分类测试 |
| 5 | input too large (non-gated) | 11MB 输入拒绝测试（不依赖 runtime） |

## 4. 测试补强

### fileTypeDetectionService.test.ts

新增 1 个测试：
- `runs detectFull with classify callback through mock runtime loader` — 验证 classify callback 通过 runtime loader 集成到 detectFull

## 5. 非目标确认

- [x] 不提交真实模型文件
- [x] 不新增 magika / tfjs 依赖
- [x] 不修改 package.json / package-lock.json
- [x] `detectBasic` 不调用 Magika（已验证）
- [x] Magika evidence 不覆盖 strong magic / containerProbe（evidence scoring 已保证）
- [x] modelVersion stale 机制已存在
- [x] 真实 runtime 测试 gated / CI skip

## 6. 修改/新增文件清单

### 新增
1. `src/next/file-type/magikaClassifyRunner.real.test.ts` — 5 个 gated 真实 runtime 测试
2. `docs/file-pipeline/file-type-detection-implementation/25-p4b4-detectfull-gated-runtime.md`

### 修改
3. `infra/files/fileTypeDetectionService.test.ts` — 新增 1 个 classify callback 集成测试

## 7. 下一步

P4-B5：P4-B closeout and manual smoke checklist。
