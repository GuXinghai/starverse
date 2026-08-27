# models.dev 模型能力事实底稿

- **Lifecycle Status**: reference
- **Document Role**: source-evidence
- **Last updated**: 2026-08-26

> 本文是当前专题的事实底稿，不是 Starverse 最终能力模型设计，也不是 User/Cloud/Reviewed rule 规则文件。
>
> 本轮目标是保留原始模型与模型能力字段、来源、证据和讨论结论，避免后续上下文压缩后丢失。Starverse 后续如何把这些事实翻译为 UI 控件、请求构建、模型目录展示和发送前校验，另行讨论。

## 0. 当前共识

### 0.1 合成表的定位

当前所说的“统一模型能力表”，更准确的名称是：

> 完整的原始模型及模型能力字段表。

它首先保存各来源实际返回或声明的字段，不直接等同于 Starverse 的最终可消费能力表。后续 Starverse 需要在另一个阶段，将这些原始事实整合、翻译为适合以下消费者的字段：

- UI 控件；
- 请求构建；
- 模型目录展示；
- 发送前校验；
- 运行时能力快照。

因此，原始事实层不应提前承担 Starverse UI 语义、请求协议语义或最终 allowlist 的职责。

### 0.2 模型集合

同一 provider 的模型集合采用各来源模型 ID 的并集：

- API 返回而 models.dev 没有的模型不丢弃；
- models.dev 有而 API 没有的模型也不丢弃；
- 每个模型记录来源成员关系；
- 一个模型可同时带有 API 和 models.dev 两个来源标记，也可以只有一个来源标记。

但“出现在 models.dev”不等于“当前 credential/endpoint 可用”。模型集合并集是事实和证据的汇总，不是 active availability 结论。

### 0.3 字段语义

不同来源中同名字段不一定同义。合并时：

1. 保留每个来源的原始字段名、原始值、原始类型和来源；
2. 只有确认语义相同，才建立同一个跨来源语义字段；
3. 同名但语义不同的字段必须拆成不同语义字段；
4. 一方没有字段表示 `missing`，不能改写成 `unsupported`；
5. 没有足够证据证明等价时，不强行映射、不强行取并集、不强行选择优先级。

### 0.4 模型身份与供应商行为

模型表只负责模型身份及模型能力事实。

下面这些属于一次请求或供应商路由行为，不应悄悄覆盖模型表中的模型 ID：

- 请求模型：`gpt-5.6`；
- 供应商响应模型：`gpt-5.6-sol`；
- 供应商对某个模型返回组织验证错误；
- 供应商将别名路由到实际内部模型。

如果未来需要记录这些信息，应使用独立的请求/响应诊断证据结构，并明确保存 `requestedModelId` 与 `responseModelId` 两个字段，而不是修改模型身份。

### 0.5 当前阶段边界

- 本轮只根据已测试到的结果形成事实底稿；
- 烟测结果尚未转化为规则；
- 当前没有接入 models.dev 的生产代码；
- 当前没有设计 User/Cloud rule 的传输、热更新或 precedence；
- 当前不因单次请求结果直接宣称模型能力；
- 下面的“建议”是事实存储和语义保留建议，不是已经实施的架构。

## 1. 来源与证据类型

当前涉及两类来源：

### 1.1 Provider API live catalog

Provider API 的模型列表主要用于观察：

- provider 当前返回哪些模型 ID；
- provider 当前暴露哪些基础模型字段；
- provider 是否返回了能力、限制或状态字段；
- provider 返回字段的真实类型和实际值。

API 未返回某个字段，只能证明本次响应中没有该字段，不能证明 provider 不支持该能力。

### 1.2 models.dev snapshot/API

本轮使用：

- URL：`https://models.dev`；
- API：`https://models.dev/api.json`；
- 项目：`https://github.com/anomalyco/models.dev`。

models.dev 是外部模型/provider 元数据来源。本底稿把它作为独立事实证据保存，不把它当作当前 credential/endpoint 的可用性证明。

## 2. DeepSeek：原始 API 字段

### 2.1 无 API Key 证据

请求：

```text
GET https://api.deepseek.com/models
```

未带 Authorization 时的结果：

- HTTP：`401 Unauthorized`；
- body：`Authentication Fails (governor)`。

因此，DeepSeek 模型列表不能在无 API Key 的情况下通过本次请求取得。

### 2.2 带 API Key 的完整返回

请求成功：

- endpoint：`https://api.deepseek.com/models`；
- HTTP：`200 OK`；
- 返回模型数量：2。

原始响应：

```json
{
  "object": "list",
  "data": [
    {
      "id": "deepseek-v4-flash",
      "object": "model",
      "owned_by": "deepseek"
    },
    {
      "id": "deepseek-v4-pro",
      "object": "model",
      "owned_by": "deepseek"
    }
  ]
}
```

### 2.3 DeepSeek API 观察到的字段

响应顶层字段：

- `object`
- `data`

模型项字段：

- `id`
- `object`
- `owned_by`

本次 API 响应没有观察到以下能力或限制字段：

- reasoning；
- reasoning options；
- tool calling；
- structured output；
- modalities；
- context/input/output token limits。

这里的结论是“本次 API 响应没有报告这些字段”，不是“不支持这些能力”。

## 3. DeepSeek：models.dev 原始字段

models.dev 的 provider key：`deepseek`。

provider 记录观察到的字段：

- `id`
- `env`
- `npm`
- `api`
- `name`
- `doc`
- `models`

模型记录的字段集合：

- `id`
- `name`
- `description`
- `family`
- `attachment`
- `reasoning`
- `reasoning_options`
- `tool_call`
- `interleaved`
- `structured_output`
- `temperature`
- `knowledge`
- `release_date`
- `last_updated`
- `modalities`
- `open_weights`
- `limit`
- `cost`

### 3.1 DeepSeek 模型记录摘要

#### `deepseek-v4-flash`

- `reasoning: true`
- `reasoning_options`：包含 toggle，以及 effort 值 `low`、`high`、`max`
- `tool_call: true`
- `structured_output: true`
- `interleaved`：`reasoning_content`
- modalities：text input / text output
- context limit：`1,000,000`
- output limit：`384,000`

#### `deepseek-v4-pro`

- `reasoning: true`
- `reasoning_options`：包含 effort 值 `high`、`max`
- `tool_call: true`
- `structured_output: true`
- `interleaved`：`reasoning_content`
- modalities：text input / text output
- context limit：`1,000,000`
- output limit：`384,000`

#### `deepseek-chat`

- `reasoning: false`
- 没有 reasoning effort 选项
- `tool_call: true`
- `attachment: true`

#### `deepseek-reasoner`

- `reasoning: true`
- `reasoning_options: []`
- `tool_call: true`
- `interleaved`：`reasoning_content`

### 3.2 DeepSeek 合并结果

模型 ID 采用并集，共 4 个：

| modelId | API | models.dev | 当前事实结论 |
|---|---:|---:|---|
| `deepseek-v4-flash` | 有 | 有 | 两个来源均证明模型身份；能力字段主要来自 models.dev |
| `deepseek-v4-pro` | 有 | 有 | 两个来源均证明模型身份；能力字段主要来自 models.dev |
| `deepseek-chat` | 无 | 有 | 仅 models.dev 证明模型身份；不是 API 当前列表成员的结论 |
| `deepseek-reasoner` | 无 | 有 | 仅 models.dev 证明模型身份；不是 API 当前列表成员的结论 |

本次没有观察到 API 与 models.dev 对同一个 DeepSeek 能力字段给出不同值的事实，因此当前不能称为能力冲突。更准确的描述是：

- API 提供了 v4-flash / v4-pro 的模型身份和基础字段；
- models.dev 为同一模型补充了能力字段；
- models.dev 额外列举了 chat / reasoner；
- API 没有报告 reasoning 字段，状态为 `missing`，不是 `unsupported`。

## 4. OpenAI：官方 API 文档与原始字段

### 4.1 官方模型列表字段

阅读的官方文档：

[OpenAI Models API Reference](https://platform.openai.com/docs/api-reference/models/object?lang=curl)

官方模型列表接口：

```text
GET https://api.openai.com/v1/models
```

文档说明的模型对象字段：

- `id`
- `object`
- `created`
- `owned_by`

顶层字段：

- `object`
- `data`

### 4.2 本次 API 实际返回字段

本次请求：

- endpoint：`https://api.openai.com/v1/models`；
- HTTP：`200 OK`；
- 模型记录：124。

实际观察到的模型项字段：

- `id`
- `object`
- `created`
- `owned_by`
- `shutdown_date`

`shutdown_date` 是本次实际响应中观察到、但上述 API 文档字段列表中未列出的字段。它应作为原始 API 字段保存；当前不把它自动翻译为 Starverse 的某个最终状态字段。

### 4.3 OpenAI 与 models.dev 的 ID 比较

本次 models.dev provider key：`openai`。

计数：

- API：124 个；
- models.dev：47 个；
- 精确交集：44 个；
- API-only：80 个；
- models.dev-only：3 个；
- 精确并集：127 个。

models.dev-only 的精确 ID：

- `gpt-5.3-codex-spark`
- `gpt-5.6`
- `o3-pro`

模糊查询 API 原始 ID 后观察到：

- `gpt-5.6`：API 有 `gpt-5.6-sol`、`gpt-5.6-terra`、`gpt-5.6-luna`，但没有精确的 `gpt-5.6`；
- `gpt-5.3`：API 有 `gpt-5.3-codex`、`gpt-5.3-chat-latest`；
- `o3-pro`：没有模糊匹配；
- `gpt-5.3-codex-spark`：没有模糊匹配；
- `codex-spark`：没有模糊匹配。

这只说明本次 API 列表中的精确/模糊 ID 结果，不说明 models.dev-only 模型在所有账户、组织或 endpoint 下均可请求。

### 4.4 OpenAI models.dev 原始字段集合

provider 字段：

- `doc`
- `env`
- `id`
- `models`
- `name`
- `npm`

模型字段的观察到的并集：

- `attachment`
- `cost`
- `description`
- `experimental`
- `family`
- `id`
- `knowledge`
- `last_updated`
- `limit`
- `modalities`
- `name`
- `open_weights`
- `reasoning`
- `reasoning_options`
- `release_date`
- `status`
- `structured_output`
- `temperature`
- `tool_call`

## 5. OpenAI 三个额外请求探测：独立于模型事实表

本节只记录已发生的 provider 行为探测，不把结果直接写入模型身份或模型能力字段。

请求形式：

```text
POST https://api.openai.com/v1/responses
body: { "model": "<modelId>", "input": "reply OK" }
```

未显式设置 reasoning 参数，代理端口为 `10808`。

### `o3-pro`

- HTTP：`400`；
- provider 错误：组织必须完成验证才能使用该模型；
- 错误类型：`invalid_request_error`；
- 错误参数：`model`；
- 错误代码：`unsupported_value`。

该结果不能直接归类为“模型不存在”或“模型能力不支持”。它是一次请求上下文中的 provider 访问/组织资格错误。

### `gpt-5.6`

- HTTP：`200`；
- 输出文本：`OK`；
- provider response `model`：`gpt-5.6-sol`；
- 未传 reasoning 参数时，响应中出现默认 `reasoning.effort: medium`。

请求模型 `gpt-5.6` 与供应商响应模型 `gpt-5.6-sol` 必须分别保存，不能悄悄覆盖成一个模型字段。该现象属于供应商路由/响应事实。

### `gpt-5.3-codex-spark`

- HTTP：`400`；
- provider 错误代码：`model_not_found`。

这仍然是一次具体请求的行为证据，不应单独改写模型事实并集。

## 6. Google AI Studio：官方 API 文档与原始字段

### 6.1 官方文档

阅读的官方文档：

[Google Gemini Models API](https://ai.google.dev/api/models)

模型列表接口：

```text
GET https://generativelanguage.googleapis.com/v1beta/models
```

文档列出的 Model 字段包括：

- `name`
- `baseModelId`
- `version`
- `displayName`
- `description`
- `inputTokenLimit`
- `outputTokenLimit`
- `supportedGenerationMethods`
- `thinking`
- `temperature`
- `maxTemperature`
- `topP`
- `topK`

列表参数：

- `pageSize`：默认 50，本次使用 `100`；
- `pageToken`：用于分页。

### 6.2 本次 API 实际返回

请求：

```text
GET https://generativelanguage.googleapis.com/v1beta/models?pageSize=100
```

结果：

- HTTP：`200 OK`；
- 返回模型记录：50；
- 本次响应没有观察到下一页 token。

实际字段并集：

- `description`
- `displayName`
- `inputTokenLimit`
- `maxTemperature`
- `name`
- `outputTokenLimit`
- `supportedGenerationMethods`
- `temperature`
- `thinking`
- `topK`
- `topP`
- `version`

虽然官方文档列出 `baseModelId`，本次实际 50 条记录中没有观察到该字段。应分别保存“文档定义字段”和“本次实际返回字段”，不能把文档字段当作本次响应事实。

API 的 `name` 是资源名，例如：

```text
models/gemini-2.5-flash
```

### 6.3 Google API 与 models.dev 的 ID 比较

models.dev provider key：`google`。

为了比较模型身份，本次只对 API 的 `models/` 资源名前缀做了匹配规范化，同时保留原始 API `name`：

- API：50 个；
- models.dev：39 个；
- 规范化后交集：39 个；
- API-only：11 个；
- models.dev-only：0 个；
- 规范化并集：50 个。

API-only 的规范化 ID：

- `antigravity-preview-05-2026`
- `aqa`
- `deep-research-pro-preview-12-2025`
- `gemini-2.5-flash-native-audio-latest`
- `gemini-2.5-flash-native-audio-preview-09-2025`
- `gemini-2.5-flash-native-audio-preview-12-2025`
- `gemini-embedding-2-preview`
- `gemini-pro-latest`
- `gemini-robotics-er-2-preview`
- `gemini-robotics-er-2-streaming-preview`
- `nano-banana-pro-preview`

本次快照中没有 models.dev-only 的模型 ID。

### 6.4 Google 语义字段比较

在规范化后重叠的 39 个模型中：

- API `thinking` 与 models.dev `reasoning`：27 个模型两边均有字段；27 个值相同；0 个观察到不同；
- API `inputTokenLimit` 与 models.dev `limit.context`：39 个全部相同；
- API `outputTokenLimit` 与 models.dev `limit.output`：39 个全部相同；
- API description 与 models.dev description：39 个模型中没有文本完全相同的记录。

需要特别保留的语义差异：

- API 的 `temperature` 是数值型默认温度值；
- models.dev 的 `temperature` 是布尔型能力/支持标记。

它们字段名相同，但语义和类型不同，不能合并为一个 `temperature` 字段。

另外：

- API `supportedGenerationMethods` 与 models.dev `tool_call` 不是已经证明的一一对应字段；
- API `supportedGenerationMethods` 与 models.dev `structured_output` 也不是已经证明的一一对应字段；
- API `supportedGenerationMethods` 与 models.dev `modalities` 也不能直接互换。

在没有进一步语义映射证据前，应保存为各自来源字段。

## 7. 当前已确认的“同源/缺失/不同语义”分类

### 7.1 同一语义、多个证据

当前有实测支持的例子：

- Google API `inputTokenLimit` 与 models.dev `limit.context`：39 个重叠模型值相同；
- Google API `outputTokenLimit` 与 models.dev `limit.output`：39 个重叠模型值相同；
- Google API `thinking` 与 models.dev `reasoning`：本次 27 个共同出现的模型值相同。

这允许后续设计一个“规范化语义字段”，并挂接两个来源证据；但仍应保留原始字段，且当前结论只覆盖这次抓取样本。

### 7.2 一方报告、另一方缺失

DeepSeek 是当前最清楚的例子：

- API 报告 v4-flash / v4-pro 的模型身份和基础字段；
- API 没有 reasoning 等能力字段；
- models.dev 报告 reasoning、reasoning_options、tool_call、structured_output、limits 等字段。

这里是 `missing` 与“另一来源有证据”的组合，不是 API 反对 models.dev。

### 7.3 同名但不同语义

Google 的 `temperature` 是当前已经确认的真实例子：

- Google API：数值默认值；
- models.dev：布尔支持标记。

正确处理是拆开保存，例如概念上分别对应：

- `api.temperature.default`
- `modelsDev.temperature.supported`

不能因为字段名相同而写入同一个规范化字段。

### 7.4 当前没有观察到的情况

本轮已测试的 DeepSeek、OpenAI、Google 结果中，尚未观察到一个双方都明确报告同一语义字段、但值不同的真实能力冲突案例。

因此当前不应预先写成“API 与 models.dev 存在能力冲突”。目前能确认的是：

- 来源覆盖不完整；
- 字段语义可能不同；
- 模型 ID 集合可能不同；
- provider API 与 models.dev 的记录范围不同。

## 8. 建议的原始事实记录形状

下面是讨论中的记录形状示意，不是当前已提交的代码 schema：

```json
{
  "providerId": "google",
  "modelId": "gemini-2.5-flash",
  "identity": {
    "canonicalModelId": "gemini-2.5-flash",
    "sourceMembership": ["provider-api", "models-dev"]
  },
  "rawObservations": [
    {
      "sourceId": "provider-api",
      "sourceRevision": "<api-snapshot-revision>",
      "rawModelId": "models/gemini-2.5-flash",
      "fields": {
        "name": "models/gemini-2.5-flash",
        "thinking": true,
        "temperature": 1,
        "inputTokenLimit": 1048576,
        "outputTokenLimit": 65536
      }
    },
    {
      "sourceId": "models-dev",
      "sourceRevision": "<models-dev-snapshot-revision>",
      "rawModelId": "gemini-2.5-flash",
      "fields": {
        "reasoning": true,
        "temperature": true,
        "limit": {
          "context": 1048576,
          "output": 65536
        }
      }
    }
  ],
  "normalizedFacts": [
    {
      "path": "reasoning.supported",
      "value": true,
      "evidenceIds": ["api-thinking", "models-dev-reasoning"],
      "status": "observed-equivalent-for-this-snapshot"
    },
    {
      "path": "limits.context",
      "value": 1048576,
      "evidenceIds": ["api-input-limit", "models-dev-context-limit"],
      "status": "observed-equivalent-for-this-snapshot"
    },
    {
      "path": "provider-api.temperature.default",
      "value": 1,
      "evidenceIds": ["api-temperature"]
    },
    {
      "path": "models-dev.temperature.supported",
      "value": true,
      "evidenceIds": ["models-dev-temperature"]
    }
  ]
}
```

这个形状表达三个约束：

1. 原始字段永远保留；
2. 规范化字段必须可追溯到具体 evidence；
3. 同名异义字段不能被压扁成一个值。

## 9. 后续 Starverse 翻译层的边界

这不是本轮实施内容，但当前讨论已经形成以下边界：

### 原始事实层负责

- provider/model 的原始身份；
- 来源成员关系；
- 原始 API 字段；
- 原始 models.dev 字段；
- 字段类型；
- 来源 revision；
- evidence provenance；
- `missing`、`unknown`、已报告值的区分；
- 已确认的跨来源语义等价关系。

### Starverse 翻译/消费层后续负责

- 哪些事实映射为 UI 控件；
- UI 控件的显示、隐藏、禁用和允许值；
- 请求构建所需要的 semantic intent；
- provider wire field 的构建；
- 模型目录显示摘要；
- active catalog membership 与 credential/endpoint availability；
- 发送前校验和 runtime snapshot。

翻译层不应反向修改原始事实，也不应把一次请求的路由结果写回模型身份。

## 10. 当前工作成果与状态

- 已完成 DeepSeek API 无 Key/有 Key 模型列表测试；
- 已保存 DeepSeek API 完整模型列表字段；
- 已获取并比较 DeepSeek models.dev provider 记录；
- 已阅读 OpenAI 模型列表官方文档；
- 已获取并比较 OpenAI API 与 models.dev 模型 ID 和字段集合；
- 已对 OpenAI 三个模型做一次独立 Responses API 行为探测；
- 已阅读 Google AI Studio 模型列表官方文档；
- 已获取并比较 Google API 与 models.dev 模型 ID 和字段集合；
- 已确认 Google `temperature` 是同名异义字段的实际例子；
- 已确认 DeepSeek 当前没有 API capability 字段与 models.dev capability 字段的真实冲突证据；
- 已确认当前模型集合讨论采用来源并集，不丢弃单一来源模型；
- 尚未接入 models.dev 生产代码；
- 尚未添加烟测规则；
- 本轮不修改 Starverse 代码。

当前工作分支：`models-dev-capability-resolution`。

## 11. 后续调查建议

下一步继续按 provider 做实测，优先记录：

1. API 原始模型列表的完整字段；
2. models.dev 对应 provider 的完整字段；
3. 模型 ID 的并集、交集、单源成员；
4. 相同语义字段的值和类型比较；
5. 同名异义字段；
6. API 缺失字段与 models.dev 补充字段；
7. 只有在双方都明确报告同一语义且值不同的情况下，才记录为真实冲突；
8. 不把请求探测的路由、资格、响应模型名直接写成模型能力事实。

每轮调查都应先把原始证据落盘，再形成规范化或消费层建议。

## 12. 2026-08-23 补充：Anthropic、OpenRouter 与本地供应商

### 12.1 Anthropic 已移出当前调查范围

README 已新增 2026-08-23 的停止声明：Anthropic/Claude 原生支持冻结并逐步移除，本专题不再把 Anthropic 作为待调查的原生供应商。

相关入口：[README.md](../../README.md)。

### 12.2 OpenRouter

OpenRouter 官方模型列表接口已确认：

```text
GET https://openrouter.ai/api/v1/models
```

官方接口返回的模型对象包含模型 ID、名称、架构、上下文长度、定价、默认参数、模态等 provider-specific 字段，并可通过参数筛选输出模态和支持的参数。

官方文档：[List all models and their properties](https://openrouter.ai/docs/api/api-reference/models/get-models)。

本次 models.dev provider key：`openrouter`。

models.dev 快照观察结果：

- provider 记录字段：`api`、`doc`、`env`、`id`、`models`、`name`、`npm`；
- 模型数量：360；
- 模型字段并集：
  - `attachment`
  - `cost`
  - `description`
  - `family`
  - `id`
  - `interleaved`
  - `knowledge`
  - `last_updated`
  - `limit`
  - `modalities`
  - `name`
  - `open_weights`
  - `reasoning`
  - `reasoning_options`
  - `release_date`
  - `structured_output`
  - `temperature`
  - `tool_call`

后续已完成 OpenRouter 公共 `/api/v1/models` 与 credential-scoped `/api/v1/models/user` 的现场观察，并完成公共 API 与 models.dev 的逐模型字段比较，见第 13、15、16 节。credential-scoped endpoint 的原始 JSON 没有保留在本地，只保留脱敏后的结构与集合观察，原因是可见终端中的 API Key 不进入项目文件。

### 12.3 LM Studio

本机默认 endpoint：`http://127.0.0.1:1234`。

本次实际请求结果：

| 接口 | HTTP | 模型数 | 原始模型字段特征 |
|---|---:|---:|---|
| `/api/v1/models` | 200 | 14 | `type`、`publisher`、`key`、`display_name`、`architecture`、`quantization`、`size_bytes`、`loaded_instances`、`max_context_length`、`capabilities`、`variants` 等 |
| `/api/v0/models` | 200 | 14 | OpenAI-like `id/object`，另有 `type`、`publisher`、`arch`、`compatibility_type`、`quantization`、`state`、`max_context_length`、`capabilities` |
| `/v1/models` | 200 | 14 | `id`、`object`、`owned_by` |

其中 `/api/v1/models` 的本次字段还观察到：

- `capabilities.vision`
- `capabilities.trained_for_tool_use`
- `capabilities.reasoning.allowed_options`
- `capabilities.reasoning.default`

因此 LM Studio 不仅有模型列表，而且原生 API 返回的能力字段比 OpenAI-compatible `/v1/models` 更丰富。三个接口不是同一信息量，原始事实层应保留 endpoint/source 标记。

官方文档确认：LM Studio v1 REST API 使用 `GET /api/v1/models`，同时支持 OpenAI-compatible `GET /v1/models`；v0 API 也提供 `GET /api/v0/models`。

参考：[LM Studio List your models](https://lmstudio.ai/docs/developer/rest/list)、[LM Studio REST API](https://lmstudio.ai/docs/developer/rest)、[LM Studio OpenAI-compatible List Models](https://beta.lmstudio.ai/docs/developer/openai-compat/models)。

models.dev provider key：`lmstudio`。

本次 models.dev 快照：

- 模型数量：3；
- 模型 ID：
  - `openai/gpt-oss-20b`
  - `qwen/qwen3-30b-a3b-2507`
  - `qwen/qwen3-coder-30b`
- 字段并集：`attachment`、`cost`、`description`、`family`、`id`、`knowledge`、`last_updated`、`limit`、`modalities`、`name`、`open_weights`、`reasoning`、`reasoning_options`、`release_date`、`temperature`、`tool_call`。

当前不能把 models.dev 的 3 个模型直接当成本机 14 个模型的可用性结论；它们只是另一个来源的模型/能力事实。

### 12.4 Ollama

本机默认 endpoint：`http://127.0.0.1:11434`。

本次实际请求结果：

| 接口 | HTTP | 模型数 | 原始模型字段特征 |
|---|---:|---:|---|
| `/api/tags` | 200 | 2 | `name`、`model`、`modified_at`、`size`、`digest`、`details`、`capabilities` |
| `/v1/models` | 200 | 2 | `id`、`object`、`created`、`owned_by` |

`/api/tags` 的 `details` 实际包含模型格式、family、families、parameter size、量化级别等本地模型信息；本次响应也观察到 `capabilities` 字段。OpenAI-compatible `/v1/models` 只返回简化的模型身份字段。

官方文档确认：Ollama 原生模型列表是 `GET /api/tags`，OpenAI compatibility 文档也定义了 `/v1/models`。

参考：[Ollama List models](https://docs.ollama.com/api/tags)、[Ollama OpenAI compatibility](https://github.com/ollama/ollama/blob/main/docs/api/openai-compatibility.mdx)。

models.dev 当前没有 `ollama` provider key。这个结果只能说明本次 models.dev API 快照没有对应 provider 记录，不能说明 Ollama 模型或能力不存在。

### 12.5 Generic Local OpenAI Chat

Generic Local 不是固定的远程供应商，而是用户配置的 loopback endpoint。它没有一个可以脱离具体 URL 单独抓取的统一 `models.list` 来源。

Starverse 当前本地 endpoint 诊断路径的实际规则是：

1. 对用户配置的 loopback base URL 请求 OpenAI-compatible `/v1/models`；
2. 如果没有可识别的 OpenAI model list，再请求 Ollama `/api/tags`；
3. 两者都无法识别时，返回 unavailable/invalid response。

因此 Generic Local 可以支持模型列表，但是否存在、返回哪些字段，取决于用户配置的具体 endpoint。本次没有额外配置一个 Generic Local endpoint，因此没有把它伪造成一个独立 live provider 结果。

代码证据：[localEndpointDiagnosticsIpc.ts](../../electron/ipc/localEndpointDiagnosticsIpc.ts:394)。

### 12.6 当前更新后的调查状态

已调查或已确认接口存在：

- DeepSeek：API 与 models.dev 已完成初步字段对照；
- OpenAI：API 与 models.dev 已完成初步字段对照；
- Google AI Studio/Gemini：API 与 models.dev 已完成初步字段对照；
- LM Studio：本机三个模型列表接口均实际返回成功，并已取得字段并集；
- Ollama：本机原生 `/api/tags` 与 OpenAI-compatible `/v1/models` 均实际返回成功，并已取得字段并集；
- Generic Local：已确认代码支持 `/v1/models` 和 `/api/tags` 两种发现路径，但没有统一 endpoint live 样本。

本阶段仍保留的后续工作：

- credential-scoped `/models/user` 原始 JSON 的重新留存（如确有审计需要，需再次通过可见终端提供临时 Key）；
- `/models/user` 与公共 `/models` 的逐字段值比较；
- LM Studio/Ollama 与 models.dev 的 provider-specific 规范化策略；本报告只保留原始字段和集合事实，不提前翻译成 Starverse 能力。

## 13. 2026-08-23 补充：OpenRouter live 公共模型列表

### 13.1 无 API Key 的接口行为

本次直接请求：

```text
GET https://openrouter.ai/api/v1/models/user
```

结果：HTTP `401 Unauthorized`。

随后直接请求公共模型目录：

```text
GET https://openrouter.ai/api/v1/models
```

结果：HTTP `200 OK`，无需本次审计进程中的 API Key。

这与 Starverse 当前 catalog source 的分层相符：优先尝试 credential-scoped `/models/user`，失败后可以使用公共 `/models`，但二者的事实含义不同，不能把公共目录当成当前 credential 的 availability 证明。

### 13.2 OpenRouter API 与 models.dev 模型集合

本次公共 API 与 models.dev 快照比较：

- OpenRouter API：422 个模型；
- models.dev：360 个模型；
- 精确交集：360 个；
- API-only：62 个；
- models.dev-only：0 个；
- 精确并集：422 个。

因此本次仍应采用模型 ID 并集。models.dev 当前没有额外列出 API 未出现的 OpenRouter 模型，但 API 有 62 个模型没有对应 models.dev 记录。

### 13.3 OpenRouter API 原始字段

API 模型项字段并集：


- `alias_target`
- `architecture`
- `benchmarks`
- `canonical_slug`
- `context_length`
- `created`
- `default_parameters`
- `description`
- `expiration_date`
- `hugging_face_id`
- `id`
- `knowledge_cutoff`
- `links`
- `name`
- `per_request_limits`
- `pricing`
- `reasoning`
- `supported_parameters`
- `supported_voices`
- `top_provider`

嵌套字段观察到：

- `architecture`：`input_modalities`、`output_modalities`、`modality`、`instruct_type`、`tokenizer`；
- `pricing`：`prompt`、`completion`、`web_search`、`image`、`audio`、`audio_output`、`image_output`、缓存价格等；
- `top_provider`：`context_length`、`max_completion_tokens`、`is_moderated`。

### 13.4 OpenRouter 与 models.dev 的字段语义比较

在 360 个精确交集模型中观察到：

- API `context_length` 与 models.dev `limit.context`：360 个全部相同；
- API `top_provider.max_completion_tokens` 与 models.dev `limit.output`：314 个 API 有非空值且相同；另有 46 个 API 值为空而 models.dev 有值，属于 API 字段缺失/为空，不是值冲突；
- API `description` 与 models.dev `description`：文本没有完全相同记录，属于描述来源差异，不是能力冲突；
- API `reasoning` 是对象结构，包含例如 `mandatory`、`default_enabled`、`supported_efforts`、`default_effort`；models.dev `reasoning` 是布尔值，具体档位位于 `reasoning_options`。两者同名但不是同一数据形状，不能直接覆盖；
- API `architecture.input_modalities/output_modalities` 与 models.dev `modalities` 具有相近主题，但存在 `file` 与 `pdf` 等值域差异，当前只能保留原始字段，不能未经规则证明就当作同一枚举；
- API `supported_parameters` 与 models.dev `tool_call`、`structured_output`、`reasoning_options` 不是已证明的一一对应关系；
- API `pricing` 与 models.dev `cost` 数值存在单位/字段结构差异，不能直接按同名字段覆盖。

因此 OpenRouter 当前提供了一个真实的“同名字段、语义或形状不同”例子，但本次没有发现双方对同一已确认语义能力给出相反值的冲突。

### 13.5 OpenRouter 当前结论

- 公共模型目录无需 API Key 即可获得；credential-scoped `/models/user` 需要 API Key；
- 公共 API 模型集合大于 models.dev，模型 ID 仍取并集；
- API capability metadata 明显比 DeepSeek/OpenAI/Google 的基础模型列表丰富；
- models.dev 仍然提供另一组字段和语义表示，不能直接覆盖 API 字段；
- OpenRouter 是目前最值得继续做字段级语义对照的 provider；
- credential-scoped `/models/user` 已完成 live 结构与集合观察：本次返回 422 个模型，与公共 `/models` 精确一致，但其原始 payload 未留存，因此不能把该 endpoint 的字段缺失补写为公共 endpoint 已证明的字段。

## 14. 本轮调查结论更新

在不把 Anthropic 重新纳入调查的前提下，原生/运行时调查状态为：

1. DeepSeek：完成初步 API 与 models.dev 对照；
2. OpenAI：完成初步 API 与 models.dev 对照；
3. Google AI Studio/Gemini：完成初步 API 与 models.dev 对照；
4. OpenRouter：公共 API 与 models.dev 已完成第一轮模型集合和字段比较；credential-scoped `/models/user` 已完成现场集合/结构观察，但原始 payload 未留存；
5. LM Studio：三个本机模型列表接口实际成功；API v1 能力字段最丰富；models.dev 有 3 个模型，但与本机 14 个模型本次没有精确 ID 交集，模型并集为 17；
6. Ollama：本机 `/api/tags` 和 `/v1/models` 实际成功；models.dev 当前没有 `ollama` provider；
7. Generic Local OpenAI Chat：没有统一 provider catalog；Starverse diagnostics 支持探测 `/v1/models` 和 `/api/tags`，具体结果取决于用户 endpoint。

Anthropic 的代码和 catalog registry 仍处于“冻结、逐步移除”状态，但不再作为本轮模型事实调查对象；这与 README 的停止声明一致。

## 15. 2026-08-23 补充：OpenRouter credential-scoped 模型列表

通过可见终端安全输入 API Key 后，分别请求：

```text
GET https://openrouter.ai/api/v1/models/user
GET https://openrouter.ai/api/v1/models
```

两次请求均返回：

- HTTP `200`；
- 422 个模型；
- 顶层字段：`data`、`links`、`total_count`；
- 模型 ID 集合完全一致：credential-scoped `userOnlyCount=0`，公共目录 `publicOnlyCount=0`。

因此在本次账户和本次抓取时刻，OpenRouter 的 `/models/user` 与公共 `/models` 没有观察到模型集合差异。

但原始字段集合并不完全一致：

- `/models/user` 模型字段：`architecture`、`canonical_slug`、`context_length`、`created`、`default_parameters`、`description`、`expiration_date`、`hugging_face_id`、`id`、`knowledge_cutoff`、`links`、`name`、`per_request_limits`、`pricing`、`reasoning`、`supported_parameters`、`supported_voices`、`top_provider`；
- 公共 `/models` 额外出现：`alias_target`、`benchmarks`。

这说明两个 endpoint 当前模型集合相同，但 response schema/字段覆盖不同。`/models/user` 缺少 `alias_target`、`benchmarks` 应记录为该来源的字段缺失，不能被补写成公共 endpoint 已证明的字段，更不能据此判断模型能力不同。

本次脱敏审计没有逐字段比较两个 endpoint 的所有共同字段值，因此当前只确认：

- 模型数量相同；
- 模型 ID 集合相同；
- 顶层字段相同；
- 模型字段集合存在差异；
- 共同字段值是否全部相同：待核验。

本次没有保留 API Key；可见终端使用的临时诊断脚本在完成后清理。

## 16. 2026-08-23：OpenRouter API 与 models.dev 逐模型字段比较

本轮重新抓取公共 OpenRouter `/api/v1/models` 与 models.dev `openrouter` 快照，对 360 个精确交集模型逐个比较。下面的计数覆盖全部 360 个模型；“缺失”表示该来源的该字段为空或不存在，不表示不支持。

### 16.1 全量比较计数

| 比较项 | 逐模型结果 |
|---|---|
| API `context_length` vs models.dev `limit.context` | 360 相同 |
| API `top_provider.context_length` vs models.dev `limit.context` | 315 相同、40 不同、5 API 缺失 |
| API `top_provider.max_completion_tokens` vs models.dev `limit.output` | 314 相同、46 API 缺失 |
| API reasoning effort 集合 vs models.dev `reasoning_options[type=effort].values` | 103 相同、130 API 缺失、127 双方均缺失、0 个集合不同 |
| API reasoning 原始类型 vs models.dev `reasoning` | 235 个 API 为对象而 models.dev 为布尔值；125 个 API 缺失 |
| API `supported_parameters` 中的 `tools` vs models.dev `tool_call` | 291 个双方均为 true，69 个双方均为 false |
| API `structured_outputs/response_format` vs models.dev `structured_output` | 275 个双方为 true，36 个仅 API 侧为 true，49 个双方为 false |
| API pricing prompt/completion × 1,000,000 vs models.dev cost input/output | 355 个数值相同、4 个不完整、1 个数值不同 |
| API `name` vs models.dev `name` | 26 个文本相同、334 个不同 |
| API `description` vs models.dev `description` | 360 个文本不同 |
| API `architecture` 原始对象 vs models.dev `modalities` | 360 个结构不同；不是同一 JSON 形状 |

其中价格比较只是把 API 原始 prompt/completion 数值乘以 1,000,000 后与 models.dev cost 做数值核对，不把这个计算本身当作已经冻结的统一价格语义。

一个实际的数值差异是：

- `deepseek/deepseek-v4-pro`
- API pricing：prompt `0.000000396894`、completion `0.000000793788`
- 归一化后：input `0.396894`、output `0.793788`
- models.dev cost：input `0.413772`、output `0.827544`

这属于价格事实差异/更新时点差异候选，不是模型 capability 冲突。

### 16.2 能力集合比较的解释

OpenRouter 的 reasoning effort 是本轮最适合直接比较的能力集合：

- 103 个模型两边给出的 effort 集合完全相同；
- 130 个模型 API 没有给出 `reasoning.supported_efforts`，但 models.dev 有 effort 集合；
- 127 个模型两边都没有 effort 集合；
- 没有观察到双方 effort 集合明确不同的模型。

因此当前 OpenRouter 样本没有发现 reasoning effort 的真实值冲突，主要问题是 API 字段缺失和原始结构不同。

但 API `reasoning` 和 models.dev `reasoning` 不能直接合并：

- API：对象，例如 `{ mandatory, default_enabled, supported_efforts, default_effort }`；
- models.dev：布尔值，具体 effort 另放在 `reasoning_options`。

同样，API `response_format` 不等于 models.dev `structured_output` 已被证明的一一对应关系；本轮有 36 个模型 API 侧出现 `response_format`/`structured_outputs`，而 models.dev `structured_output` 为 false。这个现象应先保留为来源语义差异，不能直接写成能力冲突。

### 16.3 典型模型原始字段对照

下面的模型均来自 OpenRouter，`anthropic/claude-sonnet-5` 只是 OpenRouter 托管模型，不代表恢复 Anthropic 原生供应商调查。

#### `openai/gpt-5.6-sol`

API 原始字段摘要：

```json
{
  "context_length": 1050000,
  "top_provider": { "context_length": 1050000, "max_completion_tokens": 128000 },
  "architecture": { "input_modalities": ["file", "image", "text"], "output_modalities": ["text"] },
  "reasoning": {
    "mandatory": false,
    "default_enabled": true,
    "supported_efforts": ["max", "xhigh", "high", "medium", "low", "none"],
    "default_effort": "medium"
  },
  "supported_parameters": ["reasoning", "reasoning_effort", "structured_outputs", "tools", "tool_choice"]
}
```

models.dev 原始字段摘要：

```json
{
  "limit": { "context": 1050000, "input": 922000, "output": 128000 },
  "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] },
  "reasoning": true,
  "reasoning_options": [{ "type": "effort", "values": ["none", "low", "medium", "high", "xhigh", "max"] }],
  "tool_call": true,
  "structured_output": true,
  "temperature": false
}
```

这里 reasoning effort 集合相同；但 API 的 `file` 与 models.dev 的 `pdf` 仍是原始值域差异，不能未经映射规则直接当作同一个枚举值。

#### `anthropic/claude-sonnet-5`（OpenRouter）

API：

```json
{
  "context_length": 1000000,
  "top_provider": { "context_length": 1000000, "max_completion_tokens": 128000 },
  "architecture": { "input_modalities": ["text", "image", "file"], "output_modalities": ["text"] },
  "reasoning": {
    "mandatory": false,
    "default_enabled": true,
    "supported_efforts": ["max", "xhigh", "high", "medium", "low"],
    "default_effort": "high"
  },
  "supported_parameters": ["reasoning", "reasoning_effort", "response_format", "structured_outputs", "tools"]
}
```

models.dev：

```json
{
  "limit": { "context": 1000000, "output": 128000 },
  "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] },
  "reasoning": true,
  "reasoning_options": [
    { "type": "toggle" },
    { "type": "effort", "values": ["low", "medium", "high", "xhigh", "max"] }
  ],
  "tool_call": true,
  "structured_output": true,
  "temperature": false
}
```

这里 effort 集合相同，但 models.dev 另外记录了 `toggle`，API 则用 `default_enabled` 和对象结构表达开关语义。二者不能简单地把一个布尔值覆盖到另一个字段。

#### `google/gemini-3.5-flash`

API：

```json
{
  "context_length": 1048576,
  "top_provider": { "context_length": 1048576, "max_completion_tokens": 65536 },
  "architecture": { "input_modalities": ["text", "image", "video", "file", "audio"] },
  "reasoning": {
    "mandatory": true,
    "default_enabled": true,
    "supported_efforts": ["high", "medium", "low", "minimal"],
    "default_effort": "medium"
  },
  "supported_parameters": ["reasoning", "reasoning_effort", "structured_outputs", "tools", "temperature"]
}
```

models.dev：

```json
{
  "limit": { "context": 1048576, "output": 65536 },
  "modalities": { "input": ["text", "image", "video", "audio", "pdf"], "output": ["text"] },
  "reasoning": true,
  "reasoning_options": [{ "type": "effort", "values": ["minimal", "low", "medium", "high"] }],
  "tool_call": true,
  "structured_output": true,
  "temperature": true
}
```

这里 reasoning effort 集合相同；`file`/`pdf` 和 API 数值型/第三方布尔型 `temperature` 仍应在原始层分别保存。

#### `deepseek/deepseek-v4-pro`

API：

```json
{
  "context_length": 1048576,
  "top_provider": { "context_length": 1024000, "max_completion_tokens": 384000 },
  "architecture": { "input_modalities": ["text"], "output_modalities": ["text"] },
  "reasoning": {
    "mandatory": false,
    "supported_efforts": ["xhigh", "high"],
    "default_effort": "high"
  },
  "supported_parameters": ["reasoning", "reasoning_effort", "structured_outputs", "tools"]
}
```

models.dev：

```json
{
  "limit": { "context": 1048576, "output": 384000 },
  "modalities": { "input": ["text"], "output": ["text"] },
  "reasoning": true,
  "reasoning_options": [
    { "type": "toggle" },
    { "type": "effort", "values": ["high", "xhigh"] }
  ],
  "tool_call": true,
  "structured_output": true,
  "temperature": true
}
```

effort 集合相同；但 API 的 `top_provider.context_length` 比模型级 API `context_length` 小，models.dev 的 `limit.context` 与模型级 API 值相同。这是 endpoint/provider-scope 差异的典型例子，不能直接称为冲突。

#### `qwen/qwen3.6-35b-a3b`

API：

```json
{
  "context_length": 262144,
  "top_provider": { "context_length": 262144, "max_completion_tokens": 262144 },
  "architecture": { "input_modalities": ["text", "image", "video"] },
  "reasoning": { "mandatory": false, "default_enabled": true },
  "supported_parameters": ["reasoning", "structured_outputs", "tools", "temperature"]
}
```

models.dev：

```json
{
  "limit": { "context": 262144, "output": 262144 },
  "modalities": { "input": ["text", "image", "video"], "output": ["text"] },
  "reasoning": true,
  "reasoning_options": [{ "type": "toggle" }],
  "tool_call": true,
  "structured_output": true,
  "temperature": true
}
```

这里 API 没有 effort 列表，只报告 reasoning 开关相关字段；models.dev 也只有 toggle，没有 effort 值。两边没有值域冲突，主要是字段表达方式不同。

#### `meta-llama/llama-3.3-70b-instruct`

API：

```json
{
  "context_length": 131072,
  "top_provider": { "context_length": 131072, "max_completion_tokens": 16384 },
  "architecture": { "input_modalities": ["text"], "output_modalities": ["text"] },
  "supported_parameters": ["structured_outputs", "tools", "temperature"]
}
```

models.dev：

```json
{
  "limit": { "context": 131072, "output": 16384 },
  "modalities": { "input": ["text"], "output": ["text"] },
  "reasoning": false,
  "tool_call": true,
  "structured_output": true,
  "temperature": true
}
```

这是“API 没有 reasoning 字段、models.dev 明确报告 `reasoning: false`”的典型样本。它仍然不是冲突：API 侧是 `missing`，不是 `unsupported`。

### 16.4 本轮逐模型比较结论

1. OpenRouter API 与 models.dev 的 360 个共同模型中，没有观察到 reasoning effort 集合相互矛盾的模型。
2. context/output limits 大部分可以对应，但必须区分 API 顶层模型限制与 `top_provider` 路由限制。
3. API 和 models.dev 的 reasoning、modalities、structured output、temperature 等字段存在真实的结构或语义差异，不能按字段名直接合并。
4. API 有 62 个 models.dev 没有的模型；模型集合继续采用并集。
5. 价格字段出现至少一个数值差异，价格应作为独立事实域保存，不应混入 capability 结论。
6. 当前仍没有发现双方对同一个已确认语义 capability 给出相反值的真实冲突。
