# TC-03（OpenRouter Request Builder）10 分钟内高置信验收

## 离线（可复核）验收

- 纯函数 request builder：`src/next/openrouter/buildRequest.ts`
- 验收测试（含 snapshot 矩阵 + keys allowlist + 多模态样例）：`src/next/openrouter/buildRequest.test.ts`

运行：

- `npm test -- --run src/next/openrouter/buildRequest.test.ts`

## 线上（一次干跑）终检：debug.echo_upstream_body

前置：准备 OpenRouter API Key（仅用于本地调试，不要提交）。

运行：

- PowerShell：
  - `$env:OPENROUTER_API_KEY="..." ; node scripts/openrouter/debug-echo-dryrun.mjs`
- 可选：
  - `$env:OPENROUTER_MODEL="openrouter/auto"`
  - `$env:OPENROUTER_BASE_URL="https://openrouter.ai/api/v1"`

预期：

- 该脚本发起 `stream: true` 的 `/chat/completions` 请求，并在首个 SSE JSON chunk 打印：
  - `first_chunk_json`
  - `debug.echo_upstream_body`（若 OpenRouter 返回）

注意：

- `debug.echo_upstream_body` 可能包含请求内容，不建议在生产环境启用。

