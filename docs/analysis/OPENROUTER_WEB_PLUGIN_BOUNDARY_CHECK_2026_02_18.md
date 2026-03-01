# OpenRouter Web Search 边界核对（2026-02-18）

实验时间（UTC）：`2026-02-18T17:58:19Z` 到 `2026-02-18T17:58:58Z`  
实验脚本：`scripts/openrouter/openrouter_web_plugin_matrix.mjs`  
实验工件：`artifacts/openrouter/web-plugin-boundary/20260219_015819/summary.json`

## 结论清单（可落地）

1. Chat Completions 中 `plugins` 形态必须是数组，不接受对象。
证据：
- 文档（新）：`https://openrouter.ai/docs/features/plugins`（示例使用 `plugins: [{ id: "web" }]`）
- 文档（旧示例冲突）：`https://openrouter.ai/docs/model-variants`（示例曾写 `plugins: { id: "web" }`）
- 实验：`EQ_plugins_object_shape` 返回 `400 Invalid input: expected array, received object`（见 `artifacts/openrouter/web-plugin-boundary/20260219_015819/EQ_plugins_object_shape/response.txt`）

2. `:online` 与 `plugins:[{id:"web"}]` 在本次实测中语义等价；推荐统一走 `plugins`。
证据：
- 文档：`https://openrouter.ai/docs/features/web-search`（声明 `:online` 等价于开启 web 插件）
- 实验：`EQ_suffix_online` 与 `D_plugins_enabled_true` 都返回 `200` 且 `annotations=5`（见 `artifacts/openrouter/web-plugin-boundary/20260219_015819/summary.json`）

3. 流式场景下 `annotations` 出现在 `choices[].delta.annotations`，不是等到最终包才出现。
证据：
- 实验：`A_stream_web` 中 `firstDeltaAnnotationEvent=1`，`firstMessageAnnotationEvent=-1`（见 `artifacts/openrouter/web-plugin-boundary/20260219_015819/summary.json`）

4. 非流式场景下引用位于 `choices[0].message.annotations`，类型为 `url_citation`。
证据：
- 文档：`https://openrouter.ai/docs/features/web-search`（引用结构）
- 实验：`A_nonstream_web` `annotations.count=5` 且 `types=["url_citation"]`（见 `artifacts/openrouter/web-plugin-boundary/20260219_015819/summary.json`）

5. 本次实测中 `url_citation.start_index/end_index` 全为 `0`，不适合直接做精确文本高亮映射。
证据：
- 实验：`A_nonstream_web` 与 `A_stream_web` 均 `startIndexZeroCount=5`、`endIndexZeroCount=5`（见 `artifacts/openrouter/web-plugin-boundary/20260219_015819/summary.json`）
- 文档字段定义：`https://openrouter.ai/docs/features/web-search`

6. `engine` 行为：`auto` 与 `exa` 可用；`native` 在当前账号/区域不可用并返回硬错误。
证据：
- 文档：`https://openrouter.ai/docs/features/web-search`（`native` 仅对部分模型可用，`auto` 可回退）
- 实验：`B_engine_auto=200`、`B_engine_exa=200`、`B_engine_native=404 No endpoints found that support native web search`（见 `artifacts/openrouter/web-plugin-boundary/20260219_015819/summary.json`）
- 额外探测：`B_native_model_probe`（`x-ai/grok-3-mini-beta`）同样 `404`，说明当前账号/区域下 native 不可达。

7. `web_search_options.search_context_size` 在 Chat Completions + `exa` 路径下被接受，即使传入无效值 `ultra` 也未报错（表现为被忽略/不校验）。
证据：
- 文档：`https://openrouter.ai/docs/features/web-search`（该参数语义面向 native 搜索）
- 实验：`C_context_high_exa=200`，`C_context_invalid_exa=200`；`C_context_high_native=404`（见 `artifacts/openrouter/web-plugin-boundary/20260219_015819/summary.json`）

8. 请求级 `enabled:false` 在当前账号下可可靠关闭 web（包括 `:online` 后缀场景）。
证据：
- 文档：`https://openrouter.ai/docs/features/plugins`（插件级开关与覆写规则）
- 实验：`D_plugins_enabled_false annotations=0`；`EQ_suffix_online annotations=5` 但 `EQ_suffix_online_plus_disable annotations=0`（见 `artifacts/openrouter/web-plugin-boundary/20260219_015819/summary.json`）

9. “账户默认插件开启 + 请求级关闭”在当前账号无法做强结论（当前表现更像默认未开启）；这是独立硬边界。
证据：
- 实验：`D_baseline_no_plugins annotations=0`（见 `artifacts/openrouter/web-plugin-boundary/20260219_015819/summary.json`）
- 文档：`https://openrouter.ai/docs/features/plugins`（`Prevent overrides` 会阻止请求级覆写）

## 推荐实现路径（单一路径）

- 只用 `plugins` 数组启用 web，不依赖 `:online` 后缀。
- 三态映射：
  - `force_on` -> `plugins:[{id:"web", enabled:true}]`
  - `follow_default` -> 不传 `enabled`（由账户默认决定）
  - `force_off` -> `plugins:[{id:"web", enabled:false}]`
- 流式解析引用时只读 `choices[].delta.annotations`；不要等 `message.annotations`。
- 引用渲染不依赖 `start_index/end_index` 做精准高亮，先做“来源列表”样式。
- `engine` 默认用 `auto`，`native` 失败（404）时自动降级到 `exa` 并提示一次。

## 风险与降级策略（含 Prevent overrides）

1. 风险：账户开启 `Prevent overrides` 后，`force_off` 可能失效。  
降级：当用户选择禁用但仍收到引用（`annotations>0`）时，提示“账户策略强制启用 web，应用侧无法覆盖”。

2. 风险：native 在部分账号/区域不可用（404）。  
降级：自动重试 `engine=exa`，并在 UI 显示“native 不可用，已回退 exa”。

3. 风险：`search_context_size` 在 exa 路径可能被静默忽略。  
降级：仅在 native 可用时开放该参数编辑；否则 UI 灰置并提示“当前引擎不生效”。

## 复现实验

```bash
node scripts/openrouter/openrouter_web_plugin_matrix.mjs
```

可选参数：
- `--api-key <key>`
- `--base-model google/gemini-2.5-flash`
- `--native-model x-ai/grok-3-mini-beta`
- `--out-dir artifacts/openrouter/web-plugin-boundary/<custom>`

### 针对 D 的账号侧复跑步骤（必做）

1. 在 OpenRouter 账户后台把 web 设为默认开启（不启用 Prevent overrides），运行脚本并对比：
- `D_baseline_no_plugins`
- `D_plugins_enabled_false`

2. 再启用 `Prevent overrides`，重复运行并重点检查：
- 若 `D_plugins_enabled_false` 仍出现 `annotations>0`，即证明请求级禁用被账户策略覆盖（硬边界成立）。
