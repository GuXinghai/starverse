# Phase 2.7-A Investigation (Summary)
- 关键路径：`OpenRouter -> (electron transport?) -> wire events -> renderer SSE/parser -> DomainEvents -> AppChatApp session -> reducer -> DB`。
- 三大分裂点：`openRouterLiveStream` 双主循环复制；terminal 语义分散在 decoder/mapper/live/session/reducer 多层；wire 顺序与结束语义依赖隐式约定。
- 13 个风险标题：IPC/fetch 主循环漂移；缺失 `[DONE]` 静默结束；bridge end 重复/竞态；`openrouter:error` 僵尸通道；header meta 注入时机差异；未处理 SSE `event:`；多 `data:` 拼接回归缺口；`terminal_error` 分支脆弱；responses truncated 语义可能丢失；`finish_reason` unknown 收敛失真；wire decode 粒度不一致；IPC 双重编解码等价性风险；session catch 可能重复终态。
- 2.7 后续约束：后续所有 Phase 2.7 计划与实施以本文为单一事实源（SSOT）。

# Phase 2.7-A 调查报告
本次仅做代码调查，未改动生产代码。

## A. 全路径枚举

### A.1 IPC wire 路径（入口到 DomainEvent/terminal 消费）
1. 入口与分流在 `src/next/live/openRouterLiveStream.ts:712` `streamOpenRouterChatAsEvents`。  
`netExp.streamInMainProcess===true` 时走 `src/next/live/openRouterLiveStream.ts:157` `streamOpenRouterChatAsEventsViaIpc`。

2. IPC 启动与收包在 `src/next/live/openRouterLiveStream.ts:241`~`src/next/live/openRouterLiveStream.ts:334`。  
核心点：监听 `openrouter:chunk:${requestId}`，调用 `ipc.invoke('openrouter:stream-chat', payload)`。

3. wire 事件消费与 SSE 解析在 `src/next/live/openRouterLiveStream.ts:386` `wireByteStream` + `src/next/openrouter/sse/decoder.ts:50` `decodeOpenRouterSSE`。  
`chunk` 被转回字节流；`responseMeta/error/end` 进入 pending 状态。

4. JSON chunk -> DomainEvent 在 `src/next/live/openRouterLiveStream.ts:506` `mapResponsesEventToTerminal` 与 `src/next/live/openRouterLiveStream.ts:530` `mapChunkToEvents`。

5. terminal/timing/error 发射在 `src/next/live/openRouterLiveStream.ts:451`~`src/next/live/openRouterLiveStream.ts:663`。  
产出 `TimingSnapshot` / `StreamDone` / `StreamAbort` / `StreamError`。

6. renderer 会话消费在 `src/ui-app/AppChatApp.vue:2585` `runAssistantStreamSession`。  
`for await` 消费点在 `src/ui-app/AppChatApp.vue:2606`，状态提交在 `src/ui-app/AppChatApp.vue:543` `commitImmediate`，持久化在 `src/ui-app/AppChatApp.vue:1421` `flushPending`、`src/ui-app/AppChatApp.vue:1458` `flushReasoningDetailSegments`、`src/ui-app/AppChatApp.vue:2672` `setMessageStatus`、`src/ui-app/AppChatApp.vue:762` `persistMessageErrorEnvelope`。  
reducer 终态收敛在 `src/next/state/reducerCore.ts:455` `applyEventCore`（`StreamError/StreamAbort/StreamDone/TimingSnapshot` 分支）。

---

### A.2 renderer 直连路径（fetch/streaming）
1. 直连入口仍是 `src/next/live/openRouterLiveStream.ts:712` `streamOpenRouterChatAsEvents`，当 `streamInMainProcess===false`。  
transport 调用在 `src/next/live/openRouterLiveStream.ts:763` `openrouterFetch`。

2. transport 在 `src/next/transport/openrouterFetch.ts:218` `openrouterFetch`。  
仅处理 HTTP/abort/timeout/network，返回 `Response`，不做 SSE 解析。

3. 解析与映射链路与 IPC 分支同构：  
`src/next/live/openRouterLiveStream.ts:890` `decodeOpenRouterSSE` -> `src/next/live/openRouterLiveStream.ts:977` `mapResponsesEventToTerminal` -> `src/next/live/openRouterLiveStream.ts:1001` `mapChunkToEvents` -> terminal 事件。

4. 其它“直连解析”路径（非生产主路径）：
- `src/next/openrouter/replayFixtureStream.ts:29` `replayOpenRouterSSEFixtureAsEvents`（fixture replay，测试/演示）。
- `scripts/gates/tc14-ui-live-smoke.mjs:76`（脚本内自定义 SSE 解析）。
- `scripts/openrouter/debug-echo-dryrun.mjs:73`（脚本内自定义 SSE 解析）。

---

### A.3 electron 侧（openRouterStreamBridge 是否纯 transport）
1. 注册与入口：`electron/ipc/openRouterStreamBridge.ts:416` `registerOpenRouterStreamBridge`。  
处理 `openrouter:stream-chat` 与 `openrouter:abort`。

2. 请求校验：`electron/ipc/openRouterStreamBridge.ts:28` `validateOpenRouterStreamRequest`（wireVersion + 基本形状）。

3. 传输转发核心：`electron/ipc/openRouterStreamBridge.ts:195` `forwardOpenRouterResponseAsWireEvents`。  
顺序规则（函数内）：
- 始终先 `responseMeta` (`type:'responseMeta'`)。
- 非 2xx：`responseMeta -> error(http_error) -> end`。
- 正常流：`responseMeta -> chunk* -> end`。
- 读流异常：`responseMeta -> chunk* -> error(transport_error) -> end`。
- abort：`error(aborted) -> end`。

4. `startStream` 在 `electron/ipc/openRouterStreamBridge.ts:284`，完成后再调用 `sendWireEnd` (`electron/ipc/openRouterStreamBridge.ts:168`)；它会再发一次 `{type:'end'}` 和 `openrouter:end:${requestId}` 信号。

结论：bridge 不做 SSE line/JSON 语义解释，职责确实是 transport + wire 封装；语义解释在 renderer。

---

### A.4 关键词命中（代码层主要命中点）
- `finish_reason`：`src/next/openrouter/mapChunkToEvents.ts:45`、`src/next/errors/normalizeOpenRouterError.ts:286`、`src/next/state/types.ts:146`、`src/next/live/openRouterLiveStream.test.ts:220`。
- `content_filter` / `length`：`src/next/openrouter/mapChunkToEvents.ts:49`~`51`；覆盖用例在 `src/next/live/openRouterLiveStream.test.ts:220`、`src/next/live/openRouterLiveStream.test.ts:255`。
- `StreamError` / `TimingSnapshot`：`src/next/live/openRouterLiveStream.ts:451`~`1044`、`src/ui-app/AppChatApp.vue:2585`、`src/next/state/reducerCore.ts:489`/`692`、`src/next/state/reducer.timing.test.ts:7`。
- `SSE` / `data:` / `TextDecoder` / `ReadableStream`：`src/next/openrouter/sse/decoder.ts:18`~`134`、`electron/ipc/openRouterStreamBridge.ts:230`、fixtures 在 `src/next/openrouter/sse/fixtures/*.txt`。
- `event:`：生产解析器未处理 SSE `event:` 字段（`src/next/openrouter/sse/decoder.ts` 仅识别 `:` comment 与 `data:`）。
- `openrouterFetch`：`src/next/transport/openrouterFetch.ts:218`、调用点 `src/next/live/openRouterLiveStream.ts:763`。
- `openRouterLiveStream`：核心编排 `src/next/live/openRouterLiveStream.ts:712`，UI 调用点 `src/ui-app/AppChatApp.vue:2860`、`src/ui-app/AppChatApp.vue:2961`。

---

## B. 架构与数据形状

### B.1 数据流（文字图）
`OpenRouter(chat/completions SSE)`  
-> `electron/ipc/openRouterStreamBridge.ts:startStream/forwardOpenRouterResponseAsWireEvents`（仅 IPC 模式）  
-> `OpenRouterStreamWireEvent` (`src/shared/ipc/openRouterStreamWire.ts`)  
-> `src/next/live/openRouterLiveStream.ts`（IPC 或 fetch 分支）  
-> `decodeOpenRouterSSE` (`src/next/openrouter/sse/decoder.ts`)  
-> `mapResponsesEventToTerminal` + `mapChunkToEvents`  
-> `DomainEvent` (`src/next/state/types.ts`)  
-> `AppChatApp.vue:runAssistantStreamSession`  
-> `applyEventsBatch/applyEventCore` (`src/next/state/reducerCore.ts`)  
-> DB 持久化（`message.appendDelta` / `message.appendReasoningDetailSegments` / `message.setStatus` / `messageError.upsert`）。

### B.2 每一跳的数据形状
1. wire event union：`src/shared/ipc/openRouterStreamWire.ts:44`  
`chunk{data}` / `responseMeta{status,requestId?,provider?,headers?}` / `error{kind,message,...}` / `end{}`。

2. SSE 解码事件：`src/next/openrouter/sse/decoder.ts:1`  
`comment` / `done` / `json{value,raw}` / `terminal_error{error,...}` / `protocol_error{message,raw?}`。

3. DomainEvent（关键）：`src/next/state/types.ts:115`  
`MessageDeltaText`、`MessageDeltaReasoningDetail`、`UsageDelta`、`MetaDelta{id/model/provider/finish_reason/native_finish_reason}`、`TimingSnapshot{tRequestStart,tAck,tEnd,endReason}`、terminal(`StreamDone|StreamAbort|StreamError`)。

4. terminal/error 对象：  
`ErrorEnvelope` 在 `src/next/errors/openRouterErrorEnvelope.ts:6`，关键字段：`completionClass`、`phase`、`openrouter.code/message`、`stream.finish_reason/native_finish_reason/chunk_no`、`kind`。  
`AppError` 在 `src/next/errors/appError.ts:1`，经 `normalizeOpenRouterError.ts` 归一化后进入 envelope。

5. 最终状态对象（run/message）：  
`src/next/state/types.ts:91` `RunVM`（`finishReason/nativeFinishReason/usage/error/tAck`），  
`src/next/state/types.ts:185` `RunState`（`endReason/timingFinalized/localProcessingDurationMs`），  
并持久化为 `message.setStatus(reasoningEndReason, reasoningDurationMs)`，见 `src/next/message/messageClient.ts:116`。

---

## C. 语义漂移风险清单（13 条）

1. 风险：IPC 与 fetch 主循环几乎整段复制，未来很容易单侧改动导致漂移。  
位置：`src/next/live/openRouterLiveStream.ts:424`~`663` 与 `src/next/live/openRouterLiveStream.ts:890`~`1051`。  
覆盖：`src/next/live/openRouterLiveStream.test.ts` 有双路径样例，但无系统化“同输入双路径全量 parity”用例，缺口。

2. 风险：流在 EOF 结束但未见 `[DONE]` 且未报错时，不产出 terminal 事件（静默收尾）。  
位置：`src/next/openrouter/sse/decoder.ts:129`~`133` + `src/next/live/openRouterLiveStream.ts:1051`（循环结束直接退出）。  
覆盖：未见针对“缺失 DONE”测试，缺口。

3. 风险：bridge 可能发送重复 `end`，且 `openrouter:end` 与 `openrouter:chunk` 双通道存在顺序竞争。  
位置：`electron/ipc/openRouterStreamBridge.ts:255`、`electron/ipc/openRouterStreamBridge.ts:168`、`electron/ipc/openRouterStreamBridge.ts:376`。  
覆盖：`electron/ipc/openRouterStreamBridge.test.ts` 只测 `forwardOpenRouterResponseAsWireEvents`，未测 `startStream` 端到端顺序，缺口。

4. 风险：renderer 监听 `openrouter:error:${requestId}`，但主进程未发该频道，错误通道语义可能“僵尸分支”。  
位置：监听在 `src/next/live/openRouterLiveStream.ts:243`；未找到发送方。  
覆盖：无覆盖，缺口。

5. 风险：header meta 注入时机/行为两路径不完全等价（IPC 在 decode 阶段注入；fetch 在 transport 成功后即注入；HTTP error 场景行为不同）。  
位置：IPC `src/next/live/openRouterLiveStream.ts:410`、`580`；fetch `src/next/live/openRouterLiveStream.ts:856`。  
覆盖：fetch 正常 header-id 有覆盖（`openRouterLiveStream.test.ts` smoke），IPC header-meta parity 无覆盖，缺口。

6. 风险：SSE `event:` 字段未被解析器识别，若上游未来使用 event-type 分流，可能漏语义。  
位置：`src/next/openrouter/sse/decoder.ts:117`~`124`（仅 comment/data）。  
覆盖：无 `event:` 相关测试，缺口。

7. 风险：`data:` 多行拼接语义虽实现（`\n` join），但缺少显式回归，容易被后续重构破坏。  
位置：`src/next/openrouter/sse/decoder.ts:63`~`66`、`122`~`124`。  
覆盖：`decoder.test.ts` 无多 data-line 用例，缺口。

8. 风险：`terminal_error` 分支在 live stream 中与 `mapChunkToEvents(StreamError)` 关系脆弱，分支可达性与顺序依赖强。  
位置：`src/next/live/openRouterLiveStream.ts:489`、`957`。  
覆盖：mid-stream error 用例主要走 mapper 路径（`openRouterLiveStream.test.ts:177`），未单测 terminal_error 分支，缺口。

9. 风险：Responses 终态映射把 `truncated` 路径当 `normal_complete`（非 error），UI/持久化若需区别截断可能丢信息。  
位置：`src/next/openrouter/responsesEventMapper.ts:112`~`179`；`src/next/live/openRouterLiveStream.ts:987`。  
覆盖：`responsesEventMapper.test.ts` 覆盖映射本身；未见 live-session 级截断终态集成测试，缺口。

10. 风险：`finish_reason` 归一化集合固定，未知值统一成 `unknown`，下游若仅看 normalized 可能失真。  
位置：`src/next/openrouter/mapChunkToEvents.ts:45`~`57`。  
覆盖：仅 `length/content_filter` 覆盖（`openRouterLiveStream.test.ts:220`、`255`），`unknown` 缺口。

11. 风险：wire 解码用 type guard，不是 zod 结构化 decode；错误定位粒度与一致性弱于 IPC contract decode 层。  
位置：`src/shared/ipc/openRouterStreamWire.ts:64`、`76`；对照 `src/next/ipc/contracts/decodeError.ts:5`。  
覆盖：wireVersion 拒绝/协议错误有覆盖（`openRouterStreamBridge.test.ts:128`、`openRouterLiveStream.test.ts:387`）；字段级畸形事件矩阵缺口。

12. 风险：IPC 路径存在“字节->字符串->字节->字符串”双重 UTF-8 转换，极端编码/损坏字节场景与 fetch 直连可能不等价。  
位置：主进程 `electron/ipc/openRouterStreamBridge.ts:230`~`253`；renderer `src/next/live/openRouterLiveStream.ts:370`~`405`。  
覆盖：`decoder.test.ts` 有 unicode chunking，但非 IPC 路径；IPC 编码等价性缺口。

13. 风险：会话层 catch 分支会合成 terminal（TimingSnapshot+StreamError/Abort）；若生成器在 terminal 后再 throw，可能重复终态写入。  
位置：`src/ui-app/AppChatApp.vue:2675`~`2727`。  
覆盖：仅 AbortError throw 覆盖（`src/ui-app/AppChatApp.streamSession.parity.test.ts:466`），无“post-terminal throw”覆盖，缺口。

---

## D. “统一 core 的最小接口”草案（接口级）

```ts
// input
type WireEvent = import('@/shared/ipc/openRouterStreamWire').OpenRouterStreamWireEvent
type CoreInput = string | WireEvent
// string = raw SSE text chunk; WireEvent = IPC wire event

type ParsedStreamEvent =
  | { type: 'comment'; text: string }
  | { type: 'meta'; id?: string; model?: string; provider?: string; finish_reason?: string; native_finish_reason?: string }
  | { type: 'delta.text'; messageId: string; choiceIndex: number; text: string }
  | { type: 'delta.reasoning'; messageId: string; choiceIndex: number; detail: unknown; chunkNo?: number }
  | { type: 'usage'; usage: unknown }
  | { type: 'timing'; tRequestStart?: number; tAck?: number; tEnd?: number; endReason?: import('@/next/state/types').StreamEndReason }
  | { type: 'terminal.done' }
  | { type: 'terminal.abort'; envelope: import('@/next/errors/openRouterErrorEnvelope').ErrorEnvelope }
  | { type: 'terminal.error'; envelope: import('@/next/errors/openRouterErrorEnvelope').ErrorEnvelope }

type DebugSink = (evt: {
  stage: 'wire'|'sse'|'map'|'terminal'
  message: string
  payload?: unknown // core 内部先脱敏再回调
}) => void

interface StreamSemanticCore {
  feed(input: CoreInput): ParsedStreamEvent[]         // push mode
  endTransport(): ParsedStreamEvent[]                 // adapter tells transport closed
  abort(reason?: string): ParsedStreamEvent[]         // adapter/user abort
}

async function* parseStream(
  input: AsyncIterable<CoreInput>,
  opts: { requestContext: { model?: string; stream?: boolean }; assistantMessageId: string; debugSink?: DebugSink }
): AsyncIterable<ParsedStreamEvent>
```

core 应统一的逻辑：
- SSE framing（comment/data、多行拼接、`[DONE]`、JSON parse/protocol_error）。
- chunk JSON -> meta/delta/usage/terminal 映射（含 `finish_reason` 归一化、responses-terminal）。
- terminal 仲裁与优先级（abort/error/done，防双终态）。
- timing 语义（`tAck` 触发、`tEnd/endReason` 归一）。
- ErrorEnvelope 归一化（protocol/transport/http/mid-stream）与 `completionClass` 语义。

adapter 应保留的逻辑：
- I/O：`fetch`、`electron.net`、IPC channel 监听/发送。
- AbortController 生命周期与超时。
- 环境开关（`streamInMainProcess`、netExp）。
- 日志开关与日志落地（含 API key/PII 策略）。
- UI/DB 侧副作用：eventScheduler、`message.appendDelta`、`message.setStatus`、`messageError.upsert`。

---

## E. 结论与建议（仅结论）

- 当前语义最分裂点 1：`src/next/live/openRouterLiveStream.ts` 内 IPC/fetch 两套近重复主循环，语义变化需要双改。  
- 当前语义最分裂点 2：terminal 语义分散在 decoder、mapper、live loop、AppChatApp 会话层 catch、reducer 多层。  
- 当前语义最分裂点 3：wire transport 顺序语义（`end`/channel）在 bridge 和 renderer queue 之间存在隐式约定，未被合同化测试完全锁住。  
- IPC 与 renderer 直连在“主语义”上大体等价（同 decoder + mapper + error normalizer），但在 header meta 时机、transport 结束信号、编码路径上存在非等价细节。  
- 抽 core 的最佳落点建议为 `src/next/streaming/core`（优先于 `src/shared/streaming/core`）：当前 core 直接依赖 `next/errors`、`next/state` 的 DomainEvent/ErrorEnvelope 语义，放 shared 会引入跨层依赖倒置。  
- 最低成本接入顺序建议：先接入 fetch 路径，再接入 IPC 路径；fetch 侧 I/O 边界更单纯、现有单测更集中，能先稳定 core 的语义输出。  
- `src/shared/ipc/openRouterStreamWire.ts` 建议继续保留为 adapter 合同层；语义 core 不应感知 IPC channel 名称或 Electron 细节。  

必须新增的回归测试矩阵（6 类）：
1. 同一 SSE fixture 在 fetch/IPC 双路径输出 DomainEvent 全序列一致（含 timing/terminal）。  
2. 缺失 `[DONE]`、EOF 结束、尾部半包、CRLF 混用。  
3. `event:` + 多 `data:` 行拼接 + 注释穿插 + 随机 chunk 边界。  
4. wire 顺序异常：`end` 重复、`openrouter:end` 先到、`chunk` 晚到、无 `responseMeta`。  
5. finish_reason 全集与未知值（`length`/`content_filter`/`tool_calls`/unknown）及 `native_finish_reason` 透传。  
6. generator 异常路径：pre-terminal throw、post-terminal throw、abort 与 error 竞争（abort 优先）。
