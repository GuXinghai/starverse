下面是一组可直接发给 Agent 的分阶段任务卡，目标是让 Starverse 完整接入 OpenRouter 的图片生成功能。范围只包含 text to image，不包含图像输入，图像输入等文件上传体系完成后再做。

全局硬性要求

1. 走 OpenRouter 的 chat completions：/api/v1/chat/completions，通过参数 modalities 声明输出包含 image 或同时包含 image 与 text。([OpenRouter][1])
2. 响应与流式增量都要能解析图片：非流式在 choices[0].message.images，流式在 choices[0].delta.images，图片内容以 image_url.url 的 data URL 形式返回。([OpenRouter][1])
3. image_config 至少支持 aspect_ratio 与 image_size，并保留高级透传入口，原因是各模型支持范围并不完全一致。([OpenRouter][1])
4. UI 位置约束：图片生成控制区必须放在推理控制与网络搜索附近，独立成排显示，避免挤在别的区域导致布局错位或重排。

任务卡 0：调研与契约冻结
推理努力程度：中
目标：冻结 Starverse 内部的图片生成最小协议与模型发现策略，保证后续实现不返工。
需要 Agent 调查的点：

* 哪些模型输出支持 image：通过 Models API 的 architecture.output_modalities 判断，并做一套可复核的过滤规则。([OpenRouter][2])
* 为何本地只看到少量模型时的自检流程：用 /api/v1/models/count 做基线核对，避免只拉到子集。([OpenRouter][3])
* 一个模型多端点与端点级元数据：通过 /api/v1/models/:author/:slug/endpoints 获取端点列表、pricing、provider 信息等，决定筛选与展示策略。([OpenRouter][4])
  交付物：
* Starverse 内部的图片生成契约说明文档：请求字段、响应字段、流式解析点、错误显示点。
* 选定至少两类参考模型用于验收：一类 text+image，一类 image-only，确保 modalities 两种模式都覆盖。([OpenRouter][1])
  验收标准：
* 给出明确的模型过滤与回退规则，能解释为何某模型可出图或不可出图。
* 给出明确的解析字段路径，非流式与流式都包含图片字段定义。([OpenRouter][1])

任务卡 1：OpenRouter 请求构建与图片解析
推理努力程度：高
目标：在现有 OpenRouter 客户端层打通 text to image 的请求与解析，覆盖非流式与流式。
需要 Agent 调查的点：

* modalities 的具体组合策略：支持 text+image 的模型用 image 与 text，纯出图模型用 image。([OpenRouter][1])
* image_config 的通用字段与枚举：aspect_ratio、image_size 的允许值与缺省行为。([OpenRouter][1])
* 流式 SSE 的健壮解析：要忽略 OpenRouter 可能发出的 SSE comment 行，避免 JSON 解析失败。([OpenRouter][5])
  交付物：
* 请求构建：为每次请求选择 modalities，并允许携带 image_config。([OpenRouter][1])
* 解析器升级：支持 message.images 与 delta.images 两条路径，抽象出统一的图片增量事件。([OpenRouter][1])
* 失败场景归一化：将 HTTP 级错误、SSE 中途错误映射为统一的 UI 可展示错误对象。([OpenRouter][5])
  验收标准：
* 非流式能拿到 images 数组并生成可渲染的图片结果。([OpenRouter][1])
* 流式在 delta.images 出现时能即时产出图片增量事件。([OpenRouter][1])
* SSE comment 行不会导致解析崩溃。([OpenRouter][5])

任务卡 2：本地 Asset 管线与持久化
推理努力程度：高
目标：把返回的 data URL 图片落盘与去重，DB 只存引用，避免把大块 base64 写进消息表。
需要 Agent 调查的点：

* 选择去重键：建议用内容 hash，附带 mime 与尺寸信息。
* 存储目录与生命周期：缓存目录与持久目录的边界，是否随会话删除，是否支持手动导出。
  交付物：
* DB schema 变更：新增 Asset 表与 Message-Asset 关联表，支持一条消息多张图。
* 落盘实现：将 image_url.url 的 data URL 解码写文件，记录 mime、hash、尺寸等元信息。([OpenRouter][1])
* 读取接口：给 UI 渲染层一个稳定的 asset:// 或 file path 映射接口。
  验收标准：
* 连续生成同一张图不会产生重复文件。
* 历史会话重载时图片仍可显示。
* DB 体积随生成次数增长可控，消息表不被 base64 污染。

任务卡 3：模型选择与图片生成 UI 控制区
推理努力程度：中
目标：让用户在 UI 上可发现并可控地发起出图请求，并严格满足位置约束。
硬性 UI 规范：

* 图片生成控制区显示在推理控制与网络搜索附近，独立成排。
* 这一排在 view 与 edit 等状态切换时高度稳定，避免引发布局重排导致控件位移。
  需要 Agent 调查的点：
* Starverse 现有推理控制与网络搜索控件的布局结构，确定插入点与响应式策略。
* 模型过滤规则：仅在 output_modalities 包含 image 时启用图片生成，避免用户选到不可出图模型。([OpenRouter][2])
  交付物：
* 控制区组件：启用开关、输出模式选项、image_config 的常用设置入口，外加高级参数透传入口。([OpenRouter][1])
* 模型选择器增强：增加图片能力标识，支持一键筛到可出图模型。([OpenRouter][1])
  验收标准：
* 用户无需理解 API 也能完成一次出图。
* 控制区位置正确，独立成排，状态切换不乱跳。
* 选到不可出图模型时，UI 有清晰禁用与解释。

任务卡 4：聊天渲染与交互闭环
推理努力程度：中
目标：图片结果在消息流里有一致的呈现、加载状态与可操作项。
需要 Agent 调查的点：

* 流式过程中的展示策略：delta.images 来时立即插入缩略图或占位卡片，结束后补齐元信息与操作按钮。([OpenRouter][1])
* 多图消息的排版：同一条 assistant message 的 images 数组可能包含多张。([OpenRouter][1])
  交付物：
* 消息渲染：支持图片网格或横向滚动列表，点击可放大预览。
* 基本操作：复制图片到剪贴板或复制文件路径，导出到本地目录，重新生成。
* 错误可见性：请求失败与流中失败都要落到消息气泡里展示。([OpenRouter][5])
  验收标准：
* 一次出图形成可追溯的消息记录，重启后仍可见。
* 流式时有明确进行中状态，结束后状态收敛。

任务卡 5：调试、成本可视化与回归测试
推理努力程度：中
目标：让图片生成在工程上可诊断、可度量、可回归。
需要 Agent 调查的点：

* debug 参数只在 stream 模式生效，如何在开发环境开关化，并在 UI 上避免误开到生产。([OpenRouter][6])
* usage 统计：OpenRouter 会在响应里返回 usage，流式时在最后一个 SSE chunk 返回，可用于成本展示与日志。([OpenRouter][7])
  交付物：
* 开发调试开关：可选开启 debug.echo_upstream_body 用于定位 provider 参数映射问题，仅限开发模式。([OpenRouter][6])
* 成本展示与日志：把 usage.cost 等关键字段记录到请求日志或消息元数据。([OpenRouter][7])
* 回归测试：解析器单测覆盖 message.images 与 delta.images；端到端测试覆盖至少两类参考模型。([OpenRouter][1])
  验收标准：
* 能快速定位出图失败属于参数、模型、端点、网络、解析哪一层。
* 成本信息可在开发时被采集并核对。

整体验收定义

1. 用户选中可出图模型，开启图片生成，在聊天里得到可持久化展示的图片结果。([OpenRouter][1])
2. 非流式与流式都可工作，流式过程中解析稳定，能忽略 SSE comment 行。([OpenRouter][1])
3. UI 控制区位置符合约束，独立成排，且不会引发布局错位。
4. image_config 至少支持 aspect_ratio 与 image_size，且具备高级透传入口。([OpenRouter][1])
5. 图片落盘去重，DB 不存大块 base64。([OpenRouter][1])

你把这组任务卡直接发给 Agent 即可。如果你希望我把这些任务卡改写成更贴合你仓库目录结构的版本，我也可以按你当前的组件与模块命名，补充每阶段触及的文件范围与接口边界。

[1]: https://openrouter.ai/docs/guides/overview/multimodal/image-generation "OpenRouter Image Generation | Complete Documentation | OpenRouter | Documentation"
[2]: https://openrouter.ai/docs/api/api-reference/models/get-models "List all models and their properties | OpenRouter | Documentation"
[3]: https://openrouter.ai/docs/api/api-reference/models/list-models-count "Get total count of available models | OpenRouter | Documentation"
[4]: https://openrouter.ai/docs/api/api-reference/endpoints/list-endpoints "List all endpoints for a model | OpenRouter | Documentation"
[5]: https://openrouter.ai/docs/api/reference/streaming "API Streaming | Real-time Model Responses in OpenRouter | OpenRouter | Documentation"
[6]: https://openrouter.ai/docs/api/reference/errors-and-debugging "API Error Handling and Debugging | OpenRouter Documentation | OpenRouter | Documentation"
[7]: https://openrouter.ai/docs/guides/guides/usage-accounting "Usage Accounting | Track AI Model Usage with OpenRouter | OpenRouter | Documentation"
