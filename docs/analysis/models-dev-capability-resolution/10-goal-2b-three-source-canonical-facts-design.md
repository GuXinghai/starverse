# Goal 2B：三来源 Canonical Model Facts 设计

- **Lifecycle Status**: frozen Goal 2B design; subsequent Goal 2C implementation authorized
- **Document Role**: controlling Goal 2B raw-first ontology and source-adapter design
- **Last updated**: 2026-08-31
- **Authority**: current checkout, preserved source-native raw snapshots, linked primary documentation, and Owner-frozen model-facts boundary

> 状态：本文档本身只记录 Goal 2B 冻结设计，不包含生产实现。Owner 后续已单独授权 Goal 2C 按本文档实施 ingestion；这不授权 Goal 3 Resolver。
>
> 设计顺序：实际 Raw Data → source-neutral ontology → Source Adapter contract → Capability Rules 对齐。现有 Rules 和现有 Generation Intent 路径不是本设计的上游输入。
>
> 后续 Owner amendment：本文中的`built-in/user`与`query_bound` Rules描述的是Goal 2B设计及Goal 2C实施时点。未来目标不保留bundled built-in Rules，也不在按请求的subject fact读取/send/preflight/Goal 3 resolution中执行regex。Cloud-managed与User Rules改用同构Pack/Rule core，共同形成唯一Capability Rules source；regex只在authoritative exact-subject-set revision绑定的materialization阶段选择身份并输出exact-subject claims。该后续修订及UI/lifecycle边界以[`12-model-facts-ui-synchronization-plan.md`](12-model-facts-ui-synchronization-plan.md)为准，尚未完成生产迁移，且不改变本文冻结的ontology、三来源边界或Goal 3停止点。

## 0. 结论摘要

本设计建议把未来的事实链拆成三个清晰阶段：

```text
Source-native raw snapshot（审计 authority）
        ↓ 单来源解释，不合并
Canonical Source Facts（同一 typed ontology、精确 subject、完整 provenance）
        ↓ Goal 3 才做字段级合并
Resolved Model Facts（唯一 capabilityRevision）
        ↓ 加入非模型事实
+ API Contract + current Operation + Encoding Coverage
+ Runtime Hard Constraints + Execution Policy
        ↓
Generation Authorization / UI Projection / Runtime Snapshot / Compiler
```

关键结论：

1. 不能直接复用当前由 Generation Intent 反推出来的 semantic-path 集合作为三来源 ontology。它包含附件资产 ID、工具确认、provider extension 和命令字段，且缺少 limits、modalities、structured output 等真实来源字段。
2. Canonical Source Facts 必须是稀疏、typed、字段级的事实断言，不是一张每模型填满所有列的宽表，也不是任意 JSON。
3. `missing` / `invalid` 是 source ingestion outcome；`unsupported` 是明确的支持状态事实；`unknown` / `conflict` 主要是 Goal 3 resolved knowledge state。四者不能复用一个值或靠缺省猜测。
4. 完整集合与 partial positive evidence 必须显式区分。尤其 Ollama `/api/tags` 的 `capabilities` 不能按“未列出即不支持”处理；models.dev 的 modalities/reasoning option 列表则可以按其 schema 声明记录 completeness。
5. Provider Native、models.dev、Capability Rules 都输出同一种事实值结构；来源优先级、Rule priority、conflict winner 和最终 `capabilityRevision` 仍留给 Goal 3。
6. Raw payload 继续是 source-native audit authority。Canonical facts 只保存 content-addressed snapshot/record/field pointer、adapter revision 和必要 evidence metadata，不复制整份 raw JSON。
7. 当前 Capability Rules 的事实内容大多可迁移，但路径与类型必须跟随新 ontology：例如 `reasoning.mode=[disabled,enabled]` 不能原样保留，Anthropic `effort` 也不能继续假设与其他 provider 的 reasoning effort 同义。
8. Rule claims必须逐条保留 rule/pack identity、owner、priority和derivation；Rules Adapter不预先选 winner。Goal 3必须收到所有 matched claims。
9. Mapping coverage、current observation与effective LKG assertion分别建模：surface无 coverage时没有 outcome，字段 invalid时同时保留本轮失败和上一版有效 assertion。
10. Provider Authority Registry、单来源 SourceRevision/SubjectFact Builder/Publisher、credential-scoped source cache key和raw pinning在本设计冻结；它们只保证 exact join与单来源原子发布，不提前实现跨来源 Resolution。
11. Canonical source revision与exact-subject fact revision严格分离：前者冻结 source原料和mapping revisions，后者冻结该 subject claims。Rules lazy/query-bound materialization不得改变 source revision。

### Owner amendment：models.dev Official API Raw Source（2026-08-31）

Goal 2C及后续实现使用 `https://models.dev/api.json` 的扁平化payload作为models.dev Raw Source。Canonical provenance只引用API实际暴露的provider/model record和字段；不要求、也不允许推测API未暴露的`base_model/base_model_omit`或内部base/override contributor。该选择修订第5.2节原先要求追溯实际base/override field refs的文字，其余exact join、typed mapping、snapshot/revision、LKG和Goal 3边界保持不变。

## 1. 实际检查过的仓库与 Raw Data

### 1.1 落盘事实包

主要输入为：

- [`final-package-20260826/raw-model-fields.json`](./final-package-20260826/raw-model-fields.json)：`starverse-raw-model-fields-v1`，生成于 `2026-08-26T02:08:49.739Z`，约 1.96 MB；包含 Provider Native raw payload、models.dev raw provider records、本地 provider 观察和部分派生比较摘要。
- [`evidence/provider-native-anthropic-models-20260804.json`](./evidence/provider-native-anthropic-models-20260804.json)：Anthropic `/v1/models` 完整保存样本，10 条 model records。
- `tmp/provider-model-catalog-audit-20260804*/<provider>/page-1.json` 与同目录 `audit.json`：独立审计脚本保存的完整脱敏 HTTP page 和逐记录 own-property/type 观察；实际覆盖 OpenAI、Gemini、Anthropic、DeepSeek、OpenRouter。它们是 point-in-time 审计材料，不是生产 catalog persistence，也不等于 2026-08-26 最终事实包。
- [`evidence/openai-gpt5-o-series-model-facts-20260828.json`](./evidence/openai-gpt5-o-series-model-facts-20260828.json)：OpenAI 官方文档核验结果；它是 Rules evidence，不是 Provider Native model-list raw payload。
- [`05-raw-model-capability-evidence-and-discussion.md`](./05-raw-model-capability-evidence-and-discussion.md)：历史调查底稿，只用于解释抓取过程和发现差异，不覆盖后续保存的 raw payload。
- [`06-owner-frozen-model-facts-architecture.md`](./06-owner-frozen-model-facts-architecture.md)：Owner 已冻结边界。
- [`07-model-facts-authority-boundary-implementation.md`](./07-model-facts-authority-boundary-implementation.md)、[`08-goal-2a-capability-rule-migration.md`](./08-goal-2a-capability-rule-migration.md)、[`09-goal-2a-fix-evidence-and-matching-closeout.md`](./09-goal-2a-fix-evidence-and-matching-closeout.md)：现有实现与 Rules 迁移现状，均在完成 raw-first ontology 草案后才用于反查。

### 1.2 当前生产数据库的只读检查

只读打开了：

```text
%APPDATA%\Starverse\workspace\epoch-2\starverse.db
```

检查时数据库中：

- `model_catalog_scope_v2`：1 条，DeepSeek scope；
- `model_catalog_snapshot_v2`：1 条，2 个模型；
- `capability_rule_pack_v2` / `capability_rule_v2`：尚不存在，说明当前已运行数据库尚未经过本分支 Goal 2A schema 安装，不能拿它代表提交后的最终 Rules 数据库状态；
- DeepSeek snapshot 中 raw observation 对 reasoning/tools/structured output/vision 都明确记录 `presence: "missing"`，但 catalog projection 的粗粒度 booleans 均为 `false`。这正是“raw missing 被下游投影看成 false”的现有平行 authority 风险，不能被新 ontology 继承。

### 1.3 同一事实包内部也存在时点漂移

必须以具体 snapshot/revision 为单位引用，不能把叙述性统计与 raw payload 混为同一版本：

- `raw-model-fields.json` 内实际保存的 OpenRouter public payload 有 417 条，models.dev `openrouter` 有 355 条；同文件较早生成的 `comparisonSnapshot` 仍写着 422/360。
- 更早的 `tmp/provider-model-catalog-audit-20260804/openrouter/page-1.json` 有 338 条。这与 417、422 都不矛盾，只代表另一抓取时点；文档不得把三个计数混成同一 snapshot。
- 实际保存的 models.dev `deepseek` 有 3 条；历史底稿曾记录过 `deepseek-chat` / `deepseek-reasoner` 等不同集合。
- 实际 OpenAI raw model records 使用 `deprecation_date`；历史底稿曾记录另一个时点观察到的 `shutdown_date`。
- 实际 Google raw payload 有 58 条；历史底稿的某轮比较是 50 条。

因此任何 canonical assertion 都必须指向具体 raw snapshot revision 和 source record，而不能只写“来自 05 文档”或“来自 models.dev”。这一决定避免把不同抓取时点的字段和模型集合拼成一个从未真实存在过的 source snapshot。

此外，生产 `CatalogRawEnvelope` 主要保存 per-model raw bucket；独立审计 page 还保存 response root 与分页字段，例如 OpenRouter `total_count/links`、Gemini `nextPageToken`、Anthropic `has_more/first_id/last_id`。未来 raw source snapshot 必须能引用完整 source envelope，不能只凭 per-model buckets 反推列表完整性。

### 1.4 当前代码依赖与平行 authority 审计

实际主链如下：

```text
Provider-specific catalog parser / observation
  → CatalogRawEnvelope / ProviderModelObservationV2
  → model_catalog_snapshot_v2 + active catalog authority
  → provider Generation Authority（同时组装 contract/runtime/model fields）
  → CanonicalModelFactsV2
  → ResolvedCapabilityV2（binding/catalog/continuation/encoding coverage）
  → controls projection / preflight / runtime snapshot / compiler
```

已检查的关键生产文件：

- [`src/shared/modelCatalog/providerModelObservationV2.ts`](../../../src/shared/modelCatalog/providerModelObservationV2.ts)：Provider Native observation 的 present/missing/raw record 边界；
- [`src/shared/modelCatalog/internalSchema.ts`](../../../src/shared/modelCatalog/internalSchema.ts)、[`infra/db/v2/modelCatalogSchemaV2.sql`](../../../infra/db/v2/modelCatalogSchemaV2.sql)、[`infra/db/repo/modelCatalogV2Repo.ts`](../../../infra/db/repo/modelCatalogV2Repo.ts)：raw envelope、immutable catalog snapshot、active/pending/LKG；
- [`src/next/generation-v2/capability/modelCapabilitySchemaV2.ts`](../../../src/next/generation-v2/capability/modelCapabilitySchemaV2.ts)：当前 69 个 intent-derived paths 和 typed domains；
- [`src/next/generation-v2/capability/canonicalModelFactsV2.ts`](../../../src/next/generation-v2/capability/canonicalModelFactsV2.ts)：exact identity、evidence/field canonicalization、digests、`capabilityRevision`；
- [`src/next/generation-v2/capability/resolvedCapabilityV2.ts`](../../../src/next/generation-v2/capability/resolvedCapabilityV2.ts)：在 model facts 上叠加 binding、catalog authority、continuation 与 encoding coverage；
- [`src/next/generation-v2/capability/encodingCoverageRegistryV2.ts`](../../../src/next/generation-v2/capability/encodingCoverageRegistryV2.ts)：按 provider/protocol/operation 声明 encoder path coverage；
- [`electron/services/generationV2CapabilityResolutionService.ts`](../../../electron/services/generationV2CapabilityResolutionService.ts) 及各 provider `*GenerationAuthorityV2Service.ts`：当前实际事实生产/组装入口；
- [`src/next/generation-v2/compiler/semanticCapabilityValidatorV2.ts`](../../../src/next/generation-v2/compiler/semanticCapabilityValidatorV2.ts) 与 provider prepared-request compilers：frozen revision 校验和 wire encoding；
- OpenAI/Anthropic attachment preflight 与 runtime starter：附件证明、credential、runtime integrity，不属于 Model Facts。

当前混合/重复点：

1. `MODEL_CAPABILITY_SEMANTIC_PATHS_V2` 由 Generation Intent 类型生成，既包含事实候选，也包含 `attachments[].assetId`、tool confirmation、provider extension 等命令/协议字段。
2. `CanonicalModelFactsV2` 当前要求完整 path matrix；Source Facts 则必须稀疏。后续应保留 final resolved projection可完整枚举的能力，但不能要求每个 source制造 missing matrix。
3. 各 provider authority 当前同时组装 model facts、contract invariants、runtime/tool policy；Rules 是若干 provider authority中的覆盖层，不是三来源统一 merge。
4. OpenRouter Chat 当前直接读取 Catalog `supported_parameters` / modalities 并生成 capability fields，绕过统一 source semantics 分类。
5. Catalog query已把粗 capabilities降为 hint，但数据库 item仍保存固定 booleans；实际 DeepSeek snapshot证明 missing仍可被 projection写成 false。
6. `ResolvedCapabilityV2` 已把 `modelFacts` 单列，这是可复用的正确基础；但整个 record还包含 operation/protocol/binding/encoding/runtime context，不能把整个 Resolved record定义成 Canonical Model Facts。
7. Runtime Snapshot、semantic validator 和 Compiler已经能冻结/复核同一 revision，这部分应继续消费最终 resolved facts，而不是成为新事实 producer。
8. 当前 catalog authority scope实际按 source provider + credential scope + endpoint profile + operation contract + category隔离；底层 source contract本身却只暴露 provider/base URL/API key，credential identity主要是 fingerprint。Goal 2B不能直接复用整个 operation-scoped catalog key作为 Model Facts subject，但 credential-scoped raw source snapshot仍必须有独立 `sourceScopeId`，详见 9.4。

因此 Goal 2B 的设计对象是 `Canonical Source Facts → Resolved Model Facts` 的上游边界，不是再创建一个与 `CanonicalModelFactsV2` 平行的最终 authority。后续实施应演进现有 model-facts core，并迁移 source producers；不能永久保留两种最终 record。

## 2. 三来源真实字段 inventory

下面的数量与字段只描述已保存样本，不外推到其他时间、credential 或 endpoint。

### 2.1 Provider Native

| Provider/source | 保存记录数 | 实际模型字段 | capability-relevant 观察 |
|---|---:|---|---|
| DeepSeek `/models` | 2 | `id`, `object`, `owned_by` | 没有 capability/limit 字段；缺失不等于 unsupported |
| OpenAI `/v1/models` | 124 | `id`, `object`, `created`, `owned_by`; 50 条有 `deprecation_date` | 本次列表没有 capability/limit 字段 |
| Google AI Studio `/v1beta/models` | 58 | `name`, `version`, `displayName`, `description`, `inputTokenLimit`, `outputTokenLimit`, `supportedGenerationMethods`; 另有 optional `temperature`, `maxTemperature`, `topP`, `topK`, `thinking` | 35/58 有 `thinking`; sampling 字段约 47–48/58；字段是 model-specific 数据而非统一存在 |
| Anthropic `/v1/models` archive | 10 | `type`, `id`, `display_name`, `created_at`, `max_input_tokens`, `max_tokens`, `capabilities` | `capabilities` 明确细分 batch/citations/code execution/context management/effort/image/pdf/structured output/thinking |
| OpenRouter public `/api/v1/models` | 417 | 19 个稳定字段，另有 optional `reasoning`(286)、`alias_target`(12)、`benchmarks`(229) | `architecture`, `context_length`, `reasoning` 较丰富；`supported_parameters` 是请求参数支持表，不等价于模型 semantic capability |
| LM Studio native | 2026-08-26 保存 snapshot 为 `rawPayload:null` | 历史底稿保留了字段 union，但没有本轮可逐记录回放的 raw payload | 官方当前 schema 可确认 `max_context_length`, `capabilities.vision`, `capabilities.trained_for_tool_use`；历史观察中的 reasoning 子字段在实现前需要重新留存 raw payload |
| Ollama `/api/tags` | 2 | `name`, `model`, `modified_at`, `size`, `digest`, `details`, `capabilities` | 实际 `details` 有 `context_length`, `embedding_length`; capabilities 为 `completion` 或 `completion,vision` |
| Ollama `/v1/models` | 2 | `id`, `object`, `created`, `owned_by` | OpenAI-compatible 简化列表无 capability 字段 |
| Generic Local | 无统一保存样本 | 取决于用户 endpoint 的 `/v1/models` 或 `/api/tags` | 不能设计一个假想的 provider-wide schema |

Anthropic 保存的 capability leaf paths及真实布尔值包括：

- `batch.supported`、`citations.supported`、`image_input.supported`、`pdf_input.supported`、`structured_outputs.supported`、`thinking.supported`：样本均出现；
- `code_execution.supported`：样本中同时出现 true/false；
- `effort.supported` 及 `low/medium/high/xhigh/max.supported`：每个 level 独立布尔；
- `thinking.types.enabled.supported` 与 `thinking.types.adaptive.supported`：两种 mode 独立布尔；
- `context_management.supported` 及 `clear_tool_uses_20250919`, `clear_thinking_20251015`, `compact_20260112` 子能力。

OpenRouter 保存的 capability-relevant nested fields包括：

- `architecture.input_modalities/output_modalities/modality/tokenizer/instruct_type`；
- `top_provider.context_length/max_completion_tokens/is_moderated`；
- `reasoning.mandatory/default_enabled/supported_efforts/default_effort/supports_max_tokens`；
- `supported_parameters[]`；
- `default_parameters` 的 sampling defaults；
- `supported_voices`（本次仅观察到 null 或空数组）。

Google 58 条保存 records 的 `supportedGenerationMethods` 实际 member union为：`asyncBatchEmbedContent`, `batchGenerateContent`, `bidiGenerateContent`, `countTextTokens`, `countTokens`, `createCachedContent`, `embedContent`, `generateAnswer`, `generateContent`, `predict`, `predictLongRunning`。这些 raw strings保留在 provenance；Adapter只通过 versioned mapping manifest发布 source-neutral operation kinds。

### 2.2 models.dev 保存 snapshot

保存的 provider keys 与 model counts：

| models.dev provider key | model count | provider record |
|---|---:|---|
| `deepseek` | 3 | `id/env/npm/api/name/doc/models` |
| `openai` | 47 | `id/env/npm/name/doc/models` |
| `google` | 39 | `id/env/npm/name/doc/models` |
| `openrouter` | 355 | `id/env/npm/api/name/doc/models` |
| `lmstudio` | 3 | `id/env/npm/api/name/doc/models` |

模型字段并集来自真实 snapshot：

- 核心布尔：`attachment`, `reasoning`, `tool_call`, `structured_output`（optional）, `temperature`, `open_weights`；
- structured：`reasoning_options`, `modalities`, `limit`, `cost`, optional `interleaved`, optional `experimental`；
- descriptive/lifecycle：`id`, `name`, `description`, `family`, `knowledge`, `release_date`, `last_updated`, `status`。

models.dev 官方仓库对这些字段的定义确认：

- `attachment`：supports file attachments；
- `reasoning`：supports reasoning/thinking；
- `tool_call`：supports tool calling；
- `structured_output`：supports a dedicated structured-output feature；
- `temperature`：supports temperature control；
- `limit.context/input/output`：context、maximum input、maximum output token limits；
- `modalities.input/output`：supported modality lists；
- `reasoning_options`：provider model 的 toggle / effort / budget-token controls；
- `interleaved.field`：`reasoning_content` / `reasoning_details` wire field name。

参考：[models.dev README / Model Schema](https://github.com/anomalyco/models.dev/blob/dev/README.md)。

实际 `reasoning_options` 形状至少有：

```text
{ type: "toggle" }
{ type: "effort", values: string[] }
{ type: "budget_tokens", min?: integer, max?: integer }
```

注意：`reasoning_options: []` 与字段缺失不同。空数组表示该 source record 显式给出了空 option collection；字段缺失才是 source missing。是否把空集合解释为“没有可选 control”必须保留 collection completeness，不能改写成 `reasoning unsupported`。

### 2.3 Capability Rules 当前 schema / packs

当前提交中的 built-in Rules 是 5 packs、90 rules：

| Provider | rules | 现有路径 |
|---|---:|---|
| Google AI Studio | 30 | `reasoning.mode/effort`, `image.mode/aspectRatio/resolution`, `web.mode/types` |
| OpenAI Responses | 38 | `reasoning.mode/effort` |
| Anthropic | 18 | `reasoning.mode/effort` |
| DeepSeek | 4 | `reasoning.mode/effort` |

当前规则字段：pack owner/version/revision/enabled（**当前无 pack-level priority**）；provider/endpoint；exact 或 constrained regex selector；semantic path；state/domain/default/constraints；rule priority；evidence/identity evidence/provenance/verified timestamp；rule revision/digest。

本轮检查到的 built-in rules 全部是 `supported`，当前无 retained regex selector、无 unsupported-by-silence rule；exact selector 可以在一个 rule 中列出多个 model IDs。

当前 `projectCapabilityRulesV2()` 会在 Rules source内部先决胜：按 semantic path先 exact覆盖 regex，再取最高 rule priority；同优先级不同 semantic digest报 conflict，相同事实保留多 evidence。Goal 2B/3不能把这个 winner-only projection当 Source Adapter output，否则 per-rule claims和priority已经丢失。新 Rules Adapter必须从 active rule snapshot输出所有 matched claims；未来如引入 pack priority，Rule snapshot schema也必须显式提供，不能由 canonical adapter猜一个隐藏值。

## 3. Raw 字段真实语义与边界分类

### 3.1 Token limits：三个名字不能自动等价

| Raw field | 原始定义 | Canonical decision |
|---|---|---|
| Google `inputTokenLimit` | maximum input tokens allowed | `limits.input.maxTokens` |
| Google `outputTokenLimit` | maximum output tokens available | `limits.output.maxTokens` |
| Anthropic `max_input_tokens` | maximum input context window size | `limits.input.maxTokens` |
| Anthropic `max_tokens` | maximum accepted `max_tokens` value | `limits.output.maxTokens`，定义为 provider 允许的总输出 token budget，不承诺等于可见文本 tokens |
| OpenRouter `context_length` | provider-specific context length | `limits.contextWindow.maxTokens` |
| OpenRouter `top_provider.context_length` | 当前 top route/provider 的 serving constraint | 不进入 base facts；属于 Runtime Hard Constraints |
| OpenRouter `top_provider.max_completion_tokens` | 当前 top route 的 completion limit | 不进入 base facts；属于 Runtime Hard Constraints |
| models.dev `limit.context` | maximum context window | `limits.contextWindow.maxTokens` |
| models.dev `limit.input` | maximum input tokens | `limits.input.maxTokens` |
| models.dev `limit.output` | maximum output tokens | `limits.output.maxTokens` |
| LM Studio `loaded_instances[].config.context_length` | 当前已加载 instance 配置 | Runtime Hard Constraint，不是模型上限 |
| LM Studio `max_context_length` | model maximum context length | `limits.contextWindow.maxTokens` |

重要修正：即使某次 Google `inputTokenLimit` 与 models.dev `limit.context` 数值全部相等，它们的官方定义仍分别是 input limit 与 context-window limit。本设计不因样本值相等而合并路径。这样避免未来在 input+output 共享窗口的模型上产生系统性错误。

语义核验来源：[Gemini Models API](https://ai.google.dev/api/models)、[Anthropic Models API](https://platform.claude.com/docs/en/api/models/list)、[OpenRouter Models API](https://openrouter.ai/docs/api/api-reference/models/get-models)、[models.dev Model Schema](https://github.com/anomalyco/models.dev/blob/dev/README.md)。

Ollama raw 的 `details.context_length` 已实际出现，但当前 `/api/tags` 公共文档仍未给出足够精确的字段语义。本设计保留 raw pointer，暂不把它发布为 canonical max limit；实现前需以该 Ollama 版本的 schema/source 或 `/api/show` 证据核验。

### 3.2 Modalities、attachments 与 file/pdf

- models.dev `modalities.input/output` 明确表示 supported modality list，可映射为 complete set。
- OpenRouter `architecture.input_modalities/output_modalities` 表示 supported input/output types，可映射为 complete set。
- `file` 与 `pdf` 不同：`file` 是 generic file input kind；`pdf` 是具体 document media kind。不得做 `file ↔ pdf` alias。
- models.dev `attachment` 表示 file attachment support，单独映射为 `input.attachments.support`，不从 `attachment:true` 猜测 image/pdf modality。
- Anthropic `image_input` / `pdf_input` 是单项显式 support assertions；它们是 partial member knowledge，不能因此宣称完整 input modality list。
- LM Studio `capabilities.vision` 是 image-input member assertion；`trained_for_tool_use` 不是“端到端 tool calling 已支持”。
- Ollama `capabilities` 在已保存样本中出现，但 upstream 已有 `/api/tags` 可能漏报 tools 等能力的实例。因此它只能作为 positive/partial member evidence；未列出的 capability 仍为 missing/unknown。

本地来源边界参考：[LM Studio List downloaded models](https://lmstudio.ai/docs/developer/rest/list)、[Ollama List models](https://docs.ollama.com/api/tags)。官方 endpoint 文档只证明响应结构；对 completeness 的保守判断仍来自已保存样本、当前 parser 行为和已知漏报风险，不能反推 explicit unsupported。

Canonical media kinds 初始固定为：

```text
text | image | audio | video | pdf | generic_file
```

`embedding_vector` 不属于 v1 media kind。已保存 raw evidence只证明某些模型支持 embedding operation，并未证明 provider把 vector声明为 output modality；因此 embedding统一由 `operations.supported` 的 `embedding_generate` 表达，避免和 modality形成重复事实。

未知 source-native value 不自动塞入开放字符串 domain；它保留在 raw/unmapped diagnostics，待 adapter mapping revision 明确新增 canonical member。这样既不丢 raw，也不让拼写漂移创建第二套 ontology。

### 3.3 Reasoning / thinking / effort / budget

Canonical 定义中的 `reasoning` 指：provider/model 暴露的、区别于普通生成的 deliberative/thinking capability；它不表示是否返回可见 chain-of-thought。

必须拆开：

- support：是否有 reasoning/thinking capability；
- requirement：是否强制启用；
- toggle：是否有显式 on/off control；
- native modes：例如 Anthropic `enabled/adaptive`；
- native reasoning effort values；
- token-budget control 与边界；
- provider-declared default；
- visible summary/interleaved response shape。

Anthropic 的 `effort` 不应继续和 OpenAI/DeepSeek reasoning effort 共用一个含义。Anthropic 官方定义表明 effort 影响全部 response tokens、工具调用与 thinking，而且不要求 thinking 已开启。因此它映射到 `generation.effort.*`，而不是 `reasoning.effort.*`。

Anthropic 当前已知条件必须逐项分类，不能回落到 generic `constraints`：

| 官方条件 | 归属 | 理由 |
|---|---|---|
| exact model支持 `adaptive` 或 legacy `enabled` thinking | Model Fact：`reasoning.modes.nativeValues` | 逐模型支持差异 |
| thinking开启时 temperature必须为 1/未设置 | API Contract cross-field condition | 请求字段组合合法性，不是新的 capability value |
| 4.7+ 仅接受 temperature默认值 | model-specific typed fact候选 + API Contract enforcement；证据核验后再入 ontology | 同时含逐模型差异与请求合法性，本稿不塞进 generic constraint |
| manual `budget_tokens < max_tokens`，interleaved例外 | API Contract cross-field condition | 两个 request budgets及 mode interaction |
| thinking + tools时 `tool_choice` 仅 auto/none | API Contract/Operation condition | 当前请求组合约束 |
| continuation必须回传 thinking blocks | Wire/Continuation Contract | history/response block协议 |

其中“typed fact候选”在建立精确语义和 source evidence前保持 intentionally unmodeled；Contract仍可依据官方协议执行现有 request legality，但不得把该条件反写为 generic Model Fact constraint。

OpenRouter 要特别保守：官方文档说明 gateway 会把不受 underlying model 支持的 effort 映射到 nearest supported level。故 OpenRouter `supported_efforts` 和 models.dev `openrouter.reasoning_options` 不能自动宣称为 underlying model native values；它们属于 provider API accepted/normalized controls，保留给 API Contract。OpenRouter raw `reasoning` 对象仍可直接贡献 `reasoning.support`（对象存在）和 `reasoning.required`（`mandatory`），但 absence 仍只记 missing。

语义核验来源：[Anthropic effort](https://platform.claude.com/docs/en/build-with-claude/effort)、[OpenRouter reasoning tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)。

`interleaved.field` 是 wire response field name，明确排除在 Model Facts 之外。

### 3.4 Supported parameters、tools 与 structured output

- models.dev `tool_call` 可直接映射 `tools.calling.support`。
- models.dev `structured_output` 可直接映射 `structuredOutput.support`；字段 absent 是 missing，不是 false。
- Anthropic `structured_outputs.supported` 可直接映射相同 support fact。
- LM Studio `trained_for_tool_use` 只映射 `tools.trainingForToolUse`，不映射 `tools.calling.support`。
- OpenRouter `supported_parameters` 的原意是该 gateway/model 接受的 API parameters。`tools`, `response_format`, `structured_outputs`, `reasoning_effort` 的出现都属于 API Contract evidence，不能由 Adapter 投影成模型能力。历史样本中的相关性不构成语义等价证明。
- `tool_choice`、parallel calls、side-effect confirmation、当前可用 tool IDs 均属于 API Contract、Runtime 或 Execution Policy。

这项决定避免“API 有一个字段”被误写成“模型一定具备对应语义能力”。

但逐模型返回的 operation support 不等于 API method 本身。Google 将 `supportedGenerationMethods` 定义为“the model's supported generation methods”，并用它筛选支持 `generateContent` 或 `embedContent` 的模型。因此 Adapter 应把已注册的 source method names 映射为 source-neutral `operations.supported` facts；method 的 URL、request shape、Pascal-case wire name仍属于 API Contract。未注册的新 method name保留 raw/unmapped，不能靠字符串猜测语义。

### 3.5 Image generation、resolution 与 aspect ratio

当前 raw model-list 本身没有提供完整的 image size/ratio 表；这些事实来自 Goal 2A reviewed Rules 的官方 exact-model evidence。

可进入 Model Facts 的最小事实为：

- image generation support；
- complete aspect-ratio set；
- provider-native resolution preset set；
- provider-declared default preset（单独路径，不作为 UI fallback）。

`1K/2K/4K/512` 是 provider-native preset labels，不自动换算成 exact width/height。只有官方 evidence 给出具体 dimensions 时，才新增 typed dimension assertions。这样避免把营销级 resolution label 当作精确像素约束。

### 3.6 Search/web

当前 Provider Native/model.dev raw model-list 没有一个可直接映射的通用 web-search capability 字段。OpenRouter `pricing.web_search` 是价格，不是支持事实；`supported_parameters` 仍是 API Contract。

Goal 2A Google Rules 的 reviewed evidence 可以迁移为：

- `search.web.support`；
- `search.image.support`。

不能原样保留 `web.mode=[disabled,provider_search]`，因为 `disabled` 是 semantic intent，`provider_search` 是 API/product mode；它们不是模型事实。

### 3.7 Sampling

- Google `temperature` 是 backend provider default 数值，不是 boolean support；映射 `sampling.temperature.providerDefault`。
- Google `maxTemperature` 是 model-specific maximum；映射 `sampling.temperature.modelMaximum`。全局 minimum `[0,...]` 属于 API Contract，Adapter 不把 contract 常量注入 raw model fact。
- Google `topP` / `topK` 是 provider defaults；分别映射 provider-default scalar。
- Google 对 `topK` 还有特殊的 empty/absence 语义：为空表示该模型不使用 Top-K，且 `topK` 不允许作为 generation parameter。因此 `topK` 有值时同时贡献 `sampling.topK.support=supported` 和 default；按该 source surface 的官方序列化语义确认为 empty 时贡献 explicit `unsupported`。这项规则必须写入 versioned coverage/mapping manifest，不能推广成“所有 optional 数值字段 absent 都 unsupported”。
- models.dev `temperature:boolean` 表示 temperature control support；映射 `sampling.temperature.support`。
- OpenRouter `default_parameters` 是 provider request-default object。当前不把它作为任意 JSON 放进 facts；只有未来为其中某个字段建立精确定义和 typed mapping 后才可发布。

特殊 null/empty/absence 复审结论：Google `topP`、`temperature`、`maxTemperature` 未获得与 `topK` 相同的 explicit non-support 定义，因此 absence 只按各自 coverage manifest 处理，不生成 unsupported；Anthropic `capabilities.*.supported` 只认显式 leaf boolean；models.dev optional field absent不产生 assertion、显式 boolean false才是 unsupported；OpenRouter null/empty也不得在没有字段级官方定义时机械转成 unsupported。

2026-08-26 保存的 58 条 Google records中，`topK/topP/temperature` 各为 48 个 number + 10 个 property absent，`maxTemperature` 为 47 number + 11 absent，`thinking` 为 35 boolean + 23 absent，均未观察到 JSON null。官方 `topK` empty语义与实际 REST property omission必须由 Google surface-specific manifest明确连接；不能由通用 JSON decoder把所有 absent字段解释成 false。

### 3.8 Provider-specific explicit capabilities

Anthropic model-list 明确把下列内容放在 per-model capabilities 中，因此可作为稀疏 model facts：

- `operations.supported` 中的 `request_batch` member；
- `documents.citations.support`；
- `tools.codeExecution.support`；
- `contextManagement.support`；
- `contextManagement.actions.nativeValues`；
- image/pdf input、structured output、thinking 和 effort 子能力。

“当前 operation 是 batch 吗”“Starverse 是否实现 code execution”“是否允许执行”仍分别属于 Operation、Encoding Coverage 和 Execution Policy。base fact 只陈述 exact binding 的支持能力。

### 3.9 明确不进入本 ontology 的字段

| 字段类别 | 示例 | 去向 |
|---|---|---|
| identity | model id/name/resource name/canonical slug/alias target/family | exact subject identity 或 catalog descriptive metadata |
| availability/lifecycle | API list membership, `status`, deprecation/expiration dates | Catalog availability/lifecycle；models.dev 不创建 availability |
| display metadata | display name, description, knowledge cutoff | sibling catalog metadata，非 capability authority |
| pricing | models.dev cost, OpenRouter pricing | pricing ontology；不混入 capability revision |
| API Contract | supported parameters, accepted effort aliases, request field names、method wire names与调用 shape | contract/operation layer；逐模型 method support先映射为 source-neutral Model Facts |
| wire | `interleaved.field`, target JSON path, response field name | encoder/decoder |
| runtime | top provider limits, loaded instance context, per-request limits, current tools/attachments | Runtime Hard Constraints |
| execution/UI | requires confirmation, allow-attempt, visibility, defaults chosen by product | Execution Policy / UI projection |

## 4. Canonical Model Facts ontology

### 4.1 Subject 不是 capability field

每个事实 batch 必须绑定 exact subject：

```ts
type CanonicalModelSubjectV1 = {
  providerAuthorityId: string
  endpointProfileId: string
  nativeModelId: string
}
```

- `providerAuthorityId` 表示事实 authority（例如 OpenAI、Google AI Studio、OpenRouter），不包含 protocol/operation 名称。
- 当前执行 provider key 如 `openai_responses` 可由后续 binding registry 映射到 authority subject；不能因此把 Responses protocol 写进 base facts identity。
- OpenRouter pinned route、LM Studio loaded instance 等只有在 source 提供 route/instance 级独立事实时才形成更窄的 subject variant；当前 top-provider/runtime 数据不写入 base subject。
- model identity 不作为 semantic field；这避免 Rules 或 models.dev 通过 capability ingestion 重写模型 ID。

`providerAuthorityId` 的 registry contract在 Goal 2B 冻结，具体 entries可在实现 Goal填写：

```ts
type ProviderAuthorityRegistryEntryV1 = {
  providerAuthorityId: string                 // stable, source-neutral authority identity
  providerNativeSurfaceIds: string[]          // exact registered source surfaces
  executionBindings: Array<{
    implementationProviderId: string
    endpointProfileKind: string
  }>
  modelsDevProviderKeys: string[]              // explicit bindings; may be empty
  registryEntryRevision: string
}
```

约束：

1. authority ID不是 execution provider key、protocol、operation、npm package或用户显示名；它是 Starverse registry分配的稳定事实 authority identity。
2. execution binding、Provider Native surface和 models.dev provider key只能通过 versioned registry entry连接，不得 lower-case、去前缀、模糊匹配或按字符串猜测。
3. 一个 implementation可以通过多个显式 entries服务多个 authority，但每个 exact subject只能解析到一个 authority；多匹配或无匹配时 source join失败并保留 diagnostics，不能任选其一。
4. Generic compatible endpoint没有已注册 authority binding时，不得借兼容协议继承 OpenAI或其他 lab facts；其 exact endpoint profile仍可拥有独立 authority entry。
5. registry revision进入 source selection/provenance；映射变化可重新 normalize source facts，但不修改 raw model identity。
6. 同一 source surface/provider key在同一 endpoint-profile scope内不得歧义映射到多个 authority；models.dev key没有显式 entry时只表示该 source无法 join，不触发 fallback或 availability变化。

这一定义避免把 `openai_responses`、`openai`、models.dev `openai` 仅因名称相似就连接，也避免同一 codec实现把不同 provider authority的事实串流。

### 4.2 Source outcome 与 resolved knowledge 分层

Source Adapter 对它负责检查的 canonical path 产生：

```text
present_valid  → 一个 typed assertion
missing        → source 本次没有该字段/声明
invalid        → source 有字段，但无法合法映射
```

“负责检查”由 versioned Source Mapping Coverage Manifest声明；某 API surface根本不表达该 canonical path时，不产生 `missing`，而是完全没有 field outcome。`missing` 仅表示“此 surface声明可观察该 path，但本 exact record按该 mapping的 absence semantics没有值”。

`unsupported` 只能是 support assertion 的显式值：

```text
{ kind: "support", value: "unsupported" }
```

Goal 3 的 resolved knowledge state 才是：

```text
known(value) | unknown | conflict(candidates)
```

因此：

```text
source missing ≠ resolved unknown（但可能导致它）
source invalid ≠ source missing
known unsupported ≠ unknown
conflict ≠ invalid
```

### 4.3 Typed value kinds

Canonical assertion value 采用封闭 typed union；不允许 arbitrary JSON：

```ts
type CanonicalSemanticPathV1 = string & { readonly __canonicalSemanticPathV1: unique symbol }

type MediaKind = 'text' | 'image' | 'audio' | 'video' | 'pdf' | 'generic_file'

type CanonicalFactValueV1 =
  | { kind: 'support'; value: 'supported' | 'unsupported' }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'integer'; value: number; unit?: 'token' | 'pixel' }
  | { kind: 'decimal'; value: number }
  | { kind: 'native_string'; value: string }
  | { kind: 'native_string_set'; values: string[]; completeness: 'complete' | 'partial' }
  | { kind: 'media_kind_set'; values: MediaKind[]; completeness: 'complete' | 'partial' }
  | { kind: 'operation_kind_set'; values: CanonicalOperationKindV1[]; completeness: 'complete' | 'partial' }
  | CanonicalIntegerDomainV1
  | { kind: 'aspect_ratio_set'; values: { width: number; height: number }[]; completeness: 'complete' | 'partial' }
  | { kind: 'dimensions_set'; values: { width: number; height: number }[]; completeness: 'complete' | 'partial' }

type CanonicalIntegerDomainV1 = {
  kind: 'integer_domain'
  unit?: 'token' | 'pixel'
  interval?: { min?: number; max?: number; minInclusive: boolean; maxInclusive: boolean }
  includedValues?: number[]
  excludedValues?: number[]
  symbolicNativeValues?: string[]
  completeness: 'complete' | 'partial_bounds'
}

type CanonicalOperationKindV1 =
  | 'content_generate'
  | 'content_generate_bidirectional'
  | 'content_generate_batch'
  | 'answer_generate'
  | 'embedding_generate'
  | 'embedding_batch_async'
  | 'token_count'
  | 'context_cache_create'
  | 'predict'
  | 'predict_long_running'
  | 'request_batch'
```

`CanonicalSemanticPathV1` 不是开放字符串：实现时只能由 versioned ontology registry从 4.4 的冻结 path entries构造；brand只是避免在设计示例里重复长 literal union。Adapter、Rules和Goal 3均不得提交未注册 path。

与当前 `ModelCapabilityDomainV2` 相比需要的关键演进：

- list 可以是空的 complete set；
- integer domain 可以只有单边，也可以表达少量 included/excluded integer sentinel 与 provider-native symbolic values；它不是任意表达式 DSL，字段互斥、排序、大小上限和 overlap validation必须封闭定义；
- set 自带 completeness，不靠调用方猜；
- support state 与 domain/value 分开；
- typed field 不再依附 Generation Intent 的 request paths；
- provider default 是独立 semantic path，不是 field 上通用 `defaultValue`。

仍可复用现有稳定序列化、canonical ordering、domain validation、evidence digest 和 `capabilityRevision` 的实现思路。

### 4.4 初始 canonical semantic paths

下表的 core paths先由 Provider Native/models.dev raw semantics 得出；完成该草案后才用 Capability Rules反查缺口。`image.generation.*` 与 `search.*` 是这次最后阶段唯一纳入的 reviewed-evidence extensions：纳入依据是每条 Rule背后的 provider evidence能够独立定义这些事实，而不是为了保留现有 `image.mode/web.mode` 路径或减少迁移工作。旧 Rule shape仍在第 10 节被拒绝并要求重写。若底层 evidence不能独立支持精确定义，该字段不得仅因现有 Rule存在而进入 ontology。

| Canonical path | Type | 精确定义 | Knowledge/completeness |
|---|---|---|---|
| `limits.contextWindow.maxTokens` | integer/token | provider/model binding 声明的总 context-window 上限 | scalar；missing 不推导 |
| `limits.input.maxTokens` | integer/token | 最大输入 token 数 | scalar |
| `limits.output.maxTokens` | integer/token | provider 允许的总输出 token budget 上限 | scalar；不承诺 visible text 独占 |
| `modalities.input` | media_kind_set | 模型可消费的 semantic input kinds | source 可 complete 或 partial |
| `modalities.output` | media_kind_set | 模型可生成的 semantic output kinds | source 可 complete 或 partial |
| `input.attachments.support` | support | binding 是否支持 file attachment input | 不推导具体 file type |
| `operations.supported` | operation_kind_set | exact model支持的 source-neutral operation kinds | Google method list可 complete；Ollama/Anthropic leaf可 partial；current operation仍在 facts之外 |
| `reasoning.support` | support | 是否有 provider-exposed thinking/reasoning capability | 不表示可见 CoT |
| `reasoning.required` | boolean | reasoning 是否不能关闭 | 不是 toggle support |
| `reasoning.toggle.support` | support | 是否有显式 on/off control | 不含 disabled intent value |
| `reasoning.modes.nativeValues` | native_string_set | model/provider 原生 mode values | complete/partial 必须声明 |
| `reasoning.effort.nativeValues` | native_string_set | 原生 reasoning-depth values | compatibility aliases 排除 |
| `reasoning.effort.providerDefault` | native_string | provider 在未指定时的 factual default | 不作为 Starverse send fallback |
| `reasoning.budgetTokens.support` | support | 是否支持 direct reasoning token budget control | 与 effort 独立 |
| `reasoning.budgetTokens.domain` | integer_domain/token | direct reasoning budget连续区间、离散 sentinel、excluded values或少量 symbolic native values | 可 partial_bounds；不得用 generic constraint DSL |
| `generation.effort.nativeValues` | native_string_set | 影响整体 response/tool/thinking token spend 的 provider-native effort values | Anthropic 使用此路径 |
| `generation.effort.providerDefault` | native_string | overall effort factual default | 非 UI default |
| `sampling.temperature.support` | support | model/provider 是否支持 temperature control | models.dev boolean 可直接贡献 |
| `sampling.temperature.providerDefault` | decimal | backend/model factual default | Google numeric field |
| `sampling.temperature.modelMaximum` | decimal | model-specific maximum | global min 留给 API Contract |
| `sampling.topP.providerDefault` | decimal | backend/model top-p default | 不表示完整 range |
| `sampling.topK.support` | support | 模型是否允许 Top-K generation control | Google empty语义可贡献 explicit unsupported |
| `sampling.topK.providerDefault` | integer | backend/model top-k default | default absence与 support assertion分开处理 |
| `tools.calling.support` | support | model/provider 能否产生 structured tool calls | 不含 tool availability/policy |
| `tools.trainingForToolUse` | support | source 仅声明模型经过 tool-use training | 不等同 calling support |
| `tools.codeExecution.support` | support | provider/model 的 hosted code-execution capability | Starverse authorization另算 |
| `structuredOutput.support` | support | dedicated structured-output feature | 不描述 wire schema |
| `image.generation.support` | support | model 可生成 image output | current operation另算 |
| `image.generation.aspectRatios` | aspect_ratio_set | exact supported ratios | Rules 当前证据为 complete lists |
| `image.generation.resolutionPresets.nativeValues` | native_string_set | provider-native preset labels | 不自动换算 pixels |
| `image.generation.resolutionPreset.providerDefault` | native_string | provider-declared preset default | 非 UI fallback |
| `search.web.support` | support | model/provider binding 支持 web search/grounding | API field/encoder另算 |
| `search.image.support` | support | 支持 image search/grounding | 与 web 分开 |
| `documents.citations.support` | support | provider/model 支持 citation feature | 输出结构由 contract/decoder负责 |
| `contextManagement.support` | support | provider/model 支持 context-management feature | 不是当前 runtime context policy |
| `contextManagement.actions.nativeValues` | native_string_set | explicit supported provider-native actions | Anthropic leaf booleans形成 complete/partial set |

当前不把以下路径放入初始 ontology：reasoning summary/thought summary、exact image dimensions、voice domains、OpenRouter parameter names、Ollama `details.context_length`。原因不是宣称不支持，而是当前保存证据不足以给出无歧义 mapping；它们保留 raw 并列入后续核验候选。

## 5. Source → canonical mapping

### 5.1 Provider Native adapters

| Source | Raw path | Canonical output | Mapping quality |
|---|---|---|---|
| Google | `inputTokenLimit` | `limits.input.maxTokens` | lossless |
| Google | `outputTokenLimit` | `limits.output.maxTokens` | lossless |
| Google | `thinking` | `reasoning.support` | lossless boolean support |
| Google | `temperature` | `sampling.temperature.providerDefault` | lossless；不与 models.dev boolean 合并 |
| Google | `maxTemperature` | `sampling.temperature.modelMaximum` | lossless single bound |
| Google | `topP` | corresponding provider default | lossless；absence不推 unsupported |
| Google | `topK` | `sampling.topK.support` + provider default | value present→supported+default；official empty semantics→unsupported |
| Google | `supportedGenerationMethods` | `operations.supported` | versioned exact mapping：`generateContent/embedContent/...` → source-neutral operation kinds；wire method name留在 provenance/raw |
| Anthropic | `max_input_tokens/max_tokens` | input/output limits | lossless with documented output-budget definition |
| Anthropic | `capabilities.image_input/pdf_input` | partial input modality member assertions | lossless；不构造 complete list |
| Anthropic | `capabilities.thinking` | reasoning support + native modes | lossless per leaf boolean |
| Anthropic | `capabilities.effort` | generation effort support/native values | lossless；修正旧 reasoning-effort 误分类 |
| Anthropic | `structured_outputs` | structured output support | lossless |
| Anthropic | batch | `operations.supported` member `request_batch` | partial member assertion；current batch operation仍在 facts外 |
| Anthropic | citations/code_execution/context_management |对应 typed paths | lossless per explicit leaf |
| OpenRouter | `context_length` | context-window limit | lossless |
| OpenRouter | `architecture.*_modalities` | complete media sets (`file→generic_file`) | lossless canonical label mapping；不做 file↔pdf alias |
| OpenRouter | `reasoning` object presence | reasoning supported | direct positive evidence |
| OpenRouter | `reasoning.mandatory` | reasoning required boolean | lossless |
| OpenRouter | `reasoning.default_*` | provider-default facts | lossless；不作为 UI fallback |
| OpenRouter | `reasoning.supported_efforts/supports_max_tokens` | no base fact | gateway accepted/normalized contract semantics |
| OpenRouter | `supported_parameters/default_parameters` | no base fact | API Contract / typed defaults 待独立设计 |
| OpenRouter | `top_provider/per_request_limits` | no base fact | Runtime Hard Constraints |
| Ollama | positive `capabilities` members | partial `operations.supported` / modality assertions | positive-only；absence 不否定 |
| LM Studio | `max_context_length`, `vision`, `trained_for_tool_use` | context limit, partial image modality, tool-training fact | 以官方 schema 为准；raw payload 需在实现前重新留存 |
| DeepSeek/OpenAI list | identity/lifecycle only | no capability outcomes | 该 API surface未声明 capability coverage；不制造 missing matrix或 unsupported |

Google operation mapping v1（只覆盖本次 raw实际 members）：

| Google source member | Canonical operation kind |
|---|---|
| `generateContent` | `content_generate` |
| `bidiGenerateContent` | `content_generate_bidirectional` |
| `batchGenerateContent` | `content_generate_batch` |
| `generateAnswer` | `answer_generate` |
| `embedContent` | `embedding_generate` |
| `asyncBatchEmbedContent` | `embedding_batch_async` |
| `countTokens`, `countTextTokens` | `token_count` |
| `createCachedContent` | `context_cache_create` |
| `predict` | `predict` |
| `predictLongRunning` | `predict_long_running` |

该表是 mapping manifest的一部分，而不是把 Google method names提升为 canonical enum。新 source member必须先解释真实语义并更新 manifest revision；unknown member触发 partial + unmapped规则。

Google `topK` mapping manifest v1（`sourceSurfaceId='gemini-models-v1beta'`）明确冻结为：

| Canonical path | present finite integer | property omitted（该 REST surface的 protobuf empty表示） | null / non-integer / malformed | Manifest fields |
|---|---|---|---|---|
| `sampling.topK.support` | `supported` | `explicit_unsupported` | `invalid` | `absenceSemantics=explicit_unsupported`, `nullSemantics=invalid`, `collectionCompleteness=not_a_collection` |
| `sampling.topK.providerDefault` | exact integer value | no outcome | `invalid` | `absenceSemantics=no_outcome`, `nullSemantics=invalid`, `collectionCompleteness=not_a_collection` |

该 omission规则只属于上述 versioned Google surface。其他 source、其他字段和未来 Google surface不得继承；surface serialization semantics变化必须更新 manifest revision并重新 normalize。

### 5.2 models.dev adapter

默认 mapping：

| models.dev path | Canonical path | 说明 |
|---|---|---|
| `attachment` | `input.attachments.support` | explicit true/false |
| `reasoning` | `reasoning.support` | explicit true/false |
| `tool_call` | `tools.calling.support` | explicit true/false |
| `structured_output` | `structuredOutput.support` | optional；absent = missing |
| `temperature` | `sampling.temperature.support` | boolean control support |
| `modalities.input/output` | corresponding complete media sets | `pdf` 保持 pdf |
| `limit.context/input/output` | three distinct limit paths | optional subfield逐项 missing |
| `reasoning_options.toggle` | `reasoning.toggle.support` | direct option-kind support |
| `reasoning_options.effort.values` | `reasoning.effort.nativeValues` | 仅 direct/lab provider mapping 明确不是 gateway alias 时发布 |
| `reasoning_options.budget_tokens` | budget support/integer domain | bounds 缺失时 partial_bounds；special values仅按 source evidence映射 |
| `interleaved.field` | no base fact | wire field name |
| `cost/status/dates/open_weights/knowledge/description/family` | no capability assertion | sibling metadata/raw only |

Provider-specific exception必须由 adapter mapping registry 显式声明。例如 `models.dev/openrouter` 的 reasoning options 暂不发布 native effort values，因为 OpenRouter 文档明确存在 nearest-level mapping；这不是 source priority 决策，而是避免误分类 source field semantics。

models.dev官方API返回的provider-specific model record视为models.dev已完成source-native composition后公开的扁平结果。Adapter只解释API payload实际存在的字段，provenance指向该扁平record/field及API raw snapshot；不得猜测字段来自base还是provider override，也不得重建API未暴露的`base_model/base_model_omit`。若未来引入Git/TOML source，必须作为新的显式source surface和adapter revision处理，不能改变既有API snapshot的证据语义。

### 5.3 Capability Rules adapter

Rules adapter 只读取 active rule snapshot 和传入的 exact subject；它可以在自己的 source 内执行 exact/constrained-regex selector matching，但不读取 Provider Native 或 models.dev，不比较优先级。

每条命中的 Rule输出独立 claim。Rule priority、pack priority、effective priority、priority-semantics revision、enabled、owner、pack/rule identity、selector 和 evidence均保留在 **per-claim metadata**，不能只挂在 snapshot metadata；typed fact value必须使用本节 ontology。Adapter不按 priority选 winner，即使两个 Rule值相同也保留可审计的两个 claims，Goal 3再作 deterministic merge/conflict处理。

## 6. Completeness 与 partial knowledge

### 6.1 四种 collection 情形

| source observation | canonical expression | 未列出的 member |
|---|---|---|
| 完整列表 | `completeness: complete` | 可在 Goal 3 解释为该来源未支持/未包含，但不能在 Adapter 批量生成 unsupported rows |
| positive-only list | `completeness: partial` | unknown |
| explicit empty complete list | `values: [], complete` | source 显式声明无 options；parent capability仍可 supported |
| 字段 absent | `missing` outcome | unknown；不创建空 list |

若 source声明的是 complete list，但其中存在未注册的 source-native member，Adapter必须：保留能无损映射的已知 members；把 canonical collection降为 `completeness:'partial'`；为每个未知 member记录 `unmappedSourceFields(reasonCode:'unknown_member')`。只有所有 source members均成功映射且 source自身声明 exhaustive时，canonical set才可标 `complete`。这避免 `[text,image,future_media]` 被静默截成看似完整的 `[text,image]`。

### 6.2 Integer domain

- 两端都有且 source 定义为完整边界：`complete`。
- 只有 min 或 max：`partial_bounds`，不得补默认上/下界。
- 一个单独 scalar maximum 不应伪装成 `[0,max]`；例如 Google `maxTemperature` 只贡献 `modelMaximum`。
- malformed bound 是 `invalid`；另一端若有效，可作为独立 subfield assertion，而不是整条 range 作废。
- provider明确声明的 integer sentinel、excluded values或 symbolic native values分别进入 bounded `includedValues/excludedValues/symbolicNativeValues`；不得用它们偷偷改写连续 interval。canonicalizer拒绝未解释的 overlap、重复值、超限集合和未注册 symbolic value。
- Gemini thinking budget这类“连续区间 + off/dynamic/sentinel”只有在 raw或 reviewed evidence逐项定义后才发布对应成员；证据不足时保留 unmapped，不用 generic constraint猜测。

### 6.3 Parent/child

Parent support 与 child domains 独立：

```text
reasoning.support = supported
reasoning.effort.nativeValues = missing
reasoning.budgetTokens.domain = partial_bounds
```

这是合法状态。Adapter 不从 child absence反推 parent unsupported，也不从一个 unsupported level 反推整个 capability unsupported。

## 7. Provenance 与 raw reference

### 7.1 Raw audit authority

Canonical facts 不复制整份 raw record。这里的 raw authority专指**实际持久化的脱敏 source payload**，不是未经处理的 network bytes。网络响应可选保存 digest，但含 secret的原始 bytes不得为了“可重放”而落盘。

```ts
type RawPayloadRefV1 = {
  storeId: string
  persistedPayloadSha256: string
  recordKey: string
  sanitizerRevision: string
  networkPayloadSha256?: string // digest only; does not imply network bytes are retained
}

type SourceFieldRefV1 = {
  rawPayloadRef: RawPayloadRefV1
  sourceRecordIdentity: string
  sourceFieldPath: string
  observedPresence: 'present' | 'expected_missing'
}

type RuleClaimContextV1 = {
  ownerKind: 'built_in' | 'user'
  ownerId: string
  packId: string
  ruleId: string
  packRevision: string
  ruleRevision: string
  selectorKind: 'exact' | 'regex'
  selectorRef: string
  packPriority: number
  rulePriority: number
  effectiveRulePriority: number
  prioritySemanticsRevision: string
}

type CanonicalObservationProvenanceV1 = {
  sourceKind: 'provider_native' | 'models_dev' | 'capability_rule'
  canonicalSourceRevision: string
  sourceFieldRefs: SourceFieldRefV1[]
  adapterId: string
  adapterRevision: string
  mappingId: string
}

type CanonicalFactProvenanceV1 = CanonicalObservationProvenanceV1 & {
  claimId: string
  sourceClaimIdentity: string
  assertionKind: 'explicit' | 'derived'
  evidenceRefs: string[]
  ruleClaim?: RuleClaimContextV1
  derivation?: {
    derivationId: string
    derivationRevision: string
    inputClaimRefs: string[]
    inputEvidenceRefs: string[]
  }
}
```

约束：`claimId` 对 canonical source revision + exact subject + source claim identity + canonical path/value确定性生成；同一 Rule覆盖多个 model IDs时产生各自 subject-bound claims，同一路径的多个 Rules仍是独立 claims，不允许 Adapter先合并。Rule claim逐条携带 owner、pack/rule identity和 priority，Goal 3才比较它们。`derived` 必须带已注册的 derivation ID/revision及输入 claim/evidence refs；`explicit` 不得伪造 derivation。Goal 3可据此执行 explicit > derived而不丢可复现性。当前 Goal 2A-Fix retained derived rules为 0，不产生 `derived_empirical` claims；当前 Rules claims按其实际 evidence kind保留。未来新产生的 derived claim才使用 `assertionKind:'derived'` 并携带注册 derivation与输入 refs。

`effectiveRulePriority` 是 Rule source在 `prioritySemanticsRevision` 下声明的 claim-level priority输入，不是 Adapter选出的 winner；`selectorKind` 也必须随 claim传递。Goal 3仍负责 exact-over-regex、pack/rule priority和同优先级 conflict。当前 Goal 2A pack没有 pack priority，后续 Rule snapshot migration必须显式补齐，而不是由 Adapter静默默认。

为什么足够回溯：canonical source revision + persisted payload digest定位 immutable sanitized payload；record key和 `sourceFieldRefs[]` 定位一个或多个原值/预期缺失位置；sanitizer/adapter/derivation revision解释从 network surface到 claim的每一步。简单一对一 mapping只有一个 field ref；Anthropic多个 leaf booleans合成 action set时保留全部 refs。`missing` observation使用 `observedPresence:'expected_missing'` 指向实际 record和 manifest声明的 source path，不假造字段值。canonical source/subject fact records无需复制 raw JSON。

Rule source 的 `rawPayloadRef` 指向实际持久化的 pack/rule snapshot、revision和 content digest（`sanitizerRevision='none'`）；官方 URL、verifiedAt、evidence note继续作为 rule evidence metadata。

### 7.2 Invalid 与 unmapped

- `invalid` current observation保存 raw pointer、canonical target path、validation error code、adapter revision；不复制任意 raw JSON。
- capability-relevant 但尚未有 canonical mapping 的字段进入 `unmappedSourceFields` diagnostics，例如当前 OpenRouter `supported_voices`、LM reasoning fields待核验。
- unknown source-native keys不导致整个 model record失败，也不自动扩展 ontology。
- sanitizer删除/遮蔽了 capability-relevant字段时必须产生 `redacted_by_sanitizer` diagnostic，不能伪装成 field absent。sanitized payload只能重放其持久化后的 source shape；`networkPayloadSha256`只证明网络 payload identity，不声称 bytes仍可重放。

## 8. Unified Source Adapter contract

以下是设计接口，不是本 Goal 的 production schema：

```ts
interface CanonicalModelFactSourceAdapterV1 {
  readonly sourceKind: 'provider_native' | 'models_dev' | 'capability_rule'
  readonly adapterId: string
  readonly adapterRevision: string
  readonly coverageManifest: SourceMappingCoverageManifestV1
  readonly subjectDiscovery: 'enumerable' | 'query_bound'

  indexRawRecords?(rawSnapshot: RawSourceSnapshotRefV1): SourceRecordIndexV1

  adaptExactSubject(input: {
    rawSnapshot: RawSourceSnapshotRefV1
    sourceRevision: CanonicalSourceRevisionRefV1
    subject: CanonicalModelSubjectV1
  }): CanonicalSubjectFactCandidateV1
}

interface RawSourceSnapshotRefV1 {
  sourceKind: 'provider_native' | 'models_dev' | 'capability_rule'
  sourceScopeId: string
  rawSourceSnapshotRevision: string
  recordSetCompleteness: 'complete' | 'partial' | 'unknown' | 'not_applicable'
  rawEnvelopeRefs: RawPayloadRefV1[]
}

interface SourceMappingCoverageManifestV1 {
  sourceSurfaceId: string
  manifestRevision: string
  mappings: Array<{
    mappingId: string
    sourceFieldPaths: string[]
    canonicalPath: CanonicalSemanticPathV1
    absenceSemantics: 'missing' | 'explicit_unsupported' | 'no_outcome'
    nullSemantics: 'invalid' | 'missing' | 'explicit_unsupported' | 'mapped_value'
    collectionCompleteness: 'complete' | 'partial' | 'not_a_collection'
  }>
}

interface CanonicalFactAssertionV1 {
  path: CanonicalSemanticPathV1
  value: CanonicalFactValueV1
  provenance: CanonicalFactProvenanceV1
}

interface CanonicalFieldOutcomeV1 {
  observationId: string
  path: CanonicalSemanticPathV1
  currentObservation:
    | { kind: 'present_valid'; assertion: CanonicalFactAssertionV1 }
    | { kind: 'missing'; provenance: CanonicalObservationProvenanceV1 }
    | { kind: 'invalid'; errorCode: string; provenance: CanonicalObservationProvenanceV1 }
  effectiveAssertion?: CanonicalFactAssertionV1
  disposition: 'current' | 'none' | 'lkg_retained_after_invalid'
}

interface UnmappedSourceFieldV1 {
  sourceFieldRefs: SourceFieldRefV1[]
  reasonCode: 'unknown_field' | 'unknown_member' | 'ambiguous_semantics' | 'redacted_by_sanitizer'
  candidateCanonicalPath?: CanonicalSemanticPathV1
}

interface CanonicalSubjectFactCandidateV1 {
  schemaVersion: 1
  subject: CanonicalModelSubjectV1
  sourceRevision: CanonicalSourceRevisionRefV1
  recordOutcome:
    | 'present'
    | 'no_matching_claims'
    | 'absent_in_complete_snapshot'
    | 'indeterminate_in_incomplete_snapshot'
    | 'invalid_identity'
  outcomes: CanonicalFieldOutcomeV1[]
  unmappedSourceFields: UnmappedSourceFieldV1[]
  subjectFactPayloadDigest: string
}

interface CanonicalSourceRevisionRefV1 {
  sourceKind: 'provider_native' | 'models_dev' | 'capability_rule'
  sourceScopeId: string
  rawSourceSnapshotRevision: string
  adapterRevision: string
  coverageManifestRevision: string
  providerAuthorityRegistryRevision: string
  previousLkgSourceRevision?: string
  canonicalSourceRevision: string
}

interface CanonicalSubjectFactRefV1 {
  sourceRevision: CanonicalSourceRevisionRefV1
  subject: CanonicalModelSubjectV1
  subjectFactPayloadDigest: string
  canonicalSubjectFactRevision: string
}

interface SourceRecordIndexV1 {
  sourceScopeId: string
  recordSetCompleteness: 'complete' | 'partial' | 'unknown'
  exactSubjects: CanonicalModelSubjectV1[]
  invalidRecordRefs: RawPayloadRefV1[]
}
```

约束：

1. Adapter 只解释自己的 source snapshot。
2. 输入始终是 exact subject；models.dev 使用显式 provider-key binding + exact model ID，Rules 使用 exact subject匹配自己的 selector。
3. Enumerable Adapter可以为自身 source snapshot建立 exact record index，但该 index只描述 source evidence coverage，不创建 Catalog availability。Rules这类 regex selector无法枚举所有潜在 native IDs，必须声明 `query_bound`，只对调用方给定的 exact subject产生 claims；不得用 regex生成模型身份。找不到 exact record只产生 candidate-level `recordOutcome`，不为所有 canonical paths制造 missing rows。只有 record set完整时才能写 `absent_in_complete_snapshot`；分页不完整或 completeness未知时必须写 `indeterminate_in_incomplete_snapshot`。
4. Adapter 不读取另一个 source补字段。
5. Adapter 不比较 source priority、rule priority或解决 conflict。
6. Adapter 不注入 UI default、API compatibility alias、wire path、runtime policy。
7. Adapter 不因 missing 生成 unsupported。
8. 单条 source raw record identity不可信时只 reject该 record candidate并写入 `invalidRecordRefs`；单字段 malformed只标记该 field invalid。只有 response envelope/provider/source schema identity整体失去可信性时才 reject整个 source refresh。
9. Adapter只能为 coverage manifest中声明可观察的 canonical path产生 field outcome。API surface根本不表达某能力时没有 mapping entry，也没有 outcome；OpenAI/DeepSeek `/models` 因而不为 reasoning/tools等生成 missing matrix。Gemini `thinking` 属于可观察 mapping，record缺字段时才按其 versioned absence semantics产生 missing。
10. `explicit_unsupported` 只能来自该 source字段的官方 null/empty/absence定义，例如 Google `topK` empty语义；不得成为 optional field的通用默认。
11. 多条 Rule命中同一 subject/path时，每条 Rule输出独立 `CanonicalFieldOutcomeV1`/claim及自己的 priority metadata；Adapter不选 winner、不折叠相同值。Goal 3处理 rule/pack priority和 conflict。
12. `currentObservation` 永远描述本轮 raw；`effectiveAssertion`描述本轮发布后该 source对外提供的 assertion。present-valid时二者指向本轮 claim；missing时不保留旧 assertion；invalid时可保留上一已发布 assertion并标 `lkg_retained_after_invalid`。保留的 assertion必须完整保留原始 `canonicalSourceRevision/claimId/sourceFieldRefs`，不能重写成来自本轮 source revision。

Rules raw snapshot使用 `recordSetCompleteness:'not_applicable'`；selector未命中是 `no_matching_claims`，不是“模型记录缺失”。

Rules regex 的边界：regex只发生在 Rules adapter内部，用传入的 exact `nativeModelId` 做 identity selection；输出 assertion仍绑定 exact subject。regex 本身和 positive/negative examples保留 provenance，但不进入 capability value。这满足 Goal 2A-Fix 的 constrained regex，同时不让 canonical facts变成 family inheritance DSL。

`recordOutcome` 只描述“本 source snapshot是否有可归一化的 exact record/claim”，不代表模型在 provider endpoint上的 availability，也不参与 model identity重写。Rules exact subject没有命中 selector时使用 `no_matching_claims`，不制造 missing fields。尤其 models.dev 有记录不能创建 active model，Provider Native完整列表中无记录也只影响该 source的证据覆盖；当前 credential/endpoint availability仍由独立 Catalog authority决定。

这一区分解决两种不同的 sparse 情形：source surface不覆盖某 path时完全没有 outcome；surface覆盖但 exact record未给出该字段时才有 manifest定义的 missing/unsupported/invalid observation。`missing` 因此不是“全 ontology默认行”。

### 8.1 Source Revision 与 Subject Fact Builder / Publisher

必须拆开“冻结 source universe”和“该 source revision下某个 exact subject的 canonical facts”：

```text
raw source refresh
  → validate/sanitize/persist raw envelope
  → CanonicalSourceRevisionBuilder
       raw snapshot + adapter/manifest/authority revisions
       → CanonicalSourceRevisionRef

CanonicalSourceRevisionRef + exact subject
  → Adapter
  → CanonicalSubjectFactCandidate
  → SubjectFactBuilder
       validate coverage/claim/provenance
       apply field-level LKG from previous source revision's same-subject fact
       → CanonicalSubjectFactRef
```

`CanonicalSourceRevisionRef` 不包含任何预先枚举的 subject claims，也不包含 subject fact digest。它只冻结 source原料、scope和解释这些原料所需的 adapter/coverage/authority revisions，因此不会因查询顺序、cache创建或后来首次出现一个新 native model ID而变化。

`CanonicalSubjectFactRef` 绑定一个 exact subject和一个 source revision；其 payload digest完整覆盖该 subject的 current observations、effective assertions、claim identity/priority/derivation与LKG disposition。`canonicalSubjectFactRevision` 由 canonical source revision + exact subject + subject fact payload digest确定性生成。

发布边界：

- enumerable Provider Native/models.dev可以预计算全部 indexed subjects，并原子发布 source revision + complete subject-fact index；
- query-bound Rules只原子发布 frozen Rule `CanonicalSourceRevisionRef`，随后按 exact subject lazy生成 content-addressed `CanonicalSubjectFactRef`；lazy cache写入不得改变 source revision；
- SubjectFactBuilder应用LKG时使用 source revision中冻结的 `previousLkgSourceRevision`，按同一 exact subject取得或确定性回算上一 subject fact；cache此前是否 materialize不得改变结果。只有没有 predecessor、predecessor对该 subject无有效 assertion或其 raw/provenance已按合法 retention终止时才没有可保留LKG，且绝不能从其他 subject借用；
- Publisher不比较 Provider Native/models.dev/Rules，不计算最终 `capabilityRevision`，也不改变 availability。

各来源 refresh cadence独立且用户可配置；刷新一个来源不触发其他来源请求。网络失败、pagination incomplete或 source revision发布失败只影响该 source current pointer并保留其 source LKG；单个 subject fact构建失败只隔离该 subject/cache entry，不修改 frozen source revision。

## 9. Snapshot、revision、freshness 与 LKG

### 9.1 必须分开的 revisions

| Revision/digest | 覆盖内容 | 目的 |
|---|---|---|
| `persistedPayloadSha256` | 实际持久化的 sanitized source payload bytes | 审计并重放脱敏后的 source parser输入 |
| `networkPayloadSha256`（optional） | 未持久化 network response bytes的 digest | 关联抓取身份；不声称原始 bytes可回放 |
| `rawSourceSnapshotRevision` | source scope + record set + raw payload refs | Provider model-list/models.dev/rules 的 source snapshot身份 |
| `adapterRevision` | mapping schema/code/spec | 同 raw 在新 ontology 下可重新 normalize |
| `coverageManifestRevision` | source surface可观察 paths、absence/null/completeness和operation mapping | 冻结 missing/unsupported与字段映射语义 |
| `providerAuthorityRegistryRevision` | authority/execution/native/models.dev显式 bindings | 冻结 exact join语义 |
| `canonicalSourceRevision` | source kind/scope + raw snapshot + adapter/coverage/authority revisions + optional predecessor/LKG source revision；不含 subject claims | 冻结 source universe且不受查询/materialization顺序影响 |
| `subjectFactPayloadDigest` | 一个 exact subject的 current observations、effective claims、claim identity/priority/derivation与LKG disposition；不含 wall-clock timestamp | 判断该 source revision下该 subject facts是否变化 |
| `canonicalSubjectFactRevision` | canonical source revision + exact subject + subject fact payload digest | 精确冻结 Goal 3可消费的单来源 subject facts |
| `capabilityRevision` | Goal 3 的 final resolved facts/provenance/config | 本 Goal 不生成 |

Provider raw model-list revision、canonical source revision、subject fact revision与最终 capability revision彼此分开。这样既避免“列表顺序/无关 descriptive field变化”被误认为 capability value变化，也允许 adapter upgrade在 persisted sanitized payload不变时产生新 source revision。Rules首次查询一个新 model ID只新增可缓存的 subject fact ref，不改变 frozen Rule source revision。`sanitizerRevision`属于 raw payload ref/provenance；sanitizer改变且影响持久化 payload时必须产生新的 raw source revision。

### 9.2 Freshness

Freshness metadata包括 `fetchedAt`, `lastSucceededAt`, `lastAttemptedAt`, `staleReason`，但 timestamp 不进入 semantic payload digest。是否因 stale降低信任或影响 winner属于 Goal 3/Source Policy，Adapter 不决定。

### 9.3 LKG 行为

```text
network/refresh failure
  → 不发布空 source revision
  → 保留当前 canonical source revision LKG

response envelope / provider / source schema identity整体不可信
  → reject entire source-revision candidate
  → 保留当前 source revision LKG

单条 model record identity invalid
  → 只隔离该 record并写入 SourceRecordIndex.invalidRecordRefs
  → 其余 records继续构建；不得整份退回 LKG

单字段 invalid
  → 其他新 valid/missing outcomes可发布
  → same-subject invalid path可保留上一 source revision的 valid assertion，标记 disposition=lkg_retained_after_invalid

字段明确 missing
  → 不沿用旧 assertion
  → 本次 source outcome为 missing
```

只在 invalid 时字段级保留 LKG，而不是把 source 明确删除/不再声明的字段永久粘住。单个 record的 native identity无法合法解析时，隔离边界就是该 record；只有 response envelope、provider identity或source schema整体无法可信解析时才拒绝整个 refresh。Enumerable source发布时消费者只看到完整旧版或完整新版 source revision/index；query-bound subject cache失败不回滚已经冻结且可信的 Rule source revision。

### 9.4 Source scope、cache key 与独立刷新

`CanonicalModelSubjectV1`不加入 credential，但 credential-scoped Provider Native snapshot的选择/cache key必须包含：

```text
sourceKind
+ providerAuthorityId
+ providerNativeSurfaceId
+ endpointProfileId
+ credentialScopeId
+ credentialRevision
+ provider-specific catalog category（若有）
```

该稳定 tuple的 digest形成 `sourceScopeId`。不同 credential或endpoint不能共享 current source pointer/LKG；credential轮换也不能静默复用旧 snapshot。models.dev和Rules使用各自显式 source scope，不伪造 credential维度。三类 source的 refresh cadence、manual refresh与staleness配置相互独立且可由用户配置；它们只影响 source selection/freshness，不进入 base subject identity。

### 9.5 Raw reference pinning 与 retention

Raw payload不永久全量保留，但以下引用仍存活时不得 GC：

- 每个 source的 current canonical source revision及其已发布/materialized subject fact refs/index；
- current source revision通过 `previousLkgSourceRevision`引用、且仍可能用于query-bound同 subject回算的 predecessor source revisions；
- 任何 field-level effective LKG assertion；
- 当前 resolved provenance/cache仍引用的 source claims；
- 尚在 retention期内的已发送 command/runtime snapshot/prepared request所冻结的 provenance。

引用方删除或达到自身 retention终点后解除 pin；无 current/LKG/resolved/runtime引用的旧 raw payload才可按 retention policy回收。GC必须按 immutable raw ref/digest做可追踪的引用检查，不能只按抓取时间删除。这样既避免 provenance悬空，也不建立永久 capability history/archive。

## 10. Capability Rules 后续迁移方案

本节是 Goal 3/后续迁移清单，不在 Goal 2B 实施。

### 10.1 可直接保留的 source metadata

- built-in/user owner provenance；
- pack/rule identity、version、revision、digest；
- provider + endpoint scope；
- exact/constrained regex selector；
- current rule priority 与 enabled；
- evidence source ref/kind/note、identity evidence、URL、verified timestamp。

当前 pack没有 priority。若后续 Rules contract需要 pack priority，迁移必须在新 Rule snapshot中显式增加该字段，并为现有 pack写入有 revision的 neutral value；Canonical Adapter不得把 absent pack priority静默默认。`RuleClaimContextV1` 保留 pack/rule/effective priority，是未来 source output要求，不宣称当前 Goal 2A数据库已经拥有全部字段。

### 10.2 路径与类型迁移

| Current Rule | Future canonical fact | 处理 |
|---|---|---|
| OpenAI/Gemini/DeepSeek `reasoning.mode` | `reasoning.support` 和必要时 `reasoning.toggle.support` | 删除 `disabled/enabled` intent domain；只保留明确事实 |
| Anthropic `reasoning.mode` | `reasoning.support` + `reasoning.modes.nativeValues` | 根据 source evidence拆分 enabled/adaptive；不保留 UI mode enum |
| OpenAI/Gemini/DeepSeek `reasoning.effort` | `reasoning.effort.nativeValues` | enum 改为 complete native string set |
| Anthropic `reasoning.effort` | `generation.effort.nativeValues` | 语义重命名，避免与 reasoning depth混淆 |
| field `defaultValue` | explicit `*.providerDefault` assertion | 只有 evidence明确是 provider/model default才迁移；不得成为 UI/send fallback |
| `image.mode=[generate]` | `image.generation.support=supported` | operation intent值改成 support fact |
| `image.aspectRatio` | `image.generation.aspectRatios` | string enum解析为 typed ratio set，complete |
| `image.resolution` | `image.generation.resolutionPresets.nativeValues` | provider labels保留；default拆独立 path |
| `web.mode/web.types` | `search.web.support`, `search.image.support` | 删除 disabled/provider_search product/API mode |

### 10.3 应从 Model Facts Rules schema移出的内容

- `requires_confirmation`：Execution Policy；
- generic cross-field `constraints`：通常是 API Contract/operation legality；若未来有真正模型结构事实，应设计 typed structured fact，而不是复用 request constraint；
- UI visibility/product default；
- compatibility alias/value mapping；
- wire target path/provider extension；
- availability/lifecycle assertion。

### 10.4 Rules 当前缺少但 ontology支持的字段

不要求为每个模型补齐；仅在有证据时新增：

- context/input/output limits；
- input/output modalities、attachments；
- tools calling、structured output、temperature control；
- reasoning budget/control kinds；
- source-neutral operation support，以及 provider-specific citations/code execution/context management。

Rules仍应保持 sparse；silent documentation不生成 unsupported。

### 10.5 Rules source output迁移

现有 winner-oriented `projectCapabilityRulesV2()` 不可作为三来源 Adapter输出。未来 Rules Adapter从 active pack/rule rows生成 per-rule claims，保留 selector specificity、owner、pack/rule identity、priority和全部 evidence；Goal 3才执行 exact-over-regex、priority和conflict语义。旧 projection可在消费者全部迁移后删除，不能作为 fallback并行保留。

## 11. 与 Goal 3 的接口

Goal 3 输入：

```ts
type ResolveModelFactsInputV1 = {
  subject: CanonicalModelSubjectV1
  sources: {
    providerNative?: CanonicalSubjectFactRefV1
    modelsDev?: CanonicalSubjectFactRefV1
    capabilityRules?: CanonicalSubjectFactRefV1
  }
  sourcePriorityConfigRevision: string
}
```

Goal 2B 保证每个输入 ref都绑定：一个 frozen canonical source revision + 同一个 exact subject + typed values/completeness/missing/invalid/raw provenance + 独立 subject fact revision。Goal 3不得只拿全局 Rule source revision代替 exact-subject facts，也不得因 lazy materialization改变 source revision。

Goal 3 才负责：

- field/subfield merge；
- configurable `Provider Native > models.dev > Capability Rules`；
- rule/pack priority；
- explicit/derived precedence；
- complete/partial-aware resolution；
- deterministic conflict；
- supporting/opposing/overridden provenance；
- final `capabilityRevision`。

Goal 3 不应重新解析 source-native raw fields；否则 Adapter 与 Resolver 会形成两套 mapping authority。

Resolved Model Facts 之后，Generation Authorization 才加入 API Contract、current Operation、Encoding Coverage、Runtime Hard Constraints、Execution Policy。后五者只能拒绝/约束一次尝试，不能回写或扩大 base facts。

## 12. Catalog、Preflight、Runtime、Compiler 与 file compatibility 的后续消费边界

本 Goal 不接线，但冻结接口方向：

- Catalog capability booleans只能是 `Resolved Model Facts @ capabilityRevision` 的派生 cache；不得继续把 observation missing投影为 false authority。
- Model Picker、Composer、file compatibility都通过同一 projection读取 limits/modalities/attachments等事实。
- Preflight在 frozen `capabilityRevision` 上叠加 API Contract/operation/encoding/runtime/policy做 authorization。
- Runtime Snapshot持久化该 frozen revision和必要 resolved facts/provenance，不重新解释 raw。
- Compiler只验证 intent没有超出 frozen authorization并执行机械 wire encoding；不能从 provider model name、supported parameters或 legacy catalog booleans自行扩大能力。
- file compatibility必须由 `modalities.input`, `input.attachments.support`, API attachment contract和 encoder coverage共同决定；不得再由 renderer/provider helper维护独立 allowlist。

## 13. 被否决的设计方案

### 13.1 直接扩充当前 `ModelCapabilitySchemaV2`

否决原因：当前路径集合由 command intent keys生成，混有 `attachments[].assetId`、`tools.sideEffectConfirmation`、`providerExtension.*` 等非模型事实。继续扩充会让事实 ontology永久依赖 UI/request shape。

### 13.2 一张宽表，每个模型一行、所有字段 nullable

否决原因：无法表达 per-field provenance、complete/partial list、单边 range、invalid/LKG；新增 provider-specific能力会持续扩列，且 null语义不清。

### 13.3 Canonical facts 内嵌 raw JSON

否决原因：复制 source schema会制造第二个 raw authority和巨大的 revision churn。content-addressed raw pointer已足够审计。

### 13.4 Adapter 内做三来源 union/precedence

否决原因：同一来源 mapping会依赖其他来源和刷新顺序，无法单独测试，也提前侵入 Goal 3。

### 13.5 用 complete list自动生成大量 unsupported rows

否决原因：数据膨胀、稀疏性丢失，并把 source collection semantics变成机械模板。保留 complete set本身即可由 Resolver理解。

### 13.6 同名即合并、数值相等即合并

否决原因：Google numeric `temperature` 与 models.dev boolean `temperature`、Google input limit与 models.dev context limit都是现实反例。

### 13.7 把 OpenRouter normalized efforts当 underlying native values

否决原因：OpenRouter官方明确会 nearest-level mapping。这样会把 compatibility alias包装成模型原生档位，重现此前 DeepSeek alias问题。

### 13.8 把 current top-provider/loaded-instance limits写入 base facts

否决原因：这些值随路由/加载状态变化，是执行 hard constraint；混入 model facts会让同一模型事实随一次运行配置漂移。

### 13.9 为了迁移方便保留 generic `defaultValue/constraints/requires_confirmation`

否决原因：三者分别可能是 provider factual default、API legality与 execution policy，通用字段掩盖语义边界。应拆成明确路径或移出 facts。

## 14. 关键决策与理由

1. **Fact payload与subject分离。** 模型 ID用于精确绑定，不是可被来源覆盖的事实字段；避免 alias/router行为改写 identity。
2. **Support assertions与ingestion outcomes分离。** 让 `unsupported`只能来自明确证据，避免 DeepSeek这类 sparse model list被错误封禁。
3. **Set/range携带 completeness。** 防止短列表被猜成 partial，也防止 partial positive capability list被当成 exhaustive。
4. **Provider default使用独立 semantic path。** 保留真实 default但阻止 UI/Compiler把它当隐式发送值。
5. **OpenRouter gateway controls归 Contract。** 保护 native values边界，避免 provider alias mapping污染模型事实。
6. **Anthropic overall effort单独建模。** 尊重官方字段原意，避免同名 `effort`被错误统一。
7. **Raw pointer而非 raw copy。** 保证审计、重归一化和低存储/低 revision噪声同时成立。
8. **Adapter接受 exact subject query。** 三个来源可独立输出同型 facts；Rules regex不需要读取其他来源的模型列表，也不会创建 availability。
9. **Protocol/operation/encoder revision不进入 base fact revision。** 它们可以改变 authorization但不能重定义模型事实。
10. **当前 Rules迁移跟随 ontology。** 避免因为已有 90 条规则的形状方便，而把 generation intent schema冻结成事实 ontology。
11. **Rule priority按 claim保存，不在 Adapter决胜。** 让 Goal 3同时拿到所有 matched Rules及 pack/rule identity、priority和evidence，避免 winner projection提前抹掉 conflict输入。
12. **Coverage manifest区分 no coverage与missing。** OpenAI/DeepSeek sparse model list不会制造全路径 missing；Google optional observable fields仍能准确记录 missing或字段特有的 unsupported。
13. **Current observation与effective assertion双层。** 单字段 invalid时既不丢本轮失败证据，也不把上一 LKG伪装成本轮事实。
14. **逐模型 operation support进入 facts，wire method留在 Contract。** 修正 Google `supportedGenerationMethods`误分类，同时避免 API method字符串成为 ontology。
15. **Provider Authority Registry在设计阶段冻结。** 防止 execution provider key、models.dev key和 compatible endpoint通过名称相似发生错误 exact join。
16. **Raw authority定义为 sanitized persisted payload并采用引用 pinning。** 既不落盘 secrets，也不声称脱敏内容是 network exact bytes；同时避免仍被 current/LKG/runtime引用的 provenance悬空。
17. **SourceRevision/SubjectFact Builder只做单来源发布。** Enumerable source可原子发布完整 subject index；query-bound Rules只冻结 source revision并lazy构建 exact-subject refs，两者都不提前侵入 Goal 3跨来源 Resolver。
18. **Integer domain与collection degradation封闭建模。** 能表达有限 sentinel/exclusion且在未知 complete-list member时降级 partial，避免用 generic constraints或静默截断扭曲 source semantics。
19. **Source revision与subject fact revision分离。** 防止 Rules的潜在 subject空间、首次查询顺序或cache materialization改变 source identity，同时让Goal 3拿到完整的exact-subject claims digest。

## 15. 风险、待核验与实施前阻断项

### 15.1 Raw evidence gaps

- LM Studio 2026-08-26 保存 snapshot 的 raw payload 为 null；历史底稿中的 14-model字段和 reasoning options无法逐记录回放。实现 LM native adapter前必须重新保存脱敏 raw payload，或只实现官方当前 schema已经明确的字段。
- OpenRouter credential-scoped `/models/user` 只保存了脱敏字段 union/集合摘要，没有 raw payload；不得用 public payload替它补字段。
- Generic Local没有统一 endpoint sample；Adapter只能按识别到的 concrete source schema工作。
- Ollama `details.context_length` 的 exact source semantics、`/api/tags` capability completeness仍需版本化核验；当前只允许 positive partial evidence。
- 当前 raw package 的派生 comparison statistics与同文件 raw payload不是同一时点，未来打包工具应给每个 derived report附输入 snapshot revisions。

### 15.2 Ontology candidates intentionally left out

以下是 `intentionally_unmodeled/unmapped` candidates，不是 canonical `missing/unknown`：它们尚无 canonical path，只有 raw/unmapped diagnostics；不得在 Goal 2B凭想象补 schema。

- reasoning/thought summary support；
- exact image dimensions 与 resolution-label换算；
- voice domains；
- provider-specific structured-output子类型；
- parallel tool calling；
- generic local reasoning controls；
- OpenRouter underlying-native effort values。

### 15.3 Next-Goal implementation risks

- 当前 `CanonicalModelFactsV2.identity.providerId`直接来自 execution binding key；实施 Goal必须按 4.1 已冻结的 Provider Authority Registry contract填充显式 entries，不能继续直连或用字符串猜测。
- 当前 `capabilityRevision`覆盖现有 evidence/fields；新的 canonical source revision、canonical subject fact revision和最终 resolved provenance如何进入 revision必须在 Goal 3按 Owner已冻结行为落实。
- 当前 Catalog coarse booleans已把 missing投影成 false；迁移期不能保留它作为发送 fallback。
- Capability Rules schema中的 `requires_confirmation/defaultValue/constraints`不能为兼容旧数据而双轨保留；后续按 closed-schema replacement原子迁移。

## 16. Goal 2B 停止点与后续授权

以下列表记录 Goal 2B 冻结时的停止点，不是当前 checkout 的实施状态。Goal 2C 后续已获单独授权实施前三项及 Rules source迁移，但仍不得开始 Resolver、priority/conflict或 Goal 3：

- Provider Native/models.dev/Rules adapters；
- source snapshot数据库；
- schema migration；
- Capability Rules正式迁移；
- Resolver/priority/conflict；
- runtime/UI/compiler接线；
- Goal 3。

Goal 2C必须只实现有 preserved evidence支持的字段；raw evidence仍不足的字段保持unmapped。本文档的冻结不授权在同一实施中顺手开始 Goal 3。
