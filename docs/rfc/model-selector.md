# Model Selector RFC

## 文档信息
- 文档编号: RFC-MODEL-SELECTOR-001
- 状态: Draft
- 更新日期: 2026-02-17
- 当前实现基线: OpenRouter 单供应商
- 关联规范: `docs/spec/model-catalog-schema.md`、`docs/spec/model-selector-ui.md`

## Phase 2 Scope Freeze (Task 2.0)
### 1) 先决调查结论（代码事实）
#### 聊天发送链路中模型参数入口与优先级
- 当前发送链路模型来源为 UI 内存态 `model`（`ref`），默认值 `openrouter/auto`。
  - 定义: `src/ui-app/AppChatApp.vue:97`
  - UI 绑定: `src/ui-app/AppChatApp.vue:4061`（`v-model:model="model"`）
- 实际请求发送时，读取 `model.value.trim() || 'openrouter/auto'`，并写入 OpenRouter 请求体 `model`。
  - 普通发送: `src/ui-app/AppChatApp.vue:3036`
  - assistant turn streaming: `src/ui-app/AppChatApp.vue:2945`
  - 流式请求构造: `src/next/live/openRouterLiveStream.ts:382`、`src/next/openrouter/buildRequest.ts:70`
- 结论: 当前不存在会话级模型覆盖读取链路，优先级实际上只有:
  1. 当前 UI 选中模型 `model.value`
  2. 兜底 `openrouter/auto`

#### 会话 meta 存取方式与字段命名规范
- 会话 `meta` 通过 `convo.save` 全量写入，DB 层按 JSON 字符串持久化。
  - Client: `src/next/convo/convoClient.ts:60`
  - Repo: `infra/db/repo/convoRepo.ts:112`
- 现有做法是“读-改-写 merge”，尽量不覆盖无关 key。
  - `reasoningPrefs`: `src/ui-app/AppChatApp.vue:2131`、`src/ui-app/AppChatApp.vue:2162`
  - `renderUserMessageRichText`: `src/ui-app/AppChatApp.vue:2173`、`src/ui-app/AppChatApp.vue:2185`
- 字段命名现状为 camelCase（会话 meta 顶层 key）。
- 结论: 阶段 2 新增会话字段应沿用 camelCase，并采用 merge 写入策略。

### 2) 阶段 2 决策冻结
#### 范围内（In Scope）
- 仅实现会话级模型覆盖字段: `convo.meta.selectedModelKey`。
- 读取时机: 切换/加载会话后恢复该字段到 UI 当前模型。
- 写入时机: 用户在模型选择二级界面单击模型后立即写入会话 meta，并同步更新当前 `model`。
- 保持现有发送链路与参数逻辑不变（reasoning/providerRequireParameters 等保持现状）。

#### 范围外（Out of Scope）
- 不引入项目级/全局模型默认值新逻辑。
- 不改造 OpenRouter 请求参数体系（temperature/top_p 等）与现有 settings 来源。
- 不引入 endpoints 指标排序到发送决策。

### 3) 二级界面方案冻结（Modal vs Drawer）
#### 选择
- 阶段 2 采用 **Modal**（非 Drawer）。

#### 原因（聚焦焦点管理与键盘交互）
- Modal 更容易实现完整焦点陷阱（focus trap）、`Esc` 关闭、`Enter` 选中确认，不干扰主聊天输入区。
- 现有应用已存在 Modal 交互模式，可复用一致行为并降低实现风险。

#### 布局冻结
- Modal Header:
  - 搜索输入框（默认焦点）
  - 快速筛选 chips（reasoning/tools/vision/long_context/cheap）
- Modal Body:
  - 左侧模型列表（支持虚拟滚动/分页结果）
  - 右侧详情区（基础信息 + 标签；不强依赖 endpoints）
- Modal Footer:
  - 当前选中模型摘要
  - 关闭按钮

### 4) 交互与降级冻结
#### 单击选中
- 单击列表项即:
  1. 更新内存 `model`
  2. 写入 `convo.meta.selectedModelKey`
  3. 关闭 Modal
- 写入失败时:
  - 保持内存选中（不阻断当前会话继续发送）
  - 弹出非阻断提示并允许重试持久化

#### 失败降级
- 模型目录查询失败:
  - 回退使用已有 `reasoningModelIndex` 数据源
  - 保留发送能力（可继续使用当前模型值）
- 无法读取会话 meta 或字段非法:
  - 回退到现有逻辑 `model.value || 'openrouter/auto'`

#### 离线行为
- 有缓存: 可打开 Modal 并选择缓存模型；发送不依赖目录在线刷新。
- 无缓存: Modal 展示离线空态与重试入口，但不阻断聊天主流程。

### 5) 阶段 2 退出标准（Exit Criteria）
- [ ] 会话切换后可正确恢复 `convo.meta.selectedModelKey` 到 UI 模型状态
- [ ] 在 Modal 单击模型可完成“更新 UI + 写入会话 meta + 关闭弹窗”
- [ ] 持久化失败时可观测且不阻断发送
- [ ] 离线且有缓存时可正常选择模型
- [ ] 离线且无缓存时有明确空态与降级提示
- [ ] 不改变现有发送链路其他参数来源与优先级

### 6) 阶段 2 验收口径（可评审）
- 验收定义 1: “会话级覆盖”仅指 `convo.meta.selectedModelKey`，不扩展到项目级/全局级新策略。
- 验收定义 2: “可用闭环”指 选择 -> 持久化 -> 会话切换恢复 -> 发送生效 全链路可验证。
- 验收定义 3: “失败不阻断主流程”指目录、持久化任一失败都不应阻断消息发送。

## A. 背景与动机
### 现状
当前产品只接入 OpenRouter，模型切换能力依赖已有简单列表与局部收藏逻辑，缺少统一模型目录与可扩展选择器。已存在的问题集中在三点。
- 模型元数据来源分散，字段口径不统一
- 缺少稳定的本地缓存与高效检索，离线可用性弱
- 多供应商扩展路径不清晰，后续接入成本不可控

### 目标
本 RFC 的目标是建立统一模型选择体系，覆盖以下能力。
- 模型列表获取与本地存储
- 标签推导、筛选分类、搜索排序
- 收藏与最近使用机制
- 会话默认模型与会话元数据落盘
- 多供应商兼容的数据模型与适配层

### 约束
- 离线可用，网络不可用时仍可选择本地缓存模型
- 快速检索，常用筛选响应时间目标小于 100ms
- 常用模型两次点击内完成选中
- 后续供应商接入需控制在可预测改动面内，UI 层保持稳定

## B. 术语表
| 术语 | 定义 | 说明 |
| --- | --- | --- |
| provider | 模型供应商接入源 | 例如 openrouter、openai、anthropic、gemini |
| model | 可调用模型实体 | 由供应商定义并发布 |
| endpoint | 某模型在某基础设施上的可用端点 | 含延迟、吞吐、可用性等指标 |
| catalog | 统一模型目录 | 聚合后用于搜索、筛选、展示 |
| favorite | 收藏关系 | 用户显式标记，支持全局与项目级 |
| recent | 最近使用关系 | 基于实际发送消息的落盘记录 |
| routing preferences | 路由偏好参数 | 控制 provider selection 行为 |
| capabilities | 能力标签 | 由 modalities、supported_parameters 推导 |
| adapter | 供应商适配器 | 将外部字段映射为内部统一 schema |

## C. 范围与非范围
### 范围
- 模型目录同步
- 本地缓存与索引
- 标签推导与筛选分类
- 搜索与排序
- 收藏与最近使用
- 会话默认模型
- 模型详情与端点性能按需加载
- 高级路由设置入口

### 非范围
- 模型评测体系与质量打分体系
- 自动推荐模型策略
- 复杂 AB 实验框架
- 超出本 RFC 的智能调度策略

## D. 数据源与同步策略（当前实现: OpenRouter）
### Base URL 规则
- 默认 base URL: `https://openrouter.ai/api/v1`
- EU in-region routing 场景: `https://eu.openrouter.ai/api/v1`
- 当目录主源使用 `GET /api/v1/models/user` 且需要 EU 过滤语义时，必须使用 EU base URL 发起请求。

### 数据源与用途
| 数据源 | 接口 | 用途 | 频率建议 |
| --- | --- | --- | --- |
| models 列表 | `GET /api/v1/models` | 主目录同步、基础字段与能力字段 | 冷启动与定期刷新 |
| models user 列表 | `GET /api/v1/models/user` | 用户可见模型集合校验 | 登录态变化与手动刷新 |
| models count | `GET /api/v1/models/count` | 轻量探测目录变化 | 高频探测 |
| providers 清单 | `GET /api/v1/providers` | 路由 UI 候选、供应商元数据 | 低频刷新 |
| model endpoints | `GET /api/v1/models/{author}/{slug}/endpoints` | 模型详情页性能指标 | 按需加载 |
| provider selection | 请求体 `provider` 对象 | 高级路由设置映射 | 发送请求时 |
| privacy logging | 隐私与日志策略文档 | UI 提示与默认值依据 | 配置页展示 |
| errors and debugging | 错误与排障文档 | 错误分类、提示文案、日志结构 | 错误处理体系 |

### 冷启动同步流程
```yaml
startup:
  - step: load_local_catalog
    action: 读取 SQLite，构建内存索引
  - step: cache_health_check
    action: 校验 catalog_meta.ttl 与 schema_version
  - step: lightweight_probe
    action: 使用 models count 探测变化
  - step: full_sync_if_needed
    condition:
      - 本地为空
      - count 变更
      - TTL 过期
      - 用户手动刷新
    action: 先拉取 models user，再以 models 作为兜底并拉取 providers
  - step: finalize
    action: 更新 catalog_meta 与同步时间
```

### 定期刷新与 TTL
| 数据类型 | TTL 建议 | 触发策略 |
| --- | --- | --- |
| models | 6 小时 | 到期自动刷新，发送前懒刷新 |
| models user | 15 分钟 | 登录态变化或手动刷新 |
| models count | 5 分钟 | 轻量轮询，失败不阻塞主流程 |
| providers | 24 小时 | 配置页打开时懒刷新 |
| model endpoints | 10 分钟 | 详情页按需加载，短缓存 |

### count 轻量探测的条件与局限
- 适用条件: 需要快速判断是否可能变更，且当前缓存可用
- 局限一: 无法指示具体字段变化内容
- 局限二: count 不变时仍可能存在模型元数据更新
- 局限三: 网络抖动会导致误判，需与 TTL 联合判断

### endpoints 按需拉取与短 TTL 缓存
- 首次进入模型详情页才请求 endpoints
- 缓存键使用 `model_key`
- 10 分钟内复用缓存，超过 TTL 才重拉
- 拉取失败时回退为静态模型信息，不阻塞模型选择

## E. 统一内部数据模型（多供应商预留）
### 内部主键规则
```yaml
provider_key: 小写稳定标识，例如 openrouter
model_id: 供应商原生模型 id，例如 openai/gpt-5
model_key: ${provider_key}:${model_id}
```

### 标准字段集合
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| model_key | text | 内部主键 |
| provider_key | text | 供应商键 |
| model_id | text | 外部模型 id |
| display_name | text | 展示名 |
| description | text nullable | 简介 |
| context_window | integer nullable | 上下文长度 |
| max_output_tokens | integer nullable | 最大输出 |
| modalities | json array | 输入输出模态集合 |
| supported_parameters | json array | 供应商声明参数能力 |
| capabilities | json object | 推导后的硬能力标签 |
| pricing | json object | 统一计费字段 |
| status | text | active 或 deprecated 或 archived |
| release_stage | text nullable | stable 或 preview |
| raw_json | json object | 原始对象快照 |
| synced_at | datetime | 最近同步时间 |

### raw_json 保留策略
- 仅保留与当前模型版本对应的最后一次原始对象
- 允许调试读取，不作为 UI 主渲染源
- 大对象字段可裁剪，保留主干字段与差异定位所需字段

### 供应商适配层
```yaml
ProviderAdapter:
  key: string
  listCatalog(): ProviderModel[]
  listProviders(): ProviderInfo[]
  getModelEndpoints(model_id): EndpointInfo[]
  normalize(model): UnifiedModel
  normalizeError(error): UnifiedError
```

### CatalogService 职责边界
- 负责编排同步流程与缓存策略
- 负责调用 ProviderAdapter 并写入统一 schema
- 负责标签推导、索引重建、增量更新
- 不承担 UI 状态管理

### UI 依赖约束
- UI 只读取统一 schema
- UI 不直接依赖供应商原始字段
- 新供应商接入时，UI 仅新增文案与图标映射

## F. 本地存储与索引（SQLite）
详细字段与约束见 `docs/spec/model-catalog-schema.md`。

### 表设计草案
```yaml
tables:
  providers:
    pk: provider_key
    cols: [display_name, status, raw_json, updated_at]
  models:
    pk: model_key
    cols: [provider_key, model_id, display_name, capabilities_json, pricing_json, status, synced_at]
  model_endpoints:
    pk: endpoint_key
    cols: [model_key, provider_name, region, latency_ms_p50, throughput_tps, uptime_ratio, observed_at]
  favorites:
    pk: favorite_id
    cols: [scope_type, scope_id, model_key, pinned_rank, created_at]
  recents:
    pk: recent_id
    cols: [scope_type, scope_id, model_key, last_used_at, hit_count]
  model_tags:
    pk: model_key + tag
    cols: [tag, tag_type, confidence]
  catalog_meta:
    pk: provider_key
    cols: [schema_version, last_full_sync_at, last_probe_at, last_count, ttl_seconds, sync_state]
```

### 索引策略
- FTS5: `models_fts(display_name, model_id, tag_text, vendor_text)`
- 常用筛选索引: `capabilities.reasoning`、`capabilities.vision`、`status`、`provider_key`
- 排序索引: `favorites.pinned_rank`、`recents.last_used_at`

### 迁移策略
- 使用显式 `schema_version`
- 每次迁移包含前向脚本与回滚脚本
- 向后兼容策略: 新字段可空，旧字段保留一个过渡版本

## G. 标签推导与筛选分类
### 硬能力标签推导规则
```yaml
derive_capabilities:
  vision:
    when: modalities 包含 image 输入或输出
  tools:
    when: supported_parameters 包含 tools 或 tool_choice
  structured_outputs:
    when: supported_parameters 包含 structured_outputs 或 response_format
  reasoning:
    when: supported_parameters 包含 reasoning
  long_context:
    when: context_window >= 128000
```

### 软分类与 UI 分组
| 分组 | 规则 |
| --- | --- |
| 通用 | 无特定偏向，活跃且成本中位 |
| 编程与 Agent | tools 或 structured_outputs 或 reasoning 命中 |
| 视觉与多模态 | vision 命中 |
| 长上下文 | long_context 命中 |
| 省钱 | 价格阈值低于全局中位数 |
| 快速 | latency 或 throughput 指标领先 |

### 排序策略
- 默认排序: 收藏置顶 -> 最近使用 -> 供应商优先级 -> display_name
- 高级排序: 当 endpoints 可用时支持 `latency`、`throughput`、`uptime`
- 指标缺失时回退默认排序，避免空值导致排序异常

## H. 收藏、展示与默认模型
详细交互规范见 `docs/spec/model-selector-ui.md`。

### 收藏形态
- 全局收藏: 跨项目生效
- 项目级收藏: 当前项目内优先
- 会话级默认模型: 写入会话 meta
- 置顶与排序: 支持手动 rank，rank 冲突时按更新时间决议

### 最近使用
- 全局最近: 最近发送成功的模型序列
- 会话最近: 当前会话内高频模型序列

### 选择器 UI 行为规范
- 打开选择器时焦点落在搜索框
- 默认展示收藏与最近组合区
- 支持键盘导航与 Enter 确认
- 常用模型从打开到选中最多两次点击
- 选择后立即写入会话 meta，并触发顶部模型条更新

### 空状态与错误状态
- 空状态: 无缓存且无网络时展示离线提示与重试入口
- 错误状态: 同步失败时保留缓存并显示可重试按钮

## I. 高级路由设置与隐私选项（对齐 OpenRouter）
### provider selection 对象的 UI 映射
| 字段 | UI 控件 | 默认值 |
| --- | --- | --- |
| require_parameters | 开关 | false |
| data_collection | 单选 | allow |
| zdr | 开关 | false |
| sort | 下拉 | price |
| preferred_max_latency | 数值输入 | 空 |
| preferred_min_throughput | 数值输入 | 空 |
| quantizations | 多选 | 空 |

### 扩展字段
- `order`、`only`、`ignore`、`allow_fallbacks` 进入高级展开区
- 默认隐藏，开启高级路由后可见

### 启用策略
- 高级路由默认关闭
- 用户明确开启后在当前会话保留
- 关闭后仍保留历史值，发送时不注入 provider 对象

### 安全与隐私
- 在设置页展示数据采集与日志保留说明
- 发送前展示当前隐私模式摘要
- 对 `data_collection` 与 `zdr` 变更记录审计日志

## J. 错误处理与可观测性
### 典型错误分类
| 类别 | 识别信号 | UI 策略 |
| --- | --- | --- |
| 网络错误 | 超时、DNS、连接中断 | 展示重试，保留缓存 |
| 认证错误 | 401 或 key 无效 | 引导更新 API key |
| 流式错误 | SSE 中断或错误事件 | 停止流并提示重试 |
| endpoints 拉取失败 | 详情接口失败 | 降级显示基础信息 |

### UI 呈现与降级
- 每类错误提供重试入口
- 目录同步失败时继续允许本地模型选择
- endpoints 失败不影响模型发送

### 日志字段建议
```yaml
log_fields:
  - request_id
  - provider_key
  - model_key
  - endpoint
  - http_status
  - error_code
  - retry_count
  - network_state
  - cache_state
  - occurred_at
```

## K. 里程碑与验收标准
### 里程碑 A
目标: 目录同步 + 搜索筛选 + 收藏最近 + 会话默认

验收清单
- [ ] 冷启动可从 SQLite 加载缓存并离线可选模型
- [ ] `models` 同步成功后可检索与筛选
- [ ] 收藏与最近可跨重启保留
- [ ] 选择模型后会话 meta 立即更新
- [ ] 常用模型两次点击内可完成选中

### 里程碑 B
目标: 模型详情 + endpoints 按需 + 高级排序

验收清单
- [ ] 详情页按需加载 endpoints
- [ ] endpoints 使用短 TTL 缓存
- [ ] `latency`、`throughput`、`uptime` 排序可切换
- [ ] endpoints 请求失败时可降级且不影响发送

### 里程碑 C
目标: 多供应商 adapter 验证，最少接入一个候选适配

验收清单
- [ ] 完成 `ProviderAdapter` 最小接口实现
- [ ] 通过 OpenAI 或 Claude 或 Gemini 任一模型列表最小接入演示
- [ ] UI 层无需改动核心选择器结构
- [ ] 同步、搜索、收藏、默认模型流程在第二供应商下可走通

## L. 风险与开放问题
### 已识别风险
| 风险 | 影响 | 缓解方案 |
| --- | --- | --- |
| 字段不一致 | 推导能力偏差 | 适配层归一化与字段校验 |
| 价格变化频繁 | 省钱排序失真 | 缩短 pricing TTL，显示更新时间 |
| 端点波动 | 排序抖动 | 使用滑动窗口与最小样本数 |
| 模型下线 | 历史会话引用失效 | archived 状态保留与降级提示 |
| 供应商差异 | 通用 UI 映射困难 | 统一 schema 与高级设置分层 |

### 需要决策的点与推荐默认值
| 决策点 | 推荐默认值 | 理由 |
| --- | --- | --- |
| models 刷新 TTL | 6 小时 | 兼顾新鲜度与请求成本 |
| count 探测周期 | 5 分钟 | 可快速感知大规模变化 |
| endpoints TTL | 10 分钟 | 指标波动高，适合短缓存 |
| long_context 阈值 | 128k | 对长文任务有实用区分度 |
| 高级路由入口 | 默认关闭 | 控制认知负担与误配置风险 |
| data_collection 默认 | allow | 与 OpenRouter 常规路由一致，后续可由策略开关覆盖 |
| zdr 默认 | false | 避免误导，按用户显式意图开启 |

## M. References
- OpenRouter Models API: https://openrouter.ai/docs/api/api-reference/models/get-models
- OpenRouter Models for User API: https://openrouter.ai/docs/api/api-reference/models/list-models-user
- OpenRouter Models Count API: https://openrouter.ai/docs/api/api-reference/models/list-models-count
- OpenRouter Providers API: https://openrouter.ai/docs/api/api-reference/providers/list-providers
- OpenRouter Endpoints List API: https://openrouter.ai/docs/api/api-reference/endpoints/list-endpoints
- OpenRouter API Overview: https://openrouter.ai/docs/api/reference/overview
- OpenRouter Authentication: https://openrouter.ai/docs/api/reference/authentication
- OpenRouter App Attribution: https://openrouter.ai/docs/app-attribution
- OpenRouter Provider Selection: https://openrouter.ai/docs/guides/routing/provider-selection
- OpenRouter Privacy and Logging: https://openrouter.ai/docs/guides/privacy/logging
- OpenRouter Errors and Debugging: https://openrouter.ai/docs/api/reference/errors-and-debugging
- OpenAI Models API: https://platform.openai.com/docs/api-reference/models
- Claude List Models API: https://docs.anthropic.com/en/api/models-list
- Gemini Models Endpoint: https://ai.google.dev/api/models
