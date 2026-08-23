# models.dev 模型能力事实底稿

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
