# Goal 2A-Fix：证据驱动的 Capability Rule 纠正与匹配审计

- **Lifecycle Status**: implementation closeout; Goal 2B not started and deferred until this closeout is accepted
- **Document Role**: controlling fact-quality and matching inventory for Goal 2A
- **Last updated**: 2026-08-28
- **Authority**: current checkout, preserved Provider Native payloads, linked official provider documentation, and focused tests

## 结论

Goal 2A 的数据库结构继续保留，但最初的 809 条迁移草案不再被视为经过事实审查的 built-in dataset。本次将 built-in rules 收窄到 90 条、60 个精确 provider/endpoint/native-model identity；一条规则可列出多个由同一证据支持的精确 native model ID，不使用 unsupported-by-silence，不保留 derived built-in rule，也不使用 built-in regex。

本文件只记录 Goal 2A-Fix 的阶段性事实纠正，不宣称 Provider Native、models.dev 或用户规则的统一 ingestion 已完成，也不改变既定来源优先级和 availability 边界。

来源优先级未改变：`Provider Native > models.dev > Capability Rules`。本轮只纠正规则事实质量和 selector 边界，尚未实现 Goal 2B 的统一多来源 ingestion。Capability Rules 不创建 availability。

## 数量变化

| Provider / pack | 修正前 rules | 修正前 identities | 修正后 rules | 修正后 identities |
|---|---:|---:|---:|---:|
| Google AI Studio / Gemini GenerateContent | 70 | 14 | 12 | 6 |
| Google AI Studio / Gemini image | 78 | 6 | 18 | 4 |
| Anthropic Messages | 96 | 12 | 18 | 10 |
| OpenAI Responses | 561 | 51 | 38 | 38 |
| DeepSeek stable | 4 | 2 | 4 | 2 |
| **合计** | **809** | **84 unique** | **90** | **60 unique** |

修正共删除 719 个草案 rule row。由于 809 条草案 JSON 在本分支中尚未提交就被原子替换，无法可靠地把每一个被删 row 事后拆成“边界错误”与“证据不足”两个互斥的精确数字；本记录不伪造该分项计数。上表的 provider/pack delta 是可复算的精确计数，以下按 claim 类别记录删除原因。

修正后的 90 条 rule 共含 117 个 exact selector ID 引用：Gemini GenerateContent 12、Gemini image 18、Anthropic 18、OpenAI Responses 65、DeepSeek 4。OpenAI 38 条 rule 中，同一官方 exact-model 页面明确覆盖的 alias/date snapshot ID 共享一条 capability claim；这不会合并模型身份或创建 availability。

## Provider Native 身份审计

用于 built-in identity 的保存证据：

- DeepSeek：2026-08-04 `/models`，2 个 ID。
- OpenAI：2026-08-04 `/v1/models`，124 个 ID。
- Google AI Studio：2026-08-04 `/v1beta/models`，58 个 ID，匹配时只机械移除响应中的 `models/` 资源前缀。
- Anthropic：2026-08-04 `/v1/models?limit=100`，10 个 ID；原始响应保存于 [`evidence/provider-native-anthropic-models-20260804.json`](evidence/provider-native-anthropic-models-20260804.json)，SHA-256 `81795cd1669710d8aae8e1a5d5715c2210f0a5cf74693802ae4aad7f60940596`。

测试会逐条证明标记为 `provider_archive` 的 built-in exact selector 存在于上述归档；少量 `official_exact_model_doc` identity 必须绑定对应 exact 官方模型页。两者都不证明当前 credential/endpoint availability，也不能创建 active-catalog membership；identity evidence 亦不替代 capability claim 的独立证据。

从旧草案删除、且没有出现在保存的 Anthropic Provider Native 列表中的 ID：

- `claude-mythos-5`
- `claude-mythos-preview`
- `claude-opus-4-5`
- `claude-sonnet-4-5`
- `claude-haiku-4-5`

日期化的真实 Provider Native ID（例如 `claude-opus-4-5-20251101`）不会与未日期化名称静默合并。

## 保留的事实

### Gemini

- GenerateContent：只保留官方逐模型 thinking 表明确给出的 `reasoning.mode` 与 effort domain/default。
- Image：只保留官方 image-generation 表或 exact model page 支持的 generation mode、aspect ratio、resolution，以及明确的 reasoning/search facts。
- `inputTokenLimit`、`outputTokenLimit`、temperature/top-p/top-k 和 Provider Native `thinking` 原始字段仍属于动态 Provider Native observation；不复制成大规模 built-in rule 矩阵。

### OpenAI

- 通过 Chrome 逐页核验官方完整模型目录和 exact model pages；保存证据见 [`evidence/openai-gpt5-o-series-model-facts-20260828.json`](evidence/openai-gpt5-o-series-model-facts-20260828.json)。
- 对官方模型页明确列出完整 effort domain 的 GPT-5.x 模型，只为页面列出的、且归档 Provider Native 模型列表中真实出现的 alias/snapshot 建立 exact rules；不采用系列继承。
- 当前明确覆盖 GPT-5、GPT-5 Pro、GPT-5.1、GPT-5.2/5.2 Pro、GPT-5.2/5.3 Codex、GPT-5.4 全系、GPT-5.5/5.5 Pro 与三个 GPT-5.6 原生型号。页面明确给出的默认值也作为事实保存；未声明默认值时保持缺失。
- o-series exact model pages 足以证明 reasoning support，因此只保留 `reasoning.mode`；当前页面没有逐模型枚举 effort domain，故 `reasoning.effort` 保持缺失。`o3-pro` 由官方 exact model page 验证身份，但该规则不创建 active-catalog availability。
- 通用 Responses request 字段、通用 effort enum、图片 request schema、web/tool envelope 不投影成模型事实。

### Anthropic

- 对归档中的 10 个 exact native ID，只记录官方 current-model/series tables 能支持的最小 thinking-support 与 effort-domain 事实。
- `explicit_provider_series` 与逐 exact-model 的 `explicit_provider` 分开保存；identity 仍由 Provider Native archive 单独证明。
- manual/adaptive 是 wire/API control kind，不作为 canonical `reasoning.mode` 的独立模型档位；采样限制、thinking-display default、交叉字段限制也不进入 rules。
- Haiku 4.5 与 Sonnet 4.5 的 effort 不写 `unsupported` rule；该字段保持缺失，等待统一 Provider Native ingestion 使用原始显式 false evidence。

### DeepSeek

- 只保留 V4 Flash/Pro 的 reasoning mode 与原生 effort `low/high/max`。
- `medium`、`xhigh` 等兼容映射值不作为模型原生 capability；映射行为属于供应商服务端兼容语义。

## 删除的边界错误 claim 类别

- 通用 API request 字段存在性被机械复制为每个模型支持。
- `providerExtension.*`、protocol discriminator、wire control kind 和 request mapping。
- tool registry selection、tool choice、side-effect confirmation、attachment identity/proof。
- runtime/operation safety、sampling/tool 交叉限制和 execution authorization。
- UI 产品默认、推荐值或展示 fallback 被当作模型事实。
- provider-wide image/web/reasoning template 被无差别展开到所有已知模型。

Decoder 现在直接禁止全部 `providerExtension.*`、附件身份字段和 tool execution-policy 字段进入 Capability Rules；静态 gate 继续禁止已删除的 TypeScript model-fact authorities 回流。

## 因证据不足删除或保持缺失的事实

- 存在于 Gemini 归档但没有足够 exact capability evidence 的 image preview ID（包括 `gemini-3.1-flash-image-preview` 与 `gemini-3-pro-image-preview`）不保留 rule。
- OpenAI 归档中的 GPT-5 Mini/Nano、早期 Codex、Chat/Search 等模型没有因为“同属 GPT-5”而继承其他模型的 effort domain；o-series 同样没有继承 Responses API 的通用枚举。o-series 未写入 `reasoning.effort` 规则时，该字段保持 `missing/unknown`，不表示 `unsupported`。
- OpenAI `reasoning.mode` built-in facts 只记录官方模型页能够证明的 `enabled`。Starverse 的 `disabled` 表示省略可选 reasoning request object，属于 API contract authorization；它只在最终 OpenAI controls/preflight projection 中与模型事实合并，不写入模型规则。
- Anthropic 未被官方表明确覆盖的更细 domain、默认、display、budget 和 cross-field behavior 保持缺失。
- OpenRouter 的 417 个 public provider-scoped ID、本地 Ollama 的 2 个 ID、LM Studio 未成功发现的模型，以及 generic/openai-compatible manual IDs 都不生成 built-in rules。
- 文档静默不产生 `unsupported`。当前 built-in dataset 的 `unsupported` 数量为 0。

## Derived inference 与 regex

- 当前 retained derived rules：0。
- 当前 built-in regex selectors：0。

Schema/repository 允许未来有证据的严格 regex identity selector，但它必须：provider+endpoint scoped、完整 `^...$` 锚定、有正负例、独立 identity evidence 和 HTTPS provenance。`.*`、`.+`、backreference、lookaround、unbounded/过大 repetition、optional quantifier 和嵌套 repetition 被拒绝。exact rule 在同 semantic path 上覆盖 regex；同 specificity/priority 的不同语义明确 conflict。

Regex 只选择 identity，不产生 capability semantics。当前没有证据证明必须用 regex，因此 built-in pack 保持全 exact。

## 后续真实 API 核验候选

- Gemini image preview/date/version variants 的 exact aspect ratio、resolution、thinking 与 search domains。
- OpenAI GPT-5 Mini/Nano、早期 Codex 与 o-series 的 exact reasoning effort，以及 GPT/o/Codex 的 image/web/tool capability；不得从 API 字段存在性推断。
- Anthropic Haiku/Sonnet 4.5 的 Provider Native 显式 false 字段在统一 ingestion 中如何表示并参与 source priority。
- OpenRouter provider-specific `supported_parameters`/modalities 与 underlying provider native facts 的隔离和冲突语义。
- LM Studio、Ollama、generic compatible/manual binding 的真实 capability evidence；availability 本身不补能力。

这些候选不形成 built-in rule，直到获得相应证据。

## 仍留在生产代码中的相关路径

- 各 provider authority 中的 API contract、wire envelope、attachments、tool/runtime safety tables继续保留；它们不是 model-ID-to-capability lookup。
- DeepSeek `stableCapabilityPolicyV2` 继续承载 protocol/runtime/tool safety，model-specific reasoning domain 已迁出。
- OpenRouter Chat 仍从该 provider 自己的 catalog `supported_parameters` 和 modalities 构造 runtime capability。它不是 hardcoded model table，但仍是 Goal 2B 需要纳入统一 evidence ingestion 的不对称路径。
- local/openai-compatible provider 没有发现生产 model-ID capability allowlist；当前无 built-in rules。
- Compiler 继续只消费 frozen resolved snapshot，并在编码前调用公共 validator；本轮没有发现 compiler 通过 model ID 扩权。

## 验证边界

Goal 2A-Fix 只运行 capability-rule、database schema/installer、capability resolution 和直接受影响 provider authority 的 focused tests，以及相关 static/type/docs checks。不会运行全仓测试，也不会执行真实付费 provider 请求。

当前执行结果：

- Node ABI：`npm run rebuild:node` 通过。
- Unit：4 files / 53 tests 通过。
- Integration：6 files / 65 tests 通过。
- Epoch-2 schema-mismatch backup/recreate：2 files / 11 tests 通过。
- UI：2 files / 3 tests 通过。
- `npx tsc --noEmit --pretty false` 与 `npx vue-tsc --noEmit --pretty false` 通过。
- `gate:generation-v2-capability-rule-authority`：311 个 production files 通过。
- `gate:generation-v2-zero-residual`：11 runners / 20 deleted authorities 通过。
- `gate:docs` 与 `git diff --check` 通过；后者只有工作区既有 LF/CRLF 提示。
- 未执行全仓测试、Electron smoke 或真实付费 provider 请求。

Goal 2B 尚未开始并明确延后。统一 Provider Native/models.dev ingestion、跨来源 priority/conflict/LKG 和 OpenRouter 动态 facts 收敛属于下一 Goal。
