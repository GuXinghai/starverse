# Step 2 风险与决策登记表

## 1. 已冻结决策

### 1.1 FileTypeVerdict 独立表

- 决策：MVP 起采用独立表，不采用 `source_meta_json` 临时承载。
- 理由：支持独立生命周期、版本、失效、重检、审计。
- 影响范围：migration、repo、service、测试。
- 后续检查点：字段完整性、幂等迁移、与 `file_assets` 关系稳定性。

### 1.2 sendRouteMapping 旁路渐进并最终替代

- 决策：先旁路生成 candidate，后续接管旧类型判断，禁止长期双轨。
- 理由：降低替换风险，同时避免长期并行混乱。
- 影响范围：sendPlanService、route mapping、对照测试。
- 后续检查点：替代矩阵推进率、双轨清理状态、最终 gate 保留边界。

### 1.3 旧 message_asset 轨道退场

- 决策：允许退场，不保留旧数据兼容包袱。
- 理由：建立干净主轨，降低复杂度。
- 影响范围：repo、UI、测试、历史展示链路。
- 后续检查点：依赖清点、退场任务包、回滚方案。

### 1.4 provider_file_ref 不进入 MVP

- 决策：MVP 不引入 provider_file_ref 数据模型与生命周期。
- 理由：避免把远端生命周期复杂性提前拉入 MVP。
- 影响范围：send candidate 设计、P1/P2 扩展计划。
- 后续检查点：扩展方案是否独立设计生命周期/失效/兼容/降级。

### 1.5 路径日志泄露先做独立最小护栏修复

- 决策：在正式 file-type 实现前先做独立护栏补丁，不混入主实现。
- 理由：先收敛隐私泄露面，避免后续扩大风险。
- 影响范围：`imageIpc.ts`、`dbBridge.ts` 及相关日志点。
- 后续检查点：脱敏测试、grep 扫描、变更范围审计。

## 2. 主要风险登记表

| 风险 | 触发条件 | 影响 | 缓解策略 | 归属阶段 | 需要 Owner 确认 |
|---|---|---|---|---|---|
| sendRouteMapping 与 sendPlanService 长期双轨 | 迁移后旧判断未退场 | 判定不一致、维护成本上升 | 用替代矩阵逐项关停旧判断 | F/G | 是 |
| 独立表 migration 过早扩大范围 | Stage C 混入非最小改动 | 升级风险、回滚复杂 | 严格最小字段+最小 repo 骨架 | C | 是 |
| 旧 message_asset 退场影响历史附件/测试 | 依赖未清点就退场 | 历史消息展示或测试回归失败 | 先清点 repo/UI/test 依赖再退场 | J | 是 |
| UI 附件组件越界判断文件类型 | 规则下沉到 card 层 | 与上游决策冲突 | 只在 app/service 层判定 | H | 否 |
| renderer 泄露绝对路径 | 日志/错误透传未脱敏 | 隐私风险 | Stage A 最小护栏 + 扫描 | A | 是 |
| provider_file_ref 过早进入 MVP | 在 MVP 引入远端文件生命周期 | 实施面膨胀，进度失控 | 明确延后到 P1/P2 | F/G 后 | 是 |
| Magika runtime 接入阻塞 MVP | 运行时依赖不稳定 | 检测链路卡住 | 允许 stub/降级路线 | D/E | 是 |
| containerProbe 解析库选择导致资源/安全问题 | 选型不当或无限解析 | CPU/内存/安全风险 | 设定配额、超时、白名单 | D | 是 |
| fixture 二进制样本膨胀仓库 | 提交大量大文件 | 仓库体积与CI耗时恶化 | 分层样本、必要最小化 | I | 否 |
| 日志脱敏遗漏 | 新增日志未纳入脱敏 | 隐私合规风险 | 阶段性 grep + 测试门禁 | A~I | 是 |
| 缓存失效规则不完整 | 指纹/版本变化未触发失效 | 旧 verdict 误用 | 明确失效条件并测试 | E | 是 |
| 用户 override 污染 verdict | override 写回静态 verdict | 数据语义污染 | 明确 override 只影响 candidate | F/G | 否 |

## 3. 后续待决策问题

1. `file_type_verdicts` 表名最终命名是否固定为该名称。
2. `verdict_json` 是否需要压缩存储。
3. `fingerprint_json` 的最小内容边界。
4. Magika 在 MVP 是否先 stub 或直接接入真实 runtime。
5. ZIP/containerProbe 解析库最终选型。
6. fixture 是否提交真实二进制样本，还是以生成器/切片方式管理。
7. 旧 `message_asset` 退场具体阶段是否包含数据库清空动作。
8. UI 详情面板第一版展示粒度（字段全集 vs 摘要）。
9. sendPlanService 最终 gate 与下游 request 构造边界的契约文本。
10. Stage A 护栏任务完成后，是否要求作为进入 Stage B 的强门禁。

