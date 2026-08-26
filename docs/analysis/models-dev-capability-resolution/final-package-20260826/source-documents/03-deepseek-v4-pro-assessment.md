# Starverse 引入 models.dev 作为模型能力补充源：DeepSeek V4 Pro 评估

- Lifecycle Status: historical

- Document Role: implementation-note, candidate-action-list

- Last updated: 2026-08-16

> 从原始汇编文档机械拆分的独立评估报告。内容保留原报告及交叉核对增量，但仍属于时间点证据，不替代当前实现、Owner 决策或官方资料。

Starverse 引入 models.dev 作为模型能力补充源 — 架构评估报告

调查基准：D:\Starverse 当前工作树（2026-08-15），两个只读子代理的代码测绘 + 我对关键路径的定点复核；外部事实截至 2026-08-15（DeepSeek 官方文档镜像抓取日期 2026-08-12；models.dev dev 分支当前内容）。

0. 结论先行（回答 Q1–Q3）

Q1 是否建议接入：有条件建议。 接入价值真实存在（DeepSeek /models 结构上永远给不出 capability，官方文档人工 review 覆盖模型数有限），但必须承认两件事：

你现在遇到的 DeepSeek reasoning bug 与 models.dev 无关——它的根因是 Starverse 内部三套能力事实互不同源（见 §2）。修复路径是完成 TP4 已经冻结设计的 unified capability resolution，models.dev 救不了它，也不是它的前提条件。

models.dev 是社区贡献数据，它必须排在 Starverse reviewed official contract 之下。正确的角色是 trusted supplement / evidence source：为 reviewed rules 提供取材与变更检测，运行时最多只填补 missing，绝不 override provider 已报告的 present 值，绝不创造 model availability。

Q2 最合理角色：capability evidence 的可信补充输入。 具体落到两层：(a) reviewed-rule 编写/复核工作流的离线证据输入（默认路径，零运行时风险）；(b) V2 capability resolver 的可选 evidence 输入（feature-flag，只补 missing，需扩展 provenance 类型）。它永远不是第二张能力表。

Q3 接入层：capability evidence / resolution 层。 绝不动：active catalog 成员资格、wire codec、compiler 合法性判断本身。接入点就是现有的 modelCapabilityResolverV2（粗粒度）与 V2 runtimeCapabilitySnapshotV2 evidence 记录（细粒度）——子代理 A 给出了 10 处需要扩展的具体位置（§7 引其要点）。

1. 当前代码事实：能力决策点盘点（Q4）

1.1 两条并行栈

栈	位置	状态

Legacy generation-params	src/next/generation-params/providerProfiles/*.ts、generationParamResolver.ts、src/ui-app/components/GenerationParamsSettingsEditor.vue	仍在驱动 UI 选项

Generation V2	src/next/generation-v2/**、electron/services/*GenerationAuthorityV2Service.ts、src/{next,shared}/modelCatalog/**	部分激活（DeepSeek 文本发送链已激活），UI 投影缺失

1.2 实际存在的"业务事实"决策系统（三套，外加 UI 硬编码）

generation-params profiles（legacy，应删除）：providerProfiles/openrouterGenerationProfile.ts、anthropicGenerationProfile.ts、openaiResponsesGenerationProfile.ts 用 model regex 决定 effort 枚举；deepseekGenerationProfile.ts 干脆没有 reasoningEffort 能力项，触发 generationParamProfiles.ts:82-99 的全量 fallback ['none','minimal','low','medium','high','xhigh','max']。

Active catalog 粗粒度 resolution（保留但需修正）：provider /models observation（tri-state present|missing|invalid）→ modelCapabilityResolverV2.ts 单一 merge 点（provider present 值优先；reviewed supplement 只补 missing；enabled = modelSupport==='supported' && wireImplemented）→ catalogQueryService.ts:404-410 供 picker 与 send gate。

V2 reviewed capability policies（应成为唯一 business 事实层）：deepseek/stableCapabilityPolicyV2.ts（70+ semantic path，closed domain，mapping，evidenceId，rejectionCode）、anthropic/modelThinkingRulesV1.ts（精确 model ID、无 regex、未知模型不可用）、openai-responses/modelCapabilityManifestV2.ts、Gemini 各 policy。

UI 硬编码（应删除）：ChatAppComposer.vue:373（deepseek → ['high','max']，源自 src/next/provider/deepseek/deepSeekReasoningPolicy.ts:3-4）、ChatSessionConsole.vue:2271（通用 ['low','medium','high'] 按钮）、GenerationParamsSettingsEditor.vue:49（fallback 全量枚举）、generationV2SessionConfigProjection.ts:45,49（providerId !== 'deepseek' 特判）。

Wire codecs（保留，属 wire semantics）：deepseek/chatRequestV1.ts:36（reasoning_effort?: 'high'|'max'）、chatIntentProjectionV1.ts:176-186（semantic→wire 映射）、OpenAI-compatible 映射栈（schemas.ts:198、buildCompatibleChatRequest.ts）、legacy deepSeekRequestBuilder.ts:76 等。

子代理 A 的完整枚举共 23 处（含 catalog 各 source、authority services、snapshot composers、modelIndex legacy 等）；上面的 5 组是按"谁决定模型能做什么"归并后的答案。核心结论：当前不是"两套 authority"，而是三套 business 事实系统 + 两处 UI 硬编码 + 一套 wire codec 在并行运转，且它们之间既不共享数据源也不共享 revision。

1.3 已经存在、应当复用的机制

单一 merge 点：resolveModelCapabilitiesV2（src/next/modelCatalog/modelCapabilityResolverV2.ts:73-85）。

权威链：provider observation → active snapshot（snapshotDigest + authorityRevision + assertCurrent()，catalogRuntimeStoreV2.ts、activeCatalogModelAuthorityV2Service.ts:249-263）→ 粗粒度 5-fact resolution → per-provider V2 policy → revisioned RuntimeCapabilitySnapshotV2（capability_revision/snapshotHash 被 branded 进请求字节，compiler/preparedProviderRequestV2.ts:143-144）→ answer snapshot 记录 provenance。

TP4 证据优先级（已冻结设计）：contract codec invariant > provider 精确 endpoint descriptor / signed record > 官方文档编码的 reviewed rule > 成功 versioned live probe > user override（只能收窄）；冲突保守——更强的 unsupported 胜出，missing evidence = unavailable，regex 不是 evidence。

缺口：TP4 列的 resolveRuntimeCapabilityV2.ts、useGenerationControlsProjection.ts 尚未实现（grep 证实不存在）；STALE_CAPABILITY_REVISION 交易拒绝是 plan-only（无代码常量）；missingFactSupplements 目前只有 textChat: true。

2. DeepSeek reasoning bug：根因与官方规则重核验（Q5）

2.1 根因（代码确认）

复制

UI:  ChatSessionConsole.vue:2271 硬编码 ['low','medium','high'] / ChatAppComposer.vue:373 deepseek→['high','max']

     数据源: 无 catalog 咨询; deepseekGenerationProfile 无 reasoningEffort → generationParamProfiles.ts:93 fallback 全量枚举

        ↓

intent: { reasoning: { mode:'enabled', effort:'high' } }

        ↓ IPC generation-v2:deepseek:initial

PREFLIGHT 1: assertActiveCatalogOptionalCapabilitiesV2  (activeCatalogModelAuthorityV2Service.ts:65-79)

             要求 resolutions.reasoning.enabled === true

             DeepSeek: /models 只返回 id/object/owned_by → facts 全 'missing' (deepSeekModelSource.ts:253-259)

             registry 只 supplement textChat (providerCatalogAuthorityRegistryV2.ts:66)

             → modelSupport='unknown' → enabled=false → 抛 GENERATION_V2_ACTIVE_CATALOG_OBSERVATION_INVALID

PREFLIGHT 2 (被 1 挡住, 本会通过): deepSeekStableGenerationAuthorityV2Service validateIntentSubset

             按 stableCapabilityPolicyV2.ts:216-221 接受 reasoning.effort（含 'high'）

关闭 reasoning → required 列表不含 'reasoning' → 全链通过

一句话根因：UI 把 DeepSeek 的 wire 词汇（thinking/reasoning_effort 存在）当成能力选项直接展示；main 进程 preflight 却要求 catalog observation 的正向证据；而 DeepSeek /models 的结构性事实就是它永远给不出这个证据。粗粒度 catalog gate 挡在细粒度 reviewed policy 之前，两层用不同数据源、不同 revision。你担心的三套 allowlist 场景在 DeepSeek 上就是现实。

2.2 DeepSeek 当前官方规则重核验（不要再用旧结论）

以 2026-08-12 抓取的官方文档为准（thinking_mode、create-chat-completion，镜像 thevibeworks/deepseek-docs）：

thinking.type = enabled|disabled，默认 enabled，默认 effort = high；

reasoning_effort 原生枚举 = low | high | max；create-chat-completion 页明确写：medium 与 xhigh 是"for compatibility"被映射到 high；

thinking_mode 页的映射表（v4-flash 与 v4-pro 相同）：low→low, medium→high, high→high, xhigh→high, max→max；

thinking 模式下 temperature/top_p/presence_penalty/frequency_penalty 被接受但无效（不报错）；后两个参数已 deprecated；

工具调用多轮必须完整回传 reasoning_content，否则 400。

原生可选档位 = {low, high, max}；medium/xhigh 是 provider 为兼容其他客户端而接受并映射的 alias，不是独立档位。 这正是你要求区分的点，官方文档本次已经把它说死了。

⚠️ Starverse 自己的冻结契约已经过期：docs/architecture/generation-compiler-v2/evidence/deepseek-stable-api-contract-20260715.json（reasoningEffortValues: ["high","max"]，low→high，xhigh→max）与 2026-08-12 官方文档（low 是原生值，xhigh→high）不一致。stableCapabilityPolicyV2.ts:216-221 同步携带了旧映射。这说明evidence 必须带 revision 且需要周期性 re-verify——而 V2 架构恰好已经为此设计了机制（sha256-pinned artifact + verifiedAt + policy digest），缺的只是流程。

2.3 顺带发现的三方漂移实例（完美证明你的第 6 点担忧）

同一底层模型，三个来源、三种答案，且漂移按"条目粒度"分布：

来源	V4 Pro	V4 Flash	依据

Starverse 冻结契约 (2026-07-15)	effort {high,max}，low→high，xhigh→max	同左（family 级）	contract evidence JSON

models.dev	toggle + {high,max}（low→high 说法，来源标注 2026-06-25 抓取）	toggle + {low,high,max}（low→low，xhigh→high，来源 2026-08-02 抓取）	各条目头部注释

DeepSeek 官方（2026-08-12）	low→low / medium,xhigh→high，原生 {low,high,max}，两模型相同	同左	thinking_mode + create-chat-completion

models.dev 的 Pro 条目落后官方约 6 周，Flash 条目已跟上；官方文档本身在 6 月底→8 月初之间改过。结论：任何"最终能力表"都必须按 (provider, model) 条目携带独立 freshness，且以 review 时间为权威，不以第三方抓取时间为权威。

2.4 models.dev + unified resolution 是否适合解决这类问题？

方向正确，但要点顺序不能颠倒：必要条件 = 完成 TP4 的 unified resolver 并让 UI/preflight/compiler 消费同一 revision；models.dev 是可选增强，不是必要件。 DeepSeek 这个 bug 用现有 reviewed official contract 就能修（§9 Phase 0），models.dev 的真实价值在"减少人工 review 的覆盖成本"。

3. models.dev 的角色与接入层设计（Q2、Q3）

3.1 数据形态（已验证）

三个端点：api.json（provider-specific）、models.json（provider-agnostic lab metadata）、catalog.json（合并）；TOML 源 → CI 生成（README）。

字段：reasoning(bool)、tool_call、structured_output、temperature、attachment、interleaved、limit.{context,input,output}、modalities、status；provider 侧 reasoning_options（{type:"effort",values:[...]}、{type:"toggle"}、{type:"budget_tokens",min,max}）——AGENTS.md 明确：reasoning=true 时 reasoning_options 必填、按"谁运营 API"分类 host、禁止发明统一 L/M/H、[]=无调用方控制、DeepSeek V4 = toggle + high/max。

更新节奏：部分 relay（OpenRouter 等）有每小时自动 sync commit；其余靠社区 PR；无 SLA、无版本化 API（只能 pin GitHub commit SHA）。

消费先例：opencode 的 models-dev.ts 默认走

https://models.opencode.ai

 镜像，5 分钟 TTL / 60 分钟 refresh，atomic tempfile+rename + flock，fallback 链 disk cache → build 时快照 → fetch → 空表，fetch 失败仅记日志不覆盖 last-known-good。注意：连 opencode 自己都不在生产时直连 models.dev 域名，且有 provider.models() hook 回归记录。

3.2 建议的 precedence（在 TP4 已冻结列表内插入）

复制

1. Contract codec invariant（协议/版本）

2. Provider 精确 endpoint descriptor / signed capability record

3. Starverse reviewed official-doc rules（官方文档 + Owner review，sha256-pinned）   ← 权威 business 层

4. models.dev 条目（NEW：third-party metadata evidence）          ← 只补 missing；冲突时 fail closed

5. 成功 versioned live probe

6. User endpoint override（只收窄/只选 codec 已实现的字段）

运行时语义约束（把"trusted supplement"落到规则）：

只允许在 provider fact 为 missing 且无 reviewed rule 时，作为 evidence 输入进入 resolver；

provider present 值（true 或 false）永远胜出；models.dev 与 reviewed rule 冲突 → 该字段 unavailable + 生成 review 任务，绝不静默采用任何一方；

models.dev 条目存在 ≠ availability：active catalog 成员资格仍只由 provider /models + credential scope 决定；

不复制 base_model 继承带来的跨 provider 污染：解析时必须展开到 (provider, model)，lab metadata 只是展开模板。

3.3 接入层的具体落点

默认（离线）：一个 maintainer 工具/脚本——拉取 models.dev snapshot（pin commit SHA），与冻结规则做 diff（新模型、effort 变更、toggle 变更），产出"候选 reviewed rule 变更 PR 草稿"。数据进入 V2 的既有 evidence 产物目录（docs/architecture/generation-compiler-v2/evidence/）。零运行时风险，不引入任何新权威。

可选（运行时，feature-flag）：扩展子代理 A 列出的 10 个点中最小的 3 处——providerModelObservationV2.ts 的 provenance union（新增 sourceKind: 'third_party_metadata'）、modelCapabilityResolverV2.ts 的 merge（missing-only overlay）、runtimeCapabilitySnapshotV2.ts:296-299 的 EVIDENCE_KINDS（新增 kind + validateSourceRef 规则）。每个 evidence record 携带：commit SHA、fetchedAt、条目 last_updated、content digest。

4. 冲突语义：明确且可解释（Q8）

场景	结果

provider 有新模型、models.dev 没有	模型 active（provider /models 为准）；capability 若 provider 也 missing 则 unknown→不可选，等待 review；不得因为"models.dev 没有"而降级

models.dev 有、provider /models 没有	不进入 active catalog（External metadata 不创建 availability）

provider 未返回某 capability 字段	missing → 依次咨询 reviewed rule → models.dev → 无则 unknown；UI 不显示为支持，preflight 拒绝显式使用，但不算 provider 说不支持

provider 明确 false、models.dev true	provider 胜；conflict 只标记不抛（现有语义 modelCapabilityResolverV2.ts:68）；字段按 false 处理，同时生成 review 任务

models.dev 与 Starverse reviewed contract 不一致	reviewed contract 胜；该字段按 contract；models.dev 侧记 conflict + 生成 review 任务（这是"reviewed override 滞后第三方"的检测信号）

models.dev true、codec 未实现	enabled=false（既有 enabled = supported && wireImplemented 门，providerCatalogAuthorityRegistryV2.ts）；规则或第三方数据都不能绕过 codec

同一 underlying model 在不同 provider 能力不同	按 (provider, model) 独立展开；models.dev 的 base_model 继承只作模板，provider 条目字段 wins（与 models.dev 自身 merge 规则一致）；不做跨 provider 能力共享

missing/unknown/unsupported 三态：observation 层已有 presence: present|missing|invalid，resolver 已有 modelSupport: supported|unsupported|unknown——三态模型本身已经存在于类型系统；真正的塌缩发生在 deepSeekCatalogSource.ts:85-91（missing → capabilities.reasoning: false）这类 catalog 行投影，以及 UI 把 wire 词汇当支持选项展示。修正方向是消灭这两类塌缩，而不是新建三态。

5. Reviewed capability rules 设计（Q9）

不要新造规则 DSL。 Starverse 已有两个可复用的成熟形状：

DeepSeekStableCapabilityRuleV2（stableCapabilityPolicyV2.ts:34-57）：{path, kind, domain(closed enum/range), wireKey, mapping, evidenceId, rejectionCode, toolChoiceMatrix}；

AnthropicModelThinkingRuleV1（modelThinkingRulesV1.ts:5-15）：精确 modelId 表，无 regex，未知模型不可用。

建议的收敛设计（增量，不重写）：

作用域：(provider, contract, operation) + 可选精确 modelId[]（沿用 Anthropic 表的"无 wildcard"纪律）；family 级规则只允许在 provider 官方文档声明 family 一致时使用（DeepSeek V4 目前官方声明两模型映射相同，但仍是"今天的事实"，必须带 verifiedAt）。

规则操作（对应你的需求）：deny capability（kind: unsupported）、allow capability（supported_static/supported_with_*）、remove effort value（domain 收窄）、add effort value（domain 扩展）、narrow domain/range。全部通过替换/覆盖 domain 表达，不需要新的操作词汇。

alias 与 native 分离（关键修正）：把 mapping 的两类键显式分成：

nativeValues（UI 可展示、可选的档位，如 DeepSeek low|high|max）；

acceptedAliases（语义层可接收、编码时映射的兼容值，如 medium/xhigh，UI 不展示为独立档位）。

当前冻结策略 stableCapabilityPolicyV2.ts:218-219 把 low/medium/high/xhigh/max 全放进 domain 再 mapping——这违反你自己的原则（alias 被宣称为独立档位）。这是必须由 Owner 重新冻结的点（见 §11）。

codec 闭包校验（你的安全限制）：policy 加载时校验 nativeValues ∪ aliasValues 的目标 ⊆ codec 闭包 wire 域（如 chatRequestV1.ts 的 'high'|'max'），否则 policy invalid、fail closed 于加载期。规则"添加"一个 codec 未实现的值在加载时就炸掉，而不是到发送时才炸。

收敛保证：规则一次修改 → policy digest 变化 → 新 capability_revision → UI 投影、preflight、compiler 全部消费同一 snapshot（TP4 目标，尚未完成）；compiler 内的 mapping 不再内联重复——chatIntentProjectionV1.ts:183 与 policy :219 的重复映射要么改为从 policy 读取，要么由同一 fixture 生成 + 架构测试锁定一致性。

规则本身的 provenance：每条规则带 evidence[]（官方 URL + verifiedAt，或 models.dev 条目 + commit SHA + fetchedAt），与既有 evidenceId/contentDigest 机制对齐。

6. 什么该删、什么该留（Q5、Q6）

应删除/收敛的 business 硬编码（Q5）：

legacy providerProfiles/*.ts 中的 effort 枚举 + model regex（anthropicGenerationProfile.ts:76-92、openaiResponsesGenerationProfile.ts 的 regex allowlist、deepseekGenerationProfile.ts:63 的 (reasoner|thinking|v4)）；被 V2 精确规则表替代。

generationParamProfiles.ts:82-84 的全量 fallback 枚举（"profile 没有就全开放"是危险默认）；GenerationParamsSettingsEditor.vue:49 fallback。

UI 特判：ChatAppComposer.vue:373、ChatSessionConsole.vue:2271、generationV2SessionConfigProjection.ts:45,49 的 providerId !== 'deepseek'。

deepSeekReasoningPolicy.ts 作为 UI 选项来源（其内容只是 wire 词汇，应回到 codec/contract 层）。

catalog 行投影里 missing → false 的塌缩（deepSeekCatalogSource.ts:85-91 及同类 source）。

应保留、属合理 wire semantics（Q6）：

deepseek/chatRequestV1.ts 的闭包 wire 类型（thinking.type、reasoning_effort: 'high'|'max'、max_tokens 等）；

chatIntentProjectionV1.ts 的 semantic→wire 编码逻辑与 rejection code（DEEPSEEK_REASONING_EFFORT_UNSUPPORTED 等）——只要求它消费 policy 的 mapping 而非重复；

各 provider 的 wireKey/wirePath、interleaved.field=reasoning_content、stream 协议、continuation artifact 形状（TP7 已冻结的 wire 决策）；

OpenAI-compatible 的用户自有 alias 映射栈（schemas.ts、buildCompatibleChatRequest.ts、CompatibleProviderSettingsPanel.vue）——TP7 明确保留它作为 unknown-patch 禁令的唯一例外；

providerCatalogAuthorityRegistryV2.wireImplementation allowlist（DeepSeek vision:false 等）——这是"codec 是否实现"的登记处，保留并继续维护。

7. 怎样保证最终没有两套 authority（Q7）

单一 resolver、单一 snapshot：完成 TP4 的 resolveRuntimeCapabilityV2 + useGenerationControlsProjection。UI 控件、send preflight、compiler 在一个交易里拿到同一个 revisioned snapshot 对象；类型层用既有 branding 纪律（decoded_unverified / executionAuthority:'none'，只有 resolver 重新验证后才发放 authority）。

preflight 与 compiler 同源：assertActiveCatalogOptionalCapabilitiesV2 这类粗闸门改为：粗 fact 为 unknown 时不否决，交由同一交易的细粒度 snapshot 判定（missing≠unsupported 的落地形式）；false（provider 明确报不支持）仍否决。

compiler 不扩权：compiler 只编码 snapshot 已授权的值；闭包 codec 拒绝其余；capability_revision/snapshotHash branded 进请求字节（已有）；把 plan-only 的 STALE_CAPABILITY_REVISION 交易拒绝实现掉。

UI 不得再 import 任何 provider codec/profile/regex/wire 名——TP4 已列为 architecture guard，作为测试断言执行。

models.dev 只产出 evidence records，不产出表：它改变结论的唯一途径是进入 resolver 的 evidence 列表并被 revision digest 覆盖。

规则变更的传播链：rule 改 → policy digest → new capability_revision → UI/预检/编译同步变化；已创建 command 绑定旧 revision，新 command 用新 revision，stale-reject 兜底。

8. models.dev 的更新、缓存、离线与 provenance（Q11）

复用，不要新建平行系统。 现成的：catalog snapshotDigest/authorityRevision/assertCurrent()、runtimeCapabilitySnapshotV2 的 catalogAuthority{scopeId,catalogDigest,authorityRevision,resolutionDigest}、answer snapshot 的 revision provenance、OpenRouter Images 的 descriptorFreshnessSettingsV2（refreshAfterMs < hardExpireAfterMs 预设对）模式。

具体设计：

快照：models.dev 数据按 commit SHA 拉取 → canonical JSON → sha256 digest → 本地缓存文件（atomic rename + flock，参照 opencode 实现）；运行时默认关闭（feature flag），永远允许 DISABLE。

last-known-good：fetch 失败不覆盖、不阻塞发送；缺失 models.dev 时能力退化到"reviewed rule 或 unknown"，与今天行为一致。

freshness：每条目携带 fetchedAt + 条目 last_updated；更新策略复用 refreshAfter/hardExpire 预设对（如 24h/7d）。到 hardExpire 且无网络 → 字段 unavailable（fail closed），但不阻塞整个 send，只影响该字段（可解释、UI 可见原因）。

revision 一致性：UI 打开期间 metadata 更新 → 新 revision；已编辑中的 command 绑定旧 revision（发送时断言），新建 command 取新 revision；与 catalog authorityRevision 交易语义一致。

provenance：扩展 sourceKind: 'third_party_metadata' + EVIDENCE_KINDS；每条 record 存 {sourceUrl, commitSha, fetchedAt, entryLastUpdated, contentDigest}。这条是接入 models.dev 时类型层面必须改的地方（子代理 A 已列出全部 10 处扩展点，最小集是 3 处）。

9. 最小风险迁移路径（Q12）

严格按 V2 的 zero-activation 纪律分阶段，每阶段可独立验收：

Phase 0 — 修 bug（不引入 models.dev）：① 修 missing→false 塌缩；② 给 deepseek 增补 reviewed supplement（missingFactSupplements.reasoning: true）或（更正确）让 coarse gate 在 unknown 时下放给细粒度 snapshot 判定；③ 删除 §6 列出的 UI 硬编码，UI 改消费统一投影；④ 按 2026-08-12 官方文档重核 DeepSeek 契约 evidence 并让 Owner 重新冻结（含 alias 分离决策）。

Phase 1 — 完成 TP4 缺失件：resolveRuntimeCapabilityV2、useGenerationControlsProjection、STALE_CAPABILITY_REVISION；preflight 与 compiler 改消费同一 snapshot；架构守卫测试（UI 零 provider import）。

Phase 2 — 删除 legacy：generation-params profiles、fallback enums、generationParamResolver 的 UI 路径；保留 mapper 直到全部 provider 切到 V2。

Phase 3 — models.dev 离线接入：review 工具（snapshot diff → 候选规则 PR），纯维护者工作流，运行时零改动。

Phase 4 — 可选运行时 supplement：3 处类型扩展 + feature flag + freshness 策略；仅补 missing，加 e2e 证明"models.dev 无法 override provider present / 无法创建 availability / 无法绕过 codec"。

每阶段结束的验收标准统一为：目录展示、UI 控件、preflight、compiler 对同一 (provider, model, protocol, operation, revision) 的结论字节级一致。

10. DeepSeek bug 在新体系下如何自然解决（Q10）

新体系下该 bug 的形态：UI 选项来自 snapshot 投影（DeepSeek effort 投影 = reviewed 规则的 nativeValues），preflight 与 compiler 消费同一 snapshot——不存在"UI 一套、catalog 一套"的分叉。high 被展示的前提是 reviewed rule 声明 high 为 native 且 codec 闭包含 high；预检不会再要求 /models 给出它结构性给不出的正向证据。关闭 reasoning 时 reasoning.mode='disabled' 同样来自同一 snapshot 的 domain，天然一致。models.dev 在这个案例里的作用仅是：当某个新 DeepSeek 模型上线而 reviewed rule 尚未覆盖时，用其 reasoning_options 证据加速 review，而不是取代 review。

11. 对设想本身的修正意见

设想的核心原则（single resolved capability）与 TP4 已冻结设计完全一致——这不是新设计，是执行未完工程。别把它表述成"引入 models.dev 时的新架构约束"，否则容易再造平行结构。

"删除 DeepSeek low 档位"的例子当前已不成立：最新官方文档里 low 是 V4 原生档位（映射 low→low）。这个例子反而证明了规则必须绑定 verifiedAt 并可重冻结。

当前冻结的 DeepSeek 规则把 alias 放进了 domain 暴露给 UI——先改这条再谈接入，否则 models.dev 的 reasoning_options 会带着同样的问题进来。

models.dev 是社区数据、无 SLA、无版本化 API；连 opencode 都走自有镜像且有回归记录。运行时接入必须默认关、必须 last-known-good、必须能完全禁用。

models.dev 的 base_model 继承是一把双刃剑：方便、但会诱导跨 provider 共享能力——展开必须显式、逐 (provider, model) 校验。

建议冻结的架构决策

Single resolved capability（确认既有 TP4 目标为长期架构，不新增第二权威）：同一 (provider, endpoint/profile, protocol, model, operation) 在一个 evidence revision 下只有一份最终能力结论；目录、UI 控件、preflight、compiler、answer provenance 全部消费同一个 revisioned snapshot。

models.dev 的定性：trusted supplement / evidence source，永远不是 authoritative capability source；不得单独使模型进入 active catalog；不得 override provider 报告的 present 值；不得绕过 codec 闭包。

运行时接入默认关闭：models.dev 拉取必须可禁用、失败不阻塞发送、last-known-good 兜底；第一阶段只允许离线（review 工具）使用。

证据优先级（在 TP4 列表内插入第 4 级）：contract codec invariant > provider endpoint descriptor/signed record > Starverse reviewed official-doc rule > models.dev 条目 > versioned live probe > user override；更强 unsupported 胜出，missing evidence = unavailable。

三态纪律：missing ≠ unsupported；missing 依次咨询 reviewed rule → models.dev → 否则 unknown；UI 不把 unknown 显示为支持，preflight 拒绝显式使用 unknown 值但不得报告为"provider 不支持"。

Alias 分离（新）：规则域必须区分 nativeValues（UI 可展示可选）与 acceptedAliases（语义层可接收、映射后编码、UI 不展示为独立档位）；compatibility alias 不得自动成为模型能力档位。

规则层形状：沿用 DeepSeekStableCapabilityRuleV2/AnthropicModelThinkingRuleV1 形状；作用域 (provider, contract, operation) + 可选精确 modelId，无 regex/wildcard；规则操作 = 覆盖 domain/kinds；规则加载期校验 mapping 目标 ⊆ codec 闭包，失败即 fail closed。

Wire 知识归位：semantic→wire 映射、wire 字段名/类型、interleaved/continuation 形状属于 provider contract/codec；compiler 不得内联重复 reviewed mapping（DeepSeek 双份映射必须先收敛）。

DeepSeek 契约重冻结：以 2026-08-12 官方文档为准重核（native {low,high,max}；medium/xhigh→high；thinking 默认 enabled）；旧契约（{high,max}、low→high、xhigh→max）标记过期；重核产出新 evidence artifact + 新 policy digest。

Coarse gate 语义：catalog 粗 fact 为 unknown 时不否决，交由同交易细粒度 snapshot 判定；present:false 仍否决。DeepSeek reasoning bug 按此修，不引入 provider 特判豁免。

遗留清理承诺：UI 组件、session 投影、generation-params profiles 中所有 provider/model 特判与 fallback 枚举在 Phase 2 内删除；架构守卫测试断言 UI 不 import provider codec/profile/regex/wire 名。

provenance 扩展点：新增 sourceKind: 'third_party_metadata' 与对应 EVIDENCE_KINDS 成员；每条 models.dev 证据必须携带 commit SHA、fetchedAt、条目 last_updated、content digest；未扩展类型前不得接入运行时 resolver。

更新策略复用：models.dev 快照使用 catalog 既有 revision/assertCurrent 机制与 refreshAfter/hardExpire 预设对模式；已创建 generation command 绑定其 capability revision，更新只影响新 command；发送时 stale-reject（实现 plan-only 的 STALE_CAPABILITY_REVISION）。

Owner 冻结清单（本批）：① DeepSeek V4 Pro/Flash 的 native effort 档位与 alias 映射；② 是否让 models.dev 进入运行时（默认否）；③ 运行时启用后的 refresh/hardExpire 预设与禁用开关；④ DeepSeek bug 修复采用"supplement"还是"unknown 下放"方案。

一句话总结：方案本身方向正确，但 Starverse 缺的不是第三个数据源，而是把已经设计好的单一 capability revision 贯通到 UI 与 preflight；models.dev 适合作为该体系的 evidence 补充与 review 加速器，按"离线先行、运行时可选、只补 missing、永不扩权"接入。

## 交叉核对增量

收到，已把这份完整测绘报告与我的评估交叉核对。结论：它与我的报告高度一致，且补充了几个我此前未展开的细节。以下是对账结果和增量信息，供后续交叉比较时合并使用。

对账：无矛盾，增量如下

未收录模型的粗闸门语义（值得写进最终结论）：withExactActiveModel 对 active snapshot 中不存在的模型会构造 missingObservation（activeCatalogModelAuthorityV2Service.ts:97-111），此时 textChat 由 registry 的 textChat:true supplement 补上，因此粗闸门放行未收录模型，真正的"模型必须存在"由下游 per-provider authority 执行（Anthropic 精确规则表无条目→不可用；OpenAI Responses MODEL_NOT_VISIBLE；DeepSeek 的未收录拒绝链尚未被完全验证——这是 models.dev 接入前值得补测的一个盲点）。我的报告把这层写成了"成员资格由粗闸门决定"，应按此细化。

modelBindingPolicy（providerContractRegistryV2.ts:69：descriptor_model_id | runtime_capability_resolver | explicit_local_profile）——模型如何绑定到协议契约的三种策略。models.dev 属于 runtime_capability_resolver 路径的输入，不能创建 binding；这条可以明确写进冻结决策。

EVIDENCE_KINDS 精确成员：contract_invariant | endpoint_descriptor | signed_provider_record | official_documentation | live_probe | user_narrowing_override（runtimeCapabilitySnapshotV2.ts:296-302），且 official_documentation 的 URL 校验是 https-only（:382-387）。models.dev 需新增 third_party_metadata 成员 + 放宽或单独定义其 sourceRef 校验规则——与我的 §8 一致，现在有了精确位置。

新增的必答问题：models.dev ID 与 native model ID 的 join。models.dev 的 Model ID 是 AI-SDK 风格标识（base_model = "deepseek/deepseek-v4-pro-0813"、文件路径即 ID），而 Starverse 的能力身份是 per-(provider, nativeModelId)。接入必须定义 join 规则，且现有代码不存在跨 provider alias——这条应进冻结决策，且必须是精确匹配、禁止模糊/regex join。

visibility 目前是惰性的（五个 source 全部硬编码 'visible'）。models.dev 的 status: deprecated 等 lifecycle 字段理论上可喂给 catalog 生命周期，但那是全新领域；按"external metadata 不创建 availability"原则，短期内应明确不接，只作为 review 提示。

reviewAfter（90 天）机制已存在（providerContractRegistryV2.ts:449-484）：contract evidence 自带复审到期时间。models.dev 离线 diff 工具最自然的落点是喂给这个既有复审循环（哪条 reviewed rule 的官方依据或第三方数据变了 → 触发 re-verify），而不是新建复审流程。

计数口径：决策点清单 20 行表格（加上 legacy modelIndex、modelDetailService 等辅助点共约 23 处）——与我说法一致，只是归并口径不同。

对冻结清单的补强（建议追加 2 条）

15. models.dev ID join 规则：models.dev 条目按 (provider, nativeModelId) 精确匹配 join 进 observation/resolver；禁止模糊、regex、跨 provider alias；join 失败 = 该条目不产生任何 evidence。

16. models.dev 与生命周期解耦：models.dev 的 status/lifecycle 字段不直接改变 catalog visibility/status；只作为 reviewAfter 复审循环的触发输入。
