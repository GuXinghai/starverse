# Model and Provider Identity Cross-review Synthesis

- **Lifecycle Status**: reference
- **Document Role**: candidate-action-list
- **Last updated**: 2026-08-14
- **Authority**: Point-in-time analysis; not an SSOT. Current code and owner decisions take precedence.

---
只看这三份 hard-cut 后报告，我的结论已经比之前清晰很多：**Starverse 当前的主体身份模型基本正确，下一阶段的重点应从“删除兼容层”转向“把真实存在的领域边界类型化、单点化，并修掉几处仍在撒谎的字段/投影”。**

先说明基线：Pro 和 Flash 以 `adcc8eff` 为主要基线，Sol 是更后的 `5f2d743`。因此涉及具体当前代码行为时，Sol 的报告时间上更接近当前状态；但 Pro 在 `adcc8eff` 已发现的 `google_ai_studio → gemini` 等问题，Sol 在后续 commit 仍独立发现，可信度很高。下面不会引入 hard-cut 前的结论。

## 三份报告真正形成的共识

三者现在实际上都承认：**不存在一个适合全仓统一的“ProviderId”概念。**

当前至少应区分：

| 领域                   | 推荐概念                                                     |
| -------------------- | -------------------------------------------------------- |
| Catalog 数据源          | `CatalogProviderKey` / `ProviderCatalogKnownProviderKey` |
| Conversation 用户路由    | `RuntimeProviderId`                                      |
| Generation 执行        | `GenerationExecutionProviderId`                          |
| Credential 槽         | `ProviderCredentialKey`                                  |
| OpenAI-compatible 实例 | `CompatibleProviderInstanceId`                           |
| Provider 回包          | response provenance，不属于 Starverse provider identity      |

模型侧则已经相当干净：

```text
Discovery:
nativeModelId
     ↓ invariant equality
Catalog:
modelId
     ↓
Conversation route:
modelId
     ↓
Generation:
requested modelId
     ↓
Provider API

Provider response:
reported model / modelVersion
```

而：

```text
modelKey = providerKey::modelId
```

只属于 Catalog/Preferences 的复合引用。

这一主体模型不用再“大重构”。

---

## 三份报告中几个需要明确裁决的地方

最明显的事实性问题出现在 Flash。

Flash 最后写：

> terminal artifact 不记录身份，身份已在 snapshot binding 全量落盘。

这个表述过度概括，按另外两份报告提供的源码证据是错误的。

Sol 明确逐 provider 检查了 reported identity：OpenRouter terminal artifact 保存 reported `model` 和 downstream `provider`，OpenAI、Anthropic、DeepSeek 也保存 reported model，Gemini 保存 `modelVersion`。Pro 同样明确区分了 wire/binding identity 与 provider 回显 identity。

这里可以同时成立的是：

```text
Generation request / snapshot
→ 保存 requested identity

generic attempt terminal state
→ 可能只有 fingerprint/status

provider-specific native terminal artifact
→ 可以保存 reported identity/provenance
```

Flash 把后两者混在了一起。

因此在“requested model 与 reported model”这件事上，**Sol 的描述最准确，Pro 次之，Flash 这一点应直接排除。**

---

另一个需要纠正的是 Flash 对 `CatalogProviderKey = string` 的解释。

Flash说 Catalog 必须是自由字符串，因为要容忍 OpenRouter 的任意 vendor slug。这个推理混淆了：

```text
Catalog source provider
```

和：

```text
model vendor / author
```

OpenRouter、Anthropic Messages、Google AI Studio 是 Catalog source；`openai`、`anthropic` 之类的模型作者/vendor 是模型属性。二者不是一个维度。

Pro 与 Sol 的描述合起来更准确：

```text
CatalogProviderKey
```

在某些公共类型上目前可能是开放 `string`；

而：

```text
ProviderCatalogKnownProviderKey
```

代表当前已经注册、允许进入 first-party Catalog → Runtime 路径的五个 source。

因此我建议继续保留这种“开放数据类型 + 闭合注册集”的结构，但明确规定：

```text
任意 CatalogProviderKey
        │
        │ 不能直接 cast
        ▼
isKnownCatalogProviderKey()
        │
        ▼
ProviderCatalogKnownProviderKey
        │
        ▼
RuntimeProviderId
```

这恰好解决 Sol 指出的 Preferences → quick route 强制 cast 问题。

---

### `nativeModelId`：Pro/Sol 的判断更稳

Flash再次认为：

```text
nativeModelId === modelId
```

所以 `nativeModelId` 是死冗余。

我仍不接受这个推导。

hard-cut 后现在已经很清楚：

```text
nativeModelId
= discovery evidence 中经过 provider adapter 规范化后的 callable ID

modelId
= Catalog authority 发布出去的 provider-scoped model ID
```

当前系统又主动强制：

```text
observation.nativeModelId === item.modelId
```

恰恰说明这是一个**跨层 invariant**。

跨层 invariant 的两端值相等，不代表两端概念没有区分价值。例如：

```text
HTTP request model
generation snapshot requestedModel
```

很多时候也相等，但不能因此删除其中一个。

因此这里采用 Pro/Sol 的处理：

```text
nativeModelId
→ 只存在 discovery/observation

modelId
→ 从 Catalog 开始向下
```

不推广 `nativeModelId`，也暂时不删除。

---

## Provider namespace：我认为 Sol 的抽象最准确，Pro 的调查最有价值

Pro 把 namespace 全仓查得最好。

尤其是它找到：

```text
Runtime:
anthropic_messages

Credential:
anthropic

Generation:
anthropic
```

以及：

```text
lm_studio     → lmstudio
ollama_local  → ollama
local_endpoint → generic_local
```

这是非常有价值的。

不过 Pro 有一处措辞本身需要修正。

它把：

```text
activeCatalogModelAuthorityV2Service
```

中的某个转换描述成：

> catalog key → GenV2 provider_id

紧接着它自己又证明：

```text
google_ai_studio → gemini
```

产生的 `gemini` 根本不是当前 Generation V2 contract/provider binding 的合法值；真正 binding 用的是：

```text
google_ai_studio
```

所以这里实际应该叫：

> 某个 active-catalog evidence/provider projection

它并非真正的 Catalog → Generation identity authority。

Sol 对真正的权威链描述更准确：

```text
Conversation RuntimeProviderId
        ↓
GenerationV2Route
        ↓
Provider contract / verified profile
        ↓
binding.providerId
```

尤其 Generation authority 不信任 renderer command 里的 `providerId`，最终 binding provider 从 contract/profile authority 产生，这一点是很好的安全边界。

所以：

**Pro 最擅长发现 mapping 混乱；Sol 更准确地识别了哪些 mapping 才是真正的 authority。**

---

## `google_ai_studio → gemini` 是现在最确定、最应该直接修的错误

这一点 Pro 和 Sol 独立一致，而且跨两个 checkout 仍然存在。

当前 authoritative contract/binding 使用：

```text
google_ai_studio
```

但是 active Catalog authority 某处构造了：

```text
gemini
```

同时 registry 里还有为此准备的接受分支。

这已经不是“合法 namespace 差异”，因为：

```text
gemini
```

并不属于那个对象声称所在的 identity domain。

它现在之所以没有造成发送错误，只因为这个字段目前没有参与 Gemini binding authority。

因此应直接：

```text
删除 google_ai_studio → gemini
删除对应 dead acceptance branch
```

然后加入 registry-wide invariant 测试。

这件事无需进一步架构讨论。

---

## Anthropic 映射应该集中，但不要把 identity 空间合并

这里 Pro 的建议方向很好，但我会采用 Sol 式边界。

当前：

```text
Catalog:
anthropic_messages

Credential:
anthropic

Generation:
anthropic
```

差异本身有合理性。

问题是映射散落在：

```text
Catalog registry
active Catalog authority
route mapping
session projection
...
```

所以应该把映射集中起来。

不过我不推荐造一个巨大的：

```ts
GlobalProviderRegistry
```

把所有 provider 世界塞进同一张表。

更适合的是两个有限 registry。

第一张负责 first-party Catalog authority：

```ts
type ProviderCatalogAuthorityEntry = {
  catalogProviderKey: ProviderCatalogKnownProviderKey
  runtimeProviderId: RuntimeProviderId
  credentialKey: ProviderCredentialKey
  executionProviderId: GenerationExecutionProviderId
  modelsContractId: ...
  endpointProfileId: ...
}
```

例如：

```text
anthropic_messages
→ anthropic_messages
→ anthropic
→ anthropic
```

第二张负责 Runtime route → Generation：

```text
lm_studio
→ lmstudio_openresponses
→ lmstudio

ollama_local
→ ollama_chat
→ ollama

local_endpoint
→ generic_local_openai_chat
→ generic_local
```

这样 first-party Catalog 与 local runtime 不被强塞进一个抽象。

这是我认为 Pro 与 Sol 两套方案最合理的融合点。

---

## Flash 所说“应该统一本地 provider 字符串”需要谨慎

Flash认为：

```text
lm_studio / lmstudio
ollama_local / ollama
local_endpoint / generic_local
```

没有外部理由不同，所以可以直接统一。

我不建议现在这样做。

这些名字现在分别表达：

```text
Conversation route identity
```

和：

```text
Generation execution family
```

即使本地实现由 Starverse 完全控制，两者角色仍不同。

尤其：

```text
local_endpoint
```

意味着用户看到的“通用本地端点入口”；

而：

```text
generic_local
```

表达 Generation V2 中实际采用的 generic local execution contract。

这种差异完全可以是有意义的。

因此 Flash 自己提出的候选 B——建立单点映射——比候选 A“改数据库统一拼写”好很多。

而且 Flash 后面自己又说：

> 不应让 contract providerId 与 app enum 强绑定。

这与直接把 local profile provider ID 改成 `RuntimeProviderId` 本身存在一定张力。

---

## GenerationV2Identity 的问题：Flash 找得对，解法我更倾向 Sol

Flash指出：

```ts
GenerationV2Identity<'provider_id'>
```

实际只提供：

```text
非空
长度
控制字符
```

之类的 generic hygiene，并没有限制 provider ID 的合法 value set。

事实观察有价值。

但我不建议因此让：

```ts
GenerationV2Identity.create()
```

知道所有 provider。

否则底层通用 identity primitive 会反向依赖 provider registry。

更好的方式是增加：

```ts
type GenerationExecutionProviderId =
  | 'openrouter'
  | 'openai_responses'
  | 'google_ai_studio'
  | 'anthropic'
  | 'deepseek'
  | 'lmstudio'
  | 'ollama'
  | 'generic_local'
  | 'openai_compatible'
```

然后在：

```text
provider binding decoder
contract registry
history projection
```

这些真正需要 provider semantic validity 的边界验证。

所以：

```text
GenerationV2Identity<'provider_id'>
```

继续负责底层 identity sanitation；

```text
GenerationExecutionProviderId
```

负责领域值域。

这是比“给 identityV2 增加 per-kind 巨型 switch”更低耦合的方案。

---

## Sol 找到的历史投影 cast 是一个真实类型错误

这个问题我会排在很前面。

Generation history 返回的是：

```text
anthropic
lmstudio
ollama
generic_local
openai_compatible
```

但 UI 把它直接 cast 成：

```ts
RuntimeProviderId
```

显然不成立。

现在没导致 retry 错误，只因为 retry 真正依赖：

```text
protocolContractId
```

而不是这个 cast 后的值。

这属于典型的：

> runtime 行为碰巧正确，类型语义已经撒谎。

直接引入：

```ts
GenerationExecutionProviderId
```

以后历史数据就应该输出：

```ts
{
  executionProviderId,
  requestedModelId,
  protocolContractId,
  ...
}
```

UI 若要展示“对应哪个 Conversation provider”，显式调用 projection/mapping。

禁止：

```ts
as RuntimeProviderId
```

这是 hard-cut 后很适合继续做的类型清理。

---

## Pro 找到的 `ProviderFailureV2.context.providerId` 我认为非常重要

这个问题甚至比很多命名问题更值得修。

目前同一个：

```ts
context.providerId
```

有时装：

```text
anthropic_messages
```

有时装：

```text
anthropic
```

于是日志分析系统看到：

```text
providerId = anthropic
```

时，并不知道这是：

```text
Catalog？
Runtime？
Execution？
Credential？
```

这会直接污染诊断、统计和将来的 telemetry aggregation。

这里不应该“统一成一个 canonical providerId”。

我建议真正类型化：

```ts
type ProviderFailureIdentity =
  | {
      domain: 'catalog'
      providerKey: CatalogProviderKey
    }
  | {
      domain: 'runtime'
      providerId: RuntimeProviderId
    }
  | {
      domain: 'execution'
      providerId: GenerationExecutionProviderId
    }
  | {
      domain: 'credential'
      credentialKey: ProviderCredentialKey
    }
  | {
      domain: 'compatible_instance'
      providerInstanceId: CompatibleProviderInstanceId
    }
```

如果一次改动太大，最低限度也应该：

```ts
providerDomain
providerId
```

成对出现。

这是“承认多个 identity domain”真正落实到错误系统里的关键一步。

---

## OpenAI-compatible 是当前最大的“语义决策”，未必是 bug

Sol 这一项是三份报告中最值得认真考虑的新发现。

当前 route selection 持久化了非常完整的版本信息：

```text
endpointRevisionId
credentialVersionRef
request profile/version
response profile/version
reasoning mapping/version
inline policy/version
...
```

表面上看它表达：

> 我选择了这一套具体、冻结的 compatible configuration。

但真正 initial/regenerate/edit 执行时又读取 provider instance 的当前 revision。

于是 route preference 和实际语义有两种可能。

如果产品定义是 **Pinned selection**：

```text
用户选中的 endpoint/config revision
必须一直使用
```

那么当前执行链就是错误的，应把 `endpointRevisionId` 等精确带入 command。

但如果定义是 **Current intent**：

```text
我选择 provider instance X + model Y，
之后这个 provider instance 更新配置时，
新的发送使用新配置。
```

那么当前执行行为基本合理，真正错误的是 route selection **存得太多、看起来像 pinned provenance**。

结合当前已经明确存在的：

```text
initial/regenerate/edit → 当前 route
retry → 历史 snapshot
```

我更倾向 Sol 的判断：

**Conversation route 应表示 current intent；Generation snapshot 才表示 frozen execution provenance。**

长期更干净的 compatible route 应类似：

```ts
{
  kind: 'openai_chat_compatible'
  providerInstanceId: CompatibleProviderInstanceId
  modelId: string
  requestExtraBodyOverride?: JsonValue
}
```

然后发送时：

```text
route intent
   ↓ resolve current provider configuration
exact endpoint/credential/profile revisions
   ↓
Generation snapshot
```

retry 直接读取 snapshot。

这会使：

```text
Conversation preference
```

与：

```text
immutable execution evidence
```

职责非常清楚。

当然，如果 Compatible UI 实际上允许用户明确选择历史 endpoint revision，那产品语义就应改成 pinned。这个需要产品层裁决，代码本身无法替你决定。

---

## Flash 提出的 compatible → `local_endpoint` 哨兵值得一起清理

这一点与上面有关。

既然 hard-cut 后已经有：

```ts
ConversationRouteSelection =
  | provider_model
  | openai_chat_compatible
```

那么任何内部 semantic projection 再把：

```text
openai_chat_compatible
```

伪装成：

```text
local_endpoint
```

都会重新制造你刚刚删除掉的那类语义污染。

即使今天只有显示层消费，它也是“脆弱的正确”。

应该让 projection 同样保持 discriminated route，或者使用明确：

```text
compatible
```

而不是借用 `local_endpoint`。

这一项我支持 Flash。

---

## Model Preferences：Pro 和 Sol 的发现可以合并成一个更完整的问题

Pro发现：

```text
providerKey 是自由 string
favorites 只有 OpenRouter
recents 所有 provider
```

Sol又进一步发现：

```text
持久化 recents 没真正 hydrate
Picker selection 记一次
successful send 又记一次
```

因此这里不是单纯的类型问题。

现在实际上有三个未定义的产品语义：

```text
favorite
究竟支持所有 Catalog provider，还是 OpenRouter？

recent
表示“选中过”？
“发起过 generation”？
“成功生成过”？

useCount
统计 selection 次数还是 model usage 次数？
```

我建议先定义：

```text
recent = 某模型实际被用于创建一次 Generation operation
```

于是：

```text
Picker 单纯选择
→ 不记 recent

Generation operation 成功建立/提交
→ 记一次 recent

provider 最终 HTTP 失败
→ 仍算一次 use attempt
```

这样 `useCount` 每次 generation operation 精确 +1，语义最稳定。

如果需要“最近选择”，另建 UI transient history，别污染 `model_recents`。

Preferences → Conversation route 时则必须：

```ts
const providerId = parseRuntimeProviderId(pref.providerKey)
if (!providerId) {
  // 不生成 quick route
}
```

绝不能再 cast。

---

## 关于 `::` 被多处使用

Flash把：

```text
modelKey
catalog scope key
compatible selection key
```

都使用 `::` 看成风险。

我认为这是低优先级。

真正的问题不是 delimiter，而是它们当前是否都只是普通 `string`。

更好的解决办法：

```ts
type CatalogModelKey = Brand<string, 'CatalogModelKey'>
type CatalogScopeKey = Brand<string, 'CatalogScopeKey'>
type CompatibleSelectionKey = Brand<string, 'CompatibleSelectionKey'>
```

并且只通过：

```ts
buildCatalogModelKey()
buildCatalogScopeKey()
buildCompatibleSelectionKey()
```

生成。

如此即使三个都使用 `::`：

```ts
function f(key: CatalogModelKey)
```

也不可能误传 `CatalogScopeKey`。

无需为了视觉差异发明三套 delimiter。

---

## Flash 的 credentialScopeId 问题暂时不要并入本轮 identity 重构

它指出：

```text
credential-scope-v2:...
local-none:...
```

有两种格式。

这个调查值得做，但从三份报告现有证据还不足以证明当前存在 correctness bug。

本地 no-credential route 与真正 credential lease 本来就可能属于不同语义：

```text
CredentialScopeId
NoCredentialScopeId
```

如果 generic local 从不会进入要求 `isCredentialScopeIdV2()` 的 runner，那么两个格式完全可以合法共存。

更合理的后续调查问题是：

```text
binding.credentialScopeId
这个字段究竟表示：
“真实 credential lease ID”
还是
“credential authority reference”
```

如果是后者，类型应该是 union；不必强行把 `local-none` 改成真正 credential scope。

因此我把它列为相邻课题，而不是当前 provider/model identity 的高优先级缺陷。

---

## 三份报告本身的质量评价

如果只评价这轮 hard-cut 后审查，我会这样排序：

**Sol：架构语义判断最好。**

它最准确地区分了：

```text
route intent
execution identity
reported provenance
```

并发现了 compatible route 语义冲突、history namespace cast、recents event semantics 等需要跨多个模块才能看到的问题。它不像简单 grep audit，更像真正把系统执行语义跑了一遍。

**V4 Pro：Provider namespace 调查最好。**

`gemini` ghost、Anthropic mapping 分散、`ProviderFailureV2.context.providerId` namespace 混流、credential status 第五套 display vocabulary，这几项非常有价值。尤其 ProviderFailure 那一项，Sol 没有抓出来。

Pro 这一次最大的不足，是有少量地方给 projection 的角色命名得过强，例如把 active Catalog evidence 中的 provider mapping 称作“Catalog → GenV2 provider_id”，而它自己随后又证明这个值并非真正 binding authority。

**V4 Flash：扫描覆盖非常广，但语义误判率更高。**

它找到了 compatible sentinel、credential scope 双格式、dead IPC、孤儿 contract、文档陈旧、通用 identity validation 等很多长尾问题，这是明显优点。

但至少有三处需要降权：

1. “terminal artifact 不记录 identity”与另外两份逐 provider 证据冲突；
2. 把 Catalog `string` 开放性解释为需要容忍任意 vendor slug，混淆 Catalog source 与 model vendor；
3. `nativeModelId === modelId` 再次被推成“死冗余”，忽略 evidence → authority 的层间角色。

所以这轮如果按“最终架构裁决可信度”排序，我会给：

```text
Sol > V4 Pro > V4 Flash
```

如果按“代码搜索覆盖率/找长尾异常”：

```text
V4 Flash ≈ V4 Pro > Sol
```

如果按“provider identity 专项调查”：

```text
V4 Pro > Sol > V4 Flash
```

---

## 我认为现在可以冻结的最终语义框架

经过 hard-cut 后，已经没必要再寻找所谓“唯一 ProviderId”。

正确模型应是：

```text
Discovery
  provider source
  nativeModelId
       │
       ▼
Catalog
  CatalogProviderKey
  modelId
  derived modelKey
       │
       ▼
Conversation
  RuntimeProviderId
  modelId
  or CompatibleProviderInstanceId + modelId
       │
       ▼
typed mapping boundary
       │
       ▼
Generation
  GenerationExecutionProviderId
  requested modelId
  protocolContractId
  endpointProfileId
  credentialScopeId
       │
       ▼
Provider API
       │
       ▼
Response provenance
  reportedModelId?
  reportedProvider?
```

Credential 独立：

```text
Catalog/Runtime
      │
      ▼ typed mapping
ProviderCredentialKey
      │
      ▼
credential scope / lease
```

这里真正值得新增的核心类型只有几个：

```ts
CatalogProviderKey
ProviderCatalogKnownProviderKey
RuntimeProviderId
GenerationExecutionProviderId
ProviderCredentialKey
CompatibleProviderInstanceId
CatalogModelKey
```

同时保留：

```text
nativeModelId
modelId
reportedModelId
```

各自的领域角色。

下一阶段我会优先做四件事：**裁决 compatible route 是 intent 还是 pinned；修掉 `google_ai_studio → gemini`；引入 `GenerationExecutionProviderId` 并删除 history cast；把 first-party provider mapping 和 failure identity 的 namespace 显式化。**

做到这里以后，Starverse 的模型/provider identity 体系基本就从“能够工作”提升到了“类型系统能够解释为什么它正确”。
