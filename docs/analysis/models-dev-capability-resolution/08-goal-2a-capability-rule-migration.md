# Goal 2A：数据库 Capability Rules 与硬编码模型事实迁移

- **Lifecycle Status**: Goal 2A implementation record; fact inventory corrected by Goal 2A-Fix
- **Document Role**: migration inventory
- **Last updated**: 2026-08-28
- **Authority**: current checkout and focused Goal 2A tests

## 本轮边界

本轮只建立数据库支持的 Capability Rule 事实源，并把已识别的生产 TypeScript 模型事实迁入内置规则包。没有接入 models.dev、Provider Native 的统一 ingestion，也没有引入 wildcard、prefix、family、alias 或模糊匹配。Goal 2A-Fix 后 schema 支持严格受限、带正负例和来源说明的 anchored regex identity selector；当前所有 built-in rules 仍使用 exact selector。

本记录只关闭 Goal 2A 的 Capability Rule 数据库与 exact-model 迁移切片；不等同于统一来源 ingestion、stabilization 或整个项目完成。

本轮内置规则只按 `providerId + endpointProfileId + exact nativeModelId membership + canonical semanticPath` 命中。一条规则可以列出多个已验证的精确 native model ID，以共享同一条证据充分的 capability claim；这仍是逐 ID 精确匹配，不构成 family、alias 或 regex 推断。规则投影复用 Goal 1 的 canonical field/domain/constraint/evidence 类型，并作为正式事实源进入现有 resolved capability 构造；provider 不再直接查询迁移前的模型表。完整事实复核、身份归档和删减清单以 [Goal 2A-Fix closeout](09-goal-2a-fix-evidence-and-matching-closeout.md) 为准。

## Owner 冻结边界

- Capability Rules 只表达 factual capability assertion/correction；API contract、wire encoding、execution policy 与运行时安全约束仍由各自 authority 负责。
- `priority` 只决定 Capability Rules 来源内部的同 path 竞争；跨来源仍遵循 Owner 冻结的 `Provider Native > models.dev > Capability Rules`，不因本轮数据库化而重写来源优先级。
- Capability Rules 不能创建 model availability；当前 serving scope 的 Provider availability 仍是资格来源，Catalog 只能作为 projection/cache，不能成为第二套 capability authority。

## 数据库与安装语义

- `capability_rule_pack_v2` 保存 rule pack 的 owner、版本、启用状态、内容摘要、revision 和安装时间。
- `capability_rule_v2` 保存单条 scoped selector rule、精确 ID 集合或受限 regex、canonical path、state/domain/default/constraints、priority、evidence/provenance 和 revision。
- owner 分为 `built_in` 与 `user`，二者使用独立复合身份。
- writable epoch-2 初始化在同一事务中安装或升级 built-in packs；同版本内容漂移会失败，高版本会替换同一 built-in pack。
- 低于已安装版本的 built-in downgrade 也会被拒绝。
- 新版本不再携带的 built-in pack 会在同一安装事务中退休；该清理只作用于 `built_in` owner。
- user pack 由独立 repository 写入，built-in 升级不会删除或覆盖 user-owned rows。
- 同一 path 由最高 priority 生效；同优先级且语义不同的规则明确报 conflict，不静默任选。
- exact selector 在同 path 上优先于 regex selector；regex 必须完整锚定、具有正负匹配例和独立 identity evidence，宽泛/无界/高风险模式会被拒绝。
- Phase 1 不允许 nullable endpoint scope；每条规则都必须绑定 exact endpoint profile。命令身份、tool side-effect confirmation、tool registry selection 与 protocol discriminator 等非模型事实 path 也不能写入 Capability Rules。

## 已迁移的模型事实

最初迁移草案为 5 个 pack、809 条 rule、84 个唯一 provider/endpoint/exact-model identity。该草案包含机械矩阵、API-contract 投影、unsupported-by-silence 和证据不足的模型事实，现已由 Goal 2A-Fix 纠正。

当前内置 inventory 为 5 个 pack、90 条 rule、117 个 exact selector ID 引用、60 个唯一 provider/endpoint/exact-model identity：Gemini GenerateContent 12/12/6、Gemini image 18/18/4、Anthropic 18/18/10、OpenAI Responses 38/65/38、DeepSeek 4/4/2（依次为 rule / selector ID / identity）。OpenAI 的 alias/date snapshot 在官方 exact-model 页面给出同一事实时共享规则，但每个 native ID 仍独立精确匹配。built-in regex 为 0，`unsupported` rule 为 0，derived rule 为 0。

- **Gemini GenerateContent**：只保留官方逐模型表支持的 reasoning mode/effort；Provider Native 已返回的 token/range 字段继续由动态 observation 负责。
- **Gemini Interactions image**：只保留有逐模型证据的 image generation、aspect ratio、resolution，以及少数明确的 reasoning/search facts。
- **Anthropic Messages**：只保留归档 `/v1/models` 中真实 exact ID 的 thinking support 与有官方系列表支持的 effort domain；采样限制、manual/adaptive wire mode 和交叉字段限制不进入 rules。
- **OpenAI Responses**：逐页核验官方 exact model pages；GPT-5.x 仅保留页面明确列出的 reasoning effort domain 及对应归档 alias/snapshot，o-series 只保留页面明确证明的 reasoning support，未列出的 effort domain 保持缺失。
- **DeepSeek stable**：`deepseek-v4-flash` 与 `deepseek-v4-pro` 的 reasoning mode 和原生 effort domain。

迁移后未知或未来 model ID 不继承 family 结论。只有 Provider serving scope 已确认的 exact model availability（Catalog 只是其 projection）加上 exact capability evidence 才能形成对应结果。

## 明确保留在代码中的边界

- API envelope、字段位置、请求/响应 schema、SSE 状态机和纯 wire encoding。
- endpoint/credential/catalog exact membership 与 provider contract identity。
- 动态 provider observation，例如 `/models` 返回的 output token limit、temperature/top-p/top-k 数值。
- 工具 registry 一致性、side-effect confirmation、附件大小/类型限制、thinking 与显式 tool choice 的运行时安全约束。
- UI 纯投影形状和产品层默认；它们不再根据 model ID 决定 capability。
- DeepSeek mixed policy 中的 API-contract 与 execution/tool-safety 部分；其 model-specific reasoning domain 已移出。

## 删除的平行路径

- Gemini thinking regex/family policy。
- Gemini image-generation family policy与四模型 allowlist。
- Gemini GenerateContent 工具/搜索 exact-model lookup。
- Anthropic exact-model thinking lookup。
- OpenAI Responses 生产代码中的 model-specific capability domain 常量。
- renderer 中 Gemini image model normalization/allowlist 路由判断。

静态 gate 会阻止上述文件/符号或新的明显 exact-model capability literals 回到 provider authority、renderer 和 encoder 生产路径；内置模型事实只允许出现在 Capability Rule 数据基础设施中。

## 留给下一 Goal 的事项

- 定义 Provider Native 与 models.dev 到同一 canonical evidence input 的 ingestion contract。
- 为多来源 partial facts、冲突、LKG、staleness 与 source revision 建立发布流程。
- 将当前内置规则包的 reviewed evidence revision 纳入后续统一 source lifecycle，而不改变 exact identity 和 user-rule ownership 语义。
- 保留并完成 item 7 尚未关闭的 `CatalogQueryItem.capabilities` source hint/fixture 清理与 capability-aware projection 边界。
- 冻结纯模型 facts 与 authorization/runtime/command facts 的最终词汇边界；`src/next/file-type/sendRouteMapping.ts` 仍不得被描述为已迁移 consumer，重新启用前必须改为指定 revision 的 canonical facts projection，或删除。

## 风险与非目标

- **P0**：不得让 Capability Rule 数据库重新成为 Catalog、availability、API contract 或 wire/compiler 的第二套 authority。
- **P1**：统一多来源 ingestion、字段级 merge/conflict、LKG 与 source lifecycle 尚未在本轮完成。
- **P1**：OpenRouter 当前仍直接消费 catalog `supported_parameters`/modalities；这不是 model-ID hardcode，但应在统一来源 ingestion Goal 收敛为正式 evidence producer。
- **P2**：Catalog hint 清理、capability-aware 展示与 Stage-I legacy planner 处理属于后续维护，不是 Goal 2A 完成条件，也不是 stabilization 或 full-project completion 声明。
