# Observability（字段与日志点建议）

**SSOT（唯一真相源）**：`docs/open_router_流式回复与推理_ssot（v_2_）.md`

> 目标：让“流式会话”在出现 mid-stream error、abort、usage 缺失、reasoning_details 异常时可追踪、可复现、可定位。

---

## 需要记录的最小字段（建议在 RunVM 与日志中同时具备）
- `requestId`（客户端侧生成，用于关联 UI/IPC/网络层）
- `generationId`（OpenRouter 响应 `id`）
- `model`
- `provider`（若返回）
- `finishReason` / `nativeFinishReason`
- `usage`（可空；流末尾填充）
- `error`（可空；mid-stream error/解析异常/网络异常）

## 关键日志点（按层）

### Transport（HTTP + AbortSignal）
- `request_start`：含 `requestId`、`model`、`stream`、`usage.include`、reasoning 配置摘要（避免泄露敏感内容）
- `response_headers`：HTTP status、SSE/content-type、首字节耗时（TTFB）
- `request_abort`：abort 来源（用户/超时/切换会话）
- `request_end`：总耗时、是否 done、是否 error、是否 aborted

### Decoder/Parser（SSE line → Domain Events）
- `sse_comment`：仅计数或采样（避免日志噪声）
- `json_parse_error`：包含行内容长度、截断后的片段、requestId
- `mid_stream_error`：errorObj 摘要（code/message/type 等）
- `done_received`：记录是否收到 `[DONE]`
- `usage_received`：记录 usage 是否出现与关键字段是否缺失

### Reducer/Store（事件聚合）
- `event_apply`：按事件类型计数（text/tool/reasoning_details/usage/error/done）
- `reasoning_details_append`：记录 append 数量与去重命中（如实现了去重）
- `run_state_transition`：idle→requesting→streaming→done/error/aborted

### UI（只读渲染）
- `render_state`：当前 run.status、是否 target message、是否显示 reasoning 面板
- `retry_action`：mid-stream error 后的“重试（fork/继续）”入口点击
