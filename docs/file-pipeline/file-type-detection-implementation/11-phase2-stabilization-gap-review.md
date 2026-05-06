# Phase 2 Stabilization / Gap Review

## 1. 目标与口径

本文件用于 Phase 2 稳定化与缺口复核。  
结论口径：A~K 代表 **Phase 1 MVP 主闭环已实现**，不代表全项目最终完成。

## 2. 文档口径修正结果

- `10-final-closeout-report.md` 已降调并重命名为 `10-phase1-mvp-closeout-report.md`。
- `README.md` 已更新：
  - `Current phase` 改为 `Phase 2 stabilization / gap review`
  - `final closeout` 口径改为 `Phase 1 MVP closeout`
  - 新增本文件索引。

## 3. Phase 1 稳定化回归基线

### 3.1 执行命令与结果

| 命令 | 结果 | 备注 |
|---|---|---|
| `git diff --check` | pass with warning | 仅 line-ending warning（无 trailing whitespace / conflict marker） |
| `npm run db:verify` | pass | 13/13 checks passed；包含 `npm rebuild better-sqlite3` |
| `npm run build:worker` | pass | db worker 构建成功 |
| `npm run lint:changed`（清理前） | fail | 命中 Group D：`AppChatApp.send.test.ts` warning + `appChatApp.logic.fix.ts` parse error |
| `npm run lint:changed`（Group D 清理后） | pass | `target_count=0`，无 changed code lint 错误 |
| scoped vitest（B/C/D/E/F/G/H/I/K 关键集） | pass | 22 files / 134 tests 全通过；Stage C DB tests 非 skip 通过 |

### 3.2 skip / warning / failed 记录

- failed（已处理）：`lint:changed` 清理前失败，原因是 Group D 无关文件。
- warning（保留）：`baseline-browser-mapping` 过期提醒（不阻塞）。
- warning（保留）：Git line-ending warning（不阻塞）。
- skip：本轮执行的 scoped vitest 中无 skip。

## 4. Group D 清理结果

| 项目 | 处理结果 |
|---|---|
| `public/build-id.json` | 已 `git restore`，不纳入提交 |
| `.agent-reports/` | 已删除本地未跟踪内容，不纳入提交 |
| `.opencode/` | 已删除本地未跟踪内容，不纳入提交 |
| `.tmp-file-pipeline-worker-tests/` | 已删除本地未跟踪内容，不纳入提交 |
| `*.bak` / `opencode.jsonc*` | 已删除本地未跟踪内容，不纳入提交 |
| `src/ui-app/app/appChatApp.logic.fix.ts` | 已删除（默认不提交） |
| `src/ui-app/AppChatApp.send.test.ts` | 已审 diff；与 Phase 1 稳定化基线无直接必要，已 `git restore` |

## 5. 缺口复核与风险登记

### 5.1 已完成（Phase 1 MVP）

- taxonomy / taxonomyMap / code registry
- verdict persistence（`file_type_verdicts`）
- detection core + detection service
- sendRouteMapping 旁路 + sendPlanService 渐进消费
- UI 附件摘要展示
- fixture matrix 基线
- external engine scaffolding（不执行真实引擎）

### 5.2 待复核（Phase 2）

1. sendRouteMapping 与 sendPlanService 双轨残留风险（继续收敛/扫描）。
2. `legacy message_asset` 只读兼容链存在，需后续 destructive cleanup 阶段处理。
3. UI history 卡片 `historyScope` 读取 send plan 的性能与副作用观察。
4. fixture 缺口（`gbk/mp4/polyglot/zip64/xlsm/pptm`）分批补齐策略。
5. 外部引擎仅 scaffolding，真实 runtime/安全执行层尚未接入。

### 5.3 延期项（明确不在 Phase 2 完成）

- `provider_file_ref`（仍不进入 MVP）。
- 真实 Magika runtime。
- 真实 Tika / LibreOffice / ffprobe / Pandoc 执行。
- legacy `message_asset` 完全删除（含 destructive DB cleanup）。

## 6. 手工烟测与关键回归记录

本轮以“最小烟测 + 关键自动回归”组合执行：

1. 文件类型样本（txt/png/pdf/docx/伪装样本）：
   - 通过 `fileTypeFixtureMatrix` 与 `fileTypeDetectionService.fixtures` 回归验证。
   - 覆盖 `exe_renamed_as_pdf`、`pdf_renamed_as_txt`、`unknown_binary`、`polyglot` defer 标记行为。
2. 模型切换：
   - `sendRouteMapping.test.ts` 与 `sendPlanService.test.ts` 覆盖模型能力变化仅影响 candidate/gate。
3. 删除附件 / 历史附件展示：
   - `DraftAttachmentCard.test.ts`、`MessageAttachmentCard.test.ts` 保持通过，未引入 UI 直接判型。
4. 日志扫描：
   - 沿用 Stage A 脱敏护栏；本轮未新增路径日志输出点。

## 7. Phase 3 进入门槛（建议）

必须同时满足：

1. Phase 2 基线命令可稳定通过（允许非阻塞 warning，但需登记）。
2. Stage C DB tests 保持非 skip。
3. Group D 无关项不混入主线提交。
4. sendRouteMapping 双轨风险有明确剩余清单与收敛计划。
5. legacy `message_asset` 兼容链残留有独立 destructive cleanup 计划，不在 Phase 3 混入。

## 8. Phase 3 / Phase 4 规划边界

- Phase 3：只规划“真实 runtime + 安全执行层”（不扩展业务面）。
- Phase 4：再规划“深度转换、插件生命周期、legacy destructive cleanup、provider_file_ref”。
