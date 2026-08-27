# Generation V2 模型事实 authority 边界收敛

- **Lifecycle Status**: implementation-note
- **Document Role**: first post-decision authority-boundary partial closeout
- **Last updated**: 2026-08-28
- **Authority**: Owner 决策见 `06-owner-frozen-model-facts-architecture.md`；本文记录当前 checkout 的实现结果，不取代该决策。

## 本轮边界重构的结论

本轮没有接入 models.dev、Capability Rules 或新的 Provider Native ingestion。改动只稳定这些来源以后共同写入的 authority 边界。

本文关闭的是第一个 Goal 中的 authority-boundary 结构子阶段，不宣称完整来源 ingestion、所有历史 Catalog 类型清理或整个专题已经完成。下列有意推迟项属于后续工作；其中“下一 Goal”小节只列统一来源 ingestion 的直接阻塞项。

当前主流程为：

```text
provider facts producer（当前仍是 provider-specific）
  -> CanonicalModelFactsV2
  -> ResolvedCapabilityV2 generation authorization
       + exact binding / availability provenance
       + API contract / protocol / operation
       + encoding coverage
       + continuation / runtime command facts
  -> controls projection + frozen runtime snapshot
  -> shared semantic validator
  -> compiler / wire encoder
```

`CanonicalModelFactsV2` 是唯一基础模型事实记录。其 identity 只包含 exact provider、endpoint profile、native model，以及存在时的 pinned provider route。它不包含 credential revision、protocol contract、operation、encoder revision、时间戳或命令工具选择。

`capabilityRevision` 只由 canonical model identity、evidence 内容和最终 semantic fields 计算。Encoding Coverage 可以拒绝一次 generation authorization，但不能把事实改写为 unsupported，也不能改变该 revision。

## 审计发现与处理

本轮审计确认了四类并行或混合裁决：

1. `ResolvedCapabilityV2` 的 canonicalization 同时承担事实解析、protocol/operation scope 和 encoder coverage。
2. Catalog 的 coarse capability booleans 与 `modelCapabilityResolverV2` 可以独立产生 UI/目录结论，其中 `enabled = model support && wire implementation` 混合了事实和实现。
3. Provider command authority 重复构造字段，部分路径直接读取 raw Catalog metadata；OpenRouter attachment 曾直接以 `inputModalities` 判定模型支持。
4. OpenAI Responses 留有未被生产链消费的 exact-model capability manifest，它仍构成第二个可调用的能力结果 API。

处理结果：

- 新增独立的 typed model-facts vocabulary 与 canonicalizer；Runtime Snapshot 反向依赖该 vocabulary。
- `ResolvedCapabilityV2` 明确变为 generation authorization envelope，内嵌且只读消费一份 `modelFacts`。
- credential、contract、protocol、operation、encoder 与 continuation 从基础 revision 输入中移除。
- 生产 Catalog capability resolver、provider registry 中的 supplement/wire capability 合并、OpenAI exact-model manifest 已删除。
- Catalog query 不再解析或按 capability booleans 过滤；Picker 不再从 Catalog capability hints 生成能力标签。
- Picker 已删除基于 raw `outputModalities` 自动强制“仅图像输出”的资格筛选；用户显式使用的 Catalog metadata 搜索过滤仍只是查找条件，不构成发送授权。
- OpenRouter attachment runtime helper 只检查附件表示与资产 provenance；模型是否支持该 semantic path 由同一份 frozen model facts 校验。
- capability path 与 domain kind 的兼容规则由 model-facts schema 单点定义，canonicalizer 负责拒绝不合法组合；Runtime Snapshot 只复用该定义。
- `unknown` 在公共 semantic validator 中表示“事实未定、允许尝试”，已迁移的参数编辑器与附件投影不再把它显示或解释为 `unsupported`。
- Compiler 的防御性校验从 Runtime Snapshot 还原同一份 canonical facts，不允许自行扩张。

## 保留但不具备 authority 的数据

Provider catalog 的 raw observation、raw JSON、modalities、supported parameters 和 compatible-provider 手工 metadata 仍作为来源材料保存。它们可以用于目录详情或用户显式搜索，但不能直接决定 Generation V2 控件、preflight、Runtime Snapshot 或 Compiler 授权。当前 provider-specific facts producer 仍会把其中可识别字段规范化为 evidence/fields；下一 Goal 应把这一步纳入统一 Provider Native ingestion，而不是恢复 Catalog resolver。

`CatalogQueryItem.capabilities` 目前只为历史测试/source payload shape 保留为可选 hint；生产 query 不再填充、筛选或消费它。统一 source ingestion 完成后应删除该可选字段和相应旧 fixture。

Runtime capability codec digest 已随封闭 schema 改变。现有 epoch-2 数据库会按已冻结的数据策略执行 closed-schema replacement；本轮刻意不增加旧 JSON decoder、保留式迁移或兼容 adapter。

## 本轮有意推迟

- Provider Native + models.dev + Capability Rules 的字段级合并、优先级、冲突与 LKG 发布。
- 将当前 provider-specific facts producer 统一注册为 source adapter。
- 把现有 broad semantic path vocabulary 进一步区分为纯模型能力、authorization control 和 command/runtime facts。当前权威依赖方向已纠正，但 attachment/tool command paths 的词汇分类仍需在 source ingestion 前冻结。
- Catalog 的 capability-aware 展示。若恢复，必须由指定 `capabilityRevision` 的 canonical facts projection 生成，不能读取 raw hints。
- Runtime `unknown` 的 allow-attempt policy 后续可配置化；本轮冻结行为是公共 validator 允许 bounded semantic value 进入纯 encoder，同时任何 `unsupported` 仍 fail closed。
- `src/next/file-type/sendRouteMapping.ts` 仍是未被生产代码调用的 Stage-I legacy planner，并保有独立 `ModelInputCapabilities` 输入。本轮没有把它伪装成已迁移 consumer；在重新启用前必须改为消费指定 revision 的 canonical facts projection，或直接删除。

## 下一 Goal：统一来源 ingestion

- [ ] 为 Provider Native、models.dev、Capability Rules 定义同一 canonical evidence input contract。
- [ ] 保留 exact provider / endpoint profile / native model identity，禁止 fuzzy matching 和 family inheritance。
- [ ] 实现字段级 merge、opposing evidence、source revision、LKG 与坏字段局部隔离。
- [ ] 明确 models.dev 不能创建 availability，Provider 模型列表成功且完整时决定当前 membership。
- [ ] 将所有现有 provider-specific facts producer 迁入统一 source registry，并加穷尽性门禁。
- [ ] 删除 `CatalogQueryItem.capabilities` 的剩余可选 source hint 与旧测试 fixture。
- [ ] 冻结纯模型 facts 路径与 authorization/runtime 路径的最终词汇边界。

## 验证

本轮验证覆盖 canonical/resolved facts、Runtime Snapshot、Catalog query/detail、所有本地/compatible/image runtime capability、active Catalog authority、capability resolution、OpenRouter attachment、Model Picker 与 UI controls projection：

- `npm run rebuild:node`：通过，最终 ABI 保持 Node。
- `npm run test:unit`：303 files、2606 tests 通过。
- `npm run test:integration`：147 files 通过；1123 tests 通过、3 skipped。
- 聚焦 UI：2 files、9 tests 通过。
- `npm run test:ui`：62 files、468 tests 通过；`AppChatApp.imageCapabilityQuerySeq.earlyAccess.test.ts` 的 2 个固定时限用例超时。对未修改的 `HEAD` 基线做 repo-external archive 复现得到相同 15 秒/5 秒超时，因此记录为既有 cold-import timing gate 问题，不修改该测试掩盖结果。
- `npx tsc --noEmit --pretty false`、`npx vue-tsc --noEmit --pretty false`、Generation V2 zero-residual gate、docs gate 与 `git diff --check`：通过。

未执行真实付费 Provider 请求或 Electron smoke。
