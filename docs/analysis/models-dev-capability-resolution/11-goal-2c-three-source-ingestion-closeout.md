# Goal 2C：三来源 Canonical Source Facts Ingestion 实施收口

- **Lifecycle Status**: implementation closeout
- **Document Role**: controlling Goal 2C implementation inventory and Goal 3 handoff
- **Last updated**: 2026-08-31
- **Authority**: current checkout, Owner-frozen documents 06/09/10, focused tests, and persisted source contracts

> 后续 Owner amendment：本closeout中的bundled `built-in/user` ownership与按请求`query-bound` regex matching只描述Goal 2C当时实现。目标架构不保留bundled built-in Rules；Cloud-managed与User Rules将共享同一Pack/Rule semantics，并共同发布为唯一Capability Rules canonical source。Regex改为在Rule/source或authoritative exact-subject-set revision变化时物化exact-subject claims，不在runtime request path执行。该迁移尚未实施，完整边界以[`12-model-facts-ui-synchronization-plan.md`](12-model-facts-ui-synchronization-plan.md)为准；本文件其余Goal 2C实施清单仍是历史收口记录。

## 结论

Goal 2C 已实现三套彼此独立的 Canonical Source Facts ingestion：

1. Provider Native；
2. models.dev；
3. Capability Rules。

三者现在共用同一套 typed、sparse、exact-subject ontology、provenance、source revision、subject-fact revision和单来源 LKG/publication基础设施。本轮没有比较来源优先级，没有跨来源选 winner，没有生成 final resolved Model Facts或新的 `capabilityRevision`，也没有开始 Goal 3。

models.dev Raw Source按 2026-08-31 Owner amendment固定为 `https://models.dev/api.json` 的官方部署扁平payload。Starverse持久化经过sanitizer的完整API payload，只引用API实际暴露的provider/model record/field；不重建`base_model/base_model_omit`或内部base/override contributor。

## 实施的 Canonical ontology 与 registry

新增 `src/next/generation-v2/model-facts/`，包含：

- `CanonicalModelSubjectV1 = providerAuthorityId + endpointProfileId + nativeModelId`；
- 36个注册 semantic paths；
- support、integer、native string/set、media/operation set、integer domain、aspect ratio和dimensions等typed values；
- complete/partial collection、partial bounds、included/excluded/symbolic integer values；
- `present_valid / missing / invalid` current observation；
- 独立 `effectiveAssertion` 与 `lkg_retained_after_invalid`；
- source/record/field provenance、Rule claim identity/priority和unmapped diagnostics；
- versioned Provider Authority Registry与Source Mapping Coverage Manifests；
- deterministic source revision、exact-subject fact revision和canonical digests。

Registry只接受显式binding。execution provider、Provider Native surface和models.dev provider key不通过lowercase、prefix、family、alias或模糊字符串连接。Compatible/local endpoint不会因协议兼容而继承OpenAI或其他实验室事实。

## Provider Native 实施范围

Provider模型列表的source-native response page现在随Catalog fetch结果保留，并在独立Canonical Facts事务中发布。Canonical发布失败不会阻断已成功的Provider Catalog同步；它只更新本source的stale/LKG状态。

当前mapping：

| Provider surface | 已发布的canonical facts |
|---|---|
| OpenAI `/v1/models` | exact identity与record membership；该surface没有capability coverage，因此不制造missing矩阵 |
| DeepSeek `/models` | exact identity与record membership；该surface没有capability coverage，因此不制造missing矩阵 |
| Google AI Studio `/v1beta/models` | input/output limits、thinking support、sampling defaults/maximum、Google `topK` omission semantics、`supportedGenerationMethods → operations.supported` |
| Anthropic `/v1/models` | evidenced limits、thinking、thinking modes、generation effort、structured output、input modalities、citations、code execution、context management/actions、batch operation |
| OpenRouter `/models`或`/models/user` | context window、input/output modalities、reasoning support/required/default；compatibility effort不冒充underlying native effort |
| LM Studio `/api/v1/models` | preserved evidence支持的context window、vision positive member、tool-use training；其他本地字段保持unmapped |
| Ollama `/api/tags` | capabilities只形成positive partial operation/modality evidence；未列出成员不生成unsupported |

单个坏字段只产生该field的invalid observation；单个坏record进入invalid record diagnostics；只有response envelope/provider/schema identity整体不可信时才拒绝本source refresh并保留旧pointer。

## models.dev 实施范围

主进程使用固定HTTPS URL、禁止redirect、JSON content-type检查、30秒abort、16 MiB streaming body上限、bounded sanitizer和危险字段脱敏。当前官方API现场核验约为4.4 MiB、212个provider、7,494个model；这些数量是2026-08-31观察值，不进入source identity或永久断言。

一次官方API请求对应：

```text
one sanitized raw payload
→ one models.dev source revision
→ N exact-subject fact records
```

Adapter只索引Provider Authority Registry中存在exact models.dev key且具有唯一execution binding的provider。未绑定provider和LM Studio等本地来源闭合跳过，不猜测join。模型map key必须与record `id`精确相等。

已映射字段为attachment、reasoning、tool calling、structured output、temperature support、input/output modalities、context/input/output limits，以及reasoning toggle/effort/budget options。OpenRouter的兼容effort values保留为`ambiguous_semantics` diagnostics，不发布为native effort。

models.dev使用独立、持久化、可配置的refresh cadence；应用持续运行时会按due time重刷，失败只记录stale reason并保留LKG，shutdown会取消timer和in-flight request。

## Capability Rules 实施范围

Rules source snapshot冻结全部active pack/rule rows，query-bound地为exact subject输出全部matched claims：

- 不预选winner；
- exact与受限regex命中都逐条保留；
- owner、pack/rule identity、selector、rule priority、neutral pack priority、effective priority、evidence与revision全部进入claim provenance；
- query/cache/首次遇到某model的顺序不改变Rule source revision；
- built-in与user-owned rule保持独立。

当前Goal 2A schema没有可编辑pack-level priority，因此source contract显式使用neutral pack priority；这保留未来维度但不伪造当前配置能力。

`requires_confirmation`、`unknown`、non-empty generic constraints和未注册的`derived_empirical`不会被投影为Model Facts，而是产生field-level invalid outcome。当前Goal 2A-Fix retained built-in derived rules为0；未来derived claim必须先注册真实derivation ID/revision和输入evidence/claim refs。

## Raw persistence、revision、LKG 与 retention

新增Epoch-2 closed-schema fragment保存：

- sanitized raw payload及digest；
- raw source snapshot与record-set completeness；
- current source state、freshness、last attempt/success和stale reason；
- immutable source revision；
- immutable exact-subject fact payload/ref；
- subject/source/raw provenance references；
- runtime/resolved/current/LKG retention pins。

Source revision冻结raw snapshot、adapter、coverage manifest和authority registry revision；wall-clock timestamps不进入semantic revision。Subject-fact revision额外冻结一个exact subject的完整observations/assertions/provenance。Rules lazy materialization不改变source revision。

Publisher使用同source CAS原子切换current pointer；refresh/publish失败不清空LKG。Retention只保留current、predecessor/LKG链和显式pin引用，未引用旧数据可prune，不建立永久capability history。

旧18-fragment数据库与新19-fragmentbundle不兼容时，会先识别schema digest/count变化并进入现有Epoch-2 backup/recreate流程；不会因manifest DDL literal变化误判为数据库损坏。本轮没有增加legacy decoder、dual read、dual write或数据迁移兼容层。

## 删除、收敛与有意保留

已收敛：

- OpenRouter及其他Provider Catalog不再从归一化catalog item反构造Canonical Facts；使用实际response payload；
- Rules Adapter不再使用winner-oriented projection作为source输出；
- models.dev没有独立availability或UI/Compiler路径；
- 没有新增model family、regex join、alias join或hard-coded capability fallback。

有意保留：

- Catalog membership/availability及其coarse display projection：这是availability/UI cache，不是Model Facts authority；
- API Contract、wire codec、runtime hard constraints、execution/tool safety和UI defaults；
- legacy `projectCapabilityRulesV2()` 的现有运行时消费者：Goal 2C不做广泛consumer迁移，Goal 3接入Canonical resolved facts后必须删除该fallback；
- pricing、display/lifecycle、`interleaved.field`等非Model-Fact raw字段，仅留在raw/sibling metadata；
- OpenRouter `supported_voices`、generic-local reasoning controls、reasoning summary、精确image dimension换算等ontology未冻结字段保持unmapped。

## Raw-evidence blocker状态

- LM Studio：没有补造历史null payload；生产Adapter只解释未来实际保存的`/api/v1/models` payload和已证明字段。
- OpenRouter credential scope：不使用旧摘要补字段；生产refresh会保存本次实际成功endpoint的完整sanitized response。
- Ollama：只发布positive partial capabilities，不把list omission解释为unsupported。
- 历史comparison statistics：不进入source revision；revision只由实际raw snapshot计算。
- Generic Local OpenAI-compatible：没有统一source-native schema，本Goal未建立伪通用Adapter。

## 聚焦验收

- `npm run rebuild:node`：通过。
- Model Facts、Provider model source与Provider catalog：17 files；修正一个基线已有的Gemini missing-type表达后，69/69 tests通过。
- DB/source publication、schema replacement、Catalog IPC、models.dev scheduler：7 files，75/75 tests通过。
- `npx tsc --noEmit --pretty false`：通过。
- 聚焦ESLint：0 errors；保留现有function length/complexity warnings。
- 未运行全仓测试、`vue-tsc`、Electron smoke或真实付费Provider请求。

ABI状态：

- `better-sqlite3 ABI mismatch encountered: no`
- `Rebuild command run: npm run rebuild:node`
- `Current ABI target after task: node`
- `Electron smoke retried after rebuild: no`
- `No native artifacts committed: confirmed`

## Goal 3 前剩余事项 / TODO

在进入Goal 3 consumer迁移前，还必须按后续Owner amendment完成或明确排期：

1. 由Owner另行冻结Cloud distribution contract；
2. 将bundled built-in/user旧ownership迁移为同构Cloud-managed/User Pack/Rule core；
3. 将二者收敛为唯一Capability Rules canonical source revision；
4. 建立authoritative exact-subject set及revision-bound Rule materialization，移除runtime query-bound regex路径；
5. 按12规划UI-safe services/IPC、Rules UI与Facts Inspector，但不得借此提前实现Goal 3 winner/conflict。

Goal 3只能消费三个独立`CanonicalSubjectFactRefV1`，并负责：

1. configurable source priority；
2. field/subfield merge；
3. Rule pack/rule priority与exact-over-regex；
4. explicit/derived比较；
5. completeness-aware union/conflict；
6. deterministic final resolved Model Facts与`capabilityRevision`；
7. Catalog/UI/Preflight/Runtime/Compiler的最终consumer迁移；
8. consumer迁移后删除legacy Rule winner projection及其他旧fallback。

Goal 3不得重新解析raw provider/models.dev字段，不得让models.dev或Rules创建availability，也不得把unknown静默改为unsupported。
