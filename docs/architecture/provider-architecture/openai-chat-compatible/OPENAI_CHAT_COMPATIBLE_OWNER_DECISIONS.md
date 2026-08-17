请基于 Starverse 当前仓库代码、上一阶段调查报告和下列 Owner 冻结决策，为“通用云端 OpenAI Chat Completions-compatible 供应商体系”完成正式架构设计与破坏性重构实施计划。

本阶段只做架构设计、数据影响分析和实施计划，不实施生产代码。

# 一、任务目标

Starverse 当前不存在生产可达的通用云端 OpenAI-compatible provider。现有相关路径包括：

* runtime-dead 的 Generic fixture/prototype；
* loopback-only 的 `local_endpoint`；
* OpenRouter 遗留 custom endpoint 命名；
* LM Studio/Ollama 的 OpenAI-compatible 模式；
* 多条身份、目录、transport、响应解析和持久化语义互相冲突的路径。

本次需要基于当前真实代码边界，设计一个全新的：

> **通用云端 OpenAI Chat Completions-compatible 多供应商体系**

它应支持用户配置多个兼容供应商实例，每个供应商实例拥有多个模型，并形成唯一、完整、可验证的生产路径。

最终产物必须能够直接交给后续 Agent 分阶段实施。不得停留在概念图、原则清单、备选方案或“后续再确定”。

# 二、本阶段允许与禁止事项

## 允许

* 阅读代码、测试、文档和 Git 历史。
* 检查当前 branch、HEAD 和 dirty worktree。
* 运行不联网的静态检查和 focused tests。
* 新建架构设计、ADR、实施计划和数据重置方案文档。
* 必要时更新文档索引。
* 使用当前工作树代码作为事实来源，并明确区分 HEAD 与未提交变化。
* 对上一阶段调查报告中的代码位置重新核验。

## 禁止

* 修改任何生产代码。
* 修改数据库 schema、migration、测试 fixture 或配置实现。
* 发起真实外部 API 请求。
* 使用真实 API Key。
* 顺手修复发现的问题。
* 建立临时 adapter、compatibility bridge、alias 或 fallback。
* 编写旧数据到新结构的迁移兼容层。
* 为降低改动量而复用语义错误的 LocalEndpoint、OpenRouter 或 Generic 路径。
* 创建实施提交。
* 擅自修改下列冻结决策。
* 将已经冻结的事项重新列为 open question。

若冻结决策与当前代码冲突，应在设计中说明需要删除、替换或重建的代码与数据，不能反向调整目标策略。

# 三、Owner 冻结决策

以下决策已经确认。必须完整进入：

* 架构文档；
* 领域模型；
* 数据库设计；
* 配置模型；
* 模型目录；
* 运行时调用链；
* 网络安全；
* 请求与响应 contract；
* reasoning 架构；
* UI；
* 数据重置；
* 测试矩阵；
* 分阶段实施计划；
* 最终验收标准。

不得将其写成“候选方案”“建议”“可选项”或“未来再决定”。

## D1. 协议范围

目标协议严格定义为：

> **OpenAI Chat Completions-compatible cloud endpoint**

首期正式支持：

* `POST /v1/chat/completions`
* 流式 SSE 响应
* 非流式 JSON 响应
* `GET /v1/models`

明确排除：

* OpenAI Responses API
* OpenAI Assistants API
* OpenRouter 原生语义
* DeepSeek 原生语义
* Anthropic Messages
* Google Gemini
* Ollama native API
* 本地模型生命周期管理
* LocalEndpoint 的配置、transport、目录、credential 或 runtime 复用

已有原生供应商继续使用各自独立的原生 provider adapter。

本接口只遵循 Chat Completions envelope，不根据 endpoint 实际由 vLLM、SGLang、LM Studio、云厂商网关或自建代理实现而改变核心运行时身份。

## D2. 多供应商与多模型

必须允许用户配置多个兼容供应商实例。

每个兼容供应商实例：

* 属于统一的 OpenAI Chat Completions-compatible 协议类型；
* 有独立且稳定的供应商实例 ID；
* 有独立名称；
* 有独立 Base URL；
* 有独立 credential reference；
* 有独立认证配置；
* 有独立普通 headers 配置；
* 有独立请求 profile；
* 有独立响应 profile；
* 有独立 reasoning mapping；
* 有独立模型目录；
* 允许多个模型。

模型稳定身份必须包含：

```text
providerInstanceId + modelId
```

禁止：

* 单例全局 Base URL；
* 只依靠 `modelId` 确定路由；
* 通过显示名称确定路由；
* 通过当前设置重建消息 endpoint；
* A 供应商目录中的模型使用 B 供应商的 URL 或凭据；
* 多个 endpoint 共享模糊的 provider identity；
* 用模型名称、供应商名称或 URL 猜测响应字段语义。

协议级 runtime provider key 只能有一个正式 canonical identity。请根据仓库现有命名规范确定唯一名称，例如：

```text
openai_chat_compatible
```

并删除其他 Generic、remote-compatible、custom-openai 等重叠 alias。

架构必须清楚区分：

1. 协议类型；
2. 用户创建的供应商实例；
3. 供应商实例下的模型；
4. credential；
5. 普通 headers；
6. request profile；
7. response profile；
8. reasoning mapping；
9. endpoint revision；
10. 会话与消息上的 route provenance。

## D3. 模型来源与合并目录

每个供应商实例同时支持：

1. 从 `GET /v1/models` 同步；
2. 用户手动添加模型 ID。

每条本地模型记录必须标明来源：

```text
remote_sync
manual
```

规则：

* 同步只操作 `remote_sync` 来源的数据；
* 同步不得修改手动模型；
* 同步不得删除手动模型；
* 手动添加不得污染远程同步快照；
* 模型 picker、模型查询和发送只能读取合并后的供应商 scoped catalog；
* 不建立“远程模型 picker”和“手动模型 picker”两套路径；
* 远程接口缺少的价格、上下文、能力等信息保持 `unknown`；
* 不继承 OpenAI、OpenRouter 或其他原生供应商的能力信息；
* 手动模型允许用户填写受支持的能力元数据；
* 每条合并结果必须能够追溯其 remote/manual 来源；
* 同步失败不得破坏最近一次有效远程目录；
* 同步空结果与同步失败必须区分。

架构必须确定同一供应商实例内，`remote_sync` 和 `manual` 出现相同 `modelId` 时的确定性合并规则。该规则必须：

* 不删除任一来源记录；
* 不让远程同步覆盖用户手动数据；
* 在合并目录中只产生一个稳定模型身份；
* 保留来源诊断；
* 能解释最终字段来自 remote、manual 还是 default unknown；
* 可测试；
* 可逆向诊断；
* 不依赖写回另一来源记录完成合并。

## D4. 认证范围

首期正式支持：

* Bearer token；
* Basic authentication；
* 静态自定义 headers；
* 无认证。

安全约束：

* secret 只能进入 secure credential store；
* renderer 只能持有 `credentialRef` 和脱敏摘要；
* API Key 不得进入 URL query；
* 不允许脚本；
* 不允许模板执行；
* 不允许动态 JavaScript；
* 不允许用户代码；
* 自定义 header 必须通过 allow/deny policy；
* 禁止覆盖 transport 安全关键 header；
* 云厂商签名认证不塞入本通用机制；
* credential 与普通非敏感 header 必须分开存储；
* 敏感自定义 header 必须进入 secure credential store，不能作为普通配置明文落库。

架构必须列出禁止覆盖的 header，至少评估：

```text
Host
Content-Length
Connection
Transfer-Encoding
Upgrade
Proxy-Authorization
Proxy-Authenticate
Trailer
TE
Keep-Alive
Sec-*
```

同时明确：

* Bearer token 的注入位置；
* Basic username/password 的安全存储；
* 普通 header 的持久化；
* 敏感 header 的识别与存储；
* credential rotate；
* credential delete；
* credential reference 失效；
* 日志与错误对象脱敏。

## D5. URL 与网络安全

`http://` 和 `https://` 均允许。

用户输入 `http://` 时：

* 不阻断保存；
* 不阻断测试；
* 不阻断同步；
* 不阻断发送；
* 不使用弹窗；
* 在供应商配置区域持续显示警告提示块；
* 提示认证信息和对话正文可能缺少传输加密。

云端兼容供应商必须阻断：

* loopback；
* link-local；
* 私网地址；
* DNS rebinding；
* 重定向后落入上述地址。

每次重定向后必须重新执行地址安全检查。

架构必须覆盖：

* URL canonicalization；
* hostname 解析；
* IPv4；
* IPv6；
* IPv4-mapped IPv6；
* DNS 多结果；
* 首次请求前检查；
* 连接时地址校验；
* DNS rebinding 防御；
* redirect location 解析；
* 每次 redirect 重新校验；
* proxy 与 Electron session 网络治理；
* PAC；
* timeout；
* abort；
* 窗口销毁清理；
* response size；
* SSE buffer；
* 日志脱敏。

LocalEndpoint：

* 继续作为独立本地产品能力存在；
* 不与新云端供应商共享 runtime identity；
* 不作为 fallback；
* 不作为 compatibility bridge；
* 不复用其 transport；
* 不复用其配置；
* 不复用其模型目录；
* 不复用其 credential；
* 本任务不负责重构 LocalEndpoint。

## D6. 请求扩展模式

采用扩展模式 B。

处理顺序固定为：

```text
标准 Chat Completions request builder
→ 应用结构化请求侧扩展映射
→ 合并 extraBody
→ 核心字段覆盖保护
→ JSON、类型与安全校验
→ 发送
```

允许用户提供任意合法 JSON `extraBody`，但禁止其覆盖由 Starverse 负责构造、验证、续接或持久化的核心字段。

至少保护：

```text
model
messages
stream
tools
tool_choice
```

架构必须进一步明确以下字段的所有权和保护规则：

* `response_format`
* `stream_options`
* `parallel_tool_calls`
* `n`
* token limit 字段
* multimodal content parts
* route/provenance 字段
* metadata
* user
* stop
* temperature
* top_p
* frequency_penalty
* presence_penalty
* seed

不能只写一个硬编码五项 denylist。必须定义可扩展的字段所有权模型，例如：

```text
Starverse-owned
profile-owned
extraBody-owned
forbidden transport field
```

凡由 Starverse 负责以下任一事项的字段，均不得被 `extraBody` 覆盖：

* 构造；
* 类型验证；
* message continuation；
* tool continuation；
* route provenance；
* 持久化；
* UI 参数语义；
* 安全治理。

标准 builder 需要覆盖合理的 Chat Completions 参数矩阵，并保持以下三种状态可区分：

* 未配置；
* 用户显式配置；
* 协议或 endpoint profile 默认值。

不得 silent-drop 用户配置。无法发送的字段必须 fail-before-fetch 或向用户明确报告被拒绝的原因。

## D7. Reasoning / thinking 总体契约

正式响应解析顺序固定为：

```text
显式自定义字段映射
→ reasoning
→ reasoning_content
→ thinking
→ inline <think> parser
```

其中 inline `<think>` parser 是正式内置步骤，不提供关闭整个 parser 的产品开关。

`analysis` 不属于默认自动字段。第三方确实使用 `analysis` 或其他名称时，只能通过显式自定义字段映射启用。

固定约束：

* 自定义字段映射优先级最高；
* 一个 choice 在一次响应中只能选择一个结构化 reasoning 主来源；
* 结构化 reasoning 已命中时，不得重复解析正文中的 `<think>`；
* `reasoning` 优先于 `reasoning_content`；
* `reasoning_content` 优先于 `thinking`；
* inline parser 必须支持 SSE chunk 拆分；
* reasoning 与最终正文进入独立通道；
* 不得逐 token 创建独立 display block；
* 不得把 reasoning 重复追加进正文；
* 不得根据供应商名、模型名或 URL 硬编码；
* 未识别扩展字段进入脱敏 diagnostics；
* reasoning 默认展示并持久化；
* reasoning 默认不回传到下一轮请求；
* 原始结构化数据在受控边界内保留；
* 自定义字段路径必须使用受限 DSL；
* 不执行 JSONPath 脚本；
* 不执行正则表达式；
* 不执行用户代码；
* 不允许原型链访问。

## D8. 自定义 reasoning 字段映射

自定义字段解析是正式产品能力，不能作为调试专用功能。

至少需要表达：

```ts
type ReasoningFieldMapping = {
  mappingId: string
  version: number

  stream: {
    path: string
    mode: 'append' | 'snapshot'
    textPath?: string
  }

  final?: {
    path: string
    mode: 'snapshot' | 'blocks'
    textPath?: string
  }

  semantic:
    | 'reasoning_text'
    | 'reasoning_summary'
    | 'opaque'

  priority: number

  historyReplay: {
    mode:
      | 'disabled'
      | 'assistant_field'
      | 'assistant_content_tags'

    field?: string
    startTag?: string
    endTag?: string

    scope:
      | 'never'
      | 'tool_call_chain_only'
      | 'all_assistant_messages'
  }
}
```

默认值必须是：

```text
historyReplay.mode = disabled
historyReplay.scope = never
```

这表示：

* reasoning 可以被解析；
* reasoning 可以展示；
* reasoning 可以本地持久化；
* 下一轮请求默认只发送标准 Chat Completions message；
* 不假设第三方 endpoint 接受历史 reasoning 字段。

用户显式配置后，才允许未来新消息按 profile 回传 reasoning。

注意：

* 这里的 history replay 指新体系创建的未来消息如何续接；
* 它不表示兼容旧聊天；
* 不为旧聊天建立迁移；
* 不从响应字段自动推导回传字段；
* 工具调用链要求 reasoning 回传时，必须由 profile 明确声明 `tool_call_chain_only`；
* profile 更新后，旧消息使用其发送时固定的 profile/version，不动态套用最新配置。

## D9. inline `<think>` parser

inline parser 永远属于正式解析链，不提供整体关闭选项。

canonical 默认标签为：

```text
<think>
</think>
```

允许 endpoint/model response profile 增补自定义标签对，但：

* 不得删除 canonical `<think>` 支持；
* 自定义标签必须是静态字符串；
* 不允许正则；
* 不允许脚本；
* 不允许模糊匹配；
* 每个开始标签必须有明确结束标签；
* 标签集合必须经过长度、数量和冲突校验。

inline parser 必须设计明确状态机，至少覆盖：

* 开始标签跨 chunk；
* 结束标签跨 chunk；
* 缺少开始标签；
* 缺少结束标签；
* 流中断；
* EOF；
* 正文中的字面 `<think>`；
* Markdown 代码块中的 `<think>`；
* XML/HTML 示例中的 `<think>`；
* 多段 reasoning；
* reasoning 后正文；
* 空 reasoning；
* 嵌套标签；
* 重复开始标签；
* reasoning 与 tool call 的相对顺序。

由于 parser 固定存在，必须通过：

* 结构化字段优先；
* 流式状态机；
* 内容上下文；
* code fence tracking；
* 标签完整性；
* conservative fallback；
* conflict diagnostics；

降低误判风险，不能依靠关闭开关规避。

架构必须明确：

* 缺少开始标签时的行为；
* 缺少结束标签时的行为；
* EOF 未闭合时哪些内容进入 reasoning；
* 字面标签何时恢复为正文；
* 多段标签如何产生稳定 block；
* inline parser 与 tool call delta 并发时如何排序；
* final snapshot 如何与流式状态 reconcile。

## D10. 未知字段自动发现

需要设计一个**只观察、不自动接管语义**的未知字段发现机制。

目的：

* 帮助用户发现 endpoint 返回的非标准 reasoning 字段；
* 为自定义字段 mapping 提供候选路径；
* 避免静默丢失未知扩展；
* 不把任意字符串误判为 reasoning。

可参考的数据对象：

```ts
type DiscoveredResponseField = {
  streamPath: string
  finalPath?: string
  valueType: 'string' | 'object' | 'array'
  sampleCount: number
  appearsBeforeContent: boolean
  appearsAlongsideContent: boolean
  hasMatchingFinalField: boolean
  candidateSemantic: 'reasoning' | 'unknown'
  confidence: number
}
```

规则：

* 自动发现不得直接改变当前响应的展示语义；
* 自动发现不得自动保存为正式 mapping；
* 自动发现不得根据供应商名或模型名判定；
* 只生成 endpoint diagnostics 和用户可确认候选；
* 用户确认后才创建正式 response profile mapping；
* `reasoning`、`reasoning_content`、`thinking` 仍由内置优先级处理；
* 其他字段，例如 `thought_process`、`analysis_text`，只能进入候选；
* `citation`、`audio`、`refusal`、`trace`、`status`、`metadata` 等不得因字符串形态自动认定为 reasoning；
* diagnostics 必须脱敏并限制采样大小。

UI 可提供类似：

```text
检测到可能的推理字段：
choices.*.delta.thought_process

[设为推理字段] [忽略]
```

但不得用弹窗打断发送。

## D11. 请求侧 reasoning 参数映射

响应 parsing 与请求 reasoning 控制必须彻底分离。

不得根据响应使用：

```text
reasoning
reasoning_content
thinking
```

推断请求应该发送：

```text
reasoning_effort
thinking
enable_reasoning
chat_template_kwargs.enable_thinking
```

需要设计结构化的请求侧字段映射，例如：

```ts
type CompatibleRequestFieldMapping = {
  mappingId: string
  uiControl:
    | 'reasoning_enabled'
    | 'reasoning_effort'
    | 'reasoning_budget'

  targetPath: string
  omitWhenUnset: boolean
}
```

示例：

```json
{
  "uiControl": "reasoning_enabled",
  "targetPath": "/chat_template_kwargs/enable_thinking",
  "omitWhenUnset": true
}
```

规则：

* 请求 mapping 属于 request profile；
* 响应 mapping 属于 response profile；
* 两者不能互相自动推导；
* target path 使用受限对象路径 DSL；
* source value 在通过公共 capability validator 后原样写入 wire；
* request mapping 不包含 `valueKind`/`valueMapping`，不做 alias、类型转换、截断或隐式默认；
* 不允许覆盖 Starverse-owned 核心字段；
* 不允许脚本；
* 不允许函数；
* 不允许原型链访问；
* 映射后的结果仍需经过 extraBody/core ownership 校验；
* reasoning control 未配置时不得偷偷发送 endpoint-specific 默认字段。

## D12. Generic extension extraction 架构

架构不得把 extension extractor 写死成只能处理 reasoning 的一次性模块。

应设计为：

```text
Chat Completions wire parser
→ OpenAI-compatible extension extractor
→ semantic-specific mapper
→ provider-neutral domain events
```

本阶段正式实现目标仍以 reasoning 为首个内置 extension，但架构应允许后续增加：

* citations；
* grounding；
* search results；
* audio metadata；
* refusal detail；
* provider-specific usage detail。

要求：

* transport 不认识具体 extension 语义；
* wire parser 负责保留合格未知字段；
* extension extractor 根据 profile 和内置字段映射生成语义事件；
* reasoning mapper 不直接依赖供应商名；
* 非 reasoning extension 本阶段可以只保留 raw diagnostics，不要求全部实现 UI；
* 不得为每一种新字段复制一套 provider adapter。

建议 canonical 名称围绕：

```text
OpenAICompatibleExtensionExtractor
OpenAICompatibleReasoningExtractor
```

避免继续使用含义模糊的 `generic`。

## D13. 原始扩展数据保存

不能永久无界保存每个完整 SSE chunk，也不能在解析后彻底丢弃原始扩展。

需要设计受控的归并保存形式，例如：

```ts
type CompatibleRawExtensionRecord = {
  sequenceStart: number
  sequenceEnd: number
  choiceIndex: number
  sourcePath: string
  sourceField: string
  valueKind: 'string' | 'object' | 'array'
  rawValue: unknown
  parserProfileId: string
  parserProfileVersion: number
  semantic: string | null
  redactionState: 'clean' | 'redacted' | 'dropped'
}
```

必须明确：

* 哪些内容进入长期持久化；
* 哪些只进入短期 diagnostics；
* 大对象和重复 delta 如何归并；
* secret-like 数据如何脱敏；
* 最大大小；
* 最大 block 数；
* 生命周期；
* reload 时如何使用；
* profile 版本如何固定；
* raw data 不得直接进入 Markdown 渲染；
* opaque、signature、encrypted-like 数据不得被当作文本展示。

## D14. 破坏性重构原则

不向前兼容现有实现。

不兼容旧聊天中的旧 route identity。

不保留旧自定义 endpoint 数据。

不建立双轨。

不建立 fallback。

不写 legacy migration bridge。

同意删除：

* Generic fixture config；
* Generic descriptor；
* Generic adapter；
* Generic request builder；
* Generic SSE decoder；
* Generic tests；
* Generic duplicate mapper；
* default provider；
* `legacyOpenRouter` fallback；
* OpenRouter custom endpoint legacy identity；
* LocalEndpoint-as-Generic 复用路径；
* 旧 provider aliases；
* 旧自定义 endpoint 配置；
* compatibility-only tests；
* 只为旧结构存在的 migration 和 source guard。

数据处理原则：

> 只删除或重建会受到新身份、路由、配置和持久化契约影响，并在新结构下可能表现异常的数据。

不得默认清空全部用户数据。

应优先保留：

* 文件资产；
* 与本目标无关的项目数据；
* 原生供应商正常数据；
* 不受新 schema 影响的聊天；
* 独立 LocalEndpoint 数据；
* 其他无关设置。

必须删除或重建：

* 旧 Generic/custom endpoint 配置；
* 失去引用的旧 compatible credential；
* 使用旧 compatible provider identity 的模型偏好；
* 会产生错误路由的 providerless/legacy compatible 数据；
* 不完整且无法满足新 route provenance 的 streaming rows；
* 与旧兼容接口绑定且在新结构中会异常的消息或会话数据；
* 只服务于旧兼容实现的缓存和目录记录。

架构必须输出精确影响矩阵，不能使用“可能全部重置”作为替代。

# 四、当前调查结论必须作为代码事实输入

上一阶段已经确定：

1. 当前正式 runtime union 不包含 Generic。
2. Generic fixture 是 runtime-dead prototype。
3. LocalEndpoint 只允许 loopback，且无法作为目标接口复用。
4. LocalEndpoint 的 endpoint identity 未进入 model/conversation/message。
5. 当前相关路径会丢弃 tool calls、reasoning、multi-choice 和未知字段。
6. 当前存在 OpenRouter-shaped SSE/error 耦合。
7. 当前 Generic decoder 不满足完整 SSE 边界。
8. 当前网络 transport 存在 direct main-process fetch 例外。
9. 当前 model picker 没有 Generic/LocalEndpoint 正式来源。
10. 当前配置和历史 route provenance 无法安全支持多 endpoint。
11. 当前工作树可能有大量 provider-native、reasoning 和 persistence 未提交改动。

请重新核验关键代码位置，不要机械复制旧报告中的行号。当前仓库状态可能已经变化。

# 五、必须完成的架构设计

## 1. 术语与系统边界

定义唯一 canonical terms：

* protocol provider type；
* compatible provider instance；
* providerInstanceId；
* endpoint；
* endpoint revision；
* credentialRef；
* model record；
* merged model catalog；
* request profile；
* response profile；
* request field mapping；
* reasoning field mapping；
* route provenance；
* discovered response field；
* raw extension diagnostics。

清理或禁止所有容易与原生供应商、LocalEndpoint 混淆的名称。

给出最终 Canonical Identity Map，并说明需删除的 alias。

## 2. 领域模型

必须给出完整 TypeScript 级领域模型草案，至少包括：

```ts
CompatibleProviderInstance
CompatibleEndpointRevision
CompatibleCredentialDescriptor
CompatibleAuthConfig
CompatibleHeaderConfig
CompatibleModelRecord
CompatibleModelSource
CompatibleMergedModel
CompatibleRequestProfile
CompatibleRequestFieldMapping
CompatibleResponseProfile
CompatibleReasoningMapping
CompatibleInlineReasoningPolicy
CompatibleDiscoveredResponseField
CompatibleRawExtensionRecord
CompatibleRouteProvenance
CompatibleCatalogSyncState
CompatibleProviderAvailability
```

每个对象必须说明：

* 主键；
* 不变量；
* 生命周期；
* 是否持久化；
* 存储位置；
* renderer 是否可见；
* 是否含 secret；
* version/revision 规则；
* 删除级联规则；
* 与其他对象的引用关系。

## 3. 数据库与持久化设计

设计 fresh schema，不设计旧 schema 升级兼容。

至少覆盖：

* compatible provider instances；
* endpoint revisions；
* remote model records；
* manual model records；
* catalog sync metadata；
* request profiles；
* request field mappings；
* response profiles；
* reasoning mappings；
* discovered field candidates；
* route provenance；
* model preferences；
* credential references；
* raw extension metadata；
* diagnostics metadata。

明确：

* table；
* column；
* primary key；
* foreign key；
* unique constraint；
* indexes；
* cascade/restrict 策略；
* JSON 字段是否允许；
* JSON schema validation；
* version pinning；
* fresh schema 与 runtime bootstrap 的唯一事实来源。

必须避免 fresh schema 与 upgrade path 漂移。由于本任务不做兼容迁移，可以删除旧升级路径并采用定向 destructive reset。

说明哪些 secret 不能进入 SQLite。

## 4. 模型目录设计

设计 endpoint-scoped catalog。

必须覆盖：

* `/v1/models` 同步；
* 手动添加；
* 同步事务；
* remote snapshot；
* remote stale/delete；
* manual record 永久独立；
* 同 modelId 冲突合并；
* picker 查询；
* provider deletion；
* sync failure；
* empty response；
* malformed model；
* duplicate model；
* unknown metadata；
* model capability overrides；
* catalog freshness；
* retry/backoff；
* 手动刷新；
* 启动同步策略；
* 来源显示；
* 来源诊断。

说明目录如何与现有 provider-neutral catalog core 集成，哪些核心可 retain，哪些 provider module 需要新建。

不得建立第二套独立模型选择器。

## 5. 配置与 UI 架构

设计完整用户流程：

```text
创建兼容供应商
→ 配置名称/Base URL
→ 查看 HTTP 警告块
→ 选择认证方式
→ 配置 headers
→ 保存 credential
→ 测试连接
→ 同步模型
→ 手动添加模型
→ 查看合并目录与来源
→ 配置模型能力
→ 配置 request profile
→ 配置 extraBody
→ 配置 reasoning 请求映射
→ 配置 reasoning 响应字段
→ 查看自动发现候选
→ 选择模型
→ 创建会话并发送
```

必须设计：

* 供应商列表；
* 新建、编辑、删除；
* 多实例；
* Base URL 输入；
* `http://` 持续警告提示块；
* credential 输入和脱敏；
* Basic/Bearer/no-auth/custom headers；
* `/models` 同步状态；
* 手动模型管理；
* remote/manual 来源标记；
* 合并后的模型目录；
* request extraBody；
* 请求侧 reasoning control mapping；
* reasoning 自定义响应字段路径；
* 自动发现字段候选；
* 自定义 inline tag 对；
* 流式/非流式设置；
* endpoint diagnostics；
* 删除确认和引用处理；
* provider/model picker integration。

不要设计弹窗式 HTTP 警告。

## 6. Request builder

给出正式 request contract 和字段所有权边界。

至少覆盖：

* model；
* messages；
* system/developer/user/assistant/tool roles；
* string content；
* content parts；
* image URL/data URL；
* tools；
* tool_choice；
* parallel_tool_calls；
* response_format；
* JSON schema；
* stream；
* stream_options；
* temperature；
* top_p；
* token limit；
* stop；
* seed；
* frequency_penalty；
* presence_penalty；
* n；
* user；
* request field mappings；
* extraBody。

明确：

* 哪些字段 Starverse-owned；
* 哪些字段 profile-owned；
* 哪些允许 extraBody 添加；
* 冲突时 fail-before-fetch；
* unsupported 值如何处理；
* unset/default/explicit 的区别；
* 不同 endpoint 可配置的参数 profile；
* 请求序列化；
* log redaction；
* request diagnostics；
* request reasoning mapping 与 response reasoning mapping 严格分离。

不得 silent-drop。

## 7. Message 与 tool calling contract

设计完整 Chat Completions message contract。

必须覆盖：

* tool definition；
* streaming tool call delta；
* tool call ID；
* function name；
* arguments 增量；
* 多 tool calls；
* tool result message；
* tool call finish；
* malformed arguments；
* tool call persistence；
* reload；
* regenerate；
* retry；
* edit resend；
* reasoning 与 tool calls 的顺序；
* tool call chain 中可选 reasoning replay profile。

若 Starverse 当前产品尚不执行工具，也必须选择清晰契约：

* 完整解析并持久化但不执行；
* 或 fail-before-fetch 禁止 tools。

不得继续发送 tools 后静默丢失响应。

## 8. SSE 与非流式响应设计

创建 provider-neutral 的 Chat Completions wire parser，不得继续以 OpenRouter 命名。

SSE 必须覆盖：

* LF；
* CRLF；
* 多行 `data:`；
* event comment；
* keep-alive；
* 空 event；
* chunk boundary；
* UTF-8 多字节拆分；
* `[DONE]`；
* EOF without `[DONE]`；
* malformed JSON；
* malformed SSE；
* 非 SSE JSON error；
* stream usage；
* choices index；
* delta role；
* delta content；
* content null；
* content arrays；
* tool call delta；
* finish_reason；
* multiple choices；
* duplicate terminal；
* network interruption；
* abort；
* unknown extension preservation。

非流式必须覆盖：

* `choices[].message`；
* content；
* tool calls；
* reasoning；
* custom extension mapping；
* finish reason；
* usage；
* malformed response；
* empty choices；
* multiple choices；
* unknown extension preservation。

对于多 choice，必须给出明确产品契约。禁止静默只取 choice 0。

## 9. Extension 与 reasoning 架构

设计分层：

```text
Chat Completions wire parser
→ OpenAI-compatible extension extractor
→ reasoning source selector
→ inline reasoning parser
→ provider-neutral reasoning display assembler
```

给出：

* 内置字段发现；
* 自定义路径 DSL；
* stream path；
* final path；
* text path；
* append/snapshot；
* semantic kind；
* source priority；
* conflict diagnostics；
* duplicate suppression；
* unknown field discovery；
* raw detail；
* display block；
* final reconciliation；
* persistence；
* reload；
* history replay 默认关闭；
* request mapping 与 response mapping 分离。

必须明确：

* 结构化 reasoning 命中后 inline parser 不运行；
* `reasoning`、`reasoning_content`、`thinking` 同时出现时如何选择；
* 同值重复字段如何去重；
* 不同值冲突如何诊断；
* final snapshot 空值不清除 stream text；
* EOF 时未关闭标签如何处理；
* 正文中的标签字面量如何避免误拆；
* 多段标签如何处理；
* reasoning block 如何稳定 upsert；
* 不允许逐 token 新建 display block；
* profile version 如何固定；
* raw extension 如何限量保存；
* 未知字段如何形成候选而不自动展示。

## 10. inline `<think>` 状态机

必须给出状态转移表或足够精确的伪代码。

至少考虑状态：

```text
content
possible_start_tag
reasoning
possible_end_tag
code_fence
terminal
```

架构必须定义：

* pending buffer；
* 最大标签长度；
* 跨 chunk 匹配；
* code fence tracking；
* 多标签对；
* nested start tag；
* incomplete end；
* stream abort；
* EOF reconcile；
* final snapshot reconcile；
* blockId 稳定规则；
* reasoning/content/tool call 的事件顺序。

## 11. 未知字段发现与 diagnostics

设计观察型 discovery pipeline。

必须说明：

* 采样时机；
* stream/final 字段配对；
* confidence 计算依据；
* 最大采样量；
* secret-like value redaction；
* 用户确认流程；
* 忽略列表；
* mapping 创建；
* mapping version；
* 当前响应不重新解释；
* 后续请求从新 profile 生效。

不得自动把未知字符串字段转换为 reasoning。

## 12. 网络与安全架构

必须接入 Starverse 统一 Electron session/network governance。

设计完整链路：

```text
renderer
→ preload
→ IPC
→ main-process provider transport
→ Electron session fetch
→ DNS/address policy
→ redirect revalidation
→ SSE/JSON parser
```

禁止：

* renderer direct fetch；
* Node direct fetch；
* 为该 provider 添加网络出口例外；
* 绕过 proxy/PAC/session；
* 将 LocalEndpoint transport 当作过渡实现。

覆盖：

* SSRF；
* loopback/private/link-local；
* IPv4/IPv6；
* DNS rebinding；
* redirect；
* proxy/PAC；
* certificate；
* timeout；
* abort；
* window destruction；
* request lifecycle；
* response size；
* SSE buffer；
* header policy；
* query policy；
* credential injection；
* secret redaction；
* diagnostic envelope。

说明 `http://` 仅产生 UI 警告，不参与阻断。

## 13. Route provenance

设计每次发送必须在开始前持久化或原子建立的稳定 provenance。

至少包含：

```text
protocolProviderKey
providerInstanceId
modelId
credentialRef 或 credential version reference
endpointRevisionId
requestProfileId/version
responseProfileId/version
reasoningMappingId/version
inlineReasoningPolicyId/version
```

需要解决：

* crash-before-terminal；
* regenerate；
* retry；
* edit resend；
* model switch；
* provider edit；
* Base URL edit；
* provider delete；
* credential rotate；
* profile update；
* conversation reload；
* incomplete stream recovery。

虽然不兼容旧聊天，新结构创建的聊天必须拥有完整、稳定、可重放的 route identity。

## 14. 删除与数据重建设计

基于当前代码生成精确清单：

```text
retain
replace
delete
reset
```

必须逐文件或逐模块列出：

* Generic prototype；
* Generic tests；
* duplicate mapper；
* LocalEndpoint coupling；
* OpenRouter custom legacy identity；
* default provider；
* legacy fallback；
* provider aliases；
* old config；
* old source guards；
* old model preferences；
* affected DB tables/columns；
* affected secure credentials；
* affected localStorage/electron-store；
* affected conversations/messages；
* affected streaming rows；
* affected extension diagnostics；
* unaffected user data。

给出定向 destructive reset 算法。

不能用“清空全部数据库”代替影响分析。

## 15. 错误模型与 diagnostics

建立 provider-neutral error taxonomy。

至少覆盖：

* invalid config；
* invalid URL；
* blocked address；
* DNS rebinding；
* redirect blocked；
* credential missing；
* invalid auth config；
* forbidden header；
* extraBody conflict；
* request field mapping invalid；
* HTTP auth；
* HTTP rate limit；
* HTTP provider error；
* malformed JSON；
* malformed SSE；
* unsupported response shape；
* tool delta invalid；
* reasoning mapping invalid；
* inline parser conflict；
* unknown extension overflow；
* timeout；
* abort；
* window destroyed；
* network/proxy/TLS；
* catalog sync failure。

错误对象不得带 OpenRouter 专属命名。

说明：

* 用户可见错误；
* 配置提示；
* 日志错误；
* 开发 diagnostics；
* raw extension diagnostics；

之间的分层和脱敏。

# 六、测试架构

设计完整测试金字塔。

## Unit

至少覆盖：

* schema；
* identity；
* catalog merge；
* source preservation；
* request builder；
* request field mapping；
* request/response mapping isolation；
* extraBody protection；
* auth/header policy；
* URL policy；
* SSE parser；
* non-stream parser；
* tool merge；
* reasoning source selection；
* custom reasoning extractor；
* unknown field discovery；
* `<think>` state machine；
* custom tag pairs；
* code fence handling；
* raw extension limits；
* history replay scopes；
* error mapping；
* route provenance。

## Repository/DB

至少覆盖：

* fresh schema；
* foreign keys；
* destructive reset；
* provider deletion；
* manual/remote isolation；
* catalog merge；
* endpoint revision；
* crash-before-terminal provenance；
* profile version pinning；
* reasoning mapping version pinning；
* discovered field candidates；
* raw extension retention limits。

## IPC/network

至少覆盖：

* renderer→preload→IPC；
* session transport；
* proxy；
* address blocking；
* redirect revalidation；
* timeout；
* abort；
* window destruction；
* credential redaction；
* forbidden headers；
* egress gate。

## Integration

至少覆盖：

* provider CRUD；
* `/models` sync；
* manual model；
* remote/manual same-model merge；
* merged picker；
* send stream；
* send non-stream；
* tool delta；
* `reasoning`；
* `reasoning_content`；
* `thinking`；
* conflicting reasoning fields；
* custom response path；
* inline `<think>`；
* custom tags；
* unknown field discovery；
* request-side reasoning mapping；
* persistence/reload；
* future-message replay disabled；
* tool-call-chain-only replay；
* retry/regenerate/edit resend。

## Playwright/Electron

模拟真实用户：

```text
启动应用
→ 新建兼容供应商
→ 输入 Base URL
→ 查看 HTTP 警告块
→ 配置 credential
→ 同步模型
→ 手动添加模型
→ 确认来源标签
→ 从合并目录选择模型
→ 配置 request extraBody
→ 配置请求 reasoning 参数映射
→ 配置响应 reasoning 字段
→ 创建会话
→ 发送
→ 查看正文/reasoning/tool/usage
→ 查看未知字段候选
→ 重启
→ 验证持久化
```

## Live smoke

设计可选真实 endpoint smoke，但本阶段不执行。

需覆盖：

* 一个标准 Chat Completions endpoint；
* 一个返回 `reasoning`；
* 一个返回 `reasoning_content`；
* 一个返回 `thinking`；
* 一个正文内返回 `<think>`；
* 一个使用自定义标签；
* 一个返回自定义 reasoning 字段；
* 一个需要请求侧 reasoning 自定义字段；
* 一个 tool calling endpoint；
* 一个非流式 endpoint；
* 一个返回未知扩展字段的 endpoint。

# 七、实施计划要求

在完成架构后，给出分阶段实施计划。

每个阶段必须是可独立审阅、测试和提交的闭合能力，不允许“先打通一半，后续补齐”。

建议至少覆盖以下主题，但应根据依赖关系重新组织：

1. 删除 runtime-dead Generic 与遗留 alias/fallback。
2. 建立 canonical identity 与 fresh schema。
3. 建立 secure credential 和 provider instance registry。
4. 建立 endpoint revision 和 route provenance。
5. 建立 scoped catalog 与 remote/manual merge。
6. 建立统一 network transport 和安全策略。
7. 建立 request builder、request field mapping 与 extraBody contract。
8. 建立 provider-neutral SSE/JSON parser 和 error model。
9. 建立 tool calling contract。
10. 建立 generic extension extractor。
11. 建立 reasoning source selection、自定义 mapping 和 raw extension retention。
12. 建立 mandatory inline `<think>` parser 和 custom tag support。
13. 接入 provider-neutral display/persistence。
14. 建立 provider CRUD、model management 和 picker UI。
15. 建立 unknown field discovery 与 diagnostics UI。
16. 完成 retry/regenerate/edit resend。
17. 执行定向 destructive reset。
18. 完成 integration、Playwright 和 live smoke。
19. 删除所有临时测试支架和旧 source guards。
20. 收口文档与最终生产验收。

每个阶段必须列出：

* Goal；
* 依赖；
* 生产文件范围；
* 删除文件范围；
* schema/config 影响；
* 核心不变量；
* 测试；
* gate；
* 验收标准；
* 明确禁止事项；
* 建议 commit message；
* 后续阶段接口。

不要以“最小实现”组织计划。应以完整能力切片组织。

## 实施顺序原则

* 先删除错误身份和 fallback，再建立新身份。
* 先建立 schema 与领域契约，再接 UI。
* route provenance 必须在首次生产发送前闭合。
* 网络安全必须在首次生产发送前闭合。
* 先建立统一 transport，再接真实发送。
* 请求、响应、reasoning、tool calling 和持久化必须形成端到端闭环。
* 不允许 production path 与 fixture path 并存。
* 不允许新旧 provider identity 并存。
* 不允许 temporary alias。
* 不允许 LocalEndpoint 作为过渡实现。
* 不允许 OpenRouter parser/error envelope 继续成为正式命名。
* 不允许在最后阶段才补 route provenance。
* 不允许在最后阶段才补网络安全。
* 不允许依靠测试注入形成生产不可达能力。
* 不允许把 request reasoning mapping 和 response reasoning mapping 合并成同一个隐式配置。
* 不允许自动发现机制直接接管响应语义。

# 八、计划必须包含的决策表

架构文档中至少加入以下表格：

1. Frozen Owner Decisions
2. Protocol Scope
3. Canonical Identity Map
4. Retain / Replace / Delete / Reset
5. Data Ownership
6. Secret Storage Boundary
7. Model Source Merge Rules
8. Request Field Ownership
9. Request Reasoning Mapping Rules
10. extraBody Protected Fields
11. Response Field Mapping
12. Reasoning Priority and Conflict Rules
13. Custom Reasoning Mapping Contract
14. Reasoning History Replay Rules
15. Inline Think State Transitions
16. Custom Tag Safety Rules
17. Unknown Field Discovery Rules
18. Raw Extension Retention Rules
19. URL and Network Security Matrix
20. Route Provenance Lifecycle
21. Destructive Reset Impact Matrix
22. Test Coverage Matrix
23. Implementation Milestones
24. Final Acceptance Criteria

# 九、文档产物

请根据仓库现有文档结构创建正式文档。若目录命名已有更合适规范，可调整文件名，但必须保持职责分离。

## 1. 架构决策包

例如：

```text
docs/architecture/provider-architecture/
OPENAI_CHAT_COMPATIBLE_ARCHITECTURE_DECISION_PACKAGE.md
```

必须包含全部 D1–D14 冻结决策。

## 2. 破坏性重构实施计划

例如：

```text
docs/architecture/provider-architecture/
OPENAI_CHAT_COMPATIBLE_REBUILD_PLAN.md
```

## 3. 数据影响与重置计划

例如：

```text
docs/architecture/provider-architecture/
OPENAI_CHAT_COMPATIBLE_DESTRUCTIVE_RESET_PLAN.md
```

## 4. Extension 与 reasoning contract

若主架构文档过长，应独立建立：

```text
docs/architecture/provider-architecture/
OPENAI_CHAT_COMPATIBLE_EXTENSION_AND_REASONING_CONTRACT.md
```

该文档必须覆盖：

* custom response mapping；
* unknown field discovery；
* request reasoning mapping；
* source priority；
* inline parser；
* custom tags；
* history replay；
* raw extension retention。

## 5. 文档索引

必要时更新对应文档索引。

所有文档必须写入冻结决策，不能只引用本提示词。

文档应成为后续实施 Agent 的 SSOT。

# 十、输出报告

完成后在回复中提供：

## 1. Verdict

判断架构计划是否已达到可实施状态：

* `ready`
* `ready_with_explicit_open_questions`
* `not_ready`

只有确实无法从代码或冻结决策确定的问题才能进入 open questions。

## 2. Repository state

* branch；
* HEAD；
* dirty worktree；
* 本次新增/修改的文档；
* 是否修改生产代码；
* 是否提交。

## 3. Documents created

列出路径和各文档职责。

## 4. Frozen decisions coverage

逐条列出 D1–D14 在哪些章节、数据结构、测试和阶段中得到体现。

## 5. Architecture summary

概括：

* canonical identity；
* schema；
* catalog；
* credential；
* transport；
* request；
* request reasoning mapping；
* response；
* extension extractor；
* reasoning；
* inline parser；
* tool calling；
* provenance；
* destructive reset；
* UI；
* tests。

## 6. Retain / replace / delete / reset summary

给出代码边界摘要，并提供关键 `file:line` 证据。

## 7. Implementation milestones

列出阶段、依赖、验收和建议提交顺序。

## 8. Tests run

列出命令、结果和未运行原因。

## 9. Explicit open questions

只保留仓库和冻结策略确实无法确定的问题。

不得重新询问已经冻结的事项。

# 十一、完成标准

完成后，后续实施 Agent 应无需重新设计以下内容：

1. 新 provider 的唯一身份。
2. 多供应商、多模型关系。
3. endpoint、model、credential、profile 的稳定引用。
4. remote/manual 模型目录合并。
5. request builder 和 extraBody 所有权。
6. 请求侧 reasoning 参数映射。
7. SSE 与非流式 parser。
8. extension extractor。
9. 自定义 reasoning 字段。
10. 未知字段发现。
11. `<think>` 状态机。
12. 自定义标签。
13. reasoning history replay。
14. raw extension retention。
15. tool calling。
16. 网络安全和统一 transport。
17. route provenance。
18. 数据删除和重建范围。
19. UI 用户流程。
20. 测试矩阵。
21. 分阶段提交顺序。

本阶段完成后停止，不实施生产代码，不创建实施提交。

# 十二、追加冻结决策：自定义 reasoning 字段的解析模式

将本节作为新的冻结决策 **D15** 追加到原提示词末尾。

本节优先于原提示词中与以下事项冲突或不够明确的表述：

* 自定义 reasoning 字段的优先级；
* 自定义解析失败后的行为；
* 通用解析与自定义解析是否同时生效；
* 流式响应中的 reasoning 来源切换；
* 自定义 mapping 的 UI 模式。

## D15. 自定义 reasoning 字段解析模式

当用户配置了自定义 reasoning 字段映射时，系统只提供以下两种模式。

### 模式一：自定义优先，通用回退

这是默认模式。

解析顺序为：

```text
显式自定义字段映射
→ reasoning
→ reasoning_content
→ thinking
→ inline <think> parser
```

规则：

* 自定义字段映射拥有最高优先级；
* 系统在选择 reasoning 来源时，先检查自定义 mapping；
* 当前响应中尚未获得有效自定义值时，允许进入通用解析链；
* 一旦选定有效来源，当前 choice 在本次响应期间锁定该来源；
* 锁定后不得切换到其他 reasoning 来源；
* 后续出现更高优先级或其他候选字段时，只记录 conflict diagnostics；
* 不重复展示其他来源；
* 不把其他来源追加到正文；
* 不合并多个 reasoning 来源。

### 模式二：仅使用自定义字段

解析顺序为：

```text
显式自定义字段映射
→ 无有效匹配则不解析 reasoning
```

规则：

* 不运行 `reasoning` 通用字段解析；
* 不运行 `reasoning_content` 通用字段解析；
* 不运行 `thinking` 通用字段解析；
* 不运行 inline `<think>` parser；
* 自定义字段没有产生有效值时，本次响应不生成 reasoning display block；
* 原始未知字段仍可进入受限、脱敏 diagnostics；
* 不把未匹配内容自动视为正文之外的其他语义。

该模式用于以下情况：

* endpoint 返回了名称类似 `reasoning` 或 `thinking` 的字段，但语义并非可展示推理；
* 用户掌握 endpoint 的精确响应契约；
* 用户希望彻底排除通用解析产生的误判。

## D15.1 不提供的模式

不得提供“通用优先、自定义补充”模式。

不得让通用解析与自定义解析同时独立产出 reasoning block。

不得提供以下运行行为：

```text
通用 reasoning 已开始输出
→ 后续发现自定义字段
→ 切换来源或合并来源
```

原因：

* 容易重复展示同一推理内容；
* 容易破坏流式文本顺序；
* 会造成 display block identity 不稳定；
* 无法明确最终持久化数据的事实来源；
* 用户显式配置的 endpoint contract 不应低于通用字段猜测；
* “补充”与“回退”在流式运行时难以形成清晰、稳定且可测试的区别。

未配置自定义字段 mapping 时，系统直接使用完整通用解析链，不需要额外的“通用模式”设置。

## D15.2 数据模型

自定义 reasoning mapping 必须增加明确的策略字段，例如：

```ts
type CompatibleReasoningMappingMode =
  | 'custom_preferred_with_builtin_fallback'
  | 'custom_only'
```

```ts
type CompatibleReasoningMapping = {
  mappingId: string
  version: number

  mode: CompatibleReasoningMappingMode

  stream: {
    path: string
    mode: 'append' | 'snapshot'
    textPath?: string
  }

  final?: {
    path: string
    mode: 'snapshot' | 'blocks'
    textPath?: string
  }

  semantic:
    | 'reasoning_text'
    | 'reasoning_summary'
    | 'opaque'

  historyReplay: {
    mode:
      | 'disabled'
      | 'assistant_field'
      | 'assistant_content_tags'

    field?: string
    startTag?: string
    endTag?: string

    scope:
      | 'never'
      | 'tool_call_chain_only'
      | 'all_assistant_messages'
  }
}
```

默认值：

```text
mode = custom_preferred_with_builtin_fallback
historyReplay.mode = disabled
historyReplay.scope = never
```

## D15.3 来源选择与锁定

每个 `choiceIndex` 必须维护独立的 reasoning source selection state。

建议状态：

```ts
type ReasoningSourceSelectionState = {
  status: 'unselected' | 'locked' | 'terminal'

  lockedSource?:
    | {
        kind: 'custom'
        mappingId: string
        mappingVersion: number
        sourcePath: string
      }
    | {
        kind: 'builtin'
        field:
          | 'reasoning'
          | 'reasoning_content'
          | 'thinking'
      }
    | {
        kind: 'inline_think'
        tagPairId: string
      }

  conflicts: ReasoningSourceConflict[]
}
```

来源选择规则：

1. 对每个新响应事件，按当前模式评估候选来源。
2. 只有非空、类型有效且能够转换为指定 semantic 的值，才具有来源选择资格。
3. 同一个事件中存在多个有效来源时，按以下顺序选择：

```text
custom
→ reasoning
→ reasoning_content
→ thinking
→ inline <think>
```

4. 首个被选中的有效来源立即锁定。
5. 锁定后，只有该来源可以继续更新 reasoning display block。
6. 其他来源只进入 conflict diagnostics。
7. 流式期间不得切换来源。
8. final snapshot 不得重新选择另一来源。
9. final snapshot 只能补齐、替换或确认已经锁定来源的数据。
10. 空 final snapshot 不得清除已有流式 reasoning 文本。

需要特别说明：

* “自定义优先”表示在每次尚未锁定来源的选择时，自定义候选先于内置候选评估；
* 如果内置来源先产生有效内容并被锁定，而自定义字段在后续事件中才出现，则不得切换到自定义来源；
* 后出现的自定义字段应记录为 `late_higher_priority_source` conflict；
* 这样可以保持流式展示、持久化和 block identity 稳定。

## D15.4 有效值、无匹配与配置错误

必须区分三类情况。

### A. 有效自定义值

满足全部条件：

* mapping 已通过配置验证；
* path 匹配；
* 值不为 `null`；
* 值类型符合 mapping；
* `textPath` 存在时能够成功提取；
* 结果符合所声明 semantic；
* 文本型结果包含非空内容，或结构化/opaque 结果包含有效对象。

结果：

* 具有来源选择资格；
* 可以锁定为 custom source。

### B. 当前事件无有效匹配

包括：

* path 在当前事件中不存在；
* path 值为 `null`；
* 当前事件只携带空字符串；
* snapshot 暂未产生内容；
* `textPath` 在当前事件对象中暂时不存在；
* 当前 chunk 没有该字段。

结果：

* 不立即认定 mapping 永久失败；
* 不锁定 custom source；
* 在默认模式下，当前事件中的其他内置候选可以参与来源选择；
* 在 `custom_only` 模式下，不运行通用解析；
* 空字符串 delta 不触发来源锁定；
* 空字符串 delta 也不单独触发错误。

### C. mapping 配置无效

包括：

* 路径 DSL 语法错误；
* 禁止的路径操作；
* 原型链访问；
* 非法 wildcard；
* 无效 semantic；
* append/snapshot 配置不一致；
* textPath 与输入类型不可兼容；
* 标签或字段配置超过安全限制。

结果：

* 这是配置错误；
* 必须在保存、预检或发送前明确报告；
* 不得在运行时静默降级到通用解析；
* 不得把配置错误描述为“自定义字段没有返回”；
* 不得通过 fallback 掩盖无效配置。

## D15.5 冲突诊断

至少定义以下 conflict 类型：

```text
multiple_sources_in_same_event
duplicate_equivalent_source
different_value_source
late_higher_priority_source
late_lower_priority_source
final_source_mismatch
custom_and_builtin_overlap
structured_and_inline_overlap
```

处理原则：

* 相同文本的重复字段只展示一次；
* 不同文本的候选字段不得拼接；
* conflict diagnostics 应记录字段路径、来源类型、事件范围和脱敏摘要；
* diagnostics 不得包含无界完整正文；
* conflict 不得改变已经锁定的来源；
* conflict 默认不阻断正常正文输出；
* profile 要求严格响应契约时，可以将冲突升级为可见 warning，但不得无提示切换来源。

## D15.6 UI

自定义 reasoning 字段配置区域只提供以下两项：

```text
自定义字段策略

● 自定义优先，通用回退
  优先使用当前配置的字段。该字段未产生有效内容时，
  使用 reasoning、reasoning_content、thinking 或 <think> 内容。

○ 仅使用自定义字段
  只解析当前配置的字段。没有匹配内容时不显示推理。
```

要求：

* 默认选中“自定义优先，通用回退”；
* 不提供“通用优先”；
* 不提供“同时解析并合并”；
* 不提供含义模糊的“补充”选项；
* UI 必须说明来源一旦在当前响应中选定，就不会中途切换；
* diagnostics UI 可以显示最终选定的 source；
* diagnostics UI 可以显示被忽略的冲突字段；
* 普通用户界面不得暴露内部 source lock 状态机细节。

## D15.7 架构文档补充要求

原架构设计必须同步增加或修改以下内容：

1. `CompatibleReasoningMapping` 增加 `mode`。
2. Reasoning Priority and Conflict Rules 表增加两种 mapping 模式。
3. Response Field Mapping 表说明 custom-only 会跳过全部内置解析。
4. Reasoning Source Selection 增加 per-choice source lock。
5. Inline Think State Transitions 说明 `custom_only` 下 inline parser 不参与该响应的 reasoning pipeline。
6. Route provenance 固定 mapping ID、version 和 mode。
7. Raw extension diagnostics 记录被忽略的候选来源。
8. UI 设计加入两项模式选择。
9. Final Acceptance Criteria 加入来源不切换和无重复输出要求。
10. Implementation Milestones 中加入 source-selection policy 和 mode UI 的闭合实施阶段。

## D15.8 测试补充要求

至少新增以下测试。

### Unit tests

* 未配置 custom mapping 时使用通用链。
* 默认模式下 custom 与 `reasoning` 同事件出现，选择 custom。
* 默认模式下 custom 缺失，选择 `reasoning`。
* 默认模式下 custom 为 `null`，选择 `reasoning_content`。
* 默认模式下 custom 为空字符串，不锁定 custom。
* 默认模式下内置字段先锁定，后续 custom 出现时不切换。
* custom 锁定后，后续内置字段不切换。
* `custom_only` 下 custom 缺失，不产生 reasoning。
* `custom_only` 下不运行 `reasoning`。
* `custom_only` 下不运行 `reasoning_content`。
* `custom_only` 下不运行 `thinking`。
* `custom_only` 下不运行 inline `<think>`。
* 同值 custom/builtin 只展示一次。
* 不同值 custom/builtin 记录 conflict，不合并。
* final snapshot 使用不同来源时不切换。
* final 空 snapshot 不清除已有内容。
* mapping 配置无效时 fail-before-fetch，不进入 fallback。
* 每个 choice 独立锁定来源。
* source lock 在 persistence/reload 后保持一致。

### Integration tests

* 配置默认模式后，endpoint 只返回自定义字段。
* 配置默认模式后，endpoint 不返回自定义字段但返回 `reasoning`。
* 配置默认模式后，流式后半程才出现 custom 字段。
* 配置 `custom_only` 后，响应同时包含 custom 与 `reasoning`。
* 配置 `custom_only` 后，只返回 `<think>`，不生成 reasoning block。
* retry/regenerate 使用消息发送时固定的 mapping mode/version。
* profile 更新不重新解释已持久化的旧消息。
* diagnostics 显示选定来源与冲突候选。

### Playwright/Electron tests

```text
创建兼容供应商
→ 配置自定义 reasoning path
→ 选择“自定义优先，通用回退”
→ 发送并验证 custom 来源
→ 修改 mock 响应使 custom 缺失
→ 验证通用字段回退
→ 切换为“仅使用自定义字段”
→ 再次发送
→ 验证通用字段和 <think> 均未被解析
→ 重启应用
→ 验证 mapping mode 持久化
```

## D15.9 完成标准补充

后续实施完成后必须满足：

1. 用户自定义字段具有明确、稳定的优先级。
2. 只存在两种自定义字段策略。
3. 不存在“通用优先、自定义补充”模式。
4. 同一 choice 的 reasoning 来源在一次响应中最多锁定一次。
5. 流式过程中不得切换来源。
6. 同一推理内容不得由多个来源重复展示。
7. 不同来源内容不得自动拼接。
8. `custom_only` 会完全跳过内置 reasoning 和 inline parser。
9. 无效 mapping 不得静默 fallback。
10. 空 delta 不得错误触发来源锁定或永久失败。
11. mapping mode、mapping version 和最终 source 必须可诊断。
12. retry、regenerate、reload 不得动态套用新的 mapping mode 重新解释旧消息。

## D16. 代理路由与云端兼容端点安全策略正交

Starverse 现有代理模型及双 transport 架构必须保留。代理路由只允许显式选择：

* `system`
* `manual`
* `environment`
* `direct`

不得用“浏览器兼容”或“严格安全”等安全概念替代、重命名或隐式选择代理模式。通用云端 OpenAI-compatible endpoint 独立增加且只增加两种地址安全策略：

* `compatibility_first`
* `strict_ssrf`

`compatibility_first`：

* 保留所选代理路由及其既有 transport 的原生行为；
* 在首次请求前解析并检查目标地址；
* 每次手动重定向后重新解析并检查；
* 一个 blocked DNS answer 即阻断该次请求；
* 不声称请求前检查等价于 connect-time lease 证明。

`strict_ssrf`：

* 实际连接必须可证明消费当前请求、当前 redirect hop 已审核的地址租约；
* transport capability 必须显式声明并由对抗测试证明；
* 当前所选 transport 无法证明时，在发起请求、发送 credential 或正文前返回 typed block；
* 不得自动改用 `compatibility_first`，不得自动改用另一 transport 或代理路由。

两条轴必须独立持久化、显示和诊断。两种安全策略与四种代理路由均不得静默切换、fallback 或降级。历史 route 固定 endpoint revision 中的安全策略；代理路由选择按实际发送时明确选定的现有网络配置执行，不得由安全策略重写。

本决策修订此前“所有 compatible 请求都必须具备 connect-time lease”这一全局要求：connect-time lease 是 `strict_ssrf` 的强制条件；`compatibility_first` 的正式契约是保留既有代理/transport 行为并执行首次请求前及每次重定向后的地址检查。

## Generation V2 纯 Wire Adapter 修订（2026-08-17）

对于 Generation V2，本文件中任何把 request codec、request mapping 或 projection 作为模型 capability/domain authority 的旧表述均被以下边界取代：

- `ResolvedCapabilityV2` 决定 exact provider instance、model、operation 下的 semantic support 与 domain；
- compatible request mapping 只描述 `sourceField / targetPath / omission`，不包含 `valueKind`、`valueMapping`、alias、clamp 或隐式默认转换；
- mapping 读取的 source value 必须由公共 semantic validator 先验证，并按原值写入目标路径；
- `EncodingCoverageRegistryV2` 只证明 wire encoder 对 semantic path 的代码覆盖，不提供任何模型值域；
- provider-owned/open enum 可以由 capability domain 表达为 bounded string，codec 不得把 `medium` 升为 `high` 或把 alias 归一化；
- 旧 compatible configuration 不进入 V2 decoder；epoch-2 closed-schema replacement 负责原子切换，不提供迁移 adapter、dual read 或 dual write。
