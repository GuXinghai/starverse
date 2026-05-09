---
description: Check Starverse docs for phase claim, owner decision, acceptance matrix, and non-goal consistency.
agent: flash-doc-check
subtask: true
---

Use flash-doc-check to verify Starverse documentation consistency on the current diff or specified scope.

User request:
$ARGUMENTS

Focus areas:
- Phase status and closeout claims accuracy
- MVP main-loop vs full project completion wording distinction
- Owner freeze decisions and visibility
- P0/P1/P2 acceptance language consistency
- Official curated catalog enforcement language
- External runtime managed-plugin direction
- File type detection terminology and logging/hash constraints

Required behavior:
- Do not edit files unless explicitly requested.
- Do not touch production code.
- Search current diff or specified scope.
- Return PASS, WARN, or BLOCKED with repo-relative evidence.
