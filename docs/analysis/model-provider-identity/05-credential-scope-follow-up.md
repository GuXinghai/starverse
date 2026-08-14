# Credential Scope Identity Follow-up — DeepSeek V4 Flash

- **Lifecycle Status**: historical
- **Document Role**: implementation-note
- **Last updated**: 2026-08-14
- **Authority**: Point-in-time analysis; not an SSOT. Current code and owner decisions take precedence.

---
已核实完毕。你的判断成立——调查结论如下（含关键一手证据）：
结论：两种格式合法共存，无 correctness bug
*binding.credentialScopeId 的语义是 "credential authority reference"*，其格式严格性只在值真正跨入凭证机制的那条边界上强制，而不是全局不变量：
严格格式边界（credential-scope-v2:hex64，共 5 处生产校验点）全部只被 P1/P2/P3 三类生产者喂入：
- P1 createCredentialScopeId()（epoch2RuntimeCredentialService.ts:266-269，按 providerKey 挂载）
- P2 scope()（openAICompatibleCredentialV2Service.ts:51-53，按 providerInstanceId+credentialVersionRef 挂载）
- P3 unauthenticatedScope()（openAIChatCompatibleGenerationV2Coordinator.ts:38-40）：注意 openai_chat_compatible 的 no-auth 情形也刻意合成 credential-scope-v2:${sha256('openai-chat-compatible:none:'+digest)} ——即"无凭证"这个语义在该族内也保持严格格式，因为它会流经 openAIChatCompatibleStreamRunnerV2.ts:141 的 isCredentialScopeIdV2（入口强制 providerId==='openai_compatible'，:150）。
local-none 世界与严格边界不可达（已追全链）：
- local-none:${sha256(endpoint_profile_id\0digest)}（localEndpointProfileV2Repo.ts:99）是解码时确定性重算（非持久化），表约束 credential_mode='none' 是该表唯一模式（:79）。
- 下游：profile → binding（verifiedContractV2 透传）→ compiler → preparedRequest（identifier() 仅做非空/控制字符卫生，preparedProviderRequestV2.ts:115-121）→ local 三 runner 仅做 === 相等校验（与 profile 自身值比对，判定 staleness，如 genericLocalOpenAIChatStreamRunnerV2.ts:62），全程无 credential 服务参与（headersPlan=no_credential）。local 三 runner 中无一处 isCredentialScopeIdV2。
- 且 runner 预检虽比 status.credentialScopeId !== preparedRequest.credentialScopeId，实际租约申请用的是 status 值而非 binding 值（B1 证据）——binding 值只承担"一致性引用"角色，符合 authority reference 语义。
因此
- 不要把 local-none 改成真实 credential scope——那会破坏它"profile 内容版本标记"的真实功能（digest 变化 → local-none 变化 → staleness 错误）。它实际承担了两重职责：标记"无凭证" + 充当 profile 内容指纹参与绑定一致性校验。
- 唯一值得记录的低优先级问题：类型模型未反映 union 语义。GenerationV2Identity<'credential_scope_id'> 只做通用字符串卫生（identityV2.ts:129-133），CredentialScopeIdV2 的严格 brand 只存在于 credential 服务边界。若要显式化"authority reference"语义，可在 local profile 边界引入 CredentialScopeId | NoCredentialScopeId 联合——纯类型层改进，非运行时修复。
- 两个 family 的"无凭证"拼写不同（local-none: vs openai_compatible 的 credential-scope-v2:sha256(...)）是同一概念的两处拼写，但因各过各的边界而合法。若未来统一 no-credential 处理，这条缝（openAIChatCompatibleGenerationV2Coordinator.ts:38-40 vs localEndpointProfileV2Repo.ts:99）是唯一需要动的点。
- 防御性质尚可：disjointness 靠 runner 入口 providerId 断言 + 生产者纪律维持，若未来有新 runner 误把 local profile 值带进严格边界，会得到响亮错误（GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_SCOPE_INVALID），不会静默失败。
该课题从原报告的"问题 5"降级为"相邻课题（类型模型可选改进）"，与你的定性一致。
