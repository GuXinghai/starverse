# ADR（Architecture Decision Records）

本目录用于记录影响架构/边界/契约的关键决策，目标是把“临场脑补”变成“可审计决策”，并让后续重构有可追溯依据。

## 文件命名与编号规则

- 命名：`NNN-title.md`
  - `NNN` 为三位递增编号（`000` 起）。
  - `title` 使用 `kebab-case`（小写英文 + `-`）。
- 编号只增不减：不得复用/重排旧编号；即使 ADR 被废弃也保留原文件。

## 状态（Status）

- `Proposed`：已提出，等待讨论/评审。
- `Accepted`：已接受并应被执行。
- `Deprecated`：不再推荐使用，但可能仍在系统中存在。
- `Superseded`：已被后续 ADR 替代（应指向替代者）。

## 何时必须写 ADR（触发条件）

满足任一条件即 **必须** 新增 ADR（至少 `Proposed`）：

1. 需要变更 SSOT 的硬约束/禁止事项（例如修改 `docs/open_router_流式回复与推理_ssot（v_2_）.md` 中的 invariants）。
2. 需要调整层级边界/数据所有权（例如 Parser ↔ Reducer ↔ UI 的职责、single-writer 原则、Facade/Hook 边界）。
3. 需要改变对外/对内契约（请求/响应结构、Domain Events、ViewModel、持久化 schema、IPC 协议）。
4. 引入或替换关键依赖/基础设施（存储、网络栈、解析器、日志/观测体系）。
5. 出现安全/隐私/合规影响（例如推理块回传策略、日志脱敏、数据留存策略）。
6. 为性能/成本做出会影响正确性或可维护性的权衡（例如去重策略、缓存策略、增量聚合规则）。

## 写作流程（建议）

1. 新建 ADR：复制 `docs/adr/template.md`，填写标题、日期、状态 `Proposed`。
2. 评审通过后将状态改为 `Accepted`。
3. 若被替代：旧 ADR 改为 `Superseded` 并链接到新 ADR；新 ADR 在 Context 中说明替代原因。

## 参考

- Michael Nygard 模板：Context / Decision / Consequences  
  https://github.com/joelparkerhenderson/architecture-decision-record
- arc42（示例/风格参考）：https://docs.arc42.org/

