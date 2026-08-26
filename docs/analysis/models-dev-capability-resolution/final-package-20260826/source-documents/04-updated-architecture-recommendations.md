# Starverse 模型能力体系——更新后的建议与架构决策

- **Lifecycle Status**: reference
- **Document Role**: candidate-action-list
- **Last updated**: 2026-08-17
- **Authority**: Proposed synthesis only; the “建议冻结” section is not Owner-frozen architecture authority until explicitly reviewed and approved.

## 一、总原则：先完成 Single Resolved Capability，再接入 models.dev

当前最高优先级不是接入新的模型能力数据源，而是先解决 Starverse 内部已经存在的多重能力判断。

第一阶段暂缓让 `models.dev` 参与生产环境的 capability resolution（能力解析）。

应先完成：

> **Single Resolved Capability（单一最终能力解析）**

对于同一个：

`provider + endpoint/profile + protocol + model + operation + capability evidence revision`

Starverse 只能产生一份最终的 `ResolvedCapability`。

随后：

* Catalog（目录）
* UI（界面）
* Preflight（发送前校验）
* Runtime Snapshot（运行时快照）
* Compiler（编译器）

全部绑定并消费这一份 capability revision（能力版本）。

任何一层都不得再通过 provider 特判、模型名正则、静态枚举、独立 allowlist 或自己的 fallback 表重新判断“这个模型有什么能力”。

因此这里所谓“单一能力事实源”，指的是：

> **唯一最终 resolved output（解析结果）**

并不意味着 Starverse 只能拥有一个输入数据源。

输入可以很多，最终裁决只能有一份。

---

## 二、模型能力系统本质上处理的是多张扁平数据表

Starverse 不需要建立一套复杂的 provider semantic IR（供应商语义中间表示）。

它实际接触的主要是：

1. Provider API 返回的模型列表以及可能存在的 capability metadata（能力元数据）；
2. `models.dev` 提供的模型能力表；
3. Starverse 内置 reviewed rules（审查规则）；
4. 用户本地或云同步的 capability rules（能力规则）；
5. Starverse 当前 provider/protocol codec 已经实现的能力集合。

这些来源最终都应该适配到一个公共的：

`Canonical Model Capability Schema（规范模型能力结构）`

然后进行统一 resolution。

类似：

```text
Provider API facts ──────┐
                         │
models.dev facts ────────┤
                         │
Built-in reviewed rules ─┤
                         ├──→ Unified Capability Resolver
User / cloud rules ──────┤
                         │
Codec implementation ────┘
                                │
                                ▼
                      Resolved Capability
                           revision R
```

这里没有必要让 Starverse 理解类似：

> “供应商接受 medium，但内部实际上映射为 high。”

如果 Starverse 本身不暴露 `medium`，也不生成这种配置，这种兼容语义没有必要进入模型能力数据库。

协议兼容细节可以继续由 provider codec 在确有需要时处理。

---

## 三、现有 Provider Policy 应当数据化，而不是永久保留为源码硬编码

当前 DeepSeek、Anthropic、OpenAI、Gemini 等 provider policy 中有大量规则来源于：

* 官方 API documentation（API 文档）；
* developer smoke test（开发者烟测）；
* Starverse 人工核验；
* provider contract review（供应商契约审查）。

这些内容本质上属于数据和规则，而不是算法。

因此长期目标应从：

```text
TypeScript source
=
rule engine
+
provider capability knowledge
```

迁移为：

```text
Starverse source code
=
schema
+
resolver
+
rule engine
+
codec
+
transport

Versioned built-in rule packs
=
provider/model capability knowledge
+
API documentation conclusions
+
developer smoke conclusions
+
review provenance
```

例如现有：

`DeepSeekStableCapabilityRuleV2`

以及 Anthropic exact-model rules、OpenAI capability manifest、Gemini capability policies，可以作为迁移来源。

不要求一次性全部推倒重写。

迁移过程中可以：

```text
Existing Provider Policy
        ↓
Rule Adapter / Export
        ↓
Canonical Built-in Rules
```

逐步把静态 provider knowledge 移出 TypeScript。

最终目标是：

> Starverse 源码中尽量不再存在“某个模型支持哪些能力/档位”的 provider/model hardcode。

这些信息由版本化规则包维护。

这样 API 文档语义和烟测结论仍然完整保留，同时获得：

* 热更新；
* revision；
* provenance；
* diff；
* rollback；
* last-known-good；
* 独立于应用版本的维护能力。

---

## 四、采用 Canonical Capability Schema + Generic Patch Rules，而不是新的语义 IR

不再采用此前提出的：

* `factual assertion/correction`
* `product narrowing`
* `compatibility alias`

三类语义 IR 作为 Starverse capability architecture 的中心抽象。

Starverse 需要的是更直接的数据模型。

第一部分：

> `CanonicalModelCapability`

表达模型最终可能具有的能力字段，例如：

```text
reasoning
reasoningEfforts
tools
structuredOutputs
vision
inputModalities
outputModalities
contextWindow
maxOutputTokens
...
```

以及必要的：

* domain；
* range；
* conditional constraint。

第二部分：

> `CapabilityPatch`

用于内置规则和用户/云同步规则修改这些字段。

第一版规则操作应尽可能少。

优先考虑：

```text
set
add
remove
limit
```

例如：

```text
set reasoning = true

set reasoningEfforts = [high, max]

add inputModalities += [image]

remove reasoningEfforts -= [max]

limit contextWindow <= 128000
```

`disable` 可以由 `set false` 表达。

枚举的 `narrow` 通常可以由 `remove` 表达。

数值范围的收窄由 `limit` 表达。

只有当实际 provider rules 确实无法表达时，再扩展规则语言。

避免一开始建立一个可以描述所有 provider 行为的复杂 DSL。

---

## 五、现有 Provider Policy 中的条件规则也可以进入内置规则包

“数据化”不应只覆盖简单的：

```text
reasoning = true
efforts = [high, max]
```

API 文档和烟测中已经确认的 conditional capability（条件能力）同样可以作为规则数据存在。

例如：

```text
when reasoning.enabled
    generation.temperature unavailable
```

或者：

```text
when reasoning.enabled && tools.enabled
    tools.toolChoice allowed = [...]
```

这仍然属于：

> 某种配置组合是否合法

因此仍然是 capability rule。

不需要因为存在条件关系就把它永久写死在 provider-specific TypeScript 中。

公共 capability schema 可以继续利用 Generation V2 已有的：

* semantic path；
* domain；
* constraint；

这些 primitive（基础结构）。

Provider codec 继续负责“怎么编码”。

Built-in rule 则负责“什么组合合法”。

---

## 六、明确区分 Model Capability 与 Codec Implementation Capability

这是长期架构中必须保留的边界。

例如模型能力解析得到：

```text
reasoningEfforts = [low, high, max]
```

但 Starverse 当前某个 provider codec 只实现：

```text
reasoningEfforts = [high, max]
```

则最终可执行能力必须是：

```text
Model Effective Capability
          ∩
Codec Implementation Capability
          =
Executable Capability

[low, high, max]
          ∩
[high, max]
          =
[high, max]
```

因此 codec/protocol 层可以维护：

> Starverse 自己实现了哪些 semantic inputs（语义输入）。

它不能维护：

> 某个具体模型支持哪些 semantic inputs。

前者属于 implementation capability（实现能力）。

后者属于 model capability（模型能力）。

Resolver 必须把二者求交后，才能生成用户真正可以使用的 `ExecutableCapability`。

---

## 七、Compiler 保留编码知识，但失去模型能力裁决权

Compiler 和 provider codec 应继续负责：

* request JSON shape；
* wire field 名称；
* serialization；
* SSE decoding；
* tool message construction；
* continuation/replay；
* provider error decoding；
* protocol-specific request validation。

但是不得重新维护：

```text
if model == xxx:
    effort high allowed
```

这类模型能力事实。

Compiler 应执行：

```text
assert intent ⊆ Runtime/Executable Capability
        ↓
encode semantic intent
        ↓
validate closed wire schema
```

最终的 wire validation 是安全边界，不构成第二套 capability authority。

---

## 八、Availability 与 Capability 必须分离

模型“存在/可选”和模型“支持什么能力”属于两个不同问题。

建议明确分成：

### Availability

回答：

> 当前 provider / endpoint / credential 是否允许这个模型成为 active selection？

主要来源：

* Provider active catalog；
* provider catalog 的 last-known-good；
* 产品明确允许的 manual model binding。

### Capability

回答：

> 对这个已经建立 binding 的模型，Starverse 最终允许哪些能力和配置？

来源：

* provider capability facts；
* reviewed built-in rules；
* models.dev；
* user/cloud rules；
* codec implementation。

`models.dev` 永远不能单独创建：

* model membership；
* credential availability；
* endpoint binding。

如果 Starverse 支持用户手动填写一个 `/models` 中不存在的模型，应建立明确的：

`Manual Model Binding`

而不能继续依赖：

`synthetic missing observation + supplement`

偶然让请求通过。

---

## 九、Runtime Snapshot 是派生结果，不是第二个 Resolver

Catalog、UI、Preflight、Runtime Snapshot 和 Compiler 必须绑定同一个 base resolved capability revision。

但 Runtime Snapshot 仍然有必要，因为发送时存在：

* 当前 tool registry；
* 当前附件；
* 当前确认策略；
* command-specific constraints；
* 其他运行时条件。

因此关系应是：

```text
Complete Evidence
      ↓
Single Capability Resolver
      ↓
Resolved / Executable Capability
revision = R
      │
      ├── Catalog
      ├── UI
      ├── Preflight
      │
      ▼
Runtime-specific narrowing
      ↓
Runtime Snapshot
parentCapabilityRevision = R
runtimeRevision = S
      ↓
Compiler
```

需要冻结一个严格不变量：

```text
RuntimeCapability(S)
⊆
ResolvedExecutableCapability(R)
```

Runtime Snapshot 只能单调收窄。

它不能重新读取：

* provider facts；
* models.dev；
* reviewed rules；

然后自行 resolve 第二次。

---

## 十、暂缓 models.dev 生产接入

models.dev 当前有价值，但不应作为解决现有 DeepSeek bug 的捷径。

正确顺序是：

### 第一阶段：没有 models.dev 也必须成立

先使用现有：

* provider facts；
* reviewed provider policies；
* codec implementation；

建立真正的 single resolver。

并完成：

* Catalog 统一；
* UI 统一；
* Preflight 统一；
* Runtime Snapshot lineage（血缘）统一；
* Compiler 统一；
* capability revision 统一。

直到删除/隔离：

* UI 静态 effort 列表；
* model regex capability；
* provider-specific UI capability 分支；
* coarse/fine 两套独立发送合法性判断；
* compiler 中可能存在的 model-specific allowlist。

只有这一阶段通过验收，才进入 models.dev 工作。

---

## 十一、models.dev 接入前必须完成六类验证

每条 models.dev 数据在进入 resolver 之前，必须依次完成：

### Schema

数据结构是否符合 Starverse 当前支持的 models.dev schema。

未知字段或 schema revision 不能静默解释。

### Identity

必须确定：

```text
models.dev provider/model identity
        ↔
Starverse provider/nativeModelId
```

禁止：

* fuzzy matching；
* model-name regex；
* 跨 provider alias；
* 因 underlying model 名称相同自动共享能力。

Join 失败即该记录不能产生 capability evidence。

### Scope

必须明确该数据属于：

* 哪个 provider；
* 哪个 protocol/profile；
* 哪个 model；
* 必要时哪个 operation。

不能把：

`OpenRouter/deepseek/...`

的 provider-specific capability 泄漏给：

`DeepSeek official/deepseek-...`

### Provenance

至少记录：

* source；
* upstream snapshot/commit；
* fetchedAt；
* content digest；
* parser/schema revision。

### Freshness

必须能够判断该 evidence：

* fresh；
* stale；
* expired；
* invalid。

Stale evidence 不应简单从历史中删除。

它仍应保留在 provenance/diagnostics 中，只是按照 freshness policy 决定是否具有裁决资格。

### Codec Implementation

外部数据宣称支持某能力，并不代表 Starverse 当前能够使用。

所有结果最终仍必须与 implementation capability 求交。

---

## 十二、models.dev 必须拥有独立 Evidence Revision

models.dev 的更新不能被伪装成 provider catalog 更新。

应分别维护：

```text
Provider catalog revision
Models.dev evidence revision
Built-in rules revision
User/cloud rules revision
Codec implementation revision
```

这些共同参与计算：

```text
Resolved Capability Revision
```

因此：

```text
models.dev 更新 reasoning metadata
```

可以导致：

```text
capability revision 变化
```

但不应该虚假导致：

```text
provider active catalog revision 变化
```

Availability lifecycle 与 external capability evidence lifecycle 必须解耦。

---

## 十三、models.dev 不是 fallback，而是完整 Evidence Set 中的普通成员

这是对旧设计最重要的修正之一。

长期实现禁止：

```text
provider value ??
models.dev value ??
reviewed value ??
user value
```

也禁止：

```text
if provider missing:
    use models.dev
```

或者：

```text
if reviewed missing:
    use models.dev
```

这些模式会产生顺序依赖。

正确形式应该是：

```text
Provider facts
Models.dev facts
Built-in reviewed rules
User/cloud rules
Implementation capability
        ↓
Collect complete evidence set
        ↓
Validate every claim
        ↓
Conflict detection
        ↓
Explicit precedence/conflict policy
        ↓
One resolved result
```

也就是说：

> 每一个合格来源都完整进入同一次 resolution。

低优先级来源即使最终没有赢，也应出现在：

* provenance；
* conflict diagnostics；
* maintenance/review signals；

中。

不能因为高优先级来源已经存在，就根本不读取后续来源。

---

## 十四、Precedence 不能通过输入顺序实现

可以存在：

`A > B > C`

这样的正式 precedence。

但不能写成：

```text
if A exists:
    return A

if B exists:
    return B
```

Resolver 必须先收集：

```text
A claim
B claim
C claim
```

然后再 adjudicate（裁决）。

因此要求一个重要不变量：

> **Resolution 必须 permutation invariant（输入顺序不变）。**

即：

```text
Resolve([A, B, C])
=
Resolve([C, A, B])
=
Resolve([B, C, A])
```

只要 evidence 内容和 revision 相同，输入数组排序不得影响最终 capability。

这一点应直接写成自动化测试。

---

## 十五、建议的规则优先级需要显式冻结

对于最终 Model Effective Capability，建议采用明确分层：

### 用户/云同步规则

属于用户明确选择的 override。

如果 Starverse 产品目标允许高级用户纠正模型能力表，它可以覆盖默认能力事实。

但仍然无法绕过 codec implementation。

### Starverse Reviewed Built-in Rules

来自：

* 官方文档；
* 开发者烟测；
* Starverse review。

它们可以：

* 添加；
* 删除；
* 修正；
* 收窄；

Provider API 或 models.dev 中不准确、不完整或滞后的能力字段。

这是把现有 provider policy 数据化后的正式角色。

### Provider Capability Facts

Provider API 如果确实提供能力 metadata，应作为重要原始来源完整进入 resolution。

### models.dev

可信的外部能力表来源，但不具有 Starverse reviewed rule 的优先级。

### Unknown

没有足够证据时保持未知，不虚构支持。

这套 precedence 必须由 resolver policy 明确声明。

所有低优先级冲突仍应记录。

---

## 十六、用户规则和内置规则应尽量共用同一种 Patch Schema

不要分别维护：

* DeepSeek override 格式；
* Anthropic override 格式；
* 用户 override 格式；
* 云同步 override 格式。

长期目标是：

```text
Built-in Rule Pack
User Rule Pack
Cloud-synced Rule Pack
```

共用同一种 canonical patch schema。

区别只在：

* source；
* precedence；
* trust；
* revision；
* scope；
* provenance。

现有 provider-specific policy 可以逐步转换成这种规则。

迁移期不要求立刻删除原有类型。

---

## 十七、Built-in Rule Pack 应支持热更新

这是把 provider policy 数据化之后的重要收益。

每一个官方规则包至少包含：

```text
schemaVersion
rulePackId
revision
provider scope
protocol scope
rules
verifiedAt
evidenceRefs
contentDigest
signature
```

推荐运行模式：

```text
Bundled reviewed rules
        +
Signed remote updates
        +
Last-known-good
```

规则更新：

```text
download
→ schema validation
→ signature validation
→ identity/scope validation
→ rule consistency validation
→ implementation compatibility validation
→ atomic publish
→ new capability revision
```

失败：

```text
继续使用 bundled / last-known-good
```

Rule server、models.dev 或任何外部 metadata 服务不可成为发送消息的实时硬依赖。

---

## 十八、models.dev 首先进入 Shadow Resolution，而不是生产裁决

统一 resolver 稳定后，models.dev 的第一种运行方式应是：

```text
decisionEligible = false
```

但仍完整进入 evidence normalization 和 conflict analysis。

Shadow 阶段需要统计：

* 与 Provider API 冲突多少；
* 与 built-in reviewed rules 冲突多少；
* 哪些模型新增 capability；
* 哪些模型存在字段级 drift；
* freshness 分布；
* identity join 失败率；
* 如果启用它，多少 resolved result 会变化。

经过实际数据验证后，再决定：

```text
decisionEligible = true
```

此时不修改 resolver 架构，只改变该 source 在明确 precedence policy 中的裁决资格。

---

## 十九、models.dev 的 status/lifecycle 暂不直接影响 Availability

models.dev 的：

* deprecated；
* status；
* lifecycle；

可以作为 review/maintenance signal。

第一阶段不应直接：

* 隐藏 provider 当前返回的模型；
* 把模型移出 active catalog；
* 创建新 active model。

Availability 仍由 provider catalog/manual binding 决定。

未来若需要引入第三方生命周期提示，应作为单独产品设计，不与此次 capability resolution 改造混在一起。

---

## 二十、更新后的实施顺序

### Phase 0 — 冻结公共结构和不变量

定义：

* canonical capability schema；
* capability patch schema；
* evidence record；
* source identity；
* capability scope；
* implementation capability；
* resolved capability revision。

冻结：

* single resolution；
* order independence；
* runtime monotonic narrowing；
* compiler no widening。

### Phase 1 — 将当前 Provider Policy 接入统一 Resolver

暂不接 models.dev。

把当前：

* DeepSeek policy；
* Anthropic exact-model rules；
* OpenAI capability manifest；
* Gemini rules；

逐步适配/转换成 built-in reviewed rules。

先允许 adapter，避免大规模一次性重写。

### Phase 2 — 切换所有消费者

让：

* Catalog；
* Model Picker；
* Composer；
* Generation controls；
* Preflight；
* Runtime Snapshot；
* Compiler；

全部绑定统一 resolved capability revision。

删除旧：

* provider UI 特判；
* fallback enums；
* model capability regex；
* coarse/fine 双重独立 capability gate；
* compiler model allowlist。

### Phase 3 — 数据化现有 Provider Policy

将已经稳定转换的 TypeScript provider capability rules 移到 versioned built-in rule packs。

Provider source code 仅保留：

* adapter；
* codec；
* transport；
* stream/continuation implementation。

### Phase 4 — models.dev Normalization + Shadow

实现：

* schema validation；
* exact identity join；
* scope；
* provenance；
* freshness；
* snapshot revision；
* LKG。

完整参与 diagnostics，但暂不参与生产裁决。

### Phase 5 — 启用 models.dev Evidence

在 shadow 数据验证通过后，将其作为普通 external evidence source 加入同一次 resolution。

不增加任何：

* UI models.dev fallback；
* preflight models.dev branch；
* compiler models.dev branch。

### Phase 6 — 用户/云同步规则统一

用户本地与云同步 capability rules 全部进入相同 patch/resolution pipeline。

保证 built-in rules 和用户规则只是在 source/precedence 上不同，而不是两套规则系统。

---

## 二十一、必须机器验证的架构不变量

### Single Resolution

相同 evidence set + policy + implementation revision：

只能得到一个 resolved capability result。

### Permutation Invariance

改变 evidence 输入排列顺序：

不得改变 resolved result。

### Consumer Consistency

同一 capability revision 下：

```text
Catalog 展示为可用
⇔
UI 可以选择
⇔
Preflight 接受
⇔
Runtime Snapshot 可以包含
⇔
Compiler 有合法编码路径
```

### No Hidden Authority

UI、Preflight、Runtime、Compiler 中不得存在独立 provider/model capability allowlist。

### Runtime Monotonicity

```text
RuntimeCapability
⊆
ResolvedExecutableCapability
```

### No Compiler Widening

Compiler 不得发送 resolved/runtime capability 未允许的字段和值。

### External Evidence Cannot Create Availability

models.dev 等 external capability source 不能自行创建 model binding。

### Rule Revision Propagation

任何：

* built-in rule；
* user rule；
* models.dev evidence；
* provider capability fact；
* implementation capability；

发生有效变化，都必须产生新的 capability revision。

### Determinism

相同输入和相同 policy revision 必须产生完全相同的 canonical result 和 digest。

---

# 建议冻结的最终架构决策

1. **暂缓 models.dev 的生产接入。** 首先完成 Single Resolved Capability；models.dev 不能作为修复当前 capability 漂移的捷径。

2. **唯一最终事实源是 Resolved Capability，而不是任何输入数据源。** Provider API、models.dev、built-in rules、user/cloud rules 都只是输入。

3. **所有消费者共享同一个 base capability revision。** Catalog、UI、Preflight、Runtime Snapshot、Compiler 不得自行重新 resolve。

4. **Runtime Snapshot 是派生和单调收窄层。** 它记录 parent capability revision，可以产生 runtime revision，但不得重新裁决模型能力。

5. **模型能力体系采用 Canonical Capability Schema + Generic Patch Rules。** 不引入额外的 provider semantic IR。

6. **现有 provider policy 逐步数据化。** API 文档和开发者烟测形成的能力知识迁移为版本化 built-in reviewed rule packs，而不是永久保留为 TypeScript hardcode。

7. **迁移过程中保留现有 provider policy 作为输入适配层。** 不进行一次性大规模重写；最终 resolver 只消费公共 capability/rule 数据结构。

8. **Built-in rules 与 user/cloud rules 尽量共用同一种 patch schema。** 差别体现在 source、scope、precedence、revision 和 provenance。

9. **第一版规则语言保持小型化。** 优先使用 `set / add / remove / limit` 和必要的 conditional constraints；不预先设计全能 DSL。

10. **Availability 与 Capability 分离。** Provider active catalog/LKG 或显式 manual binding 建立模型可用性；models.dev 不能创建 binding 或 membership。

11. **Model Capability 与 Codec Implementation Capability 分离。** 最终 executable capability 是模型最终能力与 Starverse 当前实现能力的交集。

12. **Codec/Compiler 保留 wire knowledge，不保留 model capability knowledge。** request shape、字段映射、stream、continuation 等继续属于代码；具体模型支持哪些能力属于 capability resolution。

13. **现有 provider policy 中可以数据表达的 protocol restrictions 也应逐步规则化。** 只有真正需要执行算法的 codec/transport 行为留在代码。

14. **models.dev 拥有独立 evidence revision。** 它的刷新不等于 provider catalog 更新；所有 revision 最终共同进入 resolved capability revision。

15. **models.dev 接入前必须完成 schema、identity、scope、provenance、freshness 和 implementation compatibility 校验。**

16. **models.dev 的 identity join 必须是明确 provider mapping + exact native model ID。** 禁止 fuzzy、regex 和跨 provider 自动匹配。

17. **models.dev 接入时必须完整参与一次 resolution。** 禁止“只补 missing/unknown”的长期架构。

18. **禁止任何 source-order short circuit。** Resolver 必须收集完整 evidence set 后统一执行 precedence/conflict policy。

19. **Resolution 必须具有 permutation invariance。** 调整 evidence 输入顺序不能改变最终结果。

20. **Precedence 与 conflict policy 必须显式、版本化并可测试。** 不能通过 `if/else` 顺序形成隐性 authority。

21. **所有合法但未胜出的 evidence 仍进入 provenance/conflict diagnostics。** 低优先级来源不能因为没有赢就从 resolution 历史中消失。

22. **Freshness 是 evidence eligibility 的属性，不是“删除旧事实”。** stale/expired 数据仍可保留用于审计和 drift detection，但按 policy 决定是否参与裁决。

23. **models.dev 第一阶段进入 Shadow Resolution。** 完整做 normalization、join、conflict detection 和 diff，但暂不改变生产结果。

24. **models.dev 的 lifecycle/status 第一阶段只用于 review signal。** 不直接控制 active catalog visibility。

25. **Built-in reviewed rule packs 支持签名热更新、revision、原子发布、LKG 和 rollback。** 更新服务不可成为发送时硬依赖。

26. **用户 capability rules 可以真正修改最终模型能力表，但始终受 implementation capability 硬上限约束。**

27. **当前 coarse/fine capability 双重裁决必须消失。** coarse catalog 信息可以继续作为 display projection，但不能独立授权或拒绝发送。

28. **`assertActiveCatalogOptionalCapabilitiesV2` 一类逻辑应收敛为 binding/currentness/availability 相关检查，模型能力合法性进入统一 capability resolution。**

29. **旧 UI 静态 effort 表、fallback enums、model regex、provider-specific capability branches 必须在迁移完成后删除或失去 authority。**

30. **最终验收标准不是“models.dev 能用了”，而是增加或删除任意一个 evidence source 时，Catalog/UI/Preflight/Runtime/Compiler 无需增加新的 source-specific branch，仍自动得到一致结果。**

---

## 2026-08-17 Generation V2 纯 Wire Adapter 实施修订

本节覆盖本文中与当前 Generation V2 实施边界冲突的旧表述。

1. `ResolvedCapabilityV2` 的 `fields/domain/constraints` 是唯一模型能力与语义值域结论。Runtime Snapshot 只是封闭持久化 envelope，不再反向定义基础 capability vocabulary。
2. 不再建立或消费 `implementationCeiling`、implementation domain ceiling 或 implementation reject evidence。`EncodingCoverageRegistryV2` 只证明指定 provider/protocol/operation 存在对应 semantic path 的编码覆盖；它不提供、收窄或改写模型能力域。
3. `encoderRevision` 是独立的 wire implementation provenance，进入 Runtime Snapshot、prepared request provenance、snapshot hash，但不进入 capability revision。编码器升级不能伪装成模型能力变化，也不能绕过 capability validator。
4. Provider-owned/open enum（reasoning effort、thinking level、quality、verbosity 等）使用 bounded string 表示；具体允许值由 resolved capability domain 决定。Wire adapter 不维护模型 allowlist、alias map、clamp、fallback 或值转换；允许的 scalar/enum 按原值发送。
5. User/Cloud capability rules 的未来设计可以扩大或收窄 resolved domain，但不能创建 model availability；即使规则扩大域，也必须有对应的 `EncodingCoverageRegistryV2` path coverage，且不改变 wire value。
6. 本阶段不接入 `models.dev`、User/Cloud rule 传输或热更新。后续接入时它们是 evidence/rule inputs，不得新增第二套最终 capability 表。
