# OpenRouter 模型同步与能力构建规范

> **Single Source of Truth (SSOT)**
> 
> 本文档是项目中所有与 OpenRouter 模型列表同步、模型能力构建相关代码的唯一规范来源。
> 任何对模型同步/能力映射逻辑的修改，都必须：
> 1. 先读取并解析本文档；
> 2. 确认修改与规范一致；如有必要，先在本文档中更新规范，再改代码。

---

## 1. 目标与边界

### 1.1 目标

* 以 **OpenRouter `/api/v1/models`** 作为唯一后端数据源，构建并维护：

  * 本地模型列表；
  * 模型能力映射（reasoning / tools / structured outputs / JSON mode / 多模态等）；
  * 模型价格信息（用于展示和成本估算）。

* 满足以下工程要求：

  * **无内置 Fallback 模型**（不伪造数据）：本地若无缓存且无法访问网络，则前端应显示"无模型/待配置 API Key"，而不是使用硬编码的假模型。
  * **必须校验 API Key 后才发起网络请求**，减少无效 401 错误与噪音。
  * **防御性编程**：单条坏数据不能拖垮整个列表；网络/解析失败时保留旧数据。
  * **软删除/归档（archived）**：云端已经下架而本地仍引用的模型不会被硬删除，而是标记为 `is_archived`。

### 1.2 数据源边界（基于官方文档）

* 使用的后端接口：
  `GET https://openrouter.ai/api/v1/models` ([OpenRouter](https://openrouter.ai/docs/guides/overview/models))
* 以官方 **Model Object Schema / Architecture Object / Pricing Object / supported_parameters** 为准，特别是：

  * `architecture.input_modalities` / `architecture.output_modalities`；
  * `pricing.prompt / completion / request / image / web_search / internal_reasoning / input_cache_read / input_cache_write`；
  * `supported_parameters: string[]` 用于能力发现（如 `reasoning` / `tools` / `structured_outputs` / `response_format` 等）。

---

## 2. 统一数据结构规范：AppModel

所有前端/应用层逻辑一律不直接使用原始 API 返回结构，而是先规整为 `AppModel`：

```ts
interface ModelCapabilities {
  hasReasoning: boolean;   // supported_parameters 包含 'reasoning'
  hasTools: boolean;       // supported_parameters 包含 'tools'
  hasJsonMode: boolean;    // structured_outputs 或 response_format
  isMultimodal: boolean;   // input/output_modalities 包含 image/audio/video
}

interface ModelPricing {
  prompt: string;              // 每 token 价格（字符串形式）
  completion: string;
  request: string;
  image: string;
  web_search: string;
  internal_reasoning: string;
  input_cache_read: string;
  input_cache_write: string;
}

interface AppModel {
  id: string;                  // OpenRouter 模型 ID（如 'openai/gpt-5-chat'）
  name: string;                // 展示名，缺失时回退为 id
  context_length: number;      // 原始值；若未知则为 -1
  capabilities: ModelCapabilities;
  pricing: ModelPricing;
  is_archived: boolean;        // 本地存在但云端缺失时标记为 true
  
  // 时间戳字段（软删除策略）
  first_seen_at?: string;      // ISO8601 字符串：第一次在 /models 响应中出现的时间
  last_seen_at?: string;       // ISO8601 字符串：最后一次在 /models 响应中出现的时间
  
  // 接入来源与厂商（拆分语义）
  router_source: string;       // 'openrouter' | 'openai_api' | 'anthropic_api' | 'local' 等
  vendor: string;              // 'openai' | 'anthropic' | 'google' | 'deepseek' | 'meta' | 'xai' 等
}
```

### 2.1 能力推导规则（Capabilities）

从 `raw`（OpenRouter Model 对象）推导 `capabilities` 时，必须遵守：

```ts
const params = raw.supported_parameters ?? [];
const arch = raw.architecture ?? {};
const inputMods: string[] = arch.input_modalities ?? [];
const outputMods: string[] = arch.output_modalities ?? [];

const hasReasoning = params.includes('reasoning');
const hasTools = params.includes('tools');

// JSON / 结构化输出能力：以 structured_outputs 和 response_format 为准
const hasJsonMode =
  params.includes('structured_outputs') ||
  params.includes('response_format');

// 多模态能力：通过 input/output_modalities 判断
const multimodalTokenSet = new Set(['image', 'audio', 'video', 'file']);
const isMultimodal =
  inputMods.some(m => multimodalTokenSet.has(m)) ||
  outputMods.some(m => multimodalTokenSet.has(m));
```

约束：

1. **禁止**基于 `id` 字符串内容（例如包含 `deepseek-r1`、`reasoner` 等）来"猜测"能力；
2. **不再设计任何本地 override 机制**（包括 config/model_overrides.json 等）；
3. 所有能力判断一律以 OpenRouter `/api/v1/models` 返回的字段为唯一信息源。

### 2.2 价格字段（Pricing）

```ts
const pricing: ModelPricing = {
  prompt: raw.pricing?.prompt ?? '0',
  completion: raw.pricing?.completion ?? '0',
  request: raw.pricing?.request ?? '0',
  image: raw.pricing?.image ?? '0',
  web_search: raw.pricing?.web_search ?? '0',
  internal_reasoning: raw.pricing?.internal_reasoning ?? '0',
  input_cache_read: raw.pricing?.input_cache_read ?? '0',
  input_cache_write: raw.pricing?.input_cache_write ?? '0',
};
```

注意：

* 所有字段都以字符串存储，保持与 API 返回一致，避免精度问题；
* 在 Diff 计算与展示中，需要使用整个 `ModelPricing` 对象，而不是只取 prompt/completion。

### 2.3 context_length 处理

```ts
const context_length =
  typeof raw.context_length === 'number' ? raw.context_length : -1;
```

* `-1` 表示"未知"，UI 需要能够识别并显示"未知上下文长度"；
* 禁止主观假定默认值（例如自动用 4096 代替）。

### 2.4 router_source 与 vendor 语义

* `router_source`: 表示"本条模型是通过哪一种上游接入方式获取的"。示例值：
  * `'openrouter'`（通过 OpenRouter /api/v1/models 拉取）；
  * 将来如有其它通道，可扩展为 `'openai_api'`, `'anthropic_api'`, `'local'` 等。

* `vendor`: 表示"模型厂商/品牌"（如 openai / anthropic / google / deepseek / meta / xai 等）。
  * 对于 OpenRouter 的模型，`vendor` 可通过 `id` 前缀解析（例如 `openai/xxx` → `'openai'`，`anthropic/xxx` → `'anthropic'` 等）。

约束：
* 所有对"接入方式"的判断（走哪条 client / 选用哪个 SDK）只能依赖 `router_source`；
* 所有对"模型厂商/品牌"的展示与过滤只能依赖 `vendor`；
* 禁止再新增新的 `provider` 字段或在现有字段中混用"接入方式"和"厂商"语义。

---

## 3. 三阶段流程：本地启动 → Key 校验 → 云端同步

整个生命周期内，模型系统必须严格按照下面三个阶段运行。

### 3.1 阶段一：本地启动（Bootstrap Phase）

目标：
在**不发起任何网络请求**的前提下，尽快加载本地缓存，保证 UI 不因网络问题而"白屏"。

参考伪代码（需与实际框架适配）：

```ts
async function bootstrapModels() {
  // 1. 从持久化存储读取（SQLite / electron-store / local DB）
  const localRawData: AppModel[] | null = await persistence.getModels();

  if (!localRawData || localRawData.length === 0) {
    console.log('[ModelSystem] 本地缓存为空，等待云端同步');
    store.models = [];  // 明确为空
  } else {
    // 本地数据已经是规范的 AppModel 结构，无需再解析
    store.models = localRawData;
    console.log(`[ModelSystem] 加载了 ${localRawData.length} 个本地模型`);
  }

  // 标记模型子系统就绪，允许 UI 渲染模型相关视图
  store.isModelSystemReady = true;

  // 2. 启动后置流程（Key 校验 + 云端同步）
  await trySyncRemoteModels();
}
```

要求：

1. 启动时**禁用硬编码 Fallback 列表**；
2. 若本地为空，则 UI 应明确展示"无模型 / 请配置 OpenRouter API Key 后同步"；
3. `store.isModelSystemReady` 只表示"本地缓存已加载并可用"，不等价于"与云端已同步"。

### 3.2 阶段二：前置校验（Pre-flight Check）

目标：
防止在 API Key 未配置或明显非法时发起无意义请求。

```ts
async function trySyncRemoteModels() {
  const apiKey = store.settings.openrouterApiKey;

  if (!apiKey || apiKey.trim() === '') {
    console.warn('[ModelSync] 未检测到 OpenRouter API Key，跳过云端同步');
    // UI 可显示提示条："配置 OpenRouter API Key 以获取最新模型列表"
    return;
  }

  await performBackgroundSync(apiKey);
}
```

要求：

* 不允许在 Key 为空或明显不合法时继续执行；
* 如果需要对 Key 做格式校验（例如前缀），可以在这里进行，但失败时也只应终止同步，不影响本地缓存的使用。

### 3.3 阶段三：静默同步与防腐层（Background Sync & Anti-Corruption）

目标：
在后台刷新模型列表，保证：

* 单条脏数据不会拖垮整体；
* 云端变更可靠反映到本地；
* 本地仍在使用的"下架模型"被标记为归档而不是硬删除。

核心流程：

```ts
async function performBackgroundSync(apiKey: string) {
  try {
    // 1. 拉取全量模型数据
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        console.error('[ModelSync] OpenRouter API Key 无效或未授权');
        // 可选：更新全局状态，提示用户重新配置 Key
        store.flags.openrouterKeyInvalid = true;
        return;
      }
      throw new Error(`OpenRouter /models API Error ${response.status}`);
    }

    const json = await response.json();
    const remoteList = json.data;

    if (!Array.isArray(remoteList)) {
      throw new Error('OpenRouter /models 返回格式异常：data 非数组');
    }

    // 2. 单条防御性清洗与归一化
    const now = new Date().toISOString();
    const localMap = new Map(store.models.map(m => [m.id, m]));
    
    const cleanRemoteModels: AppModel[] = remoteList
      .map(raw => normalizeModel(raw, localMap.get(raw.id), now))
      .filter((m): m is AppModel => m !== null);

    // 3. Diff（只比较"活跃模型"）
    if (!shouldUpdate(store.models, cleanRemoteModels)) {
      console.log('[ModelSync] 模型列表无关键变化，跳过更新');
      return;
    }

    // 4. 软删除策略：标记僵尸模型
    const remoteIds = new Set(cleanRemoteModels.map(m => m.id));
    const archivedModels: AppModel[] = store.models
      .filter(m => !remoteIds.has(m.id))
      .map(m => ({ ...m, is_archived: true }));

    // 合并并排序：活跃在前，归档在后
    const finalModelList: AppModel[] = [
      ...cleanRemoteModels,
      ...archivedModels,
    ].sort((a, b) => {
      if (a.is_archived === b.is_archived) {
        return a.id.localeCompare(b.id);
      }
      return a.is_archived ? 1 : -1;
    });

    // 5. 持久化 + 原子更新
    await persistence.saveAppModels(finalModelList);
    store.models = finalModelList;
    console.log(
      `[ModelSync] 模型同步完成。活跃: ${cleanRemoteModels.length}, 归档: ${archivedModels.length}`,
    );
  } catch (error) {
    console.error('[ModelSync] 同步过程中断，保留本地缓存不变:', error);
    // 出错时不抛给 UI，不清空本地数据
  }
}
```

---

## 4. 关键辅助函数规范

### 4.1 normalizeModel(raw, existingModel?, now?): AppModel | null

职责：
把 OpenRouter 模型对象规整成 `AppModel`；单条失败仅丢弃，不影响其他条目。

```ts
function normalizeModel(
  raw: any, 
  existingModel?: AppModel, 
  now?: string
): AppModel | null {
  try {
    if (!raw || !raw.id) {
      console.warn('[ModelSync] 跳过缺少 id 的模型条目', raw);
      return null;
    }

    const params: string[] = raw.supported_parameters ?? [];
    const arch = raw.architecture ?? {};
    const inputMods: string[] = arch.input_modalities ?? [];
    const outputMods: string[] = arch.output_modalities ?? [];

    const multimodalTokenSet = new Set(['image', 'audio', 'video', 'file']);

    const hasReasoning = params.includes('reasoning');
    const hasTools = params.includes('tools');
    const hasJsonMode =
      params.includes('structured_outputs') ||
      params.includes('response_format');

    const isMultimodal =
      inputMods.some(m => multimodalTokenSet.has(m)) ||
      outputMods.some(m => multimodalTokenSet.has(m));

    const context_length =
      typeof raw.context_length === 'number' ? raw.context_length : -1;

    const pricing: ModelPricing = {
      prompt: raw.pricing?.prompt ?? '0',
      completion: raw.pricing?.completion ?? '0',
      request: raw.pricing?.request ?? '0',
      image: raw.pricing?.image ?? '0',
      web_search: raw.pricing?.web_search ?? '0',
      internal_reasoning: raw.pricing?.internal_reasoning ?? '0',
      input_cache_read: raw.pricing?.input_cache_read ?? '0',
      input_cache_write: raw.pricing?.input_cache_write ?? '0',
    };

    const capabilities: ModelCapabilities = {
      hasReasoning,
      hasTools,
      hasJsonMode,
      isMultimodal,
    };

    // 解析 vendor（从 id 前缀）
    const vendor = raw.id.includes('/') ? raw.id.split('/')[0] : 'unknown';

    // 时间戳处理
    const timestamp = now ?? new Date().toISOString();
    const first_seen_at = existingModel?.first_seen_at ?? timestamp;
    const last_seen_at = timestamp;

    const appModel: AppModel = {
      id: raw.id,
      name: raw.name || raw.canonical_slug || raw.id,
      context_length,
      capabilities,
      pricing,
      is_archived: false,
      first_seen_at,
      last_seen_at,
      router_source: 'openrouter',
      vendor,
    };

    return appModel;
  } catch (e) {
    console.warn(`[ModelSync] 规范化模型失败，跳过: ${raw?.id}`, e);
    return null;
  }
}
```

约束：

* 任何异常必须被捕获并转化为"跳过该条 + warn 日志"，禁止让异常冒泡终止整个同步流程；
* 不允许在这里静默引入硬编码能力（例如因某些 ID 含有特殊字符串而修改能力）。

### 4.2 shouldUpdate(local: AppModel[], remote: AppModel[]): boolean

职责：
判断是否需要用远程结果更新本地缓存。

规则：

1. 只比较"活跃模型"（`is_archived === false`）；
2. 使用排序后的指纹（fingerprint）比较关键字段：

   * `id`
   * `context_length`
   * `capabilities`
   * `pricing`

实现示例：

```ts
function shouldUpdate(local: AppModel[], remote: AppModel[]): boolean {
  const activeLocal = local.filter(m => !m.is_archived);

  // 长度不同，直接认为有变更
  if (activeLocal.length !== remote.length) return true;

  const fingerprint = (list: AppModel[]) => {
    const sorted = [...list].sort((a, b) => a.id.localeCompare(b.id));
    return JSON.stringify(
      sorted.map(m => ({
        id: m.id,
        ctx: m.context_length,
        cap: m.capabilities,
        price: m.pricing,
      })),
    );
  };

  return fingerprint(activeLocal) !== fingerprint(remote);
}
```

---

## 5. 归档与时间戳策略

### 5.1 主表软删除

模型归档采用"主表软删除 + 时间戳"的方式，不再设计单独的归档表。

### 5.2 时间戳字段

* `first_seen_at?: string`（ISO8601 字符串）：第一次在 `/models` 响应中出现的时间；
* `last_seen_at?: string`（ISO8601 字符串）：最后一次在 `/models` 响应中出现的时间。

### 5.3 同步逻辑约束

* 第一次看到某个 `id`：
  * `first_seen_at = now`，`last_seen_at = now`，`is_archived = false`；
* 后续同步中仍然看到该 `id`：
  * 仅更新 `last_seen_at = now`；
* 当前同步中本地有但远程缺失的 `id`：
  * 将该条 `AppModel` 标记为 `is_archived = true`；
  * `last_seen_at` 保留为"最后一次在远程列表中出现"的时间，不再更新。

### 5.4 UI/调用约定

* 默认模型选择列表仅展示 `!is_archived` 的模型；
* 历史对话若引用 `is_archived` 模型，不报错，允许只读或提示"该模型已下架（最后见于 last_seen_at）"。

---

## 6. 能力来源与 override 策略

### 6.1 能力真值来源

* **不再设计任何本地 override 机制**（包括 config/model_overrides.json 等）；
* 所有关于"模型是否支持某种参数/特性"的判断，一律以 OpenRouter `/api/v1/models` 返回的字段为唯一信息源：
  * `supported_parameters: string[]` 用于判断是否支持 `tools`、`tool_choice`、`reasoning`、`include_reasoning`、`structured_outputs`、`response_format` 等；
  * `architecture.input_modalities` / `architecture.output_modalities` 用于推断多模态能力（是否包含 `'image'`, `'audio'`, `'video'`, `'file'` 等）；
  * 其它能力一律不得通过字符串启发式（例如 `id.includes('deepseek-r1')`）推断。

### 6.2 功能 gating 约定

* UI 层所有功能开关（reasoning、工具调用、JSON/结构化输出、多模态开关等）必须严格基于 `AppModel.capabilities`，而 `capabilities` 又必须**只**由 `/models` 返回的字段推导，不得在本地"额外打开"；
* 当 `/models` 未声明某项能力时，前端不得展示对应开关，也不得在请求中发送相关参数。

### 6.3 改造约束

* 如果当前代码中已存在任何形式的能力覆写/heuristic（例如：
  * 对特定 ID 强制 `hasReasoning = true`；
  * 通过 ID 或名称关键字猜测多模态能力；
  * 手工插入 `structured_outputs` 或 `response_format` 支持标记等），
  则必须**全部移除或改写为基于 `/models` 字段的推导逻辑**；
* 不再引入新的 override 通道，后续如需能力修正，应通过：
  * 等待 OpenRouter 官方更新 `/models`；
  * 或在产品层显式声明"当前不支持该能力"，而不是靠本地补丁。

---

## 7. 实施顺序（Agent 执行顺序）

执行顺序建议如下（严格按步骤）：

1. 创建或更新 `/docs/openrouter-model-sync-spec.md`，写入本规范。
2. 全局搜索并列出所有 OpenRouter 模型同步与能力构建相关代码位置。
3. 校验并对齐 `AppModel` 数据结构（或同等核心模型描述结构）。
4. 校验并修正：
   * `bootstrapModels`；
   * `trySyncRemoteModels`；
   * `performBackgroundSync`；
   * `normalizeModel`；
   * `shouldUpdate`。
5. 修复所有与本规范冲突的逻辑（包括删除硬编码 Fallback、ID-based 能力猜测等）。
6. 更新或新增测试用例，确保覆盖关键路径。
7. 最终对照 `/docs/openrouter-model-sync-spec.md` 做一次完整自检，确认实现与规范保持一致。

---

## 附录：测试用例要求

至少新增以下测试用例（或等效形式）：

1. 正常返回多条模型数据时，`normalizeModel` 能正确构建 `AppModel`；
2. 某个条目缺少 `id` 时会被跳过且不会导致同步失败；
3. 当远程列表未变化时，`shouldUpdate` 返回 `false`；
4. 当某模型的 `pricing` 或 `capabilities` 变化时，`shouldUpdate` 返回 `true`；
5. 当远程删除某模型时，本地该模型被标记为 `is_archived: true` 而不是被删除；
6. `first_seen_at` 在首次同步时设置，后续同步不变；
7. `last_seen_at` 在每次同步时更新；
8. `vendor` 从 `id` 前缀正确解析。
