# Starverse 模型原始事实源调查最终评估报告

- **Lifecycle Status**: reference
- **Document Role**: evidence-report
- **Last updated**: 2026-08-26

> **Snapshot identity correction（2026-08-31）**：正文中的 DeepSeek models.dev `4` 条以及 OpenRouter `422/360` 计数来自较早的 comparison snapshot，不是同包 `raw-model-fields.json` 内最终保存 payload的计数。后者实际为 DeepSeek models.dev `3` 条、OpenRouter public API `417` 条、models.dev `355` 条。正文保留为历史调查报告；引用数量时必须同时引用对应 snapshot/revision，不得混用。

生成日期：2026-08-26  
专题：`models-dev-capability-resolution`  
范围：DeepSeek、OpenAI、Google AI Studio、OpenRouter、LM Studio、Ollama，以及 Generic Local OpenAI Chat 的模型发现边界。

## 结论摘要

本轮调查支持以下判断：API 返回和 models.dev 不应先被压缩成一张“Starverse 最终能力表”，而应先合成为一张完整的、可追溯的“原始模型及能力字段事实表”。这张表保存模型身份、来源成员关系、原始字段、字段类型和值、缺失状态、抓取时间、来源 revision 和 provenance；后续 Starverse 再把它翻译为目录展示、UI 控件、请求构建和发送前校验所需的 Starverse 语义。

对同一 provider scope，模型身份应取来源并集。一个来源没有出现的模型不能因为另一个来源出现就被丢掉，也不能仅凭 models.dev 出现就创建当前 credential/endpoint 的可用性。能力字段同样先保留来源事实，不在原始层把缺失写成不支持，也不把同名但语义不同的字段强行合并。

本轮已经观察到大量“字段缺失”“字段形状不同”“同名字段语义不同”，但没有在 OpenRouter 的 360 个精确交集模型中发现 reasoning effort 的相反取值，也没有发现可以确认的同语义、相反能力值冲突。最明确的真实差异是：OpenRouter API 的 `reasoning` 是对象或缺失，而 models.dev 的 `reasoning` 是布尔值；Google API 的 `temperature` 是数值，而 models.dev 的 `temperature` 是布尔值；这类差异不能直接视为支持/不支持冲突。

因此，当前不建议把 models.dev 直接接入 Starverse 的最终 capability authority。建议先落地原始 evidence store / raw model facts，再设计独立的 Starverse semantic translation。当前没有添加规则，也没有修改生产能力解析代码。

本报告是 evidence bundle 的最终整理，不是 Owner 已批准的架构冻结，也不代表 models.dev 已经接入生产代码或 Generation V2 已经完成。文中的“建议冻结”是供后续 Owner 评审的候选决策；“已完成”仅指本轮调查和证据整理。

## 一、调查范围与证据状态

| Provider / 来源 | 本轮状态 | 关键证据 |
|---|---|---|
| DeepSeek | 已完成初步 API 与 models.dev 对照 | API `/models` 的已保存原始快照；models.dev `deepseek` 记录 |
| OpenAI | 已完成初步 API 与 models.dev 对照 | API `/v1/models` 的已保存原始快照；models.dev `openai` 记录 |
| Google AI Studio | 已完成初步 API 与 models.dev 对照 | Gemini `/v1beta/models` 的已保存原始快照；models.dev `google` 记录 |
| OpenRouter | 已完成公共 API 与 models.dev 逐模型比较；完成 `/models/user` 集合/结构观察 | 当前公共 `/api/v1/models` 原始响应；models.dev `openrouter` 记录；credential-scoped endpoint 仅保留脱敏摘要 |
| LM Studio | 先前测试成功，本次打包时本机端口不可达 | 专题文档保存了 14 个模型和字段结论；本次 JSON 记录当前不可达 |
| Ollama | 本次打包时 `/api/tags` 与 `/v1/models` 均返回 200 | 当前原始响应已写入 JSON |
| Generic Local OpenAI Chat | 无统一固定 provider；发现路径已确认 | `/v1/models`，失败后 `/api/tags` 的应用契约 |
| Anthropic 原生 | 移出本轮调查范围 | README 中的原生支持冻结/逐步移除声明；不代表代码中所有历史入口已经删除 |

已保存的 DeepSeek、OpenAI、Google API 快照来自 2026-08-04；OpenRouter、models.dev 和本地 endpoint 的当前采集时间写入 `raw-model-fields.json` 的 `generatedAt` 与各 source observation。时间不同的快照不得被当作同一时刻的 provider state。

## 二、逐 provider 事实结果

### 2.1 DeepSeek

已保存 API：`GET https://api.deepseek.com/models`，HTTP 200。API 返回两个模型：

- `deepseek-v4-flash`
- `deepseek-v4-pro`

观察到的 API 模型对象字段为 `id`、`object`、`owned_by`。API 没有报告 reasoning、reasoning options、tool calling、structured output、modalities 或 token limits 等能力字段。这个结论只能写成“该 API response 中没有这些字段”，不能写成“DeepSeek 不支持这些能力”。

models.dev 的 `deepseek` 记录有四个模型：

- `deepseek-v4-flash`
- `deepseek-v4-pro`
- `deepseek-chat`
- `deepseek-reasoner`

models.dev 还提供 `reasoning`、`reasoning_options`、`tool_call`、`structured_output`、`modalities`、`limit`、`cost`、`family`、`release_date`、`last_updated` 等字段。当前测试样本没有发现 API 与 models.dev 对同一字段给出相反值；主要事实是 API 能力字段缺失，而 models.dev 有补充记录。

因此 DeepSeek 模型身份应为四个 ID 的并集；前两个模型带有两个来源标记，后两个模型仅带有 models.dev 来源标记。后续 availability 仍必须由 DeepSeek 当前 endpoint/credential 的 API catalog 决定，models.dev 不能单独使 `deepseek-chat` 或 `deepseek-reasoner` 变成当前可发送模型。

DeepSeek reasoning effort 的具体官方域和 `reasoning_options` schema 在专题历史材料中存在口径差异：不同快照/文档曾出现 `{high,max}`、`{low,high,max}` 以及 schema 是否包含 `reasoning_options` 的不同记录。本轮没有用这些互相不一致的历史口径冻结最终 Starverse domain；它们应继续作为带时间和 provenance 的原始证据，待重新绑定官方文档版本、models.dev revision 和 provider response 后再作语义决策。

### 2.2 OpenAI

已保存 API 快照为 `GET https://api.openai.com/v1/models`，捕获于 2026-08-04，经代理访问，包含 124 个模型。该快照中观察到的基础字段包括 `id`、`object`、`created`、`owned_by`，并包含该次 response 中出现的生命周期字段 `deprecation_date`。字段是否出现必须以具体 response 为准，不能把不同时间 response 中的 `shutdown_date`、`deprecation_date` 等字段合并成一个未经证实的统一字段。

models.dev `openai` 有 47 个模型。此前比较结果为：精确交集 44 个，API-only 80 个，models.dev-only 3 个，精确并集 127 个。models.dev-only 的典型 ID 为：

- `gpt-5.3-codex-spark`
- `gpt-5.6`
- `o3-pro`

随后对 API 列表做了模糊查询：API 中出现了 `gpt-5.6-sol`、`gpt-5.6-terra`、`gpt-5.6-luna` 等相近 ID，但没有精确的 `gpt-5.6`；也没有精确的 `o3-pro` 或 `gpt-5.3-codex-spark`。因此近似名称不能改变 exact model ID 集合。

针对三个名称做过的 Responses 请求属于供应商行为烟测，不属于模型目录事实：

- `o3-pro` 返回组织验证错误；这不是“模型不存在”或“能力不支持”的证明；
- `gpt-5.6` 请求返回 200，响应模型为 `gpt-5.6-sol`，默认 reasoning 为 medium；这只能记录为请求模型和供应商响应模型的两条诊断事实，不能覆盖模型身份；
- `gpt-5.3-codex-spark` 返回 `model_not_found`；这仍是一次请求结果，不应反向改写 models.dev 的模型记录。

模型表必须分别保留 `requestedModelId` 与 `providerResponseModelId`，不得静默把二者覆盖成一个字段。

### 2.3 Google AI Studio / Gemini

已保存 API 快照为 `GET https://generativelanguage.googleapis.com/v1beta/models?pageSize=100`，捕获于 2026-08-04，经代理访问，保存的快照包含 58 条记录（此前手工归一化比较使用过 50 条样本，因此比较计数必须带上快照版本）。观察到的 API 字段包括：

`description`、`displayName`、`inputTokenLimit`、`maxTemperature`、`name`、`outputTokenLimit`、`supportedGenerationMethods`、`temperature`、`thinking`、`topK`、`topP`、`version`。

文档中提到的 `baseModelId` 在观察到的记录中没有出现，应该标记为缺失，而不是填充推断值。

此前比较观察到：API 的 `thinking` 与 models.dev 的 `reasoning` 在 27 个样本上相等；API 的输入/输出 token limit 与 models.dev 的 context/output limit 在 39 个样本上相等；但 API `temperature` 是数值，models.dev `temperature` 是布尔值。最后一项是同名不同语义，不能合并为一个布尔或数值字段。

### 2.4 OpenRouter

当前公共接口 `GET https://openrouter.ai/api/v1/models` 无 API Key 返回 200，共 422 个模型。models.dev `openrouter` 有 360 个模型；精确交集 360，API-only 62，models.dev-only 0，模型并集 422。

公共 API 模型对象的字段并集为：

`alias_target`、`architecture`、`benchmarks`、`canonical_slug`、`context_length`、`created`、`default_parameters`、`description`、`expiration_date`、`hugging_face_id`、`id`、`knowledge_cutoff`、`links`、`name`、`per_request_limits`、`pricing`、`reasoning`、`supported_parameters`、`supported_voices`、`top_provider`。

重要嵌套字段包括：

- `architecture.input_modalities`、`architecture.output_modalities`、`architecture.modality`、`architecture.instruct_type`、`architecture.tokenizer`；
- `pricing.prompt`、`completion`、`web_search`、`image`、`audio`、`audio_output`、`image_output`、`cache` 等；
- `top_provider.context_length`、`top_provider.max_completion_tokens`、`top_provider.is_moderated`；
- `reasoning.effort`、`reasoning.max_tokens` 等 provider-specific 结构；
- `supported_parameters` 中的 `tools`、`structured_outputs`、`response_format` 等参数名。

对 360 个精确交集模型的字段比较结果：

| 比较项 | 结果 |
|---|---:|
| API `context_length` 与 models.dev `limit.context` 相等 | 360 |
| API `top_provider.context_length` 与 `limit.context` 相等 | 315 |
| 上述 top-provider context 不同 | 40 |
| API 缺少上述 top-provider context | 5 |
| API `top_provider.max_completion_tokens` 与 models.dev `limit.output` 相等 | 314 |
| API 缺少 output 对应值 | 46 |
| API reasoning effort 与 models.dev reasoning options 相等 | 103 |
| reasoning effort 不同 | 0 |
| API 缺少 reasoning effort | 130 |
| 双方都缺少 reasoning effort | 127 |
| API `supported_parameters` 的 tools 与 models.dev `tool_call` 同为 true | 291 |
| 两者同为 false | 69 |
| API structured output 与 models.dev structured output 同为 true | 275 |
| API-only structured output | 36 |
| 双方同为 false | 49 |

其他真实差异：

- API `reasoning` 与 models.dev `reasoning` 的类型/表示不同：235 个为不同结构，125 个 API 缺失；这不是 235 个反向冲突；
- API 名称与 models.dev 名称仅 26 个完全相同，334 个不同；描述 360 个均不同；名称和描述不能作为能力冲突判据；
- API `architecture` 模态结构与 models.dev `modalities` 结构不同；应保留两套原始字段；
- API pricing 换算后与 models.dev cost 有 355 个相等、4 个不完整、1 个不同；差异模型为 `deepseek/deepseek-v4-pro`，API 归一化 input/output 为 `.396894/.793788`，models.dev 为 `.413772/.827544`。这是定价事实差异，不是模型能力冲突。

`/api/v1/models/user` 在本次可见终端测试中返回 200、422 个模型，模型 ID 集合与公共 `/models` 精确一致；但其模型字段缺少公共 response 中的 `alias_target`、`benchmarks`。原始 credential-scoped payload 没有写入项目，JSON 中只保存脱敏摘要和 `rawPayloadRetained: false`。因此不能把 credential endpoint 的字段缺失补写为公共 endpoint 已证明的字段，也不能把本次集合一致性升级为永久保证。

本次没有完成 `/models/user` 与公共 `/models` 的共同字段逐模型值比较；“集合一致、字段覆盖不同”是已确认事实，“字段值也完全一致”不是本次结论。

### 2.5 LM Studio

此前在本机 `http://127.0.0.1:1234` 成功测试到 14 个模型：

- `/api/v1/models`：200，字段包括 `type`、`publisher`、`key`、`display_name`、`architecture`、`quantization`、`size_bytes`、`loaded_instances`、`max_context_length`、`capabilities`、`variants`；其中观察到 `capabilities.vision`、`trained_for_tool_use`、`reasoning.allowed_options`、`reasoning.default`；
- `/api/v0/models`：200，字段包括 OpenAI-like `id/object`、`type`、`publisher`、`arch`、`compatibility_type`、`quantization`、`state`、`max_context_length`、`capabilities`；
- `/v1/models`：200，字段主要为 `id`、`object`、`owned_by`。

models.dev `lmstudio` 有 3 个模型：`openai/gpt-oss-20b`、`qwen/qwen3-30b-a3b-2507`、`qwen/qwen3-coder-30b`。此前本机 14 个模型与这 3 个 models.dev ID 没有精确交集，模型并集为 17。打包当天 LM Studio 端口不可达，`raw-model-fields.json` 记录了三个请求的不可达状态，不把此前文档中的 14 个模型描述伪装成当天 live payload。

### 2.6 Ollama

打包当天 Ollama `http://127.0.0.1:11434` 可达：

- `/api/tags`：HTTP 200，2 个模型；字段包括 `name`、`model`、`modified_at`、`size`、`digest`、`details`、`capabilities`；
- `/v1/models`：HTTP 200，2 个模型；字段包括 `id`、`object`、`created`、`owned_by`。

当前 models.dev 没有 `ollama` provider key。该缺失只能表示 models.dev 当前没有对应 provider 记录，不能推导 Ollama 模型不支持某能力。

### 2.7 Generic Local OpenAI Chat

Generic Local 不是一个固定供应商，模型集合由用户配置的 endpoint 决定。Starverse 当前发现契约是先探测 OpenAI-compatible `GET /v1/models`，失败时再尝试 `GET /api/tags`。由于没有统一 endpoint，不能把某个本机实例的返回写成 Generic Local 全局事实；也没有对应的统一 models.dev provider 记录。

## 三、字段合并应如何处理

### 3.1 原始层：取模型身份并集，保留来源 membership

原始模型记录的主键应至少包含 provider scope 与精确 model ID。每个来源单独记录：

```text
providerScope
modelId
sourceId
sourceRevision
observedAt
presence: present | absent | unreachable | not_applicable
rawModelObject
rawFieldIndex
provenance
```

同一 provider 下，API 和 models.dev 的 model ID 取并集。模型在某一来源出现、另一来源没有出现时，不删除、不覆盖；模型记录保留 `sourceMembership = [api]`、`[models.dev]` 或 `[api, models.dev]`。不同 provider 下即使底层名字相同，也不能自动合并。

### 3.2 原始字段：同名字段也要保留 source-specific 版本

原始字段建议按来源命名空间保存，例如：

```text
providerApi.context_length
providerApi.reasoning
modelsDev.limit.context
modelsDev.reasoning
```

同时建立一个“比较结果”而非“裁决结果”：

```text
comparison: equal | different_shape | different_value | missing_on_source | not_comparable
semanticConfidence: confirmed | probable | unknown
```

只有已经确认同语义、同单位、同取值域的字段，才允许产生一个比较值；比较值不应删除两个 raw value。比如 OpenRouter `context_length` 与 models.dev `limit.context` 可以在当前样本中标记数值相等；Google API `temperature` 与 models.dev `temperature` 则应标记 `different_shape`，不能产生统一 `temperature`。

### 3.3 缺失、未知和不支持

- `missing`：该来源的 response 没有字段；例如 DeepSeek `/models` 没有 reasoning 字段；
- `unknown`：无法从当前 response 判断，或来源不可达/版本无法确认；例如本次打包时 LM Studio 端口不可达；
- `unsupported`：来源明确报告不支持，或有明确的反向值；本轮没有把“字段缺失”升级为此状态。

这三个状态必须在原始事实层和后续 Starverse 翻译层都保持区分。

### 3.4 API-only / models.dev-only 不等于能力结论

API-only 模型表示 provider 当前该来源返回了它；models.dev-only 模型表示第三方元数据记录了它。前者不能自动证明当前 credential 的所有 operation 都可用，后者不能创建当前 endpoint 的 availability。二者都应进入事实表，后续由 availability 层结合 credential、endpoint、active catalog 决定是否可选。

## 四、对 Starverse 后续架构的建议

### 4.1 建议的两层结构

第一层是本轮应先固定的 Raw Model Facts：

- 保存 provider API 与 models.dev 的原始 payload/字段；
- 保存来源、revision、抓取时间、HTTP 状态、endpoint scope、缺失和不可达状态；
- 保存模型 ID 并集及每个来源 membership；
- 保存字段级比较结果，但不把比较结果直接当作 Starverse capability。

第二层是后续的 Starverse Semantic Translation：

- 将明确确认的 raw facts 翻译为 Starverse UI 控件；
- 形成请求 intent、目录摘要、preflight、runtime snapshot 所需的 Starverse 字段；
- 明确哪些能力是 `supported`、`unsupported`、`unknown` 或 `not exposed`；
- 处理 provider protocol 的 wire semantics，但不把 alias、自动转换和模型身份混入原始事实；
- 保留回指的 source evidence IDs，使用户可以追溯 Starverse 结论由哪些原始事实产生。

这里的“单一事实源”不应理解为把两家来源压成一张丢失 provenance 的表，也不应立即等同于最终可执行 capability。更准确的定义是：对每一个 provider/model/operation/revision，Starverse 只能有一个最终 semantic resolution；该 resolution 的输入是一个保留多来源 raw observations 的事实集合。

### 4.2 取并集后的 availability 边界

模型事实并集与 active model availability 必须分开：

```text
raw model facts = provider API ∪ models.dev
active availability = credential/endpoint scope ∩ provider live membership ∩ local binding
Starverse semantic capability = translation(raw facts, provider contract, operation)
```

models.dev 不能单独创建 active model；API-only 也不能自动授予完整 capability。对于本地供应商，明确的 local/manual binding 仍是 availability 证明的一部分。

### 4.3 models.dev 的角色

当前建议把 models.dev 定义为 trusted supplement / evidence source，而不是绝对真相：

- API 有字段时，保留 API 原文；models.dev 同字段也保留并比较；
- API 没字段时，models.dev 可以提供补充证据，但不能把 missing 改成 API-supported；
- 两者同语义且相等时，记录一致性证据，但仍保留两个来源；
- 两者同名不同语义时，禁止合并；
- 真正不同值出现时，先记录 conflict，不在原始层静默选择；
- models.dev 不可用时使用 last-known raw snapshot，并标记 stale/unknown；不能让每次发送依赖外网。

本轮没有看到需要新增规则才能解释的真实 capability 对立值，因此暂不添加规则是正确的；后续 smoke test 也不应自动变成规则，除非 Owner 明确批准其事实含义和作用范围。

## 五、当前局限和未完成项

1. 归档的 DeepSeek/OpenAI/Google API 原始快照是 2026-08-04，不能代表 2026-08-26 的实时目录。
2. LM Studio 在打包时未启动；本地 14 模型及字段结果来自此前成功测试和专题文档，本次 JSON 只保留当前不可达 observation。
3. OpenRouter credential-scoped `/models/user` 的完整 raw payload 未保留；原因是 API Key 通过可见终端输入，随后按安全边界清理。已保留其脱敏结构、422 模型计数、顶层字段、字段并集和与公共列表的精确集合一致性。
4. OpenRouter 公共 API 与 models.dev 的逐模型比较已经完成，但 models.dev 本身也会更新；比较结果必须绑定采集时间和 snapshot revision。
5. Anthropic 原生调查已退出本轮，但这不等于历史代码/catalog 引用已经全部删除；本报告不对其代码清理状态作额外承诺。
6. 本轮没有接入 models.dev 生产代码，没有建立 User/Cloud rules，也没有把烟测结果写入规则。

## 六、交付文件

- `raw-model-fields.json`：本次打包保留的原始字段 bundle。包含已保存 provider API 快照、当前公共 OpenRouter、当前 models.dev 相关 provider records、当前 Ollama、本次 LM Studio 不可达记录、脱敏的 OpenRouter credential-scoped observation，以及比较摘要。
- `package-readme.md`：文件说明、时间范围、秘密处理和完整性边界。
- `source-documents/`：专题已有 README、01–05 文档和源 DOCX 的副本。
- `final-evaluation-report.md`：本报告。

## 建议冻结的架构决策

1. “完整模型能力表”当前阶段定义为 Raw Model Facts，不定义为 Starverse 最终 UI/request capability 表。
2. provider API 与 models.dev 的模型 ID 取并集；每个模型保留 source membership，不丢弃单源模型。
3. 每个来源的原始模型对象和字段原样保存；同名字段若语义、类型、单位或域未确认一致，不合并。
4. `missing`、`unknown`、`unsupported` 必须严格区分；来源缺字段不等于不支持。
5. models.dev 不创建 provider endpoint、credential 或 active catalog availability。
6. requested model ID 与 provider response model ID 是不同诊断事实，不得互相覆盖。
7. 只有后续 semantic translation 才能产生 Starverse 的最终 capability resolution；目录、UI、preflight、runtime 和 compiler 必须消费同一份 resolution。
8. models.dev 是补充证据源，不是绝对权威；冲突先保留并报告，不在 raw layer 静默覆盖。
9. 不因本轮字段比较结果新增 rule；规则应在有明确 owner 决策和可解释作用域后再引入。
10. 所有 raw evidence 必须绑定 source revision、capture time、endpoint/provider scope 和 provenance；更新失败使用 last-known snapshot 并显式标记 stale/unknown。
