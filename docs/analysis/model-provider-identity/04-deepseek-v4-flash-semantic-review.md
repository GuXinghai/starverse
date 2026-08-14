# Model and Provider Identity Semantic Review — DeepSeek V4 Flash

- **Lifecycle Status**: historical
- **Document Role**: implementation-note
- **Last updated**: 2026-08-14
- **Authority**: Point-in-time analysis; not an SSOT. Current code and owner decisions take precedence.

---
Starverse Model/Provider 身份语义独立审查（基于本地 checkout，hard-cut 后状态）
依据：当前分支 codex/ci-live-smoke-availability，确认 adcc8eff refactor(model-identity): remove legacy compatibility paths 已删除旧 selectedProviderId/selectedModelKey、CurrentRuntimeSelection、runtimeSelection.ts、legacy send fallback 及本地端点旧 chat 模块。以下所有结论仅来自当前工作区代码。
## ① 当前实际语义模型
身份按领域分五个独立 namespace，外加两类"命名/历史"层：
A. 运行时路由身份（唯一用户可见 authority）
- RuntimeProviderId（src/next/provider/runtimeProviderId.ts:1-20）：闭集 8 枚举 openrouter | openai_responses | google_ai_studio | anthropic_messages | deepseek | lm_studio | ollama_local | local_endpoint。编译期 + zod 双重约束。
- 唯一 authority 形状：ConversationRouteSelection（conversationRouteSelection.ts:23-26）= provider_model{providerId, modelId} | openai_chat_compatible{selection}（内嵌完整 CompatibleConfigurationSelection）。持久化于 conversation_route_preference_v2.selection_json（kind 列双写，SQL CHECK 保证 $.kind === selection_kind，conversationRoutePreferenceSchema.sql）；IPC 契约即共享 schema 本身（generationV2WorkspaceClient.ts:132）。
B. 目录身份（catalog domain，非 authority）
- CatalogProviderKey = string（catalogIdentity.ts:1）——自由字符串，无格式约束；CatalogModelId = string；CatalogModelKey = ${providerKey}::${modelId}（internalSchema.ts:220，首个 :: 分割）。
- Invariant（3 处独立强制）：modelKey === providerKey::modelId（catalogQueryService.ts:361；modelPrefs normalizeModelRef:112；DB 唯一键 (scope_type, scope_id, provider_key, model_id) + model_key 列）。
- nativeModelId（observation）恒等于行内 modelId（readCatalogObservation:427-440 + hasValidCatalogItemIdentity:442-464 交叉校验）。
- CatalogQueryItem.providerKey ≡ sourceProviderKey（查询时交叉校验，:461）；picker 数据经 catalogRuntimeStoreV2（routeKey = providerKey 或 providerKey::category 分区，ModelPickerDialog.vue:518-523）。
C. 执行绑定身份（generation-v2 execution domain）
- GenerationV2Identity<K>（identityV2.ts:77-97）：branded 包装，28 个 kind；校验仅为通用字符串卫生（非空、≤512、无控制字符，:129-133）——不约束各 kind 的值域。绑定载体 DecodedProviderBindingRecordV2（providerBindingV2.ts:31-43），强约束：contractRevision === contractId:digest、registryRevision === provider-contract-registry-v1:hex。
- v2 契约侧 providerId 值域（第三拼写域）：openrouter / openai_responses / google_ai_studio / deepseek（与 enum 一致）+ anthropic（anthropicDeveloperApiContractV2.ts:79，与 enum 的 anthropic_messages 不同拼写）+ lmstudio / ollama / generic_local / openai_compatible（providerContractRegistryV2.ts:355-402）。
- 桥接枢纽：GenerationV2Route.kind（generationV2CommandClient.ts:25-28）。两张平行 switch 表：generationV2RouteForProvider（appChatApp.logic.ts:7198-7217，RuntimeProviderId→kind）与 generationV2RouteForPersistedAnswer（:7219-7234，protocolContractId→kind）。
D. 凭证身份（credential domain，与 provider 身份分离）
- ProviderCredentialRef{kind, id} 为不透明字符串，不含 provider（providerCredentialResolver.ts:20-23）。
- main 侧实际解析：credentialService.getStatus(providerKey).credentialScopeId + withCredential({expectedCredentialScopeId})（deepSeekGenerationV2Runtime.ts:76-108 等）。
- credentialScopeId 格式 ^credential-scope-v2:[0-9a-f]{64}$（credentialScopeV2Primitive.ts:1），按 providerKey/providerInstanceId 单例会话生成；例外：本地 profile 合成 local-none:${sha256}（localEndpointProfileV2Repo.ts:99），而 openAIChatCompatibleStreamRunnerV2.ts:141 对 preparedRequest.credentialScopeId 做严格 isCredentialScopeIdV2 校验。
E. Wire 身份
- modelId → 请求 body model 字段（openrouter/chatRequestV1.ts:269、openai-responses:316、anthropic:402、deepseek:283、ollama:31、lmstudio:100、generic-local:32、openrouter-images:207）；gemini 例外：model 走 URL path（generateContentRequestV1.ts 无 model body 字段）。
- providerId/endpoint 一般不上 wire；openrouter-images 例外：provider.only / provider.options[providerSlug]（imageRequestV1.ts:202-204）。
- 端点在 main 侧由 endpoint profile 解析（first-party 为验证常量如 OPENROUTER_FIRST_PARTY_ENDPOINT_PROFILE_ID_V2；本地查 local_endpoint_profile_v2）。
F. 命名/历史层（非语义）
- DB 列名 provider_key/model_id/model_key、selection_json、routerSource（ModelDataRecord，无调用者）——持久化历史名，语义已由上层 schema 承载。
- UI 级 model_favorites/model_recents（modelPreferencesRepo.ts）：scope 键控、仅 OPENROUTER 收藏、providerKey 为自由串——纯 UI 命名空间，非身份 authority。
- 死面：send-plan IPC（sendPlan.buildCurrent、prepareOpenRouterReplayFromMessage、providerFileInput.prepareDraftImages）仍在 dbMethodsRegistry 注册但 UI 已无调用者。
### 完整数据流（Discovery→…→Terminal）
wire id/slug → modelId/providerKey → providerKey::modelId（catalog 行 + observation）→ catalogRuntimeStoreV2（routeKey 分区）→ CatalogQueryService.query(sourceProviderKey) → CatalogQueryItem → Picker（item.providerKey 赋给 providerId 字段）→ ConversationRouteSelection → conversation_route_preference_v2（authority）+ 语义层投影（compatible→哨兵 local_endpoint）→ canonicalSendSelection → GenerationV2Route.kind → window.generationV2 bridge → main runtime → 契约 providerId + 命令构造 binding（GenerationV2Identity）→ compiler 按 endpoint profile 解析 URL → HTTP（model in body|URL path）→ snapshot commit 记录 projectDecodedProviderBindingRecordV2（身份字段全量落盘）；terminal artifact（terminalArtifactV1.ts）不记录身份。
## ② 仍存在的真实问题
1. 同一概念三套拼写，仅靠人工平行维护：本地 provider 的 renderer 拼写 lm_studio/ollama_local/local_endpoint vs DB profile 拼写 lmstudio/ollama/generic_local vs 契约 lmstudio/ollama/generic_local；anthropic：enum anthropic_messages vs 契约 anthropic。后果是三张平行 switch（appChatApp.logic.ts:7198-7217、:7219-7234、:6824-6830 expectation 对象）必须保持同步，任何一张漏项即 GENERATION_V2_*_UNAVAILABLE/REQUIRED。这是当前最大的真实冗余——本地 profile 的 provider_id 是应用内私有拼写，没有任何外部理由与 RuntimeProviderId 不同。
2. GenerationV2Identity<'provider_id'> 无值域约束：kind 只做字符串卫生，契约侧 'anthropic' 与渲染侧 'anthropic_messages' 的漂移在类型与运行时都不可静态发现，只能靠 code review。
3. compatible 契约族被投影为哨兵 'local_endpoint'（appChatApp.logic.ts:3463-3464）：语义层把 openai_chat_compatible（远程任意 OpenAI-compatible 实例）与 generic_local_openai_chat（本地端点）合并为同一 providerId。authority（route preference JSON）完整无损，但任何按该投影 providerId 路由的消费方都会误判（regen/retry 用 protocolContractId 所以目前正确——这是脆弱的正确）。
4. nativeModelId ≡ modelId 恒等式冗余：observation 内双重身份字段，读路径强制相等（catalogQueryService.ts:427-464）——已是死冗余而非独立值域。
5. credentialScopeId 双格式：credential-scope-v2:hex64 vs local-none:sha256，且 GenerationV2Identity 泛化校验接受两者；只有 openAIChatCompatibleStreamRunnerV2:141 做严格校验，若未来 generic_local 流经该 runner 会静默失败。另疑似双解析路径并存（ProviderCredentialStore.getCredential vs credentialService.getStatus+withCredential）未证实哪条是活路。
6. :: 组合键三义同形：modelKey（providerId::modelId）、routeKey（providerKey|providerKey::category，不含 modelId）、compatibleKey（providerInstanceId::modelId::endpointRevisionId）——同一分隔符、不同粒度、不同值域，误读/误拼风险。
7. 死面内不一致：PrepareProviderImageSendSchema.provider 6 项（含 lm_studio/ollama_local，validation.ts:574-581）vs ProviderImageRuntimeProvider 4 项（providerImageSendPreparation.ts:8-13）；protocol_contract_id 允许 'lmstudio-openai-chat-completions'（localEndpointProfileSchema.sql:6）但 7219-7234 映射表无此值（孤儿路由）；ModelDataRecord.routerSource、send-plan IPC 无调用者。
8. 文档陈旧：catalogQueryService.ts:58 sourceProviderKey 注释示例 openai-direct/anthropic-direct 在仓内不存在（实际值域是 openai_responses/anthropic_messages 等）。
## ③ 哪些差异应保留
- CatalogProviderKey（自由串）≠ RuntimeProviderId（闭集枚举）：目录必须容忍上游任意 vendor slug（openrouter wire provider），运行路由必须闭集门控。picker 把 CatalogQueryItem.providerKey 赋入 providerId（ModelPickerDialog.vue:2086）依赖 5 个 first-party provider 的值重合——这是实现巧合，应作为代码契约固化（类型层面承认），而不是合并类型。
- modelId 自由文本 vs providerId 闭集：modelId 是 provider-native 不透明标识（"author/slug"），不应约束。
- wire id（modelId）≠ canonicalSlug ≠ vendor/author：目录三个不同属性（openRouterCatalogClient.ts:380-533）。
- 凭证身份与 provider 身份分离：ProviderCredentialRef 不含 provider，归属在 session/binding 层——保留。
- GenerationV2Route.kind 作为桥接枢纽：renderer enum ↔ protocolContractId 的双向映射是合理边界（契约 id 是上游字符串，不应与 app enum 强绑），但要单点化。
- 持久化列名与 SQL 校验（provider_key/model_id/model_key、kind 双写 CHECK、DB 唯一键）：schema 历史，保留。
- 本地 provider 的 modelId 兼作 endpoint profile 配置键（ollama protocolConfig.modelId，appChatApp.logic.ts:6836）：本地无目录，模型身份由 profile 承载——语义正确，保留。
- terminal artifact 不记录身份：身份已在 snapshot binding 全量落盘，artifact 是内容产物——保留现状。
## ④ 若继续重构，最值得调查/修改的地方（按性价比排序）
1. 统一本地 provider 身份拼写（问题 1）：候选 A：local_endpoint_profile_v2.provider_id 改用 RuntimeProviderId 拼写（需 DB 迁移 + SQL CHECK 更新 + openAIChatCompatible 的 providerInstanceId 命名核对）；候选 B：新建单点映射模块（RuntimeProviderId↔profile providerId↔contractId），三张 switch 收敛为一张表。调查重点：openai_chat_compatible 契约族（providerRegistry 'openai_compatible'）为何用独立 providerInstanceId 而非 RuntimeProviderId，是否并入同一映射。
2. GenerationV2Identity 增加 per-kind 值域校验（问题 2）：为 provider_id 定义闭集或前缀模式、credential_scope_id 定义严格正则（与 CredentialScopeV2Primitive 对齐），把"通用卫生"升级为 kind 专属校验。前提是先裁决第 1 点的统一拼写，否则校验会锁死漂移。
3. 裁决 credential 双路径 + local-none 格式（问题 5）：确认 ProviderCredentialRef/getCredential 是否仍被 main 侧任何活代码使用；确认 local-none 是否可能流经 isCredentialScopeIdV2 严格校验点。
4. 审计 compatible 哨兵 'local_endpoint' 的全部消费方（问题 3）：语义层 providerId 的读取方清单，若仅显示用途则风险低，若存在路由用途则必须引入独立哨兵（如 openai_chat_compatible 本身）。
5. 死面清理（问题 7）：删/停用 send-plan IPC handler、对齐 image send schema 与 TS 类型、处理 lmstudio-openai-chat-completions 孤儿契约值、移除或修正 routerSource。低风险、纯删减。
6. nativeModelId 去冗余（问题 4）：确认观察写入路径恒等式永不破后，写入侧省略，DB 列保留为历史。
不建议：为命名一致强行合并 CatalogProviderKey 与 RuntimeProviderId（值域约束本质不同）、改 DB 历史列名、或让契约 providerId 与 app enum 强绑定（上游字符串不应进入 app 枚举）。
未实施任何修改；以上为纯审查结论。
