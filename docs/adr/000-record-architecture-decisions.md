# 000 - Record architecture decisions

- Date: 2025-12-13
- Status: Accepted

## Context

Starverse 正在推进围绕 OpenRouter 流式回复与推理（reasoning / reasoning_details）的重构。该类改动涉及多层边界（Transport/Parser/Reducer/UI）、数据所有权与回传策略，容易出现“实现悄悄偏离 SSOT / 事实被悄悄扭曲”的风险。

需要一个轻量、可审计、可链接的决策记录机制，让后续贡献者能够：

- 理解“为什么这么做”（而不仅是“现在是什么样”）
- 追溯关键边界与权衡的来源
- 在必须改变约束时先显式决策，再修改实现与 SSOT

## Decision

采用 ADR（Architecture Decision Records）体系：

- 目录：`docs/adr/`
- 命名：`NNN-title.md`（三位递增编号 + kebab-case 标题）
- 状态：`Proposed / Accepted / Deprecated / Superseded`
- 模板：`docs/adr/template.md`（Context / Decision / Consequences）
- 触发条件：见 `docs/adr/README.md`（尤其：变更 SSOT 硬约束/禁止事项必须先写 ADR）

## Consequences

- 架构与协议的关键变更必须以 ADR 先行，降低“隐性改约束”的风险。
- 评审时可以把争议集中到 ADR（Decision/Consequences），减少在代码里反复拉扯。
- 增加少量文档维护成本，但换取更稳定的边界与可追溯性。

