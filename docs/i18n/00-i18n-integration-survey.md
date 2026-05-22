# 任务包 0：i18n 接入点勘察报告

> 范围：`src/`、`electron/`、`infra/db/`、`package.json`、`vite.config.ts`、`tsconfig.json`
> 约束：只读勘察，未修改任何生产代码、未新增依赖、未替换 UI 文案、未重构设置系统。

---

## 1. 设置系统持久化方式

Starverse 采用 **双层持久化**：

| 层级 | 技术 | 存储位置 | 用途 |
|---|---|---|---|
| **electron-store** | JSON 文件 | `app.getPath('userData')/config.json` | API Key、主题、窗口状态、模型配置、项目元数据 |
| **SQLite `settings_kv`** | better-sqlite3 | DB Worker 管理的数据库文件 | 推理偏好、搜索默认值、采样参数、图片生成默认值、聊天草稿 |
| **localStorage** | 浏览器原生 | 内存 | 仅调试开关（`sv_debug_*`），不面向用户 |

**关键发现：** `configSchema.ts:82` 已定义 `language` 键（默认 `'zh-CN'`），但 **没有任何渲染进程代码读取它**。i18n 系统需要自行决定如何接入此配置。

---

## 2. Electron Store / SQLite Settings 分工

| 类别 | 存储层 | 访问方式 |
|---|---|---|
| API Key | electron-store | `window.electronStore.get('openRouterApiKey')` |
| 主题 | electron-store | `window.electronStore.get('theme')` |
| 语言 | electron-store | 存在但 **从未被读取** |
| 字体大小 | electron-store | `window.electronStore.get('fontSize')` |
| 窗口尺寸 | electron-store | 直接读写 |
| 侧边栏状态 | electron-store | 直接读写 |
| 活跃 Provider | electron-store | 直接读写 |
| 收藏模型 | electron-store | 直接读写 |
| 模型配置 | electron-store | 直接读写 |
| 项目元数据 | electron-store | 直接读写 |
| 网络实验 | electron-store | IPC 调用 |
| 推理偏好 | **SQLite** `settings_kv` | `dbBridge.invoke('settings.getReasoningPrefs')` |
| 搜索默认值 | **SQLite** `settings_kv` | `dbBridge.invoke('settings.getWebSearchDefaults')` |
| 采样参数 | **SQLite** `settings_kv` | `dbBridge.invoke('settings.getSamplingParamsDefaults')` |
| 图片生成默认 | **SQLite** `settings_kv` | `dbBridge.invoke('settings.getImageGenerationDefault')` |
| 消息渲染默认 | **SQLite** `settings_kv` | `dbBridge.invoke('settings.getUserMessageRenderDefault')` |
| 推理展示模式 | **SQLite** `settings_kv` | `dbBridge.invoke('settings.getChatReasoningDisplayMode')` |
| 推理面板展开 | **SQLite** `settings_kv` | `dbBridge.invoke('settings.getChatReasoningPanelDefaultExpanded')` |
| Provider 参数要求 | **SQLite** `settings_kv` | `dbBridge.invoke('settings.getOpenRouterProviderRequireParameters')` |
| 聊天草稿 | **SQLite** `settings_kv` | `dbBridge.invoke('settings.getChatDraft')` |
| 调试开关 | **localStorage** | `window.localStorage.getItem(...)` |

**边界：** electron-store = 身份/配置/API/窗口状态；SQLite = 行为偏好与功能默认值；localStorage = 开发调试。

---

## 3. SettingsModal / SettingsPanel 结构

### 组件层级

```
ChatTopSummaryBar.vue:39 — "Settings" 按钮
  └─ SettingsModal.vue (59 行)
       └─ SettingsPanel.vue (707 行)
```

### SettingsModal (`src/ui-app/components/SettingsModal.vue`)
- 通用模态框壳：标题栏、关闭按钮、可滚动插槽
- 标题：`'Settings'`（硬编码英文）
- 关闭按钮：`'Close'`（硬编码英文）

### SettingsPanel (`src/ui-app/components/SettingsPanel.vue`)
单页面布局，包含以下分区：

1. **OpenRouter** — API Key、Base URL、provider.require_parameters、调试开关
2. **Network Experiments** — HTTP/2、QUIC、流式主进程、HTTP/1.1、TCP keepalive、运行报告
3. **Global Custom Parameters** — `SamplingParamsSettingsEditor` 子组件
4. **Global Reasoning Defaults** — 推理力度/排除、内联推理默认、用户消息富渲染、最近模型限制
5. **Global Web Search Defaults** — `WebSearchSettingsEditor` 子组件
6. **Plugin Management** — `PluginManagementPanel` 子组件（784 行）

### 相关子组件

| 组件 | 行数 | 嵌入位置 |
|---|---|---|
| `WebSearchSettingsEditor.vue` | 420 | SettingsPanel + ChatSessionConsole |
| `SamplingParamsSettingsEditor.vue` | 264 | SettingsPanel + ChatSessionConsole |
| `ImageGenerationSettingsEditor.vue` | — | ChatSessionConsole |
| `PluginManagementPanel.vue` | 784 | SettingsPanel |
| `EnginePluginSettingsPanel.vue` | 325 | 独立插件视图 |
| `ChatSessionConsole.vue` | 234 | 右侧栏 |

**所有 SettingsPanel / SettingsModal 字符串均为英文。**

---

## 4. 主进程菜单固定文案

**结论：不存在自定义应用菜单。**

未发现 `Menu.buildFromTemplate` 或 `Menu.setApplicationMenu` 调用。应用使用 Electron 默认菜单。唯一的菜单相关引用是 `electron/services/inappBrowser.ts:182` 的 `autoHideMenuBar: true`（用于内置浏览器窗口）。

**i18n 不需要处理自定义菜单。**

---

## 5. Native Dialog / Shell / IPC 错误文案

### `dialog.showErrorBox`（用户可见原生对话框）

| 文件 | 行号 | 标题 | 消息 |
|---|---|---|---|
| `electron/main.ts` | 705 | `'Database initialization failed'` | 动态修复指令（英文） |
| `electron/main.ts` | 721 | `'Database initialization failed'` | `'DB worker failed to start.'` + 错误 |
| `electron/windows/mainWindow.ts` | 28 | `'Dev startup error'` | `'VITE_DEV_SERVER_URL is missing...'` |

### `dialog.showOpenDialog`（文件选择对话框）

| 文件 | 行号 | 标题 / 过滤器名称 |
|---|---|---|
| `electron/ipc/imageIpc.ts` | 149 | `title: '选择图片'`（中文！） 过滤器：`'Images'` |
| `electron/ipc/dialogIpc.ts` | 34 | 无标题，过滤器：`'PDF'` |
| `electron/ipc/dialogIpc.ts` | 76 | 无标题，过滤器：`'Images'` / `'All Files'` |

### `dialog.showSaveDialog`（保存对话框）

| 文件 | 行号 | 标题 / 过滤器名称 |
|---|---|---|
| `electron/ipc/imageIpc.ts` | 224 | `title: 'Export image'`，过滤器：`'Image'` / `'All Files'` |

### IPC 错误消息（返回渲染进程，用户可见）

| 文件 | 行号 | 消息 |
|---|---|---|
| `electron/ipc/imageIpc.ts` | 245 | `'无效的 data URI 格式'`（中文！） |
| `electron/ipc/imageIpc.ts` | 250 | `'无效的 data URI 内容'`（中文！） |
| `electron/ipc/shellIpc.ts` | 17 | `'Invalid URL'` |
| `electron/ipc/shellIpc.ts` | 21 | `'Unsupported protocol'` |
| `electron/ipc/imageIpc.ts` | 88 | `'Missing image URL'` |
| `electron/ipc/imageIpc.ts` | 92 | `'Invalid image data URL'` |
| `electron/ipc/imageIpc.ts` | 101 | `'Asset not found'` |
| `electron/ipc/imageIpc.ts` | 120 | `'Download failed: {status}'` |

---

## 6. 中文硬编码集中区域

**`src/` 目录约 458 处匹配（TypeScript）+ 107 处匹配（Vue 模板）**

### 集中度最高的 UI 文件

| 文件 | 中文字符串数 | 主要内容 |
|---|---|---|
| `src/ui-app/app/appChatApp.logic.ts` | ~80+ | 附件反馈、发送门控、发送模式标签、模型目录通知、确认提示 |
| `src/ui-app/AppChatApp.vue` | ~25 | 按钮标签、区块标题、描述文本 |
| `src/ui-app/components/ProjectSidebar.vue` | ~20 | 项目 CRUD 标签、按钮、占位符、错误消息、确认提示 |
| `src/ui-app/components/ConversationList.vue` | ~20 | 与 ProjectSidebar 镜像 |
| `src/ui-app/components/DraftAttachmentCard.vue` | 9 | 附件检测状态标签 |
| `src/ui-app/components/DraftAttachmentDetailsDialog.vue` | 7 | 格式化函数 |
| `src/ui-app/components/ChatAppComposer.vue` | 3 | 附件菜单、查看按钮、发送计划 |
| `src/ui-kit/chat/ChatMessageBubble.vue` | 1 | `'正在生成'` |
| `src/ui-kit/chat/ChatTranscript.vue` | 1 | `'正在生成'` |
| `src/ui-kit/chat/ChatReasoningPanel.vue` | 3 | 加密/排除推理相关 |
| `src/ui-app/components/EnginePluginSettingsPanel.vue` | 1 | 官方插件信任根提示 |

### electron/ 中文字符串（579 处匹配）

- `electron/main.ts` — 仅注释，除 `DEFAULT_CONFIG` 中 `language: 'zh-CN'`
- `electron/ipc/imageIpc.ts` — 3 处用户可见中文错误消息
- `electron/config/configSchema.ts` — 仅注释

### infra/ 中文字符串（352 处匹配）

- 全部为注释和 `console.log` — **不面向用户**

---

## 7. 英文硬编码集中区域

### SettingsPanel.vue（全英文，707 行）

- 标签：`'Settings'`, `'Reload'`, `'Close'`, `'Save'`, `'Clear'`, `'Show'`/`'Hide'`
- 分区标题：`'OpenRouter'`, `'Network Experiments'`, `'Global Custom Parameters'`, `'Global Reasoning Defaults'`, `'Global Web Search Defaults'`
- 状态消息：`'Saved.'`, `'Run report copied.'`, `'API key cleared.'`, `'Base URL cleared.'`
- 错误消息：`'Missing electronStore (run in Electron).'`, `'Base URL is invalid.'`, `'maxRecentModels must be a positive integer.'`

### ChatTopSummaryBar.vue

- `'Settings'`, `'Hide Console'`/`'Console'`, `'Untitled conversation'`

### ModelPickerDialog.vue（~1545 行）

- `'Model Picker'`, `'Search'`, `'Sort'`, `'All categories'`, `'No limits'`, `'No defaults'`, `'Loading models...'`

### SearchModal.vue（326 行）

- `'Search'`, `'Query'`, `'All'`, `'Searching...'`, `'No results.'`

### ChatSessionConsole.vue

- `'Display'`, `'Model'`, `'Reasoning'`, `'Inline reasoning'`, `'Right rail reasoning'`, `'enabled'`

### ConversationList.vue

- `'Delete conversation?'`, `'Rename conversation'`, `'No project'`

### EnginePluginSettingsPanel.vue

- `'Official Engines'`, `'Loading...'`/`'Refresh'`, `'No official plugins available.'`, `'Registered:'`, `'Enabled:'`, `'Disabled:'`, `'Uninstalled:'`, `'Health check:'`

### PluginManagementPanel.vue（784 行）

- `'No diagnostics summary loaded.'`, `'No diagnostics.'`, `'Update:'`

### WebSearchSettingsEditor.vue

- `'Search mode'`, `'Effective:'`

---

## 8. 推荐先替换的核心 UI 文案列表

### 优先级 1：共享高频词（跨组件复用）

```
Settings, Close, Save, Cancel, Delete, Confirm, Reload, Show, Hide, Clear
On / Off, Loading..., Error, Copied
All, None, Search, Create, Rename, Remove
Untitled conversation
```

**涉及文件：** SettingsModal.vue, SettingsPanel.vue, ChatTopSummaryBar.vue, ProjectSidebar.vue, ConversationList.vue, SearchModal.vue

### 优先级 2：项目/对话管理（中文 → 双语）

**ProjectSidebar.vue + ConversationList.vue（共享键）：**

```
全部对话, 暂无项目, 创建项目, 重命名项目, 删除项目
项目名称, 取消, 创建, 保存, 删除
系统项目不可重命名, 系统项目（Inbox）不可删除
确定要删除项目「...」吗？
```

**AppChatApp.vue 附件确认流程：**

```
打开面板, 关闭定位条, 上一个, 下一个, 取消发送, 收起面板, 确认并继续
不受支持的历史消息附件, 当前不受支持的用户消息附件
```

### 优先级 3：SettingsPanel（已是英文，仅需包裹）

```
OpenRouter, Network Experiments, Global Custom Parameters
Global Reasoning Defaults, Global Web Search Defaults
API Key, Base URL (optional), On / Off, Expanded / Collapsed
Saved., Run report copied., API key cleared., Base URL cleared.
```

### 优先级 4：聊天状态消息（中文）

```
正在生成 — ChatMessageBubble.vue, ChatTranscript.vue
```

附件发送模式标签（`appChatApp.logic.ts`）：

```
跟随默认设定, 自动, 链接, 文件副本, 仅保留链接, 保留链接并尝试保存本地副本
```

### 优先级 5：错误/状态消息

**IPC 层（electron/ipc/）：**

```
无效的 data URI 格式, 无效的 data URI 内容, 选择图片
Invalid URL, Unsupported protocol, Missing image URL, Invalid image data URL
Asset not found, Download failed: {status}
```

**原生对话框（electron/main.ts）：**

```
Database initialization failed, DB worker failed to start.
```

---

## 9. 不建议第一轮触碰的大型文件列表

| 文件 | 行数 | 中文字符串 | 建议 |
|---|---|---|---|
| `src/ui-app/app/appChatApp.logic.ts` | ~8200+ | ~80+ | **延后** — 巨型编排文件。先提取常量，再分批包裹 i18n |
| `src/ui-app/AppChatApp.vue` | ~700+ | ~25 | **延后** — 主应用壳，合并冲突风险高。组件级 i18n 完成后再处理 |
| `src/ui-app/components/PluginManagementPanel.vue` | 784 | 多为英文 | **延后** — 复杂插件生命周期 UI，优先级低 |
| `src/ui-app/components/ModelPickerDialog.vue` | 1545 | 多为英文 | **延后** — 巨型筛选/排序 UI，第二轮处理 |
| `src/ui-app/components/ConversationList.vue` | 722 | ~20 | **优先但复杂** — 722 行含项目 CRUD 对话框 |
| `infra/db/worker/runtime.ts` | ~1000+ | 仅注释/日志 | **跳过** — 不面向用户 |
| `electron/config/configSchema.ts` | 468 | 仅注释 | **跳过** — 不面向用户 |

---

## 风险与待决事项

1. **`language` 配置键已存在但未使用：** configSchema 定义了 `'language'`（默认 `'zh-CN'`），但无渲染进程代码读取。需设计决策 — i18n 系统应从 electron-store 读取还是自行管理持久化？

2. **当前 UI 中英混合：** SettingsPanel/SearchModal/ModelPickerDialog 全英文，ProjectSidebar/附件流程全中文。i18n 必须支持双向迁移，而非仅中→英。

3. **ProjectSidebar 与 ConversationList 字符串重复：** 两文件包含完全相同的项目 CRUD 中文字符串。应共享同一 locale 命名空间。

4. **主进程无 locale 监听：** 用户切换语言后，主进程菜单/对话框不会更新直至重启。`language` 设置需在相关调用点重新读取。

5. **测试文件含中文：** `src/ui-kit/chat/ChatMessageBubble.test.ts:38` 有 `expect(screen.getByText('正在生成'))`。i18n 迁移需同步更新测试断言。

6. **逻辑层字符串拼接：** `appChatApp.logic.ts` 通过模板字面量拼接中文消息。需重构为 i18n 消息函数（带参数）。

---

## 勘察方法说明

本报告由 AI 子代理执行以下勘察步骤：

1. 使用 `glob` 搜索所有 `.ts`、`.vue` 文件，确认目录结构
2. 使用 `grep` 搜索中文字符 `[\u4e00-\u9fff]` 在 `src/` 和 `electron/` 中的分布
3. 使用 `grep` 搜索 `electron-store`、`Store`、`settings` 相关持久化代码
4. 使用 `grep` 搜索 `Menu.buildFromTemplate`、`dialog.showErrorBox`、`dialog.showOpenDialog`、`dialog.showSaveDialog`、`shell.openExternal` 等原生 API 调用
5. 使用 `read` 关键文件（configSchema.ts、SettingsPanel.vue、SettingsModal.vue、main.ts、preload.ts 等）
6. 使用 `read` 检查 `src/next/settings/` 目录下所有客户端文件
7. 使用 `read` 检查 `infra/db/schema.sql` 中 `settings_kv` 表定义
8. 汇总分析并生成本报告

**验证方式：** `git status --short` 确认无生产代码被修改。
