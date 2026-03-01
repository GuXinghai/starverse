# Model Catalog Internal Schema（阶段 1）

更新日期：2026-02-16  
适用范围：Starverse Catalog 内核（内部统一模型，不绑定 OpenRouter 原始字段形态）

## 1. 目标

本规范定义 Catalog 内部统一实体与 `ProviderAdapter` 边界，确保：
- UI 与业务逻辑依赖内部 schema，不直接耦合供应商原始 JSON；
- 阶段 1 能覆盖搜索与核心筛选；
- 后续可扩展第二供应商而不重写上层调用；
- 保留 raw 快照，避免未来补字段时必须重新抓全量历史数据。

落点文件：
- `src/shared/modelCatalog/internalSchema.ts`

## 2. 内部实体（阶段 1）

命名约定：
- 对外主命名为 `Provider`、`Model`、`CatalogMeta`、`ModelTag`。
- 在代码中对应别名：`Provider = CatalogProvider`、`Model = CatalogModel`、`ModelTag = CatalogModelTag`。

稳定标识（硬约束）：
- `providerKey`: 供应商稳定键。
- `modelId`: 供应商原生模型标识；OpenRouter 场景沿用 `author/slug` 形态（如 `openai/gpt-4`）。
- `modelKey`: 统一主键，固定为 `${providerKey}::${modelId}`（双冒号分隔）。
- `canonicalSlug`: 可选字段，语义上与 `modelId` 分离，不可互相替代。

## 2.1 `CatalogProvider`
- 核心字段：`providerKey`、`displayName`、`slug`、`privacyPolicyUrl`、`termsOfServiceUrl`、`statusPageUrl`、`updatedAtMs`
- 作用：统一承载供应商字典信息，供筛选、展示、路由说明复用。

## 2.2 `CatalogModel`
 - 身份字段：`modelKey`（`${providerKey}::${modelId}`）、`providerKey`、`modelId`、`canonicalSlug`
- 展示字段：`displayName`、`description`、`vendor`、`family`
- 可筛选字段：`status`、`visibility`、`contextLength`、`maxOutputTokens`、`inputModalities`、`outputModalities`、`supportedParameters`、`capabilities`
- 结构化补充字段：`tokenizer`、`instructType`（可空，阶段 2 主要用于展示与后续筛选预留）
- 计费字段：`pricing`（字符串价格，避免精度损失）
- 计费字段类型：`DecimalString`，禁止使用 `number` 保存价格。
- 生命周期字段：`firstSeenAtMs`、`lastSeenAtMs`、`syncedAtMs`、`createdAtSec`、`expirationDate`
- 标签字段：`tags: CatalogModelTag[]`
- 原始快照：`raw?: CatalogRawEnvelope`

## 2.3 `CatalogMeta`
- 目录状态字段：`schemaVersion`、`dataSource`、`snapshotId`、`modelCount`、`visibleModelCount`、`hiddenModelCount`
- 刷新状态字段：`lastSyncAtMs`、`ttlSeconds`、`syncState`、`lastErrorCode`、`lastErrorMessage`
- 轻量探测字段：`lastCountProbe`、`lastCountProbeAtMs`
- 原始保留策略：`rawRetentionPolicy`

## 2.4 `CatalogModelTag`
- 字段：`modelKey`、`key`、`label`、`type`、`confidence`、`source`、`updatedAtMs`
- 作用：解耦模型原始字段与 UI 标签体系，支持 provider/derived/manual 多来源并存。

## 2.5 Endpoints（占位类型，不落库）
- `CatalogModelEndpoint` 与 `CatalogModelEndpoints` 仅定义内存契约。
- 阶段 1 不要求持久化 endpoints；只为按需拉取与短 TTL 缓存预留统一结构。

## 3. ProviderAdapter 边界

接口：`ProviderAdapter`

- 必选能力：
  - `listModels(input)`：返回 `CatalogModel[]` 与请求元信息（主源、是否 fallback、请求时间窗）
- 可选能力：
  - `listProviders?(input)`：返回 `CatalogProvider[]`
  - `getModelEndpoints?(input)`：返回 `CatalogModelEndpoints | null`

输入统一包含：
- `apiKey`
- `baseUrl`
- `signal?: AbortSignal`

设计约束：
- Adapter 内完成供应商字段到内部字段的映射；
- 上层仅消费内部实体，不访问供应商响应体字段；
- 可选能力缺失时，上层必须允许降级（不阻断主模型目录）。

## 4. Raw 保留策略

类型：
- `CatalogRawBucket`：记录单次来源（`models`/`models_user`/`providers`/`endpoints`）、抓取时间、baseUrl、payload
- `CatalogRawEnvelope`：聚合实体相关 raw buckets + `schemaVersion`
- `RawRetentionPolicy`：控制是否保留 raw、单实体上限、脱敏路径、超限行为与持久化编码

目标：
- 新增字段时可优先从历史 raw 回填；
- 降低“字段扩展必须全量重拉”的风险；
- 为审计与调试提供可追溯快照。

执行口径（硬约束）：
- `maxRawBytesPerEntity` 按 UTF-8 字节计。
- 默认超限策略：`drop_raw`（丢弃 raw，保留主字段）。
- 若启用截断策略：`truncate_raw`，必须保证结果仍为合法 JSON。
- 落库编码：`persistEncoding = json_string`，`raw.payload` 持久化为 JSON 字符串，避免 SQLite 写入形态漂移。

## 5. 满足阶段 1 验收的能力映射

- 搜索：`displayName`、`modelId`、`description`、`tags`
- 核心筛选：`providerKey`、`status`、`visibility`、`capabilities`、`inputModalities`、`outputModalities`、`contextLength`、`pricing`
- 目录健康与刷新状态：`CatalogMeta` 的 `syncState`、`ttlSeconds`、`lastError*`、`lastCountProbe*`
- 多供应商扩展：`CatalogProviderKey` + `ProviderAdapter` 可选能力模型

## 6. 最小验证步骤（smoke）

1. 类型存在性检查  
   - 打开 `src/shared/modelCatalog/internalSchema.ts`，确认包含 `CatalogProvider`、`CatalogModel`、`CatalogMeta`、`CatalogModelTag`、`ProviderAdapter`。
2. 局部编译检查（阶段 1 基线）  
   - 运行 `npx tsc -p tsconfig.model-catalog.json --pretty false`。
3. 适配器可扩展检查（静态）  
   - 任意新增一个模拟 provider adapter，仅实现 `listModels`，不实现可选能力；类型系统应允许编译通过。

## 7. 边界条件与降级路径

- `listProviders` 未实现：不阻断目录主流程，仅缺少供应商字典增强信息。
- `getModelEndpoints` 未实现或失败：不阻断模型选择，只降级隐藏 endpoint 详情。
- raw 超限：按 `RawRetentionPolicy.maxRawBytesPerEntity` 截断或丢弃，主字段仍可写入。
- 供应商返回未知字段：保留于 `raw.payload`，不影响主 schema 稳定性。

## References
- Models list: https://openrouter.ai/docs/api/api-reference/models/get-models
- Models user: https://openrouter.ai/docs/api/api-reference/models/list-models-user
- Providers list: https://openrouter.ai/docs/api/api-reference/providers/list-providers
- Endpoints list: https://openrouter.ai/docs/api/api-reference/endpoints/list-endpoints
