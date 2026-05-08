---
description: Ask flash-code-reader to inspect Starverse code or docs in a read-only subtask.
agent: flash-code-reader
subtask: true
---

Use flash-code-reader to perform a read-only Starverse code or documentation investigation.

User request:
$ARGUMENTS

Note: The above `$ARGUMENTS` is the Full Task Brief provided by the primary agent and is CONTEXT ONLY. `flash-code-reader` is a read-only subagent, not the primary implementation or planning agent. The reader must extract only the read-only investigation scope and must not perform write actions.

Guidance for the subagent:
- Allowed guidance sections (may be used to focus the read-only investigation): 当前状态, 允许勘察范围, 优先读取, 禁止读取, 非目标, 验收命令.
- The following sections in the Full Task Brief are NOT executable by `flash-code-reader` and must be treated as context-only: 本轮产物, 本轮允许修改, 新增文档, 修改文件, README update, implementation, patch, stage, commit, 完成汇报格式, commit hash.
- Any write-required parts must be returned as HANDOFF_REQUIRED; do not create, edit, stage, or commit files locally.

Required behavior:
- Do not modify files.
- Search before reading broadly.
- Prefer exact paths, symbols, and tests.
- Return high-signal findings for the primary agent.
- Separate confirmed facts from hypotheses.
