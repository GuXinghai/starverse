# 基础操作自主探索记录：2026-10-17

Status: partial
Document Role: exploration-record, issue-register
Last updated: 2026-10-17

## 范围与环境

接续 [原阶段计划](basic-operation-exploration-phase-plan.md) 的 A 段；本记录不是全部供应商、B 段或发布验收。原计划的 planned 状态是制定时的记录，不能用于否定后续已经发生的探索，也不能把 Rule V2 专项 PASS 换算成基础操作全部通过。

- 工作区 `D:\Starverse`，分支 `codex/basic-operation-exploration`，HEAD `734d553d6c3809279ddcfb2639d0cc36b8b37b6f`。
- 复用 `C:\Users\m1389\.starverse-agent\profiles\basic-exploration`，现有 Electron 42.10.0、正常联网、隐藏离屏窗口，通过仓库 Electron agent 操作真实 UI。
- 不安装软件，不修改应用代码，不手改数据库，不暂存、提交或推送；原有大量未提交工作保留。
- 本批没有主动模型生成。后台联网和一次应用自带的无凭据网络探测单独记录。

本批原始证据根目录（下称 E）：

`C:\Users\m1389\.codex\visualizations\2026\10\17\01a14858-e29c-74f1-8118-84658a934e49`

每份 UI JSON 保存时间、准确 command 和完整 result；终端摘要的截断不影响 JSON 原件。截图保存在对应 profile 的 `sessions` 目录，路径记录于 screenshot 返回值。

## 已执行与边界

| 项目 | 状态 | 实际观察及主要证据（相对 E） |
| --- | --- | --- |
| 导航及空状态 | 已验证 | 设置/搜索开关、项目区域隐藏/恢复、空项目列表；`initial-*`、`startup-save-navigation-*`。不代表原生窗口、焦点或 DPI 验收。 |
| 新建、重命名、取消 | 已验证 | 中文、英文、`& <test>` 名称能保存；空/纯空白名称禁用提交，Enter 不创建/改名；`project-empty-create-*`、`rename-blank-normal-*`。 |
| O-02 重名策略 | 已验证所列分支 | Ask 新建取消、重命名取消/确认；Off 新建与重命名均显示 Duplicate name 并拒绝，编辑中保留提示；On 新建和重命名均允许；`project-duplicate-*`、`duplicate-off-edit-rename-*`、`duplicate-on-rename-ask-*`、`ask-rename-cancel-confirm-*`。未把未执行的 Ask 新建确认分支记为通过。最终恢复 Ask。 |
| 空项目删除 | 已验证 | 取消后保留，确认后列表移除；只删除本批登记的三个空项目；`delete-empty-cancel-*`、`delete-empty-projects-*`。不代表非空项目会话迁移验收。 |
| 模板草稿 | 已验证 | 中英文、特殊字符、emoji、三行文本、全选删除、重新编辑，切到正式会话再 New 返回仍保留；`project-duplicate-cancel-*`、`draft-switch-return-*`、`draft-edit-before-restart-*`。只读 DB 对照确认两处 LF 和原文本逐字一致。 |
| 项目名搜索 | 已验证所列分支 | Fuzzy/Exact 查询、两结果/单结果/无结果、结果定位项目；清空后旧结果和分页消失、初始提示恢复、当前搜索范围与匹配方式保留；`search-project-*`、`search-exact-*`、`search-location-off-*`。未注入迟到请求或做分页压力测试。 |
| 语言及普通设置 | 已验证所列控件 | English→中文，关闭重开及第一次重启后中文保留，再恢复 English；内联推理默认开关保存、重开和重启回读后恢复原值；`setting-save-*`、`startup-save-navigation-*`、`preserve-restart-readback-*`。未把全部普通开关都算作覆盖。 |
| New chat 启动、草稿保留 | 已验证 | 关闭启动草稿重置后同 profile 重启，原三行文本、项目、语言和开关保留；`before-preserve-restart.json`、`before-last-formal-restart.json`、`preserve-restart-readback-*`。 |
| Last formal 启动、草稿清空 | 已验证 | 启用草稿重置并选择 Last formal 后重启，显示既有正式历史与原 R4 草稿，New 返回的模板为空；`last-formal-reset-readback-*`。正式会话草稿未被启动模板重置清除。 |
| Projects only 启动 | 受限 | 原控制器等待 textarea 超时；见 O-09。不能记为应用启动失败或该模式实机通过。 |

本批登记的可丢弃项目：

- `project:f29acb5c-6d12-45b4-9440-b4a203d3cca5`：A段1017 Alpha 中文 & <test>，后重命名。
- `project:73e9c66b-960e-47e4-aebc-1ae44ed05fdb`：A段1017 Beta。
- `project:0834a977-b690-486b-8d4b-f8ef1c6bb351`：On 策略下新建的同名 Beta。

三者均经正常 UI 删除。原四个项目的 ID、名称及时间字段保留，未删除任何正式会话。

## 沿用问题编号与新增观察

编号及 O-01～O-07 产品决定来自原会话 `01a13f99-bf36-7843-ab9c-fc355681a461`；未找到独立旧台账文件。只读回查未发现 O-08 及更高编号，因此本记录从 O-08 接续。

- O-01：本批对新建/重命名空白输入及 Enter 做了真实 UI 回归，所列路径通过。
- O-02：按最终决定测试允许/关闭/询问；早先“重名就打开已有项目”的提案已撤回，不用作预期。
- O-03：清空搜索的可见状态回归通过；迟到请求失效仍仅有先前自动化证据，本批未故障注入。
- O-04～O-07：属于先前聊天发送、再生、停止历史与错误归属修复，本批不重复宣称验收。

### O-08：空标题正式会话显示 No active conversation

- 状态：可复现问题；影响：状态文字误导，暂定 P2，未发现聊天数据丢失。
- 前置：既有正式会话 `conversation:new-template:b515415b-704d-4276-80fa-52ef55458eee`，数据库 title 为空字符串。
- 最短步骤：All conversations → 打开当时列表项 `2026/10/17 14:05:25`；或设置 Last formal 后重启恢复该会话。
- 预期：页首能准确表示已打开的正式会话，空标题不应被解释为没有活动会话。
- 实际：页首显示 `No active conversation`，同时存在完整历史、`branch:o`、gpt-6-luna 和原 `R4-LOCAL-BLOCK` 草稿。
- 复现：手动打开及重启恢复两条路径均观察到。打开/返回操作可继续，无新生成请求；本次 request/operation/answer ID：不适用。
- 原始证据：`draft-switch-return-3.json`、`last-formal-reset-readback-0.json`、`title-observation.json`；后者只读确认 title 为空。`last-formal-reset-readback-1.json` 指向现场截图。
- 代码证据：`src/ui-app/AppChatApp.vue` 使用 `activeTitle || 'No active conversation'`；`appChatApp.logic.ts` 的 activeTitle 对空标题返回空字符串。真正 workspace none 时摘要栏不显示。这里是显示回退条件，不是证明 active conversation 丢失。
- 未查明/未覆盖：其他标题缺失来源、所有会话类型及语言组合未扩展检查。未修复、未新增 UI 提示。

### O-09：Projects only 与控制器输入框就绪门槛不兼容

- 状态：基础设施阻断；暂定 P2；应用功能本身受限/未验证。
- 前置：Privacy & Data → Open on startup=Projects only，正常点面板 Save；使用同一 profile。
- 最短步骤：stop 后执行 `node scripts/agent/electron-agent.mjs start --profile basic-exploration --skip-build`。
- 实际：`locator.waitFor: Timeout 60000ms exceeded`，等待 `locator('textarea').first()`；控制器创建之前失败，随后正常清理并关闭验证应用。
- 发生次数：1/1；保留首次失败，不循环重试、不重置 profile、不直接写 DB 还原配置。
- 证据：profile `sessions/2026-10-17T05-46-46-369Z-3fcd196a/startup-error.log`；E 下 `after-projects-only-timeout.json`、`post-timeout-control-state.json`。
- 静态证据：`scripts/agent/electron-agent.mjs:164` 必须等输入框，控制 server 在其后才创建；合法 workspace none 模式已有 `[data-testid="workspace-startup-empty"]`。失败运行没有可用控制端，所以没有该次 DOM/截图，不将静态预期当作已观察到的 UI。
- 影响：保存该模式后现有控制器无法进入可操作状态，原启动设置暂无法通过此接口恢复。进程已停止，endpoint 与 launcher.lock 均不存在。
- 当前恢复提案：仅将就绪 selector 扩为 `textarea, [data-testid="workspace-startup-empty"]`，保留已有 app/bridge 检查，再通过正常 UI 恢复原设置并复测。具体未应用补丁为 E 下 `proposed-controller-readiness.patch`。
- 授权边界：交接明确禁止修改测试基础设施代码；已另行请求这项例外，获准前不实施，不手改 DB。

### 已澄清，未新增问题：搜索默认排序即时保存

选择 Oldest first 后未点全局 Save，关闭重开及 Reload 后仍显示该值。原始观察保留于 `unsaved-close-reopen-*`、`unsaved-reload-*`、`reload-stable-*`。只读定位表明 `SearchSettingsSection.vue` 的 onSelect→commit→setSearchPreferences 是独立即时保存路径，不归底部全局 Save 所有；这与单纯“未保存表单草稿”不同。已通过 UI 恢复 Newest first，不据此报告保存失败。

## 数据、代理与当前终点

只读审计 `audit-mid.json`、`before-preserve-restart.json`、`before-last-formal-restart.json`、`after-projects-only-timeout.json` 中计数一致，并与上一实施会话 final-runtime 核心计数相同：operation/request/generation snapshot 各 167、runtime capability snapshot 140、message 299、raw request 167。两张快照表的完整行集合哈希在本批审计间相同；此证据不替代所有数据库表的审计。

原正式会话 R4 草稿仍在；测试模板三行草稿先按关闭重置策略保留，再按开启策略清空。本批 UI 没有提交生成，计数也没有新增，不把网络探测计为模型请求。

独立只读复核结果见 E 下 `verification-report.json`，状态为 PARTIAL。`preservation-comparison.json` 进一步逐字段确认原四个项目完全相同，草稿正文/模式/编辑来源发生变化的仅为本批测试模板；文档复核未发现实测范围夸大，原阶段计划的历史 planned 状态仍应结合本记录阅读。

代理设置一直为 Manual `http://127.0.0.1:10808`，未改系统代理。一次应用自带 Test draft 对 `https://api.openai.com/` 返回 HTTP 421、861 ms；`proxy-connections-during-test.json` 有当前 Electron PID 14436 到该代理的三次 ESTABLISHED 捕获。这只证明本轮测试连接到本机代理，不证明具体公网 IP 或供应商模型可用，也不推断 421 的内部原因。

超时后的保存状态：English、重名 Ask、搜索 Newest first、内联推理默认开启均已恢复；启动模式仍为 Projects only，两个启动重置开关均开启，首次发送后 Reset everything。启动模式恢复待 O-09 所述授权，不能声称所有设置已回到原值。

ABI 与 Git：

- better-sqlite3 ABI mismatch encountered: no（本批；历史批次曾遇到）。
- Rebuild command run: `npm run rebuild:electron`（使用现有缓存）。
- Current ABI target after task: electron。
- Tests retried after rebuild: none；本批没有 Node/Vitest 数据库测试。
- Electron smoke retried after rebuild: no ABI-related retry；执行了上述正常重启场景。
- No native artifacts committed: confirmed；无暂存、提交或推送。阶段内已有代码 diff 的 numstat 与接手基线一致；本记录为本批新增文档。

## 未覆盖与后续边界

O-09 阻断恢复后可继续核对 Projects only 的实际 UI，再恢复 New chat 原启动策略。本批没有修复 O-08/O-09。B 段正式会话重命名/移动/批选删除/正文搜索/非空项目删除仍需后续按既有批准范围分批记录，不能用迁移专项测试代替。Anthropic、未安装的 LM Studio/Ollama、真实图像生成和函数工具会话仍未完成实测；不安装或伪造通过。

## O-08 后续修复（2026-10-17，用户另行授权）

以上为探索批次的历史记录。随后用户决定正式会话不能有空标题，并指定自动命名格式为“会话xx年xx月xx日xx时xx分xx秒”。本次据此修改应用代码，O-09 的控制器补丁仍未应用。

- 正式会话显式创建时，空字符串或纯空白标题自动使用创建时的本地时间，例如 `会话2026年10月17日14时05分25秒`。自定义非空标题保留。
- 隐藏 New Chat 模板首次发送被接受、转为正式会话时，在同一事务内按接受时间补标题；后继隐藏模板仍可为空标题。
- 正式会话改名的仓库边界拒绝空字符串和纯空白，原名称保持不变。
- 移除摘要栏入口将空标题解释为 `No active conversation` 的回退，存量空标题沿用组件已有的本地化“未命名对话”显示。本次不批量回填旧数据库标题。
- 相关位置：`defaultConversationTitleV2.ts`、`conversationGraphV2Repo.ts`、`systemChatTemplateV2Repo.ts`、`conversationWorkspaceV2Repo.ts`、`AppChatApp.vue`；增加标题仓库测试，并在既有首次发送事务测试中断言正式标题与后继模板标题。

验证：`npm run rebuild:node` 成功；随后 `npx vitest --run --config vitest.integration.config.ts infra/db/repo/conversationTitlesV2Repo.test.ts infra/db/repo/conversationGraphV2Repo.test.ts electron/ipc/generationV2WorkspaceIpc.test.ts` 为 3 文件、31 项通过。首次沙箱运行因 Vite 临时缓存 rename EPERM 未执行测试，沙箱外同命令通过；并非 ABI 不匹配。

已有界面回归 `npx vitest --run --config vitest.ui.config.ts src/ui-app/AppChatApp.send.test.ts` 为 13 通过、2 失败；失败在 622、657 行的 OpenRouter/OpenAI Responses Auto 推理参数断言，实际均含 `mode: enabled, effort: medium`。临时撤下本次四处应用源文件修改、针对这两个用例运行修改前基线，得到相同失败；随后已在 finally 中恢复本次修改。因此记录为本次修改前已存在的失败，不在 O-08 范围修理推理参数。对照日志：E 下 `o08-baseline-send.log`；本次相对接手代码的独立补丁：`o08-changes.patch`。界面回归未全绿。

本次终点为自动化 Node 验证，当前 ABI 为 **node**；没有 ABI mismatch、没有 ABI 错误后的测试或 Electron 重试，没有提交原生生成物或任何代码。Electron 实机复测仍受 O-09 控制器就绪门槛限制，不将自动化通过记作实机验收。

## O-09 后续修复及图片检查（2026-10-17，用户另行授权）

后续图片生成检查中，用户明确批准只修改控制器这一行，将就绪条件扩为 `textarea, [data-testid="workspace-startup-empty"]`。实际 Projects only 启动现已正常 ready，并保存界面截图；随后通过 Settings 将启动模式恢复为原 New chat（`open_new`）。前述 O-09 待授权/未恢复状态为历史状态，已由此批次更新。

图片生成由三个只读子代理分别静态检查，144 项定向现有测试通过。实机 OpenAI/Gemini 各发送一次后响应解码失败，OpenRouter 因端点 URL 对完整模型 ID 编码斜杠导致 HTTP404，在生成前阻断；无成功出图验收。未修改供应商应用逻辑、未重试付费请求。两次失败没有完成 usage，实际费用未知，不能报告零费用。

详细证据、截图和操作 ID 见 E 下 `image-generation-review.md`、`image-smoke-results.json`、`openrouter-public-endpoint-control.json`；本轮独立控制器补丁为 `o09-applied.patch`。两条新失败会话保留，原四个项目未变。O-08自动时间标题已在本轮首次发送中实测生效。

最终 ABI 为 **electron**；`npm run rebuild:node` 与 `npm run rebuild:electron` 已运行，后者修正本机缓存路径后成功。无运行时 ABI mismatch；Node测试无失败重试；Electron因O-09授权修复后重启。测试实例已停止，未提交任何代码或原生产物。
