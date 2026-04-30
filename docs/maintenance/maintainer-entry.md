# Starverse 维护者入口

**最后更新**: 2026-04-30  
**用途**: 新维护者接手项目时的优先阅读顺序与注意事项

> 💡 **编程 Agent 注意**: 如果你是自动化编程 Agent，请先读 [../AGENT_INDEX.md](../AGENT_INDEX.md) 和 [../DOC_STATUS_INDEX.md](../DOC_STATUS_INDEX.md)，会更快地定位任务。

---

## 当前项目状态

- **版本**: 0.0.2（开发中）
- **主线工作**: File Pipeline Phase 1-9 已完成代码实现；格式转换与预览方案已通过治理，代码尚未开始
- **活跃代码目录**: `src/ui-app/`, `src/next/`, `src/shared/files/`, `infra/files/`, `infra/db/`
- **治理体系**: ADR (`docs/adr/`)、边界护栏 (`docs/governance/`)、门禁脚本 (`scripts/gates/`)
- **开发启动**: `npm run electron:dev`（完整 Electron 应用）
- **测试运行**: 按需运行与修改路径最相关的单元测试
- **关键维护边界**: `appChatApp.logic.ts`（~6.7k 行, 不追加业务规则）、`openRouterSendPlanSerializer.ts`（唯一 payload 合成入口）

---

## 第一阅读顺序

1. **[README.md](../../README.md)** — 项目定位与功能总览
2. **[docs/guides/INDEX.md](../guides/INDEX.md)** — 文档导航中心，按场景查找文档
3. **[docs/architecture/OVERVIEW.md](../architecture/OVERVIEW.md)** — 系统架构设计
4. **[docs/file-pipeline/README.md](../file-pipeline/README.md)** — 文件管道主线工作状态
5. **[docs/file-pipeline/progress-ledger.md](../file-pipeline/progress-ledger.md)** — 冻结决策与未做事项
6. **[docs/governance/app-chat-app-logic-boundary.md](../governance/app-chat-app-logic-boundary.md)** — 核心编排模块职责边界
7. **[docs/adr/README.md](../adr/README.md)** — ADR 决策记录规则
8. **[docs/decisions/README.md](../decisions/README.md)** — 架构决策列表

---

## 主要代码目录

| 目录 | 职责 |
|------|------|
| `src/ui-app/` | 页面级组件（AppChatApp, ConversationList 等）+ 应用编排（appChatApp.logic.ts） |
| `src/ui-kit/chat/` | 可复用聊天基础组件（Composer, Transcript, MessageBubble, richtext 渲染） |
| `src/next/` | DDD 领域模块：convo, branch, message, openrouter, streaming, persistence 等 |
| `src/shared/` | 跨层共享：IPC 封装、文件资产类型（sendPlanTypes, fileTypes）、安全工具 |
| `infra/db/` | SQLite Worker + Repository 层（convoRepo, messageRepo 等） |
| `infra/files/` | Send Plan 服务、衍生任务服务 |
| `electron/` | 主进程：窗口管理、IPC 多模块、模型目录、后台任务 |
| `scripts/gates/` | 治理门禁脚本（b_gate.mjs, tc 系列） |

---

## 高风险维护边界

进入代码编辑前必须了解的约束：

- **不要绕过 send plan 合成 OpenRouter payload**。`openRouterSendPlanSerializer.ts` 是唯一授权入口，直接在 UI 层拼接 payload 会跳过兼容性门禁。
- **preview_optimized 只用于预览**，绝对不能作为发送源或 OpenRouter serializer 输入。
- **草稿附件与历史附件兼容性需要分别处理**。当前 draft 是发送的第一输入，历史附件是次要上下文候选，两者门禁路径不同。
- **UI 层不要直接拼接真实发送请求**。`send preflight`（`sendPlan.buildCurrent`）是发送前的强制门禁。
- **不要在日志中输出本地绝对路径、原始 base64 负载或 API Key**。诊断输出必须经过脱敏。
- **`appChatApp.logic.ts` 的职责边界以 `docs/governance/app-chat-app-logic-boundary.md` 为准**。新的业务规则不应追加到该文件。
- **ADR 与 decisions 两套入口并存**。当前只做交叉引用，不迁移。新增 ADR 请使用 `docs/adr/` 下的编号规则。

---

## 治理门禁概览

| 门禁 | 触发条件 | 位置 |
|------|----------|------|
| B_GATE | 黑名单符号检测（旧类型、旧端点） | `scripts/b_gate.mjs` |
| TC17 | UI 护栏 — 组件隔离与职责检查 | `scripts/gates/tc17-ui-guardrails.mjs` |
| TC18 | UI 隔离检查 | `scripts/gates/tc18-ui-isolation.mjs` |
| TC19 | Reasoning Stress 回归（100 场景） | `scripts/gates/tc19-reasoning-stress.mjs` |
| TC14 | Live Smoke（需要 OpenRouter key） | `scripts/gates/tc14-ui-live-smoke.mjs` |
| ADR | 架构决策触发条件（6 条硬约束） | `docs/adr/README.md` |
| Boundary | appChatApp.logic.ts 职责边界 | `docs/governance/app-chat-app-logic-boundary.md` |

---

## 常用验证命令

| 命令 | 用途 |
|------|------|
| 按需运行最近的相关测试 | 运行与修改路径最相关的单元测试 |
| `npm run verify:ssot` | 基线验证（测试 + SSOT gates） |
| `npm run verify:live` | Live smoke 测试（需 OpenRouter key） |
| `node scripts/b_gate.mjs` | 跨平台黑名单门禁 |
| `npm run lint` | ESLint 检查 |
| `npm run rebuild:node` | 重建 better-sqlite3（测试/脚本用） |
| `npm run rebuild:electron` | 重建 better-sqlite3（Electron 用） |
| `npm run db:reset` | 重置数据库 |

---

## 不要做的事

- 不要修改 `docs/archive/` 下任何历史文档
- 不要将 `docs/file-pipeline/` 的 phase 细节搬进 README
- 不要创建新的治理概念或阶段命名
- 不要对整个仓库做断链修复（只修入口文档）
- 不要修改代码（本仓库的第一约束是文档与代码同步，但修改代码超出维护文档范畴）
