# models.dev 模型能力源接入：DeepSeek V4 Flash 调查

- Lifecycle Status: historical

- Document Role: implementation-note, candidate-action-list

- Last updated: 2026-08-16

> 从原始汇编文档机械拆分的独立调查报告。报告包含当时的代码与外部事实判断，其中 DeepSeek reasoning effort 结论后来出现更新或冲突，只能作为历史证据使用。

Starverse models.dev 模型能力源接入 — 架构调查报告

调查范围：HEAD 4391ee66 本地代码考古 + 两个代码考古子代理 + 两个外部研究子代理（其一仍在运行，见 §11）。本报告只读，未修改任何源码；结束与开始时的 git status 完全一致。

1. Executive conclusion

1.1 是否建议接入 models.dev

建议接入，但严格作为"可信但非权威的第三方证据源"，且必须先修复当前已存在的双重能力事实源漂移。 models.dev 解决的是真实问题：DeepSeek /models 不返回任何能力字段（deepSeekModelSource.ts:253-259），OpenAI Responses、Anthropic、Gemini 各只有部分字段，当前 coarse catalog 对这些"缺失"只能回退到极窄的 missingFactSupplements（目前只补 textChat，providerCatalogAuthorityRegistryV2.ts:66）。但本次调查证明：即使不接入 models.dev，当前架构内部已经存在三重互相漂移的能力事实源（详见 §3），DeepSeek 的 bug 正是漂移的直接产物。接入 models.dev 前必须先确立"单一 resolved capability revision"机制，否则只是再加第四个事实源。

1.2 应接在哪一层

进入 resolution 层作为新增 evidence 输入，而不是 observation 层、也不是独立 authority。

不修改 CatalogProviderModelObservationV2 的语义（它保持"provider 自己说了什么"，sourceKind:'provider_api' 不变）；

在 catalog 存储层，CatalogRawBucket.source 封闭联合（internalSchema.ts:43-49，目前 'models'|'models_user'|'providers'|'endpoints'）增加 'models_dev' bucket——该 schema 的设计注释明确写明了"保留所有来源 payload 以便回填"（internalSchema.ts:52-55），这是为多源设计的现成位置；

扩展 RuntimeCapabilityEvidenceKindV2（runtimeCapabilitySnapshotV2.ts:167-173）增加第三方元数据 kind，使 models.dev 证据进入唯一的 fine-grained runtime capability snapshot；

coarse catalog capability（resolveModelCapabilitiesV2）改为同一 evidence graph 的投影，禁止它独立持有最终结论（现状它正是预检合法性来源，见 §3.2）。

1.3 models.dev 的正式 trust role

trusted, non-authoritative supplement：只回答"上游第三方声称这个模型有什么能力/值域"，且：

永远不能创建模型 existence / availability（不能把模型加进 active catalog，不能证明 credential 可用）；

永远不能覆盖 provider 当前明确返回的事实（present）；

永远不能覆盖 Starverse reviewed contract / rule；

永远不能绕过 wire implementation 门（enabled = supported && wireImplemented，modelCapabilityResolverV2.ts:41）。

1.4 最大架构风险

接入后形成"第五个事实源"并加深漂移，除非先完成单一 resolution。次要风险：models.dev 数据质量（reasoning_options 等字段未证实存在、无发布版本/哈希字段、repo→API 有时差，见 §4.5）会被误当作权威；以及 models.dev 的 provider-specific 记录（尤其 OpenRouter 形态的 author/slug）与 Starverse providerKey + nativeModelId identity 的映射错误导致跨 provider 泄漏能力。

2. Current-state map（当前能力决策点全图）

先给结论性全景，再逐层展开。当前链路：

复制

provider /models ─► observation(facts: present|missing|invalid) ─► catalog 快照(scope/credential 绑定) ─►

active catalog authority(resolutions=resolveModelCapabilitiesV2) ─► preflight 断言 ─►

semantic intent(命令事实) ─► provider authority service ─► 快照字段(策略派生) ─► intent subset 校验 ─►

intent projection(wire 映射) ─► compiler(再校验) ─► 序列化 ─► provider request

2.1 各阶段职责与决策点

#	阶段	模块（file:line）	类别

1	provider model discovery	deepSeekModelSource.ts:338-412（GET /models）；parser :275-305；observation 构造 :246-261（全部 fact=missing）；catalog adapter src/shared/modelCatalog/providers/deepseek/deepSeekCatalogSource.ts:107-137（observation 存入 bucket.payload.observation :40-55）	(a) 证据采集

2	catalog observation 语义	providerModelObservationV2.ts:11-17（presence 三态）、:84-101（present/invalid/missing 判定）；Anthropic 解析真实 capabilities.*.supported（anthropicModelSource.ts:215-236,264-266）、Gemini 解析 thinking（geminiModelSource.ts:285）、OpenRouter 解析 supported_parameters（openRouterCatalogClient.ts:371,403-415）	(a) 证据采集

3	catalog 持久化	infra/db/v2/modelCatalogSchemaV2.sql:3-39（scope：authority_revision、active/pending digest）、:41-79（快照 immutable）；infra/db/repo/modelCatalogV2Repo.ts（beginSync/commitSync 每次 bump authority_revision+1）；渲染端缓存 catalogRuntimeStoreV2.ts:94-216	(a) 证据存储

4	model selection（picker）	catalogQueryService.ts:366（observation→resolveModelCapabilitiesV2）、:404-410（badge=enabled，回退 legacy 列）；ModelPickerDialog.vue:581-586（阈值更弱：`modelSupport==='supported'

5	UI controls projection	决策点：ChatAppComposer.vue:371-382（DeepSeek 分支返回静态 DEEPSEEK_SELECTABLE_REASONING_EFFORTS=['high','max'] :373；toggle 只受 options 长度门控 :1266-1271）；决策点：ChatSessionConsole.vue:2269-2281（通用分支静态 ['low','medium','high']，对 DeepSeek 也渲染）；clamp：appChatApp.logic.ts:3484-3485（开启推理强制 high）、:6117-6121（切到 DeepSeek 强制 high）、:3496-3498（非 high/max 抛错）；legacy profile：generationParamProfiles.ts:82-99、providerProfiles/deepseekGenerationProfile.ts:15-72（无 reasoningEffort 参数，但有 模型名正则 :61-72）	(d) 静态硬编码，多源

6	semantic intent 构造	appChatApp.logic.ts:6435-6595（effort 白名单 :6505-6507）；持久化 :6597-6611；主进程装载 infra/db/repo/generationCommandFactsAuthorityV2.ts:107-116	(b) 用户偏好→intent 的解析

7	send preflight	决策点A（bug 所在）：electron/services/activeCatalogModelAuthorityV2Service.ts:142-267（withExactActiveModel：读 active scope :163、取 observation :166、shape 检查抛错#2 :169-172、resolutions=resolveModelCapabilitiesV2(observation) :173、textChat 门抛错#3 :174）；assertActiveCatalogOptionalCapabilitiesV2 :65-79（reasoning/tools/vision/structuredOutputs 必须 enabled===true，抛错#1 :76-78）；决策点B：deepSeekStableGenerationAuthorityV2Service.ts:525-626（assertActiveCatalogOptionalCapabilitiesV2 调用 :538；validateIntentSubset :138-261、调用 :573，effort domain 检查 :239-244）	(c) 两个独立合法性判定（A=coarse、B=fine）

8	runtime capability resolution	runtimeCapabilitySnapshotV2.ts 是纯 codec（canonicalize/decode/digest，:994-1055；evidence kinds :167-173；语义路径全表 :52-122；revision=capability-v2:hash(...) :981）；DeepSeek 快照由静态策略派生：deepSeekStableGenerationAuthorityV2Service.ts:336-362（evidence：policy 的 contract_invariant/official_documentation + models digest 的 live_probe）、:364-438（buildField）	(b) codec + 策略驱动组装（无独立 resolver；resolveRuntimeCapabilityV2.ts 尚不存在）

9	provider intent projection	chatIntentProjectionV1.ts:104-279：reasoning.mode→thinking.type :176；effort 映射 :177-186（minimal 拒、xhigh/max→max、其余→high）；thinking 下 sampling 拒 :152-170；thinking+toolChoice 拒 :220-225	(b/d) wire 映射

10	compiler / wire codec	chatRequestV1.ts:36（wire 类型 `reasoning_effort?: 'high'	'max'）、:120-135（decodeThinking 限制）、:255-261,287-288；桥接 compilerdeepSeekInitialPreparedRequestCompilerV2.ts:129-144（projection issues→SEMANTIC_REJECTED；disposition vs 持久化快照字段→CAPABILITY_MISMATCH:139-144；ledger 校验:191-194`）

11	持久化 runtime snapshot	infra/db/v2/generationExecutionSchema.sql:145-182（runtime_capability_snapshot_v2 immutable、content-addressed）；infra/db/repo/runtimeCapabilityV2Repo.ts:110-179（hash 幂等）；commit 时冻结 capabilityBinding{capabilityRevision,evidenceDigest,semanticFieldsDigest,snapshotHash}（deepSeekPlainTextSnapshotCommitV2.ts:236-280，尤其 :259-264）；retry/regenerate 复用冻结 binding（deepSeekPlainTextSnapshotCommitV2.ts:330-337,421-440；retry 不重跑 withExactActiveModel，deepSeekPlainTextRetryCoordinatorV2.ts:87-134）	(a) 存储 + 冻结

12	stale 机制	activeCatalogModelAuthorityV2Service.ts:249-258（assertCurrent 重读 scope 比对 digest/revision→GENERATION_V2_ACTIVE_CATALOG_CHANGED）；deepSeekStableGenerationAuthorityV2Service.ts:494-502；TP4 设想的 STALE_CAPABILITY_REVISION 命令级拒绝尚未实现（仅存在于 tp4-capability-evidence-ui.md:145）	(c) 已实现的是 catalog 级，非 snapshot 级

2.2 概念职责澄清（任务 §三）

provider model observation = provider 自己的话（providerModelObservationV2.ts），provenance.sourceKind 固定 'provider_api'。不应被 models.dev 数据污染。

active model catalog = 当前 credential scope 下 endpoint 实际暴露的模型集合（model_catalog_scope_v2，scope=(providerKey, credentialScopeId, endpointProfileId, operationContractId, category)）。

model-level coarse capability resolution = resolveModelCapabilitiesV2（boolean enabled 五键 + providerSpecific）。

provider reviewed contract / policy = providerContractRegistryV2 的 reviewed definition + 每 provider 的 family policy（DeepSeek: stableCapabilityPolicyV2.ts，evidence 绑定 deepseek-stable-api-contract-20260715.json 与 deepseek-stable-owner-capability-policy-v2-20260717.json）。

runtime semantic capability = PersistedRuntimeCapabilitySnapshotV2（67 个封闭语义路径、domain、constraint、evidence）。

persisted runtime capability snapshot = runtime_capability_snapshot_v2 表 + assistant_generation_snapshot_v2 的 capabilityBinding。

non-serializable verified authority = WeakSet brand + assertCurrent（catalog authority、binding authority、capability authority 三层）。

UI controls projection = composer chip（静态源，缺陷）。

command/send preflight = withVerifiedDeepSeekStableGenerationAuthoritiesV2（A+B 双闸）。

provider intent projection / request compiler = chatIntentProjectionV1 / chatRequestV1（wire 语义，正确）。

2.3 "最终发送合法性"到底有几个结论

两个，都在同一条 send 路径上、可能互相矛盾：

coarse：assertActiveCatalogOptionalCapabilitiesV2（activeCatalogModelAuthorityV2Service.ts:65-79）基于 resolveModelCapabilitiesV2(observation)；

fine：validateIntentSubset（deepSeekStableGenerationAuthorityV2Service.ts:138-261）基于策略派生快照字段；以及 compiler 对持久化快照字段的 disposition 复查（deepSeekInitialPreparedRequestCompilerV2.ts:139-144，与 2 同源）。

UI 的可选值来自第三个（静态 UI 策略），catalog 展示来自 coarse。这就是漂移结构。

3. Drift / duplication findings

3.1 DeepSeek bug 完整调用链（reasoning=high 失败）

UI：ChatAppComposer.vue:373 静态返回 ['high','max'] → 用户开推理选 high；appChatApp.logic.ts:3484-3485 强制 effort='high'。

语义层：appChatApp.logic.ts:6493,6511-6523 → reasoning:{mode:'enabled',effort:'high'}，持久化到 generationConfigV2（:6597-6611）。

IPC：generationV2CommandClient.ts:33 → generation-v2:deepseek:initial（deepSeekGenerationV2Ipc.ts:7-14）→ textGenerationV2IpcCore.ts:109 → deepSeekGenerationV2Runtime.ts:93-101 → deepSeekPlainTextInitialSendCoordinatorV2.ts:105-203。

命令事实：generationCommandFactsAuthorityV2.ts:107-116 从持久化语义层装载 intent。

预检：deepSeekStableGenerationAuthorityV2Service.ts:536-538 → requireCompleteBrandedInputs → assertActiveCatalogOptionalCapabilitiesV2。

抛错：activeCatalogModelAuthorityV2Service.ts:76-78 — resolutions.reasoning.enabled !== true（因为 observation reasoning=missing（deepSeekModelSource.ts:255）+ 无 supplement（providerCatalogAuthorityRegistryV2.ts:66）→ modelCapabilityResolverV2.ts:25-29,41 得 unknown/enabled:false）。

错误出口：textGenerationV2IpcCore.ts:46-49,103-106 → {ok:false, code:'GENERATION_V2_ACTIVE_CATALOG_OBSERVATION_INVALID'}。

永远到不了：validateIntentSubset（effort=high 在策略 domain 内，本来会通过）、projection（chatIntentProjectionV1.ts:183-184 high→high）、wire codec（chatRequestV1.ts:36,125 接受 high）。

推理关闭时 required=[]（activeCatalogModelAuthorityV2Service.ts:68-75）→ 断言通过；textChat 因 supplement=true 通过 :174。与观察到的"关推理正常"完全吻合。effort 值从未被检查——任何开启推理的 DeepSeek 发送都会失败。

3.2 8+ 个互相独立的"推理能力事实点"

parser 硬编码 missing：deepSeekModelSource.ts:253-259

registry supplement 只补 textChat：providerCatalogAuthorityRegistryV2.ts:66,104-108

策略 domain：stableCapabilityPolicyV2.ts:218（low/medium/high/xhigh/max）

UI 常量：deepSeekReasoningPolicy.ts:3-4（high/max）

控制台静态列表：ChatSessionConsole.vue:2271（low/medium/high）— 与 #4 互相矛盾：console 点 low/medium 会触发 appChatApp.logic.ts:3496-3498 抛错

wire 类型：chatRequestV1.ts:36,125（high/max）

intent 映射：chatIntentProjectionV1.ts:183-184

snapshot schema enum：runtimeCapabilitySnapshotV2.ts:544 外加 legacy profile 全量列表（generationParamProfiles.ts:82-84）与模型名正则（deepseekGenerationProfile.ts:61-72）。

已实际互相矛盾的是 (2) vs (3)（bug），以及 (4) vs (5)（UI 内部）。

3.3 wire semantics 与 capability duplication 分类

合理 wire/protocol semantics（应保留）：chatRequestV1.ts:36,120-135,287-288（原生 effort 域 high/max）、chatIntentProjectionV1.ts:176-186（映射+拒绝）、stableCapabilityPolicyV2.ts:219（mapping 表）、stableEndpointProfileV2.ts:59-83（协议钉扎）、deepSeekRequestBuilder.ts:73-78（legacy 透传）。

capability duplication（应删除/收敛）：deepSeekReasoningPolicy.ts:3-4 及其 UI 消费（ChatAppComposer.vue:373、appChatApp.logic.ts:3484-3498,6117-6121）、ChatSessionConsole.vue:2271 静态列表、deepseekGenerationProfile.ts:61-72 模型名正则、generationV2SessionConfigProjection.ts:45-50 的 provider 特判、providerCatalogAuthorityRegistryV2.ts:66 的 textChat-only supplement（能力事实，需扩展）、deepSeekModelSource.ts:254-258（parser 决策本身合理，但结果需被 supplement 弥补）。

3.4 UI/preflight/compiler 漂移点

UI 允许 preflight 拒绝：composer 静态 high/max vs assertActiveCatalogOptionalCapabilitiesV2（DeepSeek reasoning 全拒）——正是本 bug。

UI 内部自相矛盾：composer high/max vs console low/medium/high。

catalog 展示与 composer 不一致：picker badge（ModelPickerDialog.vue:581-586，阈值 supported||enabled）与 composer 选项互不通信。

coarse 与 fine 结论不一致：同一模型 reasoning：coarse enabled=false，fine snapshot reasoning.mode supported。两闸同路径，A 先抛。

compiler 不放大（正确）：compiler 只做 projection issues + 快照字段复查（deepSeekInitialPreparedRequestCompilerV2.ts:133-144），无独立能力表。

canSend 无能力预检：appChatApp.logic.ts:694-702 只查 running/draft/文件检测/sendPlan，能力失败只能在 IPC 返回后展示。

4. models.dev analysis（联网核验结果）

4.1 官方仓库与身份

当前官方仓库确认为 anomalyco/models.dev（GitHub 页、README、commit/PR 均可解析）：https://github.com/anomalyco/models.dev 。旧 sst/models.dev 只残留在第三方索引；未发现 opencode-ai/models.dev。默认分支未核验（dev 分支存在，含 sync.md）；许可证未核验。

结构：providers/<provider-id>/models/<model>.toml（实文件例：providers/opencode/models/mimo-v2-flash-free.toml；仓库甚至含 opencode 自身的 provider 条目）。

4.2 源数据 schema（TOML）

provider 定义：per-provider id/name/api + models 列表（第三方消费结构 ModelsDevProviderModel、MdModel 佐证）。

model 字段：能力集含 reasoning、tool_call（布尔或对象，对象形态支持细粒度，commit a5360d4）、structured_output、attachment、input/output modalities、context/output limits、cost 块、interleaved（交错推理，真实字段，docs.rs ModelsDevInterleaved + OpenCode PR #24172）、release date/aliases（"feat(models): add model metadata (#1974)"）。

重要核验结果：未发现字面 reasoning_options 字段。low/medium/high 词汇出现在消费者侧（OpenCode 的 reasoning effort 体系），不在 models.dev 数据中。任务假设的 "models.dev 提供 reasoning_options" 需要修正：models.dev 提供的是 reasoning 布尔（可能带细粒度对象），effort 值域不在 models.dev schema 内。

base_model：provider-specific 条目引用共享 base model，由 sync/merge pipeline 解析（"fix(sync): preserve base model output" 909db75）。确切 merge 语义（继承什么、覆盖什么）未从主源逐字核验（DeepWiki 二级资料：Data Management、Adding a New Model）。

4.3 发布物

网站 https://models.dev 在线（providers/、models 页含 #providers 列表）。

确认的 API：

https://models.dev/api.json

（由 OpenCode 构建环境变量 MODELS_DEV_API_JSON/OPENCODE_MODELS_URL 反证）。openai.json/llms.txt 未找到存在证据。

npm/SDK：@opencode-ai/models 存在但状态存疑；DeepWiki 有 "TypeScript SDK" 页（二级）。NixOS 有 models-dev 打包（nixpkgs PR #425045）。

发布物中未核验到 revision/date/hash 类 provenance 字段——这是接入 provenance 的已知缺口。

build/deploy：sync 脚本 + CI workflow；repo→API 时差风险存在（消费者侧有陈旧证据，见 §4.5）。

4.4 OpenCode 消费方式（三个层次必须分清）

models.dev 上游数据 → TOML（§4.2）。

models.dev 发布数据 → api.json 构建产物（§4.3）。

OpenCode runtime 行为：

构建期打包：build.ts 在构建时 fetch 并内嵌 JSON（issue #10429、#9608；MODELS_DEV_API_JSON、OPENCODE_MODELS_URL（commit f1caf84）；nixpkgs 用打包数据替代）。

运行期刷新：ModelsDev Service 运行期刷新（PR #25434 "effectify ModelsDev as Service"；experimental.skip_models_fetch 可关（PR #4985 / issue #4959）；"completions trigger models.dev fetch"（#13994）说明运行期 fetch 甚至被补全触发）。

能力驱动：models.dev 喂 model.capabilities.reasoning，用于门控 thinking/reasoning 选项（issue #34282）；TUI variant switcher 展示 reasoning effort 值（issue #34278：GLM-5.2 显示 max 而非 xhigh 的 bug）；OpenCode 自行生成 thinking variants（PR #34333、#8753）；interleaved 处理（PR #24172）；自定义 provider 可用 use_models_dev 继承元数据（PR #12779 / issue #9311）。

merge 优先级未文档化：models.dev 与 live /models 冲突时谁赢，检索不到确切规则。

4.5 新鲜度/冲突证据（OpenCode 侧真实发生过）

"Google models list outdated in TUI - missing Gemini 3 models"（#6743）

"thinking/reasoning options not gated by model.capabilities.reasoning"（#34282）——OpenCode 自身存在与 Starverse 同类的"双轨能力判断"问题

"GLM-5.2 … shows max (invalid reasoning_effort) instead of xhigh"（#34278）——effort 值域错误直接导致无效请求

"Failed to fetch models.dev"（#10766）、"MODELS_DEV_API_JSON ineffective"（#9758）、"Claude Sonnet 4.5 not thinking by default"（#3284）

4.6 消费方式评估（对 Starverse）

方式	安全性	可重复性	离线	provenance	freshness	更新复杂度

direct HTTP API（运行期）	中（供应链/中间人；需固定 HTTPS+hash）	低	无	低	高	低

JSON snapshot（启动/后台刷新）	中高（校验 hash）	中	好（last-known-good）	中（可存 revision/hash）	中	中

bundled snapshot（构建期 vendoring，OpenCode 模式）	高（随发布审查）	高	最好	高（随 release 固定）	低（发布间陈旧）	低（构建脚本）

SDK/package	中（第三方包更新即行为漂移）	低	中	低	中	中

build-time vendoring + startup refresh + last-known-good	高	高	好	高	中高	中

推荐：bundled snapshot（随 Starverse 发布、经 review）+ 启动/后台刷新（ETag/hash、TTL 预设、失败保留 last-known-good）+ 独立 evidence revision。 单一运行期直连不可接受（离线、TOCTOU、供应链）。

5. Target architecture（目标数据流）

5.1 原则

TP4 的 evidence 优先级（tp4-capability-evidence-ui.md:20-30）保持为骨架，加入 models.dev 后：

复制

contract codec invariant  >  provider 明确事实(present)  >  reviewed contract/rule(Starverse review)

  >  models.dev(可信非权威第三方)  >  live probe  >  user narrowing override

四类输入（live provider data / models.dev / reviewed rules / protocol-wire contract）全部只作为 resolution 输入。唯一最终结论 = 同一个 resolved capability revision（即现有 runtime_capability_snapshot_v2 revision 扩展为包含 models.dev evidence 后的 revision）。

5.2 数据流图

text

复制

 provider /models ──────────────► observation（provider_pure，present|missing|invalid）

 models.dev snapshot（bundled+刷新）► ModelsDevProviderRecord（providerKey+nativeModelId；revision/hash）

 reviewed contract registry ────► ReviewedContractRecord（现状已有）

 reviewed capability rules ─────► RuleSet（新增，§7）

 wire implementation registry ──► WireImplementationRecord（现状已有：registry.wireImplementation）

                                              │

                                              ▼

                         UnifiedCapabilityResolver（唯一 resolution）

                    ┌───────────────┴────────────────┐

                    ▼                                ▼

        coarse catalog capability（投影）      runtime capability snapshot（合法性）

        picker badge / catalog 展示            UI controls / preflight / compiler

              （不得独立授权发送）              （persisted + revision + evidence）

                    └───────────────┬────────────────┘

                                    ▼

                        GenerationControlsProjection（TP4 :132-147）

具体到现有代码的落点：

证据层：RuntimeCapabilityEvidenceKindV2 增加 'third_party_metadata'（或 'models_dev'）kind（runtimeCapabilitySnapshotV2.ts:167-173、EVIDENCE_KINDS :296-299）；DeepSeek snapshot 的 buildRuntimeEvidence（deepSeekStableGenerationAuthorityV2Service.ts:336-362）增加 models.dev 证据条目（evidenceId=models.dev:<provider>:<model>:<snapshotHash>，sourceRef=快照来源，contentDigest=快照哈希）。

coarse 层：ProviderCatalogAuthorityEntryV2.missingFactSupplements（providerCatalogAuthorityRegistryV2.ts:39,66）演进为结构化 capabilityInputs：{ providerFact, contractSupplement, modelsDevSupplement, reviewedRules[] }，resolveModelCapabilityV2（modelCapabilityResolverV2.ts:19-41）按 §6 优先级合并。或者更彻底：coarse resolutions 直接由 fine snapshot 字段投影（reasoning.enabled ⇔ reasoning.mode domain 含 enabled ∧ wireImplemented）——两者必须同源，这是"single resolution"的机器可验证形式。

存储层：CatalogRawBucket.source 增加 'models_dev'（internalSchema.ts:43-49）；models.dev 记录作为第二个 bucket 持久化在现有 raw.buckets 中（schema 注释已为此设计）。

identity：models.dev 记录 key = providerKey + nativeModelId；OpenRouter 形态（author/slug）走 provider 归一化；永远不做跨 provider 的 base-model 能力合并；只消费 models.dev 自身 merge 后的 provider-specific resolved record（或按 models.dev 语义复算），禁止 Starverse 跨 provider 二次合并。

新文件（建议）：modelsDevClient.ts（fetch+hash+parse）、modelsDevSnapshotStore.ts（bundled+refresh+last-known-good）、reviewedCapabilityRulesV2.ts（§7）、resolveUnifiedCapabilityV2.ts（替换/包装现有两个 resolver 的公共核心）。

5.3 为什么不放进 observation 层

CatalogProviderModelObservationV2.provenance.sourceKind 是封闭的 'provider_api'（providerModelObservationV2.ts:27-32），且 preflight 的 observationFromCatalogItem（activeCatalogModelAuthorityV2Service.ts:119-134）按 shape 严格解码。把 models.dev 伪装成 provider 事实会破坏 provenance 并污染 provider_reported 语义（resolutionSource:'provider_reported'，modelCapabilityResolverV2.ts:42-46）。models.dev 必须携带自己的 source 与 revision。

6. Evidence precedence & conflict matrix

统一优先级（强→弱）：

复制

1. contract_invariant（codec/wire 约束）         —— 不可被任何数据覆盖

2. provider 明确事实（presence='present'）      —— 该 endpoint 的权威事实

3. reviewed contract / reviewed rule（Starverse 审查过的官方契约与规则）

4. models.dev provider-specific 记录（可信非权威）

5. live probe（现状 DeepSeek 的 visibility 证据）

6. user narrowing override（只能收窄）

冲突一律保守：更强的 unsupported 胜出；missing 表示无陈述（可被 3/4 补充）；unknown（invalid/矛盾）不可被补充也不可授权。

场景	处理	依据/理由

A. live /models 有、models.dev 无	模型照常进入 active catalog（existence=provider 事实）；能力显示 unknown；合法性=unavailable（除非 3 补充）。models.dev 缺失≠负面事实，不影响存在性	§2.1 #1/#3；TP4 missing evidence means unavailable

B. models.dev 有、live /models 无	区分"世界上存在"（models.dev 可证）/"endpoint 暴露"（只有 live /models 可证）/"credential 可用"（live+scope 可证）。models.dev 无资格加入 active catalog；可作为"上游发现"建议用户手动添加（DeepSeek 已有 manual_user_model_id source）	deepSeekModelSource.ts:36-40

C. provider 某能力字段缺失	严格三态：missing（无陈述→可补充）、unknown（invalid/矛盾→不可授权）、unsupported（显式 false/显式拒绝）。models.dev 只在 missing 时补充；invalid 不触发补充（现状 modelCapabilityResolverV2.ts:24 已如此）	providerModelObservationV2.ts:11-17

D. provider 显式 false vs models.dev true	provider 胜。已有测试锁定："keeps an explicit provider false authoritative over reviewed supplements"（modelCapabilityResolverV2.test.ts:30-36）；models.dev 优先级更低，同理	现状语义 + §5.1 优先级

E. provider 给 domain、models.dev 给不同 domain	provider domain 优先；models.dev 越界值丢弃（交集）；无交集→该值 unavailable。对 effort：provider live 通常无 domain，实际由 3 的 reviewed rule 定域，models.dev 只做参考	§5.1 优先级

F. reviewed rule vs models.dev	reviewed rule 胜（双向：rule 可 add 也可 remove/narrow）	Starverse 自审 ≥ 第三方

G. models.dev 宣称支持但 codec 未实现	UI 不可选、preflight 拒绝、catalog 可显示"上游声称支持，Starverse 未实现"（metadata-only）。由 enabled = supported && wireImplemented 门保证（modelCapabilityResolverV2.ts:41）	现状 wireImplementation 机制

H. compiler 能编码但 resolution 未授权	compiler 无放行权。现状已正确：disposition 字段 state 非 supported/requires_confirmation 即 GENERATION_V2_DEEPSEEK_COMPILER_CAPABILITY_MISMATCH（deepSeekInitialPreparedRequestCompilerV2.ts:139-144）。维持该不变量	§十四 H；不变量 No compiler widening

I. models.dev provider-specific 比 base model 窄	以 provider-specific resolved 记录为准（models.dev 自己 merge 后的结果），不跨 provider 复用 base model	§十二；Provider isolation

J. 同 base model 不同 provider 能力不同	各自独立 resolution；capability identity=(credentialScopeId, providerId, endpointProfileId, protocolContractId, modelId, operation)（providerBindingV2.ts:35-46）	§十二

7. Reviewed rules design（Starverse reviewed capability rules）

7.1 为什么需要

当前"reviewed 层"只有两种形态：provider 级 family policy（DeepSeek stableCapabilityPolicyV2）与 boolean-only missingFactSupplements。没有模型级、可追踪、声明式、能 add/remove/narrow 的规则层。Anthropic 已有雏形（modelThinkingRulesV1.ts，tp7:47 提到的 exact-ID thinking matrix），但未通用化。

7.2 推荐 schema（声明式，无执行脚本）

ts

复制

type ReviewedCapabilityRuleV2 = Readonly<{

  ruleId: string                       // 'starverse.deepseek.v4-pro.effort.remove-low.2026-07-18'

  revision: string                     // 规则集 revision，进入 evidence digest

  reviewedAt: string

  scope: Readonly<{

    providerId: string                 // 必填

    modelIds?: readonly string[]       // 空 = provider 级（family rule）

    endpointProfileId?: string         // 默认取 provider 当前 profile

    protocolContractId?: string        // 默认取 provider 当前 contract

    operation?: 'text' | 'tool_continue' | ...   // 可空 = 全 operation

  }>

  capabilityPath: string               // 语义路径：'reasoning.mode' | 'reasoning.effort' | 'tools.mode' | 'generation.temperature' | ...

  op: 'add' | 'remove' | 'set' | 'disable' | 'narrow'

  // add:     在 domain 中增加值（必须 wire 已实现）

  // remove:  从 domain 中删除值

  // set:     整体替换 domain（必须 ⊆ wire 实现域）

  // disable: capability 强制 unsupported（即使 provider/models.dev 说支持）

  // narrow:  收窄 range/enum/constraint

  value?: RuntimeCapabilityScalarV2 | RuntimeCapabilityDomainV2

  reason: string                       // 一句话理由

  evidenceRefs: readonly string[]      // official doc URL / 本地 evidence artifact id

  sourceKind: 'official_docs' | 'contract_smoke' | 'owner_policy' | 'models_dev_correction'

}>

7.3 应用语义与安全边界

规则应用是纯函数：applyRules(baseDomain, rules) → resolvedDomain，在 UnifiedCapabilityResolver 内执行一次；结果同时进 coarse 投影与 fine snapshot 字段。

安全边界：add/set 的目标值必须 ⊆ wireImplementation 已实现域（现状 wireImplementation 是 boolean 五键，需扩展为按语义路径的 domain 能力表，如 reasoning.effort ⊆ {high,max}）。不满足则规则只产生 metadata，不打开 UI/preflight。

规则集带整体 revision（hash），作为 evidence 条目进入 snapshot（contract_invariant 或新 kind），因此改一条规则 → snapshot digest 变 → UI capability revision 自动失效（现有 revision 机制）。

remove low 例子（任务 §十一 假设场景）落点：reasoning.effort domain 由 family policy 初始 {low,medium,high,xhigh,max} → 规则 remove low → resolved domain {medium,high,xhigh,max}（若 native 只有 high/max，则 UI 只显示 high/max，medium/xhigh 仅在 wire 兼容层可被接受并 canonicalize，见 §10）。

规则不是 UI 特判：ChatAppComposer.vue:373、appChatApp.logic.ts:3496-3498 等静态特判删除后，UI 从 projection 读取同一 resolved domain。

8. DeepSeek worked example（完整走一遍）

8.1 三源核验（联网 + 本地）

事实	DeepSeek live /models	models.dev	Starverse reviewed

模型存在	deepseek-v4-pro、deepseek-v4-flash 等（/models 返回 id/object/owned_by）	收录（需核验具体条目）	无 per-model 存在性审查（存在性=provider 事实）

reasoning 支持	无字段（parser 全 missing，deepSeekModelSource.ts:253-259）	reasoning: true（预期）	已审查：thinking.type enabled/disabled（stableCapabilityPolicyV2.ts:222-225；官方 Thinking Mode）

effort 值域	无	无 reasoning_options 字段（§4.2 核验）	已审查：native reasoning_effort ∈ {high, max}；compat 映射 low/medium→high、xhigh→max、minimal 拒绝（deepseek-stable-api-contract-20260715.json:55-64；chatRequestV1.ts:36,120-135；vllm DSV4 max）

thinking+sampling	无	无	已审查：thinking 时 temperature/top_p 无效果，显式设置拒绝（stableCapabilityPolicyV2.ts:178-187；Thinking Mode）

thinking+tool	无	无	已审查：函数工具可用，thinking 时 tool_choice 只能 omitted（stableCapabilityPolicyV2.ts:235-255；DEEPSEEK_THINKING_EXPLICIT_TOOL_CHOICE_UNVERIFIED）

延续	无	无	已审查：tool subturn 必须完整回放 reasoning_content（deepseek-stable-api-contract-20260715.json:40-44；n8n PR #34924、laravel/ai #533 佐证）

模型身份：DeepSeek 官方 V4 模型线已确认存在（V4-Pro GA 新闻；第三方对比 benchlm）。

8.2 结论：对 DeepSeek 而言 models.dev 不是必需项

DeepSeek 的推理能力已由 reviewed contract 完整覆盖（三份 evidence artifact + family policy）。models.dev 在此案例中的价值仅剩：未知/新增模型的初步提示（例如提示 Starverse 尚未审查的 deepseek-v4-flash 某变体）。models.dev 的数据质量（无 effort 值域字段）也决定了它无法为 DeepSeek 的 effort 提供增量。

8.3 目标链路（修复后，以 effort=high 为例）

reviewed supplement（修复 bug 的关键）：ProviderCatalogAuthorityRegistryV2 的 DeepSeek entry 依据已审查契约补充 reasoning=true、tools=true、structuredOutputs=true（codec 已实现 response_format: json_object，chatRequestV1.ts:41,161-163）、vision=false（与 wireImplementation 一致）→ coarse resolveModelCapabilitiesV2 得 reasoning.enabled=true（resolutionSource:'reviewed_contract_supplement'）→ assertActiveCatalogOptionalCapabilitiesV2 通过。

models.dev 证据（可选叠加）：若接入，DeepSeek 记录作为 third_party_metadata evidence 进入 snapshot；因优先级低于 reviewed，不改变结论，只增 provenance。

UI：composer 选项 = projection 出的 resolved reasoning.effort domain ∩ native wire 域 = {high,max}（与现状静态列表数值一致，但来源改为 resolution）；console 静态 ['low','medium','high'] 删除；deepSeekReasoningPolicy.ts 的 UI 消费删除（常量可留作 wire 域定义，迁到 codec）。

preflight：A 闸通过（supplement）；B 闸 validateIntentSubset：reasoning.effort=high ∈ {low,medium,high,xhigh,max} 通过、constraint reasoning.mode=enabled 满足；temperature 显式设置时 DEEPSEEK_THINKING_EXPLICIT_SAMPLING_UNSUPPORTED（现状已正确）。

runtime snapshot：字段 reasoning.mode supported、reasoning.effort supported(domain, mapping)、constraint 记录；evidence 含 official_documentation（DeepSeek docs）+ contract_invariant（owner policy）+ live_probe（models digest）+（接入后）third_party_metadata（models.dev）。revision=capability-v2:hash(...) 随任意 evidence 变化而变。

compiler：projectDeepSeekStableIntentV1 无 issues；disposition 字段 state supported；reasoning.effort=high → reasoning_effort:'high'（映射表 chatIntentProjectionV1.ts:183-184）；序列化 thinking:{type:'enabled'}, reasoning_effort:'high'（chatRequestV1.ts:287-288）。

provider request：POST https://api.deepseek.com/chat/completions，body 含 thinking.type=enabled、reasoning_effort=high（stable origin，无 /v1，stableEndpointProfileV2.ts:59-83）。

8.4 假设场景：models.dev 给 low/high/max，reviewed rule 决定 remove low

执行层：规则层（§7）在 UnifiedCapabilityResolver 内对 reasoning.effort domain 做 remove low。

同步影响：catalog 展示（能力值域标签）、UI 选择器（选项无 low）、preflight（domain 校验拒绝 low）、runtime snapshot（domain 无 low，digest 变）、compiler legality（low 不在域 → disposition rejected）。

若 provider wire 仍兼容接受 low（DeepSeek 文档映射 low→high）：这属于wire compatibility 层——semantic intent 层不暴露 low 为可选值，但若外部/旧意图携带 low，projection 可 canonicalize 为 high（chatIntentProjectionV1.ts:183-184 现状正是如此）。不允许 UI 把 low 显示为独立档位（§10）。

9. Migration plan（最小可行迁移）

第一阶段：修复当前漂移（不引入 models.dev）

补 DeepSeek coarse supplement：providerCatalogAuthorityRegistryV2.ts:66,104-108 依据已审查契约补充 reasoning/tools/structuredOutputs（vision=false），使 coarse 与 fine 结论一致（修复 bug 的最小改动；注意 missingFactSupplements 是纯函数输入，无副作用）。

删除 UI 静态能力特判：ChatAppComposer.vue:373 的 DeepSeek 分支、ChatSessionConsole.vue:2271 静态列表、appChatApp.logic.ts:3484-3498,6117-6121 的 effort clamp/校验、generationV2SessionConfigProjection.ts:45-50 特判；选项改由 catalog/resolution 投影（先 coarse enabled + 策略 domain 的简单投影，作为过渡）。

统一 preflight 门：assertActiveCatalogOptionalCapabilitiesV2 改为消费 unified resolution（或对 missing→supplement 后的结果断言）；保留 validateIntentSubset 作为值域门。

删除 legacy 模型名正则（deepseekGenerationProfile.ts:61-72 及 tp7:145 要求的 boolean mapper 清理范围内）。

验收：DeepSeek reasoning=high 可发送；UI 两处选项一致；modelCapabilityResolverV2.test.ts 新增 DeepSeek supplement 用例。

第二阶段：单一 evidence graph

实现 resolveUnifiedCapabilityV2：coarse resolutions 改为 fine snapshot 字段的投影（或共享同一 resolution 函数），两个表示同 revision；RuntimeCapabilityEvidenceKindV2 预留扩展点。

快照 revision 成为 UI/preflight/compiler 唯一依据；实现 TP4 的 STALE_CAPABILITY_REVISION 命令级拒绝（当前缺失，tp4-capability-evidence-ui.md:145）。

迁移 OpenRouter 的 supportedParameters 路径（openRouterChatGenerationAuthorityV2Service.ts:340-348）到统一 resolution，避免 OpenRouter 成为"第四个特例"。

第三阶段：models.dev 接入

构建期 vendoring：models.dev/api.json 随发布固定 + 哈希（发布物无自带 revision 字段，Starverse 自记 capturedAt + sha256）。

models_dev bucket 进 catalog 存储（internalSchema.ts:43-49 扩展 source）；启动/后台刷新（TTL 预设，复用 catalogPolicyV2.ts 模式与 TP4 的 refreshAfterMs/hardExpireAfterMs 约定）；失败保留 last-known-good；malformed 拒绝替换。

models.dev 记录 → third_party_metadata evidence → UnifiedCapabilityResolver（§6 优先级）→ coarse 投影 + snapshot 字段。

规则层（§7）落地，迁移现有 family policy 为规则集的一部分；Anthropic modelThinkingRulesV1.ts 对齐。

保留：wire semantics（chatRequestV1、chatIntentProjectionV1 映射、stableEndpointProfileV2、toolChoice matrix）；删除：全部 UI/provider 静态能力事实（§3.3 列表）；必须迁移：DeepSeek supplement、OpenRouter supportedParameters、Anthropic thinking matrix、UI effort 选项。

10. 能力 vs wire compatibility alias

DeepSeek 事实：native 值域 {high, max}（wire 类型 chatRequestV1.ts:36；codec decode :125）；low/medium→high、xhigh→max 是文档化的兼容别名（deepseek-stable-api-contract-20260715.json:59-64）；minimal 拒绝。

判定：

UI 不暴露 alias 为独立档位（现状静态 ['high','max'] 数值正确，错在来源与绑定）；alias 只存在于 wire compatibility 层。

semantic intent 是否 canonicalize：是——intent 层接受 alias（低优先级兼容输入），projection 立即 canonicalize（chatIntentProjectionV1.ts:183-184），snapshot 之后只见 canonical 值。

persisted capability snapshot 记录 canonical value + mapping provenance（evidence 引用官方映射文档），不记录原始 alias。

不变量："UI 宣称独立档位、compiler 偷偷映射"绝对禁止——UI 选项 = resolved domain ∩ native 域。

通用规则：alias 映射表必须来自 reviewed contract（官方文档），models.dev 无此数据（§4.2）；任何 provider 新增 alias 需走 §7 规则层登记。

11. 测试策略（现状复用 + 新增）

11.1 可复用（现状已存在）

coarse resolver 三用例：modelCapabilityResolverV2.test.ts:30-54（provider false 优先、missing→supplement、wire 未实现门）

snapshot codec：runtimeCapabilitySnapshotV2.test.ts（完整性、evidence 必需、封闭 domain、digest 篡改 :402、未知路径拒绝 :165）

DeepSeek 策略/投影/请求：stableCapabilityPolicyV2.test.ts、chatIntentProjectionV1.test.ts、chatRequestV1.test.ts、nativeMessagesV1.test.ts

active catalog 权威：activeCatalogModelAuthorityV2Service.test.ts:14-52（目前只覆盖 happy path——缺口：无 reasoning 断言用例）

catalog runtime store revision：catalogRuntimeStoreV2.test.ts

UI：ChatAppComposer.modelPicker.test.ts、ChatSessionConsole.deepSeek.test.ts、generationV2SessionConfigProjection.test.ts

11.2 新增矩阵（任务 §十五 全表映射）

场景	测试落点

provider-present + models.dev-missing	resolver 单测：present 事实不被 models.dev 缺失影响

provider-missing + models.dev-present	resolver 单测：missing→models.dev supplement（优先级低于 contract supplement）

provider fact missing + models.dev supported	同上 + preflight 断言通过（当 wire 实现时）

provider explicit unsupported + models.dev supported	provider false 胜（现有用例扩展）

provider domain conflict + models.dev domain	交集/丢弃单测

reviewed rule conflict with models.dev	rule 胜；双向（add/remove）

models.dev supported + wire unimplemented	enabled=false；UI 不可选；catalog 显示 upstream-claims-only

reviewed rule remove/add/disable/narrow value	规则应用纯函数单测 + 端到端一致性（见下）

models.dev snapshot stale / malformed / unavailable	store 单测：last-known-good 保留、malformed 拒绝替换、outage 不影响 provider catalog

models.dev revision change	evidence digest 变 → snapshot revision 变 → UI revision 失效 + 命令 stale 拒绝

source repo vs deployed API mismatch	记录 capturedAt/hash；文档化滞后窗口；无自动假设

stale UI capability revision	STALE_CAPABILITY_REVISION 命令拒绝（第二阶段实现）

cross-provider same-model isolation	同一 base model 两 provider 各自 resolution；identity 单测

DeepSeek reasoning disabled / high / max / aliases / unknown model	端到端 fixture 矩阵（复用 deepSeekStableGenerationAuthorityV2Service.test 类）

newly appeared provider model absent from models.dev	存在性不受影响；能力 unknown

models.dev has model but active catalog does not	不得加入 active catalog

provider capability change while UI open	assertCurrent/stale 机制测试

11.3 机器验证"只有一个最终 capability resolution"

核心 contract/invariant 测试（不分别改 UI/preflight/compiler fixtures）：

构造一个 UnifiedCapabilityFixture（provider observation + models.dev record + rule set + wire registry），断言四件事在同一输入下同步变化：

catalog 展示（coarse 投影输出）；

UI projection（选项/domain）；

preflight 判定（accept/reject 码）；

compiler 编码路径（disposition/ledger）。 用 it.each 跑全矩阵（如 models.dev 加 low → UI 出现 low ⇔ preflight 接受 low ⇔ compiler 有编码路径；rule remove low → 三处同时消失）。

架构 guard 测试：禁止 src/ui-app 出现 provider 能力字面量（deepseek 分支、['high','max'] 类常量）——沿用现有 import boundary guard 模式（rendererImportBoundary.test.ts）。"改变唯一 resolved capability 输入"类测试：只改 fixture 中的 models.dev 记录，快照 digest 变化断言 + 三消费者输出一致变化。

12. 风险 / open questions

已有代码证明（确定）：

DeepSeek bug 根因链（§3.1）全部 file:line 已核验。

存在三重能力事实源；coarse 与 fine 两闸同路径。

reasoning_options 字面字段在 models.dev 无证据（子代理 C 核验）。

compiler 无放大权（现状正确）。

provider 官方证据（已核验）：

DeepSeek Thinking Mode / Chat Completions 官方 URL；V4 模型线存在；DSV4 max effort（vllm PR）；reasoning_content 回放要求（n8n、laravel/ai）。

待核验：官方文档中 reasoning_effort 的确切枚举与 alias 表述（子代理 D 仍在运行；Starverse frozen contract 2026-07-15 已记录 high/max + 映射，需与最新文档复核，尤其 minimal 是否仍拒绝）。

models.dev 数据（部分核验）：

仓库/结构/api.json 已核验；schema 字段名部分来自 DeepWiki（二级）与第三方消费结构（docs.rs）；base_model merge 语义、发布物 revision 字段、OpenCode 与 live /models 的 merge 优先级未核验。

DeepSeek 在 models.dev 中的具体条目（reasoning/tool_call 值）未核验——接入前必须抽查。

推断（需 Owner 确认）：

补 DeepSeek coarse supplement（reasoning/tools/structuredOutputs=true）的依据是已审查契约与 codec 实现；其中 structuredOutputs（json_object）未在 owner policy 中显式列出（deepseek-stable-owner-capability-policy-v2-20260717.json 的 rejectedExplicitPaths 未含 responseFormat，但 stableCapabilityPolicyV2.ts:209 标 providerExtension.responseFormat 为 unsupported——存在内部不一致，需裁决：codec 支持 response_format: json_object（chatRequestV1.ts:161-163）而语义扩展层拒绝 responseFormat）。

UI 静态列表数值（high/max）与 wire 域一致，属"碰巧正确"；迁移后行为不变。

仍需 Owner 决策：见下章。

13. 建议冻结的架构决策

建议冻结的架构决策

models.dev trust level：trusted, non-authoritative 第三方证据源；优先级固定为 provider 明确事实 > reviewed contract/rule > models.dev > live probe；models.dev 永远不能创建 existence/availability，不能覆盖 provider present 事实，不能覆盖 reviewed 结论。

model existence authority：唯一 authority = 当前 credential scope 的 live /models（active catalog）。models.dev 无资格加入 active catalog（"世界上存在"≠"endpoint 暴露"≠"credential 可用"）。

单一 resolution 不变量：UI、preflight、compiler、catalog 展示共享同一个 resolved capability revision（扩展后的 runtime capability snapshot revision）；coarse catalog capability 只能是同一 resolution 的投影，不得独立授权发送。机器验证方式 = §11.3 contract 测试。

compiler 边界：compiler 拥有 wire encoding knowledge，但不得拥有独立的能力/值域业务事实表；disposition 必须对照快照字段复查（现状已正确，冻结为不变量）。

reviewed rule 权限：规则层（§7）可以 add/remove/set/disable/narrow；add/set 目标必须 ⊆ wire 已实现域；规则必须有 evidenceRefs + reviewedAt + revision；规则不是 UI 特判。

compatibility alias 策略：alias 只存在于 wire compatibility 层；UI 只暴露 native 域（resolved domain ∩ native 域）；intent 层可接受 alias 并 canonicalize；snapshot 记录 canonical 值；禁止"UI 显示独立档位、compiler 偷偷映射"。

缺失语义：missing ≠ unsupported；missing 可被 reviewed/models.dev 补充，unknown/invalid 不可授权；unavailable 是合法性默认值。

capability identity scope：(credentialScopeId, providerId, endpointProfileId, protocolContractId, modelId, operation)；禁止跨 provider 合并 base-model 能力；models.dev 只消费其 provider-specific resolved 记录。

cache/update policy：bundled snapshot（随发布）+ 启动/后台刷新（ETag/hash；TTL 预设沿用 catalog 设置约定）；失败/损坏保留 last-known-good；models.dev 故障不得影响 provider catalog；models.dev 刷新形成独立 evidence revision，进入统一 capability resolution revision，不直接 bump provider catalog snapshot revision。

stale revision policy：命令提交时冻结 capability revision（现状已实现）；实现 TP4 的 STALE_CAPABILITY_REVISION 命令级拒绝；任何 evidence（含 models.dev）变更 → revision 变 → 旧命令拒绝、UI 刷新。

models.dev 数据缺口：发布物无 revision/hash 字段时，Starverse 自记 capturedAt + sha256 作为 provenance；对 reasoning_options 缺失的事实，不假设 models.dev 提供 effort 值域。

DeepSeek 修复顺序：先做第一阶段（§9）修复漂移（这是 bug 的根治），models.dev 接入作为第三阶段，不得以"接入 models.dev"替代漂移修复。

附录：关键外部来源

models.dev 仓库：github.com/anomalyco/models.dev（结构、TOML、sync/merge commits）；DeepWiki 二级资料：Model Schema、Model Capabilities、Manual Model Configuration

models.dev API：models.dev/api.json（经 OpenCode 构建引用确认）；OpenCode 仓库 anomalyco/opencode：构建期打包 #10429、#9608、OPENCODE_MODELS_URL commit f1caf84；运行期刷新 PR #25434、skip_models_fetch #4959；能力门控与双轨问题 #34282、#34278、#6743

DeepSeek 官方：Thinking Mode、Create Chat Completion、V4-Pro GA 新闻；佐证：vllm DSV4 max PR #40982、n8n reasoning_content 回放 PR #34924、laravel/ai #533

Starverse 本地 evidence：docs/architecture/generation-compiler-v2/evidence/deepseek-stable-api-contract-20260715.json、deepseek-stable-owner-capability-policy-v2-20260717.json；tp4-capability-evidence-ui.md、tp7-provider-contracts.md

说明：外部研究子代理（models.dev/OpenCode 方向）已交付并核验；DeepSeek 官方文档详查子代理仍在运行，其结论未及纳入——本报告 DeepSeek 部分已用独立核验来源覆盖，若其报告到达后可补充"官方文档确切枚举/别名表述"的逐字引用。工作区零修改，基线 4391ee66 未变。

## DeepSeek 官方 API 核验增补

DeepSeek 官方文档详查子代理已交付，其核验结果与报告 §8 的 worked example 高度吻合，并补上了几处此前标注"待核验"的事实。以下为报告增补（不改动原报告结论，仅按新证据修订细节）：

增补：DeepSeek 官方 API 核验结果（子代理 e7f3551e 交付）

A. 确认了报告 §8.1 的关键事实（来源：官方 adapter deepseek-ai/deepseek-harness + 官方 docs + 生态佐证）

事实	核验结果

官方模型 ID	deepseek-v4-pro、deepseek-v4-flash 确认；另有 2026-08-13 GA 快照 deepseek-v4-pro-0813（官方 V4-Pro GA 新闻）；遗留 ID deepseek-chat/deepseek-reasoner 已于 2026-07-24 退役

reasoning 开关	由 **`thinking: {type: 'enabled'

reasoning_effort 原生枚举	high 与 max（默认 high）；不支持的值报 UNSUPPORTED_REASONING_EFFORT。不是 OpenAI 五档（min/low/medium/high/max）

兼容别名	low→high、medium→high、xhigh→max；minimal 不支持 —— 与 Starverse frozen contract（deepseek-stable-api-contract-20260715.json:55-64）逐项一致

reasoning_content	真实字段，流式支持（交错 reasoning）；多轮硬性要求：官方错误信息原文 "The reasoning_content in the thinking mode must be passed back to the API"（opencode #24901）；官方 adapter 的细化规则：只在带 tool_calls 的 assistant 轮次回放 reasoning_content，无工具轮次可丢弃（省 token）

thinking + tool_choice	V4 拒绝 tool_choice:"required"/指定函数（deepseek-ai/DeepSeek-V3#1376）—— 印证 Starverse 的 DEEPSEEK_THINKING_EXPLICIT_TOOL_CHOICE_UNVERIFIED 策略

thinking 时采样参数	temperature/top_p/frequency_penalty/presence_penalty 无效果/拒绝；penalties 整体弃用 —— 印证 stableCapabilityPolicyV2.ts:178-187 与 compiler 拒绝

context 限制	两模型 1,000,000 token（官方 V4 Preview 新闻）；V4 Pro GA 报 384K 输出（第三方，官方未逐字核验）；Flash 最大输出未核验

兼容端点	OpenAI 兼容

https://api.deepseek.com

 确认；另有 Anthropic 兼容端点（双协议），确切 base URL 未核验

B. 对报告结论的修订/强化

§8.2 结论不变且更强：DeepSeek 的 effort 值域（native {high,max} + alias 映射）已被官方 adapter 与生态多重确认，models.dev 在该案例中确实无增量价值（它连 reasoning_options 字段都没有）。接入 models.dev 不是修复 DeepSeek bug 的前提——修复路径仍是 §9 第一阶段（coarse supplement 对齐 reviewed contract）。

identity 新事实：deepseek-v4-pro-0813（GA 快照）与 DEEPSEEK_ALIAS_DEPRECATION_AT_ISO='2026-07-24T15:59:00.000Z'（deepSeekModelSource.ts:34）互为印证——Starverse 已正确建模"版本快照 ID"与"别名退役"；这正好对应任务 §十二 的"aliases/version IDs"问题：models.dev 若引入类似条目，必须按 providerKey + nativeModelId 严格区分 deepseek-v4-pro 与 deepseek-v4-pro-0813，不得合并能力。

延续语义细化：官方规则是"只在带 tool_calls 的轮次回放 reasoning_content"；Starverse 的 client_managed_native_replay（deepseek-stable-owner-capability-policy-v2-20260717.json:69-76）回放完整有序原生消息，是保守超集，不违反官方要求；若未来要"省 token"，应作为 reviewed rule 显式登记，不能由 compiler 自行裁剪。

§11 风险表更新：reasoning_effort 确切枚举与 alias 表述 — 已核验（原"待核验"项消除）；/models 响应是否含能力元数据 — 仍未核验（本报告 §2 的观察"DeepSeek /models 无能力字段"来自 Starverse parser 与 frozen contract notes，与官方文档无矛盾，但官方未逐字证实）；Flash 最大输出 — 未核验。

C. 工作区状态

仍然零修改：git status 与基线一致（4 个既有修改 + 2 个既有未跟踪文件），HEAD 4391ee66 未变。

至此四个调查子代理全部交付（架构图、DeepSeek 链路、models.dev/OpenCode、DeepSeek 官方文档），报告 §1–§13 及"建议冻结的架构决策"维持原结论，本增补为最终核验闭环。

## 官方文档研究收尾增补

这是子代理 D（DeepSeek 官方文档研究）的完整版重发，与先前交付的摘要一致（我在增补中已纳入），内容完全一致。新增的少量细节：

这是子代理 D（DeepSeek 官方文档）报告的完整版重发，与先前交付的摘要一致，主要结论已全部纳入报告增补。完整版带来三处此前未收录的增量，均不影响已交付结论，在此补记（并入 §11 open questions）：

xhigh 映射存在生态分歧：openclaw 的 PR map DeepSeek V4 xhigh to xhigh, not max 主张保留 xhigh，而 Starverse frozen contract（2026-07-15）记录官方兼容映射为 xhigh→max，vllm 则需显式加 max 支持（PR #40982）。官方文档对 xhigh 的逐字表述未能核验（子代理 D 明确标注无法打开 docs 页面）。结论：xhigh→max 的映射目前只有 artifact 级证据，存在第三方不同解读——接入规则层（§7）前应由 Owner 复核官方文档一次，作为 reviewed rule 显式登记；在复核前维持现状（保守拒绝或按契约映射均可接受，但不得同时并存两种行为）。

DeepSeek 官方新增 Responses API（guides/responses_api、api/create-response；V4-Pro GA 同步支持）。这是 DeepSeek 的新协议面：Starverse 的 deepseek-stable-chat-v1 契约只绑定 chat completions。按 TP7 契约纪律（"beta 是独立契约、无自动切换/回退"），Responses surface 若接入必须走独立契约审查（新 codec/decoder/artifact），不能作为现有 stable chat 的延伸自动获得能力——models.dev 若对此类新 surface 提供元数据，同样只作证据输入。

deepseek-v4-flash-0731（第三方列出，官方 API ID 未确认）：与 deepseek-v4-pro-0813 同属"版本快照 ID"问题，强化报告 §B 的 identity 纪律——providerKey + nativeModelId 严格区分，不得合并能力。

工作区维持零修改，HEAD 4391ee66。四个子代理全部闭环（A/B 为本地代码考古、C 为 models.dev/OpenCode、D 为 DeepSeek 官方文档），最终结论以调查报告 §1–§13 与"建议冻结的架构决策"为准，本条补记已并入风险清单。
