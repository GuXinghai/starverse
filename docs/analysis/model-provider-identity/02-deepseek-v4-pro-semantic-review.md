# Model and Provider Identity Semantic Review — DeepSeek V4 Pro

- **Lifecycle Status**: historical
- **Document Role**: implementation-note
- **Last updated**: 2026-08-14
- **Authority**: Point-in-time analysis; not an SSOT. Current code and owner decisions take precedence.

---
审查完成。以下基于本地 checkout（commit adcc8eff，工作区干净）对全部证据的独立综合。
## ① 当前实际语义模型
五个真实不同的身份域（不是命名不一致，是领域不同）
域	类型/取值空间	权威定义	持久化（序列化历史名）
A. 会话路由/UI 选择	RuntimeProviderId（8 值：openrouter/openai_responses/google_ai_studio/anthropic_messages/deepseek/lm_studio/ollama_local/local_endpoint）+ modelId（catalog 原生串）	src/next/provider/runtimeProviderId.ts:1-9；conversationRouteSelection.ts:28-53（zod 严格）	conversation_route_preference_v2.selection_json（providerId/modelId，CAS revision）；generation_config_v2 语义层
B. Catalog	ProviderCatalogKnownProviderKey（5 值）+ CatalogModelId + 派生 modelKey = providerKey::modelId；nativeModelId 仅存在于 observation	providerCatalogContracts.ts:9-15；internalSchema.ts:86-123,220-222	model_catalog_v2（scope 含 providerKey；item 含 modelKey/modelId）；invariant：modelKey === providerKey::modelId（modelCatalogV2Repo.ts:119-141、catalogQueryService.ts:361,442-464）
C. Credential	ProviderCredentialKey（5 值：openrouter/openai_responses/google_ai_studio/anthropic/deepseek）；本地兼容实例用 providerInstanceId（ocp_provider_…）+ credentialVersionRef	electron/credentials/providerCredentialContract.ts:1-16；openAICompatibleCredentialV2Service.ts:21-26	providerCredentials.v1.<key>（electron-store）；epoch2 record v3
D. Generation V2 binding	provider_id identity：openrouter/openai_responses/google_ai_studio/anthropic/deepseek/generic_local/ollama/lmstudio/openai_compatible + model_id	providerContractRegistryV2.ts；providerBindingV2.ts:200；localEndpointProfileV2Repo.ts:14	generation_request_v2.provider_id/model_id（conversationReadV2Repo.ts:400 读出为 answer meta）
E. Wire / terminal artifact	wire body model: binding.modelId.value（deepSeekInitialPreparedRequestCompilerV2.ts:165）；artifact 的 model/provider 是 provider 回显	openrouter/terminalArtifactV1.ts:7-16	attempt terminal state（无模型身份，只有 fingerprint）
### 关键不变量（当前代码强制）
- modelKey === providerKey::modelId；observation 的 providerKey/nativeModelId 必须等于行身份，否则整页失败（catalog_snapshot_identity_invalid）。
- GenV2 命令里 renderer 发的 providerId 被解码器硬编码覆盖为 contract 值（deepseek/plainTextInitialSendCommandV2.ts:101），snapshot commit 再校验 command.providerId === binding.providerId（anthropicPlainTextSnapshotCommitV2.ts:257-260）——IPC 信任边界，属安全特性。
- evidence.providerId === profile.providerId（anthropicGenerationAuthorityV2Service.ts:248、deepSeekStableGenerationAuthorityV2Service.ts:124、openAIResponsesGenerationAuthorityV2Service.ts:145）；binding 的 providerId 取自 profile/contract，从不取自命令（geminiGenerateContentGenerationAuthorityV2Service.ts:267）。
### 转换边界（当前全部显式存在）
- catalog key → credential key：唯一注册表 providerCatalogAuthorityRegistryV2.ts:90-105（仅 anthropic_messages→anthropic 不同）。
- catalog key → GenV2 provider_id：activeCatalogModelAuthorityV2Service.ts:173-174（ternary）。
- RuntimeProviderId → GenV2 route kind：appChatApp.logic.ts:7198-7217（switch）。
- route kind → binding providerId：各 authority service 从 profile/contract 取。
- 派生 modelKey 三处重复构造：internalSchema.ts:220、modelSelection.ts:16-17、modelPrefsService.ts:119；UI 手工 split（ModelPickerDialog.vue:1013-1030）。
## ② 仍存在的真实问题
1. 'gemini' 幽灵值（activeCatalogModelAuthorityV2Service.ts:174）：google_ai_studio 的 evidence.providerId 被映射为 'gemini'，与 credential key、contract providerId（'google_ai_studio'，geminiDeveloperApiContractV2.ts:78）、binding、编译器（geminiGenerateContentPreparedRequestCompilerV2.ts:76）全不一致。当前唯一消费该字段的三处比较均不涉及 gemini，所以 inert；但 registry 里为它准备的接受分支（providerCatalogAuthorityRegistryV2.ts:51-52）是死代码，且任何将来在 gemini authority 加入 same(profile.providerId, evidence.providerId) 检查会立即失败。这是唯一一个"域里不存在的值"。
2. anthropic 双名映射散落 4 处：registry credentialKey、activeCatalogModelAuthorityV2Service.ts:173、appChatApp.logic.ts:7202、generationV2SessionConfigProjection.ts:119。replace('_messages','') 约定只显式存在于 registry 一处。这是真实的 API 家族名（anthropic）vs catalog 数据源名（anthropic_messages）差异，但映射应收敛到单表。
3. ProviderFailureV2.context.providerId 命名空间混合：catalog 流程填 catalog key（'anthropic_messages'），runner 流程填 binding key（'anthropic'）。同一字段承载两个域的值，错误归属/遥测语义按调用路径漂移。
4. credential-settings IPC 的 display providerId/profileId 是第五套词汇（'openai'、'google-ai-studio'、profileId 'openai-responses-v1'，generationV2CredentialSettingsIpc.ts:33-44），仅显示用；electron-env.d.ts 还有 vestigial 类型（'openai_responses_v1'）。冗余无害但不必要。
5. 本地 provider 三套命名无注册表：lm_studio/ollama_local/local_endpoint（RuntimeProviderId）→ lmstudio_openresponses/ollama_chat/generic_local_openai_chat（route kind）→ lmstudio/ollama/generic_local（binding providerId）。local_endpoint vs generic_local 尤其易混；且与 openai_chat_compatible 的 providerInstanceId（用户自建实例）是并列但互不指涉的第四种本地身份。
6. model prefs 的 providerKey 在 DB 边界是自由 string（infra/db/types.ts:2073），实际写入 RuntimeProviderId 值（appChatApp.logic.ts:6161-6166）；favorites 仅对 openrouter 生效而 recents 对所有 provider（ChatAppComposer.vue:1068-1069,1062）——不对称行为无注释。
7. catalogRuntimeScopeKey 复用 ::（providerKey::category）与 modelKey 同字符、不同域——纯化妆品问题。
## ③ 应保留的差异（不要合并）
1. 三域分层（catalog key / credential key / GenV2 provider_id）是正确的。catalog key 是数据源命名，credential key 是凭据槽命名（真实 API 家族），GenV2 provider_id 与 credential 对齐是刻意的——stream runner 直接用 binding providerId 做 credential lookup（anthropicMessagesStreamRunnerV2.ts:285-306）。5 个字符串里有 4 个相同是巧合，不是 invariant。
2. nativeModelId 留在 discovery 域：它只出现在 observation 和校验里，不进入 wire（wire 用 catalog modelId）。不要推广。
3. wire artifact 的 model/provider 是回显值，与 binding modelId 语义不同，应保留为 provenance 而非 identity。
4. 命令 providerId 被解码器覆盖是信任边界设计，保留。
5. DB 历史名 vs 代码字段名的差异本身不是问题：generation_request_v2.provider_id（GenV2 词汇）、conversation_route_preference_v2.selection_json.providerId（RuntimeProviderId 词汇）、model_preferences.provider_key（RuntimeProviderId::modelId 词汇）是三个不同持久化命名空间，历史数据已按此存，改名需迁移。
## ④ 若继续重构：候选模型与最值得动的点
### 候选语义模型
- A. 单一 ProviderId 联合 + 类型化派生函数（如 ProviderId、credentialKeyOf(catalogKey) 返回类型而非 string）：利=类型安全、编译期消除映射错误；弊=必然触发序列化名与 DB 列改名或迁移（三张表的 provider_id/providerId/provider_key 现在语义各异），且容易诱导抹平 anthropic 这类真实差异。不推荐全面实施。
- B. 现状收敛（推荐）：保留五域命名，做三件事——① 把 catalog→credential→provider_id 的全部映射收敛进 ProviderCatalogAuthorityRegistryV2（每行显式声明三个值）；② 删除 'gemini' 分支与死代码；③ ProviderFailureV2 分字段或统一为 catalog key。利=最小 diff、不动历史名；弊=词汇表面仍多。
- C. 彻底拆词（ProviderDataSourceKey / ProviderFamilyId / ProviderCredentialSlot）：利=语义最清晰；弊=全仓改名 + 迁移 + 文档成本最高，收益与 B 相同。不值得。
### 最值得进一步调查/修改（按优先级）
1. 删除 activeCatalogModelAuthorityV2Service.ts:174 的 'gemini' 映射和 providerCatalogAuthorityRegistryV2.ts:51-52 死分支（改为恒等 + 显式注释）。
2. 收敛 anthropic 映射到 registry 单表，appChatApp.logic.ts:7202 与 generationV2SessionConfigProjection.ts:119 引用之。
3. ProviderFailureV2.context.providerId 命名空间漂移（问题②③是唯一影响诊断正确性的项）。
4. 本地 provider 三套命名（问题⑤）补注册表条目，澄清 local_endpoint/generic_local。
5. model prefs providerKey 类型收窄 + 统一 buildModelKey 构造，消除三处重复实现与手工 split。
未做任何修改。需要我实施 B 方案中的第 1-2 项（最小修复）时告诉我。
