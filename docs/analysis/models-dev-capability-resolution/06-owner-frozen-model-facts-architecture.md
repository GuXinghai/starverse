- **Lifecycle Status**: active
- **Document Role**: owner-decision
- **Last updated**: 2026-09-02

## Owner amendment：Cloud/User Rules、同构 Pack/Rule 与 exact-subject materialization（2026-09-02）

本 amendment 由 [`12-model-facts-ui-synchronization-plan.md`](12-model-facts-ui-synchronization-plan.md) 完整定义；它只修订 Capability Rules 的 ownership/lifecycle、activation、模型身份输入与 Rule materialization，不授权 Goal 3，也不改变“三套 Model Facts sources”结论。

Cloud-managed Rules 与 User Rules 共同组成唯一的 Capability Rules source，不得被实现成两个新的 Model Facts sources。二者必须共享同一 Pack/Rule domain model、stable identity、priority、selector/assertion、Pack → Rule hierarchy、Rule configured state `default | on | off`、Pack mode `override | default_only | no_control`、Pack target `enabled | disabled`、effective activation 与 one-shot Rewrite 语义；差异只允许存在于 ownership、mutability、persistence 和 update lifecycle。

Starverse 不再把 Rules 作为随应用永久 bundled 的特殊 built-in dataset。Cloud-managed content 只读，由 Owner 指定的 Cloud distribution source更新；首次获取失败且本地没有成功snapshot时Cloud Rules为空，成功snapshot作为LKG保留且refresh失败不得清空。User content可编辑并通过tab-scoped draft批量原子保存。Cloud/User可以拥有各自内部content/config/activation revision，但当前已应用Cloud Rules、已提交User Rules、activation、priority与materialized claims必须共同发布为一个 Capability Rules canonical source snapshot/revision。Cloud候选和未保存User draft不改变该source revision。

Cloud Rules default activation policy可配置且初始为enabled，只作用于Cloud ownership。在`no_control`下，configured `on/off`分别直接启用/停用，configured `default`才继承该Cloud policy。User ownership不得继承Cloud default policy。Rewrite是一次性mutation：`override`改写当前全部子Rules，`default_only`只改写当前configured=`default`的子Rules，`no_control`不可用；未来Rules不受历史Rewrite影响。

Authoritative exact-subject set只来自官方/provider-native模型枚举，以及compatible/third-party scope中正式配置的custom acquisition/parser或manual exact IDs。models.dev、Rule selector、regex例子、alias和display name均不得创建model subject。Rule regex只在Rule/source或authoritative-subject-set revision变化时用于materialization，输出必须绑定exact subject；不得在send、preflight或Goal 3 resolution时运行regex。Goal 2C中bundled built-in与按请求query-bound matching是待迁移历史实现，不再代表目标架构。

Cloud distribution的repository/ref/release authority、manifest、version/revision、digest/integrity、candidate acquisition、redirect、retention与rollback contract必须由Owner另行冻结；实施Agent不得自行决定。

## Owner amendment：Capability Rule selector（2026-08-28）

本 amendment **仅替代第六十四节中“当前只允许 exact、regex 留待未来”的 selector 结论**；其余 Owner 决策继续有效。

修订后的冻结规则：exact native model identity仍是首选且优先级最高；Capability Rules允许严格受限、provider + endpoint/profile scoped、完整锚定并具有独立 evidence和正反例测试的 regex selector。Regex只做 identity selection，不生成 capability semantics；exact rule在同 semantic path上覆盖 regex。仍禁止 wildcard/family inheritance/alias matching、宽泛语义猜测和通用 Rule Matching DSL。具体 guardrails与当前事实质量 closeout以 [`09-goal-2a-fix-evidence-and-matching-closeout.md`](09-goal-2a-fix-evidence-and-matching-closeout.md) 的“Derived inference 与 regex”节为准。

第十一节的“regex 自动归并”特指通过 regex自动建立 canonical model identity/join、family inheritance或跨 Provider归并，不包括本 amendment允许的 Capability Rule identity selector。

因此，后文第六十四节应作为 amendment前的历史文字阅读，不能再被实现解释为“schema必须拒绝所有 regex”。

## Owner amendment：逐模型 Operation Support（2026-08-30）

本 amendment只澄清第三十九、四十节的归属边界：第三十九节中的 `API operation support` 特指 API/protocol surface本身是否提供某 operation，以及该 operation的 request schema、wire method、URL与通用 contract。Provider若对 exact model明确声明其支持哪些 operations，该逐模型 support assertion属于 Model Facts；第四十节对此优先。

因此 Google `supportedGenerationMethods` 这类逐模型列表可映射为 source-neutral operation capability；原始 method name和调用结构仍属于 API Contract。该 amendment不允许按当前 operation拆分多个 facts universe，也不允许从 API存在某 method反推所有模型都支持它。

## Owner amendment：models.dev Official API Raw Source（2026-08-31）

Starverse 的 models.dev Raw Source 冻结为 models.dev 官方部署 API `https://models.dev/api.json` 返回的扁平化 payload。实际持久化并经过 sanitizer 的 API payload是该 source surface的 raw audit authority；canonical claim provenance指向该 payload中实际存在的 provider/model record与具体字段。

官方 API未暴露的 `base_model`、`base_model_omit`、生成器内部继承链和 base/provider override contributor不得由 Starverse猜测、重建或伪造。API中的 provider-specific model record视为 models.dev已完成自身 composition后对外发布的 source-native record；Starverse只解释该公开结果，不声称知道字段来自 base还是override。

models.dev API payload digest、source snapshot revision、adapter/mapping revision与freshness仍分别保存。若未来改用 models.dev Git source/TOML作为另一 source surface，必须使用新的显式 surface/adapter revision与provenance契约，不得悄悄改变现有API snapshot的证据含义。

以下作为本轮“模型统一事实源”一期的最终冻结决策。它整合了你后续所有修正，包括：`models.list` 术语纠正、`models.dev` 优先级、未知能力放行、坏字段局部隔离、模型从 API 消失即移除、来源不唯一、完整列表冲突、native value/alias 分离，以及对现有 `ResolvedCapabilityV2` 职责耦合的补充修正。

# Starverse 模型统一事实源一期最终 Owner 决策

## 一、目标与总体架构

Starverse 不再建立第二套平行的“统一模型事实结果”。

现有 Generation V2 已经具备 `ResolvedCapabilityV2`、evidence、typed domain、`capabilityRevision`、`controlsProjection` 等核心基础，应当以这套基础设施继续演进，而不是重新建设另一套 authority。当前代码本身也明确把 `ResolvedCapabilityV2` 描述为 exact provider/model binding 的 command-independent capability conclusion。

但这里有一个重要修正：

> **复用现有 `ResolvedCapabilityV2` 基础设施，不等于把它当前的全部职责原样提升为“模型事实本体”。**

当前 resolution request 仍包含 `protocolId` 和 `operation`，现有 canonicalization 还会检查 Encoding Coverage，因此目前实际上仍混合了 model facts、protocol/operation scope 和执行编码能力。

最终逻辑应收敛为：

```text
多事实来源
   ↓
Canonical Model Facts
   ↓
统一模型事实解析
   ↓
Resolved Capability Facts
   ↓
+ API Contract
+ 当前 Operation
+ Encoding Coverage
+ Runtime Hard Constraints
+ Execution Policy
   ↓
Generation Authorization / Projection
```

允许内部重构 `ResolvedCapabilityV2` 的结构，但不得因此再产生两个可以被消费者独立读取、独立裁决能力的 authority。

---

# 二、一期事实来源只有三类

一期默认模型 capability facts 来源固定为：

```text
1. Provider 原生事实
2. models.dev
3. Capability Rules
```

默认优先级：

```text
Provider 原生事实
        >
models.dev
        >
Capability Rules
```

用户以后可以修改来源优先级。

未来统一解析架构允许 Capability Rule 单条配置优先级，也允许 rule pack 批量配置；当前 Goal 2A 数据库 schema 尚未提供可编辑的 pack-level priority，Goal 2C 的 source contract因此以显式 neutral pack priority保留该维度，不伪造现有配置能力。

---

## 三、纠正 `models.list` 的术语

此前把 `models.dev` 错称为 `models.list`，现正式纠正。

`models.list` 或类似：

```text
GET /models
GET /v1/models
```

是 Starverse 直接从当前 Provider API 获取的数据。

因此：

> **Provider 的 models list 不是一个独立于 Provider 的第二事实源，它本身属于 Provider 原生事实。**

如果 `/models` 返回：

* capability；
* modalities；
* context limit；
* supported parameters；
* model metadata；

这些都属于 Provider 原生事实。

而 `models.dev` 是独立第三方整理后的 capability metadata source。

因此不得再出现：

```text
Provider
models.list
models.dev
Rules
```

这种四层来源分类。

正确的是：

```text
Provider Native
   └── models/list 等 Provider API

models.dev

Capability Rules
```

---

# 四、Provider 原生事实是最高默认优先级

Provider 当前直接返回的信息原则上优先于第三方整理数据。

例如：

```text
Provider:
reasoning = unsupported

models.dev:
reasoning = supported
```

最终当前事实采用：

```text
reasoning = unsupported
```

但 models.dev 的相反信息不能静默删除，必须继续作为当前 opposing/overridden evidence 保留。

---

# 五、models.dev 的定位

`models.dev` 只作为：

> **第三方 capability metadata / evidence source。**

它适合补充：

* reasoning；
* reasoning effort；
* tools；
* structured output；
* input/output modalities；
* context limits；
* model-specific limits；
* 其他模型能力信息。

但它不能决定当前模型是否实际存在于用户正在使用的 Provider/endpoint。

因此：

```text
models.dev 中存在某模型
≠ 当前 Provider 可用该模型
```

---

# 六、一期不新增第四个事实源

当前不接入新的第三方目录。

也不建立：

* 社区模型能力数据库；
* 自动网络 probe authority；
* runtime 自动学习 authority；
* “请求成功就记 supported”；
* “请求失败就记 unsupported”。

运行请求和 Provider response 可以继续保存作为 diagnostics，但一期不把运行结果自动提升为持久 capability facts。

未来若需要，可作为独立增强，而不是一期事实源设计的一部分。

---

# 七、Capability Facts 与 Availability 严格分离

Capability 回答：

> 模型具有什么能力？

Availability 回答：

> 当前 Provider/credential/endpoint 下这个模型现在能不能选、能不能调用？

两者不得混为一谈。

因此：

```text
models.dev
Capability Rules
```

均不得凭自身创建 model availability。

---

# 八、Provider 模型列表决定 Availability 的规则

对于具有权威模型枚举 API 的 serving scope：

只要 Provider 模型列表 API：

1. 请求成功；
2. 响应完整；
3. schema 有效；
4. 确认属于当前 scope；

那么它返回的模型集合就是当前 availability。

因此，如果模型从一次成功的 Provider API 返回中消失：

```text
立即从当前 availability 移除
```

无需：

* 连续两次确认；
* 等待若干小时；
* grace period；
* 人工确认。

如果以后又从 API 中出现：

```text
立即重新添加
```

这就是正常的动态模型生命周期。

---

# 九、刷新失败绝不能等价于模型消失

如果发生：

* network error；
* proxy unavailable；
* authentication failure；
* timeout；
* malformed response；
* response decode failure；
* snapshot 整体无法确认；

则：

```text
refresh failure
≠ model disappeared
```

继续使用上一份 last-known-good（LKG）availability。

不得清空当前模型列表。

---

# 十、没有权威模型枚举 API 的 Scope 例外

上一条只适用于真正拥有 authoritative model enumeration API 的 scope。

对于：

* explicit local profile；
* 某些 compatible endpoint；
* 其他没有权威 `/models` 列表的 binding；

availability 继续由其明确 profile/binding/configuration 决定。

不能为了统一而强行假装所有 Provider 都存在可靠 `/models` API。

当前 Provider Contract 本身已经存在不同 model binding policy，因此实现上必须尊重这种差异。

---

# 十一、模型身份必须精确绑定

模型事实至少绑定：

```text
Provider
Endpoint / Profile
Exact native model ID
```

availability 还应考虑当前 credential scope。

禁止默认：

* fuzzy matching；
* prefix matching；
* regex 自动归并；
* 按“模型家族”自动继承；
* 跨 Provider 合并同名模型。

例如：

```text
provider-A / model-x
provider-B / model-x
```

默认不是同一 capability identity。

---

# 十二、models.dev 必须 Exact Join

models.dev evidence 的 join 原则：

```text
exact provider identity
+
exact native model ID
```

如果无法可靠匹配：

```text
不生成 models.dev evidence
```

不得为了“提高覆盖率”自行：

```text
fuzzy join
prefix join
regex join
family inheritance
cross-provider alias join
```

如果 models.dev 自己已经给出了 provider-specific 最终模型记录，可以消费该记录；Starverse 不再自行跨 Provider 推理。

---

# 十三、models.dev 生命周期信息不控制 Availability

即使 models.dev 标记：

```text
deprecated
archived
removed
```

也不能直接让 Starverse：

```text
删除 Provider 仍然返回的模型
隐藏 Provider 仍然返回的模型
把 availability 改为 false
```

这些信息最多作为：

```text
maintenance signal
review signal
diagnostic information
```

当前模型是否可用仍由 Provider 当前 serving scope 决定。

---

# 十四、统一事实状态

最终事实至少能表达：

```text
supported
unsupported
unknown
conflict
```

同时 source-level ingestion 还需要区分：

```text
missing
invalid
```

这里必须明确：

```text
missing ≠ unsupported
invalid ≠ unsupported
unknown ≠ unsupported
```

---

# 十五、`missing` 的语义

某一来源没有提供字段，只意味着：

```text
该来源没有声明
```

例如：

```text
Provider:
reasoning.effort = missing

models.dev:
reasoning.effort = [high, max]
```

那么 models.dev 可以补充这一字段。

不得因为高优先级 Provider 没写，就把结果解释为：

```text
unsupported
```

也不得阻止低优先级来源补空缺。

---

# 十六、`invalid` 的语义

如果某来源提供了字段，但数据 malformed 或无法通过 canonical validation：

它应当是：

```text
invalid source evidence
```

而不是伪装为：

```text
missing
```

更不能变成：

```text
unsupported
```

这样 diagnostics 才能区分：

> “Provider 根本没提供”

与

> “Provider 提供了，但数据坏了”。

---

# 十七、Unknown 必须保持 Unknown

最重要的事实原则：

```text
unknown ≠ supported
unknown ≠ unsupported
```

为了允许用户尝试，不能把：

```text
unknown
```

伪装为：

```text
supported
```

同样不能因为无法证明就默认：

```text
unsupported
```

事实系统只负责描述知识状态。

---

# 十八、Unknown 默认允许尝试

一期采用 permissive unknown。

如果：

1. 没有明确 `unsupported`；
2. API contract 没有明确禁止；
3. Starverse encoder 可以表达该请求；
4. 没有硬技术约束；
5. 没有硬安全约束；

则：

```text
unknown
→ 允许尝试
```

可以在 UI 表示：

```text
未验证
未知支持状态
```

但不能直接阻止用户使用。

当前代码仍会把 `unknown` 转成 `FIELD_UNAVAILABLE`，这是明确需要修改的现有实现差距。

---

# 十九、事实系统不负责控制产品行为

统一事实源只提供事实。

不允许出现：

```text
为了让 UI 不显示某个选项
→ 把 supported 改成 unsupported
```

也不设计诸如：

> “模型支持 low，但 Starverse 产品上故意不允许用户使用 low。”

这类没有现实需求的产品限制机制。

一期不建立“主动阉割模型能力”的 Product Policy 层。

---

# 二十、Execution Policy 只处理真实存在的执行问题

Execution Policy 只负责已经存在的实际问题，例如：

```text
unknown 是否允许尝试
```

以及：

```text
hard technical constraint
hard security constraint
```

它不得改写 capability facts。

---

# 二十一、合并必须按 Capability 子项进行

不能给整个模型只挂：

```text
source = provider
```

然后认为所有能力都来自 Provider。

例如：

```text
reasoning.support
    Provider + models.dev

reasoning.effort
    models.dev

image.max_width
    Capability Rule
```

完全合法。

因此 merge 必须是：

> field/subfield granular（字段/子字段粒度）。

---

# 二十二、来源优先级只作用于实际重叠字段

默认优先级：

```text
Provider
>
models.dev
>
Capability Rules
```

但只有在：

> 两个来源都明确声明同一个 capability field/subfield

时才发生优先级竞争。

高优先级来源沉默，不会压制低优先级补充。

---

# 二十三、完整 List / Range 必须整体竞争

如果两个来源都明确表示自己给出的是 complete/exhaustive domain：

```text
Provider:
effort = [low, high]

models.dev:
effort = [low, high, max]
```

禁止自动：

```text
union
→ [low, high, max]
```

因为这会让低优先级来源扩大高优先级来源声明的能力。

正确规则：

```text
完整列表/范围作为一个完整事实参与优先级竞争
```

高优先级整体胜出。

---

# 二十四、只有明确 Partial 数据才能补范围

如果来源明确声明：

```text
partial
non-exhaustive
```

则可以允许其他来源填补未知部分。

但：

> 不能因为一个列表比较短，就自行猜测它是 partial。

Completeness 必须有明确语义。

---

# 二十五、同优先级冲突必须保留 `conflict`

如果：

```text
Source A priority=2:
supported

Source B priority=2:
unsupported
```

则：

```text
result = conflict
```

不能依赖：

* load order；
* refresh order；
* Map iteration；
* last writer wins；
* 数据库插入顺序。

同样输入必须得到确定性结果。

用户自定义 conflict resolution strategy 可以未来增加，但一期不设计。

---

# 二十六、不同优先级冲突保留全部来源

例如：

```text
Provider:
tools = unsupported

models.dev:
tools = supported
```

最终当前采用：

```text
tools = unsupported
```

但系统必须继续保留：

```text
Provider:
unsupported
selected

models.dev:
supported
overridden
```

不能把低优先级事实直接删除。

---

# 二十七、一个 Capability 子项的来源可以不唯一

最终 provenance 不是：

```text
winningSource: provider
```

这么简单。

如果：

```text
Provider:
reasoning = supported

models.dev:
reasoning = supported
```

应当保留两个 supporting source。

如果还有 Rule：

```text
reasoning = unsupported
```

则 provenance 中同时存在：

```text
supporting sources
opposing sources
selected value
priority reason
```

因此：

> 每个能力子项记录全部当前相关有效来源，而不是只记录单一胜出来源。

---

# 二十八、显式事实优于派生事实

在同一来源、同一优先级中：

```text
explicit declaration
>
derived fact
```

派生规则只能补空缺。

例如：

```text
reasoning.effort = [high, max]
```

可以通过显式 derivation rule 推导：

```text
reasoning = supported
```

但如果来源又明确声明：

```text
reasoning = unsupported
```

则 explicit declaration 优先。

---

# 二十九、派生关系必须显式定义

不得随意链式推理。

允许：

```text
存在 reasoning.effort domain
→ reasoning supported
```

前提是该 derivation 已经登记为 canonical rule。

但是：

```text
max unsupported
```

不得自动推理成：

```text
reasoning unsupported
```

因为 high 仍可能支持。

---

# 三十、必须支持 Partial Knowledge

一个能力不能因为其中一个子字段未知，就整体降为 unknown。

例如：

```text
image.support = supported
image.aspectRatios = [1:1, 16:9]
image.maxPixels = unknown
```

这是合法的。

不能得到：

```text
image = unknown
```

因此事实结构必须支持字段级 partial knowledge。

---

# 三十一、Capability Schema 必须可扩展

不能继续长期依赖固定布尔：

```text
reasoning
tools
structuredOutputs
vision
longContext
```

当前 Catalog 仍然存在这种固定 `CatalogModelCapabilities`，它是需要迁移掉的独立 capability projection。

最终应能表达：

```text
reasoning.support
reasoning.effort

image.support
image.aspectRatios
image.dimensions

context.maxInput
context.maxOutput

modalities.input
modalities.output

tools.support
structuredOutput.support
...
```

---

# 三十二、但 Schema 不能变成无限自由 JSON

扩展性不意味着允许：

```text
arbitrary meaningless keys
```

必须有 canonical semantic path 和 canonical value type。

例如：

* boolean；
* enum；
* enum list；
* range；
* dimensions；
* string list；
* typed structured value。

现有 `ResolvedCapabilityV2` 已经拥有比较丰富的 typed domain 实现，应优先复用/扩展，而不是另造不兼容的类型系统。

---

# 三十三、Native Values 与 Compatibility Aliases 严格分离

这是最新补充的重要原则。

例如模型/API 的真实 native effort 是：

```text
low
high
max
```

而某兼容层接受：

```text
medium → high
xhigh → high
```

那么模型事实只能记录：

```text
reasoning.effort.nativeValues
= [low, high, max]
```

`medium` / `xhigh` 不得被塞进模型原生 capability domain。

它们属于：

```text
API compatibility alias
normalization rule
contract mapping
```

---

# 三十四、UI 原则上展示 Native Capability

如果模型真实支持：

```text
low
high
max
```

则 UI 应基于真实 capability 展示这些值。

Compatibility alias 是兼容输入机制，而不是新的模型能力。

不能因为 API 接受：

```text
medium
```

就让用户误以为模型存在一个真正独立的 `medium` reasoning level。

---

# 三十五、Capability Rules 只允许表达事实

一期中的第三来源：

```text
Capability Rules
```

必须严格限定为：

> factual capability assertion/correction。

例如：

```text
model X supports reasoning
model X max context = ...
model X image size = ...
```

可以进入事实 Resolver。

---

# 三十六、API Compatibility Rule 不属于 Capability Facts

例如：

```text
medium → high
reasoning_* → targetPath
omit field X when condition Y
```

属于：

```text
API Contract
Compatibility Mapping
Wire Mapping
```

不属于模型 capability facts。

因此不能进入：

```text
Provider > models.dev > Capability Rules
```

这个事实优先级体系。

二者是不同 ontology（知识域）。

---

# 三十七、API Contract 独立治理

API Contract 回答：

> 当前 API 接受什么请求？

例如：

```text
字段名称
字段类型
允许值
条件约束
字段组合
协议 operation
互斥关系
版本
```

它与模型事实分开。

后续 API documentation contract 应逐步采用：

> **versioned/configurable rule packs（版本化可变规则）**

而不是把大量文档契约永久散落硬编码在业务代码中。

---

# 三十八、Provider Codec 继续负责机械 Wire Encoding

Codec 回答：

> 怎么把 semantic intent 编码成 Provider 请求？

例如：

```text
semantic reasoning.effort
→ wire reasoning_effort
```

或者：

```text
semantic field
→ nested JSON path
```

这些机械编码可以存在 Provider Codec。

但：

```text
这个模型到底支持哪些 effort
```

不是 Codec 的职责。

---

# 三十九、模型特定边界与 API 通用边界分开

属于模型 facts：

```text
model-specific reasoning effort
model-specific image dimensions
model-specific aspect ratios
model-specific context limit
model-specific modalities
provider-declared exact-model operation support
```

属于 API contract：

```text
通用 JSON request structure
字段 wire path
通用 API enum
通用 request constraint
API/protocol surface operation availability、request schema 与 wire contract
compatibility alias
```

必须按“它是否是模型本身特有事实”判断归属。

---

# 四十、基础模型事实不按 Operation 拆成多套 Universe

不能建立：

```text
text facts
image facts
file facts
```

三套互相独立的模型真相。

一个模型是一份事实本体。

如果模型只支持某个 API surface 或某类 operation，这可以表达为 capability，例如：

```text
api.responses = supported
image.generate = supported
image.edit = unsupported
```

但不是复制整个事实世界。

---

# 四十一、当前 `operation` Scope 只能视为执行 Projection

当前 `GenerationCapabilityResolutionRequestV2` 仍包含：

```text
operation
protocolId
```

这是现有实现事实。

迁移后它们可以继续参与：

```text
generation-specific projection
authorization
runtime snapshot
```

但不能定义基础 model facts identity。

---

# 四十二、Raw Facts 必须保留

每个来源应尽量保留原始数据：

```text
Provider raw response
models.dev raw snapshot
rule source
```

现有 Catalog 已经有 `CatalogRawEnvelope` 保存 contributing raw source buckets，这个方向应保留。

用途：

* diagnostics；
* future re-normalization；
* schema migration；
* provenance；
* source debugging。

---

# 四十三、Adapter 只能做 Normalize

Source Adapter 的职责：

```text
Raw Source
   ↓
Canonical Facts
```

不得在 Adapter 内偷偷：

* 比较优先级；
* 解决冲突；
* 应用产品政策；
* 把 missing 改 unsupported；
* 把 unknown 改 supported；
* 做 silent fallback。

所有 merge/derivation 统一交给 Resolver。

---

# 四十四、坏字段采用局部隔离，而不是整份废弃

这是最新明确修正。

一次刷新中，如果：

```text
reasoning valid
tools valid
context malformed
vision valid
```

则：

```text
reasoning → 接受新值
tools     → 接受新值
vision    → 接受新值
context   → 单独隔离
```

不能因为一个字段坏了就浪费整个成功 snapshot。

---

# 四十五、坏字段优先保留其 LKG

对于 malformed field：

如果该字段之前存在有效值：

```text
继续使用上一版 valid LKG
```

同时记录：

```text
current refresh field invalid
```

如果没有旧值，则由其他有效事实来源参与解析，最终可能得到：

```text
其他来源值
或 unknown
```

但不能假装该坏字段从未出现。

---

# 四十六、只有 Snapshot 整体失去可信性才整份拒绝

例如：

* 根本无法解析；
* model identity 无法确定；
* provider identity 无法确定；
* schema 整体不可信；
* payload 根本不是预期响应；

才整份 rejected。

---

# 四十七、各事实来源独立刷新

Provider、models.dev、Capability Rules 各自维护：

```text
snapshot
revision
updatedAt
freshness
LKG
```

Provider 刷新不能修改 models.dev 的 freshness。

models.dev 刷新也不能让 Provider snapshot revision 看起来发生变化。

---

# 四十八、每个来源拥有独立 Revision

例如：

```text
providerRevision
modelsDevRevision
ruleRevision
```

分别追踪。

然后统一 Resolver 从当前各来源 snapshot 生成：

```text
merged capabilityRevision
```

---

# 四十九、Final Resolved Facts 有自己的 Revision

以下任一变化都必须导致重新计算：

* Provider fact snapshot；
* models.dev snapshot；
* Capability Rule；
* source priority；
* 未来 conflict strategy。

产生新的：

```text
capabilityRevision
```

现有代码已有该机制基础，应继续复用。

---

# 五十、一次 Send 必须冻结同一个 Revision

从用户开始发送，到：

* preflight；
* authorization；
* runtime snapshot；
* compiler；

必须使用同一份 capability revision。

不能出现：

```text
Composer 看 revision A
Preflight 看 revision B
Compiler 看 revision C
```

当前 Compiler 已经在检查同一 resolved capability revision，这个架构方向必须保留。

---

# 五十一、刷新采用完整计算后原子切换

不得让消费者看到半新半旧事实。

正确过程：

```text
新来源 snapshot
      ↓
字段级 validation
      ↓
合并当前所有有效 source snapshots
      ↓
构建完整新 resolved result
      ↓
final validation
      ↓
atomic swap
```

消费者只会看到：

```text
完整旧 revision
```

或：

```text
完整新 revision
```

---

# 五十二、刷新频率由用户控制

不能简单把 OpenRouter 当前 refresh 策略变成全 Provider 通用默认。

允许提供：

```text
通用预设
```

但：

> 用户应可以配置刷新周期。

不同来源也可以拥有独立刷新周期。

---

# 五十三、所有 Capability Consumer 必须最终收口

目标消费者包括：

* Model Picker；
* Catalog badges；
* Composer；
* reasoning controls；
* generation parameter controls；
* attachment/file compatibility；
* Preflight；
* runtime；
* command authority；
* Compiler。

都必须通过同一 canonical resolved facts/revision 获取模型能力。

---

# 五十四、消费者不得直接读取 Raw Source 做决策

禁止：

```text
UI 直接查 models.dev
UI 直接解析 Provider raw
Preflight 自己查 Catalog boolean
Compiler 自己维护 model allowlist
File subsystem 自己维护 provider-specific capability map
```

Raw source 只给 ingestion/diagnostics。

---

# 五十五、Catalog 不再是独立 Capability Authority

当前 Catalog 仍直接保存：

```text
reasoning
tools
structuredOutputs
vision
longContext
```

固定布尔。

迁移期间如果性能需要，可以保留：

```text
projection/cache
```

但必须来自：

```text
Resolved Facts @ capabilityRevision
```

Catalog 自己不能继续产生第二套 capability truth。

---

# 五十六、旧 Catalog Capability Path 最终删除

完成 consumer migration 后：

* legacy capability booleans；
* provider-specific capability branches；
* duplicated supportedParameters authority；
* model regex capability；
* hard-coded model allowlist；
* silent capability fallback；

应当清理，而不是永久双轨兼容。

---

# 五十七、Runtime Snapshot 不是新 Authority

Runtime Snapshot 是：

> 某次 command/send 的冻结执行 envelope。

它可以加入：

* 当前工具；
* 当前附件；
* runtime-specific constraints；
* 当前 operation 信息。

但不得重新发明 model facts。

当前代码已经明确表示 runtime snapshot projection 不应创建另一个 authority，这一方向保持。

---

# 五十八、Compiler 不能扩大 Model Facts

Compiler 可以 defence-in-depth 检查：

```text
intent 是否超出 frozen capability
```

但不得：

```text
自行增加 capability
自行猜测 unsupported
自行删除 unknown
```

当前 compiler 已经复用同一 resolved capability record，这一点保持。

---

# 五十九、请求/响应原始信息继续保留

这一体系不应削弱 diagnostics。

发送失败时仍应尽量保留：

* Provider raw error；
* native finish reason；
* native response；
* request metadata；
* capability revision；
* contract revision。

不要因为统一事实源而把 Provider 原始错误过度分类或覆盖掉。

---

# 六十、不建立永久 Capability 历史档案

没有必要为了理论 replay 永久保存所有历史 capability version。

一期只要求：

* 当前有效 facts；
* 当前 provenance；
* 必要 LKG；
* 当前 overridden/conflicting evidence；
* 已发送请求所需的 runtime/request/response record。

过期 capability snapshots 可以按清理政策删除。

---

# 六十一、当前被覆盖值保留，历史版本链不保留

例如当前：

```text
Provider:
reasoning = supported

models.dev:
reasoning = unsupported
```

应保存当前：

```text
selected = supported
overridden = models.dev unsupported
```

但不需要保存过去六个月每一次 models.dev 对这个字段的值变化历史。

---

# 六十二、Requested Model ID 与实际 Provider Model ID 分开

如果存在：

* router；
* alias；
* compatible provider；
* provider-side model rewrite；

则至少区分：

```text
requestedModelId
resolved/providerReturnedModelId
```

不得在 diagnostics 和事实绑定中无条件认为二者相同。

---

# 六十三、一期不做用户自定义 Conflict Solver

默认：

```text
同优先级明确冲突
→ conflict
```

未来可以让用户指定：

```text
优先某来源
手工 override
其他策略
```

但一期不设计完整 conflict-policy DSL。

---

# 六十四、一期不设计复杂 Rule Matching DSL

当前原则是 exact identity。

未来 Capability Rule 若需要：

* wildcard；
* family rule；
* legacy/uncontrolled provider-code regex capability matching（不包括 amendment允许的 Capability Rule constrained regex selector）；
* aliases；

可以另行设计。

不应为了未来可能需要，现在就把事实 Resolver 做成无限通配语言。

---

# 六十五、不引入主动能力限制 Product Policy

最终确认删除此前类似：

```text
模型支持 low
但 Starverse 暂时不给用户选
```

这样的假设场景。

当前没有现实理由为这种行为设计专门机制。

因此一期没有“Starverse 可以主动缩减模型真实能力”的一般化产品策略。

---

# 六十六、需要执行政策的真实场景只有实际存在的场景

一期明确存在的主要 execution decision：

```text
unknown 是否可以发送
```

答案：

```text
默认可以尝试
```

另有：

```text
API contract 明确禁止
encoder 不存在
技术硬限制
安全硬限制
```

这些可以阻止执行。

---

# 六十七、API Contract 规则化属于后续独立工作，但接口边界现在冻结

虽然完整可变 contract rule system 可以后续实施，但模型事实体系现在必须按这个边界设计。

不能先把 contract information 塞进 capability facts，然后以后再说“以后拆”。

---

# 六十八、不得为了统一而把 API Contract 也称为“模型事实源”

最终概念必须清楚：

```text
Model Facts Sources:
- Provider Native
- models.dev
- Capability Rules

API Contract Sources:
- Provider docs
- reviewed contract data
- future configurable rules
```

即使二者都来自同一份 Provider 官方文档，也要按其语义分类。

例如：

> “Model X supports structured outputs”

是模型事实。

而：

> “Responses API 的 `reasoning.effort` 字段接受 X/Y/Z”

是 API contract。

---

# 六十九、最终实施目标不是“接 models.dev”

本 Goal 的真正名称/目标应理解为：

> **统一 Starverse 模型能力事实的生产、解析、版本和消费链路。**

models.dev 只是其中一个输入源。

不能把实施工作做成：

```text
Catalog 加 models.dev 字段
UI 再读 models.dev
```

然后声称 Goal 完成。

---

# 七十、一期明确不做的内容

一期明确不需要：

1. 第四个外部 capability database；
2. runtime capability auto-learning；
3. fuzzy model joins；
4. 永久 capability history；
5. 通用 conflict solver DSL；
6. 复杂 rule regex DSL；
7. 主动缩减真实模型能力的 Product Policy；
8. pricing/ranking/recommendation/default-model 进入 capability resolver；
9. 让 models.dev 决定 availability；
10. 让 API contract 成为 model capability facts；
11. 保留旧 parallel capability authority 作为永久 fallback。

---

# 七十一、建议 Agent 的实施顺序

实施时建议按以下阶段推进，而不是再次上抛新的 Owner 设计。

**Phase A：厘清现有 `ResolvedCapabilityV2`。**

保留：

* evidence；
* typed domains；
* canonicalization；
* digests；
* revision；
* projection。

解耦：

* model facts；
* protocol；
* operation；
* encoding coverage；
* execution authorization。

不得另建第二 authority。

**Phase B：统一 ingestion。**

建立：

```text
Provider Native Adapter
models.dev Adapter
Capability Rule Adapter
```

只负责 raw → canonical facts。

**Phase C：字段级 Resolver。**

落实：

* priorities；
* missing fill；
* explicit > derived；
* list/range whole-value conflict；
* partial knowledge；
* equal-priority conflict；
* complete provenance；
* invalid-field isolation。

**Phase D：Availability 收口。**

落实：

* authoritative Provider list；
* successful disappearance；
* reappearance；
* refresh failure LKG；
* explicit local/profile scope。

**Phase E：Consumer migration。**

迁移：

* Catalog；
* Picker；
* Composer；
* File/Attachment；
* Preflight；
* Runtime；
* Compiler。

**Phase F：删除旧路径。**

清理：

* legacy booleans；
* regex；
* hard-coded capability allowlists；
* duplicate provider-specific facts；
* silent fallbacks。

**Phase G：Unknown execution separation。**

将当前：

```text
unknown → FIELD_UNAVAILABLE
```

改为：

```text
fact = unknown
+
contract
+
encoding coverage
+
hard constraints
→ 默认 allow attempt
```

---

# 七十二、必须锁定的验收不变量

Agent 最终至少应机器验证以下行为：

1. 相同 source snapshots + priority，无论刷新顺序怎样，最终结果一致。
2. Provider 未声明某字段时，models.dev 可以补充。
3. `missing != unsupported`。
4. `invalid != missing`。
5. `invalid != unsupported`。
6. `unknown != unsupported`。
7. `unknown != supported`。
8. Unknown 在 contract/encoder/hard constraints 允许时可以发送。
9. Provider 与 models.dev 同字段冲突时，Provider 默认胜出。
10. 被覆盖的 models.dev evidence 仍保留 provenance。
11. 多个来源支持同一值时全部保留。
12. 完整 list/range 不自动 union。
13. 明确 partial list 可以按规则补充。
14. 同优先级反向事实得到 `conflict`。
15. refresh/load 顺序不能改变 resolution。
16. explicit declaration 优于 derived fact。
17. 派生规则不得任意扩散。
18. 一个子字段 unknown 不会污染整个 parent capability。
19. models.dev 无法 exact join 时不生成 evidence。
20. models.dev 不得创建 availability。
21. models.dev deprecated/archived 不得直接删除 Provider 当前模型。
22. Provider 模型 API 成功返回且模型消失时，立即移除 availability。
23. 模型以后重新出现时立即恢复。
24. Provider 模型 API 刷新失败时保留 LKG。
25. 某一个 capability 字段 malformed 时，其他有效字段仍正常更新。
26. malformed 字段有 LKG 时继续使用旧有效值并标记本次 invalid。
27. snapshot 整体失去 identity/schema trust 时整份拒绝。
28. 同 model ID 在不同 Provider/endpoint 下不得自动共享事实。
29. native values 与 compatibility aliases 不得混入同一个模型 capability domain。
30. API contract fields 不得写入 model facts resolver。
31. Catalog projection 必须可追溯到 `capabilityRevision`。
32. UI、Preflight、Runtime、Compiler 对同一 send 使用同一 capability revision。
33. Runtime Snapshot 不得扩大基础 capability。
34. Compiler 不得扩大基础 capability。
35. Raw provider/models.dev evidence 可以追溯。
36. Adapter 不得自行解决 priority/conflict。
37. Source refresh revision 独立。
38. merged result 有独立 revision。
39. final resolved snapshot 原子切换。
40. legacy capability fallback 在迁移完成后必须删除。

---

## 最终一句话冻结

Starverse 一期统一模型事实体系最终定义为：

> **以现有 Generation V2 capability 基础设施为核心但解耦其中的 protocol/operation/encoding 职责，将 Provider 原生事实、models.dev 与事实型 Capability Rules 按字段级、精确模型身份和可配置优先级统一解析；完整保留多来源 provenance、partial knowledge、conflict、LKG 与 revision；Provider 当前 serving scope 单独决定 availability；API contract、compatibility alias、wire encoding 与 execution authorization 与模型事实严格分离；unknown 保持 unknown，但在没有明确禁止及硬限制且可合法编码时默认允许尝试；最终所有消费者收口到同一 resolved revision，并删除现有平行 capability authority 与 legacy fallback。**

到这里，Owner 级一期架构可以正式冻结。后续 Agent 如果没有发现与上述规则真正矛盾的代码事实，就不应再因为实现细节暂停要求新的 Owner 裁决。
