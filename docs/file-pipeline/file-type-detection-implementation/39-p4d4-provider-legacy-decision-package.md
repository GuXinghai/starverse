# 39. P4-D4 provider_file_ref / Legacy message_asset Decision Package

**状态**: Completed
**日期**: 2026-05-10
**阶段**: P4-D4 (Phase 4 final acceptance — provider/legacy decision)
**父文档**: `35-p4d-final-acceptance-planning.md`

P4-D4 不代表 Phase 4 completed。只做 decision package，不做实现。

---

## 1. 定位

明确 `provider_file_ref` 和 legacy `message_asset` 的当前状态、后续边界、Phase 5 entry criteria。不引入实现，不做 destructive cleanup，不修改 DB schema，不修改 sendPlanService/derivativeJobService/OpenRouter/appChatApp.logic.ts。为 P4-D5 closeout 和 Phase 5 planning 提供决策输入。

---

## 2. provider_file_ref 当前状态

### 2.1 决策历史

| 阶段 | 决策 | 来源 |
|------|------|------|
| Step 0 | provider_file_ref 不进入 MVP | `05-owner-decisions-before-step2.md` |
| Phase 1-3 | 未引入 | MVP closeout |
| Phase 4 | 未引入 | P4-A/B/C closeout confirmed |
| P4-D1 | FB-1 scan: 7 non-docs references (pre-existing) | §5 |
| P4-D3 | P1-3: IPC schema accepts provider_file_ref without guard | §14.4 |

### 2.2 当前引用清单 (7 non-docs hits)

| # | 文件 | 行 | 类别 | 内容 |
|---|------|----|------|------|
| 1 | `src/shared/files/fileTypes.ts` | 62 | Type def | `SendMode` union literal: `'provider_file_ref'` |
| 2 | `infra/db/validation.ts` | 496 | Zod schema | `preferredDraftSendModes` array includes `provider_file_ref` |
| 3 | `src/next/ipc/contracts/dbBridgeContracts.ts` | 615 | IPC contract | `selectedSendMode` enum includes `provider_file_ref` |
| 4 | `src/next/ipc/contracts/dbBridgeContracts.ts` | 616 | IPC contract | `fallbackSendModes` array includes `provider_file_ref` |
| 5 | `src/ui-app/app/appChatApp.logic.ts` | 4372 | UI label | `'provider_file_ref' → '提供方文件'` |
| 6 | `src/next/openrouter/openRouterSendPlanSerializer.ts` | 425 | Runtime reject | Throws `attachment_send_mode_unsupported` for `provider_file_ref` |
| 7 | `src/next/openrouter/openRouterSendPlanSerializer.ts` | 427 | Error message | Leaks `assetId` in error: `Attachment ${...assetId} cannot use provider_file_ref` |

### 2.3 当前行为

- `provider_file_ref` 在 IPC Zod schema 层被 **接受**（不拒绝）。
- 在 runtime 层（OpenRouter serializer）被 **显式拒绝**，抛出 `attachment_send_mode_unsupported`。
- 无后端 handler 实现 `provider_file_ref` 的实际文件提供逻辑。
- 无测试覆盖此 send mode。

**结论**: `provider_file_ref` 是一个设计预留的 send mode，尚未实现。Phase 4 未引入任何新代码。

---

## 3. provider_file_ref 非目标

### 3.1 Phase 4 非目标

| 项目 | 说明 |
|------|------|
| 不引入 provider_file_ref 实现 | 不在 Phase 4 范围内 |
| 不修改现有 rejection logic | OpenRouter rejection 保持不变 |
| 不修改 IPC schema | 不改 `dbBridgeContracts.ts` enum |
| 不新增 tests | — |

### 3.2 P4-D 非目标

| 项目 | 说明 |
|------|------|
| 不实现 | — |
| 不修改 sendPlanService | — |
| 不修改 OpenRouter | — |
| 不破坏现有 IPC | — |

---

## 4. provider_file_ref Phase 5 / Later Entry Criteria

### 4.1 如需在 Phase 5 引入

| # | 前置条件 | 说明 |
|---|---------|------|
| PF-1 | Owner 决策 | 确认 provider_file_ref 的优先级和 scope |
| PF-2 | 数据模型设计 | 新建 provider_file_ref 专用的 asset 生命周期模型 |
| PF-3 | IPC schema guard | 剥离 `provider_file_ref` 从通用 send mode enum 到独立 contract |
| PF-4 | Provider bridge 实现 | 实现实际的 provider→Starverse 文件传输协议 |
| PF-5 | Security audit | path/hash/token sanitization for provider file refs |
| PF-6 | UI integration | 与 file attachment UI 的 send mode 选择集成 |
| PF-7 | Tests | 完整测试覆盖（IPC contract + provider bridge + serialization） |

### 4.2 如决定永远不引入

| # | 前置条件 | 说明 |
|---|---------|------|
| PF-8 | Owner 正式裁决不引入 | 记录到 docs 并冻结 |
| PF-9 | IPC schema cleanup | 从 `selectedSendMode`/`fallbackSendModes` enum 中移除 |
| PF-10 | Type cleanup | 从 `SendMode` union 中移除 |
| PF-11 | UI label removal | 移除 `'提供方文件'` mapping |
| PF-12 | Migration | 处理已存储的 `preferredDraftSendModes` 中的 `provider_file_ref` 值 |

**P4-D 建议**: 不决策 PF-1~PF-12，交 Owner 在 Phase 5 planning 时裁决。

---

## 5. Legacy message_asset 当前状态

### 5.1 决策历史

| 阶段 | 决策 | 来源 |
|------|------|------|
| Step 0 | Legacy message_asset 轨道退场 | `05-owner-decisions-before-step2.md` |
| Phase 1 Stage J | 主写入路径与批量读取路径已移除 | Phase 1 MVP closeout |
| Phase 2 | 只读兼容保留 | Phase 2 gap review |
| Phase 4 | 未进入 destructive cleanup | P4-A/B/C closeout confirmed |
| P4-D3 | P0-1: Legacy IPC 泄露 raw path/fileUrl/hash | §14.1 |

### 5.2 当前引用清单 (29 non-docs hits, 50+ docs hits)

#### 5.2.1 DB Schema & Repo

| 文件 | 行 | 类别 |
|------|----|------|
| `infra/db/repo/messageAssetRepo.ts` | 1-30 | Row types (AssetRow: id, hash, mime, width, height, bytes, path) |
| `infra/db/repo/messageAssetRepo.ts` | 301 | SQL DELETE |
| `infra/db/repo/messageAssetRepo.ts` | 306 | SQL INSERT |
| `infra/db/repo/messageAssetRepo.ts` | 452 | SQL SELECT with JOIN |
| `infra/db/worker/runtime.ts` | 429 | DDL: `CREATE TABLE IF NOT EXISTS message_asset` |
| `infra/db/worker/runtime.ts` | 458 | DDL: `ensureColumns('message_asset', ...)` |
| `infra/db/worker/runtime.ts` | 765-768 | DDL: `CREATE INDEX` on message_asset |
| `infra/db/migrations/ensureFilePipelineSchema.ts` | 137, 245 | DDL: `CREATE UNIQUE INDEX` on message_attachments |

#### 5.2.2 IPC Contracts (P0-1 risk)

| 文件 | 行 | 类别 | 风险 |
|------|----|------|------|
| `src/next/ipc/contracts/dbBridgeContracts.ts` | 315-339 | `messageAssetSchema` — 包含 `path`, `fileUrl`, `hash` | **P0-1**: raw paths/URLs to renderer |
| `src/next/ipc/contracts/dbBridgeContracts.ts` | 832-834 | `messageAssetPersistAckSchema` | 继承风险 |
| `src/next/ipc/contracts/dbBridgeContracts.ts` | 996 | `decodeWithSchema('messageAsset.persistFromDataUrls', ...)` | Active write path |
| `src/next/ipc/contracts/dbBridgeContracts.ts` | 1013 | `decodeWithSchema('messageAsset.listByMessageIds', ...)` | Active read path |

#### 5.2.3 IPC Registration & Handlers

| 文件 | 行 | 类别 |
|------|----|------|
| `infra/db/dbMethodsRegistry.ts` | 44 | `messageAsset.persistFromDataUrls` (renderer: true) |
| `infra/db/dbMethodsRegistry.ts` | 45 | `messageAsset.listByMessageIds` (renderer: true) |
| `infra/db/dbMethodsRegistry.ts` | 46 | `messageAsset.getById` (renderer: false) |
| `infra/db/worker/handlers/convoMessageHandlers.ts` | 292, 297, 302 | Handler implementations |
| `electron/main.ts` | 461 | `call('messageAsset.getById', ...)` — Electron main process |

#### 5.2.4 Tests

| 文件 | 行 | 类别 |
|------|----|------|
| `infra/db/repo/messageAssetRepo.test.ts` | 7, 59 | Repo tests |
| `infra/db/repo/messageAssetRepo.codec.test.ts` | 6, 11 | Codec tests |
| `src/next/ipc/contracts/dbBridgeContracts.test.ts` | 165, 189 | IPC contract tests |
| `src/ui-app/AppChatApp.regenRetry.test.ts` | 366 | Mock: `messageAsset.listByMessageIds` returns `[]` |

### 5.3 当前行为

- `message_asset` 是**完全功能化的遗留轨道**，拥有完整的 DB table、repo class、3 个 IPC methods、worker registrations、Electron main process call site。
- `persistFromDataUrls` write path 仍然存在且在 IPC registry 中注册为 renderer-accessible。
- `listByMessageIds` 和 `getById` read paths 仍然活跃。
- **P0-1 安全风险**: `messageAssetSchema` 将 raw `path`, `fileUrl`, `hash` 原样传输到 renderer，无任何脱敏。

---

## 6. Legacy message_asset Destructive Cleanup 风险

### 6.1 Cleanup 影响范围

| 组件 | 风险等级 | 说明 |
|------|---------|------|
| DB schema (`message_asset` table + indices) | P0 | Drop table 不可逆，需验证无活跃 consumer |
| IPC contracts (3 methods) | P0 | 移除 IPC methods 可能破坏 Electron/renderer 通信 |
| Handler implementations | P0 | `convoMessageHandlers.ts` 移除需确保无其他依赖 |
| Repo class | P0 | `messageAssetRepo.ts` 移除需确保 worker runtime 不引用 |
| Worker runtime DDL | P0 | 初始化 DDL 移除需配合 migration |
| Tests | P1 | 6 test files 受影响 |
| Electron main.ts call | P1 | `electron/main.ts:461` 移除需验证 |
| UI consumers (via renderer IPC) | P0 | 必须确认所有 UI 已迁移到新 asset 轨道 |

### 6.2 Destructive Cleanup 前置条件

| # | 条件 | 当前状态 |
|---|------|---------|
| DC-1 | 所有 `message_asset` UI consumers 已迁移到新轨道 | ✗ 未验证 |
| DC-2 | `persistFromDataUrls` 无新写入流量 | ✗ 未验证 |
| DC-3 | `listByMessageIds` / `getById` 无新读取流量 | ✗ 未验证 |
| DC-4 | Electron main process 不依赖 `messageAsset.getById` | ✗ 未验证 |
| DC-5 | 已有完整 backup/rollback 方案 | ✗ 未建立 |
| DC-6 | DB migration 已测试并 review | ✗ 未建立 |
| DC-7 | Owner 正式裁决 destructive cleanup 时机 | ✗ pending |
| DC-8 | P0-1 path/hash leak 已修复（即使保留 legacy track） | ✗ pending (P4-D3 BL-07) |

---

## 7. Migration / Rollback / Backup 要求

### 7.1 如需执行 destructive cleanup

| 步骤 | 内容 |
|------|------|
| M-1 | 备份 `message_asset` 表到独立 backup DB |
| M-2 | 创建 DB migration 脚本（drop table + drop indices） |
| M-3 | 创建 DB rollback 脚本（从 backup 恢复） |
| M-4 | 移除 `messageAssetRepo.ts` |
| M-5 | 移除 `convoMessageHandlers.ts` 中的 handler registrations |
| M-6 | 移除 `dbMethodsRegistry.ts` 中的 method registrations |
| M-7 | 移除 `dbBridgeContracts.ts` 中的 IPC contracts |
| M-8 | 移除 `electron/main.ts` 中的 call site |
| M-9 | 更新 `runtime.ts` worker DDL 和 wiring |
| M-10 | 移除/更新 6 个测试文件 |
| M-11 | 更新 `ensureFilePipelineSchema.ts` migration |
| M-12 | 全量回归测试 |
| M-13 | Manual smoke test in Electron |

### 7.2 最小修复路径（P0-1 only, without destructive cleanup）

| 步骤 | 内容 |
|------|------|
| MF-1 | 在 `messageAssetSchema` Zod transform 中添加 `path`/`fileUrl`/`hash` 脱敏 |
| MF-2 | 或：在 IPC bridge 层 strip 敏感字段后再传 renderer |
| MF-3 | 添加 IPC contract 测试验证脱敏 |
| MF-4 | 验证 Electron main process `getById` 不受影响（仅在 main process 使用） |

---

## 8. Audit / Smoke Requirements

### 8.1 destructive cleanup 后必须验证

| # | 验证项 | 方法 |
|---|--------|------|
| A-1 | `message_asset` table 已从 DB 移除 | `db:verify` |
| A-2 | 无 IPC method `messageAsset.*` 注册 | code grep |
| A-3 | 无 Electron/renderer crash | 手工烟测 |
| A-4 | 现有 file attachment 功能正常 | 手工烟测 |
| A-5 | No regression in file type detection | 自动化测试矩阵 |

### 8.2 P0-1 fix (without cleanup) 后必须验证

| # | 验证项 | 方法 |
|---|--------|------|
| A-6 | `messageAssetSchema` 输出不含 raw path | 自动化测试 |
| A-7 | `messageAssetSchema` 输出不含 raw fileUrl | 自动化测试 |
| A-8 | `messageAssetSchema` 输出不含 raw hash | 自动化测试 |
| A-9 | Electron main process `getById` 仍正常 | grep + 手工烟测 |

---

## 9. 不在 Phase 4 实现的理由

| # | 理由 |
|---|------|
| 1 | P4-D 是 planning/audit/closeout 阶段，非实现阶段 |
| 2 | `provider_file_ref` 自 Step 0 冻结以来一直是 P1/P2 延期项，Phase 4 未规划其实施 |
| 3 | Legacy `message_asset` destructive cleanup 影响面过大（29+ code references, 6 test files, DB schema, Electron main process），远超出 P4-D scope |
| 4 | DC-1~DC-8 所有前置条件均未满足 |
| 5 | Owner 尚未裁决 destructive cleanup 时机 |
| 6 | P0-1 fix 虽然紧迫，但属于 IPC sanitization scope（P4-D3 BL-07），非 decision package scope |
| 7 | 两者均不影响 Phase 4 code closeout（均为 Pre-Phase 4 存量） |

---

## 10. Recommendations

### 10.1 provider_file_ref

| 短期 (Phase 5 planning) | 长期 |
|-------------------------|------|
| Owner 裁决: 引入 or 正式放弃 | 如引入: PF-1~PF-7 |
| 如放弃: PF-8~PF-12 | 如放弃: cleanup + migration |
| IPC schema 添加 guard（Phase 5） | — |

### 10.2 Legacy message_asset

| 短期 (Phase 5) | 长期 |
|----------------|------|
| **优先**: Phase 5 至少执行 MF-1~MF-4（P0-1 fix: IPC path sanitization） | Owner 裁决 destructive cleanup 时机 |
| 验证 DC-1~DC-8 前置条件 | 执行 M-1~M-13 destructive cleanup |
| Owner 裁决 destructive cleanup 时机 | 执行 A-1~A-5 验证 |

---

## 11. P4-D5 Entry Criteria

| # | 条件 | 状态 |
|---|------|------|
| EC-1 | provider_file_ref 当前状态已文档化 | ✓ |
| EC-2 | provider_file_ref 非目标已明确 | ✓ |
| EC-3 | provider_file_ref Phase 5 entry criteria 已定义 | ✓ |
| EC-4 | Legacy message_asset 当前状态已文档化 | ✓ |
| EC-5 | Legacy message_asset destructive cleanup 风险已评估 | ✓ |
| EC-6 | Destructive cleanup 前置条件已列出 | ✓ |
| EC-7 | Migration/rollback/backup 要求已定义 | ✓ |
| EC-8 | Audit/smoke requirements 已定义 | ✓ |
| EC-9 | 不在 Phase 4 实现的理由已明确 | ✓ |
| EC-10 | P0-1 fix (MF-1~MF-4) 建议已写入 Phase 5 handoff | ✓ |
| EC-11 | 无代码修改 | ✓ |
| EC-12 | 不引入 provider_file_ref 实现 | ✓ |
| EC-13 | 不做 destructive cleanup | ✓ |
| EC-14 | P4-D3 committed | ✓ |

**结论**: P4-D4 完成，满足 P4-D5 entry criteria。

---

## 12. 禁止与约束

- 不修改生产代码
- 不引入 provider_file_ref 实现
- 不做 legacy message_asset destructive cleanup
- 不修改 DB schema
- 不修改 sendPlanService / derivativeJobService / OpenRouter / appChatApp.logic.ts
- 不写 Phase 4 completed

---

## 13. Commit

- **文件**: `39-p4d4-provider-legacy-decision-package.md` (new)
- **READNE**: 索引 + 状态更新
- **commit message**: `docs: add p4d4 provider and legacy decision package`
