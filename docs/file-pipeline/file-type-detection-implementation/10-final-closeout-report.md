# Starverse File Type Detection Final Closeout Report

## 1. 阶段完成状态表（A~K）

| 阶段 | 状态 | Commit | 主要产物 |
|---|---|---|---|
| Stage A | completed | `ac450d5` | IPC 路径日志最小脱敏护栏（`dbBridge.ts`/`imageIpc.ts`） |
| Stage A cleanup | completed | `9a984a3` | `appChatApp.logic.ts` trailing whitespace 清理 |
| Stage B | completed | `8a82289` | file-type 类型体系、taxonomy、taxonomyMap、code registry |
| Stage C | implemented, conditionally accepted | `56fde96` | `file_type_verdicts` 独立表 + repo 最小骨架 |
| Stage D | completed | `bfd3cb7` | lightweight detection core（magic/text/container/magika/evidence merge/static policy） |
| Stage E | completed | `691d498` | detection service core + worker integration |
| Stage F | completed | `88e3a77` | `sendRouteMapping` 旁路 candidate 生成 |
| Stage G | completed | `5df66e6` | send planner 消费 file-type candidates（保留最终 gate） |
| Stage H | completed | `cc1c4fd` | 附件 UI 最小状态展示接入（仅消费摘要） |
| Stage I | completed | `efaec4d` | fixture regression matrix + `expected.json` |
| Stage J | completed / partial retirement accepted | `64f9cf2` | 旧 `message_asset` 写路径与批量读取主链路退场；保留 `asset://` 只读兼容 |
| Stage K | completed | `3514d7d` | external engine registry/manifest/health scaffolding + engine availability 集成 |

## 2. 当前功能闭环摘要

1. `taxonomy`：`FileKind`/`FileFormatId`/descriptor/taxonomy map 已落地并有静态一致性测试。
2. persistence：`file_type_verdicts` 独立持久化链路已具备最小可用读写。
3. detection core：magic/text/container/magika-stub/evidence merge/static policy 已落地。
4. detection service：`detectBasic`/`detectFull`、job 状态机、fingerprint/currentJobId/stale 写回链路已落地。
5. `sendRouteMapping`：可基于 verdict/capabilities/prefs/engine availability 生成 candidate。
6. sendPlanService consumption：已消费 candidate，并保留发送前最终 gate。
7. UI display：附件卡片可展示 file-type/send-route 摘要状态，UI 不自行判型。
8. fixture matrix：关键格式、冲突样本、adversarial 样本已有基础回归矩阵。
9. legacy `message_asset`：主写路径/批量读取主链路退场，暂保留只读兼容回读。
10. external engine scaffolding：已提供 registry、manifest 校验、health-check fake runner、availability 输出。

## 3. 测试与验收汇总

- `git diff --check`：通过（仅存在 line-ending warning，不含 trailing/conflict）。
- Stage B：taxonomy/taxonomyMap/route label 测试通过。
- Stage D：detector/probe/merge/policy 相关测试通过。
- Stage E：detection service + fixtures 测试通过。
- Stage F：sendRouteMapping 测试通过。
- Stage G：sendPlanService 测试通过。
- Stage H：附件 UI 卡片测试通过。
- Stage I：fixture matrix 测试通过。
- Stage K：external engine manifest/registry/health/sendRouteMapping 集成测试通过。
- Stage C DB：`ensureFilePipelineSchema`、`fileTypeVerdictRepo`、`worker.filePipeline`、`filePipelineRepo` 已非 skip 验证通过。
- scoped eslint：通过（存在复杂度类 warning，无 error）。

## 4. 仍未完成 / 延期项

1. legacy `message_asset` 只读兼容链完全删除（需单独 destructive cleanup 阶段）。
2. `provider_file_ref` 仍不在 MVP（保持冻结决策）。
3. 真实 Magika runtime 接入（当前为 mockable adapter/stub 方案）。
4. 真实 Tika/LibreOffice/ffprobe/Pandoc 执行与运行时管理（当前仅 scaffolding，不执行真实引擎）。
5. 更完整 fixture 扩展：`gbk`/`mp4`/`polyglot`/`zip64`/`xlsm`/`pptm` 等。
6. 外部引擎安装器/下载器/签名校验链路。

## 5. 当前风险清单

1. sendRouteMapping 与 send planner 的渐进替换仍需持续防双轨。
2. Stage J 残留只读兼容链在长期上会增加维护负担。
3. Stage K 仅为框架，未连接真实引擎时能力边界需持续明确。
4. fixture 覆盖对复杂容器与多语言文本仍有盲区。
5. UI history scope 的 send plan 映射调用需在稳定化阶段继续观察性能副作用。

## 6. Group D 无关文件处理建议

当前仍建议保持独立处理，不混入主线提交：

- `public/build-id.json`
- `src/ui-app/AppChatApp.send.test.ts`
- `src/ui-app/app/appChatApp.logic.fix.ts`
- `.agent-reports/*`
- `.opencode/*`
- `opencode*.bak/jsonc`
- `.tmp-file-pipeline-worker-tests/*`

建议策略：
- 工程主线发布前单独开清理分支处理 Group D。
- 对工具/临时产物采用 `.gitignore` 或规范化本地清理脚本。

## 7. 是否建议进入后续稳定化/烟测阶段

建议进入稳定化/烟测阶段。

建议范围：

1. 全阶段回归命令固化为 CI job（含禁止项扫描）。
2. 增补高风险 fixture（容器损坏、polyglot、大文件边界）。
3. 评估并规划 legacy `message_asset` 最终退场（单独 destructive cleanup 任务包）。
4. 评估 Stage K 到真实引擎执行的安全与运维门禁（下载源、签名、超时、资源配额、诊断脱敏）。
