---
description: Ask flash-code-reader to inspect Starverse code or docs in a read-only subtask.
agent: flash-code-reader
subtask: true
---

Use flash-code-reader to perform a read-only Starverse code or documentation investigation.

User request:
$ARGUMENTS

Required behavior:
- Do not modify files.
- Search before reading broadly.
- Prefer exact paths, symbols, and tests.
- Return high-signal findings for the primary agent.
- Separate confirmed facts from hypotheses.
